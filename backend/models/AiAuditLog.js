const mongoose = require('mongoose');

const aiAuditLogSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  taskTitle: {
    type: String,
    required: true
  },
  recommendedPriority: {
    type: String,
    required: true
  },
  recommendedComplexity: {
    type: String,
    required: true
  },
  estimatedHours: {
    type: Number,
    required: true
  },
  recommendedDevelopers: [{
    developerId: { type: String, required: true },
    developerName: { type: String, required: true },
    matchScore: { type: Number, required: true },
    confidenceLevel: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    reasons: { type: [String], default: [] }
  }],
  actionTaken: {
    type: String,
    enum: ['Applied Specs', 'Merged Subtasks', 'Assigned Developer', 'Ignored/Dismissed', 'Consulted Only'],
    default: 'Consulted Only'
  },
  actionDetail: {
    type: String,
    default: ''
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  }
}, {
  timestamps: true
});

aiAuditLogSchema.index({ subdomain: 1, createdAt: -1 });

module.exports = mongoose.model('AiAuditLog', aiAuditLogSchema);
