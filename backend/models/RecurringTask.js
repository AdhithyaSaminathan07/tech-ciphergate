const mongoose = require('mongoose');

/**
 * RecurringTask Model
 * Stores recurrence rules separately from tickets.
 * The scheduler reads this collection and spawns fresh Ticket documents
 * on each cycle — existing tickets are NEVER modified.
 *
 * Indexed for high-throughput queries even with 1000+ employees / rules:
 *   - { subdomain, status, nextRunAt }  → scheduler batch query
 *   - { subdomain, status }             → admin list query
 */

const checklistItemSchema = new mongoose.Schema({
    text: { type: String, trim: true },
    completed: { type: Boolean, default: false }
}, { _id: false });

const recurringTaskSchema = new mongoose.Schema({
    // ── Task Template Fields ──────────────────────────────────────────────────
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [300, 'Title cannot exceed 300 characters']
    },
    description: {
        type: String,
        trim: true
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    issueType: {
        type: String,
        enum: ['Task', 'Bug', 'Story', 'Epic'],
        default: 'Task'
    },
    checklist: [checklistItemSchema],
    assignees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    }],
    team: {
        type: String,
        trim: true,
        default: ''
    },
    labels: [{ type: String, trim: true }],

    // ── Ownership ─────────────────────────────────────────────────────────────
    subdomain: {
        type: String,
        required: [true, 'Subdomain is required'],
        trim: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },

    // ── Recurrence Rule ───────────────────────────────────────────────────────
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'custom'],
        required: [true, 'Frequency is required'],
        default: 'weekly'
    },
    /**
     * interval:
     *  daily   → spawn every `interval` days (default 1)
     *  weekly  → spawn every `interval` weeks on `daysOfWeek`
     *  monthly → spawn every `interval` months on `dayOfMonth`
     *  custom  → spawn every `interval` days (generic)
     */
    interval: {
        type: Number,
        default: 1,
        min: [1, 'Interval must be at least 1']
    },
    /**
     * daysOfWeek: used for frequency=weekly|custom
     * 0 = Sunday … 6 = Saturday
     */
    daysOfWeek: {
        type: [Number],
        default: [],
        validate: {
            validator: (arr) => arr.every(d => d >= 0 && d <= 6),
            message: 'daysOfWeek values must be 0-6'
        }
    },
    /**
     * dayOfMonth: used for frequency=monthly (1-31)
     */
    dayOfMonth: {
        type: Number,
        min: 1,
        max: 31,
        default: null
    },

    // Task duration to auto-set endDate on spawned tickets (in days)
    taskDurationDays: {
        type: Number,
        default: null,
        min: 0
    },

    // ── Date Window ───────────────────────────────────────────────────────────
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        default: null  // null = no end date
    },

    // ── Scheduler State ───────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['active', 'paused', 'completed', 'cancelled'],
        default: 'active'
    },
    lastRunAt: {
        type: Date,
        default: null
    },
    nextRunAt: {
        type: Date,
        index: true  // critical for scheduler query performance
    },

    // ── History ───────────────────────────────────────────────────────────────
    spawnedTickets: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket'
    }],
    totalSpawned: {
        type: Number,
        default: 0
    },

    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    }

}, { timestamps: true });

// ── Compound Indexes for Scalability ──────────────────────────────────────────
// Scheduler: find all active rules due for execution
recurringTaskSchema.index({ subdomain: 1, status: 1, nextRunAt: 1 });
// Admin list: filter by subdomain + status
recurringTaskSchema.index({ subdomain: 1, status: 1, createdAt: -1 });
// Soft-delete filter
recurringTaskSchema.index({ isDeleted: 1, status: 1 });

module.exports = mongoose.model('RecurringTask', recurringTaskSchema);
