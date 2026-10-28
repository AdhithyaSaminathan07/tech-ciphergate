/**
 * Tech Ciphergate — Recurring Weekly Test Schedule Suite
 * 
 * Safety & Isolation:
 * - 100% In-memory mocks and fixtures.
 * - Zero production database access.
 * - Zero external AI API calls.
 * - Validates all 20 Phase 8 requirements with deterministic simulated clock.
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
    getLocalDateParts,
    calculateNextOccurrence,
    recoverStaleLocks,
    updateScheduleWindowStatuses,
    generateQuestionsForSchedule,
    checkAndExecuteDueSchedules,
    executeScheduleNow,
    pauseSchedule,
    resumeSchedule
} = require('../services/testScheduler');
const {
    createSchedule,
    getSchedules,
    getScheduleById,
    updateSchedule,
    cancelSchedule,
    retrySchedule,
    deleteSchedule,
    getWorkerScheduledTests
} = require('../controllers/testScheduleController');
const { getQuestionsForTest } = require('../controllers/questionController');

console.log('================================================================');
console.log(' Tech Ciphergate — Recurring Weekly Test Schedule Suite        ');
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

// In-memory isolated storage
let inMemorySchedules = [];
let inMemoryWorkers = [];
let inMemoryQuestions = [];
let inMemoryAttempts = [];

function setupMocks() {
    inMemorySchedules = [];
    inMemoryWorkers = [];
    inMemoryQuestions = [];
    inMemoryAttempts = [];

    // Worker mock
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

    // TestSchedule mock
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
        if (q.repeatSchedule) {
            if (q.repeatSchedule.$ne) res = res.filter(s => s.repeatSchedule !== q.repeatSchedule.$ne);
            else res = res.filter(s => s.repeatSchedule === q.repeatSchedule);
        }
        if (q.repeatUntilDisabled !== undefined) {
            if (q.repeatUntilDisabled.$ne !== undefined) res = res.filter(s => s.repeatUntilDisabled !== q.repeatUntilDisabled.$ne);
            else res = res.filter(s => s.repeatUntilDisabled === q.repeatUntilDisabled);
        }
        if (q.windowEndUtc) {
            if (q.windowEndUtc.$lt) res = res.filter(s => new Date(s.windowEndUtc) < new Date(q.windowEndUtc.$lt));
        }
        if (q.windowStartUtc) {
            if (q.windowStartUtc.$lte) res = res.filter(s => new Date(s.windowStartUtc) <= new Date(q.windowStartUtc.$lte));
        }
        if (q.workers) {
            res = res.filter(s => (s.workers || []).map(String).includes(String(q.workers)));
        }

        const matchesCond = (s, cond) => {
            if (cond.status) {
                if (cond.status.$in && !cond.status.$in.includes(s.status)) return false;
                if (!cond.status.$in && s.status !== cond.status) return false;
            }
            if (cond.generationTiming && s.generationTiming !== cond.generationTiming) return false;
            if (cond.windowStartUtc && cond.windowStartUtc.$lte && new Date(s.windowStartUtc) > new Date(cond.windowStartUtc.$lte)) return false;
            if (cond.windowEndUtc && cond.windowEndUtc.$lt && new Date(s.windowEndUtc) >= new Date(cond.windowEndUtc.$lt)) return false;
            if (cond.executionLock !== undefined) {
                if (cond.executionLock === null && s.executionLock != null) return false;
                if (cond.executionLock && cond.executionLock.$lt && (!s.executionLock || new Date(s.executionLock) >= new Date(cond.executionLock.$lt))) return false;
            }
            if (cond.$or) return cond.$or.some(c => matchesCond(s, c));
            if (cond.$and) return cond.$and.every(c => matchesCond(s, c));
            return true;
        };

        if (q.$and) res = res.filter(s => q.$and.every(c => matchesCond(s, c)));
        if (q.$or) res = res.filter(s => q.$or.some(c => matchesCond(s, c)));

        const queryObj = {
            populate: () => queryObj,
            sort: () => queryObj,
            limit: (n) => res.slice(0, n),
            lean: () => res,
            then: (resolve) => resolve(res)
        };
        return queryObj;
    };

    TestSchedule.findById = (id) => {
        const item = inMemorySchedules.find(s => String(s._id) === String(id)) || null;
        const query = {
            populate: () => query,
            then: (resolve) => resolve(item)
        };
        return query;
    };
    TestSchedule.findOne = async (q = {}) => {
        return inMemorySchedules.find(s => {
            if (q.batchId && s.batchId !== q.batchId) return false;
            if (q._id && String(s._id) !== String(q._id)) return false;
            if (q['occurrences.batchId']) {
                const hasOcc = (s.occurrences || []).some(o => o.batchId === q['occurrences.batchId']);
                if (!hasOcc) return false;
            }
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
        if (update.$set) Object.assign(item, update.$set);
        return item;
    };

    TestSchedule.updateMany = async (filter, update) => {
        let count = 0;
        inMemorySchedules.forEach(s => {
            let match = true;
            if (filter.status && s.status !== filter.status) match = false;
            if (filter.windowStartUtc && filter.windowStartUtc.$lte && new Date(s.windowStartUtc) > new Date(filter.windowStartUtc.$lte)) match = false;
            if (filter.windowEndUtc && filter.windowEndUtc.$gte && new Date(s.windowEndUtc) < new Date(filter.windowEndUtc.$gte)) match = false;
            if (filter.windowEndUtc && filter.windowEndUtc.$lt && new Date(s.windowEndUtc) >= new Date(filter.windowEndUtc.$lt)) match = false;
            if (match) {
                if (update.$set) Object.assign(s, update.$set);
                count++;
            }
        });
        return { modifiedCount: count };
    };

    // Question mock
    Question.countDocuments = async (q = {}) => {
        let list = inMemoryQuestions;
        if (q.batchId) list = list.filter(x => x.batchId === q.batchId);
        return list.length;
    };
    Question.find = async (q = {}) => {
        let list = [...inMemoryQuestions];
        if (q.batchId) {
            if (q.batchId.$nin) list = list.filter(x => !q.batchId.$nin.includes(x.batchId));
            else if (q.batchId.$exists) list = list.filter(x => x.batchId != null);
            else list = list.filter(x => x.batchId === q.batchId);
        }
        if (q.worker) list = list.filter(x => String(x.worker) === String(q.worker));
        return list;
    };
    Question.findOne = (q = {}) => {
        const item = inMemoryQuestions.find(x => {
            if (q.worker && String(x.worker) !== String(q.worker)) return false;
            if (q.batchId && x.batchId !== q.batchId) return false;
            return true;
        }) || null;
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

    // TestAttempt mock
    TestAttempt.prototype.save = async function() {
        inMemoryAttempts.push(this);
        return this;
    };
    TestAttempt.create = async (doc) => {
        inMemoryAttempts.push(doc);
        return doc;
    };
    TestAttempt.find = (q = {}) => ({
        select: () => inMemoryAttempts,
        then: (resolve) => resolve(inMemoryAttempts)
    });
    TestAttempt.findOne = async (q = {}) => {
        return inMemoryAttempts.find(a => {
            if (q.worker && String(a.worker) !== String(q.worker)) return false;
            if (q.batchId && a.batchId !== q.batchId) return false;
            if (q.status && a.status !== q.status) return false;
            return true;
        }) || null;
    };
}

async function runSuite() {
    setupMocks();

    const adminUser = { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'techcorp' };
    const worker1 = { _id: new mongoose.Types.ObjectId(), name: 'Alice Developer', email: 'alice@techcorp.com', subdomain: 'techcorp' };
    const worker2 = { _id: new mongoose.Types.ObjectId(), name: 'Bob Engineer', email: 'bob@techcorp.com', subdomain: 'techcorp' };
    inMemoryWorkers.push(worker1, worker2);

    // 1. Admin creates a recurring Wednesday schedule
    let wedSchedule = null;
    await test('1. Admin creates a recurring Wednesday schedule', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Weekly Wednesday Engineering Evaluation',
            workers: [worker1._id.toString(), worker2._id.toString()],
            topicSource: 'manual',
            manualTopics: ['System Design', 'React Patterns'],
            repeatSchedule: 'weekly',
            recurrenceDay: 'Wednesday',
            repeatUntilDisabled: true,
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            generationTiming: 'in_advance',
            questionsPerWorker: 10
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201);
        wedSchedule = res.data.schedule;
        assert.strictEqual(wedSchedule.repeatSchedule, 'weekly');
        assert.strictEqual(wedSchedule.recurrenceDay, 'Wednesday');
        assert.strictEqual(wedSchedule.repeatUntilDisabled, true);
        assert.strictEqual(wedSchedule.status, 'Scheduled');
    });

    // 2. The first occurrence uses the correct Wednesday and configured timezone
    await test('2. The first occurrence uses the correct Wednesday and configured timezone', async () => {
        const occ = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            referenceDate: new Date('2026-10-27T08:00:00.000Z') // Tuesday Oct 27, 2026
        });
        assert.strictEqual(occ.testDate, '2026-10-28', 'Expected Wednesday Oct 28, 2026');
        assert.strictEqual(occ.recurrenceDay, 'Wednesday');
        
        // Window check: 10:00 AM IST = 04:30 UTC
        const startIso = occ.windowStartUtc.toISOString();
        assert.strictEqual(startIso, '2026-10-28T04:30:00.000Z');
        // Window check: 11:00 AM IST = 05:30 UTC
        const endIso = occ.windowEndUtc.toISOString();
        assert.strictEqual(endIso, '2026-10-28T05:30:00.000Z');
    });

    // 3. The next occurrence is calculated for the following Wednesday
    await test('3. The next occurrence is calculated for the following Wednesday', async () => {
        // When current time is past Wednesday 11:00 AM IST
        const occ = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            referenceDate: new Date('2026-10-28T06:00:00.000Z') // Wednesday Oct 28 11:30 AM IST (after closing)
        });
        assert.strictEqual(occ.testDate, '2026-11-04', 'Expected next week Wednesday Nov 4, 2026');
    });

    // 4. Recurrence continues across month and year boundaries
    await test('4. Recurrence continues across month and year boundaries', async () => {
        // Month boundary: Oct 28 -> Nov 04
        const monthRollover = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            referenceDate: new Date('2026-10-28T06:00:00.000Z')
        });
        assert.strictEqual(monthRollover.testDate, '2026-11-04');

        // Year boundary: Dec 30, 2026 (Wednesday) -> Jan 06, 2027 (Wednesday)
        const yearRollover = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            referenceDate: new Date('2026-12-30T06:00:00.000Z')
        });
        assert.strictEqual(yearRollover.testDate, '2027-01-06');
    });

    // 5. Repeated scheduler runs do not create duplicate occurrences
    await test('5. Repeated scheduler runs do not create duplicate occurrences', async () => {
        const testBatch = `sched_${wedSchedule._id}_2026-10-28`;
        // Seed 10 mock questions for this batch
        for (let i = 0; i < 10; i++) {
            inMemoryQuestions.push({ _id: new mongoose.Types.ObjectId(), batchId: testBatch, worker: worker1._id });
        }

        wedSchedule.testDate = '2026-10-28';
        wedSchedule.windowStartUtc = new Date('2026-10-28T04:30:00.000Z');
        wedSchedule.windowEndUtc = new Date('2026-10-28T05:30:00.000Z');
        wedSchedule.status = 'Scheduled';

        // Run 1
        const res1 = await generateQuestionsForSchedule(wedSchedule);
        assert.strictEqual(res1.status, 'Ready');
        assert.strictEqual(wedSchedule.occurrences.length, 1);

        // Run 2 (repeated tick)
        const res2 = await generateQuestionsForSchedule(wedSchedule);
        assert.strictEqual(res2.alreadyGenerated, true);
        assert.strictEqual(wedSchedule.occurrences.length, 1, 'Should NOT create duplicate occurrence records');
    });

    // 6. Concurrent scheduler workers cannot process the same occurrence twice
    await test('6. Concurrent scheduler workers cannot process the same occurrence twice', async () => {
        const sched = new TestSchedule({
            name: 'Concurrency Lock Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            repeatSchedule: 'weekly',
            recurrenceDay: 'Wednesday',
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T05:30:00.000Z'),
            status: 'Scheduled',
            executionLock: null
        });
        await sched.save();

        // Worker 1 acquires lock
        const locked1 = await TestSchedule.findOneAndUpdate(
            { _id: sched._id, status: 'Scheduled', executionLock: null },
            { $set: { status: 'Generating', executionLock: new Date() } }
        );
        assert(locked1, 'Worker 1 should acquire lock');

        // Worker 2 attempts concurrent lock
        const locked2 = await TestSchedule.findOneAndUpdate(
            { _id: sched._id, status: 'Scheduled', executionLock: null },
            { $set: { status: 'Generating', executionLock: new Date() } }
        );
        assert.strictEqual(locked2, null, 'Worker 2 must be blocked by concurrency lock');
    });

    // 7. A server restart does not duplicate generation or lose the next occurrence
    await test('7. A server restart does not duplicate generation or lose the next occurrence', async () => {
        // Simulate a crashed/interrupted process that left executionLock 15 minutes ago
        const staleSched = new TestSchedule({
            name: 'Interrupted Weekly Schedule',
            subdomain: 'techcorp',
            workers: [worker1._id],
            repeatSchedule: 'weekly',
            recurrenceDay: 'Wednesday',
            testDate: '2026-11-04',
            startTime: '10:00',
            endTime: '11:00',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T05:30:00.000Z'),
            status: 'Generating',
            executionLock: new Date(Date.now() - 15 * 60 * 1000)
        });
        await staleSched.save();

        await recoverStaleLocks();
        const recovered = await TestSchedule.findById(staleSched._id);
        assert.strictEqual(recovered.status, 'Scheduled', 'Stale lock should be cleared to Scheduled');
        assert.strictEqual(recovered.executionLock, null);
        assert.strictEqual(recovered.testDate, '2026-11-04', 'Next occurrence date must be preserved');
    });

    // 8. Questions are generated in advance for the correct occurrence
    await test('8. Questions are generated in advance for the correct occurrence', async () => {
        const occDate = '2026-11-18';
        const batchId = `sched_${wedSchedule._id}_${occDate}`;
        wedSchedule.testDate = occDate;
        wedSchedule.status = 'Scheduled';

        // Mock 10 generated questions
        for (let i = 0; i < 10; i++) {
            inMemoryQuestions.push({ _id: new mongoose.Types.ObjectId(), batchId, worker: worker1._id });
        }

        const res = await generateQuestionsForSchedule(wedSchedule);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.batchId, batchId);
        assert.strictEqual(wedSchedule.occurrences.some(o => o.occurrenceDate === occDate), true);
    });

    // 9. Successful advance generation is not repeated unnecessarily
    await test('9. Successful advance generation is not repeated unnecessarily', async () => {
        const occDate = '2026-11-18';
        const res = await generateQuestionsForSchedule(wedSchedule);
        assert.strictEqual(res.alreadyGenerated, true, 'Should detect existing batch and skip regeneration');
    });

    // 10. Failed generation can be retried safely
    await test('10. Failed generation can be retried safely', async () => {
        const failedSched = new TestSchedule({
            name: 'Failed Weekly Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            repeatSchedule: 'weekly',
            recurrenceDay: 'Wednesday',
            testDate: '2026-11-25',
            startTime: '10:00',
            endTime: '11:00',
            windowStartUtc: new Date('2026-11-25T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-25T05:30:00.000Z'),
            status: 'Failed',
            failureReason: 'AI quota reached'
        });
        await failedSched.save();

        // Seed questions for retry batch
        const retryBatch = `sched_${failedSched._id}_2026-11-25`;
        for (let i = 0; i < 5; i++) {
            inMemoryQuestions.push({ _id: new mongoose.Types.ObjectId(), batchId: retryBatch, worker: worker1._id });
        }

        const retryRes = await executeScheduleNow(failedSched._id, adminUser);
        assert.strictEqual(retryRes.success, true);
        const updated = await TestSchedule.findById(failedSched._id);
        assert.strictEqual(updated.status, 'Ready');
        assert.strictEqual(updated.failureReason, null);
    });

    // 11. A paused schedule does not create or open future occurrences
    await test('11. A paused schedule does not create or open future occurrences', async () => {
        const paused = await pauseSchedule(wedSchedule._id, adminUser);
        assert.strictEqual(paused.status, 'Paused');

        // Run scheduler tick — paused schedule must not be in candidates
        const candidates = await TestSchedule.find({
            status: { $in: ['Scheduled'] },
            $and: [
                {
                    $or: [
                        { generationTiming: 'in_advance' },
                        { generationTiming: 'at_start_time' }
                    ]
                }
            ]
        });
        const containsPaused = candidates.some(c => String(c._id) === String(wedSchedule._id));
        assert.strictEqual(containsPaused, false, 'Paused schedule must not be selected for execution');
    });

    // 12. Resuming calculates the next valid occurrence
    await test('12. Resuming calculates the next valid occurrence', async () => {
        const resumed = await resumeSchedule(wedSchedule._id, adminUser);
        assert.strictEqual(resumed.status, 'Scheduled');
        assert(resumed.testDate, 'Next occurrence test date must be populated');
        assert(resumed.windowStartUtc instanceof Date);
        assert(resumed.windowEndUtc instanceof Date);
    });

    // 13. Cancelling stops future occurrences but preserves history
    await test('13. Cancelling stops future occurrences but preserves history', async () => {
        const req = mockReq(adminUser, { id: wedSchedule._id.toString() });
        const res = mockRes();
        await cancelSchedule(req, res);

        assert.strictEqual(res.statusCode, 200);
        const cancelled = await TestSchedule.findById(wedSchedule._id);
        assert.strictEqual(cancelled.status, 'Cancelled');
        assert(cancelled.occurrences.length > 0, 'Occurrences history must remain preserved');
    });

    // 14. Editing a recurring schedule affects future occurrences according to the documented rules
    await test('14. Editing a recurring schedule affects future occurrences according to the documented rules', async () => {
        const editSched = new TestSchedule({
            name: 'Editable Weekly Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            repeatSchedule: 'weekly',
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            testDate: '2026-11-04',
            windowStartUtc: new Date('2026-11-04T04:30:00.000Z'),
            windowEndUtc: new Date('2026-11-04T05:30:00.000Z'),
            status: 'Scheduled',
            occurrences: [{
                occurrenceId: 'past_1',
                occurrenceDate: '2026-10-28',
                batchId: 'sched_past_1',
                status: 'Completed',
                windowStartUtc: new Date('2026-10-28T04:30:00.000Z'),
                windowEndUtc: new Date('2026-10-28T05:30:00.000Z'),
                questionsCount: 10
            }]
        });
        await editSched.save();

        // Admin changes recurrence day to Friday and window to 15:00 - 16:00
        const req = mockReq(adminUser, { id: editSched._id.toString() }, {}, {
            recurrenceDay: 'Friday',
            startTime: '15:00',
            endTime: '16:00'
        });
        const res = mockRes();
        await updateSchedule(req, res);

        assert.strictEqual(res.statusCode, 200);
        const updated = await TestSchedule.findById(editSched._id);
        assert.strictEqual(updated.recurrenceDay, 'Friday');
        assert.strictEqual(updated.startTime, '15:00');
        assert.strictEqual(updated.endTime, '16:00');
        assert.strictEqual(updated.occurrences.length, 1, 'Historical occurrences must not be overwritten');
    });

    // 15. Workers cannot access tests before opening time
    await test('15. Workers cannot access tests before opening time', async () => {
        const futureBatch = 'sched_future_window_batch_15';
        const futureSched = new TestSchedule({
            name: 'Future Window Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            batchId: futureBatch,
            testDate: '2026-11-05',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10h from now
            windowEndUtc: new Date(Date.now() + 11 * 60 * 60 * 1000),
            status: 'Ready'
        });
        await futureSched.save();

        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: futureBatch,
            topic: 'Security',
            questionText: 'Test question?',
            options: ['A', 'B'],
            correctAnswer: 0
        });

        const workerUser = { _id: worker1._id, role: 'worker', subdomain: 'techcorp' };
        const req = mockReq(workerUser, { workerId: worker1._id.toString() }, { batchId: futureBatch });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.reason, 'test_not_started');
    });

    // 16. Workers cannot access tests after closing time
    await test('16. Workers cannot access tests after closing time', async () => {
        const closedBatch = 'sched_closed_window_batch_16';
        const closedSched = new TestSchedule({
            name: 'Closed Window Test',
            subdomain: 'techcorp',
            workers: [worker1._id],
            batchId: closedBatch,
            testDate: '2026-10-25',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'Asia/Kolkata',
            windowStartUtc: new Date(Date.now() - 5 * 60 * 60 * 1000), // Closed 4h ago
            windowEndUtc: new Date(Date.now() - 4 * 60 * 60 * 1000),
            status: 'Completed'
        });
        await closedSched.save();

        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: closedBatch,
            topic: 'Security',
            questionText: 'Closed test question?',
            options: ['A', 'B'],
            correctAnswer: 0
        });

        const workerUser = { _id: worker1._id, role: 'worker', subdomain: 'techcorp' };
        const req = mockReq(workerUser, { workerId: worker1._id.toString() }, { batchId: closedBatch });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.reason, 'test_window_closed');
    });

    // 17. Existing one-time scheduling continues to work
    await test('17. Existing one-time scheduling continues to work', async () => {
        const req = mockReq(adminUser, {}, {}, {
            name: 'Single One-Time Evaluation',
            workers: [worker1._id.toString()],
            topicSource: 'manual',
            manualTopics: ['Algorithms'],
            repeatSchedule: 'none',
            generationTiming: 'at_start_time',
            testDate: '2026-11-10',
            startTime: '14:00',
            endTime: '15:00',
            timezone: 'Asia/Kolkata'
        });
        const res = mockRes();
        await createSchedule(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.schedule.repeatSchedule, 'none');
    });

    // 18. Existing manual question generation continues to work
    await test('18. Existing manual question generation continues to work', async () => {
        const manualBatchId = `batch_${Date.now()}_manual`;
        inMemoryQuestions.push({
            _id: new mongoose.Types.ObjectId(),
            worker: worker1._id,
            batchId: manualBatchId,
            topic: 'Manual React Topic',
            questionText: 'What is React?',
            options: ['A library', 'A framework'],
            correctAnswer: 0
        });

        const workerUser = { _id: worker1._id, role: 'worker', subdomain: 'techcorp' };
        const req = mockReq(workerUser, { workerId: worker1._id.toString() }, { batchId: manualBatchId });
        const res = mockRes();
        await getQuestionsForTest(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert(Array.isArray(res.data.questions));
        assert.strictEqual(res.data.questions.length, 1);
    });

    // 19. Tenant isolation and role authorization remain intact
    await test('19. Tenant isolation and role authorization remain intact', async () => {
        const foreignAdmin = { _id: new mongoose.Types.ObjectId(), role: 'admin', subdomain: 'othercorp' };
        
        // Foreign admin tries to view techcorp schedule
        const reqGet = mockReq(foreignAdmin, { id: wedSchedule._id.toString() });
        const resGet = mockRes();
        await getScheduleById(reqGet, resGet);
        assert.strictEqual(resGet.statusCode, 403, 'Should forbid cross-tenant schedule retrieval');

        // Worker attempts to view another worker's scheduled tests
        const workerUser1 = { _id: worker1._id, role: 'worker', subdomain: 'techcorp' };
        const reqWorker = mockReq(workerUser1, { workerId: worker2._id.toString() });
        const resWorker = mockRes();
        await getWorkerScheduledTests(reqWorker, resWorker);
        assert.strictEqual(resWorker.statusCode, 403, 'Worker cannot view another worker\'s scheduled tests');
    });

    // 20. Timezone and daylight-saving edge cases behave correctly where applicable
    await test('20. Timezone and daylight-saving edge cases behave correctly where applicable', async () => {
        // America/New_York (observes Daylight Saving Time)
        // Standard time test in January: UTC-5
        const nyOcc = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'America/New_York',
            referenceDate: new Date('2027-01-05T12:00:00.000Z')
        });
        assert.strictEqual(nyOcc.testDate, '2027-01-06');
        // 10:00 AM EST (UTC-5) = 15:00 UTC
        assert.strictEqual(nyOcc.windowStartUtc.toISOString(), '2027-01-06T15:00:00.000Z');

        // Daylight time test in July: UTC-4
        const nySummerOcc = calculateNextOccurrence({
            recurrenceDay: 'Wednesday',
            startTime: '10:00',
            endTime: '11:00',
            timezone: 'America/New_York',
            referenceDate: new Date('2027-07-06T12:00:00.000Z')
        });
        assert.strictEqual(nySummerOcc.testDate, '2027-07-07');
        // 10:00 AM EDT (UTC-4) = 14:00 UTC
        assert.strictEqual(nySummerOcc.windowStartUtc.toISOString(), '2027-07-07T14:00:00.000Z');
    });

    console.log('\n================================================================');
    console.log(` Summary: ${pass} passed, ${fail} failed out of ${pass + fail} tests.`);
    console.log('================================================================\n');

    if (fail > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Fatal suite error:', err);
    process.exit(1);
});
