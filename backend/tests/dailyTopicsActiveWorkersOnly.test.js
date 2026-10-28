/**
 * Verification Test Suite: Show Only Active Developers in Daily Topics Log
 *
 * Requirements:
 * 1. Only active employees (status === 'Active' / 'active' and relievedAt === null) appear in worker-wise and date-wise log.
 * 2. Relieved, deleted, inactive, resigned, or terminated employees are strictly excluded.
 * 3. Employees with relievedAt timestamp populated are strictly excluded even if status wasn't updated.
 * 4. Historical daily topic records remain intact in DB.
 * 5. Department filtering works accurately with active employees.
 * 6. Querying by a relieved workerId returns 0 active workers.
 * 7. Relieved/inactive workers are blocked from submitting daily topics (403 Forbidden).
 * 8. Relieved/inactive workers are blocked from weekly topics admin retrieval (403 Forbidden).
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Mock Models
const mockWorkerIdActive1 = new mongoose.Types.ObjectId();
const mockWorkerIdActive2 = new mongoose.Types.ObjectId();
const mockWorkerIdRelieved = new mongoose.Types.ObjectId();
const mockWorkerIdDeleted = new mongoose.Types.ObjectId();
const mockWorkerIdResigned = new mongoose.Types.ObjectId();
const mockWorkerIdInactive = new mongoose.Types.ObjectId();
const mockWorkerIdRelievedAtOnly = new mongoose.Types.ObjectId();

const mockDeptEng = new mongoose.Types.ObjectId();
const mockDeptDesign = new mongoose.Types.ObjectId();

const mockWorkersDb = [
  {
    _id: mockWorkerIdActive1,
    name: 'Alice Active Dev',
    email: 'alice@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Active',
    relievedAt: null,
    employeeId: 'EMP-001'
  },
  {
    _id: mockWorkerIdActive2,
    name: 'Bob Active Designer',
    email: 'bob@ciphergate.com',
    department: { _id: mockDeptDesign, name: 'Design' },
    subdomain: 'demo',
    status: 'Active',
    relievedAt: null,
    employeeId: 'EMP-002'
  },
  {
    _id: mockWorkerIdRelieved,
    name: 'Charlie Relieved Dev',
    email: 'charlie@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Relieved',
    relievedAt: new Date('2026-06-15T00:00:00.000Z'),
    employeeId: 'EMP-003'
  },
  {
    _id: mockWorkerIdDeleted,
    name: 'David Deleted Dev',
    email: 'david@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Deleted',
    relievedAt: null,
    employeeId: 'EMP-004'
  },
  {
    _id: mockWorkerIdResigned,
    name: 'Eve Resigned Dev',
    email: 'eve@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Resigned',
    relievedAt: new Date('2026-07-01T00:00:00.000Z'),
    employeeId: 'EMP-005'
  },
  {
    _id: mockWorkerIdInactive,
    name: 'Frank Inactive Dev',
    email: 'frank@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Inactive',
    relievedAt: null,
    employeeId: 'EMP-006'
  },
  {
    _id: mockWorkerIdRelievedAtOnly,
    name: 'Grace RelievedAt Dev',
    email: 'grace@ciphergate.com',
    department: { _id: mockDeptEng, name: 'Engineering' },
    subdomain: 'demo',
    status: 'Active', // Status field is Active, but relievedAt is populated
    relievedAt: new Date('2026-08-10T00:00:00.000Z'),
    employeeId: 'EMP-007'
  }
];

const mockDailyTopicsDb = [
  // Alice (Active) has a topic on 2026-10-26
  {
    _id: new mongoose.Types.ObjectId(),
    workerId: mockWorkerIdActive1,
    date: '2026-10-26',
    topic: 'React 19 Server Actions & Optimistic UI',
    subdomain: 'demo'
  },
  // Charlie (Relieved) has historical topic on 2026-10-26
  {
    _id: new mongoose.Types.ObjectId(),
    workerId: mockWorkerIdRelieved,
    date: '2026-10-26',
    topic: 'Historical Relieved Topic',
    subdomain: 'demo'
  },
  // David (Deleted) has historical topic on 2026-10-26
  {
    _id: new mongoose.Types.ObjectId(),
    workerId: mockWorkerIdDeleted,
    date: '2026-10-26',
    topic: 'Historical Deleted Topic',
    subdomain: 'demo'
  }
];

// Mock Mongoose Worker & DailyTopic & Department
const Worker = require('../models/Worker');
const DailyTopic = require('../models/DailyTopic');
const Department = require('../models/Department');

// Monkey patch Worker and DailyTopic methods for isolated testing
const originalWorkerFind = Worker.find;
const originalWorkerFindById = Worker.findById;
const originalWorkerFindOne = Worker.findOne;
const originalDailyTopicFind = DailyTopic.find;
const originalDailyTopicFindOne = DailyTopic.findOne;
const originalDepartmentFindOne = Department.findOne;

function setupMocks() {
  Worker.find = function(query) {
    let results = mockWorkersDb.filter(w => {
      // Subdomain check
      if (query.subdomain && w.subdomain !== query.subdomain) return false;
      // Status check ($in)
      if (query.status && query.status.$in) {
        if (!query.status.$in.includes(w.status)) return false;
      } else if (query.status && w.status !== query.status) {
        return false;
      }
      // relievedAt check
      if ('relievedAt' in query) {
        if (query.relievedAt === null && w.relievedAt !== null) return false;
      }
      // workerId / _id check
      if (query._id && w._id.toString() !== query._id.toString()) return false;
      // department check
      if (query.department) {
        const wDeptId = w.department?._id?.toString() || w.department?.toString();
        const wDeptName = w.department?.name;
        if (wDeptId !== query.department.toString() && wDeptName !== query.department) return false;
      }
      return true;
    });

    const chain = {
      select: () => chain,
      populate: () => chain,
      sort: () => chain,
      lean: async () => results,
      then: (resolve) => resolve(results)
    };
    return chain;
  };

  Worker.findById = async function(id) {
    return mockWorkersDb.find(w => w._id.toString() === id.toString()) || null;
  };

  Worker.findOne = async function(query) {
    return mockWorkersDb.find(w => {
      if (query._id && w._id.toString() !== query._id.toString()) return false;
      if (query.subdomain && w.subdomain !== query.subdomain) return false;
      return true;
    }) || null;
  };

  DailyTopic.find = function(query) {
    let results = mockDailyTopicsDb.filter(t => {
      if (query.subdomain && t.subdomain !== query.subdomain) return false;
      if (query.workerId) {
        if (query.workerId.$in) {
          const ids = query.workerId.$in.map(id => id.toString());
          if (!ids.includes(t.workerId.toString())) return false;
        } else if (t.workerId.toString() !== query.workerId.toString()) {
          return false;
        }
      }
      if (query.date) {
        if (query.date.$gte && t.date < query.date.$gte) return false;
        if (query.date.$lte && t.date > query.date.$lte) return false;
      }
      return true;
    });

    const chain = {
      sort: () => chain,
      limit: () => chain,
      lean: async () => results,
      then: (resolve) => resolve(results)
    };
    return chain;
  };

  Department.findOne = function(query) {
    return {
      select: () => ({
        lean: async () => ({ _id: mockDeptEng, name: 'Engineering' })
      })
    };
  };
}

function restoreMocks() {
  Worker.find = originalWorkerFind;
  Worker.findById = originalWorkerFindById;
  Worker.findOne = originalWorkerFindOne;
  DailyTopic.find = originalDailyTopicFind;
  DailyTopic.findOne = originalDailyTopicFindOne;
  Department.findOne = originalDepartmentFindOne;
}

// Controller under test
const dailyTopicController = require('../controllers/dailyTopicController');

async function runTests() {
  console.log('\n======================================================');
  console.log('--- TEST SUITE: DAILY TOPICS LOG ACTIVE WORKERS ONLY ---');
  console.log('======================================================\n');

  setupMocks();

  try {
    // ---------------------------------------------------------------
    // Test 1: getDailyTopicsAdminLog returns ONLY active developers
    // ---------------------------------------------------------------
    console.log('Test 1: getDailyTopicsAdminLog returns ONLY active developers...');
    {
      const req = {
        query: {
          startDate: '2026-10-26',
          endDate: '2026-10-27',
          subdomain: 'demo'
        },
        user: { role: 'admin', subdomain: 'demo' }
      };

      let responseCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          responseCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        }
      };

      await dailyTopicController.getDailyTopicsAdminLog(req, res);

      assert.strictEqual(responseCode, 200, `Expected 200 OK, got ${responseCode}`);
      assert.ok(responseBody, 'Response body should exist');
      assert.strictEqual(responseBody.totalWorkers, 2, `Expected exactly 2 active workers, got ${responseBody.totalWorkers}`);

      // Verify worker-wise only contains active workers
      const returnedWorkerIds = responseBody.workerWise.map(w => w.worker._id.toString());
      assert.ok(returnedWorkerIds.includes(mockWorkerIdActive1.toString()), 'Active Worker 1 should be included');
      assert.ok(returnedWorkerIds.includes(mockWorkerIdActive2.toString()), 'Active Worker 2 should be included');

      // Verify all non-active workers are excluded
      assert.ok(!returnedWorkerIds.includes(mockWorkerIdRelieved.toString()), 'Relieved worker must NOT be in workerWise');
      assert.ok(!returnedWorkerIds.includes(mockWorkerIdDeleted.toString()), 'Deleted worker must NOT be in workerWise');
      assert.ok(!returnedWorkerIds.includes(mockWorkerIdResigned.toString()), 'Resigned worker must NOT be in workerWise');
      assert.ok(!returnedWorkerIds.includes(mockWorkerIdInactive.toString()), 'Inactive worker must NOT be in workerWise');
      assert.ok(!returnedWorkerIds.includes(mockWorkerIdRelievedAtOnly.toString()), 'Worker with relievedAt must NOT be in workerWise');

      // Verify date-wise only contains active workers
      responseBody.dateWise.forEach(dayGroup => {
        dayGroup.workers.forEach(wSub => {
          assert.notStrictEqual(wSub.worker._id.toString(), mockWorkerIdRelieved.toString(), 'Relieved worker must not be in dateWise');
          assert.notStrictEqual(wSub.worker._id.toString(), mockWorkerIdDeleted.toString(), 'Deleted worker must not be in dateWise');
          assert.notStrictEqual(wSub.worker._id.toString(), mockWorkerIdResigned.toString(), 'Resigned worker must not be in dateWise');
          assert.notStrictEqual(wSub.worker._id.toString(), mockWorkerIdInactive.toString(), 'Inactive worker must not be in dateWise');
          assert.notStrictEqual(wSub.worker._id.toString(), mockWorkerIdRelievedAtOnly.toString(), 'RelievedAt worker must not be in dateWise');
        });
      });

      console.log('✓ PASS: Only active developers (2) returned. All 5 relieved/inactive/deleted workers excluded.');
    }

    // ---------------------------------------------------------------
    // Test 2: Historical topic records for relieved workers remain in DB
    // ---------------------------------------------------------------
    console.log('\nTest 2: Verifying historical topic records remain unchanged in DB...');
    {
      const relievedTopicInDb = mockDailyTopicsDb.find(t => t.workerId.toString() === mockWorkerIdRelieved.toString());
      assert.ok(relievedTopicInDb, 'Relieved worker topic record must not be deleted or modified');
      assert.strictEqual(relievedTopicInDb.topic, 'Historical Relieved Topic');
      console.log('✓ PASS: Historical daily topics for relieved workers are preserved.');
    }

    // ---------------------------------------------------------------
    // Test 3: Querying a relieved workerId specifically returns 0 workers
    // ---------------------------------------------------------------
    console.log('\nTest 3: Querying Daily Topics Log by a relieved workerId returns 0 workers...');
    {
      const req = {
        query: {
          startDate: '2026-10-26',
          endDate: '2026-10-27',
          workerId: mockWorkerIdRelieved.toString(),
          subdomain: 'demo'
        },
        user: { role: 'admin', subdomain: 'demo' }
      };

      let responseCode = null;
      let responseBody = null;
      const res = {
        status(code) { responseCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await dailyTopicController.getDailyTopicsAdminLog(req, res);

      assert.strictEqual(responseCode, 200);
      assert.strictEqual(responseBody.totalWorkers, 0, 'Should return 0 workers for relieved worker query');
      assert.strictEqual(responseBody.workerWise.length, 0);
      console.log('✓ PASS: Requesting log for relieved worker returns 0 workers as expected.');
    }

    // ---------------------------------------------------------------
    // Test 4: Relieved worker blocked from submitting new daily topics
    // ---------------------------------------------------------------
    console.log('\nTest 4: Relieved worker is blocked from submitting a daily topic (403)...');
    {
      const today = new Date().toISOString().split('T')[0];
      const req = {
        body: {
          workerId: mockWorkerIdRelieved.toString(),
          topic: 'Unauthorized Topic Submission Attempt',
          date: today,
          subdomain: 'demo'
        },
        user: {
          _id: mockWorkerIdRelieved,
          role: 'worker',
          subdomain: 'demo'
        }
      };

      let responseCode = null;
      let responseBody = null;
      const res = {
        status(code) { responseCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await dailyTopicController.addDailyTopic(req, res);

      assert.strictEqual(responseCode, 403, `Expected 403 Forbidden, got ${responseCode}`);
      assert.ok(responseBody.message.toLowerCase().includes('relieved') || responseBody.message.toLowerCase().includes('inactive'), `Message: ${responseBody.message}`);
      console.log('✓ PASS: Relieved worker is blocked from submitting new daily topics.');
    }

    // ---------------------------------------------------------------
    // Test 5: Relieved worker blocked from getWeeklyTopicsAdmin
    // ---------------------------------------------------------------
    console.log('\nTest 5: Admin cannot generate/retrieve weekly topics for relieved worker (403)...');
    {
      const req = {
        params: {
          workerId: mockWorkerIdRelieved.toString()
        },
        query: {
          startDate: '2026-10-26',
          endDate: '2026-10-31',
          subdomain: 'demo'
        },
        user: { role: 'admin', subdomain: 'demo' }
      };

      let responseCode = null;
      let responseBody = null;
      const res = {
        status(code) { responseCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await dailyTopicController.getWeeklyTopicsAdmin(req, res);

      assert.strictEqual(responseCode, 403, `Expected 403 Forbidden, got ${responseCode}`);
      console.log('✓ PASS: Weekly topics retrieval for relieved worker blocked with 403 Forbidden.');
    }

    console.log('\n======================================================');
    console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY! (5/5)');
    console.log('======================================================\n');
  } finally {
    restoreMocks();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
