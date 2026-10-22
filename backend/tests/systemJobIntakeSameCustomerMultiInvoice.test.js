/**
 * Isolated Regression Test Suite: Same Customer Multiple Invoices & Duplicate Protection Scope
 * Tech Ciphergate — System 1 / System 2 Job Intake Workflow
 * 
 * Verifies:
 * 1. Two different invoices belonging to the same customer can each create a job.
 * 2. Submitting the same invoice twice returns the existing job and creates no duplicate.
 * 3. Concurrent requests for the same invoice cannot create duplicate jobs.
 * 4. Employee/team assignment remains correct for each new invoice.
 * 5. Tenant isolation and existing payment-verification requirements remain enforced.
 * 
 * Safety:
 * Connects strictly to ephemeral local MongoDB:
 * mongodb://127.0.0.1:27017/tech_ciphergate_same_customer_test
 * Never connects to live production or MongoDB Atlas.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const Department = require('../models/Department');
const Worker = require('../models/Worker');
const Ticket = require('../models/ticketModel');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

const invoiceController = require('../controllers/invoiceController');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_same_customer_test';

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
    subdomain: overrides.subdomain || 'ciphergate-cust-test',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Software Engineer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    department: overrides.department || null,
    ...overrides
  });
}

async function runTest(name, fn) {
  testCount++;
  try {
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
  console.log('================================================================');
  console.log(' Tech Ciphergate — Same Customer Multi-Invoice Regression Suite ');
  console.log('================================================================');
  console.log(`Connecting to isolated test database: ${TEST_DB_URI}\n`);

  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();

  const tenant = 'ciphergate-cust-test';
  const otherTenant = 'other-tenant-cust-test';

  // Seed Admin
  const admin = await Admin.create({
    username: 'cust_admin',
    email: 'cust_admin@ciphergate.com',
    password: 'password123',
    subdomain: tenant,
    role: 'admin'
  });

  // Seed Department
  const webDept = await Department.create({
    name: 'Web Development',
    subdomain: tenant,
    departmentType: 'Project',
    description: 'Web application and frontend engineering'
  });

  const swDept = await Department.create({
    name: 'Software Engineering',
    subdomain: tenant,
    departmentType: 'Project',
    description: 'Backend, API, and cloud services'
  });

  const otherTenantDept = await Department.create({
    name: 'External Dept',
    subdomain: otherTenant,
    departmentType: 'Project'
  });

  // Seed Workers
  const alice = await createTestWorker({
    name: 'Alice Developer',
    subdomain: tenant,
    department: webDept._id,
    designation: 'Senior Web Developer',
    status: 'Active'
  });

  const bob = await createTestWorker({
    name: 'Bob Backend',
    subdomain: tenant,
    department: swDept._id,
    designation: 'Backend Engineer',
    status: 'Active'
  });

  let invSeq = 200;
  async function createVerifiedInvoice(overrides = {}) {
    invSeq++;
    return Invoice.create({
      invoiceNo: overrides.invoiceNo || `TV000${invSeq}`,
      invoiceDate: overrides.invoiceDate || '21/10/2026',
      subdomain: overrides.subdomain || tenant,
      createdBy: admin._id,
      createdByModel: 'Admin',
      customerName: overrides.customerName || 'Shared Customer Corp',
      customerContact: overrides.customerContact || '9876543210',
      customerAddress: overrides.customerAddress || '123 Business Park, Chennai',
      customerGst: overrides.customerGst || '33AAAAA0000A1Z5',
      status: overrides.status || 'Payment Received',
      isPaid: overrides.isPaid !== undefined ? overrides.isPaid : true,
      invoiceType: overrides.invoiceType || 'TAX INVOICE',
      paymentDetails: overrides.paymentDetails || {
        proof: 'https://storage.googleapis.com/test/payment.png',
        proofs: [{ url: 'https://storage.googleapis.com/test/payment.png' }]
      },
      items: overrides.items || [
        { description: 'Phase Deliverable', qty: 1, rate: 50000, total: 50000 }
      ],
      ...overrides
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Two different invoices for the SAME customer create two distinct jobs
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Two different invoices belonging to the same customer can each create a job', async () => {
    const customerData = {
      customerName: 'Enterprise Client Acme',
      customerContact: '9840011223',
      customerAddress: 'Suite 400, IT Corridor, Bangalore',
      customerGst: '29ABCDE1234F1Z5'
    };

    // Invoice 1 for customer
    const invoice1 = await createVerifiedInvoice({
      ...customerData,
      invoiceNo: 'TV000801',
      items: [{ description: 'E-Commerce Portal Setup', qty: 1, rate: 75000, total: 75000 }]
    });

    // Invoice 2 for the exact same customer
    const invoice2 = await createVerifiedInvoice({
      ...customerData,
      invoiceNo: 'TV000802',
      items: [{ description: 'Custom Analytics Integration', qty: 1, rate: 45000, total: 45000 }]
    });

    // Process job intake for Invoice 1
    const result1 = await processJobIntakeFromVerifiedInvoice({
      invoice: invoice1,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: alice._id
    });

    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.isDuplicate, false, 'Invoice 1 must NOT be marked duplicate');
    assert(result1.ticketId, 'Invoice 1 must produce a valid ticketId');
    assert(result1.intakeId, 'Invoice 1 must produce a valid intakeId');

    // Process job intake for Invoice 2 (same customer, different invoice)
    const result2 = await processJobIntakeFromVerifiedInvoice({
      invoice: invoice2,
      adminUser: admin,
      departmentId: swDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: bob._id
    });

    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.isDuplicate, false, 'Invoice 2 must NOT be marked duplicate despite identical customer details');
    assert(result2.ticketId, 'Invoice 2 must produce a valid ticketId');
    assert(result2.intakeId, 'Invoice 2 must produce a valid intakeId');

    // Verify both tickets and intakes exist and are distinct
    assert.notStrictEqual(String(result1.ticketId), String(result2.ticketId), 'Tickets must be separate instances');
    assert.notStrictEqual(String(result1.intakeId), String(result2.intakeId), 'JobIntake records must be separate instances');
    assert.strictEqual(result1.invoiceNo, 'TV000801');
    assert.strictEqual(result2.invoiceNo, 'TV000802');

    const ticket1 = await Ticket.findById(result1.ticketId);
    const ticket2 = await Ticket.findById(result2.ticketId);
    assert.strictEqual(String(ticket1.assignee), String(alice._id));
    assert.strictEqual(String(ticket2.assignee), String(bob._id));

    const totalIntakes = await JobIntake.countDocuments({ subdomain: tenant });
    assert.strictEqual(totalIntakes, 2, 'Exactly 2 JobIntake records must exist for the two invoices');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Submitting the SAME invoice twice returns existing job (idempotent)
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Submitting the same invoice twice returns the existing job and creates no duplicate', async () => {
    const invoice = await Invoice.findOne({ invoiceNo: 'TV000801' });
    assert(invoice, 'Invoice TV000801 must exist');

    const firstIntake = await JobIntake.findOne({ invoiceNo: 'TV000801' });
    assert(firstIntake, 'Existing intake must exist');

    // Re-run job intake on Invoice 1
    const secondRun = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: alice._id
    });

    assert.strictEqual(secondRun.success, true);
    assert.strictEqual(secondRun.isDuplicate, true, 'Submitting the same invoice again must return isDuplicate: true');
    assert.strictEqual(String(secondRun.ticketId), String(firstIntake.ticketId), 'Must return the same ticket');
    assert.strictEqual(String(secondRun.intakeId), String(firstIntake._id), 'Must return the same intake');

    // Controller trigger verification
    let statusCode = null;
    let responseData = null;
    const mockReq = {
      params: { id: invoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant },
      body: { departmentId: webDept._id, assignmentMode: 'Individual', selectedMemberId: alice._id }
    };
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json(payload) { responseData = payload; return this; }
    };

    await invoiceController.triggerJobIntakeForInvoice(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.data.isDuplicate, true);
    assert.strictEqual(responseData.message, 'Job intake already exists for this invoice.');

    const totalIntakes = await JobIntake.countDocuments({ subdomain: tenant });
    assert.strictEqual(totalIntakes, 2, 'Total JobIntake count must remain 2 (no duplicate created)');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Concurrent requests for the same invoice resolve safely
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Concurrent requests for the same invoice cannot create duplicate jobs', async () => {
    const invoice = await createVerifiedInvoice({
      invoiceNo: 'TV000803',
      customerName: 'Concurrent Test Customer',
      customerContact: '9840099887'
    });

    // Launch 3 concurrent intake requests for the same invoice
    const [res1, res2, res3] = await Promise.all([
      processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin }),
      processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin }),
      processJobIntakeFromVerifiedInvoice({ invoice, adminUser: admin })
    ]);

    assert(res1.success && res2.success && res3.success, 'All concurrent requests must resolve successfully');

    // All must reference the identical ticket and intake ID
    const ticketIds = [String(res1.ticketId), String(res2.ticketId), String(res3.ticketId)];
    const uniqueTickets = new Set(ticketIds);
    assert.strictEqual(uniqueTickets.size, 1, 'All concurrent executions must resolve to exactly ONE active ticket');

    const matchingIntakes = await JobIntake.find({ invoiceId: invoice._id });
    assert.strictEqual(matchingIntakes.length, 1, 'Exactly one JobIntake record must exist for this invoice');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Employee/Team assignment remains correct for each new invoice
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Employee/team assignment remains correct for each new invoice', async () => {
    // Invoice A with Team mode
    const invoiceA = await createVerifiedInvoice({
      invoiceNo: 'TV000804',
      customerName: 'Team Assignment Customer',
      customerContact: '9123456789'
    });

    const resTeam = await processJobIntakeFromVerifiedInvoice({
      invoice: invoiceA,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: alice._id
    });

    assert.strictEqual(resTeam.success, true);
    assert.strictEqual(resTeam.department, webDept.name);
    assert.strictEqual(String(resTeam.assignee), String(alice._id));

    // Invoice B with another department and assignee for same customer
    const invoiceB = await createVerifiedInvoice({
      invoiceNo: 'TV000805',
      customerName: 'Team Assignment Customer',
      customerContact: '9123456789'
    });

    const resSolo = await processJobIntakeFromVerifiedInvoice({
      invoice: invoiceB,
      adminUser: admin,
      departmentId: swDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: bob._id
    });

    assert.strictEqual(resSolo.success, true);
    assert.strictEqual(resSolo.department, swDept.name);
    assert.strictEqual(String(resSolo.assignee), String(bob._id));

    const ticketA = await Ticket.findById(resTeam.ticketId);
    const ticketB = await Ticket.findById(resSolo.ticketId);

    assert.strictEqual(String(ticketA.assignee), String(alice._id));
    assert.strictEqual(ticketA.team, webDept.name);
    assert.strictEqual(String(ticketB.assignee), String(bob._id));
    assert.strictEqual(ticketB.team, swDept.name);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Tenant isolation and payment verification requirements enforced
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Tenant isolation and existing payment-verification requirements remain enforced', async () => {
    // 1. Cross-tenant rejection
    const otherAdmin = await Admin.create({
      username: 'other_admin',
      email: 'other_admin@ciphergate.com',
      password: 'password123',
      subdomain: otherTenant,
      role: 'admin'
    });

    const crossTenantInvoice = await createVerifiedInvoice({
      invoiceNo: 'TV000806',
      subdomain: otherTenant,
      createdBy: otherAdmin._id
    });

    let crossStatus = null;
    let crossData = null;
    const crossReq = {
      params: { id: crossTenantInvoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant } // Scoped to 'ciphergate-cust-test', not 'other-tenant-cust-test'
    };
    const crossRes = {
      status(code) { crossStatus = code; return this; },
      json(payload) { crossData = payload; return this; }
    };

    await invoiceController.triggerJobIntakeForInvoice(crossReq, crossRes);
    assert.strictEqual(crossStatus, 403, 'Cross-tenant request must return 403 Forbidden');
    assert.strictEqual(crossData.success, false);

    // 2. Unverified invoice without payment proof is rejected with 400
    const unverifiedInvoice = await createVerifiedInvoice({
      invoiceNo: 'TV000807',
      status: 'Invoice',
      isPaid: false,
      invoiceType: 'PROFORMA INVOICE',
      paymentDetails: {} // Missing payment proof
    });

    let unverifiedStatus = null;
    let unverifiedData = null;
    const unverifiedReq = {
      params: { id: unverifiedInvoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant }
    };
    const unverifiedRes = {
      status(code) { unverifiedStatus = code; return this; },
      json(payload) { unverifiedData = payload; return this; }
    };

    await invoiceController.triggerJobIntakeForInvoice(unverifiedReq, unverifiedRes);
    assert.strictEqual(unverifiedStatus, 400, 'Unverified invoice must return 400');
    assert.strictEqual(unverifiedData.success, false);
    assert(unverifiedData.message.includes('payment verification'), 'Message must inform user to verify payment proof first');
  });

  // Suite teardown
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(` Results: ${passCount} / ${testCount} Passed (${failCount} Failed)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
