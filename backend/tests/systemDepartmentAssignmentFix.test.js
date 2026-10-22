/**
 * System 1 Job Intake & System 2 Assignment Integration Test Suite
 * Tech Ciphergate - Business Rules Regression Tests
 * 
 * Verifies the 8 core requirements:
 * 1. Verified website invoice assigns one eligible employee from the existing Web Development team.
 * 2. Verified software invoice creates a task but leaves team and employee selection to the admin.
 * 3. Ambiguous job remains unassigned for admin review.
 * 4. Multi-department job is not incorrectly treated as website-only.
 * 5. Approved leave and overloaded employees are excluded from website assignment.
 * 6. Manual team and multiple-employee selection persist after reopening Task Studio.
 * 7. Duplicate verification does not create duplicate jobs (Idempotency).
 * 8. Existing invoice, payment-proof and WhatsApp workflows remain unchanged.
 * 
 * Target DB: Local MongoDB only (mongodb://127.0.0.1:27017/tech_ciphergate_dept_assignment_fix_test).
 * NEVER connects to live MongoDB Atlas.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const Department = require('../models/Department');
const Worker = require('../models/Worker');
const Ticket = require('../models/ticketModel');
const Leave = require('../models/Leave');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

const invoiceController = require('../controllers/invoiceController');
const whatsappService = require('../services/whatsappService');
const { autoAssignJobTicket, isWebsiteDepartment, isSoftwareDepartment, classifyInvoiceJob } = require('../services/jobAssignmentService');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_dept_assignment_fix_test';

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
    subdomain: overrides.subdomain || 'ciphergate-dept-test',
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

function createTestAdmin(overrides = {}) {
  const tag = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Admin.create({
    name: overrides.name || 'Dept Admin',
    username: overrides.username || `admin_${tag}`,
    email: overrides.email || `admin_${tag}@testciphergate.com`,
    password: overrides.password || 'Password123!',
    role: overrides.role || 'superadmin',
    subdomain: overrides.subdomain || 'ciphergate-dept-test',
    ...overrides
  });
}

let invSeq = 0;
function createTestInvoice(overrides = {}) {
  invSeq++;
  return Invoice.create({
    invoiceNo: overrides.invoiceNo || `INV-REG-${invSeq}`,
    invoiceDate: '17/10/2026',
    actualDate: new Date(),
    customerName: overrides.customerName || 'Test Customer',
    customerContact: '9876543210',
    subdomain: overrides.subdomain || 'ciphergate-dept-test',
    items: overrides.items || [{ description: 'General Technical Services', qty: 1, rate: 10000, total: 10000 }],
    status: overrides.status || 'Payment Received',
    isPaid: overrides.isPaid !== undefined ? overrides.isPaid : true,
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
  console.log('================================================================');
  console.log(' Tech Ciphergate — System 1 -> System 2 Integration Test Suite ');
  console.log(` Target DB: ${TEST_DB_URI}`);
  console.log('================================================================\n');

  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();

  const tenant = 'ciphergate-dept-test';

  const admin = await createTestAdmin({ subdomain: tenant });

  // 1. Existing Company Departments in Database
  const webDept = await Department.create({
    name: 'Website Development',
    description: 'WordPress, WooCommerce, Shopify, Landing Pages, Responsive HTML/CSS Web Development',
    frontendStack: 'HTML CSS JavaScript WordPress',
    subdomain: tenant
  });

  const softwareDept = await Department.create({
    name: 'Software Development',
    description: 'Enterprise Microservices, REST APIs, Cloud Architecture and Distributed Systems',
    backendStack: 'Node.js Python Golang',
    database: 'PostgreSQL MongoDB',
    cloudProvider: 'AWS',
    subdomain: tenant
  });

  const devDept = await Department.create({
    name: 'DEV',
    description: 'Core Engineering Department',
    subdomain: tenant
  });

  const designDept = await Department.create({
    name: 'Design Studio',
    description: 'UI/UX Design, Figma Wireframing, Creative Graphics',
    subdomain: tenant
  });

  // 2. Active Employees in Departments
  // Web Development Team Members
  const webWorker1 = await createTestWorker({
    name: 'Wendy WebDev',
    department: webDept._id,
    role: 'developer',
    designation: 'Senior Frontend Web Developer',
    skills: ['wordpress', 'woocommerce', 'html', 'css', 'shopify', 'responsive'],
    performancePoints: 100,
    status: 'Active',
    subdomain: tenant
  });

  const webWorker2 = await createTestWorker({
    name: 'Walter WebDev2',
    department: webDept._id,
    role: 'developer',
    designation: 'Web Developer',
    skills: ['html', 'css', 'javascript', 'landing pages'],
    performancePoints: 80,
    status: 'Active',
    subdomain: tenant
  });

  // Software Development Team Members
  const softwareWorker1 = await createTestWorker({
    name: 'Sam SoftwareEng',
    department: softwareDept._id,
    role: 'developer',
    designation: 'Backend Software Engineer',
    skills: ['python', 'golang', 'microservices', 'rest api', 'postgresql'],
    status: 'Active',
    subdomain: tenant
  });

  const softwareWorker2 = await createTestWorker({
    name: 'Sara SoftwareEng2',
    department: softwareDept._id,
    role: 'developer',
    designation: 'Senior Cloud Engineer',
    skills: ['distributed systems', 'microservices', 'docker', 'kubernetes'],
    status: 'Active',
    subdomain: tenant
  });

  // Other Dept Members (DEV / Design)
  const devWorker = await createTestWorker({
    name: 'Dan Dev',
    department: devDept._id,
    role: 'developer',
    designation: 'General Dev',
    status: 'Active',
    subdomain: tenant
  });

  const designWorker = await createTestWorker({
    name: 'Alice Designer',
    department: designDept._id,
    role: 'developer',
    designation: 'Lead UI/UX Designer',
    skills: ['figma', 'ui', 'ux'],
    status: 'Active',
    subdomain: tenant
  });

  // Helper to reset tickets and leaves between tests to avoid state pollution
  async function cleanIntermediateTasks() {
    await Ticket.deleteMany({ subdomain: tenant });
    await JobIntake.deleteMany({ subdomain: tenant });
    await Leave.deleteMany({ subdomain: tenant });
  }

  // ============================================================================
  // TEST 1: Verified website invoice assigns ONE eligible employee from existing Web Development team
  // ============================================================================
  await runTest('1. Verified website invoice assigns ONE eligible employee from existing Web Development team', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-WEB-001',
      customerName: 'Acme Web Client',
      subdomain: tenant,
      items: [
        { description: 'Responsive WordPress Website Development and Theme Customization', qty: 1, rate: 35000, total: 35000 },
        { description: 'WooCommerce Store Setup with Payment Gateway Integration', qty: 1, rate: 25000, total: 25000 }
      ],
      total: 60000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert.ok(ticket, 'Ticket must be created');
    assert.strictEqual(ticket.team, 'Website Development', 'Resolved department must be existing Website Development');
    assert.strictEqual(ticket.assignmentMode, 'Individual', 'Must be Individual mode by default');
    assert.ok(ticket.assignee, 'Assignee must be set');
    assert.strictEqual(ticket.assignees.length, 1, 'CRITICAL: Must assign exactly ONE worker by default, not all team members');
    
    // Ranked candidate: Wendy has higher performance points (100 vs 80) and matching skills
    assert.strictEqual(ticket.assignee.toString(), webWorker1._id.toString(), 'Should select Wendy WebDev based on skills & performance ranking');
  });

  // ============================================================================
  // TEST 2: Verified software invoice creates a task but leaves team and employee selection to the admin
  // ============================================================================
  await runTest('2. Verified software invoice creates a task in To Do but leaves team and employee selection to the admin', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-SW-002',
      customerName: 'Fintech Solutions Corp',
      subdomain: tenant,
      items: [
        { description: 'Enterprise Microservices Architecture & Golang REST API Development', qty: 1, rate: 75000, total: 75000 },
        { description: 'PostgreSQL Distributed Database Optimization', qty: 1, rate: 45000, total: 45000 }
      ],
      total: 120000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert.ok(ticket, 'Ticket must be created');
    assert.strictEqual(ticket.status, 'To Do', 'Ticket must be in To Do status');
    assert.strictEqual(ticket.team, null, 'Team must be left null for admin manual selection');
    assert.strictEqual(ticket.assignee, null, 'Assignee must be left null');
    assert.strictEqual(ticket.assignees.length, 0, 'Assignees array must be empty');
    
    // Verbatim prompt required by business rule
    assert.strictEqual(
      ticket.unassignedReason,
      'Software Development job detected — please select the appropriate existing team and assignees.',
      'Must record the exact prompt for Work Allocation'
    );
  });

  // ============================================================================
  // TEST 3: Ambiguous job remains unassigned for admin review
  // ============================================================================
  await runTest('3. Ambiguous job remains unassigned for admin review with clear reason', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-AMBIG-003',
      customerName: 'General Client',
      subdomain: tenant,
      items: [
        { description: 'General Business Consultation and Advisory Services', qty: 1, rate: 15000, total: 15000 }
      ],
      total: 15000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert.ok(ticket);
    assert.strictEqual(ticket.team, null, 'Team must NOT be guessed when ambiguous');
    assert.strictEqual(ticket.assignee, null, 'Assignee must be null');
    assert.strictEqual(ticket.assignees.length, 0, 'Assignees must be empty');
    assert.ok(ticket.unassignedReason, 'Must record unassignedReason');
    assert.strictEqual(
      ticket.unassignedReason.toLowerCase().includes('ambiguous') || ticket.unassignedReason.toLowerCase().includes('does not match'),
      true,
      'Reason must specify ambiguous or non-matching department'
    );
  });

  // ============================================================================
  // TEST 4: Multi-department job is not incorrectly treated as website-only
  // ============================================================================
  await runTest('4. Multi-department job is not incorrectly treated as website-only', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-MULTI-004',
      customerName: 'Enterprise Redesign Client',
      subdomain: tenant,
      items: [
        { description: 'WordPress Portal Website Development and Theme Integration', qty: 1, rate: 40000, total: 40000 },
        { description: 'Enterprise Backend Microservices and REST APIs Architecture', qty: 1, rate: 60000, total: 60000 }
      ],
      total: 100000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const parentTicket = await Ticket.findById(result.ticketId);
    assert.ok(parentTicket);
    assert.strictEqual(parentTicket.labels.includes('multi-department'), true, 'Parent ticket must be flagged as multi-department');
    assert.strictEqual(parentTicket.team, null, 'Parent ticket must not be forced to Website Development');
    assert.strictEqual(parentTicket.assignee, null, 'Parent coordinator ticket remains unassigned for admin coordination');

    // Subtasks check
    const subtasks = await Ticket.find({ parentTicket: parentTicket._id, subdomain: tenant });
    assert.strictEqual(subtasks.length, 2, 'Must create 2 department subtasks (Website and Software)');

    const webSub = subtasks.find(s => s.team === 'Website Development');
    const softwareSub = subtasks.find(s => s.team === 'Software Development' || s.title.includes('Software Development'));
    assert.ok(webSub, 'Website Development subtask must exist');
    assert.ok(softwareSub, 'Software Development subtask must exist');

    // Website subtask is auto-assigned exactly 1 web developer
    assert.strictEqual(webSub.assignees.length, 1, 'Website subtask gets 1 web developer');
    assert.strictEqual(webSub.assignee.toString(), webWorker1._id.toString());

    // Software subtask must NOT be auto-assigned; it requires admin manual selection
    assert.strictEqual(Boolean(softwareSub.assignee), false, 'Software subtask must NOT be auto-assigned');
    assert.strictEqual(softwareSub.assignees.length, 0);
    assert.strictEqual(
      softwareSub.unassignedReason,
      'Software Development job detected — please select the appropriate existing team and assignees.'
    );
  });

  // ============================================================================
  // TEST 5: Approved leave and overloaded employees are excluded from website assignment
  // ============================================================================
  await runTest('5. Approved leave and overloaded employees are excluded from website assignment', async () => {
    await cleanIntermediateTasks();

    // 5A: Put Wendy WebDev on approved leave today
    const now = new Date();
    await Leave.create({
      worker: webWorker1._id,
      subdomain: tenant,
      status: 'Approved',
      leaveType: 'Sick Leave',
      reason: 'Doctor Appointment',
      totalDays: 1,
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    });

    const invoice1 = await createTestInvoice({
      invoiceNo: 'INV-WEB-LEAVE-005A',
      customerName: 'Leave Test Client',
      subdomain: tenant,
      items: [{ description: 'WordPress Custom Site Build', qty: 1, rate: 30000, total: 30000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const res1 = await processJobIntakeFromVerifiedInvoice({ invoice: invoice1, adminUser: admin });
    assert.strictEqual(res1.success, true);
    const ticket1 = await Ticket.findById(res1.ticketId);
    assert.strictEqual(
      ticket1.assignee.toString(),
      webWorker2._id.toString(),
      'Wendy is on leave, so Walter WebDev2 must be assigned instead'
    );

    // 5B: Now overload Walter WebDev2 with 5 active tasks (MAX_ACTIVE_WORKLOAD)
    for (let i = 0; i < 5; i++) {
      await Ticket.create({
        title: `Walter Active Task ${i + 1}`,
        subdomain: tenant,
        team: 'Website Development',
        assignee: webWorker2._id,
        assignees: [webWorker2._id],
        status: 'In Progress'
      });
    }

    const invoice2 = await createTestInvoice({
      invoiceNo: 'INV-WEB-OVERLOAD-005B',
      customerName: 'Overload Test Client',
      subdomain: tenant,
      items: [{ description: 'Shopify Website Theme Setup', qty: 1, rate: 25000, total: 25000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const res2 = await processJobIntakeFromVerifiedInvoice({ invoice: invoice2, adminUser: admin });
    assert.strictEqual(res2.success, true);
    const ticket2 = await Ticket.findById(res2.ticketId);
    assert.strictEqual(ticket2.assignee, null, 'Must remain unassigned when all website workers are on leave or overloaded');
    assert.strictEqual(ticket2.assignees.length, 0);
    assert.ok(ticket2.unassignedReason, 'Must provide unassigned reason');
    assert.strictEqual(
      ticket2.unassignedReason.includes('capacity') || ticket2.unassignedReason.includes('leave'),
      true,
      'Reason must specify capacity or leave exclusion'
    );

    // Clean up leaves & overload tasks
    await Leave.deleteMany({ subdomain: tenant });
    await Ticket.deleteMany({ title: { $regex: /^Walter Active Task/ }, subdomain: tenant });
  });

  // ============================================================================
  // TEST 6: Manual team and multiple-employee selection persist after reopening Task Studio
  // ============================================================================
  await runTest('6. Manual team and multiple-employee selection persist after reopening Task Studio', async () => {
    await cleanIntermediateTasks();

    // Start with an unassigned software ticket
    const invoice = await createTestInvoice({
      invoiceNo: 'INV-SW-MANUAL-006',
      customerName: 'Manual Allocation Client',
      subdomain: tenant,
      items: [{ description: 'Software Development Microservices Backend', qty: 1, rate: 80000, total: 80000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const intakeResult = await processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin });
    assert.strictEqual(intakeResult.success, true);
    const ticketId = intakeResult.ticketId;

    // Simulate Admin in Task Studio selecting Software Development team, 2 assignees, and saving
    const updatePayload = {
      team: 'Software Development',
      assignee: softwareWorker1._id,
      assignees: [softwareWorker1._id, softwareWorker2._id],
      assignmentMode: 'Both',
      assignmentSource: 'manual',
      unassignedReason: null
    };

    await Ticket.findByIdAndUpdate(ticketId, updatePayload, { new: true });

    // Simulate Reopening Task Studio by reloading ticket from DB
    const reopenedTicket = await Ticket.findById(ticketId).populate('assignees').populate('assignee');
    assert.ok(reopenedTicket);
    assert.strictEqual(reopenedTicket.team, 'Software Development', 'Selected team must persist');
    assert.strictEqual(reopenedTicket.assignmentMode, 'Both', 'Assignment mode must persist');
    assert.strictEqual(reopenedTicket.assignees.length, 2, 'Both assignees must persist');
    assert.strictEqual(reopenedTicket.assignee._id.toString(), softwareWorker1._id.toString(), 'Lead assignee must persist');
    assert.strictEqual(
      reopenedTicket.assignees.map(a => a._id.toString()).includes(softwareWorker2._id.toString()),
      true,
      'Second worker must persist in assignees list'
    );
  });

  // ============================================================================
  // TEST 7: Duplicate verification does not create duplicate jobs (Idempotency)
  // ============================================================================
  await runTest('7. Duplicate verification does not create duplicate jobs (Idempotency)', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-IDEM-007',
      customerName: 'Idempotent Client',
      subdomain: tenant,
      items: [{ description: 'WordPress Website Launch', qty: 1, rate: 30000, total: 30000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    // First verification event
    const firstCall = await processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin });
    assert.strictEqual(firstCall.success, true);
    assert.strictEqual(firstCall.isDuplicate, false);
    const originalTicketId = firstCall.ticketId;

    // Retry / repeated verification event
    const secondCall = await processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin });
    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.isDuplicate, true, 'Subsequent verification must flag isDuplicate: true');
    assert.strictEqual(secondCall.ticketId.toString(), originalTicketId.toString(), 'Must return existing ticketId');

    // Third retry
    const thirdCall = await processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin });
    assert.strictEqual(thirdCall.success, true);
    assert.strictEqual(thirdCall.isDuplicate, true);

    // Verify DB count
    const totalJobIntakes = await JobIntake.countDocuments({ invoiceId: invoice._id, subdomain: tenant });
    assert.strictEqual(totalJobIntakes, 1, 'Must have exactly ONE JobIntake record');

    const totalTickets = await Ticket.countDocuments({
      subdomain: tenant,
      labels: `invoice:${invoice.invoiceNo}`,
      parentTicket: { $in: [null, undefined] }
    });
    assert.strictEqual(totalTickets, 1, 'Must have exactly ONE parent ticket, zero duplicates');
  });

  // ============================================================================
  // TEST 8: Existing invoice, payment-proof and WhatsApp workflows remain unchanged
  // ============================================================================
  await runTest('8. Existing invoice, payment-proof and WhatsApp workflows remain unchanged', async () => {
    await cleanIntermediateTasks();

    // 8.1: Uploading payment proof alone without status verification must NOT trigger Job Intake
    const pendingProofInvoice = await createTestInvoice({
      invoiceNo: 'INV-PROOF-PENDING-008',
      customerName: 'Pending Verification Customer',
      subdomain: tenant,
      status: 'Invoice', // NOT verified / NOT payment received
      isPaid: false,
      paymentProofUrl: 'https://storage.test/proofs/unverified_slip.jpg',
      createdBy: admin._id
    });

    const intakeForPending = await JobIntake.findOne({ invoiceId: pendingProofInvoice._id });
    assert.strictEqual(intakeForPending, null, 'File upload alone must NEVER trigger Job Intake prematurely');

    // 8.2: Invoice creation, invoice numbering sequence, and fields remain intact
    assert.strictEqual(pendingProofInvoice.invoiceNo, 'INV-PROOF-PENDING-008');
    assert.strictEqual(pendingProofInvoice.status, 'Invoice');
    assert.strictEqual(pendingProofInvoice.isPaid, false);

    // 8.3: WhatsApp sending API contract preservation (Meta template payload contract)
    let dispatchedWhatsApp = null;
    const originalSendWhatsApp = whatsappService.sendWhatsApp;
    whatsappService.sendWhatsApp = async (subdomain, phone, options) => {
      dispatchedWhatsApp = { subdomain, phone, options };
      return { success: true, messageId: 'wa_mock_test_888' };
    };

    try {
      const waReq = {
        params: { id: pendingProofInvoice._id.toString() },
        user: admin,
        body: {
          pdfBase64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...',
          recipientPhone: '9876543210'
        },
        protocol: 'http',
        get: () => 'localhost:5000'
      };

      let jsonResult = null;
      const waRes = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { jsonResult = data; return this; }
      };

      await invoiceController.sendInvoiceWhatsApp(waReq, waRes);

      assert.strictEqual(waRes.statusCode, 200);
      assert.strictEqual(jsonResult.success, true);
      assert.strictEqual(jsonResult.whatsappSuccess, true);

      // Verify exact Meta template contract
      assert.ok(dispatchedWhatsApp, 'whatsappService.sendWhatsApp must be called');
      assert.strictEqual(dispatchedWhatsApp.phone, '919876543210', 'Must format phone with 91 country code');
      assert.strictEqual(dispatchedWhatsApp.options.templateName, 'tech_invoice_send', 'Must match exact Meta template name');
      assert.strictEqual(dispatchedWhatsApp.options.type, 'template');

      // Verify invoice in DB was NOT mutated by WhatsApp dispatch
      const reloadedInvoice = await Invoice.findById(pendingProofInvoice._id);
      assert.strictEqual(reloadedInvoice.status, 'Invoice', 'WhatsApp dispatch must not alter invoice status');
      assert.strictEqual(reloadedInvoice.isPaid, false, 'WhatsApp dispatch must not mark invoice as paid');
    } finally {
      whatsappService.sendWhatsApp = originalSendWhatsApp;
    }
  });

  // ============================================================================
  // TEST 9: Classification priority hierarchy (P1 > P2 > P3 > P4) & Ambiguity handling
  // ============================================================================
  await runTest('9. Classification priority hierarchy (P1 > P2 > P3 > P4) & Ambiguity handling', async () => {
    await cleanIntermediateTasks();

    const depts = await Department.find({ subdomain: tenant }).lean();
    const activeWorkers = await Worker.find({ subdomain: tenant, status: 'Active' }).lean();

    // 9A: Priority 1 - Explicit projectCategory/serviceCategory takes precedence
    const p1Invoice = {
      subdomain: tenant,
      projectCategory: 'Website Development',
      items: [{ description: 'General Advisory & Architecture' }]
    };
    const p1Result = classifyInvoiceJob({ invoice: p1Invoice, departments: depts, workers: activeWorkers });
    assert.strictEqual(p1Result.jobType, 'Website Development');
    assert.strictEqual(p1Result.priorityMatched, 1, 'Must match on Priority 1 (Explicit category)');

    // 9B: Priority 2 - Structured deliverables take precedence over generic items
    const p2Invoice = {
      subdomain: tenant,
      structuredJobDetails: {
        deliverables: ['PostgreSQL Database Query Optimization & Microservice Profiling']
      },
      items: [{ description: 'General Consulting' }]
    };
    const p2Result = classifyInvoiceJob({ invoice: p2Invoice, departments: depts, workers: activeWorkers });
    assert.strictEqual(p2Result.jobType, 'Software Development');
    assert.strictEqual(p2Result.priorityMatched, 2, 'Must match on Priority 2 (Structured deliverables)');

    // 9C: Priority 3 - Line-item descriptions
    const p3Invoice = {
      subdomain: tenant,
      items: [{ description: 'WordPress Elementor Theme Development and Setup' }]
    };
    const p3Result = classifyInvoiceJob({ invoice: p3Invoice, departments: depts, workers: activeWorkers });
    assert.strictEqual(p3Result.jobType, 'Website Development');
    assert.strictEqual(p3Result.priorityMatched, 3, 'Must match on Priority 3 (Line items)');

    // 9D: Multi-Department classification when deliverables contain both Website & Software
    const multiInvoice = {
      subdomain: tenant,
      structuredJobDetails: {
        deliverables: [
          'WordPress Marketing Website Redesign',
          'Golang Distributed Microservices Backend'
        ]
      }
    };
    const multiResult = classifyInvoiceJob({ invoice: multiInvoice, departments: depts, workers: activeWorkers });
    assert.strictEqual(multiResult.jobType, 'Multi-Department');
    assert.strictEqual(multiResult.priorityMatched, 2);

    // 9E: No fallback to DEV, ignores generic title 'Testing - Project Execution'
    const genericInvoice = {
      subdomain: tenant,
      title: 'Testing - Project Execution',
      invoiceNo: 'INV-DEV-999',
      items: [{ description: 'Generic task without matching tech keywords' }]
    };
    const genericResult = classifyInvoiceJob({ invoice: genericInvoice, departments: depts, workers: activeWorkers });
    assert.strictEqual(genericResult.jobType, 'Needs Admin Review', 'Generic title must NEVER cause DEV fallback');
    assert.strictEqual(genericResult.priorityMatched, 4);
  });

  // ============================================================================
  // TEST 10: Preview endpoint (GET /api/invoices/:id/job-intake-preview)
  // ============================================================================
  await runTest('10. Preview endpoint returns detected classification and explanation before intake', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-PREV-010',
      customerName: 'Preview Test Customer',
      subdomain: tenant,
      items: [
        { description: 'Responsive WooCommerce Online Store Development', qty: 1, rate: 30000, total: 30000 }
      ],
      total: 30000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    let jsonResult = null;
    let statusCode = 200;
    const mockReq = {
      params: { id: invoice._id.toString() },
      user: admin
    };
    const mockRes = {
      status: function(code) { statusCode = code; return this; },
      json: function(data) { jsonResult = data; return this; }
    };

    await invoiceController.previewJobIntakeForInvoice(mockReq, mockRes);

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResult.success, true);
    assert.strictEqual(jsonResult.data.jobType, 'Website Development');
    assert.strictEqual(jsonResult.data.priorityMatched, 3);
    assert.strictEqual(jsonResult.data.webDeptAvailable, true);
    assert.ok(jsonResult.data.reason.length > 5, 'Reason must be informative');
  });

  // ============================================================================
  // TEST 11: Admin override during Job Intake (selectedJobType: 'Website Development')
  // ============================================================================
  await runTest('11. Admin override selects Website Development for ambiguous invoice', async () => {
    await cleanIntermediateTasks();

    // Ambiguous invoice
    const ambiguousInvoice = await createTestInvoice({
      invoiceNo: 'INV-AMBIG-OVERRIDE-011',
      customerName: 'Ambiguous Client 1',
      subdomain: tenant,
      items: [{ description: 'General Business Strategy Consulting Session', qty: 1, rate: 20000, total: 20000 }],
      total: 20000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    // Admin selects 'Website Development' in confirmation dialog modal
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice: ambiguousInvoice,
      adminUser: admin,
      selectedJobType: 'Website Development'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.jobType, 'Website Development');

    // Ticket must be auto-assigned to 1 Web Dev worker
    const ticket = await Ticket.findById(result.ticketId);
    assert.ok(ticket);
    assert.strictEqual(ticket.team, 'Website Development');
    assert.strictEqual(ticket.assignmentMode, 'Individual');
    assert.strictEqual(ticket.assignees.length, 1);
    assert.strictEqual(ticket.assignee.toString(), webWorker1._id.toString());
    assert.ok(ticket.labels.includes('job-type:website'), 'Ticket must bear website job-type label');

    // JobIntake record must persist the selected classification in jobDetails.serviceCategory
    const intake = await JobIntake.findById(result.intakeId);
    assert.ok(intake);
    assert.strictEqual(intake.jobDetails.serviceCategory, 'Website Development', 'Classification must be stored on JobIntake');
  });

  // ============================================================================
  // TEST 12: Admin override during Job Intake (selectedJobType: 'Software Development')
  // ============================================================================
  await runTest('12. Admin override selects Software Development for ambiguous invoice', async () => {
    await cleanIntermediateTasks();

    const ambiguousInvoice = await createTestInvoice({
      invoiceNo: 'INV-AMBIG-OVERRIDE-012',
      customerName: 'Ambiguous Client 2',
      subdomain: tenant,
      items: [{ description: 'General Digital Advisory Work', qty: 1, rate: 25000, total: 25000 }],
      total: 25000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    // Admin selects 'Software Development' in modal
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice: ambiguousInvoice,
      adminUser: admin,
      selectedJobType: 'Software Development'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.jobType, 'Software Development');

    // Ticket must remain unassigned in To Do with prompt
    const ticket = await Ticket.findById(result.ticketId);
    assert.ok(ticket);
    assert.strictEqual(ticket.status, 'To Do');
    assert.strictEqual(ticket.team, null);
    assert.strictEqual(ticket.assignee, null);
    assert.strictEqual(ticket.assignees.length, 0);
    assert.strictEqual(
      ticket.unassignedReason,
      'Software Development job detected — please select the appropriate existing team and assignees.'
    );
    assert.ok(ticket.labels.includes('job-type:software'));

    // JobIntake record stores 'Software Development'
    const intake = await JobIntake.findById(result.intakeId);
    assert.ok(intake);
    assert.strictEqual(intake.jobDetails.serviceCategory, 'Software Development');
  });

  // ============================================================================
  // TEST 13: Tenant isolation prevents cross-tenant department & worker assignment
  // ============================================================================
  await runTest('13. Tenant isolation prevents cross-tenant department and worker assignment', async () => {
    await cleanIntermediateTasks();

    const tenantBeta = 'ciphergate-tenant-beta';

    // Create beta department and worker
    const betaDept = await Department.create({
      name: 'Web Dev Beta',
      subdomain: tenantBeta
    });
    const betaWorker = await createTestWorker({
      name: 'Beta Worker',
      subdomain: tenantBeta,
      department: betaDept._id,
      role: 'developer',
      designation: 'Beta Web Dev',
      status: 'Active',
      performancePoints: 999
    });

    // Invoice belonging to original tenant
    const invoice = await createTestInvoice({
      invoiceNo: 'INV-ISO-013',
      customerName: 'Tenant Isolation Customer',
      subdomain: tenant,
      items: [{ description: 'WordPress Portal Website Development', qty: 1, rate: 20000, total: 20000 }],
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin
    });

    assert.strictEqual(result.success, true);
    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.subdomain, tenant, 'Ticket must belong to original tenant');
    assert.notStrictEqual(
      ticket.assignee.toString(),
      betaWorker._id.toString(),
      'Cross-tenant worker must NEVER be assigned'
    );
    assert.strictEqual(
      ticket.assignee.toString(),
      webWorker1._id.toString(),
      'Must assign worker belonging strictly to the invoice tenant'
    );

    // Cross-tenant permission check on triggerJobIntakeForInvoice
    let crossStatusCode = null;
    let crossJsonResult = null;
    const betaAdmin = await createTestAdmin({ subdomain: tenantBeta, role: 'admin' });
    const crossReq = {
      params: { id: invoice._id.toString() },
      user: betaAdmin,
      body: {}
    };
    const crossRes = {
      status: function(c) { crossStatusCode = c; return this; },
      json: function(d) { crossJsonResult = d; return this; }
    };

    await invoiceController.triggerJobIntakeForInvoice(crossReq, crossRes);
    assert.strictEqual(crossStatusCode, 403, 'Cross-tenant admin must be rejected with 403');
    assert.strictEqual(crossJsonResult.success, false);

    // Cleanup beta records
    await Department.deleteMany({ subdomain: tenantBeta });
    await Worker.deleteMany({ subdomain: tenantBeta });
    await Admin.deleteMany({ subdomain: tenantBeta });
    await Ticket.deleteMany({ subdomain: tenantBeta });
    await JobIntake.deleteMany({ subdomain: tenantBeta });
  });

  // ============================================================================
  // TEST 14: Retry/Confirmation updates unassigned ticket & overrides generic 'Testing' reason
  // ============================================================================
  await runTest('14. Retry/Confirmation assigns 1 Web Dev worker and overrides generic Testing unassignedReason', async () => {
    await cleanIntermediateTasks();

    // Create invoice with customerName 'Testing' mimicking TV000351
    const invoice = await createTestInvoice({
      invoiceNo: 'TV000351',
      customerName: 'Testing',
      subdomain: tenant,
      items: [{ description: 'Saas-Bill', qty: 1, rate: 10, total: 10 }],
      total: 10,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const orderId = `INV-${invoice.invoiceNo}`;

    // Create an initial unassigned ticket with the stale 'Testing' reason
    const existingTicket = await Ticket.create({
      title: `[Invoice #${invoice.invoiceNo}] Testing - Project Execution`,
      description: 'Initial intake task',
      subdomain: tenant,
      status: 'To Do',
      team: null,
      assignee: null,
      assignees: [],
      assignmentMode: 'Team',
      assignmentSource: 'automatic',
      unassignedReason: "General auto-assignment is disabled for 'Testing'. Please select the appropriate existing team and assignees in Work Allocation.",
      labels: ['invoice-intake', 'payment-verified', `order:${orderId}`, `invoice:${invoice.invoiceNo}`],
      checklist: [{ text: 'Saas-Bill' }]
    });

    // Create initial JobIntake linking this ticket
    const initialIntake = await JobIntake.create({
      orderId,
      subdomain: tenant,
      customer: { name: 'Testing', phone: '9876543210' },
      jobDetails: {
        title: `Job for Invoice #${invoice.invoiceNo}`,
        serviceCategory: 'General',
        team: 'General'
      },
      items: [{ description: 'Saas-Bill', qty: 1, rate: 10, total: 10 }],
      payment: { gateway: 'manual', amount: 10, currency: 'INR', paymentStatus: 'VERIFIED' },
      invoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo,
      ticketId: existingTicket._id,
      intakeStatus: 'COMPLETED'
    });

    // Admin confirms 'Website Development' in Job Intake confirmation popup
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      selectedJobType: 'Website Development'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isDuplicate, true, 'Must preserve existing intake/ticket without creating duplicates');
    assert.strictEqual(result.ticketId.toString(), existingTicket._id.toString(), 'Must reuse the exact same ticket');
    assert.strictEqual(result.jobType, 'Website Development');

    // Verify JobIntake record was updated with the confirmed classification
    const updatedIntake = await JobIntake.findById(initialIntake._id);
    assert.strictEqual(updatedIntake.jobDetails.serviceCategory, 'Website Development');

    // Verify Ticket was updated and assigned to 1 eligible Web Dev employee
    const updatedTicket = await Ticket.findById(existingTicket._id);
    assert.ok(updatedTicket);
    assert.strictEqual(updatedTicket.team, 'Website Development', 'Team must be Website Development, NOT Testing');
    assert.strictEqual(updatedTicket.assignmentMode, 'Individual');
    assert.strictEqual(updatedTicket.assignees.length, 1, 'Must assign exactly ONE Web Dev worker');
    assert.strictEqual(updatedTicket.assignee.toString(), webWorker1._id.toString(), 'Should assign top-ranked Web Dev worker');
    assert.strictEqual(updatedTicket.unassignedReason, null, 'Must clear stale Testing unassignedReason');
    assert.ok(updatedTicket.labels.includes('job-type:website'), 'Ticket must bear job-type:website label');
  });

  // ============================================================================
  // TEST 15: Existing manual assignments are strictly preserved on retry/confirmation
  // ============================================================================
  await runTest('15. Existing manual assignments are strictly preserved on retry/confirmation', async () => {
    await cleanIntermediateTasks();

    const invoice = await createTestInvoice({
      invoiceNo: 'INV-MANUAL-015',
      customerName: 'Manual Assigned Client',
      subdomain: tenant,
      items: [{ description: 'WordPress Customization', qty: 1, rate: 20000, total: 20000 }],
      total: 20000,
      status: 'Payment Received',
      isPaid: true,
      createdBy: admin._id
    });

    const orderId = `INV-${invoice.invoiceNo}`;

    // Admin previously manually assigned Walter WebDev2 to this ticket
    const manualTicket = await Ticket.create({
      title: `[Invoice #${invoice.invoiceNo}] Manual Assigned Client - Project Execution`,
      subdomain: tenant,
      status: 'In Progress',
      team: 'Website Development',
      assignee: webWorker2._id,
      assignees: [webWorker2._id],
      assignmentMode: 'Individual',
      assignmentSource: 'manual',
      unassignedReason: null,
      labels: ['invoice-intake', `order:${orderId}`, `invoice:${invoice.invoiceNo}`]
    });

    await JobIntake.create({
      orderId,
      subdomain: tenant,
      customer: { name: 'Manual Assigned Client', phone: '9876543210' },
      jobDetails: { title: `Job for Invoice #${invoice.invoiceNo}`, serviceCategory: 'Website Development' },
      items: [{ description: 'WordPress Customization', qty: 1, rate: 20000, total: 20000 }],
      payment: { gateway: 'manual', amount: 20000, currency: 'INR', paymentStatus: 'VERIFIED' },
      invoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo,
      ticketId: manualTicket._id,
      intakeStatus: 'COMPLETED'
    });

    // Admin triggers Job Intake again
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      selectedJobType: 'Website Development'
    });

    assert.strictEqual(result.success, true);
    const reloaded = await Ticket.findById(manualTicket._id);
    assert.strictEqual(
      reloaded.assignee.toString(),
      webWorker2._id.toString(),
      'Must strictly preserve manual assignee (Walter WebDev2) and NOT overwrite with Wendy'
    );
    assert.strictEqual(reloaded.assignmentSource, 'manual');
  });

  // Teardown
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(` Regression Test Summary: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
