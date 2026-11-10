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
 * Convert time string HH:mm to minutes since midnight
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
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
 * Normalizes lunch configuration into an array of session objects
 * Backward compatible with legacy single-session settings
 */
const getNormalizedSessions = (lunchConfig) => {
  if (!lunchConfig) return [];
  if (Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0) {
    return lunchConfig.sessions;
  }
  // Backward compatibility: synthesize default session from legacy fields
  if (lunchConfig.lunchOutTime && lunchConfig.returnDeadline) {
    return [{
      id: 'legacy_lunch_session',
      name: 'Lunch Break',
      enabled: lunchConfig.enabled !== false,
      outTime: lunchConfig.lunchOutTime || '13:30',
      returnDeadline: lunchConfig.returnDeadline || '14:30',
      gracePeriodMinutes: lunchConfig.gracePeriodMinutes || 0
    }];
  }
  return [];
};

/**
 * Check if today is a non-working day for a worker (Sunday, Holiday, or Approved Leave)
 */
const isNonWorkingDay = async (worker, dateStr, dateObj) => {
  // Check Sunday in IST
  const istDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(dateObj);
  if (istDay === 'Sun') {
    return true;
  }

  // Check Holiday
  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

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
 * Check if the worker is eligible based on the tenant's appliesTo configuration
 */
const isWorkerApplicable = (worker, lunchConfig) => {
  if (!lunchConfig || !lunchConfig.enabled) return false;
  if (worker.status !== 'Active') return false;

  const mode = lunchConfig.appliesTo || 'all';

  if (mode === 'all') {
    return true;
  }

  if (mode === 'departments') {
    const deptId = worker.department?._id || worker.department;
    if (!deptId) return false;
    return (lunchConfig.applicableDepartments || []).some(
      d => d.toString() === deptId.toString()
    );
  }

  if (mode === 'shifts') {
    if (!worker.batch) return false;
    return (lunchConfig.applicableShifts || []).includes(worker.batch);
  }

  if (mode === 'employees') {
    return (lunchConfig.applicableEmployees || []).some(
      e => e.toString() === worker._id.toString()
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
    session = sessions[0] || {
      id: 'legacy_lunch_session',
      name: 'Lunch Break',
      outTime: lunchConfig?.lunchOutTime || '13:30',
      returnDeadline: lunchConfig?.returnDeadline || '14:30',
      gracePeriodMinutes: lunchConfig?.gracePeriodMinutes || 0
    };
  }

  const { dateStr, timeStr12 } = getISTDateTime(nowDate);
  const sessionId = session.id || 'legacy_lunch_session';
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
    return { success: false, reason: 'ALREADY_PROCESSED' };
  }

  // Crash Recovery / Self-Healing: If worker was marked with a lock but no actual Attendance record exists,
  // heal the orphaned lock so the scheduler can safely retry
  const hasLock = (worker.processedOutSessions || []).includes(sessionLockKey) || 
                  (worker.lastLunchOutDate === dateStr && !existingLunchOut);
  if (hasLock && !existingLunchOut) {
    await Worker.updateOne(
      { _id: worker._id },
      { 
        $pull: { processedOutSessions: sessionLockKey },
        $set: { lastLunchOutDate: null, sessionInvalidatedAt: null }
      }
    );
  }

  // 2. Query last punch to verify worker has an active open session
  const lastPunch = await Attendance.findOne({
    worker: worker._id,
    subdomain: worker.subdomain
  }).sort({ createdAt: -1 });

  if (!lastPunch || !lastPunch.presence) {
    // Worker is not currently punched IN; nothing to pause
    return { success: false, reason: 'NOT_PUNCHED_IN' };
  }

  // 3. Multi-instance atomic lock on Worker to guarantee only ONE instance executes this session
  const lockedWorker = await Worker.findOneAndUpdate(
    { 
      _id: worker._id, 
      processedOutSessions: { $ne: sessionLockKey } 
    },
    { 
      $addToSet: { processedOutSessions: sessionLockKey },
      $set: { lastLunchOutDate: dateStr, sessionInvalidatedAt: nowDate } 
    },
    { new: true }
  );

  if (!lockedWorker) {
    return { success: false, reason: 'ALREADY_PROCESSED' };
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

  // 5. Create SYSTEM/AUTOMATIC LUNCH_OUT attendance record
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
      outSessionName: session.name || 'Lunch Break',
      worker: worker._id
    });
  } catch (createErr) {
    if (createErr.code === 11000) {
      return { success: false, reason: 'ALREADY_PROCESSED' };
    }
    // Crash Recovery: Roll back atomic lock on failure so the next scheduler cycle can retry
    await Worker.updateOne(
      { _id: worker._id },
      { $pull: { processedOutSessions: sessionLockKey } }
    );
    throw createErr;
  }

  // 6. Invalidate ONLY this worker's refresh tokens (Session Isolation)
  await RefreshToken.deleteMany({ userId: worker._id });

  // 7. Real-time notification over Socket.IO (Targeted to this specific user room)
  try {
    const { getIO } = require('../utils/socket');
    const io = getIO();
    if (io) {
      // Direct message to the specific worker
      io.to(worker._id.toString()).emit('force-logout', {
        reason: `${session.name || 'Break Session'} Started. Attendance paused automatically.`,
        punchType: 'LUNCH_OUT',
        sessionId: sessionId,
        sessionName: session.name || 'Lunch Break',
        timestamp: timeStr12
      });

      // Broadcast attendance update to tenant room
      if (worker.subdomain) {
        io.to(worker.subdomain.toLowerCase()).emit('attendance-update', {
          workerId: worker._id,
          punchType: 'LUNCH_OUT',
          presence: false,
          sessionId: sessionId,
          sessionName: session.name || 'Lunch Break',
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

    for (const settings of activeSettings) {
      const { subdomain, lunchBreakManagement } = settings;
      if (!lunchBreakManagement || !lunchBreakManagement.enabled) continue;

      const sessions = getNormalizedSessions(lunchBreakManagement).filter(s => s.enabled);
      if (sessions.length === 0) continue;

      for (const session of sessions) {
        const outMinutes = timeToMinutes(session.outTime || '13:30');
        const deadlineMinutes = timeToMinutes(session.returnDeadline || '14:30');
        const gracePeriod = session.gracePeriodMinutes || 0;
        const cutoffMinutes = deadlineMinutes + gracePeriod;

        // ─── A. SESSION OUT SWEEP (At or slightly after session outTime) ────────
        if (currentMinutes >= outMinutes && currentMinutes <= cutoffMinutes) {
          const workers = await Worker.find({
            subdomain,
            status: 'Active'
          }).populate('department');

          for (const worker of workers) {
            if (!isWorkerApplicable(worker, lunchBreakManagement)) continue;

            const nonWorking = await isNonWorkingDay(worker, dateStr, nowDate);
            if (nonWorking) continue;

            await processWorkerLunchOut(worker, session, lunchBreakManagement, nowDate);
          }
        }

        // ─── B. MISSING SESSION RETURN SWEEP ──────────────────────────────────
        if (currentMinutes > cutoffMinutes) {
          const sessionQuery = session.id
            ? { subdomain, date: dateStr, punchType: 'LUNCH_OUT', outSessionId: session.id, isMissingLunchReturn: false }
            : { subdomain, date: dateStr, punchType: 'LUNCH_OUT', isMissingLunchReturn: false };

          const sessionOutPunches = await Attendance.find(sessionQuery);

          for (const outPunch of sessionOutPunches) {
            // Check if there is any subsequent IN punch for this worker today
            const subsequentPunch = await Attendance.findOne({
              worker: outPunch.worker,
              subdomain,
              date: dateStr,
              createdAt: { $gt: outPunch.createdAt }
            }).sort({ createdAt: 1 });

            if (!subsequentPunch) {
              // Worker has NOT returned yet after the deadline + grace period
              await Attendance.updateOne(
                { _id: outPunch._id, isMissingLunchReturn: false },
                { $set: { isMissingLunchReturn: true } }
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[LunchBreakScheduler] Execution error:', error.message);
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
  getISTDateTime,
  getNormalizedSessions,
  getRetentionCutoffDate,
  pruneExpiredSessionLocks
};
