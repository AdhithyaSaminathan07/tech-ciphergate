/**
 * System 3: KPI API Integration & Response Shape Test Suite
 * Tech Ciphergate - API Validation, Filtering, Scoping, and Zero vs Unavailable Checks
 * 
 * Target DB: Local MongoDB only (mongodb://127.0.0.1:27017/tech_ciphergate_kpi_api_test).
 * Zero remote/Atlas connections.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_kpi_api_test';

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
console.log(' Tech Ciphergate — System 3 KPI Integration API Test Suite      ');
console.log(` Target DB: ${TEST_DB_URI}`);
console.log('================================================================\n');

// Models
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const PerformancePoints = require('../models/PerformancePoints');

// Services & Controllers
const {
  computeWorkerKpi,
  computeDepartmentKpi,
  computeTenantKpiSummary
} = require('../services/kpiComputationService');

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
    subdomain: overrides.subdomain || 'tenant-a',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    department: overrides.department || null,
    ...overrides
  });
}

async function main() {
  await mongoose.connect(TEST_DB_URI);

  async function cleanAll() {
    await Promise.all([
      Worker.deleteMany({}),
      Department.deleteMany({}),
      Ticket.deleteMany({}),
      PerformancePoints.deleteMany({})
    ]);
  }

  // ============================================================================
  // TEST 1: API Response Shape Validation (System 3 KPI Summary)
  // ============================================================================
  await runTest('1. API Response Shape: Returns all required System 3 operational metrics', async () => {
    await cleanAll();

    const dept = await Department.create({ name: 'Web Dev', subdomain: 'tenant-a' });
    const worker = await createTestWorker({
      name: 'Alice',
      subdomain: 'tenant-a',
      department: dept._id,
      performancePoints: 50
    });

    const ticket = await Ticket.create({
      title: 'Valid Ticket',
      subdomain: 'tenant-a',
      assignee: worker._id,
      assignees: [worker._id],
      status: 'Done',
      startDate: new Date('2026-10-01T09:00:00Z'),
      endDate: new Date('2026-10-05T18:00:00Z'),
      actualCompletionDate: new Date('2026-10-04T12:00:00Z'),
      statusHistory: [
        { status: 'In Progress', changedAt: new Date('2026-10-02T10:00:00Z') },
        { status: 'Done', changedAt: new Date('2026-10-04T12:00:00Z') }
      ],
      reviewCycles: [
        { submissionTime: new Date('2026-10-04T12:00:00Z'), decision: 'Approved' }
      ]
    });

    const summary = await computeTenantKpiSummary('tenant-a');

    // Structural assertions
    assert.strictEqual(summary.subdomain, 'tenant-a');
    assert.strictEqual(summary.totalWorkers, 1);
    assert.strictEqual(summary.totalTickets, 1);
    assert.strictEqual(summary.completedTicketsCount, 1);
    assert.strictEqual(summary.activeTicketsCount, 0);

    // Primary System 3 metric values
    assert.strictEqual(summary.overallOtcr, 100);
    assert.strictEqual(summary.overallFtar, 100);
    assert.strictEqual(summary.overallDelayedCompletedRate, 0);
    assert.strictEqual(summary.totalCapacity, 5);
    assert.strictEqual(summary.availableCapacity, 5);
    assert.strictEqual(summary.capacityUtilizationPct, 0);

    // Duration & data coverage
    assert.ok(typeof summary.avgExecutionHours === 'number' && summary.avgExecutionHours > 0);
    assert.strictEqual(summary.dataCoverage.deadlineCoveragePct, 100);
    assert.strictEqual(summary.dataCoverage.reviewCoveragePct, 100);
    assert.strictEqual(summary.dataCoverage.executionCoveragePct, 100);

    // Department & member rollup
    assert.strictEqual(summary.departments.length, 1);
    const dSummary = summary.departments[0];
    assert.strictEqual(dSummary.department.name, 'Web Dev');
    assert.strictEqual(dSummary.summary.teamOnTimeCompletionRate, 100);
    assert.strictEqual(dSummary.members.length, 1);

    const m = dSummary.members[0];
    assert.strictEqual(m.worker.name, 'Alice');
    assert.ok(m.system2Assignment.kpiScore > 0);
    assert.ok(m.system2Assignment.breakdown.pointsScore >= 0);
    assert.ok(m.system2Assignment.breakdown.otcrScore >= 0);
    assert.ok(m.system2Assignment.breakdown.ftarScore >= 0);
  });

  // ============================================================================
  // TEST 2: Distinguishing True Zero from Unavailable Data
  // ============================================================================
  await runTest('2. Zero vs Unavailable: Missing dates produce null/Unavailable; delayed tasks produce true 0%', async () => {
    await cleanAll();

    const dept = await Department.create({ name: 'Web Dev', subdomain: 'tenant-a' });
    const worker = await createTestWorker({
      name: 'Bob',
      subdomain: 'tenant-a',
      department: dept._id
    });

    // Case A: Missing deadline and review data -> must be null (Unavailable), NOT 0%
    await Ticket.create({
      title: 'Legacy Ticket Without Dates',
      subdomain: 'tenant-a',
      assignee: worker._id,
      status: 'Done'
      // No endDate, no reviewCycles, no statusHistory
    });

    const summaryUnavailable = await computeTenantKpiSummary('tenant-a');
    assert.strictEqual(summaryUnavailable.overallOtcr, null, 'OTCR must be null when no tickets have deadlines');
    assert.strictEqual(summaryUnavailable.overallFtar, null, 'FTAR must be null when no review cycles exist');
    assert.strictEqual(summaryUnavailable.avgExecutionHours, null, 'Avg execution must be null without In Progress history');
    assert.strictEqual(summaryUnavailable.overallDelayedCompletedRate, null);

    // Case B: Has deadline, but task was finished AFTER deadline -> must be true 0% OTCR and 100% delayed
    await Ticket.deleteMany({});
    await Ticket.create({
      title: 'Delayed Task',
      subdomain: 'tenant-a',
      assignee: worker._id,
      status: 'Done',
      startDate: new Date('2026-10-01T09:00:00Z'),
      endDate: new Date('2026-10-03T18:00:00Z'), // Deadline
      actualCompletionDate: new Date('2026-10-06T12:00:00Z') // Completed late
    });

    const summaryTrueZero = await computeTenantKpiSummary('tenant-a');
    assert.strictEqual(summaryTrueZero.overallOtcr, 0, 'OTCR must be true 0% for delayed tasks');
    assert.strictEqual(summaryTrueZero.overallDelayedCompletedRate, 100, 'Delayed completed rate must be 100%');
  });

  // ============================================================================
  // TEST 3: Date Range Filtering Scoping
  // ============================================================================
  await runTest('3. Date Range Filtering: Filters completed tickets strictly within start/end range', async () => {
    await cleanAll();

    const dept = await Department.create({ name: 'QA Dept', subdomain: 'tenant-a' });
    const worker = await createTestWorker({ subdomain: 'tenant-a', department: dept._id });

    // Ticket in September (outside range)
    await Ticket.create({
      title: 'September Ticket',
      subdomain: 'tenant-a',
      assignee: worker._id,
      status: 'Done',
      actualCompletionDate: new Date('2026-09-15T12:00:00Z')
    });

    // Ticket in October (inside range)
    await Ticket.create({
      title: 'October Ticket',
      subdomain: 'tenant-a',
      assignee: worker._id,
      status: 'Done',
      actualCompletionDate: new Date('2026-10-10T12:00:00Z')
    });

    const filteredSummary = await computeTenantKpiSummary('tenant-a', {
      startDate: '2026-10-01',
      endDate: '2026-10-31'
    });

    assert.strictEqual(filteredSummary.completedTicketsCount, 1, 'Only October ticket must be included');
  });

  // ============================================================================
  // TEST 4: Department / Team Scoping
  // ============================================================================
  await runTest('4. Department Scoping: Filtering by department excludes other departments', async () => {
    await cleanAll();

    const dept1 = await Department.create({ name: 'Frontend', subdomain: 'tenant-a' });
    const dept2 = await Department.create({ name: 'Backend', subdomain: 'tenant-a' });

    const worker1 = await createTestWorker({ name: 'Front Dev', subdomain: 'tenant-a', department: dept1._id });
    const worker2 = await createTestWorker({ name: 'Back Dev', subdomain: 'tenant-a', department: dept2._id });

    await Ticket.create({ title: 'T1', subdomain: 'tenant-a', assignee: worker1._id, status: 'In Progress' });
    await Ticket.create({ title: 'T2', subdomain: 'tenant-a', assignee: worker2._id, status: 'In Progress' });

    const scopedSummary = await computeTenantKpiSummary('tenant-a', { department: 'Frontend' });
    assert.strictEqual(scopedSummary.departments.length, 1);
    assert.strictEqual(scopedSummary.departments[0].department.name, 'Frontend');
    assert.strictEqual(scopedSummary.totalWorkers, 1);
    assert.strictEqual(scopedSummary.activeTicketsCount, 1);
  });

  // ============================================================================
  // TEST 5: Tenant Isolation
  // ============================================================================
  await runTest('5. Tenant Isolation: Subdomain guarantees strict data separation', async () => {
    await cleanAll();

    const wA = await createTestWorker({ subdomain: 'tenant-a', name: 'Tenant A Dev' });
    const wB = await createTestWorker({ subdomain: 'tenant-b', name: 'Tenant B Dev' });

    await Ticket.create({ title: 'A Ticket', subdomain: 'tenant-a', assignee: wA._id, status: 'Done' });
    await Ticket.create({ title: 'B Ticket', subdomain: 'tenant-b', assignee: wB._id, status: 'Done' });

    const summaryA = await computeTenantKpiSummary('tenant-a');
    assert.strictEqual(summaryA.totalWorkers, 1);
    assert.strictEqual(summaryA.completedTicketsCount, 1);

    const summaryB = await computeTenantKpiSummary('tenant-b');
    assert.strictEqual(summaryB.totalWorkers, 1);
    assert.strictEqual(summaryB.completedTicketsCount, 1);
  });

  // ============================================================================
  // TEST 6: Read-Only Safety Verification
  // ============================================================================
  await runTest('6. Read-Only Safety: KPI computations perform zero database mutations', async () => {
    await cleanAll();

    const dept = await Department.create({ name: 'Web Dev', subdomain: 'tenant-a' });
    const worker = await createTestWorker({
      name: 'Safe Worker',
      subdomain: 'tenant-a',
      department: dept._id,
      performancePoints: 20
    });

    const ticket = await Ticket.create({
      title: 'Read Only Task',
      subdomain: 'tenant-a',
      assignee: worker._id,
      status: 'Done'
    });

    const countBefore = await Ticket.countDocuments();
    const workerBefore = await Worker.findById(worker._id).lean();

    // Call computations multiple times
    await computeTenantKpiSummary('tenant-a');
    await computeDepartmentKpi('Web Dev', 'tenant-a');
    await computeWorkerKpi(worker._id, 'tenant-a');

    const countAfter = await Ticket.countDocuments();
    const workerAfter = await Worker.findById(worker._id).lean();

    assert.strictEqual(countAfter, countBefore, 'Ticket count must not change');
    assert.strictEqual(workerAfter.performancePoints, workerBefore.performancePoints, 'Worker points must not mutate');
  });

  console.log('\n================================================================');
  console.log(` System 3 KPI Integration API Summary: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error during integration test run:', err);
  process.exit(1);
});
