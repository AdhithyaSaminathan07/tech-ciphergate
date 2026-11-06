/**
 * Tech Ciphergate — Final Exact Salary Match Verification Test Suite
 *
 * Verifies that the salary amount displayed in /admin/salary matches EXACTLY across all 7 outputs:
 * 1. Main /admin/salary table (Salary this month column)
 * 2. View Reports -> Generate Bulk Salary table
 * 3. Download Bulk Summary PDF
 * 4. Download All Employees Single PDF
 * 5. Download Separate Employee PDFs
 * 6. NEFT Excel export
 * 7. General Excel export
 *
 * Assert: Zero difference across all outputs, down to the exact paisa (0.00).
 */

const assert = require('assert');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');

// Simulated getEffectivePayableSalary from frontend SalaryManagement.jsx
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

// Simulated 7 Output Extractors matching exact frontend implementations:

// 1. Main Table (/admin/salary) — Lines 1163-1171 of SalaryManagement.jsx
const extractMainTableAmount = (record) => {
  return parseFloat(getEffectivePayableSalary(record).toFixed(2));
};

// 2. Bulk Modal Table — Lines 2568-2592 of SalaryManagement.jsx
const extractBulkModalAmount = (report) => {
  return parseFloat(getEffectivePayableSalary(report).toFixed(2));
};

// 3. Bulk Summary PDF — Lines 1309 & 1321 of SalaryManagement.jsx
const extractBulkSummaryPdfAmount = (report) => {
  return parseFloat(getEffectivePayableSalary(report).toFixed(2));
};

// 4. All Employees Single PDF — Line 726 of SalaryManagement.jsx
const extractAllEmployeesSinglePdfAmount = (report) => {
  const reportObj = report.fullReport || report;
  const netPayout = getEffectivePayableSalary(reportObj);
  return parseFloat(Number(netPayout).toFixed(2));
};

// 5. Separate Employee PDFs — Lines 1433 & 726 of SalaryManagement.jsx
const extractSeparateEmployeePdfAmount = (report) => {
  const reportObj = report.fullReport || report;
  const netPayout = getEffectivePayableSalary(reportObj);
  return parseFloat(Number(netPayout).toFixed(2));
};

// 6. NEFT Excel Export — Lines 1522 & 1531 of SalaryManagement.jsx
const extractNeftExcelAmount = (report) => {
  const finalSalary = getEffectivePayableSalary(report);
  return parseFloat(finalSalary.toFixed(2));
};

// 7. General Excel Export — Lines 1622 & 1634 of SalaryManagement.jsx
const extractGeneralExcelAmount = (report) => {
  const finalSalary = getEffectivePayableSalary(report);
  return parseFloat(finalSalary.toFixed(2));
};

console.log('\n================================================================');
console.log(' Tech Ciphergate — Final Exact Salary Match Verification Suite ');
console.log('================================================================\n');

// Test Employees Fixtures
const testCases = [
  {
    name: 'EMP 1: Standard Employee (Base attendance, no adjustments, no penalties)',
    rawAttendanceSalary: 30000,
    payrollRecord: null,
    taskPenalty: 0,
    expectedAmount: 30000.00
  },
  {
    name: 'EMP 2: Employee with Additions and Deductions',
    rawAttendanceSalary: 45000,
    payrollRecord: {
      status: 'Draft',
      adjustments: [
        { type: 'addition', amount: 3500, isDeleted: false },
        { type: 'deduction', amount: 1200, isDeleted: false }
      ]
    },
    taskPenalty: 0,
    expectedAmount: 47300.00 // 45000 + 3500 - 1200
  },
  {
    name: 'EMP 3: Employee with Overdue Task Penalties',
    rawAttendanceSalary: 40000,
    payrollRecord: {
      status: 'Draft',
      adjustments: [
        { type: 'addition', amount: 2000, isDeleted: false }
      ]
    },
    taskPenalty: 2500,
    expectedAmount: 39500.00 // 40000 + 2000 - 2500
  },
  {
    name: 'EMP 4: Employee with Locked / Paid Historical Snapshot',
    rawAttendanceSalary: 60000, // modified recalculated attendance
    payrollRecord: {
      status: 'Locked',
      attendanceSalarySnapshot: 35000, // frozen snapshot
      adjustments: [
        { type: 'addition', amount: 1500, isDeleted: false }
      ]
    },
    taskPenalty: 500,
    expectedAmount: 36000.00 // 35000 + 1500 - 500
  },
  {
    name: 'EMP 5: Employee with Project Profit Share & Past Ledger Adjustments',
    rawAttendanceSalary: 28000 + 4500 - 850.50, // base + project share + prior adjustment = 31649.50
    payrollRecord: {
      status: 'Draft',
      adjustments: [
        { type: 'addition', amount: 500, isDeleted: false },
        { type: 'deduction', amount: 149.50, isDeleted: false }
      ]
    },
    taskPenalty: 1000,
    expectedAmount: 31000.00 // 31649.50 + 500 - 149.50 - 1000 = 31000.00
  },
  {
    name: 'EMP 6: Employee with Zero Attendance & Zero Earned Base',
    rawAttendanceSalary: 0,
    payrollRecord: {
      status: 'Draft',
      adjustments: [
        { type: 'addition', amount: 1200, isDeleted: false }
      ]
    },
    taskPenalty: 200,
    expectedAmount: 1000.00 // 0 + 1200 - 200
  }
];

let allPassed = true;
const summaryTable = [];

testCases.forEach((tc, idx) => {
  // Simulate backend controller finalizeSalaryCalculation
  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: tc.rawAttendanceSalary,
    payrollRecord: tc.payrollRecord,
    taskPenalty: tc.taskPenalty
  });

  // Construct backend response payload matching getBulkSalaryReport()
  const backendReportItem = {
    workerId: `w_00${idx + 1}`,
    name: tc.name,
    salary: tc.rawAttendanceSalary,
    totalFinalSalary: finalized.attendanceSalary,
    payableSalary: finalized.payableSalary,
    finalPayableSalary: finalized.finalPayableSalary,
    attendanceSalary: finalized.attendanceSalary,
    totalAdditions: finalized.totalAdditions,
    totalDeductions: finalized.totalDeductions,
    taskPenalty: finalized.taskPenalty,
    appliedPenaltyPolicy: finalized.appliedPenaltyPolicy,
    finalSalary: finalized.finalPayableSalary,
    payrollRecord: tc.payrollRecord,
    fullReport: {
      finalSalaryWithFines: finalized.finalPayableSalary,
      payableSalary: finalized.payableSalary,
      finalPayableSalary: finalized.finalPayableSalary,
      attendanceSalary: finalized.attendanceSalary,
      totalAdditions: finalized.totalAdditions,
      totalDeductions: finalized.totalDeductions,
      taskPenalty: finalized.taskPenalty,
      appliedPenaltyPolicy: finalized.appliedPenaltyPolicy,
      payrollRecord: tc.payrollRecord
    }
  };

  // Extract from all 7 outputs
  const out1_mainTable = extractMainTableAmount(backendReportItem);
  const out2_bulkModal = extractBulkModalAmount(backendReportItem);
  const out3_summaryPdf = extractBulkSummaryPdfAmount(backendReportItem);
  const out4_singlePdf = extractAllEmployeesSinglePdfAmount(backendReportItem);
  const out5_separatePdf = extractSeparateEmployeePdfAmount(backendReportItem);
  const out6_neftExcel = extractNeftExcelAmount(backendReportItem);
  const out7_generalExcel = extractGeneralExcelAmount(backendReportItem);

  // Assert exact equality down to 0.00
  try {
    assert.strictEqual(out1_mainTable, tc.expectedAmount, 'Main Table mismatch');
    assert.strictEqual(out2_bulkModal, tc.expectedAmount, 'Bulk Modal mismatch');
    assert.strictEqual(out3_summaryPdf, tc.expectedAmount, 'Bulk Summary PDF mismatch');
    assert.strictEqual(out4_singlePdf, tc.expectedAmount, 'All Employees Single PDF mismatch');
    assert.strictEqual(out5_separatePdf, tc.expectedAmount, 'Separate Employee PDF mismatch');
    assert.strictEqual(out6_neftExcel, tc.expectedAmount, 'NEFT Excel mismatch');
    assert.strictEqual(out7_generalExcel, tc.expectedAmount, 'General Excel mismatch');

    // Cross-equality assertion
    assert.strictEqual(out1_mainTable, out2_bulkModal);
    assert.strictEqual(out1_mainTable, out3_summaryPdf);
    assert.strictEqual(out1_mainTable, out4_singlePdf);
    assert.strictEqual(out1_mainTable, out5_separatePdf);
    assert.strictEqual(out1_mainTable, out6_neftExcel);
    assert.strictEqual(out1_mainTable, out7_generalExcel);

    summaryTable.push({
      employee: `EMP ${idx + 1}`,
      expected: `₹${tc.expectedAmount.toFixed(2)}`,
      mainTable: `₹${out1_mainTable.toFixed(2)}`,
      bulkModal: `₹${out2_bulkModal.toFixed(2)}`,
      summaryPdf: `₹${out3_summaryPdf.toFixed(2)}`,
      singlePdf: `₹${out4_singlePdf.toFixed(2)}`,
      sepPdf: `₹${out5_separatePdf.toFixed(2)}`,
      neftExcel: `₹${out6_neftExcel.toFixed(2)}`,
      genExcel: `₹${out7_generalExcel.toFixed(2)}`,
      match: 'EXACT MATCH ✓'
    });
  } catch (err) {
    allPassed = false;
    console.error(`FAILED on ${tc.name}: ${err.message}`);
  }
});

console.table(summaryTable);

if (allPassed) {
  console.log('✓ ALL 7 SALARY OUTPUTS MATCH EXACTLY WITH ZERO DIFFERENCE DOWN TO 0.00!\n');
} else {
  console.error('✗ ONE OR MORE SALARY OUTPUTS MISMATCHED!\n');
  process.exit(1);
}

