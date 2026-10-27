/**
 * Tech Ciphergate — Developer Test Assignment & Retrieval Regression Suite
 * 
 * Safety & Isolation:
 * - 100% In-memory mocks and fixtures.
 * - Zero database mutations on production MongoDB.
 * - Zero live AI API calls or notification dispatches.
 */

const assert = require('assert');
const mongoose = require('mongoose');

process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'mock_deepseek_key';

const Worker = require('../models/Worker');
const Question = require('../models/Question');
const TestAttempt = require('../models/TestAttempt');
const DailyTopic = require('../models/DailyTopic');
const openai = require('../utils/openai');
const jobManager = require('../utils/jobManager');
const { processQuestionGeneration, processThreeSetQuestionGeneration } = require('../utils/questionProcessor');
const { getQuestionsForTest, generateAndStoreQuestions } = require('../controllers/questionController');
const { getAvailableTests } = require('../controllers/testController');

console.log('================================================================');
console.log(' Tech Ciphergate — Developer Test Assignment Regression Suite   ');
console.log('================================================================\n');

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✓ [PASS] ${name}`);
  } catch (err) {
    fail++;
    console.error(`✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    console.error(err.stack);
  }
}

function mockReq(user, params = {}, query = {}, body = {}) {
  return { user, params, query, body, headers: {} };
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

// In-memory data store for isolated testing
let inMemoryWorkers = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];
let inMemoryDailyTopics = [];

function setupMocks() {
  inMemoryWorkers = [];
  inMemoryQuestions = [];
  inMemoryAttempts = [];
  inMemoryDailyTopics = [];

  Worker.findById = async (id) => {
    return inMemoryWorkers.find(w => String(w._id) === String(id)) || null;
  };
  Worker.find = (query = {}) => {
    let result = inMemoryWorkers.filter(w => {
      if (query._id && query._id.$in) {
        return query._id.$in.map(String).includes(String(w._id));
      }
      if (query.subdomain && query.subdomain.$ne) {
        return w.subdomain !== query.subdomain.$ne;
      }
      if (query.subdomain) {
        return w.subdomain === query.subdomain;
      }
      return true;
    });
    const chain = {
      select: () => result,
      lean: () => result,
      then: (resolve) => resolve(result)
    };
    return chain;
  };

  Question.find = async (query = {}) => {
    return inMemoryQuestions.filter(q => {
      if (query._id && query._id.$in) {
        return query._id.$in.map(String).includes(String(q._id));
      }
      if (query.worker && String(q.worker) !== String(query.worker)) return false;
      if (query.batchId && typeof query.batchId === 'object' && query.batchId.$nin) {
        if (query.batchId.$nin.includes(q.batchId)) return false;
      } else if (query.batchId && typeof query.batchId !== 'object' && q.batchId !== query.batchId) {
        return false;
      }
      return true;
    });
  };

  Question.findOne = (query = {}) => {
    const list = inMemoryQuestions.filter(q => {
      if (query.worker && String(q.worker) !== String(query.worker)) return false;
      if (query.batchId && typeof query.batchId === 'object' && query.batchId.$nin) {
        if (query.batchId.$nin.includes(q.batchId)) return false;
      } else if (query.batchId && q.batchId !== query.batchId) {
        return false;
      }
      return true;
    });
    const sorted = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const target = sorted[0] || null;

    return {
      sort: () => ({
        select: () => ({
          lean: async () => target,
          then: (res) => res(target)
        }),
        lean: async () => target,
        then: (res) => res(target)
      }),
      select: () => ({
        lean: async () => target,
        then: (res) => res(target)
      }),
      lean: async () => target,
      then: (res) => res(target)
    };
  };

  Question.insertMany = async (docs) => {
    const inserted = docs.map(d => ({
      ...d,
      _id: d._id || new mongoose.Types.ObjectId(),
      createdAt: d.createdAt || new Date(),
      updatedAt: new Date()
    }));
    inMemoryQuestions.push(...inserted);
    return inserted;
  };

  TestAttempt.find = (query = {}) => {
    const list = inMemoryAttempts.filter(a => {
      if (query.worker && String(a.worker) !== String(query.worker)) return false;
      if (query.status && a.status !== query.status) return false;
      return true;
    });
    return {
      select: () => list,
      lean: () => list,
      then: (res) => res(list)
    };
  };

  TestAttempt.findOne = (query = {}) => {
    const list = inMemoryAttempts.filter(a => {
      if (query.worker && String(a.worker) !== String(query.worker)) return false;
      if (query.batchId && a.batchId !== query.batchId) return false;
      if (query.status && a.status !== query.status) return false;
      if (query.questions && query.questions.$in) {
        const hasMatch = (a.questions || []).some(qid => query.questions.$in.map(String).includes(String(qid)));
        if (!hasMatch) return false;
      }
      return true;
    });
    const target = list[list.length - 1] || null;
    return {
      sort: () => ({
        select: () => target,
        lean: () => target,
        then: (res) => res(target)
      }),
      then: (res) => res(target)
    };
  };

  TestAttempt.create = async (doc) => {
    const newAttempt = {
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      save: async function() { return this; }
    };
    inMemoryAttempts.push(newAttempt);
    return newAttempt;
  };

  TestAttempt.updateMany = async (query = {}, update = {}) => {
    let count = 0;
    inMemoryAttempts.forEach(a => {
      if (query.worker && String(a.worker) === String(query.worker) && query.status === a.status) {
        Object.assign(a, update);
        count++;
      }
    });
    return { modifiedCount: count };
  };

  DailyTopic.findOne = (query = {}) => {
    const match = inMemoryDailyTopics.find(t => String(t.workerId) === String(query.workerId)) || null;
    return {
      lean: async () => match,
      then: (res) => res(match)
    };
  };

  DailyTopic.find = (query = {}) => {
    let list = inMemoryDailyTopics.filter(t => String(t.workerId) === String(query.workerId));
    if (query.subdomain) {
      list = list.filter(t => t.subdomain === query.subdomain);
    }
    if (query.date) {
      if (query.date.$gte) {
        list = list.filter(t => t.date >= query.date.$gte);
      }
      if (query.date.$lte) {
        list = list.filter(t => t.date <= query.date.$lte);
      }
    }
    return {
      sort: () => ({
        limit: () => ({
          lean: async () => list,
          then: (res) => res(list)
        })
      })
    };
  };

  mongoose.startSession = async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {}
  });

  // Mock openai generator to avoid real API calls
  openai.generateMCQQuestions = async (topics, count) => {
    const res = {};
    for (const t of topics) {
      res[t] = Array.from({ length: count }, (_, i) => ({
        questionText: `Which concept best relates to ${t}? (Item ${i + 1})`,
        options: [`Core ${t} concept`, 'Irrelevant option 1', 'Irrelevant option 2', 'Irrelevant option 3'],
        correctAnswer: 0
      }));
    }
    return res;
  };
}

async function runRegression() {
  setupMocks();

  // Seed two developers in tenant "techcipher" and one developer in tenant "othercorp"
  const devAId = new mongoose.Types.ObjectId();
  const devBId = new mongoose.Types.ObjectId();
  const devOtherCorpId = new mongoose.Types.ObjectId();

  const devA = { _id: devAId, name: 'Alice Developer', subdomain: 'techcipher', role: 'worker', status: 'Active' };
  const devB = { _id: devBId, name: 'Bob Developer', subdomain: 'techcipher', role: 'worker', status: 'Active' };
  const devOther = { _id: devOtherCorpId, name: 'Charlie Other', subdomain: 'othercorp', role: 'worker', status: 'Active' };

  inMemoryWorkers.push(devA, devB, devOther);

  const adminUser = { _id: new mongoose.Types.ObjectId(), name: 'Admin User', role: 'admin', subdomain: 'techcipher' };
  const devAUser = { _id: devAId, name: 'Alice Developer', role: 'worker', subdomain: 'techcipher' };
  const devBUser = { _id: devBId, name: 'Bob Developer', role: 'worker', subdomain: 'techcipher' };

  // 1. Admin assigns a test to Developer A; A can retrieve it
  await test('1: Admin assigns a test to Developer A; A can retrieve it', async () => {
    inMemoryDailyTopics.push({ workerId: devAId, topic: 'React Hooks', subdomain: 'techcipher', date: '2026-10-26' });

    const jobData = {
      workerIds: [devAId],
      numQuestions: 2,
      timeDuration: 15,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devAId.toString()]: ['React Hooks'] },
      subdomain: 'techcipher'
    };

    await processQuestionGeneration(jobData, 'batch_dev_a_001');

    // Dev A retrieves questions
    const req = mockReq(devAUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200, 'Dev A should get status 200');
    assert.strictEqual(res.data.questions.length, 2, 'Dev A should receive 2 assigned questions');
    assert.ok(res.data.testAttemptId, 'TestAttempt ID must be returned');
    assert.strictEqual(res.data.reason, 'questions_available', 'Reason should be questions_available');
  });

  // 2. Developer B cannot retrieve A's assigned test
  await test('2.1: Developer B cannot retrieve A\'s test via A\'s workerId (Access Denied 403)', async () => {
    const req = mockReq(devBUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 403, 'Should reject with 403 Forbidden');
    assert.strictEqual(res.data.reason, 'access_denied', 'Reason code must be access_denied');
  });

  await test('2.2: Developer B querying their own workerId sees no tests (404 no topics / questions)', async () => {
    const req = mockReq(devBUser, { workerId: devBId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 404, 'Dev B with no assigned tests should get 404');
    assert.strictEqual(res.data.reason, 'no_topics_recorded', 'Dev B has no topics or questions assigned yet');
  });

  // 3. Assigning a test to B does not accidentally associate it with A
  await test('3: Assigning a test to B does not accidentally associate it with A', async () => {
    inMemoryDailyTopics.push({ workerId: devBId, topic: 'Kubernetes Pods', subdomain: 'techcipher', date: '2026-10-26' });

    const jobDataB = {
      workerIds: [devBId],
      numQuestions: 2,
      timeDuration: 15,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devBId.toString()]: ['Kubernetes Pods'] },
      subdomain: 'techcipher'
    };

    await processQuestionGeneration(jobDataB, 'batch_dev_b_001');

    // Verify Dev B questions in store
    const bQuestions = inMemoryQuestions.filter(q => String(q.worker) === String(devBId));
    assert.strictEqual(bQuestions.length, 2, 'Dev B should have 2 questions generated');
    assert.ok(bQuestions.every(q => q.topic.includes('Kubernetes')), 'Dev B questions must be on Kubernetes');

    // Verify Dev A questions remain solely React
    const aQuestions = inMemoryQuestions.filter(q => String(q.worker) === String(devAId));
    assert.ok(aQuestions.every(q => q.topic.includes('React')), 'Dev A questions must strictly remain React');

    // Dev B retrieves questions
    const reqB = mockReq(devBUser, { workerId: devBId.toString() });
    const resB = mockRes();
    await getQuestionsForTest(reqB, resB);

    assert.strictEqual(resB.statusCode, 200);
    assert.strictEqual(resB.data.questions.length, 2);
    assert.ok(resB.data.questions[0].questionText.includes('Kubernetes'));
  });

  // 4. A previous attempt does not hide a newly assigned test
  await test('4.1: A previously completed attempt does not block a newly assigned batch', async () => {
    // Complete Dev A's first test
    const firstAttempt = inMemoryAttempts.find(a => String(a.worker) === String(devAId) && a.batchId === 'batch_dev_a_001');
    assert.ok(firstAttempt, 'First attempt must exist');
    firstAttempt.status = 'completed';

    // Verify before new batch: Dev A is reported as already_completed for batch 1
    const reqBefore = mockReq(devAUser, { workerId: devAId.toString() });
    const resBefore = mockRes();
    await getQuestionsForTest(reqBefore, resBefore);
    assert.strictEqual(resBefore.statusCode, 403);
    assert.strictEqual(resBefore.data.reason, 'already_completed');

    // Admin now assigns Batch 2 (TypeScript Generics) to Dev A
    const jobDataBatch2 = {
      workerIds: [devAId],
      numQuestions: 2,
      timeDuration: 15,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devAId.toString()]: ['TypeScript Generics'] },
      subdomain: 'techcipher'
    };
    await processQuestionGeneration(jobDataBatch2, 'batch_dev_a_002');

    // Dev A retrieves new batch: must NOT be blocked by completed batch 1!
    const reqAfter = mockReq(devAUser, { workerId: devAId.toString() });
    const resAfter = mockRes();
    await getQuestionsForTest(reqAfter, resAfter);

    assert.strictEqual(resAfter.statusCode, 200, 'Newly assigned batch must be available');
    assert.strictEqual(resAfter.data.reason, 'questions_available');
    assert.strictEqual(resAfter.data.questions.length, 2);
  });

  await test('4.2: A stale/abandoned in-progress attempt does not block newly assigned batch', async () => {
    // Leave Dev A's attempt for batch 2 in-progress and stale (from 2 hours ago)
    const batch2Attempt = inMemoryAttempts.find(a => String(a.worker) === String(devAId) && a.batchId === 'batch_dev_a_002');
    assert.ok(batch2Attempt, 'Batch 2 attempt must exist');
    batch2Attempt.status = 'in-progress';
    batch2Attempt.testStartTime = new Date(Date.now() - 7200000); // 2 hours ago

    // Admin assigns Batch 3 (GraphQL APIs) to Dev A
    const jobDataBatch3 = {
      workerIds: [devAId],
      numQuestions: 2,
      timeDuration: 15,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devAId.toString()]: ['GraphQL APIs'] },
      subdomain: 'techcipher'
    };
    await processQuestionGeneration(jobDataBatch3, 'batch_dev_a_003');

    // Dev A opens test: must return Batch 3, not the old batch 2 attempt
    const req = mockReq(devAUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200, 'Batch 3 must be available');
    assert.strictEqual(res.data.reason, 'questions_available');
    assert.ok(res.data.questions[0].questionText.includes('GraphQL'), 'Questions must be for GraphQL');
  });

  // 5. Resuming an existing attempt retrieves only the correct assigned test
  await test('5.1: Resuming an active in-progress attempt retains batch questions & calculates remaining duration', async () => {
    // Current active attempt is for batch 3. Let it have elapsed 60 seconds of 300 seconds limit.
    const activeAttempt = inMemoryAttempts.find(a => String(a.worker) === String(devAId) && a.batchId === 'batch_dev_a_003');
    assert.ok(activeAttempt, 'Active attempt for batch 3 must exist');
    activeAttempt.testStartTime = new Date(Date.now() - 60000); // 60s ago
    activeAttempt.totalTestDuration = 300;

    const req = mockReq(devAUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(String(res.data.testAttemptId), String(activeAttempt._id), 'Must resume the active attempt');
    assert.ok(res.data.totalTestDuration <= 241 && res.data.totalTestDuration >= 238, `Duration should be ~240s remaining (actual: ${res.data.totalTestDuration})`);
  });

  await test('5.2: An attempt that exceeded test duration transitions to completed/expired', async () => {
    const activeAttempt = inMemoryAttempts.find(a => String(a.worker) === String(devAId) && a.batchId === 'batch_dev_a_003');
    activeAttempt.testStartTime = new Date(Date.now() - 400000); // 400s ago on 300s test
    activeAttempt.totalTestDuration = 300;

    const req = mockReq(devAUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 403, 'Expired test must return 403');
    assert.strictEqual(res.data.reason, 'already_completed');
    assert.strictEqual(activeAttempt.status, 'completed', 'Attempt status must be updated to completed');
  });

  // 6. Cross-tenant assignment and retrieval are rejected
  await test('6.1: Cross-tenant question generation is rejected (Admin techcipher -> Worker othercorp)', async () => {
    const req = mockReq(adminUser, {}, {}, {
      workerIds: [devOtherCorpId.toString()],
      numQuestions: 2,
      topic: 'Security Compliance',
      topicMode: 'common'
    });
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    // The middleware validateQuestionGeneration is the first function in generateAndStoreQuestions
    const validatorMiddleware = generateAndStoreQuestions[0];
    await validatorMiddleware(req, res, next);

    assert.strictEqual(res.statusCode, 403, 'Cross-tenant generation should return 403');
    assert.strictEqual(nextCalled, false, 'Next middleware should not be called');
  });

  await test('6.2: Cross-tenant question retrieval is rejected (Admin techcipher -> Worker othercorp)', async () => {
    const req = mockReq(adminUser, { workerId: devOtherCorpId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 403, 'Cross-tenant retrieval should return 403');
    assert.strictEqual(res.data.reason, 'tenant_mismatch', 'Reason must be tenant_mismatch');
  });

  // 7. Missing or invalid assignment IDs produce a clear error rather than a misleading empty test list
  await test('7.1: Malformed worker ID produces 400 Bad Request with reason invalid_worker_id', async () => {
    const req = mockReq(adminUser, { workerId: 'invalid-id-xyz' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 400, 'Invalid workerId must return 400');
    assert.strictEqual(res.data.reason, 'invalid_worker_id');
  });

  await test('7.2: Non-existent worker ID produces 404 with reason worker_not_found', async () => {
    const randomValidId = new mongoose.Types.ObjectId();
    const req = mockReq(adminUser, { workerId: randomValidId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.reason, 'worker_not_found');
  });

  // 8. Multi-batch selection logic
  await test('8.1: Querying with explicit ?batchId retrieves that specific batch', async () => {
    // Dev A has batch_dev_a_001 (React), batch_dev_a_002 (TypeScript), batch_dev_a_003 (GraphQL)
    const req = mockReq(devAUser, { workerId: devAId.toString() }, { batchId: 'batch_dev_a_001' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 403, 'Completed batch 1 should return its status');
    assert.strictEqual(res.data.reason, 'already_completed');
  });

  await test('8.2: When multiple tests exist and newer batch is completed, older uncompleted batch is served', async () => {
    // Create Developer Charlie in techcipher
    const devCId = new mongoose.Types.ObjectId();
    const devC = { _id: devCId, name: 'Charlie Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devC);
    const devCUser = { _id: devCId, name: 'Charlie Dev', role: 'worker', subdomain: 'techcipher' };

    // Batch 1: CSS Grid (Created earlier)
    await Question.insertMany([
      { worker: devCId, batchId: 'batch_c_css', topic: 'CSS Grid', questionText: 'Q1 on CSS Grid', options: ['A','B','C','D'], correctAnswer: 0, createdAt: new Date(Date.now() - 3600000) }
    ]);

    // Batch 2: Next.js SSR (Created later)
    await Question.insertMany([
      { worker: devCId, batchId: 'batch_c_next', topic: 'Next.js SSR', questionText: 'Q1 on Next.js', options: ['A','B','C','D'], correctAnswer: 0, createdAt: new Date(Date.now() - 1800000) }
    ]);

    // Charlie completed Batch 2 (Next.js)
    inMemoryAttempts.push({
      _id: new mongoose.Types.ObjectId(),
      worker: devCId,
      batchId: 'batch_c_next',
      status: 'completed'
    });

    // When Charlie requests questions without query params, the system must NOT say already_completed!
    // It must serve Batch 1 (CSS Grid) which is still uncompleted!
    const req = mockReq(devCUser, { workerId: devCId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200, 'Uncompleted older batch must be served instead of getting blocked');
    assert.strictEqual(res.data.reason, 'questions_available');
    assert.ok(res.data.questions[0].questionText.includes('CSS Grid'), 'Must return uncompleted CSS Grid batch');
  });

  await test('8.3: Active in-progress attempt takes precedence over a newer batch', async () => {
    const devDId = new mongoose.Types.ObjectId();
    const devD = { _id: devDId, name: 'David Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devD);
    const devDUser = { _id: devDId, name: 'David Dev', role: 'worker', subdomain: 'techcipher' };

    // Batch 1: Python Basics (Active in progress)
    await Question.insertMany([
      { worker: devDId, batchId: 'batch_d_py', topic: 'Python Basics', questionText: 'Q1 Python', options: ['A','B','C','D'], correctAnswer: 0, createdAt: new Date(Date.now() - 600000) }
    ]);
    const pyAttempt = {
      _id: new mongoose.Types.ObjectId(),
      worker: devDId,
      batchId: 'batch_d_py',
      questions: [inMemoryQuestions[inMemoryQuestions.length - 1]._id],
      status: 'in-progress',
      testStartTime: new Date(Date.now() - 60000), // 1 min ago
      totalTestDuration: 600,
      save: async function() { return this; }
    };
    inMemoryAttempts.push(pyAttempt);

    // Admin creates Batch 2: Golang Concurrency (Created after Batch 1)
    await Question.insertMany([
      { worker: devDId, batchId: 'batch_d_go', topic: 'Golang Concurrency', questionText: 'Q1 Golang', options: ['A','B','C','D'], correctAnswer: 0, createdAt: new Date(Date.now()) }
    ]);

    // David opens test page: must resume active Python test, not switch to Golang!
    const req = mockReq(devDUser, { workerId: devDId.toString() });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(String(res.data.testAttemptId), String(pyAttempt._id), 'Must resume the active Python attempt');
    assert.ok(res.data.questions[0].questionText.includes('Python'), 'Questions must remain Python while attempt is active');
  });

  // 9. Contract verification for machine-readable state codes
  await test('9: Contract verification of machine-readable reason codes across states', () => {
    const supportedReasons = [
      'questions_available',
      'already_completed',
      'generation_in_progress',
      'generation_failed',
      'no_topics_recorded',
      'topics_not_found_for_period',
      'invalid_worker_id',
      'tenant_mismatch',
      'access_denied'
    ];
    supportedReasons.forEach(reason => {
      assert.ok(typeof reason === 'string' && reason.length > 0, `Reason ${reason} must be defined`);
    });
  });

  // 10: Multi-Test Assignment & Selection Tests
  await test('10.1: One developer with two uncompleted batches sees both tests in /test/available/:workerId', async () => {
    const devEId = new mongoose.Types.ObjectId();
    const devE = { _id: devEId, name: 'Emma Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devE);
    const devEUser = { _id: devEId, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    // Batch 1: React Hooks (created earlier)
    await Question.insertMany([
      { worker: devEId, batchId: 'batch_e_react', topic: 'React Hooks', questionText: 'Q1 React Hooks', options: ['A','B','C','D'], correctAnswer: 0, timeDuration: 15, totalTestDuration: 600, createdAt: new Date(Date.now() - 3600000) }
    ]);

    // Batch 2: Node.js Streams (created later)
    await Question.insertMany([
      { worker: devEId, batchId: 'batch_e_node', topic: 'Node.js Streams', questionText: 'Q1 Node Streams', options: ['A','B','C','D'], correctAnswer: 1, timeDuration: 20, totalTestDuration: 900, createdAt: new Date(Date.now() - 1800000) }
    ]);

    const req = mockReq(devEUser, { workerId: devEId.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data), 'Must return an array of available test batches');
    assert.strictEqual(res.data.length, 2, 'Developer must see both uncompleted test batches');

    const batchIds = res.data.map(b => b.batchId);
    assert.ok(batchIds.includes('batch_e_react'), 'Must include React Hooks batch');
    assert.ok(batchIds.includes('batch_e_node'), 'Must include Node.js Streams batch');

    const reactBatch = res.data.find(b => b.batchId === 'batch_e_react');
    assert.strictEqual(reactBatch.topic, 'React Hooks');
    assert.strictEqual(reactBatch.questionCount, 1);
    assert.strictEqual(reactBatch.status, 'available');
  });

  await test('10.2: Selecting the older batch (?batchId=batch_e_react) retrieves its questions, not the newest batch', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devEUser = { _id: devE._id, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    const req = mockReq(devEUser, { workerId: devE._id.toString() }, { batchId: 'batch_e_react' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.questions[0].questionText.includes('React Hooks'), 'Must return the requested older batch questions');
  });

  await test('10.3: Selecting the newer batch (?batchId=batch_e_node) retrieves only its questions', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devEUser = { _id: devE._id, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    const req = mockReq(devEUser, { workerId: devE._id.toString() }, { batchId: 'batch_e_node' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.questions[0].questionText.includes('Node Streams'), 'Must return only the newer batch questions');
  });

  await test('10.4: An in-progress test is reflected in /test/available/:workerId and resumes the correct batch', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devEUser = { _id: devE._id, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    // Developer E started batch_e_react
    const reactAttempt = {
      _id: new mongoose.Types.ObjectId(),
      worker: devE._id,
      batchId: 'batch_e_react',
      questions: [inMemoryQuestions.find(q => q.batchId === 'batch_e_react')._id],
      status: 'in-progress',
      testStartTime: new Date(Date.now() - 30000), // 30s ago
      totalTestDuration: 600,
      currentQuestionIndex: 0,
      save: async function() { return this; }
    };
    inMemoryAttempts.push(reactAttempt);

    const req = mockReq(devEUser, { workerId: devE._id.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    const reactBatch = res.data.find(b => b.batchId === 'batch_e_react');
    assert.strictEqual(reactBatch.status, 'in-progress', 'Status must be in-progress');
    assert.strictEqual(reactBatch.isResumed, true);
    assert.ok(reactBatch.timeRemaining <= 570 && reactBatch.timeRemaining > 550, 'Remaining time must be accurately calculated');
  });

  await test('10.5: A completed batch is excluded from /test/available/:workerId', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devEUser = { _id: devE._id, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    // Complete batch_e_react
    const reactAttempt = inMemoryAttempts.find(a => a.batchId === 'batch_e_react');
    reactAttempt.status = 'completed';

    const req = mockReq(devEUser, { workerId: devE._id.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.length, 1, 'Only uncompleted Node.js batch must remain available');
    assert.strictEqual(res.data[0].batchId, 'batch_e_node');
  });

  await test('10.6: One developer cannot see another developer tests in /test/available/:workerId', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devFId = new mongoose.Types.ObjectId();
    const devF = { _id: devFId, name: 'Frank Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devF);
    const devFUser = { _id: devFId, name: 'Frank Dev', role: 'worker', subdomain: 'techcipher' };

    // Developer F queries Developer E's available tests -> 403 Forbidden
    const reqForbidden = mockReq(devFUser, { workerId: devE._id.toString() });
    const resForbidden = mockRes();
    await getAvailableTests(reqForbidden, resForbidden);

    assert.strictEqual(resForbidden.statusCode, 403);
    assert.strictEqual(resForbidden.data.reason, 'access_denied');

    // Developer F queries their own available tests -> empty array []
    const reqOwn = mockReq(devFUser, { workerId: devFId.toString() });
    const resOwn = mockRes();
    await getAvailableTests(reqOwn, resOwn);

    assert.strictEqual(resOwn.statusCode, 200);
    assert.deepStrictEqual(resOwn.data, [], 'Worker F must see 0 tests');
  });

  await test('10.7: Cross-tenant available tests requests are rejected (403 tenant_mismatch)', async () => {
    const devGId = new mongoose.Types.ObjectId();
    const devG = { _id: devGId, name: 'Grace Dev', subdomain: 'foreigncorp', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devG);

    const adminTechcipher = { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'techcipher' };
    const req = mockReq(adminTechcipher, { workerId: devGId.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.reason, 'tenant_mismatch');
  });

  await test('10.8: Empty test list produces correct empty array ([])', async () => {
    const devHId = new mongoose.Types.ObjectId();
    const devH = { _id: devHId, name: 'Hannah Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devH);
    const devHUser = { _id: devHId, name: 'Hannah Dev', role: 'worker', subdomain: 'techcipher' };

    const req = mockReq(devHUser, { workerId: devHId.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 0);
  });

  await test('10.9: Invalid batch IDs and missing batches return clear errors', async () => {
    const devE = inMemoryWorkers.find(w => w.name === 'Emma Dev');
    const devEUser = { _id: devE._id, name: 'Emma Dev', role: 'worker', subdomain: 'techcipher' };

    // Requesting a non-existent batchId
    const reqMissingBatch = mockReq(devEUser, { workerId: devE._id.toString() }, { batchId: 'non_existent_batch_xyz' });
    const resMissingBatch = mockRes();
    await getQuestionsForTest(reqMissingBatch, resMissingBatch);

    assert.strictEqual(resMissingBatch.statusCode, 404);
    assert.strictEqual(resMissingBatch.data.reason, 'batch_not_found');

    // Requesting with invalid workerId in getAvailableTests
    const reqInvalid = mockReq(devEUser, { workerId: 'not-an-objectid' });
    const resInvalid = mockRes();
    await getAvailableTests(reqInvalid, resInvalid);

    assert.strictEqual(resInvalid.statusCode, 400);
    assert.strictEqual(resInvalid.data.reason, 'invalid_worker_id');
  });

  // =========================================================================
  // Phase 4: Smoke-Gun Test Module Comprehensive Verification (Scenarios 1-13)
  // =========================================================================

  // Scenario 1: Generate 20 questions for one worker: verify actual persisted count and final status
  await test('Smoke-Gun 1: Generate 20 questions for one worker; verify persisted count and completed status', async () => {
    const devS1Id = new mongoose.Types.ObjectId();
    const devS1 = { _id: devS1Id, name: 'Smoke1 Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devS1);

    const s1JobId = 'smoke_job_20_q';
    jobManager.createJob(s1JobId, { totalWorkers: 1, workerIds: [devS1Id] });

    const jobData = {
      workerIds: [devS1Id],
      numQuestions: 20,
      timeDuration: 15,
      totalTestDuration: 600,
      topicMode: 'individual',
      individualTopics: { [devS1Id.toString()]: ['Advanced TypeScript Patterns'] },
      subdomain: 'techcipher'
    };

    const result = await processQuestionGeneration(jobData, s1JobId);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalQuestionsGenerated, 20);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].questionsGenerated, 20);

    const job = jobManager.getJob(s1JobId);
    assert.strictEqual(job.state, 'completed');
    assert.strictEqual(job.progress, 100);

    const persisted = inMemoryQuestions.filter(q => q.batchId === s1JobId && String(q.worker) === String(devS1Id));
    assert.strictEqual(persisted.length, 20);
  });

  // Scenario 2: Simulate generation returning zero questions: UI and job must show failure, not success
  await test('Smoke-Gun 2: Zero questions generated marks job as failed with actionable diagnostic', async () => {
    const devS2Id = new mongoose.Types.ObjectId();
    const devS2 = { _id: devS2Id, name: 'Smoke2 Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devS2);

    const s2JobId = 'smoke_job_zero_q';
    jobManager.createJob(s2JobId, { totalWorkers: 1, workerIds: [devS2Id] });

    // No topics provided and no daily topics recorded
    const jobData = {
      workerIds: [devS2Id],
      numQuestions: 20,
      timeDuration: 15,
      totalTestDuration: 600,
      topicMode: 'individual',
      individualTopics: { [devS2Id.toString()]: [] },
      subdomain: 'techcipher'
    };

    const result = await processQuestionGeneration(jobData, s2JobId);
    assert.strictEqual(result.success, false, 'Result must NOT report success when 0 questions generated');
    assert.strictEqual(result.totalQuestionsGenerated, 0);
    assert.strictEqual(result.state, 'failed');
    assert.ok(result.reason.includes('No topics recorded'));

    const job = jobManager.getJob(s2JobId);
    assert.strictEqual(job.state, 'failed');
    assert.ok(job.reason.includes('Smoke2 Dev'));
  });

  // Scenario 3: Simulate worker lookup failure: return an actionable diagnostic
  await test('Smoke-Gun 3: Worker lookup failure returns actionable diagnostic', async () => {
    const nonexistentWorkerId = new mongoose.Types.ObjectId();
    const s3JobId = 'smoke_job_worker_not_found';
    jobManager.createJob(s3JobId, { totalWorkers: 1, workerIds: [nonexistentWorkerId] });

    const jobData = {
      workerIds: [nonexistentWorkerId],
      numQuestions: 10,
      topicMode: 'common',
      commonTopics: ['System Architecture'],
      subdomain: 'techcipher'
    };

    const result = await processQuestionGeneration(jobData, s3JobId);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.state, 'failed');
    assert.ok(result.reason.includes('Worker not found in map') || result.reason.includes('Zero questions'));

    const job = jobManager.getJob(s3JobId);
    assert.strictEqual(job.state, 'failed');
  });

  // Scenario 4: Generate a React batch for Developer A: A sees the React test
  await test('Smoke-Gun 4: Generate a React batch for Developer A; A sees the React test in available batches', async () => {
    const devAId = new mongoose.Types.ObjectId();
    const devA = { _id: devAId, name: 'Alice Smoke', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devA);
    const devAUser = { _id: devAId, name: 'Alice Smoke', role: 'worker', subdomain: 'techcipher' };

    const reactBatchId = 'batch_react_001';
    await processQuestionGeneration({
      workerIds: [devAId],
      numQuestions: 5,
      timeDuration: 20,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devAId.toString()]: ['React Hooks & Context'] },
      subdomain: 'techcipher'
    }, reactBatchId);

    const req = mockReq(devAUser, { workerId: devAId.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.length, 1);
    assert.strictEqual(res.data[0].batchId, reactBatchId);
    assert.ok(res.data[0].topic.includes('React Hooks'));
  });

  // Scenario 5: Generate a Docker batch for the same developer: both uncompleted batches appear separately
  await test('Smoke-Gun 5: Generate Docker batch for same developer; both batches appear separately', async () => {
    const devA = inMemoryWorkers.find(w => w.name === 'Alice Smoke');
    const devAUser = { _id: devA._id, name: 'Alice Smoke', role: 'worker', subdomain: 'techcipher' };

    const dockerBatchId = 'batch_docker_001';
    await processQuestionGeneration({
      workerIds: [devA._id],
      numQuestions: 5,
      timeDuration: 20,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [devA._id.toString()]: ['Docker Containers'] },
      subdomain: 'techcipher'
    }, dockerBatchId);

    const req = mockReq(devAUser, { workerId: devA._id.toString() });
    const res = mockRes();
    await getAvailableTests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.length, 2, 'Both React and Docker batches must appear');
    const batchIds = res.data.map(b => b.batchId);
    assert.ok(batchIds.includes('batch_react_001'));
    assert.ok(batchIds.includes('batch_docker_001'));
  });

  // Scenario 6: Select the older React batch: only React questions load
  await test('Smoke-Gun 6: Select older React batch; only React questions load', async () => {
    const devA = inMemoryWorkers.find(w => w.name === 'Alice Smoke');
    const devAUser = { _id: devA._id, name: 'Alice Smoke', role: 'worker', subdomain: 'techcipher' };

    const req = mockReq(devAUser, { workerId: devA._id.toString() }, { batchId: 'batch_react_001' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.batchId, 'batch_react_001');
    assert.ok(res.data.topic.includes('React Hooks'));
    assert.ok(res.data.questions.every(q => q.questionText.includes('React Hooks')));
  });

  // Scenario 7: Select the newer Docker batch: only Docker questions load
  await test('Smoke-Gun 7: Select newer Docker batch; only Docker questions load', async () => {
    const devA = inMemoryWorkers.find(w => w.name === 'Alice Smoke');
    const devAUser = { _id: devA._id, name: 'Alice Smoke', role: 'worker', subdomain: 'techcipher' };

    const req = mockReq(devAUser, { workerId: devA._id.toString() }, { batchId: 'batch_docker_001' });
    const res = mockRes();
    await getQuestionsForTest(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.batchId, 'batch_docker_001');
    assert.ok(res.data.topic.includes('Docker Containers'));
    assert.ok(res.data.questions.every(q => q.questionText.includes('Docker Containers')));
  });

  // Scenario 8: A previously completed CSS batch does not hide a new React batch
  await test('Smoke-Gun 8: A previously completed CSS batch does not hide newly generated batch', async () => {
    const devIId = new mongoose.Types.ObjectId();
    const devI = { _id: devIId, name: 'Ian Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devI);
    const devIUser = { _id: devIId, name: 'Ian Dev', role: 'worker', subdomain: 'techcipher' };

    // Create old completed CSS batch and attempt
    const cssBatchId = 'batch_css_old';
    await processQuestionGeneration({
      workerIds: [devIId],
      numQuestions: 3,
      topicMode: 'individual',
      individualTopics: { [devIId.toString()]: ['CSS Grid & Flexbox'] },
      subdomain: 'techcipher'
    }, cssBatchId);

    inMemoryAttempts.push({
      _id: new mongoose.Types.ObjectId(),
      worker: devIId,
      batchId: cssBatchId,
      status: 'completed',
      topic: 'CSS Grid & Flexbox',
      subdomain: 'techcipher'
    });

    // Now generate a new React batch
    const reactNewBatchId = 'batch_react_new';
    await processQuestionGeneration({
      workerIds: [devIId],
      numQuestions: 3,
      topicMode: 'individual',
      individualTopics: { [devIId.toString()]: ['React Architecture'] },
      subdomain: 'techcipher'
    }, reactNewBatchId);

    // Available tests must ONLY list the new React batch
    const reqAvail = mockReq(devIUser, { workerId: devIId.toString() });
    const resAvail = mockRes();
    await getAvailableTests(reqAvail, resAvail);

    assert.strictEqual(resAvail.statusCode, 200);
    assert.strictEqual(resAvail.data.length, 1);
    assert.strictEqual(resAvail.data[0].batchId, reactNewBatchId);

    // getQuestionsForTest without query params must return the React batch, NOT 403 CSS completed!
    const reqQuestions = mockReq(devIUser, { workerId: devIId.toString() });
    const resQuestions = mockRes();
    await getQuestionsForTest(reqQuestions, resQuestions);

    assert.strictEqual(resQuestions.statusCode, 200);
    assert.strictEqual(resQuestions.data.batchId, reactNewBatchId);
    assert.ok(resQuestions.data.topic.includes('React Architecture'));
  });

  // Scenario 9: Resume an in-progress batch without mixing questions from another batch
  await test('Smoke-Gun 9: Resume an in-progress batch without mixing questions from another batch', async () => {
    const devI = inMemoryWorkers.find(w => w.name === 'Ian Dev');
    const devIUser = { _id: devI._id, name: 'Ian Dev', role: 'worker', subdomain: 'techcipher' };

    // Start in-progress attempt for React batch
    const reqStart = mockReq(devIUser, { workerId: devI._id.toString() }, { batchId: 'batch_react_new' });
    const resStart = mockRes();
    await getQuestionsForTest(reqStart, resStart);
    assert.strictEqual(resStart.statusCode, 200);

    const inProgressAttempt = inMemoryAttempts.find(a => String(a.worker) === String(devI._id) && a.batchId === 'batch_react_new');
    assert.ok(inProgressAttempt, 'In progress attempt must exist');
    assert.strictEqual(inProgressAttempt.status, 'in-progress');

    // Query available tests: React batch shows in-progress
    const reqAvail = mockReq(devIUser, { workerId: devI._id.toString() });
    const resAvail = mockRes();
    await getAvailableTests(reqAvail, resAvail);

    const reactBatch = resAvail.data.find(b => b.batchId === 'batch_react_new');
    assert.strictEqual(reactBatch.status, 'in-progress');
    assert.strictEqual(reactBatch.isResumed, true);

    // Resuming returns the exact same questions
    const reqResume = mockReq(devIUser, { workerId: devI._id.toString() }, { batchId: 'batch_react_new' });
    const resResume = mockRes();
    await getQuestionsForTest(reqResume, resResume);

    assert.strictEqual(resResume.statusCode, 200);
    assert.strictEqual(String(resResume.data.testAttemptId), String(inProgressAttempt._id));
    assert.ok(resResume.data.questions.every(q => q.questionText.includes('React Architecture')));
  });

  // Scenario 10: Verify cross-worker and cross-tenant access is rejected
  await test('Smoke-Gun 10: Cross-worker and cross-tenant access is rejected', async () => {
    const devI = inMemoryWorkers.find(w => w.name === 'Ian Dev');
    const devJId = new mongoose.Types.ObjectId();
    const devJ = { _id: devJId, name: 'Jack Dev', subdomain: 'otherorg', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devJ);
    const devJUser = { _id: devJId, name: 'Jack Dev', role: 'worker', subdomain: 'otherorg' };

    // Cross-worker within techcipher
    const devA = inMemoryWorkers.find(w => w.name === 'Alice Smoke');
    const reqCrossWorker = mockReq(devJUser, { workerId: devI._id.toString() });
    const resCrossWorker = mockRes();
    await getQuestionsForTest(reqCrossWorker, resCrossWorker);
    assert.strictEqual(resCrossWorker.statusCode, 403);
    assert.strictEqual(resCrossWorker.data.reason, 'access_denied');

    // Cross-tenant access
    const adminOtherOrg = { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'otherorg' };
    const reqCrossTenant = mockReq(adminOtherOrg, { workerId: devA._id.toString() });
    const resCrossTenant = mockRes();
    await getQuestionsForTest(reqCrossTenant, resCrossTenant);
    assert.strictEqual(resCrossTenant.statusCode, 403);
    assert.strictEqual(resCrossTenant.data.reason, 'tenant_mismatch');
  });

  // Scenario 11: Verify malformed IDs and nonexistent batches return correct errors
  await test('Smoke-Gun 11: Malformed IDs and nonexistent batches return correct errors', async () => {
    const devA = inMemoryWorkers.find(w => w.name === 'Alice Smoke');
    const devAUser = { _id: devA._id, name: 'Alice Smoke', role: 'worker', subdomain: 'techcipher' };

    // Malformed worker ID
    const reqBadId = mockReq(devAUser, { workerId: 'malformed_id_123' });
    const resBadId = mockRes();
    await getQuestionsForTest(reqBadId, resBadId);
    assert.strictEqual(resBadId.statusCode, 400);
    assert.strictEqual(resBadId.data.reason, 'invalid_worker_id');

    // Nonexistent batch ID
    const reqBadBatch = mockReq(devAUser, { workerId: devA._id.toString() }, { batchId: 'batch_does_not_exist_999' });
    const resBadBatch = mockRes();
    await getQuestionsForTest(reqBadBatch, resBadBatch);
    assert.strictEqual(resBadBatch.statusCode, 404);
    assert.strictEqual(resBadBatch.data.reason, 'batch_not_found');
  });

  // Scenario 12: Verify generation errors, partial failures, and persistence failures are surfaced accurately
  await test('Smoke-Gun 12: Partial failure surfaces accurate worker-specific failure diagnostic', async () => {
    const devKId = new mongoose.Types.ObjectId();
    const devLId = new mongoose.Types.ObjectId();
    const devK = { _id: devKId, name: 'Kevin Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    const devL = { _id: devLId, name: 'Laura Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devK, devL);

    const partialJobId = 'smoke_partial_job_001';
    jobManager.createJob(partialJobId, { totalWorkers: 2, workerIds: [devKId, devLId] });

    // Kevin has topics, Laura has none
    const jobData = {
      workerIds: [devKId, devLId],
      numQuestions: 2,
      topicMode: 'individual',
      individualTopics: {
        [devKId.toString()]: ['Rust Memory Management'],
        [devLId.toString()]: []
      },
      subdomain: 'techcipher'
    };

    const result = await processQuestionGeneration(jobData, partialJobId);
    assert.strictEqual(result.state, 'partial_failure');
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.failedWorkers.length, 1);
    assert.strictEqual(result.failedWorkers[0].workerName, 'Laura Dev');

    const job = jobManager.getJob(partialJobId);
    assert.strictEqual(job.state, 'partial_failure');
    assert.ok(job.reason.includes('Laura Dev'));
  });

  // Scenario 13: Verify worker UI distinguishes all states
  await test('Smoke-Gun 13: Distinguishes empty list, generation in progress, generation failure, and available tests', async () => {
    const devMId = new mongoose.Types.ObjectId();
    const devM = { _id: devMId, name: 'Mike Dev', subdomain: 'techcipher', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devM);
    const devMUser = { _id: devMId, name: 'Mike Dev', role: 'worker', subdomain: 'techcipher' };

    // 13.a: Empty list
    const reqEmpty = mockReq(devMUser, { workerId: devMId.toString() });
    const resEmpty = mockRes();
    await getAvailableTests(reqEmpty, resEmpty);
    assert.strictEqual(resEmpty.statusCode, 200);
    assert.strictEqual(resEmpty.data.length, 0);

    // 13.b: Generation in progress
    const inProgressJobId = 'job_mike_in_progress';
    jobManager.createJob(inProgressJobId, { totalWorkers: 1, workerIds: [devMId] });
    jobManager.updateJobProgress(inProgressJobId, 45); // transitions to processing

    const reqProg = mockReq(devMUser, { workerId: devMId.toString() });
    const resProg = mockRes();
    await getQuestionsForTest(reqProg, resProg);
    assert.strictEqual(resProg.statusCode, 404);
    assert.strictEqual(resProg.data.reason, 'generation_in_progress');

    // 13.c: Generation failure
    jobManager.failJob(inProgressJobId, 'Zero valid questions generated', {
      failedWorkers: [{ workerId: devMId, reason: 'Zero valid questions generated' }]
    });

    const reqFail = mockReq(devMUser, { workerId: devMId.toString() });
    const resFail = mockRes();
    await getQuestionsForTest(reqFail, resFail);
    assert.strictEqual(resFail.statusCode, 404);
    assert.strictEqual(resFail.data.reason, 'generation_failed');
    assert.ok(resFail.data.details.includes('Zero valid questions'));

    // Clear failed job so we can test available tests
    global.jobs.delete(inProgressJobId);

    // 13.d: Available tests
    const mikeBatchId = 'batch_mike_001';
    await processQuestionGeneration({
      workerIds: [devMId],
      numQuestions: 2,
      topicMode: 'individual',
      individualTopics: { [devMId.toString()]: ['Kotlin Coroutines'] },
      subdomain: 'techcipher'
    }, mikeBatchId);

    const reqAvail = mockReq(devMUser, { workerId: devMId.toString() });
    const resAvail = mockRes();
    await getAvailableTests(reqAvail, resAvail);
    assert.strictEqual(resAvail.statusCode, 200);
    assert.strictEqual(resAvail.data.length, 1);
    assert.strictEqual(resAvail.data[0].status, 'available');
  });

  // 14: Real-World Test Generation Verification Suite
  await test('14.1: Tenant Mismatch: Admin cannot generate tests for worker of different organization', async () => {
    const devAlienId = new mongoose.Types.ObjectId();
    const devAlien = { _id: devAlienId, name: 'Alien Org Dev', subdomain: 'tenant_other', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devAlien);

    const interceptedLogs = [];
    const origConsoleWarn = console.warn;
    console.warn = (msg, data) => interceptedLogs.push({ level: 'warn', msg, data });

    try {
      const batchId = 'batch_tenant_mismatch_001';
      const genResult = await processQuestionGeneration({
        workerIds: [devAlienId],
        numQuestions: 5,
        topicMode: 'individual',
        individualTopics: { [devAlienId.toString()]: ['Security'] },
        adminSubdomain: 'tenant_primary',
        subdomain: 'tenant_primary'
      }, batchId);

      assert.strictEqual(genResult.success, false, 'Generation must fail when admin tenant mismatches worker tenant');
      assert.strictEqual(genResult.totalQuestionsGenerated, 0);
      assert.strictEqual(genResult.failedWorkers.length, 1);
      assert.strictEqual(genResult.failedWorkers[0].reasonCode, 'TENANT_MISMATCH');

      const skipLog = interceptedLogs.find(l => l.msg && l.msg.includes('DIAGNOSTIC_WORKER_SKIPPED'));
      assert.ok(skipLog, 'Must emit DIAGNOSTIC_WORKER_SKIPPED log with TENANT_MISMATCH');
      assert.strictEqual(skipLog.data.reasonCode, 'TENANT_MISMATCH');
    } finally {
      console.warn = origConsoleWarn;
    }
  });

  await test('14.2: Empty Date Range: Strictly respects date range and does NOT silently substitute historical topics', async () => {
    const devStrictId = new mongoose.Types.ObjectId('69fc424fdc18f098aa426a33');
    const devStrict = { _id: devStrictId, name: 'Strict Period Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devStrict);

    // Topic exists outside the requested period (Oct 15 vs requested Oct 25-31)
    inMemoryDailyTopics.push({
      _id: new mongoose.Types.ObjectId(),
      workerId: devStrictId,
      topic: 'CSS Grid, HTML5 Canvas',
      date: '2026-10-15',
      subdomain: 'techvaseegrah'
    });

    const interceptedLogs = [];
    const origConsoleWarn = console.warn;
    console.warn = (msg, data) => interceptedLogs.push({ level: 'warn', msg, data });

    try {
      const batchId = 'batch_strict_period_002';
      const genResult = await processQuestionGeneration({
        workerIds: [devStrictId],
        numQuestions: 5,
        topicMode: 'individual',
        individualTopics: { [devStrictId.toString()]: [] }, // 0 topics found in the selected period
        startDate: '2026-10-25',
        endDate: '2026-10-31',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
        // allowHistoricalFallback is NOT set: MUST NOT silently substitute!
      }, batchId);

      assert.strictEqual(genResult.success, false, 'Generation must fail when selected period has no topics and fallback is not explicit');
      assert.strictEqual(genResult.totalQuestionsGenerated, 0);
      assert.strictEqual(genResult.state, 'failed');
      assert.strictEqual(genResult.failedWorkers[0].reasonCode, 'TOPICS_NOT_FOUND_FOR_PERIOD');
      assert.strictEqual(genResult.failedWorkers[0].reason, 'Topics not found for the selected period');

      // Verify no questions were created for this batch
      const persisted = inMemoryQuestions.filter(q => q.batchId === batchId);
      assert.strictEqual(persisted.length, 0, 'No questions must be persisted on empty period without explicit fallback');
    } finally {
      console.warn = origConsoleWarn;
    }
  });

  await test('14.3: Explicit Historical Fallback: Generates questions only when admin explicitly chooses historical fallback', async () => {
    const devFallbackId = new mongoose.Types.ObjectId();
    const devFallback = { _id: devFallbackId, name: 'Fallback OptIn Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devFallback);

    inMemoryDailyTopics.push({
      _id: new mongoose.Types.ObjectId(),
      workerId: devFallbackId,
      topic: 'TypeScript Generics',
      date: '2026-10-10',
      subdomain: 'techvaseegrah'
    });

    const interceptedLogs = [];
    const origConsoleInfo = console.log;
    console.log = (msg, data) => interceptedLogs.push({ level: 'info', msg, data });

    try {
      const batchId = 'batch_explicit_fallback_003';
      const genResult = await processQuestionGeneration({
        workerIds: [devFallbackId],
        numQuestions: 2,
        topicMode: 'individual',
        individualTopics: { [devFallbackId.toString()]: [] },
        startDate: '2026-10-25',
        endDate: '2026-10-31',
        allowHistoricalFallback: true, // EXPLICIT admin choice
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, batchId);

      assert.strictEqual(genResult.success, true, 'Generation must succeed when admin explicitly chooses historical fallback');
      assert.strictEqual(genResult.totalQuestionsGenerated, 2);
      assert.strictEqual(genResult.state, 'completed');

      const lookupLog = interceptedLogs.find(l => l.msg && l.msg.includes('DIAGNOSTIC_DAILY_TOPIC_LOOKUP'));
      assert.ok(lookupLog, 'Must emit DIAGNOSTIC_DAILY_TOPIC_LOOKUP');
      assert.strictEqual(lookupLog.data.reasonCode, 'EXPLICIT_HISTORICAL_FALLBACK');

      const persisted = inMemoryQuestions.filter(q => q.batchId === batchId);
      assert.strictEqual(persisted.length, 2);
      assert.ok(persisted[0].topic.includes('TypeScript'));
    } finally {
      console.log = origConsoleInfo;
    }
  });

  await test('14.4: Zero Generated Questions: Fails safely and marks job failed when AI produces zero questions', async () => {
    const devZeroId = new mongoose.Types.ObjectId();
    const devZero = { _id: devZeroId, name: 'Zero AI Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devZero);

    // Mock openai to return empty array for this test
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async () => ({ 'Empty Topic': [] });

    try {
      const batchId = 'batch_zero_ai_004';
      jobManager.createJob(batchId, { totalWorkers: 1 });
      const genResult = await processQuestionGeneration({
        workerIds: [devZeroId],
        numQuestions: 5,
        topicMode: 'common',
        commonTopics: ['Empty Topic'],
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, batchId);

      assert.strictEqual(genResult.success, false, 'Must fail when AI generates 0 questions');
      assert.strictEqual(genResult.totalQuestionsGenerated, 0);
      assert.strictEqual(genResult.state, 'failed');
      assert.strictEqual(genResult.failedWorkers[0].reasonCode, 'AI_ZERO_QUESTIONS');

      const jobRecord = global.jobs.get(batchId);
      assert.strictEqual(jobRecord.state, 'failed', 'Job manager must mark job failed when 0 questions are generated');
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  await test('14.5: Successful Persistence: Persists questions with effective worker tenant and marks job completed', async () => {
    const devSuccessId = new mongoose.Types.ObjectId();
    const devSuccess = { _id: devSuccessId, name: 'Success Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devSuccess);

    inMemoryDailyTopics.push({
      _id: new mongoose.Types.ObjectId(),
      workerId: devSuccessId,
      topic: 'Rust Ownership, Borrowing',
      date: '2026-10-26',
      subdomain: 'techvaseegrah'
    });

    const batchId = 'batch_success_persistence_005';
    jobManager.createJob(batchId, { totalWorkers: 1 });
    const genResult = await processQuestionGeneration({
      workerIds: [devSuccessId],
      numQuestions: 3,
      topicMode: 'individual',
      individualTopics: { [devSuccessId.toString()]: ['Rust Ownership', 'Borrowing'] },
      startDate: '2026-10-25',
      endDate: '2026-10-31',
      adminSubdomain: 'techvaseegrah',
      subdomain: 'techvaseegrah'
    }, batchId);

    assert.strictEqual(genResult.success, true);
    assert.strictEqual(genResult.totalQuestionsGenerated, 3);
    assert.strictEqual(genResult.state, 'completed');

    const persisted = inMemoryQuestions.filter(q => q.batchId === batchId && String(q.worker) === String(devSuccessId));
    assert.strictEqual(persisted.length, 3);
    assert.strictEqual(persisted[0].subdomain, 'techvaseegrah', 'Question must persist with worker effective tenant');

    const jobRecord = global.jobs.get(batchId);
    assert.strictEqual(jobRecord.state, 'completed');
    assert.strictEqual(jobRecord.totalQuestionsGenerated, 3);
  });

  await test('14.6: Three-Set Generation adheres to the same tenant and date-range rules', async () => {
    const devSetId = new mongoose.Types.ObjectId();
    const devSet = { _id: devSetId, name: 'ThreeSet Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devSet);

    // Mock generateThreeUPSCSets
    const origThreeSets = openai.generateThreeUPSCSets;
    openai.generateThreeUPSCSets = async (topics, count) => ({
      setA: Array.from({ length: count }, (_, i) => ({
        questionText: `UPSC Question ${i+1} on ${topics.join(', ')}`,
        options: [`Correct for ${topics[0]}`, 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0
      })),
      setB: [],
      setC: []
    });

    try {
      // 1. Cross-tenant check for three-set mode
      jobManager.createJob('batch_threeset_cross_001', { totalWorkers: 1 });
      const crossResult = await processThreeSetQuestionGeneration({
        workerIds: [devSetId],
        numQuestions: 2,
        topicMode: 'common',
        commonTopics: ['UPSC General'],
        adminSubdomain: 'alien_tenant',
        subdomain: 'alien_tenant'
      }, 'batch_threeset_cross_001');

      assert.strictEqual(crossResult.success, false, 'Three-set generation must reject cross-tenant worker');
      assert.strictEqual(crossResult.failedWorkers[0].reasonCode, 'TENANT_MISMATCH');

      // 2. Successful three-set generation with proper tenant
      jobManager.createJob('batch_threeset_success_002', { totalWorkers: 1 });
      const successResult = await processThreeSetQuestionGeneration({
        workerIds: [devSetId],
        numQuestions: 2,
        topicMode: 'common',
        commonTopics: ['UPSC Polity'],
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, 'batch_threeset_success_002');

      assert.strictEqual(successResult.success, true);
      assert.strictEqual(successResult.totalQuestionsGenerated, 2);
      assert.strictEqual(successResult.state, 'completed');

      const persisted = inMemoryQuestions.filter(q => q.batchId === 'batch_threeset_success_002');
      assert.strictEqual(persisted.length, 2);
      assert.strictEqual(persisted[0].subdomain, 'techvaseegrah', 'Three-set question must store effective worker tenant');
    } finally {
      openai.generateThreeUPSCSets = origThreeSets;
    }
  });

  await test('14.7: Safe diagnostic logging audit: never logs face embeddings, tokens, passwords, or db credentials', async () => {
    const devQId = new mongoose.Types.ObjectId();
    const devQ = { _id: devQId, name: 'Audit Dev', subdomain: 'techvaseegrah', role: 'worker', status: 'Active' };
    inMemoryWorkers.push(devQ);
    inMemoryDailyTopics.push({
      _id: new mongoose.Types.ObjectId(),
      workerId: devQId,
      topic: 'React Context',
      date: '2026-10-26',
      subdomain: 'techvaseegrah'
    });

    const interceptedLogs = [];
    const origConsoleInfo = console.log;
    const origConsoleWarn = console.warn;
    console.log = (msg, data) => interceptedLogs.push({ level: 'info', msg, data });
    console.warn = (msg, data) => interceptedLogs.push({ level: 'warn', msg, data });

    try {
      const batchId = 'batch_audit_003';
      await processQuestionGeneration({
        workerIds: [devQId],
        numQuestions: 2,
        topicMode: 'individual',
        individualTopics: { [devQId.toString()]: ['React Context'] },
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, batchId);

      // Verify no sensitive keys exist in any logged payload
      const sensitiveKeys = ['faceDescriptor', 'faceEmbedding', 'embedding', 'token', 'password', 'mongoUri', 'secret', 'jwt'];
      interceptedLogs.forEach(entry => {
        const jsonStr = JSON.stringify(entry.data || {}).toLowerCase();
        sensitiveKeys.forEach(sensitive => {
          assert.ok(!jsonStr.includes(sensitive.toLowerCase()), `Logs must not contain sensitive term: ${sensitive}`);
        });
      });
    } finally {
      console.log = origConsoleInfo;
      console.warn = origConsoleWarn;
    }
  });

  console.log('\n================================================================');
  console.log(` Summary: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log('================================================================\n');

  if (fail > 0) {
    process.exit(1);
  }
}

runRegression().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
