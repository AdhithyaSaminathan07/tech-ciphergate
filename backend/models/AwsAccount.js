const mongoose = require('mongoose');

const awsAccountSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  awsAccountId: {
    type: String,
    required: true,
    match: /^\d{12}$/
  },
  name: {
    type: String,
    required: true
  },
  orgId: {
    type: String,
    default: null
  },
  iamRoleArn: {
    type: String,
    default: null
  },
  externalId: {
    type: String,
    required: true,
    unique: true  // ExternalID is globally unique (UUID)
  },
  connectionStatus: {
    type: String,
    enum: ['Connected', 'Failed', 'Pending'],
    default: 'Pending'
  },
  regions: {
    type: [String],
    default: ['us-east-1']
  },
  lastSyncedAt: {
    type: Date,
    default: null
  },
  syncStatus: {
    type: String,
    enum: ['Idle', 'Syncing', 'Error'],
    default: 'Idle'
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound unique index: same awsAccountId can exist in different subdomains (tenants)
// but cannot be duplicated within the same tenant
awsAccountSchema.index({ subdomain: 1, awsAccountId: 1 }, { unique: true });

module.exports = mongoose.model('AwsAccount', awsAccountSchema);

