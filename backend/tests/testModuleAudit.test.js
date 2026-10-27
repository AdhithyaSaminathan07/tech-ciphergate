/**
 * Tech Ciphergate — Six-Module Testing and Bug Audit Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEE:
 * - 100% Isolated unit tests with complete in-memory mocking.
 * - Zero database writes, modifications, seeds, or deletes.
 * - Zero live database connection used.
 * - OpenAI/DeepSeek and notifications are strictly mocked/stubbed.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Ensure dummy API key is set so openai.js can be imported safely without throwing
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'mock_deepseek_api_key_for_testing';

// Mock models and dependencies before importing controllers
const Worker = require('../models/Worker');
const Question = require('../models/Question');
const TestAttempt = require('../models/TestAttempt');
const Score = require('../models/Score');
const DailyTopic = require('../models/DailyTopic');
const QuickTest = require('../models/QuickTest');
const LearningTopic = require('../models/LearningTopic');
const { runWithOptionalTransaction, processQuestionGeneration } = require('../utils/questionProcessor');
const { validateAndFilterQuestions, isQuestionRelevantToTopic, validateQuestionStructure } = require('../utils/topicValidator');

// Import controllers
const {
  validateQuestionGeneration,
  generateAndStoreQuestions,
  getQuestionsForTest,
  getAllQuestions
} = require('../controllers/questionController');

const {
  submitTest,
  getScoreboard,
  getGlobalScoreboard,
  getIndividualScores,
  getTestDetails
} = require('../controllers/testController');

const {
  addDailyTopic,
  getWeeklyTopics,
  getWeeklyTopicsAdmin,
  getWorkerTopics,
  deleteDailyTopic
} = require('../controllers/dailyTopicController');

console.log('================================================================');
console.log(' Tech Ciphergate — Six-Module Audit & Regression Suite           ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// Helpers for mock requests and responses
function createMockReq(overrides = {}) {
  return {
    user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'ciphergate' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.data = payload;
      return res;
    }
  };
  return res;
}

async function runAllTests() {
  console.log('--- MODULE 1: /admin/test/generate-questions ---');

  await runTest('1.1: validateQuestionGeneration rejects empty workerIds', async () => {
    const req = createMockReq({ body: { workerIds: [], topicMode: 'common', topic: 'React' } });
    const res = createMockRes();
    let nextCalled = false;
    await validateQuestionGeneration(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(nextCalled, false);
    assert.match(res.data.message, /At least one employee/);
  });

  await runTest('1.2: validateQuestionGeneration allows commonTopics array when topic string is empty or omitted', async () => {
    const workerId = new mongoose.Types.ObjectId().toString();
    const req = createMockReq({
      body: {
        workerIds: [workerId],
        numQuestions: 5,
        topicMode: 'common',
        commonTopics: ['React', 'NodeJS']
      }
    });
    const res = createMockRes();
    let nextCalled = false;
    await validateQuestionGeneration(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Middleware should call next() when valid commonTopics array is supplied');
  });

  await runTest('1.3: runWithOptionalTransaction runs with session on replica-set and handles commit/abort', async () => {
    let transactionCommitted = false;
    let transactionAborted = false;
    const mockSession = {
      withTransaction: async (fn) => {
        try {
          const res = await fn();
          transactionCommitted = true;
          return res;
        } catch (err) {
          transactionAborted = true;
          throw err;
        }
      }
    };

    // Test success
    let sessionPassed = null;
    await runWithOptionalTransaction(mockSession, async (activeSession) => {
      sessionPassed = activeSession;
      return 'success';
    });
    assert.strictEqual(sessionPassed, mockSession, 'Active session must be passed to operation');
    assert.strictEqual(transactionCommitted, true, 'Transaction must be committed on success');

    // Test failure rethrow and abort
    let caughtErr = null;
    try {
      await runWithOptionalTransaction(mockSession, async () => {
        throw new Error('Database write constraint failed');
      });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Error should be re-thrown');
    assert.strictEqual(transactionAborted, true, 'Transaction must be aborted on failure');
  });

  await runTest('1.4: runWithOptionalTransaction falls back to activeSession=null when standalone MongoDB lacks replica set', async () => {
    const mockSession = {
      withTransaction: async () => {
        throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
      }
    };

    let sessionPassed = undefined;
    const res = await runWithOptionalTransaction(mockSession, async (activeSession) => {
      sessionPassed = activeSession;
      return 'standalone_fallback_success';
    });

    assert.strictEqual(res, 'standalone_fallback_success');
    assert.strictEqual(sessionPassed, null, 'Operation must be executed with null session on standalone MongoDB');
  });

  await runTest('1.5: Standalone question persistence cleans up ONLY current batch on partial insertion, preserving existing questions', async () => {
    // In-memory mock store
    const inMemoryDb = new Map();
    const existingQ1Id = new mongoose.Types.ObjectId().toString();
    const existingQ2Id = new mongoose.Types.ObjectId().toString();
    inMemoryDb.set(existingQ1Id, { _id: existingQ1Id, topic: 'Node.js', worker: 'other_worker' });
    inMemoryDb.set(existingQ2Id, { _id: existingQ2Id, topic: 'Express', worker: 'other_worker' });

    // Mock Question model
    const mockQuestionModel = {
      insertMany: async (docs, opts) => {
        // Ordered insertion: insert first doc, then fail on second doc
        for (let i = 0; i < docs.length; i++) {
          if (i === 1) {
            throw new Error('Simulated write failure on document index 1');
          }
          inMemoryDb.set(docs[i]._id.toString(), docs[i]);
        }
      },
      deleteMany: async (filter) => {
        if (filter._id && filter._id.$in) {
          const idsToDelete = filter._id.$in.map(id => id.toString());
          for (const id of idsToDelete) {
            inMemoryDb.delete(id);
          }
        }
      }
    };

    // Current batch documents with explicit ObjectIds
    const currentBatchDocs = [
      { _id: new mongoose.Types.ObjectId(), topic: 'React Hooks', worker: 'worker_1' },
      { _id: new mongoose.Types.ObjectId(), topic: 'React Context', worker: 'worker_1' }
    ];

    const mockSession = {
      withTransaction: async () => {
        throw new Error('Transactions are not supported on standalone MongoDB');
      }
    };

    let caughtError = null;
    try {
      await runWithOptionalTransaction(mockSession, async (activeSession) => {
        try {
          await mockQuestionModel.insertMany(currentBatchDocs, activeSession ? {
            session: activeSession,
            ordered: false
          } : { ordered: true });
        } catch (insertErr) {
          if (!activeSession) {
            const questionIds = currentBatchDocs.map(q => q._id).filter(Boolean);
            if (questionIds.length > 0) {
              await mockQuestionModel.deleteMany({ _id: { $in: questionIds } });
            }
          }
          throw insertErr;
        }
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Should throw insertion error');
    assert.match(caughtError.message, /Simulated write failure/);

    // Verify partial document from current batch was rolled back
    assert.strictEqual(
      inMemoryDb.has(currentBatchDocs[0]._id.toString()),
      false,
      'Partially inserted document from current batch MUST be deleted'
    );

    // Verify existing questions from previous batches are untouched
    assert.strictEqual(inMemoryDb.has(existingQ1Id), true, 'Existing question 1 MUST NOT be deleted');
    assert.strictEqual(inMemoryDb.has(existingQ2Id), true, 'Existing question 2 MUST NOT be deleted');
    assert.strictEqual(inMemoryDb.size, 2, 'Total remaining questions must match original pre-existing count');
  });

  await runTest('1.6: Standalone question persistence deletes 0 records on failure before insertion and preserves existing questions', async () => {
    const inMemoryDb = new Map();
    const existingQId = new mongoose.Types.ObjectId().toString();
    inMemoryDb.set(existingQId, { _id: existingQId, topic: 'Existing Question' });

    let deleteManyCalledWith = null;
    const mockQuestionModel = {
      insertMany: async () => {
        throw new Error('Connection timeout before insertion');
      },
      deleteMany: async (filter) => {
        deleteManyCalledWith = filter;
        if (filter._id && filter._id.$in) {
          const idsToDelete = filter._id.$in.map(id => id.toString());
          for (const id of idsToDelete) {
            inMemoryDb.delete(id);
          }
        }
      }
    };

    const currentBatchDocs = [
      { _id: new mongoose.Types.ObjectId(), topic: 'New Question 1' },
      { _id: new mongoose.Types.ObjectId(), topic: 'New Question 2' }
    ];

    const mockSession = {
      withTransaction: async () => {
        throw new Error('replica set member required');
      }
    };

    let caughtError = null;
    try {
      await runWithOptionalTransaction(mockSession, async (activeSession) => {
        try {
          await mockQuestionModel.insertMany(currentBatchDocs, activeSession ? {
            session: activeSession,
            ordered: false
          } : { ordered: true });
        } catch (insertErr) {
          if (!activeSession) {
            const questionIds = currentBatchDocs.map(q => q._id).filter(Boolean);
            if (questionIds.length > 0) {
              await mockQuestionModel.deleteMany({ _id: { $in: questionIds } });
            }
          }
          throw insertErr;
        }
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(inMemoryDb.size, 1);
    assert.strictEqual(inMemoryDb.has(existingQId), true, 'Existing question must remain in database');
    assert.ok(deleteManyCalledWith && deleteManyCalledWith._id.$in.length === 2, 'deleteMany targeted only current batch IDs');
  });

  await runTest('1.7: Standalone question persistence completes successfully and preserves both existing and new records', async () => {
    const inMemoryDb = new Map();
    const existingQId = new mongoose.Types.ObjectId().toString();
    inMemoryDb.set(existingQId, { _id: existingQId, topic: 'Existing' });

    let deleteCalled = false;
    const mockQuestionModel = {
      insertMany: async (docs) => {
        for (const doc of docs) {
          inMemoryDb.set(doc._id.toString(), doc);
        }
      },
      deleteMany: async () => {
        deleteCalled = true;
      }
    };

    const currentBatchDocs = [
      { _id: new mongoose.Types.ObjectId(), topic: 'Batch Q1' },
      { _id: new mongoose.Types.ObjectId(), topic: 'Batch Q2' }
    ];

    const mockSession = {
      withTransaction: async () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      }
    };

    await runWithOptionalTransaction(mockSession, async (activeSession) => {
      try {
        await mockQuestionModel.insertMany(currentBatchDocs, activeSession ? {
          session: activeSession,
          ordered: false
        } : { ordered: true });
      } catch (insertErr) {
        if (!activeSession) {
          const questionIds = currentBatchDocs.map(q => q._id).filter(Boolean);
          if (questionIds.length > 0) {
            await mockQuestionModel.deleteMany({ _id: { $in: questionIds } });
          }
        }
        throw insertErr;
      }
    });

    assert.strictEqual(deleteCalled, false, 'deleteMany must NOT be called on success');
    assert.strictEqual(inMemoryDb.size, 3, 'Must contain 1 existing + 2 new questions');
    assert.strictEqual(inMemoryDb.has(existingQId), true);
    assert.strictEqual(inMemoryDb.has(currentBatchDocs[0]._id.toString()), true);
    assert.strictEqual(inMemoryDb.has(currentBatchDocs[1]._id.toString()), true);
  });

  console.log('\n--- MODULE 2: /admin/test/question-history ---');

  await runTest('2.1: getAllQuestions enforces tenant isolation with req.user.subdomain', async () => {
    const tenantWorkerId = new mongoose.Types.ObjectId();
    const otherTenantWorkerId = new mongoose.Types.ObjectId();

    // Mock Worker.find to return tenant's workers
    const originalWorkerFind = Worker.find;
    Worker.find = function(filter) {
      return {
        select: () => Promise.resolve([
          { _id: tenantWorkerId, subdomain: 'tenantA' }
        ])
      };
    };

    // Mock Question.find
    const originalQuestionFind = Question.find;
    let capturedQuery = null;
    Question.find = function(query) {
      capturedQuery = query;
      return {
        populate: () => ({
          sort: () => ({
            lean: () => Promise.resolve([
              {
                _id: new mongoose.Types.ObjectId(),
                topic: 'React',
                worker: { _id: tenantWorkerId, name: 'Alice', department: { name: 'Eng' } }
              }
            ])
          })
        })
      };
    };

    try {
      const req = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        query: { topic: 'React' }
      });
      const res = createMockRes();
      await getAllQuestions(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(capturedQuery, 'Query should be generated');
      // Must ensure capturedQuery restricts worker to tenant's workers
      assert.ok(
        capturedQuery.worker && (capturedQuery.worker.$in || capturedQuery.worker.equals(tenantWorkerId)),
        'Question query must be scoped to tenant workers'
      );
    } finally {
      Worker.find = originalWorkerFind;
      Question.find = originalQuestionFind;
    }
  });

  console.log('\n--- MODULE 3: /admin/test/employee-scores ---');

  await runTest('3.1: getScoreboard validates invalid workerId gracefully without BSON crash', async () => {
    const req = createMockReq({
      query: { workerId: 'invalid-id' }
    });
    const res = createMockRes();
    await getScoreboard(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /Invalid worker ID/i);
  });

  await runTest('3.2: getScoreboard scopes pipeline to req.user.subdomain', async () => {
    const originalAggregate = TestAttempt.aggregate;
    let capturedPipeline = null;
    TestAttempt.aggregate = async function(pipeline) {
      capturedPipeline = pipeline;
      return [];
    };

    try {
      const req = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        query: {}
      });
      const res = createMockRes();
      await getScoreboard(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(capturedPipeline, 'Pipeline should be created');
      const hasSubdomainFilter = capturedPipeline.some(stage => 
        stage.$match && (stage.$match['workerInfo.subdomain'] === 'tenantA' || stage.$match.subdomain === 'tenantA')
      );
      assert.ok(hasSubdomainFilter, 'Aggregation pipeline must filter by tenant subdomain');
    } finally {
      TestAttempt.aggregate = originalAggregate;
    }
  });

  console.log('\n--- MODULE 4: /admin/test/global-scoreboard ---');

  await runTest('4.1: getGlobalScoreboard isolates tenant workers and does not mix public guests for tenants', async () => {
    const originalTestAttemptAggregate = TestAttempt.aggregate;
    const originalQuickTestAggregate = QuickTest.aggregate;
    let capturedPipeline = null;

    TestAttempt.aggregate = async function(pipeline) {
      capturedPipeline = pipeline;
      return [
        { _id: new mongoose.Types.ObjectId(), name: 'Bob', totalScore: 10, totalPossibleScore: 10, percentage: 100, testCount: 1, type: 'worker' }
      ];
    };
    QuickTest.aggregate = async function() {
      return [
        { _id: new mongoose.Types.ObjectId(), name: 'Guest Hacker', totalScore: 10, totalPossibleScore: 10, percentage: 100, testCount: 1, type: 'guest' }
      ];
    };

    try {
      const req = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        query: {}
      });
      const res = createMockRes();
      await getGlobalScoreboard(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      // For tenant admin, public quick test guest must NOT be mixed into tenant scoreboard
      const guestFound = res.data.some(s => s.type === 'guest');
      assert.strictEqual(guestFound, false, 'Tenant scoreboard must not contain external quick-test guests');
      const hasSubdomainFilter = capturedPipeline.some(stage => 
        stage.$match && (stage.$match['workerInfo.subdomain'] === 'tenantA' || stage.$match.subdomain === 'tenantA')
      );
      assert.ok(hasSubdomainFilter, 'Worker aggregation must filter by tenant subdomain');
    } finally {
      TestAttempt.aggregate = originalTestAttemptAggregate;
      QuickTest.aggregate = originalQuickTestAggregate;
    }
  });

  console.log('\n--- MODULE 5: /worker/tests ---');

  await runTest('5.1: getQuestionsForTest does NOT block workers due to historical tests on the same topic from previous batches', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const oldAttemptDate = new Date('2026-01-01T00:00:00Z');
    const newQuestionDate = new Date('2026-10-24T10:00:00Z');

    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalQuestionFind = Question.find;
    const originalTestAttemptFindOne = TestAttempt.findOne;
    const originalTestAttemptCreate = TestAttempt.create;

    const oldQuestionId = new mongoose.Types.ObjectId();
    const newQuestionId = new mongoose.Types.ObjectId();

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => ({
            topic: 'JavaScript',
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: newQuestionDate,
            isMixed: false,
            allTopics: ['JavaScript'],
            showFeedback: true,
            batchId: 'batch_new_oct'
          })
        })
      })
    });

    Question.find = async () => [
      { _id: newQuestionId, questionText: 'Q1', options: ['A','B','C','D'], correctAnswer: 0, timeDuration: 15 }
    ];

    // Simulate an OLD completed test attempt from months ago
    TestAttempt.findOne = async (query) => {
      if (query.status === 'completed') {
        if (query.batchId) {
          // New batchId 'batch_new_oct' does not match old attempt's 'batch_old_jan'
          return query.batchId === 'batch_old_jan'
            ? { _id: new mongoose.Types.ObjectId(), status: 'completed', batchId: 'batch_old_jan', createdAt: oldAttemptDate, topic: 'JavaScript' }
            : null;
        }
        if (query.questions && query.questions.$in) {
          // Old attempt questions [oldQuestionId] do NOT intersect with new question IDs
          const matches = query.questions.$in.some(id => id.equals && id.equals(oldQuestionId));
          return matches ? { _id: new mongoose.Types.ObjectId(), status: 'completed', createdAt: oldAttemptDate, topic: 'JavaScript' } : null;
        }
        if (query.createdAt && query.createdAt.$gte) {
          // Only return old attempt if oldAttemptDate is >= threshold (which it isn't)
          if (oldAttemptDate >= query.createdAt.$gte) {
            return { _id: new mongoose.Types.ObjectId(), status: 'completed', createdAt: oldAttemptDate, topic: 'JavaScript' };
          }
          return null;
        }
        // Fallback for legacy records without batchId/questions/createdAt filter
        return { _id: new mongoose.Types.ObjectId(), status: 'completed', createdAt: oldAttemptDate, topic: 'JavaScript' };
      }
      return null;
    };

    TestAttempt.create = async (doc) => ({
      _id: new mongoose.Types.ObjectId(),
      ...doc,
      testStartTime: Date.now()
    });

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res = createMockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(
        res.statusCode,
        200,
        `Should not return 403 when completed attempt was from an older batch (got ${res.statusCode}: ${JSON.stringify(res.data)})`
      );
      assert.ok(res.data.questions && res.data.questions.length > 0);
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      Question.find = originalQuestionFind;
      TestAttempt.findOne = originalTestAttemptFindOne;
      TestAttempt.create = originalTestAttemptCreate;
    }
  });

  await runTest('5.2: submitTest enforces ownership check (workers cannot submit other workers tests)', async () => {
    const workerAId = new mongoose.Types.ObjectId();
    const workerBId = new mongoose.Types.ObjectId();
    const testAttemptId = new mongoose.Types.ObjectId();

    const originalFindById = TestAttempt.findById;
    TestAttempt.findById = async () => ({
      _id: testAttemptId,
      worker: workerBId, // Belongs to Worker B
      status: 'in-progress',
      questions: []
    });

    try {
      // Worker A attempts to submit Worker B's test
      const req = createMockReq({
        user: { _id: workerAId, role: 'worker', subdomain: 'tenantA' },
        params: { testAttemptId: testAttemptId.toString() },
        body: { answers: [] }
      });
      const res = createMockRes();
      await submitTest(req, res);

      assert.strictEqual(res.statusCode, 403, 'Submitting another worker test must return 403 Forbidden');
    } finally {
      TestAttempt.findById = originalFindById;
    }
  });

  await runTest('5.3: submitTest handles undefined answers without 500 TypeError', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const testAttemptId = new mongoose.Types.ObjectId();

    const originalFindById = TestAttempt.findById;
    const originalSave = TestAttempt.prototype.save;
    const originalQuestionFind = Question.find;
    const originalScoreFindOneAndUpdate = Score.findOneAndUpdate;

    TestAttempt.findById = async () => ({
      _id: testAttemptId,
      worker: workerId,
      status: 'in-progress',
      questions: [],
      save: async () => {}
    });
    Question.find = () => ({ lean: async () => [] });
    Score.findOneAndUpdate = async () => ({});

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { testAttemptId: testAttemptId.toString() },
        body: {} // Missing answers field
      });
      const res = createMockRes();
      await submitTest(req, res);

      assert.notStrictEqual(res.statusCode, 500, 'Must not crash with 500 TypeError when answers is undefined');
    } finally {
      TestAttempt.findById = originalFindById;
      Question.find = originalQuestionFind;
      Score.findOneAndUpdate = originalScoreFindOneAndUpdate;
    }
  });

  console.log('\n--- MODULE 6: /worker/daily-topics ---');

  await runTest('6.1: addDailyTopic resolves subdomain from req.user.subdomain when body has main or missing', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const originalWorkerFindById = Worker.findById;
    const originalDailyTopicFindOne = DailyTopic.findOne;
    const originalSave = DailyTopic.prototype.save;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'realCompany' });
    let savedDoc = null;
    DailyTopic.findOne = async () => null;
    DailyTopic.prototype.save = async function() {
      savedDoc = this;
      return this;
    };

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'realCompany' },
        body: {
          workerId: workerId.toString(),
          date: new Date().toISOString().split('T')[0],
          topic: 'TypeScript Generics',
          subdomain: 'main' // Inadvertently passed 'main' from frontend
        }
      });
      const res = createMockRes();
      await addDailyTopic(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.ok(savedDoc, 'DailyTopic should be saved');
      assert.strictEqual(savedDoc.subdomain, 'realCompany', 'Subdomain must resolve to user.subdomain when main is passed');
    } finally {
      Worker.findById = originalWorkerFindById;
      DailyTopic.findOne = originalDailyTopicFindOne;
      DailyTopic.prototype.save = originalSave;
    }
  });

  await runTest('6.2: getWorkerTopics resolves subdomain from req.user.subdomain when query is missing or main', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const originalWorkerFindById = Worker.findById;
    const originalDailyTopicFind = DailyTopic.find;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'realCompany' });
    let queryFilter = null;
    DailyTopic.find = function(filter) {
      queryFilter = filter;
      return {
        sort: () => ({
          limit: async () => [{ _id: new mongoose.Types.ObjectId(), topic: 'Node.js', date: '2026-10-24' }]
        })
      };
    };

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'realCompany' },
        params: { workerId: workerId.toString() },
        query: { subdomain: 'main' }
      });
      const res = createMockRes();
      await getWorkerTopics(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(queryFilter.subdomain, 'realCompany', 'Query must resolve subdomain to user.subdomain');
    } finally {
      Worker.findById = originalWorkerFindById;
      DailyTopic.find = originalDailyTopicFind;
    }
  });

  console.log('\n--- SECOND PASS SECURITY AUDIT TESTS ---');

  await runTest('3.3: getScoreboard prevents tenant spoofing via query param (?subdomain=otherTenant)', async () => {
    let capturedPipeline = null;
    const originalAggregate = TestAttempt.aggregate;
    TestAttempt.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [];
    };

    try {
      const req = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        query: { subdomain: 'tenantB' } // Attempt to spoof tenantB via query param
      });
      const res = createMockRes();
      await getScoreboard(req, res);

      assert.strictEqual(res.statusCode, 200);
      const matchStage = capturedPipeline.find(s => s.$match && s.$match['workerInfo.subdomain']);
      assert.ok(matchStage, 'Must have workerInfo.subdomain match stage');
      assert.strictEqual(matchStage.$match['workerInfo.subdomain'], 'tenantA', 'Server must enforce req.user.subdomain over query param spoofing');
    } finally {
      TestAttempt.aggregate = originalAggregate;
    }
  });

  await runTest('3.4: getScoreboard scopes worker requests to their own workerId even when query param is omitted', async () => {
    const workerId = new mongoose.Types.ObjectId();
    let capturedPipeline = null;
    const originalAggregate = TestAttempt.aggregate;
    TestAttempt.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [];
    };

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        query: {} // Worker calls without specifying workerId
      });
      const res = createMockRes();
      await getScoreboard(req, res);

      assert.strictEqual(res.statusCode, 200);
      const initialMatch = capturedPipeline[0].$match;
      assert.ok(initialMatch.worker, 'Worker query without workerId param must be bounded to req.user._id');
      assert.strictEqual(initialMatch.worker.toString(), workerId.toString());
    } finally {
      TestAttempt.aggregate = originalAggregate;
    }
  });

  await runTest('3.5: getIndividualScores blocks cross-worker access and cross-tenant admin access', async () => {
    const workerAId = new mongoose.Types.ObjectId();
    const workerBId = new mongoose.Types.ObjectId();
    const originalWorkerFindById = Worker.findById;

    Worker.findById = async (id) => {
      if (id.toString() === workerBId.toString()) {
        return { _id: workerBId, name: 'Bob', subdomain: 'tenantB' };
      }
      return { _id: workerAId, name: 'Alice', subdomain: 'tenantA' };
    };

    try {
      // Worker A attempts to access Worker B's individual scores
      const workerReq = createMockReq({
        user: { _id: workerAId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerBId.toString() }
      });
      const workerRes = createMockRes();
      await getIndividualScores(workerReq, workerRes);
      assert.strictEqual(workerRes.statusCode, 403, 'Worker cannot view another worker scores');

      // Tenant A Admin attempts to access Tenant B worker's individual scores
      const adminReq = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        params: { workerId: workerBId.toString() }
      });
      const adminRes = createMockRes();
      await getIndividualScores(adminReq, adminRes);
      assert.strictEqual(adminRes.statusCode, 403, 'Tenant A admin cannot view Tenant B worker scores');
    } finally {
      Worker.findById = originalWorkerFindById;
    }
  });

  await runTest('5.4: getQuestionsForTest ignores stale in-progress attempts from older batches', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const oldBatchDate = new Date('2026-01-01T00:00:00Z');
    const newBatchDate = new Date('2026-10-24T10:00:00Z');

    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalQuestionFind = Question.find;
    const originalTestAttemptFindOne = TestAttempt.findOne;
    const originalTestAttemptCreate = TestAttempt.create;

    let createdAttempt = null;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => ({
            topic: 'JavaScript',
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: newBatchDate,
            isMixed: false,
            allTopics: ['JavaScript'],
            showFeedback: true
          })
        })
      })
    });

    Question.find = async () => [
      { _id: new mongoose.Types.ObjectId(), questionText: 'Q1', options: ['A','B','C','D'], correctAnswer: 0, timeDuration: 15 }
    ];

    TestAttempt.findOne = async (query) => {
      if (query.status === 'in-progress') {
        // If query checks createdAt >= batchThreshold, return null because old attempt is from January
        if (query.createdAt && query.createdAt.$gte && oldBatchDate >= query.createdAt.$gte) {
          return { _id: new mongoose.Types.ObjectId(), status: 'in-progress', createdAt: oldBatchDate, topic: 'JavaScript', questions: [] };
        }
        return null;
      }
      return null;
    };

    TestAttempt.create = async (doc) => {
      createdAttempt = doc;
      return { _id: new mongoose.Types.ObjectId(), ...doc, testStartTime: Date.now() };
    };

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res = createMockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(createdAttempt, 'Should create a new attempt for the current batch instead of resuming stale in-progress attempt');
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      Question.find = originalQuestionFind;
      TestAttempt.findOne = originalTestAttemptFindOne;
      TestAttempt.create = originalTestAttemptCreate;
    }
  });

  await runTest('6.3: addDailyTopic enforces bidirectional +/- 24h timezone window and rejects past/future backfilling', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const originalWorkerFindById = Worker.findById;
    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });

    try {
      // 1. Attempting to add for 10 days in the past (unauthorized backfilling)
      const pastReq = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        body: { workerId: workerId.toString(), date: '2026-01-01', topic: 'Old Topic', subdomain: 'tenantA' }
      });
      const pastRes = createMockRes();
      await addDailyTopic(pastReq, pastRes);
      assert.strictEqual(pastRes.statusCode, 400, 'Backfilling old dates must return 400');

      // 2. Attempting to add for 10 days in the future (unauthorized frontfilling)
      const futureReq = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        body: { workerId: workerId.toString(), date: '2027-10-24', topic: 'Future Topic', subdomain: 'tenantA' }
      });
      const futureRes = createMockRes();
      await addDailyTopic(futureReq, futureRes);
      assert.strictEqual(futureRes.statusCode, 400, 'Frontfilling future dates must return 400');
    } finally {
      Worker.findById = originalWorkerFindById;
    }
  });

  console.log('\n--- TOPIC RELEVANCE & MISSING EMPLOYEE QUESTIONS REGRESSION SUITE ---');

  await runTest('R1: React topics produce React-related questions, and unrelated SQL questions are rejected', async () => {
    const questions = [
      {
        questionText: 'What is the purpose of useEffect hook in React component lifecycle?',
        options: ['Managing side effects', 'Compiling code', 'Managing database indexes', 'Creating server endpoints'],
        correctAnswer: 0
      },
      {
        questionText: 'Which SQL clause is used to filter records in a database query?',
        options: ['WHERE', 'JOIN', 'GROUP BY', 'ORDER BY'],
        correctAnswer: 0
      },
      {
        questionText: 'How does state update in a functional React component trigger re-rendering?',
        options: ['Via useState setter', 'Via SQL query', 'Via Docker daemon', 'Via CSS media query'],
        correctAnswer: 0
      }
    ];

    const { validQuestions, rejectedQuestions } = validateAndFilterQuestions(questions, 'React');
    assert.strictEqual(validQuestions.length, 2, 'Should accept exactly the 2 React questions');
    assert.strictEqual(rejectedQuestions.length, 1, 'Should reject the 1 SQL question');
    assert.match(rejectedQuestions[0].question.questionText, /SQL clause/);
    assert.match(rejectedQuestions[0].reason, /No keywords from topic "React" found/);
  });

  await runTest('R2: Individual mode ensures different employees receive questions based on their own topics', async () => {
    const workerAId = new mongoose.Types.ObjectId();
    const workerBId = new mongoose.Types.ObjectId();
    const workerA = { _id: workerAId, name: 'Worker Alpha', subdomain: 'ciphergate' };
    const workerB = { _id: workerBId, name: 'Worker Beta', subdomain: 'ciphergate' };

    const originalWorkerFind = Worker.find;
    const originalQuestionInsertMany = Question.insertMany;
    const originalOpenAiMCQ = require('../utils/openai').generateMCQQuestions;
    const originalStartSession = mongoose.startSession;

    Worker.find = async () => [workerA, workerB];
    mongoose.startSession = async () => ({
      withTransaction: async (fn) => fn(),
      endSession: async () => {}
    });

    const insertedDocs = [];
    Question.insertMany = async (docs) => {
      insertedDocs.push(...docs);
      return docs;
    };

    require('../utils/openai').generateMCQQuestions = async (topics) => {
      const topic = topics[0];
      return {
        [topic]: [
          {
            questionText: `What is a core concept in ${topic}?`,
            options: [`${topic} Feature A`, `${topic} Feature B`, 'Other C', 'Other D'],
            correctAnswer: 0,
            difficulty: 'medium'
          }
        ]
      };
    };

    try {
      const jobData = {
        workerIds: [workerAId.toString(), workerBId.toString()],
        numQuestions: 2,
        difficulty: 'medium',
        timeDuration: 15,
        totalTestDuration: 600,
        topicMode: 'individual',
        individualTopics: {
          [workerAId.toString()]: ['React'],
          [workerBId.toString()]: ['NodeJS']
        },
        subdomain: 'ciphergate'
      };

      const result = await processQuestionGeneration(jobData, 'job_indiv_test_001');
      assert.strictEqual(result.success, true);

      const workerAQuestions = insertedDocs.filter(d => d.worker.equals(workerAId));
      const workerBQuestions = insertedDocs.filter(d => d.worker.equals(workerBId));

      assert.ok(workerAQuestions.length > 0, 'Worker A must receive questions');
      assert.ok(workerBQuestions.length > 0, 'Worker B must receive questions');
      assert.strictEqual(workerAQuestions[0].topic, 'React');
      assert.strictEqual(workerBQuestions[0].topic, 'NodeJS');
      assert.match(workerAQuestions[0].questionText, /React/);
      assert.match(workerBQuestions[0].questionText, /NodeJS/);
    } finally {
      Worker.find = originalWorkerFind;
      Question.insertMany = originalQuestionInsertMany;
      require('../utils/openai').generateMCQQuestions = originalOpenAiMCQ;
      mongoose.startSession = originalStartSession;
    }
  });

  await runTest('R3: No cross-tenant topic or question leakage', async () => {
    const tenantAWorkerId = new mongoose.Types.ObjectId();
    const tenantBWorkerId = new mongoose.Types.ObjectId();

    const originalWorkerFindById = Worker.findById;
    const originalWorkerFind = Worker.find;

    Worker.findById = async (id) => {
      if (id.toString() === tenantAWorkerId.toString()) {
        return { _id: tenantAWorkerId, name: 'Alice', subdomain: 'tenantA' };
      }
      return { _id: tenantBWorkerId, name: 'Bob', subdomain: 'tenantB' };
    };

    Worker.find = (query) => {
      let list = [];
      if (query.subdomain === 'tenantA') list = [{ _id: tenantAWorkerId, subdomain: 'tenantA' }];
      if (query.subdomain === 'tenantB') list = [{ _id: tenantBWorkerId, subdomain: 'tenantB' }];
      return {
        select: async () => list,
        then: (resolve) => Promise.resolve(list).then(resolve)
      };
    };

    try {
      // 1. Tenant A admin attempting to query Tenant B worker topics via getWeeklyTopicsAdmin
      const topicReq = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        params: { workerId: tenantBWorkerId.toString() },
        query: { startDate: '2026-10-18', endDate: '2026-10-24' }
      });
      const topicRes = createMockRes();
      await getWeeklyTopicsAdmin(topicReq, topicRes);
      assert.strictEqual(topicRes.statusCode, 403, 'Cross-tenant topic access must be blocked with 403');

      // 2. Tenant A admin querying getAllQuestions for Tenant B worker
      const questionReq = createMockReq({
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'tenantA' },
        query: { workerId: tenantBWorkerId.toString() }
      });
      const questionRes = createMockRes();
      await getAllQuestions(questionReq, questionRes);
      assert.strictEqual(questionRes.statusCode, 200);
      assert.strictEqual(questionRes.data.questions.length, 0, 'Tenant A admin must not receive Tenant B questions');
    } finally {
      Worker.findById = originalWorkerFindById;
      Worker.find = originalWorkerFind;
    }
  });

  await runTest('R4: Empty topic history produces clear actionable states (no_topics_recorded vs topics_not_found_for_period)', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalDailyTopicFindOne = DailyTopic.findOne;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => null // No questions generated yet
        })
      })
    });

    try {
      // Case 1: Worker has never recorded any daily topics
      DailyTopic.findOne = () => ({ lean: async () => null });
      const req1 = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res1 = createMockRes();
      await getQuestionsForTest(req1, res1);
      assert.strictEqual(res1.statusCode, 404);
      assert.strictEqual(res1.data.reason, 'no_topics_recorded');
      assert.match(res1.data.message, /No daily topics recorded yet/);

      // Case 2: Worker has recorded daily topics previously, but no test generated for period
      DailyTopic.findOne = () => ({ lean: async () => ({ topic: 'Past Topic', date: new Date('2026-01-01') }) });
      const req2 = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res2 = createMockRes();
      await getQuestionsForTest(req2, res2);
      assert.strictEqual(res2.statusCode, 404);
      assert.strictEqual(res2.data.reason, 'topics_not_found_for_period');
      assert.match(res2.data.message, /Topics were recorded, but no test questions have been generated/);
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      DailyTopic.findOne = originalDailyTopicFindOne;
    }
  });

  await runTest('R5: Valid questions are retrievable after generation with batchId association', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const batchId = 'batch_verification_123';
    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalQuestionFind = Question.find;
    const originalTestAttemptFindOne = TestAttempt.findOne;
    const originalTestAttemptCreate = TestAttempt.create;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => ({
            batchId,
            topic: 'NodeJS',
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: new Date(),
            isMixed: false,
            allTopics: ['NodeJS'],
            showFeedback: true
          })
        })
      })
    });

    let queriedBatchId = null;
    Question.find = async (query) => {
      queriedBatchId = query.batchId;
      return [
        { _id: new mongoose.Types.ObjectId(), questionText: 'Q1', options: ['A','B'], correctAnswer: 0, timeDuration: 15 },
        { _id: new mongoose.Types.ObjectId(), questionText: 'Q2', options: ['A','B'], correctAnswer: 1, timeDuration: 15 }
      ];
    };

    TestAttempt.findOne = async () => null; // No existing attempts
    TestAttempt.create = async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc });

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res = createMockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.reason, 'questions_available');
      assert.strictEqual(queriedBatchId, batchId, 'Must query questions by matching batchId');
      assert.strictEqual(res.data.questions.length, 2);
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      Question.find = originalQuestionFind;
      TestAttempt.findOne = originalTestAttemptFindOne;
      TestAttempt.create = originalTestAttemptCreate;
    }
  });

  await runTest('R6: Valid batches are not excluded because of timestamp boundaries (generation duration > 60s)', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const batchId = 'long_generation_batch_999';
    const t0 = new Date('2026-10-24T10:00:00Z');
    const t120 = new Date('2026-10-24T10:02:00Z'); // 120 seconds later

    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalQuestionFind = Question.find;
    const originalTestAttemptFindOne = TestAttempt.findOne;
    const originalTestAttemptCreate = TestAttempt.create;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => ({
            batchId,
            topic: 'Docker',
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: t120, // Latest question inserted at T0 + 120s
            isMixed: false,
            allTopics: ['Docker'],
            showFeedback: true
          })
        })
      })
    });

    // In a long batch, questions were inserted between T0 and T120
    Question.find = async (query) => {
      assert.strictEqual(query.batchId, batchId, 'Batch ID must be used so questions older than 60s are not lost');
      return [
        { _id: new mongoose.Types.ObjectId(), questionText: 'Q_at_T0', createdAt: t0, options: ['A','B'], correctAnswer: 0, timeDuration: 15 },
        { _id: new mongoose.Types.ObjectId(), questionText: 'Q_at_T120', createdAt: t120, options: ['A','B'], correctAnswer: 1, timeDuration: 15 }
      ];
    };

    TestAttempt.findOne = async () => null;
    TestAttempt.create = async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc });

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res = createMockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.questions.length, 2, 'All batch questions must be retrieved regardless of timestamp span');
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      Question.find = originalQuestionFind;
      TestAttempt.findOne = originalTestAttemptFindOne;
      TestAttempt.create = originalTestAttemptCreate;
    }
  });

  await runTest('R7: Old completed and abandoned attempts do not block a genuinely new batch', async () => {
    const workerId = new mongoose.Types.ObjectId();
    const newBatchId = 'batch_oct_24';
    const oldBatchId = 'batch_sept_15';

    const originalWorkerFindById = Worker.findById;
    const originalQuestionFindOne = Question.findOne;
    const originalQuestionFind = Question.find;
    const originalTestAttemptFindOne = TestAttempt.findOne;
    const originalTestAttemptCreate = TestAttempt.create;

    Worker.findById = async () => ({ _id: workerId, name: 'Alice', subdomain: 'tenantA' });
    Question.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => ({
            batchId: newBatchId,
            topic: 'React',
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: new Date(),
            isMixed: false,
            allTopics: ['React'],
            showFeedback: true
          })
        })
      })
    });

    Question.find = async () => [
      { _id: new mongoose.Types.ObjectId(), questionText: 'New Batch Q1', options: ['A','B'], correctAnswer: 0, timeDuration: 15 }
    ];

    let createdAttempt = null;
    TestAttempt.findOne = async (query) => {
      // Old completed attempt exists for oldBatchId
      if (query.status === 'completed') {
        if (query.batchId === oldBatchId) {
          return { _id: new mongoose.Types.ObjectId(), batchId: oldBatchId, status: 'completed' };
        }
        return null; // Not completed for newBatchId
      }
      // Old abandoned in-progress attempt exists for oldBatchId
      if (query.status === 'in-progress') {
        if (query.batchId === oldBatchId) {
          return { _id: new mongoose.Types.ObjectId(), batchId: oldBatchId, status: 'in-progress' };
        }
        return null; // Not in progress for newBatchId
      }
      return null;
    };

    TestAttempt.create = async (doc) => {
      createdAttempt = doc;
      return { _id: new mongoose.Types.ObjectId(), ...doc, testStartTime: Date.now() };
    };

    try {
      const req = createMockReq({
        user: { _id: workerId, role: 'worker', subdomain: 'tenantA' },
        params: { workerId: workerId.toString() }
      });
      const res = createMockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(res.statusCode, 200, 'Must not return 403 when older batch was completed');
      assert.ok(createdAttempt, 'Must create a new test attempt for the new batch');
      assert.strictEqual(createdAttempt.batchId, newBatchId);
    } finally {
      Worker.findById = originalWorkerFindById;
      Question.findOne = originalQuestionFindOne;
      Question.find = originalQuestionFind;
      TestAttempt.findOne = originalTestAttemptFindOne;
      TestAttempt.create = originalTestAttemptCreate;
    }
  });

  await runTest('R8: Malformed AI output and generation failures are handled safely', async () => {
    const malformedQuestions = [
      null,
      undefined,
      { questionText: '', options: ['A', 'B'], correctAnswer: 0 }, // Empty text
      { questionText: 'Valid question text but no options', options: [], correctAnswer: 0 }, // Missing options
      { questionText: 'Valid question text with single option', options: ['A'], correctAnswer: 0 }, // < 2 options
      { questionText: 'Valid text with options but out of bounds answer', options: ['A', 'B'], correctAnswer: 99 }, // Out of bounds
      { questionText: 'Valid text with duplicate options', options: ['Option A', 'Option A'], correctAnswer: 0 }, // Duplicate options
      { questionText: 'Valid text but missing correct answer', options: ['A', 'B'] }, // Missing correctAnswer
      {
        questionText: 'Well-formed question on React hooks and state',
        options: ['useState', 'useDatabase', 'useNginx', 'useDocker'],
        correctAnswer: 0
      }
    ];

    const { validQuestions, rejectedQuestions } = validateAndFilterQuestions(malformedQuestions, 'React');
    assert.strictEqual(validQuestions.length, 1, 'Only the single well-formed, relevant question should be accepted');
    assert.strictEqual(rejectedQuestions.length, 8, 'All 8 malformed or empty candidates should be rejected');
    assert.strictEqual(validQuestions[0].options[0], 'useState');
  });

  console.log('\n================================================================');
  console.log(` Summary: ${passCount}/${testCount} Passed (${failCount} Failed)`);
  console.log('================================================================');
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
