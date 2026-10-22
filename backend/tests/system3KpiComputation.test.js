/**
 * System 3: KPI Computation Engine — Comprehensive Test Suite
 * Tech Ciphergate - Regression & Integration Verification
 * 
 * Target DB: Local MongoDB only (mongodb://127.0.0.1:27017/tech_ciphergate_kpi_system3_test).
 * Zero remote/Atlas connections.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_kpi_system3_test';

function assertSafeEnvironment(uri) {
  if (!uri.startsWith('mongodb://127.0.0.1:27017/') && !uri.startsWith('mongodb://localhost:27017/')) {
    throw new Error(`CRITICAL SAFETY ABORT: Attempted to run tests against non-local host: ${uri}`);
  }
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('production') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY ABORT: Live or cluster database keyword detected in URI!');
  }
}
assertSafeEnvironment(TEST_DB_URI);

console.log('================================================================');
console.log(' Tech Ciphergate — System 3 KPI Computation Engine Test Suite   ');
console.log(` Target DB: ${TEST_DB_URI}`);
console.log('================================================================\n');

// Models
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const Leave = require('../models/Leave');
const PerformancePoints = require('../models/PerformancePoints');
const Admin = require('../models/Admin');

// Services
const {
  getActualExecutionStart,
  getActualExecutionCompletion,
  calculateExecutionDuration,
  evaluateDeadlinePerformance,
  calculateOtcr,
  calculateFtar,
  calculateAssignmentKpiScore,
  computeWorkerKpi,
  computeDepartmentKpi,
  computeTenantKpiSummary
} = require('../services/kpiComputationService');

const { autoAssignJobTicket } = require('../services/jobAssignmentService');
const { awardPointsOnTicketDone } = require('../controllers/performanceController');

let testCount = 0;
let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`    Stack: ${relevantStack}`);
    }
  }
}

let workerSeq = 0;
function createTestWorker(overrides = {}) {
  workerSeq++;
  const tag = `${workerSeq}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSeq}`,
    username: overrides.username || `worker_${tag}`,
    email: overrides.email || `worker_${tag}@testciphergate.com`,
    rfid: overrides.rfid || `RFID_${tag}`,
    password: overrides.password || 'password123',
    subdomain: overrides.subdomain || 'ciphergate-kpi-test',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    totalCompletedTickets: overrides.totalCompletedTickets !== undefined ? overrides.totalCompletedTickets : 0,
    totalDelayedTickets: overrides.totalDelayedTickets !== undefined ? overrides.totalDelayedTickets : 0,
    department: overrides.department || null,
    ...overrides
  });
}

async function main() {
  await mongoose.connect(TEST_DB_URI);

  const tenant = 'ciphergate-kpi-test';

  // Helper to reset tickets & workers between groups
  async function cleanDb() {
    await Promise.all([
      Worker.deleteMany({ subdomain: tenant }),
      Department.deleteMany({ subdomain: tenant }),
      Ticket.deleteMany({ subdomain: tenant }),
      Leave.deleteMany({ subdomain: tenant }),
      PerformancePoints.deleteMany({ subdomain: tenant }),
      Admin.deleteMany({ subdomain: tenant })
    ]);
  }

  // ============================================================================
  // TEST 1: Execution Time Accuracy — uses first In Progress transition, not planned startDate
  // ============================================================================
  await runTest('1. Execution Time Accuracy: Uses first In Progress transition, not planned startDate', async () => {
    await cleanDb();

    const plannedStartDate = new Date('2026-10-01T09:00:00Z');
    const actualInProgressDate = new Date('2026-10-03T14:30:00Z');
    const completionDate = new Date('2026-10-05T18:30:00Z');

    const ticketWithHistory = {
      title: 'Task With History',
      startDate: plannedStartDate,
      statusHistory: [
        { status: 'To Do', changedAt: new Date('2026-10-01T09:00:00Z') },
        { status: 'In Progress', changedAt: actualInProgressDate },
        { status: 'In Progress', changedAt: new Date('2026-10-04T10:00:00Z') }, // second transition ignored
        { status: 'Review', changedAt: completionDate },
        { status: 'Done', changedAt: new Date('2026-10-06T12:00:00Z') } // review lag
      ],
      reviewCycles: [
        { submissionTime: completionDate, decision: 'Approved', decisionTime: new Date('2026-10-06T12:00:00Z') }
      ]
    };

    const resolvedStart = getActualExecutionStart(ticketWithHistory);
    assert.strictEqual(
      resolvedStart.getTime(),
      actualInProgressDate.getTime(),
      'Must resolve first In Progress transition, NOT planned startDate'
    );
    assert.notStrictEqual(
      resolvedStart.getTime(),
      plannedStartDate.getTime(),
      'Must NOT fall back to planned startDate as execution start'
    );

    const execResult = calculateExecutionDuration(ticketWithHistory);
    assert.strictEqual(execResult.isAvailable, true);
    // From Oct 3 14:30 to Oct 5 18:30 = 52 hours = 2.2 days
    assert.strictEqual(execResult.durationHours, 52);
    assert.strictEqual(execResult.durationDays, 2.2);
  });

  // ============================================================================
  // TEST 2: Missing Timestamp Handling — marks execution duration unavailable without inventing values
  // ============================================================================
  await runTest('2. Missing Timestamp Handling: Marks execution duration unavailable without inventing values', async () => {
    await cleanDb();

    // Ticket without any In Progress transition
    const ticketNoStart = {
      title: 'Direct To Done Task',
      startDate: new Date('2026-10-01T09:00:00Z'),
      statusHistory: [
        { status: 'To Do', changedAt: new Date('2026-10-01T09:00:00Z') },
        { status: 'Done', changedAt: new Date('2026-10-05T09:00:00Z') }
      ]
    };

    const resolvedStart = getActualExecutionStart(ticketNoStart);
    assert.strictEqual(resolvedStart, null, 'Must be null when no In Progress entry exists');

    const execResult = calculateExecutionDuration(ticketNoStart);
    assert.strictEqual(execResult.isAvailable, false, 'Must report isAvailable: false');
    assert.strictEqual(execResult.durationHours, null);
    assert.strictEqual(execResult.durationDays, null);
    assert.ok(execResult.reason.includes('No In Progress transition'));
  });

  // ============================================================================
  // TEST 3: OTCR and FTAR Boundary Tests — 0%, 50%, and 100%
  // ============================================================================
  await runTest('3. Boundary Tests: OTCR at 0%, 50%, 100% maps to exactly 0, 8, 15 assignment points', () => {
    // OTCR = 0%
    const score0 = calculateAssignmentKpiScore({ performancePoints: 0, otcr: 0, ftar: 0 });
    assert.strictEqual(score0.breakdown.otcrScore, 0, 'OTCR 0% must yield 0 points');
    assert.strictEqual(score0.breakdown.ftarScore, 0, 'FTAR 0% must yield 0 points');
    assert.strictEqual(score0.totalScore, 0);

    // OTCR = 50%
    const score50 = calculateAssignmentKpiScore({ performancePoints: 0, otcr: 50, ftar: 50 });
    assert.strictEqual(score50.breakdown.otcrScore, 8, 'OTCR 50% must yield 8 points (Math.round(15 * 0.5))');
    assert.strictEqual(score50.breakdown.ftarScore, 3, 'FTAR 50% must yield 3 points (Math.round(5 * 0.5))');
    assert.strictEqual(score50.totalScore, 11);

    // OTCR = 100%
    const score100 = calculateAssignmentKpiScore({ performancePoints: 300, otcr: 100, ftar: 100 });
    assert.strictEqual(score100.breakdown.otcrScore, 15, 'OTCR 100% must yield 15 points (max)');
    assert.strictEqual(score100.breakdown.ftarScore, 5, 'FTAR 100% must yield 5 points (max)');
    assert.strictEqual(score100.breakdown.pointsScore, 30, 'Performance points 300 must yield 30 points (max)');
    assert.strictEqual(score100.totalScore, 50, 'Max combined score must be capped at 50');
  });

  // ============================================================================
  // TEST 4: Missing Project Dates & Review Cycles — Neutral baseline (no unfair 0-penalty)
  // ============================================================================
  await runTest('4. Missing Data Baseline: Neutral fallback prevents penalizing workers for missing project dates', () => {
    // Worker with 100 performance points, but no deadlines or review cycles configured in tenant
    const scoreNeutral = calculateAssignmentKpiScore({ performancePoints: 100, otcr: null, ftar: null });
    assert.strictEqual(scoreNeutral.breakdown.pointsScore, 10);
    // Neutral fallback: pointsScore * 0.5 = 5 pts; ftar = 2 pts
    assert.strictEqual(scoreNeutral.breakdown.otcrScore, 5, 'Must provide neutral non-zero fallback for missing deadlines');
    assert.strictEqual(scoreNeutral.breakdown.ftarScore, 2, 'Must provide neutral non-zero fallback for missing reviews');
    assert.strictEqual(scoreNeutral.totalScore, 17);
  });

  // ============================================================================
  // TEST 5: Review Quality & Rejection Handling — First-Time Approval Rate calculation
  // ============================================================================
  await runTest('5. Quality & Rejection Handling: Accurately computes First-Time Approval Rate', () => {
    const tickets = [
      // Ticket A: Clean 1-shot approval (no rejection)
      {
        reviewCycles: [
          { decision: 'Approved', submissionTime: new Date() }
        ]
      },
      // Ticket B: Clean 1-shot approval
      {
        reviewCycles: [
          { decision: 'Approved', submissionTime: new Date() }
        ]
      },
      // Ticket C: Rejected once, then approved (rework required)
      {
        reviewCycles: [
          { decision: 'Rejected', submissionTime: new Date() },
          { decision: 'Approved', submissionTime: new Date() }
        ]
      },
      // Ticket D: Rejected twice, then approved
      {
        reviewCycles: [
          { decision: 'Rejected', submissionTime: new Date() },
          { decision: 'Rejected', submissionTime: new Date() },
          { decision: 'Approved', submissionTime: new Date() }
        ]
      }
    ];

    const ftarResult = calculateFtar(tickets);
    assert.strictEqual(ftarResult.totalReviewed, 4);
    assert.strictEqual(ftarResult.firstTimeApprovedCount, 2);
    assert.strictEqual(ftarResult.reworkCount, 2);
    assert.strictEqual(ftarResult.totalRejections, 3);
    assert.strictEqual(ftarResult.ftar, 50, '2 out of 4 first-time approved = 50%');
  });

  // ============================================================================
  // TEST 6: Worker KPI Computation & Data Coverage Reporting
  // ============================================================================
  await runTest('6. Worker KPI Computation: Aggregates metrics and reports data coverage accurately', async () => {
    await cleanDb();

    const worker = await createTestWorker({
      name: 'Dev Alice',
      subdomain: tenant,
      performancePoints: 150
    });

    // 2 Completed tickets with deadline (1 on-time, 1 delayed)
    await Ticket.create({
      title: 'Ticket 1 - On Time',
      subdomain: tenant,
      assignee: worker._id,
      status: 'Done',
      endDate: new Date('2026-10-10T18:00:00Z'),
      actualCompletionDate: new Date('2026-10-09T15:00:00Z'),
      statusHistory: [
        { status: 'To Do', changedAt: new Date('2026-10-05T09:00:00Z') },
        { status: 'In Progress', changedAt: new Date('2026-10-06T09:00:00Z') },
        { status: 'Done', changedAt: new Date('2026-10-09T15:00:00Z') }
      ],
      reviewCycles: [{ decision: 'Approved', submissionTime: new Date('2026-10-09T15:00:00Z') }]
    });

    await Ticket.create({
      title: 'Ticket 2 - Delayed',
      subdomain: tenant,
      assignee: worker._id,
      status: 'Done',
      endDate: new Date('2026-10-08T18:00:00Z'),
      actualCompletionDate: new Date('2026-10-11T12:00:00Z'),
      statusHistory: [
        { status: 'To Do', changedAt: new Date('2026-10-05T09:00:00Z') },
        { status: 'In Progress', changedAt: new Date('2026-10-07T09:00:00Z') },
        { status: 'Done', changedAt: new Date('2026-10-11T12:00:00Z') }
      ],
      reviewCycles: [
        { decision: 'Rejected', submissionTime: new Date('2026-10-10T10:00:00Z') },
        { decision: 'Approved', submissionTime: new Date('2026-10-11T12:00:00Z') }
      ]
    });

    // 1 Active ticket
    await Ticket.create({
      title: 'Ticket 3 - Active In Progress',
      subdomain: tenant,
      assignee: worker._id,
      status: 'In Progress'
    });

    const result = await computeWorkerKpi(worker._id, tenant);

    assert.strictEqual(result.worker.name, 'Dev Alice');
    assert.strictEqual(result.metrics.completedTicketsCount, 2);
    assert.strictEqual(result.metrics.activeTasksCount, 1);
    assert.strictEqual(result.metrics.availableCapacity, 4); // 5 - 1
    assert.strictEqual(result.metrics.capacityUtilizationPct, 20); // 1 / 5 = 20%
    assert.strictEqual(result.metrics.onTimeCompletionRate, 50, '1 of 2 on time = 50%');
    assert.strictEqual(result.metrics.firstTimeApprovalRate, 50, '1 of 2 first-time approved = 50%');
    assert.ok(result.metrics.avgExecutionHours > 0);
    assert.strictEqual(result.dataCoverage.deadlineTrackingPercentage, 100);
    assert.strictEqual(result.dataCoverage.executionTimeTrackingPercentage, 100);
    assert.ok(result.system2Assignment.explanation.includes('KPI Score'));
  });

  // ============================================================================
  // TEST 7: Department & Tenant Summary Aggregations
  // ============================================================================
  await runTest('7. Department & Tenant Aggregations: Computes rollups without data pollution', async () => {
    await cleanDb();

    const webDept = await Department.create({ name: 'Web Dev', subdomain: tenant });
    const w1 = await createTestWorker({ name: 'Web Dev 1', subdomain: tenant, department: webDept._id, performancePoints: 100 });
    const w2 = await createTestWorker({ name: 'Web Dev 2', subdomain: tenant, department: webDept._id, performancePoints: 50 });

    await Ticket.create({
      title: 'Web Task 1',
      subdomain: tenant,
      assignee: w1._id,
      status: 'Done',
      endDate: new Date('2026-10-10T18:00:00Z'),
      actualCompletionDate: new Date('2026-10-09T18:00:00Z')
    });

    await Ticket.create({
      title: 'Web Task 2',
      subdomain: tenant,
      assignee: w2._id,
      status: 'In Progress'
    });

    const deptKpi = await computeDepartmentKpi('Web Dev', tenant);
    assert.strictEqual(deptKpi.department.memberCount, 2);
    assert.strictEqual(deptKpi.summary.totalActiveTasks, 1);
    assert.strictEqual(deptKpi.summary.totalCompletedTasks, 1);
    assert.strictEqual(deptKpi.summary.totalCapacity, 10);
    assert.strictEqual(deptKpi.summary.availableCapacity, 9);
    assert.strictEqual(deptKpi.members.length, 2);

    const tenantSummary = await computeTenantKpiSummary(tenant);
    assert.strictEqual(tenantSummary.totalWorkers, 2);
    assert.strictEqual(tenantSummary.activeTicketsCount, 1);
    assert.strictEqual(tenantSummary.completedTicketsCount, 1);
    assert.strictEqual(tenantSummary.departments.length, 1);
  });

  // ============================================================================
  // TEST 8: Event Handling Idempotency — repeated awards & status transitions cannot duplicate points
  // ============================================================================
  await runTest('8. Event Handling Idempotency: Retrying completion events cannot duplicate score or awards', async () => {
    await cleanDb();

    const worker = await createTestWorker({ name: 'Idempotent Worker', subdomain: tenant, performancePoints: 0 });
    const ticket = await Ticket.create({
      title: 'Idempotency Test Task',
      subdomain: tenant,
      assignee: worker._id,
      assignees: [worker._id],
      status: 'In Progress',
      startDate: new Date('2026-10-01T09:00:00Z'),
      endDate: new Date('2026-10-05T18:00:00Z')
    });

    // First completion event
    ticket.status = 'Done';
    ticket.actualCompletionDate = new Date('2026-10-04T12:00:00Z');
    await ticket.save();

    await awardPointsOnTicketDone(ticket, tenant);

    const afterFirst = await Worker.findById(worker._id);
    const firstPoints = afterFirst.performancePoints;
    assert.ok(firstPoints > 0, 'Must award points on first completion');

    const totalPointEntries1 = await PerformancePoints.countDocuments({ ticket: ticket._id, worker: worker._id });
    assert.strictEqual(totalPointEntries1, 1, 'Must create exactly 1 PerformancePoints record');

    // Repeated / retry completion event on same ticket
    await awardPointsOnTicketDone(ticket, tenant);

    const afterSecond = await Worker.findById(worker._id);
    assert.strictEqual(afterSecond.performancePoints, firstPoints, 'Points must remain identical on retry');

    const totalPointEntries2 = await PerformancePoints.countDocuments({ ticket: ticket._id, worker: worker._id });
    assert.strictEqual(totalPointEntries2, 1, 'Must NOT create duplicate PerformancePoints records');
  });

  // ============================================================================
  // TEST 9: System 2 Integration — Validated KPI breaks ties without overriding essential constraints
  // ============================================================================
  await runTest('9. System 2 Integration: KPI score ranks candidates without overriding leave, workload, or department', async () => {
    await cleanDb();

    const webDept = await Department.create({ name: 'Web Development', subdomain: tenant });

    // Worker A: High KPI (Points: 100, OTCR: 100%, FTAR: 100%) -> KPI Score: ~30 pts
    const workerA = await createTestWorker({
      name: 'Alice High KPI',
      subdomain: tenant,
      department: webDept._id,
      skills: ['wordpress'],
      performancePoints: 100,
      totalCompletedTickets: 10,
      totalDelayedTickets: 0
    });

    // Worker B: Low KPI (Points: 10, OTCR: 50%, FTAR: 50%) -> KPI Score: ~12 pts
    const workerB = await createTestWorker({
      name: 'Bob Low KPI',
      subdomain: tenant,
      department: webDept._id,
      skills: ['wordpress'],
      performancePoints: 10,
      totalCompletedTickets: 10,
      totalDelayedTickets: 5
    });

    // Create a website ticket to assign
    const testTicket = await Ticket.create({
      title: 'New WordPress Website Launch',
      subdomain: tenant,
      status: 'To Do',
      labels: ['job-type:website']
    });

    // Both workers are available (0 active tasks) and have matching skills.
    // Worker A must be selected due to higher KPI ranking!
    const assignResult1 = await autoAssignJobTicket({
      ticket: testTicket,
      subdomain: tenant,
      mode: 'Individual'
    });

    assert.strictEqual(assignResult1.success, true);
    assert.strictEqual(String(assignResult1.ticket.assignee), String(workerA._id), 'Alice must be ranked first due to higher KPI score');

    // NOW TEST CONSTRAINT DOMINANCE:
    // If Alice is placed on Approved Leave today, Bob MUST be assigned regardless of Alice having higher KPI!
    const now = new Date();
    await Leave.create({
      worker: workerA._id,
      subdomain: tenant,
      status: 'Approved',
      leaveType: 'Annual Leave',
      reason: 'Scheduled vacation',
      totalDays: 2,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000)
    });

    const testTicket2 = await Ticket.create({
      title: 'Second WordPress Task',
      subdomain: tenant,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const assignResult2 = await autoAssignJobTicket({
      ticket: testTicket2,
      subdomain: tenant,
      mode: 'Individual'
    });

    assert.strictEqual(assignResult2.success, true);
    assert.strictEqual(
      String(assignResult2.ticket.assignee),
      String(workerB._id),
      'Bob MUST be assigned when Alice is on approved leave (Leave constraint strictly dominates KPI score)'
    );

    // Verify existing tasks are NOT automatically reassigned when KPI changes
    const originalTicketAfter = await Ticket.findById(testTicket._id);
    assert.strictEqual(
      String(originalTicketAfter.assignee),
      String(workerA._id),
      'Existing task assignment must NEVER be mutated retroactively when KPI or leave changes'
    );
  });

  // ============================================================================
  // TEST 10: Workload Dominance — Busy worker (4 tasks) never overtakes available worker (0 tasks)
  // ============================================================================
  await runTest('10. Workload Dominance: Available worker (load 0) always ranks higher than loaded worker (load 2)', async () => {
    await cleanDb();

    const webDept = await Department.create({ name: 'Web Development', subdomain: tenant });

    // Worker A: Max KPI (50 pts), but has 2 active tasks -> Workload Score = (5 - 2) * 100 = 300 pts. Total = 350.
    const workerA = await createTestWorker({
      name: 'Alice Loaded Max KPI',
      subdomain: tenant,
      department: webDept._id,
      skills: ['wordpress'],
      performancePoints: 500,
      totalCompletedTickets: 20,
      totalDelayedTickets: 0
    });

    // Assign 2 active tickets to Alice
    await Ticket.create({ title: 'Task 1', subdomain: tenant, assignee: workerA._id, status: 'In Progress' });
    await Ticket.create({ title: 'Task 2', subdomain: tenant, assignee: workerA._id, status: 'In Progress' });

    // Worker B: Zero KPI (0 pts), but has 0 active tasks -> Workload Score = (5 - 0) * 100 = 500 pts. Total = 500.
    const workerB = await createTestWorker({
      name: 'Bob Free Zero KPI',
      subdomain: tenant,
      department: webDept._id,
      skills: ['wordpress'],
      performancePoints: 0,
      totalCompletedTickets: 0,
      totalDelayedTickets: 0
    });

    const newTicket = await Ticket.create({
      title: 'Wordpress Store Setup',
      subdomain: tenant,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const assignResult = await autoAssignJobTicket({
      ticket: newTicket,
      subdomain: tenant,
      mode: 'Individual'
    });

    assert.strictEqual(assignResult.success, true);
    assert.strictEqual(
      String(assignResult.ticket.assignee),
      String(workerB._id),
      'Bob (0 active tasks) MUST beat Alice (2 active tasks) because workload score (500 vs 300) strictly dominates KPI score (0 vs 50)'
    );
  });

  // Teardown
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(` System 3 KPI Test Summary: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
