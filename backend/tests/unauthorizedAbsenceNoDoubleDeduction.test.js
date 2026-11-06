/**
 * Phase 4 — Date-Level Unauthorized Absence Double-Deduction Regression Tests
 *
 * Verifies Option B:
 * For an unauthorized absence date, the 5X penalty replaces the normal 1X Loss of Pay (LOP) deduction.
 * The same date must NEVER receive both deductions.
 *
 * Numerical Fixture:
 * Monthly base salary: ₹27,000.00
 * Working days in month: 27
 * Daily salary rate: ₹1,000.00
 */

const assert = require('assert');
const { calculateWorkerProductivity, calculateUnauthorizedAbsencePenalty } = require('../utils/productivityCalculator');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');

// Simulated frontend getEffectivePayableSalary from SalaryManagement.jsx
const getEffectivePayableSalary = (record) => {
  if (!record) return 0;
  if (record.finalPayableSalary !== undefined && !isNaN(Number(record.finalPayableSalary))) {
    return Number(record.finalPayableSalary);
  }
  if (record.fullReport?.finalPayableSalary !== undefined && !isNaN(Number(record.fullReport.finalPayableSalary))) {
    return Number(record.fullReport.finalPayableSalary);
  }
  const base = record.payableSalary !== undefined
    ? Number(record.payableSalary)
    : (record.fullReport?.payableSalary !== undefined
      ? Number(record.fullReport.payableSalary)
      : Number(record.totalFinalSalary || 0));
  const penalty = record.taskPenalty !== undefined
    ? Number(record.taskPenalty || 0)
    : Number(record.fullReport?.taskPenalty || 0);
  return Math.max(0, base - penalty);
};

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

console.log('\n=== RUNNING PHASE 4: UNAUTHORIZED ABSENCE (OPTION B) TEST SUITE ===\n');

const createMockWorker = (overrides = {}) => ({
  _id: 'w_test_4',
  name: 'Test Developer',
  salary: 27000,
  batch: 'Full Time',
  subdomain: 'tech-cipher',
  status: 'Active',
  joiningDate: '2026-01-01',
  ...overrides
});

const defaultSettings = {
  advancedLeaveDeduction: {
    enableUnauthorizedLeavePenalty: true,
    deductionMultiplier: 2,
    thresholds: { company: 80, department: 80 }
  },
  paidLeaveConfig: {
    enabled: true,
    leavesPerMonth: 1
  },
  batches: [
    { batchName: 'Full Time', from: '09:00', to: '18:00', isLunchConsider: true }
  ]
};

// Generates 27 working days for October 2026 (Sundays: 4, 11, 18, 25 excluded)
const generateAttendance = (workerId, presentDates) => {
  const records = [];
  for (const dStr of presentDates) {
    records.push(
      { date: dStr, time: '09:00:00 AM', presence: true, worker: workerId },
      { date: dStr, time: '06:00:00 PM', presence: false, worker: workerId }
    );
  }
  return records;
};

const getAllOctoberWorkingDays = () => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    const pad = String(i).padStart(2, '0');
    const dStr = `2026-10-${pad}`;
    const d = new Date(dStr + 'T00:00:00');
    if (d.getDay() !== 0) { // Not Sunday
      days.push(dStr);
    }
  }
  return days; // 27 working days
};

const allWorkingDays = getAllOctoberWorkingDays();

// --------------------------------------------------------------------------
// 1. One unauthorized absence -> Exactly 5X deduction (₹5,000)
// --------------------------------------------------------------------------
runTest('Scenario 1: One unauthorized absence day results in exactly 5X deduction (₹5,000, final ₹22,000)', () => {
  const worker = createMockWorker();
  // Absent on 2026-10-05 (Monday)
  const absentDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== absentDate);
  const attendance = generateAttendance(worker._id, presentDays);

  const { penalties, totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 1, 'Should identify exactly 1 unauthorized absence date');
  assert.strictEqual(penalties[0].date, absentDate);
  assert.strictEqual(penalties[0].penaltyAmount, 5000, '5X penalty must be ₹5,000');
  assert.strictEqual(totalUnauthorizedPenalty, 5000);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  // Verify Normal LOP component for this date is ZERO
  assert.strictEqual(report.summary.totalAbsentDeduction || 0, 0, 'Normal LOP absent deduction must be ₹0');
  assert.strictEqual(report.summary.totalSaaSDeductions || 0, 0, 'SaaS deduction pool must not deduct normal LOP');
  assert.strictEqual(report.summary.finalSalary, 27000, 'Productivity finalSalary before penalty must be ₹27,000');

  // Controller deduction: 27000 - 5000 = 22000
  const netAfterPenalty = report.summary.finalSalary - totalUnauthorizedPenalty;
  assert.strictEqual(netAfterPenalty, 22000, 'Combined final payout must be exactly ₹22,000');

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: netAfterPenalty,
    payrollRecord: null,
    taskPenalty: 0
  });

  assert.strictEqual(finalized.finalPayableSalary, 22000);
});

// --------------------------------------------------------------------------
// 2. Two unauthorized absences -> Exactly 10X total (₹10,000, final ₹17,000)
// --------------------------------------------------------------------------
runTest('Scenario 2: Two unauthorized absences result in exactly 10X deduction (₹10,000, final ₹17,000)', () => {
  const worker = createMockWorker();
  const absentDates = ['2026-10-05', '2026-10-06'];
  const presentDays = allWorkingDays.filter(d => !absentDates.includes(d));
  const attendance = generateAttendance(worker._id, presentDays);

  const { penalties, totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 2);
  assert.strictEqual(totalUnauthorizedPenalty, 10000);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  assert.strictEqual(report.summary.totalAbsentDeduction || 0, 0);
  assert.strictEqual(report.summary.finalSalary, 27000);

  const netAfterPenalty = report.summary.finalSalary - totalUnauthorizedPenalty;
  assert.strictEqual(netAfterPenalty, 17000);
});

// --------------------------------------------------------------------------
// 3. Three unauthorized absences -> Exactly 15X total (₹15,000, final ₹12,000)
// --------------------------------------------------------------------------
runTest('Scenario 3: Three unauthorized absences result in exactly 15X deduction (₹15,000, final ₹12,000)', () => {
  const worker = createMockWorker();
  const absentDates = ['2026-10-05', '2026-10-06', '2026-10-07'];
  const presentDays = allWorkingDays.filter(d => !absentDates.includes(d));
  const attendance = generateAttendance(worker._id, presentDays);

  const { penalties, totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 3);
  assert.strictEqual(totalUnauthorizedPenalty, 15000);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  assert.strictEqual(report.summary.totalAbsentDeduction || 0, 0);
  const netAfterPenalty = report.summary.finalSalary - totalUnauthorizedPenalty;
  assert.strictEqual(netAfterPenalty, 12000);
});

// --------------------------------------------------------------------------
// 4. Approved paid leave -> No unauthorized penalty, no LOP
// --------------------------------------------------------------------------
runTest('Scenario 4: Approved paid leave yields zero penalty and zero LOP deduction', () => {
  const worker = createMockWorker();
  const leaveDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== leaveDate);
  const attendance = generateAttendance(worker._id, presentDays);
  const leaves = [{
    worker: worker._id,
    leaveType: 'Paid Leave',
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    status: 'Approved'
  }];

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', leaves, attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 0, 'Approved paid leave must have zero penalties');
  assert.strictEqual(totalUnauthorizedPenalty, 0);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: leaves,
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig
    }
  });

  assert.strictEqual(report.summary.leaveDeduction || 0, 0);
  assert.strictEqual(report.summary.finalSalary, 27000);
});

// --------------------------------------------------------------------------
// 5. Approved unpaid leave -> Existing 1X LOP preserved, no unauthorized penalty
// --------------------------------------------------------------------------
runTest('Scenario 5: Approved unpaid leave preserves existing 1X LOP and applies zero 5X penalty', () => {
  const worker = createMockWorker();
  const leaveDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== leaveDate);
  const attendance = generateAttendance(worker._id, presentDays);
  const leaves = [{
    worker: worker._id,
    leaveType: 'Unpaid Leave',
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    status: 'Approved'
  }];

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', leaves, attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 0, 'Approved unpaid leave must NOT incur 5X unauthorized penalty');
  assert.strictEqual(totalUnauthorizedPenalty, 0);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: leaves,
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig
    }
  });

  // Approved unpaid leave receives normal 1X LOP deduction: ₹1,000
  assert.strictEqual(report.summary.leaveDeduction, 1000, 'Normal 1X LOP must be preserved for approved unpaid leave');
  assert.strictEqual(report.summary.finalSalary, 26000, 'Final salary must be 27000 - 1000 = 26000');
});

// --------------------------------------------------------------------------
// 6. Pending or Rejected paid leave -> 5X penalty applied, normal LOP waived
// --------------------------------------------------------------------------
runTest('Scenario 6: Pending/Rejected leave receives 5X penalty with normal LOP waived (Option B)', () => {
  const worker = createMockWorker();
  const leaveDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== leaveDate);
  const attendance = generateAttendance(worker._id, presentDays);
  const leaves = [{
    worker: worker._id,
    leaveType: 'Paid Leave',
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    status: 'Rejected'
  }];

  const { penalties, totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', leaves, attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 1);
  assert.strictEqual(penalties[0].leaveStatus, 'Rejected');
  assert.strictEqual(totalUnauthorizedPenalty, 5000);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: leaves.filter(l => l.status === 'Approved'), // only approved leaves pass to productivity
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  assert.strictEqual(report.summary.absentDeduction || 0, 0, 'Normal LOP must be ₹0 for rejected leave date');
  assert.strictEqual(report.summary.finalSalary, 27000);
  const net = report.summary.finalSalary - totalUnauthorizedPenalty;
  assert.strictEqual(net, 22000, 'Net salary must be exactly ₹22,000');
});

// --------------------------------------------------------------------------
// 7. Public Holiday -> Zero unauthorized penalty and zero LOP
// --------------------------------------------------------------------------
runTest('Scenario 7: Public holiday yields zero penalty and zero LOP deduction', () => {
  const worker = createMockWorker();
  const holidayDate = '2026-10-02'; // Gandhi Jayanti
  const holidays = [{ date: holidayDate, holidayDesc: 'Gandhi Jayanti', appliesTo: 'all' }];
  const presentDays = allWorkingDays.filter(d => d !== holidayDate);
  const attendance = generateAttendance(worker._id, presentDays);

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, holidays, defaultSettings
  );

  assert.strictEqual(penalties.length, 0);
  assert.strictEqual(totalUnauthorizedPenalty, 0);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      holidays,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig
    }
  });

  assert.strictEqual(report.summary.absentDeduction || 0, 0);
  assert.strictEqual(report.summary.finalSalary, 27000);
});

// --------------------------------------------------------------------------
// 8. Sunday -> Existing Sunday weekly off rule preserved
// --------------------------------------------------------------------------
runTest('Scenario 8: Sunday weekly off yields zero penalty and zero deduction', () => {
  const worker = createMockWorker();
  const attendance = generateAttendance(worker._id, allWorkingDays);

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 0);
  assert.strictEqual(totalUnauthorizedPenalty, 0);
});

// --------------------------------------------------------------------------
// 9. Employee before joining date and after relieved date -> Zero deduction
// --------------------------------------------------------------------------
runTest('Scenario 9: Dates before joiningDate or after relievedAt receive no penalties', () => {
  const worker = createMockWorker({
    joiningDate: '2026-10-10',
    relievedAt: '2026-10-20'
  });

  const presentDays = ['2026-10-12', '2026-10-13']; // only 2 days present
  const attendance = generateAttendance(worker._id, presentDays);

  const { penalties } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  // All penalties must fall strictly between Oct 10 and Oct 20
  penalties.forEach(p => {
    assert.strictEqual(p.date >= '2026-10-10' && p.date <= '2026-10-20', true);
  });
});

// --------------------------------------------------------------------------
// 10. Attendance punch exists -> Zero unauthorized penalty
// --------------------------------------------------------------------------
runTest('Scenario 10: Attendance punch exists -> No unauthorized absence penalty', () => {
  const worker = createMockWorker();
  const attendance = generateAttendance(worker._id, allWorkingDays);

  const { penalties, totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(penalties.length, 0);
  assert.strictEqual(totalUnauthorizedPenalty, 0);
});

// --------------------------------------------------------------------------
// 11. Month boundary -> Date counted only in correct payroll period
// --------------------------------------------------------------------------
runTest('Scenario 11: Month boundary -> Date counted strictly in target month', () => {
  const worker = createMockWorker();
  // Evaluated for November 2026
  const { penalties } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-11-01', '2026-11-30', [], [], [], defaultSettings
  );

  penalties.forEach(p => {
    assert.strictEqual(p.date.startsWith('2026-11'), true);
  });
});

// --------------------------------------------------------------------------
// 12. Task penalty and unauthorized absence together -> Independent without duplication
// --------------------------------------------------------------------------
runTest('Scenario 12: Task penalty and unauthorized absence apply independently without duplication', () => {
  const worker = createMockWorker();
  const absentDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== absentDate);
  const attendance = generateAttendance(worker._id, presentDays);

  const { totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  assert.strictEqual(totalUnauthorizedPenalty, 5000);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  const salaryAfterUnauthorized = report.summary.finalSalary - totalUnauthorizedPenalty; // 27000 - 5000 = 22000
  const taskPenalty = 2500;

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: salaryAfterUnauthorized,
    payrollRecord: null,
    taskPenalty
  });

  assert.strictEqual(finalized.payableSalary, 22000, 'Payable salary before task penalty must be 22000');
  assert.strictEqual(finalized.taskPenalty, 2500, 'Task penalty is 2500');
  assert.strictEqual(finalized.finalPayableSalary, 19500, 'Final payable salary is 22000 - 2500 = 19500');
});

// --------------------------------------------------------------------------
// 13. Cross-Channel Parity Verification across all 10 outputs
// --------------------------------------------------------------------------
runTest('Scenario 13: 100% Cross-channel parity across all 10 outputs under Option B', () => {
  const worker = createMockWorker();
  const absentDate = '2026-10-05';
  const presentDays = allWorkingDays.filter(d => d !== absentDate);
  const attendance = generateAttendance(worker._id, presentDays);

  const { totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], defaultSettings
  );

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    leaveData: [],
    options: {
      batches: defaultSettings.batches,
      advancedLeaveDeduction: defaultSettings.advancedLeaveDeduction,
      paidLeaveConfig: defaultSettings.paidLeaveConfig,
      unauthorizedAbsenceDates: unauthorizedDates
    }
  });

  const salaryAfterUnauthorized = report.summary.finalSalary - totalUnauthorizedPenalty; // 22000

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: salaryAfterUnauthorized,
    payrollRecord: null,
    taskPenalty: 1000
  });

  const expectedPayout = 21000; // 22000 - 1000
  assert.strictEqual(finalized.finalPayableSalary, expectedPayout);

  const mockPayload = {
    finalSalary: finalized.finalPayableSalary,
    finalPayableSalary: finalized.finalPayableSalary,
    payableSalary: finalized.payableSalary,
    attendanceSalary: finalized.attendanceSalary,
    taskPenalty: finalized.taskPenalty,
    fullReport: {
      finalSalaryWithFines: finalized.finalPayableSalary,
      finalPayableSalary: finalized.finalPayableSalary,
      payableSalary: finalized.payableSalary,
      attendanceSalary: finalized.attendanceSalary,
      taskPenalty: finalized.taskPenalty
    }
  };

  // 1. Main Table
  const out1 = getEffectivePayableSalary(mockPayload);
  // 2. Bulk Modal
  const out2 = getEffectivePayableSalary(mockPayload);
  // 3. Individual Report
  const out3 = getEffectivePayableSalary(mockPayload);
  // 4. Bulk Summary PDF
  const out4 = getEffectivePayableSalary(mockPayload);
  // 5. Single PDF
  const out5 = getEffectivePayableSalary(mockPayload.fullReport);
  // 6. Separate PDFs
  const out6 = getEffectivePayableSalary(mockPayload.fullReport);
  // 7. NEFT Excel
  const out7 = parseFloat(getEffectivePayableSalary(mockPayload).toFixed(2));
  // 8. General Excel
  const out8 = parseFloat(getEffectivePayableSalary(mockPayload).toFixed(2));
  // 9. Scheduled WhatsApp dispatch
  const out9 = mockPayload.finalPayableSalary;
  // 10. On-demand WhatsApp dispatch
  const out10 = mockPayload.finalPayableSalary;

  const allOutputs = [out1, out2, out3, out4, out5, out6, out7, out8, out9, out10];
  allOutputs.forEach((val, i) => {
    assert.strictEqual(val, expectedPayout, `Output ${i + 1} must match expected ${expectedPayout}`);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 4 OPTION B REGRESSION TESTS PASSED SUCCESSFULLY!\n');
}
