const mongoose = require('mongoose');

const githubCacheSchema = new mongoose.Schema({
    subdomain: {
        type: String,
        required: true,
        index: true
    },
    cache_key: { 
        type: String, 
        required: true,
        index: true
    },
    username: { 
        type: String, 
        required: true,
        index: true
    },
    data_type: { 
        type: String, 
        required: true,
        enum: [
            'repositories', 
            'commits', 
            'pull_requests', 
            'contributors', 
            'dashboard_data', 
            'leaderboard_data',
            'repo_details',
            'user_details',
            'dashboard_commits',
            'repo_intelligence',
            'ai_request_cache'
        ]
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    expires_at: {
        type: Date,
        required: true
    },
    last_fetched: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// TTL index for automatic cleanup of expired entries
githubCacheSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for efficient and isolated querying
githubCacheSchema.index({ subdomain: 1, cache_key: 1 }, { unique: true });
githubCacheSchema.index({ subdomain: 1, data_type: 1 });
githubCacheSchema.index({ username: 1, data_type: 1 });

module.exports = mongoose.model('GitHubCache', githubCacheSchema);