const mongoose = require('mongoose');

const awsAuditLogSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  action: {
    type: String,
    required: true
  },
  targetType: {
    type: String,
    required: true
  },
  targetId: {
    type: String,
    required: true
  },
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ipAddress: {
    type: String,
    default: '0.0.0.0'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AwsAuditLog', awsAuditLogSchema);
