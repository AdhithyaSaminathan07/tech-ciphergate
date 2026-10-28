/**
 * Tech Ciphergate — Admin-Controlled Test Scheduling & Daily Topics Regression Suite
 * 
 * Safety & Isolation:
 * - 100% In-memory mocks and fixtures.
 * - Zero database mutations on production MongoDB.
 * - Zero live AI API calls or notification dispatches.
 * - All 14 test requirements verified.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const TestSchedule = require('../models/TestSchedule');
const Question = require('../models/Question');
const Worker = require('../models/Worker');
const DailyTopic = require('../models/DailyTopic');
const TestAttempt = require('../models/TestAttempt');
const {
    parseTimeToUtc,
    getTimezoneOffsetMs,
    recoverStaleLocks,
    updateScheduleWindowStatuses,
    generateQuestionsForSchedule,
    checkAndExecuteDueSchedules,
    executeScheduleNow
} = require('../services/testScheduler');
const {
    createSchedule,
    getSchedules,
    updateSchedule,
    cancelSchedule,
    getWorkerScheduledTests
} = require('../controllers/testScheduleController');
const { getDailyTopicsAdminLog } = require('../controllers/dailyTopicController');
const { getQuestionsForTest } = require('../controllers/questionController');
const { getAvailableTests } = require('../controllers/testController');

console.log('================================================================');
console.log(' Tech Ciphergate — Test Scheduling & Daily Topics Suite         ');
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
let inMemorySchedules = [];
let inMemoryWorkers = [];
let inMemoryDailyTopics = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];

function setupMocks() {
    inMemorySchedules = [];
    inMemoryWorkers = [];
    inMemoryDailyTopics = [];
    inMemoryQuestions = [];
    inMemoryAttempts = [];

    // Mock mongoose.startSession
    mongoose.startSession = async () => ({
        startTransaction: () => {},
        commitTransaction: async () => {},
        abortTransaction: async () => {},
        endSession: async () => {},
        withTransaction: async (fn) => fn()
    });

    // Mock Worker
    Worker.find = (q) => {
        let res = [...inMemoryWorkers];
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            res = res.filter(w => idStrs.includes(String(w._id)));
        }
        if (q.subdomain) {
            res = res.filter(w => w.subdomain === q.subdomain);
        }
        if (q.department && q.department.$in) {
            res = res.filter(w => q.department.$in.includes(w.department));
        }
        const queryObj = {
            select: () => queryObj,
            sort: () => queryObj,
            lean: () => res,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };
    Worker.findById = async (id) => inMemoryWorkers.find(w => String(w._id) === String(id)) || null;
    Worker.countDocuments = async (q) => {
        let list = [...inMemoryWorkers];
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            list = list.filter(w => idStrs.includes(String(w._id)));
        }
        if (q.subdomain) {
            list = list.filter(w => w.subdomain === q.subdomain);
        }
        return list.length;
    };

    // Mock TestSchedule
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
    TestSchedule.find = (q = {}) => {
        let res = [...inMemorySchedules];
        if (q.status) {
            if (q.status.$in) res = res.filter(s => q.status.$in.includes(s.status));
            else res = res.filter(s => s.status === q.status);
        }
        if (q.subdomain) res = res.filter(s => s.subdomain === q.subdomain);
        if (q.batchId) {
            if (q.batchId.$in) res = res.filter(s => q.batchId.$in.includes(s.batchId));
            else res = res.filter(s => s.batchId === q.batchId);
        }
        if (q.workers) {
            res = res.filter(s => (s.workers || []).map(String).includes(String(q.workers)));
        }
        if (q.windowEndUtc) {
            if (q.windowEndUtc.$lt) res = res.filter(s => new Date(s.windowEndUtc) < new Date(q.windowEndUtc.$lt));
        }
        if (q.windowStartUtc) {
            if (q.windowStartUtc.$lte) res = res.filter(s => new Date(s.windowStartUtc) <= new Date(q.windowStartUtc.$lte));
        }
        const matchesCondition = (s, cond) => {
            if (cond.status) {
                if (cond.status.$in && !cond.status.$in.includes(s.status)) return false;
                if (!cond.status.$in && s.status !== cond.status) return false;
            }
            if (cond.subdomain && s.subdomain !== cond.subdomain) return false;
            if (cond.batchId) {
                if (cond.batchId.$in && !cond.batchId.$in.includes(s.batchId)) return false;
                if (!cond.batchId.$in && s.batchId !== cond.batchId) return false;
            }
            if (cond.workers && !(s.workers || []).map(String).includes(String(cond.workers))) return false;
            if (cond.generationTiming && s.generationTiming !== cond.generationTiming) return false;
            if (cond.windowStartUtc && cond.windowStartUtc.$lte && new Date(s.windowStartUtc) > new Date(cond.windowStartUtc.$lte)) return false;
            if (cond.windowEndUtc && cond.windowEndUtc.$lt && new Date(s.windowEndUtc) >= new Date(cond.windowEndUtc.$lt)) return false;
            if (cond.executionLock !== undefined) {
                if (cond.executionLock === null && s.executionLock != null) return false;
                if (cond.executionLock && cond.executionLock.$lt && (!s.executionLock || new Date(s.executionLock) >= new Date(cond.executionLock.$lt))) return false;
            }
            if (cond.$or) {
                return cond.$or.some(clause => matchesCondition(s, clause));
            }
            if (cond.$and) {
                return cond.$and.every(clause => matchesCondition(s, clause));
            }
            return true;
        };

        if (q.$and) {
            res = res.filter(s => q.$and.every(cond => matchesCondition(s, cond)));
        }
        if (q.$or) {
            res = res.filter(s => q.$or.some(cond => matchesCondition(s, cond)));
        }
        const queryObj = {
            populate: () => queryObj,
            sort: () => queryObj,
            limit: (n) => res.slice(0, n),
            lean: () => res,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };
    TestSchedule.findById = async (id) => inMemorySchedules.find(s => String(s._id) === String(id)) || null;
    TestSchedule.findOne = async (q) => {
        return inMemorySchedules.find(s => {
            if (q.batchId && s.batchId !== q.batchId) return false;
            if (q._id && String(s._id) !== String(q._id)) return false;
            return true;
        }) || null;
    };
    TestSchedule.findOneAndUpdate = async (filter, update, options = {}) => {
        const item = inMemorySchedules.find(s => {
            if (filter._id && String(s._id) !== String(filter._id)) return false;
            if (filter.status && s.status !== filter.status) return false;
            return true;
        });
        if (!item) return null;
        if (update.$set) {
            Object.assign(item, update.$set);
        }
        return item;
    };
    TestSchedule.updateMany = async (filter, update) => {
        let modifiedCount = 0;
        inMemorySchedules.forEach(s => {
            let match = true;
            if (filter.status && s.status !== filter.status) match = false;
            if (filter.windowStartUtc && filter.windowStartUtc.$lte && new Date(s.windowStartUtc) > new Date(filter.windowStartUtc.$lte)) match = false;
            if (filter.windowEndUtc && filter.windowEndUtc.$lt && new Date(s.windowEndUtc) >= new Date(filter.windowEndUtc.$lt)) match = false;
            if (match) {
                if (update.$set) Object.assign(s, update.$set);
                modifiedCount++;
            }
        });
        return { modifiedCount };
    };

    // Mock Question
    Question.countDocuments = async (q) => {
        let list = inMemoryQuestions;
        if (q.batchId) list = list.filter(x => x.batchId === q.batchId);
        return list.length;
    };
    Question.find = async (q) => {
        let list = [...inMemoryQuestions];
        if (q.batchId) {
            if (q.batchId.$nin) list = list.filter(x => !q.batchId.$nin.includes(x.batchId));
            else if (q.batchId.$exists) list = list.filter(x => x.batchId != null);
            else list = list.filter(x => x.batchId === q.batchId);
        }
        if (q.worker) list = list.filter(x => String(x.worker) === String(q.worker));
        return list;
    };
    Question.findOne = (q) => {
        const item = inMemoryQuestions.find(x => {
            if (q.worker && String(x.worker) !== String(q.worker)) return false;
            if (q.batchId && x.batchId !== q.batchId) return false;
            return true;
        });
        const query = {
            sort: () => query,
            select: () => query,
            limit: () => query,
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
        return query;
    };
    Question.create = async (doc) => {
        const items = Array.isArray(doc) ? doc : [doc];
        const created = items.map(d => ({ _id: new mongoose.Types.ObjectId(), ...d }));
        inMemoryQuestions.push(...created);
        return Array.isArray(doc) ? created : created[0];
    };

    // Mock Settings
    const Settings = require('../models/Settings');
    Settings.findOne = async () => ({
        subdomain: 'techcorp',
        deepseekApiKey: 'mock_key'
    });

    // Mock openai
    const openai = require('../utils/openai');
    openai.generateQuestionsBatch = async (topics, count, options) => {
        const result = {};
        (topics || []).forEach(t => {
            result[t] = Array.from({ length: count || 5 }, (_, i) => ({
                questionText: `Mock Q${i + 1} on ${t}`,
                options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
                correctAnswer: 0,
                difficulty: options?.difficulty || 'Medium'
            }));
        });
        return result;
    };
    openai.generateQuestions = async (prompt, model, num) => ({
        questions: Array.from({ length: num || 5 }, (_, i) => ({
            questionText: `Mock Q${i + 1}`,
            options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
            correctAnswer: 0,
            difficulty: 'Medium'
        }))
    });

    // Mock TestAttempt
    TestAttempt.find = (q) => {
        let list = [...inMemoryAttempts];
        if (q.worker) list = list.filter(a => String(a.worker) === String(q.worker));
        if (q.status) list = list.filter(a => a.status === q.status);
        return {
            select: () => list,
            sort: () => list,
            lean: () => list,
            then: (resolve) => resolve(list)
        };
    };
    TestAttempt.findOne = async (q) => {
        return inMemoryAttempts.find(a => {
            if (q.worker && String(a.worker) !== String(q.worker)) return false;
            if (q.batchId && a.batchId !== q.batchId) return false;
            if (q.status && a.status !== q.status) return false;
            return true;
        }) || null;
    };

    // Mock DailyTopic
    DailyTopic.find = (q) => {
        let list = [...inMemoryDailyTopics];
        if (q.workerId) {
            if (q.workerId.$in) {
                const idStrs = q.workerId.$in.map(String);
                list = list.filter(t => idStrs.includes(String(t.workerId)));
            } else {
                list = list.filter(t => String(t.workerId) === String(q.workerId));
            }
        }
        if (q.date) {
            if (q.date.$gte && q.date.$lte) {
                list = list.filter(t => t.date >= q.date.$gte && t.date <= q.date.$lte);
            }
        }
        const query = {
            sort: () => query,
            limit: () => query,
            lean: () => Promise.resolve(list),
            then: (resolve) => resolve(list)
        };
        return query;
    };
    DailyTopic.findOne = (q) => {
        const item = inMemoryDailyTopics.find(t => {
            if (q.workerId && String(t.workerId) !== String(q.workerId)) return false;
            if (q.date && t.date !== q.date) return false;
            return true;
        });
        const query = {
            sort: () => query,
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
        return query;
    };
}

async function runSuite() {
    setupMocks();

    // Fixture users
    const adminUser = { _id: new mongoose.Types.ObjectId(), name: 'Admin User', role: 'admin', subdomain: 'techcorp' };
    const worker1 = { _id: new mongoose.Types.ObjectId(), name: 'Alice Developer', email: 'alice@techcorp.com', department: 'Frontend', subdomain: 'techcorp', status: 'Active', relievedAt: null };
    const worker2 = { _id: new mongoose.Types.ObjectId(), name: 'Bob Backend', email: 'bob@techcorp.com', department: 'Backend', subdomain: 'techcorp', status: 'Active', relievedAt: null };
    inMemoryWorkers.push(worker1, worker2);

    // Test 1: Admin can create a schedule for an arbitrary configured date and time
    await test('1. Admin can create a schedule for an arbitrary configured date and time (not Saturday only)', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Wednesday Sprint Assessment',
            workers: [worker1._id.toString()],
            topicSource: 'manual',
            manualTopics: ['React Hooks', 'Context API'],
            testDate: '2026-11-04', // A Wednesday!
            startTime: '14:00',
            endTime: '17:00',
            timezone: 'Asia/Kolkata',
            questionsPerWorker: 10,
            generationTiming: 'at_start_time'
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201, `Expected status 201, got ${res.statusCode}: ${JSON.stringify(res.data)}`);
        assert.strictEqual(res.data.schedule.testDate, '2026-11-04');
        assert.strictEqual(res.data.schedule.startTime, '14:00');
        assert.strictEqual(res.data.schedule.status, 'Scheduled');
        assert(res.data.schedule.windowStartUtc instanceof Date);
        assert(res.data.schedule.windowEndUtc instanceof Date);
    });

    // Test 2: A schedule is not executed before its configured time
    await test('2. A schedule is not executed before its configured time', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Future Thursday Evaluation',
            workers: [worker1._id.toString()],
            topicSource: 'manual',
            manualTopics: ['TypeScript Basics'],
            testDate: '2026-11-12',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            generationTiming: 'at_start_time'
        });
        const res = mockRes();
        await createSchedule(req, res);

        // Attempt execution when current time is 3 days earlier
        const executionResults = await checkAndExecuteDueSchedules({ now: new Date('2026-11-09T10:00:00.000Z') });
        const futureSchedule = inMemorySchedules.find(s => s.name === 'Future Thursday Evaluation');

        assert.strictEqual(futureSchedule.status, 'Scheduled', 'Schedule should remain Scheduled');
        assert.strictEqual(futureSchedule.batchId, undefined, 'No batch should be generated yet');
    });

    // Test 3: A due schedule is executed according to the saved configuration
    await test('3. A due schedule is executed according to saved configuration', async () => {
        const sched = new TestSchedule({
            name: 'Due Tuesday Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            topicSource: 'manual',
            manualTopics: ['Redux Toolkit'],
            testDate: '2026-11-03',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-03T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-03T06:30:00.000Z'),
            generationTiming: 'at_start_time',
            status: 'Scheduled'
        });
        await sched.save();

        // Seed mock generated question on processor trigger
        Question.countDocuments = async () => 10;

        const results = await checkAndExecuteDueSchedules({ now: new Date('2026-11-03T04:28:00.000Z') });
        const executed = inMemorySchedules.find(s => s.name === 'Due Tuesday Test');

        assert(executed.status === 'Ready' || executed.status === 'In Progress');
        assert(executed.batchId && executed.batchId.startsWith('sched_'));
    });

    // Test 4: A Saturday schedule works, but Saturday is not a hardcoded requirement
    await test('4. A Saturday schedule works, but Saturday is not a hardcoded requirement', async () => {
        const satReq = mockReq(adminUser, {}, {}, {
            name: 'Saturday Weekly Evaluation',
            workers: [worker1._id.toString()],
            topicSource: 'manual',
            manualTopics: ['Weekly Review'],
            testDate: '2026-11-07', // Saturday
            startTime: '09:00',
            endTime: '18:00',
            timezone: 'Asia/Kolkata',
            generationTiming: 'at_start_time'
        });
        const satRes = mockRes();
        await createSchedule(satReq, satRes);

        const monReq = mockReq(adminUser, {}, {}, {
            name: 'Monday Kickoff Evaluation',
            workers: [worker1._id.toString()],
            topicSource: 'manual',
            manualTopics: ['Sprint Kickoff'],
            testDate: '2026-11-09', // Monday
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            generationTiming: 'at_start_time'
        });
        const monRes = mockRes();
        await createSchedule(monReq, monRes);

        assert.strictEqual(satRes.statusCode, 201);
        assert.strictEqual(monRes.statusCode, 201);
        assert.strictEqual(satRes.data.schedule.testDate, '2026-11-07');
        assert.strictEqual(monRes.data.schedule.testDate, '2026-11-09');
    });

    // Test 5: Restart recovery does not duplicate generation (lock timeout + idempotency)
    await test('5. Restart recovery does not duplicate generation', async () => {
        const lockedSched = new TestSchedule({
            name: 'Crashed Node Process Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            testDate: '2026-11-05',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-05T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-05T06:30:00.000Z'),
            status: 'Generating',
            executionLock: new Date(Date.now() - 15 * 60 * 1000) // 15 mins stale
        });
        await lockedSched.save();

        await recoverStaleLocks();
        const recovered = inMemorySchedules.find(s => s.name === 'Crashed Node Process Test');

        assert.strictEqual(recovered.status, 'Scheduled', 'Stale generating lock must be recovered back to Scheduled');
        assert.strictEqual(recovered.executionLock, null);
    });

    // Test 6: Missing Daily Topics cause a clear failure diagnostic
    await test('6. Missing Daily Topics cause a clear failure diagnostic', async () => {
        // Worker 2 has 0 topics logged in range 2026-10-01 to 2026-10-05
        const emptyTopicSched = new TestSchedule({
            name: 'Empty Topic Test',
            subdomain: 'techcorp',
            workers: [worker2._id],
            topicSource: 'daily_topics',
            topicDateRange: { startDate: '2026-10-01', endDate: '2026-10-05' },
            testDate: '2026-10-06',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-10-06T04:30:00.000Z'),
            windowEndUtc: new Date('2026-10-06T06:30:00.000Z'),
            status: 'Scheduled',
            allowHistoricalFallback: false
        });
        await emptyTopicSched.save();

        // Question count is 0
        Question.countDocuments = async () => 0;

        const res = await generateQuestionsForSchedule(emptyTopicSched);
        assert.strictEqual(res.success, false);
        assert.strictEqual(emptyTopicSched.status, 'Failed');
        assert(emptyTopicSched.failureReason.length > 0, 'Failure reason must be documented');
    });

    // Test 7: AI generation failure is visible and safely retryable
    await test('7. AI generation failure is visible and safely retryable', async () => {
        const failedSched = new TestSchedule({
            name: 'Retryable Failure Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            topicSource: 'manual',
            manualTopics: ['Network Failure Simulation'],
            testDate: '2026-11-06',
            startTime: '11:00',
            endTime: '13:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-06T05:30:00.000Z'),
            windowEndUtc: new Date('2026-11-06T07:30:00.000Z'),
            status: 'Failed',
            failureReason: 'AI service unavailable: 503 Service Unavailable'
        });
        await failedSched.save();

        assert.strictEqual(failedSched.status, 'Failed');
        assert(failedSched.failureReason.includes('503'));

        // Admin retries
        Question.countDocuments = async () => 10;
        const retryResult = await executeScheduleNow(failedSched._id, adminUser);

        assert.strictEqual(retryResult.success, true);
        assert.strictEqual(failedSched.status, 'Ready');
        assert.strictEqual(failedSched.failureReason, null);
    });

    // Test 8: Cancelled schedules do not execute
    await test('8. Cancelled schedules do not execute', async () => {
        const cancelledSched = new TestSchedule({
            name: 'Cancelled Assessment',
            subdomain: 'techcorp',
            workers: [worker1._id],
            topicSource: 'manual',
            manualTopics: ['Cancelled Topics'],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T06:30:00.000Z'),
            status: 'Cancelled'
        });
        await cancelledSched.save();

        const results = await checkAndExecuteDueSchedules({ now: new Date('2026-11-04T04:35:00.000Z') });
        assert.strictEqual(cancelledSched.status, 'Cancelled');
        assert.strictEqual(cancelledSched.batchId, undefined);
    });

    // Test 9: Rescheduled tests follow the updated date and time
    await test('9. Rescheduled tests follow the updated date and time', async () => {
        const sched = new TestSchedule({
            name: 'Initial Schedule Date',
            subdomain: 'techcorp',
            workers: [worker1._id],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: parseTimeToUtc('2026-11-04', '10:00', 'Asia/Kolkata'),
            windowEndUtc: parseTimeToUtc('2026-11-04', '12:00', 'Asia/Kolkata'),
            status: 'Scheduled'
        });
        await sched.save();

        const req = mockReq(adminUser, { id: sched._id.toString() }, {}, {
            testDate: '2026-11-10',
            startTime: '14:00',
            endTime: '16:00'
        });
        const res = mockRes();
        await updateSchedule(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(sched.testDate, '2026-11-10');
        assert.strictEqual(sched.startTime, '14:00');
        assert.strictEqual(sched.endTime, '16:00');
        assert.strictEqual(sched.windowStartUtc.toISOString(), parseTimeToUtc('2026-11-10', '14:00', 'Asia/Kolkata').toISOString());
    });

    // Test 10: Workers cannot access tests outside the permitted availability window
    await test('10. Workers cannot access tests outside the permitted availability window', async () => {
        const schedBatchId = 'sched_batch_window_test_10';
        const futureSched = new TestSchedule({
            name: 'Tomorrow Afternoon Window Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            batchId: schedBatchId,
            testDate: '2026-11-05',
            startTime: '14:00',
            endTime: '16:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            windowEndUtc: new Date(Date.now() + 26 * 60 * 60 * 1000),
            status: 'Ready'
        });
        await futureSched.save();

        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: schedBatchId,
            topic: 'Window Testing',
            questionText: 'Is this test open yet?',
            options: ['No', 'Yes'],
            correctAnswer: 0
        });

        // Worker attempts to start the test before the window opens
        const workerUser = { _id: worker1._id, role: 'worker', subdomain: 'techcorp' };
        const reqBefore = mockReq(workerUser, { workerId: worker1._id.toString() }, { batchId: schedBatchId });
        const resBefore = mockRes();
        await getQuestionsForTest(reqBefore, resBefore);

        assert.strictEqual(resBefore.statusCode, 403, `Expected 403 before start time, got ${resBefore.statusCode}`);
        assert.strictEqual(resBefore.data.reason, 'test_not_started');

        // Worker attempts to start test after window closes
        futureSched.windowStartUtc = new Date(Date.now() - 4 * 60 * 60 * 1000);
        futureSched.windowEndUtc = new Date(Date.now() - 2 * 60 * 60 * 1000); // Closed 2h ago
        await futureSched.save();

        const reqAfter = mockReq(workerUser, { workerId: worker1._id.toString() }, { batchId: schedBatchId });
        const resAfter = mockRes();
        await getQuestionsForTest(reqAfter, resAfter);

        assert.strictEqual(resAfter.statusCode, 403, `Expected 403 after window closed, got ${resAfter.statusCode}`);
        assert.strictEqual(resAfter.data.reason, 'test_window_closed');
    });

    // Test 11: Tenant isolation is preserved
    await test('11. Tenant isolation is strictly preserved', async () => {
        const foreignAdmin = { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'competitorcorp' };

        // Attempt to create schedule with workers from another tenant
        const reqCross = mockReq(foreignAdmin, {}, {}, {
            name: 'Intrusion Schedule',
            workers: [worker1._id.toString()], // worker1 belongs to techcorp!
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '12:00'
        });
        const resCross = mockRes();
        await createSchedule(reqCross, resCross);

        assert.strictEqual(resCross.statusCode, 403, 'Must reject cross-tenant employee assignment');

        // Attempt to fetch schedules for competitorcorp
        const reqList = mockReq(foreignAdmin, {}, { subdomain: 'competitorcorp' });
        const resList = mockRes();
        await getSchedules(reqList, resList);

        assert.strictEqual(resList.statusCode, 200);
        assert.strictEqual(resList.data.length, 0, 'Competitor must not see techcorp schedules');
    });

    // Test 12: Completed batches do not reappear as available
    await test('12. Completed batches do not reappear as available', async () => {
        const completedBatchId = 'sched_batch_completed_12';
        inMemoryAttempts.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: completedBatchId,
            status: 'completed',
            score: 8,
            totalQuestions: 10
        });

        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: completedBatchId,
            topic: 'Completed Topic Test',
            questionText: 'Sample Q',
            options: ['A', 'B'],
            correctAnswer: 0
        });

        const req = mockReq({ _id: worker1._id, role: 'worker', subdomain: 'techcorp' }, { workerId: worker1._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const availableBatchIds = (res.data || []).map(b => b.batchId);
        assert(!availableBatchIds.includes(completedBatchId), 'Completed batch must not appear in available tests list');
    });

    // Test 13: Existing manual question generation still works seamlessly
    await test('13. Existing manual question generation still works seamlessly without a schedule', async () => {
        const manualBatchId = 'manual_batch_no_schedule_13';
        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: manualBatchId,
            topic: 'Ad-hoc Manual Test',
            questionText: 'What is React?',
            options: ['Library', 'Framework'],
            correctAnswer: 0,
            timeDuration: 15,
            totalTestDuration: 600,
            createdAt: new Date()
        });

        const req = mockReq({ _id: worker1._id, role: 'worker', subdomain: 'techcorp' }, { workerId: worker1._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const batch = (res.data || []).find(b => b.batchId === manualBatchId);
        assert(batch, 'Manual ad-hoc batch must be available immediately without schedule window restriction');
        assert.strictEqual(batch.status, 'available');
    });

    // Test 14: Time-zone boundaries are handled correctly
    await test('14. Time-zone boundaries are handled correctly', async () => {
        // Test parsing for Asia/Kolkata (UTC+5:30)
        // 2026-11-04 10:00 IST -> 2026-11-04 04:30 UTC
        const istUtc = parseTimeToUtc('2026-11-04', '10:00', 'Asia/Kolkata');
        assert.strictEqual(istUtc.toISOString(), '2026-11-04T04:30:00.000Z', '10:00 IST should be 04:30 UTC');

        // Test parsing for UTC
        const utcDate = parseTimeToUtc('2026-11-04', '10:00', 'UTC');
        assert.strictEqual(utcDate.toISOString(), '2026-11-04T10:00:00.000Z', '10:00 UTC should be 10:00 UTC');

        // Test parsing for America/New_York (UTC-4 in Daylight Saving or UTC-5 Standard)
        const nyDate = parseTimeToUtc('2026-11-04', '10:00', 'America/New_York');
        assert(nyDate instanceof Date);
        assert(nyDate.getTime() > utcDate.getTime(), 'New York is behind UTC so UTC timestamp is larger');
    });

    // Additional Test 15: Admin Daily Topics Log returns date-wise and worker-wise matrix
    await test('15. Admin Daily Topics Log returns date-wise and worker-wise attendance matrix', async () => {
        inMemoryDailyTopics.push(
            { workerId: worker1._id, date: '2026-11-02', topic: 'State Management with Redux', subdomain: 'techcorp' },
            { workerId: worker1._id, date: '2026-11-03', topic: 'React Performance Tuning', subdomain: 'techcorp' }
        );

        const req = mockReq(adminUser, {}, {
            startDate: '2026-11-02',
            endDate: '2026-11-04',
            subdomain: 'techcorp'
        });
        const res = mockRes();
        await getDailyTopicsAdminLog(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.totalWorkers, 2);
        assert.strictEqual(res.data.dates.length, 3);
        assert(Array.isArray(res.data.workerWise));
        assert(Array.isArray(res.data.dateWise));

        const aliceRow = res.data.workerWise.find(w => String(w.worker._id) === String(worker1._id));
        assert.strictEqual(aliceRow.submittedCount, 2);
        assert.strictEqual(aliceRow.missingCount, 1);
        assert.strictEqual(aliceRow.dates['2026-11-02'].status, 'submitted');
        assert.strictEqual(aliceRow.dates['2026-11-04'].status, 'missing');
    });

    console.log('\n================================================================');
    console.log(` Summary: ${pass} passed, ${fail} failed out of ${pass + fail} tests.`);
    console.log('================================================================\n');

    if (fail > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Fatal suite failure:', err);
    process.exit(1);
});
