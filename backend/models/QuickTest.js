// models/QuickTest.js
const mongoose = require('mongoose');

const QuickTestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    password: {
        type: String,
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
    // Additional fields for guest users
    isGuest: {
        type: Boolean,
        default: true,
    },
    expiresAt: {
        type: Date,
        default: Date.now,
        expires: 86400, // 24 hours
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('QuickTest', QuickTestSchema);