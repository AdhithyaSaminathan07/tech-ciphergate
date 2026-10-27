// controllers/questionController.js
const { v4: uuidv4 } = require('uuid');
const Question = require('../models/Question');
const mongoose = require('mongoose');
const TestAttempt = require('../models/TestAttempt');
const QuickTest = require('../models/QuickTest');
const Worker = require('../models/Worker');  // Using Attendance App's Worker model
const LearningTopic = require('../models/LearningTopic');
const DailyTopic = require('../models/DailyTopic');
const validator = require('validator');
const jobManager = require('../utils/jobManager');
const { processQuestionGeneration, processThreeSetQuestionGeneration } = require('../utils/questionProcessor');
const { generateMCQQuestions, generateUPSCQuestions } = require('../utils/openai');

// Simple logging utility
const log = {
    info: (message, data = {}) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
    },
    error: (message, error = {}) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    },
    warn: (message, data = {}) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
    }
};

// Default fallback topics for employees without specific topics
const DEFAULT_FALLBACK_TOPICS = [
    'General Knowledge',
    'Problem Solving',
    'Communication Skills'
];

// Constants for batch processing and retry logic
const MAX_RETRIES = 5;
const RETRY_DELAY = 1500;

// Input validation middleware
const validateQuestionGeneration = async (req, res, next) => {
    const { workerIds, numQuestions, topic, commonTopics, individualTopics, topicMode, questionFormat, generationMode } = req.body;

    if (!workerIds || !Array.isArray(workerIds) || workerIds.length === 0) {
        return res.status(400).json({ message: 'At least one employee must be selected' });
    }
    if (workerIds.length > 100) {
        return res.status(400).json({ message: 'Maximum 100 employees per request for performance reasons' });
    }
    for (const id of workerIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: `Invalid worker ID format: ${id}`
            });
        }
    }

    // Tenant isolation: Enforce that all workers belong to admin's organization
    if (req.user?.subdomain && req.user.subdomain !== 'main') {
        try {
            const isMockedOrConnected = Worker.find !== mongoose.Model.find || mongoose.connection.readyState === 1;
            if (isMockedOrConnected) {
                const crossTenantWorkers = await Worker.find({
                    _id: { $in: workerIds },
                    subdomain: { $ne: req.user.subdomain }
                }).select('_id');
                if (crossTenantWorkers && crossTenantWorkers.length > 0) {
                    return res.status(403).json({
                        message: 'Cannot generate or assign tests to workers from another organization.'
                    });
                }
            }
        } catch (workerTenantErr) {
            log.warn('Could not verify worker tenant isolation:', workerTenantErr.message);
        }
    }
    const numQuestionsInt = parseInt(numQuestions);
    if (isNaN(numQuestionsInt) || numQuestionsInt < 1 || numQuestionsInt > 100) {
        return res.status(400).json({
            message: 'Number of questions must be between 1 and 100'
        });
    }
    if (workerIds.length * numQuestionsInt > 5000) {
        return res.status(400).json({
            message: `Enterprise limit: Maximum 5000 total questions per request. You requested ${workerIds.length} × ${numQuestionsInt} = ${workerIds.length * numQuestionsInt} questions. Please reduce the number of employees or questions per employee.`
        });
    }
    if (workerIds.length * numQuestionsInt > 1500) {
        log.warn(`🏢 LARGE ENTERPRISE REQUEST: ${workerIds.length} workers × ${numQuestionsInt} questions = ${workerIds.length * numQuestionsInt} total questions`);
    }

    // Validate topic based on mode
    if (topicMode === 'common') {
        // For common mode, either topic string or commonTopics array must be provided
        const topicsToCheck = (Array.isArray(commonTopics) && commonTopics.length > 0)
            ? commonTopics
            : (typeof topic === 'string' && topic.trim() ? [topic.trim()] : []);

        if (topicsToCheck.length === 0) {
            return res.status(400).json({
                message: 'Common topics are required when using common mode'
            });
        }

        // Check each topic for XSS
        if (typeof topic === 'string' && /<script|javascript:|on\w+=/i.test(topic)) {
            return res.status(400).json({
                message: 'Invalid characters in topic'
            });
        }

        if (Array.isArray(commonTopics)) {
            for (const t of commonTopics) {
                if (typeof t === 'string' && /<script|javascript:|on\w+=/i.test(t)) {
                    return res.status(400).json({
                        message: 'Invalid characters in topics'
                    });
                }
            }
        }
    } else if (topicMode === 'individual') {
        // For individual mode, check individualTopics
        if (!individualTopics || Object.keys(individualTopics).length === 0) {
            // This is fine - we'll try to load topics from the database
        } else {
            for (const [workerId, topics] of Object.entries(individualTopics)) {
                if (!Array.isArray(topics)) {
                    return res.status(400).json({
                        message: 'Individual topics must be arrays'
                    });
                }
                for (const t of topics) {
                    if (/<script|javascript:|on\w+=/i.test(t)) {
                        return res.status(400).json({
                            message: 'Invalid characters in topics'
                        });
                    }
                }
            }
        }
    }

    // Validate question format
    if (questionFormat && !['mcq', 'upsc'].includes(questionFormat)) {
        return res.status(400).json({
            message: 'Invalid question format. Must be either "mcq" or "upsc".'
        });
    }

    // Validate generation mode
    if (generationMode && !['standard', 'three-sets'].includes(generationMode)) {
        return res.status(400).json({
            message: 'Invalid generation mode. Must be either "standard" or "three-sets".'
        });
    }

    next();
};

// @desc    Generate and store questions for multiple workers
// @route   POST /api/test/questions/generate
// @access  Private/Admin
const generateAndStoreQuestions = [
    validateQuestionGeneration,
    async (req, res) => {
        const jobId = uuidv4();
        jobManager.createJob(jobId, {
            totalWorkers: req.body.workerIds?.length || 0,
            workerIds: req.body.workerIds || []
        });

        // Immediately respond to the client with a job ID
        res.status(202).json({
            message: "Question generation process has been started.",
            jobId: jobId
        });

        // Start the generation process in the background without awaiting it.
        // This frees up the server to handle other requests.
        // Use the appropriate processor based on generation mode
        const { generationMode = 'standard' } = req.body;
        const processorFunction = generationMode === 'three-sets' ? processThreeSetQuestionGeneration : processQuestionGeneration;
        const adminSubdomain = req.user?.subdomain || (req.user?.role === 'admin' ? req.user.subdomain : 'main');
        const payload = {
            ...req.body,
            adminSubdomain: adminSubdomain || 'main',
            subdomain: (adminSubdomain && adminSubdomain !== 'main') ? adminSubdomain : (req.body.subdomain && req.body.subdomain !== 'main' ? req.body.subdomain : 'main')
        };

        processorFunction(payload, jobId).catch(err => {
            console.error(`Job ${jobId} failed catastrophically:`, err);
            jobManager.failJob(jobId, err.message || 'An unexpected error occurred during processing.');
        });
    }
];


// @desc    Get questions for a specific worker's test session
// @route   GET /api/test/questions/:workerId
// @access  Private/Worker
const getQuestionsForTest = async (req, res) => {
    const { workerId } = req.params;

    try {
        // Validate worker ID format upfront
        if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
            return res.status(400).json({
                message: 'Invalid or missing employee ID.',
                reason: 'invalid_worker_id'
            });
        }

        // Clean metadata logging (prevents leaking credentials or large embedding vectors)
        log.info('Test questions requested', {
            userId: req.user?._id?.toString(),
            role: req.user?.role,
            subdomain: req.user?.subdomain,
            requestedWorkerId: String(workerId)
        });

        // Authorization check: Workers can only access their own questions
        if (req.user?.role === 'worker') {
            const userIdString = req.user._id ? req.user._id.toString() : '';
            const requestedIdString = workerId.toString();

            if (userIdString !== requestedIdString) {
                return res.status(403).json({
                    message: 'Access denied. You can only access your own test questions.',
                    reason: 'access_denied'
                });
            }
        }

        // Find the worker
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({
                message: 'Worker not found.',
                reason: 'worker_not_found'
            });
        }

        // Tenant isolation check
        const effectiveSubdomain = req.user?.subdomain || req.subdomain || 'main';
        if (worker.subdomain && effectiveSubdomain !== 'main' && worker.subdomain !== effectiveSubdomain) {
            return res.status(403).json({
                message: 'Access denied: Worker belongs to a different organization.',
                reason: 'tenant_mismatch'
            });
        }

        // Intelligent Batch Selection:
        // 1. If explicit batchId or testId provided in query, honor it
        const requestedBatchId = req.query.batchId || req.query.testId;
        let selectedQuestionEntry = null;

        if (requestedBatchId) {
            selectedQuestionEntry = await Question.findOne({ worker: workerId, batchId: requestedBatchId })
                .sort({ createdAt: -1 })
                .select('topic timeDuration totalTestDuration createdAt isMixed allTopics questionSet showFeedback batchId')
                .lean();

            if (!selectedQuestionEntry) {
                return res.status(404).json({
                    message: `Test batch "${requestedBatchId}" was not found for this employee.`,
                    reason: 'batch_not_found'
                });
            }
        }

        // 2. If worker has an active, unexpired in-progress attempt, prioritize that attempt's batch
        if (!selectedQuestionEntry) {
            try {
                if (TestAttempt.findOne !== mongoose.Model.findOne || mongoose.connection.readyState === 1) {
                    const queryObj = TestAttempt.findOne({
                        worker: workerId,
                        status: 'in-progress'
                    });
                    const inProgressAttempt = typeof queryObj?.sort === 'function'
                        ? await queryObj.sort({ createdAt: -1 })
                        : await queryObj;

                    if (inProgressAttempt && inProgressAttempt.batchId) {
                        const now = Date.now();
                        const startTime = inProgressAttempt.testStartTime ? new Date(inProgressAttempt.testStartTime).getTime() : now;
                        const elapsed = Math.floor((now - startTime) / 1000);
                        const limit = inProgressAttempt.totalTestDuration || 600;
                        if (elapsed < limit) {
                            selectedQuestionEntry = await Question.findOne({ worker: workerId, batchId: inProgressAttempt.batchId })
                                .sort({ createdAt: -1 })
                                .select('topic timeDuration totalTestDuration createdAt isMixed allTopics questionSet showFeedback batchId')
                                .lean();
                        }
                    }
                }
            } catch (activeAttemptErr) {
                log.warn('Could not inspect active attempt for batch selection:', activeAttemptErr.message);
            }
        }

        // 3. Find latest uncompleted batch if multiple tests exist for this developer
        let completedBatchIds = [];
        if (!selectedQuestionEntry) {
            try {
                if (TestAttempt.find !== mongoose.Model.find || mongoose.connection.readyState === 1) {
                    const completedAttemptsQuery = TestAttempt.find({
                        worker: workerId,
                        status: 'completed',
                        batchId: { $exists: true, $ne: null }
                    });
                    const completedAttempts = typeof completedAttemptsQuery?.select === 'function'
                        ? await completedAttemptsQuery.select('batchId')
                        : await completedAttemptsQuery;

                    if (Array.isArray(completedAttempts) && completedAttempts.length > 0) {
                        completedBatchIds = completedAttempts.map(a => a.batchId).filter(Boolean);
                    }

                    if (completedBatchIds.length > 0) {
                        selectedQuestionEntry = await Question.findOne({
                            worker: workerId,
                            batchId: { $nin: completedBatchIds }
                        })
                        .sort({ createdAt: -1 })
                        .select('topic timeDuration totalTestDuration createdAt isMixed allTopics questionSet showFeedback batchId')
                        .lean();
                    }
                }
            } catch (uncompletedErr) {
                log.warn('Could not query uncompleted batches:', uncompletedErr.message);
            }
        }

        // Check if question generation is in progress or recently failed for this worker BEFORE falling back
        if (!selectedQuestionEntry && global.jobs) {
            for (const job of global.jobs.values()) {
                if (job.state === 'queued' || job.state === 'processing') {
                    const isForWorker = !job.workerIds || job.workerIds.length === 0 || job.workerIds.map(String).includes(String(workerId));
                    if (isForWorker) {
                        return res.status(404).json({
                            message: 'Question generation is currently in progress. Please check back shortly.',
                            reason: 'generation_in_progress',
                            progress: job.progress || 0
                        });
                    }
                }
                if (job.state === 'failed') {
                    const failedWorker = job.failedWorkers?.find(f => String(f.workerId) === String(workerId));
                    if (failedWorker) {
                        return res.status(404).json({
                            message: `Question generation failed for this employee: ${failedWorker.reason || job.reason || 'No questions generated'}. Please contact your administrator.`,
                            reason: 'generation_failed',
                            details: failedWorker.reason || job.reason
                        });
                    }
                }
            }
        }

        // 4. Default: Fallback to the absolute latest assigned batch if no generation is active/failed
        if (!selectedQuestionEntry) {
            selectedQuestionEntry = await Question.findOne({ worker: workerId })
                .sort({ createdAt: -1 })
                .select('topic timeDuration totalTestDuration createdAt isMixed allTopics questionSet showFeedback batchId')
                .lean();
        }

        const latestQuestionEntry = selectedQuestionEntry;

        if (!latestQuestionEntry) {
            // Distinguish whether worker has recorded topics vs not
            const topicQuery = DailyTopic.findOne({ workerId });
            const hasAnyTopics = typeof topicQuery?.lean === 'function' ? await topicQuery.lean() : await topicQuery;
            if (!hasAnyTopics) {
                return res.status(404).json({
                    message: 'No daily topics recorded yet. Please submit your daily topics before taking a test.',
                    reason: 'no_topics_recorded'
                });
            }

            return res.status(404).json({
                message: 'Topics were recorded, but no test questions have been generated for the selected period yet. Please contact your administrator.',
                reason: 'topics_not_found_for_period'
            });
        }

        const latestCreationTime = latestQuestionEntry.createdAt;
        const defaultDurationPerQuestion = latestQuestionEntry.timeDuration || 15;
        const totalDuration = latestQuestionEntry.totalTestDuration || 600;
        const isMixed = latestQuestionEntry.isMixed || false;
        const allTopics = latestQuestionEntry.allTopics || [latestQuestionEntry.topic];
        const questionSet = latestQuestionEntry.questionSet || null;

        // For mixed topics, use a combined topic identifier for test attempt
        // For single topic, use the original topic
        const testTopicId = isMixed ? allTopics.sort().join(',') : latestQuestionEntry.topic;

        // Retrieve all questions belonging to this specific generation batch
        let questions = [];
        if (latestQuestionEntry.batchId) {
            const batchQuery = { worker: workerId, batchId: latestQuestionEntry.batchId };
            if (questionSet) batchQuery.questionSet = questionSet;
            questions = await Question.find(batchQuery);
        }

        // Fallback for legacy records or unbatched questions
        if (!questions || questions.length === 0) {
            const timeThreshold = new Date(latestCreationTime.getTime() - 5 * 60000); // 5 minutes before
            const maxThreshold = new Date(latestCreationTime.getTime() + 5 * 60000); // 5 minutes after

            if (questionSet) {
                questions = await Question.find({
                    worker: workerId,
                    questionSet: questionSet,
                    createdAt: { $gte: timeThreshold, $lte: maxThreshold }
                });
                if (!questions || questions.length === 0) {
                    questions = await Question.find({
                        worker: workerId,
                        questionSet: questionSet
                    }).sort({ createdAt: -1 }).limit(latestQuestionEntry.totalQuestions || 20);
                }
            } else if (isMixed) {
                questions = await Question.find({
                    worker: workerId,
                    createdAt: { $gte: timeThreshold, $lte: maxThreshold }
                });
            } else {
                questions = await Question.find({
                    worker: workerId,
                    topic: latestQuestionEntry.topic,
                    createdAt: { $gte: timeThreshold, $lte: maxThreshold }
                });
                if (!questions || questions.length === 0) {
                    questions = await Question.find({ worker: workerId, topic: latestQuestionEntry.topic })
                        .sort({ createdAt: -1 })
                        .limit(latestQuestionEntry.totalQuestions || 20);
                }
            }
        }

        if (!questions || questions.length === 0) {
            return res.status(404).json({
                message: `Questions are recorded for your account, but could not be returned for this batch. Please contact your administrator.`,
                reason: 'questions_available_not_returned'
            });
        }

        const batchQuestionIds = questions.map(q => q._id);

        // Check for completed attempt specifically for the current question batch
        let existingCompletedAttempt = null;
        if (latestQuestionEntry.batchId) {
            existingCompletedAttempt = await TestAttempt.findOne({
                worker: workerId,
                batchId: latestQuestionEntry.batchId,
                status: 'completed'
            });
        } else {
            existingCompletedAttempt = await TestAttempt.findOne({
                worker: workerId,
                status: 'completed',
                questions: { $in: batchQuestionIds }
            });
        }

        if (existingCompletedAttempt) {
            return res.status(403).json({
                message: `You have already completed the test for these topics: "${allTopics.join(', ')}".`,
                reason: 'already_completed'
            });
        }

        let testAttempt = null;
        if (latestQuestionEntry.batchId) {
            testAttempt = await TestAttempt.findOne({
                worker: workerId,
                batchId: latestQuestionEntry.batchId,
                status: 'in-progress'
            });
        } else {
            testAttempt = await TestAttempt.findOne({
                worker: workerId,
                status: 'in-progress',
                questions: { $in: batchQuestionIds }
            });
        }

        // Check if an existing in-progress attempt for this batch has expired
        if (testAttempt) {
            const now = Date.now();
            const startTime = testAttempt.testStartTime ? new Date(testAttempt.testStartTime).getTime() : now;
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            const totalLimitSeconds = testAttempt.totalTestDuration || totalDuration || 600;

            if (elapsedSeconds >= totalLimitSeconds) {
                testAttempt.status = 'completed';
                await testAttempt.save();
                return res.status(403).json({
                    message: `Your test session for "${allTopics.join(', ')}" has expired.`,
                    reason: 'already_completed'
                });
            }
        }

        if (!testAttempt) {
            // Close any older in-progress attempts from previous batches so they do not linger
            try {
                const isAttemptMockedOrConnected = TestAttempt.updateMany !== mongoose.Model.updateMany || mongoose.connection.readyState === 1;
                if (isAttemptMockedOrConnected) {
                    await TestAttempt.updateMany(
                        { worker: workerId, status: 'in-progress' },
                        { status: 'missed' }
                    );
                }
            } catch (markErr) {
                log.warn('Could not close older in-progress attempts:', markErr.message);
            }

            const shuffledQuestionIds = questions.sort(() => 0.5 - Math.random()).map(q => q._id);

            testAttempt = await TestAttempt.create({
                worker: workerId,
                batchId: latestQuestionEntry.batchId || null,
                subdomain: worker.subdomain || effectiveSubdomain,
                topic: testTopicId,
                questions: shuffledQuestionIds,
                durationPerQuestion: defaultDurationPerQuestion,
                totalTestDuration: totalDuration,
                status: 'in-progress',
                currentQuestionIndex: 0,
                testStartTime: Date.now(),
                questionStartTime: Date.now()
            });

            log.info(`New test attempt created with ID: ${testAttempt._id}`);

        } else {
            const attemptQuestionIdStrings = (testAttempt.questions || []).map(id => id.toString());
            questions = await Question.find({ '_id': { $in: testAttempt.questions } });
            questions.sort((a, b) => attemptQuestionIdStrings.indexOf(a._id.toString()) - attemptQuestionIdStrings.indexOf(b._id.toString()));

            log.info(`Resuming test attempt with ID: ${testAttempt._id}`);
        }

        const now = Date.now();
        const startTime = testAttempt.testStartTime ? new Date(testAttempt.testStartTime).getTime() : now;
        const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
        const effectiveTotalDuration = Math.max(1, (testAttempt.totalTestDuration || totalDuration) - elapsedSeconds);

        const questionsToSend = questions.map(q => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            correctOption: q.correctAnswer,
            timeDuration: q.timeDuration,
            questionFormat: q.questionFormat, // Add question format to response
            upscFormat: q.upscFormat, // Add UPSC format to response
            questionSet: q.questionSet // Add question set to response
        }));

        res.json({
            batchId: latestQuestionEntry.batchId || null,
            testAttemptId: testAttempt._id,
            questions: questionsToSend,
            currentQuestionIndex: testAttempt.currentQuestionIndex,
            questionStartTime: testAttempt.questionStartTime,
            durationPerQuestion: testAttempt.durationPerQuestion,
            totalTestDuration: effectiveTotalDuration,
            testStartTime: testAttempt.testStartTime,
            status: testAttempt.status,
            topic: isMixed ? allTopics.join(', ') : latestQuestionEntry.topic,
            latestTopic: isMixed ? allTopics.join(', ') : latestQuestionEntry.topic,
            isMixed: isMixed,
            allTopics: allTopics,
            questionSet: questionSet,
            showFeedback: latestQuestionEntry ? (latestQuestionEntry.showFeedback !== false) : true,
            reason: 'questions_available'
        });

    } catch (error) {
        log.error("Error in getQuestionsForTest:", error);
        res.status(500).json({ message: 'Server error while fetching test questions.' });
    }
};

// @desc    Get all questions with filters
// @route   GET /api/test/questions
// @access  Private/Admin
const getAllQuestions = async (req, res) => {
    const { topic, date, workerId } = req.query;
    try {
        let query = {};
        // Server-side tenant scoping: authenticated user.subdomain takes precedence over query params
        const effectiveSubdomain = (req.user && req.user.subdomain && req.user.subdomain !== 'main')
            ? req.user.subdomain
            : (req.query.subdomain || req.user?.subdomain);

        if (effectiveSubdomain && effectiveSubdomain !== 'main') {
            const tenantWorkersQuery = Worker.find({ subdomain: effectiveSubdomain });
            const tenantWorkers = typeof tenantWorkersQuery?.select === 'function'
                ? await tenantWorkersQuery.select('_id')
                : await tenantWorkersQuery;
            const tenantWorkerIds = tenantWorkers.map(w => w._id);

            if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
                const targetId = new mongoose.Types.ObjectId(workerId);
                const isMember = tenantWorkerIds.some(id => id.equals(targetId));
                if (!isMember) {
                    return res.status(200).json({ questions: [], stats: { totalQuestions: 0, uniqueWorkers: 0 } });
                }
                query.worker = targetId;
            } else {
                query.worker = { $in: tenantWorkerIds };
            }
        } else if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            // Fail closed: tenant admin must never view another tenant's questions
            query.worker = { $in: [] };
        } else if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
            query.worker = new mongoose.Types.ObjectId(workerId);
        }

        if (topic) {
            query.topic = { $regex: topic, $options: 'i' };
        }
        if (date) {
            const startOfDay = new Date(date);
            if (!isNaN(startOfDay.getTime())) {
                startOfDay.setUTCHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setUTCHours(23, 59, 59, 999);
                query.createdAt = {
                    $gte: startOfDay,
                    $lte: endOfDay
                };
            }
        }

        const questions = await Question.find(query)
            .populate({
                path: 'worker',
                select: 'name email department',
                populate: {
                    path: 'department',
                    select: 'name'
                }
            })
            .sort({ createdAt: -1 })
            .lean();


        // Transform questions to include department name
        const transformedQuestions = questions.map(question => {
            if (question.worker) {
                // Ensure we're properly handling the department data
                const departmentName = question.worker.department &&
                    typeof question.worker.department === 'object' &&
                    question.worker.department.name ?
                    question.worker.department.name :
                    (typeof question.worker.department === 'string' ?
                        question.worker.department :
                        'N/A');

                return {
                    ...question,
                    worker: {
                        ...question.worker,
                        departmentName: departmentName
                    }
                };
            }
            return question;
        });

        const stats = {
            totalQuestions: transformedQuestions.length,
            uniqueWorkers: [...new Set(transformedQuestions.map(q => q.worker?._id?.toString()))].length
        };

        res.status(200).json({
            questions: transformedQuestions,
            stats
        });
    } catch (error) {
        log.error("Error in getAllQuestions:", error);
        res.status(500).json({ message: 'Server error fetching questions' });
    }
};

// @desc    Create Quick Test for unregistered users
// @route   POST /api/test/quick-test
// @access  Public
const createQuickTest = async (req, res) => {
    const { name, password, topic, numQuestions = 10, difficulty = 'Medium', timeDuration = 15, totalTestDuration = 600, subdomain } = req.body;

    try {
        // Validate input
        if (!name || !password || !topic) {
            return res.status(400).json({ message: 'Name, password, and topic are required' });
        }

        // Throttle question count to max 10 questions per quick test request
        const sanitizedNumQuestions = Math.min(Math.max(parseInt(numQuestions) || 10, 1), 10);
        const subdomainToUse = subdomain || req.subdomain || req.headers['x-subdomain'] || 'default';

        // Generate questions for the topic
        const questions = await generateWithRetry(topic, sanitizedNumQuestions, difficulty, subdomainToUse);

        // Save questions to database
        const questionsToSave = questions.map(q => {
            // Clean options by removing internal letters like (a), (b), (c), (d)
            const cleanedOptions = q.options.map(option => {
                // Remove patterns like "(a) ", "(b) ", etc. from the beginning of options
                return option.replace(/^\([a-d]\)\s*/i, '').trim();
            });

            // Also clean the correctAnswer
            const cleanedCorrectAnswer = q.correctAnswer.replace(/^\([a-d]\)\s*/i, '').trim();

            // Programmatically shuffle options to guarantee randomness
            const shuffledOptions = [...cleanedOptions];
            for (let i = shuffledOptions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
            }

            const correctOptionIndex = shuffledOptions.findIndex(
                opt => String(opt).trim().toLowerCase() === String(cleanedCorrectAnswer).trim().toLowerCase()
            );

            return {
                topic: topic,
                questionText: q.questionText || q.question,
                options: shuffledOptions,
                correctAnswer: correctOptionIndex !== -1 ? correctOptionIndex : Math.floor(Math.random() * shuffledOptions.length),
                difficulty: q.difficulty || difficulty,
                timeDuration: parseInt(timeDuration),
                totalTestDuration: parseInt(totalTestDuration),
                questionFormat: 'upsc', // Default to UPSC for quick tests
                upscFormat: q.format || 'E' // Store the specific UPSC format
            };
        });

        const savedQuestions = await Question.insertMany(questionsToSave);
        const questionIds = savedQuestions.map(q => q._id);

        // Create quick test session
        const quickTest = await QuickTest.create({
            name,
            password,
            topic,
            questions: questionIds,
            durationPerQuestion: parseInt(timeDuration),
            totalTestDuration: parseInt(totalTestDuration),
            status: 'in-progress',
            currentQuestionIndex: 0,
            testStartTime: Date.now(),
            questionStartTime: Date.now()
        });

        // Return questions for the test
        const questionsToSend = savedQuestions.map(q => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            correctOption: q.correctAnswer,
            timeDuration: q.timeDuration,
            questionFormat: q.questionFormat, // Add question format to response
            upscFormat: q.upscFormat // Add UPSC format to response
        }));

        res.status(201).json({
            quickTestId: quickTest._id,
            questions: questionsToSend,
            currentQuestionIndex: quickTest.currentQuestionIndex,
            questionStartTime: quickTest.questionStartTime,
            durationPerQuestion: quickTest.durationPerQuestion,
            totalTestDuration: quickTest.totalTestDuration,
            testStartTime: quickTest.testStartTime,
            status: quickTest.status,
            topic: quickTest.topic
        });

    } catch (error) {
        log.error('Error in createQuickTest:', error);
        res.status(500).json({ message: error.message || 'Server error creating quick test' });
    }
};

// Add the missing generateWithRetry function
const generateWithRetry = async (topic, numQuestions, difficulty = 'Medium', subdomain = '') => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // For quick tests, we'll use MCQ format by default
            const result = await generateMCQQuestions([topic], numQuestions, difficulty, subdomain);
            return result[topic] || [];
        } catch (error) {
            console.error(`[QuickTest] Generation attempt ${attempt} failed:`, error.message);

            // Do NOT retry if it's a usage limit error — retrying won't help and wastes quota
            const isLimitError = error.message && (
                error.message.includes('Daily AI') ||
                error.message.includes('Monthly AI') ||
                error.message.includes('usage limit reached') ||
                error.message.includes('AI features are disabled')
            );
            if (isLimitError) {
                throw error; // Propagate limit errors immediately without retrying
            }

            if (attempt === MAX_RETRIES) {
                throw new Error(`Failed to generate questions after ${MAX_RETRIES} attempts: ${error.message}`);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
    }
};


module.exports = {
    generateAndStoreQuestions,
    getQuestionsForTest,
    getAllQuestions,
    createQuickTest,
    validateQuestionGeneration
};