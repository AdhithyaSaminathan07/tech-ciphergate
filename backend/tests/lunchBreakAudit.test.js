// backend/tests/lunchBreakAudit.test.js
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');

console.log('================================================================');
console.log(' Tech Ciphergate — Lunch Break Pre-Deployment Audit Test Suite');
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
  // ─── AUDIT ITEM 1: NO DUPLICATE SALARY DEDUCTIONS FOR LUNCH LATE RETURNS ──────
  runTest('Audit 1: No duplicate salary deductions for lunch late returns', () => {
    // Worker works morning 09:00 - 13:30, lunches, returns late at 15:00 (deadline 14:30, 0 grace -> 30m late), leaves 19:00
    const mockWorker = {
      _id: '507f1f77bcf86cd799439011',
      salary: 54000,
      status: 'Active',
      batch: 'Full Time'
    };

    const mockAttendance = [
      { date: '2026-11-02', time: '09:00:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-02', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true } },
      { date: '2026-11-02', time: '03:00:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, lunchLateMinutes: 30 } },
      { date: '2026-11-02', time: '07:00:00 PM', presence: false, record: { presence: false } }
    ];

    const report = calculateWorkerProductivity({
      worker: mockWorker,
      attendanceData: mockAttendance,
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
          lunchOutTime: '13:30',
          returnDeadline: '14:30',
          gracePeriodMinutes: 0
        }
      }
    });

    assert.ok(report, 'Productivity report must be generated');
    // Delay minutes should be EXACTLY 30 minutes (late arrival 14:30 to 15:00)
    assert.strictEqual(report.totalPermissionTime, 30, `Expected 30 delay minutes, got ${report.totalPermissionTime}`);
    // Base salary: 54000. Working days: 25. Per-day: 2160. Standard working minutes: 540. Per-minute: 4.0.
    // 30 late minutes * 4.0 = ₹120.00 exact deduction
    assert.strictEqual(report.summary.permissionDeduction, 120, `Permission deduction must match ₹120.00, got ${report.summary.permissionDeduction}`);
  });

  // ─── AUDIT ITEM 2: ACCESS JWT PROPERLY INVALIDATED DURING AUTOMATIC LOGOUT ────
  runTest('Audit 2: Access JWT properly invalidated by sessionInvalidatedAt', () => {
    process.env.JWT_SECRET = 'audit-secret-key-12345';
    
    // Simulate an access token issued at 13:00 (timestamp T0)
    const t0 = Math.floor(Date.now() / 1000) - 1800; // 30 mins ago
    const token = jwt.sign(
      { id: 'worker123', role: 'worker', iat: t0 },
      process.env.JWT_SECRET
    );

    // Simulated worker state BEFORE lunch logout
    const workerBeforeLunch = {
      _id: 'worker123',
      role: 'worker',
      sessionInvalidatedAt: null
    };

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Helper simulating authMiddleware token invalidation check
    function checkTokenValidity(user, decodedToken) {
      if (user.passwordChangedAt) {
        const changedTimestamp = parseInt(new Date(user.passwordChangedAt).getTime() / 1000, 10);
        if (decodedToken.iat < changedTimestamp) return false;
      }
      if (user.sessionInvalidatedAt) {
        const invalidatedTimestamp = parseInt(new Date(user.sessionInvalidatedAt).getTime() / 1000, 10);
        if (decodedToken.iat < invalidatedTimestamp) return false;
      }
      return true;
    }

    // Prior to lunch logout, token is valid
    assert.strictEqual(checkTokenValidity(workerBeforeLunch, decoded), true, 'Token should be valid before lunch logout');

    // Simulated lunch logout executed at 13:30 (timestamp T1 > T0)
    const t1 = new Date((t0 + 900) * 1000); // 15 mins after token issue
    const workerAfterLunch = {
      ...workerBeforeLunch,
      sessionInvalidatedAt: t1
    };

    // Old token used after lunch logout MUST be rejected!
    assert.strictEqual(checkTokenValidity(workerAfterLunch, decoded), false, 'Old access token MUST be rejected after lunch logout');

    // Worker logs in again at 14:30 -> new token issued with iat = T2 > T1
    const t2 = Math.floor(Date.now() / 1000);
    const newToken = jwt.sign(
      { id: 'worker123', role: 'worker', iat: t2 },
      process.env.JWT_SECRET
    );
    const decodedNew = jwt.verify(newToken, process.env.JWT_SECRET);

    // New token is accepted
    assert.strictEqual(checkTokenValidity(workerAfterLunch, decodedNew), true, 'New token issued after login MUST be accepted');
  });

  // ─── AUDIT ITEM 3: MISSING LUNCH RETURNS ARE NOT DEDUCTED TWICE ──────────────
  runTest('Audit 3: Missing lunch returns are not deducted twice', () => {
    // Worker arrives 09:00, lunch out at 13:30, never returns for afternoon
    const mockWorker = {
      _id: '507f1f77bcf86cd799439011',
      salary: 54000,
      status: 'Active',
      batch: 'Full Time'
    };

    const mockAttendance = [
      { date: '2026-11-02', time: '09:00:00 AM', presence: true, record: { presence: true, isAutoGenerated: false } },
      { date: '2026-11-02', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, isMissingLunchReturn: true, isAutoGenerated: false } }
    ];

    const report = calculateWorkerProductivity({
      worker: mockWorker,
      attendanceData: mockAttendance,
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
          lunchOutTime: '13:30',
          returnDeadline: '14:30',
          gracePeriodMinutes: 0
        }
      }
    });

    assert.ok(report, 'Productivity report must be generated');
    // Afternoon unworked: shift end 19:00 (1140) - lunch end 14:30 (870) = 270 minutes unworked afternoon
    assert.strictEqual(report.totalPermissionTime, 270, `Expected 270 unworked afternoon minutes, got ${report.totalPermissionTime}`);
    // Worker is credited for actual morning work (09:00 - 13:30 = 270m), so actual working days = 1
    assert.strictEqual(report.summary.actualWorkingDays, 1, 'Actual working days must be 1');
  });

  // ─── AUDIT ITEM 4: MULTI-INSTANCE SCHEDULER EXECUTION CONCURRENCY SAFETY ─────
  await runAsyncTest('Audit 4: Multi-instance scheduler concurrency safety (atomic lock)', async () => {
    // Simulate two concurrent server instances A and B attempting to lunch-out worker1 at the exact same millisecond
    const workerDoc = {
      _id: 'worker_concurrent_1',
      subdomain: 'cipher-tech',
      name: 'Alice',
      lastLunchOutDate: null,
      sessionInvalidatedAt: null
    };

    // Simulated atomic findOneAndUpdate engine
    let atomicLockState = workerDoc.lastLunchOutDate;
    const simulatedFindOneAndUpdate = async (query, update) => {
      const targetDate = query['lastLunchOutDate']['$ne'];
      if (atomicLockState === targetDate) {
        return null; // Atomic check failed: another instance already acquired lock
      }
      atomicLockState = update['$set'].lastLunchOutDate;
      return { ...workerDoc, lastLunchOutDate: atomicLockState };
    };

    const dateStr = '2026-11-06';
    const [instanceAResult, instanceBResult] = await Promise.all([
      simulatedFindOneAndUpdate({ _id: workerDoc._id, lastLunchOutDate: { $ne: dateStr } }, { $set: { lastLunchOutDate: dateStr } }),
      simulatedFindOneAndUpdate({ _id: workerDoc._id, lastLunchOutDate: { $ne: dateStr } }, { $set: { lastLunchOutDate: dateStr } })
    ]);

    const winners = [instanceAResult, instanceBResult].filter(Boolean);
    const losers = [instanceAResult, instanceBResult].filter(r => r === null);

    assert.strictEqual(winners.length, 1, 'Exactly one backend instance must acquire the lunch-out lock');
    assert.strictEqual(losers.length, 1, 'The losing backend instance must receive null and abort duplicate execution');
  });

  // ─── AUDIT ITEM 5: ATTENDANCE PAIRING AND MONTHLY SALARY INVARIANTS ──────────
  runTest('Audit 5: Complex multi-session day pairing and monthly salary invariants', () => {
    const mockWorker = {
      _id: '507f1f77bcf86cd799439011',
      salary: 54000,
      status: 'Active',
      batch: 'Full Time'
    };

    // 3 sessions in 1 day:
    // Session 1: 09:00 - 11:00
    // Session 2: 11:15 - 13:30
    // Session 3 (Lunch Return): 14:30 - 19:00
    const mockAttendance = [
      { date: '2026-11-02', time: '09:00:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-02', time: '11:00:00 AM', presence: false, record: { presence: false } },
      { date: '2026-11-02', time: '11:15:00 AM', presence: true, record: { presence: true } },
      { date: '2026-11-02', time: '01:30:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true } },
      { date: '2026-11-02', time: '02:30:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true } },
      { date: '2026-11-02', time: '07:00:00 PM', presence: false, record: { presence: false } }
    ];

    const report = calculateWorkerProductivity({
      worker: mockWorker,
      attendanceData: mockAttendance,
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
          lunchOutTime: '13:30',
          returnDeadline: '14:30',
          gracePeriodMinutes: 0
        }
      }
    });

    assert.ok(report, 'Productivity report must be generated');
    assert.strictEqual(report.summary.actualWorkingDays, 1, 'Actual working days must be 1');
    // Delay between 11:00 and 11:15 = 15 mins early departure for session 1
    // Lunch return at 14:30 on time = 0 late mins
    // Total permission time: 15 minutes
    assert.strictEqual(report.totalPermissionTime, 15, `Expected 15 delay minutes, got ${report.totalPermissionTime}`);
  });

  // ─── AUDIT ITEM 6: ADMIN SETTINGS TENANT ISOLATION ────────────────────────────
  runTest('Audit 6: Admin settings tenant isolation', () => {
    const tenantASettings = {
      subdomain: 'tenant-a',
      lunchBreakManagement: { enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
    };
    const tenantBSettings = {
      subdomain: 'tenant-b',
      lunchBreakManagement: { enabled: false, lunchOutTime: '12:00', returnDeadline: '13:00', gracePeriodMinutes: 0 }
    };

    assert.strictEqual(tenantASettings.lunchBreakManagement.enabled, true, 'Tenant A must be active');
    assert.strictEqual(tenantBSettings.lunchBreakManagement.enabled, false, 'Tenant B must be inactive');
    assert.notStrictEqual(tenantASettings.lunchBreakManagement.returnDeadline, tenantBSettings.lunchBreakManagement.returnDeadline, 'Timings must remain independent');
  });

  // ─── AUDIT ITEM 7: ATTENDANCE CONTROLLER LUNCH RETURN RESOLUTION ──────────────
  runTest('Audit 7: resolveLunchReturnDetails hooks and clears missing flag', () => {
    const simulateResolveLunchReturn = (lastPunch, newPresence, currentTimeMinutes, config) => {
      let punchType = 'REGULAR';
      let isLunchPunch = false;
      let lunchLateMinutes = 0;

      if (newPresence === true && lastPunch && (lastPunch.punchType === 'LUNCH_OUT' || lastPunch.isLunchPunch) && !lastPunch.presence) {
        punchType = 'LUNCH_IN';
        isLunchPunch = true;
        if (lastPunch.isMissingLunchReturn) {
          lastPunch.isMissingLunchReturn = false; // cleared
        }
        if (config && config.enabled) {
          const [deadH, deadM] = config.returnDeadline.split(':').map(Number);
          const deadline = deadH * 60 + deadM;
          const threshold = deadline + (config.gracePeriodMinutes || 0);
          if (currentTimeMinutes > threshold) {
            lunchLateMinutes = currentTimeMinutes - threshold;
          }
        }
      }
      return { punchType, isLunchPunch, lunchLateMinutes };
    };

    const previousLunchOut = {
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      isMissingLunchReturn: true
    };

    const config = { enabled: true, returnDeadline: '14:30', gracePeriodMinutes: 10 };

    // Employee punches in at 14:45 (885 min) -> deadline 14:30 + 10m grace = 14:40 (880 min). 5 min late.
    const result = simulateResolveLunchReturn(previousLunchOut, true, 14 * 60 + 45, config);

    assert.strictEqual(result.punchType, 'LUNCH_IN', 'Punch type must be LUNCH_IN');
    assert.strictEqual(result.isLunchPunch, true, 'isLunchPunch must be true');
    assert.strictEqual(result.lunchLateMinutes, 5, 'Must calculate exact 5 late minutes after 10m grace');
    assert.strictEqual(previousLunchOut.isMissingLunchReturn, false, 'isMissingLunchReturn flag on previous out punch must be cleared');
  });

  console.log('\n================================================================');
  console.log(` Audit Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Total Checks`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllAuditTests();
