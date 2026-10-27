/**
 * Safe Runtime Readiness Verification (Isolated Fixtures Only)
 * 
 * Verifies full sequence:
 * 1. Admin generation request (POST /api/test/questions/generate)
 * 2. Job status polling contract (GET /api/jobs/status/:jobId)
 * 3. Persisted question database contract
 * 4. Available test batches retrieval (GET /api/test/available/:workerId)
 * 5. Retrieval of selected batch questions (GET /api/test/questions/:workerId?batchId=...)
 * 
 * Zero external API calls, zero production DB mutations.
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
const { processQuestionGeneration } = require('../utils/questionProcessor');
const { getQuestionsForTest, generateAndStoreQuestions } = require('../controllers/questionController');
const { getAvailableTests } = require('../controllers/testController');

console.log('================================================================');
console.log(' Tech Ciphergate — Safe Runtime-Readiness Verification          ');
console.log('================================================================\n');

// In-memory data store
let inMemoryWorkers = [];
let inMemoryQuestions = [];
let inMemoryDailyTopics = [];
let inMemoryTestAttempts = [];

// Setup isolated Mongoose mocks
Worker.find = (query = {}) => {
  let list = [...inMemoryWorkers];
  if (query._id && query._id.$in) {
    const stringIds = query._id.$in.map(id => id.toString());
    list = list.filter(w => stringIds.includes(w._id.toString()));
  }
  if (query.subdomain) {
    list = list.filter(w => w.subdomain === query.subdomain);
  }
  return {
    select: () => list,
    lean: async () => list,
    then: (resolve) => resolve(list)
  };
};

Worker.findById = async (id) => {
  return inMemoryWorkers.find(w => w._id.toString() === id.toString()) || null;
};

Question.find = (query = {}) => {
  let list = [...inMemoryQuestions];
  if (query.worker) {
    list = list.filter(q => q.worker.toString() === query.worker.toString());
  }
  if (query.batchId) {
    if (query.batchId.$exists && query.batchId.$ne === null) {
      list = list.filter(q => q.batchId != null);
    }
    if (query.batchId.$nin) {
      list = list.filter(q => !query.batchId.$nin.includes(q.batchId));
    } else if (typeof query.batchId === 'string') {
      list = list.filter(q => q.batchId === query.batchId);
    }
  }
  if (query._id && query._id.$in) {
    const idStrings = query._id.$in.map(id => id.toString());
    list = list.filter(q => idStrings.includes(q._id.toString()));
  }
  return {
    sort: (sortObj) => ({
      lean: async () => list,
      then: (resolve) => resolve(list)
    }),
    then: (resolve) => resolve(list)
  };
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
  for (const doc of docs) {
    inMemoryQuestions.push({
      _id: doc._id || new mongoose.Types.ObjectId(),
      ...doc,
      createdAt: doc.createdAt || new Date()
    });
  }
  return docs;
};

DailyTopic.find = (query = {}) => {
  let list = [...inMemoryDailyTopics];
  if (query.workerId) {
    list = list.filter(t => t.workerId.toString() === query.workerId.toString());
  }
  if (query.subdomain) {
    list = list.filter(t => t.subdomain === query.subdomain);
  }
  if (query.date) {
    if (query.date.$gte) list = list.filter(t => t.date >= query.date.$gte);
    if (query.date.$lte) list = list.filter(t => t.date <= query.date.$lte);
  }
  return {
    sort: () => ({
      limit: () => ({
        lean: async () => list,
        then: (resolve) => resolve(list)
      }),
      lean: async () => list,
      then: (resolve) => resolve(list)
    }),
    lean: async () => list,
    then: (resolve) => resolve(list)
  };
};

DailyTopic.findOne = (query = {}) => {
  let item = inMemoryDailyTopics.find(t => {
    let match = true;
    if (query.workerId && t.workerId.toString() !== query.workerId.toString()) match = false;
    if (query.subdomain && t.subdomain !== query.subdomain) match = false;
    return match;
  });
  return {
    lean: async () => item || null,
    then: (resolve) => resolve(item || null)
  };
};

TestAttempt.find = (query = {}) => {
  let list = [...inMemoryTestAttempts];
  if (query.worker) list = list.filter(a => a.worker.toString() === query.worker.toString());
  if (query.status) list = list.filter(a => a.status === query.status);
  return {
    select: () => list,
    lean: async () => list,
    then: (resolve) => resolve(list)
  };
};

TestAttempt.findOne = async (query = {}) => {
  return inMemoryTestAttempts.find(a => {
    let match = true;
    if (query.worker && a.worker.toString() !== query.worker.toString()) match = false;
    if (query.batchId && a.batchId !== query.batchId) match = false;
    if (query.status && a.status !== query.status) match = false;
    return match;
  }) || null;
};

TestAttempt.create = async (doc) => {
  const attempt = {
    _id: new mongoose.Types.ObjectId(),
    ...doc,
    status: doc.status || 'in-progress',
    testStartTime: new Date(),
    createdAt: new Date(),
    save: async function() { return this; }
  };
  inMemoryTestAttempts.push(attempt);
  return attempt;
};

TestAttempt.updateMany = async (filter, update) => {
  for (const a of inMemoryTestAttempts) {
    if (filter.worker && a.worker.toString() === filter.worker.toString()) {
      if (!filter.status || a.status === filter.status) {
        Object.assign(a, update);
      }
    }
  }
};

mongoose.startSession = async () => ({
  withTransaction: async (fn) => fn(),
  endSession: async () => {}
});

// Mock AI question generator
openai.generateMCQQuestions = async (topics, count) => {
  const res = {};
  for (const topic of topics) {
    res[topic] = Array.from({ length: count }, (_, i) => ({
      questionText: `What is a core feature of ${topic}? (${i + 1})`,
      options: ['Option A (Correct)', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
      difficulty: 'Medium'
    }));
  }
  return res;
};

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

async function runRuntimeReadiness() {
  const workerId = new mongoose.Types.ObjectId('69fc424fdc18f098aa426a33');
  const worker = {
    _id: workerId,
    name: 'Adhithya Developer',
    role: 'worker',
    subdomain: 'techvaseegrah',
    status: 'Active'
  };
  inMemoryWorkers.push(worker);

  // Daily topics in date range
  inMemoryDailyTopics.push({
    _id: new mongoose.Types.ObjectId(),
    workerId: workerId,
    topic: 'React Hooks, State Management',
    date: '2026-10-26',
    subdomain: 'techvaseegrah'
  });

  console.log('--- Step 1: Generation Request (Admin to Developer) ---');
  const adminReq = mockReq(
    { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'techvaseegrah' },
    {},
    {},
    {
      workerIds: [workerId.toString()],
      numQuestions: 2,
      difficulty: 'Medium',
      timeDuration: 15,
      totalTestDuration: 300,
      topicMode: 'individual',
      individualTopics: { [workerId.toString()]: ['React Hooks', 'State Management'] },
      startDate: '2026-10-25',
      endDate: '2026-10-31',
      allowHistoricalFallback: false,
      questionFormat: 'mcq',
      answerFeedback: true
    }
  );
  const adminRes = mockRes();

  // Run the validator & controller
  const validator = generateAndStoreQuestions[0];
  const controller = generateAndStoreQuestions[1];

  let nextCalled = false;
  await validator(adminReq, adminRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Validation middleware must pass');

  await controller(adminReq, adminRes);
  assert.strictEqual(adminRes.statusCode, 202, 'Generation request must return HTTP 202 Accepted');
  assert.ok(adminRes.data.jobId, 'Response must contain jobId');
  assert.strictEqual(typeof adminRes.data.jobId, 'string');
  const generatedJobId = adminRes.data.jobId;
  console.log(`✓ [PASS] Step 1: HTTP 202 with jobId: ${generatedJobId}`);

  console.log('\n--- Step 2: Background Processing & Job Status Contract ---');
  // Await completion of the job started by the controller
  let jobStatus = null;
  for (let i = 0; i < 50; i++) {
    jobStatus = jobManager.getJob(generatedJobId);
    if (jobStatus && (jobStatus.state === 'completed' || jobStatus.state === 'failed' || jobStatus.state === 'partial_failure')) {
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  assert.ok(jobStatus, 'Job record must exist in jobManager');
  assert.strictEqual(jobStatus.id, generatedJobId, 'Job ID must match requested batchId');
  assert.strictEqual(jobStatus.state, 'completed');
  assert.strictEqual(jobStatus.progress, 100);
  assert.strictEqual(jobStatus.totalQuestionsGenerated, 2);
  assert.strictEqual(jobStatus.completedWorkers.length, 1);
  assert.strictEqual(jobStatus.failedWorkers.length, 0);
  assert.ok(jobStatus.returnValue, 'Job must include returnValue contract');
  console.log(`✓ [PASS] Step 2: Job Status Contract: state="${jobStatus.state}", totalQuestionsGenerated=${jobStatus.totalQuestionsGenerated}`);

  console.log('\n--- Step 3: Persisted Question Contract in DB ---');
  const persisted = inMemoryQuestions.filter(q => q.batchId === generatedJobId);
  assert.strictEqual(persisted.length, 2, 'Exactly 2 questions must be persisted');
  assert.strictEqual(persisted[0].worker.toString(), workerId.toString(), 'Worker ID must match target');
  assert.strictEqual(persisted[0].subdomain, 'techvaseegrah', 'Question subdomain must match worker effective tenant');
  assert.ok(persisted[0].questionText.includes('React Hooks'), 'Topic concept must match');
  console.log(`✓ [PASS] Step 3: Database contract verified: batchId="${generatedJobId}", subdomain="techvaseegrah", count=2`);

  console.log('\n--- Step 4: Available Test Batches (Worker Endpoint) ---');
  const workerReq = mockReq(
    { _id: workerId, role: 'worker', subdomain: 'techvaseegrah' },
    { workerId: workerId.toString() }
  );
  const workerRes = mockRes();
  await getAvailableTests(workerReq, workerRes);

  assert.strictEqual(workerRes.statusCode, 200);
  assert.ok(Array.isArray(workerRes.data));
  assert.strictEqual(workerRes.data.length, 1);
  const availableBatch = workerRes.data[0];
  assert.strictEqual(availableBatch.batchId, generatedJobId, 'Available batchId must match generated jobId');
  assert.strictEqual(availableBatch.questionCount, 2);
  assert.strictEqual(availableBatch.status, 'available');
  assert.ok(availableBatch.topic.includes('React Hooks'));
  console.log(`✓ [PASS] Step 4: Available batches contract: batchId="${availableBatch.batchId}", status="${availableBatch.status}", questions=${availableBatch.questionCount}`);

  console.log('\n--- Step 5: Retrieve Questions for Selected Batch ---');
  const batchReq = mockReq(
    { _id: workerId, role: 'worker', subdomain: 'techvaseegrah' },
    { workerId: workerId.toString() },
    { batchId: generatedJobId }
  );
  const batchRes = mockRes();
  await getQuestionsForTest(batchReq, batchRes);

  assert.strictEqual(batchRes.statusCode, 200);
  assert.strictEqual(batchRes.data.batchId, generatedJobId, 'Returned batchId must match selected batch');
  assert.ok(batchRes.data.testAttemptId, 'Must create and return testAttemptId');
  assert.strictEqual(batchRes.data.questions.length, 2);
  assert.strictEqual(batchRes.data.reason, 'questions_available');
  assert.strictEqual(batchRes.data.status, 'in-progress');
  console.log(`✓ [PASS] Step 5: Batch retrieval contract: batchId="${batchRes.data.batchId}", testAttemptId="${batchRes.data.testAttemptId}", count=${batchRes.data.questions.length}`);

  console.log('\n================================================================');
  console.log(' ALL 5 STAGES OF THE RUNTIME CONTRACT VERIFIED SUCCESSFULLY     ');
  console.log('================================================================');
}

runRuntimeReadiness().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
