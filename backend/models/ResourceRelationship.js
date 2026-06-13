const mongoose = require('mongoose');

const resourceRelationshipSchema = new mongoose.Schema({
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
  parentResourceId: {
    type: String,
    required: true,
    index: true
  }, // e.g., EC2 Instance ID, EKS Cluster ARN, ALB ARN
  parentType: {
    type: String,
    required: true
  },
  childResourceId: {
    type: String,
    required: true,
    index: true
  },  // e.g., EBS Volume ID, Namespace, Target Group / EC2
  childType: {
    type: String,
    required: true
  },
  relationType: {
    type: String,
    enum: ['attaches', 'hosts', 'routes_to', 'contains'],
    required: true
  },
  lastSeenAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

resourceRelationshipSchema.index({ parentResourceId: 1, childResourceId: 1 }, { unique: true });

module.exports = mongoose.model('ResourceRelationship', resourceRelationshipSchema);
