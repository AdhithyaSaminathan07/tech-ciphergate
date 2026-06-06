const mongoose = require('mongoose');

const aiRecommendationOutcomeSchema = new mongoose.Schema({
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
  recommendedDeveloperId: {
    type: String
  },
  recommendedDeveloperName: {
    type: String
  },
  matchScore: {
    type: Number
  },
  assignedDeveloperId: {
    type: String
  },
  assignedDeveloperName: {
    type: String
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  daysTaken: {
    type: Number
  },
  success: {
    type: Boolean,
    default: false
  },
  recommendationAccepted: {
    type: Boolean,
    default: false
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  managerName: {
    type: String
  },
  confidenceLevel: {
    type: String,
    enum: ['High', 'Medium', 'Low', 'Unknown'],
    default: 'Unknown'
  }
}, {
  timestamps: true
});

aiRecommendationOutcomeSchema.index({ subdomain: 1, taskId: 1 });

module.exports = mongoose.model('AiRecommendationOutcome', aiRecommendationOutcomeSchema);
