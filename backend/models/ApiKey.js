const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    clientName: {
        type: String,
        required: true
    },
    subdomain: {
        type: String,
        required: true
    },
    permissions: {
        type: [String],
        enum: ['read', 'write', 'admin'],
        default: ['read']
    },
    expiry: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
