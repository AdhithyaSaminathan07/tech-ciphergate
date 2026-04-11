// models/Score.js
const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, unique: true }, // Each worker has one cumulative score entry
    totalScore: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Score', scoreSchema);