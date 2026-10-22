/**
 * System 2 — Multi-Department, Team & Multi-Member Auto-Assignment Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY against an isolated local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote / production URI is detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_system2_multi_test';

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
console.log(' Tech Ciphergate — System 2 Multi-Department & Multi-Mode Tests ');
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

// Models & Services
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Ticket = require('../models/ticketModel');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');
const { autoAssignJobTicket } = require('../services/jobAssignmentService');
const { updateTicket } = require('../controllers/ticketController');

let workerSequence = 0;
async function createTestWorker(overrides = {}) {
  workerSequence++;
  const uniqueTag = `${workerSequence}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSequence}`,
    username: overrides.username || `worker_${uniqueTag}`,
    rfid: overrides.rfid || `RFID_${uniqueTag}`,
    password: overrides.password || 'password123',
    subdomain: overrides.subdomain || 'org-multi',
    role: overrides.role || 'developer',
    status: overrides.status || 'Active',
    skills: overrides.skills || [],
    performancePoints: overrides.performancePoints !== undefined ? overrides.performancePoints : 0,
    totalCompletedTickets: overrides.totalCompletedTickets !== undefined ? overrides.totalCompletedTickets : 0,
    department: overrides.department || null,
    ...overrides
  });
}

(async () => {
  try {
    await mongoose.connect(LOCAL_STAGING_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await mongoose.connection.dropDatabase();

    const TENANT = 'org-multi';

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Multi-Department Detection (Design Department)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Multi-Department: Automatically detects Design department for UI/UX/Figma scope', async () => {
      const designDept = await Department.create({ name: 'Design', subdomain: TENANT });
      const devDept = await Department.create({ name: 'Engineering', subdomain: TENANT });

      const designer = await createTestWorker({
        name: 'Sara Designer',
        department: designDept._id,
        skills: ['Figma', 'UI/UX', 'Wireframe'],
        subdomain: TENANT
      });

      const developer = await createTestWorker({
        name: 'Dave Developer',
        department: devDept._id,
        skills: ['React', 'Node'],
        subdomain: TENANT
      });

      const ticket = await Ticket.create({
        title: 'Mobile App Wireframes & Figma Prototype',
        description: 'Design interactive UI/UX mockups, banner assets and logo branding in Figma',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.team, 'Design');
      assert.strictEqual(String(result.assigneeId), String(designer._id));

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(String(updated.assignee), String(designer._id));
      assert.strictEqual(updated.team, 'Design');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Multi-Department Detection (Marketing / SEO Department)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Multi-Department: Automatically detects Marketing department for SEO & Ad campaigns', async () => {
      const marketingDept = await Department.create({ name: 'Marketing', subdomain: TENANT });
      const devDept = await Department.create({ name: 'Engineering', subdomain: TENANT });

      const marketer = await createTestWorker({
        name: 'Mark Marketer',
        department: marketingDept._id,
        skills: ['SEO', 'AdWords', 'Social Media'],
        subdomain: TENANT
      });

      await createTestWorker({
        name: 'Dev Bob',
        department: devDept._id,
        skills: ['React'],
        subdomain: TENANT
      });

      const ticket = await Ticket.create({
        title: 'Q4 Organic SEO Campaign & Content Strategy',
        description: 'Implement keyword research, AdWords growth analytics, and lead generation ads',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.team, 'Marketing');
      assert.strictEqual(String(result.assigneeId), String(marketer._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Ambiguous Department Scope Leaves Ticket Unassigned (No Guessing)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Ambiguity Protection: Unclear scope leaves ticket in To Do without guessing a department', async () => {
      await Department.create({ name: 'Design', subdomain: TENANT });
      await Department.create({ name: 'Engineering', subdomain: TENANT });

      await createTestWorker({ name: 'Worker One', subdomain: TENANT });

      // Extremely vague description with no department keywords
      const ticket = await Ticket.create({
        title: 'General Support Request 123',
        description: 'Miscellaneous inquiry with unspecified technical scope',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.ok(result.unassignedReason.includes('Ambiguous department requirement'));

      const updated = await Ticket.findById(ticket._id);
      assert.ok(!updated.assignee, 'Must remain unassigned');
      assert.strictEqual(updated.status, 'To Do');
      assert.ok(updated.unassignedReason.includes('Ambiguous department requirement'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Assignment Mode - Individual
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Assignment Mode (Individual): Selects single optimal employee and sets assignee & assignees=[id]', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const devWorker1 = await createTestWorker({
        name: 'Dev One',
        department: devDept._id,
        skills: ['React'],
        performancePoints: 200,
        subdomain: TENANT
      });

      const devWorker2 = await createTestWorker({
        name: 'Dev Two',
        department: devDept._id,
        skills: ['React'],
        performancePoints: 50,
        subdomain: TENANT
      });

      const ticket = await Ticket.create({
        title: 'Bugfix in React Navbar',
        team: 'DEV',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT, mode: 'Individual' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.mode, 'Individual');
      assert.strictEqual(String(result.assigneeId), String(devWorker1._id));
      assert.strictEqual(result.assignees.length, 1);
      assert.strictEqual(String(result.assignees[0]), String(devWorker1._id));

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(String(updated.assignee), String(devWorker1._id));
      assert.strictEqual(updated.assignees.length, 1);
      assert.strictEqual(updated.assignmentMode, 'Individual');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Assignment Mode - Team
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Assignment Mode (Team): Allocates entire department team and sets lead as assignee', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const lead = await createTestWorker({
        name: 'Tech Lead Tim',
        department: devDept._id,
        role: 'manager',
        performancePoints: 300,
        subdomain: TENANT
      });

      const member1 = await createTestWorker({
        name: 'Dev Member 1',
        department: devDept._id,
        subdomain: TENANT
      });

      const member2 = await createTestWorker({
        name: 'Dev Member 2',
        department: devDept._id,
        subdomain: TENANT
      });

      // Update Department projectLead
      await Department.findByIdAndUpdate(devDept._id, { projectLead: lead._id });
      const refreshedDept = await Department.findById(devDept._id).lean();

      const ticket = await Ticket.create({
        title: 'Core Architecture Overhaul',
        description: 'Full team assignment for platform upgrade',
        team: 'DEV',
        labels: ['mode:team'],
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT, mode: 'Team' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.mode, 'Team');
      assert.strictEqual(String(result.assigneeId), String(lead._id));
      assert.strictEqual(result.assignees.length, 3, 'All 3 eligible department members must be assigned');

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(String(updated.assignee), String(lead._id));
      assert.strictEqual(updated.assignees.length, 3);
      assert.strictEqual(updated.assignmentMode, 'Team');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Assignment Mode - Both (Multi-Member)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Assignment Mode (Both): Assigns lead and distinct additional members without duplicates', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const lead = await createTestWorker({
        name: 'Lead Alice',
        department: devDept._id,
        performancePoints: 500,
        subdomain: TENANT
      });

      const dev1 = await createTestWorker({
        name: 'Dev Bob',
        department: devDept._id,
        performancePoints: 300,
        subdomain: TENANT
      });

      const dev2 = await createTestWorker({
        name: 'Dev Charlie',
        department: devDept._id,
        performancePoints: 100,
        subdomain: TENANT
      });

      const ticket = await Ticket.create({
        title: 'E-commerce Checkout Feature',
        description: 'Multi-member feature delivery requiring lead architect and supporting engineers',
        team: 'DEV',
        labels: ['mode:both'],
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({
        ticket,
        subdomain: TENANT,
        mode: 'Both',
        requiredMembersCount: 2
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.mode, 'Both');
      assert.strictEqual(String(result.assigneeId), String(lead._id));
      assert.strictEqual(result.assignees.length, 2);

      // Verify no duplicate IDs in assignees array
      const idStrings = result.assignees.map(String);
      const uniqueIds = new Set(idStrings);
      assert.strictEqual(uniqueIds.size, result.assignees.length, 'Assignees array must contain distinct members');
      assert.ok(uniqueIds.has(String(lead._id)));
      assert.ok(uniqueIds.has(String(dev1._id)));

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(updated.assignmentMode, 'Both');
      assert.strictEqual(String(updated.assignee), String(lead._id));
      assert.strictEqual(updated.assignees.length, 2);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Multi-Member Workload Accounting (Excludes Overloaded Members)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Multi-Member Workload: Excludes overloaded candidate from member list', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const lead = await createTestWorker({
        name: 'Lead Dave',
        department: devDept._id,
        subdomain: TENANT
      });

      const overloadedDev = await createTestWorker({
        name: 'Overloaded Dev',
        department: devDept._id,
        subdomain: TENANT
      });

      const freeDev = await createTestWorker({
        name: 'Available Dev',
        department: devDept._id,
        subdomain: TENANT
      });

      // Put 5 active tasks on overloadedDev
      for (let i = 0; i < 5; i++) {
        await Ticket.create({
          title: `Overload Task ${i}`,
          subdomain: TENANT,
          assignee: overloadedDev._id,
          status: 'In Progress'
        });
      }

      const ticket = await Ticket.create({
        title: 'Multi-member Task',
        team: 'DEV',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({
        ticket,
        subdomain: TENANT,
        mode: 'Both',
        requiredMembersCount: 2
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(result.assignees.length, 2);

      const assignedStrIds = result.assignees.map(String);
      assert.ok(!assignedStrIds.includes(String(overloadedDev._id)), 'Overloaded dev must NOT be assigned');
      assert.ok(assignedStrIds.includes(String(freeDev._id)), 'Free dev must be selected');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Insufficient Available Members Leaves Ticket Unassigned
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Multi-Member Insufficient: Leaves ticket unassigned if required members cannot be fulfilled', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      // Only 1 worker exists in the department
      await createTestWorker({
        name: 'Solo Dev',
        department: devDept._id,
        subdomain: TENANT
      });

      const ticket = await Ticket.create({
        title: 'Complex Multi-Member System',
        team: 'DEV',
        subdomain: TENANT,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({
        ticket,
        subdomain: TENANT,
        mode: 'Both',
        requiredMembersCount: 2
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.ok(result.unassignedReason.includes('Insufficient eligible employees'));

      const updated = await Ticket.findById(ticket._id);
      assert.ok(!updated.assignee);
      assert.strictEqual(updated.status, 'To Do');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 9: Manual Admin Override Compatibility for Both Mode
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Admin Override: Admin manual assignment in Both mode updates ticket correctly', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const worker1 = await createTestWorker({ name: 'Worker A', department: devDept._id, subdomain: TENANT });
      const worker2 = await createTestWorker({ name: 'Worker B', department: devDept._id, subdomain: TENANT });

      const ticket = await Ticket.create({
        title: 'Task To Reassign',
        subdomain: TENANT,
        status: 'To Do',
        unassignedReason: 'Left unassigned for admin review'
      });

      const adminId = new mongoose.Types.ObjectId();
      const req = {
        params: { id: ticket._id.toString() },
        subdomain: TENANT,
        user: { _id: adminId, role: 'admin', subdomain: TENANT },
        body: {
          assignee: worker1._id.toString(),
          assignees: [worker1._id.toString(), worker2._id.toString()],
          team: 'DEV',
          assignmentMode: 'Both',
          assignmentReason: 'Admin designated cross-functional team'
        }
      };

      let statusResult = null;
      let jsonResult = null;
      const res = {
        status: (code) => {
          statusResult = code;
          return {
            json: (data) => { jsonResult = data; }
          };
        }
      };

      await updateTicket(req, res);
      assert.strictEqual(statusResult, 200);

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(String(updated.assignee), String(worker1._id));
      assert.strictEqual(updated.assignees.length, 2);
      assert.strictEqual(updated.assignmentMode, 'Both');
      assert.strictEqual(updated.assignmentSource, 'override');
      assert.strictEqual(updated.unassignedReason, null);
      assert.strictEqual(updated.assignmentHistory[0].source, 'override');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 10: Idempotency Protection Across Repeated Invocations
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Idempotency: Re-invoking autoAssignJobTicket on assigned ticket returns existing state without mutation', async () => {
      const devDept = await Department.create({ name: 'DEV', subdomain: TENANT });

      const dev = await createTestWorker({ name: 'Static Dev', department: devDept._id, subdomain: TENANT });

      const ticket = await Ticket.create({
        title: 'Already assigned task',
        subdomain: TENANT,
        assignee: dev._id,
        assignees: [dev._id],
        team: 'DEV',
        assignmentSource: 'automatic',
        assignmentMode: 'Individual',
        status: 'In Progress'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.strictEqual(result.isAlreadyAssigned, true);
      assert.strictEqual(String(result.assignee), String(dev._id));

      const refreshed = await Ticket.findById(ticket._id);
      assert.strictEqual(String(refreshed.assignee), String(dev._id));
      assert.strictEqual(refreshed.assignmentHistory.length, 0); // No new history pushed
    });

  } catch (globalErr) {
    console.error('Fatal Test Error:', globalErr);
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr.message);
    }

    console.log('\n================================================================');
    console.log(` Test Summary: Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount} `);
    console.log('================================================================\n');

    process.exit(failCount === 0 ? 0 : 1);
  }
})();
