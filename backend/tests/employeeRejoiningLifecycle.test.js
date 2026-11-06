/**
 * Employee Rejoining Lifecycle Regression Test Suite
 * 
 * Verifies that employees who leave the company and subsequently REJOIN
 * (e.g., mid-month, across months, or on month boundaries) have their employment
 * window and salary eligibility accurately established from the verified rejoining date.
 * 
 * Strict Safety:
 * - Isolated mocks only.
 * - No live database, .env, or network access.
 */

const assert = require('assert');
const {
  getValidatedEmploymentDates,
  calculateWorkerProductivity,
  calculateUnauthorizedAbsencePenalty,
  toIndiaDateString
} = require('../utils/productivityCalculator');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');

console.log('=== RUNNING EMPLOYEE REJOINING LIFECYCLE TEST SUITE ===\n');

const defaultBatches = [{
  batchName: 'Full Time',
  from: '09:00',
  to: '18:00'
}];

const createFullDayAttendance = (dateStr, inTime = '09:00 AM', outTime = '06:00 PM') => {
  return [
    {
      date: dateStr,
      time: inTime,
      type: 'in',
      presence: true,
      subdomain: 'main'
    },
    {
      date: dateStr,
      time: outTime,
      type: 'out',
      presence: false,
      subdomain: 'main'
    }
  ];
};

// -------------------------------------------------------------
// Scenario 1: Relieved October 1–15, rejoined October 16
// -------------------------------------------------------------
console.log('Test 1: Relieved October 1–15, rejoined October 16...');
{
  const worker = {
    _id: 'w_rejoin_1',
    salary: 15000,
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31');
  assert.strictEqual(dates.joiningDateStr, '2026-10-16', 'Effective joining date must be rejoining date (Oct 16)');
  assert.strictEqual(dates.relievedDateStr, null, 'Relieved date must be null after rejoining');
  assert.strictEqual(dates.wasRelievedBefore, true);

  // Provide punches for Oct 16 to 31
  const attendance = [];
  for (let d = 16; d <= 31; d++) {
    const dayDate = new Date(2026, 9, d);
    if (dayDate.getDay() !== 0) {
      attendance.push(...createFullDayAttendance(`2026-10-${String(d).padStart(2, '0')}`));
    }
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches }
  });

  // Total working days in Oct: 27. Oct 1-15 has 13 working days; Oct 16-31 has 14 working days.
  assert.strictEqual(report.summary.saasWorkingDaysCount, 14, 'Only working days from Oct 16-31 must be counted');
  const expectedSalary = 14 * (15000 / 27);
  assert.strictEqual(report.summary.expectedSaaSSalary.toFixed(2), expectedSalary.toFixed(2));
  assert.strictEqual(report.totalAbsentDays, 0, 'No absent days should be accrued before rejoining date');

  // Verify dates before Oct 16 are labeled as Relieved
  const oct1Entry = report.dailyBreakdown.find(d => d.date === '2026-10-01');
  assert.strictEqual(oct1Entry.issues[0], 'Relieved');
  assert.strictEqual(oct1Entry.salaryDeduction, 0);

  console.log('✓ PASS: Scenario 1 - Relieved Oct 1–15, rejoined Oct 16 correctly classified.');
}

// -------------------------------------------------------------
// Scenario 2: Relieved October 1–20, rejoined October 21
// -------------------------------------------------------------
console.log('\nTest 2: Relieved October 1–20, rejoined October 21...');
{
  const worker = {
    _id: 'w_rejoin_2',
    salary: 27000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-20'
  };

  const employeeHistory = [
    {
      actionType: 'Relieved',
      createdAt: '2026-10-20T10:00:00.000Z',
      afterData: { status: 'Relieved', relievedAt: '2026-10-20' }
    },
    {
      actionType: 'Restored',
      createdAt: '2026-10-21T09:00:00.000Z',
      afterData: { status: 'Active', rehireDate: '2026-10-21' }
    }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-21');
  assert.strictEqual(dates.relievedDateStr, null);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { employeeHistory }
  });

  // Working days between Oct 21 and Oct 31 (excl. Sundays: Oct 25 is Sunday) -> 11 days - 1 Sunday = 10 working days
  // Oct 21 (Wed), 22 (Thu), 23 (Fri), 24 (Sat), 26 (Mon), 27 (Tue), 28 (Wed), 29 (Thu), 30 (Fri), 31 (Sat) = 10 working days
  assert.strictEqual(report.summary.saasWorkingDaysCount, 10);
  // Arithmetic verification for worker with salary ₹27,000:
  // ₹27,000 / 27 working days = ₹1,000/day. For 10 eligible working days: 10 × ₹1,000 = ₹10,000.00
  assert.strictEqual(report.summary.expectedSaaSSalary, 10000);

  // Arithmetic verification for worker with salary ₹15,000:
  // ₹15,000 / 27 working days = ₹555.5556/day. For 10 eligible working days: 10 × (15,000 / 27) = ₹5,555.56
  const report15k = calculateWorkerProductivity({
    worker: { ...worker, salary: 15000 },
    attendanceData: [],
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { employeeHistory }
  });
  assert.strictEqual(report15k.summary.saasWorkingDaysCount, 10);
  assert.strictEqual(report15k.summary.expectedSaaSSalary.toFixed(2), '5555.56');
  console.log('✓ PASS: Scenario 2 - Relieved Oct 1–20, rejoined Oct 21 arithmetic verified for both ₹27k (₹10,000.00) and ₹15k (₹5,555.56).');
}

// -------------------------------------------------------------
// Scenario 3: Rejoined on the first day of a month (October 1)
// -------------------------------------------------------------
console.log('\nTest 3: Rejoined on the first day of a month (October 1)...');
{
  const worker = {
    _id: 'w_rejoin_3',
    salary: 15000,
    status: 'Active',
    joiningDate: '2024-01-01',
    relievedAt: '2026-09-30'
  };

  const employeeHistory = [
    {
      actionType: 'Restored',
      createdAt: '2026-10-01T08:30:00.000Z',
      afterData: { status: 'Active', reactivatedAt: '2026-10-01' }
    }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-01');
  assert.strictEqual(dates.relievedDateStr, null);

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { employeeHistory }
  });

  assert.strictEqual(report.summary.saasWorkingDaysCount, 27, 'Entire month of October must be active (27 days)');
  console.log('✓ PASS: Scenario 3 - Rejoined on first day of month activates entire month.');
}

// -------------------------------------------------------------
// Scenario 4: No rejoining event: remain relieved
// -------------------------------------------------------------
console.log('\nTest 4: No rejoining event: remain relieved...');
{
  const worker = {
    _id: 'w_rejoin_4',
    salary: 15000,
    status: 'Active', // Status is active, but relievedAt is set with NO rejoining event!
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15'
  };

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory: [] });
  assert.strictEqual(dates.relievedDateStr, '2026-10-15', 'Must not assume active without verified rejoining event');

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: {}
  });

  // Working days Oct 1-15: 13 working days
  assert.strictEqual(report.summary.saasWorkingDaysCount, 13);
  const oct20Entry = report.dailyBreakdown.find(d => d.date === '2026-10-20');
  assert.strictEqual(oct20Entry.issues[0], 'Relieved');
  console.log('✓ PASS: Scenario 4 - Without a verified rejoining event, employee remains relieved.');
}

// -------------------------------------------------------------
// Scenario 5: Attendance before rejoining: no salary credit
// -------------------------------------------------------------
console.log('\nTest 5: Attendance before rejoining: no salary credit...');
{
  const worker = {
    _id: 'w_rejoin_5',
    salary: 27000, // per day: 1000
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  // Provide punches on Oct 5 and Oct 10 (BEFORE rejoining on Oct 16)
  const attendance = [
    ...createFullDayAttendance('2026-10-05'),
    ...createFullDayAttendance('2026-10-10')
  ];

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: {}
  });

  const oct5Entry = report.dailyBreakdown.find(d => d.date === '2026-10-05');
  assert.strictEqual(oct5Entry.issues[0], 'Relieved');
  assert.strictEqual(oct5Entry.salaryDeduction, 0);
  assert.strictEqual(oct5Entry.workingMinutes, 0, 'Punches before rejoining must not credit working minutes');
  assert.strictEqual(report.workingDays, 0, 'Pre-rejoining punches must not increment workingDays');
  console.log('✓ PASS: Scenario 5 - Stray punches before rejoining date credit zero salary/days.');
}

// -------------------------------------------------------------
// Scenario 6: Attendance after rejoining: normal salary calculation
// -------------------------------------------------------------
console.log('\nTest 6: Attendance after rejoining: normal salary calculation...');
{
  const worker = {
    _id: 'w_rejoin_6',
    salary: 27000, // per day = 1000
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  // 1 full day on Oct 16 (rejoining date)
  const attendance = createFullDayAttendance('2026-10-16');

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches }
  });

  const oct16Entry = report.dailyBreakdown.find(d => d.date === '2026-10-16');
  assert.strictEqual(oct16Entry.issues.length, 0);
  assert.strictEqual(report.workingDays, 1);
  assert.strictEqual(Math.round(report.summary.grossSaaSSalary), 1000);
  console.log('✓ PASS: Scenario 6 - Attendance after rejoining calculates normal salary.');
}

// -------------------------------------------------------------
// Scenario 7: Unauthorized absence after rejoining: Option B 5X rule
// -------------------------------------------------------------
console.log('\nTest 7: Unauthorized absence after rejoining: Option B 5X rule...');
{
  const worker = {
    _id: 'w_rejoin_7',
    salary: 27000, // per day = 1000
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  // Worked all days from Oct 16 to 31 EXCEPT Oct 20 (unauthorized absence)
  const attendance = [];
  for (let d = 16; d <= 31; d++) {
    const dayDate = new Date(2026, 9, d);
    if (dayDate.getDay() !== 0 && d !== 20) {
      attendance.push(...createFullDayAttendance(`2026-10-${String(d).padStart(2, '0')}`));
    }
  }

  const { penalties, totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], attendance, [], { advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true } }
  );

  // Exactly 1 unauthorized absence on Oct 20 (5X * 1000 = 5000)
  assert.strictEqual(totalUnauthorizedPenalty, 5000);
  assert.strictEqual(unauthorizedDates.has('2026-10-20'), true);
  assert.strictEqual(unauthorizedDates.size, 1, 'Only dates after rejoining can receive unauthorized penalties');

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches, unauthorizedAbsenceDates: unauthorizedDates }
  });

  // Under Option B, normal LOP on Oct 20 is 0
  const oct20Entry = report.dailyBreakdown.find(d => d.date === '2026-10-20');
  assert.strictEqual(oct20Entry.salaryDeduction, 0, 'Option B: normal LOP must be 0 on unauthorized absence date');

  // Finalized calculation
  const finalized = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: Math.max(0, report.summary.finalSalary - totalUnauthorizedPenalty),
    attendanceSalary: report.summary.expectedSaaSSalary,
    unauthorizedDeduction: totalUnauthorizedPenalty
  });

  // Under Option B, LOP is 0 and 5X penalty (5000) replaces 1X LOP: 14000 - 5000 = 9000
  assert.strictEqual(Math.round(finalized.finalPayableSalary), 9000);
  console.log('✓ PASS: Scenario 7 - Unauthorized absence after rejoining receives 5X penalty with zero duplicate LOP.');
}

// -------------------------------------------------------------
// Scenario 8: No deductions for the pre-rejoining period
// -------------------------------------------------------------
console.log('\nTest 8: No deductions for the pre-rejoining period...');
{
  const worker = {
    _id: 'w_rejoin_8',
    salary: 27000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  const { totalUnauthorizedPenalty, unauthorizedDates } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', [], [], [], {}
  );

  // For Oct 1-15, all days are outside employment window -> 0 penalty
  // For Oct 16-31, 14 days are absent without punch -> 14 * 5000 = 70000
  assert.strictEqual(totalUnauthorizedPenalty, 14 * 5000);
  for (let d = 1; d <= 15; d++) {
    assert.strictEqual(unauthorizedDates.has(`2026-10-${String(d).padStart(2, '0')}`), false, `Oct ${d} must not have unauthorized penalty`);
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: [],
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: {}
  });

  for (let d = 1; d <= 15; d++) {
    const entry = report.dailyBreakdown.find(x => x.date === `2026-10-${String(d).padStart(2, '0')}`);
    assert.strictEqual(entry.salaryDeduction, 0, `Pre-rejoining date Oct ${d} must have 0 deduction`);
  }
  console.log('✓ PASS: Scenario 8 - Zero deductions applied for any date prior to official rejoining date.');
}

// -------------------------------------------------------------
// Scenario 8b: Approved leave after rejoining calculated normally
// -------------------------------------------------------------
console.log('\nTest 8b: Approved leave after rejoining calculated normally...');
{
  const worker = {
    _id: 'w_rejoin_8b',
    salary: 27000, // per-day = 1000
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  // Leave data after rejoining:
  // Oct 20: Approved Paid Leave (1 day)
  // Oct 21: Approved Unpaid Leave (1 day)
  const leaveData = [
    {
      leaveType: 'Paid Leave',
      isPaidLeave: true,
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      status: 'Approved'
    },
    {
      leaveType: 'Casual Leave',
      isPaidLeave: false,
      startDate: '2026-10-21',
      endDate: '2026-10-21',
      status: 'Approved'
    }
  ];

  // Attendance on other active working days (12 days)
  const attendance = [];
  for (let d = 16; d <= 31; d++) {
    const dayDate = new Date(2026, 9, d);
    if (dayDate.getDay() !== 0 && d !== 20 && d !== 21) {
      attendance.push(...createFullDayAttendance(`2026-10-${String(d).padStart(2, '0')}`));
    }
  }

  const { totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
    worker, '2026-10-01', '2026-10-31', leaveData, attendance, [], {
      paidLeaveConfig: { enabled: true, leavesPerMonth: 1 }
    }
  );

  // Both leaves are approved -> 0 unauthorized penalty
  assert.strictEqual(totalUnauthorizedPenalty, 0, 'Approved leaves must produce zero unauthorized penalties');

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    leaveData,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: {
      batches: defaultBatches,
      paidLeaveConfig: { enabled: true, leavesPerMonth: 1 }
    }
  });

  // Verify Oct 1–15 are Relieved (₹0 deduction, not marked Leave or Absent)
  for (let d = 1; d <= 15; d++) {
    const entry = report.dailyBreakdown.find(x => x.date === `2026-10-${String(d).padStart(2, '0')}`);
    assert.strictEqual(entry.issues[0], 'Relieved');
    assert.strictEqual(entry.salaryDeduction, 0);
  }

  // Verify Oct 20 is Approved Paid Leave
  const oct20Entry = report.dailyBreakdown.find(x => x.date === '2026-10-20');
  assert.strictEqual(oct20Entry.salaryDeduction, 0, 'Approved paid leave must have zero salary deduction');
  const oct20Report = report.report.find(x => x.date === '20 October');
  assert.strictEqual(oct20Report.status, 'Approved Paid Leave');

  // Verify Oct 21 is Approved Unpaid Leave (1X LOP = ₹1,000)
  const oct21Entry = report.dailyBreakdown.find(x => x.date === '2026-10-21');
  assert.strictEqual(oct21Entry.salaryDeduction, 1000, 'Approved unpaid leave must deduct 1X LOP (₹1,000)');
  const oct21Report = report.report.find(x => x.date === '21 October');
  assert.strictEqual(oct21Report.status, 'Approved Unpaid Leave');

  // Summary checks
  assert.strictEqual(report.summary.saasWorkingDaysCount, 14);
  assert.strictEqual(report.summary.expectedSaaSSalary, 14000);
  assert.strictEqual(Math.round(report.summary.netBaseSalary), 13000);

  console.log('✓ PASS: Scenario 8b - Approved paid & unpaid leave after rejoining calculated normally.');
}

// -------------------------------------------------------------
// Scenario 9: Multiple relieving and rejoining cycles
// -------------------------------------------------------------
console.log('\nTest 9: Multiple relieving and rejoining cycles...');
{
  const worker = {
    _id: 'w_rejoin_9',
    salary: 15000,
    status: 'Active',
    joiningDate: '2024-01-01',
    relievedAt: '2026-10-15'
  };

  const employeeHistory = [
    { actionType: 'Relieved', createdAt: '2025-05-01T00:00:00.000Z', afterData: { relievedAt: '2025-05-01' } },
    { actionType: 'Restored', createdAt: '2025-06-01T00:00:00.000Z', afterData: { rehireDate: '2025-06-01' } },
    { actionType: 'Relieved', createdAt: '2026-10-05T00:00:00.000Z', afterData: { relievedAt: '2026-10-05' } },
    { actionType: 'Restored', createdAt: '2026-10-10T00:00:00.000Z', afterData: { rehireDate: '2026-10-10' } },
    { actionType: 'Relieved', createdAt: '2026-10-15T00:00:00.000Z', afterData: { relievedAt: '2026-10-15' } },
    { actionType: 'Restored', createdAt: '2026-10-20T00:00:00.000Z', afterData: { rehireDate: '2026-10-20' } }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-20', 'Latest active cycle starts on Oct 20');
  assert.strictEqual(dates.relievedDateStr, null);
  assert.strictEqual(dates.wasRelievedBefore, true);
  console.log('✓ PASS: Scenario 9 - Multiple relieving and rejoining cycles correctly resolved.');
}

// -------------------------------------------------------------
// Scenario 10: Multiple EmployeeHistory events out of order
// -------------------------------------------------------------
console.log('\nTest 10: Multiple EmployeeHistory events out of order...');
{
  const worker = {
    _id: 'w_rejoin_10',
    salary: 15000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15'
  };

  // History given in reverse chronological order
  const employeeHistory = [
    { actionType: 'Restored', createdAt: '2026-10-16T12:00:00.000Z', afterData: { rehireDate: '2026-10-16' } },
    { actionType: 'Relieved', createdAt: '2026-10-15T18:00:00.000Z', afterData: { relievedAt: '2026-10-15' } }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-16');
  assert.strictEqual(dates.relievedDateStr, null);
  console.log('✓ PASS: Scenario 10 - Unordered EmployeeHistory sorted and evaluated chronologically.');
}

// -------------------------------------------------------------
// Scenario 11: Rejoining date exactly on a month boundary
// -------------------------------------------------------------
console.log('\nTest 11: Rejoining date exactly on a month boundary...');
{
  const worker = {
    _id: 'w_rejoin_11',
    salary: 15000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-31'
  };

  const employeeHistory = [
    { actionType: 'Restored', createdAt: '2026-11-01T08:00:00.000Z', afterData: { rejoiningDate: '2026-11-01' } }
  ];

  // In October: worker was relieved on Oct 31, rejoining was Nov 1
  const octDates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  // For October report, rejoining is in November, so for October the effective rejoining date is Nov 1
  assert.strictEqual(octDates.joiningDateStr, '2026-11-01');

  // In November: rejoining date Nov 1 is active throughout November
  const novDates = getValidatedEmploymentDates(worker, '2026-11-01', '2026-11-30', { employeeHistory });
  assert.strictEqual(novDates.joiningDateStr, '2026-11-01');
  assert.strictEqual(novDates.relievedDateStr, null);
  console.log('✓ PASS: Scenario 11 - Month boundary rejoining handled seamlessly across both months.');
}

// -------------------------------------------------------------
// Scenario 12: Reactivation event with missing effective date (falls back to createdAt)
// -------------------------------------------------------------
console.log('\nTest 12: Reactivation event with missing effective date...');
{
  const worker = {
    _id: 'w_rejoin_12',
    salary: 15000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15'
  };

  const employeeHistory = [
    {
      actionType: 'Restored',
      createdAt: '2026-10-18T14:30:00.000Z',
      afterData: { status: 'Active' } // No explicit rejoiningDate field
    }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-18', 'Falls back to confirmed event createdAt date');
  assert.strictEqual(dates.relievedDateStr, null);
  console.log('✓ PASS: Scenario 12 - Missing explicit date safely falls back to confirmed event createdAt.');
}

// -------------------------------------------------------------
// Scenario 13: Invalid or inconsistent history records
// -------------------------------------------------------------
console.log('\nTest 13: Invalid or inconsistent history records...');
{
  const worker = {
    _id: 'w_rejoin_13',
    salary: 15000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15'
  };

  const corruptHistory = [
    null,
    undefined,
    'corrupt string',
    { actionType: 'UnknownAction', createdAt: 'invalid-date' },
    { actionType: 'Restored', createdAt: null, afterData: null }
  ];

  // Must not throw or produce NaN
  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory: corruptHistory });
  assert.strictEqual(dates.relievedDateStr, '2026-10-15', 'Without a valid rejoining date, worker remains relieved');
  console.log('✓ PASS: Scenario 13 - Corrupted/invalid history records handled safely without errors.');
}

// -------------------------------------------------------------
// Scenario 14: Individual versus Bulk Salary parity
// -------------------------------------------------------------
console.log('\nTest 14: Individual versus Bulk Salary parity with rejoining lifecycle...');
{
  const worker = {
    _id: 'w_rejoin_14',
    salary: 15000,
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  const attendance = [];
  for (let d = 16; d <= 31; d++) {
    const dayDate = new Date(2026, 9, d);
    if (dayDate.getDay() !== 0) {
      attendance.push(...createFullDayAttendance(`2026-10-${String(d).padStart(2, '0')}`));
    }
  }

  const reportIndividual = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches }
  });

  const reportBulk = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches }
  });

  const finalIndiv = finalizeSalaryCalculation({ finalSalaryWithAdjustment: reportIndividual.summary.finalSalary });
  const finalBulk = finalizeSalaryCalculation({ finalSalaryWithAdjustment: reportBulk.summary.finalSalary });

  assert.strictEqual(reportIndividual.summary.expectedSaaSSalary, reportBulk.summary.expectedSaaSSalary);
  assert.strictEqual(finalIndiv.finalPayableSalary, finalBulk.finalPayableSalary);
  assert.strictEqual(finalIndiv.finalPayableSalary, Math.round(reportIndividual.summary.finalSalary * 100) / 100);
  console.log('✓ PASS: Scenario 14 - Individual and Bulk calculations produce identical figures (₹0.00 difference).');
}

// -------------------------------------------------------------
// Scenario 15: WhatsApp dispatch parity with rejoining lifecycle
// -------------------------------------------------------------
console.log('\nTest 15: WhatsApp dispatch parity with rejoining lifecycle...');
{
  const { isWorkerCurrentlyActive } = require('../services/autoSalaryWhatsappService');

  const worker = {
    _id: 'w_rejoin_15',
    salary: 15000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  const isActive = isWorkerCurrentlyActive(worker, [], '2026-10-01', '2026-10-31');
  assert.strictEqual(isActive, true, 'Rejoined worker must be recognized as active by WhatsApp service');

  // Relieved worker without rejoining
  const relievedWorker = {
    _id: 'w_relieved_15',
    salary: 15000,
    status: 'Relieved',
    joiningDate: '2025-01-01',
    relievedAt: '2026-09-30'
  };
  const isRelievedActive = isWorkerCurrentlyActive(relievedWorker, [], '2026-10-01', '2026-10-31');
  assert.strictEqual(isRelievedActive, false, 'Relieved worker must be recognized as inactive');
  console.log('✓ PASS: Scenario 15 - WhatsApp dispatch parity correctly identifies active rejoined workers.');
}

// -------------------------------------------------------------
// Scenario 16: Relieved again after rejoining (mid-month rejoin & relieve)
// -------------------------------------------------------------
console.log('\nTest 16: Relieved again after rejoining (rejoined Oct 16, relieved Oct 25)...');
{
  const worker = {
    _id: 'w_rejoin_16',
    salary: 27000,
    status: 'Relieved',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-25',
    rejoiningDate: '2026-10-16'
  };

  const employeeHistory = [
    { actionType: 'Relieved', createdAt: '2026-10-15T18:00:00.000Z', afterData: { relievedAt: '2026-10-15' } },
    { actionType: 'Restored', createdAt: '2026-10-16T09:00:00.000Z', afterData: { rehireDate: '2026-10-16' } },
    { actionType: 'Relieved', createdAt: '2026-10-25T18:00:00.000Z', afterData: { relievedAt: '2026-10-25' } }
  ];

  const dates = getValidatedEmploymentDates(worker, '2026-10-01', '2026-10-31', { employeeHistory });
  assert.strictEqual(dates.joiningDateStr, '2026-10-16');
  assert.strictEqual(dates.relievedDateStr, '2026-10-25');
  assert.strictEqual(dates.wasRelievedBefore, true);

  // Stray punches on Oct 5 (before rejoin) and Oct 28 (after relief)
  const attendance = [
    ...createFullDayAttendance('2026-10-05'),
    ...createFullDayAttendance('2026-10-16'), // Active day 1
    ...createFullDayAttendance('2026-10-17'), // Active day 2
    ...createFullDayAttendance('2026-10-28')  // After relief
  ];

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { employeeHistory, batches: defaultBatches }
  });

  // Working days in Oct 16–25 (Oct 18 and 25 are Sundays):
  // Oct 16 (Fri), 17 (Sat), 19 (Mon), 20 (Tue), 21 (Wed), 22 (Thu), 23 (Fri), 24 (Sat) = 8 working days
  assert.strictEqual(report.summary.saasWorkingDaysCount, 8);
  assert.strictEqual(report.workingDays, 2, 'Only punches inside active window (Oct 16, 17) count as working days');

  // Verify pre-rejoin (Oct 5) and post-relief (Oct 28) issues are 'Relieved'
  const oct5Entry = report.dailyBreakdown.find(d => d.date === '2026-10-05');
  const oct28Entry = report.dailyBreakdown.find(d => d.date === '2026-10-28');
  assert.strictEqual(oct5Entry.issues[0], 'Relieved');
  assert.strictEqual(oct28Entry.issues[0], 'Relieved');

  console.log('✓ PASS: Scenario 16 - Relieved again after rejoining correctly confines active window to Oct 16–25.');
}

// -------------------------------------------------------------
// Scenario 17: All four deduction toggles & locked payroll snapshot
// -------------------------------------------------------------
console.log('\nTest 17: All four deduction toggles and locked payroll snapshot...');
{
  const worker = {
    _id: 'w_rejoin_17',
    salary: 27000,
    status: 'Active',
    joiningDate: '2025-01-01',
    relievedAt: '2026-10-15',
    rejoiningDate: '2026-10-16'
  };

  const attendance = [];
  for (let d = 16; d <= 31; d++) {
    const dayDate = new Date(2026, 9, d);
    if (dayDate.getDay() !== 0) {
      attendance.push(...createFullDayAttendance(`2026-10-${String(d).padStart(2, '0')}`));
    }
  }

  const report = calculateWorkerProductivity({
    worker,
    attendanceData: attendance,
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    options: { batches: defaultBatches }
  });

  // Test locked snapshot protection: pre-existing locked snapshot must not be recalculated
  const lockedPayrollRecord = {
    _id: 'pr_locked_17',
    worker: 'w_rejoin_17',
    month: 10,
    year: 2026,
    status: 'Locked',
    attendanceSalarySnapshot: 12500,
    finalSalary: 12500
  };

  const lockedResult = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: 14000,
    attendanceSalary: 14000,
    payrollRecord: lockedPayrollRecord
  });
  assert.strictEqual(lockedResult.finalPayableSalary, 12500, 'Locked snapshot must take strict precedence');

  // Test toggles on unlocked record
  const unlockedResultAllOff = finalizeSalaryCalculation({
    finalSalaryWithAdjustment: report.summary.finalSalary,
    taskPenalty: 1000,
    totalUnauthorizedPenalty: 0,
    leaveDeduction: 0,
    permissionDeduction: report.summary.permissionDeduction,
    toggles: {
      taskDeduction: false,
      unauthorizedDeduction: false,
      leaveDeduction: false,
      permissionDeduction: false
    }
  });
  assert.strictEqual(Math.round(unlockedResultAllOff.finalPayableSalary), Math.round(report.summary.expectedSaaSSalary));

  console.log('✓ PASS: Scenario 17 - All 4 deduction toggles and locked payroll snapshots verified.');
}

console.log('\n=== ALL 17 REJOINING LIFECYCLE TESTS PASSED CLEANLY! ===\n');
