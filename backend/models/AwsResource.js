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
    required: true,
    unique: true
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

awsResourceSchema.index({ subdomain: 1, type: 1 });

module.exports = mongoose.model('AwsResource', awsResourceSchema);
