const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    },
    subdomain: {
        type: String,
        required: true
    },
    badgeType: {
        type: String,
        enum: ['speed_demon', 'elite_performer', 'consistency_king', 'reliable_performer', 'bug_hunter'],
        required: true
    },
    badgeName: {
        type: String,
        required: true
    },
    badgeEmoji: {
        type: String,
        required: true
    },
    badgeDescription: {
        type: String,
        required: true
    },
    earnedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate badges of the same type per worker
badgeSchema.index({ worker: 1, subdomain: 1, badgeType: 1 }, { unique: true });

module.exports = mongoose.model('Badge', badgeSchema);
