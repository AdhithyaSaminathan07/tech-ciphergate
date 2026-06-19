const mongoose = require('mongoose');

const awsResourceSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  awsAccountId: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
    type: String,
    required: true
    // NOTE: Not globally unique — two different tenants/accounts may share a resource ID pattern.
    // Uniqueness is enforced by the compound index below.
  },
  name: {
    type: String,
    default: 'unnamed'
  },
  type: {
    type: String,
    required: true,
    index: true
  }, // ec2, rds, s3, ebs, lambda, cloudfront, eks, elbv2, eip, vpc
  region: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: 'active'
  },
  tags: {
    type: Map,
    of: String,
    default: {}
  }, // Project, Environment, Team, Owner, Application, CostCenter
  containerMetadata: {
    namespace: { type: String, default: null },
    podName: { type: String, default: null }
  },
  resourceMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastSeenAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Compound index: same resource type scoped by tenant
awsResourceSchema.index({ subdomain: 1, type: 1 });

// Compound unique index: resourceId must be unique per AWS account (not globally)
// This replaces the old `resourceId: { unique: true }` which caused cross-tenant collisions
awsResourceSchema.index({ resourceId: 1, awsAccountId: 1 }, { unique: true });

module.exports = mongoose.model('AwsResource', awsResourceSchema);
