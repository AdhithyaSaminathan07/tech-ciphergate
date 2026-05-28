const mongoose = require('mongoose');

const performancePointsSchema = new mongoose.Schema({
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    },
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        default: null
    },
    subdomain: {
        type: String,
        required: true
    },
    pointsEarned: {
        type: Number,
        required: true,
        default: 0
    },
    reason: {
        type: String,
        enum: ['task_completed', 'overdue_penalty', 'manual_bonus', 'manual_deduction', 'streak_bonus', 'early_completion_bonus'],
        default: 'task_completed'
    },
    ticketTitle: {
        type: String,
        default: ''
    },
    estimatedDays: {
        type: Number,
        default: null
    },
    actualDays: {
        type: Number,
        default: null
    },
    efficiencyRatio: {
        type: Number,
        default: null
    },
    priorityMultiplier: {
        type: Number,
        default: 1
    },
    typeMultiplier: {
        type: Number,
        default: 1
    },
    basePoints: {
        type: Number,
        default: 1
    },
    performanceStatus: {
        type: String,
        enum: ['early', 'on_time', 'delayed', 'no_dates', 'manual'],
        default: 'no_dates'
    },
    note: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

performancePointsSchema.index({ worker: 1, subdomain: 1, createdAt: -1 });
performancePointsSchema.index({ subdomain: 1, createdAt: -1 });

module.exports = mongoose.model('PerformancePoints', performancePointsSchema);
