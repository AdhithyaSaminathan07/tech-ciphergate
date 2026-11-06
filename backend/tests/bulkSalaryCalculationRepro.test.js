/**
 * Tech Ciphergate — Bulk Salary Calculation Discrepancy Reproduction Test
 *
 * STRICT SAFETY: 100% In-Memory / Isolated Mocks. Zero database calls, zero .env access.
 */

const assert = require('assert');

// 1. Recreate the exact formulas currently implemented in the codebase

// From backend/controllers/salaryController.js lines 1933-1976:
function backendBulkSalaryTransform(result, payrollRecord) {
  const totalAdjustment = 0; // project adjustment
  const finalSalaryWithAdjustment = Math.max(0, result.totalFinalSalary + totalAdjustment);

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
  const finalSalaryCalculated = Math.max(0, finalSalaryWithAdjustment - (result.taskPenalty || 0));

  return {
    ...result,
    projectAdjustment: totalAdjustment,
    totalFinalSalary: finalSalaryWithAdjustment,
    payrollRecord: payrollRecord || null,
    payableSalary: payableSalary,
    attendanceSalary: attendanceSalary,
    totalAdditions,
    totalDeductions,
    finalSalary: finalSalaryCalculated,
    fullReport: {
      ...result.fullReport,
      projectAdjustment: totalAdjustment,
      finalSalaryWithFines: finalSalaryWithAdjustment
    }
  };
}

// From frontend/src/components/admin/SalaryManagement.jsx line 163:
function frontendGetEffectivePayableSalary(record, isDeductionView) {
  if (!record) return 0;
  const base = record.payableSalary !== undefined ? record.payableSalary : (record.totalFinalSalary || 0);
  const penalty = isDeductionView ? (record.taskPenalty || 0) : 0;
  return Math.max(0, base - penalty);
}

// From frontend/src/components/admin/SalaryManagement.jsx line 713 (Single PDF / Separate PDFs):
function frontendRenderEmployeePdfNetPayout(reportObj) {
  const summary = reportObj?.report?.summary || reportObj?.summary || {};
  return reportObj.finalSalaryWithFines ?? reportObj.totalFinalSalary ?? summary.finalSalary ?? 0;
}

// Test reproduction
console.log('--- Reproduction of Salary Discrepancies ---');

// Case A: Employee with approved ₹3,000 festive bonus addition in PayrollRecord
const mockWorkerResultA = {
  workerId: 'w1',
  name: 'John Doe',
  totalFinalSalary: 27000,
  taskPenalty: 1000,
  fullReport: { report: { summary: { originalSalary: 27000, finalSalary: 27000 } } }
};

const mockPayrollRecordA = {
  status: 'Approved',
  attendanceSalarySnapshot: null,
  adjustments: [
    { type: 'addition', amount: 3000, reason: 'Festive Bonus', isDeleted: false }
  ]
};

const backendRecordA = backendBulkSalaryTransform(mockWorkerResultA, mockPayrollRecordA);

// 1. Regular Salary Management screen table display (line 1156):
const regularScreenPayA = backendRecordA.finalSalary;

// 2. Bulk Salary Modal table display (line 2579):
const bulkModalPayA = frontendGetEffectivePayableSalary(backendRecordA, true);

// 3. Bulk PDF Export (All Employees - Single PDF) (line 713 & 1465):
const reportObjA = backendRecordA.fullReport || backendRecordA;
const singlePdfNetPayoutA = frontendRenderEmployeePdfNetPayout(reportObjA);

console.log('Case A (₹3,000 Payroll Addition & ₹1,000 Task Penalty):');
console.log('  1. Regular Salary Screen Table:', regularScreenPayA); // 27000 - 1000 = 26000
console.log('  2. Bulk Salary Modal Table:    ', bulkModalPayA);     // 27000 + 3000 - 1000 = 29000
console.log('  3. Bulk Single/Separate PDF:   ', singlePdfNetPayoutA); // 27000 (Missed +3000 addition and -1000 penalty!)

assert.notStrictEqual(regularScreenPayA, bulkModalPayA, 'Mismatch: Regular screen does not match Bulk modal');
assert.notStrictEqual(singlePdfNetPayoutA, bulkModalPayA, 'Mismatch: Bulk PDF does not match Bulk modal table');

console.log('✓ Discrepancies successfully reproduced and mathematically verified!\n');

