// backend/schedulers/lunchBreakScheduler.js
const cron = require('node-cron');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const RefreshToken = require('../models/RefreshToken');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const Department = require('../models/Department');

/**
 * Explicit backend downtime & missed-window recovery policy:
 * - insideWindow: if backend recovers while [outMinutes .. returnDeadline + grace] is still open,
 *   the scheduler executes once cleanly using actual current IST time (never fabricating outTime).
 * - afterCutoff: if backend downtime spans past the session cutoff, OUT sweep skips the closed
 *   window (never silently logging workers out hours later or fabricating punches), while Missing
 *   Return sweep continues to evaluate any LUNCH_OUT records that were created before downtime.
 */
const DOWNTIME_RECOVERY_POLICY = Object.freeze({
  insideWindow: 'EXECUTE_ONCE_ON_RECOVERY_WITH_ACTUAL_IST_TIME',
  afterCutoff: 'SKIP_OUT_NO_BACKFILL_PRESERVE_MISSING_RETURN_SWEEP',
  duplicateProtection: 'ATOMIC_SESSION_LOCK_AND_PARTIAL_UNIQUE_INDEX'
});

/**
 * Convert time string HH:mm to minutes since midnight
 */
const { parseBreakTimeToMinutes } = require('../utils/breakSessionValidation');

const timeToMinutes = (timeStr) => {
  const parsed = parseBreakTimeToMinutes(timeStr);
  return parsed === null ? 0 : parsed;
};

/**
 * Parse 12-hour ("01:30:00 PM") or 24-hour ("13:30") punch timestamps into minutes since midnight.
 */
const parsePunchTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  return hours * 60 + minutes;
};

/**
 * Resolve which configured session an OUT punch belongs to using ID or punch timestamp window —
 * never matching on break names or blindly falling back to sessions[0].
 */
const matchSessionForOutPunch = (outPunch, lunchConfig, normalizedSessions = null) => {
  const sessions = Array.isArray(normalizedSessions)
    ? normalizedSessions
    : getNormalizedSessions(lunchConfig);

  const outId = typeof outPunch?.outSessionId === 'string'
    ? outPunch.outSessionId.trim()
    : (outPunch?.outSessionId ? String(outPunch.outSessionId) : '');

  if (sessions.length > 0 && outId && outId !== 'legacy_lunch_session') {
    const byId = sessions.find(s => s.id === outId);
    if (byId) return byId;
  }

  const outMins = parsePunchTimeToMinutes(outPunch?.time);

  if (sessions.length > 0) {
    if (outMins !== null) {
      const windowMatches = sessions.filter(s => {
        const sOut = timeToMinutes(s.outTime);
        const sEnd = timeToMinutes(s.returnDeadline) + (Number(s.gracePeriodMinutes) || 0);
        return outMins >= sOut - 5 && outMins <= sEnd;
      });
      if (windowMatches.length > 0) {
        return windowMatches[0];
      }
    }

    if (outId === 'legacy_lunch_session' && sessions.length === 1) {
      return sessions[0];
    }

    if (lunchConfig?.lunchOutTime && lunchConfig?.returnDeadline && outMins !== null) {
      const legacyOut = timeToMinutes(lunchConfig.lunchOutTime);
      const legacyEnd = timeToMinutes(lunchConfig.returnDeadline) + (Number(lunchConfig.gracePeriodMinutes) || 0);
      if (outMins >= legacyOut - 5 && outMins <= legacyEnd) {
        return {
          id: 'legacy_lunch_session',
          name: 'Break',
          enabled: lunchConfig.enabled !== false,
          outTime: lunchConfig.lunchOutTime,
          returnDeadline: lunchConfig.returnDeadline,
          gracePeriodMinutes: Math.max(0, Number(lunchConfig.gracePeriodMinutes) || 0)
        };
      }
    }

    return null;
  }

  if (lunchConfig?.lunchOutTime && lunchConfig?.returnDeadline) {
    return {
      id: 'legacy_lunch_session',
      name: 'Break',
      enabled: lunchConfig.enabled !== false,
      outTime: lunchConfig.lunchOutTime,
      returnDeadline: lunchConfig.returnDeadline,
      gracePeriodMinutes: Math.max(0, Number(lunchConfig.gracePeriodMinutes) || 0)
    };
  }

  return null;
};

/**
 * Given chronologically sorted same-day punches for a worker, find the IN punch that
 * closes `dayPunches[outIndex]`. Never pairs an IN punch occurring after a subsequent
 * LUNCH_OUT or tagged with a different session ID.
 */
const findSessionReturnPunch = (dayPunches = [], outIndex = -1, effectiveSessionId = null) => {
  if (!Array.isArray(dayPunches) || outIndex < 0 || outIndex >= dayPunches.length) {
    return null;
  }
  const targetOut = dayPunches[outIndex];
  const sessionId = effectiveSessionId || targetOut?.outSessionId || null;

  for (let idx = outIndex + 1; idx < dayPunches.length; idx++) {
    const candidate = dayPunches[idx];
    if (!candidate) continue;

    const isSubsequentBreakOut = !candidate.presence && (candidate.punchType === 'LUNCH_OUT' || candidate.isLunchPunch);
    if (isSubsequentBreakOut) {
      return null;
    }

    if (candidate.presence === true) {
      if (candidate.outSessionId && sessionId && candidate.outSessionId !== sessionId) {
        continue;
      }
      return candidate;
    }
  }

  return null;
};

/**
 * Helper to get formatted IST date and time strings
 */
const getISTDateTime = (date = new Date()) => {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const timeFormatter12 = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const timeFormatter24 = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return {
    dateStr: dateFormatter.format(date),
    timeStr12: timeFormatter12.format(date),
    timeStr24: timeFormatter24.format(date)
  };
};

/**
 * Helper to calculate safe retention cutoff date string (YYYY-MM-DD in IST)
 * Enforces a strict minimum retention period (at least 1 full past day)
 * to guarantee that today's active session locks can NEVER be pruned.
 */
const getRetentionCutoffDate = (date = new Date(), retentionDays = 3) => {
  const daysNum = Number(retentionDays);
  const safeDays = Math.max(1, isNaN(daysNum) ? 3 : daysNum);
  // 1. Resolve today's date strictly in Asia/Kolkata
  const istDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

  // 2. Perform calendar day arithmetic purely on the IST calendar date (TZ independent)
  const [year, month, day] = istDateStr.split('-').map(Number);
  const cutoffUtc = new Date(Date.UTC(year, month - 1, day - safeDays));
  return cutoffUtc.toISOString().slice(0, 10);
};

/**
 * Prune expired session locks from worker.processedOutSessions
 * Safe retention:
 * - Strictly removes only locks older than the cutoff date (e.g., older than 3 days ago).
 * - Guaranteed never to remove today's locks (active sessions) or yesterday's locks.
 * - Preserves crash recovery and multi-instance concurrency locks for current sessions.
 */
const pruneExpiredSessionLocks = async (workerId, nowDate = new Date(), retentionDays = 3) => {
  try {
    const cutoffDate = getRetentionCutoffDate(nowDate, retentionDays);
    const result = await Worker.updateOne(
      { _id: workerId },
      { $pull: { processedOutSessions: { $lt: cutoffDate } } }
    );
    return { success: true, cutoffDate, modifiedCount: result?.modifiedCount || 0 };
  } catch (error) {
    console.error(`[LunchBreakScheduler] Failed to prune expired locks for worker ${workerId}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Normalizes lunch configuration into an array of session objects.
 * Guarantees every session has a unique, non-empty stable ID and explicit boolean `enabled`.
 * Backward compatible with legacy single-session settings.
 */
const getNormalizedSessions = (lunchConfig) => {
  if (!lunchConfig) return [];
  if (Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0) {
    const usedIds = new Set();
    return lunchConfig.sessions.map((rawSession, index) => {
      const s = rawSession && typeof rawSession.toObject === 'function'
        ? rawSession.toObject()
        : { ...rawSession };
      const outTime = typeof s.outTime === 'string' ? s.outTime.trim() : '';
      const returnDeadline = typeof s.returnDeadline === 'string' ? s.returnDeadline.trim() : '';
      const rawId = typeof s.id === 'string' ? s.id.trim() : (s.id ? String(s.id) : '');
      const objectIdFallback = s._id ? String(s._id) : '';
      let baseId = rawId || objectIdFallback || `session_${index + 1}_${outTime.replace(/[^0-9]/g, '') || '0000'}`;
      let uniqueId = baseId;
      let suffix = index + 1;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${baseId}_${suffix++}`;
      }
      usedIds.add(uniqueId);

      return {
        ...s,
        id: uniqueId,
        name: (s.name && String(s.name).trim()) || `Break Session ${index + 1}`,
        enabled: s.enabled !== false,
        outTime,
        returnDeadline,
        gracePeriodMinutes: Math.max(0, Number(s.gracePeriodMinutes) || 0),
        appliesTo: s.appliesTo || 'inherit',
        applicableDepartments: Array.isArray(s.applicableDepartments) ? s.applicableDepartments : [],
        applicableShifts: Array.isArray(s.applicableShifts) ? s.applicableShifts : [],
        applicableEmployees: Array.isArray(s.applicableEmployees) ? s.applicableEmployees : []
      };
    });
  }
  // Backward compatibility: synthesize default session from legacy fields
  if (lunchConfig.lunchOutTime && lunchConfig.returnDeadline) {
    return [{
      id: 'legacy_lunch_session',
      name: 'Break Session 1',
      enabled: lunchConfig.enabled !== false,
      outTime: lunchConfig.lunchOutTime || '13:30',
      returnDeadline: lunchConfig.returnDeadline || '14:30',
      gracePeriodMinutes: Math.max(0, Number(lunchConfig.gracePeriodMinutes) || 0),
      appliesTo: 'inherit',
      applicableDepartments: [],
      applicableShifts: [],
      applicableEmployees: []
    }];
  }
  return [];
};

/**
 * Check if today is a non-working day for a worker (Sunday, Holiday, or Approved Leave)
 */
const isNonWorkingDay = async (worker, dateStr, dateObj) => {
  // Check Sunday in IST (explicitly anchored in Asia/Kolkata regardless of OS timezone)
  const istReferenceDate = dateObj instanceof Date && !isNaN(dateObj.getTime())
    ? dateObj
    : new Date(`${dateStr}T12:00:00.000+05:30`);
  const istDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(istReferenceDate);
  if (istDay === 'Sun') {
    return true;
  }

  // Explicitly anchor holiday/leave day bounds to Asia/Kolkata calendar date
  const startOfDay = new Date(`${dateStr}T00:00:00.000+05:30`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);

  const holiday = await Holiday.findOne({
    subdomain: worker.subdomain,
    date: { $gte: startOfDay, $lte: endOfDay },
    $or: [
      { appliesTo: 'all' },
      { appliesTo: 'specific', workers: worker._id }
    ]
  });

  if (holiday) return true;

  // Check Approved Full Day Leave
  const leave = await Leave.findOne({
    worker: worker._id,
    subdomain: worker.subdomain,
    status: 'Approved',
    startDate: { $lte: endOfDay },
    endDate: { $gte: startOfDay },
    leaveType: { $ne: 'Permission' }
  });

  if (leave) return true;

  return false;
};

/**
 * Check if the worker is eligible based on session-level scope (if overridden) or tenant module scope
 */
const isWorkerApplicable = (worker, lunchConfig, session = null) => {
  if (!lunchConfig || !lunchConfig.enabled) return false;
  if (worker.status !== 'Active') return false;

  const hasSessionScope = Boolean(session && session.appliesTo && session.appliesTo !== 'inherit');
  const scopeSource = hasSessionScope ? session : lunchConfig;
  const mode = scopeSource.appliesTo || 'all';

  if (mode === 'all') {
    return true;
  }

  if (mode === 'departments') {
    const deptId = worker.department?._id || worker.department;
    if (!deptId) return false;
    return (scopeSource.applicableDepartments || []).some(
      d => d && d.toString() === deptId.toString()
    );
  }

  if (mode === 'shifts') {
    if (!worker.batch) return false;
    return (scopeSource.applicableShifts || []).includes(worker.batch);
  }

  if (mode === 'employees') {
    return (scopeSource.applicableEmployees || []).some(
      e => e && e.toString() === worker._id.toString()
    );
  }

  return false;
};

/**
 * Execute automatic session-out for an individual worker
 * Strict isolation: affects ONLY this worker and their specific sessions/tokens
 * Multi-instance safe: utilizes atomic document locking per session to eliminate race conditions
 */
const processWorkerLunchOut = async (worker, sessionArg, lunchConfigArg, nowDateArg) => {
  let session = sessionArg;
  let lunchConfig = lunchConfigArg;
  let nowDate = nowDateArg || new Date();

  // Support both processWorkerLunchOut(worker, session, lunchConfig, nowDate)
  // and legacy processWorkerLunchOut(worker, lunchConfig, nowDate)
  if (!lunchConfig || lunchConfig instanceof Date) {
    nowDate = lunchConfig || new Date();
    lunchConfig = sessionArg;
    const sessions = getNormalizedSessions(lunchConfig);
    session = sessions.find(s => s.enabled !== false) || {
      id: 'legacy_lunch_session',
      name: 'Break Session 1',
      outTime: lunchConfig?.lunchOutTime || '13:30',
      returnDeadline: lunchConfig?.returnDeadline || '14:30',
      gracePeriodMinutes: lunchConfig?.gracePeriodMinutes || 0
    };
  }

  const { dateStr, timeStr12 } = getISTDateTime(nowDate);
  const rawSessionId = typeof session.id === 'string' ? session.id.trim() : (session.id ? String(session.id) : '');
  const sessionId = rawSessionId || (session._id ? String(session._id) : 'legacy_lunch_session');
  const sessionLockKey = `${dateStr}_${sessionId}`;

  // 1. Idempotency Guard: prevent duplicate LUNCH_OUT on the same day for this specific session
  const existingLunchOut = await Attendance.findOne({
    worker: worker._id,
    subdomain: worker.subdomain,
    date: dateStr,
    punchType: 'LUNCH_OUT',
    outSessionId: sessionId
  });

  if (existingLunchOut) {
    return {
      success: false,
      reason: 'ALREADY_PROCESSED',
      subReason: 'EXISTING_ATTENDANCE'
    };
  }

  // Crash Recovery / Self-Healing: Scoped strictly to THIS session's lock key so prior sessions'
  // lastLunchOutDate and sessionInvalidatedAt on the same day are never wiped.
  const hasOrphanedSessionLock = (worker.processedOutSessions || []).includes(sessionLockKey);
  if (hasOrphanedSessionLock && !existingLunchOut) {
    await Worker.updateOne(
      { _id: worker._id },
      { $pull: { processedOutSessions: sessionLockKey } }
    );
  }

  // 2. Query today's latest punch to verify worker is actively punched IN right now
  const lastPunch = await Attendance.findOne({
    worker: worker._id,
    subdomain: worker.subdomain,
    date: dateStr
  }).sort({ createdAt: -1 });

  if (!lastPunch || !lastPunch.presence) {
    // Worker is not currently punched IN today (or is still OUT from a previous session); nothing to pause
    return { success: false, reason: 'NOT_PUNCHED_IN' };
  }

  // 3. Multi-instance atomic lock ONLY (do NOT mutate auth timestamps before Attendance.create succeeds)
  const lockedWorker = await Worker.findOneAndUpdate(
    {
      _id: worker._id,
      processedOutSessions: { $ne: sessionLockKey }
    },
    {
      $addToSet: { processedOutSessions: sessionLockKey }
    },
    { new: true }
  );

  if (!lockedWorker) {
    return {
      success: false,
      reason: 'ALREADY_PROCESSED',
      subReason: 'LOCK_CONFLICT'
    };
  }

  // Safe Retention Cleanup: asynchronously prune stale locks (> 3 days old) for this worker
  // Non-blocking and never touches today's active locks or recent days
  try {
    const cutoffDate = getRetentionCutoffDate(nowDate, 3);
    if (Array.isArray(lockedWorker.processedOutSessions) && 
        lockedWorker.processedOutSessions.some(k => typeof k === 'string' && k < cutoffDate)) {
      Worker.updateOne(
        { _id: worker._id },
        { $pull: { processedOutSessions: { $lt: cutoffDate } } }
      ).catch(err => {
        console.error(`[LunchBreakScheduler] Retention pruning error for worker ${worker._id}:`, err.message);
      });
    }
  } catch (retentionErr) {
    // Non-blocking
  }

  // 4. Resolve department name safely
  let deptName = worker.departmentName;
  if (!deptName && worker.department) {
    const dept = await Department.findById(worker.department);
    deptName = dept ? dept.name : 'General';
  }

  // 5. Create SYSTEM/AUTOMATIC LUNCH_OUT attendance record BEFORE invalidating worker auth state
  let lunchOutAttendance;
  try {
    lunchOutAttendance = await Attendance.create({
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: worker.department,
      departmentName: deptName || 'General',
      photo: worker.photo || '',
      date: dateStr,
      time: timeStr12,
      presence: false,
      punchType: 'LUNCH_OUT',
      source: 'SYSTEM/AUTOMATIC',
      isLunchPunch: true,
      outSessionId: sessionId,
      outSessionName: null,
      worker: worker._id
    });
  } catch (createErr) {
    if (createErr.code === 11000) {
      // Check whether attendance actually exists for THIS session ID before keeping/releasing the lock
      const existingSameSession = await Attendance.findOne({
        worker: worker._id,
        subdomain: worker.subdomain,
        date: dateStr,
        punchType: 'LUNCH_OUT',
        outSessionId: sessionId
      });

      if (!existingSameSession) {
        // Legacy index collision or external conflict where this session has no Attendance record:
        // release the acquired lock so worker is not left permanently orphaned, and keep session valid.
        await Worker.updateOne(
          { _id: worker._id },
          { $pull: { processedOutSessions: sessionLockKey } }
        );

        const anotherSessionOutToday = await Attendance.findOne({
          worker: worker._id,
          subdomain: worker.subdomain,
          date: dateStr,
          punchType: 'LUNCH_OUT'
        });

        logSchedulerEvent('error', 'LegacyIndexConflict', {
          subdomain: worker.subdomain,
          sessionId,
          workerId: String(worker._id),
          date: dateStr,
          existingOtherSessionId: anotherSessionOutToday?.outSessionId ?? null,
          errorMessage: createErr.message || 'E11000 duplicate key conflict without matching outSessionId'
        });
      }

      return {
        success: false,
        reason: 'ALREADY_PROCESSED',
        subReason: 'DUPLICATE_KEY',
        ...(!existingSameSession ? { indexConflict: true } : {})
      };
    }

    // Crash/Validation Recovery: Roll back atomic lock on failure without invalidating auth session
    await Worker.updateOne(
      { _id: worker._id },
      { $pull: { processedOutSessions: sessionLockKey } }
    );
    throw createErr;
  }

  // 6. Commit authentication invalidation timestamps and revoke refresh tokens ONLY AFTER Attendance.create succeeds
  await Worker.updateOne(
    { _id: worker._id },
    { $set: { lastLunchOutDate: dateStr, sessionInvalidatedAt: nowDate } }
  );
  await RefreshToken.deleteMany({ userId: worker._id });

  // 7. Real-time notification over Socket.IO (Targeted to this specific user room)
  try {
    const { getIO } = require('../utils/socket');
    const io = getIO();
    if (io) {
      // Direct message to the specific worker
      io.to(worker._id.toString()).emit('force-logout', {
        reason: 'Break Started. Attendance paused automatically.',
        punchType: 'LUNCH_OUT',
        breakLabel: 'Break OUT',
        sessionId: sessionId,
        timestamp: timeStr12
      });

      // Broadcast attendance update to tenant room (generic break metadata only; never expose sessionId/name)
      if (worker.subdomain) {
        io.to(worker.subdomain.toLowerCase()).emit('attendance-update', {
          workerId: worker._id,
          punchType: 'LUNCH_OUT',
          breakLabel: 'Break OUT',
          presence: false,
          date: dateStr,
          time: timeStr12
        });
      }
    }
  } catch (socketError) {
    // Non-blocking if socket is uninitialized or in test environment
  }

  return { success: true, attendance: lunchOutAttendance };
};

/**
 * Emit structured, PII-safe scheduler diagnostics
 */
const logSchedulerEvent = (level, event, payload) => {
  const logger = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
  logger(`[LunchBreakScheduler] ${event}`, JSON.stringify(payload));
};

/**
 * Scan all active tenants and execute break session operations
 */
const checkAndExecuteLunchBreak = async (nowDate = new Date()) => {
  try {
    const { dateStr, timeStr24 } = getISTDateTime(nowDate);
    const currentMinutes = timeToMinutes(timeStr24);

    // Find all settings where lunch break management is enabled
    const activeSettings = await Settings.find({
      'lunchBreakManagement.enabled': true
    });

    logSchedulerEvent('info', 'Tick', {
      date: dateStr,
      timeIST: timeStr24,
      currentMinutes,
      enabledSettingsCount: activeSettings.length
    });

    for (const settings of activeSettings) {
      const { subdomain, lunchBreakManagement } = settings;
      if (!lunchBreakManagement || !lunchBreakManagement.enabled) continue;

      const allSessions = getNormalizedSessions(lunchBreakManagement);
      const sessions = allSessions.filter(s => s.enabled);

      const sessionWindows = sessions.map((s) => {
        const sOut = timeToMinutes(s.outTime || '13:30');
        const sDeadline = timeToMinutes(s.returnDeadline || '14:30');
        const sCutoff = sDeadline + Number(s.gracePeriodMinutes || 0);
        const state = currentMinutes < sOut
          ? 'PENDING_WINDOW'
          : (currentMinutes <= sCutoff ? 'IN_WINDOW' : 'WINDOW_CLOSED');
        return { sessionId: s.id, outTime: s.outTime, returnDeadline: s.returnDeadline, state };
      });

      logSchedulerEvent('info', 'TenantScan', {
        subdomain,
        enabledSessionsCount: sessions.length,
        sessionWindows
      });

      if (allSessions.length === 0) continue;

      for (const session of allSessions) {
        const outMinutes = timeToMinutes(session.outTime || '13:30');
        const deadlineMinutes = timeToMinutes(session.returnDeadline || '14:30');
        const gracePeriod = Number(session.gracePeriodMinutes || 0);
        const cutoffMinutes = deadlineMinutes + gracePeriod;

        // Cross-midnight windows are unsupported because attendance records are partitioned by IST calendar date
        if (deadlineMinutes <= outMinutes || cutoffMinutes >= 1440) {
          console.warn(`[LunchBreakScheduler] Skipping invalid cross-midnight session "${session.id}" (${session.outTime}-${session.returnDeadline}) for tenant ${subdomain}`);
          continue;
        }

        // ─── A. SESSION OUT SWEEP (Enabled sessions only, strictly inside [outMinutes..cutoffMinutes]) ─
        // Explicit missed-window policy: OUT sweeps run strictly inside [outMinutes..cutoffMinutes]
        // and never silently backfill punches after the break window has closed, avoiding false
        // automatic logouts hours later if the server was down during the break window.
        if (session.enabled && currentMinutes >= outMinutes && currentMinutes <= cutoffMinutes) {
          const workers = await Worker.find({
            subdomain,
            status: 'Active'
          }).populate('department');

          let eligibleWorkersCount = 0;
          const results = {
            SUCCESS: 0,
            NOT_PUNCHED_IN: 0,
            NOT_APPLICABLE: 0,
            NON_WORKING_DAY: 0,
            ALREADY_PROCESSED: 0,
            VALIDATION_ERROR: 0,
            ERROR: 0
          };
          const alreadyProcessedDetails = {
            EXISTING_ATTENDANCE: 0,
            LOCK_CONFLICT: 0,
            DUPLICATE_KEY: 0
          };

          for (const worker of workers) {
            const workerId = worker?._id ? String(worker._id) : 'unknown';
            try {
              if (!isWorkerApplicable(worker, lunchBreakManagement, session)) {
                results.NOT_APPLICABLE++;
                logSchedulerEvent('info', 'WorkerResult', {
                  subdomain,
                  sessionId: session.id,
                  workerId,
                  result: 'NOT_APPLICABLE'
                });
                continue;
              }

              const nonWorking = await isNonWorkingDay(worker, dateStr, nowDate);
              if (nonWorking) {
                results.NON_WORKING_DAY++;
                logSchedulerEvent('info', 'WorkerResult', {
                  subdomain,
                  sessionId: session.id,
                  workerId,
                  result: 'NON_WORKING_DAY'
                });
                continue;
              }

              eligibleWorkersCount++;
              const outcome = await processWorkerLunchOut(worker, session, lunchBreakManagement, nowDate);
              const result = outcome?.success ? 'SUCCESS' : (outcome?.reason || 'ALREADY_PROCESSED');
              results[result] = (results[result] || 0) + 1;
              if (outcome?.subReason) {
                alreadyProcessedDetails[outcome.subReason] = (alreadyProcessedDetails[outcome.subReason] || 0) + 1;
              }
              logSchedulerEvent('info', 'WorkerResult', {
                subdomain,
                sessionId: session.id,
                workerId,
                result,
                ...(outcome?.subReason ? { subReason: outcome.subReason } : {})
              });
            } catch (workerErr) {
              const isValidationErr = workerErr?.name === 'ValidationError'
                || workerErr?.code === 'VALIDATION_ERROR'
                || /validation|required|cast/i.test(workerErr?.message || '');
              const result = isValidationErr ? 'VALIDATION_ERROR' : 'ERROR';
              results[result] = (results[result] || 0) + 1;
              logSchedulerEvent('error', 'WorkerError', {
                subdomain,
                sessionId: session.id,
                workerId,
                result,
                errorName: workerErr?.name || 'Error',
                errorMessage: workerErr?.message || 'Unknown error'
              });
            }
          }

          logSchedulerEvent('info', 'SessionSweepSummary', {
            subdomain,
            sessionId: session.id,
            enabledSettingsCount: activeSettings.length,
            enabledSessionsCount: sessions.length,
            activeWorkersCount: workers.length,
            eligibleWorkersCount,
            results,
            alreadyProcessedDetails
          });
        }

        // ─── B. MISSING SESSION RETURN SWEEP ──────────────────────────────────
        if (currentMinutes > cutoffMinutes) {
          const candidateOutPunches = await Attendance.find({
            subdomain,
            date: dateStr,
            punchType: 'LUNCH_OUT',
            isMissingLunchReturn: false,
            $or: [
              { outSessionId: session.id },
              { outSessionId: 'legacy_lunch_session' },
              { outSessionId: null },
              { outSessionId: '' }
            ]
          });

          const sessionOutPunches = candidateOutPunches.filter(outPunch => {
            if (outPunch.outSessionId === session.id) return true;
            const matched = matchSessionForOutPunch(outPunch, lunchBreakManagement, allSessions);
            if (!matched) return false;
            return matched.id === session.id || (
              outPunch.outSessionId === 'legacy_lunch_session' &&
              matched.outTime === session.outTime &&
              matched.returnDeadline === session.returnDeadline
            );
          });

          for (const outPunch of sessionOutPunches) {
            try {
              const rawDayPunches = await Attendance.find({
                worker: outPunch.worker,
                subdomain,
                date: dateStr
              });
              const dayPunches = Array.isArray(rawDayPunches)
                ? [...rawDayPunches].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                : [];

              let subsequentPunch = null;
              const outIdx = Array.isArray(dayPunches)
                ? dayPunches.findIndex(p => String(p._id) === String(outPunch._id) || (
                    p.createdAt && outPunch.createdAt &&
                    new Date(p.createdAt).getTime() === new Date(outPunch.createdAt).getTime() &&
                    !p.presence
                  ))
                : -1;

              if (outIdx !== -1) {
                subsequentPunch = findSessionReturnPunch(dayPunches, outIdx, session.id);
              } else if (Array.isArray(dayPunches)) {
                const afterPunches = dayPunches.filter(p => new Date(p.createdAt) > new Date(outPunch.createdAt));
                for (const candidate of afterPunches) {
                  if (!candidate.presence && (candidate.punchType === 'LUNCH_OUT' || candidate.isLunchPunch)) {
                    break;
                  }
                  if (candidate.presence === true) {
                    if (candidate.outSessionId && candidate.outSessionId !== session.id) {
                      continue;
                    }
                    subsequentPunch = candidate;
                    break;
                  }
                }
              }

              if (!subsequentPunch) {
                // Worker has NOT returned before the deadline + grace period (or before another break OUT)
                const missingUpdateRes = await Attendance.updateOne(
                  { _id: outPunch._id, isMissingLunchReturn: false },
                  { $set: { isMissingLunchReturn: true } }
                );
                if (missingUpdateRes?.modifiedCount > 0 && subdomain) {
                  try {
                    const { getIO } = require('../utils/socket');
                    const io = getIO();
                    if (io) {
                      io.to(String(subdomain).toLowerCase()).emit('attendance-update', {
                        workerId: outPunch.worker,
                        punchType: 'LUNCH_OUT',
                        breakLabel: 'Break OUT',
                        isMissingLunchReturn: true,
                        date: dateStr
                      });
                    }
                  } catch (socketError) {
                    // Non-blocking if socket is uninitialized or in test environment
                  }
                }
              }
            } catch (missingErr) {
              logSchedulerEvent('error', 'MissingReturnError', {
                subdomain,
                sessionId: session.id,
                workerId: outPunch?.worker ? String(outPunch.worker) : 'unknown',
                result: 'ERROR',
                errorName: missingErr?.name || 'Error',
                errorMessage: missingErr?.message || 'Unknown error'
              });
            }
          }
        }
      }
    }
  } catch (error) {
    logSchedulerEvent('error', 'ExecutionError', {
      errorName: error?.name || 'Error',
      errorMessage: error?.message || 'Unknown error'
    });
  }
};

/**
 * Start the Lunch Break / Break Sessions cron scheduler (every minute)
 */
const startLunchBreakScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndExecuteLunchBreak();
    } catch (err) {
      console.error('[LunchBreakScheduler] Unhandled runner error:', err.message);
    }
  });
  console.log('[LunchBreakScheduler] Running: Break Sessions scanner active (every minute)');
};

module.exports = {
  startLunchBreakScheduler,
  checkAndExecuteLunchBreak,
  processWorkerLunchOut,
  isWorkerApplicable,
  isNonWorkingDay,
  timeToMinutes,
  parsePunchTimeToMinutes,
  getISTDateTime,
  getNormalizedSessions,
  matchSessionForOutPunch,
  findSessionReturnPunch,
  getRetentionCutoffDate,
  pruneExpiredSessionLocks,
  DOWNTIME_RECOVERY_POLICY
};
