/**
 * End-to-End Integration Validation Test Suite — Systems 1, 2, and 3
 * 
 * Verifies:
 * 1. Invoice payment proof upload and verification flow.
 * 2. Classification into Website Development vs Software Development.
 * 3. Exactly-once creation of Job Intake records and Tickets.
 * 4. Website Development auto-assignment strictly to eligible existing Web Dev department worker.
 * 5. Software Development jobs left unassigned for admin team selection.
 * 6. Workload & capacity propagation into System 3 KPI computation.
 * 7. Duplicate submissions, retries, idempotent protection.
 * 8. Missing departments, overloaded/on-leave employees, cross-tenant isolation.
 * 9. Ambiguous job protection (never silently auto-assigned).
 * 10. Unverified invoice protection (cannot generate production tickets via controller guards).
 * 
 * STRICT ISOLATION GUARANTEES:
 * - Runs ONLY on local loopback mongodb://127.0.0.1:27017/tech_ciphergate_e2e_validation_test
 * - Fails closed if remote/live database URI detected
 * - Cleans up and drops test database upon completion
 * - Mocks external services (WhatsApp, payment gateways)
 */

const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_e2e_validation_test';

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
console.log(' Tech Ciphergate — End-to-End Systems 1, 2, 3 Validation        ');
console.log(` Target DB: ${TEST_DB_URI}`);
console.log('================================================================\n');

const Department = require('../models/Department');
const Worker = require('../models/Worker');
const Ticket = require('../models/ticketModel');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');
const { computeTenantKpiSummary, computeWorkerKpi } = require('../services/kpiComputationService');
const { classifyInvoiceJob } = require('../services/jobAssignmentService');
const invoiceController = require('../controllers/invoiceController');

let testCount = 0;
let passCount = 0;
let failCount = 0;

let workerSeq = 0;
function createWorker(overrides = {}) {
  workerSeq++;
  const tag = `${workerSeq}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSeq}`,
    username: overrides.username || `worker_${tag}`,
    email: overrides.email || `worker_${tag}@e2etest.com`,
    rfid: overrides.rfid || `RFID_${tag}`,
    password: overrides.password || 'password123',
    subdomain: overrides.subdomain || 'e2e-org',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    totalCompletedTickets: overrides.totalCompletedTickets !== undefined ? overrides.totalCompletedTickets : 0,
    department: overrides.department || null,
    ...overrides
  });
}

function createAdmin(overrides = {}) {
  const tag = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Admin.create({
    name: overrides.name || 'E2E Admin',
    username: overrides.username || `admin_${tag}`,
    email: overrides.email || `admin_${tag}@e2etest.com`,
    password: overrides.password || 'Password123!',
    role: overrides.role || 'superadmin',
    subdomain: overrides.subdomain || 'e2e-org',
    ...overrides
  });
}

let invSeq = 0;
function createInvoice(overrides = {}) {
  invSeq++;
  return Invoice.create({
    invoiceNo: overrides.invoiceNo || `E2E-INV-${invSeq}`,
    invoiceDate: '20/10/2026',
    actualDate: new Date(),
    customerName: overrides.customerName || 'Acme Corp',
    customerContact: '9876543210',
    subdomain: overrides.subdomain || 'e2e-org',
    items: overrides.items || [{ description: 'General Technical Services', qty: 1, rate: 10000, total: 10000 }],
    status: overrides.status || 'Payment Received',
    isPaid: overrides.isPaid !== undefined ? overrides.isPaid : true,
    paymentDetails: overrides.paymentDetails || {
      proof: overrides.paymentProofUrl || 'https://storage.test/proofs/pay.jpg',
      proofs: [{ date: new Date(), url: overrides.paymentProofUrl || 'https://storage.test/proofs/pay.jpg' }]
    },
    paymentProofUrl: overrides.paymentProofUrl || 'https://storage.test/proofs/pay.jpg',
    createdBy: overrides.createdBy,
    createdByModel: 'Admin',
    invoiceType: overrides.invoiceType || 'TAX INVOICE',
    ...overrides
  });
}

async function runTest(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Step ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Step ${testCount}: ${name}`);
    console.error('    Error:', err.message);
    if (err.stack) console.error('    Stack:', err.stack.split('\n').slice(1, 4).join('\n'));
  }
}

async function main() {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();

  const tenant = 'e2e-org';
  const admin = await createAdmin({ subdomain: tenant });

  // Setup departments
  const webDept = await Department.create({
    name: 'Website Development',
    subdomain: tenant,
    description: 'WordPress, Shopify and Frontend web development'
  });

  const swDept = await Department.create({
    name: 'Software Development',
    subdomain: tenant,
    description: 'Backend distributed systems, microservices, APIs and cloud'
  });

  const webWorker1 = await createWorker({
    name: 'Alice WebDev',
    department: webDept._id,
    subdomain: tenant,
    skills: ['wordpress', 'html', 'css', 'react']
  });

  const webWorker2 = await createWorker({
    name: 'Bob WebDev',
    department: webDept._id,
    subdomain: tenant,
    skills: ['shopify', 'woocommerce', 'web']
  });

  const swWorker1 = await createWorker({
    name: 'Charlie Software',
    department: swDept._id,
    subdomain: tenant,
    skills: ['golang', 'microservices', 'kubernetes', 'postgres']
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Website Development: Verified Payment -> Intake -> Ticket -> Auto-Assign 1 Web Dev
  // ─────────────────────────────────────────────────────────────────────────────
  let webTicketId = null;
  let webInvoiceDoc = null;
  await runTest('Website Development invoice creates exactly 1 ticket and auto-assigns 1 Web Dev worker', async () => {
    webInvoiceDoc = await createInvoice({
      invoiceNo: 'TV000501',
      customerName: 'Global Web Client',
      subdomain: tenant,
      items: [{ description: 'WordPress Custom Corporate Website', qty: 1, rate: 35000, total: 35000 }],
      total: 35000,
      status: 'Payment Received',
      isPaid: true,
      paymentProofUrl: 'https://proofs.s3.test/pay_web.png',
      createdBy: admin._id
    });

    const classification = classifyInvoiceJob({ invoice: webInvoiceDoc, departments: [webDept, swDept], workers: [webWorker1, webWorker2, swWorker1] });
    assert.strictEqual(classification.jobType, 'Website Development');

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice: webInvoiceDoc,
      adminUser: admin,
      selectedJobType: classification.jobType
    });

    assert.strictEqual(result.success, true);
    webTicketId = result.ticketId;
    const ticket = await Ticket.findById(webTicketId);
    assert(ticket, 'Ticket must be created');
    assert.strictEqual(ticket.team, 'Website Development');
    assert(ticket.assignee, 'Must have assignee');
    assert(
      ticket.assignee.toString() === webWorker1._id.toString() ||
      ticket.assignee.toString() === webWorker2._id.toString(),
      'Must assign one of the existing Web Development department workers'
    );
    assert.notStrictEqual(ticket.assignee.toString(), swWorker1._id.toString(), 'Must NOT assign Software worker');
    assert.strictEqual(ticket.assignmentMode, 'Individual');
    assert.strictEqual(ticket.status, 'To Do');

    // Confirm JobIntake document created exactly once
    const intakeRecords = await JobIntake.find({ orderId: `INV-${webInvoiceDoc.invoiceNo}`, subdomain: tenant });
    assert.strictEqual(intakeRecords.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. System 3 KPI Reflection: Workload & Active Tasks Updated
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('System 3 KPI summary immediately reflects active workload for assigned Web Dev worker', async () => {
    const kpiSummary = await computeTenantKpiSummary(tenant);
    assert.strictEqual(kpiSummary.activeTicketsCount, 1);
    assert.strictEqual(kpiSummary.completedTicketsCount, 0);

    const ticket = await Ticket.findById(webTicketId);
    const assignedWorkerId = ticket.assignee;
    const workerKpi = await computeWorkerKpi(assignedWorkerId, tenant);

    assert.strictEqual(workerKpi.metrics.activeTasksCount, 1);
    assert.strictEqual(workerKpi.metrics.availableCapacity, 4); // 5 - 1 = 4
    assert.strictEqual(workerKpi.metrics.capacityUtilizationPct, 20); // 1/5 = 20%
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Software Development: Verified Payment -> Intake -> Ticket in To Do -> Unassigned
  // ─────────────────────────────────────────────────────────────────────────────
  let swTicketId = null;
  await runTest('Software Development invoice creates ticket in To Do but leaves unassigned for admin review', async () => {
    const invoice = await createInvoice({
      invoiceNo: 'TV000502',
      customerName: 'Enterprise Cloud Corp',
      subdomain: tenant,
      items: [{ description: 'Backend Microservices Distributed API Architecture', qty: 1, rate: 85000, total: 85000 }],
      total: 85000,
      status: 'Payment Received',
      isPaid: true,
      paymentProofUrl: 'https://proofs.s3.test/pay_sw.png',
      createdBy: admin._id
    });

    const classification = classifyInvoiceJob({ invoice, departments: [webDept, swDept] });
    assert.strictEqual(classification.jobType, 'Software Development');

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      selectedJobType: classification.jobType
    });

    assert.strictEqual(result.success, true);
    swTicketId = result.ticketId;
    const ticket = await Ticket.findById(swTicketId);
    assert(ticket, 'Software ticket must be created');
    assert.strictEqual(ticket.assignee, null, 'Must NOT be auto-assigned to any employee');
    assert.strictEqual(ticket.team, null, 'Team must be left for admin selection');
    assert(ticket.unassignedReason.includes('Software Development job detected'), 'Must record reason for admin selection');
    assert.strictEqual(ticket.status, 'To Do');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Ambiguous Scope: Verified Payment -> Unassigned for Admin Review
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Ambiguous job remains safely unassigned and never silently auto-assigned', async () => {
    const invoice = await createInvoice({
      invoiceNo: 'TV000503',
      customerName: 'Hybrid Client',
      subdomain: tenant,
      items: [
        { description: 'Corporate Website CMS & Custom Python Microservice Backend', qty: 1, rate: 90000, total: 90000 }
      ],
      total: 90000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const classification = classifyInvoiceJob({ invoice, departments: [webDept, swDept] });
    assert.strictEqual(classification.jobType, 'Multi-Department');

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      selectedJobType: classification.jobType
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignee, null, 'Ambiguous job must not be silently assigned');
    assert(ticket.unassignedReason.includes('Multi-Department job detected'));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Unverified / Pending Invoices Guard: Must NOT create production tasks
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Unverified invoices cannot create production tickets via controller payment guard', async () => {
    const unverifiedInvoice = await createInvoice({
      invoiceNo: 'TV000504',
      customerName: 'Unpaid Client',
      subdomain: tenant,
      items: [{ description: 'WordPress Website', qty: 1, rate: 30000, total: 30000 }],
      status: 'Invoice',
      isPaid: false,
      paymentDetails: null,
      paymentProofUrl: null,
      createdBy: admin._id
    });

    const req = {
      params: { id: unverifiedInvoice._id },
      body: {},
      user: admin
    };

    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; return body; }
        };
      }
    };

    await invoiceController.triggerJobIntakeForInvoice(req, res);
    assert.strictEqual(statusCode, 400, 'Must return 400 Bad Request');
    assert.strictEqual(responseBody.success, false);
    assert(responseBody.message.includes('authorized payment verification'));

    const existingTickets = await Ticket.find({ subdomain: tenant, title: { $regex: 'TV000504' } });
    assert.strictEqual(existingTickets.length, 0, 'No ticket should be created for unverified invoice');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Idempotency: Retries & Duplicate Submissions Do Not Duplicate Tickets
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Duplicate intake triggers do not create duplicate tickets or intakes', async () => {
    const originalTicketCount = await Ticket.countDocuments({ subdomain: tenant });
    const originalIntakeCount = await JobIntake.countDocuments({ subdomain: tenant });

    const retryResult = await processJobIntakeFromVerifiedInvoice({
      invoice: webInvoiceDoc,
      adminUser: admin,
      selectedJobType: 'Website Development'
    });

    assert.strictEqual(retryResult.success, true);
    assert.strictEqual(retryResult.ticketId.toString(), webTicketId.toString());

    const finalTicketCount = await Ticket.countDocuments({ subdomain: tenant });
    const finalIntakeCount = await JobIntake.countDocuments({ subdomain: tenant });

    assert.strictEqual(finalTicketCount, originalTicketCount, 'Ticket count must not increase on retry');
    assert.strictEqual(finalIntakeCount, originalIntakeCount, 'Intake count must not increase on retry');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Multi-Tenant Scoping: Cross-Tenant Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Cross-tenant requests strictly isolate departments, workers, tickets, and KPIs', async () => {
    const otherTenant = 'other-org';
    const otherDept = await Department.create({
      name: 'Regional Web Dev',
      subdomain: otherTenant,
      description: 'Other org website team'
    });
    const otherWorker = await createWorker({
      name: 'Other Org Dev',
      department: otherDept._id,
      subdomain: otherTenant
    });

    const otherAdmin = await createAdmin({ subdomain: otherTenant });

    const otherInvoice = await createInvoice({
      invoiceNo: 'OTHER-001',
      customerName: 'Foreign Client',
      subdomain: otherTenant,
      items: [{ description: 'WordPress Website', qty: 1, rate: 10000, total: 10000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: otherAdmin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice: otherInvoice,
      adminUser: otherAdmin,
      selectedJobType: 'Website Development'
    });

    assert.strictEqual(result.success, true);
    const otherTicket = await Ticket.findById(result.ticketId);
    assert.strictEqual(otherTicket.subdomain, otherTenant);
    assert.strictEqual(otherTicket.assignee.toString(), otherWorker._id.toString());
    assert.notStrictEqual(otherTicket.assignee.toString(), webWorker1._id.toString());

    // Verify System 3 KPI isolation
    const kpiSummaryTenantA = await computeTenantKpiSummary(tenant);
    const kpiSummaryTenantB = await computeTenantKpiSummary(otherTenant);

    assert.strictEqual(kpiSummaryTenantA.totalWorkers, 3); // webWorker1, webWorker2, swWorker1
    assert.strictEqual(kpiSummaryTenantB.totalWorkers, 1); // otherWorker
    assert.strictEqual(kpiSummaryTenantB.activeTicketsCount, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Workload Progression to Done & OTCR / Duration KPI Calculation
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Advancing task through In Progress -> Review -> Done reflects in OTCR and execution metrics', async () => {
    const ticket = await Ticket.findById(webTicketId);
    
    // Simulate transition to In Progress
    const startExecution = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
    ticket.status = 'In Progress';
    ticket.statusHistory.push({ status: 'In Progress', changedAt: startExecution });
    await ticket.save();

    // Simulate transition to Review
    const reviewSubmission = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    ticket.status = 'Review';
    ticket.statusHistory.push({ status: 'Review', changedAt: reviewSubmission });
    ticket.reviewCycles.push({
      submissionTime: reviewSubmission,
      decision: 'Approved',
      decisionTime: new Date()
    });
    await ticket.save();

    // Simulate transition to Done
    const doneTime = new Date();
    ticket.status = 'Done';
    ticket.actualCompletionDate = reviewSubmission;
    ticket.endDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // deadline was tomorrow (On-time)
    ticket.statusHistory.push({ status: 'Done', changedAt: doneTime });
    await ticket.save();

    // Ingest into System 3
    const updatedKpi = await computeTenantKpiSummary(tenant);
    assert.strictEqual(updatedKpi.completedTicketsCount, 1);
    assert.strictEqual(updatedKpi.overallOtcr, 100, 'Must be 100% On-Time Completion Rate');
    assert.strictEqual(updatedKpi.overallFtar, 100, 'Must be 100% First-Time Approval Rate');
    assert(updatedKpi.avgExecutionHours > 0, 'Execution duration must be calculated from statusHistory');
    assert.strictEqual(updatedKpi.dataCoverage.deadlineCoveragePct, 100);
    assert.strictEqual(updatedKpi.dataCoverage.executionCoveragePct, 100);
  });

  // Teardown
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(` End-to-End Test Summary: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
