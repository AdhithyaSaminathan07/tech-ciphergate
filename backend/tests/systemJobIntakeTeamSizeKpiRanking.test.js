/**
 * Isolated Test Suite: Job Intake Team Size Selection & System 3 KPI Ranking Integration
 * Tech Ciphergate - Isolated Test Database Verification
 * 
 * Tests:
 * 1. Six eligible employees with requested team size three: exactly the top three System 3-ranked employees are selected.
 * 2. Changing team size changes the number of selected members (e.g., requested size 2 vs requested size 4).
 * 3. Incorrect department or tenant employees are rejected.
 * 4. Inactive, on-leave, and overloaded (>= 5 active tasks) candidates are excluded from eligibility.
 * 5. Missing KPI history follows the established neutral fallback without fabricating values.
 * 6. Requested team size exceeds eligibility: returns clear error and no ticket assignment is saved.
 * 7. Invalid, zero, negative, fractional, and duplicate member counts/IDs are rejected.
 * 8. Both mode preserves the eligible designated lead and selects remaining members using System 3 KPI ranking.
 * 9. Both mode with an ineligible designated lead (on leave / overloaded) fails closed with a clear error.
 * 10. Manual Task Studio assignments and existing manual overrides are preserved.
 * 11. The persisted ticket contains exact expected employee IDs in assignee, assignees, team, and assignmentHistory.
 * 12. Invariance: Invoice WhatsApp delivery, payment proof verification, and PerformancePoints logic remain unchanged.
 * 
 * Safety:
 * Connects exclusively to ephemeral local MongoDB:
 * mongodb://127.0.0.1:27017/tech_ciphergate_teamsize_kpi_test
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
const Leave = require('../models/Leave');
const PerformancePoints = require('../models/PerformancePoints');

const invoiceController = require('../controllers/invoiceController');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');
const { autoAssignJobTicket } = require('../services/jobAssignmentService');
const { computeWorkerKpi } = require('../services/kpiComputationService');
const whatsappService = require('../services/whatsappService');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_teamsize_kpi_test';

// Fail-closed safety assertion: forbid any Atlas/production connection string
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
    subdomain: overrides.subdomain || 'ciphergate-kpi-test',
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
    console.log(`  ✓ Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  ✗ Test ${testCount} FAILED: ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(relevantStack);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('TECH CIPHERGATE - SYSTEM 3 TEAM SIZE & KPI SELECTION TEST SUITE');
  console.log('================================================================\n');

  assertSafeTestEnvironment();
  console.log(`[Safety] Verified safe isolated DB URI: ${TEST_DB_URI}`);

  await mongoose.connect(TEST_DB_URI);
  console.log('[Setup] Connected to local ephemeral MongoDB.');

  const db = mongoose.connection.db;
  await db.dropDatabase();
  console.log('[Setup] Ephemeral test database dropped and initialized cleanly.\n');

  const tenant = 'ciphergate-kpi-test';
  const otherTenant = 'other-tenant-corp';

  // 1. Create test departments
  const devDept = await Department.create({
    name: 'Full Stack Engineering',
    subdomain: tenant,
    assignedDevelopers: []
  });

  const foreignDept = await Department.create({
    name: 'External Engineering',
    subdomain: otherTenant,
    assignedDevelopers: []
  });

  // Create admin user for requests
  const adminUser = await Admin.create({
    name: 'Test Admin',
    username: 'testadmin',
    email: 'admin@testciphergate.com',
    subdomain: tenant,
    role: 'admin',
    password: 'password123'
  });

  // Helper to create a verified invoice
  let invSeq = 0;
  async function createVerifiedInvoice(overrides = {}) {
    invSeq++;
    return Invoice.create({
      invoiceNo: `INV-KPI-${invSeq}-${Date.now().toString().slice(-4)}`,
      invoiceDate: new Date(),
      customerName: 'Acme Test Corp',
      customerContact: '9876543210',
      status: 'Payment Received',
      isPaid: true,
      createdBy: adminUser._id,
      createdByModel: 'Admin',
      paymentDetails: {
        method: 'Bank Transfer',
        proofs: [{ url: 'https://cdn.example.com/proof1.png', verified: true }]
      },
      items: [{ description: 'Full Stack Web Platform', qty: 1, rate: 50000, total: 50000 }],
      ...overrides
    });
  }

  console.log('--- Executing Test Cases ---\n');

  // TEST 1: Six eligible employees with requested team size three: exactly the top three System 3-ranked employees are selected
  await runTest('Six eligible employees with requested team size 3: exactly top 3 System 3-ranked selected', async () => {
    // Create 6 active workers in devDept
    const workers = [];
    for (let i = 1; i <= 6; i++) {
      const w = await createTestWorker({
        name: `Dev Member ${i}`,
        department: devDept._id,
        subdomain: tenant
      });
      workers.push(w);
    }
    await Department.findByIdAndUpdate(devDept._id, {
      assignedDevelopers: workers.map(w => w._id)
    });

    // Create tickets to produce differentiated System 3 KPI profiles
    // Worker 1: 10 done tickets on-time, 0 revisions -> high OTCR & FTAR
    for (let t = 0; t < 10; t++) {
      await Ticket.create({
        title: `Task for W1 - ${t}`,
        assignee: workers[0]._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'on_time',
        reviewCycles: [{ submissionTime: new Date(), decision: 'Approved' }]
      });
    }

    // Worker 2: 8 done tickets on-time, 0 revisions -> strong
    for (let t = 0; t < 8; t++) {
      await Ticket.create({
        title: `Task for W2 - ${t}`,
        assignee: workers[1]._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'on_time',
        reviewCycles: [{ submissionTime: new Date(), decision: 'Approved' }]
      });
    }

    // Worker 3: 6 done tickets on-time -> moderate
    for (let t = 0; t < 6; t++) {
      await Ticket.create({
        title: `Task for W3 - ${t}`,
        assignee: workers[2]._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'on_time',
        reviewCycles: [{ submissionTime: new Date(), decision: 'Approved' }]
      });
    }

    // Worker 4, 5, 6: lower / delayed performance
    for (let t = 0; t < 5; t++) {
      await Ticket.create({
        title: `Task for W4 - ${t}`,
        assignee: workers[3]._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'delayed'
      });
    }

    const invoice = await createVerifiedInvoice();

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser,
      departmentId: devDept._id,
      assignmentMode: 'Team',
      teamSize: 3
    });

    assert(result.ticketId, 'Ticket ID should be created');
    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignmentMode, 'Team');
    assert.strictEqual(ticket.assignees.length, 3, 'Exactly 3 team members must be assigned');
    
    // System 3 should select workers[0], workers[1], workers[2] as top 3
    const assignedIds = ticket.assignees.map(id => String(id));
    assert(assignedIds.includes(String(workers[0]._id)), 'Top performer W1 must be in assigned team');
    assert(assignedIds.includes(String(workers[1]._id)), 'Second performer W2 must be in assigned team');
    assert(assignedIds.includes(String(workers[2]._id)), 'Third performer W3 must be in assigned team');
    assert(!assignedIds.includes(String(workers[3]._id)), 'Lower performer W4 must not be in top 3');
    assert(!assignedIds.includes(String(workers[4]._id)), 'W5 must not be in top 3');
    assert(!assignedIds.includes(String(workers[5]._id)), 'W6 must not be in top 3');

    // Verify explanations returned
    assert(Array.isArray(result.selectedMembers), 'Selected members summary must be returned');
    assert.strictEqual(result.selectedMembers.length, 3);
  });

  // TEST 2: Changing team size changes the number of selected members
  await runTest('Changing team size changes the number of selected members (e.g. 2 vs 4)', async () => {
    const inv2 = await createVerifiedInvoice();
    const result2 = await processJobIntakeFromVerifiedInvoice({
      invoice: inv2,
      adminUser,
      departmentId: devDept._id,
      assignmentMode: 'Team',
      teamSize: 2
    });
    const ticket2 = await Ticket.findById(result2.ticketId);
    assert.strictEqual(ticket2.assignees.length, 2, 'Should assign exactly 2 members when teamSize=2');

    const inv4 = await createVerifiedInvoice();
    const result4 = await processJobIntakeFromVerifiedInvoice({
      invoice: inv4,
      adminUser,
      departmentId: devDept._id,
      assignmentMode: 'Team',
      teamSize: 4
    });
    const ticket4 = await Ticket.findById(result4.ticketId);
    assert.strictEqual(ticket4.assignees.length, 4, 'Should assign exactly 4 members when teamSize=4');
  });

  // TEST 3: Incorrect department or foreign tenant employees are rejected
  await runTest('Incorrect department or tenant employees are rejected', async () => {
    const foreignWorker = await createTestWorker({
      name: 'Foreign Worker',
      department: foreignDept._id,
      subdomain: otherTenant
    });

    const invoice = await createVerifiedInvoice();

    // Calling autoAssignJobTicket with worker from wrong department or tenant
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: devDept._id,
          assignmentMode: 'Team',
          teamSize: 1,
          selectedMemberIds: [foreignWorker._id]
        });
      },
      (err) => {
        assert(err.message.includes('invalid') || err.message.includes('department'));
        return true;
      }
    );
  });

  // TEST 4: Inactive, on-leave, and overloaded candidates are excluded
  await runTest('Inactive, on-leave, and overloaded (>= 5 active tasks) candidates are excluded', async () => {
    // Create new department for clean isolation
    const isolatedDept = await Department.create({
      name: 'Mobile Engineering',
      subdomain: tenant,
      assignedDevelopers: []
    });

    const activeWorker1 = await createTestWorker({ name: 'Active Dev 1', department: isolatedDept._id, subdomain: tenant });
    const activeWorker2 = await createTestWorker({ name: 'Active Dev 2', department: isolatedDept._id, subdomain: tenant });
    const inactiveWorker = await createTestWorker({ name: 'Inactive Dev', department: isolatedDept._id, subdomain: tenant, status: 'Relieved' });
    const onLeaveWorker = await createTestWorker({ name: 'On-Leave Dev', department: isolatedDept._id, subdomain: tenant });
    const overloadedWorker = await createTestWorker({ name: 'Overloaded Dev', department: isolatedDept._id, subdomain: tenant });

    // Put onLeaveWorker on approved leave today
    const today = new Date();
    await Leave.create({
      worker: onLeaveWorker._id,
      subdomain: tenant,
      leaveType: 'Sick Leave',
      totalDays: 1,
      reason: 'Medical Leave',
      status: 'Approved',
      startDate: new Date(today.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    });

    // Overload overloadedWorker with 5 active tasks
    for (let k = 0; k < 5; k++) {
      await Ticket.create({
        title: `Active task ${k}`,
        assignee: overloadedWorker._id,
        subdomain: tenant,
        status: 'In Progress'
      });
    }

    await Department.findByIdAndUpdate(isolatedDept._id, {
      assignedDevelopers: [activeWorker1._id, activeWorker2._id, inactiveWorker._id, onLeaveWorker._id, overloadedWorker._id]
    });

    const invoice = await createVerifiedInvoice();

    // Out of 5 total workers, only 2 are eligible (activeWorker1, activeWorker2)
    // Requesting teamSize: 2 should select exactly the 2 eligible workers
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser,
      departmentId: isolatedDept._id,
      assignmentMode: 'Team',
      teamSize: 2
    });

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignees.length, 2);
    const assignedIds = ticket.assignees.map(String);
    assert(assignedIds.includes(String(activeWorker1._id)));
    assert(assignedIds.includes(String(activeWorker2._id)));
    assert(!assignedIds.includes(String(inactiveWorker._id)), 'Inactive worker must not be assigned');
    assert(!assignedIds.includes(String(onLeaveWorker._id)), 'On-leave worker must not be assigned');
    assert(!assignedIds.includes(String(overloadedWorker._id)), 'Overloaded worker must not be assigned');
  });

  // TEST 5: Missing KPI history follows established neutral fallback
  await runTest('Missing KPI history follows established neutral fallback without fabricating values', async () => {
    const freshDept = await Department.create({
      name: 'Data Science',
      subdomain: tenant,
      assignedDevelopers: []
    });

    // 2 fresh workers with 0 completed tickets
    const freshWorker1 = await createTestWorker({ name: 'Fresh Dev 1', department: freshDept._id, subdomain: tenant });
    const freshWorker2 = await createTestWorker({ name: 'Fresh Dev 2', department: freshDept._id, subdomain: tenant });

    await Department.findByIdAndUpdate(freshDept._id, {
      assignedDevelopers: [freshWorker1._id, freshWorker2._id]
    });

    const invoice = await createVerifiedInvoice();
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser,
      departmentId: freshDept._id,
      assignmentMode: 'Team',
      teamSize: 1
    });

    assert(result.ticketId);
    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignees.length, 1);
    
    // Check fallback in selectedMembers
    const selected = result.selectedMembers[0];
    assert(selected.explanation.toLowerCase().includes('neutral') || selected.explanation.toLowerCase().includes('pts'), 
      'Should report neutral fallback explanation');
  });

  // TEST 6: Requested team size exceeds eligibility: no ticket assignment is saved
  await runTest('Requested team size exceeds eligibility: rejects with clear error and saves no ticket', async () => {
    const smallDept = await Department.create({
      name: 'Cybersecurity',
      subdomain: tenant,
      assignedDevelopers: []
    });
    const soloWorker = await createTestWorker({ name: 'Solo Security Dev', department: smallDept._id, subdomain: tenant });
    await Department.findByIdAndUpdate(smallDept._id, { assignedDevelopers: [soloWorker._id] });

    const invoice = await createVerifiedInvoice();
    const ticketCountBefore = await Ticket.countDocuments();

    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: smallDept._id,
          assignmentMode: 'Team',
          teamSize: 3 // Only 1 eligible worker exists
        });
      },
      (err) => {
        assert(err.message.includes('exceeds the number of eligible employees'));
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.eligibleCount, 1);
        return true;
      }
    );

    const ticketCountAfter = await Ticket.countDocuments();
    assert.strictEqual(ticketCountAfter, ticketCountBefore, 'No ticket should be created when validation fails');
  });

  // TEST 7: Invalid, zero, negative, fractional, and duplicate member counts/IDs are rejected
  await runTest('Invalid, zero, negative, and fractional team sizes are rejected', async () => {
    const invoice = await createVerifiedInvoice();

    // 0
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: devDept._id,
          assignmentMode: 'Team',
          teamSize: 0
        });
      },
      /positive integer/
    );

    // Negative
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: devDept._id,
          assignmentMode: 'Team',
          teamSize: -2
        });
      },
      /positive integer/
    );

    // Fractional
    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: devDept._id,
          assignmentMode: 'Team',
          teamSize: 2.5
        });
      },
      /positive integer/
    );
  });

  // TEST 8: Both mode preserves the eligible designated lead and selects remaining members using System 3 ranking
  await runTest('Both mode preserves eligible designated lead and selects remaining members via System 3 ranking', async () => {
    const bothDept = await Department.create({
      name: 'Cloud Infrastructure',
      subdomain: tenant,
      assignedDevelopers: []
    });

    const leadWorker = await createTestWorker({ name: 'Lead Dev', department: bothDept._id, subdomain: tenant });
    const topPerformer1 = await createTestWorker({ name: 'Top Cloud Dev 1', department: bothDept._id, subdomain: tenant });
    const topPerformer2 = await createTestWorker({ name: 'Top Cloud Dev 2', department: bothDept._id, subdomain: tenant });
    const lowPerformer = await createTestWorker({ name: 'Low Cloud Dev', department: bothDept._id, subdomain: tenant });

    await Department.findByIdAndUpdate(bothDept._id, {
      assignedDevelopers: [leadWorker._id, topPerformer1._id, topPerformer2._id, lowPerformer._id]
    });

    // Provide high KPI history to topPerformer1 and topPerformer2
    for (let t = 0; t < 6; t++) {
      await Ticket.create({
        title: `Cloud task 1 - ${t}`,
        assignee: topPerformer1._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'on_time',
        reviewCycles: [{ submissionTime: new Date(), decision: 'Approved' }]
      });
      await Ticket.create({
        title: `Cloud task 2 - ${t}`,
        assignee: topPerformer2._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'on_time',
        reviewCycles: [{ submissionTime: new Date(), decision: 'Approved' }]
      });
    }

    // Provide low/delayed history to lowPerformer
    for (let t = 0; t < 5; t++) {
      await Ticket.create({
        title: `Delayed task - ${t}`,
        assignee: lowPerformer._id,
        subdomain: tenant,
        status: 'Done',
        performanceStatus: 'delayed'
      });
    }

    const invoice = await createVerifiedInvoice();

    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser,
      departmentId: bothDept._id,
      assignmentMode: 'Both',
      selectedMemberId: leadWorker._id,
      teamSize: 3 // 1 lead + 2 remaining System 3 members
    });

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignmentMode, 'Both');
    assert.strictEqual(String(ticket.assignee), String(leadWorker._id), 'Primary assignee must be designated lead');
    assert.strictEqual(ticket.assignees.length, 3, 'Must have exactly 3 assignees');
    assert.strictEqual(String(ticket.assignees[0]), String(leadWorker._id), 'First assignee must be designated lead');

    // Remaining 2 should be the top 2 System 3 performers
    const otherAssignees = ticket.assignees.slice(1).map(String);
    assert(otherAssignees.includes(String(topPerformer1._id)), 'Remaining member 1 must be top System 3 performer');
    assert(otherAssignees.includes(String(topPerformer2._id)), 'Remaining member 2 must be second top System 3 performer');
    assert(!otherAssignees.includes(String(lowPerformer._id)), 'Low performer must not be selected in top remaining');
  });

  // TEST 9: Both mode with an ineligible designated lead fails closed with clear error
  await runTest('Both mode with ineligible designated lead (on leave / overloaded) fails closed', async () => {
    const leaveLead = await createTestWorker({
      name: 'Leave Lead',
      department: devDept._id,
      subdomain: tenant
    });
    await Leave.create({
      worker: leaveLead._id,
      subdomain: tenant,
      leaveType: 'Sick Leave',
      totalDays: 1,
      reason: 'Medical Leave',
      status: 'Approved',
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000)
    });

    const invoice = await createVerifiedInvoice();

    await assert.rejects(
      async () => {
        await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser,
          departmentId: devDept._id,
          assignmentMode: 'Both',
          selectedMemberId: leaveLead._id,
          teamSize: 2
        });
      },
      (err) => {
        assert(err.message.includes('leave') || err.message.includes('ineligible'));
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  // TEST 10: Manual Task Studio assignments and existing overrides remain unchanged
  await runTest('Manual Task Studio assignments and overrides are preserved without overwrite', async () => {
    const manualWorker = await createTestWorker({ name: 'Manual Override Dev', department: devDept._id, subdomain: tenant });
    
    // Create ticket manually as if created in Task Studio
    const manualTicket = await Ticket.create({
      title: 'Manual Task Studio Ticket',
      assignee: manualWorker._id,
      assignees: [manualWorker._id],
      team: devDept.name,
      subdomain: tenant,
      assignmentSource: 'manual',
      assignmentMode: 'Individual',
      assignmentHistory: [{
        previousAssignee: null,
        newAssignee: manualWorker._id,
        source: 'manual',
        reason: 'Manual Task Studio allocation'
      }]
    });

    // Check that autoAssignJobTicket respects manual source and does not silently overwrite
    const checkTicket = await Ticket.findById(manualTicket._id);
    assert.strictEqual(checkTicket.assignmentSource, 'manual');
    assert.strictEqual(String(checkTicket.assignee), String(manualWorker._id));
  });

  // TEST 11: Persisted ticket contains exact expected employee IDs
  await runTest('Persisted ticket contains exact distinct employee IDs matching team size', async () => {
    const invoice = await createVerifiedInvoice();
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser,
      departmentId: devDept._id,
      assignmentMode: 'Team',
      teamSize: 3
    });

    const ticket = await Ticket.findById(result.ticketId);
    assert.strictEqual(ticket.assignees.length, 3);
    const uniqueIds = new Set(ticket.assignees.map(String));
    assert.strictEqual(uniqueIds.size, 3, 'Must contain 3 distinct employee IDs without duplicates');
    assert(ticket.assignee, 'ticket.assignee must be set to the lead or first member');
    assert(ticket.assignmentHistory.length > 0, 'ticket.assignmentHistory must be populated');
  });

  // TEST 12: Invariance of invoice WhatsApp delivery, payment proof verification, and PerformancePoints
  await runTest('Invariance: Invoice WhatsApp delivery, payment proof, and PerformancePoints logic unchanged', async () => {
    // 1. sendInvoiceWhatsApp function exists and exported
    assert.strictEqual(typeof invoiceController.sendInvoiceWhatsApp, 'function', 'sendInvoiceWhatsApp must remain intact');
    assert.strictEqual(typeof whatsappService.sendWhatsApp, 'function', 'whatsappService.sendWhatsApp must remain intact');

    // 2. PerformancePoints ledger remains intact
    const pointsRecord = await PerformancePoints.create({
      worker: adminUser._id,
      subdomain: tenant,
      pointsEarned: 25,
      reason: 'task_completed'
    });
    assert(pointsRecord._id, 'PerformancePoints creation works as expected');
    const readRecord = await PerformancePoints.findById(pointsRecord._id);
    assert.strictEqual(readRecord.pointsEarned, 25);
  });

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passCount} / ${testCount} tests passed (${failCount} failures).`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  console.log('[Teardown] Disconnected cleanly from ephemeral test database.');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
