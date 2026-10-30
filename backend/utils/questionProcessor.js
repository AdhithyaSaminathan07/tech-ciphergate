// utils/questionProcessor.js
const mongoose = require('mongoose');
const Question = require('../models/Question');
const Worker = require('../models/Worker');
const LearningTopic = require('../models/LearningTopic');
const DailyTopic = require('../models/DailyTopic');
const openai = require('./openai');
const { validateAndFilterQuestions } = require('./topicValidator');
const jobManager = require('./jobManager');
const {
    CONCURRENT_WORKERS,
    CONCURRENT_TOPICS_PER_WORKER,
    CACHE_TTL,
    ENABLE_TOPIC_CACHING
} = require('../config/performance');

const log = {
    info: (message, data = {}) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data),
    error: (message, error = {}) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error),
    warn: (message, data = {}) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data)
};

/**
 * Safely extracts topic questions from result dictionary with case-insensitivity and fallback
 */
function extractQuestionsFromResult(resultObj, targetTopic) {
    if (openai && typeof openai.extractQuestionsForTopic === 'function') {
        const extracted = openai.extractQuestionsForTopic(resultObj, targetTopic);
        if (Array.isArray(extracted)) return extracted;
    }
    if (!resultObj || typeof resultObj !== 'object') return [];
    if (Array.isArray(resultObj[targetTopic])) return resultObj[targetTopic];
    const targetNorm = String(targetTopic || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, val] of Object.entries(resultObj)) {
        if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm && Array.isArray(val)) {
            return val;
        }
    }
    if (Array.isArray(resultObj.questions)) return resultObj.questions;
    const arrayProps = Object.values(resultObj).filter(Array.isArray);
    if (arrayProps.length === 1) return arrayProps[0];
    return [];
}

async function runWithConcurrency(tasks, concurrency) {
    // Use a more efficient approach for managing concurrency
    const results = [];
    
    // Process tasks in batches according to concurrency limit
    for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((task, index) => 
            task().then(result => ({ index: i + index, result }))
        ));
        
        // Place results in correct positions
        for (const { index, result } of batchResults) {
            results[index] = result;
        }
    }
    
    return results;
}

// SUPER OPTIMIZATION: Add caching for common topics
const topicCache = new Map();

async function runWithOptionalTransaction(session, operation) {
    try {
        return await session.withTransaction(async () => {
            return await operation(session);
        });
    } catch (err) {
        if (err.message && (
            err.message.includes('replica set member') || 
            err.message.includes('Transactions are not supported') ||
            err.message.includes('Transaction numbers are only allowed')
        )) {
            log.warn('MongoDB transactions not supported on this instance; executing operation without session.');
            return await operation(null);
        }
        throw err;
    }
}

const processQuestionGeneration = async (jobData, jobId) => {
    const {
        workerIds,
        numQuestions,
        difficulty,
        timeDuration,
        totalTestDuration,
        topicMode,
        topic: commonTopic,
        commonTopics,
        individualTopics,
        startDate,
        endDate,
        questionFormat = 'mcq', // Add question format with default value
        answerFeedback
    } = jobData;

    log.info('Starting robust, concurrent question generation job:', { numWorkers: workerIds.length, jobId, questionFormat });

    const workers = await Worker.find({ _id: { $in: workerIds } });
    const workerMap = new Map(workers.map(w => [w._id.toString(), w]));
    
    // Clean up expired cache entries
    if (ENABLE_TOPIC_CACHING) {
        const now = Date.now();
        for (const [key, value] of topicCache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
                topicCache.delete(key);
            }
        }
    }

    let workersProcessed = 0;
    let totalQuestionsGenerated = 0;

    const tasks = workerIds.map(workerId => async () => {
        const session = await mongoose.startSession();
        let taskResult;

        try {
            const worker = workerMap.get(String(workerId));
            if (!worker) {
                throw new Error('Worker not found in map');
            }

            // Strict tenant validation: Target worker must belong to requesting admin's organization
            const adminTenant = jobData.adminSubdomain || jobData.subdomain;
            if (adminTenant && adminTenant !== 'main' && worker.subdomain && worker.subdomain !== adminTenant) {
                log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                    batchId: jobId,
                    workerId: String(workerId),
                    reasonCode: 'TENANT_MISMATCH',
                    queriedCount: 0
                });
                taskResult = { 
                    workerId, 
                    workerName: worker.name, 
                    success: false, 
                    reason: 'Worker belongs to a different organization.', 
                    reasonCode: 'TENANT_MISMATCH' 
                };
            }

            if (!taskResult) {
                // Effective tenant is derived strictly from the authorized target worker
                const effectiveSubdomain = worker.subdomain || (adminTenant && adminTenant !== 'main' ? adminTenant : 'main');

                let topicsToUse = [];
                let rawTopics = [];

                if (topicMode === 'common') {
                    // For common mode, use commonTopics if available, otherwise fallback to topic
                    const commonTopicsToUse = commonTopics || (commonTopic ? [commonTopic] : []);
                    topicsToUse = commonTopicsToUse.length > 0 
                        ? commonTopicsToUse.flatMap(t => typeof t === 'string' ? t.split(',').map(t => t.trim()).filter(Boolean) : [])
                        : [];
                    rawTopics = commonTopicsToUse;
                } else {
                    const workerIdStr = String(workerId);
                    rawTopics = (individualTopics && (individualTopics[workerId] || individualTopics[workerIdStr])) || [];
                    
                    if (rawTopics.length === 0) {
                        try {
                            const query = { 
                                workerId: worker._id,
                                ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                            };
                            if (startDate && endDate) {
                                query.date = { $gte: startDate, $lte: endDate };
                            }
                            const dailyTopics = await DailyTopic.find(query).sort({ date: -1 }).limit(10).lean();
                            if (dailyTopics && dailyTopics.length > 0) {
                                rawTopics = dailyTopics.map(t => t.topic);
                                log.info('DIAGNOSTIC_DAILY_TOPIC_LOOKUP', {
                                    batchId: jobId,
                                    workerId: workerIdStr,
                                    queriedCount: dailyTopics.length,
                                    reasonCode: 'TOPICS_FOUND_IN_PERIOD'
                                });
                            } else if (startDate && endDate && (jobData.allowHistoricalFallback === true || jobData.historicalFallback === true)) {
                                // Explicit historical fallback ONLY if admin chose it
                                const fallbackQuery = { 
                                    workerId: worker._id,
                                    ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                                };
                                const recentTopics = await DailyTopic.find(fallbackQuery).sort({ date: -1 }).limit(10).lean();
                                if (recentTopics && recentTopics.length > 0) {
                                    rawTopics = recentTopics.map(t => t.topic);
                                    log.info('DIAGNOSTIC_DAILY_TOPIC_LOOKUP', {
                                        batchId: jobId,
                                        workerId: workerIdStr,
                                        queriedCount: recentTopics.length,
                                        reasonCode: 'EXPLICIT_HISTORICAL_FALLBACK'
                                    });
                                }
                            }
                        } catch (topicErr) {
                            log.warn('Could not query DailyTopic:', topicErr.message);
                        }
                    }

                    if (rawTopics.length === 0) {
                        const topicQuery = DailyTopic.findOne({ 
                            workerId: worker._id,
                            ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                        });
                        const hasAnyTopics = typeof topicQuery?.lean === 'function' ? await topicQuery.lean() : await topicQuery;
                        const reasonCode = (startDate && endDate && hasAnyTopics) ? 'TOPICS_NOT_FOUND_FOR_PERIOD' : 'NO_TOPICS_RECORDED';
                        const failureReason = (startDate && endDate && hasAnyTopics) ? 'Topics not found for the selected period' : 'No topics recorded';
                        log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                            batchId: jobId,
                            workerId: workerIdStr,
                            reasonCode,
                            queriedCount: 0
                        });
                        taskResult = { workerId, workerName: worker.name, success: false, reason: failureReason, reasonCode };
                    } else {
                        for (const rawTopic of rawTopics) {
                            if (typeof rawTopic === 'string' && rawTopic.includes(',')) {
                                const splitTopics = rawTopic.split(',').map(t => t.trim()).filter(Boolean);
                                topicsToUse.push(...splitTopics);
                            } else if (rawTopic && typeof rawTopic === 'string') {
                                topicsToUse.push(rawTopic.trim());
                            }
                        }
                        topicsToUse = [...new Set(topicsToUse)].filter(Boolean);
                    }
                }

                if (!taskResult && topicsToUse.length === 0) {
                    log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                        batchId: jobId,
                        workerId: String(workerId),
                        reasonCode: 'NO_TOPICS_FOUND',
                        queriedCount: 0
                    });
                    taskResult = { workerId, workerName: worker.name, success: false, reason: 'No topics found', reasonCode: 'NO_TOPICS_FOUND' };
                }

                if (!taskResult && topicsToUse.length > 0) {
                const combinedTopicString = topicsToUse.join(', ');
                const targetQuestions = parseInt(numQuestions);
                const totalTopics = topicsToUse.length;
                const baseQuestionsPerTopic = Math.floor(targetQuestions / totalTopics);
                const remainingQuestions = targetQuestions % totalTopics;
                
                // Process topics in parallel for better performance
                const topicTasks = [];
                for (let i = 0; i < totalTopics; i++) {
                    const currentTopic = topicsToUse[i];
                    const questionsForThisTopic = baseQuestionsPerTopic + (i < remainingQuestions ? 1 : 0);
                    
                    if (questionsForThisTopic > 0) {
                        topicTasks.push(async () => {
                            try {
                                const subdomain = jobData.subdomain || jobData.adminSubdomain || effectiveSubdomain;
                                // SUPER OPTIMIZATION: Check cache first for common topics and deduplicate parallel requests
                                if (ENABLE_TOPIC_CACHING && topicMode === 'common') {
                                    const cacheKey = `${currentTopic}-${difficulty}-${questionsForThisTopic}-${questionFormat}`;
                                    if (topicCache.has(cacheKey)) {
                                        const cached = topicCache.get(cacheKey);
                                        if (cached && typeof cached.then === 'function') {
                                            log.info(`Awaiting in-flight question generation for topic: "${currentTopic}"`);
                                            const questions = await cached;
                                            return questions.slice(0, questionsForThisTopic);
                                        } else if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                                            log.info(`Using cached questions for topic: "${currentTopic}"`);
                                            return cached.questions.slice(0, questionsForThisTopic);
                                        } else {
                                            topicCache.delete(cacheKey);
                                        }
                                    }

                                    // Store pending promise in cache to avoid race conditions with parallel workers
                                    const fetchPromise = (async () => {
                                        let resQuestions = [];
                                        if (questionFormat === 'upsc') {
                                            const result = await openai.generateUPSCQuestions([currentTopic], questionsForThisTopic, difficulty, subdomain);
                                            resQuestions = extractQuestionsFromResult(result, currentTopic);
                                        } else {
                                            const result = await openai.generateMCQQuestions([currentTopic], questionsForThisTopic, difficulty, subdomain);
                                            resQuestions = extractQuestionsFromResult(result, currentTopic);
                                        }
                                        return resQuestions;
                                    })();

                                    topicCache.set(cacheKey, fetchPromise);

                                    try {
                                        const generatedQuestions = await fetchPromise;
                                        topicCache.set(cacheKey, {
                                            questions: generatedQuestions,
                                            timestamp: Date.now()
                                        });
                                        return generatedQuestions.slice(0, questionsForThisTopic);
                                    } catch (fetchErr) {
                                        topicCache.delete(cacheKey);
                                        throw fetchErr;
                                    }
                                }
                                
                                // Uncached / Individual topic generation
                                let generatedQuestions = [];
                                if (questionFormat === 'upsc') {
                                    const result = await openai.generateUPSCQuestions([currentTopic], questionsForThisTopic, difficulty, subdomain);
                                    generatedQuestions = extractQuestionsFromResult(result, currentTopic);
                                } else {
                                    const result = await openai.generateMCQQuestions([currentTopic], questionsForThisTopic, difficulty, subdomain);
                                    generatedQuestions = extractQuestionsFromResult(result, currentTopic);
                                }
                                
                                return generatedQuestions.slice(0, questionsForThisTopic);
                            } catch (error) {
                                log.error(`Failed to generate questions for topic "${currentTopic}":`, error.message);
                                return { error: error.message };
                            }
                        });
                    }
                }


                // Execute topic generation in parallel
                const topicResults = await runWithConcurrency(topicTasks, CONCURRENT_TOPICS_PER_WORKER);
                const taskErrors = topicResults.filter(r => r && !Array.isArray(r) && r.error).map(r => r.error);
                let allQuestionsForWorker = topicResults.filter(Array.isArray).flat();

                if (allQuestionsForWorker.length === 0) {
                    let failureReason = 'AI failed to generate questions';
                    let reasonCode = 'AI_ZERO_QUESTIONS';

                    if (taskErrors.length > 0) {
                        const rawErr = taskErrors[0];
                        // Sanitize to avoid leaking tokens, keys, passwords or prompts
                        const sanitizedErr = String(rawErr).replace(/bearer\s+[a-z0-9_-]+/gi, 'Bearer ***').slice(0, 150);
                        if (/rate/i.test(rawErr)) {
                            reasonCode = 'AI_RATE_LIMITED';
                            failureReason = sanitizedErr;
                        } else if (/quota|limit|exceed/i.test(rawErr)) {
                            reasonCode = 'AI_QUOTA_EXCEEDED';
                            failureReason = sanitizedErr;
                        } else if (/structure|json|parse/i.test(rawErr)) {
                            reasonCode = 'AI_MALFORMED_RESPONSE';
                            failureReason = sanitizedErr;
                        } else {
                            reasonCode = 'AI_GENERATION_FAILED';
                            failureReason = sanitizedErr;
                        }
                    }

                    log.warn('DIAGNOSTIC_AI_GENERATION', {
                        batchId: jobId,
                        workerId: String(workerId),
                        rawQuestionsCount: 0,
                        reasonCode
                    });
                    taskResult = { workerId, workerName: worker.name, success: false, reason: failureReason, reasonCode };
                } else {
                    // Deterministically validate questions against topic concepts and structural requirements
                    const { validQuestions, rejectedQuestions } = validateAndFilterQuestions(allQuestionsForWorker, combinedTopicString);
                    log.info('DIAGNOSTIC_QUESTION_VALIDATION', {
                        batchId: jobId,
                        workerId: String(workerId),
                        rawQuestionsCount: allQuestionsForWorker.length,
                        validQuestionsCount: validQuestions.length,
                        rejectedQuestionsCount: rejectedQuestions.length,
                        reasonCode: validQuestions.length > 0 ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED'
                    });

                    if (rejectedQuestions.length > 0) {
                        log.warn(`Filtered ${rejectedQuestions.length} invalid/off-topic questions for ${worker.name}:`, rejectedQuestions.map(r => r.reason));
                    }

                    if (validQuestions.length === 0) {
                        taskResult = { workerId, workerName: worker.name, success: false, reason: 'Generated questions did not match studied topic concepts', reasonCode: 'TOPIC_CONCEPTS_MISMATCH' };
                    } else {
                        allQuestionsForWorker = validQuestions.slice(0, targetQuestions);

                const questionsToSave = allQuestionsForWorker.map(q => {
                    // Clean options by removing internal letters like (a), (b), (c), (d)
                    const cleanedOptions = q.options.map(option => {
                        // Remove patterns like "(a) ", "(b) ", etc. from the beginning of options
                        return option.replace(/^\([a-d]\)\s*/i, '').trim();
                    });
                    
                    // Also clean the correctAnswer safely whether string or number
                    const rawCorrectAnswer = typeof q.correctAnswer === 'number'
                        ? (cleanedOptions[q.correctAnswer] || String(q.correctAnswer))
                        : String(q.correctAnswer || '');
                    const cleanedCorrectAnswer = rawCorrectAnswer.replace(/^\([a-d]\)\s*/i, '').trim();
                    
                    // Programmatically shuffle options to guarantee randomness
                    const shuffledOptions = [...cleanedOptions];
                    for (let i = shuffledOptions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
                    }
                    
                    const correctOptionIndex = shuffledOptions.findIndex(
                        (opt) => String(opt).trim().toLowerCase() === String(cleanedCorrectAnswer).trim().toLowerCase()
                    );
                    
                    return {
                        _id: new mongoose.Types.ObjectId(),
                        batchId: jobId,
                        subdomain: effectiveSubdomain,
                        worker: worker._id,
                        topic: combinedTopicString,
                        questionText: q.questionText || q.question,
                        options: shuffledOptions,
                        correctAnswer: correctOptionIndex !== -1 ? correctOptionIndex : Math.floor(Math.random() * shuffledOptions.length),
                        difficulty: q.difficulty || difficulty,
                        timeDuration: parseInt(timeDuration),
                        totalTestDuration: parseInt(totalTestDuration),
                        questionFormat: questionFormat, // Store the question format
                        upscFormat: q.format || 'E', // Store the specific UPSC format (A, B, C, D, or E)
                        showFeedback: answerFeedback !== false
                    };
                }).filter(Boolean);

            // SUPER OPTIMIZATION: Use bulk insert for better database performance
            // Only wrap database persistence in transaction, keeping external AI calls outside
            if (questionsToSave.length > 0) {
                await runWithOptionalTransaction(session, async (activeSession) => {
                    try {
                        await Question.insertMany(questionsToSave, activeSession ? { 
                            session: activeSession,
                            ordered: false // Allow parallel insertion in transaction
                        } : { ordered: true });
                    } catch (insertErr) {
                        if (!activeSession) {
                            // On standalone MongoDB, transactions cannot rollback automatically.
                            // Clean up any partially inserted questions from this batch to prevent orphan records.
                            try {
                                const questionIds = questionsToSave.map(q => q._id).filter(Boolean);
                                if (questionIds.length > 0) {
                                    await Question.deleteMany({ _id: { $in: questionIds } });
                                }
                            } catch (cleanupErr) {
                                log.warn('Could not clean up partial writes on standalone MongoDB:', cleanupErr.message);
                            }
                        }
                        throw insertErr;
                    }
                });
            }

            if (questionsToSave.length === 0) {
                log.warn('DIAGNOSTIC_PERSISTENCE', {
                    batchId: jobId,
                    workerId: String(workerId),
                    persistedQuestionsCount: 0,
                    reasonCode: 'ZERO_QUESTIONS_PERSISTED'
                });
                taskResult = {
                    workerId,
                    workerName: worker.name,
                    success: false,
                    reason: `No valid questions could be generated or persisted for topics: "${combinedTopicString}".`,
                    reasonCode: 'ZERO_QUESTIONS_PERSISTED'
                };
            } else {
                log.info('DIAGNOSTIC_PERSISTENCE', {
                    batchId: jobId,
                    workerId: String(workerId),
                    persistedQuestionsCount: questionsToSave.length,
                    reasonCode: 'QUESTIONS_PERSISTED'
                });
                taskResult = { 
                    workerId, 
                    workerName: worker.name, 
                    success: true, 
                    questionsGenerated: questionsToSave.length,
                    targetQuestions: targetQuestions,
                    topics: combinedTopicString,
                    reasonCode: 'GENERATION_SUCCESS'
                };
                totalQuestionsGenerated += questionsToSave.length;
            }
                    }
                }
                }
            }
        } catch (error) {
            const workerName = workerMap.get(workerId)?.name || 'Unknown';
            log.error(`Transaction failed for worker ${workerName}:`, error.message);
            taskResult = { workerId, workerName, success: false, reason: error.message };
        } finally {
            await session.endSession();
        }
        
        workersProcessed++;
        // Include total questions generated in progress update
        jobManager.updateJobProgress(jobId, Math.round((workersProcessed / workerIds.length) * 100), {
            workersProcessed,
            totalWorkers: workerIds.length,
            totalQuestionsGenerated
        });
        return taskResult;
    });

    // Execute worker tasks with higher concurrency
    const results = await runWithConcurrency(tasks, CONCURRENT_WORKERS);

    const successfulWorkers = results.filter(r => r && r.success);
    const failedWorkers = results.filter(r => r && !r.success);

    const hasSuccesses = successfulWorkers.length > 0;
    const hasFailures = failedWorkers.length > 0;

    let finalState = 'completed';
    let primaryReason = null;

    if (!hasSuccesses || totalQuestionsGenerated === 0) {
        finalState = 'failed';
        primaryReason = failedWorkers.length > 0
            ? failedWorkers.map(f => `${f.workerName || 'Worker'}: ${f.reason || 'Failed to generate questions'}`).join('; ')
            : 'Zero questions were generated or persisted.';
    } else if (hasFailures) {
        finalState = 'partial_failure';
        primaryReason = `Generated questions for ${successfulWorkers.length} worker(s), but failed for: ${failedWorkers.map(f => f.workerName).join(', ')}`;
    }

    const returnValue = {
        success: hasSuccesses && totalQuestionsGenerated > 0,
        results: successfulWorkers,
        failedWorkers,
        totalQuestionsGenerated,
        state: finalState,
        reason: primaryReason
    };

    if (finalState === 'failed') {
        jobManager.failJob(jobId, primaryReason, returnValue);
    } else if (finalState === 'partial_failure') {
        jobManager.partialFailJob(jobId, primaryReason, returnValue);
    } else {
        jobManager.completeJob(jobId, returnValue);
    }

    return returnValue;
};

/**
 * Process generation of three separate question sets for common mode
 * @param {Object} jobData - Job data containing generation parameters
 * @param {string} jobId - Unique job identifier
 * @returns {Object} Processing results
 */
const processThreeSetQuestionGeneration = async (jobData, jobId) => {
    const {
        workerIds,
        numQuestions,
        difficulty,
        timeDuration,
        totalTestDuration,
        topicMode,
        topic: commonTopic,
        commonTopics,
        individualTopics,
        startDate,
        endDate,
        questionFormat = 'upsc', // Default to UPSC format for three sets
        answerFeedback,
        subdomain
    } = jobData;

    log.info('Starting three-set question generation job:', { numWorkers: workerIds.length, jobId, questionFormat });

    const workers = await Worker.find({ _id: { $in: workerIds } });
    const workerMap = new Map(workers.map(w => [w._id.toString(), w]));

    let workersProcessed = 0;
    let totalQuestionsGenerated = 0;

    // SUPER OPTIMIZATION: Pre-generate 3-sets ONCE for common mode instead of N times for N workers!
    let sharedThreeSets = null;
    if (topicMode === 'common') {
        const commonTopicsToUse = commonTopics || (commonTopic ? [commonTopic] : []);
        const topicsToUse = commonTopicsToUse.length > 0 
            ? commonTopicsToUse.flatMap(t => typeof t === 'string' ? t.split(',').map(t => t.trim()).filter(Boolean) : [])
            : [];
        if (topicsToUse.length > 0) {
            try {
                log.info('[Optimization] Generating 1 shared 3-set batch for common topics:', topicsToUse);
                sharedThreeSets = await openai.generateThreeUPSCSets(topicsToUse, parseInt(numQuestions), difficulty, 1, subdomain);
            } catch (err) {
                log.error('[Optimization] Shared 3-set pre-generation failed:', err.message);
                jobManager.failJob(jobId, err.message || 'Failed to pre-generate question sets.');
                throw err;
            }
        }
    }

    // For three-set generation, assign one set per worker
    // Worker 1 gets Set A, Worker 2 gets Set B, Worker 3 gets Set C, then repeat
    const tasks = workerIds.map((workerId, index) => async () => {
        const session = await mongoose.startSession();
        let taskResult;

        try {
            const worker = workerMap.get(String(workerId));
            if (!worker) {
                throw new Error('Worker not found in map');
            }

            // Strict tenant validation: Target worker must belong to requesting admin's organization
            const adminTenant = jobData.adminSubdomain;
            if (adminTenant && adminTenant !== 'main' && worker.subdomain && worker.subdomain !== adminTenant) {
                log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                    batchId: jobId,
                    workerId: String(workerId),
                    reasonCode: 'TENANT_MISMATCH',
                    queriedCount: 0
                });
                taskResult = { 
                    workerId, 
                    workerName: worker.name, 
                    success: false, 
                    reason: 'Worker belongs to a different organization.', 
                    reasonCode: 'TENANT_MISMATCH' 
                };
            }

            if (!taskResult) {
                // Effective tenant is derived strictly from the authorized target worker
                const effectiveSubdomain = worker.subdomain || (adminTenant && adminTenant !== 'main' ? adminTenant : 'main');

                let topicsToUse = [];
                let rawTopics = [];

                if (topicMode === 'common') {
                    const commonTopicsToUse = commonTopics || (commonTopic ? [commonTopic] : []);
                    topicsToUse = commonTopicsToUse.length > 0 
                        ? commonTopicsToUse.flatMap(t => typeof t === 'string' ? t.split(',').map(t => t.trim()).filter(Boolean) : [])
                        : [];
                    rawTopics = commonTopicsToUse;
                } else {
                    const workerIdStr = String(workerId);
                    rawTopics = (individualTopics && (individualTopics[workerId] || individualTopics[workerIdStr])) || [];
                    
                    if (rawTopics.length === 0) {
                        try {
                            const query = { 
                                workerId: worker._id,
                                ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                            };
                            if (startDate && endDate) {
                                query.date = { $gte: startDate, $lte: endDate };
                            }
                            const dailyTopics = await DailyTopic.find(query).sort({ date: -1 }).limit(10).lean();
                            if (dailyTopics && dailyTopics.length > 0) {
                                rawTopics = dailyTopics.map(t => t.topic);
                                log.info('DIAGNOSTIC_DAILY_TOPIC_LOOKUP', {
                                    batchId: jobId,
                                    workerId: workerIdStr,
                                    queriedCount: dailyTopics.length,
                                    reasonCode: 'TOPICS_FOUND_IN_PERIOD'
                                });
                            } else if (startDate && endDate && (jobData.allowHistoricalFallback === true || jobData.historicalFallback === true)) {
                                // Explicit historical fallback ONLY if admin chose it
                                const fallbackQuery = { 
                                    workerId: worker._id,
                                    ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                                };
                                const recentTopics = await DailyTopic.find(fallbackQuery).sort({ date: -1 }).limit(10).lean();
                                if (recentTopics && recentTopics.length > 0) {
                                    rawTopics = recentTopics.map(t => t.topic);
                                    log.info('DIAGNOSTIC_DAILY_TOPIC_LOOKUP', {
                                        batchId: jobId,
                                        workerId: workerIdStr,
                                        queriedCount: recentTopics.length,
                                        reasonCode: 'EXPLICIT_HISTORICAL_FALLBACK'
                                    });
                                }
                            }
                        } catch (topicErr) {
                            log.warn('Could not query DailyTopic:', topicErr.message);
                        }
                    }

                    if (rawTopics.length === 0) {
                        const topicQuery = DailyTopic.findOne({ 
                            workerId: worker._id,
                            ...(effectiveSubdomain && effectiveSubdomain !== 'main' ? { subdomain: effectiveSubdomain } : {})
                        });
                        const hasAnyTopics = typeof topicQuery?.lean === 'function' ? await topicQuery.lean() : await topicQuery;
                        const reasonCode = (startDate && endDate && hasAnyTopics) ? 'TOPICS_NOT_FOUND_FOR_PERIOD' : 'NO_TOPICS_RECORDED';
                        const failureReason = (startDate && endDate && hasAnyTopics) ? 'Topics not found for the selected period' : 'No topics recorded';
                        log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                            batchId: jobId,
                            workerId: workerIdStr,
                            reasonCode,
                            queriedCount: 0
                        });
                        taskResult = { workerId, workerName: worker.name, success: false, reason: failureReason, reasonCode };
                    } else {
                        for (const rawTopic of rawTopics) {
                            if (typeof rawTopic === 'string' && rawTopic.includes(',')) {
                                const splitTopics = rawTopic.split(',').map(t => t.trim()).filter(Boolean);
                                topicsToUse.push(...splitTopics);
                            } else if (rawTopic && typeof rawTopic === 'string') {
                                topicsToUse.push(rawTopic.trim());
                            }
                        }
                        topicsToUse = [...new Set(topicsToUse)].filter(Boolean);
                    }
                }

                if (!taskResult && topicsToUse.length === 0) {
                    log.warn('DIAGNOSTIC_WORKER_SKIPPED', {
                        batchId: jobId,
                        workerId: String(workerId),
                        reasonCode: 'NO_TOPICS_FOUND',
                        queriedCount: 0
                    });
                    taskResult = { workerId, workerName: worker.name, success: false, reason: 'No topics found', reasonCode: 'NO_TOPICS_FOUND' };
                }

                if (!taskResult && topicsToUse.length > 0) {
                const combinedTopicString = topicsToUse.join(', ');
                const targetQuestions = parseInt(numQuestions);
                
                // Determine which set this worker should get (A, B, or C)
                const setNames = ['setA', 'setB', 'setC'];
                const setForWorker = setNames[index % 3];
                
                // Use shared three sets for common mode, or generate for individual mode
                let threeSets = sharedThreeSets;
                if (!threeSets) {
                    try {
                        threeSets = await openai.generateThreeUPSCSets(topicsToUse, targetQuestions, difficulty, 1, subdomain);
                    } catch (error) {
                        log.error(`Failed to generate three question sets:`, error.message);
                        taskResult = { workerId, workerName: worker.name, success: false, reason: error.message || 'AI failed to generate question sets', reasonCode: 'AI_ZERO_QUESTIONS' };
                    }
                }
                
                if (!taskResult) {
                    // Select the appropriate set for this worker
                    const selectedSet = (threeSets && threeSets[setForWorker]) || [];
                    
                    if (selectedSet.length === 0) {
                        taskResult = { workerId, workerName: worker.name, success: false, reason: 'No questions generated for set', reasonCode: 'AI_ZERO_QUESTIONS' };
                    } else {
                        // Deterministically validate questions for relevance and structure
                        const { validQuestions } = validateAndFilterQuestions(selectedSet, combinedTopicString);
                        const questionsToProcess = validQuestions.length > 0 ? validQuestions : selectedSet;

                const questionsToSave = questionsToProcess.map(q => {
                    // Clean options by removing internal letters like (a), (b), (c), (d)
                    const cleanedOptions = q.options.map(option => {
                        // Remove patterns like "(a) ", "(b) ", etc. from the beginning of options
                        return option.replace(/^\([a-d]\)\s*/i, '').trim();
                    });
                    
                    // Also clean the correctAnswer safely whether string or number
                    const rawCorrectAnswer = typeof q.correctAnswer === 'number'
                        ? (cleanedOptions[q.correctAnswer] || String(q.correctAnswer))
                        : String(q.correctAnswer || '');
                    const cleanedCorrectAnswer = rawCorrectAnswer.replace(/^\([a-d]\)\s*/i, '').trim();
                    
                    // Programmatically shuffle options to guarantee randomness
                    const shuffledOptions = [...cleanedOptions];
                    for (let i = shuffledOptions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
                    }
                    
                    const correctOptionIndex = shuffledOptions.findIndex(
                        (opt) => String(opt).trim().toLowerCase() === String(cleanedCorrectAnswer).trim().toLowerCase()
                    );
                    
                    return {
                        _id: new mongoose.Types.ObjectId(),
                        batchId: jobId,
                        subdomain: effectiveSubdomain,
                        worker: worker._id,
                        topic: combinedTopicString,
                        questionText: q.questionText || q.question,
                        options: shuffledOptions,
                        correctAnswer: correctOptionIndex !== -1 ? correctOptionIndex : Math.floor(Math.random() * shuffledOptions.length),
                        difficulty: q.difficulty || difficulty,
                        timeDuration: parseInt(timeDuration),
                        totalTestDuration: parseInt(totalTestDuration),
                        questionFormat: questionFormat, // Store the question format
                        upscFormat: q.format || 'E', // Store the specific UPSC format (A, B, C, D, or E)
                        questionSet: setForWorker, // Store which set this question belongs to
                        showFeedback: answerFeedback !== false
                    };
                }).filter(Boolean);

            // SUPER OPTIMIZATION: Use bulk insert for better database performance
            // Only wrap database persistence in transaction, keeping external AI calls outside
            if (questionsToSave.length > 0) {
                await runWithOptionalTransaction(session, async (activeSession) => {
                    try {
                        await Question.insertMany(questionsToSave, activeSession ? { 
                            session: activeSession,
                            ordered: false // Allow parallel insertion in transaction
                        } : { ordered: true });
                    } catch (insertErr) {
                        if (!activeSession) {
                            // On standalone MongoDB, transactions cannot rollback automatically.
                            // Clean up any partially inserted questions from this batch to prevent orphan records.
                            try {
                                const questionIds = questionsToSave.map(q => q._id).filter(Boolean);
                                if (questionIds.length > 0) {
                                    await Question.deleteMany({ _id: { $in: questionIds } });
                                }
                            } catch (cleanupErr) {
                                log.warn('Could not clean up partial writes on standalone MongoDB:', cleanupErr.message);
                            }
                        }
                        throw insertErr;
                    }
                });
            }

            if (questionsToSave.length === 0) {
                log.warn('DIAGNOSTIC_PERSISTENCE', {
                    batchId: jobId,
                    workerId: String(workerId),
                    persistedQuestionsCount: 0,
                    reasonCode: 'ZERO_QUESTIONS_PERSISTED'
                });
                taskResult = {
                    workerId,
                    workerName: worker.name,
                    success: false,
                    reason: `No valid questions could be generated or persisted for topics: "${combinedTopicString}".`,
                    reasonCode: 'ZERO_QUESTIONS_PERSISTED'
                };
            } else {
                log.info('DIAGNOSTIC_PERSISTENCE', {
                    batchId: jobId,
                    workerId: String(workerId),
                    persistedQuestionsCount: questionsToSave.length,
                    reasonCode: 'QUESTIONS_PERSISTED'
                });
                taskResult = { 
                    workerId, 
                    workerName: worker.name, 
                    success: true, 
                    questionsGenerated: questionsToSave.length,
                    targetQuestions: targetQuestions,
                    topics: combinedTopicString,
                    questionSet: setForWorker,
                    reasonCode: 'GENERATION_SUCCESS'
                };
                totalQuestionsGenerated += questionsToSave.length;
            }
                    }
                }
                }
            }
        } catch (error) {
            const workerName = workerMap.get(workerId)?.name || 'Unknown';
            log.error(`Transaction failed for worker ${workerName}:`, error.message);
            taskResult = { workerId, workerName, success: false, reason: error.message };
        } finally {
            await session.endSession();
        }
        
        workersProcessed++;
        // Include total questions generated in progress update
        jobManager.updateJobProgress(jobId, Math.round((workersProcessed / workerIds.length) * 100), {
            workersProcessed,
            totalWorkers: workerIds.length,
            totalQuestionsGenerated
        });
        return taskResult;
    });

    // Execute worker tasks with higher concurrency
    const results = await runWithConcurrency(tasks, CONCURRENT_WORKERS);

    const successfulWorkers = results.filter(r => r && r.success);
    const failedWorkers = results.filter(r => r && !r.success);

    const hasSuccesses = successfulWorkers.length > 0;
    const hasFailures = failedWorkers.length > 0;

    let finalState = 'completed';
    let primaryReason = null;

    if (!hasSuccesses || totalQuestionsGenerated === 0) {
        finalState = 'failed';
        primaryReason = failedWorkers.length > 0
            ? failedWorkers.map(f => `${f.workerName || 'Worker'}: ${f.reason || 'Failed to generate questions'}`).join('; ')
            : 'Zero questions were generated or persisted.';
    } else if (hasFailures) {
        finalState = 'partial_failure';
        primaryReason = `Generated questions for ${successfulWorkers.length} worker(s), but failed for: ${failedWorkers.map(f => f.workerName).join(', ')}`;
    }

    const returnValue = {
        success: hasSuccesses && totalQuestionsGenerated > 0,
        results: successfulWorkers,
        failedWorkers,
        totalQuestionsGenerated,
        state: finalState,
        reason: primaryReason
    };

    if (finalState === 'failed') {
        jobManager.failJob(jobId, primaryReason, returnValue);
    } else if (finalState === 'partial_failure') {
        jobManager.partialFailJob(jobId, primaryReason, returnValue);
    } else {
        jobManager.completeJob(jobId, returnValue);
    }

    return returnValue;
};

module.exports = { processQuestionGeneration, processThreeSetQuestionGeneration, runWithOptionalTransaction };