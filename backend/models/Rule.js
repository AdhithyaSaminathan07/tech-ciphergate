const mongoose = require('mongoose');

const ruleSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    version: {
        type: String,
        required: true,
        default: '1.0'
    },
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active'
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    effectiveDate: {
        type: Date,
        default: Date.now
    },
    attachments: {
        type: [String],
        default: []
    },
    changeLog: {
        type: String,
        default: ''
    },
    subdomain: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Rule', ruleSchema);
