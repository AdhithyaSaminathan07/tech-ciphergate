/**
 * Tech Ciphergate — AI Question Generation Failure Diagnosis & Regression Suite
 * 
 * Safety & Isolation:
 * - 100% In-memory mocks and fixtures.
 * - Zero live database queries or mutations.
 * - Zero calls to external AI providers (OpenAI/DeepSeek).
 * - Zero secrets, tokens, or personal information exposed.
 */

const assert = require('assert');
const mongoose = require('mongoose');

process.env.DEEPSEEK_API_KEY = 'mock_key_for_test';

const Worker = require('../models/Worker');
const Question = require('../models/Question');
const DailyTopic = require('../models/DailyTopic');
const TestAttempt = require('../models/TestAttempt');
const jobManager = require('../utils/jobManager');
const openai = require('../utils/openai');
const { extractQuestionsForTopic } = require('../utils/openai');
const { extractTopicKeywords, validateAndFilterQuestions } = require('../utils/topicValidator');
const { processQuestionGeneration } = require('../utils/questionProcessor');

console.log('================================================================');
console.log(' AI Question Generation Failure Diagnosis Regression Suite     ');
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

// In-memory data structures
let inMemoryWorkers = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];
let inMemoryDailyTopics = [];

// Mock mongoose session
mongoose.startSession = async () => ({
  startTransaction: () => {},
  commitTransaction: async () => {},
  abortTransaction: async () => {},
  endSession: async () => {},
  withTransaction: async (fn) => fn()
});

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
    return {
      select: () => result,
      lean: () => result,
      then: (resolve) => resolve(result)
    };
  };

  Question.find = async (query = {}) => {
    return inMemoryQuestions.filter(q => {
      if (query.batchId && q.batchId !== query.batchId) return false;
      return true;
    });
  };

  Question.findOne = () => ({
    sort: () => ({
      select: () => ({
        lean: async () => inMemoryQuestions[0] || null,
        then: (res) => res(inMemoryQuestions[0] || null)
      }),
      lean: async () => inMemoryQuestions[0] || null,
      then: (res) => res(inMemoryQuestions[0] || null)
    }),
    select: () => ({
      lean: async () => inMemoryQuestions[0] || null,
      then: (res) => res(inMemoryQuestions[0] || null)
    }),
    lean: async () => inMemoryQuestions[0] || null,
    then: (res) => res(inMemoryQuestions[0] || null)
  });

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

  Question.deleteMany = async () => ({ deletedCount: 0 });

  TestAttempt.find = () => ({
    select: () => inMemoryAttempts,
    lean: () => inMemoryAttempts,
    then: (res) => res(inMemoryAttempts)
  });

  TestAttempt.findOne = () => ({
    sort: () => ({
      select: () => inMemoryAttempts[0] || null,
      lean: () => inMemoryAttempts[0] || null,
      then: (res) => res(inMemoryAttempts[0] || null)
    }),
    then: (res) => res(inMemoryAttempts[0] || null)
  });

  DailyTopic.find = (query = {}) => {
    const list = inMemoryDailyTopics.filter(t => String(t.workerId) === String(query.workerId));
    return {
      sort: () => ({
        limit: () => ({
          lean: async () => list
        }),
        lean: async () => list
      }),
      lean: async () => list,
      then: (res) => res(list)
    };
  };
}

(async function runSuite() {
  setupMocks();

  const testDevId = new mongoose.Types.ObjectId();
  const testDev = {
    _id: testDevId,
    name: 'Test Developer',
    role: 'worker',
    subdomain: 'techvaseegrah',
    status: 'Active'
  };
  inMemoryWorkers.push(testDev);

  // 1. Test Key extraction with casing variation: "ReactJS" when topic is "ReactJs"
  await test('1. extractQuestionsForTopic matches case-insensitively and handles common variations', async () => {
    const rawParsed = {
      'ReactJS': [
        { questionText: 'What is a hook in React?', options: ['A function', 'A class', 'A tag', 'A module'], correctAnswer: 'A function' }
      ]
    };
    const extracted = extractQuestionsForTopic(rawParsed, 'ReactJs');
    assert(Array.isArray(extracted), 'Must return an array');
    assert.strictEqual(extracted.length, 1);
    assert.strictEqual(extracted[0].questionText, 'What is a hook in React?');

    // Test with generic key fallback "questions"
    const genericParsed = {
      questions: [
        { questionText: 'What is JSX?', options: ['Syntax extension', 'Database', 'Server', 'CSS framework'], correctAnswer: 'Syntax extension' }
      ]
    };
    const extractedGeneric = extractQuestionsForTopic(genericParsed, 'ReactJs');
    assert(Array.isArray(extractedGeneric), 'Must fallback to questions array');
    assert.strictEqual(extractedGeneric.length, 1);
  });

  // 2. Test generation when AI returns "ReactJS" casing for topic "ReactJs"
  await test('2. Generation succeeds when AI provider returns different topic key casing (ReactJS vs ReactJs)', async () => {
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async (topics, count, difficulty, subdomain) => {
      // AI returns "ReactJS" with capital JS
      return {
        'ReactJS': Array.from({ length: count }, (_, i) => ({
          questionText: `What is concept ${i + 1} in React component state?`,
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 'Option A'
        }))
      };
    };

    try {
      const jobId = 'test_reactjs_casing_job';
      jobManager.createJob(jobId, { totalWorkers: 1 });

      const result = await processQuestionGeneration({
        workerIds: [testDevId],
        numQuestions: 10,
        topicMode: 'individual',
        individualTopics: { [String(testDevId)]: ['ReactJs'] },
        difficulty: 'Medium',
        questionFormat: 'mcq',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, jobId);

      assert.strictEqual(result.success, true, 'Job must succeed despite key casing variation');
      assert.strictEqual(result.totalQuestionsGenerated, 10, 'Must generate exactly requested 10 questions');
      assert.strictEqual(result.state, 'completed');
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  // 3. Test question field normalization: AI returns "question" instead of "questionText"
  await test('3. Generation accepts "question" field and normalizes to "questionText"', async () => {
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async (topics, count) => {
      return {
        'ReactJs': Array.from({ length: count }, (_, i) => ({
          question: `Which React hook manages state component ${i}?`,
          options: ['useState', 'useEffect', 'useContext', 'useReducer'],
          correctAnswer: 'useState'
        }))
      };
    };

    try {
      const jobId = 'test_react_field_job';
      jobManager.createJob(jobId, { totalWorkers: 1 });

      const result = await processQuestionGeneration({
        workerIds: [testDevId],
        numQuestions: 5,
        topicMode: 'individual',
        individualTopics: { [String(testDevId)]: ['ReactJs'] },
        difficulty: 'Medium',
        questionFormat: 'mcq',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, jobId);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.totalQuestionsGenerated, 5);
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  // 4. Test Error Propagation: AI quota exceeded is NOT swallowed into generic AI_ZERO_QUESTIONS
  await test('4. Quota exceeded error is preserved with safe reason code AI_QUOTA_EXCEEDED without leaking tokens', async () => {
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async () => {
      throw new Error('Daily AI API usage limit reached (100 requests). Please increase the limit in Settings page. Bearer secret_token_12345');
    };

    try {
      const jobId = 'test_quota_err_job';
      jobManager.createJob(jobId, { totalWorkers: 1 });

      const result = await processQuestionGeneration({
        workerIds: [testDevId],
        numQuestions: 10,
        topicMode: 'individual',
        individualTopics: { [String(testDevId)]: ['ReactJs'] },
        difficulty: 'Medium',
        questionFormat: 'mcq',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, jobId);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.state, 'failed');
      const failed = result.failedWorkers[0];
      assert.strictEqual(failed.reasonCode, 'AI_QUOTA_EXCEEDED');
      assert(!failed.reason.includes('secret_token_12345'), 'Must sanitize secrets from failure reason');
      assert(failed.reason.includes('Daily AI API usage limit reached'), 'Must retain actionable reason');
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  // 5. Test Rate Limiting Error Preservation
  await test('5. Rate limiting error is preserved with safe reason code AI_RATE_LIMITED', async () => {
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async () => {
      throw new Error('Rate limit exceeded: 429 Too Many Requests from provider');
    };

    try {
      const jobId = 'test_ratelimit_err_job';
      jobManager.createJob(jobId, { totalWorkers: 1 });

      const result = await processQuestionGeneration({
        workerIds: [testDevId],
        numQuestions: 10,
        topicMode: 'individual',
        individualTopics: { [String(testDevId)]: ['ReactJs'] },
        difficulty: 'Medium',
        questionFormat: 'mcq',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, jobId);

      assert.strictEqual(result.success, false);
      const failed = result.failedWorkers[0];
      assert.strictEqual(failed.reasonCode, 'AI_RATE_LIMITED');
      assert(failed.reason.includes('Rate limit exceeded'));
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  // 6. Test topic concept validation for "ReactJs"
  await test('6. topicValidator recognizes ReactJs concepts (hook, component, state, jsx)', async () => {
    const keywords = extractTopicKeywords('ReactJs');
    assert(keywords.includes('reactjs'), 'Must include reactjs token');
    assert(keywords.includes('react'), 'Must include base react token');
    assert(keywords.includes('hook'), 'Must include hook concept');
    assert(keywords.includes('state'), 'Must include state concept');

    const sampleQuestion = {
      questionText: 'Which React hook handles component lifecycle side-effects?',
      options: ['useEffect', 'useState', 'useMemo', 'useRef'],
      correctAnswer: 'useEffect'
    };

    const { validQuestions, rejectedQuestions } = validateAndFilterQuestions([sampleQuestion], 'ReactJs');
    assert.strictEqual(validQuestions.length, 1, 'Question must pass validation for ReactJs');
    assert.strictEqual(rejectedQuestions.length, 0);
  });

  // 7. Verify requested count of 10 is passed consistently
  await test('7. Requested count of 10 is passed to provider and preserved in output', async () => {
    let capturedCount = null;
    const origMCQ = openai.generateMCQQuestions;
    openai.generateMCQQuestions = async (topics, count) => {
      capturedCount = count;
      return {
        'ReactJs': Array.from({ length: count }, (_, i) => ({
          questionText: `React component state question number ${i + 1}?`,
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A'
        }))
      };
    };

    try {
      const jobId = 'test_count_10_job';
      jobManager.createJob(jobId, { totalWorkers: 1 });

      const result = await processQuestionGeneration({
        workerIds: [testDevId],
        numQuestions: 10,
        topicMode: 'individual',
        individualTopics: { [String(testDevId)]: ['ReactJs'] },
        difficulty: 'Medium',
        questionFormat: 'mcq',
        adminSubdomain: 'techvaseegrah',
        subdomain: 'techvaseegrah'
      }, jobId);

      assert.strictEqual(capturedCount, 10, 'Provider must receive exactly count=10');
      assert.strictEqual(result.totalQuestionsGenerated, 10, 'Must persist exactly 10 questions');
    } finally {
      openai.generateMCQQuestions = origMCQ;
    }
  });

  console.log('\n================================================================');
  console.log(` Results: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  }
})();
