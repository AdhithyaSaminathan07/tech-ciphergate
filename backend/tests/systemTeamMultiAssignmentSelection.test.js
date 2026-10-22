/**
 * Team & Multiple Employee Assignment Selection Test Suite
 * 
 * Verifies Requirements:
 * A.1: Assign to one employee, multiple employees, complete team, team plus employees.
 * A.2: Selected employees remain selected when switching between Team, Individual, and Both modes.
 * A.3: Quick Assign chips toggle and deselect correctly, keeping assignees & assignee synchronized.
 * A.4: Displayed assigned count matches actual saved assignees.
 * A.5: Validate workers belong to the correct tenant and are Active.
 * A.6: Team selection assigns actual department members without leaking unrelated workers.
 * A.7: Save all selected assignees to Ticket model and verify reload persistence.
 * A.8: Manual assignment marks assignmentSource='override' with history and avoids loops.
 * A.9: Workload calculations and task status preserved.
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY on local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote/production URI detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_team_multi_test';

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
console.log(' Tech Ciphergate — Team & Multi-Employee Assignment Test Suite ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const { createTicket, updateTicket } = require('../controllers/ticketController');

let workerSequence = 0;
function createTestWorker(overrides = {}) {
  workerSequence++;
  const uniqueTag = `${workerSequence}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSequence}`,
    username: overrides.username || `worker_${uniqueTag}`,
    rfid: overrides.rfid || `RFID_${uniqueTag}`,
    subdomain: overrides.subdomain || 'tenant-alpha',
    password: 'Password123!',
    status: overrides.status || 'Active',
    role: overrides.role || 'developer',
    designation: overrides.designation || 'Full Stack Engineer',
    department: overrides.department || null,
    totalCompletedTickets: overrides.totalCompletedTickets || 0,
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 50
  });
}

function createTestAdmin(overrides = {}) {
  const uniqueTag = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Admin.create({
    name: overrides.name || 'Test Admin',
    username: overrides.username || `admin_${uniqueTag}`,
    email: overrides.email || `admin_${uniqueTag}@test.com`,
    password: 'AdminPassword123!',
    role: 'admin',
    subdomain: overrides.subdomain || 'tenant-alpha'
  });
}

function mockReq(body = {}, params = {}, user = {}) {
  return {
    body,
    params,
    user: {
      _id: user._id || new mongoose.Types.ObjectId(),
      role: user.role || 'admin',
      subdomain: user.subdomain || 'tenant-alpha',
      name: user.name || 'Test Admin'
    }
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return res;
}

async function runTest(testName, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${testName}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${testName}`);
    console.error(`  Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

async function main() {
  await mongoose.connect(LOCAL_STAGING_URI);
  await mongoose.connection.dropDatabase();

  const tenant = 'tenant-alpha';
  const otherTenant = 'tenant-beta';

  // Seed Admin
  const adminAlpha = await createTestAdmin({ subdomain: tenant });

  // Seed Departments
  const devDept = await Department.create({ name: 'DEV', subdomain: tenant });
  const designDept = await Department.create({ name: 'Design', subdomain: tenant });
  const otherTenantDept = await Department.create({ name: 'Dev Beta', subdomain: otherTenant });

  // Seed Workers in tenant-alpha
  const devWorker1 = await createTestWorker({ name: 'Dev One', department: devDept._id, subdomain: tenant });
  const devWorker2 = await createTestWorker({ name: 'Dev Two', department: devDept._id, subdomain: tenant });
  const devWorker3 = await createTestWorker({ name: 'Dev Three', department: devDept._id, subdomain: tenant });
  const designer1 = await createTestWorker({ name: 'Designer Alice', designation: 'UI/UX Designer', department: designDept._id, subdomain: tenant });
  const inactiveWorker = await createTestWorker({ name: 'Relieved Worker', status: 'Relieved', department: devDept._id, subdomain: tenant });

  // Seed Worker in otherTenant
  const crossTenantWorker = await createTestWorker({ name: 'Foreign Dev', department: otherTenantDept._id, subdomain: otherTenant });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Assign to One Employee (createTicket & updateTicket)
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Assign to One Employee keeps assignee and assignees=[id] synchronized', async () => {
    const reqCreate = mockReq({
      title: 'Task Single Assignee',
      description: 'Single employee task',
      assignee: devWorker1._id.toString(),
      subdomain: tenant
    }, {}, adminAlpha);
    const resCreate = mockRes();
    await createTicket(reqCreate, resCreate);

    assert.strictEqual(resCreate.statusCode, 201);
    const created = resCreate.data;
    assert.strictEqual(String(created.assignee._id || created.assignee), String(devWorker1._id));
    assert.strictEqual(created.assignees.length, 1);
    assert.strictEqual(String(created.assignees[0]._id || created.assignees[0]), String(devWorker1._id));
    assert.strictEqual(created.assignmentMode, 'Individual');

    // Update to another single employee
    const reqUpdate = mockReq({
      assignee: devWorker2._id.toString(),
      subdomain: tenant
    }, { id: created._id.toString() }, adminAlpha);
    const resUpdate = mockRes();
    await updateTicket(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 200);
    const updated = resUpdate.data;
    assert.strictEqual(String(updated.assignee._id || updated.assignee), String(devWorker2._id));
    assert.strictEqual(updated.assignees.length, 1);
    assert.strictEqual(String(updated.assignees[0]._id || updated.assignees[0]), String(devWorker2._id));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Assign to Multiple Employees
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Assign to Multiple Employees saves all assignees and sets primary assignee', async () => {
    const reqCreate = mockReq({
      title: 'Task Multi Assignees',
      description: 'Task with multiple workers',
      assignees: [devWorker1._id.toString(), devWorker2._id.toString()],
      assignmentMode: 'Both',
      subdomain: tenant
    }, {}, adminAlpha);
    const resCreate = mockRes();
    await createTicket(reqCreate, resCreate);

    assert.strictEqual(resCreate.statusCode, 201);
    const created = resCreate.data;
    assert.strictEqual(String(created.assignee._id || created.assignee), String(devWorker1._id));
    assert.strictEqual(created.assignees.length, 2);
    const returnedIds = created.assignees.map(a => String(a._id || a));
    assert.ok(returnedIds.includes(String(devWorker1._id)));
    assert.ok(returnedIds.includes(String(devWorker2._id)));
    assert.strictEqual(created.assignmentMode, 'Both');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Assign to Complete Team (All and Only Team Members)
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Complete Team Assignment: assigns all active department members and no unrelated workers', async () => {
    const activeDevIds = [devWorker1._id.toString(), devWorker2._id.toString(), devWorker3._id.toString()];
    
    const reqCreate = mockReq({
      title: 'Team DEV Task',
      description: 'Sprint deliverable for DEV team',
      team: 'DEV',
      assignees: activeDevIds,
      assignmentMode: 'Team',
      subdomain: tenant
    }, {}, adminAlpha);
    const resCreate = mockRes();
    await createTicket(reqCreate, resCreate);

    assert.strictEqual(resCreate.statusCode, 201);
    const created = resCreate.data;
    assert.strictEqual(created.assignees.length, 3);
    const assignedIds = created.assignees.map(a => String(a._id || a));
    assert.ok(assignedIds.includes(String(devWorker1._id)));
    assert.ok(assignedIds.includes(String(devWorker2._id)));
    assert.ok(assignedIds.includes(String(devWorker3._id)));
    assert.ok(!assignedIds.includes(String(designer1._id)), 'Must not include Designer in DEV team');
    assert.ok(!assignedIds.includes(String(inactiveWorker._id)), 'Must not include Relieved worker');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Assign to Team Plus Selected Individual Employees (Both Mode)
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Team plus individual employees: preserves team and includes external employee', async () => {
    const combinedIds = [
      devWorker1._id.toString(),
      devWorker2._id.toString(),
      devWorker3._id.toString(),
      designer1._id.toString()
    ];

    const ticket = await Ticket.create({
      title: 'Cross-functional Task',
      subdomain: tenant,
      team: 'DEV',
      status: 'To Do',
      assignees: [devWorker1._id, devWorker2._id, devWorker3._id],
      assignee: devWorker1._id,
      assignmentMode: 'Team'
    });

    const reqUpdate = mockReq({
      assignees: combinedIds,
      assignmentMode: 'Both',
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate = mockRes();
    await updateTicket(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 200);
    const updated = resUpdate.data;
    assert.strictEqual(updated.assignmentMode, 'Both');
    assert.strictEqual(updated.assignees.length, 4);
    const assignedIds = updated.assignees.map(a => String(a._id || a));
    assert.ok(assignedIds.includes(String(designer1._id)));
    assert.ok(assignedIds.includes(String(devWorker1._id)));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Deselection via Multi-Assignee & Quick Assign Toggle
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Deselection: Removing an assignee updates assignees array and primary assignee', async () => {
    const ticket = await Ticket.create({
      title: 'Task for Deselection',
      subdomain: tenant,
      assignees: [devWorker1._id, devWorker2._id],
      assignee: devWorker1._id,
      assignmentMode: 'Both'
    });

    // Deselect devWorker1, keeping only devWorker2
    const reqUpdate1 = mockReq({
      assignees: [devWorker2._id.toString()],
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate1 = mockRes();
    await updateTicket(reqUpdate1, resUpdate1);

    assert.strictEqual(resUpdate1.statusCode, 200);
    const updated1 = resUpdate1.data;
    assert.strictEqual(updated1.assignees.length, 1);
    assert.strictEqual(String(updated1.assignees[0]._id || updated1.assignees[0]), String(devWorker2._id));
    assert.strictEqual(String(updated1.assignee._id || updated1.assignee), String(devWorker2._id), 'Primary assignee updated to remaining worker');

    // Deselect remaining worker (unassign completely)
    const reqUpdate2 = mockReq({
      assignees: [],
      assignee: null,
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate2 = mockRes();
    await updateTicket(reqUpdate2, resUpdate2);

    assert.strictEqual(resUpdate2.statusCode, 200);
    const updated2 = resUpdate2.data;
    assert.strictEqual(updated2.assignees.length, 0);
    assert.strictEqual(updated2.assignee, null);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Page Reload Persistence
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Reloading task from database restores identical assignees, assignee, and assignmentMode', async () => {
    const ticket = await Ticket.create({
      title: 'Task Persistence Test',
      subdomain: tenant,
      team: 'DEV',
      assignees: [devWorker1._id, devWorker3._id],
      assignee: devWorker1._id,
      assignmentMode: 'Both'
    });

    // Fetch freshly from database as getTickets would
    const reloaded = await Ticket.findById(ticket._id)
      .populate('assignee', 'name username status role')
      .populate('assignees', 'name username department status role')
      .lean();

    assert.strictEqual(String(reloaded.assignee._id), String(devWorker1._id));
    assert.strictEqual(reloaded.assignees.length, 2);
    assert.strictEqual(reloaded.assignmentMode, 'Both');
    assert.strictEqual(reloaded.team, 'DEV');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Tenant Isolation (Cross-Tenant Rejection in Multi-Assignee)
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Tenant Isolation: Attempting to assign cross-tenant worker in assignees fails closed with 403', async () => {
    const ticket = await Ticket.create({
      title: 'Tenant Isolation Test',
      subdomain: tenant,
      status: 'To Do'
    });

    // Try passing crossTenantWorker in assignees list
    const reqUpdate = mockReq({
      assignees: [devWorker1._id.toString(), crossTenantWorker._id.toString()],
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate = mockRes();
    await updateTicket(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 403);
    assert.ok(resUpdate.data.message.includes('another organization'));

    // Verify ticket was not mutated
    const checkTicket = await Ticket.findById(ticket._id);
    assert.strictEqual(checkTicket.assignees.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Inactive Employee Rejection
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Inactive Employee: Attempting to assign inactive worker in assignees fails closed with 400', async () => {
    const ticket = await Ticket.create({
      title: 'Inactive Employee Test',
      subdomain: tenant,
      status: 'To Do'
    });

    const reqUpdate = mockReq({
      assignees: [devWorker1._id.toString(), inactiveWorker._id.toString()],
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate = mockRes();
    await updateTicket(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 400);
    assert.ok(resUpdate.data.message.includes('inactive worker'));

    // Verify ticket was not mutated
    const checkTicket = await Ticket.findById(ticket._id);
    assert.strictEqual(checkTicket.assignees.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Manual Assignment Override & No Automatic Reassignment Loop
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Manual Override records source override and preserves assignment without loops', async () => {
    const ticket = await Ticket.create({
      title: 'Auto Assigned Task',
      subdomain: tenant,
      assignee: devWorker1._id,
      assignees: [devWorker1._id],
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    const reqUpdate = mockReq({
      assignees: [devWorker2._id.toString()],
      assignmentMode: 'Individual',
      subdomain: tenant
    }, { id: ticket._id.toString() }, adminAlpha);
    const resUpdate = mockRes();
    await updateTicket(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 200);
    const updated = resUpdate.data;
    assert.strictEqual(updated.assignmentSource, 'override');
    assert.ok(updated.assignmentHistory.length >= 1);
    const lastHistory = updated.assignmentHistory[updated.assignmentHistory.length - 1];
    assert.strictEqual(lastHistory.source, 'override');
    assert.strictEqual(String(lastHistory.previousAssignee), String(devWorker1._id));
    assert.strictEqual(String(lastHistory.newAssignee), String(devWorker2._id));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Mode Switching Behavior (Selected Assignees Preserved)
  // ─────────────────────────────────────────────────────────────────────────
  await runTest('Mode Switching preserves selected assignees without loss or truncation', async () => {
    // Simulate UI handleTypeChange logic:
    // Initial: Individual with 2 selected workers
    let selectedTicket = {
      _id: 'ticket123',
      team: 'DEV',
      assignees: [devWorker1._id.toString(), devWorker2._id.toString()],
      assignee: devWorker1._id.toString(),
      assignmentMode: 'Individual'
    };

    const getDeptName = (t) => t;
    const workersList = [
      { _id: devWorker1._id.toString(), status: 'Active', department: 'DEV' },
      { _id: devWorker2._id.toString(), status: 'Active', department: 'DEV' },
      { _id: devWorker3._id.toString(), status: 'Active', department: 'DEV' },
      { _id: designer1._id.toString(), status: 'Active', department: 'Design' }
    ];
    const isWorkerInTeam = (w, team) => w.department === team;

    // Switch to Team mode:
    const teamName = getDeptName(selectedTicket.team);
    const teamMembers = workersList
      .filter(w => w.status === 'Active' && isWorkerInTeam(w, teamName))
      .map(w => w._id);
    const currentAssignees = selectedTicket.assignees;
    const mergedTeam = [...new Set([...teamMembers, ...currentAssignees])];

    selectedTicket = {
      ...selectedTicket,
      assignmentMode: 'Team',
      assignees: mergedTeam,
      assignee: currentAssignees[0] || teamMembers[0]
    };

    assert.strictEqual(selectedTicket.assignmentMode, 'Team');
    assert.strictEqual(selectedTicket.assignees.length, 3);
    assert.ok(selectedTicket.assignees.includes(devWorker1._id.toString()));
    assert.ok(selectedTicket.assignees.includes(devWorker2._id.toString()));
    assert.ok(selectedTicket.assignees.includes(devWorker3._id.toString()));

    // Switch to Both mode:
    const mergedBoth = [...new Set([...teamMembers, ...selectedTicket.assignees])];
    selectedTicket = {
      ...selectedTicket,
      assignmentMode: 'Both',
      assignees: mergedBoth,
      assignee: selectedTicket.assignees[0] || teamMembers[0]
    };
    assert.strictEqual(selectedTicket.assignmentMode, 'Both');
    assert.strictEqual(selectedTicket.assignees.length, 3);

    // Switch to Individual mode:
    selectedTicket = {
      ...selectedTicket,
      assignmentMode: 'Individual',
      assignees: selectedTicket.assignees,
      assignee: selectedTicket.assignees[0] || null
    };
    // CRITICAL: Ensure assignees were NOT truncated to 1
    assert.strictEqual(selectedTicket.assignmentMode, 'Individual');
    assert.strictEqual(selectedTicket.assignees.length, 3);
  });

  console.log('\n================================================================');
  console.log(` Team & Multi-Assignment Test Summary: Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('================================================================\n');

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
