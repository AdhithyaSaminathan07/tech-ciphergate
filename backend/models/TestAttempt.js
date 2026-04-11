// models/TestAttempt.js
const mongoose = require('mongoose');

const TestAttemptSchema = new mongoose.Schema({
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',  // Reference to Worker model
        required: true,
    },
    topic: {
        type: String,
        required: true,
    },
    questions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
        },
    ],
    answers: [
        {
            questionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Question',
            },
            selectedOption: {
                type: String,
            },
            isCorrect: {
                type: Boolean,
            },
        },
    ],
    score: {
        type: Number,
        default: 0,
    },
    totalQuestions: {
        type: Number,
        default: 0,
    },
    currentQuestionIndex: {
        type: Number,
        default: 0,
    },
    questionStartTime: {
        type: Date,
        default: Date.now,
    },
    durationPerQuestion: {
        type: Number,
        required: true,
    },
    totalTestDuration: {
        type: Number,
        required: true,
    },
    testStartTime: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['in-progress', 'completed', 'missed'],
        default: 'in-progress',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('TestAttempt', TestAttemptSchema);