/**
 * System Test Suite: Workspace Definition — Project Description Persistence & Integrity
 * 
 * Verifies:
 * 1. Creating a ticket/project with a description persists `description` in MongoDB.
 * 2. `getTickets` returns the canonical description loaded from the DB.
 * 3. `updateTicket` updates `description` and reloads the saved value.
 * 4. Updating `description` alone preserves existing checklist/subtasks without data loss.
 * 5. Clearing description updates the record cleanly so "No description available" is rendered without dummy data.
 * 6. Tenant isolation is enforced: Cross-tenant updates fail closed.
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
const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_workspace_desc_test';

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
console.log(' Tech Ciphergate — Workspace Definition Description Test Suite ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;

const Worker = require('../models/Worker');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const { createTicket, updateTicket, getTickets } = require('../controllers/ticketController');

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
    designation: overrides.designation || 'Full Stack Engineer'
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

function mockReq(body = {}, params = {}, user = {}, query = {}) {
  return {
    body,
    params,
    query,
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
    console.error(`✗ [FAIL] Test ${testCount}: ${testName}`);
    console.error(err);
    throw err;
  }
}

async function main() {
  await mongoose.connect(LOCAL_STAGING_URI);
  await mongoose.connection.dropDatabase();

  try {
    const adminAlpha = await createTestAdmin({ subdomain: 'tenant-alpha' });
    const devWorker = await createTestWorker({ subdomain: 'tenant-alpha' });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: createTicket persists description to database
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('createTicket stores description in Ticket model and returns it', async () => {
      const req = mockReq({
        title: 'Alpha Project Portal',
        description: 'Comprehensive client portal with real-time analytics and invoice generation.',
        assignee: devWorker._id.toString(),
        assignees: [devWorker._id.toString()],
        subdomain: 'tenant-alpha',
        priority: 'High'
      }, {}, adminAlpha);
      const res = mockRes();

      await createTicket(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.data._id);
      assert.strictEqual(res.data.description, 'Comprehensive client portal with real-time analytics and invoice generation.');

      // Verify directly from MongoDB
      const dbTicket = await Ticket.findById(res.data._id).lean();
      assert.strictEqual(dbTicket.description, 'Comprehensive client portal with real-time analytics and invoice generation.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: getTickets returns description for frontend state loading
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('getTickets loads canonical description from database', async () => {
      const req = mockReq({}, {}, adminAlpha, { subdomain: 'tenant-alpha' });
      const res = mockRes();

      await getTickets(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      const found = res.data.find(t => t.title === 'Alpha Project Portal');
      assert.ok(found);
      assert.strictEqual(found.description, 'Comprehensive client portal with real-time analytics and invoice generation.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: updateTicket updates description and reloads saved value
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('updateTicket updates description and persists change to MongoDB', async () => {
      const ticket = await Ticket.create({
        title: 'Website Redesign',
        description: 'Initial scope: landing page only.',
        assignee: devWorker._id,
        assignees: [devWorker._id],
        subdomain: 'tenant-alpha'
      });

      const updatedDescription = 'Expanded scope: Full responsive website with CMS integration, SEO optimization, and blog.';
      const req = mockReq({
        description: updatedDescription,
        subdomain: 'tenant-alpha'
      }, { id: ticket._id.toString() }, adminAlpha);
      const res = mockRes();

      await updateTicket(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.description, updatedDescription);

      const dbTicket = await Ticket.findById(ticket._id).lean();
      assert.strictEqual(dbTicket.description, updatedDescription);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: updateTicket preserves subtasks when description updated without markdown bullets
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('updateTicket preserves existing checklist items when description is updated', async () => {
      const ticket = await Ticket.create({
        title: 'Mobile App API',
        description: 'Original brief',
        checklist: [
          { text: 'Design auth flow', completed: true },
          { text: 'Implement JWT refresh tokens', completed: false },
          { text: 'Setup rate limiting', completed: false }
        ],
        assignee: devWorker._id,
        subdomain: 'tenant-alpha'
      });

      const req = mockReq({
        description: 'Updated brief with additional security guidelines for mobile OAuth.',
        subdomain: 'tenant-alpha'
      }, { id: ticket._id.toString() }, adminAlpha);
      const res = mockRes();

      await updateTicket(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.description, 'Updated brief with additional security guidelines for mobile OAuth.');

      const dbTicket = await Ticket.findById(ticket._id).lean();
      assert.strictEqual(dbTicket.checklist.length, 3);
      assert.strictEqual(dbTicket.checklist[0].text, 'Design auth flow');
      assert.strictEqual(dbTicket.checklist[0].completed, true);
      assert.strictEqual(dbTicket.checklist[1].text, 'Implement JWT refresh tokens');
      assert.strictEqual(dbTicket.checklist[2].text, 'Setup rate limiting');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Empty description handled cleanly ("No description available")
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Ticket with no description returns null/empty without dummy data substitution', async () => {
      const ticket = await Ticket.create({
        title: 'No Description Task',
        assignee: devWorker._id,
        subdomain: 'tenant-alpha'
      });

      const dbTicket = await Ticket.findById(ticket._id).lean();
      assert.ok(!dbTicket.description || dbTicket.description === '');

      // Clearing description
      const req = mockReq({
        description: '',
        subdomain: 'tenant-alpha'
      }, { id: ticket._id.toString() }, adminAlpha);
      const res = mockRes();

      await updateTicket(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.description, '');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Tenant isolation for ticket updates
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Tenant isolation: Admin cannot update ticket from another tenant', async () => {
      const betaTicket = await Ticket.create({
        title: 'Beta Tenant Task',
        description: 'Beta secret specifications',
        subdomain: 'tenant-beta'
      });

      const req = mockReq({
        description: 'Malicious cross-tenant override',
        subdomain: 'tenant-alpha'
      }, { id: betaTicket._id.toString() }, adminAlpha);
      const res = mockRes();

      await updateTicket(req, res);

      assert.strictEqual(res.statusCode, 403);

      const checkTicket = await Ticket.findById(betaTicket._id).lean();
      assert.strictEqual(checkTicket.description, 'Beta secret specifications');
    });

    console.log('\n================================================================');
    console.log(` Workspace Definition Description Summary: Total: ${testCount} | Passed: ${passCount} | Failed: 0`);
    console.log('================================================================\n');

  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
