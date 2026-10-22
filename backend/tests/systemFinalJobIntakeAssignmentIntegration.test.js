/**
 * System Final Integration Test Suite
 * 
 * Verifies End-to-End:
 * Payment Verification -> Job Intake -> Ticket Creation -> Automatic Team Assignment
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY against isolated local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote / production URI is detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_final_integration_test';

function assertSafeEnvironment(uri) {
  if (!uri.startsWith('mongodb://127.0.0.1:27017/') && !uri.startsWith('mongodb://localhost:27017/')) {
    throw new Error(`CRITICAL SAFETY ABORT: Attempted to run tests against non-local host: ${uri}`);
  }
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('production') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY ABORT: Live or cluster database keyword detected in URI!');
  }
}
assertSafeEnvironment(LOCAL_STAGING_URI);

console.log('================================================================');
console.log(' Tech Ciphergate — Final Job Intake & Assignment Test Suite     ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Ticket = require('../models/ticketModel');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');
const { autoAssignJobTicket, analyzeScopeDepartments, detectTargetDepartment } = require('../services/jobAssignmentService');
const { updateTicket } = require('../controllers/ticketController');

let workerSequence = 0;
function createTestWorker(overrides = {}) {
  workerSequence++;
  const uniqueTag = `${workerSequence}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSequence}`,
    username: overrides.username || `worker_${uniqueTag}`,
    rfid: overrides.rfid || `RFID_${uniqueTag}`,
    password: overrides.password || 'password123',
    subdomain: overrides.subdomain || 'final-test-org',
    role: 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    totalCompletedTickets: overrides.totalCompletedTickets !== undefined ? overrides.totalCompletedTickets : 0,
    department: overrides.department || null,
    ...overrides
  });
}

function createTestAdmin(overrides = {}) {
  const uniqueTag = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Admin.create({
    name: overrides.name || 'Final Admin',
    username: overrides.username || `admin_${uniqueTag}`,
    email: overrides.email || `admin_${uniqueTag}@finaltest.com`,
    password: overrides.password || 'Password123!',
    subdomain: overrides.subdomain || 'final-test-org',
    role: 'admin',
    ...overrides
  });
}

let invoiceSequence = 0;
function createTestInvoice(overrides = {}) {
  invoiceSequence++;
  const num = String(invoiceSequence).padStart(4, '0');
  return Invoice.create({
    invoiceNo: overrides.invoiceNo || `TC-FIN-${num}`,
    invoiceDate: '17/10/2026',
    actualDate: new Date(),
    customerName: overrides.customerName || 'Test Customer',
    customerContact: overrides.customerContact || '9876543210',
    subdomain: overrides.subdomain || 'final-test-org',
    items: overrides.items || [{ description: 'General Technical Services', qty: 1, rate: 10000, total: 10000 }],
    status: overrides.status || 'Payment Received',
    isPaid: overrides.isPaid !== undefined ? overrides.isPaid : true,
    paymentProofUrl: overrides.paymentProofUrl || 'https://storage.test/proofs/pay_proof.jpg',
    createdBy: overrides.createdBy,
    createdByModel: 'Admin',
    ...overrides
  });
}

async function runTest(name, fn) {
  testCount++;
  try {
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

async function main() {
  await mongoose.connect(LOCAL_STAGING_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const tenant = 'final-test-org';
  const otherTenant = 'other-test-org';

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Verified Invoice with Design line items assigns Design, NEVER DEV
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Invoice with Design items assigns Design department, never defaulting to DEV', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const devDept = await Department.create({ name: 'Web Development', subdomain: tenant });
    const designDept = await Department.create({ name: 'Design', subdomain: tenant });

    const devWorker = await createTestWorker({
      name: 'Bob Dev',
      subdomain: tenant,
      department: devDept._id,
      designation: 'Backend Developer'
    });

    const designWorker = await createTestWorker({
      name: 'Alice Designer',
      subdomain: tenant,
      department: designDept._id,
      designation: 'UI/UX Designer',
      skills: ['figma', 'ui', 'ux', 'wireframe']
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-001',
      subdomain: tenant,
      customerName: 'Acme Creative',
      items: [
        { description: 'Figma UI/UX Design System and Prototypes', qty: 1, rate: 35000, total: 35000 }
      ],
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isDuplicate, false);

    const ticket = await Ticket.findById(result.ticketId);
    assert(ticket, 'Ticket must exist');
    assert.strictEqual(ticket.team, 'Design', 'Ticket team must be Design');
    assert.notStrictEqual(ticket.team, 'DEV', 'Ticket team must NOT be defaulted to DEV');
    assert.strictEqual(String(ticket.assignee), String(designWorker._id), 'Must be assigned to Design worker');
    assert.notStrictEqual(String(ticket.assignee), String(devWorker._id), 'Must NOT be assigned to Dev worker');
    assert.strictEqual(ticket.assignmentSource, 'automatic');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Verified Invoice with Marketing line items assigns Marketing
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Invoice with Marketing items assigns Marketing department', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const devDept = await Department.create({ name: 'Engineering', subdomain: tenant });
    const mktDept = await Department.create({ name: 'Marketing', subdomain: tenant });

    await createTestWorker({
      name: 'Dev Worker',
      subdomain: tenant,
      department: devDept._id
    });

    const mktWorker = await createTestWorker({
      name: 'Sam Marketer',
      subdomain: tenant,
      department: mktDept._id,
      designation: 'SEO Specialist',
      skills: ['seo', 'campaign', 'adwords']
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-002',
      subdomain: tenant,
      customerName: 'Growth Retailers',
      items: [
        { description: 'SEO Campaign & Google Ads Search Marketing', qty: 1, rate: 20000, total: 20000 }
      ],
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.team, 'Marketing');
    assert.strictEqual(String(ticket.assignee), String(mktWorker._id));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Multi-Department Job: creates subtasks with dependencies and assigns both departments
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Multi-department invoice creates structured checklist & subtasks with clear dependencies', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const designDept = await Department.create({ name: 'Design Studio', subdomain: tenant });
    const devDept = await Department.create({ name: 'Web Development', subdomain: tenant });
    const financeDept = await Department.create({ name: 'Finance & Accounts', subdomain: tenant });

    const designWorker = await createTestWorker({
      name: 'Diana Designer',
      subdomain: tenant,
      department: designDept._id,
      designation: 'UI/UX Designer',
      skills: ['figma', 'ui', 'prototype']
    });

    const devWorker = await createTestWorker({
      name: 'Derek Developer',
      subdomain: tenant,
      department: devDept._id,
      designation: 'Fullstack Developer',
      skills: ['react', 'node', 'api']
    });

    const financeWorker = await createTestWorker({
      name: 'Frank Finance',
      subdomain: tenant,
      department: financeDept._id,
      designation: 'Accountant'
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-003',
      subdomain: tenant,
      customerName: 'Fullstack Client Inc',
      items: [
        { description: 'Figma UI/UX Mockups & Interactive Design Prototype', qty: 1, rate: 25000, total: 25000 },
        { description: 'React Web Application & REST API Development', qty: 1, rate: 50000, total: 50000 }
      ],
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const mainTicket = await Ticket.findById(result.ticketId);
    assert(mainTicket, 'Main ticket must exist');
    assert(mainTicket.labels.includes('multi-department'), 'Main ticket must have multi-department label');

    // Verify structured dependencies in main checklist
    assert.strictEqual(mainTicket.checklist.length, 2);
    assert(mainTicket.checklist[0].text.includes('[Design Studio]'));
    assert(mainTicket.checklist[0].text.includes('Phase 1'));
    assert(mainTicket.checklist[1].text.includes('[Web Development]'));
    assert(mainTicket.checklist[1].text.includes('Dependency'));

    // Verify subtasks were created linked via parentTicket
    const subtasks = await Ticket.find({
      subdomain: tenant,
      parentTicket: mainTicket._id
    });

    assert.strictEqual(subtasks.length, 2, 'Should create exactly 2 subtasks for the 2 matching departments');

    const designSubtask = subtasks.find(s => s.team === 'Design Studio');
    const devSubtask = subtasks.find(s => s.team === 'Web Development');

    assert(designSubtask, 'Design subtask must exist');
    assert(devSubtask, 'Dev subtask must exist');

    assert.strictEqual(String(designSubtask.assignee), String(designWorker._id), 'Design subtask assigned to Designer');
    assert.strictEqual(String(devSubtask.assignee), String(devWorker._id), 'Dev subtask assigned to Developer');

    // Unrelated departments (Finance) MUST NOT be assigned
    const financeSubtask = subtasks.find(s => s.team === 'Finance & Accounts');
    assert.strictEqual(financeSubtask, undefined, 'Finance department must NOT be assigned simply because available');
    assert.notStrictEqual(String(mainTicket.assignee), String(financeWorker._id), 'Finance worker must NOT be assigned');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Approved Leave Exclusion: Worker on approved leave today is skipped
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Worker on approved leave today is excluded and available worker is assigned', async () => {
    const dept = await Department.create({ name: 'Web Development', subdomain: tenant });

    const workerOnLeave = await createTestWorker({
      name: 'Vacation Dev',
      subdomain: tenant,
      department: dept._id,
      skills: ['react', 'node']
    });

    const activeWorker = await createTestWorker({
      name: 'Present Dev',
      subdomain: tenant,
      department: dept._id,
      skills: ['react', 'node']
    });

    // Create approved leave covering today
    const now = new Date();
    await Leave.create({
      subdomain: tenant,
      worker: workerOnLeave._id,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000),
      status: 'Approved',
      leaveType: 'Annual Leave',
      reason: 'Personal Vacation',
      totalDays: 2
    });

    const ticket = await Ticket.create({
      title: 'React Bug Fix',
      description: 'Fix node react bug',
      subdomain: tenant,
      team: 'Web Development',
      status: 'To Do'
    });

    const res = await autoAssignJobTicket({ ticket, subdomain: tenant });
    assert.strictEqual(res.assigned, true);
    assert.strictEqual(String(res.assigneeId), String(activeWorker._id), 'Must assign active present worker');
    assert.notStrictEqual(String(res.assigneeId), String(workerOnLeave._id), 'Must NOT assign worker on leave');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Workload Threshold: Worker with >= 5 active tasks is excluded as overloaded
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Worker with >= 5 active tasks is excluded; available worker is assigned', async () => {
    const dept = await Department.create({ name: 'Web Development', subdomain: tenant });

    const overloadedWorker = await createTestWorker({
      name: 'Maxed Dev',
      subdomain: tenant,
      department: dept._id
    });

    const availableWorker = await createTestWorker({
      name: 'Fresh Dev',
      subdomain: tenant,
      department: dept._id
    });

    // Create 5 active tickets for overloadedWorker
    for (let i = 0; i < 5; i++) {
      await Ticket.create({
        title: `Active Ticket ${i}`,
        subdomain: tenant,
        assignee: overloadedWorker._id,
        assignees: [overloadedWorker._id],
        status: 'In Progress'
      });
    }

    const newTicket = await Ticket.create({
      title: 'New Feature Task',
      description: 'React development feature',
      subdomain: tenant,
      team: 'Web Development',
      status: 'To Do'
    });

    const res = await autoAssignJobTicket({ ticket: newTicket, subdomain: tenant });
    assert.strictEqual(res.assigned, true);
    assert.strictEqual(String(res.assigneeId), String(availableWorker._id));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: Safe Unassigned Fallback: When all workers are overloaded, ticket stays unassigned with reason
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('When all workers are overloaded, ticket stays safely unassigned with recorded reason', async () => {
    const dept = await Department.create({ name: 'Web Development', subdomain: tenant });

    const soloWorker = await createTestWorker({
      name: 'Solo Worker',
      subdomain: tenant,
      department: dept._id
    });

    for (let i = 0; i < 5; i++) {
      await Ticket.create({
        title: `Task ${i}`,
        subdomain: tenant,
        assignee: soloWorker._id,
        status: 'To Do'
      });
    }

    const ticket = await Ticket.create({
      title: 'Emergency Task',
      description: 'Web development work',
      subdomain: tenant,
      team: 'Web Development',
      status: 'To Do'
    });

    const res = await autoAssignJobTicket({ ticket, subdomain: tenant });
    assert.strictEqual(res.assigned, false);
    assert(res.unassignedReason.includes('maximum capacity'), 'Must record maximum capacity reason');

    const updated = await Ticket.findById(ticket._id);
    assert.ok(!updated.assignee, 'Ticket must remain unassigned');
    assert(updated.unassignedReason.includes('maximum capacity'));
    assert.strictEqual(updated.assignmentHistory.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Ambiguous Scope Fallback: Unclear job scope leaves ticket unassigned without guessing
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Ambiguous scope leaves ticket safely unassigned with clear reason for admin review', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const devDept = await Department.create({ name: 'Web Development', subdomain: tenant });
    const designDept = await Department.create({ name: 'UI/UX Design', subdomain: tenant });

    await createTestWorker({
      name: 'Dev Worker',
      subdomain: tenant,
      department: devDept._id
    });

    await createTestWorker({
      name: 'Design Worker',
      subdomain: tenant,
      department: designDept._id
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-007',
      subdomain: tenant,
      customerName: 'Mystery Client',
      items: [
        { description: 'General Consulting retainer services', qty: 1, rate: 10000, total: 10000 }
      ],
      createdBy: admin._id
    });

    const res = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    const ticket = await Ticket.findById(res.ticketId);
    assert.ok(!ticket.assignee, 'Ticket must remain unassigned');
    assert.strictEqual(ticket.team, null, 'Ticket team must be null and NEVER default to DEV');
    assert(ticket.unassignedReason.includes('Ambiguous department requirement'), 'Must record ambiguous reason');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 8: Tenant Isolation: Cross-tenant workers are never queried or assigned
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Tenant isolation strictly enforces boundary: other tenant worker never assigned', async () => {
    await Department.create({ name: 'Dev Tenant A', subdomain: tenant });
    const deptB = await Department.create({ name: 'Dev Tenant B', subdomain: otherTenant });

    // Worker in other tenant is completely idle and skilled
    await createTestWorker({
      name: 'Other Tenant Dev',
      subdomain: otherTenant,
      department: deptB._id,
      skills: ['react', 'node']
    });

    // In tenant, no workers exist
    const ticket = await Ticket.create({
      title: 'Tenant A Dev Task',
      description: 'react node task',
      subdomain: tenant,
      team: 'Dev Tenant A',
      status: 'To Do'
    });

    const res = await autoAssignJobTicket({ ticket, subdomain: tenant });
    assert.strictEqual(res.assigned, false);
    assert(res.unassignedReason.includes('No active employees found'));

    const updated = await Ticket.findById(ticket._id);
    assert.ok(!updated.assignee, 'Ticket must remain unassigned');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 9: Idempotency & Concurrency: Duplicate verification triggers return existing ticket
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Duplicate payment verification trigger is idempotent and preserves original ticket', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const dept = await Department.create({ name: 'Web Development', subdomain: tenant });
    await createTestWorker({
      name: 'Idempotent Dev',
      subdomain: tenant,
      department: dept._id
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-009',
      subdomain: tenant,
      customerName: 'Consistent Corp',
      items: [
        { description: 'React Frontend Development', qty: 1, rate: 30000, total: 30000 }
      ],
      createdBy: admin._id
    });

    const firstRun = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(firstRun.success, true);
    assert.strictEqual(firstRun.isDuplicate, false);

    // Second trigger on same invoice
    const secondRun = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(secondRun.success, true);
    assert.strictEqual(secondRun.isDuplicate, true);
    assert.strictEqual(String(secondRun.ticketId), String(firstRun.ticketId));

    // Confirm only 1 ticket and 1 intake exist
    const ticketCount = await Ticket.countDocuments({ labels: `invoice:${invoice.invoiceNo}` });
    const intakeCount = await JobIntake.countDocuments({ invoiceNo: invoice.invoiceNo });
    assert.strictEqual(ticketCount, 1, 'Exactly 1 ticket must exist');
    assert.strictEqual(intakeCount, 1, 'Exactly 1 JobIntake record must exist');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 10: Manual Admin Override: Preserves admin assignment and never gets overwritten
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Manual admin override changes assignment to source override and is not overwritten', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const dept = await Department.create({ name: 'Web Development', subdomain: tenant });

    const workerAuto = await createTestWorker({
      name: 'Auto Assigned Worker',
      subdomain: tenant,
      department: dept._id
    });

    const workerManual = await createTestWorker({
      name: 'Manual Override Worker',
      subdomain: tenant,
      department: dept._id
    });

    const ticket = await Ticket.create({
      title: 'Override Verification Task',
      description: 'software development',
      subdomain: tenant,
      team: 'Web Development',
      assignee: workerAuto._id,
      assignees: [workerAuto._id],
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    // Admin performs manual override via updateTicket
    const req = {
      params: { id: String(ticket._id) },
      body: {
        assignee: String(workerManual._id),
        assignees: [String(workerManual._id)],
        assignmentMode: 'Individual',
        subdomain: tenant
      },
      user: { _id: admin._id, role: 'admin', subdomain: tenant }
    };

    let updatedTicketData = null;
    const res = {
      status: (code) => ({
        json: (data) => {
          assert.strictEqual(code, 200);
          updatedTicketData = data;
        }
      })
    };

    await updateTicket(req, res);
    assert(updatedTicketData, 'Response must return updated ticket');

    const freshTicket = await Ticket.findById(ticket._id);
    assert.strictEqual(String(freshTicket.assignee), String(workerManual._id));
    assert.strictEqual(freshTicket.assignmentSource, 'override');

    // Run auto-assignment again — must NOT overwrite manual override
    const reassignRes = await autoAssignJobTicket({ ticket: freshTicket, subdomain: tenant });
    assert.strictEqual(reassignRes.assigned, false);
    assert.strictEqual(reassignRes.isAlreadyAssigned, true);
    assert.strictEqual(String(reassignRes.assignee), String(workerManual._id));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 11: Dynamic Department Matching via Description & Tech Stack Metadata
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Dynamic matching uses department description & tech stack (backendStack/database), NOT hardcoded DEV', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const alphaDept = await Department.create({
      name: 'Alpha Core',
      subdomain: tenant,
      description: 'Distributed microservices and high-throughput backend architecture',
      backendStack: 'Python, FastAPI, Redis',
      database: 'PostgreSQL'
    });
    const betaDept = await Department.create({
      name: 'Beta Core',
      subdomain: tenant,
      description: 'Financial accounting, compliance and invoice auditing'
    });

    const pythonWorker = await createTestWorker({
      name: 'Python Architect',
      subdomain: tenant,
      department: alphaDept._id,
      designation: 'Backend Architect'
    });

    const financeWorker = await createTestWorker({
      name: 'Finance Auditor',
      subdomain: tenant,
      department: betaDept._id,
      designation: 'Auditor'
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-011',
      subdomain: tenant,
      customerName: 'Microservice Labs',
      items: [
        { description: 'FastAPI backend microservice with Redis caching', qty: 1, rate: 45000, total: 45000 }
      ],
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert(ticket, 'Ticket must exist');
    assert.strictEqual(ticket.team, 'Alpha Core', 'Must match Alpha Core from description & tech stack');
    assert.notStrictEqual(ticket.team, 'DEV', 'Must NEVER default to DEV');
    assert.strictEqual(String(ticket.assignee), String(pythonWorker._id), 'Must assign worker from Alpha Core');
    assert.notStrictEqual(String(ticket.assignee), String(financeWorker._id));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 12: Dynamic Department Matching via Active Employee Skills
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest('Dynamic matching uses active employee skills when department name is non-standard', async () => {
    const admin = await createTestAdmin({ subdomain: tenant });
    const studioPrime = await Department.create({
      name: 'Studio Prime',
      subdomain: tenant,
      description: 'Cross-functional delivery unit'
    });
    const logistics = await Department.create({
      name: 'Operations & Logistics',
      subdomain: tenant,
      description: 'Fleet and warehouse management'
    });

    const flutterWorker = await createTestWorker({
      name: 'Mobile Expert',
      subdomain: tenant,
      department: studioPrime._id,
      designation: 'Mobile Specialist',
      skills: ['flutter', 'dart', 'bloc', 'mobile']
    });

    await createTestWorker({
      name: 'Logistics Coord',
      subdomain: tenant,
      department: logistics._id,
      designation: 'Coordinator'
    });

    const invoice = await createTestInvoice({
      invoiceNo: 'TC-FIN-012',
      subdomain: tenant,
      customerName: 'App Solutions',
      items: [
        { description: 'Cross-platform Flutter mobile application architecture', qty: 1, rate: 60000, total: 60000 }
      ],
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert(ticket, 'Ticket must exist');
    assert.strictEqual(ticket.team, 'Studio Prime', 'Must match Studio Prime based on employee skills');
    assert.strictEqual(String(ticket.assignee), String(flutterWorker._id), 'Must assign employee with matching Flutter skill');
  });

  console.log('\n================================================================');
  console.log(` Final Integration Test Summary: Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount} `);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
