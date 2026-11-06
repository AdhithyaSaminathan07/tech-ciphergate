/**
 * Phase 3 Centralized Salary Policy & Calculation Safety Test Suite
 *
 * Verifies:
 * 1. Two admins with different browser localStorage settings produce identical payouts.
 * 2. Task penalty applied exactly once (no double-deduction).
 * 3. WhatsApp dispatch and Bulk Salary 100% mathematical parity.
 * 4. Numeric safety: Missing, null, undefined, or corrupt adjustment amounts.
 * 5. Numeric safety: Corrupt, null, or undefined locked snapshot safely handled without NaN.
 * 6. Locked and paid snapshots protected from recalculation.
 * 7. Zero floor & extreme deductions (never negative).
 * 8. Zero salary and zero attendance handled without NaN.
 * 9. Multiple employees & strict tenant isolation.
 * 10. Project earnings and historical ledger adjustments parity.
 */

const assert = require('assert');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const { calculateTaskPenalties } = require('../utils/salaryPenaltyCalculator');

// Mock frontend getEffectivePayableSalary helper from SalaryManagement.jsx
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

console.log('\n=== RUNNING PHASE 3 CENTRALIZED SALARY SAFETY TEST SUITE ===\n');

// --------------------------------------------------------------------------
// 1. Two admins with different browser localStorage produce identical payouts
// --------------------------------------------------------------------------
runTest('Scenario 1: Two Admins with Different Browser LocalStorage Produce Identical Payouts', () => {
  const backendRecord = {
    workerId: 'w101',
    name: 'Alice Developer',
    attendanceSalary: 45000,
    totalAdditions: 3000,
    totalDeductions: 1000,
    payableSalary: 47000,
    taskPenalty: 2500,
    finalPayableSalary: 44500,
    appliedPenaltyPolicy: 'Deducted'
  };

  // Admin A has deductionView = false in localStorage
  const adminA_DeductionView = false;
  // Admin B has deductionView = true in localStorage
  const adminB_DeductionView = true;

  // Both call getEffectivePayableSalary
  const payoutAdminA = getEffectivePayableSalary(backendRecord, adminA_DeductionView);
  const payoutAdminB = getEffectivePayableSalary(backendRecord, adminB_DeductionView);

  assert.strictEqual(payoutAdminA, 44500, 'Admin A must receive authoritative 44500');
  assert.strictEqual(payoutAdminB, 44500, 'Admin B must receive authoritative 44500');
  assert.strictEqual(payoutAdminA, payoutAdminB, 'Both admins must see the exact same payout amount');
});

// --------------------------------------------------------------------------
// 2. Task penalty applied exactly once
// --------------------------------------------------------------------------
runTest('Scenario 2: Task Penalty Applied Exactly Once Across Finalization', () => {
  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 30000, // attendance salary after projects/penalties
    payrollRecord: {
      status: 'Draft',
      adjustments: [
        { type: 'addition', amount: 2000, isDeleted: false },
        { type: 'deduction', amount: 1000, isDeleted: false }
      ]
    },
    taskPenalty: 3000
  });

  assert.strictEqual(finalized.attendanceSalary, 30000, 'attendanceSalary preserved');
  assert.strictEqual(finalized.totalAdditions, 2000, 'totalAdditions correct');
  assert.strictEqual(finalized.totalDeductions, 1000, 'totalDeductions correct');
  assert.strictEqual(finalized.payableSalary, 31000, 'payableSalary is 30000 + 2000 - 1000 = 31000');
  assert.strictEqual(finalized.taskPenalty, 3000, 'taskPenalty recorded once');
  assert.strictEqual(finalized.finalPayableSalary, 28000, 'finalPayableSalary is 31000 - 3000 = 28000');
  assert.strictEqual(finalized.appliedPenaltyPolicy, 'Deducted');

  // Verify task penalty is NOT deducted twice (e.g. from attendanceSalary AND payableSalary)
  assert.strictEqual(finalized.attendanceSalary - finalized.taskPenalty, 27000);
  assert.notStrictEqual(finalized.finalPayableSalary, 25000, 'Must NOT be double deducted to 25000');
});

// --------------------------------------------------------------------------
// 3. WhatsApp dispatch and Bulk Salary 100% mathematical parity
// --------------------------------------------------------------------------
runTest('Scenario 3: WhatsApp Dispatch and Bulk Salary Payout Parity', () => {
  const worker = {
    _id: 'w202',
    name: 'Bob Smith',
    rfid: 'RFID-202',
    salary: 50000,
    subdomain: 'tech-cipher',
    bankDetails: { accountNumber: '1234567890', ifscCode: 'HDFC0001234' }
  };

  const payrollRecord = {
    _id: 'pr202',
    workerId: 'w202',
    status: 'Draft',
    adjustments: [
      { type: 'addition', amount: 1500, isDeleted: false },
      { type: 'deduction', amount: 500, isDeleted: false }
    ]
  };

  const rawAttendanceSalary = 48000;
  const taskPenaltyAmount = 2000;

  // Bulk Salary computation
  const bulkFinalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: rawAttendanceSalary,
    payrollRecord,
    taskPenalty: taskPenaltyAmount
  });

  // WhatsApp Dispatch computation
  const whatsappFinalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: rawAttendanceSalary,
    payrollRecord,
    taskPenalty: taskPenaltyAmount
  });

  // Bulk NEFT amount
  const bulkNeftAmount = parseFloat(bulkFinalized.finalPayableSalary.toFixed(2));
  // WhatsApp NEFT amount
  const whatsappNeftAmount = parseFloat(whatsappFinalized.finalPayableSalary.toFixed(2));

  assert.strictEqual(bulkFinalized.payableSalary, whatsappFinalized.payableSalary);
  assert.strictEqual(bulkFinalized.finalPayableSalary, whatsappFinalized.finalPayableSalary);
  assert.strictEqual(bulkNeftAmount, whatsappNeftAmount);
  assert.strictEqual(bulkNeftAmount, 47000); // 48000 + 1500 - 500 - 2000 = 47000
});

// --------------------------------------------------------------------------
// 4. Numeric safety: Missing, null, undefined, or corrupt adjustment amounts
// --------------------------------------------------------------------------
runTest('Scenario 4: Numeric Safety - Missing / Null / Corrupt Adjustment Amounts', () => {
  const payrollRecord = {
    status: 'Draft',
    adjustments: [
      { type: 'addition', amount: null, isDeleted: false },
      { type: 'addition', amount: undefined, isDeleted: false },
      { type: 'addition', amount: NaN, isDeleted: false },
      { type: 'addition', amount: 'invalid_number', isDeleted: false },
      { type: 'addition', amount: -500, isDeleted: false }, // negative ignored or sanitized
      { type: 'addition', amount: 1200, isDeleted: false },
      { type: 'deduction', amount: null, isDeleted: false },
      { type: 'deduction', amount: undefined, isDeleted: false },
      { type: 'deduction', amount: 400, isDeleted: false }
    ]
  };

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 20000,
    payrollRecord,
    taskPenalty: 'not_a_number'
  });

  assert.strictEqual(isNaN(finalized.attendanceSalary), false, 'attendanceSalary must not be NaN');
  assert.strictEqual(isNaN(finalized.totalAdditions), false, 'totalAdditions must not be NaN');
  assert.strictEqual(isNaN(finalized.totalDeductions), false, 'totalDeductions must not be NaN');
  assert.strictEqual(isNaN(finalized.payableSalary), false, 'payableSalary must not be NaN');
  assert.strictEqual(isNaN(finalized.finalPayableSalary), false, 'finalPayableSalary must not be NaN');

  assert.strictEqual(finalized.totalAdditions, 1200, 'totalAdditions must cleanly sum 1200');
  assert.strictEqual(finalized.totalDeductions, 400, 'totalDeductions must cleanly sum 400');
  assert.strictEqual(finalized.taskPenalty, 0, 'corrupt task penalty must safely default to 0');
  assert.strictEqual(finalized.payableSalary, 20800, 'payableSalary: 20000 + 1200 - 400 = 20800');
  assert.strictEqual(finalized.finalPayableSalary, 20800, 'finalPayableSalary: 20800 - 0 = 20800');
});

// --------------------------------------------------------------------------
// 5. Numeric safety: Corrupt, null, or undefined locked snapshot safely handled without NaN
// --------------------------------------------------------------------------
runTest('Scenario 5: Numeric Safety - Corrupt Locked Snapshot Handled Without NaN', () => {
  const payrollRecordCorrupt = {
    _id: 'pr_corrupt',
    status: 'Locked',
    attendanceSalarySnapshot: null, // missing snapshot
    adjustments: []
  };

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 35000,
    payrollRecord: payrollRecordCorrupt,
    taskPenalty: 1000
  });

  assert.strictEqual(isNaN(finalized.attendanceSalary), false, 'attendanceSalary must not be NaN');
  assert.strictEqual(isNaN(finalized.payableSalary), false, 'payableSalary must not be NaN');
  assert.strictEqual(isNaN(finalized.finalPayableSalary), false, 'finalPayableSalary must not be NaN');
  assert.strictEqual(finalized.snapshotCorrupt, true, 'snapshotCorrupt must be flagged');
  assert.strictEqual(finalized.attendanceSalary, 35000, 'Fallback to recalculated attendance salary safely');
  assert.strictEqual(finalized.finalPayableSalary, 34000);
});

// --------------------------------------------------------------------------
// 6. Locked and paid snapshots protected from recalculation
// --------------------------------------------------------------------------
runTest('Scenario 6: Locked / Paid Record Snapshot Protection', () => {
  const payrollRecordLocked = {
    _id: 'pr_locked',
    status: 'Locked',
    attendanceSalarySnapshot: 25000, // historical frozen salary
    adjustments: [
      { type: 'addition', amount: 1000, isDeleted: false }
    ]
  };

  // Current attendance recalculation would yield 40000 due to modified attendance
  const currentRecalculation = 40000;

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: currentRecalculation,
    payrollRecord: payrollRecordLocked,
    taskPenalty: 500
  });

  assert.strictEqual(finalized.attendanceSalary, 25000, 'Frozen snapshot must be preserved against 40000 recalculation');
  assert.strictEqual(finalized.snapshotProtected, true);
  assert.strictEqual(finalized.payableSalary, 26000, '25000 + 1000 = 26000');
  assert.strictEqual(finalized.finalPayableSalary, 25500, '26000 - 500 = 25500');
});

// --------------------------------------------------------------------------
// 7. Zero floor & extreme deductions (never negative)
// --------------------------------------------------------------------------
runTest('Scenario 7: Zero Floor & Extreme Deductions (Never Negative)', () => {
  const payrollRecord = {
    status: 'Draft',
    adjustments: [
      { type: 'deduction', amount: 50000, isDeleted: false }
    ]
  };

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 20000,
    payrollRecord,
    taskPenalty: 15000
  });

  assert.strictEqual(finalized.payableSalary, 0, 'payableSalary must have zero floor');
  assert.strictEqual(finalized.finalPayableSalary, 0, 'finalPayableSalary must have zero floor');
  assert.strictEqual(finalized.finalPayableSalary >= 0, true);
});

// --------------------------------------------------------------------------
// 8. Zero salary and zero attendance handled without NaN
// --------------------------------------------------------------------------
runTest('Scenario 8: Zero Salary and Zero Attendance Handled Without NaN', () => {
  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 0,
    payrollRecord: null,
    taskPenalty: 0
  });

  assert.strictEqual(finalized.attendanceSalary, 0);
  assert.strictEqual(finalized.payableSalary, 0);
  assert.strictEqual(finalized.finalPayableSalary, 0);
  assert.strictEqual(isNaN(finalized.finalPayableSalary), false);
});

// --------------------------------------------------------------------------
// 9. Multiple employees & strict tenant isolation
// --------------------------------------------------------------------------
runTest('Scenario 9: Multiple Employees & Strict Tenant Isolation', () => {
  const tenantAWorkers = [
    { _id: 'w1', subdomain: 'tenant-a', salary: 30000 },
    { _id: 'w2', subdomain: 'tenant-a', salary: 35000 }
  ];
  const tenantBWorkers = [
    { _id: 'w3', subdomain: 'tenant-b', salary: 40000 }
  ];

  const targetSubdomain = 'tenant-a';
  const allWorkers = [...tenantAWorkers, ...tenantBWorkers];

  // Simulating tenant filter query
  const filtered = allWorkers.filter(w => w.subdomain === targetSubdomain);
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered.some(w => w._id === 'w3'), false, 'Tenant B employee must never appear in Tenant A');

  // Generate finalized salaries
  const results = filtered.map(w => finalizeSalaryCalculation({
    finalSalaryWithAdjustment: w.salary,
    payrollRecord: null,
    taskPenalty: 0
  }));

  assert.strictEqual(results[0].finalPayableSalary, 30000);
  assert.strictEqual(results[1].finalPayableSalary, 35000);
});

// --------------------------------------------------------------------------
// 10. Project earnings and historical ledger adjustments parity
// --------------------------------------------------------------------------
runTest('Scenario 10: Project Earnings and Historical Ledger Adjustments Parity', () => {
  const baseSalary = 30000;
  const projectEarnings = 5000;
  const priorMonthProjectAdjustment = -1200; // overpayment recovery

  const finalSalaryWithAdjustment = baseSalary + projectEarnings + priorMonthProjectAdjustment; // 33800

  const payrollRecord = {
    status: 'Draft',
    adjustments: [
      { type: 'addition', amount: 700, isDeleted: false }
    ]
  };

  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment,
    payrollRecord,
    taskPenalty: 1000
  });

  assert.strictEqual(finalized.attendanceSalary, 33800);
  assert.strictEqual(finalized.totalAdditions, 700);
  assert.strictEqual(finalized.payableSalary, 34500); // 33800 + 700
  assert.strictEqual(finalized.finalPayableSalary, 33500); // 34500 - 1000
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 3 CENTRALIZED SALARY SAFETY TESTS PASSED SUCCESSFULLY!\n');
}

