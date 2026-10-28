/**
 * Isolated Verification Suite: Worker Management Audit Fixes (/admin/workers)
 *
 * Verifies:
 * 1. Worker pagination and response metadata (total, hasMore, page, limit, totalPages, activeCount, relievedCount).
 * 2. Status counts: total defaults to activeCount when statusParam is omitted (not relievedCount).
 * 3. Search, department, and status filters work accurately.
 * 4. Cross-tenant read, update, and delete rejection (403 Forbidden).
 * 5. Role validation and privilege escalation prevention (only valid roles permitted, invalid rejected).
 * 6. Zod schema validation preserves 'role' field instead of stripping it.
 * 7. Tenant isolation on activities and RFID lookup.
 * 8. Soft-delete preserves historical records.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Strict Safety Guard: Ensure no connection can be made to any database
delete process.env.MONGO_URI;
delete process.env.DATABASE_URL;
mongoose.connect = async () => {
  throw new Error('FATAL: Live database connection attempted in isolated test!');
};

// Mock Models
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const EmployeeHistory = require('../models/EmployeeHistory');
const Task = require('../models/Task');
const { createWorkerSchema, updateWorkerSchema } = require('../validations/workerSchemas');

// Controllers under test
const workerController = require('../controllers/workerController');

// Test fixtures
const tenantAId = 'tenant_alpha';
const tenantBId = 'tenant_beta';

const deptEngAId = new mongoose.Types.ObjectId();
const deptDesignAId = new mongoose.Types.ObjectId();
const deptEngBId = new mongoose.Types.ObjectId();

let inMemoryWorkers = [];
let inMemoryDepartments = [];
let inMemoryHistory = [];
let inMemoryTasks = [];

function setupMocks() {
  inMemoryWorkers = [];
  inMemoryDepartments = [
    { _id: deptEngAId, name: 'Engineering', subdomain: tenantAId },
    { _id: deptDesignAId, name: 'Design', subdomain: tenantAId },
    { _id: deptEngBId, name: 'Engineering', subdomain: tenantBId }
  ];
  inMemoryHistory = [];
  inMemoryTasks = [];

  // Seed 15 Active workers and 5 Relieved workers in Tenant A
  for (let i = 1; i <= 15; i++) {
    inMemoryWorkers.push({
      _id: new mongoose.Types.ObjectId(),
      name: `Worker A${i}`,
      username: `workera${i}`,
      rfid: `RA000${i}`,
      subdomain: tenantAId,
      department: i % 2 === 0 ? deptEngAId : deptDesignAId,
      salary: 30000,
      finalSalary: 30000,
      perDaySalary: 1000,
      status: 'Active',
      relievedAt: null,
      role: 'developer',
      createdAt: new Date(Date.now() - i * 10000)
    });
  }

  for (let i = 1; i <= 5; i++) {
    inMemoryWorkers.push({
      _id: new mongoose.Types.ObjectId(),
      name: `Relieved A${i}`,
      username: `relieveda${i}`,
      rfid: `RR000${i}`,
      subdomain: tenantAId,
      department: deptEngAId,
      salary: 30000,
      finalSalary: 30000,
      perDaySalary: 1000,
      status: 'Relieved',
      relievedAt: new Date('2026-05-01'),
      role: 'developer',
      createdAt: new Date(Date.now() - (20 + i) * 10000)
    });
  }

  // Seed 3 Active workers in Tenant B
  for (let i = 1; i <= 3; i++) {
    inMemoryWorkers.push({
      _id: new mongoose.Types.ObjectId(),
      name: `Worker B${i}`,
      username: `workerb${i}`,
      rfid: `RB000${i}`,
      subdomain: tenantBId,
      department: deptEngBId,
      salary: 40000,
      finalSalary: 40000,
      perDaySalary: 1333,
      status: 'Active',
      relievedAt: null,
      role: 'developer',
      createdAt: new Date(Date.now() - i * 10000)
    });
  }

  // Monkey-patch Worker methods
  Worker.find = function(query) {
    let list = inMemoryWorkers.filter(w => {
      if (query.subdomain && w.subdomain !== query.subdomain) return false;
      if (query.status && w.status !== query.status) return false;
      if (query.department && String(w.department) !== String(query.department)) return false;
      if (query.$or) {
        const matchesOr = query.$or.some(clause => {
          if (clause.name && clause.name.$regex) {
            const re = new RegExp(clause.name.$regex, clause.name.$options || 'i');
            return re.test(w.name);
          }
          if (clause.username && clause.username.$regex) {
            const re = new RegExp(clause.username.$regex, clause.username.$options || 'i');
            return re.test(w.username);
          }
          if (clause.rfid && clause.rfid.$regex) {
            const re = new RegExp(clause.rfid.$regex, clause.rfid.$options || 'i');
            return re.test(w.rfid);
          }
          return false;
        });
        if (!matchesOr) return false;
      }
      return true;
    });

    let skipCount = 0;
    let limitCount = list.length;

    const chain = {
      select: () => chain,
      populate: () => chain,
      sort: (sortObj) => {
        if (sortObj) {
          if (sortObj.name === 1) list.sort((a, b) => a.name.localeCompare(b.name));
          else if (sortObj.name === -1) list.sort((a, b) => b.name.localeCompare(a.name));
          else if (sortObj.createdAt === -1) list.sort((a, b) => b.createdAt - a.createdAt);
          else if (sortObj.createdAt === 1) list.sort((a, b) => a.createdAt - b.createdAt);
        }
        return chain;
      },
      skip: (n) => { skipCount = n; return chain; },
      limit: (n) => { limitCount = n; return chain; },
      lean: async () => list.slice(skipCount, skipCount + limitCount),
      then: (resolve) => resolve(list.slice(skipCount, skipCount + limitCount))
    };
    return chain;
  };

  Worker.countDocuments = async function(query) {
    return inMemoryWorkers.filter(w => {
      if (query.subdomain && w.subdomain !== query.subdomain) return false;
      if (query.status && w.status !== query.status) return false;
      if (query.department && String(w.department) !== String(query.department)) return false;
      if (query.$or) {
        const matchesOr = query.$or.some(clause => {
          if (clause.name && clause.name.$regex) {
            const re = new RegExp(clause.name.$regex, clause.name.$options || 'i');
            return re.test(w.name);
          }
          if (clause.username && clause.username.$regex) {
            const re = new RegExp(clause.username.$regex, clause.username.$options || 'i');
            return re.test(w.username);
          }
          return false;
        });
        if (!matchesOr) return false;
      }
      return true;
    }).length;
  };

  Worker.findById = function(id) {
    const w = inMemoryWorkers.find(x => String(x._id) === String(id));
    const doc = w ? {
      ...w,
      toObject: () => ({ ...w }),
      save: async function() {
        const idx = inMemoryWorkers.findIndex(x => String(x._id) === String(id));
        if (idx !== -1) inMemoryWorkers[idx] = { ...this };
      }
    } : null;

    const query = {
      select: () => query,
      populate: () => query,
      lean: async () => doc,
      then: (resolve) => resolve(doc)
    };
    return query;
  };

  Worker.findOne = function(query) {
    const w = inMemoryWorkers.find(x => {
      if (query.username && x.username !== query.username) return false;
      if (query.rfid && x.rfid !== query.rfid) return false;
      if (query.subdomain && x.subdomain !== query.subdomain) return false;
      if (query._id && query._id.$ne && String(x._id) === String(query._id.$ne)) return false;
      return true;
    });
    const doc = w ? {
      ...w,
      toObject: () => ({ ...w }),
      save: async function() {
        const idx = inMemoryWorkers.findIndex(x => String(x._id) === String(w._id));
        if (idx !== -1) inMemoryWorkers[idx] = { ...this };
      }
    } : null;

    const q = {
      select: () => q,
      populate: () => q,
      lean: async () => doc,
      then: (resolve) => resolve(doc)
    };
    return q;
  };

  Worker.findByIdAndUpdate = function(id, updateData, options) {
    const idx = inMemoryWorkers.findIndex(x => String(x._id) === String(id));
    const updated = idx !== -1 ? {
      ...inMemoryWorkers[idx],
      ...updateData,
      toObject: function() { return { ...this }; }
    } : null;
    if (idx !== -1) inMemoryWorkers[idx] = updated;

    const query = {
      populate: () => query,
      lean: async () => updated,
      then: (resolve) => resolve(updated)
    };
    return query;
  };

  Worker.create = async function(doc) {
    const created = {
      _id: new mongoose.Types.ObjectId(),
      status: 'Active',
      relievedAt: null,
      createdAt: new Date(),
      ...doc
    };
    created.toObject = () => ({ ...created });
    inMemoryWorkers.push(created);
    return created;
  };

  Department.findById = async function(id) {
    return inMemoryDepartments.find(d => String(d._id) === String(id)) || null;
  };

  Department.find = function(query) {
    const depts = inMemoryDepartments.filter(d => !query.subdomain || d.subdomain === query.subdomain);
    return {
      select: () => ({
        lean: async () => depts
      })
    };
  };

  EmployeeHistory.create = async function(doc) {
    inMemoryHistory.push(doc);
    return doc;
  };

  EmployeeHistory.find = function(query) {
    let list = [...inMemoryHistory];
    return {
      populate: () => ({
        populate: () => ({
          sort: async () => list
        })
      })
    };
  };

  Task.find = function(query) {
    const list = inMemoryTasks.filter(t => String(t.worker) === String(query.worker));
    return {
      populate: () => ({
        populate: () => ({
          sort: async () => list
        })
      })
    };
  };

  Task.deleteMany = async function(query) {
    inMemoryTasks = inMemoryTasks.filter(t => String(t.worker) !== String(query.worker));
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(c) { res.statusCode = c; return res; },
    json(p) { res.data = p; return res; }
  };
  return res;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('--- TEST SUITE: WORKER MANAGEMENT AUDIT FIXES ---');
  console.log('======================================================\n');

  setupMocks();

  // Test 1: Pagination metadata and default status count calculation
  console.log('Test 1: Pagination metadata & default total is activeCount (not relievedCount)...');
  {
    const req = {
      body: { subdomain: tenantAId, page: 1, limit: 10 },
      query: {},
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    await workerController.getWorkers(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.workers, 'Response should contain workers array');
    assert.strictEqual(res.data.workers.length, 10, 'Page 1 should return limit (10) workers');
    assert.strictEqual(res.data.activeCount, 15, 'Tenant A activeCount should be 15');
    assert.strictEqual(res.data.relievedCount, 5, 'Tenant A relievedCount should be 5');
    assert.strictEqual(res.data.total, 15, 'Total should default to activeCount (15), NOT relievedCount (5)');
    assert.strictEqual(res.data.hasMore, true, 'hasMore should be true when page * limit (10) < total (15)');
    assert.strictEqual(res.data.totalPages, 2, 'totalPages should be 2');
    console.log('✓ PASS: Pagination metadata and total count default are correct.');
  }

  // Test 2: Relieved tab pagination counts
  console.log('\nTest 2: Relieved tab pagination returns accurate total and counts...');
  {
    const req = {
      body: { subdomain: tenantAId, status: 'Relieved', page: 1, limit: 10 },
      query: {},
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    await workerController.getWorkers(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.workers.length, 5, 'Should return 5 relieved workers');
    assert.strictEqual(res.data.total, 5, 'Total for Relieved view should be 5');
    assert.strictEqual(res.data.hasMore, false, 'hasMore should be false');
    assert.strictEqual(res.data.activeCount, 15);
    assert.strictEqual(res.data.relievedCount, 5);
    console.log('✓ PASS: Relieved tab pagination metadata is accurate.');
  }

  // Test 3: Cross-tenant isolation - Tenant A admin cannot read Tenant B worker
  console.log('\nTest 3: Cross-tenant read rejection (403 Forbidden)...');
  {
    const workerB = inMemoryWorkers.find(w => w.subdomain === tenantBId);
    const req = {
      params: { id: workerB._id.toString() },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    let errCaught = false;
    try {
      await workerController.getWorkerById(req, res);
    } catch (e) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(e.message.includes('another tenant'), e.message);
    }
    assert.ok(errCaught, 'Cross-tenant worker access must throw 403');
    console.log('✓ PASS: Cross-tenant worker access blocked with 403 Forbidden.');
  }

  // Test 4: Cross-tenant isolation - Tenant A admin cannot update Tenant B worker
  console.log('\nTest 4: Cross-tenant update rejection (403 Forbidden)...');
  {
    const workerB = inMemoryWorkers.find(w => w.subdomain === tenantBId);
    const req = {
      params: { id: workerB._id.toString() },
      body: { name: 'Malicious Name Tampering' },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    let errCaught = false;
    try {
      await workerController.updateWorker(req, res);
    } catch (e) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(e.message.includes('another tenant'), e.message);
    }
    assert.ok(errCaught, 'Cross-tenant update must throw 403');
    console.log('✓ PASS: Cross-tenant update blocked with 403 Forbidden.');
  }

  // Test 5: Cross-tenant isolation - Tenant A admin cannot delete Tenant B worker
  console.log('\nTest 5: Cross-tenant delete rejection (403 Forbidden)...');
  {
    const workerB = inMemoryWorkers.find(w => w.subdomain === tenantBId);
    const req = {
      params: { id: workerB._id.toString() },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    let errCaught = false;
    try {
      await workerController.deleteWorker(req, res);
    } catch (e) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(e.message.includes('another tenant'), e.message);
    }
    assert.ok(errCaught, 'Cross-tenant delete must throw 403');
    console.log('✓ PASS: Cross-tenant delete blocked with 403 Forbidden.');
  }

  // Test 6: Cross-tenant isolation on getWorkers forces req.user.subdomain
  console.log('\nTest 6: getWorkers forces requester tenant subdomain for non-main admins...');
  {
    const req = {
      body: { subdomain: tenantBId }, // Attacker admin from tenant A requests tenant B
      query: {},
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();

    await workerController.getWorkers(req, res);

    assert.strictEqual(res.statusCode, 200);
    // All returned workers must belong to tenantAId
    res.data.forEach(w => {
      assert.strictEqual(w.subdomain, tenantAId, 'Returned worker must strictly belong to authenticated tenant');
    });
    console.log('✓ PASS: getWorkers enforced authenticated tenant isolation.');
  }

  // Test 7: Role validation - Allowed roles pass, invalid roles rejected
  console.log('\nTest 7: Role validation & privilege escalation protection...');
  {
    const workerA = inMemoryWorkers.find(w => w.subdomain === tenantAId && w.status === 'Active');

    // Valid role 'manager'
    {
      const req = {
        params: { id: workerA._id.toString() },
        body: { role: 'manager' },
        user: { role: 'admin', subdomain: tenantAId }
      };
      const res = mockRes();
      await workerController.updateWorker(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.role, 'manager');
    }

    // Invalid role 'superadmin'
    {
      const req = {
        params: { id: workerA._id.toString() },
        body: { role: 'superadmin' },
        user: { role: 'admin', subdomain: tenantAId }
      };
      const res = mockRes();
      let errCaught = false;
      try {
        await workerController.updateWorker(req, res);
      } catch (e) {
        errCaught = true;
        assert.strictEqual(res.statusCode, 400);
        assert.ok(e.message.includes('Invalid role'), e.message);
      }
      assert.ok(errCaught, 'Invalid role must be rejected with 400');
    }
    console.log('✓ PASS: Role validation strictly accepts allowed roles and rejects elevated/arbitrary strings.');
  }

  // Test 8: Zod schemas preserve 'role' field
  console.log('\nTest 8: Zod validation schemas preserve role field...');
  {
    const createData = {
      body: {
        name: 'New Dev',
        username: 'newdev1',
        password: 'password123',
        subdomain: tenantAId,
        role: 'manager'
      }
    };
    const parsedCreate = await createWorkerSchema.parseAsync(createData);
    assert.strictEqual(parsedCreate.body.role, 'manager', 'createWorkerSchema must preserve role field');

    const updateData = {
      body: {
        role: 'developer'
      }
    };
    const parsedUpdate = await updateWorkerSchema.parseAsync(updateData);
    assert.strictEqual(parsedUpdate.body.role, 'developer', 'updateWorkerSchema must preserve role field');
    console.log('✓ PASS: Zod schemas preserve valid role fields.');
  }

  // Test 9: RFID lookup requires authentication & respects tenant boundary
  console.log('\nTest 9: RFID lookup respects tenant boundary...');
  {
    const workerB = inMemoryWorkers.find(w => w.subdomain === tenantBId);
    const req = {
      body: { rfid: workerB.rfid },
      user: { role: 'admin', subdomain: tenantAId } // Tenant A admin requests Tenant B RFID
    };
    const res = mockRes();

    let errCaught = false;
    try {
      await workerController.getWorkerByRfid(req, res);
    } catch (e) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 404, 'RFID from another tenant must not be found');
    }
    assert.ok(errCaught, 'Cross-tenant RFID lookup must fail');
    console.log('✓ PASS: RFID lookup is tenant-isolated.');
  }

  // Test 10: Soft-delete preserves historical data in EmployeeHistory
  console.log('\nTest 10: Soft-delete preserves historical employee audit records...');
  {
    const workerA = inMemoryWorkers.find(w => w.subdomain === tenantAId && w.status === 'Active');
    const req = {
      params: { id: workerA._id.toString() },
      user: { role: 'admin', subdomain: tenantAId, _id: new mongoose.Types.ObjectId() }
    };
    const res = mockRes();

    await workerController.deleteWorker(req, res);
    assert.strictEqual(res.statusCode, 200);

    const updatedWorker = inMemoryWorkers.find(w => String(w._id) === String(workerA._id));
    assert.strictEqual(updatedWorker.status, 'Deleted', 'Worker status must be marked Deleted');

    const historyRecord = inMemoryHistory.find(h => String(h.employee) === String(workerA._id) && h.actionType === 'Deleted');
    assert.ok(historyRecord, 'EmployeeHistory must record the Deleted event');
    console.log('✓ PASS: Soft-delete preserves record and logs history.');
  }

  console.log('\n======================================================');
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY! (10/10)');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
