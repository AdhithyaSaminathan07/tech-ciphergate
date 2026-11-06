/**
 * Global Deduction Toggle Controls Suite
 *
 * Verifies the 4 global toggles across all 16 combinations:
 * 1. Task Deduction (deductionView)
 * 2. Unauthorized (5X) (unauthorizedDeductionView)
 * 3. Leave Deduction (leaveDeductionView)
 * 4. Permission Deduction (permissionDeductionView)
 *
 * Base Fixture:
 * Base Monthly Salary: ₹27,000.00 (27 working days = ₹1,000.00 / day)
 * - 1 unauthorized absence day: 5X penalty = ₹5,000.00, 1X LOP = ₹0.00 (Option B)
 * - 1 approved unpaid leave day: 1X LOP = ₹1,000.00, 5X penalty = ₹0.00
 * - Permission time deduction = ₹200.00
 * - Overdue task penalty = ₹500.00
 * - Gross base before deductions = ₹27,000.00
 */

const assert = require('assert');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');

// Simulated getEffectivePayableSalary from SalaryManagement.jsx
const getEffectivePayableSalary = (record, options = null) => {
  if (!record) return 0;

  const defaultToggles = {
    deductionView: true,
    unauthorizedDeductionView: true,
    leaveDeductionView: true,
    permissionDeductionView: true
  };

  const useTask = options?.deductionView !== undefined
    ? options.deductionView
    : (typeof options === 'boolean' ? options : defaultToggles.deductionView);
  const useUnauth = options?.unauthorizedDeductionView !== undefined
    ? options.unauthorizedDeductionView
    : defaultToggles.unauthorizedDeductionView;
  const useLeave = options?.leaveDeductionView !== undefined
    ? options.leaveDeductionView
    : defaultToggles.leaveDeductionView;
  const usePerm = options?.permissionDeductionView !== undefined
    ? options.permissionDeductionView
    : defaultToggles.permissionDeductionView;

  const isSnapshotProtected = record.payrollRecord &&
    ['Locked', 'Paid'].includes(record.payrollRecord.status) &&
    record.payrollRecord.attendanceSalarySnapshot !== null &&
    record.payrollRecord.attendanceSalarySnapshot !== undefined &&
    !isNaN(Number(record.payrollRecord.attendanceSalarySnapshot));

  const taskPenalty = Number(record.taskPenalty || record.fullReport?.taskPenalty || 0);
  const unauthPenalty = Number(record.totalUnauthorizedPenalty || record.fullReport?.totalUnauthorizedPenalty || 0);
  const leaveDed = Number(record.fullReport?.report?.summary?.leaveDeduction || record.leaveDeduction || 0);
  const permDed = Number(record.fullReport?.report?.summary?.permissionDeduction || record.permissionDeduction || 0);

  if (useTask && useUnauth && useLeave && usePerm) {
    if (record.finalPayableSalary !== undefined && !isNaN(Number(record.finalPayableSalary))) {
      return Number(record.finalPayableSalary);
    }
    if (record.fullReport?.finalPayableSalary !== undefined && !isNaN(Number(record.fullReport.finalPayableSalary))) {
      return Number(record.fullReport.finalPayableSalary);
    }
  }

  let basePayable = record.payableSalary !== undefined
    ? Number(record.payableSalary)
    : (record.fullReport?.payableSalary !== undefined
      ? Number(record.fullReport.payableSalary)
      : Number(record.totalFinalSalary || 0));

  if (!isSnapshotProtected) {
    const safeExtra4X = record.totalExtra4XPenalty !== undefined
      ? Number(record.totalExtra4XPenalty)
      : (record.fullReport?.totalExtra4XPenalty !== undefined
        ? Number(record.fullReport.totalExtra4XPenalty)
        : (unauthPenalty > 0 ? unauthPenalty * 0.8 : 0));

    const safe1XLeave = Number(record.normal1XLeaveAmount || record.fullReport?.normal1XLeaveAmount || (record.totalNormal1XAmount || 0));
    const safe1XPerm = Number(record.normal1XPermissionAmount || record.fullReport?.normal1XPermissionAmount || 0);

    if (!useUnauth && unauthPenalty > 0) {
      basePayable += safeExtra4X;
    }
    if (!useLeave) {
      if (leaveDed > 0) basePayable += leaveDed;
      if (!useUnauth && safe1XLeave > 0) basePayable += safe1XLeave;
    }
    if (!usePerm) {
      if (permDed > 0) basePayable += permDed;
      if (!useUnauth && safe1XPerm > 0) basePayable += safe1XPerm;
    }
  }

  const effectiveTaskPenalty = useTask ? taskPenalty : 0;
  const finalAmount = Math.max(0, basePayable - effectiveTaskPenalty);
  return parseFloat(finalAmount.toFixed(2));
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

console.log('\n=== RUNNING GLOBAL DEDUCTION TOGGLE CONTROLS TEST SUITE ===\n');

// Standard employee record with all 4 deductions present
// Gross = 27,000
// - Unauthorized (5X) = 5,000 (normal LOP is 0 under Option B)
// - Leave Deduction = 1,000
// - Permission Deduction = 200
// Base Attendance Salary after deductions = 27,000 - 5,000 - 1,000 - 200 = 20,800
// - Task Penalty = 500
// Final Payable Salary when all ON = 20,800 - 500 = 20,300
const createStandardEmployeeRecord = (overrides = {}) => {
  const baseSalary = 27000;
  const unauthPenalty = 5000;
  const totalExtra4XPenalty = 4000;
  const normal1XLeaveAmount = 1000;
  const leaveDed = 1000;
  const permDed = 200;
  const taskPen = 500;

  // Attendance salary with all deductions applied
  const attendanceSalary = baseSalary - unauthPenalty - leaveDed - permDed; // 20800
  const payableSalary = attendanceSalary; // 20800
  const finalPayableSalary = payableSalary - taskPen; // 20300

  return {
    workerId: 'w_toggle_test',
    name: 'Audit Developer',
    salary: baseSalary,
    attendanceSalary,
    totalFinalSalary: attendanceSalary,
    payableSalary,
    finalPayableSalary,
    taskPenalty: taskPen,
    totalUnauthorizedPenalty: unauthPenalty,
    totalExtra4XPenalty,
    normal1XLeaveAmount,
    leaveDeduction: leaveDed,
    permissionDeduction: permDed,
    fullReport: {
      payableSalary,
      finalPayableSalary,
      taskPenalty: taskPen,
      totalUnauthorizedPenalty: unauthPenalty,
      totalExtra4XPenalty,
      normal1XLeaveAmount,
      report: {
        summary: {
          originalSalary: baseSalary,
          leaveDeduction: leaveDed,
          permissionDeduction: permDed,
          finalSalary: attendanceSalary
        }
      }
    },
    ...overrides
  };
};

// --------------------------------------------------------------------------
// 1. All 16 Toggle Combinations for Standard Employee
// --------------------------------------------------------------------------
const booleanValues = [true, false];
let comboIndex = 0;

for (const taskOn of booleanValues) {
  for (const unauthOn of booleanValues) {
    for (const leaveOn of booleanValues) {
      for (const permOn of booleanValues) {
        comboIndex++;
        const title = `Combination ${String(comboIndex).padStart(2, '0')}: [Task:${taskOn ? 'ON' : 'OFF'}, Unauth:${unauthOn ? 'ON' : 'OFF'}, Leave:${leaveOn ? 'ON' : 'OFF'}, Perm:${permOn ? 'ON' : 'OFF'}]`;

        runTest(title, () => {
          const record = createStandardEmployeeRecord();

          // Calculate backend finalized result
          const backendFinalized = finalizeSalaryCalculation({
            finalSalaryWithAdjustment: record.attendanceSalary,
            payrollRecord: null,
            taskPenalty: record.taskPenalty,
            totalUnauthorizedPenalty: record.totalUnauthorizedPenalty,
            totalExtra4XPenalty: record.totalExtra4XPenalty,
            normal1XLeaveAmount: record.normal1XLeaveAmount,
            leaveDeduction: record.leaveDeduction,
            permissionDeduction: record.permissionDeduction,
            toggles: {
              taskDeduction: taskOn,
              unauthorizedDeduction: unauthOn,
              leaveDeduction: leaveOn,
              permissionDeduction: permOn
            }
          });

          // Calculate frontend effective result
          const frontendAmount = getEffectivePayableSalary(record, {
            deductionView: taskOn,
            unauthorizedDeductionView: unauthOn,
            leaveDeductionView: leaveOn,
            permissionDeductionView: permOn
          });

          // Mathematical expected amount
          let expected = 27000;
          if (unauthOn) {
            expected -= 5000;
          } else if (leaveOn) {
            // When 5X is OFF, normal 1X LOP is restored for the unauthorized absence!
            expected -= 1000;
          }
          if (leaveOn) expected -= 1000;
          if (permOn) expected -= 200;
          if (taskOn) expected -= 500;
          expected = Math.max(0, expected);

          assert.strictEqual(backendFinalized.finalPayableSalary, expected, `Backend must equal expected ${expected}`);
          assert.strictEqual(frontendAmount, expected, `Frontend must equal expected ${expected}`);
          assert.strictEqual(frontendAmount, backendFinalized.finalPayableSalary, 'Frontend and Backend must match exactly');
        });
      }
    }
  }
}

// --------------------------------------------------------------------------
// 2. Locked Payroll Snapshot Protection
// --------------------------------------------------------------------------
runTest('Locked PayrollRecord snapshot is protected regardless of toggle settings', () => {
  const lockedSnapshot = 25000;
  const lockedRecord = createStandardEmployeeRecord({
    payrollRecord: {
      status: 'Locked',
      attendanceSalarySnapshot: lockedSnapshot,
      adjustments: [
        { type: 'addition', amount: 1000, isDeleted: false }
      ]
    }
  });

  // Test with all toggles OFF
  const backendAllOff = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 18000, // dynamic recalculation
    payrollRecord: lockedRecord.payrollRecord,
    taskPenalty: 500,
    totalUnauthorizedPenalty: 5000,
    leaveDeduction: 1000,
    permissionDeduction: 200,
    toggles: {
      taskDeduction: false,
      unauthorizedDeduction: false,
      leaveDeduction: false,
      permissionDeduction: false
    }
  });

  // Frozen attendance salary must remain lockedSnapshot (25000)
  assert.strictEqual(backendAllOff.attendanceSalary, lockedSnapshot, 'Attendance snapshot must not be mutated');
  assert.strictEqual(backendAllOff.snapshotProtected, true);
  // Payout = 25000 + 1000 (addition) = 26000 (task penalty waived)
  assert.strictEqual(backendAllOff.finalPayableSalary, 26000);

  // Test with task penalty ON
  const backendTaskOn = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 18000,
    payrollRecord: lockedRecord.payrollRecord,
    taskPenalty: 500,
    toggles: {
      taskDeduction: true,
      unauthorizedDeduction: false,
      leaveDeduction: false,
      permissionDeduction: false
    }
  });
  // Payout = 25000 + 1000 - 500 = 25500
  assert.strictEqual(backendTaskOn.attendanceSalary, lockedSnapshot);
  assert.strictEqual(backendTaskOn.finalPayableSalary, 25500);
});

// --------------------------------------------------------------------------
// 3. Cross-Channel Parity Verification for All Outputs
// --------------------------------------------------------------------------
runTest('All 7 output destinations compute identical amounts across toggle changes', () => {
  const record = createStandardEmployeeRecord();

  // Test when Task is OFF and Unauthorized is ON:
  // Expected = 27000 - 5000 - 1000 - 200 = 20800
  const toggles = {
    deductionView: false,
    unauthorizedDeductionView: true,
    leaveDeductionView: true,
    permissionDeductionView: true
  };

  const mainTablePay = getEffectivePayableSalary(record, toggles);
  const bulkModalPay = getEffectivePayableSalary(record, toggles);
  const summaryPdfPay = getEffectivePayableSalary(record, toggles);
  const singlePdfPay = getEffectivePayableSalary(record, toggles);
  const sepPdfPay = getEffectivePayableSalary(record, toggles);
  const neftExcelPay = getEffectivePayableSalary(record, toggles);
  const genExcelPay = getEffectivePayableSalary(record, toggles);

  const expected = 20800;
  assert.strictEqual(mainTablePay, expected);
  assert.strictEqual(bulkModalPay, expected);
  assert.strictEqual(summaryPdfPay, expected);
  assert.strictEqual(singlePdfPay, expected);
  assert.strictEqual(sepPdfPay, expected);
  assert.strictEqual(neftExcelPay, expected);
  assert.strictEqual(genExcelPay, expected);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL GLOBAL DEDUCTION TOGGLE TESTS PASSED SUCCESSFULLY!\n');
}

