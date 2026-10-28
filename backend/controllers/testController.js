// controllers/testController.js
const TestAttempt = require('../models/TestAttempt');
const QuickTest = require('../models/QuickTest');
const Question = require('../models/Question');
const Score = require('../models/Score');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');

// @desc    Submit worker test answers
// @route   POST /api/test/submit/:testAttemptId
// @access  Private/Worker
const submitTest = async (req, res) => {
    const { testAttemptId } = req.params;
    const { answers: submittedAnswers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(testAttemptId)) {
        return res.status(400).json({ message: 'Invalid Test Attempt ID.' });
    }

    try {
        const testAttempt = await TestAttempt.findById(testAttemptId);

        if (!testAttempt) {
            return res.status(404).json({ message: 'Test attempt not found.' });
        }

        // Authorization check: Workers can only submit answers for their own test attempt
        if (req.user && req.user.role === 'worker' && testAttempt.worker.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                message: 'Access denied: You can only submit answers for your own test attempt.'
            });
        }

        if (testAttempt.status !== 'in-progress') {
            return res.status(400).json({ message: 'Test has already been submitted or is in an invalid state.' });
        }

        const now = Date.now();
        const startTime = testAttempt.testStartTime ? new Date(testAttempt.testStartTime).getTime() : now;
        const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
        const perQuestionDuration = testAttempt.durationPerQuestion || 30;
        const totalQuestionsCount = (testAttempt.questions || []).length || 1;
        const totalAllowedSeconds = testAttempt.totalTestDuration || (totalQuestionsCount * perQuestionDuration);
        const gracePeriodSeconds = 15; // 15-second grace period for network latency

        if (elapsedSeconds > (totalAllowedSeconds + gracePeriodSeconds)) {
            testAttempt.status = 'completed';
            if (typeof testAttempt.save === 'function') {
                await testAttempt.save();
            }
            return res.status(400).json({
                message: 'Test deadline has expired. Late submissions cannot be accepted.',
                reason: 'test_expired'
            });
        }

        const questionIds = (testAttempt.questions || []).map(id => id.toString());
        const questionsInTest = await Question.find({
            _id: { $in: questionIds }
        }).lean();

        const questionMap = new Map(
            questionsInTest.map(q => [q._id.toString(), q])
        );

        const answersList = Array.isArray(submittedAnswers) ? submittedAnswers : [];
        const recordedAnswers = answersList.map(({ questionId, selectedOption }) => {
            const q = questionMap.get(String(questionId));
            const isCorrect = !!q && (Number(selectedOption) === q.correctAnswer);
            return { questionId, selectedOption, isCorrect };
        });

        const score = recordedAnswers.filter(a => a.isCorrect).length;
        const totalQuestions = questionIds.length;

        // Update the attempt object
        testAttempt.answers = recordedAnswers;
        testAttempt.score = score;
        testAttempt.totalQuestions = totalQuestions;
        testAttempt.status = 'completed';
        await testAttempt.save();

        // Update worker's cumulative Score
        await Score.findOneAndUpdate(
            { worker: testAttempt.worker },
            { $inc: { totalScore: score } },
            { upsert: true, new: true }
        );

        return res.status(200).json({
            message: 'Test submitted successfully!',
            score,
            totalQuestions,
            testAttemptId
        });
    } catch (err) {
        console.error('Error in submitTest:', err);
        return res.status(500).json({
            message: err.message || 'Server error submitting test.'
        });
    }
};


// @desc    Submit quick test answers
// @route   POST /api/test/quick-test/submit/:quickTestId
// @access  Public
const submitQuickTest = async (req, res) => {
    const { quickTestId } = req.params;
    const { answers: submittedAnswers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(quickTestId)) {
        return res.status(400).json({ message: 'Invalid Quick Test ID.' });
    }

    try {
        const quickTest = await QuickTest.findById(quickTestId);

        if (!quickTest) {
            return res.status(404).json({ message: 'Quick test not found.' });
        }
        if (quickTest.status !== 'in-progress') {
            return res.status(400).json({ message: 'Test has already been submitted or is in an invalid state.' });
        }

        const questionIds = quickTest.questions.map(id => id.toString());
        const questionsInTest = await Question.find({
            _id: { $in: questionIds }
        }).lean();

        const questionMap = new Map(
            questionsInTest.map(q => [q._id.toString(), q])
        );

        const recordedAnswers = submittedAnswers.map(({ questionId, selectedOption }) => {
            const q = questionMap.get(String(questionId));
            const isCorrect = !!q && (Number(selectedOption) === q.correctAnswer);
            return { questionId, selectedOption, isCorrect };
        });

        const score = recordedAnswers.filter(a => a.isCorrect).length;
        const totalQuestions = questionIds.length;

        // Update the quick test object
        quickTest.answers = recordedAnswers;
        quickTest.score = score;
        quickTest.totalQuestions = totalQuestions;
        quickTest.status = 'completed';
        await quickTest.save();

        return res.status(200).json({
            message: 'Quick test submitted successfully!',
            score,
            totalQuestions,
            quickTestId,
            name: quickTest.name
        });
    } catch (err) {
        console.error('Error in submitQuickTest:', err);
        return res.status(500).json({
            message: err.message || 'Server error submitting quick test.'
        });
    }
};

// @desc    Get scoreboard
// @route   GET /api/test/scores
// @access  Private/Admin, Private/Worker
const getScoreboard = async (req, res) => {
    const { date, workerId } = req.query;

    try {
        let matchQuery = { status: 'completed' };

        if (workerId) {
            if (!mongoose.Types.ObjectId.isValid(workerId)) {
                return res.status(400).json({ message: 'Invalid worker ID format' });
            }
            // Workers can only filter by their own workerId
            if (req.user && req.user.role === 'worker' && workerId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Access denied: You can only view your own scores.' });
            }
            matchQuery.worker = new mongoose.Types.ObjectId(workerId);
        } else if (req.user && req.user.role === 'worker') {
            // Workers calling without an explicit workerId filter must still only see their own scores
            matchQuery.worker = new mongoose.Types.ObjectId(req.user._id);
        }

        if (date) {
            const startOfDay = new Date(date);
            if (!isNaN(startOfDay.getTime())) {
                startOfDay.setUTCHours(0, 0, 0, 0);

                const endOfDay = new Date(date);
                endOfDay.setUTCHours(23, 59, 59, 999);

                matchQuery.createdAt = {
                    $gte: startOfDay,
                    $lte: endOfDay
                };
            }
        }

        // Server-side tenant scoping: authenticated user.subdomain takes precedence over query params
        const effectiveSubdomain = (req.user && req.user.subdomain && req.user.subdomain !== 'main')
            ? req.user.subdomain
            : (req.query.subdomain || req.user?.subdomain);

        // Build worker match filter with tenant scoping and flexible status
        const workerMatch = {};
        if (effectiveSubdomain && effectiveSubdomain !== 'main') {
            workerMatch['workerInfo.subdomain'] = effectiveSubdomain;
        } else if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            // Fail closed: tenant admin must never view another tenant's data
            workerMatch['workerInfo.subdomain'] = req.user.subdomain;
        }
        workerMatch['workerInfo.status'] = { $in: ['Active', 'active', null] };

        // Always return individual test attempts, not aggregated data
        const pipeline = [
            { $match: matchQuery },
            { $lookup: { from: 'workers', localField: 'worker', foreignField: '_id', as: 'workerInfo' } },
            { $unwind: '$workerInfo' },
            { $match: workerMatch },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'workerInfo.department',
                    foreignField: '_id',
                    as: 'workerInfo.departmentInfo'
                }
            },
            {
                $unwind: {
                    path: '$workerInfo.departmentInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: '$_id',
                    worker: { 
                        _id: '$workerInfo._id', 
                        name: '$workerInfo.name', 
                        email: '$workerInfo.email',
                        department: {
                            $ifNull: [
                                '$workerInfo.departmentInfo.name',
                                {
                                    $cond: {
                                        if: { $eq: [{ $type: '$workerInfo.department' }, 'string'] },
                                        then: '$workerInfo.department',
                                        else: 'N/A'
                                    }
                                }
                            ]
                        }
                    },
                    score: '$score',
                    totalQuestions: '$totalQuestions',
                    createdAt: '$createdAt',
                    topic: '$topic'
                }
            },
            {
                $addFields: {
                    percentage: {
                        $cond: {
                            if: { $eq: ["$totalQuestions", 0] },
                            then: 0,
                            else: { $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100] }
                        }
                    }
                }
            },
            { $sort: { createdAt: -1 } } // Sort by date, newest first
        ];

        const scores = await TestAttempt.aggregate(pipeline);
        res.status(200).json(scores);
    } catch (error) {
        console.error("Error in getScoreboard:", error);
        res.status(500).json({ message: 'Server error fetching scoreboard.' });
    }
};

// @desc    Get global scoreboard (including quick tests)
// @route   GET /api/test/global-scores
// @access  Private/Admin
const getGlobalScoreboard = async (req, res) => {
    try {
        const { date } = req.query;
        let matchQuery = { status: 'completed' };
        
        // Add date filter if provided and valid
        if (date) {
            const startOfDay = new Date(date);
            if (!isNaN(startOfDay.getTime())) {
                startOfDay.setUTCHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setUTCHours(23, 59, 59, 999);
                
                matchQuery.createdAt = {
                    $gte: startOfDay,
                    $lte: endOfDay
                };
            }
        }

        // Server-side tenant scoping: authenticated user.subdomain takes precedence over query params
        const effectiveSubdomain = (req.user && req.user.subdomain && req.user.subdomain !== 'main')
            ? req.user.subdomain
            : (req.query.subdomain || req.user?.subdomain);

        // Build worker match filter with tenant scoping and flexible status
        const workerMatch = {};
        if (effectiveSubdomain && effectiveSubdomain !== 'main') {
            workerMatch['workerInfo.subdomain'] = effectiveSubdomain;
        } else if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            // Fail closed: tenant admin must never view another tenant's data
            workerMatch['workerInfo.subdomain'] = req.user.subdomain;
        }
        workerMatch['workerInfo.status'] = { $in: ['Active', 'active', null] };

        // Get worker test attempts
        const workerScores = await TestAttempt.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$worker",
                    totalScore: { $sum: "$score" },
                    totalPossibleScore: { $sum: "$totalQuestions" },
                    testCount: { $sum: 1 }
                }
            },
            { $lookup: { from: 'workers', localField: '_id', foreignField: '_id', as: 'workerInfo' } },
            { $unwind: '$workerInfo' },
            { $match: workerMatch },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'workerInfo.department',
                    foreignField: '_id',
                    as: 'workerInfo.departmentInfo'
                }
            },
            {
                $unwind: {
                    path: '$workerInfo.departmentInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    percentage: {
                        $cond: {
                            if: { $eq: ["$totalPossibleScore", 0] },
                            then: 0,
                            else: { $multiply: [{ $divide: ["$totalScore", "$totalPossibleScore"] }, 100] }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: '$_id',
                    name: '$workerInfo.name',
                    email: '$workerInfo.email',
                    department: {
                        $ifNull: [
                            '$workerInfo.departmentInfo.name',
                            {
                                $cond: {
                                    if: { $eq: [{ $type: '$workerInfo.department' }, 'string'] },
                                    then: '$workerInfo.department',
                                    else: 'N/A'
                                }
                            }
                        ]
                    },
                    totalScore: '$totalScore',
                    totalPossibleScore: '$totalPossibleScore',
                    testCount: '$testCount',
                    percentage: '$percentage',
                    type: 'worker'
                }
            }
        ]);

        // Only include guest quick tests if super-admin on root domain (never leak into private tenants)
        let quickTestScores = [];
        const isSuperAdmin = (req.user?.role === 'admin' && (!req.user?.subdomain || req.user?.subdomain === 'main'));
        if (isSuperAdmin && (!effectiveSubdomain || effectiveSubdomain === 'main')) {
            let quickTestMatchQuery = { status: 'completed' };
            if (date && matchQuery.createdAt) {
                quickTestMatchQuery.createdAt = matchQuery.createdAt;
            }
            
            quickTestScores = await QuickTest.aggregate([
                { $match: quickTestMatchQuery },
                {
                    $addFields: {
                        percentage: {
                            $cond: {
                                if: { $eq: ["$totalQuestions", 0] },
                                then: 0,
                                else: { $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100] }
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: '$_id',
                        name: '$name',
                        totalScore: '$score',
                        totalPossibleScore: '$totalQuestions',
                        testCount: 1,
                        percentage: '$percentage',
                        type: 'guest'
                    }
                }
            ]);
        }

        // Sanitize numbers to prevent NaN breaking array sort
        const sanitizeItem = (s) => ({
            ...s,
            percentage: isNaN(s.percentage) || s.percentage === null || s.percentage === undefined ? 0 : s.percentage,
            totalScore: s.totalScore || 0,
            testCount: s.testCount || 0
        });

        // Combine and sort all scores deterministically: percentage desc, totalScore desc, testCount desc, name asc
        const allScores = [...workerScores.map(sanitizeItem), ...quickTestScores.map(sanitizeItem)].sort((a, b) => {
            if (b.percentage !== a.percentage) {
                return b.percentage - a.percentage;
            }
            if (b.totalScore !== a.totalScore) {
                return b.totalScore - a.totalScore;
            }
            if (b.testCount !== a.testCount) {
                return b.testCount - a.testCount;
            }
            return (a.name || '').localeCompare(b.name || '');
        });

        res.status(200).json(allScores);
    } catch (error) {
        console.error("Error in getGlobalScoreboard:", error);
        res.status(500).json({ message: 'Server error fetching global scoreboard.' });
    }
};


// @desc    Get individual worker scores
// @route   GET /api/test/scores/:workerId
// @access  Private/Worker
const getIndividualScores = async (req, res) => {
    const { workerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
        return res.status(400).json({ message: 'Invalid worker ID format' });
    }

    // Authorization check: Workers can only view their own scores
    if (req.user && req.user.role === 'worker' && workerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied: You can only view your own scores.' });
    }

    try {
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({ message: 'Worker not found' });
        }

        // Authorization check: Tenant admins can only view workers in their company
        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            if (worker.subdomain && worker.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied: Worker belongs to another company.' });
            }
        }

        const testAttempts = await TestAttempt.find({
            worker: workerId,
            status: 'completed'
        }).sort({ createdAt: -1 });

        const totalScore = await Score.findOne({ worker: workerId });

        res.status(200).json({
            worker: {
                _id: worker._id,
                name: worker.name,
                email: worker.email
            },
            totalScore: totalScore?.totalScore || 0,
            testAttempts: testAttempts.map(attempt => ({
                _id: attempt._id,
                topic: attempt.topic,
                score: attempt.score,
                totalQuestions: attempt.totalQuestions,
                createdAt: attempt.createdAt
            }))
        });
    } catch (error) {
        console.error("Error in getIndividualScores:", error);
        res.status(500).json({ message: 'Server error fetching individual scores.' });
    }
};

// @desc    Get test details for review
// @route   GET /api/test/:testId/details
// @access  Private/Worker
const getTestDetails = async (req, res) => {
    try {
        const { testId } = req.params;
        const userId = req.user._id;

        // Find the test attempt and populate questions
        const testAttempt = await TestAttempt.findById(testId)
            .populate({
                path: 'questions',
                select: 'questionText options correctAnswer questionFormat'
            });

        if (!testAttempt) {
            return res.status(404).json({ message: 'Test not found' });
        }

        // Check if the user is authorized to view this test (workers can only view their own; admins can view their tenant workers)
        if (req.user && req.user.role === 'worker' && testAttempt.worker.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Access denied: You can only view your own test details.' });
        }

        if (req.user && req.user.role === 'admin' && req.user.subdomain && req.user.subdomain !== 'main') {
            const attemptWorker = await Worker.findById(testAttempt.worker);
            if (attemptWorker && attemptWorker.subdomain && attemptWorker.subdomain !== req.user.subdomain) {
                return res.status(403).json({ message: 'Access denied: Test belongs to an employee of another company.' });
            }
        }

        // Format the questions with user answers and correct answers
        const questionsWithAnswers = testAttempt.questions.map((question, index) => {
            const answerRecord = testAttempt.answers.find(
                ans => ans.questionId.toString() === question._id.toString()
            );
            
            // Get the correct answer text from options array
            let correctAnswerText = '';
            if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
                // Convert correctAnswer to number for array indexing
                const correctAnswerIndex = parseInt(question.correctAnswer);
                if (!isNaN(correctAnswerIndex) && correctAnswerIndex >= 0 && correctAnswerIndex < question.options.length) {
                    correctAnswerText = question.options[correctAnswerIndex] || '';
                }
            }
            
            // Get the user's answer text from options array
            let userAnswerText = '';
            if (answerRecord && answerRecord.selectedOption !== undefined && answerRecord.selectedOption !== null && answerRecord.selectedOption !== -1) {
                // Convert selectedOption to number for array indexing
                const selectedOptionIndex = parseInt(answerRecord.selectedOption);
                if (!isNaN(selectedOptionIndex) && selectedOptionIndex >= 0 && selectedOptionIndex < question.options.length) {
                    userAnswerText = question.options[selectedOptionIndex] || '';
                }
            }
            
            return {
                questionText: question.questionText,
                options: question.options,
                correctAnswer: correctAnswerText,
                userAnswer: userAnswerText,
                isCorrect: answerRecord ? answerRecord.isCorrect : false
            };
        });

        const percentage = testAttempt.totalQuestions > 0 
            ? Math.round((testAttempt.score / testAttempt.totalQuestions) * 100) 
            : 0;

        res.status(200).json({
            testId: testAttempt._id,
            testName: testAttempt.topic,
            score: `${testAttempt.score}/${testAttempt.totalQuestions}`,
            percentage: percentage,
            dateCompleted: testAttempt.createdAt,
            questions: questionsWithAnswers
        });
    } catch (error) {
        console.error("Error in getTestDetails:", error);
        res.status(500).json({ message: 'Server error fetching test details.' });
    }
};

// @desc    Get all available tests/batches for a worker
// @route   GET /api/test/available/:workerId
// @access  Private (Worker or Admin)
const getAvailableTests = async (req, res) => {
    const { workerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
        return res.status(400).json({
            message: 'Invalid worker ID.',
            reason: 'invalid_worker_id'
        });
    }

    try {
        const validWorkerId = new mongoose.Types.ObjectId(workerId);

        // Authorization check: Worker can only list their own tests
        if (req.user && req.user.role === 'worker' && req.user._id.toString() !== workerId) {
            return res.status(403).json({
                message: 'Access denied: You can only view your own tests.',
                reason: 'access_denied'
            });
        }

        const worker = await Worker.findById(validWorkerId);
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

        // 1. Gather completed batch IDs for this worker
        let completedBatchIds = [];
        if (TestAttempt.find !== mongoose.Model.find || mongoose.connection.readyState === 1) {
            const completedAttemptsQuery = TestAttempt.find({
                worker: validWorkerId,
                status: 'completed',
                batchId: { $exists: true, $ne: null }
            });
            const completedAttempts = typeof completedAttemptsQuery?.select === 'function'
                ? await completedAttemptsQuery.select('batchId')
                : await completedAttemptsQuery;

            if (Array.isArray(completedAttempts)) {
                completedBatchIds = completedAttempts.map(a => a.batchId).filter(Boolean);
            }
        }

        // 2. Inspect active in-progress attempts for expiration and resumption state
        const inProgressMap = new Map();
        if (TestAttempt.find !== mongoose.Model.find || mongoose.connection.readyState === 1) {
            const inProgressQuery = TestAttempt.find({
                worker: validWorkerId,
                status: 'in-progress',
                batchId: { $exists: true, $ne: null }
            });
            const inProgressAttempts = typeof inProgressQuery?.lean === 'function'
                ? await inProgressQuery
                : await inProgressQuery;

            const now = Date.now();
            for (const attempt of (inProgressAttempts || [])) {
                if (!attempt.batchId) continue;
                const startTime = attempt.testStartTime ? new Date(attempt.testStartTime).getTime() : now;
                const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
                const totalLimitSeconds = attempt.totalTestDuration || 600;

                if (elapsedSeconds >= totalLimitSeconds) {
                    // Expired attempt -> transition to completed
                    attempt.status = 'completed';
                    if (typeof attempt.save === 'function') {
                        try {
                            await attempt.save();
                        } catch (saveErr) {
                            console.warn('[WARN] Could not mark expired attempt completed:', saveErr.message);
                        }
                    }
                    completedBatchIds.push(attempt.batchId);
                } else {
                    inProgressMap.set(attempt.batchId, {
                        testAttemptId: attempt._id,
                        timeRemaining: Math.max(1, totalLimitSeconds - elapsedSeconds),
                        currentQuestionIndex: attempt.currentQuestionIndex || 0
                    });
                }
            }
        }

        // 3. Query questions belonging to this worker excluding completed batches
        const questionsQuery = {
            worker: validWorkerId,
            batchId: { $exists: true, $ne: null }
        };
        if (completedBatchIds.length > 0) {
            questionsQuery.batchId = { $nin: completedBatchIds };
        }

        const questions = await Question.find(questionsQuery);

        // 4. Group questions into distinct batches
        const batchMap = new Map();
        for (const q of (questions || [])) {
            if (!q.batchId) continue;
            if (completedBatchIds.includes(q.batchId)) continue;

            if (!batchMap.has(q.batchId)) {
                const inProgressInfo = inProgressMap.get(q.batchId);
                const isProgress = !!inProgressInfo;
                const batchTopic = q.isMixed && Array.isArray(q.allTopics) && q.allTopics.length > 0
                    ? q.allTopics.join(', ')
                    : (q.topic || 'General Topic');

                batchMap.set(q.batchId, {
                    batchId: q.batchId,
                    topic: batchTopic,
                    isMixed: !!q.isMixed,
                    allTopics: q.allTopics || [batchTopic],
                    questionCount: 0,
                    durationPerQuestion: q.timeDuration || 30,
                    totalTestDuration: isProgress ? inProgressInfo.timeRemaining : (q.totalTestDuration || 600),
                    createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
                    status: isProgress ? 'in-progress' : 'available',
                    isResumed: isProgress,
                    testAttemptId: inProgressInfo?.testAttemptId || null,
                    timeRemaining: inProgressInfo?.timeRemaining || null
                });
            }
            batchMap.get(q.batchId).questionCount += 1;
        }

        // 5. Enrich with TestSchedule information and enforce window timing
        const batchIds = Array.from(batchMap.keys());
        if (batchIds.length > 0) {
            try {
                const TestSchedule = require('../models/TestSchedule');
                const schedules = await TestSchedule.find({ batchId: { $in: batchIds } }).lean();
                const scheduleMap = new Map();
                (schedules || []).forEach(s => scheduleMap.set(s.batchId, s));

                const now = new Date();
                for (const batchId of batchIds) {
                    const sched = scheduleMap.get(batchId);
                    if (sched) {
                        const batch = batchMap.get(batchId);
                        if (!batch) continue;
                        batch.scheduleName = sched.name;
                        batch.testDate = sched.testDate;
                        batch.startTime = sched.startTime;
                        batch.endTime = sched.endTime;
                        batch.timezone = sched.timezone;
                        batch.windowStartUtc = sched.windowStartUtc;
                        batch.windowEndUtc = sched.windowEndUtc;
                        batch.isScheduled = true;

                        const start = new Date(sched.windowStartUtc);
                        const end = new Date(sched.windowEndUtc);

                        if (now < start) {
                            batch.status = 'upcoming';
                            batch.isUpcoming = true;
                        } else if (now > end) {
                            // Window has elapsed; remove from active available tests
                            batchMap.delete(batchId);
                        } else {
                            if (batch.status !== 'in-progress') {
                                batch.status = 'available';
                            }
                        }
                    }
                }
            } catch (schedErr) {
                console.warn('Could not enrich available tests with schedules:', schedErr.message);
            }
        }

        const availableBatches = Array.from(batchMap.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return res.status(200).json(availableBatches);
    } catch (error) {
        console.error("Error in getAvailableTests:", error);
        return res.status(500).json({ message: 'Server error fetching available tests.' });
    }
};

module.exports = {
    submitTest,
    submitQuickTest,
    getScoreboard,
    getGlobalScoreboard,
    getIndividualScores,
    getTestDetails,
    getAvailableTests
};