// models/Question.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },  // Reference to Worker model
    batchId: { type: String, index: true }, // Generation batch / job ID
    topic: { type: String, required: true },
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    timeDuration: { type: Number, default: 15 },
    totalTestDuration: { type: Number, default: 600 },
    questionFormat: { type: String, enum: ['mcq', 'upsc'], default: 'mcq' }, // Add question format field
    upscFormat: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], default: 'E' }, // Add UPSC format field
    questionSet: { type: String, enum: ['setA', 'setB', 'setC'] }, // Add question set field for three-set mode
    showFeedback: { type: Boolean, default: true },
    subdomain: { type: String, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);