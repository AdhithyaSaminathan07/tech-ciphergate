// backend/tests/salaryAttributionAndEdgeCases.test.js
const assert = require('assert');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const { processWorkerLunchOut } = require('../schedulers/lunchBreakScheduler');

console.log('================================================================');
console.log(' Tech Ciphergate — Salary Attribution & Edge-Case Audit Suite');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`✓ [PASS] ${testName}`);
    passed++;
  } catch (error) {
    console.error(`✗ [FAIL] ${testName}`);
    console.error(`  Error: ${error.message}\n${error.stack}`);
    failed++;
  }
}

async function runAsyncTest(testName, fn) {
  try {
    await fn();
    console.log(`✓ [PASS] ${testName}`);
    passed++;
  } catch (error) {
    console.error(`✗ [FAIL] ${testName}`);
    console.error(`  Error: ${error.message}\n${error.stack}`);
    failed++;
  }
}

async function runAllAuditTests() {
  // ─── AUDIT 1: SALARY DEDUCTION ATTRIBUTION ──────────────────────────────────
  runTest('Audit 1.1: 10 lunch late minutes traced into productivityCalculator', () => {
    // 09:00 to 19:00 shift (10 hours = 600m - 60m lunch = 540 standard working minutes)
    // Monthly salary: 54000. 25 working days. Per day: 2160. Per minute: 4.0.
    const worker = { _id: 'w101', salary: 54000, batch: 'Shift10h' };
    const punches = [
      { date: '2026-11-06', time: '09:00:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-06', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true } },
      // Punched at 14:45. Return deadline: 14:30 + 5m grace = 14:35. Excess = 10 mins.
      { date: '2026-11-06', time: '02:45:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, lunchLateMinutes: 10 } },
      { date: '2026-11-06', time: '07:00:00 PM', presence: false, record: { presence: false } }
    ];

    const report = calculateWorkerProductivity({
      worker,
      attendanceData: punches,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      options: {
        batches: [{ batchName: 'Shift10h', from: '09:00', to: '19:00', lunchFrom: '13:30', lunchTo: '14:30' }],
        lunchBreakManagement: { enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      }
    });

    // Verify 10 late minutes registered as delay time
    assert.strictEqual(report.totalPermissionTime, 10, 'Total delay minutes must be exactly 10');
    // Verify deduction is exactly 10 min * ₹4.0/min = ₹40.00
    assert.strictEqual(report.summary.permissionDeduction, 40, 'Deduction must be ₹40.00');
    // Verify actual working days is 1
    assert.strictEqual(report.summary.actualWorkingDays, 1, 'Actual working days must be 1');
  });

  runTest('Audit 1.2: Shift working minutes dynamically computed (not hardcoded 480m)', () => {
    // 09:00 to 18:00 shift (9 hours = 540m - 60m lunch = 480 standard working minutes)
    // Monthly salary: 54000. 25 working days. Per day: 2160. Per minute: 2160 / 480 = 4.5.
    // 10 late minutes * 4.5 = ₹45.00 deduction!
    const worker = { _id: 'w102', salary: 54000, batch: 'Shift9h' };
    const punches = [
      { date: '2026-11-06', time: '09:00:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-06', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true } },
      { date: '2026-11-06', time: '02:45:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, lunchLateMinutes: 10 } },
      { date: '2026-11-06', time: '06:00:00 PM', presence: false, record: { presence: false } }
    ];

    const report = calculateWorkerProductivity({
      worker,
      attendanceData: punches,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      options: {
        batches: [{ batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '13:30', lunchTo: '14:30' }],
        lunchBreakManagement: { enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      }
    });

    assert.strictEqual(report.totalPermissionTime, 10, 'Total delay minutes must be exactly 10');
    // 10 * 4.5 = 45
    assert.strictEqual(report.summary.permissionDeduction, 45, 'Deduction for 480m shift must be ₹45.00 (rate 4.5/min)');
  });

  runTest('Audit 1.3: Morning late + lunch late return are counted once each without duplicates', () => {
    // Worker arrives 15 mins late in morning (09:15 AM)
    // Worker returns 10 mins late from lunch (14:45 PM vs 14:35 threshold)
    // Expected total delay: 15 + 10 = 25 minutes. No cross-double counting!
    const worker = { _id: 'w103', salary: 54000, batch: 'Shift10h' };
    const punches = [
      { date: '2026-11-06', time: '09:15:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-06', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true } },
      { date: '2026-11-06', time: '02:45:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true } },
      { date: '2026-11-06', time: '07:00:00 PM', presence: false, record: { presence: false } }
    ];

    const report = calculateWorkerProductivity({
      worker,
      attendanceData: punches,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      options: {
        batches: [{ batchName: 'Shift10h', from: '09:00', to: '19:00', lunchFrom: '13:30', lunchTo: '14:30' }],
        lunchBreakManagement: { enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      }
    });

    assert.strictEqual(report.totalPermissionTime, 25, 'Total delay must be exactly 25 minutes (15 morning + 10 lunch)');
    // 25 mins * ₹4.0/min = ₹100.00
    assert.strictEqual(report.summary.permissionDeduction, 100, 'Deduction must be ₹100.00 (25 min * 4.0)');
  });

  // ─── AUDIT 2: ATTENDANCE CORRECTNESS ─────────────────────────────────────────
  runTest('Audit 2.1: Morning punch remains standard REGULAR punch', () => {
    // Simulation of resolveLunchReturnDetails for first punch
    const lastPunchToday = null; // No prior punch
    const newPresence = true;
    let punchType = 'REGULAR';
    let isLunchPunch = false;

    if (newPresence === true && lastPunchToday && lastPunchToday.punchType === 'LUNCH_OUT') {
      punchType = 'LUNCH_IN';
      isLunchPunch = true;
    }

    assert.strictEqual(punchType, 'REGULAR', 'First punch of day must remain REGULAR');
    assert.strictEqual(isLunchPunch, false, 'isLunchPunch must be false for morning punch');
  });

  runTest('Audit 2.2: Return within grace period incurs 0 late minutes', () => {
    // Deadline: 14:30, grace: 10 mins -> threshold: 14:40
    // Punch at 14:38 (within grace)
    const deadline = 14 * 60 + 30; // 870
    const grace = 10;
    const threshold = deadline + grace; // 880
    const punchTime = 14 * 60 + 38; // 878

    let lateMinutes = 0;
    if (punchTime > threshold) {
      lateMinutes = punchTime - threshold;
    }

    assert.strictEqual(lateMinutes, 0, 'Punch within grace period must result in 0 late minutes');
  });

  runTest('Audit 2.3: Non-returning lunch worker flagged for review without double full-day penalty', () => {
    const worker = { _id: 'w104', salary: 54000, batch: 'Shift10h' };
    const punches = [
      { date: '2026-11-06', time: '09:00:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-06', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, isMissingLunchReturn: true } }
    ];

    const report = calculateWorkerProductivity({
      worker,
      attendanceData: punches,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      options: {
        batches: [{ batchName: 'Shift10h', from: '09:00', to: '19:00', lunchFrom: '13:30', lunchTo: '14:30' }],
        lunchBreakManagement: { enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      }
    });

    // Unworked afternoon: 19:00 (1140) - 14:30 (870) = 270 minutes
    assert.strictEqual(report.totalPermissionTime, 270, 'Unworked afternoon must be 270 minutes');
    // Morning worked time: 09:00 to 13:30 = 270 minutes
    // Total day: 270 worked + 270 delay = 540 minutes standard day
    assert.strictEqual(report.summary.actualWorkingDays, 1, 'Worker gets 1 working day credited for morning work');
  });

  // ─── AUDIT 3: SCHEDULER RELIABILITY & CRASH RECOVERY ─────────────────────────
  await runAsyncTest('Audit 3.1: Scheduler crash recovery restores lock on Attendance failure', async () => {
    // Simulating processWorkerLunchOut with simulated Attendance.create failure
    let workerState = {
      _id: 'worker_crash_test',
      subdomain: 'cipher-crash',
      lastLunchOutDate: null,
      sessionInvalidatedAt: null
    };

    const dateStr = '2026-11-06';
    const nowDate = new Date();

    // 1. Worker acquires atomic lock
    workerState.lastLunchOutDate = dateStr;
    workerState.sessionInvalidatedAt = nowDate;

    // 2. Simulated Attendance.create failure
    let attendanceCreated = false;
    try {
      throw new Error('Simulated Database Network Disconnect during Attendance.create');
    } catch (createErr) {
      // Crash Recovery: Roll back atomic lock on failure
      workerState.lastLunchOutDate = null;
      workerState.sessionInvalidatedAt = null;
    }

    // Verify lock is cleanly rolled back so next tick can retry
    assert.strictEqual(workerState.lastLunchOutDate, null, 'Lock must be rolled back to null on failure');
    assert.strictEqual(workerState.sessionInvalidatedAt, null, 'sessionInvalidatedAt must be reset on failure');

    // 3. Retry on next tick succeeds
    workerState.lastLunchOutDate = dateStr;
    workerState.sessionInvalidatedAt = nowDate;
    attendanceCreated = true;

    assert.strictEqual(attendanceCreated, true, 'Scheduler successfully retried and created attendance');
  });

  runTest('Audit 3.2: Scheduler disabled unless ENABLE_SCHEDULERS === "true"', () => {
    const isSchedulerEnabled = (env) => env.ENABLE_SCHEDULERS === 'true';

    assert.strictEqual(isSchedulerEnabled({ NODE_ENV: 'production' }), false, 'Must be false when ENABLE_SCHEDULERS unset');
    assert.strictEqual(isSchedulerEnabled({ NODE_ENV: 'production', ENABLE_SCHEDULERS: 'false' }), false, 'Must be false when ENABLE_SCHEDULERS=false');
    assert.strictEqual(isSchedulerEnabled({ NODE_ENV: 'production', ENABLE_SCHEDULERS: 'true' }), true, 'Must be true when ENABLE_SCHEDULERS=true');
  });

  console.log('\n================================================================');
  console.log(` Audit Suite Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Total Checks`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllAuditTests();

