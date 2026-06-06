const mongoose = require('mongoose');

const githubSyncJobSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Running', 'Completed', 'Failed'],
    default: 'Pending'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  repositoriesProcessed: {
    type: Number,
    default: 0
  },
  repositoriesFailed: {
    type: Number,
    default: 0
  },
  syncErrors: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  progress: {
    type: String,
    default: '0 / 0'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GitHubSyncJob', githubSyncJobSchema);
