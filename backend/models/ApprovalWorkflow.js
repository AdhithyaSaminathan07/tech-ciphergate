const mongoose = require('mongoose');

const approvalWorkflowSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  recommendationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AwsRecommendation',
    required: true
  },
  approvedBy: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Pending', 'Review', 'Approved', 'Implemented', 'Verified'],
    default: 'Pending'
  },
  notes: {
    type: String,
    default: ''
  },
  terraformPlan: {
    type: String,
    default: ''
  },
  cloudFormationTemplate: {
    type: String,
    default: ''
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  actionedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ApprovalWorkflow', approvalWorkflowSchema);
