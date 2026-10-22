/**
 * Tech Ciphergate — Salary Review Penalty Waiver Isolated Regression Tests
 * 
 * Safety:
 * - Uses in-memory objects and fixtures only.
 * - Does NOT connect to MongoDB or load production environment.
 * - Does NOT mutate any live database records, employee profiles, or payslips.
 * 
 * Objectives:
 * Validate that when a task enters 'Review', its task-related salary penalty is ₹0,
 * including all earlier accrued overdue deductions, while legitimate unsubmitted
 * overdue tasks continue to incur penalties.
 */

const assert = require('assert');
const { calculateTaskPenalties, backfillReviewCycles, getDateStr } = require('../utils/salaryPenaltyCalculator');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}`);
    console.error(`  Error: ${err.message}`);
    if (err.diff) console.error(`  Diff: ${err.diff}`);
    failCount++;
  }
}

// 31-day mock report for October 2026 (Daily salary = ₹1,000)
const report = {
  report: Array.from({ length: 31 }, (_, i) => ({
    date: `${String(i + 1).padStart(2, '0')} October`,
    totalSalary: '₹1000'
  }))
};
const worker = { _id: 'w1', name: 'Test Developer', salary: 31000 };

console.log('================================================================');
console.log(' Tech Ciphergate — Salary Review Penalty Waiver Test Suite');
console.log('================================================================\n');

// -------------------------------------------------------------
// Test A: An overdue task submitted for Review has a zero task deduction,
// including all earlier overdue days.
// -------------------------------------------------------------
runTest('Test A: Overdue task submitted for Review has ₹0 penalty (earlier overdue days waived)', () => {
  const overdueTaskInReview = {
    _id: 't_overdue_review',
    title: 'Task submitted late into Review',
    status: 'Review',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-10'), // Due Oct 10
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-15T10:00:00.000Z') } // Submitted late on Oct 15
    ],
    reviewCycles: [
      {
        submissionTime: new Date('2026-10-15T10:00:00.000Z'),
        decision: 'Pending',
        decisionTime: null
      }
    ]
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [overdueTaskInReview],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  assert.strictEqual(result.totalTaskPenalty, 0, 'Total task penalty must be 0 for task in Review');
  assert.strictEqual(result.taskPenalties.length, 0, 'Waived task in Review must be excluded from delayed active penalty list');
});

// -------------------------------------------------------------
// Test B: A task submitted on time for Review has a zero task deduction.
// -------------------------------------------------------------
runTest('Test B: Task submitted on time for Review has ₹0 task deduction', () => {
  const onTimeTask = {
    _id: 't_ontime_review',
    title: 'Task submitted on time into Review',
    status: 'Review',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-20'), // Due Oct 20
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-18T10:00:00.000Z') } // Submitted early on Oct 18
    ],
    reviewCycles: [
      {
        submissionTime: new Date('2026-10-18T10:00:00.000Z'),
        decision: 'Pending',
        decisionTime: null
      }
    ]
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [onTimeTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  assert.strictEqual(result.totalTaskPenalty, 0, 'On-time task penalty must be 0');
  assert.strictEqual(result.taskPenalties.length, 0, 'On-time task in Review must not be listed as actively penalized');
});

// -------------------------------------------------------------
// Test C: A task remains in Review for several days; no task deduction accrues
// during the review period.
// -------------------------------------------------------------
runTest('Test C: Task remaining in Review for multiple days accrues ₹0 deduction during review', () => {
  const multiDayReviewTask = {
    _id: 't_multiday_review',
    title: 'Task waiting in Review for 10 days',
    status: 'Review',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-08'), // Due Oct 8
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-10T10:00:00.000Z') } // In review since Oct 10
    ],
    reviewCycles: [
      {
        submissionTime: new Date('2026-10-10T10:00:00.000Z'),
        decision: 'Pending',
        decisionTime: null
      }
    ]
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [multiDayReviewTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  assert.strictEqual(result.totalTaskPenalty, 0, 'Waiting in Review must not accrue penalty');
  assert.strictEqual(result.taskPenalties.length, 0);
});

// -------------------------------------------------------------
// Test D: A task currently in Review but missing review-cycle metadata is protected
// from task-related deductions.
// -------------------------------------------------------------
runTest('Test D: Task in Review with missing reviewCycles metadata is protected from deductions', () => {
  const missingMetadataTask = {
    _id: 't_missing_cycles',
    title: 'Task in Review without reviewCycles array',
    status: 'Review',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-10'), // Due Oct 10
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-14T10:00:00.000Z') }
    ],
    reviewCycles: [] // Missing / unpopulated reviewCycles array
  };

  // Verify backfillReviewCycles restores pending cycle
  const cycles = backfillReviewCycles(missingMetadataTask);
  assert(cycles.length > 0, 'Cycles must be backfilled from status history');
  assert.strictEqual(cycles[0].decision, 'Pending');

  const result = calculateTaskPenalties({
    worker,
    tickets: [missingMetadataTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  assert.strictEqual(result.totalTaskPenalty, 0, 'Missing reviewCycles task in Review must yield ₹0 penalty');
  assert.strictEqual(result.taskPenalties.length, 0);
});

// -------------------------------------------------------------
// Test E: A task that has never been submitted for Review and is overdue
// still incurs the existing legitimate penalty.
// -------------------------------------------------------------
runTest('Test E: Overdue task never submitted for Review still incurs legitimate penalty', () => {
  const neverSubmittedOverdueTask = {
    _id: 't_unsubmitted_overdue',
    title: 'Abandoned overdue task',
    status: 'In Progress', // Still In Progress
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-10'), // Due Oct 10
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') }
    ],
    reviewCycles: [] // Never submitted
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [neverSubmittedOverdueTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  assert(result.totalTaskPenalty > 0, 'Unsubmitted overdue task must incur penalty');
  assert(result.taskPenalties.length > 0, 'Unsubmitted overdue task must be included in delayed tasks');
  assert.strictEqual(result.taskPenalties[0].status, 'In Progress');
  assert(result.taskPenalties[0].taskDeduction > 0);
  assert(result.taskPenalties[0].dailyList.length > 0);
  // Verify that dates Oct 11 onwards are present in dailyList
  assert(result.taskPenalties[0].dailyList.some(d => d.date === '11 October'));
  assert(result.taskPenalties[0].dailyList.some(d => d.date === '15 October'));
});

// -------------------------------------------------------------
// Test F: A waived task is excluded from active salary-deduction breakdowns
// and is not incorrectly displayed as an actively penalized delayed task.
// -------------------------------------------------------------
runTest('Test F: Waived task is excluded from active salary-deduction breakdown list', () => {
  const waivedTask = {
    _id: 't_waived',
    title: 'Waived review task',
    status: 'Review',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-05'), // Due Oct 5
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-12T10:00:00.000Z') }
    ],
    reviewCycles: [
      { submissionTime: new Date('2026-10-12T10:00:00.000Z'), decision: 'Pending', decisionTime: null }
    ]
  };

  const legitimateOverdueTask = {
    _id: 't_legit_overdue',
    title: 'Legitimately overdue active task',
    status: 'In Progress',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-10'),
    statusHistory: [{ status: 'In Progress', changedAt: new Date('2026-10-01') }],
    reviewCycles: []
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [waivedTask, legitimateOverdueTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  // Only legitimateOverdueTask must be in filteredPenalties
  assert.strictEqual(result.taskPenalties.length, 1, 'Only actively penalized task must be present');
  assert.strictEqual(result.taskPenalties[0]._id, 't_legit_overdue');
  assert(!result.taskPenalties.some(t => t._id === 't_waived'), 'Waived task must not be in active delayed-task list');
});

// -------------------------------------------------------------
// Test G: If the task is later rejected and returned to active work, apply the
// approved rule consistently: no penalty for the already waived submission cycle,
// and verify the policy for any new overdue period before adding new deductions.
// -------------------------------------------------------------
runTest('Test G: Rejected review cycle waives prior overdue days; new overdue period after rejection is penalized', () => {
  // Due date: Oct 10
  // Overdue period 1: Oct 11 - Oct 15
  // Submitted to Review on Oct 15 (Cycle 1) -> Waived!
  // In review Oct 15 - Oct 18 -> Waived!
  // Rejected on Oct 18: returned to 'In Progress'
  // New overdue period: Oct 19 onwards (unsubmitted while active)
  const rejectedTask = {
    _id: 't_rejected_resumed',
    title: 'Rejected task returned to active work',
    status: 'In Progress',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-10'), // Due Oct 10
    statusHistory: [
      { status: 'In Progress', changedAt: new Date('2026-10-01') },
      { status: 'Review', changedAt: new Date('2026-10-15T10:00:00.000Z') },
      { status: 'In Progress', changedAt: new Date('2026-10-18T10:00:00.000Z') }
    ],
    reviewCycles: [
      {
        submissionTime: new Date('2026-10-15T10:00:00.000Z'),
        decision: 'Rejected',
        decisionTime: new Date('2026-10-18T10:00:00.000Z')
      }
    ]
  };

  const result = calculateTaskPenalties({
    worker,
    tickets: [rejectedTask],
    report,
    fromDate: '2026-10-01',
    toDate: '2026-10-31'
  });

  const dailyList = result.taskPenalties[0]?.dailyList || [];
  // Days Oct 11 to Oct 18 must NOT be penalized (they were part of the waived cycle)
  assert(!dailyList.some(d => ['11 October', '12 October', '13 October', '14 October', '15 October', '16 October', '17 October', '18 October'].includes(d.date)),
    'Days prior to and during the rejected review cycle must remain waived');

  // Days starting from Oct 19 (after rejection while back in active work) must be penalized
  assert(dailyList.some(d => d.date === '19 October'), 'New overdue day Oct 19 after rejection must be penalized');
  assert(dailyList.some(d => d.date === '20 October'), 'New overdue day Oct 20 after rejection must be penalized');
  assert(dailyList.some(d => d.date === '21 October'), 'New overdue day Oct 21 after rejection must be penalized');
  assert(dailyList.some(d => d.date === '22 October'), 'New overdue day Oct 22 after rejection must be penalized');
});

console.log('\n================================================================');
console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${passCount + failCount} Total Tests`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
