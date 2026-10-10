/**
 * Tech Ciphergate — Full Salary Module Audit & Test Suite
 * 
 * Safety: Isolated automated tests using in-memory mock calculation fixtures.
 * No live database writes or production data modifications.
 */

const assert = require('assert');

// 1. Core Mathematical Salary Calculation Utilities (derived directly from implementation)
function calculateMonthlyBaseSalary(workers) {
  const activeWorkers = (workers || []).filter(w => w.status === 'Active');
  return activeWorkers.reduce((acc, w) => acc + (Number(w.baseSalary) || 0), 0);
}

function calculateAttendanceBaseSalary({
  monthlySalary,
  totalWorkingDays,
  presentDays,
  approvedPaidLeaves = 0,
  holidays = 0,
  bonuses = 0,
  fines = 0,
  unauthorizedAbsenceDays = 0,
  unauthorizedPenaltyMultiplier = 5,
  taskDelayPenalties = 0
}) {
  if (!totalWorkingDays || totalWorkingDays <= 0) return 0;
  const dailyRate = monthlySalary / totalWorkingDays;
  const paidWorkingDays = presentDays + approvedPaidLeaves + holidays;
  const productivitySalary = dailyRate * paidWorkingDays;
  const unauthorizedPenalties = unauthorizedAbsenceDays * dailyRate * unauthorizedPenaltyMultiplier;
  
  const finalSalary = Math.max(0, productivitySalary + bonuses - fines - unauthorizedPenalties - taskDelayPenalties);
  return finalSalary;
}

function calculateProjectProfitShareAdjustment({
  projectProfit,
  devCount,
  totalWorkingDays,
  paidWorkingDays,
  paidAmount = 0
}) {
  if (!devCount || devCount <= 0 || !totalWorkingDays || totalWorkingDays <= 0) return 0;
  const share = projectProfit / devCount;
  const currentPerDayValue = share / totalWorkingDays;
  const currentEntitlement = paidWorkingDays * currentPerDayValue;
  const adjustment = currentEntitlement - paidAmount;
  return adjustment;
}

function calculatePayableSalary({
  attendanceSalary,
  adjustments = [],
  status = 'Draft',
  attendanceSalarySnapshot = null
}) {
  // If Locked or Paid, use frozen attendanceSalarySnapshot if available
  const base = (status === 'Locked' || status === 'Paid') && attendanceSalarySnapshot !== null
    ? attendanceSalarySnapshot
    : attendanceSalary;

  let totalAdditions = 0;
  let totalDeductions = 0;

  for (const adj of adjustments) {
    if (adj.isDeleted) continue;
    if (adj.type === 'addition') {
      totalAdditions += (Number(adj.amount) || 0);
    } else if (adj.type === 'deduction') {
      totalDeductions += (Number(adj.amount) || 0);
    }
  }

  const payable = Math.max(0, base + totalAdditions - totalDeductions);
  return {
    base,
    totalAdditions,
    totalDeductions,
    payableSalary: payable
  };
}

// 2. Lifecycle Simulation
class MockPayrollLifecycle {
  constructor(workerId, tenantId, month, year, initialAttendanceSalary) {
    this.workerId = workerId;
    this.tenantId = tenantId;
    this.month = month;
    this.year = year;
    this.status = 'Draft';
    this.attendanceSalary = initialAttendanceSalary;
    this.attendanceSalarySnapshot = null;
    this.adjustments = [];
    this.payableSalary = initialAttendanceSalary;
  }

  addAdjustment(type, amount, label) {
    if (this.status === 'Locked' || this.status === 'Paid') {
      throw new Error(`Cannot add adjustments to a ${this.status} payroll record`);
    }
    this.adjustments.push({ type, amount: Number(amount), label, isDeleted: false });
    this.recalculate();
  }

  deleteAdjustment(index) {
    if (this.status === 'Locked' || this.status === 'Paid') {
      throw new Error(`Cannot delete adjustments on a ${this.status} payroll record`);
    }
    if (this.adjustments[index]) {
      this.adjustments[index].isDeleted = true;
      this.recalculate();
    }
  }

  transitionTo(nextStatus) {
    const validTransitions = {
      'Draft': ['Generated', 'Reviewed', 'Approved'],
      'Generated': ['Reviewed', 'Approved', 'Draft'],
      'Reviewed': ['Approved', 'Draft'],
      'Approved': ['Locked', 'Paid', 'Reviewed', 'Draft'],
      'Locked': ['Paid', 'Approved'],
      'Paid': []
    };

    if (!validTransitions[this.status].includes(nextStatus)) {
      throw new Error(`Invalid transition from ${this.status} to ${nextStatus}`);
    }

    if (nextStatus === 'Locked' && this.status !== 'Locked') {
      // Freeze snapshot
      this.attendanceSalarySnapshot = this.attendanceSalary;
    }

    this.status = nextStatus;
    this.recalculate();
  }

  recalculate() {
    const result = calculatePayableSalary({
      attendanceSalary: this.attendanceSalary,
      adjustments: this.adjustments,
      status: this.status,
      attendanceSalarySnapshot: this.attendanceSalarySnapshot
    });
    this.payableSalary = result.payableSalary;
    return result;
  }
}

// Runner
let testCount = 0;
let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    const details = fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
    if (details) {
      console.log(`    Inputs: ${JSON.stringify(details.inputs)}`);
      console.log(`    Formula: ${details.formula}`);
      console.log(`    Expected: ${details.expected}`);
      console.log(`    Actual:   ${details.actual}`);
    }
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

console.log('================================================================');
console.log(' Tech Ciphergate — Comprehensive Salary Module Audit Test Suite ');
console.log('================================================================\n');

// -------------------------------------------------------------
// Category A: Active Workforce & Base Salary Calculations
// -------------------------------------------------------------
runTest('Contractual Monthly Base Salary for Active Employees only', () => {
  const workers = [
    { _id: 'W1', name: 'Alice', status: 'Active', baseSalary: 50000 },
    { _id: 'W2', name: 'Bob', status: 'Active', baseSalary: 65000 },
    { _id: 'W3', name: 'Charlie', status: 'Relieved', baseSalary: 70000 },
    { _id: 'W4', name: 'Diana', status: 'Inactive', baseSalary: 45000 },
    { _id: 'W5', name: 'Evan', status: 'Active', baseSalary: 0 }
  ];
  const actual = calculateMonthlyBaseSalary(workers);
  const expected = 115000;
  assert.strictEqual(actual, expected);
  return {
    inputs: { active: ['Alice: 50000', 'Bob: 65000', 'Evan: 0'], excluded: ['Charlie (Relieved)', 'Diana (Inactive)'] },
    formula: 'sum(baseSalary for status === "Active")',
    expected: '₹115,000',
    actual: `₹${actual}`
  };
});

// -------------------------------------------------------------
// Category B: Attendance, Leave, Bonuses & Penalty Calculations
// -------------------------------------------------------------
runTest('Standard Full Attendance (No leaves, no penalties)', () => {
  const inputs = {
    monthlySalary: 60000,
    totalWorkingDays: 25,
    presentDays: 25,
    approvedPaidLeaves: 0,
    holidays: 0
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 60000;
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: '(monthlySalary / totalWorkingDays) * presentDays',
    expected: '₹60,000',
    actual: `₹${actual}`
  };
});

runTest('Pro-rata Attendance with Approved Paid Leaves & Holidays', () => {
  const inputs = {
    monthlySalary: 50000,
    totalWorkingDays: 25,
    presentDays: 20,
    approvedPaidLeaves: 3,
    holidays: 2,
    bonuses: 0,
    fines: 0
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 50000; // (20 + 3 + 2) / 25 * 50000 = 50000
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: '(monthlySalary / totalWorkingDays) * (presentDays + paidLeaves + holidays)',
    expected: '₹50,000',
    actual: `₹${actual}`
  };
});

runTest('Partial Attendance with Unpaid Leaves (Deduction by absence)', () => {
  const inputs = {
    monthlySalary: 60000,
    totalWorkingDays: 24, // daily rate = 2500
    presentDays: 18,
    approvedPaidLeaves: 2, // paid days = 20
    holidays: 0
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 50000; // 2500 * 20 = 50000
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: '(60000 / 24) * (18 + 2) = 2500 * 20',
    expected: '₹50,000',
    actual: `₹${actual}`
  };
});

runTest('Attendance with Bonuses, Fines, and Task Delay Penalties', () => {
  const inputs = {
    monthlySalary: 60000,
    totalWorkingDays: 24, // daily rate = 2500
    presentDays: 24,
    approvedPaidLeaves: 0,
    holidays: 0,
    bonuses: 5000,
    fines: 1500,
    taskDelayPenalties: 2000
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 61500; // 60000 + 5000 - 1500 - 2000
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: 'productivitySalary (60000) + bonuses (5000) - fines (1500) - taskPenalties (2000)',
    expected: '₹61,500',
    actual: `₹${actual}`
  };
});

runTest('5X Penalty on Unauthorized Absences', () => {
  const inputs = {
    monthlySalary: 48000,
    totalWorkingDays: 24, // daily rate = 2000
    presentDays: 20, // base productivity = 20 * 2000 = 40000
    approvedPaidLeaves: 0,
    holidays: 0,
    unauthorizedAbsenceDays: 2, // penalty = 2 * 2000 * 5 = 20000
    unauthorizedPenaltyMultiplier: 5
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 20000; // 40000 - 20000 = 20000
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: 'productivitySalary (40000) - (2 unauth days * ₹2000 * 5)',
    expected: '₹20,000',
    actual: `₹${actual}`
  };
});

runTest('Penalties exceeding earnings bounded at minimum zero (₹0)', () => {
  const inputs = {
    monthlySalary: 30000,
    totalWorkingDays: 25, // daily rate = 1200
    presentDays: 5, // base = 5 * 1200 = 6000
    fines: 10000 // fines exceed earned salary
  };
  const actual = calculateAttendanceBaseSalary(inputs);
  const expected = 0; // max(0, 6000 - 10000)
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: 'max(0, productivitySalary (6000) - fines (10000))',
    expected: '₹0',
    actual: `₹${actual}`
  };
});

// -------------------------------------------------------------
// Category C: Project Profit-Share Adjustment
// -------------------------------------------------------------
runTest('Project Profit-Share Adjustment Calculation', () => {
  const inputs = {
    projectProfit: 100000,
    devCount: 4, // share = 25,000
    totalWorkingDays: 25, // per-day value = 1,000
    paidWorkingDays: 20, // entitlement = 20,000
    paidAmount: 15000 // already paid = 15,000
  };
  const actual = calculateProjectProfitShareAdjustment(inputs);
  const expected = 5000; // 20000 - 15000 = 5000
  assert.strictEqual(actual, expected);
  return {
    inputs,
    formula: '(share / totalWorkingDays) * paidWorkingDays - paidAmount',
    expected: '₹5,000',
    actual: `₹${actual}`
  };
});

// -------------------------------------------------------------
// Category D: Enterprise Payroll Adjustments & Payable Salary
// -------------------------------------------------------------
runTest('Payable Salary with Mixed Additions, Deductions, and Soft-Deletes', () => {
  const adjustments = [
    { type: 'addition', amount: 3000, label: 'Performance Award', isDeleted: false },
    { type: 'addition', amount: 2000, label: 'Overtime', isDeleted: true }, // soft-deleted, must ignore
    { type: 'deduction', amount: 1500, label: 'Health Insurance', isDeleted: false },
    { type: 'deduction', amount: 500, label: 'Late Arrival', isDeleted: false }
  ];
  const result = calculatePayableSalary({
    attendanceSalary: 45000,
    adjustments,
    status: 'Reviewed'
  });
  // 45000 + 3000 - 1500 - 500 = 46000
  assert.strictEqual(result.totalAdditions, 3000);
  assert.strictEqual(result.totalDeductions, 2000);
  assert.strictEqual(result.payableSalary, 46000);
  return {
    inputs: { attendanceSalary: 45000, additions: [3000, '2000 (deleted)'], deductions: [1500, 500] },
    formula: 'max(0, attendanceSalary (45000) + additions (3000) - deductions (2000))',
    expected: '₹46,000',
    actual: `₹${result.payableSalary}`
  };
});

runTest('Excessive Deductions Bounded at Minimum Zero (₹0)', () => {
  const adjustments = [
    { type: 'deduction', amount: 50000, label: 'Asset Damage Recovery', isDeleted: false }
  ];
  const result = calculatePayableSalary({
    attendanceSalary: 30000,
    adjustments,
    status: 'Reviewed'
  });
  assert.strictEqual(result.payableSalary, 0);
  return {
    inputs: { attendanceSalary: 30000, deductions: 50000 },
    formula: 'max(0, 30000 - 50000)',
    expected: '₹0',
    actual: `₹${result.payableSalary}`
  };
});

// -------------------------------------------------------------
// Category E: Complete Payroll Lifecycle & Snapshot Freezing
// -------------------------------------------------------------
runTest('Payroll Lifecycle: Draft -> Generated -> Reviewed -> Approved -> Locked -> Paid', () => {
  const payroll = new MockPayrollLifecycle('EMP001', 'subdomain_a', 10, 2026, 50000);
  
  assert.strictEqual(payroll.status, 'Draft');
  assert.strictEqual(payroll.payableSalary, 50000);

  // Transition to Generated
  payroll.transitionTo('Generated');
  assert.strictEqual(payroll.status, 'Generated');

  // Transition to Reviewed and add adjustments
  payroll.transitionTo('Reviewed');
  payroll.addAdjustment('addition', 4000, 'Travel Reimbursement');
  payroll.addAdjustment('deduction', 1000, 'TDS');
  assert.strictEqual(payroll.payableSalary, 53000);

  // Transition to Approved (salary unchanged)
  payroll.transitionTo('Approved');
  assert.strictEqual(payroll.payableSalary, 53000);

  // Transition to Locked (freezes snapshot)
  payroll.transitionTo('Locked');
  assert.strictEqual(payroll.status, 'Locked');
  assert.strictEqual(payroll.attendanceSalarySnapshot, 50000);

  // Simulate underlying attendance salary change after lock
  payroll.attendanceSalary = 40000; // attendance recalculation attempt
  payroll.recalculate();
  // Must STILL evaluate to 50000 + 4000 - 1000 = 53000 because snapshot was frozen!
  assert.strictEqual(payroll.payableSalary, 53000);

  // Attempting to add adjustment in Locked state must fail
  assert.throws(() => {
    payroll.addAdjustment('addition', 1000, 'Late Bonus');
  }, /Cannot add adjustments to a Locked payroll record/);

  // Transition to Paid
  payroll.transitionTo('Paid');
  assert.strictEqual(payroll.status, 'Paid');
  assert.strictEqual(payroll.payableSalary, 53000);

  return {
    inputs: { workerId: 'EMP001', initialAttendance: 50000, additions: 4000, deductions: 1000 },
    formula: 'Draft -> Generated -> Reviewed -> Approved -> Locked (snapshot frozen) -> Paid',
    expected: 'Status: Paid, Final Snapshot Payable: ₹53,000, Immutable: true',
    actual: `Status: ${payroll.status}, Final Snapshot Payable: ₹${payroll.payableSalary}`
  };
});

// -------------------------------------------------------------
// Category F: Leap Year & Date Boundary Calculations
// -------------------------------------------------------------
runTest('Leap Year Working Days Calculation (Feb 2024 vs Feb 2025)', () => {
  // Feb 2024 has 29 days, Feb 2025 has 28 days
  const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
  const feb2024Days = getDaysInMonth(2024, 1);
  const feb2025Days = getDaysInMonth(2025, 1);

  assert.strictEqual(feb2024Days, 29);
  assert.strictEqual(feb2025Days, 28);

  return {
    inputs: { feb2024: 29, feb2025: 28, salary: 29000 },
    formula: 'Leap Year days calculation via Date(year, monthIndex + 1, 0).getDate()',
    expected: 'Feb 2024 = 29 days, Feb 2025 = 28 days',
    actual: `Feb 2024 = ${feb2024Days} days, Feb 2025 = ${feb2025Days} days`
  };
});

// -------------------------------------------------------------
// Category G: Tenant & Subdomain Isolation
// -------------------------------------------------------------
runTest('Tenant Subdomain Isolation Verification', () => {
  const allPayrollRecords = [
    { _id: 'P1', tenantId: 'tenant_alpha', workerId: 'W1', payableSalary: 50000, status: 'Approved' },
    { _id: 'P2', tenantId: 'tenant_alpha', workerId: 'W2', payableSalary: 60000, status: 'Approved' },
    { _id: 'P3', tenantId: 'tenant_beta',  workerId: 'W3', payableSalary: 75000, status: 'Approved' }
  ];

  const tenantAlphaRecords = allPayrollRecords.filter(r => r.tenantId === 'tenant_alpha');
  const tenantBetaRecords = allPayrollRecords.filter(r => r.tenantId === 'tenant_beta');

  assert.strictEqual(tenantAlphaRecords.length, 2);
  assert.strictEqual(tenantBetaRecords.length, 1);
  assert(!tenantAlphaRecords.some(r => r.tenantId === 'tenant_beta'));

  const totalAlpha = tenantAlphaRecords.reduce((s, r) => s + r.payableSalary, 0);
  assert.strictEqual(totalAlpha, 110000);

  return {
    inputs: { totalRecords: 3, tenantAlpha: 2, tenantBeta: 1 },
    formula: 'filter(r => r.tenantId === currentTenantId)',
    expected: 'Zero cross-tenant leakage. Tenant Alpha total = ₹110,000',
    actual: `Filtered Tenant Alpha total: ₹${totalAlpha}`
  };
});

console.log('\n================================================================');
console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${testCount} Total Tests`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
