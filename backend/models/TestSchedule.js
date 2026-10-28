// models/TestSchedule.js
const mongoose = require('mongoose');

const testScheduleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Schedule name is required'],
        trim: true
    },
    subdomain: {
        type: String,
        required: [true, 'Subdomain is required'],
        index: true
    },
    workers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    }],
    departments: [{
        type: String,
        trim: true
    }],
    topicSource: {
        type: String,
        enum: ['daily_topics', 'manual'],
        default: 'daily_topics',
        required: true
    },
    topicDateRange: {
        startDate: { type: String, trim: true }, // YYYY-MM-DD
        endDate: { type: String, trim: true }     // YYYY-MM-DD
    },
    manualTopics: [{
        type: String,
        trim: true
    }],
    allowHistoricalFallback: {
        type: Boolean,
        default: false
    },
    testDate: {
        type: String, // YYYY-MM-DD
        required: [true, 'Test date is required'],
        trim: true
    },
    startTime: {
        type: String, // HH:mm (24-hour)
        required: [true, 'Test start time is required'],
        trim: true
    },
    endTime: {
        type: String, // HH:mm (24-hour)
        required: [true, 'Test end time is required'],
        trim: true
    },
    timezone: {
        type: String,
        default: 'Asia/Kolkata',
        trim: true
    },
    windowStartUtc: {
        type: Date,
        required: true,
        index: true
    },
    windowEndUtc: {
        type: Date,
        required: true,
        index: true
    },
    generationTiming: {
        type: String,
        enum: ['in_advance', 'at_start_time'],
        default: 'in_advance'
    },
    questionsPerWorker: {
        type: Number,
        default: 10,
        min: 1,
        max: 50
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium'
    },
    questionFormat: {
        type: String,
        enum: ['mcq', 'upsc'],
        default: 'mcq'
    },
    upscFormat: {
        type: String,
        enum: ['A', 'B', 'C', 'D', 'E'],
        default: 'E'
    },
    timePerQuestion: {
        type: Number,
        default: 30 // seconds
    },
    totalTestDuration: {
        type: Number,
        default: 600 // seconds
    },
    showFeedback: {
        type: Boolean,
        default: true
    },
    repeatSchedule: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'],
        default: 'none'
    },
    recurrenceDay: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: 'Wednesday',
        trim: true
    },
    repeatUntilDisabled: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Scheduled', 'Generating', 'Ready', 'In Progress', 'Completed', 'Cancelled', 'Failed', 'Paused'],
        default: 'Scheduled',
        index: true
    },
    batchId: {
        type: String,
        index: true
    },
    failureReason: {
        type: String,
        default: null
    },
    failureDiagnostic: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    executionLock: {
        type: Date,
        default: null
    },
    lastExecutedAt: {
        type: Date,
        default: null
    },
    occurrences: [{
        occurrenceId: { type: String, required: true }, // e.g. `${scheduleId}_${occurrenceDate}`
        occurrenceDate: { type: String, required: true }, // YYYY-MM-DD
        batchId: { type: String, required: true },
        status: { type: String, enum: ['Scheduled', 'Ready', 'In Progress', 'Completed', 'Failed'], default: 'Scheduled' },
        windowStartUtc: { type: Date, required: true },
        windowEndUtc: { type: Date, required: true },
        generatedAt: { type: Date },
        questionsCount: { type: Number, default: 0 },
        failureReason: { type: String, default: null },
        failureDiagnostic: { type: mongoose.Schema.Types.Mixed, default: null }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Helper method to determine current schedule window state based on reference time
testScheduleSchema.methods.getWindowState = function(refTime = new Date()) {
    const now = new Date(refTime).getTime();
    const start = new Date(this.windowStartUtc).getTime();
    const end = new Date(this.windowEndUtc).getTime();

    if (this.status === 'Cancelled') return 'Cancelled';
    if (this.status === 'Paused') return 'Paused';
    if (this.status === 'Draft') return 'Draft';
    if (this.status === 'Failed') return 'Failed';

    if (now < start) {
        return this.batchId ? 'Ready' : 'Scheduled';
    } else if (now >= start && now <= end) {
        return 'In Progress';
    } else {
        return 'Completed';
    }
};

module.exports = mongoose.model('TestSchedule', testScheduleSchema);
