// controllers/testScheduleController.js
const mongoose = require('mongoose');
const TestSchedule = require('../models/TestSchedule');
const Worker = require('../models/Worker');
const TestAttempt = require('../models/TestAttempt');
const {
    parseTimeToUtc,
    calculateNextOccurrence,
    executeScheduleNow,
    pauseSchedule: pauseScheduleService,
    resumeSchedule: resumeScheduleService
} = require('../services/testScheduler');

const resolveSubdomain = (subdomain, user) => {
    if (user?.subdomain && user.subdomain !== 'main') {
        return user.subdomain;
    }
    if ((!subdomain || subdomain === 'main') && user?.subdomain) {
        return user.subdomain;
    }
    return subdomain || 'default';
};

// @desc    Create a new test schedule
// @route   POST /api/test/schedules
// @access  Private/Admin
const createSchedule = async (req, res) => {
    try {
        let {
            name,
            workers,
            departments,
            topicSource = 'daily_topics',
            topicDateRange,
            manualTopics,
            allowHistoricalFallback = false,
            testDate,
            startTime = '10:00',
            endTime = '11:00',
            timezone = 'Asia/Kolkata',
            generationTiming = 'in_advance',
            questionsPerWorker = 10,
            difficulty = 'Medium',
            questionFormat = 'mcq',
            upscFormat = 'E',
            timePerQuestion = 30,
            totalTestDuration,
            showFeedback = true,
            repeatSchedule = 'none',
            recurrenceDay = 'Wednesday',
            repeatUntilDisabled = true
        } = req.body;

        const perQuestionSec = Number(timePerQuestion);
        if (timePerQuestion !== undefined && (isNaN(perQuestionSec) || perQuestionSec <= 0)) {
            return res.status(400).json({ message: 'Time per question must be a positive number of seconds.' });
        }
        const finalTimePerQuestion = perQuestionSec > 0 ? perQuestionSec : 30;
        const finalTotalTestDuration = Number(totalTestDuration) || ((Number(questionsPerWorker) || 10) * finalTimePerQuestion);

        const effectiveSubdomain = resolveSubdomain(req.body.subdomain, req.user);

        // Required field validation
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Schedule name is required.' });
        }

        // If weekly recurrence, compute initial occurrence date if not provided
        if (repeatSchedule === 'weekly' && !testDate) {
            const nextOcc = calculateNextOccurrence({
                recurrenceDay,
                startTime,
                endTime,
                timezone,
                referenceDate: new Date()
            });
            testDate = nextOcc.testDate;
        }

        if (!testDate || !startTime || !endTime) {
            return res.status(400).json({ message: 'Test date, start time, and end time are required.' });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!dateRegex.test(testDate)) {
            return res.status(400).json({ message: 'Test date must be in YYYY-MM-DD format.' });
        }
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({ message: 'Start time and end time must be in HH:mm (24-hour) format.' });
        }

        // Validate time window
        const windowStartUtc = parseTimeToUtc(testDate, startTime, timezone);
        const windowEndUtc = parseTimeToUtc(testDate, endTime, timezone);

        if (!windowStartUtc || !windowEndUtc || windowEndUtc <= windowStartUtc) {
            return res.status(400).json({ message: 'End time must be after start time on the test date.' });
        }

        // Validate workers
        let targetWorkerIds = Array.isArray(workers) ? workers.filter(Boolean) : [];

        // If departments provided and no specific workers, load all workers in those departments
        if (targetWorkerIds.length === 0 && Array.isArray(departments) && departments.length > 0) {
            const deptWorkers = await Worker.find({
                department: { $in: departments },
                ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
            }).select('_id');
            targetWorkerIds = deptWorkers.map(w => w._id);
        }

        if (targetWorkerIds.length === 0) {
            return res.status(400).json({ message: 'Please select at least one employee or department for the test.' });
        }

        // Validate workers belong to the requesting admin's tenant
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            const tenantWorkersCount = await Worker.countDocuments({
                _id: { $in: targetWorkerIds },
                subdomain: req.user.subdomain
            });
            if (tenantWorkersCount !== targetWorkerIds.length) {
                return res.status(403).json({ message: 'Access denied: One or more selected employees belong to another organization.' });
            }
        }

        // Validate topics
        let formattedManualTopics = [];
        if (topicSource === 'manual') {
            if (Array.isArray(manualTopics)) {
                formattedManualTopics = manualTopics.flatMap(t => typeof t === 'string' ? t.split(',').map(s => s.trim()) : []).filter(Boolean);
            } else if (typeof manualTopics === 'string') {
                formattedManualTopics = manualTopics.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (formattedManualTopics.length === 0) {
                return res.status(400).json({ message: 'Please enter at least one topic for manual topic mode.' });
            }
        } else {
            if (!topicDateRange || !topicDateRange.startDate || !topicDateRange.endDate) {
                return res.status(400).json({ message: 'Start date and end date are required for daily topic selection.' });
            }
        }

        const newSchedule = new TestSchedule({
            name: name.trim(),
            subdomain: effectiveSubdomain,
            workers: targetWorkerIds,
            departments: Array.isArray(departments) ? departments : [],
            topicSource,
            topicDateRange: topicSource === 'daily_topics' ? topicDateRange : undefined,
            manualTopics: formattedManualTopics,
            allowHistoricalFallback: !!allowHistoricalFallback,
            testDate,
            startTime,
            endTime,
            timezone,
            windowStartUtc,
            windowEndUtc,
            generationTiming,
            questionsPerWorker: Number(questionsPerWorker) || 10,
            difficulty,
            questionFormat,
            upscFormat,
            timePerQuestion: finalTimePerQuestion,
            totalTestDuration: finalTotalTestDuration,
            showFeedback: showFeedback !== false,
            repeatSchedule,
            recurrenceDay,
            repeatUntilDisabled: repeatUntilDisabled !== false,
            status: 'Scheduled',
            createdBy: req.user?._id
        });

        await newSchedule.save();

        // If in_advance generation, optionally trigger background generation immediately
        if (generationTiming === 'in_advance') {
            setImmediate(async () => {
                try {
                    await executeScheduleNow(newSchedule._id, req.user);
                } catch (genErr) {
                    console.error('[TestSchedule] Background in-advance generation failed:', genErr.message);
                }
            });
        }

        return res.status(201).json({
            message: 'Test schedule created successfully.',
            schedule: newSchedule
        });
    } catch (error) {
        console.error('Error creating test schedule:', error);
        return res.status(500).json({ message: error.message || 'Server error creating test schedule.' });
    }
};

// @desc    Get all test schedules for current tenant
// @route   GET /api/test/schedules
// @access  Private/Admin
const getSchedules = async (req, res) => {
    try {
        const effectiveSubdomain = resolveSubdomain(req.query.subdomain, req.user);
        const { status, startDate, endDate, search } = req.query;

        const query = {};
        if (effectiveSubdomain && effectiveSubdomain !== 'main') {
            query.subdomain = effectiveSubdomain;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        if (startDate && endDate) {
            query.testDate = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            query.testDate = { $gte: startDate };
        }

        if (search && search.trim()) {
            query.name = { $regex: search.trim(), $options: 'i' };
        }

        const schedules = await TestSchedule.find(query)
            .populate('workers', 'name email department')
            .populate('createdBy', 'name email')
            .sort({ windowStartUtc: -1, createdAt: -1 });

        return res.status(200).json(schedules);
    } catch (error) {
        console.error('Error fetching test schedules:', error);
        return res.status(500).json({ message: 'Server error fetching test schedules.' });
    }
};

// @desc    Get a single test schedule by ID
// @route   GET /api/test/schedules/:id
// @access  Private/Admin
const getScheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid schedule ID.' });
        }

        const schedule = await TestSchedule.findById(id)
            .populate('workers', 'name email department')
            .populate('createdBy', 'name email');

        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Tenant verification
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (schedule.subdomain && schedule.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied: Schedule belongs to another organization.' });
            }
        }

        return res.status(200).json(schedule);
    } catch (error) {
        console.error('Error fetching test schedule details:', error);
        return res.status(500).json({ message: 'Server error fetching schedule details.' });
    }
};

// @desc    Update / Reschedule a test schedule
// @route   PUT /api/test/schedules/:id
// @access  Private/Admin
const updateSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid schedule ID.' });
        }

        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Tenant check
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (schedule.subdomain && schedule.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied: Schedule belongs to another organization.' });
            }
        }

        if (schedule.status === 'Completed') {
            return res.status(400).json({ message: 'Completed test schedules cannot be modified.' });
        }

        const updates = req.body;
        const testDate = updates.testDate || schedule.testDate;
        const startTime = updates.startTime || schedule.startTime;
        const endTime = updates.endTime || schedule.endTime;
        const timezone = updates.timezone || schedule.timezone;

        // If date or time changed, recalculate windows
        if (updates.testDate || updates.startTime || updates.endTime || updates.timezone) {
            const windowStartUtc = parseTimeToUtc(testDate, startTime, timezone);
            const windowEndUtc = parseTimeToUtc(testDate, endTime, timezone);

            if (!windowStartUtc || !windowEndUtc || windowEndUtc <= windowStartUtc) {
                return res.status(400).json({ message: 'End time must be after start time on the test date.' });
            }
            schedule.testDate = testDate;
            schedule.startTime = startTime;
            schedule.endTime = endTime;
            schedule.timezone = timezone;
            schedule.windowStartUtc = windowStartUtc;
            schedule.windowEndUtc = windowEndUtc;
        }

        if (updates.name) schedule.name = updates.name.trim();
        if (updates.workers !== undefined) {
            const updatedWorkers = Array.isArray(updates.workers) ? updates.workers.filter(Boolean) : [];
            if (updatedWorkers.length === 0) {
                return res.status(400).json({ message: 'Please select at least one employee or department for the test.' });
            }
            schedule.workers = updatedWorkers;
        }
        if (updates.departments) schedule.departments = updates.departments;
        if (updates.topicSource) schedule.topicSource = updates.topicSource;
        if (updates.topicDateRange) {
            if (schedule.topicSource === 'daily_topics') {
                if (!updates.topicDateRange.startDate || !updates.topicDateRange.endDate) {
                    return res.status(400).json({ message: 'Start date and end date are required for daily topic selection.' });
                }
                if (updates.topicDateRange.endDate < updates.topicDateRange.startDate) {
                    return res.status(400).json({ message: 'Topics "To Date" cannot be earlier than "From Date".' });
                }
            }
            schedule.topicDateRange = updates.topicDateRange;
        }
        if (updates.manualTopics !== undefined) {
            if (schedule.topicSource === 'manual') {
                let parsedManual = [];
                if (Array.isArray(updates.manualTopics)) {
                    parsedManual = updates.manualTopics.flatMap(t => typeof t === 'string' ? t.split(',').map(s => s.trim()) : []).filter(Boolean);
                } else if (typeof updates.manualTopics === 'string') {
                    parsedManual = updates.manualTopics.split(',').map(s => s.trim()).filter(Boolean);
                }
                if (parsedManual.length === 0) {
                    return res.status(400).json({ message: 'Please enter at least one topic for manual topic mode.' });
                }
                schedule.manualTopics = parsedManual;
            } else {
                schedule.manualTopics = updates.manualTopics;
            }
        }
        if (updates.questionsPerWorker) schedule.questionsPerWorker = Number(updates.questionsPerWorker);
        if (updates.difficulty) schedule.difficulty = updates.difficulty;
        if (updates.questionFormat) schedule.questionFormat = updates.questionFormat;
        if (updates.timePerQuestion !== undefined) {
            const perQ = Number(updates.timePerQuestion);
            if (isNaN(perQ) || perQ <= 0) {
                return res.status(400).json({ message: 'Time per question must be a positive number of seconds.' });
            }
            schedule.timePerQuestion = perQ;
            schedule.totalTestDuration = (Number(schedule.questionsPerWorker) || 10) * perQ;
        } else if (updates.totalTestDuration) {
            schedule.totalTestDuration = Number(updates.totalTestDuration);
        }
        if (updates.showFeedback !== undefined) schedule.showFeedback = updates.showFeedback;
        if (updates.allowHistoricalFallback !== undefined) schedule.allowHistoricalFallback = updates.allowHistoricalFallback;
        if (updates.repeatSchedule) schedule.repeatSchedule = updates.repeatSchedule;
        if (updates.recurrenceDay) schedule.recurrenceDay = updates.recurrenceDay;
        if (updates.repeatUntilDisabled !== undefined) schedule.repeatUntilDisabled = updates.repeatUntilDisabled;

        // If recurring weekly and recurrenceDay, startTime, endTime, or timezone changed, recalculate next occurrence
        if (schedule.repeatSchedule === 'weekly' && (updates.recurrenceDay || updates.startTime || updates.endTime || updates.timezone)) {
            const nextOcc = calculateNextOccurrence({
                recurrenceDay: schedule.recurrenceDay || 'Wednesday',
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                timezone: schedule.timezone,
                referenceDate: new Date()
            });
            schedule.testDate = nextOcc.testDate;
            schedule.windowStartUtc = nextOcc.windowStartUtc;
            schedule.windowEndUtc = nextOcc.windowEndUtc;
            schedule.batchId = `sched_${schedule._id}_${nextOcc.testDate}`;
            if (schedule.status === 'Ready') {
                schedule.status = 'Scheduled';
            }
        }

        schedule.updatedBy = req.user?._id;
        await schedule.save();

        return res.status(200).json({
            message: 'Test schedule updated successfully.',
            schedule
        });
    } catch (error) {
        console.error('Error updating test schedule:', error);
        return res.status(500).json({ message: error.message || 'Server error updating test schedule.' });
    }
};

// @desc    Pause a recurring or active test schedule
// @route   POST /api/test/schedules/:id/pause
// @access  Private/Admin
const pauseSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Tenant check
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (schedule.subdomain && schedule.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied.' });
            }
        }

        if (['Completed', 'Cancelled'].includes(schedule.status)) {
            return res.status(400).json({ message: `Cannot pause a ${schedule.status.toLowerCase()} schedule.` });
        }

        const paused = await pauseScheduleService(id, req.user);
        return res.status(200).json({ message: 'Test schedule paused successfully.', schedule: paused });
    } catch (error) {
        console.error('Error pausing schedule:', error);
        return res.status(500).json({ message: error.message || 'Server error pausing schedule.' });
    }
};

// @desc    Resume a paused test schedule
// @route   POST /api/test/schedules/:id/resume
// @access  Private/Admin
const resumeSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Tenant check
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (schedule.subdomain && schedule.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied.' });
            }
        }

        if (schedule.status !== 'Paused') {
            return res.status(400).json({ message: 'Only paused schedules can be resumed.' });
        }

        const resumed = await resumeScheduleService(id, req.user);
        return res.status(200).json({ message: 'Test schedule resumed successfully.', schedule: resumed });
    } catch (error) {
        console.error('Error resuming schedule:', error);
        return res.status(500).json({ message: error.message || 'Server error resuming schedule.' });
    }
};

// @desc    Cancel a test schedule
// @route   POST /api/test/schedules/:id/cancel
// @access  Private/Admin
const cancelSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Tenant check
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (schedule.subdomain && schedule.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied.' });
            }
        }

        schedule.status = 'Cancelled';
        schedule.updatedBy = req.user?._id;
        await schedule.save();

        return res.status(200).json({ message: 'Test schedule cancelled successfully.', schedule });
    } catch (error) {
        console.error('Error cancelling schedule:', error);
        return res.status(500).json({ message: 'Server error cancelling schedule.' });
    }
};

// @desc    Trigger question generation immediately for a schedule
// @route   POST /api/test/schedules/:id/generate-now
// @access  Private/Admin
const triggerScheduleNow = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        if (schedule.status === 'Completed') {
            return res.status(400).json({ message: 'Cannot generate questions for a completed schedule.' });
        }

        const result = await executeScheduleNow(id, req.user);
        return res.status(200).json({
            message: result.success ? 'Questions generated successfully.' : 'Generation failed: ' + result.reason,
            result
        });
    } catch (error) {
        console.error('Error triggering schedule generation:', error);
        return res.status(500).json({ message: error.message || 'Server error triggering question generation.' });
    }
};

// @desc    Retry question generation for a failed schedule
// @route   POST /api/test/schedules/:id/retry
// @access  Private/Admin
const retrySchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        schedule.status = 'Scheduled';
        schedule.failureReason = null;
        schedule.failureDiagnostic = null;
        schedule.executionLock = null;
        await schedule.save();

        const result = await executeScheduleNow(id, req.user);
        return res.status(200).json({
            message: result.success ? 'Schedule retried successfully.' : 'Retry failed: ' + result.reason,
            result
        });
    } catch (error) {
        console.error('Error retrying schedule:', error);
        return res.status(500).json({ message: error.message || 'Server error retrying schedule.' });
    }
};

// @desc    Delete a draft or cancelled schedule
// @route   DELETE /api/test/schedules/:id
// @access  Private/Admin
const deleteSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await TestSchedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Test schedule not found.' });
        }

        // Only allow deleting Draft, Cancelled, or Failed schedules
        if (!['Draft', 'Cancelled', 'Failed'].includes(schedule.status)) {
            return res.status(400).json({ message: 'Only Draft, Cancelled, or Failed schedules can be deleted. Cancel the schedule first if needed.' });
        }

        await TestSchedule.findByIdAndDelete(id);
        return res.status(200).json({ message: 'Test schedule deleted successfully.' });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        return res.status(500).json({ message: 'Server error deleting schedule.' });
    }
};

// @desc    Get scheduled tests for a specific worker
// @route   GET /api/test/schedules/worker/:workerId
// @access  Private/Worker or Admin
const getWorkerScheduledTests = async (req, res) => {
    try {
        const { workerId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(workerId)) {
            return res.status(400).json({ message: 'Invalid worker ID.' });
        }

        // Authorization check: Worker can only view their own schedules
        if (req.user && req.user.role === 'worker' && req.user._id.toString() !== workerId) {
            return res.status(403).json({ message: 'Access denied: You can only view your own scheduled tests.' });
        }

        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({ message: 'Worker not found.' });
        }

        const schedules = await TestSchedule.find({
            workers: workerId,
            status: { $in: ['Scheduled', 'Ready', 'In Progress', 'Completed'] }
        }).sort({ windowStartUtc: 1 });

        // Get completed attempts for this worker
        const completedAttempts = await TestAttempt.find({
            worker: workerId,
            status: 'completed'
        }).select('batchId score totalQuestions');

        const completedBatchMap = new Map();
        completedAttempts.forEach(a => {
            if (a.batchId) completedBatchMap.set(a.batchId, a);
        });

        const now = new Date();

        const formatted = schedules.map(s => {
            const start = new Date(s.windowStartUtc);
            const end = new Date(s.windowEndUtc);
            const isCompleted = s.batchId && completedBatchMap.has(s.batchId);
            const attempt = s.batchId ? completedBatchMap.get(s.batchId) : null;

            let workerStatus = 'upcoming';
            if (isCompleted) {
                workerStatus = 'completed';
            } else if (now < start) {
                workerStatus = 'upcoming';
            } else if (now >= start && now <= end) {
                workerStatus = s.batchId ? 'available' : 'generating';
            } else {
                workerStatus = 'expired';
            }

            return {
                scheduleId: s._id,
                name: s.name,
                batchId: s.batchId || null,
                testDate: s.testDate,
                startTime: s.startTime,
                endTime: s.endTime,
                timezone: s.timezone,
                windowStartUtc: s.windowStartUtc,
                windowEndUtc: s.windowEndUtc,
                durationPerQuestion: s.timePerQuestion,
                totalTestDuration: s.totalTestDuration,
                questionCount: s.questionsPerWorker,
                topicSource: s.topicSource,
                topics: s.topicSource === 'manual' ? s.manualTopics : ['Daily Topics (' + (s.topicDateRange?.startDate || '') + ' to ' + (s.topicDateRange?.endDate || '') + ')'],
                status: workerStatus,
                score: attempt ? attempt.score : null,
                totalQuestions: attempt ? attempt.totalQuestions : null
            };
        });

        return res.status(200).json(formatted);
    } catch (error) {
        console.error('Error fetching worker scheduled tests:', error);
        return res.status(500).json({ message: 'Server error fetching worker scheduled tests.' });
    }
};

module.exports = {
    createSchedule,
    getSchedules,
    getScheduleById,
    updateSchedule,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
    triggerScheduleNow,
    retrySchedule,
    deleteSchedule,
    getWorkerScheduledTests
};
