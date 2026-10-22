/**
 * System 2 — Task Studio Assignment Mode and Team/Member Synchronization Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY against an isolated local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote / production URI is detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_taskstudio_sync_test';

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
console.log(' Tech Ciphergate — System 2 Task Studio Synchronization Tests   ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  testCount++;
  try {
    await Promise.all([
      Worker.deleteMany({}),
      Department.deleteMany({}),
      Ticket.deleteMany({}),
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

// Models
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const { updateTicket } = require('../controllers/ticketController');

// Frontend UI synchronization simulation functions (mirrors WorkAllocation.jsx logic)
const getDeptName = (dept) => {
  if (!dept) return '';
  if (typeof dept === 'object') {
    return (dept.name || (dept._id ? String(dept._id) : '')).trim();
  }
  return String(dept).trim();
};

const getDeptId = (dept) => {
  if (!dept) return '';
  if (typeof dept === 'object' && dept._id) return String(dept._id).trim();
  const str = String(dept).trim();
  return /^[0-9a-fA-F]{24}$/.test(str) ? str : '';
};

const isWorkerInTeam = (worker, targetTeam) => {
  if (!worker || !targetTeam) return false;

  const targetTeamName = getDeptName(targetTeam).toLowerCase().trim();
  const targetTeamId = getDeptId(targetTeam);

  const workerDeptName = (
    getDeptName(worker.department) || 
    worker.departmentName || 
    (worker.departmentInfo ? worker.departmentInfo.name : '') || 
    ''
  ).toLowerCase().trim();

  const workerDeptId = (
    getDeptId(worker.department) || 
    worker.departmentId || 
    (worker.departmentInfo ? String(worker.departmentInfo._id) : '') || 
    ''
  );

  // 1. Authoritative exact name match (case-insensitive)
  if (targetTeamName && workerDeptName && targetTeamName === workerDeptName) {
    return true;
  }

  // 2. Authoritative ID match
  if (targetTeamId && workerDeptId && targetTeamId === workerDeptId) {
    return true;
  }

  // 3. ID matches Name (e.g. if target was passed as ID and worker department name is compared)
  if (targetTeamId && workerDeptName && targetTeamId.toLowerCase() === workerDeptName) {
    return true;
  }
  if (targetTeamName && workerDeptId && targetTeamName === workerDeptId.toLowerCase()) {
    return true;
  }

  // 4. Authoritative team code / alias matching for DEV / Engineering
  if (targetTeamName === 'dev' || targetTeamName === 'development') {
    if (workerDeptName === 'dev' || workerDeptName === 'development') return true;
    if (/\b(dev|development|developer)\b/i.test(workerDeptName) || workerDeptName.startsWith('dev')) {
      return true;
    }
  }

  return false;
};

const resolveAssignmentTypeInUi = (selectedTicket, workers) => {
  // 1. Authoritative check: if ticket already has a persisted assignmentMode, honor it directly
  if (selectedTicket.assignmentMode && ['Team', 'Individual', 'Both'].includes(selectedTicket.assignmentMode)) {
    return selectedTicket.assignmentMode;
  }

  const teamName = getDeptName(selectedTicket.team);
  const currentAssignees = (selectedTicket.assignees || []).map(id => typeof id === 'object' ? id._id : id);
  if (currentAssignees.length === 0 && selectedTicket.assignee) {
    currentAssignees.push(typeof selectedTicket.assignee === 'object' ? selectedTicket.assignee._id : selectedTicket.assignee);
  }

  // If no team is set on ticket, default to Individual
  if (!teamName) {
    return 'Individual';
  }

  // Find actual active workers belonging to this team/department
  const teamMemberIds = workers
    .filter(w => w.status !== 'Relieved' && isWorkerInTeam(w, teamName))
    .map(w => String(w._id));

  if (currentAssignees.length === 0) {
    return 'Individual';
  } else if (currentAssignees.length === 1 && (teamMemberIds.length > 1 || !teamMemberIds.includes(String(currentAssignees[0])))) {
    // Exactly one employee selected, not the entire team -> Individual
    return 'Individual';
  } else if (teamMemberIds.length > 0 && teamMemberIds.every(id => currentAssignees.map(String).includes(id))) {
    const hasExtra = currentAssignees.some(id => !teamMemberIds.includes(String(id)));
    if (hasExtra) {
      return 'Both';
    } else {
      return 'Team';
    }
  } else {
    return currentAssignees.length <= 1 ? 'Individual' : 'Both';
  }
};

const calculateAssignedCount = (selectedTicket) => {
  return (selectedTicket.assignees && selectedTicket.assignees.length > 0)
    ? selectedTicket.assignees.length
    : (selectedTicket.assignee ? 1 : 0);
};

let workerSequence = 0;
async function createTestWorker(overrides = {}) {
  workerSequence++;
  const uniqueTag = `${workerSequence}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSequence}`,
    username: overrides.username || `worker_${uniqueTag}`,
    password: overrides.password || 'Test@123456',
    rfid: overrides.rfid || `RFID_${uniqueTag}`,
    subdomain: overrides.subdomain || 'techcorp',
    department: overrides.department,
    status: overrides.status || 'Active',
    skills: overrides.skills || ['Fullstack']
  });
}

async function main() {
  await mongoose.connect(LOCAL_STAGING_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const tenant = 'techcorp';

  // Create DEV department
  const devDept = await Department.create({
    name: 'DEV',
    subdomain: tenant,
    code: 'DEV'
  });

  // TEST 1: Task TV000350 diagnosis & fix — Individual mode auto-assignment never defaults to Both
  await runTest('TV000350 auto-assigned Individual task loads as Individual and not Both', async () => {
    const velmurugan = await createTestWorker({
      name: 'Velmurugan P',
      department: devDept._id,
      subdomain: tenant
    });
    const dev2 = await createTestWorker({
      name: 'Karthik S',
      department: devDept._id,
      subdomain: tenant
    });
    const dev3 = await createTestWorker({
      name: 'Priya R',
      department: devDept._id,
      subdomain: tenant
    });

    const workers = [
      { _id: velmurugan._id, name: velmurugan.name, status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: dev2._id, name: dev2.name, status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: dev3._id, name: dev3.name, status: 'Active', department: { _id: devDept._id, name: 'DEV' } }
    ];

    const ticket = await Ticket.create({
      ticketId: 'TV000350',
      title: 'Invoice Job TV000350',
      subdomain: tenant,
      team: 'DEV',
      assignee: velmurugan._id,
      assignees: [velmurugan._id],
      assignmentMode: 'Individual',
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    assert.strictEqual(ticket.assignmentMode, 'Individual');
    assert.strictEqual(ticket.team, 'DEV');
    assert.strictEqual(ticket.assignees.length, 1);
    assert.strictEqual(String(ticket.assignees[0]), String(velmurugan._id));

    const resolvedMode = resolveAssignmentTypeInUi(ticket, workers);
    assert.strictEqual(resolvedMode, 'Individual', 'Task Studio must initialize as Individual, not Both');

    const activeTeamMembers = workers.filter(w => isWorkerInTeam(w, ticket.team));
    assert.strictEqual(activeTeamMembers.length, 3, 'DEV department must have 3 active members');

    const assignedCount = calculateAssignedCount(ticket);
    assert.strictEqual(assignedCount, 1, 'Assigned count must match 1 selected employee');
  });

  // TEST 2: Legacy ticket without assignmentMode field does not mistakenly evaluate to Both
  await runTest('Legacy ticket with 1 assignee and team DEV does not evaluate to Both', async () => {
    const dev1 = await createTestWorker({ name: 'Dev 1', department: devDept._id, subdomain: tenant });
    const dev2 = await createTestWorker({ name: 'Dev 2', department: devDept._id, subdomain: tenant });

    const workers = [
      { _id: dev1._id, name: dev1.name, status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: dev2._id, name: dev2.name, status: 'Active', department: { _id: devDept._id, name: 'DEV' } }
    ];

    const legacyTicket = {
      _id: new mongoose.Types.ObjectId(),
      ticketId: 'LEGACY_001',
      team: 'DEV',
      assignee: dev1._id,
      assignees: [dev1._id],
    };

    const resolvedMode = resolveAssignmentTypeInUi(legacyTicket, workers);
    assert.strictEqual(resolvedMode, 'Individual', 'Must evaluate to Individual when only 1 assignee exists');
    assert.strictEqual(calculateAssignedCount(legacyTicket), 1);
  });

  // TEST 3: Team mode semantics
  await runTest('Team mode ticket shows selected team and all actual team members', async () => {
    const dev1 = await createTestWorker({ name: 'Dev A', department: devDept._id, subdomain: tenant });
    const dev2 = await createTestWorker({ name: 'Dev B', department: devDept._id, subdomain: tenant });

    const workers = [
      { _id: dev1._id, name: 'Dev A', status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: dev2._id, name: 'Dev B', status: 'Active', department: { _id: devDept._id, name: 'DEV' } }
    ];

    const teamTicket = await Ticket.create({
      ticketId: 'TEAM_001',
      title: 'Full Team Task',
      subdomain: tenant,
      team: 'DEV',
      assignee: dev1._id,
      assignees: [dev1._id, dev2._id],
      assignmentMode: 'Team',
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    const resolvedMode = resolveAssignmentTypeInUi(teamTicket, workers);
    assert.strictEqual(resolvedMode, 'Team');
    assert.strictEqual(calculateAssignedCount(teamTicket), 2);

    const devMembers = workers.filter(w => isWorkerInTeam(w, teamTicket.team));
    assert.strictEqual(devMembers.length, 2);
  });

  // TEST 4: Both mode semantics — team plus explicitly assigned lead and external members
  await runTest('Both mode ticket shows team plus lead and additional member', async () => {
    const qaDept = await Department.create({ name: 'QA', subdomain: tenant, code: 'QA' });

    const dev1 = await createTestWorker({ name: 'Dev 1', department: devDept._id, subdomain: tenant });
    const dev2 = await createTestWorker({ name: 'Dev 2', department: devDept._id, subdomain: tenant });
    const qaLead = await createTestWorker({ name: 'QA Lead', department: qaDept._id, subdomain: tenant });

    const workers = [
      { _id: dev1._id, name: 'Dev 1', status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: dev2._id, name: 'Dev 2', status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: qaLead._id, name: 'QA Lead', status: 'Active', department: { _id: qaDept._id, name: 'QA' } }
    ];

    const bothTicket = await Ticket.create({
      ticketId: 'BOTH_001',
      title: 'Joint DEV + QA Task',
      subdomain: tenant,
      team: 'DEV',
      assignee: qaLead._id,
      assignees: [qaLead._id, dev1._id, dev2._id],
      assignmentMode: 'Both',
      assignmentSource: 'manual',
      status: 'To Do'
    });

    const resolvedMode = resolveAssignmentTypeInUi(bothTicket, workers);
    assert.strictEqual(resolvedMode, 'Both');
    assert.strictEqual(calculateAssignedCount(bothTicket), 3);
  });

  // TEST 5: Admin override updates assignmentMode, assignmentSource: 'override', and history
  await runTest('Admin override changes mode and assignees and records override in history', async () => {
    const adminUser = await Admin.create({
      name: 'Super Admin',
      username: `admin_${Date.now()}`,
      email: `admin_${Date.now()}@example.com`,
      password: 'hashed_pw',
      subdomain: tenant
    });

    const worker1 = await createTestWorker({ name: 'Worker 1', department: devDept._id, subdomain: tenant });
    const worker2 = await createTestWorker({ name: 'Worker 2', department: devDept._id, subdomain: tenant });

    const ticket = await Ticket.create({
      ticketId: 'OVERRIDE_001',
      title: 'Override Test Task',
      subdomain: tenant,
      team: 'DEV',
      assignee: worker1._id,
      assignees: [worker1._id],
      assignmentMode: 'Individual',
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    let responseData = null;
    let responseStatus = 200;
    const req = {
      params: { id: ticket._id.toString() },
      user: adminUser,
      body: {
        subdomain: tenant,
        assignmentMode: 'Both',
        team: 'DEV',
        assignee: worker1._id.toString(),
        assignees: [worker1._id.toString(), worker2._id.toString()]
      }
    };
    const res = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseData = data; return this; }
    };

    await updateTicket(req, res);

    assert.strictEqual(responseStatus, 200);
    const updated = await Ticket.findById(ticket._id);
    assert.strictEqual(updated.assignmentMode, 'Both');
    assert.strictEqual(updated.assignmentSource, 'override');
    assert.strictEqual(updated.assignees.length, 2);

    assert.ok(updated.assignmentHistory.length > 0);
    const lastHistory = updated.assignmentHistory[updated.assignmentHistory.length - 1];
    assert.strictEqual(lastHistory.source, 'override');
    assert.ok(lastHistory.reason.includes('Both'));
    assert.strictEqual(String(lastHistory.assignedBy), String(adminUser._id));
  });

  // TEST 6: Reopening an overridden task honors the saved assignmentMode
  await runTest('Reopening a saved task preserves explicitly saved Both mode', async () => {
    const worker1 = await createTestWorker({ name: 'Worker A', department: devDept._id, subdomain: tenant });
    const worker2 = await createTestWorker({ name: 'Worker B', department: devDept._id, subdomain: tenant });

    const workers = [
      { _id: worker1._id, name: 'Worker A', status: 'Active', department: { _id: devDept._id, name: 'DEV' } },
      { _id: worker2._id, name: 'Worker B', status: 'Active', department: { _id: devDept._id, name: 'DEV' } }
    ];

    const savedTicket = await Ticket.create({
      ticketId: 'SAVED_BOTH_001',
      title: 'Persisted Both Mode Task',
      subdomain: tenant,
      team: 'DEV',
      assignee: worker1._id,
      assignees: [worker1._id, worker2._id],
      assignmentMode: 'Both',
      assignmentSource: 'override',
      status: 'To Do'
    });

    const reloadedTicket = await Ticket.findById(savedTicket._id);
    const resolvedMode = resolveAssignmentTypeInUi(reloadedTicket, workers);
    assert.strictEqual(resolvedMode, 'Both');
    assert.strictEqual(calculateAssignedCount(reloadedTicket), 2);
  });

  // TEST 7: Read-only UI open does not mutate the ticket record
  await runTest('Opening Task Studio in read-only inspection does not alter ticket assignment', async () => {
    const worker1 = await createTestWorker({ name: 'Worker 1', department: devDept._id, subdomain: tenant });

    const ticket = await Ticket.create({
      ticketId: 'NO_MUTATE_001',
      title: 'Immutable Open Test',
      subdomain: tenant,
      team: 'DEV',
      assignee: worker1._id,
      assignees: [worker1._id],
      assignmentMode: 'Individual',
      assignmentSource: 'automatic',
      status: 'To Do'
    });

    const originalUpdatedAt = ticket.updatedAt;

    const fetched = await Ticket.findById(ticket._id);
    const resolvedMode = resolveAssignmentTypeInUi(fetched, [{ _id: worker1._id, department: 'DEV' }]);
    assert.strictEqual(resolvedMode, 'Individual');

    const afterFetch = await Ticket.findById(ticket._id);
    assert.strictEqual(afterFetch.assignmentMode, 'Individual');
    assert.strictEqual(afterFetch.assignees.length, 1);
    assert.strictEqual(afterFetch.updatedAt.getTime(), originalUpdatedAt.getTime());
  });

  // TEST 8: Populated department objects ({ _id, name }) correctly normalize and match
  await runTest('Populated department objects match team membership and count accurately', async () => {
    const worker = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Populated Worker',
      department: { _id: devDept._id, name: 'DEV' }
    };
    assert.strictEqual(isWorkerInTeam(worker, 'DEV'), true);
    assert.strictEqual(isWorkerInTeam(worker, { _id: devDept._id, name: 'DEV' }), true);
    assert.strictEqual(isWorkerInTeam(worker, 'QA'), false);
  });

  // TEST 9: String department values ('DEV', 'Web Development') match authoritative aliases
  await runTest('String department values match authoritative department and alias rules', async () => {
    const w1 = { _id: new mongoose.Types.ObjectId(), name: 'W1', department: 'DEV' };
    const w2 = { _id: new mongoose.Types.ObjectId(), name: 'W2', department: 'Web Development' };
    const w3 = { _id: new mongoose.Types.ObjectId(), name: 'W3', department: 'Developer Testing' };
    const w4 = { _id: new mongoose.Types.ObjectId(), name: 'W4', department: 'Cleaning' };

    assert.strictEqual(isWorkerInTeam(w1, 'DEV'), true);
    assert.strictEqual(isWorkerInTeam(w2, 'DEV'), true, 'Web Development should match DEV team alias');
    assert.strictEqual(isWorkerInTeam(w3, 'DEV'), true, 'Developer Testing should match DEV team alias');
    assert.strictEqual(isWorkerInTeam(w4, 'DEV'), false, 'Cleaning must not match DEV team alias');
  });

  // TEST 10: Empty, null, undefined or N/A departments do not match and are not assigned
  await runTest('Empty, null, undefined or N/A departments fail safely', async () => {
    const empty1 = { _id: new mongoose.Types.ObjectId(), name: 'E1', department: null };
    const empty2 = { _id: new mongoose.Types.ObjectId(), name: 'E2', department: undefined };
    const empty3 = { _id: new mongoose.Types.ObjectId(), name: 'E3', department: '' };
    const empty4 = { _id: new mongoose.Types.ObjectId(), name: 'E4', department: 'N/A' };
    const empty5 = { _id: new mongoose.Types.ObjectId(), name: 'E5', department: {} };

    assert.strictEqual(isWorkerInTeam(empty1, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(empty2, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(empty3, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(empty4, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(empty5, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(null, 'DEV'), false);
    assert.strictEqual(isWorkerInTeam(empty1, null), false);
  });

  // TEST 11: ObjectId department values match authoritative department
  await runTest('ObjectId department values match department ID', async () => {
    const workerWithId = {
      _id: new mongoose.Types.ObjectId(),
      name: 'ID Worker',
      department: devDept._id.toString()
    };
    assert.strictEqual(isWorkerInTeam(workerWithId, devDept._id.toString()), true);
  });

  // TEST 12: Unassigned ticket with team DEV and 0 assignees evaluates to Individual mode, never auto-selecting all team members
  await runTest('Unassigned ticket with team set evaluates to Individual mode and preserves 0 assignees', async () => {
    const unassignedTicket = await Ticket.create({
      ticketId: 'UNASSIGNED_TEAM_001',
      title: 'Unassigned Task with DEV team',
      subdomain: tenant,
      team: 'DEV',
      assignee: null,
      assignees: [],
      status: 'To Do'
    });

    const activeWorkers = [
      { _id: new mongoose.Types.ObjectId(), name: 'Dev 1', status: 'Active', department: 'DEV' },
      { _id: new mongoose.Types.ObjectId(), name: 'Dev 2', status: 'Active', department: 'DEV' },
      { _id: new mongoose.Types.ObjectId(), name: 'Dev 3', status: 'Active', department: 'DEV' }
    ];

    const resolvedMode = resolveAssignmentTypeInUi(unassignedTicket, activeWorkers);
    assert.strictEqual(resolvedMode, 'Individual', 'Unassigned ticket must evaluate to Individual, NOT Team');
    assert.strictEqual(calculateAssignedCount(unassignedTicket), 0, 'Must have 0 assigned members, NOT select all 3');
  });

  // Teardown: drop ephemeral test database
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(` Task Studio Synchronization Tests Summary: ${passCount}/${testCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
