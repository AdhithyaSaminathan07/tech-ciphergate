const mongoose = require('mongoose');

const ruleAcceptanceSchema = mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    },
    rulesVersion: {
        type: String,
        required: true
    },
    accepted: {
        type: Boolean,
        default: true,
        required: true
    },
    acceptedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    ipAddress: {
        type: String,
        default: 'N/A'
    },
    deviceInfo: {
        type: String,
        default: 'N/A'
    },
    subdomain: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Compound index to guarantee uniqueness of acceptance logs per employee, version, and subdomain
ruleAcceptanceSchema.index({ employeeId: 1, rulesVersion: 1, subdomain: 1 }, { unique: true });

module.exports = mongoose.model('RuleAcceptance', ruleAcceptanceSchema);
