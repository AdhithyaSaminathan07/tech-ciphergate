/**
 * Tech Ciphergate — Automatic OUT Late-Return Salary Integration Test Suite
 *
 * Verifies that:
 * 1. Late minutes = Actual Break IN time − (Configured Return Deadline + Grace Period).
 * 2. If the result is zero or negative, late minutes = 0.
 * 3. Boundary cases: exactly at grace expiry (0 mins), 1 minute late (1 min), early return (0 mins).
 * 4. User example: Return deadline 1:30 PM, Grace 5 mins (ends 1:35 PM), Break IN 1:45 PM -> 10 mins late.
 * 5. Multiple independent sessions evaluated independently without double-deduction.
 * 6. Missing return handling: no fabricated IN records, consistent with existing salary policy.
 * 7. Tenant isolation: each tenant's session parameters apply to their employees.
 * 8. Reuses existing calculateWorkerProductivity engine.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');

console.log('======================================================================');
console.log(' Tech Ciphergate — Automatic OUT Late-Return Salary Integration Tests ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✓ [PASS] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`✗ [FAIL] Test ${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

// Helper: base mock worker with salary
const createMockWorker = (overrides = {}) => ({
  _id: 'w_test_001',
  name: 'Test Employee',
  username: 'testemp',
  subdomain: 'ciphergate',
  salary: 26000, // Rs 26,000 / month
  department: 'dept_eng',
  status: 'Active',
  joiningDate: '2026-01-01',
  ...overrides
});

const defaultBatch = {
  batchName: 'Full Time',
  workFrom: '09:00',
  workTo: '18:00',
  lunchFrom: '13:00',
  lunchTo: '13:30',
  isDefault: true
};

const dateStr = '2026-11-14';

// Helper to extract late arrival minutes from detailedBreakdown
const getLateArrivalMinutes = (result) => {
  const details = result.dailyBreakdown?.[0]?.detailedBreakdown?.permissionDetails || [];
  const lateItem = details.find(d => d.type === 'Late Arrival');
  return lateItem ? lateItem.totalMinutes : 0;
};

// ─── Test 1: User Example — 1:30 PM deadline + 5m grace -> 1:45 PM IN = 10 mins late ────────
runTest('User example: Return deadline 13:30, grace 5m (ends 13:35), IN 13:45 -> exactly 10 late minutes', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'lunch_session_1',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'lunch_session_1' },
    // 1:45 PM = 13:45. Grace ends at 13:35. 13:45 - 13:35 = 10 mins late.
    { date: dateStr, time: '01:45:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'lunch_session_1', lunchLateMinutes: 10 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR', isLunchPunch: false }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const lateMins = getLateArrivalMinutes(result);
  assert.strictEqual(lateMins, 10, `Expected exactly 10 late minutes, got ${lateMins}`);
  assert.strictEqual(result.summary.permissionDeduction > 0, true, 'Permission deduction should be > 0 for 10 late mins');
});

// ─── Test 2: Boundary Case — Exactly at grace expiry (13:35) -> 0 late minutes ──────────────
runTest('Boundary case: Return exactly at grace expiry (13:35) -> 0 late minutes, Rs 0 deduction', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'lunch_session_1',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'lunch_session_1' },
    // 1:35 PM = 13:35. Threshold is 13:35. Exactly on boundary -> 0 late mins.
    { date: dateStr, time: '01:35:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'lunch_session_1', lunchLateMinutes: 0 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR', isLunchPunch: false }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const lateMins = getLateArrivalMinutes(result);
  assert.strictEqual(lateMins, 0, `Expected exactly 0 late minutes, got ${lateMins}`);
});

// ─── Test 3: Boundary Case — Exactly 1 minute late (13:36) -> 1 late minute ────────────────
runTest('Boundary case: Exactly 1 minute late (13:36 vs 13:35 threshold) -> exactly 1 late minute', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'lunch_session_1',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'lunch_session_1' },
    // 1:36 PM = 13:36. 13:36 - 13:35 = 1 min late.
    { date: dateStr, time: '01:36:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'lunch_session_1', lunchLateMinutes: 1 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR', isLunchPunch: false }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const lateMins = getLateArrivalMinutes(result);
  assert.strictEqual(lateMins, 1, `Expected exactly 1 late minute, got ${lateMins}`);
});

// ─── Test 4: Early Return — Returned before deadline (13:20) -> 0 late minutes ──────────────
runTest('Early return: Break IN before deadline (13:20 vs 13:30 deadline) -> 0 late minutes', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'lunch_session_1',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'lunch_session_1' },
    { date: dateStr, time: '01:20:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'lunch_session_1', lunchLateMinutes: 0 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR', isLunchPunch: false }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const lateMins = getLateArrivalMinutes(result);
  assert.strictEqual(lateMins, 0, 'No late minutes for early return');
});

// ─── Test 5: Multiple Independent Sessions on Same Day ──────────────────────────────────────
runTest('Multiple sessions: Morning (on-time), Lunch (10m late), Tea (3m late) -> exactly 13 total late mins', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'sess_morning',
        name: 'Morning Pause',
        enabled: true,
        outTime: '10:30',
        returnDeadline: '10:45',
        gracePeriodMinutes: 5
      },
      {
        id: 'sess_lunch',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      },
      {
        id: 'sess_tea',
        name: 'Tea Break',
        enabled: true,
        outTime: '16:00',
        returnDeadline: '16:15',
        gracePeriodMinutes: 2
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    // Morning: OUT 10:30, returned 10:48 (within 10:45+5m=10:50 threshold) -> 0 late
    { date: dateStr, time: '10:30:00 AM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'sess_morning' },
    { date: dateStr, time: '10:48:00 AM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'sess_morning', lunchLateMinutes: 0 },
    // Lunch: OUT 13:00, returned 13:45 (threshold 13:35) -> 10 mins late
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'sess_lunch' },
    { date: dateStr, time: '01:45:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'sess_lunch', lunchLateMinutes: 10 },
    // Tea: OUT 16:00, returned 16:20 (threshold 16:15+2m=16:17) -> 3 mins late
    { date: dateStr, time: '04:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'sess_tea' },
    { date: dateStr, time: '04:20:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'sess_tea', lunchLateMinutes: 3 },
    // End of day
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR', isLunchPunch: false }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const details = result.dailyBreakdown?.[0]?.detailedBreakdown?.permissionDetails || [];
  const lateItems = details.filter(d => d.type === 'Late Arrival');
  const totalLateMinutes = lateItems.reduce((acc, d) => acc + d.totalMinutes, 0);

  assert.strictEqual(totalLateMinutes, 13, `Expected exactly 13 total late minutes (10m + 3m), got ${totalLateMinutes}`);
});

// ─── Test 6: Missing Return Handling — Zero Fabricated IN Punches ───────────────────────────
runTest('Missing return: Break OUT at 13:00 with no return -> zero fabricated IN, unworked afternoon deducted', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'lunch_session_1',
        name: 'Lunch Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', isLunchPunch: false },
    // Employee was Automatic OUT at 13:00 and never returned
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 'lunch_session_1', isMissingLunchReturn: true }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  // Zero fabricated IN records: only 1 report row for the morning work interval
  assert.strictEqual(result.report.length, 1, 'Must have exactly 1 working interval; zero fabricated IN records');
  assert.strictEqual(result.report[0].outTime, '01:00:00 PM', 'OUT time must be the actual break OUT');
  // Unworked afternoon is accounted for in unworked time
  const details = result.dailyBreakdown?.[0]?.detailedBreakdown?.permissionDetails || [];
  const unworkedAfternoon = details.find(d => d.type === 'Unworked Afternoon');
  assert(unworkedAfternoon && unworkedAfternoon.totalMinutes > 0, 'Unworked afternoon must be deducted when break return is missing');
});

// ─── Test 7: Tenant Isolation — Independent Session Timings per Tenant ─────────────────────
runTest('Tenant isolation: Tenant A and Tenant B workers evaluated with their own tenant settings', () => {
  const workerA = createMockWorker({ _id: 'w_A', subdomain: 'tenant_a' });
  const workerB = createMockWorker({ _id: 'w_B', subdomain: 'tenant_b' });

  // Tenant A: 13:30 deadline, 5m grace (threshold 13:35)
  const settingsA = {
    enabled: true,
    sessions: [{ id: 's1', name: 'Lunch', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 5 }]
  };

  // Tenant B: 13:30 deadline, 20m grace (threshold 13:50)
  const settingsB = {
    enabled: true,
    sessions: [{ id: 's1', name: 'Lunch', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 20 }]
  };

  // Both punch IN at 13:40 (1:40 PM):
  // Tenant A worker: 13:40 - 13:35 = 5 mins late.
  // Tenant B worker: 13:40 <= 13:50 = 0 mins late.
  const punchA = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 's1' },
    { date: dateStr, time: '01:40:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 's1', lunchLateMinutes: 5 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR' }
  ];

  const punchB = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 's1' },
    { date: dateStr, time: '01:40:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 's1', lunchLateMinutes: 0 },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR' }
  ];

  const resA = calculateWorkerProductivity({
    worker: workerA,
    attendanceData: punchA,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement: settingsA,
      deductSalary: true
    }
  });

  const resB = calculateWorkerProductivity({
    worker: workerB,
    attendanceData: punchB,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement: settingsB,
      deductSalary: true
    }
  });

  const lateA = getLateArrivalMinutes(resA);
  const lateB = getLateArrivalMinutes(resB);

  assert.strictEqual(lateA, 5, 'Tenant A worker should have exactly 5 mins late');
  assert.strictEqual(lateB, 0, 'Tenant B worker within 20m grace should have 0 late mins');
});

// ─── Test 8: Dynamic Fallback Calculation When lunchLateMinutes Is Undefined ───────────────
runTest('Dynamic fallback: If lunchLateMinutes is omitted from punch, calculates from session config', () => {
  const worker = createMockWorker();
  const lunchBreakManagement = {
    enabled: true,
    sessions: [
      {
        id: 'sess_dyn',
        name: 'Break',
        enabled: true,
        outTime: '13:00',
        returnDeadline: '13:30',
        gracePeriodMinutes: 5
      }
    ]
  };

  const attendanceData = [
    { date: dateStr, time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
    { date: dateStr, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'sess_dyn' },
    // 13:45 = 1:45 PM. lunchLateMinutes is intentionally undefined. Dynamic fallback calculates 13:45 - 13:35 = 10 mins.
    { date: dateStr, time: '01:45:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'sess_dyn' },
    { date: dateStr, time: '06:00:00 PM', presence: false, punchType: 'REGULAR' }
  ];

  const result = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate: dateStr,
    toDate: dateStr,
    options: {
      batches: [defaultBatch],
      lunchBreakManagement,
      deductSalary: true
    }
  });

  const lateMins = getLateArrivalMinutes(result);
  assert.strictEqual(lateMins, 10, `Expected 10 mins dynamic fallback calculation, got ${lateMins}`);
});

console.log(`\n======================================================================`);
console.log(` Summary: ${passedTests} Passed, ${totalTests - passedTests} Failed out of ${totalTests} Total Tests`);
console.log(`======================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
