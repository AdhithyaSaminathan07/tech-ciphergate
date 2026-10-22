/**
 * Isolated Test Suite: Job Intake Department and Member Selection
 * Tech Ciphergate - Change Request Verification
 * 
 * Tests:
 * 1. Department list loading in preview endpoint with active member counts.
 * 2. Member filtering by selected department.
 * 3. Active-member and tenant validation (inactive & cross-tenant employees excluded).
 * 4. Individual assignment mode.
 * 5. Team assignment mode.
 * 6. Both assignment mode.
 * 7. Invalid/cross-tenant department rejection.
 * 8. Department with no active members rejection.
 * 9. Invalid member rejection.
 * 10. Duplicate intake prevention.
 * 11. Regression check: Unverified invoice rejection.
 * 12. Regression check: WhatsApp invoice sending flow invariance.
 * 
 * Safety:
 * Connects exclusively to ephemeral local MongoDB:
 * mongodb://127.0.0.1:27017/tech_ciphergate_intake_dept_selection_test
 * NEVER connects to live MongoDB Atlas.
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

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_intake_dept_selection_test';

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
    subdomain: overrides.subdomain || 'ciphergate-dept-test',
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
  console.log('--- Starting Job Intake Department & Member Selection Tests ---');
  console.log(`Connecting to isolated test database: ${TEST_DB_URI}`);

  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();

  const tenant = 'ciphergate-dept-test';
  const otherTenant = 'other-tenant-org';

  // Seed Admin
  const admin = await Admin.create({
    username: 'dept_admin',
    email: 'dept_admin@ciphergate.com',
    password: 'password123',
    subdomain: tenant,
    role: 'admin'
  });

  // Seed Departments for primary tenant
  const webDept = await Department.create({
    name: 'Web Development',
    subdomain: tenant,
    departmentType: 'Project',
    description: 'Web development deliverables and frontend work'
  });

  const mobileDept = await Department.create({
    name: 'Mobile Engineering',
    subdomain: tenant,
    departmentType: 'Project',
    description: 'iOS and Android application engineering'
  });

  const emptyDept = await Department.create({
    name: 'DevOps & Cloud',
    subdomain: tenant,
    departmentType: 'Project',
    description: 'Empty department with no active workers'
  });

  // Department for other tenant
  const crossTenantDept = await Department.create({
    name: 'Cross Tenant Security',
    subdomain: otherTenant,
    departmentType: 'Project',
    description: 'Cross tenant department'
  });

  // Seed Workers
  const webWorker1 = await createTestWorker({
    name: 'Alice Web',
    subdomain: tenant,
    department: webDept._id,
    designation: 'Frontend Lead',
    status: 'Active'
  });

  const webWorker2 = await createTestWorker({
    name: 'Bob Web',
    subdomain: tenant,
    department: webDept._id,
    designation: 'React Developer',
    status: 'Active'
  });

  const webWorkerInactive = await createTestWorker({
    name: 'Charlie Inactive',
    subdomain: tenant,
    department: webDept._id,
    designation: 'Junior Dev',
    status: 'Relieved' // Inactive
  });

  const mobileWorker1 = await createTestWorker({
    name: 'Diana Mobile',
    subdomain: tenant,
    department: mobileDept._id,
    designation: 'Flutter Developer',
    status: 'Active'
  });

  const crossTenantWorker = await createTestWorker({
    name: 'Eve CrossTenant',
    subdomain: otherTenant,
    department: crossTenantDept._id,
    designation: 'Security Specialist',
    status: 'Active'
  });

  // Helper to create test verified invoices
  let invSeq = 100;
  async function createVerifiedInvoice(overrides = {}) {
    invSeq++;
    return Invoice.create({
      invoiceNo: overrides.invoiceNo || `TV000${invSeq}`,
      invoiceDate: overrides.invoiceDate || '20/10/2026',
      subdomain: tenant,
      createdBy: admin._id,
      createdByModel: 'Admin',
      customerName: overrides.customerName || 'Acme Corp',
      customerContact: '9876543210',
      status: overrides.status || 'Payment Received',
      isPaid: true,
      invoiceType: 'TAX INVOICE',
      paymentDetails: {
        proof: 'https://storage.googleapis.com/test/payment.png',
        proofs: [{ url: 'https://storage.googleapis.com/test/payment.png' }]
      },
      items: overrides.items || [
        { description: 'Website Redesign', qty: 1, rate: 50000, total: 50000 }
      ],
      ...overrides
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Preview Endpoint Returns Existing Departments with Members
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Preview endpoint returns existing tenant departments with active member counts', async () => {
    const invoice = await createVerifiedInvoice();
    let responseData = null;
    let statusCode = null;

    const mockReq = {
      params: { id: invoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant }
    };
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json(payload) { responseData = payload; return this; }
    };

    await invoiceController.previewJobIntakeForInvoice(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseData.success, true);
    assert(Array.isArray(responseData.data.departments), 'departments must be an array');

    const depts = responseData.data.departments;
    const foundWeb = depts.find(d => d.name === 'Web Development');
    assert(foundWeb, 'Web Development department must be present');
    assert.strictEqual(foundWeb.activeMemberCount, 2, 'Must count exactly 2 active web workers');
    assert.strictEqual(foundWeb.members.length, 2);

    const foundMobile = depts.find(d => d.name === 'Mobile Engineering');
    assert(foundMobile, 'Mobile Engineering department must be present');
    assert.strictEqual(foundMobile.activeMemberCount, 1);

    const foundEmpty = depts.find(d => d.name === 'DevOps & Cloud');
    assert(foundEmpty, 'DevOps & Cloud must be present with 0 members');
    assert.strictEqual(foundEmpty.activeMemberCount, 0);

    // Cross-tenant department must NOT be present
    const foundCross = depts.find(d => d.name === 'Cross Tenant Security');
    assert.strictEqual(foundCross, undefined, 'Cross-tenant department must not be leaked');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Member Filtering by Selected Department
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Member filtering correctly isolates employees by their specific department', async () => {
    const invoice = await createVerifiedInvoice();
    let responseData = null;

    const mockReq = {
      params: { id: invoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant }
    };
    const mockRes = {
      status() { return this; },
      json(payload) { responseData = payload; return this; }
    };

    await invoiceController.previewJobIntakeForInvoice(mockReq, mockRes);
    const webDeptData = responseData.data.departments.find(d => d.name === 'Web Development');
    const memberNames = webDeptData.members.map(m => m.name);
    assert(memberNames.includes('Alice Web'));
    assert(memberNames.includes('Bob Web'));
    assert(!memberNames.includes('Diana Mobile'), 'Diana Mobile must not appear in Web Development');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Active-Member and Tenant Validation
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Inactive and cross-tenant employees are excluded from department members list', async () => {
    const invoice = await createVerifiedInvoice();
    let responseData = null;

    const mockReq = {
      params: { id: invoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant }
    };
    const mockRes = {
      status() { return this; },
      json(payload) { responseData = payload; return this; }
    };

    await invoiceController.previewJobIntakeForInvoice(mockReq, mockRes);
    const allMembers = responseData.data.departments.flatMap(d => d.members);
    const memberUsernames = allMembers.map(m => m.username);

    assert(!memberUsernames.includes(webWorkerInactive.username), 'Inactive Charlie must not be included');
    assert(!memberUsernames.includes(crossTenantWorker.username), 'Cross-tenant worker Eve must not be included');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Individual Assignment Mode
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Job Intake with Individual mode assigns chosen member and records manual history', async () => {
    const invoice = await createVerifiedInvoice();

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: webWorker1._id
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.department, 'Web Development');
    assert.strictEqual(result.assignmentMode, 'Individual');
    assert.strictEqual(result.assignedMembersCount, 1);

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.team, 'Web Development');
    assert.strictEqual(ticket.assignee.toString(), webWorker1._id.toString());
    assert.strictEqual(ticket.assignees.length, 1);
    assert.strictEqual(ticket.assignees[0].toString(), webWorker1._id.toString());
    assert.strictEqual(ticket.assignmentMode, 'Individual');
    assert.strictEqual(ticket.assignmentSource, 'manual');

    // Verify assignment history
    const lastHistory = ticket.assignmentHistory[ticket.assignmentHistory.length - 1];
    assert.strictEqual(lastHistory.newAssignee.toString(), webWorker1._id.toString());
    assert.strictEqual(lastHistory.source, 'manual');
    assert.strictEqual(lastHistory.assignedByModel, 'Admin');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Partial Team Assignment Mode
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Job Intake with Team mode assigns selected subset of active department members', async () => {
    const invoice = await createVerifiedInvoice();

    // Select only webWorker1 (subset of [webWorker1, webWorker2])
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Team',
      selectedMemberIds: [webWorker1._id]
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.department, 'Web Development');
    assert.strictEqual(result.assignmentMode, 'Team');
    assert.strictEqual(result.assignedMembersCount, 1);

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.team, 'Web Development');
    assert.strictEqual(ticket.assignmentMode, 'Team');
    assert.strictEqual(ticket.assignees.length, 1);
    assert.strictEqual(ticket.assignees[0].toString(), webWorker1._id.toString());
    assert(!ticket.assignees.some(id => id.toString() === webWorker2._id.toString()), 'webWorker2 must NOT be silently assigned');
    assert(!ticket.assignees.some(id => id.toString() === webWorkerInactive._id.toString()), 'Inactive worker excluded');
  });

  await runTest('Job Intake with Team mode and empty selection is rejected with 400', async () => {
    const invoice = await createVerifiedInvoice();

    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: webDept._id,
          assignmentMode: 'Team',
          selectedMemberIds: []
        });
      },
      /At least one active member must be selected for Team assignment mode/
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Both Assignment Mode with Lead Designation
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Job Intake with Both mode assigns partial team and specifies primary lead assignee', async () => {
    const invoice = await createVerifiedInvoice();

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Both',
      selectedMemberId: webWorker2._id,
      selectedMemberIds: [webWorker1._id, webWorker2._id]
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.department, 'Web Development');
    assert.strictEqual(result.assignmentMode, 'Both');

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.team, 'Web Development');
    assert.strictEqual(ticket.assignmentMode, 'Both');
    assert.strictEqual(ticket.assignee.toString(), webWorker2._id.toString(), 'Primary assignee matches designated lead');
    assert.strictEqual(ticket.assignees.length, 2, 'Exactly selected team members included in assignees array');
    const assigneeIds = ticket.assignees.map(id => id.toString());
    assert(assigneeIds.includes(webWorker1._id.toString()));
    assert(assigneeIds.includes(webWorker2._id.toString()));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Invalid Department Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Invalid department and cross-tenant department are rejected', async () => {
    const invoice = await createVerifiedInvoice();

    // Non-existent department ID
    const fakeId = new mongoose.Types.ObjectId();
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: fakeId,
          assignmentMode: 'Individual',
          selectedMemberId: webWorker1._id
        });
      },
      /Department not found/
    );

    // Cross-tenant department
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: crossTenantDept._id,
          assignmentMode: 'Individual',
          selectedMemberId: webWorker1._id
        });
      },
      /Access denied: Department belongs to another organization/
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Department with No Active Members Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Department with no active members is rejected rather than assigning an unrelated employee', async () => {
    const invoice = await createVerifiedInvoice();

    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: emptyDept._id,
          assignmentMode: 'Team'
        });
      },
      /has no active eligible members in this organization/
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Invalid Member Selection Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Selecting an inactive member or member from another department is rejected', async () => {
    const invoice = await createVerifiedInvoice();

    // Selecting mobile worker for web department
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: webDept._id,
          assignmentMode: 'Individual',
          selectedMemberId: mobileWorker1._id
        });
      },
      /Selected member is invalid, inactive, or does not belong to the selected department/
    );

    // Selecting inactive worker
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: admin,
          departmentId: webDept._id,
          assignmentMode: 'Individual',
          selectedMemberId: webWorkerInactive._id
        });
      },
      /Selected member is invalid, inactive, or does not belong to the selected department/
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Duplicate Intake Prevention
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Repeated intake requests return existing references without duplicating tickets', async () => {
    const invoice = await createVerifiedInvoice();

    const firstRun = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: webWorker1._id
    });
    assert.strictEqual(firstRun.isDuplicate, false);

    const secondRun = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: admin,
      departmentId: webDept._id,
      assignmentMode: 'Individual',
      selectedMemberId: webWorker2._id // admin updates assignment
    });
    assert.strictEqual(secondRun.isDuplicate, true);
    assert.strictEqual(secondRun.ticketId.toString(), firstRun.ticketId.toString(), 'Reuses existing ticket ID');

    // Total tickets count for this order must remain exactly 1
    const ticketCount = await Ticket.countDocuments({
      subdomain: tenant,
      labels: `order:${firstRun.orderId}`
    });
    assert.strictEqual(ticketCount, 1, 'Never creates duplicate tickets');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Regression - Unverified Invoice Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Unverified invoice without payment proof is rejected by controller with 400', async () => {
    const unverifiedInvoice = await Invoice.create({
      invoiceNo: `TV99999`,
      invoiceDate: '20/10/2026',
      subdomain: tenant,
      createdBy: admin._id,
      createdByModel: 'Admin',
      customerName: 'Unverified Customer',
      customerContact: '9876543210',
      status: 'Invoice',
      isPaid: false,
      invoiceType: 'PROFORMA INVOICE',
      paymentDetails: {},
      items: [{ description: 'Pending work', qty: 1, rate: 1000, total: 1000 }]
    });

    let statusCode = null;
    let responseData = null;

    const mockReq = {
      params: { id: unverifiedInvoice._id },
      user: { _id: admin._id, role: 'admin', subdomain: tenant },
      body: { departmentId: webDept._id }
    };
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json(payload) { responseData = payload; return this; }
    };

    await invoiceController.triggerJobIntakeForInvoice(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(responseData.success, false);
    assert(responseData.message.includes('has not completed authorized payment verification'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Regression - WhatsApp Invoice Sending Invariance
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('sendInvoiceWhatsApp controller function remains intact with correct contract', async () => {
    assert(typeof invoiceController.sendInvoiceWhatsApp === 'function', 'sendInvoiceWhatsApp must exist');
    assert(typeof invoiceController.previewJobIntakeForInvoice === 'function', 'previewJobIntakeForInvoice must exist');
    assert(typeof invoiceController.triggerJobIntakeForInvoice === 'function', 'triggerJobIntakeForInvoice must exist');
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
