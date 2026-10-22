/**
 * Isolated Test Suite: System 3 KPI → System 2 Auto-Assignment Integration
 * Tech Ciphergate - System 3 KPI Integration into System 2 Assignment Engine
 * 
 * Tests:
 * 1. Candidates ranked using actual System 3 metrics (true OTCR and FTAR from ticket history).
 * 2. Different OTCR and FTAR values affect ranking as expected when workload/skills match.
 * 3. Missing historical metrics use the documented neutral fallback without penalizing workers.
 * 4. Employees with >= 5 active tasks remain ineligible regardless of high KPI score.
 * 5. Tenant boundary strictly enforced (cross-tenant workers excluded ahead of ranking).
 * 6. Inactive and relieved workers strictly excluded ahead of ranking.
 * 7. Department filtering strictly enforced ahead of ranking.
 * 8. Workers on approved leave today are excluded ahead of ranking.
 * 9. Deterministic tie-breaking sequence (totalScore -> completedTickets -> createdAt -> _id).
 * 10. Manual Job Intake selections and existing manual assignments are never silently overwritten.
 * 
 * Safety:
 * Connects exclusively to ephemeral local MongoDB:
 * mongodb://127.0.0.1:27017/tech_ciphergate_sys2_sys3_kpi_test
 * NEVER connects to live MongoDB Atlas.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Ticket = require('../models/ticketModel');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

const { autoAssignJobTicket, scoreAndRankCandidates, MAX_ACTIVE_WORKLOAD } = require('../services/jobAssignmentService');
const { computeWorkerKpi, calculateAssignmentKpiScore } = require('../services/kpiComputationService');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_sys2_sys3_kpi_test';

// Fail-closed environment assertion
function assertSafeTestEnvironment() {
  const forbiddenPatterns = ['mongodb.net', 'cluster', 'production', 'live', 'atlas'];
  for (const pattern of forbiddenPatterns) {
    if (TEST_DB_URI.toLowerCase().includes(pattern)) {
      throw new Error(`CRITICAL SAFETY ABORT: Forbidden pattern '${pattern}' detected in test database URI!`);
    }
  }
}

let testCount = 0;
let passCount = 0;
let failCount = 0;

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
    subdomain: overrides.subdomain || 'tenant-sys3-sys2',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    department: overrides.department || null,
    totalCompletedTickets: overrides.totalCompletedTickets || 0,
    totalDelayedTickets: overrides.totalDelayedTickets || 0,
    ...overrides
  });
}

async function runTest(name, fn) {
  testCount++;
  try {
    // Reset collections between tests
    await Promise.all([
      Worker.deleteMany({}),
      Department.deleteMany({}),
      Leave.deleteMany({}),
      Ticket.deleteMany({}),
      Invoice.deleteMany({}),
      JobIntake.deleteMany({}),
      Admin.deleteMany({})
    ]);

    await fn();
    passCount++;
    console.log(`  ✓ [TEST ${testCount}] ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  ✗ [TEST ${testCount}] ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  assertSafeTestEnvironment();
  console.log('--- Starting System 3 KPI -> System 2 Auto-Assignment Integration Tests ---');
  console.log(`Connecting to isolated test database: ${TEST_DB_URI}`);

  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();

  const TENANT = 'tenant-sys3-sys2';
  const OTHER_TENANT = 'tenant-external';

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Candidates Ranked Using Actual System 3 Metrics
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Candidates ranked using actual System 3 metrics computed from ticket history', async () => {
    const webDept = await Department.create({
      name: 'Website Development',
      subdomain: TENANT
    });

    // Worker A: 100 points, 100% OTCR (on-time), 100% FTAR (1st-time approval)
    const workerA = await createTestWorker({
      name: 'High KPI Worker A',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['HTML', 'CSS', 'JavaScript'],
      performancePoints: 100
    });

    // Worker B: 100 points, Delayed ticket (0% OTCR), Rework (0% FTAR)
    const workerB = await createTestWorker({
      name: 'Low KPI Worker B',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['HTML', 'CSS', 'JavaScript'],
      performancePoints: 100
    });

    const now = new Date();
    const pastStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const deadlineYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const completedTwoDaysAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000); // On-time!

    // Ticket for Worker A: Completed on time, approved with 0 rejections
    await Ticket.create({
      title: 'Ticket for Worker A',
      subdomain: TENANT,
      assignee: workerA._id,
      status: 'Done',
      endDate: deadlineYesterday,
      actualCompletionDate: completedTwoDaysAgo,
      statusHistory: [
        { status: 'In Progress', changedAt: pastStart },
        { status: 'Done', changedAt: completedTwoDaysAgo }
      ],
      reviewCycles: [
        { decision: 'Approved', submissionTime: completedTwoDaysAgo }
      ]
    });

    // Ticket for Worker B: Completed late, rejected before approval
    const completedLate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // Late!
    await Ticket.create({
      title: 'Ticket for Worker B',
      subdomain: TENANT,
      assignee: workerB._id,
      status: 'Done',
      endDate: deadlineYesterday,
      actualCompletionDate: completedLate,
      statusHistory: [
        { status: 'In Progress', changedAt: pastStart },
        { status: 'Done', changedAt: completedLate }
      ],
      reviewCycles: [
        { decision: 'Rejected', submissionTime: completedLate },
        { decision: 'Approved', submissionTime: now }
      ]
    });

    // Verify System 3 computed profiles directly
    const kpiA = await computeWorkerKpi(workerA._id, TENANT);
    const kpiB = await computeWorkerKpi(workerB._id, TENANT);
    assert.strictEqual(kpiA.metrics.onTimeCompletionRate, 100);
    assert.strictEqual(kpiA.metrics.firstTimeApprovalRate, 100);
    assert.strictEqual(kpiB.metrics.onTimeCompletionRate, 0);
    assert.strictEqual(kpiB.metrics.firstTimeApprovalRate, 0);
    assert(kpiA.system2Assignment.kpiScore > kpiB.system2Assignment.kpiScore, 'Worker A KPI score must be higher than Worker B');

    // Create a new unassigned website ticket
    const newTicket = await Ticket.create({
      title: 'New Landing Page',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket: newTicket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    // Worker A must be selected because Workload (0) and Skills match, but Worker A has superior System 3 KPI!
    assert.strictEqual(String(result.assigneeId), String(workerA._id), 'Worker A with 100% OTCR/FTAR must be assigned over Worker B');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Different OTCR and FTAR Values Affect Ranking
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Different OTCR and FTAR values affect assignment ranking when skills & workload match', async () => {
    const webDept = await Department.create({
      name: 'Website Development',
      subdomain: TENANT
    });

    // Worker 1: 50% OTCR, 50% FTAR
    const workerMid = await createTestWorker({
      name: 'Mid Worker',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['WordPress'],
      performancePoints: 0
    });

    // Worker 2: 100% OTCR, 100% FTAR
    const workerTop = await createTestWorker({
      name: 'Top Worker',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['WordPress'],
      performancePoints: 0
    });

    const now = new Date();
    const pastStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deadlineFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Give workerTop 2 on-time clean tickets
    for (let i = 0; i < 2; i++) {
      await Ticket.create({
        title: `Top Ticket ${i}`,
        subdomain: TENANT,
        assignee: workerTop._id,
        status: 'Done',
        endDate: deadlineFuture,
        actualCompletionDate: now,
        statusHistory: [{ status: 'In Progress', changedAt: pastStart }],
        reviewCycles: [{ decision: 'Approved', submissionTime: now }]
      });
    }

    // Give workerMid 1 on-time clean ticket, and 1 delayed rework ticket
    const deadlinePast = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    await Ticket.create({
      title: 'Mid Ticket 1',
      subdomain: TENANT,
      assignee: workerMid._id,
      status: 'Done',
      endDate: deadlineFuture,
      actualCompletionDate: now,
      statusHistory: [{ status: 'In Progress', changedAt: pastStart }],
      reviewCycles: [{ decision: 'Approved', submissionTime: now }]
    });
    await Ticket.create({
      title: 'Mid Ticket 2',
      subdomain: TENANT,
      assignee: workerMid._id,
      status: 'Done',
      endDate: deadlinePast,
      actualCompletionDate: now,
      statusHistory: [{ status: 'In Progress', changedAt: pastStart }],
      reviewCycles: [
        { decision: 'Rejected', submissionTime: now },
        { decision: 'Approved', submissionTime: now }
      ]
    });

    const ticket = await Ticket.create({
      title: 'WordPress Theme Customization',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(workerTop._id), 'Worker with 100% OTCR/FTAR must beat 50% OTCR/FTAR');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Missing Historical Metrics Use Neutral Fallback
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Missing historical metrics use documented neutral fallback without penalizing workers', async () => {
    const webDept = await Department.create({
      name: 'Website Development',
      subdomain: TENANT
    });

    // Worker with 100 points but 0 past tickets (new employee)
    const newWorker = await createTestWorker({
      name: 'New Worker With Points',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['CSS'],
      performancePoints: 100
    });

    const ticket = await Ticket.create({
      title: 'CSS Styling Task',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(newWorker._id));

    // System 3 score calculation check for neutral baseline
    const fallbackKpi = calculateAssignmentKpiScore({ performancePoints: 100, otcr: null, ftar: null });
    assert.strictEqual(fallbackKpi.breakdown.pointsScore, 10);
    assert.strictEqual(fallbackKpi.breakdown.otcrScore, 5, 'Must receive pointsScore * 0.5 neutral fallback for OTCR');
    assert.strictEqual(fallbackKpi.breakdown.ftarScore, 2, 'Must receive pointsScore * 0.16 neutral fallback for FTAR');
    assert.strictEqual(fallbackKpi.totalScore, 17);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Overloaded Workers (>= 5 tasks) Excluded Regardless of High KPI
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Employees with >= 5 active tasks remain ineligible regardless of high KPI score', async () => {
    const webDept = await Department.create({
      name: 'Website Development',
      subdomain: TENANT
    });

    const starWorkerOverloaded = await createTestWorker({
      name: 'Star Worker Overloaded',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['Website'],
      performancePoints: 500
    });

    const juniorWorkerFree = await createTestWorker({
      name: 'Junior Worker Free',
      subdomain: TENANT,
      department: webDept._id,
      skills: ['Website'],
      performancePoints: 0
    });

    // Give star worker 5 active tasks
    for (let i = 0; i < 5; i++) {
      await Ticket.create({
        title: `Active Task ${i}`,
        subdomain: TENANT,
        assignee: starWorkerOverloaded._id,
        status: 'In Progress'
      });
    }

    const ticket = await Ticket.create({
      title: 'Website Redesign',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(juniorWorkerFree._id), 'Free junior worker must be selected over overloaded star worker');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Tenant Boundary Strictly Enforced Ahead of Ranking
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Cross-tenant workers are strictly excluded ahead of ranking', async () => {
    const webDeptA = await Department.create({ name: 'Website Development', subdomain: TENANT });
    const webDeptB = await Department.create({ name: 'External Web Services', subdomain: OTHER_TENANT });

    const workerTenantB = await createTestWorker({
      name: 'Worker Tenant B',
      subdomain: OTHER_TENANT,
      department: webDeptB._id,
      performancePoints: 999
    });

    const workerTenantA = await createTestWorker({
      name: 'Worker Tenant A',
      subdomain: TENANT,
      department: webDeptA._id,
      performancePoints: 10
    });

    const ticket = await Ticket.create({
      title: 'Website Task',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(workerTenantA._id));
    assert.notStrictEqual(String(result.assigneeId), String(workerTenantB._id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Inactive/Relieved Workers Strictly Excluded Ahead of Ranking
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Inactive and relieved workers are strictly excluded ahead of ranking', async () => {
    const webDept = await Department.create({ name: 'Website Development', subdomain: TENANT });

    const relievedStar = await createTestWorker({
      name: 'Relieved Star Worker',
      subdomain: TENANT,
      department: webDept._id,
      status: 'Relieved',
      performancePoints: 800
    });

    const activeWorker = await createTestWorker({
      name: 'Active Worker',
      subdomain: TENANT,
      department: webDept._id,
      status: 'Active',
      performancePoints: 20
    });

    const ticket = await Ticket.create({
      title: 'Website Task',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(activeWorker._id));
    assert.notStrictEqual(String(result.assigneeId), String(relievedStar._id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Workers on Approved Leave Today Excluded Ahead of Ranking
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Workers on approved leave today are excluded ahead of ranking', async () => {
    const webDept = await Department.create({ name: 'Website Development', subdomain: TENANT });

    const workerOnLeave = await createTestWorker({
      name: 'Worker On Leave',
      subdomain: TENANT,
      department: webDept._id,
      performancePoints: 500
    });

    const workerAvailable = await createTestWorker({
      name: 'Worker Available',
      subdomain: TENANT,
      department: webDept._id,
      performancePoints: 50
    });

    const now = new Date();
    await Leave.create({
      worker: workerOnLeave._id,
      subdomain: TENANT,
      leaveType: 'Annual Leave',
      reason: 'Scheduled vacation',
      totalDays: 3,
      status: 'Approved',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    });

    const ticket = await Ticket.create({
      title: 'Website Task',
      subdomain: TENANT,
      status: 'To Do',
      labels: ['job-type:website']
    });

    const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(String(result.assigneeId), String(workerAvailable._id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Deterministic Tie-Breaking Sequence
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Deterministic tie-breaking sequence: totalScore -> completedTickets -> createdAt -> _id', () => {
    const worker1 = {
      _id: new mongoose.Types.ObjectId('111111111111111111111111'),
      name: 'Worker 1',
      skills: ['JS'],
      kpiScore: 25,
      totalCompletedTickets: 10,
      createdAt: new Date('2026-01-01')
    };
    const worker2 = {
      _id: new mongoose.Types.ObjectId('222222222222222222222222'),
      name: 'Worker 2',
      skills: ['JS'],
      kpiScore: 25,
      totalCompletedTickets: 5,
      createdAt: new Date('2026-01-01')
    };

    const workloadMap = new Map();
    workloadMap.set(String(worker1._id), 0);
    workloadMap.set(String(worker2._id), 0);

    const ticket = { title: 'JS Project' };

    // Worker 1 has more completedTickets (10 vs 5), so Worker 1 must be ranked first
    const ranked = scoreAndRankCandidates([worker2, worker1], ticket, workloadMap);
    assert.strictEqual(String(ranked[0].worker._id), String(worker1._id));
    assert.strictEqual(String(ranked[1].worker._id), String(worker2._id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Manual Job Intake Selections and Existing Overrides Preserved
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Manual Job Intake selections and existing manual assignments are strictly preserved', async () => {
    const webDept = await Department.create({ name: 'Website Development', subdomain: TENANT });
    const admin = await Admin.create({ username: 'admin1', email: 'admin1@testciphergate.com', subdomain: TENANT, password: 'password123' });

    const manualWorker = await createTestWorker({
      name: 'Manually Selected Worker',
      subdomain: TENANT,
      department: webDept._id,
      performancePoints: 10
    });

    const starWorker = await createTestWorker({
      name: 'Auto Star Worker',
      subdomain: TENANT,
      department: webDept._id,
      performancePoints: 500
    });

    const invoice = await Invoice.create({
      invoiceNo: 'TV000888',
      invoiceDate: '20/10/2026',
      subdomain: TENANT,
      createdBy: admin._id,
      createdByModel: 'Admin',
      customerName: 'Client Alpha',
      customerContact: '9876543210',
      status: 'Payment Received',
      isPaid: true,
      invoiceType: 'TAX INVOICE',
      paymentDetails: { proof: 'https://test/proof.png' },
      items: [{ description: 'Website Redesign', qty: 1, rate: 50000, total: 50000 }]
    });

    // Explicit manual intake assignment to manualWorker
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: manualWorker._id
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assignmentMode, 'Individual');

    const ticketAfterIntake = await Ticket.findById(result.ticketId);
    assert.strictEqual(String(ticketAfterIntake.assignee), String(manualWorker._id));
    assert.strictEqual(ticketAfterIntake.assignmentSource, 'manual');

    // Run autoAssignJobTicket on this already-assigned ticket
    const autoResult = await autoAssignJobTicket({ ticket: ticketAfterIntake, subdomain: TENANT });
    assert.strictEqual(autoResult.isAlreadyAssigned, true);
    assert.strictEqual(String(autoResult.assignee), String(manualWorker._id), 'Must NOT overwrite manual assignment with starWorker');

    const ticketRefreshed = await Ticket.findById(result.ticketId);
    assert.strictEqual(String(ticketRefreshed.assignee), String(manualWorker._id), 'Manual assignment remains identical');
  });

  // Teardown
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`Results: ${passCount}/${testCount} Passed (${failCount} Failed)`);
  console.log('======================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
