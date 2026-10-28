// services/testScheduler.js
const mongoose = require('mongoose');
const TestSchedule = require('../models/TestSchedule');
const Question = require('../models/Question');
const Worker = require('../models/Worker');
const DailyTopic = require('../models/DailyTopic');
const jobManager = require('../utils/jobManager');
const { processQuestionGeneration } = require('../utils/questionProcessor');

const log = {
    info: (msg, meta = {}) => console.log(`[TestScheduler] [INFO] ${new Date().toISOString()} - ${msg}`, meta),
    warn: (msg, meta = {}) => console.warn(`[TestScheduler] [WARN] ${new Date().toISOString()} - ${msg}`, meta),
    error: (msg, meta = {}) => console.error(`[TestScheduler] [ERROR] ${new Date().toISOString()} - ${msg}`, meta)
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_MAP = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
};

/**
 * Calculates local timezone offset in ms relative to UTC for a target date
 */
function getTimezoneOffsetMs(timeZone, date = new Date()) {
    try {
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
        return tzDate.getTime() - utcDate.getTime();
    } catch (e) {
        // Fallback to Asia/Kolkata (+05:30 = 19800000ms) if invalid
        return 19800000;
    }
}

/**
 * Converts date string (YYYY-MM-DD), time string (HH:mm), and IANA timezone into an exact UTC Date
 */
function parseTimeToUtc(dateStr, timeStr, timeZone = 'Asia/Kolkata') {
    if (!dateStr || !timeStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Target local milliseconds from UTC epoch
    const targetLocalMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
    const offsetMs = getTimezoneOffsetMs(timeZone, new Date(targetLocalMs));
    return new Date(targetLocalMs - offsetMs);
}

/**
 * Extracts localized calendar parts (year, month, day, weekday, time) in given IANA timezone
 */
function getLocalDateParts(date = new Date(), timeZone = 'Asia/Kolkata') {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(date);
        const map = {};
        for (const p of parts) map[p.type] = p.value;

        const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });
        const weekdayName = dayFormatter.format(date);

        return {
            year: parseInt(map.year, 10),
            month: parseInt(map.month, 10),
            day: parseInt(map.day, 10),
            hour: parseInt(map.hour, 10),
            minute: parseInt(map.minute, 10),
            weekdayName,
            weekdayIndex: WEEKDAY_MAP[weekdayName.toLowerCase()] ?? 0,
            dateStr: `${map.year}-${map.month}-${map.day}`
        };
    } catch (e) {
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
            weekdayName: WEEKDAY_NAMES[date.getUTCDay()],
            weekdayIndex: date.getUTCDay(),
            dateStr: date.toISOString().slice(0, 10)
        };
    }
}

/**
 * Calculates the next occurrence date (YYYY-MM-DD) and UTC windows for a recurring weekly schedule.
 * Correctly accounts for timezone, month/year boundaries, and daylight saving transitions.
 */
function calculateNextOccurrence({
    recurrenceDay = 'Wednesday',
    startTime = '10:00',
    endTime = '11:00',
    timezone = 'Asia/Kolkata',
    referenceDate = new Date()
}) {
    const targetDayIndex = WEEKDAY_MAP[String(recurrenceDay).toLowerCase()] ?? 3; // 3 = Wednesday
    const local = getLocalDateParts(referenceDate, timezone);

    let daysToAdd = 0;
    if (local.weekdayIndex === targetDayIndex) {
        const todayWindowEndUtc = parseTimeToUtc(local.dateStr, endTime, timezone);
        if (referenceDate >= todayWindowEndUtc) {
            daysToAdd = 7;
        } else {
            daysToAdd = 0;
        }
    } else {
        daysToAdd = (targetDayIndex - local.weekdayIndex + 7) % 7;
    }

    const occUtcEpoch = Date.UTC(local.year, local.month - 1, local.day + daysToAdd);
    const occDateObj = new Date(occUtcEpoch);
    const occYear = occDateObj.getUTCFullYear();
    const occMonth = String(occDateObj.getUTCMonth() + 1).padStart(2, '0');
    const occDay = String(occDateObj.getUTCDate()).padStart(2, '0');
    const testDate = `${occYear}-${occMonth}-${occDay}`;

    const windowStartUtc = parseTimeToUtc(testDate, startTime, timezone);
    const windowEndUtc = parseTimeToUtc(testDate, endTime, timezone);

    return {
        testDate,
        windowStartUtc,
        windowEndUtc,
        recurrenceDay: WEEKDAY_NAMES[targetDayIndex]
    };
}

/**
 * Recovers stale locks left by crashes or interrupted processes (> 10 mins old)
 */
async function recoverStaleLocks() {
    try {
        const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
        const result = await TestSchedule.updateMany(
            {
                status: 'Generating',
                executionLock: { $lt: staleThreshold }
            },
            {
                $set: {
                    status: 'Scheduled',
                    executionLock: null
                }
            }
        );
        if (result && result.modifiedCount > 0) {
            log.warn(`Recovered ${result.modifiedCount} schedules with stale generation locks.`);
        }
    } catch (err) {
        log.error('Error recovering stale locks:', err);
    }
}

/**
 * Updates schedule status based on current time window:
 * - Ready -> In Progress (when within window)
 * - In Progress -> Completed (when window closes for one-time schedules)
 * - Automatically advances recurring weekly schedules to the next occurrence without resetting history.
 */
async function updateScheduleWindowStatuses(now = new Date()) {
    try {
        const currentTime = new Date(now);

        // 1. Transition Ready -> In Progress
        await TestSchedule.updateMany(
            {
                status: 'Ready',
                windowStartUtc: { $lte: currentTime },
                windowEndUtc: { $gte: currentTime }
            },
            {
                $set: { status: 'In Progress' }
            }
        );

        // 2. Handle schedules whose window has elapsed (windowEndUtc < currentTime)
        const expiredSchedules = await TestSchedule.find({
            status: { $in: ['In Progress', 'Ready', 'Scheduled'] },
            windowEndUtc: { $lt: currentTime }
        });

        for (const sched of expiredSchedules) {
            const isRecurringWeekly = sched.repeatSchedule === 'weekly' && sched.repeatUntilDisabled !== false;

            if (!isRecurringWeekly) {
                // One-time schedule: simply mark Completed
                sched.status = 'Completed';
                await sched.save();
            } else {
                // Recurring weekly schedule: record past occurrence and advance
                const occurrenceDate = sched.testDate;
                const occId = `${sched._id}_${occurrenceDate}`;
                const batchId = sched.batchId || `sched_${sched._id}_${occurrenceDate}`;

                const existingOccIndex = (sched.occurrences || []).findIndex(
                    o => o.occurrenceId === occId || o.occurrenceDate === occurrenceDate
                );

                const questionsCount = sched.batchId ? await Question.countDocuments({ batchId: sched.batchId }) : 0;
                const occStatus = questionsCount > 0 ? 'Completed' : (sched.status === 'Scheduled' ? 'Failed' : 'Completed');

                const occRecord = {
                    occurrenceId: occId,
                    occurrenceDate,
                    batchId,
                    status: occStatus,
                    windowStartUtc: sched.windowStartUtc,
                    windowEndUtc: sched.windowEndUtc,
                    generatedAt: sched.lastExecutedAt || sched.createdAt,
                    questionsCount,
                    failureReason: sched.failureReason || null
                };

                if (existingOccIndex >= 0) {
                    sched.occurrences[existingOccIndex] = occRecord;
                } else {
                    sched.occurrences.push(occRecord);
                }

                // Calculate next occurrence
                const nextOcc = calculateNextOccurrence({
                    recurrenceDay: sched.recurrenceDay || 'Wednesday',
                    startTime: sched.startTime,
                    endTime: sched.endTime,
                    timezone: sched.timezone,
                    referenceDate: currentTime
                });

                sched.testDate = nextOcc.testDate;
                sched.windowStartUtc = nextOcc.windowStartUtc;
                sched.windowEndUtc = nextOcc.windowEndUtc;
                sched.status = 'Scheduled';
                sched.batchId = null;
                sched.failureReason = null;
                sched.failureDiagnostic = null;
                sched.executionLock = null;
                await sched.save();

                log.info(`Weekly recurring schedule "${sched.name}" advanced to next occurrence on ${nextOcc.testDate}`);
            }
        }
    } catch (err) {
        log.error('Error updating schedule window statuses:', err);
    }
}

/**
 * Generates questions for a locked schedule document with deterministic occurrence identity and idempotency
 */
async function generateQuestionsForSchedule(schedule) {
    const occurrenceDate = schedule.testDate;
    const occurrenceId = `${schedule._id}_${occurrenceDate}`;
    const batchId = `sched_${schedule._id}_${occurrenceDate}`;
    schedule.batchId = batchId;

    const workerIds = (schedule.workers || []).map(w => w.toString());

    if (workerIds.length === 0) {
        schedule.status = 'Failed';
        schedule.failureReason = 'No eligible workers assigned to schedule.';
        schedule.executionLock = null;
        await schedule.save();
        return { success: false, reason: schedule.failureReason };
    }

    // Idempotency: Avoid generating again if questions already exist for this occurrence
    const existingCount = await Question.countDocuments({ batchId });
    if (existingCount > 0) {
        log.info(`Questions already exist for batch ${batchId} (${existingCount} questions). Preserving prepared questions.`);
        const now = new Date();
        const start = new Date(schedule.windowStartUtc);
        const end = new Date(schedule.windowEndUtc);
        let finalStatus = 'Ready';
        if (now >= start && now <= end) finalStatus = 'In Progress';
        else if (now > end) finalStatus = 'Completed';

        schedule.status = finalStatus;
        schedule.executionLock = null;
        schedule.failureReason = null;

        const occIndex = (schedule.occurrences || []).findIndex(
            o => o.occurrenceId === occurrenceId || o.occurrenceDate === occurrenceDate
        );
        const occData = {
            occurrenceId,
            occurrenceDate,
            batchId,
            status: finalStatus,
            windowStartUtc: schedule.windowStartUtc,
            windowEndUtc: schedule.windowEndUtc,
            generatedAt: schedule.lastExecutedAt || now,
            questionsCount: existingCount
        };
        if (occIndex >= 0) {
            schedule.occurrences[occIndex] = { ...schedule.occurrences[occIndex], ...occData };
        } else {
            schedule.occurrences.push(occData);
        }

        await schedule.save();
        return { success: true, batchId, persistedCount: existingCount, status: finalStatus, alreadyGenerated: true };
    }

    // Prepare jobData for processor
    const isManual = schedule.topicSource === 'manual';
    const jobData = {
        workerIds,
        adminSubdomain: schedule.subdomain,
        topicMode: isManual ? 'common' : 'individual',
        commonTopics: isManual ? schedule.manualTopics : undefined,
        startDate: schedule.topicDateRange?.startDate,
        endDate: schedule.topicDateRange?.endDate,
        numQuestions: schedule.questionsPerWorker || 10,
        difficulty: schedule.difficulty || 'Medium',
        questionFormat: schedule.questionFormat || 'mcq',
        upscFormat: schedule.upscFormat || 'E',
        timeDuration: schedule.timePerQuestion || 30,
        totalTestDuration: schedule.totalTestDuration || ((schedule.questionsPerWorker || 10) * (schedule.timePerQuestion || 30)),
        showFeedback: schedule.showFeedback !== false,
        allowHistoricalFallback: !!schedule.allowHistoricalFallback
    };

    // Initialize job status in jobManager
    jobManager.createJob(batchId, {
        totalWorkers: workerIds.length,
        processedWorkers: 0,
        completedWorkers: 0,
        failedWorkers: 0,
        questionsGenerated: 0,
        targetQuestions: workerIds.length * (schedule.questionsPerWorker || 10),
        status: 'running',
        startTime: new Date()
    });

    log.info(`Executing generation for schedule "${schedule.name}" (occurrence: ${occurrenceId}, batch: ${batchId})`);

    try {
        await processQuestionGeneration(jobData, batchId);
        const jobStatus = jobManager.getJob(batchId);

        const persistedCount = await Question.countDocuments({ batchId });

        if (persistedCount === 0 || (jobStatus && jobStatus.status === 'failed')) {
            const failReason = jobStatus?.reason || 'Zero questions were generated or persisted for the assigned topics.';
            schedule.status = 'Failed';
            schedule.failureReason = failReason;
            schedule.failureDiagnostic = jobStatus?.diagnostic || null;
            schedule.executionLock = null;

            const occIndex = (schedule.occurrences || []).findIndex(
                o => o.occurrenceId === occurrenceId || o.occurrenceDate === occurrenceDate
            );
            const failData = {
                occurrenceId,
                occurrenceDate,
                batchId,
                status: 'Failed',
                windowStartUtc: schedule.windowStartUtc,
                windowEndUtc: schedule.windowEndUtc,
                questionsCount: 0,
                failureReason: failReason
            };
            if (occIndex >= 0) {
                schedule.occurrences[occIndex] = { ...schedule.occurrences[occIndex], ...failData };
            } else {
                schedule.occurrences.push(failData);
            }

            await schedule.save();
            log.warn(`Schedule generation failed for "${schedule.name}": ${failReason}`);
            return { success: false, reason: failReason };
        }

        // Successfully generated!
        const now = new Date();
        const start = new Date(schedule.windowStartUtc);
        const end = new Date(schedule.windowEndUtc);

        let finalStatus = 'Ready';
        if (now >= start && now <= end) {
            finalStatus = 'In Progress';
        } else if (now > end) {
            finalStatus = 'Completed';
        }

        schedule.batchId = batchId;
        schedule.status = finalStatus;
        schedule.failureReason = null;
        schedule.failureDiagnostic = null;
        schedule.executionLock = null;
        schedule.lastExecutedAt = now;

        const occIndex = (schedule.occurrences || []).findIndex(
            o => o.occurrenceId === occurrenceId || o.occurrenceDate === occurrenceDate
        );
        const occData = {
            occurrenceId,
            occurrenceDate,
            batchId,
            status: finalStatus,
            windowStartUtc: schedule.windowStartUtc,
            windowEndUtc: schedule.windowEndUtc,
            generatedAt: now,
            questionsCount: persistedCount
        };
        if (occIndex >= 0) {
            schedule.occurrences[occIndex] = { ...schedule.occurrences[occIndex], ...occData };
        } else {
            schedule.occurrences.push(occData);
        }

        await schedule.save();

        log.info(`Schedule "${schedule.name}" generated successfully. ${persistedCount} questions persisted. Status: ${finalStatus}`);
        return { success: true, batchId, persistedCount, status: finalStatus, occurrenceId };
    } catch (err) {
        schedule.status = 'Failed';
        schedule.failureReason = err.message || 'Unexpected error during question generation.';
        schedule.executionLock = null;
        await schedule.save();
        log.error(`Exception during schedule generation for "${schedule.name}":`, err);
        return { success: false, reason: err.message };
    }
}

/**
 * Checks for due schedules and executes them safely with concurrency locks
 */
async function checkAndExecuteDueSchedules(options = {}) {
    await recoverStaleLocks();
    const now = options.now ? new Date(options.now) : new Date();

    const dueThreshold = new Date(now.getTime() + 5 * 60 * 1000);

    const candidates = await TestSchedule.find({
        status: { $in: ['Scheduled'] },
        $and: [
            {
                $or: [
                    { generationTiming: 'in_advance' },
                    { 
                        generationTiming: 'at_start_time',
                        windowStartUtc: { $lte: dueThreshold }
                    }
                ]
            },
            {
                $or: [
                    { executionLock: null },
                    { executionLock: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }
                ]
            }
        ]
    }).limit(5);

    const executionResults = [];

    for (const candidate of candidates) {
        // Concurrency-safe atomic lock
        const lockedSchedule = await TestSchedule.findOneAndUpdate(
            {
                _id: candidate._id,
                status: 'Scheduled',
                $or: [
                    { executionLock: null },
                    { executionLock: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }
                ]
            },
            {
                $set: {
                    status: 'Generating',
                    executionLock: new Date()
                }
            },
            { new: true }
        );

        if (!lockedSchedule) {
            continue;
        }

        const result = await generateQuestionsForSchedule(lockedSchedule);
        executionResults.push({ scheduleId: candidate._id, ...result });
    }

    await updateScheduleWindowStatuses(now);

    return executionResults;
}

/**
 * Allows Admin to trigger question generation immediately
 */
async function executeScheduleNow(scheduleId, user = null) {
    const schedule = await TestSchedule.findById(scheduleId);
    if (!schedule) {
        throw new Error('Test schedule not found');
    }

    if (schedule.status === 'Completed') {
        throw new Error('Cannot regenerate a test schedule that has already completed.');
    }

    schedule.status = 'Generating';
    schedule.executionLock = new Date();
    if (user && user._id) {
        schedule.updatedBy = user._id;
    }
    await schedule.save();

    return await generateQuestionsForSchedule(schedule);
}

/**
 * Pauses a recurring or scheduled test schedule
 */
async function pauseSchedule(scheduleId, user = null) {
    const schedule = await TestSchedule.findById(scheduleId);
    if (!schedule) {
        throw new Error('Test schedule not found');
    }
    if (['Completed', 'Cancelled'].includes(schedule.status)) {
        throw new Error(`Cannot pause a ${schedule.status.toLowerCase()} schedule.`);
    }

    schedule.status = 'Paused';
    schedule.executionLock = null;
    if (user && user._id) {
        schedule.updatedBy = user._id;
    }
    await schedule.save();
    return schedule;
}

/**
 * Resumes a paused test schedule and recalculates the next upcoming occurrence
 */
async function resumeSchedule(scheduleId, user = null) {
    const schedule = await TestSchedule.findById(scheduleId);
    if (!schedule) {
        throw new Error('Test schedule not found');
    }
    if (schedule.status !== 'Paused') {
        throw new Error('Only paused schedules can be resumed.');
    }

    const now = new Date();
    if (schedule.repeatSchedule === 'weekly') {
        const nextOcc = calculateNextOccurrence({
            recurrenceDay: schedule.recurrenceDay || 'Wednesday',
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            timezone: schedule.timezone,
            referenceDate: now
        });
        schedule.testDate = nextOcc.testDate;
        schedule.windowStartUtc = nextOcc.windowStartUtc;
        schedule.windowEndUtc = nextOcc.windowEndUtc;
        schedule.batchId = null;
    }

    schedule.status = 'Scheduled';
    schedule.failureReason = null;
    schedule.failureDiagnostic = null;
    schedule.executionLock = null;
    if (user && user._id) {
        schedule.updatedBy = user._id;
    }
    await schedule.save();

    if (schedule.generationTiming === 'in_advance') {
        setImmediate(async () => {
            try {
                await executeScheduleNow(schedule._id, user);
            } catch (e) {
                console.error('[TestScheduler] Resume background generation failed:', e.message);
            }
        });
    }

    return schedule;
}

module.exports = {
    WEEKDAY_NAMES,
    WEEKDAY_MAP,
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
};

