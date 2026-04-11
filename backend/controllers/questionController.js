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
const { processQuestionGeneration } = require('../utils/questionProcessor');
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
const validateQuestionGeneration = (req, res, next) => {
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
        // For common mode, either topic or commonTopics must be provided
        const topicsToCheck = commonTopics || (topic ? [topic] : []);
        if (topicsToCheck.length === 0 || (typeof topic === 'string' && !topic.trim())) {
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
        jobManager.createJob(jobId);

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
        
        processorFunction(req.body, jobId).catch(err => {
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
        // Debug logging
        console.log('Request user:', req.user);
        console.log('Requested workerId:', workerId);
        
        // Authorization check: Workers can only access their own questions
        if (req.user.role === 'worker') {
            console.log('User is worker, checking ID match...');
            console.log('req.user._id:', req.user._id);
            console.log('req.user._id.toString():', req.user._id.toString());
            console.log('workerId:', workerId);
            console.log('IDs match:', req.user._id.toString() === workerId);
            
            // Use a more robust comparison that handles different ID formats
            const userIdString = req.user._id.toString();
            const requestedIdString = workerId.toString();
            
            if (userIdString !== requestedIdString) {
                return res.status(403).json({ 
                    message: 'Access denied. You can only access your own test questions.' 
                });
            }
        }
        
        // Find the worker
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({ message: 'Worker not found.' });
        }

        const latestQuestionEntry = await Question.findOne({ worker: workerId })
            .sort({ createdAt: -1 })
            .select('topic timeDuration totalTestDuration createdAt isMixed allTopics questionSet')
            .lean();

        if (!latestQuestionEntry) {
            return res.status(404).json({ message: 'No questions found for this employee yet. Please contact your admin.' });
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

        const existingCompletedAttempt = await TestAttempt.findOne({
            worker: workerId,
            topic: testTopicId,
            status: 'completed'
        });

        if (existingCompletedAttempt) {
            return res.status(403).json({ 
                message: `You have already completed the test for these topics: "${allTopics.join(', ')}".` 
            });
        }
        
        let testAttempt = await TestAttempt.findOne({
            worker: workerId,
            topic: testTopicId,
            status: 'in-progress'
        });

        let questions;
        if (!testAttempt) {
            // Get all questions from the same generation batch (same creation time)
            // For mixed topics: get all questions created around the same time (within 1 minute)
            // For single topic: get questions with the specific topic
            // For three-set mode: get questions from the same set
            if (questionSet) {
                // For three-set mode, get questions from the same set
                questions = await Question.find({ 
                    worker: workerId,
                    questionSet: questionSet
                });
                log.info(`Three-set test: Found ${questions.length} questions for worker ${workerId} in set ${questionSet}`);
            } else if (isMixed) {
                // For mixed topics, get all questions created around the same time (within 1 minute)
                const timeThreshold = new Date(latestCreationTime.getTime() - 60000); // 1 minute before
                questions = await Question.find({ 
                    worker: workerId, 
                    createdAt: { 
                        $gte: timeThreshold,
                        $lte: new Date(latestCreationTime.getTime() + 60000) // 1 minute after
                    }
                });
                log.info(`Mixed topic test: Found ${questions.length} questions for worker ${workerId} in batch created around ${latestCreationTime}`);
            } else {
                // For single topic, get questions with the specific topic
                questions = await Question.find({ worker: workerId, topic: latestQuestionEntry.topic });
                log.info(`Single topic test: Found ${questions.length} questions for worker ${workerId} with topic: ${latestQuestionEntry.topic}`);
            }

            if (questions.length === 0) {
                return res.status(404).json({ 
                    message: `No questions found for the latest topics for this employee.` 
                });
            }

            const shuffledQuestionIds = questions.sort(() => 0.5 - Math.random()).map(q => q._id);

            testAttempt = await TestAttempt.create({
                worker: workerId,
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
            questions = await Question.find({ '_id': { $in: testAttempt.questions } });
            questions.sort((a, b) => testAttempt.questions.indexOf(a._id) - testAttempt.questions.indexOf(b._id));

            log.info(`Resuming test attempt with ID: ${testAttempt._id}`);
        }

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
            testAttemptId: testAttempt._id,
            questions: questionsToSend,
            currentQuestionIndex: testAttempt.currentQuestionIndex,
            questionStartTime: testAttempt.questionStartTime,
            durationPerQuestion: testAttempt.durationPerQuestion,
            totalTestDuration: testAttempt.totalTestDuration,
            testStartTime: testAttempt.testStartTime,
            status: testAttempt.status,
            latestTopic: isMixed ? allTopics.join(', ') : latestQuestionEntry.topic,
            isMixed: isMixed,
            allTopics: allTopics,
            questionSet: questionSet
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
        if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
            query.worker = new mongoose.Types.ObjectId(workerId);
        }
        if (topic) {
            query.topic = { $regex: topic, $options: 'i' };
        }
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
            query.createdAt = {
                $gte: startOfDay,
                $lte: endOfDay
            };
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
    const { name, password, topic, numQuestions = 10, difficulty = 'Medium', timeDuration = 15, totalTestDuration = 600 } = req.body;
    
    try {
        // Validate input
        if (!name || !password || !topic) {
            return res.status(400).json({ message: 'Name, password, and topic are required' });
        }

        // Generate questions for the topic
        const questions = await generateWithRetry(topic, parseInt(numQuestions), difficulty);
        
        // Save questions to database
        const questionsToSave = questions.map(q => {
            // Clean options by removing internal letters like (a), (b), (c), (d)
            const cleanedOptions = q.options.map(option => {
                // Remove patterns like "(a) ", "(b) ", etc. from the beginning of options
                return option.replace(/^\([a-d]\)\s*/i, '').trim();
            });
            
            // Also clean the correctAnswer
            const cleanedCorrectAnswer = q.correctAnswer.replace(/^\([a-d]\)\s*/i, '').trim();
            
            const correctOptionIndex = cleanedOptions.findIndex(
                opt => String(opt).trim().toLowerCase() === String(cleanedCorrectAnswer).trim().toLowerCase()
            );
            
            return {
                topic: topic,
                questionText: q.question,
                options: cleanedOptions,
                correctAnswer: correctOptionIndex !== -1 ? correctOptionIndex : Math.floor(Math.random() * cleanedOptions.length),
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
        res.status(500).json({ message: 'Server error creating quick test' });
    }
};

// Add the missing generateWithRetry function
const generateWithRetry = async (topic, numQuestions, difficulty = 'Medium') => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // For quick tests, we'll use MCQ format by default
            const result = await generateMCQQuestions([topic], numQuestions, difficulty);
            return result[topic] || [];
        } catch (error) {
            console.error(`[QuickTest] Generation attempt ${attempt} failed:`, error.message);
            
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