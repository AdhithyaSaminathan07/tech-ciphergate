const mongoose = require('mongoose');

const awsRecommendationSchema = new mongoose.Schema({
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
    index: true
  },
  resourceType: {
    type: String,
    required: true
  },
  resourceName: {
    type: String
  },
  recommendationType: {
    type: String,
    enum: ['rightsizing', 'idle_resource', 'cleanup', 'savings_plan'],
    required: true
  },
  currentDetails: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  recommendedDetails: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  currentCost: {
    type: Number,
    required: true
  },
  recommendedCost: {
    type: Number,
    required: true
  },
  monthlySavings: {
    type: Number,
    required: true
  },
  annualSavings: {
    type: Number,
    required: true
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  implementationEffort: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },
  impactAnalysis: {
    affectedResources: {
      type: [String],
      default: []
    },
    downtimeRisk: {
      type: String,
      enum: ['None', 'Low', 'Medium', 'High'],
      default: 'None'
    },
    businessImpactDescription: {
      type: String,
      default: ''
    }
  },
  status: {
    type: String,
    enum: ['Active', 'Approved', 'Rejected', 'Executing', 'Applied', 'Failed'],
    default: 'Active',
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AwsRecommendation', awsRecommendationSchema);
