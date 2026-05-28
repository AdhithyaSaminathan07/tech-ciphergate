const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['To Do', 'In Progress', 'Review', 'Done'],
        required: true
    },
    changedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const ticketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a title'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    },
    assignees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    }],
    team: {
        type: String,
        trim: true
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    status: {
        type: String,
        enum: ['To Do', 'In Progress', 'Review', 'Done'],
        default: 'To Do'
    },
    statusHistory: [statusHistorySchema],
    issueType: {
        type: String,
        enum: ['Task', 'Bug', 'Story', 'Epic'],
        default: 'Task'
    },
    storyPoints: {
        type: Number,
        default: 0
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    labels: [{
        type: String,
        trim: true
    }],
    feedback: {
        type: String,
        trim: true
    },
    workerQuery: {
        type: String,
        trim: true
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    },
    subdomain: {
        type: String
    },
    checklist: [{
        text: {
            type: String,
            trim: true
        },
        completed: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date
        }
    }],
    referenceFiles: [{
        url: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        type: {
            type: String
        },
        size: {
            type: Number
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Performance & Rewards fields
    pointsAwarded: {
        type: Number,
        default: null
    },
    actualCompletionDate: {
        type: Date,
        default: null
    },
    estimatedDays: {
        type: Number,
        default: null
    },
    efficiencyRatio: {
        type: Number,
        default: null
    },
    performanceStatus: {
        type: String,
        enum: ['early', 'on_time', 'delayed', 'pending', 'no_dates'],
        default: 'pending'
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    }
}, { timestamps: true });

// Middleware to record status history
ticketSchema.pre('save', function (next) {
    if (this.isModified('status')) {
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date()
        });
    }

    // If it's a new document and status is not yet in history
    if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
        this.statusHistory = [{
            status: this.status || 'To Do',
            changedAt: new Date()
        }];
    }

    next();
});

ticketSchema.index({ subdomain: 1, isDeleted: 1 });
ticketSchema.index({ status: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
