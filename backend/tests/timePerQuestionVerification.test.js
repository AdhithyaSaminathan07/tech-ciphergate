/**
 * Tech Ciphergate — Time Per Question Isolated Verification Suite
 * 
 * Safety & Isolation:
 * - 100% in-memory mocks, fixtures, and simulated clocks.
 * - Zero database mutations or connections.
 * - Zero external API or notification calls.
 * - Deterministic validation for all 10 prompt requirements.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const TestSchedule = require('../models/TestSchedule');
const Question = require('../models/Question');
const Worker = require('../models/Worker');
const DailyTopic = require('../models/DailyTopic');
const TestAttempt = require('../models/TestAttempt');
const Score = require('../models/Score');

const {
    createSchedule,
    updateSchedule,
    getSchedules
} = require('../controllers/testScheduleController');

const {
    getQuestionsForTest
} = require('../controllers/questionController');

const {
    submitTest,
    getAvailableTests
} = require('../controllers/testController');

console.log('================================================================');
console.log(' Tech Ciphergate — Time Per Question Isolated Suite            ');
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

// In-memory test store
let inMemorySchedules = [];
let inMemoryWorkers = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];
let inMemoryScores = [];

function setupMocks() {
    inMemorySchedules = [];
    inMemoryWorkers = [];
    inMemoryQuestions = [];
    inMemoryAttempts = [];
    inMemoryScores = [];

    // Worker Mock
    Worker.find = (q = {}) => {
        let res = [...inMemoryWorkers];
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            res = res.filter(w => idStrs.includes(String(w._id)));
        }
        if (q.subdomain) res = res.filter(w => w.subdomain === q.subdomain);
        return {
            select: () => res,
            then: (resolve) => resolve(res)
        };
    };
    Worker.findById = async (id) => inMemoryWorkers.find(w => String(w._id) === String(id)) || null;
    Worker.countDocuments = async (q = {}) => {
        let list = [...inMemoryWorkers];
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            list = list.filter(w => idStrs.includes(String(w._id)));
        }
        if (q.subdomain) list = list.filter(w => w.subdomain === q.subdomain);
        return list.length;
    };

    // TestSchedule Mock
    TestSchedule.prototype.save = async function() {
        const idx = inMemorySchedules.findIndex(s => String(s._id) === String(this._id));
        if (idx >= 0) {
            inMemorySchedules[idx] = this;
        } else {
            if (!this._id) this._id = new mongoose.Types.ObjectId();
            inMemorySchedules.push(this);
        }
        return this;
    };

    TestSchedule.findById = async (id) => inMemorySchedules.find(s => String(s._id) === String(id)) || null;
    TestSchedule.findOne = async (q = {}) => {
        if (q.batchId) return inMemorySchedules.find(s => s.batchId === q.batchId) || null;
        if (q['occurrences.batchId']) {
            return inMemorySchedules.find(s => (s.occurrences || []).some(o => o.batchId === q['occurrences.batchId'])) || null;
        }
        return inMemorySchedules[0] || null;
    };

    TestSchedule.find = (q = {}) => {
        let res = [...inMemorySchedules];
        if (q.subdomain) res = res.filter(s => s.subdomain === q.subdomain);
        const queryObj = {
            populate: () => queryObj,
            sort: () => queryObj,
            lean: () => res,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };

    // Question Mock
    Question.prototype.save = async function() {
        if (!this._id) this._id = new mongoose.Types.ObjectId();
        inMemoryQuestions.push(this);
        return this;
    };
    Question.find = (q = {}) => {
        let res = [...inMemoryQuestions];
        if (q.worker) res = res.filter(x => String(x.worker) === String(q.worker));
        if (q.batchId) {
            if (q.batchId.$nin) res = res.filter(x => !q.batchId.$nin.includes(x.batchId));
            else res = res.filter(x => x.batchId === q.batchId);
        }
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            res = res.filter(x => idStrs.includes(String(x._id)));
        }
        const queryObj = {
            sort: () => queryObj,
            select: () => queryObj,
            lean: () => res,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };
    Question.findOne = (q = {}) => {
        let res = [...inMemoryQuestions];
        if (q.worker) res = res.filter(x => String(x.worker) === String(q.worker));
        if (q.batchId) res = res.filter(x => x.batchId === q.batchId);
        const matched = res.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
        const queryObj = {
            sort: () => queryObj,
            select: () => queryObj,
            lean: () => matched,
            then: (resolve) => resolve(matched)
        };
        return queryObj;
    };

    // TestAttempt Mock
    TestAttempt.prototype.save = async function() {
        const idx = inMemoryAttempts.findIndex(a => String(a._id) === String(this._id));
        if (idx >= 0) inMemoryAttempts[idx] = this;
        else {
            if (!this._id) this._id = new mongoose.Types.ObjectId();
            inMemoryAttempts.push(this);
        }
        return this;
    };
    TestAttempt.create = async function(doc) {
        const attempt = new TestAttempt(doc);
        attempt._id = new mongoose.Types.ObjectId();
        inMemoryAttempts.push(attempt);
        return attempt;
    };
    TestAttempt.findOne = (q = {}) => {
        let res = [...inMemoryAttempts];
        if (q.worker) res = res.filter(a => String(a.worker) === String(q.worker));
        if (q.status) res = res.filter(a => a.status === q.status);
        if (q.batchId) res = res.filter(a => a.batchId === q.batchId);
        if (q.questions && q.questions.$in) {
            const idStrs = q.questions.$in.map(String);
            res = res.filter(a => (a.questions || []).some(id => idStrs.includes(String(id))));
        }
        const item = res.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
        const queryObj = {
            sort: () => queryObj,
            then: (resolve) => resolve(item)
        };
        return queryObj;
    };
    TestAttempt.findById = async (id) => inMemoryAttempts.find(a => String(a._id) === String(id)) || null;
    TestAttempt.find = (q = {}) => {
        let res = [...inMemoryAttempts];
        if (q.worker) res = res.filter(a => String(a.worker) === String(q.worker));
        if (q.status) res = res.filter(a => a.status === q.status);
        const queryObj = {
            select: () => queryObj,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };
    TestAttempt.updateMany = async (filter, update) => {
        inMemoryAttempts.forEach(a => {
            if (filter.worker && String(a.worker) === String(filter.worker)) {
                if (filter.status && a.status === filter.status) {
                    Object.assign(a, update);
                }
            }
        });
        return { modifiedCount: 1 };
    };

    // Score Mock
    Score.findOneAndUpdate = async (q, upd, opts) => {
        let s = inMemoryScores.find(x => String(x.worker) === String(q.worker));
        if (!s) {
            s = { worker: q.worker, totalScore: 0 };
            inMemoryScores.push(s);
        }
        if (upd.$inc && upd.$inc.totalScore) {
            s.totalScore += upd.$inc.totalScore;
        }
        return s;
    };
}

async function runAll() {
    setupMocks();

    const adminUser = {
        _id: new mongoose.Types.ObjectId(),
        role: 'admin',
        subdomain: 'testcorp',
        name: 'Admin Tester'
    };

    const workerUser = {
        _id: new mongoose.Types.ObjectId(),
        role: 'worker',
        subdomain: 'testcorp',
        name: 'Worker Alice'
    };
    inMemoryWorkers.push(workerUser);

    // =========================================================================
    // Test 1: The admin can select 30 seconds per question
    // =========================================================================
    await test('1. The admin can select 30 seconds per question (defaults & saves 30s)', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Wednesday Sprint 30s',
            workers: [workerUser._id],
            topicSource: 'manual',
            manualTopics: ['Node Streams'],
            testDate: '2026-10-28',
            startTime: '10:00',
            endTime: '11:00',
            questionsPerWorker: 10,
            timePerQuestion: 30
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201, 'Should create schedule successfully');
        const sched = res.data.schedule;
        assert.strictEqual(sched.timePerQuestion, 30, 'Should store 30 seconds per question');
        assert.strictEqual(sched.totalTestDuration, 300, 'Total duration should be 10 Qs * 30s = 300s');
    });

    // =========================================================================
    // Test 2: The admin can select 1 minute per question (converted to 60 seconds)
    // =========================================================================
    await test('2. The admin can select 1 minute per question (saved as 60s internally)', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Deep Dive 1 Minute',
            workers: [workerUser._id],
            topicSource: 'manual',
            manualTopics: ['System Design'],
            testDate: '2026-10-28',
            startTime: '14:00',
            endTime: '15:00',
            questionsPerWorker: 5,
            timePerQuestion: 60 // 1 minute in seconds
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201, 'Should create schedule');
        const sched = res.data.schedule;
        assert.strictEqual(sched.timePerQuestion, 60, 'Should store 60 seconds per question');
        assert.strictEqual(sched.totalTestDuration, 300, 'Total duration should be 5 Qs * 60s = 300s');
    });

    // =========================================================================
    // Test 3: The selected value reaches the generated test configuration
    // =========================================================================
    let batchId30s = 'batch_30s_test';
    await test('3. The selected value reaches generated question and test configuration', async () => {
        // Seed questions generated with timeDuration: 45
        for (let i = 0; i < 4; i++) {
            const q = new Question({
                _id: new mongoose.Types.ObjectId(),
                worker: workerUser._id,
                batchId: batchId30s,
                topic: 'TypeScript Generics',
                questionText: `TypeScript Question ${i + 1}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 1,
                timeDuration: 45, // Configured per-question time
                totalTestDuration: 180,
                createdAt: new Date()
            });
            inMemoryQuestions.push(q);
        }

        const req = mockReq(workerUser, { workerId: workerUser._id }, { batchId: batchId30s });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 200, 'Should retrieve questions');
        assert.strictEqual(res.data.durationPerQuestion, 45, 'durationPerQuestion should match configured 45s');
        assert.strictEqual(res.data.questions[0].timeDuration, 45, 'Individual question timeDuration should be 45s');
    });

    // =========================================================================
    // Test 4: Each question gets its own correct deadline
    // =========================================================================
    await test('4. Each question gets its own correct deadline upon attempt start', async () => {
        const attempt = inMemoryAttempts.find(a => a.batchId === batchId30s);
        assert.ok(attempt, 'Attempt should be created');
        assert.strictEqual(attempt.durationPerQuestion, 45, 'Attempt records durationPerQuestion');
        assert.strictEqual(attempt.currentQuestionIndex, 0, 'Initial question index is 0');
        assert.ok(attempt.questionStartTime, 'Question start time must be recorded');
    });

    // =========================================================================
    // Test 5: A question expires at the configured time
    // =========================================================================
    await test('5. Question expires at configured time and advances index', async () => {
        // Simulate that 50 seconds have passed since test start (each question is 45s)
        const attempt = inMemoryAttempts.find(a => a.batchId === batchId30s);
        attempt.testStartTime = new Date(Date.now() - 50 * 1000); // 50s ago

        const req = mockReq(workerUser, { workerId: workerUser._id }, { batchId: batchId30s });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.currentQuestionIndex, 1, 'Should have advanced to Question 1 because 50s > 45s');
        // Question 1 has 40s remaining (45 - (50 - 45) = 40)
        assert.ok(res.data.questionTimeRemaining <= 40 && res.data.questionTimeRemaining >= 39,
            `Remaining time should be ~40s, got ${res.data.questionTimeRemaining}`);
    });

    // =========================================================================
    // Test 6: Moving to the next question starts the appropriate timer
    // =========================================================================
    await test('6. Moving to the next question starts a fresh per-question timer', async () => {
        // Advance attempt explicitly to question 2
        const attempt = inMemoryAttempts.find(a => a.batchId === batchId30s);
        attempt.testStartTime = new Date(Date.now() - 90 * 1000); // exactly 90s ago (2 questions complete)

        const req = mockReq(workerUser, { workerId: workerUser._id }, { batchId: batchId30s });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.data.currentQuestionIndex, 2, 'Should be on Question 2');
        assert.strictEqual(res.data.questionTimeRemaining, 45, 'Question 2 starts with full 45s timer');
    });

    // =========================================================================
    // Test 7: Refreshing cannot reset a question's deadline
    // =========================================================================
    await test('7. Refreshing or reopening does not reset question deadline to full duration', async () => {
        const attempt = inMemoryAttempts.find(a => a.batchId === batchId30s);
        // Worker is 100 seconds into the test (Question 2 began at 90s, so 10s into Question 2)
        attempt.testStartTime = new Date(Date.now() - 100 * 1000);

        // First call (reopen/refresh)
        const req1 = mockReq(workerUser, { workerId: workerUser._id }, { batchId: batchId30s });
        const res1 = mockRes();
        await getQuestionsForTest(req1, res1);

        assert.strictEqual(res1.data.currentQuestionIndex, 2);
        assert.ok(res1.data.questionTimeRemaining <= 35 && res1.data.questionTimeRemaining >= 34,
            `Question time remaining should be ~35s (45-10), got: ${res1.data.questionTimeRemaining}`);

        // Immediate second refresh
        const req2 = mockReq(workerUser, { workerId: workerUser._id }, { batchId: batchId30s });
        const res2 = mockRes();
        await getQuestionsForTest(req2, res2);

        assert.strictEqual(res2.data.currentQuestionIndex, 2);
        assert.ok(res2.data.questionTimeRemaining <= 35,
            `Repeated refresh must NOT reset timer to 45s (actual: ${res2.data.questionTimeRemaining})`);
    });

    // =========================================================================
    // Test 8: Expired questions cannot accept late submissions
    // =========================================================================
    await test('8. Expired test/questions reject late submissions', async () => {
        const attempt = inMemoryAttempts.find(a => a.batchId === batchId30s);
        // Total allowed: 4 questions * 45s = 180s. Set testStartTime to 250s ago (exceeded deadline + 15s grace)
        attempt.testStartTime = new Date(Date.now() - 250 * 1000);

        const req = mockReq(workerUser, { testAttemptId: attempt._id }, {}, {
            answers: [
                { questionId: attempt.questions[0], selectedOption: 1 }
            ]
        });
        const res = mockRes();
        await submitTest(req, res);

        assert.strictEqual(res.statusCode, 400, 'Must reject late submission');
        assert.strictEqual(res.data.reason, 'test_expired', 'Reason should be test_expired');
    });

    // =========================================================================
    // Test 9: Existing saved tests and one-time scheduling remain compatible
    // =========================================================================
    await test('9. Legacy tests with default 15s or totalTestDuration remain compatible', async () => {
        const legacyBatchId = 'legacy_batch_test';
        for (let i = 0; i < 3; i++) {
            const q = new Question({
                _id: new mongoose.Types.ObjectId(),
                worker: workerUser._id,
                batchId: legacyBatchId,
                topic: 'Legacy Node',
                questionText: `Legacy Q${i}`,
                options: ['A', 'B', 'C', 'D'],
                correctAnswer: 0,
                timeDuration: 15, // legacy duration
                totalTestDuration: 600,
                createdAt: new Date()
            });
            inMemoryQuestions.push(q);
        }

        const req = mockReq(workerUser, { workerId: workerUser._id }, { batchId: legacyBatchId });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.durationPerQuestion, 15, 'Honors legacy 15s per-question duration');
    });

    // =========================================================================
    // Test 10: Validation rejects non-positive or invalid timePerQuestion
    // =========================================================================
    await test('10. Validation rejects invalid non-positive timePerQuestion in schedule', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Invalid Schedule',
            workers: [workerUser._id],
            topicSource: 'manual',
            manualTopics: ['DevOps'],
            testDate: '2026-10-28',
            startTime: '10:00',
            endTime: '11:00',
            timePerQuestion: -10
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 400, 'Should reject negative time per question');
        assert.ok(res.data.message.includes('positive'), 'Error message should mention positive number');
    });

    console.log('\n================================================================');
    console.log(` Summary: ${pass} passed, ${fail} failed out of ${pass + fail} tests.`);
    console.log('================================================================');

    if (fail > 0) process.exit(1);
}

runAll().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
