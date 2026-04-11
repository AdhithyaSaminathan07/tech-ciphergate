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
        if (testAttempt.status !== 'in-progress') {
            return res.status(400).json({ message: 'Test has already been submitted or is in an invalid state.' });
        }

        const questionIds = testAttempt.questions.map(id => id.toString());
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
            matchQuery.worker = new mongoose.Types.ObjectId(workerId);
        }

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);

            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);

            matchQuery.createdAt = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }

        // Always return individual test attempts, not aggregated data
        const pipeline = [
            { $match: matchQuery },
            { $lookup: { from: 'workers', localField: 'worker', foreignField: '_id', as: 'workerInfo' } },
            { $unwind: '$workerInfo' },
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
                        department: '$workerInfo.departmentInfo.name'
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
        
        // Add date filter if provided
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
            
            matchQuery.createdAt = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }

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
                    department: '$workerInfo.departmentInfo.name',
                    totalScore: '$totalScore',
                    totalPossibleScore: '$totalPossibleScore',
                    testCount: '$testCount',
                    percentage: '$percentage',
                    type: 'worker'
                }
            }
        ]);

        // Get quick test scores (apply date filter if provided)
        let quickTestMatchQuery = { status: 'completed' };
        if (date) {
            quickTestMatchQuery.createdAt = matchQuery.createdAt;
        }
        
        const quickTestScores = await QuickTest.aggregate([
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

        // Combine and sort all scores by percentage, then by totalScore
        const allScores = [...workerScores, ...quickTestScores].sort((a, b) => {
            // First sort by percentage (descending)
            if (b.percentage !== a.percentage) {
                return b.percentage - a.percentage;
            }
            // If percentage is same, sort by total score (descending)
            return b.totalScore - a.totalScore;
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

    try {
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({ message: 'Worker not found' });
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

        // Check if the user is authorized to view this test
        if (testAttempt.worker.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Access denied' });
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

module.exports = {
    submitTest,
    submitQuickTest,
    getScoreboard,
    getGlobalScoreboard,
    getIndividualScores,
    getTestDetails
};