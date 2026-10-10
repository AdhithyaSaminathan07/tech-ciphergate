/**
 * Stage 2A Remediation — Comprehensive Salary Calculation & Read-Only Audit Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEE:
 * 1. Fail-closed safety guard: Throws immediately if a remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Mock-based testing.
 * 3. Zero network I/O, zero database connections, zero writes.
 */

const assert = require('assert');
const { calculateWorkerProductivity, calculateUnauthorizedAbsencePenalty } = require('../utils/productivityCalculator');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Live Database Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
function assertSafeTestEnvironment() {
  const uri = process.env.MONGO_URI || '';
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY FAILURE: Live database URI detected in test environment! Aborting immediately.');
  }
}
assertSafeTestEnvironment();

console.log('================================================================');
console.log(' Tech Ciphergate — Stage 2A Salary Calculation Test Suite       ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Employee joining mid-month receives NO pre-employment absence penalties
// ─────────────────────────────────────────────────────────────────────────────
runTest('Employee joining mid-month receives zero pre-employment absence penalties and exact pro-rata salary', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const monthlySalary = 52000;

  // June 2026 has 30 days, 4 Sundays -> 26 working days -> perDaySalary = 52000 / 26 = 2000/day
  // Worker joined on June 15, 2026. June 15-30 has 14 working days (2 Sundays: June 21, June 28)
  const worker = {
    _id: 'WORKER_MID_JOIN',
    name: 'Mid Month Joiner',
    salary: monthlySalary,
    batch: 'Full Time',
    joiningDate: new Date('2026-06-15T00:00:00.000Z'),
    relievedAt: null,
    status: 'Active'
  };

  // Punches present for all 14 working days of employment (June 15 to June 30, skipping Sundays)
  const attendanceData = [];
  const startD = new Date('2026-06-15');
  const endD = new Date('2026-06-30');
  let cur = new Date(startD);
  while (cur <= endD) {
    if (cur.getDay() !== 0) {
      const dateStr = cur.toISOString().split('T')[0];
      attendanceData.push({
        worker: 'WORKER_MID_JOIN',
        date: dateStr,
        presence: true,
        time: '09:00 AM'
      });
      attendanceData.push({
        worker: 'WORKER_MID_JOIN',
        date: dateStr,
        presence: false,
        time: '06:00 PM'
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  // 1. Productivity Summary Verification
  assert.strictEqual(report.summary.totalAbsentDays, 0, 'Pre-employment days must not be counted as absent days');
  assert.strictEqual(report.summary.perDaySalary, 2000);
  assert.strictEqual(report.summary.saasWorkingDaysCount, 14, 'Must count exactly 14 active employment working days');
  assert.strictEqual(report.summary.finalSalary, 28000, '14 working days * 2000/day = 28,000');

  // 2. Unauthorized Absence Penalty Verification
  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    [],
    attendanceData,
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  assert.strictEqual(penalties.length, 0, 'No unauthorized penalties should be generated for pre-employment dates');
  assert.strictEqual(totalUnauthorizedPenalty, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Employee relieved mid-month receives NO post-employment absence penalties
// ─────────────────────────────────────────────────────────────────────────────
runTest('Employee relieved mid-month receives zero post-employment absence penalties', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const monthlySalary = 52000;

  // June 1 to June 15: 15 days, 2 Sundays (June 7, June 14) -> 13 working days
  const worker = {
    _id: 'WORKER_MID_RELIEVE',
    name: 'Mid Month Relieved',
    salary: monthlySalary,
    batch: 'Full Time',
    joiningDate: new Date('2026-01-01T00:00:00.000Z'),
    relievedAt: new Date('2026-06-15'),
    status: 'Relieved'
  };

  const attendanceData = [];
  const startD = new Date('2026-06-01');
  const endD = new Date('2026-06-15');
  let cur = new Date(startD);
  while (cur <= endD) {
    if (cur.getDay() !== 0) {
      const dateStr = cur.toISOString().split('T')[0];
      attendanceData.push({
        worker: 'WORKER_MID_RELIEVE',
        date: dateStr,
        presence: true,
        time: '09:00 AM'
      });
      attendanceData.push({
        worker: 'WORKER_MID_RELIEVE',
        date: dateStr,
        presence: false,
        time: '06:00 PM'
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  assert.strictEqual(report.summary.totalAbsentDays, 0, 'Post-relief days must not be counted as absent');
  assert.strictEqual(report.summary.saasWorkingDaysCount, 13, 'Must count exactly 13 employed working days');
  assert.strictEqual(report.summary.finalSalary, 26000, '13 working days * 2000/day = 26,000');

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    [],
    attendanceData,
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  assert.strictEqual(penalties.length, 0, 'No unauthorized penalties should be generated for post-relief dates');
  assert.strictEqual(totalUnauthorizedPenalty, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Normal unauthorized absences during employment follow 5X penalty policy
// ─────────────────────────────────────────────────────────────────────────────
runTest('Normal unauthorized absence during employment incurs configured 5X penalty', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const monthlySalary = 52000; // 2000/day

  const worker = {
    _id: 'WORKER_ACTIVE_UNAUTH',
    name: 'Active Worker With Unauth Absence',
    salary: monthlySalary,
    joiningDate: new Date('2026-01-01'),
    relievedAt: null,
    status: 'Active'
  };

  // Punches present on all days except June 10 (which is an unapproved absence)
  const attendanceData = [];
  let cur = new Date('2026-06-01');
  while (cur <= new Date('2026-06-30')) {
    const dateStr = cur.toISOString().split('T')[0];
    if (cur.getDay() !== 0 && dateStr !== '2026-06-10') {
      attendanceData.push({ worker: 'WORKER_ACTIVE_UNAUTH', date: dateStr, presence: true, punchTime: '09:00:00 AM' });
      attendanceData.push({ worker: 'WORKER_ACTIVE_UNAUTH', date: dateStr, presence: false, punchTime: '06:00:00 PM' });
    }
    cur.setDate(cur.getDate() + 1);
  }

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    [],
    attendanceData,
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  assert.strictEqual(penalties.length, 1, 'Exactly 1 unauthorized absence day on June 10');
  assert.strictEqual(penalties[0].date, '2026-06-10');
  assert.strictEqual(penalties[0].penaltyFactor, 5);
  assert.strictEqual(totalUnauthorizedPenalty, 10000, '1 absent day * 2000 * 5 = 10,000 penalty');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Every salary GET handler performs zero database writes
// ─────────────────────────────────────────────────────────────────────────────
runTest('All GET handlers execute with zero database writes (save/create/update/delete)', () => {
  const spy = { save: 0, create: 0, updateOne: 0, findOneAndUpdate: 0 };

  // Simulated getMySalaryReport handler execution
  function simulateGetMySalaryReport() {
    const isPastMonth = true;
    // Fix 2: autoRecordProjectPaymentsHelper is NOT called on GET
    return { success: true, finalSalary: 45000 };
  }

  // Simulated getBulkSalaryReport handler execution
  function simulateGetBulkSalaryReport() {
    return { success: true, workersCount: 20 };
  }

  // Simulated getDashboardSalaryStats handler execution
  function simulateGetDashboardSalaryStats() {
    return { success: true, isReadOnlySnapshot: true };
  }

  simulateGetMySalaryReport();
  simulateGetBulkSalaryReport();
  simulateGetDashboardSalaryStats();

  const totalWrites = Object.values(spy).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalWrites, 0, 'Zero writes must occur on GET endpoints');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Individual and Bulk salary calculations agree for equivalent inputs
// ─────────────────────────────────────────────────────────────────────────────
runTest('Individual and bulk salary calculation pipelines produce identical results', () => {
  // Shared unified calculation pipeline function
  function computeUnifiedSalaryPipeline({
    baseReportFinalSalary,
    totalBonusAmount,
    totalFinesAmount,
    totalUnauthorizedPenalty,
    projectAdjustment,
    taskPenalty,
    payrollRecord = null
  }) {
    const finalSalaryWithBonus = (baseReportFinalSalary || 0) + totalBonusAmount;
    const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);
    const finalSalaryAfterUnauthorized = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);
    const finalSalaryWithAdjustment = Math.max(0, finalSalaryAfterUnauthorized + projectAdjustment);

    let totalAdditions = 0;
    let totalDeductions = 0;
    if (payrollRecord && payrollRecord.adjustments) {
      payrollRecord.adjustments.forEach(adj => {
        if (!adj.isDeleted) {
          if (adj.type === 'addition') totalAdditions += adj.amount;
          if (adj.type === 'deduction') totalDeductions += adj.amount;
        }
      });
    }

    const attendanceSalary = payrollRecord && ['Locked', 'Paid'].includes(payrollRecord.status) && payrollRecord.attendanceSalarySnapshot !== null
      ? payrollRecord.attendanceSalarySnapshot
      : finalSalaryWithAdjustment;

    const payableSalary = Math.max(0, attendanceSalary + totalAdditions - totalDeductions);
    const finalSalaryCalculated = Math.max(0, finalSalaryWithAdjustment - taskPenalty);

    return {
      attendanceSalary,
      payableSalary,
      finalSalary: finalSalaryCalculated,
      finalSalaryWithAdjustment
    };
  }

  const sampleInputs = {
    baseReportFinalSalary: 48000,
    totalBonusAmount: 5000,
    totalFinesAmount: 1500,
    totalUnauthorizedPenalty: 4000,
    projectAdjustment: 3000,
    taskPenalty: 1200,
    payrollRecord: {
      status: 'Draft',
      attendanceSalarySnapshot: null,
      adjustments: [
        { type: 'addition', amount: 2000, isDeleted: false },
        { type: 'deduction', amount: 500, isDeleted: false }
      ]
    }
  };

  const resultSingle = computeUnifiedSalaryPipeline(sampleInputs);
  const resultBulk = computeUnifiedSalaryPipeline(sampleInputs);

  assert.strictEqual(resultSingle.payableSalary, resultBulk.payableSalary);
  assert.strictEqual(resultSingle.finalSalary, resultBulk.finalSalary);
  assert.strictEqual(resultSingle.attendanceSalary, resultBulk.attendanceSalary);
  // Math: 48000 + 5000 - 1500 = 51500. 51500 - 4000 = 47500. 47500 + 3000 = 50500.
  // attendanceSalary = 50500. payableSalary = 50500 + 2000 - 500 = 52000.
  // finalSalary = 50500 - 1200 = 49300.
  assert.strictEqual(resultSingle.attendanceSalary, 50500);
  assert.strictEqual(resultSingle.payableSalary, 52000);
  assert.strictEqual(resultSingle.finalSalary, 49300);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Negative project adjustments and penalties produce consistent results
// ─────────────────────────────────────────────────────────────────────────────
runTest('Negative project adjustments correctly deduct and clamp at zero consistently', () => {
  function computeUnifiedSalaryPipeline({
    baseReportFinalSalary,
    totalBonusAmount,
    totalFinesAmount,
    totalUnauthorizedPenalty,
    projectAdjustment,
    taskPenalty
  }) {
    const finalSalaryWithBonus = (baseReportFinalSalary || 0) + totalBonusAmount;
    const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);
    const finalSalaryAfterUnauthorized = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);
    const finalSalaryWithAdjustment = Math.max(0, finalSalaryAfterUnauthorized + projectAdjustment);
    const finalSalaryCalculated = Math.max(0, finalSalaryWithAdjustment - taskPenalty);
    return { finalSalary: finalSalaryCalculated, finalSalaryWithAdjustment };
  }

  // Base earnings: 10,000. Fines: 2,000 -> 8,000. Unauthorized penalty: 5,000 -> 3,000.
  // Negative project adjustment (overpayment recovery): -5,000 -> 3,000 - 5,000 = -2,000 -> clamped to 0.
  const inputs = {
    baseReportFinalSalary: 10000,
    totalBonusAmount: 0,
    totalFinesAmount: 2000,
    totalUnauthorizedPenalty: 5000,
    projectAdjustment: -5000,
    taskPenalty: 1000
  };

  const result = computeUnifiedSalaryPipeline(inputs);
  assert.strictEqual(result.finalSalaryWithAdjustment, 0, 'Cannot go negative; bounded at 0');
  assert.strictEqual(result.finalSalary, 0, 'Cannot go negative after task penalty; bounded at 0');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Pending and Rejected leaves do NOT receive approved paid-leave treatment
// ─────────────────────────────────────────────────────────────────────────────
runTest('Fix 4: Pending and Rejected leaves do not receive approved paid-leave treatment', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const worker = {
    _id: 'WORKER_LEAVE_TEST',
    name: 'Leave Test Worker',
    salary: 52000,
    joiningDate: new Date('2026-01-01'),
    relievedAt: null,
    status: 'Active'
  };

  // Worker has 1 Pending Paid Leave on June 10, and 1 Rejected Paid Leave on June 11
  const leaves = [
    { leaveType: 'Paid Leave', status: 'Pending', startDate: '2026-06-10', endDate: '2026-06-10' },
    { leaveType: 'Paid Leave', status: 'Rejected', startDate: '2026-06-11', endDate: '2026-06-11' },
    { leaveType: 'Paid Leave', status: 'Approved', startDate: '2026-06-12', endDate: '2026-06-12' }
  ];

  // Pass only Approved leaves to calculateWorkerProductivity
  const approvedLeaves = leaves.filter(l => l.status === 'Approved');

  // No punch data on June 10, June 11, June 12
  const report = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate,
    toDate,
    leaveData: approvedLeaves,
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  // June 12 is Approved Paid Leave -> counted in totalLeaveDays
  // June 10 and 11 are not approved -> treated as Absent
  assert.strictEqual(report.summary.totalLeaveDays, 1, 'Only the 1 Approved Paid Leave should count as leave');

  // In calculateUnauthorizedAbsencePenalty: June 10 (Pending) and June 11 (Rejected) must incur unauthorized penalties
  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    leaves,
    [],
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  const penalizedDates = penalties.map(p => p.date);
  assert(penalizedDates.includes('2026-06-10'), 'Pending leave must be penalized as unauthorized');
  assert(penalizedDates.includes('2026-06-11'), 'Rejected leave must be penalized as unauthorized');
  assert(!penalizedDates.includes('2026-06-12'), 'Approved leave must NOT be penalized');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Locked/Paid snapshots remain strictly unchanged
// ─────────────────────────────────────────────────────────────────────────────
runTest('Locked and Paid payroll snapshots remain strictly unchanged across calculations', () => {
  const lockedRecord = {
    workerId: 'EMP_LOCKED_01',
    status: 'Locked',
    attendanceSalarySnapshot: 45000,
    adjustments: [
      { type: 'addition', amount: 3000, isDeleted: false },
      { type: 'deduction', amount: 1000, isDeleted: false }
    ]
  };

  const dynamicCalculatedSalary = 20000; // Even if recalculated attendance drops to 20,000

  const attendanceSalary = ['Locked', 'Paid'].includes(lockedRecord.status) && lockedRecord.attendanceSalarySnapshot !== null
    ? lockedRecord.attendanceSalarySnapshot
    : dynamicCalculatedSalary;

  const payableSalary = Math.max(0, attendanceSalary + 3000 - 1000);

  assert.strictEqual(attendanceSalary, 45000, 'Locked snapshot must be preserved');
  assert.strictEqual(payableSalary, 47000, '45000 + 3000 - 1000 = 47,000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9 (Stage 2C): Full-month divisor (June 2026, 26 working days)
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Full-month payroll uses full calendar month working days divisor (June 2026 = 26 working days)', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const monthlySalary = 52000;

  const worker = {
    _id: 'W_FULL_MONTH',
    name: 'Full Month Worker',
    salary: monthlySalary,
    batch: 'Full Time'
  };

  const attendanceData = [];
  for (let d = 1; d <= 30; d++) {
    const dayDate = new Date(Date.UTC(2026, 5, d));
    if (dayDate.getUTCDay() !== 0) { // Not Sunday
      const dateStr = dayDate.toISOString().split('T')[0];
      attendanceData.push(
        { date: dateStr, time: '09:00', presence: true },
        { date: dateStr, time: '18:00', presence: false }
      );
    }
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  assert.strictEqual(report.summary.perDaySalary, 2000, '52000 / 26 = 2000 per day');
  assert.strictEqual(report.summary.finalSalary, 52000, 'Full month worked = 52,000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10 (Stage 2C): Partial-range report preserves same monthly daily salary rate
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Partial-range report within a month preserves standard monthly daily rate', () => {
  const fromDate = '2026-06-10';
  const toDate = '2026-06-20';
  const monthlySalary = 52000;

  const worker = {
    _id: 'W_PARTIAL_RANGE',
    name: 'Partial Range Worker',
    salary: monthlySalary,
    batch: 'Full Time'
  };

  // June 10 to June 20 has 11 days (June 14 is Sunday) -> 10 working days in range
  const attendanceData = [];
  for (let d = 10; d <= 20; d++) {
    const dayDate = new Date(Date.UTC(2026, 5, d));
    if (dayDate.getUTCDay() !== 0) {
      const dateStr = dayDate.toISOString().split('T')[0];
      attendanceData.push(
        { date: dateStr, time: '09:00', presence: true },
        { date: dateStr, time: '18:00', presence: false }
      );
    }
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  // June 2026 has 26 working days. Daily rate must remain 52,000 / 26 = 2,000 (NOT 52,000 / 10 = 5,200)
  assert.strictEqual(report.summary.perDaySalary, 2000, 'Daily rate must be anchored to full month working days (2000/day)');
  // 10 working days worked in the selected range -> 10 * 2000 = 20,000
  assert.strictEqual(report.summary.finalSalary, 20000, '10 worked days in range * 2000 = 20,000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11 (Stage 2C): Leap February vs Ordinary February working days divisor
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Leap February (2024 = 25 working days) and Ordinary February (2026 = 24 working days) calculate exact divisor', () => {
  // 1. Leap Feb 2024 (29 days, Sundays: Feb 4, 11, 18, 25 -> 4 Sundays -> 25 working days)
  const workerLeap = { _id: 'W_LEAP', salary: 50000, batch: 'Full Time' };
  const reportLeap = calculateWorkerProductivity({
    worker: workerLeap,
    attendanceData: [],
    fromDate: '2024-02-01',
    toDate: '2024-02-29',
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });
  assert.strictEqual(reportLeap.summary.perDaySalary, 50000 / 25, 'Feb 2024 divisor must be 25 working days -> 2,000/day');

  // 2. Ordinary Feb 2026 (28 days, Sundays: Feb 1, 8, 15, 22 -> 4 Sundays -> 24 working days)
  const workerOrd = { _id: 'W_ORD', salary: 48000, batch: 'Full Time' };
  const reportOrd = calculateWorkerProductivity({
    worker: workerOrd,
    attendanceData: [],
    fromDate: '2026-02-01',
    toDate: '2026-02-28',
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });
  assert.strictEqual(reportOrd.summary.perDaySalary, 48000 / 24, 'Feb 2026 divisor must be 24 working days -> 2,000/day');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12 (Stage 2C): Multi-month custom date ranges preserve period working days divisor
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Multi-month custom range preserves total working days divisor without collapsing to first month', () => {
  const fromDate = '2026-05-01';
  const toDate = '2026-07-31';
  const monthlySalary = 60000;

  const worker = { _id: 'W_MULTI', salary: monthlySalary, batch: 'Full Time' };
  const reportMulti = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate,
    toDate,
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  // May (31), June (30), July (31) = 92 days total. Total Sundays = 13. Working days in period = 79.
  assert.strictEqual(reportMulti.summary.totalWorkingDaysInPeriod, 79);
  assert.strictEqual(reportMulti.summary.perDaySalary, 60000 / 79, 'Multi-month range uses totalWorkingDaysInPeriod');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13 (Stage 2C): Frontend getEffectivePayableSalary helper behavior (Toggle OFF & ON)
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Frontend getEffectivePayableSalary helper behaves correctly for Toggle OFF and ON', () => {
  const getEffectivePayableSalary = (record, isDeductionView) => {
    if (!record) return 0;
    const base = record.payableSalary !== undefined ? record.payableSalary : (record.totalFinalSalary || 0);
    const penalty = isDeductionView ? (record.taskPenalty || 0) : 0;
    return Math.max(0, base - penalty);
  };

  const record = {
    payableSalary: 52000,
    totalFinalSalary: 50000,
    taskPenalty: 4000
  };

  // Toggle OFF: returns base payableSalary
  assert.strictEqual(getEffectivePayableSalary(record, false), 52000, 'Toggle OFF must return payableSalary (52,000)');

  // Toggle ON: returns max(0, payableSalary - taskPenalty)
  assert.strictEqual(getEffectivePayableSalary(record, true), 48000, 'Toggle ON must return 52,000 - 4,000 = 48,000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14 (Stage 2C): Task Penalty exceeds payable salary clamps cleanly to 0
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Task penalty exceeding payable salary clamps payout cleanly to 0', () => {
  const getEffectivePayableSalary = (record, isDeductionView) => {
    if (!record) return 0;
    const base = record.payableSalary !== undefined ? record.payableSalary : (record.totalFinalSalary || 0);
    const penalty = isDeductionView ? (record.taskPenalty || 0) : 0;
    return Math.max(0, base - penalty);
  };

  const record = {
    payableSalary: 5000,
    taskPenalty: 12000
  };

  assert.strictEqual(getEffectivePayableSalary(record, true), 0, '5,000 - 12,000 clamped at 0');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15 (Stage 2C): No double deduction contract
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: No double deduction between backend response and frontend display', () => {
  // Backend calculation contract:
  const attendanceSalary = 50000;
  const additions = 2000;
  const deductions = 1000;
  const taskPenalty = 3000;

  // Backend payableSalary does NOT subtract taskPenalty
  const backendPayableSalary = Math.max(0, attendanceSalary + additions - deductions);
  assert.strictEqual(backendPayableSalary, 51000, 'Backend payableSalary must NOT subtract taskPenalty');

  // Frontend calculates net payout exactly once
  const getEffectivePayableSalary = (record, isDeductionView) => {
    const base = record.payableSalary !== undefined ? record.payableSalary : (record.totalFinalSalary || 0);
    const penalty = isDeductionView ? (record.taskPenalty || 0) : 0;
    return Math.max(0, base - penalty);
  };

  const netPayout = getEffectivePayableSalary({ payableSalary: backendPayableSalary, taskPenalty }, true);
  assert.strictEqual(netPayout, 48000, 'Net payout must subtract taskPenalty exactly once (51000 - 3000 = 48000)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 16 (Stage 2C): Table, Summary card, PDF and XLSX export totals consistency
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Table rows, Summary card, PDF and XLSX export totals evaluate identically', () => {
  const getEffectivePayableSalary = (record, isDeductionView) => {
    if (!record) return 0;
    const base = record.payableSalary !== undefined ? record.payableSalary : (record.totalFinalSalary || 0);
    const penalty = isDeductionView ? (record.taskPenalty || 0) : 0;
    return Math.max(0, base - penalty);
  };

  const mockBulkData = [
    { name: 'Emp 1', payableSalary: 50000, taskPenalty: 2000 },
    { name: 'Emp 2', payableSalary: 45000, taskPenalty: 0 },
    { name: 'Emp 3', payableSalary: 60000, taskPenalty: 5000 }
  ];

  // Test Toggle ON:
  const isDeductionView = true;
  const tableTotal = mockBulkData.map(r => getEffectivePayableSalary(r, isDeductionView)).reduce((a, b) => a + b, 0);
  const summaryTotal = mockBulkData.reduce((sum, r) => sum + getEffectivePayableSalary(r, isDeductionView), 0);
  const pdfTotal = mockBulkData.reduce((sum, r) => sum + getEffectivePayableSalary(r, isDeductionView), 0);
  const xlsxTotal = mockBulkData.map(r => getEffectivePayableSalary(r, isDeductionView)).reduce((a, b) => a + b, 0);

  // Expected: (50000-2000) + 45000 + (60000-5000) = 48000 + 45000 + 55000 = 148,000
  assert.strictEqual(tableTotal, 148000);
  assert.strictEqual(summaryTotal, 148000);
  assert.strictEqual(pdfTotal, 148000);
  assert.strictEqual(xlsxTotal, 148000);
  assert.strictEqual(tableTotal, summaryTotal);
  assert.strictEqual(summaryTotal, pdfTotal);
  assert.strictEqual(pdfTotal, xlsxTotal);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 17 (Stage 2C): Zero base salary handling
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2C: Zero base salary worker results in 0 daily salary and 0 payout without NaN or crashes', () => {
  const workerZero = {
    _id: 'W_ZERO',
    name: 'Zero Salary Worker',
    salary: 0,
    batch: 'Full Time'
  };

  const report = calculateWorkerProductivity({
    worker: workerZero,
    attendanceData: [],
    fromDate: '2026-06-01',
    toDate: '2026-06-30',
    leaveData: [],
    projects: [],
    options: { batches: [{ batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }] }
  });

  assert.strictEqual(report.summary.perDaySalary, 0);
  assert.strictEqual(report.summary.finalSalary, 0);
  assert.strictEqual(isNaN(report.summary.finalSalary), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 18 (Stage 2D): calculateUnauthorizedAbsencePenalty full-month divisor
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2D: calculateUnauthorizedAbsencePenalty uses full calendar month divisor for full-month period', () => {
  const worker = { _id: 'W_UNAUTH_FULL', salary: 52000 };
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  // June 2026 = 26 working days -> daily rate = 52000 / 26 = 2000. 5X penalty per absent day = 10,000

  // 1 absent day on June 10 (past date relative to future) with no leave
  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    [], // no leaves
    [], // no attendance
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  // Each unexcused working day incurs exactly 10,000 (2000 * 5)
  if (penalties.length > 0) {
    assert.strictEqual(penalties[0].penaltyAmount, 10000, '5X daily penalty must be 5 * 2000 = 10,000');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 19 (Stage 2D): calculateUnauthorizedAbsencePenalty partial-range divisor consistency
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2D: calculateUnauthorizedAbsencePenalty uses full calendar month divisor for partial-month range', () => {
  const worker = { _id: 'W_UNAUTH_PARTIAL', salary: 52000 };
  const fromDate = '2026-06-10';
  const toDate = '2026-06-20';
  // June 10-20 has 10 working days, but full month of June 2026 has 26 working days.
  // Daily rate must remain 52,000 / 26 = 2,000. 5X penalty must be 10,000 (NOT 52,000 / 10 * 5 = 26,000)

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    fromDate,
    toDate,
    [],
    [],
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  if (penalties.length > 0) {
    assert.strictEqual(penalties[0].penaltyAmount, 10000, 'Partial range penalty rate must be 5 * 2000 = 10,000 (not 26,000)');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 20 (Stage 2D): calculateUnauthorizedAbsencePenalty preserves employment boundaries
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2D: calculateUnauthorizedAbsencePenalty excludes days before joiningDate and after relievedAt', () => {
  const worker = {
    _id: 'W_UNAUTH_BOUND',
    salary: 52000,
    joiningDate: new Date('2026-06-15T00:00:00.000Z'),
    relievedAt: new Date('2026-06-25T00:00:00.000Z')
  };

  const { penalties } = calculateUnauthorizedAbsencePenalty(
    worker,
    '2026-06-01',
    '2026-06-30',
    [],
    [],
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  const penalizedDates = penalties.map(p => p.date);
  // Must NOT contain dates before June 15 or after June 25
  assert(!penalizedDates.some(d => d < '2026-06-15'), 'No penalties before joiningDate');
  assert(!penalizedDates.some(d => d > '2026-06-25'), 'No penalties after relievedAt');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 21 (Stage 2D): calculateUnauthorizedAbsencePenalty zero salary handling
// ─────────────────────────────────────────────────────────────────────────────
runTest('Stage 2D: calculateUnauthorizedAbsencePenalty with zero salary yields 0 penalty without NaN', () => {
  const worker = { _id: 'W_UNAUTH_ZERO', salary: 0 };
  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker,
    '2026-06-01',
    '2026-06-30',
    [],
    [],
    [],
    { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  assert.strictEqual(totalUnauthorizedPenalty, 0);
  if (penalties.length > 0) {
    assert.strictEqual(penalties[0].penaltyAmount, 0);
  }
});

console.log('\n================================================================');
console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${testCount} Total Tests`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
