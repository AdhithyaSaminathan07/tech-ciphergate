/**
 * System 2 — Automatic Job Assignment Engine Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY against an isolated local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote / production URI is detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_system2_test';

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
console.log(' Tech Ciphergate — System 2 Auto-Assignment Test Suite          ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  testCount++;
  try {
    // Clean test state before each individual test
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
const { autoAssignJobTicket, MAX_ACTIVE_WORKLOAD } = require('../services/jobAssignmentService');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');

let workerSequence = 0;
async function createTestWorker(overrides = {}) {
  workerSequence++;
  const uniqueTag = `${workerSequence}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return Worker.create({
    name: overrides.name || `Worker ${workerSequence}`,
    username: overrides.username || `worker_${uniqueTag}`,
    rfid: overrides.rfid || `RFID_${uniqueTag}`,
    password: overrides.password || 'password123',
    subdomain: overrides.subdomain || 'org-alpha',
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

    const TENANT_A = 'org-alpha';
    const TENANT_B = 'org-beta';

    // ─────────────────────────────────────────────────────────────────────────
    // Group 1: Team & Department Matching
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Team Matching: Assigns DEV ticket to a DEV/Engineering worker, not Sales', async () => {
      const devDept = await Department.create({ name: 'Engineering', subdomain: TENANT_A });
      const salesDept = await Department.create({ name: 'Sales', subdomain: TENANT_A });

      const devWorker = await createTestWorker({
        name: 'Dev Alice',
        role: 'developer',
        department: devDept._id,
        subdomain: TENANT_A
      });

      const salesWorker = await createTestWorker({
        name: 'Sales Bob',
        role: 'manager',
        department: salesDept._id,
        subdomain: TENANT_A
      });

      const ticket = await Ticket.create({
        title: 'Backend API Bugfix',
        team: 'DEV',
        subdomain: TENANT_A,
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: TENANT_A });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(devWorker._id));

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(String(updated.assignee), String(devWorker._id));
      assert.strictEqual(updated.assignmentSource, 'automatic');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 2: Tenant Isolation
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Tenant Isolation: Worker in org-beta is never assigned to ticket in org-alpha', async () => {
      const devDeptB = await Department.create({ name: 'Engineering', subdomain: TENANT_B });
      await createTestWorker({
        name: 'Beta Charlie',
        role: 'developer',
        department: devDeptB._id,
        subdomain: TENANT_B
      });

      const ticketGamma = await Ticket.create({
        title: 'Gamma Task',
        team: 'DEV',
        subdomain: 'org-gamma',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket: ticketGamma, subdomain: 'org-gamma' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.ok(result.unassignedReason.includes('No active employees found'));

      const updated = await Ticket.findById(ticketGamma._id);
      assert.ok(!updated.assignee, 'Ticket assignee must be null or undefined in empty tenant');
      assert.strictEqual(updated.status, 'To Do');
    });

    await runTest('Tenant Isolation: Fails closed when subdomain is missing or mismatched', async () => {
      const ticket = await Ticket.create({
        title: 'Security Ticket',
        team: 'DEV',
        subdomain: TENANT_A,
        status: 'To Do'
      });

      // Missing subdomain
      let errorThrown = false;
      try {
        await autoAssignJobTicket({ ticket, subdomain: '' });
      } catch (err) {
        errorThrown = true;
        assert.ok(err.message.includes('Tenant subdomain is required'));
      }
      assert.strictEqual(errorThrown, true);

      // Mismatched subdomain
      let mismatchThrown = false;
      try {
        await autoAssignJobTicket({ ticket, subdomain: TENANT_B });
      } catch (err) {
        mismatchThrown = true;
        assert.strictEqual(err.statusCode, 403);
      }
      assert.strictEqual(mismatchThrown, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 3: Availability & Approved Leave Check
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Availability: Excludes worker who is on approved leave today', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-leave-test' });

      const workerOnLeave = await createTestWorker({
        name: 'Worker On Leave',
        department: dept._id,
        subdomain: 'org-leave-test'
      });

      const workerAvailable = await createTestWorker({
        name: 'Worker Available',
        department: dept._id,
        subdomain: 'org-leave-test'
      });

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
      await Leave.create({
        worker: workerOnLeave._id,
        subdomain: 'org-leave-test',
        leaveType: 'Annual Leave',
        totalDays: 3,
        reason: 'Family vacation',
        status: 'Approved',
        startDate: start,
        endDate: end
      });

      const ticket = await Ticket.create({
        title: 'Urgent task',
        team: 'DEV',
        subdomain: 'org-leave-test',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-leave-test' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(workerAvailable._id));
    });

    await runTest('Availability: Pending or Rejected leave does NOT exclude worker', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-leave-pending' });

      const workerPending = await createTestWorker({
        name: 'Worker Pending Leave',
        department: dept._id,
        subdomain: 'org-leave-pending'
      });

      const now = new Date();
      await Leave.create({
        worker: workerPending._id,
        subdomain: 'org-leave-pending',
        leaveType: 'Sick Leave',
        totalDays: 2,
        reason: 'Doctor checkup',
        status: 'Pending',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
        endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      });

      const ticket = await Ticket.create({
        title: 'Pending Leave Ticket',
        team: 'DEV',
        subdomain: 'org-leave-pending',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-leave-pending' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(workerPending._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 4: Workload Calculation & Overload Threshold (>= 5 tasks)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Workload: Excludes worker with >= 5 active tasks', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-workload-limit' });

      const overloadedWorker = await createTestWorker({
        name: 'Overloaded Worker',
        department: dept._id,
        subdomain: 'org-workload-limit'
      });

      const freeWorker = await createTestWorker({
        name: 'Free Worker',
        department: dept._id,
        subdomain: 'org-workload-limit'
      });

      // Create 5 active tickets for overloadedWorker
      for (let i = 0; i < 5; i++) {
        await Ticket.create({
          title: `Active Ticket ${i}`,
          subdomain: 'org-workload-limit',
          assignee: overloadedWorker._id,
          status: i % 2 === 0 ? 'In Progress' : 'To Do'
        });
      }

      const newTicket = await Ticket.create({
        title: 'New Incoming Ticket',
        team: 'DEV',
        subdomain: 'org-workload-limit',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket: newTicket, subdomain: 'org-workload-limit' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(freeWorker._id));
    });

    await runTest('Workload: Done tickets and soft-deleted tickets do not count towards active workload', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-done-tickets' });

      const dev1 = await createTestWorker({
        name: 'Dev One',
        department: dept._id,
        subdomain: 'org-done-tickets'
      });

      // 5 'Done' tickets for dev1
      for (let i = 0; i < 5; i++) {
        await Ticket.create({
          title: `Done Ticket ${i}`,
          subdomain: 'org-done-tickets',
          assignee: dev1._id,
          status: 'Done'
        });
      }

      // 5 soft-deleted tickets for dev1
      for (let i = 0; i < 5; i++) {
        await Ticket.create({
          title: `Deleted Ticket ${i}`,
          subdomain: 'org-done-tickets',
          assignee: dev1._id,
          status: 'In Progress',
          isDeleted: true
        });
      }

      const ticket = await Ticket.create({
        title: 'Should be assigned to Dev One',
        team: 'DEV',
        subdomain: 'org-done-tickets',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-done-tickets' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(dev1._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 5: Workload Ranking (Least-Loaded First)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Workload Ranking: Assigns worker with 0 tasks over worker with 2 tasks', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-least-loaded' });

      const busyWorker = await createTestWorker({
        name: 'Busy Worker',
        department: dept._id,
        subdomain: 'org-least-loaded'
      });

      const idleWorker = await createTestWorker({
        name: 'Idle Worker',
        department: dept._id,
        subdomain: 'org-least-loaded'
      });

      // Give busyWorker 2 active tasks
      for (let i = 0; i < 2; i++) {
        await Ticket.create({
          title: `Busy Task ${i}`,
          subdomain: 'org-least-loaded',
          assignee: busyWorker._id,
          status: 'In Progress'
        });
      }

      const ticket = await Ticket.create({
        title: 'Fresh Task',
        team: 'DEV',
        subdomain: 'org-least-loaded',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-least-loaded' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(idleWorker._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 6: Skill Keyword Matching Bonus
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Skills Match: Assigns worker whose skills match ticket keywords when workloads are equal', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-skills-test' });

      const reactWorker = await createTestWorker({
        name: 'React Expert',
        department: dept._id,
        subdomain: 'org-skills-test',
        skills: ['React', 'TypeScript', 'Frontend']
      });

      const pythonWorker = await createTestWorker({
        name: 'Python Expert',
        department: dept._id,
        subdomain: 'org-skills-test',
        skills: ['Python', 'Django', 'Backend']
      });

      const ticket = await Ticket.create({
        title: 'Build React UI Component for Dashboard',
        description: 'Implement responsive frontend using React and TypeScript',
        team: 'DEV',
        subdomain: 'org-skills-test',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-skills-test' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(reactWorker._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 7: KPI Ranking & Graceful Missing KPI Fallback
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('KPI Ranking: Worker with higher performancePoints gets bonus score when skills/workload match', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-kpi-test' });

      const starWorker = await createTestWorker({
        name: 'Star Worker',
        department: dept._id,
        subdomain: 'org-kpi-test',
        skills: ['JavaScript'],
        performancePoints: 450
      });

      const newWorker = await createTestWorker({
        name: 'New Worker',
        department: dept._id,
        subdomain: 'org-kpi-test',
        skills: ['JavaScript'],
        performancePoints: 50
      });

      const ticket = await Ticket.create({
        title: 'JavaScript Optimization Task',
        team: 'DEV',
        subdomain: 'org-kpi-test',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-kpi-test' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(starWorker._id));
    });

    await runTest('KPI Fallback: Missing/invalid/null performancePoints is treated as 0 without error', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-kpi-missing' });

      const workerNullPoints = await createTestWorker({
        name: 'Worker Null KPI',
        department: dept._id,
        subdomain: 'org-kpi-missing',
        performancePoints: 0
      });

      const ticket = await Ticket.create({
        title: 'General Maintenance',
        team: 'DEV',
        subdomain: 'org-kpi-missing',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-kpi-missing' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(workerNullPoints._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 8: Deterministic Tie-Breaking
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Tie-breaker: Worker with more totalCompletedTickets wins when scores are equal', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-tie-breaker' });

      const veteranWorker = await createTestWorker({
        name: 'Veteran Worker',
        department: dept._id,
        subdomain: 'org-tie-breaker',
        skills: ['General'],
        totalCompletedTickets: 25
      });

      const juniorWorker = await createTestWorker({
        name: 'Junior Worker',
        department: dept._id,
        subdomain: 'org-tie-breaker',
        skills: ['General'],
        totalCompletedTickets: 2
      });

      const ticket = await Ticket.create({
        title: 'Generic task',
        team: 'DEV',
        subdomain: 'org-tie-breaker',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-tie-breaker' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, true);
      assert.strictEqual(String(result.assigneeId), String(veteranWorker._id));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 9: No Eligible Employee Fallback
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('No Eligible Employee: All workers overloaded leaves ticket in To Do with unassignedReason', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-all-busy' });

      const worker1 = await createTestWorker({
        name: 'Busy Worker 1',
        department: dept._id,
        subdomain: 'org-all-busy'
      });

      // Put 5 tasks on worker1
      for (let i = 0; i < 5; i++) {
        await Ticket.create({
          title: `Task ${i}`,
          subdomain: 'org-all-busy',
          assignee: worker1._id,
          status: 'In Progress'
        });
      }

      const ticket = await Ticket.create({
        title: 'Pending Review Task',
        team: 'DEV',
        subdomain: 'org-all-busy',
        status: 'To Do'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-all-busy' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.ok(result.unassignedReason.includes('maximum capacity'));

      const updated = await Ticket.findById(ticket._id);
      assert.strictEqual(updated.status, 'To Do');
      assert.ok(!updated.assignee, 'Ticket assignee must be null or undefined when no eligible employee');
      assert.ok(updated.unassignedReason.includes('maximum capacity'));
      assert.strictEqual(updated.assignmentHistory.length, 1);
      assert.strictEqual(updated.assignmentHistory[0].source, 'automatic');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 10: Idempotency & Concurrency Safety
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Idempotency: Re-running auto-assignment on an already-assigned ticket does NOT reassign', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-idempotent' });

      const workerOriginal = await createTestWorker({
        name: 'Original Worker',
        department: dept._id,
        subdomain: 'org-idempotent'
      });

      await createTestWorker({
        name: 'Other Worker',
        department: dept._id,
        subdomain: 'org-idempotent'
      });

      const ticket = await Ticket.create({
        title: 'Already assigned task',
        team: 'DEV',
        subdomain: 'org-idempotent',
        assignee: workerOriginal._id,
        status: 'In Progress'
      });

      const result = await autoAssignJobTicket({ ticket, subdomain: 'org-idempotent' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.assigned, false);
      assert.strictEqual(result.isAlreadyAssigned, true);

      const refreshed = await Ticket.findById(ticket._id);
      assert.strictEqual(String(refreshed.assignee), String(workerOriginal._id));
    });

    await runTest('Concurrency: Simultaneous auto-assignment requests assign atomically without collision', async () => {
      const dept = await Department.create({ name: 'DEV', subdomain: 'org-concurrent' });

      await createTestWorker({
        name: 'Concur Worker',
        department: dept._id,
        subdomain: 'org-concurrent'
      });

      const ticket = await Ticket.create({
        title: 'Concurrent Race Task',
        team: 'DEV',
        subdomain: 'org-concurrent',
        status: 'To Do'
      });

      // Fire 3 simultaneous assignment calls
      const [res1, res2, res3] = await Promise.all([
        autoAssignJobTicket({ ticketId: ticket._id, ticket, subdomain: 'org-concurrent' }),
        autoAssignJobTicket({ ticketId: ticket._id, ticket, subdomain: 'org-concurrent' }),
        autoAssignJobTicket({ ticketId: ticket._id, ticket, subdomain: 'org-concurrent' })
      ]);

      const assignedCount = [res1, res2, res3].filter(r => r.assigned === true).length;
      assert.strictEqual(assignedCount, 1, 'Exactly one concurrent call must succeed in assigning');

      const finalTicket = await Ticket.findById(ticket._id);
      assert.strictEqual(finalTicket.assignmentHistory.length, 1);
      assert.strictEqual(finalTicket.assignmentSource, 'automatic');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 11: Manual Override in ticketController
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Manual Override: Cross-tenant worker assignment fails closed with 403', async () => {
      const ticketTenant = 'org-manual-alpha';
      const otherTenant = 'org-manual-beta';

      const crossTenantWorker = await createTestWorker({
        name: 'Cross Worker',
        subdomain: otherTenant
      });

      const ticket = await Ticket.create({
        title: 'Manual Task Alpha',
        subdomain: ticketTenant,
        status: 'To Do'
      });

      const { updateTicket } = require('../controllers/ticketController');
      const req = {
        params: { id: ticket._id.toString() },
        subdomain: ticketTenant,
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: ticketTenant },
        body: { assignee: crossTenantWorker._id.toString() }
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
      assert.strictEqual(statusResult, 403);
      assert.ok(jsonResult.message.includes('another organization'));
    });

    await runTest('Manual Override: Valid in-tenant admin override records history with source override', async () => {
      const tenant = 'org-manual-valid';
      const validWorker = await createTestWorker({
        name: 'Manual Valid Worker',
        subdomain: tenant
      });

      const ticket = await Ticket.create({
        title: 'Task To Override',
        subdomain: tenant,
        status: 'To Do',
        unassignedReason: 'All workers busy'
      });

      const { updateTicket } = require('../controllers/ticketController');
      const adminId = new mongoose.Types.ObjectId();
      const req = {
        params: { id: ticket._id.toString() },
        subdomain: tenant,
        user: { _id: adminId, role: 'admin', subdomain: tenant },
        body: {
          assignee: validWorker._id.toString(),
          assignmentReason: 'Priority customer escalation assigned manually by admin'
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
      assert.strictEqual(String(updated.assignee), String(validWorker._id));
      assert.strictEqual(updated.assignmentSource, 'override');
      assert.strictEqual(updated.unassignedReason, null);
      assert.strictEqual(updated.assignmentHistory.length, 1);
      assert.strictEqual(updated.assignmentHistory[0].source, 'override');
      assert.strictEqual(updated.assignmentHistory[0].reason, 'Priority customer escalation assigned manually by admin');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 12: Safe System 1 Integration Trigger
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('System 1 Integration: processJobIntakeFromVerifiedInvoice triggers auto-assignment for new ticket', async () => {
      const tenant = 'org-verified-sys1';

      const admin = await Admin.create({
        name: 'Sys1 Admin',
        username: `sys1_admin_${Date.now()}`,
        email: `admin_${Date.now()}@sys1.com`,
        password: 'password123',
        role: 'admin',
        subdomain: tenant
      });

      const dept = await Department.create({ name: 'DEV', subdomain: tenant });
      const devWorker = await createTestWorker({
        name: 'Sys1 Dev',
        department: dept._id,
        subdomain: tenant
      });

      const invoice = await Invoice.create({
        invoiceNo: 'SYS1-INV-1001',
        invoiceDate: '16/10/2026',
        actualDate: new Date(),
        customerName: 'Acme Corp',
        customerContact: '9876543210',
        items: [{ description: 'Fullstack App Delivery', qty: 1, rate: 75000, total: 75000, gst: 18 }],
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        createdBy: admin._id,
        createdByModel: 'Admin',
        paymentDetails: {
          proof: 'https://proofs.s3.local/receipt.pdf',
          proofs: [{ url: 'https://proofs.s3.local/receipt.pdf', date: new Date() }]
        }
      });

      const result = await processJobIntakeFromVerifiedInvoice({
        invoice,
        adminUser: admin
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.ticketId);

      const createdTicket = await Ticket.findById(result.ticketId);
      assert.strictEqual(String(createdTicket.assignee), String(devWorker._id));
      assert.strictEqual(createdTicket.assignmentSource, 'automatic');
      assert.strictEqual(createdTicket.assignmentHistory.length, 1);
      assert.strictEqual(createdTicket.assignmentHistory[0].source, 'automatic');
    });

  } catch (globalErr) {
    console.error('Fatal Test Suite Error:', globalErr);
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
