/**
 * Tech Ciphergate — Final End-to-End Logic Verification
 * Workflow: Daily Topics → Generate Questions → Worker Test
 * 
 * Safety:
 * - 100% In-memory mocks and fixtures.
 * - Zero live database connection or mutations.
 * - Zero external AI or notification calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Ensure mock env
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'mock_deepseek_key';

const Worker = require('../models/Worker');
const Question = require('../models/Question');
const TestAttempt = require('../models/TestAttempt');
const DailyTopic = require('../models/DailyTopic');
const jobManager = require('../utils/jobManager');
const openai = require('../utils/openai');
const { processQuestionGeneration } = require('../utils/questionProcessor');
const { validateAndFilterQuestions } = require('../utils/topicValidator');
const { getQuestionsForTest } = require('../controllers/questionController');

console.log('================================================================');
console.log(' Tech Ciphergate — E2E Daily Topics -> Generate -> Worker Test ');
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

async function runE2E() {
  // Test Data
  const tenantSubdomain = 'techcipher';
  const workerAId = new mongoose.Types.ObjectId();
  const workerBId = new mongoose.Types.ObjectId();
  const workerCId = new mongoose.Types.ObjectId(); // Worker with no topics
  const workerDId = new mongoose.Types.ObjectId(); // Worker with topics outside period

  const workerA = { _id: workerAId, name: 'Alice (Frontend)', subdomain: tenantSubdomain };
  const workerB = { _id: workerBId, name: 'Bob (DevOps)', subdomain: tenantSubdomain };
  const workerC = { _id: workerCId, name: 'Charlie (New Hire)', subdomain: tenantSubdomain };
  const workerD = { _id: workerDId, name: 'Diana (Inactive)', subdomain: tenantSubdomain };

  const inMemoryWorkers = new Map([
    [workerAId.toString(), workerA],
    [workerBId.toString(), workerB],
    [workerCId.toString(), workerC],
    [workerDId.toString(), workerD]
  ]);

  const inMemoryDailyTopics = [];
  const inMemoryQuestions = [];
  const inMemoryAttempts = [];

  // 1. Setup Daily Topics
  // Alice studied React
  inMemoryDailyTopics.push({
    _id: new mongoose.Types.ObjectId(),
    workerId: workerAId,
    topic: 'React Hooks, State Management',
    date: '2026-10-20',
    subdomain: tenantSubdomain
  });
  // Bob studied Docker & K8s
  inMemoryDailyTopics.push({
    _id: new mongoose.Types.ObjectId(),
    workerId: workerBId,
    topic: 'Docker Containers, Kubernetes Pods',
    date: '2026-10-20',
    subdomain: tenantSubdomain
  });
  // Diana studied 6 months ago (outside current period)
  inMemoryDailyTopics.push({
    _id: new mongoose.Types.ObjectId(),
    workerId: workerDId,
    topic: 'Legacy PHP',
    date: '2026-01-15',
    subdomain: tenantSubdomain
  });

  // Mock Mongoose models
  const origWorkerFind = Worker.find;
  const origWorkerFindById = Worker.findById;
  const origDailyTopicFind = DailyTopic.find;
  const origDailyTopicFindOne = DailyTopic.findOne;
  const origQuestionInsertMany = Question.insertMany;
  const origQuestionFind = Question.find;
  const origQuestionFindOne = Question.findOne;
  const origTestAttemptFindOne = TestAttempt.findOne;
  const origTestAttemptCreate = TestAttempt.create;
  const origStartSession = mongoose.startSession;
  const origMCQ = openai.generateMCQQuestions;

  Worker.find = async (query) => {
    if (query && query._id && query._id.$in) {
      return query._id.$in.map(id => inMemoryWorkers.get(id.toString())).filter(Boolean);
    }
    return Array.from(inMemoryWorkers.values());
  };

  Worker.findById = async (id) => inMemoryWorkers.get(id.toString()) || null;

  DailyTopic.find = (query) => {
    let results = inMemoryDailyTopics.filter(t => {
      if (query.workerId && !t.workerId.equals(query.workerId)) return false;
      if (query.subdomain && t.subdomain !== query.subdomain) return false;
      if (query.date && query.date.$gte && t.date < query.date.$gte) return false;
      if (query.date && query.date.$lte && t.date > query.date.$lte) return false;
      return true;
    });
    return {
      sort: () => ({
        limit: () => ({
          lean: async () => results
        })
      })
    };
  };

  DailyTopic.findOne = (query) => {
    const found = inMemoryDailyTopics.find(t => {
      if (query.workerId && !t.workerId.equals(query.workerId)) return false;
      return true;
    });
    return {
      lean: async () => found || null
    };
  };

  Question.insertMany = async (docs) => {
    inMemoryQuestions.push(...docs);
    return docs;
  };

  Question.find = async (query) => {
    return inMemoryQuestions.filter(q => {
      if (query.worker && !q.worker.equals(query.worker)) return false;
      if (query.batchId && q.batchId !== query.batchId) return false;
      return true;
    });
  };

  Question.findOne = (query) => ({
    sort: () => ({
      select: () => ({
        lean: async () => {
          const matches = inMemoryQuestions.filter(q => {
            if (query.worker && !q.worker.equals(query.worker)) return false;
            return true;
          });
          return matches[matches.length - 1] || null;
        }
      })
    })
  });

  TestAttempt.findOne = async (query) => {
    return inMemoryAttempts.find(a => {
      if (query.worker && String(a.worker) !== String(query.worker)) return false;
      if (query.status && a.status !== query.status) return false;
      if (query.batchId && a.batchId !== query.batchId) return false;
      if (query.questions && query.questions.$in) {
        const hasOverlap = a.questions && a.questions.some(qId => query.questions.$in.some(targetId => String(targetId) === String(qId)));
        if (!hasOverlap) return false;
      }
      return true;
    }) || null;
  };

  TestAttempt.create = async (doc) => {
    const attempt = {
      _id: new mongoose.Types.ObjectId(),
      ...doc,
      testStartTime: Date.now(),
      questionStartTime: Date.now()
    };
    inMemoryAttempts.push(attempt);
    return attempt;
  };

  mongoose.startSession = async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {}
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: Verify Topic-Relevance Validation with Isolated Mocks
    // -------------------------------------------------------------
    await test('Step 1: Topic validator accepts matching concepts and rejects off-topic AI output', async () => {
      const generatedRawAI = [
        {
          questionText: 'How does useEffect handle cleanup in React components?',
          options: ['Return a cleanup function', 'Call disconnect()', 'Restart node process', 'Run DROP TABLE'],
          correctAnswer: 0
        },
        {
          questionText: 'What is the syntax for creating an INNER JOIN in PostgreSQL?',
          options: ['SELECT * FROM a INNER JOIN b ON a.id = b.id', 'docker run -p 80:80', 'npm start', 'git commit'],
          correctAnswer: 0
        }
      ];

      const { validQuestions, rejectedQuestions } = validateAndFilterQuestions(generatedRawAI, 'React Hooks');
      assert.strictEqual(validQuestions.length, 1);
      assert.strictEqual(rejectedQuestions.length, 1);
      assert.match(validQuestions[0].questionText, /useEffect/);
      assert.match(rejectedQuestions[0].question.questionText, /INNER JOIN/);
      assert.match(rejectedQuestions[0].reason, /No keywords from topic "React Hooks" found/);
    });

    // -------------------------------------------------------------
    // STEP 2: Generation Workflow with 2 Employees (Different Topics)
    // -------------------------------------------------------------
    const currentBatchId = 'batch_e2e_verified_001';

    // Mock AI generator to return topic-specific questions
    openai.generateMCQQuestions = async (topics) => {
      const topic = topics[0];
      if (topic.toLowerCase().includes('react') || topic.toLowerCase().includes('state')) {
        return {
          [topic]: [
            {
              questionText: topic.includes('Hook')
                ? 'What is the primary benefit of custom React Hooks?'
                : 'How does state management in React components trigger re-renders?',
              options: ['Updating stateful component logic', 'Direct SQL access', 'Operating system virtualization', 'CSS compiling'],
              correctAnswer: 0,
              difficulty: 'medium'
            }
          ]
        };
      } else {
        return {
          [topic]: [
            {
              questionText: topic.includes('Docker')
                ? 'What does a Docker container image encapsulate?'
                : 'What is the smallest deployable computing unit in Kubernetes?',
              options: ['Application code, runtime, system tools, and libraries', 'Operating system hardware', 'Browser cookies only', 'SQL rows only'],
              correctAnswer: 0,
              difficulty: 'medium'
            }
          ]
        };
      }
    };

    await test('Step 2: Generation associates batchId and individual topics for Alice (React) and Bob (Docker)', async () => {
      const jobData = {
        workerIds: [workerAId.toString(), workerBId.toString()],
        numQuestions: 2,
        difficulty: 'medium',
        timeDuration: 15,
        totalTestDuration: 600,
        topicMode: 'individual',
        individualTopics: {
          [workerAId.toString()]: ['React Hooks, State Management'],
          [workerBId.toString()]: ['Docker Containers, Kubernetes Pods']
        },
        startDate: '2026-10-18',
        endDate: '2026-10-24',
        subdomain: tenantSubdomain
      };

      const result = await processQuestionGeneration(jobData, currentBatchId);
      assert.strictEqual(result.success, true);
      assert.strictEqual(inMemoryQuestions.length, 4);

      // Verify batchId is on all 4 questions
      inMemoryQuestions.forEach(q => {
        assert.strictEqual(q.batchId, currentBatchId, 'Question must carry batchId');
      });

      // Verify Alice has only React questions
      const aliceQs = inMemoryQuestions.filter(q => q.worker.equals(workerAId));
      assert.strictEqual(aliceQs.length, 2);
      aliceQs.forEach(q => {
        assert.ok(q.questionText.includes('React') || q.questionText.includes('useMemo'));
        assert.ok(!q.questionText.includes('Docker'));
      });

      // Verify Bob has only Docker/Kubernetes questions
      const bobQs = inMemoryQuestions.filter(q => q.worker.equals(workerBId));
      assert.strictEqual(bobQs.length, 2);
      bobQs.forEach(q => {
        assert.ok(q.questionText.includes('Docker') || q.questionText.includes('Kubernetes'));
        assert.ok(!q.questionText.includes('React'));
      });
    });

    // -------------------------------------------------------------
    // STEP 3: Worker Retrieval & TestAttempt Creation / Resumption
    // -------------------------------------------------------------
    await test('Step 3: Worker Alice and Bob retrieve their questions and TestAttempt records batchId', async () => {
      // Alice retrieves questions
      const reqA = mockReq({ _id: workerAId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerAId.toString() });
      const resA = mockRes();
      await getQuestionsForTest(reqA, resA);

      assert.strictEqual(resA.statusCode, 200);
      assert.strictEqual(resA.data.reason, 'questions_available');
      assert.strictEqual(resA.data.questions.length, 2);
      assert.ok(resA.data.questions[0].questionText.includes('React') || resA.data.questions[0].questionText.includes('useMemo'));

      // Check TestAttempt for Alice
      const attemptA = inMemoryAttempts.find(a => String(a.worker) === String(workerAId));
      assert.ok(attemptA, 'TestAttempt must be created for Alice');
      assert.strictEqual(attemptA.batchId, currentBatchId, 'TestAttempt must store batchId');

      // Bob retrieves questions
      const reqB = mockReq({ _id: workerBId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerBId.toString() });
      const resB = mockRes();
      await getQuestionsForTest(reqB, resB);

      assert.strictEqual(resB.statusCode, 200);
      assert.strictEqual(resB.data.reason, 'questions_available');
      assert.strictEqual(resB.data.questions.length, 2);
      assert.ok(resB.data.questions[0].questionText.includes('Docker') || resB.data.questions[0].questionText.includes('Kubernetes'));

      // Check TestAttempt for Bob
      const attemptB = inMemoryAttempts.find(a => String(a.worker) === String(workerBId));
      assert.ok(attemptB, 'TestAttempt must be created for Bob');
      assert.strictEqual(attemptB.batchId, currentBatchId, 'TestAttempt must store batchId');
    });

    // -------------------------------------------------------------
    // STEP 4: Verify All Six Worker States
    // -------------------------------------------------------------
    await test('Step 4.1: State 1 — No topics recorded (Charlie)', async () => {
      const reqC = mockReq({ _id: workerCId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerCId.toString() });
      const resC = mockRes();
      await getQuestionsForTest(reqC, resC);

      assert.strictEqual(resC.statusCode, 404);
      assert.strictEqual(resC.data.reason, 'no_topics_recorded');
      assert.match(resC.data.message, /No daily topics recorded yet/);
    });

    await test('Step 4.2: State 2 — Topics not found for selected period (Diana)', async () => {
      const reqD = mockReq({ _id: workerDId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerDId.toString() });
      const resD = mockRes();
      await getQuestionsForTest(reqD, resD);

      assert.strictEqual(resD.statusCode, 404);
      assert.strictEqual(resD.data.reason, 'topics_not_found_for_period');
      assert.match(resD.data.message, /no test questions have been generated for the selected period/);
    });

    await test('Step 4.3: State 3 — Generation in progress', async () => {
      const inProgressWorkerId = new mongoose.Types.ObjectId();
      inMemoryWorkers.set(inProgressWorkerId.toString(), { _id: inProgressWorkerId, name: 'In Progress Worker', subdomain: tenantSubdomain });

      // Simulate active job in global.jobs
      const activeJobId = 'active_gen_job_123';
      jobManager.createJob(activeJobId);
      jobManager.updateJobProgress(activeJobId, 45);

      const req = mockReq({ _id: inProgressWorkerId, role: 'worker', subdomain: tenantSubdomain }, { workerId: inProgressWorkerId.toString() });
      const res = mockRes();
      await getQuestionsForTest(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.data.reason, 'generation_in_progress');
      assert.match(res.data.message, /Question generation is currently in progress/);

      // Clean up job
      if (global.jobs) global.jobs.delete(activeJobId);
    });

    await test('Step 4.4: State 4 — Generation failed handled safely (Worker with zero topics skipped safely)', async () => {
      // Charlie has no topics, when generation runs for him, he is reported in failedWorkers
      const failJobId = 'job_fail_check_001';
      const failJobData = {
        workerIds: [workerCId.toString()],
        numQuestions: 2,
        difficulty: 'medium',
        timeDuration: 15,
        totalTestDuration: 600,
        topicMode: 'individual',
        individualTopics: {},
        startDate: '2026-10-18',
        endDate: '2026-10-24',
        subdomain: tenantSubdomain
      };

      const result = await processQuestionGeneration(failJobData, failJobId);
      assert.strictEqual(result.success, false, 'Result must report false when zero questions generated');
      assert.strictEqual(result.state, 'failed');
      assert.strictEqual(result.failedWorkers.length, 1);
      assert.strictEqual(result.failedWorkers[0].workerName, 'Charlie (New Hire)');
      assert.strictEqual(result.failedWorkers[0].reason, 'No topics recorded');

      // Clean up failed job so it does not interfere with subsequent tests
      if (global.jobs) global.jobs.delete(failJobId);
    });

    await test('Step 4.5: State 5 — Questions available (Alice resuming or viewing questions)', async () => {
      const reqA = mockReq({ _id: workerAId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerAId.toString() });
      const resA = mockRes();
      await getQuestionsForTest(reqA, resA);

      assert.strictEqual(resA.statusCode, 200);
      assert.strictEqual(resA.data.reason, 'questions_available');
      assert.strictEqual(resA.data.status, 'in-progress');
    });

    await test('Step 4.6: State 6 — Already completed (Alice finishes test)', async () => {
      // Mark Alice's attempt as completed
      const attemptA = inMemoryAttempts.find(a => String(a.worker) === String(workerAId));
      attemptA.status = 'completed';

      const reqA = mockReq({ _id: workerAId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerAId.toString() });
      const resA = mockRes();
      await getQuestionsForTest(reqA, resA);

      assert.strictEqual(resA.statusCode, 403);
      assert.strictEqual(resA.data.reason, 'already_completed');
      assert.match(resA.data.message, /You have already completed the test/);
    });

    await test('Step 5: Genuinely new batch is NOT blocked by Alice\'s completed attempt', async () => {
      // A new batch is generated next week
      const nextWeekBatchId = 'batch_e2e_week2_999';
      inMemoryQuestions.push({
        _id: new mongoose.Types.ObjectId(),
        batchId: nextWeekBatchId,
        worker: workerAId,
        topic: 'React 19 Actions',
        questionText: 'What is useActionState in React 19?',
        options: ['Manages form action states', 'Creates SQL tables'],
        correctAnswer: 0,
        timeDuration: 15,
        totalTestDuration: 600,
        createdAt: new Date()
      });

      const reqA = mockReq({ _id: workerAId, role: 'worker', subdomain: tenantSubdomain }, { workerId: workerAId.toString() });
      const resA = mockRes();
      await getQuestionsForTest(reqA, resA);

      // Must succeed with 200 and create new attempt for nextWeekBatchId
      assert.strictEqual(resA.statusCode, 200, 'New batch must NOT be blocked by previous completed batch');
      assert.strictEqual(resA.data.reason, 'questions_available');
      const newAttempt = inMemoryAttempts.find(a => a.batchId === nextWeekBatchId);
      assert.ok(newAttempt, 'New TestAttempt created for nextWeekBatchId');
      assert.strictEqual(newAttempt.status, 'in-progress');
    });

  } finally {
    Worker.find = origWorkerFind;
    Worker.findById = origWorkerFindById;
    DailyTopic.find = origDailyTopicFind;
    DailyTopic.findOne = origDailyTopicFindOne;
    Question.insertMany = origQuestionInsertMany;
    Question.find = origQuestionFind;
    Question.findOne = origQuestionFindOne;
    TestAttempt.findOne = origTestAttemptFindOne;
    TestAttempt.create = origTestAttemptCreate;
    mongoose.startSession = origStartSession;
    openai.generateMCQQuestions = origMCQ;
  }

  console.log('\n================================================================');
  console.log(` E2E Verification Result: ${pass} Passed, ${fail} Failed`);
  console.log('================================================================');
  process.exit(fail > 0 ? 1 : 0);
}

runE2E().catch(err => {
  console.error('E2E Verification Fatal Error:', err);
  process.exit(1);
});
