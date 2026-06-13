const mongoose = require('mongoose');

const awsAnomalySchema = new mongoose.Schema({
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
  date: {
    type: Date,
    required: true,
    index: true
  },
  service: {
    type: String,
    required: true
  },
  resourceId: {
    type: String,
    default: null
  },
  detectedCost: {
    type: Number,
    required: true
  },
  baselineCost: {
    type: Number,
    required: true
  },
  increasePercentage: {
    type: Number,
    required: true
  },
  severity: {
    type: String,
    enum: ['Critical', 'High', 'Medium', 'Low'],
    default: 'Low'
  },
  status: {
    type: String,
    enum: ['Active', 'Investigating', 'Resolved', 'False Positive'],
    default: 'Active'
  },
  reason: {
    type: String,
    default: null
  },
  cloudWatchCorrelation: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AwsAnomaly', awsAnomalySchema);
