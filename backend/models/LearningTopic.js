// models/LearningTopic.js
const mongoose = require('mongoose');

const LearningTopicSchema = new mongoose.Schema({
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',  // Reference to Worker model from Attendance App
        required: true,
    },
    topic: {
        type: String,
        required: true,
        trim: true,
    },
    isCommonTopic: {
        type: Boolean,
        default: false
    },
    assignedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

LearningTopicSchema.index({ worker: 1, topic: 1 }, { unique: true });

module.exports = mongoose.model('LearningTopic', LearningTopicSchema);