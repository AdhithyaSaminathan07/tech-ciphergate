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

const reviewCycleSchema = new mongoose.Schema({
    submissionTime: {
        type: Date,
        required: true
    },
    decision: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    decisionTime: {
        type: Date
    },
    reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
    feedback: {
        type: String,
        trim: true
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
    reviewCycles: [reviewCycleSchema],
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

// Middleware to record status history and review cycles
ticketSchema.pre('save', function (next) {
    if (this.isModified('status')) {
        const prevStatus = this.statusHistory && this.statusHistory.length > 0
            ? this.statusHistory[this.statusHistory.length - 1].status
            : null;

        this.statusHistory.push({
            status: this.status,
            changedAt: new Date()
        });

        // Review cycles transitions
        if (this.status === 'Review' && prevStatus !== 'Review') {
            this.reviewCycles.push({
                submissionTime: new Date(),
                decision: 'Pending',
                decisionTime: null,
                reviewer: null,
                feedback: ''
            });
        } else if (prevStatus === 'Review' && this.status === 'Done') {
            const lastCycle = this.reviewCycles[this.reviewCycles.length - 1];
            if (lastCycle && lastCycle.decision === 'Pending') {
                lastCycle.decision = 'Approved';
                lastCycle.decisionTime = new Date();
                lastCycle.reviewer = this._reviewerId || null;
                lastCycle.feedback = this.feedback || '';
                // Set actualCompletionDate to the approved submission time
                this.actualCompletionDate = lastCycle.submissionTime;
            }
        } else if (prevStatus === 'Review' && (this.status === 'In Progress' || this.status === 'To Do')) {
            const lastCycle = this.reviewCycles[this.reviewCycles.length - 1];
            if (lastCycle && lastCycle.decision === 'Pending') {
                lastCycle.decision = 'Rejected';
                lastCycle.decisionTime = new Date();
                lastCycle.reviewer = this._reviewerId || null;
                lastCycle.feedback = this.feedback || '';
            }
        }
    }

    // If it's a new document and status is not yet in history
    if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
        this.statusHistory = [{
            status: this.status || 'To Do',
            changedAt: new Date()
        }];
        if (this.status === 'Review') {
            this.reviewCycles = [{
                submissionTime: new Date(),
                decision: 'Pending',
                decisionTime: null,
                reviewer: null,
                feedback: ''
            }];
        }
    }

    next();
});

ticketSchema.index({ subdomain: 1, isDeleted: 1 });
ticketSchema.index({ status: 1 });

ticketSchema.post('save', async function(doc) {
  try {
    const { syncBrainItem, deleteBrainItem } = require('../services/secondBrainService');
    if (doc.status === 'Done' && !doc.isDeleted) {
      await syncBrainItem('ticket', doc, doc.subdomain);
    } else {
      await deleteBrainItem('ticket', doc._id, doc.subdomain);
    }
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to sync ticket on save:', err.message);
  }
});

ticketSchema.post('remove', async function(doc) {
  try {
    const { deleteBrainItem } = require('../services/secondBrainService');
    await deleteBrainItem('ticket', doc._id, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to delete ticket on remove:', err.message);
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
