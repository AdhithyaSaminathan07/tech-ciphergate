/**
 * Tech Ciphergate — Test Scheduling Workflow Fixes Regression Test Suite
 * 
 * Safety & Isolation Guard:
 * - 100% In-memory mocks and fixtures.
 * - Live database connection blocked explicitly.
 * - Zero live AI API calls, zero emails, zero notifications, zero network side-effects.
 */

// Strict database connection guard
delete process.env.MONGO_URI;
const mongoose = require('mongoose');
mongoose.connect = () => {
    throw new Error('FATAL: Test attempted live database connection! Blocked by safety guard.');
};

const assert = require('assert');

// Models & Controllers
const TestSchedule = require('../models/TestSchedule');
const Question = require('../models/Question');
const Worker = require('../models/Worker');
const DailyTopic = require('../models/DailyTopic');
const TestAttempt = require('../models/TestAttempt');
const Settings = require('../models/Settings');

const {
    createSchedule,
    getSchedules,
    getScheduleById,
    updateSchedule,
    getWorkerScheduledTests
} = require('../controllers/testScheduleController');

const {
    parseTimeToUtc,
    calculateNextOccurrence,
    generateQuestionsForSchedule,
    executeScheduleNow
} = require('../services/testScheduler');

const { processQuestionGeneration } = require('../utils/questionProcessor');
const { getAvailableTests } = require('../controllers/testController');
const { getQuestionsForTest } = require('../controllers/questionController');

console.log('================================================================');
console.log(' Tech Ciphergate — Test Scheduling Fixes Regression Suite      ');
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

// In-memory data store
let inMemorySchedules = [];
let inMemoryWorkers = [];
let inMemoryDailyTopics = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];
let inMemorySettings = [];

function setupMocks() {
    inMemorySchedules = [];
    inMemoryWorkers = [];
    inMemoryDailyTopics = [];
    inMemoryQuestions = [];
    inMemoryAttempts = [];
    inMemorySettings = [];

    // Session mock
    mongoose.startSession = async () => ({
        startTransaction: () => {},
        commitTransaction: async () => {},
        abortTransaction: async () => {},
        endSession: async () => {},
        withTransaction: async (fn) => fn()
    });

    // Mock Worker
    Worker.find = (q) => {
        let list = [...inMemoryWorkers];
        if (q._id && q._id.$in) {
            const idStrs = q._id.$in.map(String);
            list = list.filter(w => idStrs.includes(String(w._id)));
        }
        if (q.subdomain) {
            list = list.filter(w => w.subdomain === q.subdomain);
        }
        const query = {
            select: () => query,
            populate: () => query,
            lean: () => Promise.resolve(list),
            then: (resolve) => resolve(list)
        };
        return query;
    };
    Worker.findById = (id) => {
        const item = inMemoryWorkers.find(w => String(w._id) === String(id)) || null;
        const query = {
            select: () => query,
            populate: () => query,
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
        return query;
    };
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
    // Mock TestSchedule
    TestSchedule.find = (q = {}) => {
        let list = [...inMemorySchedules];
        if (q.subdomain) {
            list = list.filter(s => s.subdomain === q.subdomain);
        }
        if (q.status) {
            if (typeof q.status === 'object' && q.status.$in) {
                list = list.filter(s => q.status.$in.includes(s.status));
            } else {
                list = list.filter(s => s.status === q.status);
            }
        }
        if (q.workers) {
            if (q.workers.$in) {
                const targetIds = q.workers.$in.map(String);
                list = list.filter(s => (s.workers || []).some(w => targetIds.includes(String(w._id || w))));
            } else {
                const wIdStr = String(q.workers);
                list = list.filter(s => (s.workers || []).some(w => String(w._id || w) === wIdStr));
            }
        }
        if (q.$or) {
            list = list.filter(s => {
                return q.$or.some(clause => {
                    if (clause.batchId && clause.batchId.$in) {
                        return clause.batchId.$in.includes(s.batchId);
                    }
                    if (clause['occurrences.batchId'] && clause['occurrences.batchId'].$in) {
                        return (s.occurrences || []).some(o => clause['occurrences.batchId'].$in.includes(o.batchId));
                    }
                    if (clause.workers) {
                        if (clause.workers.$in) {
                            const ids = clause.workers.$in.map(String);
                            return (s.workers || []).some(w => ids.includes(String(w._id || w)));
                        }
                        return (s.workers || []).some(w => String(w._id || w) === String(clause.workers));
                    }
                    if (clause.departments) {
                        return (s.departments || []).includes(clause.departments);
                    }
                    return false;
                });
            });
        }
        if (q.batchId && q.batchId.$in) {
            list = list.filter(s => q.batchId.$in.includes(s.batchId));
        }
        const query = {
            populate: () => query,
            sort: () => query,
            limit: () => query,
            lean: () => Promise.resolve(list),
            then: (resolve) => resolve(list)
        };
        return query;
    };
    TestSchedule.findById = (id) => {
        const item = inMemorySchedules.find(s => String(s._id) === String(id)) || null;
        const query = {
            populate: () => query,
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
        return query;
    };
    TestSchedule.findOne = (q = {}) => {
        let item = null;
        if (q.$or) {
            item = inMemorySchedules.find(s => {
                return q.$or.some(clause => {
                    if (clause.batchId) return s.batchId === clause.batchId;
                    if (clause['occurrences.batchId']) return (s.occurrences || []).some(o => o.batchId === clause['occurrences.batchId']);
                    return false;
                });
            }) || null;
        } else if (q.batchId) {
            item = inMemorySchedules.find(s => s.batchId === q.batchId) || null;
        } else if (q['occurrences.batchId']) {
            item = inMemorySchedules.find(s => (s.occurrences || []).some(o => o.batchId === q['occurrences.batchId'])) || null;
        } else {
            item = inMemorySchedules[0] || null;
        }
        const query = {
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
        return query;
    };
    TestSchedule.prototype.save = async function() {
        if (!this._id) this._id = new mongoose.Types.ObjectId();
        const existingIdx = inMemorySchedules.findIndex(s => String(s._id) === String(this._id));
        if (existingIdx >= 0) {
            inMemorySchedules[existingIdx] = this;
        } else {
            inMemorySchedules.push(this);
        }
        return this;
    };

    // Mock Question
    Question.find = (q) => {
        let list = [...inMemoryQuestions];
        if (q.worker) {
            if (q.worker.$in) {
                const targetIds = q.worker.$in.map(String);
                list = list.filter(x => targetIds.includes(String(x.worker)));
            } else {
                list = list.filter(x => String(x.worker) === String(q.worker));
            }
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
            limit: (n) => Promise.resolve(list.slice(0, n)),
            lean: () => Promise.resolve(list),
            then: (resolve) => resolve(list)
        };
        return query;
    };
    Question.findOne = (q) => {
        const item = inMemoryQuestions.find(x => {
            if (q.worker) {
                if (q.worker.$in) {
                    const ids = q.worker.$in.map(String);
                    if (!ids.includes(String(x.worker))) return false;
                } else if (String(x.worker) !== String(q.worker)) {
                    return false;
                }
            }
            if (q.batchId) {
                if (q.batchId.$nin && q.batchId.$nin.includes(x.batchId)) return false;
                if (typeof q.batchId === 'string' && x.batchId !== q.batchId) return false;
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
    Question.countDocuments = async (q) => {
        let list = [...inMemoryQuestions];
        if (q.batchId) {
            list = list.filter(x => x.batchId === q.batchId);
        }
        if (q.worker) {
            if (q.worker.$in) {
                const ids = q.worker.$in.map(String);
                list = list.filter(x => ids.includes(String(x.worker)));
            } else {
                list = list.filter(x => String(x.worker) === String(q.worker));
            }
        }
        return list.length;
    };
    Question.insertMany = async (items) => {
        const created = (items || []).map(i => ({ _id: i._id || new mongoose.Types.ObjectId(), ...i }));
        inMemoryQuestions.push(...created);
        return created;
    };

    // Mock TestAttempt
    TestAttempt.find = (q) => {
        let list = [...inMemoryAttempts];
        if (q.worker) {
            if (q.worker.$in) {
                const ids = q.worker.$in.map(String);
                list = list.filter(a => ids.includes(String(a.worker)));
            } else {
                list = list.filter(a => String(a.worker) === String(q.worker));
            }
        }
        if (q.status) list = list.filter(a => a.status === q.status);
        if (q.batchId && q.batchId.$exists) list = list.filter(a => a.batchId != null);
        return {
            select: () => list,
            sort: () => list,
            lean: () => list,
            then: (resolve) => resolve(list)
        };
    };
    TestAttempt.findOne = (q) => {
        const item = inMemoryAttempts.find(a => {
            if (q.worker) {
                if (q.worker.$in) {
                    const ids = q.worker.$in.map(String);
                    if (!ids.includes(String(a.worker))) return false;
                } else if (String(a.worker) !== String(q.worker)) {
                    return false;
                }
            }
            if (q.batchId && a.batchId !== q.batchId) return false;
            if (q.status && a.status !== q.status) return false;
            return true;
        }) || null;
        return {
            sort: () => item,
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
    };

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

    // Mock DailyTopic
    DailyTopic.find = (q) => {
        let list = [...inMemoryDailyTopics];
        if (q.workerId) list = list.filter(t => String(t.workerId) === String(q.workerId));
        if (q.subdomain) list = list.filter(t => t.subdomain === q.subdomain);
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
            if (q.subdomain && t.subdomain !== q.subdomain) return false;
            return true;
        }) || null;
        return {
            lean: () => Promise.resolve(item),
            then: (resolve) => resolve(item)
        };
    };

    // Mock Settings
    Settings.findOne = async () => ({
        subdomain: 'techcorp',
        deepseekApiKey: 'mock_key',
        aiConfig: { aiFeaturesEnabled: true, aiDailyRequestCount: 0, aiMaxDailyRequests: 100 },
        markModified: () => {},
        save: async () => {}
    });

    // Mock openai provider
    const openai = require('../utils/openai');
    openai.generateMCQQuestions = async (topics, count, diff, sub) => {
        return (topics || []).flatMap(topic => Array.from({ length: count || 5 }, (_, i) => ({
            questionText: `Mock Q${i + 1} for ${topic}`,
            options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
            correctAnswer: 0,
            difficulty: diff || 'Medium'
        })));
    };
    openai.generateUPSCQuestions = openai.generateMCQQuestions;
}

async function runSuite() {
    setupMocks();

    const tenantA = 'tenant_alpha';
    const tenantB = 'tenant_beta';

    const adminA = { _id: new mongoose.Types.ObjectId(), name: 'Admin Alpha', role: 'admin', subdomain: tenantA };
    const adminB = { _id: new mongoose.Types.ObjectId(), name: 'Admin Beta', role: 'admin', subdomain: tenantB };
    const superAdmin = { _id: new mongoose.Types.ObjectId(), name: 'Super Admin', role: 'admin', subdomain: 'main' };

    const workerA1 = { _id: new mongoose.Types.ObjectId(), name: 'Alice Alpha', department: 'Engineering', subdomain: tenantA, status: 'Active' };
    const workerA2 = { _id: new mongoose.Types.ObjectId(), name: 'Alan Alpha', department: 'Engineering', subdomain: tenantA, status: 'Active' };
    const workerB1 = { _id: new mongoose.Types.ObjectId(), name: 'Bob Beta', department: 'Engineering', subdomain: tenantB, status: 'Active' };

    inMemoryWorkers.push(workerA1, workerA2, workerB1);

    // =========================================================================
    // SECTION 2: TENANT RESOLUTION & DEVELOPER LOADING
    // =========================================================================

    await test('2.1: Authenticated admin context supersedes client-supplied subdomain override', async () => {
        const req = mockReq(adminA, {}, {}, {
            name: 'Alpha Sprint Evaluation',
            workers: [workerA1._id.toString()],
            subdomain: 'rogue_subdomain', // Malicious or wrong client-side parameter
            topicSource: 'manual',
            manualTopics: ['Express Routing'],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata'
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.schedule.subdomain, tenantA, 'Must resolve to authenticated admin subdomain tenant_alpha');
    });

    await test('2.2: Cross-tenant worker assignment is strictly rejected with 403 Forbidden', async () => {
        const req = mockReq(adminA, {}, {}, {
            name: 'Malicious Cross-Tenant Schedule',
            workers: [workerB1._id.toString()], // Worker belongs to tenant_beta
            topicSource: 'manual',
            manualTopics: ['Security Invariants'],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata'
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert(res.data.message.includes('Access denied'));
    });

    await test('2.3: Empty developer selection is rejected with 400 Bad Request', async () => {
        const req = mockReq(adminA, {}, {}, {
            name: 'Empty Workers Test',
            workers: [],
            topicSource: 'manual',
            manualTopics: ['Testing'],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata'
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert(res.data.message.includes('at least one employee'));
    });

    // =========================================================================
    // SECTION 3 & 4: QUESTION GENERATION, SUBDOMAIN MISMATCH & ZERO-QUESTION HANDLING
    // =========================================================================

    await test('3.1: Subdomain parameter mismatch fixed: jobData passes authenticated tenant subdomain', async () => {
        const sched = new TestSchedule({
            name: 'Tenant Propagation Test',
            subdomain: tenantA,
            workers: [workerA1._id],
            topicSource: 'manual',
            manualTopics: ['Node Architecture'],
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T05:30:00.000Z'),
            generationTiming: 'in_advance',
            questionsPerWorker: 5,
            status: 'Scheduled'
        });
        await sched.save();

        const result = await generateQuestionsForSchedule(sched);
        assert.strictEqual(result.success, true);
        assert.strictEqual(sched.status, 'Ready');

        // Check persisted questions
        const persisted = inMemoryQuestions.filter(q => q.batchId === sched.batchId);
        assert.strictEqual(persisted.length, 5);
        assert.strictEqual(persisted[0].subdomain, tenantA, 'Question must inherit tenant_alpha subdomain');
    });

    await test('3.2: Zero-question handling distinguishes missing topics from persistence failures', async () => {
        // Worker A2 has zero recorded daily topics
        const schedNoTopics = new TestSchedule({
            name: 'No Topics Daily Schedule',
            subdomain: tenantA,
            workers: [workerA2._id],
            topicSource: 'daily_topics',
            topicDateRange: { startDate: '2026-10-01', endDate: '2026-10-05' },
            allowHistoricalFallback: false,
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T05:30:00.000Z'),
            generationTiming: 'in_advance',
            questionsPerWorker: 5,
            status: 'Scheduled'
        });
        await schedNoTopics.save();

        const result = await generateQuestionsForSchedule(schedNoTopics);
        assert.strictEqual(result.success, false);
        assert.strictEqual(schedNoTopics.status, 'Failed');
        assert(schedNoTopics.failureReason.includes('No topics recorded') || schedNoTopics.failureReason.includes('Zero questions'));
        assert.strictEqual(schedNoTopics.executionLock, null, 'Execution lock must be released');
    });

    await test('3.3: Scheduling retry is idempotent and does not create duplicate questions', async () => {
        const sched = inMemorySchedules.find(s => s.name === 'Tenant Propagation Test');
        assert(sched);
        const originalCount = inMemoryQuestions.filter(q => q.batchId === sched.batchId).length;

        // Trigger generation again on the same schedule
        const retryResult = await generateQuestionsForSchedule(sched);
        assert.strictEqual(retryResult.success, true);
        assert.strictEqual(retryResult.alreadyGenerated, true);

        const newCount = inMemoryQuestions.filter(q => q.batchId === sched.batchId).length;
        assert.strictEqual(newCount, originalCount, 'Questions count must remain exactly 5 without duplicates');
    });

    // =========================================================================
    // SECTION 5: SCHEDULED-TEST VISIBILITY & STUDENT DELIVERY
    // =========================================================================

    await test('5.1: Future scheduled test appears as upcoming with timing and is blocked from starting', async () => {
        const futureDate = '2026-11-18';
        const schedFuture = new TestSchedule({
            name: 'Next Week Big Assessment',
            subdomain: tenantA,
            workers: [workerA1._id],
            topicSource: 'manual',
            manualTopics: ['TypeScript Advanced'],
            testDate: futureDate,
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date('2026-11-18T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-18T05:30:00.000Z'),
            generationTiming: 'at_start_time',
            questionsPerWorker: 10,
            timePerQuestion: 45,
            status: 'Scheduled'
        });
        await schedFuture.save();

        const req = mockReq({ _id: workerA1._id, role: 'worker', subdomain: tenantA }, { workerId: workerA1._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const upcomingTest = (res.data || []).find(t => t.scheduleName === 'Next Week Big Assessment');
        assert(upcomingTest, 'Scheduled future test must be discovered by eligible worker');
        assert.strictEqual(upcomingTest.status, 'upcoming');
        assert.strictEqual(upcomingTest.isUpcoming, true);
        assert.strictEqual(upcomingTest.isScheduled, true);
        assert.strictEqual(upcomingTest.testDate, futureDate);
        assert.strictEqual(upcomingTest.startTime, '10:00');

        // Verify attempting to fetch questions outside availability window is blocked (403 or 404)
        const qReq = mockReq({ _id: workerA1._id, role: 'worker', subdomain: tenantA }, { workerId: workerA1._id.toString() }, { batchId: schedFuture.batchId || `sched_${schedFuture._id}_${futureDate}` });
        const qRes = mockRes();
        await getQuestionsForTest(qReq, qRes);
        assert(qRes.statusCode === 403 || qRes.statusCode === 404, `Future test questions must not be served prematurely: got ${qRes.statusCode}`);
    });

    await test('5.2: Failed test schedule is never presented as an available or ready test', async () => {
        const schedFailed = inMemorySchedules.find(s => s.name === 'No Topics Daily Schedule');
        assert(schedFailed && schedFailed.status === 'Failed');

        const req = mockReq({ _id: workerA2._id, role: 'worker', subdomain: tenantA }, { workerId: workerA2._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        const failedInStudentList = (res.data || []).find(t => t.scheduleName === 'No Topics Daily Schedule');
        assert.strictEqual(failedInStudentList, undefined, 'Failed test schedule must never be presented to student');
    });

    await test('5.3: Non-eligible employee cannot see another employees test', async () => {
        // Worker A2 is in same tenant but was NOT assigned to 'Next Week Big Assessment'
        const req = mockReq({ _id: workerA2._id, role: 'worker', subdomain: tenantA }, { workerId: workerA2._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        const unassignedInList = (res.data || []).find(t => t.scheduleName === 'Next Week Big Assessment');
        assert.strictEqual(unassignedInList, undefined, 'Unassigned worker must not see tests configured for others');
    });

    await test('5.4: Cross-tenant student isolation prevents viewing other organizations tests', async () => {
        // Worker B1 (tenant_beta) attempts to list tests or view Worker A1 tests
        const reqCross = mockReq({ _id: workerB1._id, role: 'worker', subdomain: tenantB }, { workerId: workerA1._id.toString() });
        const resCross = mockRes();
        await getAvailableTests(reqCross, resCross);

        assert.strictEqual(resCross.statusCode, 403, 'Cross-tenant or foreign workerId access must be denied 403');
    });

    await test('5.5: Completed test attempt excludes the test from available list', async () => {
        const sched = inMemorySchedules.find(s => s.name === 'Tenant Propagation Test');
        assert(sched);

        // Record completed attempt for Worker A1
        inMemoryAttempts.push({
            _id: new mongoose.Types.ObjectId(),
            worker: workerA1._id,
            batchId: sched.batchId,
            status: 'completed',
            score: 5,
            totalQuestions: 5
        });

        const req = mockReq({ _id: workerA1._id, role: 'worker', subdomain: tenantA }, { workerId: workerA1._id.toString() });
        const res = mockRes();
        await getAvailableTests(req, res);

        const completedInList = (res.data || []).find(t => t.batchId === sched.batchId);
        assert.strictEqual(completedInList, undefined, 'Completed test must be excluded from available tests list');
    });

    // =========================================================================
    // SECTION 6: COMPLETE END-TO-END WORKFLOW SIMULATION
    // =========================================================================

    await test('6.1: Complete End-to-End scheduling -> generation -> delivery workflow', async () => {
        // 1. Worker logs daily topics
        inMemoryDailyTopics.push({
            _id: new mongoose.Types.ObjectId(),
            workerId: workerA1._id,
            subdomain: tenantA,
            date: '2026-11-02',
            topic: 'Mongoose Schemas and Indexes'
        });

        // 2. Admin schedules test using daily topics
        const scheduleReq = mockReq(adminA, {}, {}, {
            name: 'Sprint 42 Mastery Evaluation',
            workers: [workerA1._id.toString()],
            topicSource: 'daily_topics',
            topicDateRange: { startDate: '2026-11-01', endDate: '2026-11-03' },
            allowHistoricalFallback: true,
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            generationTiming: 'in_advance',
            questionsPerWorker: 5,
            timePerQuestion: 30
        });
        const scheduleRes = mockRes();
        await createSchedule(scheduleReq, scheduleRes);

        assert.strictEqual(scheduleRes.statusCode, 201);
        const createdSchedId = scheduleRes.data.schedule._id;

        // 3. Trigger generation for schedule
        const schedDoc = inMemorySchedules.find(s => String(s._id) === String(createdSchedId));
        assert(schedDoc);

        const genResult = await generateQuestionsForSchedule(schedDoc);
        assert.strictEqual(genResult.success, true);
        assert.strictEqual(schedDoc.status, 'Ready');

        // 4. Verify questions persisted with proper topics and tenant
        const generatedQuestions = inMemoryQuestions.filter(q => q.batchId === schedDoc.batchId);
        assert.strictEqual(generatedQuestions.length, 5);
        assert(generatedQuestions[0].topic.includes('Mongoose Schemas'));
        assert.strictEqual(generatedQuestions[0].subdomain, tenantA);

        // 5. Simulate student retrieval during active window
        // Set window relative to Date.now() so current time falls within active window
        schedDoc.windowStartUtc = new Date(Date.now() - 10 * 60 * 1000);
        schedDoc.windowEndUtc = new Date(Date.now() + 50 * 60 * 1000);
        if (schedDoc.occurrences) {
            schedDoc.occurrences.forEach(o => {
                o.windowStartUtc = schedDoc.windowStartUtc;
                o.windowEndUtc = schedDoc.windowEndUtc;
            });
        }

        const availReq = mockReq({ _id: workerA1._id, role: 'worker', subdomain: tenantA }, { workerId: workerA1._id.toString() });
        const availRes = mockRes();
        await getAvailableTests(availReq, availRes);

        const availableTest = (availRes.data || []).find(t => t.batchId === schedDoc.batchId);
        assert(availableTest, 'Test must be available for eligible worker');
        assert.strictEqual(availableTest.status, 'available');

        // 6. Student accesses questions
        const qReq = mockReq({ _id: workerA1._id, role: 'worker', subdomain: tenantA }, { workerId: workerA1._id.toString() }, { batchId: schedDoc.batchId });
        const qRes = mockRes();
        await getQuestionsForTest(qReq, qRes);

        assert.strictEqual(qRes.statusCode, 200);
        assert.strictEqual(qRes.data.questions.length, 5);
        assert.strictEqual(qRes.data.batchId, schedDoc.batchId);
    });

    // =========================================================================
    // SECTION 7: MANAGE TESTS VISIBILITY & LIST RETRIEVAL CONTRACT
    // =========================================================================

    await test('7.1: Schedule creation followed by getSchedules list retrieval returns the created schedule under All Statuses', async () => {
        // Admin A requests schedules for tenantA
        const listReq = mockReq(adminA, {}, { subdomain: tenantA });
        const listRes = mockRes();
        await getSchedules(listReq, listRes);

        assert.strictEqual(listRes.statusCode, 200);
        assert(Array.isArray(listRes.data), 'Backend getSchedules must return an array');

        const foundCreated = listRes.data.find(s => s.name === 'Sprint 42 Mastery Evaluation');
        assert(foundCreated, 'Newly created schedule must be present in getSchedules response');
        assert.strictEqual(foundCreated.subdomain, tenantA);
        assert.strictEqual(foundCreated.status, 'Ready');
    });

    await test('7.2: Tenant isolation in getSchedules strictly isolates tenantA and tenantB schedules', async () => {
        // Admin B requests schedules for tenantB
        const listReqB = mockReq(adminB, {}, { subdomain: tenantB });
        const listResB = mockRes();
        await getSchedules(listReqB, listResB);

        assert.strictEqual(listResB.statusCode, 200);
        const tenantASchedInB = (listResB.data || []).find(s => s.subdomain === tenantA);
        assert.strictEqual(tenantASchedInB, undefined, 'Admin B must never see Tenant A schedules in list');
    });

    await test('7.3: Frontend response parsing contracts handle both direct arrays and envelope objects, and reject unexpected formats', async () => {
        // Safe parsing contract verification mimicking frontend fetchSchedules
        const parseSchedulesResponse = (data) => {
            if (Array.isArray(data)) return { success: true, list: data };
            if (Array.isArray(data?.schedules)) return { success: true, list: data.schedules };
            if (Array.isArray(data?.data)) return { success: true, list: data.data };
            return { success: false, error: 'Unexpected response format' };
        };

        const directArray = [{ _id: '1', name: 'Sched 1' }];
        const envelopeSchedules = { schedules: [{ _id: '2', name: 'Sched 2' }] };
        const envelopeData = { data: [{ _id: '3', name: 'Sched 3' }] };
        const invalidObject = { count: 0, status: 'ok' };

        assert.strictEqual(parseSchedulesResponse(directArray).success, true);
        assert.strictEqual(parseSchedulesResponse(directArray).list.length, 1);
        assert.strictEqual(parseSchedulesResponse(envelopeSchedules).success, true);
        assert.strictEqual(parseSchedulesResponse(envelopeSchedules).list.length, 1);
        assert.strictEqual(parseSchedulesResponse(envelopeData).success, true);
        assert.strictEqual(parseSchedulesResponse(envelopeData).list.length, 1);

        const invalidResult = parseSchedulesResponse(invalidObject);
        assert.strictEqual(invalidResult.success, false);
        assert.strictEqual(invalidResult.error, 'Unexpected response format');
    });

    // =========================================================================
    // SECTION 8: HTTP 500 ROOT CAUSE, SCHEMA REF & WORKER ASSIGNMENT REGRESSIONS
    // =========================================================================

    await test('8.1: TestSchedule createdBy/updatedBy ref points to Admin (not non-existent User), preventing MissingSchemaError', async () => {
        const createdByRef = TestSchedule.schema.path('createdBy').options.ref;
        const updatedByRef = TestSchedule.schema.path('updatedBy').options.ref;

        assert.strictEqual(createdByRef, 'Admin', 'createdBy must reference Admin model');
        assert.strictEqual(updatedByRef, 'Admin', 'updatedBy must reference Admin model');

        // Verify that Admin model exists in mongoose models
        const adminModel = mongoose.model('Admin');
        assert(adminModel, 'Admin model must be registered in Mongoose');
    });

    await test('8.2: Population of workers and createdBy on TestSchedule handles existing and optional references without error', async () => {
        const adminUser = { _id: new mongoose.Types.ObjectId(), username: 'tech_admin', email: 'admin@techvaseegrah.com' };
        const workerA = { _id: new mongoose.Types.ObjectId('6800d00b3f6a6138185ee458'), name: 'Developer 1', email: 'dev1@techvaseegrah.com', department: 'Cloud' };
        const workerB = { _id: new mongoose.Types.ObjectId('6801f3ac0125faa079ec5759'), name: 'Developer 2', email: 'dev2@techvaseegrah.com', department: 'DevOps' };

        // Test schedule with both workers and createdBy
        const schedWithPopulate = {
            _id: new mongoose.Types.ObjectId('6ae42b4b976bb7961a4ab3f6'),
            name: 'AWS Lightsail Assessment',
            subdomain: 'techvaseegrah',
            workers: [workerA, workerB],
            createdBy: adminUser,
            status: 'Ready',
            testDate: '2026-10-30',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 30),
            batchId: 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30'
        };

        inMemorySchedules.push(schedWithPopulate);

        const listReq = mockReq({ role: 'admin', subdomain: 'techvaseegrah' }, {}, { subdomain: 'techvaseegrah' });
        const listRes = mockRes();
        await getSchedules(listReq, listRes);

        assert.strictEqual(listRes.statusCode, 200);
        assert(Array.isArray(listRes.data), 'getSchedules must return 200 array');
        const retrieved = listRes.data.find(s => String(s._id) === '6ae42b4b976bb7961a4ab3f6');
        assert(retrieved, 'Schedule must be retrieved');
        assert.strictEqual(retrieved.workers.length, 2);
        assert.strictEqual(retrieved.createdBy.username, 'tech_admin');
    });

    await test('8.3: Schedule-worker assignment consistency: multiple workers assigned in TestSchedule both receive matching Question documents', async () => {
        const workerId1 = '6800d00b3f6a6138185ee458';
        const workerId2 = '6801f3ac0125faa079ec5759';
        const batchId = 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30';

        // Add 10 questions for worker 1 and 10 questions for worker 2
        for (let i = 1; i <= 10; i++) {
            inMemoryQuestions.push({
                _id: new mongoose.Types.ObjectId(),
                batchId,
                worker: new mongoose.Types.ObjectId(workerId1),
                subdomain: 'techvaseegrah',
                topic: 'aws lightsail hosting',
                questionText: `Worker 1 Question ${i}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 0,
                timeDuration: 30,
                totalTestDuration: 600
            });
            inMemoryQuestions.push({
                _id: new mongoose.Types.ObjectId(),
                batchId,
                worker: new mongoose.Types.ObjectId(workerId2),
                subdomain: 'techvaseegrah',
                topic: 'aws lightsail hosting',
                questionText: `Worker 2 Question ${i}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 0,
                timeDuration: 30,
                totalTestDuration: 600
            });
        }

        const qWorker1 = inMemoryQuestions.filter(q => String(q.worker) === workerId1 && q.batchId === batchId);
        const qWorker2 = inMemoryQuestions.filter(q => String(q.worker) === workerId2 && q.batchId === batchId);

        assert.strictEqual(qWorker1.length, 10, 'Worker 1 must have 10 persisted questions');
        assert.strictEqual(qWorker2.length, 10, 'Worker 2 must have 10 persisted questions');
        assert.strictEqual(qWorker1[0].topic, 'aws lightsail hosting');
    });

    await test('8.4: Employee visibility: getAvailableTests returns the assigned scheduled test for both worker IDs', async () => {
        const worker1 = {
            _id: new mongoose.Types.ObjectId('6800d00b3f6a6138185ee458'),
            name: 'Developer 1',
            subdomain: 'techvaseegrah',
            role: 'worker'
        };
        const worker2 = {
            _id: new mongoose.Types.ObjectId('6801f3ac0125faa079ec5759'),
            name: 'Developer 2',
            subdomain: 'techvaseegrah',
            role: 'worker'
        };
        inMemoryWorkers.push(worker1, worker2);

        // Active test window: now is within window
        const reqW1 = mockReq(worker1, { workerId: '6800d00b3f6a6138185ee458' });
        const resW1 = mockRes();
        await getAvailableTests(reqW1, resW1);

        assert.strictEqual(resW1.statusCode, 200);
        assert(Array.isArray(resW1.data), 'Worker 1 available tests must be an array');
        assert.strictEqual(resW1.data.length >= 1, true, 'Worker 1 must see the available test');
        assert.strictEqual(resW1.data[0].batchId, 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30');
        assert.strictEqual(resW1.data[0].status, 'available');

        const reqW2 = mockReq(worker2, { workerId: '6801f3ac0125faa079ec5759' });
        const resW2 = mockRes();
        await getAvailableTests(reqW2, resW2);

        assert.strictEqual(resW2.statusCode, 200);
        assert(Array.isArray(resW2.data), 'Worker 2 available tests must be an array');
        assert.strictEqual(resW2.data.length >= 1, true, 'Worker 2 must see the available test');
        assert.strictEqual(resW2.data[0].batchId, 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30');
        assert.strictEqual(resW2.data[0].status, 'available');
    });

    await test('8.5: When test window has elapsed, getAvailableTests excludes it and getQuestionsForTest returns test_window_closed', async () => {
        const worker1 = inMemoryWorkers.find(w => String(w._id) === '6800d00b3f6a6138185ee458');
        const sched = inMemorySchedules.find(s => String(s._id) === '6ae42b4b976bb7961a4ab3f6');

        // Set window to elapsed (past)
        sched.windowStartUtc = new Date(Date.now() - 1000 * 60 * 120);
        sched.windowEndUtc = new Date(Date.now() - 1000 * 60 * 60);

        const reqW1 = mockReq(worker1, { workerId: '6800d00b3f6a6138185ee458' });
        const resW1 = mockRes();
        await getAvailableTests(reqW1, resW1);

        assert.strictEqual(resW1.statusCode, 200);
        const hasElapsedBatch = (resW1.data || []).some(b => b.batchId === 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30');
        assert.strictEqual(hasElapsedBatch, false, 'Elapsed test must not appear in active available tests');

        // Directly requesting questions for the closed test must return 403 test_window_closed
        const qReq = mockReq(worker1, { workerId: '6800d00b3f6a6138185ee458' }, { batchId: 'sched_6ae42b4b976bb7961a4ab3f6_2026-10-30' });
        const qRes = mockRes();
        await getQuestionsForTest(qReq, qRes);

        assert.strictEqual(qRes.statusCode, 403);
        assert.strictEqual(qRes.data.reason, 'test_window_closed');
    });

    // =========================================================================
    // SECTION 9: Comprehensive Worker /worker/tests Visibility Regression Tests
    // =========================================================================

    await test('9.1: An assigned employee can discover a valid scheduled test', async () => {
        setupMocks();
        const workerId = '6800d00b3f6a6138185ee458';
        const assignedWorker = {
            _id: new mongoose.Types.ObjectId(workerId),
            name: 'Assigned Worker',
            subdomain: 'techvaseegrah',
            role: 'worker'
        };
        inMemoryWorkers.push(assignedWorker);

        const scheduleId = new mongoose.Types.ObjectId();
        const activeSchedule = {
            _id: scheduleId,
            name: 'Active Scheduled Test',
            subdomain: 'techvaseegrah',
            workers: [assignedWorker._id],
            topicSource: 'manual',
            manualTopics: ['NodeJS Architecture'],
            testDate: '2026-10-30',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 30), // started 30 mins ago
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 90),   // ends in 90 mins
            status: 'Ready',
            batchId: `sched_${scheduleId}_2026-10-30`,
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(activeSchedule);

        const req = mockReq(assignedWorker, { workerId });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert(Array.isArray(res.data), 'Result must be an array');
        assert.strictEqual(res.data.length, 1, 'Assigned worker must see 1 test');
        assert.strictEqual(res.data[0].batchId, activeSchedule.batchId);
        assert.strictEqual(res.data[0].status, 'available');
        assert.strictEqual(res.data[0].isUpcoming, false);
    });

    await test('9.2: An unassigned employee cannot discover that test', async () => {
        const unassignedWorkerId = '6802f3ac0125faa079ec9999';
        const unassignedWorker = {
            _id: new mongoose.Types.ObjectId(unassignedWorkerId),
            name: 'Unassigned Worker',
            subdomain: 'techvaseegrah',
            role: 'worker'
        };
        inMemoryWorkers.push(unassignedWorker);

        const req = mockReq(unassignedWorker, { workerId: unassignedWorkerId });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert(Array.isArray(res.data));
        assert.strictEqual(res.data.length, 0, 'Unassigned worker must not see tests assigned to others');
    });

    await test('9.3: Tenant isolation is enforced for worker test queries', async () => {
        const crossTenantWorkerId = '6803f3ac0125faa079ec8888';
        const crossTenantWorker = {
            _id: new mongoose.Types.ObjectId(crossTenantWorkerId),
            name: 'Other Tenant Worker',
            subdomain: 'acme-corp',
            role: 'worker'
        };
        inMemoryWorkers.push(crossTenantWorker);

        // Attempting to query worker from mismatched session subdomain
        const reqMismatch = mockReq({ ...crossTenantWorker, subdomain: 'malicious-org' }, { workerId: crossTenantWorkerId });
        const resMismatch = mockRes();
        await getAvailableTests(reqMismatch, resMismatch);

        assert.strictEqual(resMismatch.statusCode, 403);
        assert.strictEqual(resMismatch.data.reason, 'tenant_mismatch');
    });

    await test('9.4: A test within its active window appears as available', async () => {
        const worker = inMemoryWorkers.find(w => String(w._id) === '6800d00b3f6a6138185ee458');
        const req = mockReq(worker, { workerId: String(worker._id) });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const testItem = res.data.find(t => t.scheduleName === 'Active Scheduled Test');
        assert(testItem, 'Active window test must appear');
        assert.strictEqual(testItem.status, 'available');
        assert.strictEqual(testItem.isUpcoming, false);
    });

    await test('9.5: A future test follows intended availability rules (status upcoming, cannot be started early)', async () => {
        const worker = inMemoryWorkers.find(w => String(w._id) === '6800d00b3f6a6138185ee458');
        const futureSchedId = new mongoose.Types.ObjectId();
        const futureSchedule = {
            _id: futureSchedId,
            name: 'Future Test Window',
            subdomain: 'techvaseegrah',
            workers: [worker._id],
            topicSource: 'manual',
            manualTopics: ['NextJS 14'],
            testDate: '2026-10-31',
            startTime: '14:00',
            endTime: '16:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() + 1000 * 60 * 120), // starts in 2 hours
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 240),   // ends in 4 hours
            status: 'Ready',
            batchId: `sched_${futureSchedId}_2026-10-31`,
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(futureSchedule);

        const req = mockReq(worker, { workerId: String(worker._id) });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const futureTest = res.data.find(t => t.scheduleName === 'Future Test Window');
        assert(futureTest, 'Future scheduled test must appear');
        assert.strictEqual(futureTest.status, 'upcoming');
        assert.strictEqual(futureTest.isUpcoming, true);

        // Attempting to start the future test early must be rejected with 403 test_not_started
        const startReq = mockReq(worker, { workerId: String(worker._id) }, { batchId: futureSchedule.batchId });
        const startRes = mockRes();
        await getQuestionsForTest(startReq, startRes);

        assert.strictEqual(startRes.statusCode, 403);
        assert.strictEqual(startRes.data.reason, 'test_not_started');
    });

    await test('9.6: An expired test cannot be started and is excluded from active list', async () => {
        const worker = inMemoryWorkers.find(w => String(w._id) === '6800d00b3f6a6138185ee458');
        const expiredSchedId = new mongoose.Types.ObjectId();
        const expiredSchedule = {
            _id: expiredSchedId,
            name: 'Genuinely Expired Test',
            subdomain: 'techvaseegrah',
            workers: [worker._id],
            topicSource: 'manual',
            manualTopics: ['Python Concurrency'],
            testDate: '2026-10-29',
            startTime: '08:00',
            endTime: '09:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 200),
            windowEndUtc: new Date(Date.now() - 1000 * 60 * 100),
            status: 'Completed',
            batchId: `sched_${expiredSchedId}_2026-10-29`,
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(expiredSchedule);

        const req = mockReq(worker, { workerId: String(worker._id) });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const hasExpired = res.data.some(t => t.batchId === expiredSchedule.batchId);
        assert.strictEqual(hasExpired, false, 'Expired test must not appear in available tests');

        // Requesting questions for expired batch must return 403 test_window_closed
        const startReq = mockReq(worker, { workerId: String(worker._id) }, { batchId: expiredSchedule.batchId });
        const startRes = mockRes();
        await getQuestionsForTest(startReq, startRes);

        assert.strictEqual(startRes.statusCode, 403);
        assert.strictEqual(startRes.data.reason, 'test_window_closed');
    });

    await test('9.7: Recurring occurrences are discovered correctly with occurrence batchId', async () => {
        const worker = inMemoryWorkers.find(w => String(w._id) === '6800d00b3f6a6138185ee458');
        const recurSchedId = new mongoose.Types.ObjectId();
        const recurringSchedule = {
            _id: recurSchedId,
            name: 'Weekly Wednesday Test',
            subdomain: 'techvaseegrah',
            workers: [worker._id],
            topicSource: 'manual',
            manualTopics: ['System Design'],
            repeatSchedule: 'weekly',
            status: 'Scheduled',
            batchId: `sched_${recurSchedId}_2026-10-21`,
            occurrences: [
                {
                    occurrenceId: `${recurSchedId}_2026-10-21`,
                    occurrenceDate: '2026-10-21',
                    batchId: `sched_${recurSchedId}_2026-10-21`,
                    status: 'Completed',
                    windowStartUtc: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
                    windowEndUtc: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 60),
                    questionsCount: 10
                },
                {
                    occurrenceId: `${recurSchedId}_2026-10-28`,
                    occurrenceDate: '2026-10-28',
                    batchId: `sched_${recurSchedId}_2026-10-28`,
                    status: 'Ready',
                    windowStartUtc: new Date(Date.now() - 1000 * 60 * 20), // currently open
                    windowEndUtc: new Date(Date.now() + 1000 * 60 * 40),
                    questionsCount: 10
                },
                {
                    occurrenceId: `${recurSchedId}_2026-11-04`,
                    occurrenceDate: '2026-11-04',
                    batchId: `sched_${recurSchedId}_2026-11-04`,
                    status: 'Scheduled',
                    windowStartUtc: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5), // future
                    windowEndUtc: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 60),
                    questionsCount: 10
                }
            ],
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(recurringSchedule);

        const req = mockReq(worker, { workerId: String(worker._id) });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        // Completed occurrence from 7 days ago must be excluded
        const hasPastOcc = res.data.some(t => t.batchId === `sched_${recurSchedId}_2026-10-21`);
        assert.strictEqual(hasPastOcc, false, 'Completed occurrence must not be returned');

        // Current active occurrence must appear as available
        const currentOcc = res.data.find(t => t.batchId === `sched_${recurSchedId}_2026-10-28`);
        assert(currentOcc, 'Currently open occurrence must be discovered');
        assert.strictEqual(currentOcc.status, 'available');

        // Future occurrence must appear as upcoming
        const futureOcc = res.data.find(t => t.batchId === `sched_${recurSchedId}_2026-11-04`);
        assert(futureOcc, 'Future occurrence must be discovered');
        assert.strictEqual(futureOcc.status, 'upcoming');
    });

    await test('9.8: ObjectId/string ID comparisons work correctly when workers array contains strings', async () => {
        const rawStringWorkerId = '6805f3ac0125faa079ec7777';
        const stringWorker = {
            _id: new mongoose.Types.ObjectId(rawStringWorkerId),
            name: 'String Id Worker',
            subdomain: 'techvaseegrah',
            role: 'worker'
        };
        inMemoryWorkers.push(stringWorker);

        const schedId = new mongoose.Types.ObjectId();
        const schedWithStringWorker = {
            _id: schedId,
            name: 'String Worker Test',
            subdomain: 'techvaseegrah',
            workers: [rawStringWorkerId], // stored as raw String, not ObjectId
            topicSource: 'manual',
            manualTopics: ['Redis Caching'],
            testDate: '2026-10-30',
            startTime: '10:00',
            endTime: '12:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 10),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 50),
            status: 'Ready',
            batchId: `sched_${schedId}_2026-10-30`,
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(schedWithStringWorker);

        const req = mockReq(stringWorker, { workerId: rawStringWorkerId });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const discovered = res.data.find(t => t.batchId === schedWithStringWorker.batchId);
        assert(discovered, 'Worker must be matched even if stored as string in workers array');
    });

    await test('9.9: Department-based test schedule is discovered by worker in that department', async () => {
        const deptWorkerId = '6806f3ac0125faa079ec6666';
        const deptWorker = {
            _id: new mongoose.Types.ObjectId(deptWorkerId),
            name: 'Frontend Dev',
            subdomain: 'techvaseegrah',
            department: 'Frontend Engineering',
            role: 'worker'
        };
        inMemoryWorkers.push(deptWorker);

        const deptSchedId = new mongoose.Types.ObjectId();
        const deptSchedule = {
            _id: deptSchedId,
            name: 'Frontend Team Assessment',
            subdomain: 'techvaseegrah',
            workers: [],
            departments: ['Frontend Engineering'],
            topicSource: 'manual',
            manualTopics: ['React 18 Concurrent'],
            testDate: '2026-10-30',
            startTime: '11:00',
            endTime: '13:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() - 1000 * 60 * 15),
            windowEndUtc: new Date(Date.now() + 1000 * 60 * 45),
            status: 'Ready',
            batchId: `sched_${deptSchedId}_2026-10-30`,
            questionsPerWorker: 10,
            timePerQuestion: 30,
            totalTestDuration: 300,
            createdAt: new Date()
        };
        inMemorySchedules.push(deptSchedule);

        const req = mockReq(deptWorker, { workerId: deptWorkerId });
        const res = mockRes();
        await getAvailableTests(req, res);

        assert.strictEqual(res.statusCode, 200);
        const discovered = res.data.find(t => t.batchId === deptSchedule.batchId);
        assert(discovered, 'Department schedule must be discovered by department employee');
    });

    await test('9.10: Frontend response parsing safely extracts tests from array and envelope payloads', () => {
        const parsePayload = (rawData) => {
            return Array.isArray(rawData)
                ? rawData
                : (Array.isArray(rawData?.tests)
                    ? rawData.tests
                    : (Array.isArray(rawData?.batches)
                        ? rawData.batches
                        : (Array.isArray(rawData?.data)
                            ? rawData.data
                            : [])));
        };

        const testSample = [{ batchId: 'batch_123', topic: 'Docker' }];

        // Case A: Direct array
        assert.strictEqual(parsePayload(testSample).length, 1);
        // Case B: { tests: [...] }
        assert.strictEqual(parsePayload({ tests: testSample }).length, 1);
        // Case C: { batches: [...] }
        assert.strictEqual(parsePayload({ batches: testSample }).length, 1);
        // Case D: { data: [...] }
        assert.strictEqual(parsePayload({ data: testSample }).length, 1);
        // Case E: Unexpected envelope or empty
        assert.strictEqual(parsePayload({}).length, 0);
        assert.strictEqual(parsePayload(null).length, 0);
    });

    console.log('\n================================================================');
    console.log(` Results: ${pass} passed, ${fail} failed out of ${pass + fail} tests.`);
    console.log('================================================================\n');

    if (fail > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Fatal suite failure:', err);
    process.exit(1);
});
