const mongoose = require('mongoose');

const subTaskCompletionSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true
    },
    subTaskId: {
        type: String, // Checklist item _id
        required: true
    },
    workerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Pending', 'Submitted', 'Approved', 'Rejected'],
        default: 'Submitted'
    },
    proofFiles: [{
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
    completedAt: {
        type: Date
    },
    subdomain: {
        type: String
    }
}, { timestamps: true });

// Ensure unique completion per ticket, subtask, and worker
subTaskCompletionSchema.index({ ticketId: 1, subTaskId: 1, workerId: 1 }, { unique: true });

module.exports = mongoose.model('SubTaskCompletion', subTaskCompletionSchema);
