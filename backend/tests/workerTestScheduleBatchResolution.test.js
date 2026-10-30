/**
 * Tech Ciphergate — Worker Test Schedule Batch Resolution Regression Test Suite
 *
 * Safety & Isolation:
 * - 100% in-memory mocked models.
 * - Live database connection strictly blocked.
 * - Zero external API calls, zero database mutations.
 * - Dedicated coverage for the exact reported scenario:
 *     Schedule: "tetsing"
 *     Topic: "ReactJS"
 *     Employee ID: "69fc424fdc18f098aa426a33"
 *     Batch ID: "sched_6ae45dfdbbbcf3f6b4681104_2026-10-30"
 */

// Strict database connection safety guard
delete process.env.MONGO_URI;
const mongoose = require('mongoose');
mongoose.connect = () => {
    throw new Error('FATAL: Test attempted live database connection! Blocked by safety guard.');
};

const assert = require('assert');
const { getQuestionsForTest } = require('../controllers/questionController');
const Worker = require('../models/Worker');
const TestSchedule = require('../models/TestSchedule');
const Question = require('../models/Question');
const TestAttempt = require('../models/TestAttempt');
const DailyTopic = require('../models/DailyTopic');
const jobManager = require('../utils/jobManager');

console.log('================================================================');
console.log(' Worker Test — Schedule Batch Resolution & Authorization Suite');
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
        console.error(err);
    }
}

// In-memory collections
let inMemoryWorkers = [];
let inMemorySchedules = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];
let inMemoryDailyTopics = [];

// Mock Worker
Worker.findById = (id) => {
    const item = inMemoryWorkers.find(w => String(w._id) === String(id)) || null;
    const query = {
        select: () => query,
        lean: () => Promise.resolve(item),
        then: (resolve) => resolve(item)
    };
    return query;
};

// Mock TestSchedule
TestSchedule.findOne = (q = {}) => {
    let item = null;
    if (q.$or) {
        item = inMemorySchedules.find(s => {
            return q.$or.some(clause => {
                if (clause.batchId) return s.batchId === clause.batchId;
                if (clause['occurrences.batchId']) {
                    return (s.occurrences || []).some(o => o.batchId === clause['occurrences.batchId']);
                }
                return false;
            });
        }) || null;
    } else if (q.batchId) {
        item = inMemorySchedules.find(s => s.batchId === q.batchId) || null;
    } else if (q['occurrences.batchId']) {
        item = inMemorySchedules.find(s => (s.occurrences || []).some(o => o.batchId === q['occurrences.batchId'])) || null;
    }
    const query = {
        populate: () => query,
        lean: () => Promise.resolve(item),
        then: (resolve) => resolve(item)
    };
    return query;
};

// Mock Question
Question.findOne = (q = {}) => {
    const item = inMemoryQuestions.find(x => {
        if (q.worker) {
            const matchesWorker = String(x.worker) === String(q.worker);
            if (!matchesWorker) return false;
        }
        if (q.batchId) {
            if (q.batchId.$nin) {
                if (q.batchId.$nin.includes(x.batchId)) return false;
            } else if (x.batchId !== q.batchId) {
                return false;
            }
        }
        return true;
    }) || null;

    const query = {
        sort: () => query,
        select: () => query,
        lean: () => Promise.resolve(item),
        then: (resolve) => resolve(item)
    };
    return query;
};

Question.find = (q = {}) => {
    let list = [...inMemoryQuestions];
    if (q.worker) {
        list = list.filter(x => String(x.worker) === String(q.worker));
    }
    if (q.batchId) {
        if (q.batchId.$nin) {
            list = list.filter(x => !q.batchId.$nin.includes(x.batchId));
        } else {
            list = list.filter(x => x.batchId === q.batchId);
        }
    }
    const query = {
        sort: () => query,
        select: () => query,
        lean: () => Promise.resolve(list),
        then: (resolve) => resolve(list)
    };
    return query;
};

// Mock TestAttempt
TestAttempt.findOne = (q = {}) => {
    const item = inMemoryAttempts.find(a => {
        if (q.worker && String(a.worker) !== String(q.worker)) return false;
        if (q.status && a.status !== q.status) return false;
        if (q.batchId && a.batchId !== q.batchId) return false;
        return true;
    }) || null;
    const query = {
        sort: () => query,
        select: () => query,
        lean: () => Promise.resolve(item),
        then: (resolve) => resolve(item)
    };
    return query;
};

TestAttempt.find = (q = {}) => {
    let list = inMemoryAttempts.filter(a => {
        if (q.worker && String(a.worker) !== String(q.worker)) return false;
        if (q.status && a.status !== q.status) return false;
        return true;
    });
    const query = {
        select: () => query,
        lean: () => Promise.resolve(list),
        then: (resolve) => resolve(list)
    };
    return query;
};

TestAttempt.prototype.save = async function() {
    if (!this._id) this._id = new mongoose.Types.ObjectId();
    const idx = inMemoryAttempts.findIndex(a => String(a._id) === String(this._id));
    if (idx >= 0) inMemoryAttempts[idx] = this;
    else inMemoryAttempts.push(this);
    return this;
};

TestAttempt.updateMany = async () => ({ acknowledged: true, modifiedCount: 0 });

TestAttempt.create = async (doc) => {
    const item = {
        _id: doc._id || new mongoose.Types.ObjectId(),
        save: async function() { return this; },
        ...doc
    };
    inMemoryAttempts.push(item);
    return item;
};

// Mock DailyTopic
DailyTopic.findOne = () => {
    const item = inMemoryDailyTopics[0] || null;
    const query = {
        lean: () => Promise.resolve(item),
        then: (resolve) => resolve(item)
    };
    return query;
};

function mockReq(user, params = {}, query = {}) {
    return {
        user,
        params,
        query,
        subdomain: user.subdomain
    };
}

function mockRes() {
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
    const targetEmployeeId = '69fc424fdc18f098aa426a33';
    const targetBatchId = 'sched_6ae45dfdbbbcf3f6b4681104_2026-10-30';
    const scheduleId = '6ae45dfdbbbcf3f6b4681104';
    const tenantSubdomain = 'techvaseegrah';

    const assignedWorker = {
        _id: new mongoose.Types.ObjectId(targetEmployeeId),
        name: 'Assigned Employee',
        department: 'Frontend',
        subdomain: tenantSubdomain,
        role: 'worker'
    };

    const unassignedWorkerId = '69fc00000000000000000001';
    const unassignedWorker = {
        _id: new mongoose.Types.ObjectId(unassignedWorkerId),
        name: 'Unassigned Employee',
        department: 'Operations',
        subdomain: tenantSubdomain,
        role: 'worker'
    };

    const crossTenantWorkerId = '69fc88888888888888888888';
    const crossTenantWorker = {
        _id: new mongoose.Types.ObjectId(crossTenantWorkerId),
        name: 'Cross Tenant Employee',
        department: 'Frontend',
        subdomain: 'other-corp',
        role: 'worker'
    };

    // -------------------------------------------------------------------------
    // TEST 1: Exact Batch ID, Assigned Employee, In-Progress Question Generation
    // -------------------------------------------------------------------------
    await test('1: In-progress generation for assigned employee returns HTTP 404 generation_in_progress', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30), // Started 30 mins ago
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),  // Ends in 2 hours
            status: 'Generating',
            batchId: targetBatchId,
            occurrences: [{
                batchId: targetBatchId,
                status: 'Generating',
                windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
                windowEndUtc: new Date(Date.now() + 1000 * 60 * 120)
            }]
        }];

        // Active job in jobManager
        jobManager.createJob(targetBatchId, {
            totalWorkers: 1,
            status: 'running'
        });
        jobManager.updateJobProgress(targetBatchId, 30);

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 404, 'Must return 404 while generating');
        assert.strictEqual(res.data.reason, 'generation_in_progress', 'Reason code must be generation_in_progress');
        assert.ok(res.data.message.includes('in progress'), 'Message must explain that generation is in progress');
        assert.strictEqual(res.data.progress, 30, 'Progress percentage should be reported');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Exact Batch ID, Assigned Employee, Status Scheduled (Pre-Generation)
    // -------------------------------------------------------------------------
    await test('2: Test schedule in "Scheduled" status with open window returns generation_in_progress instead of not found', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),
            status: 'Scheduled',
            batchId: targetBatchId,
            occurrences: [{
                batchId: targetBatchId,
                status: 'Scheduled',
                windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
                windowEndUtc: new Date(Date.now() + 1000 * 60 * 120)
            }]
        }];

        // Clear any jobManager job
        if (global.jobs) global.jobs.delete(targetBatchId);

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.data.reason, 'generation_in_progress', 'Must return generation_in_progress for Scheduled schedule');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Exact Batch ID, Assigned Employee, Completed Generation (Questions Persisted)
    // -------------------------------------------------------------------------
    await test('3: Completed generation returns questions successfully with HTTP 200', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),
            status: 'Ready',
            batchId: targetBatchId,
            occurrences: [{
                batchId: targetBatchId,
                status: 'Ready',
                windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
                windowEndUtc: new Date(Date.now() + 1000 * 60 * 120)
            }]
        }];

        // Persisted questions for this worker and batch
        inMemoryQuestions = [
            {
                _id: new mongoose.Types.ObjectId(),
                worker: assignedWorker._id,
                batchId: targetBatchId,
                topic: 'ReactJS',
                questionText: 'What is a React Hook?',
                options: ['A function', 'A component', 'A state container', 'A CSS rule'],
                correctAnswer: 0,
                timeDuration: 30,
                totalTestDuration: 300,
                createdAt: new Date()
            },
            {
                _id: new mongoose.Types.ObjectId(),
                worker: assignedWorker._id,
                batchId: targetBatchId,
                topic: 'ReactJS',
                questionText: 'What does useEffect do?',
                options: ['Handles side effects', 'Renders JSX', 'Creates a ref', 'Sets initial state'],
                correctAnswer: 0,
                timeDuration: 30,
                totalTestDuration: 300,
                createdAt: new Date()
            }
        ];

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 200, 'Must return 200 OK');
        assert.ok(res.data.questions && res.data.questions.length === 2, 'Must return 2 persisted questions');
        assert.strictEqual(res.data.topic, 'ReactJS');
        assert.strictEqual(res.data.batchId, targetBatchId);
        assert.strictEqual(res.data.status, 'in-progress');
        assert.strictEqual(res.data.reason, 'questions_available');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Exact Batch ID, Unassigned Employee Rejected with HTTP 403
    // -------------------------------------------------------------------------
    await test('4: Unassigned employee is rejected with HTTP 403 not_assigned', async () => {
        inMemoryWorkers = [assignedWorker, unassignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id], // Only assignedWorker
            departments: ['Frontend'],     // unassignedWorker is in Operations
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),
            status: 'Generating',
            batchId: targetBatchId
        }];

        const req = mockReq(unassignedWorker, { workerId: unassignedWorkerId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403, 'Must return 403 Forbidden for unassigned employee');
        assert.strictEqual(res.data.reason, 'not_assigned', 'Reason must be not_assigned');
        assert.ok(res.data.message.includes('not assigned'));
    });

    // -------------------------------------------------------------------------
    // TEST 5: Exact Batch ID, Cross-Tenant Employee Rejected with HTTP 403
    // -------------------------------------------------------------------------
    await test('5: Cross-tenant access is rejected with HTTP 403 tenant_mismatch', async () => {
        inMemoryWorkers = [assignedWorker, crossTenantWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),
            status: 'Ready',
            batchId: targetBatchId
        }];

        // Cross-tenant worker requests this batch
        const req = mockReq(crossTenantWorker, { workerId: crossTenantWorkerId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403, 'Must return 403 Forbidden for cross-tenant access');
        assert.strictEqual(res.data.reason, 'tenant_mismatch', 'Reason must be tenant_mismatch');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Exact Batch ID, Failed Question Generation returns generation_failed
    // -------------------------------------------------------------------------
    await test('6: Failed question generation returns HTTP 404 generation_failed', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '09:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 120),
            status: 'Failed',
            failureReason: 'AI generation timeout on topic ReactJS',
            batchId: targetBatchId
        }];

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 404, 'Must return 404 for failed generation');
        assert.strictEqual(res.data.reason, 'generation_failed', 'Reason must be generation_failed');
        assert.ok(res.data.message.includes('AI generation timeout'));
    });

    // -------------------------------------------------------------------------
    // TEST 7: Test Window Not Started (Before Start Time)
    // -------------------------------------------------------------------------
    await test('7: Test window not started returns HTTP 403 test_not_started', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '16:00',
            endTime: '18:00',
            windowStartUtc: new Date(Date.now() + 1000 * 60 * 60), // Starts in 1 hour
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 180),
            status: 'Ready',
            batchId: targetBatchId
        }];

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403, 'Must return 403 for future test window');
        assert.strictEqual(res.data.reason, 'test_not_started');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Test Window Closed (Past End Time)
    // -------------------------------------------------------------------------
    await test('8: Test window closed returns HTTP 403 test_window_closed', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [{
            _id: new mongoose.Types.ObjectId(scheduleId),
            name: 'tetsing',
            subdomain: tenantSubdomain,
            workers: [assignedWorker._id],
            departments: ['Frontend'],
            topicSource: 'manual',
            manualTopics: ['ReactJS'],
            testDate: '2026-10-30',
            startTime: '08:00',
            endTime: '09:00',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 180),
            windowEndUtc: new Date(Date.now() - 1000 * 60 * 60), // Ended 1 hour ago
            status: 'Ready',
            batchId: targetBatchId
        }];

        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: targetBatchId });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403, 'Must return 403 for expired test window');
        assert.strictEqual(res.data.reason, 'test_window_closed');
    });

    // -------------------------------------------------------------------------
    // TEST 9: Nonexistent Batch ID returns batch_not_found
    // -------------------------------------------------------------------------
    await test('9: Completely unknown batch ID returns HTTP 404 batch_not_found', async () => {
        inMemoryWorkers = [assignedWorker];
        inMemoryQuestions = [];
        inMemoryAttempts = [];
        inMemorySchedules = [];

        const unknownBatch = 'sched_unknown_999999999_2026-10-30';
        const req = mockReq(assignedWorker, { workerId: targetEmployeeId }, { batchId: unknownBatch });
        const res = mockRes();

        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.data.reason, 'batch_not_found');
        assert.ok(res.data.message.includes(`"${unknownBatch}" was not found for this employee`));
    });

    console.log(`\n================================================================`);
    console.log(` Results: ${pass} passed, ${fail} failed`);
    console.log(`================================================================\n`);

    if (fail > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test execution error:', err);
    process.exit(1);
});
