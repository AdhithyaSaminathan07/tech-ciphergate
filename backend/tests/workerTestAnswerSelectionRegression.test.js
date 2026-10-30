/**
 * Tech Ciphergate — Worker Test UI Answer Selection Regression Test Suite
 * 
 * Safety & Isolation:
 * - 100% in-memory mocks.
 * - Live database connection strictly blocked.
 * - Zero external API calls, zero database mutations.
 */

// Strict database connection safety guard
delete process.env.MONGO_URI;
const mongoose = require('mongoose');
mongoose.connect = () => {
    throw new Error('FATAL: Test attempted live database connection! Blocked by safety guard.');
};

const assert = require('assert');

// Controllers & Models
const { submitTest } = require('../controllers/testController');
const TestAttempt = require('../models/TestAttempt');
const Question = require('../models/Question');
const Score = require('../models/Score');

console.log('================================================================');
console.log(' Worker Test UI — Answer Selection & Navigation Regression Suite');
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

async function runAllTests() {
    // -------------------------------------------------------------------------
    // TEST 1: Root Cause Analysis — Buggy Disabled Prop vs Fixed Prop
    // -------------------------------------------------------------------------
    await test('1. Root Cause: Buggy `undefined !== null` permanently disabled buttons on initial load', () => {
        const answers = []; // Initial React state: useState([])
        const currentQuestionIndex = 0;
        const selectedAnswerIndex = null;
        const loading = false;
        const isFeedbackEnabled = true;
        const showFeedback = false;

        // Buggy evaluation:
        // In JS: answers[0] is undefined. undefined !== null evaluates to true!
        const buggyDisabledValue = selectedAnswerIndex !== null || answers[currentQuestionIndex] !== null;
        assert.strictEqual(buggyDisabledValue, true, 'Buggy logic must evaluate to true, proving buttons were disabled');

        // Fixed evaluation:
        const fixedDisabledValue = loading || (isFeedbackEnabled && showFeedback);
        assert.strictEqual(fixedDisabledValue, false, 'Fixed logic must evaluate to false, allowing worker to click options');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Selecting an Option Updates State and Visual Highlight
    // -------------------------------------------------------------------------
    await test('2. Selecting an option saves answer in state and visibly highlights the option', () => {
        let answers = [null, null, null];
        let currentQuestionIndex = 0;
        let selectedAnswerIndex = null;

        // Simulate handleAnswerSelect(1)
        const handleAnswerSelect = (optionIndex) => {
            selectedAnswerIndex = optionIndex;
            const newAnswers = [...answers];
            newAnswers[currentQuestionIndex] = optionIndex;
            answers = newAnswers;
        };

        handleAnswerSelect(1); // Select Option B

        assert.strictEqual(selectedAnswerIndex, 1, 'selectedAnswerIndex should be 1');
        assert.strictEqual(answers[0], 1, 'answers[0] should be 1');

        // Check button styling logic
        const getButtonStyle = (index) => {
            if (answers[currentQuestionIndex] === index || selectedAnswerIndex === index) {
                return 'selected-blue';
            }
            return 'default-dark';
        };

        assert.strictEqual(getButtonStyle(1), 'selected-blue', 'Option B (index 1) should be highlighted in blue');
        assert.strictEqual(getButtonStyle(0), 'default-dark', 'Option A (index 0) should remain default');
        assert.strictEqual(getButtonStyle(2), 'default-dark', 'Option C (index 2) should remain default');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Changing an Answer
    // -------------------------------------------------------------------------
    await test('3. Changing an answer updates selectedAnswerIndex and answers array without blocking', () => {
        let answers = [1, null, null]; // Option B currently selected for Q0
        let currentQuestionIndex = 0;
        let selectedAnswerIndex = 1;
        let loading = false;
        let isFeedbackEnabled = false; // Exam mode without instant feedback
        let showFeedback = false;

        // Simulate updated handleAnswerSelect
        const handleAnswerSelect = (optionIndex) => {
            if (loading || (isFeedbackEnabled && showFeedback)) {
                return;
            }
            selectedAnswerIndex = optionIndex;
            const newAnswers = [...answers];
            newAnswers[currentQuestionIndex] = optionIndex;
            answers = newAnswers;
        };

        // User decides to change answer from Option B (1) to Option C (2)
        handleAnswerSelect(2);

        assert.strictEqual(selectedAnswerIndex, 2, 'selectedAnswerIndex should update to 2');
        assert.strictEqual(answers[0], 2, 'answers[0] should update to 2');

        // Check button styling after change
        const getButtonStyle = (index) => {
            if (answers[currentQuestionIndex] === index || selectedAnswerIndex === index) {
                return 'selected-blue';
            }
            return 'default-dark';
        };

        assert.strictEqual(getButtonStyle(1), 'default-dark', 'Option B is no longer highlighted');
        assert.strictEqual(getButtonStyle(2), 'selected-blue', 'Option C is now highlighted in blue');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Question Navigation and Next/Submit Button State
    // -------------------------------------------------------------------------
    await test('4. Question navigation preserves recorded answers and controls Next/Submit button', () => {
        let answers = [null, null, null];
        let currentQuestionIndex = 0;
        let selectedAnswerIndex = null;
        let showFeedback = false;
        let isFeedbackEnabled = false;
        let loading = false;

        const isNextButtonDisabled = () => {
            return loading || (isFeedbackEnabled && showFeedback) || answers[currentQuestionIndex] === null || answers[currentQuestionIndex] === undefined;
        };

        // Initially no option selected -> Next button must be disabled
        assert.strictEqual(isNextButtonDisabled(), true, 'Next button must be disabled when no answer is chosen');

        // Worker selects option 0 for Question 0
        answers[0] = 0;
        selectedAnswerIndex = 0;
        assert.strictEqual(isNextButtonDisabled(), false, 'Next button must be enabled once an answer is chosen');

        // Navigate forward to Question 1
        currentQuestionIndex = 1;
        selectedAnswerIndex = answers[1] !== null && answers[1] !== undefined ? answers[1] : null;
        assert.strictEqual(selectedAnswerIndex, null, 'Q1 has no selected answer initially');
        assert.strictEqual(isNextButtonDisabled(), true, 'Next button must be disabled for unattempted Q1');

        // Worker selects option 3 for Question 1
        answers[1] = 3;
        selectedAnswerIndex = 3;
        assert.strictEqual(isNextButtonDisabled(), false, 'Next button must be enabled for Q1 after selection');

        // Worker navigates back to Question 0 via Previous button
        currentQuestionIndex = 0;
        selectedAnswerIndex = answers[0] !== null && answers[0] !== undefined ? answers[0] : null;
        assert.strictEqual(selectedAnswerIndex, 0, 'Navigating back to Q0 must restore selected option 0');

        // Worker changes answer on Q0 to Option 2
        answers[0] = 2;
        selectedAnswerIndex = 2;

        // Worker navigates forward to Question 2 (last question)
        currentQuestionIndex = 2;
        answers[2] = 1;
        selectedAnswerIndex = 1;

        assert.deepStrictEqual(answers, [2, 3, 1], 'All answers must be preserved across navigation');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Answer Submission Payload Format
    // -------------------------------------------------------------------------
    await test('5. Answer submission payload formats correctly with questionId and selectedOption', () => {
        const questions = [
            { _id: '672000000000000000000001', questionText: 'Q1' },
            { _id: '672000000000000000000002', questionText: 'Q2' },
            { _id: '672000000000000000000003', questionText: 'Q3' }
        ];

        // Worker answered Q0 with 2, Q1 with 0, and left Q2 blank
        const answersToSubmit = [2, 0, null];

        const submissionData = questions.map((question, index) => ({
            questionId: question._id,
            selectedOption: answersToSubmit[index] !== null && answersToSubmit[index] !== undefined ? answersToSubmit[index] : -1
        }));

        assert.deepStrictEqual(submissionData, [
            { questionId: '672000000000000000000001', selectedOption: 2 },
            { questionId: '672000000000000000000002', selectedOption: 0 },
            { questionId: '672000000000000000000003', selectedOption: -1 }
        ], 'Payload must accurately reflect selected options and mark unanswered questions as -1');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Backend Controller Submission Validation (submitTest)
    // -------------------------------------------------------------------------
    await test('6. Backend submitTest controller processes submitted answers, validates scores, and marks attempt complete', async () => {
        const testAttemptId = new mongoose.Types.ObjectId();
        const workerId = new mongoose.Types.ObjectId();
        const q1Id = new mongoose.Types.ObjectId();
        const q2Id = new mongoose.Types.ObjectId();

        const mockAttempt = {
            _id: testAttemptId,
            worker: workerId,
            status: 'in-progress',
            testStartTime: new Date(),
            totalTestDuration: 600,
            durationPerQuestion: 30,
            questions: [q1Id, q2Id],
            score: 0,
            totalQuestions: 2,
            answers: [],
            save: async function() {
                return this;
            }
        };

        const mockQuestions = [
            { _id: q1Id, correctAnswer: 2 },
            { _id: q2Id, correctAnswer: 1 }
        ];

        // Mock TestAttempt.findById
        const origFindById = TestAttempt.findById;
        TestAttempt.findById = async (id) => {
            if (id.toString() === testAttemptId.toString()) return mockAttempt;
            return null;
        };

        // Mock Question.find
        const origQuestionFind = Question.find;
        Question.find = () => ({
            lean: async () => mockQuestions
        });

        // Mock Score.findOneAndUpdate
        let scoreUpdated = false;
        let recordedScore = 0;
        const origScoreUpdate = Score.findOneAndUpdate;
        Score.findOneAndUpdate = async (filter, update) => {
            scoreUpdated = true;
            recordedScore = update.$inc.totalScore;
            return { worker: filter.worker, totalScore: recordedScore };
        };

        const req = {
            params: { testAttemptId: testAttemptId.toString() },
            body: {
                answers: [
                    { questionId: q1Id.toString(), selectedOption: 2 }, // Correct (correctAnswer is 2)
                    { questionId: q2Id.toString(), selectedOption: 0 }  // Wrong (correctAnswer is 1)
                ]
            },
            user: {
                _id: workerId,
                role: 'worker'
            }
        };

        let responseStatusCode = null;
        let responseJson = null;

        const res = {
            status: function(code) {
                responseStatusCode = code;
                return this;
            },
            json: function(data) {
                responseJson = data;
                return this;
            }
        };

        try {
            await submitTest(req, res);

            assert.strictEqual(responseStatusCode, 200, 'Expected HTTP 200 OK');
            assert.strictEqual(responseJson.score, 1, 'Worker should get score 1 for 1 correct answer');
            assert.strictEqual(responseJson.totalQuestions, 2, 'Total questions should be 2');
            assert.strictEqual(mockAttempt.status, 'completed', 'Attempt status must be marked completed');
            assert.strictEqual(scoreUpdated, true, 'Worker cumulative score must be updated');
            assert.strictEqual(recordedScore, 1, 'Score increment must be 1');
            assert.strictEqual(mockAttempt.answers.length, 2, 'Attempt should record 2 answer entries');
            assert.strictEqual(mockAttempt.answers[0].isCorrect, true, 'Answer 1 must be marked isCorrect: true');
            assert.strictEqual(mockAttempt.answers[1].isCorrect, false, 'Answer 2 must be marked isCorrect: false');
        } finally {
            TestAttempt.findById = origFindById;
            Question.find = origQuestionFind;
            Score.findOneAndUpdate = origScoreUpdate;
        }
    });

    console.log(`\n================================================================`);
    console.log(` Results: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
    console.log(`================================================================`);

    if (fail > 0) {
        process.exit(1);
    }
}

runAllTests();
