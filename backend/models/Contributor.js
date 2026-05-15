const mongoose = require('mongoose');

// File schema for commit files
const fileSchema = new mongoose.Schema({
    filename: String,
    status: String,
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changes: { type: Number, default: 0 },
    blob_url: String,
    raw_url: String,
    contents_url: String,
    patch: String
}, { _id: false });
// Branch contribution schema
const branchContributionSchema = new mongoose.Schema({
    repository: { type: String, required: true },
    branch: { type: String, required: true },
    contributions: { type: Number, default: 0 },
    repo_url: String,
    branch_url: String,
    repo_private: { type: Boolean, default: false },
    repo_language: String,
    repo_stars: { type: Number, default: 0 },
    repo_forks: { type: Number, default: 0 }
}, { _id: false });
// User details schema
const userDetailsSchema = new mongoose.Schema({
    name: String,
    email: String,
    company: String,
    location: String,
    bio: String,
    public_repos: { type: Number, default: 0 },
    followers: { type: Number, default: 0 }
}, { _id: false });
// Activity schema
const activitySchema = new mongoose.Schema({
    type: { type: String, enum: ['commit', 'pr', 'merge', 'push', 'pull'] },
    repo: String,
    repo_url: String,
    date: Date,
    message: String,
    branch: String,
    branch_url: String,
    repo_private: { type: Boolean, default: false },
    sha: String,
    number: Number,
    files: [fileSchema]
     // Fixed: Array of file objects instead of strings
}, { _id: false });

// Updated contributor schema with more flexible validation
const contributorSchema = new mongoose.Schema({
    login: { type: String, required: true },
    name: String,
    avatar_url: String,
    github_id: { type: String, required: false }, 
    // Make optional temporarily
    html_url: String,
    // Score and statistics
    score: { type: Number, default: 0 },
    valid_commits: { type: Number, default: 0 },
    spam_commits: { type: Number, default: 0 },
    valid_prs: { type: Number, default: 0 },
    spam_prs: { type: Number, default: 0 },
    commits: { type: Number, default: 0 },
    prs: { type: Number, default: 0 },
    merges: { type: Number, default: 0 },
    pushes: { type: Number, default: 0 },
    pulls: { type: Number, default: 0 },
    // Counts
    repo_count: { type: Number, default: 0 },

    branch_count: { type: Number, default: 0 },

    total_contributions: { type: Number, default: 0 },

    // Detailed information

    user_details: userDetailsSchema,

    branch_contributions: [branchContributionSchema],

    recent_activities: [activitySchema],

    // Metadata

    repositories: [String],

    last_updated: { type: Date, default: Date.now },

    github_username: String

}, {

    timestamps: true
});

// Create compound index to allow multiple entries per github_username

contributorSchema.index({ login: 1, github_username: 1 }, { unique: true });

contributorSchema.index({ score: -1 });

contributorSchema.index({ last_updated: -1 });

module.exports = mongoose.model('Contributor', contributorSchema);
