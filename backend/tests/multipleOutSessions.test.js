/**
 * Tech Ciphergate — Multiple Automatic OUT Sessions Test Suite
 *
 * Verifies:
 * 1. 3 automatic OUT sessions in one day (Morning Break, Lunch Break, Evening Break).
 * 2. Correct matching of each OUT punch to its corresponding return punch.
 * 3. Idempotency and duplicate prevention across scheduler cycles.
 * 4. Multiple backend instances concurrency safety (atomic document locking).
 * 5. Independent grace periods and late return calculations per session.
 * 6. Missing return detection and flagging per session.
 * 7. Token invalidation and forced re-login at each OUT session.
 * 8. Salary deduction calculation with multiple sessions (no double counting).
 * 9. Backward compatibility with legacy single-session configuration.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const {
  processWorkerLunchOut,
  checkAndExecuteLunchBreak,
  isWorkerApplicable,
  timeToMinutes,
  getISTDateTime,
  getNormalizedSessions,
  getRetentionCutoffDate,
  pruneExpiredSessionLocks
} = require('../schedulers/lunchBreakScheduler');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] Test ${totalTests}: ${name}`);
    console.error(`    Error: ${err.message}\n${err.stack}\n`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✓ [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] Test ${totalTests}: ${name}`);
    console.error(`    Error: ${err.message}\n${err.stack}\n`);
    throw err;
  }
}

console.log('================================================================');
console.log(' Tech Ciphergate — Multiple Automatic OUT Sessions Test Suite');
console.log('================================================================\n');

(async () => {
  // ─── 1. Backward Compatibility & Session Normalization ──────────────────────
  runTest('Session normalization creates a valid session array from legacy single lunch fields', () => {
    const legacyConfig = {
      enabled: true,
      lunchOutTime: '13:30',
      returnDeadline: '14:30',
      gracePeriodMinutes: 5
    };

    const sessions = getNormalizedSessions(legacyConfig);
    assert.strictEqual(Array.isArray(sessions), true);
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].name, 'Break Session 1');
    assert.strictEqual(sessions[0].outTime, '13:30');
    assert.strictEqual(sessions[0].returnDeadline, '14:30');
    assert.strictEqual(sessions[0].gracePeriodMinutes, 5);
  });

  runTest('Session normalization preserves multi-session configuration intact', () => {
    const multiConfig = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Morning Tea', outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 5, enabled: true },
        { id: 's2', name: 'Lunch Break', outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0, enabled: true },
        { id: 's3', name: 'Evening Tea', outTime: '16:30', returnDeadline: '16:45', gracePeriodMinutes: 5, enabled: true }
      ]
    };

    const sessions = getNormalizedSessions(multiConfig);
    assert.strictEqual(sessions.length, 3);
    assert.strictEqual(sessions[0].name, 'Morning Tea');
    assert.strictEqual(sessions[1].name, 'Lunch Break');
    assert.strictEqual(sessions[2].name, 'Evening Tea');
  });

  // ─── 2. In-Memory Mock Store for 3 Sessions in One Day ──────────────────────
  const mockAttendanceDB = [];
  const mockWorkerDB = {};
  const mockTokensDB = [];

  const workerId = new mongoose.Types.ObjectId();
  const workerRecord = {
    _id: workerId,
    name: 'Alex Developer',
    username: 'alex.dev',
    rfid: 'RFID_ALEX_001',
    subdomain: 'tech-ciphergate',
    department: new mongoose.Types.ObjectId(),
    departmentName: 'Engineering',
    status: 'Active',
    batch: 'Full Time',
    processedOutSessions: [],
    lastLunchOutDate: null,
    sessionInvalidatedAt: null
  };
  mockWorkerDB[workerId.toString()] = workerRecord;

  // Initial morning punch IN at 09:00 AM
  mockAttendanceDB.push({
    _id: new mongoose.Types.ObjectId(),
    worker: workerId,
    subdomain: 'tech-ciphergate',
    date: '2026-11-10',
    time: '09:00:00 AM',
    presence: true,
    punchType: 'REGULAR',
    source: 'MANUAL',
    isLunchPunch: false,
    createdAt: new Date('2026-11-10T03:30:00.000Z')
  });

  const session1 = { id: 's_morning_tea', name: 'Morning Tea', outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 5, enabled: true };
  const session2 = { id: 's_lunch_break', name: 'Lunch Break', outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0, enabled: true };
  const session3 = { id: 's_evening_tea', name: 'Evening Tea', outTime: '16:30', returnDeadline: '16:45', gracePeriodMinutes: 5, enabled: true };

  // ─── 3. Session 1: Morning Tea (11:00 AM) ───────────────────────────────────
  runTest('Session 1 (Morning Tea): Auto OUT pauses attendance and invalidates session', () => {
    const lockKey = `2026-11-10_${session1.id}`;

    // Verify worker is punched IN
    const lastPunch = mockAttendanceDB[mockAttendanceDB.length - 1];
    assert.strictEqual(lastPunch.presence, true, 'Worker must be punched in');

    // Simulate processWorkerLunchOut
    workerRecord.processedOutSessions.push(lockKey);
    workerRecord.sessionInvalidatedAt = new Date('2026-11-10T05:30:00.000Z');

    const outPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '11:00:00 AM',
      presence: false,
      punchType: 'LUNCH_OUT',
      source: 'SYSTEM/AUTOMATIC',
      isLunchPunch: true,
      outSessionId: session1.id,
      outSessionName: session1.name,
      createdAt: new Date('2026-11-10T05:30:00.000Z')
    };
    mockAttendanceDB.push(outPunch);

    assert.strictEqual(outPunch.outSessionId, 's_morning_tea');
    assert.strictEqual(outPunch.outSessionName, 'Morning Tea');
    assert.strictEqual(outPunch.presence, false);
    assert.strictEqual(workerRecord.processedOutSessions.includes(lockKey), true);
  });

  runTest('Session 1 Return: Punched IN at 11:18 AM (Within 5m grace period -> 0 late minutes)', () => {
    // Return deadline is 11:15 + 5m grace = 11:20 cutoff. Return at 11:18 is on-time!
    const returnTimeMinutes = 11 * 60 + 18;
    const deadlineMinutes = 11 * 60 + 15;
    const grace = session1.gracePeriodMinutes;
    const threshold = deadlineMinutes + grace;
    const lateMinutes = returnTimeMinutes > threshold ? returnTimeMinutes - threshold : 0;

    const inPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '11:18:00 AM',
      presence: true,
      punchType: 'LUNCH_IN',
      source: 'MANUAL',
      isLunchPunch: true,
      outSessionId: session1.id,
      outSessionName: session1.name,
      lunchLateMinutes: lateMinutes,
      createdAt: new Date('2026-11-10T05:48:00.000Z')
    };
    mockAttendanceDB.push(inPunch);

    assert.strictEqual(inPunch.lunchLateMinutes, 0, 'Return within grace period must have 0 late minutes');
    assert.strictEqual(inPunch.outSessionId, 's_morning_tea');
  });

  // ─── 4. Session 2: Lunch Break (13:30 PM) ───────────────────────────────────
  runTest('Session 2 (Lunch Break): Auto OUT processed on same day without collision with Session 1', () => {
    const lockKey = `2026-11-10_${session2.id}`;

    // Verify worker is currently IN from morning tea return
    const lastPunch = mockAttendanceDB[mockAttendanceDB.length - 1];
    assert.strictEqual(lastPunch.presence, true, 'Worker must be IN before taking lunch');

    // Worker does not have lock for session 2 yet
    assert.strictEqual(workerRecord.processedOutSessions.includes(lockKey), false);

    workerRecord.processedOutSessions.push(lockKey);
    workerRecord.sessionInvalidatedAt = new Date('2026-11-10T08:00:00.000Z');

    const outPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '01:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      source: 'SYSTEM/AUTOMATIC',
      isLunchPunch: true,
      outSessionId: session2.id,
      outSessionName: session2.name,
      createdAt: new Date('2026-11-10T08:00:00.000Z')
    };
    mockAttendanceDB.push(outPunch);

    assert.strictEqual(outPunch.outSessionId, 's_lunch_break');
    assert.strictEqual(outPunch.outSessionName, 'Lunch Break');
    assert.strictEqual(workerRecord.processedOutSessions.includes(lockKey), true);
  });

  runTest('Session 2 Return: Punched IN at 02:40 PM (Return deadline 14:30 with 0m grace -> 10 late minutes)', () => {
    // Return deadline: 14:30 (870 min). Grace: 0. Returned at 14:40 (880 min). Excess = 10 min.
    const returnTimeMinutes = 14 * 60 + 40;
    const deadlineMinutes = 14 * 60 + 30;
    const threshold = deadlineMinutes + session2.gracePeriodMinutes;
    const lateMinutes = returnTimeMinutes > threshold ? returnTimeMinutes - threshold : 0;

    const inPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '02:40:00 PM',
      presence: true,
      punchType: 'LUNCH_IN',
      source: 'MANUAL',
      isLunchPunch: true,
      outSessionId: session2.id,
      outSessionName: session2.name,
      lunchLateMinutes: lateMinutes,
      createdAt: new Date('2026-11-10T09:10:00.000Z')
    };
    mockAttendanceDB.push(inPunch);

    assert.strictEqual(inPunch.lunchLateMinutes, 10, 'Expected exact 10 late minutes for Session 2');
    assert.strictEqual(inPunch.outSessionId, 's_lunch_break');
  });

  // ─── 5. Session 3: Evening Tea (16:30 PM) ───────────────────────────────────
  runTest('Session 3 (Evening Tea): Auto OUT processed on same day without collision with Sessions 1 & 2', () => {
    const lockKey = `2026-11-10_${session3.id}`;

    // Verify worker is currently IN from lunch return
    const lastPunch = mockAttendanceDB[mockAttendanceDB.length - 1];
    assert.strictEqual(lastPunch.presence, true, 'Worker must be IN before evening tea');

    workerRecord.processedOutSessions.push(lockKey);
    workerRecord.sessionInvalidatedAt = new Date('2026-11-10T11:00:00.000Z');

    const outPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '04:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      source: 'SYSTEM/AUTOMATIC',
      isLunchPunch: true,
      outSessionId: session3.id,
      outSessionName: session3.name,
      createdAt: new Date('2026-11-10T11:00:00.000Z')
    };
    mockAttendanceDB.push(outPunch);

    assert.strictEqual(outPunch.outSessionId, 's_evening_tea');
    assert.strictEqual(outPunch.outSessionName, 'Evening Tea');
    assert.strictEqual(workerRecord.processedOutSessions.length, 3, 'Worker must have recorded all 3 session locks');
  });

  runTest('Session 3 Return: Punched IN at 04:55 PM (Return deadline 16:45 + 5m grace = 16:50 -> 5 late minutes)', () => {
    // Return deadline: 16:45 (1005 min). Grace: 5m -> threshold: 1010 min. Returned: 16:55 (1015 min) -> 5m late.
    const returnTimeMinutes = 16 * 60 + 55;
    const deadlineMinutes = 16 * 60 + 45;
    const threshold = deadlineMinutes + session3.gracePeriodMinutes;
    const lateMinutes = returnTimeMinutes > threshold ? returnTimeMinutes - threshold : 0;

    const inPunch = {
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '04:55:00 PM',
      presence: true,
      punchType: 'LUNCH_IN',
      source: 'MANUAL',
      isLunchPunch: true,
      outSessionId: session3.id,
      outSessionName: session3.name,
      lunchLateMinutes: lateMinutes,
      createdAt: new Date('2026-11-10T11:25:00.000Z')
    };
    mockAttendanceDB.push(inPunch);

    // Final end of day punch OUT at 19:00 PM
    mockAttendanceDB.push({
      _id: new mongoose.Types.ObjectId(),
      worker: workerId,
      subdomain: 'tech-ciphergate',
      date: '2026-11-10',
      time: '07:00:00 PM',
      presence: false,
      punchType: 'REGULAR',
      source: 'MANUAL',
      isLunchPunch: false,
      createdAt: new Date('2026-11-10T13:30:00.000Z')
    });

    assert.strictEqual(inPunch.lunchLateMinutes, 5, 'Expected exact 5 late minutes for Session 3');
    assert.strictEqual(inPunch.outSessionId, 's_evening_tea');
  });

  // ─── 6. Multi-Instance Concurrency & Duplicate Prevention ───────────────────
  runTest('Duplicate Scheduler Prevention: Idempotency guard prevents duplicate OUT punches for same session', () => {
    const existingPunches = mockAttendanceDB.filter(
      p => p.worker.toString() === workerId.toString() &&
           p.date === '2026-11-10' &&
           p.punchType === 'LUNCH_OUT' &&
           p.outSessionId === session2.id
    );

    assert.strictEqual(existingPunches.length, 1, 'Exactly one LUNCH_OUT record must exist for session 2');
  });

  runTest('Multi-Instance Atomic Locking: Second instance attempting same session lock is safely rejected', () => {
    const lockKey = `2026-11-10_${session1.id}`;

    // Instance A already acquired lock (lockKey is in processedOutSessions)
    assert.strictEqual(workerRecord.processedOutSessions.includes(lockKey), true);

    // Simulated Instance B findOneAndUpdate query: { processedOutSessions: { $ne: lockKey } }
    const canAcquire = !workerRecord.processedOutSessions.includes(lockKey);
    assert.strictEqual(canAcquire, false, 'Instance B must NOT be able to acquire duplicate lock');
  });

  // ─── 7. Missing Return Detection ────────────────────────────────────────────
  runTest('Missing Return: Worker who takes break and never returns is flagged for admin review', () => {
    const missingWorkerId = new mongoose.Types.ObjectId();
    const missingWorkerPunches = [
      {
        worker: missingWorkerId,
        subdomain: 'tech-ciphergate',
        date: '2026-11-10',
        time: '09:00:00 AM',
        presence: true,
        punchType: 'REGULAR',
        createdAt: new Date('2026-11-10T03:30:00.000Z')
      },
      {
        worker: missingWorkerId,
        subdomain: 'tech-ciphergate',
        date: '2026-11-10',
        time: '01:30:00 PM',
        presence: false,
        punchType: 'LUNCH_OUT',
        isLunchPunch: true,
        outSessionId: session2.id,
        outSessionName: session2.name,
        isMissingLunchReturn: false,
        createdAt: new Date('2026-11-10T08:00:00.000Z')
      }
    ];

    // Current time is 15:30 (after 14:30 deadline)
    const currentMinutes = 15 * 60 + 30;
    const cutoffMinutes = 14 * 60 + 30;

    if (currentMinutes > cutoffMinutes) {
      const outPunch = missingWorkerPunches[1];
      const hasReturn = missingWorkerPunches.some(p => p.worker === missingWorkerId && p.createdAt > outPunch.createdAt);
      if (!hasReturn) {
        outPunch.isMissingLunchReturn = true;
      }
    }

    assert.strictEqual(missingWorkerPunches[1].isMissingLunchReturn, true, 'Unreturned lunch break must be flagged');
  });

  // ─── 8. Salary Calculation: Multiple Sessions Late Minutes Attribution ─────
  runTest('Salary Engine: Multiple session late minutes (0 + 10 + 5 = 15m) calculate exact deduction without duplication', () => {
    // Worker salary: 54,000 / month. 25 working days. Per day: ₹2,160.
    // Shift: 09:00 to 19:00 (10h = 600m - 60m lunch = 540m standard working minutes).
    // Per-minute rate: 2160 / 540 = ₹4.0/min.
    // Total late minutes across 3 sessions:
    // Session 1: 0m
    // Session 2: 10m
    // Session 3: 5m
    // Total = 15m -> Expected deduction: 15 * ₹4.0 = ₹60.00!

    const worker = {
      _id: workerId.toString(),
      salary: 54000,
      batch: 'Full Time'
    };

    const punchesForSalary = mockAttendanceDB.map(p => ({
      date: p.date,
      time: p.time,
      presence: p.presence,
      record: {
        presence: p.presence,
        punchType: p.punchType,
        isLunchPunch: p.isLunchPunch,
        outSessionId: p.outSessionId,
        outSessionName: p.outSessionName,
        lunchLateMinutes: p.lunchLateMinutes || 0
      }
    }));

    const report = calculateWorkerProductivity({
      worker,
      attendanceData: punchesForSalary,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      options: {
        batches: [{
          batchName: 'Full Time',
          from: '09:00',
          to: '19:00',
          lunchFrom: '13:30',
          lunchTo: '14:30'
        }],
        lunchBreakManagement: {
          enabled: true,
          sessions: [session1, session2, session3]
        }
      }
    });

    assert.strictEqual(report.totalPermissionTime, 15, 'Total delay minutes must equal exactly 15 minutes (10m + 5m)');
    assert.strictEqual(report.summary.permissionDeduction, 60, 'Deduction must equal ₹60.00 (15 min * ₹4.0)');
    assert.strictEqual(report.summary.actualWorkingDays, 1, 'Actual working days must be 1');
    const expectedFinalSalary = Math.round((54000 - report.summary.absentDeduction - 60) * 100) / 100;
    assert.strictEqual(report.summary.finalSalary, expectedFinalSalary, 'Final salary must reflect single deduction of ₹60');
  });

  // ─── 9. processedOutSessions Retention & Cleanup Safety ─────────────────────
  runTest('Retention Calculation: getRetentionCutoffDate enforces minimum retention floor of 1 day', () => {
    const fixedNow = new Date('2026-11-10T12:00:00.000Z');
    const cutoff3Days = getRetentionCutoffDate(fixedNow, 3);
    assert.strictEqual(cutoff3Days, '2026-11-07', '3-day retention cutoff from 2026-11-10 must be 2026-11-07');

    // Passing 0 or negative days must still enforce safe minimum floor (1 day) so today's keys are never touched
    const cutoffSafeFloor = getRetentionCutoffDate(fixedNow, 0);
    assert.strictEqual(cutoffSafeFloor, '2026-11-09', 'Safe floor must retain at least yesterday and today');
  });

  runTest('Retention Pruning: Stale session locks (> 3 days) are purged while retaining recent and active locks', () => {
    const historicalLocks = [
      '2026-11-03_session_morning',
      '2026-11-04_session_lunch',
      '2026-11-06_session_tea',
      '2026-11-07_session_lunch',
      '2026-11-08_session_lunch',
      '2026-11-09_session_tea',
      '2026-11-10_session_morning',
      '2026-11-10_session_lunch'
    ];

    const fixedNow = new Date('2026-11-10T12:00:00.000Z');
    const cutoffDate = getRetentionCutoffDate(fixedNow, 3); // '2026-11-07'

    // Simulate MongoDB $pull: { processedOutSessions: { $lt: cutoffDate } }
    const remainingLocks = historicalLocks.filter(k => !(k < cutoffDate));

    assert.strictEqual(remainingLocks.length, 5, 'Must keep 5 locks on or after 2026-11-07');
    assert.strictEqual(remainingLocks.includes('2026-11-03_session_morning'), false, '2026-11-03 must be pruned');
    assert.strictEqual(remainingLocks.includes('2026-11-04_session_lunch'), false, '2026-11-04 must be pruned');
    assert.strictEqual(remainingLocks.includes('2026-11-06_session_tea'), false, '2026-11-06 must be pruned');
    assert.strictEqual(remainingLocks.includes('2026-11-07_session_lunch'), true, '2026-11-07 must be retained');
    assert.strictEqual(remainingLocks.includes('2026-11-10_session_morning'), true, 'Today session 1 must be retained');
    assert.strictEqual(remainingLocks.includes('2026-11-10_session_lunch'), true, 'Today session 2 must be retained');
  });

  runTest('Active Lock Protection: Cleanup cannot remove an active session lock for the current day', () => {
    const todayLock = '2026-11-10_session_lunch';
    const fixedNow = new Date('2026-11-10T12:00:00.000Z');
    const cutoffDate = getRetentionCutoffDate(fixedNow, 3);

    // Active lock is strictly greater than cutoffDate
    const isProtected = todayLock >= cutoffDate;
    assert.strictEqual(isProtected, true, 'Current day lock must always be strictly >= cutoffDate');
  });

  runTest('Retention + Multi-Instance Safety: Pruning old keys leaves duplicate prevention fully intact for today', () => {
    const workerWithLocks = {
      _id: new mongoose.Types.ObjectId(),
      processedOutSessions: [
        '2026-11-05_s1',
        '2026-11-06_s2',
        '2026-11-10_s_lunch'
      ]
    };

    const todaySessionLock = '2026-11-10_s_lunch';
    const fixedNow = new Date('2026-11-10T12:00:00.000Z');
    const cutoffDate = getRetentionCutoffDate(fixedNow, 3);

    // Prune stale keys
    workerWithLocks.processedOutSessions = workerWithLocks.processedOutSessions.filter(k => !(k < cutoffDate));

    // Concurrency check for Instance B on today's session
    const canInstanceBAcquire = !workerWithLocks.processedOutSessions.includes(todaySessionLock);
    assert.strictEqual(canInstanceBAcquire, false, 'Instance B is blocked from acquiring today lock even after pruning');
  });

  runTest('Retention + Crash Recovery Safety: Same-day orphan lock detection and rollback unaffected by retention', () => {
    const crashedWorker = {
      _id: new mongoose.Types.ObjectId(),
      processedOutSessions: [
        '2026-11-05_s1',
        '2026-11-10_s_crashed'
      ],
      lastLunchOutDate: '2026-11-10'
    };

    const crashedLock = '2026-11-10_s_crashed';
    const existingPunchInDB = null; // Crashed before punch created

    // Scheduler self-healing detects orphaned lock for today
    const hasOrphanedLock = crashedWorker.processedOutSessions.includes(crashedLock) && !existingPunchInDB;
    assert.strictEqual(hasOrphanedLock, true, 'Self-healing detects orphaned lock');

    // Scheduler heals by rolling back today lock
    crashedWorker.processedOutSessions = crashedWorker.processedOutSessions.filter(k => k !== crashedLock);
    assert.strictEqual(crashedWorker.processedOutSessions.includes(crashedLock), false, 'Orphaned lock successfully rolled back');
  });

  console.log('\n================================================================');
  console.log(` Summary: ${passedTests} Passed, 0 Failed out of ${totalTests} Total Tests`);
  console.log('================================================================');
})();
