const mongoose = require('mongoose');

const resourceCostSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
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
  cost: {
    type: Number,
    required: true
  },
  service: {
    type: String,
    required: true,
    index: true
  },
  region: {
    type: String,
    required: true
  },
  usageType: {
    type: String,
    required: true
  },
  usageAmount: {
    type: Number,
    default: 0
  },
  usageUnit: {
    type: String,
    default: 'Units'
  },
  tags: {
    type: Map,
    of: String,
    default: {}
  },
  containerNamespace: {
    type: String,
    default: null,
    index: true
  },
  containerPodName: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound unique index per resource line item to prevent double ingestion
resourceCostSchema.index({ subdomain: 1, awsAccountId: 1, resourceId: 1, date: 1, usageType: 1 }, { unique: true });

module.exports = mongoose.model('ResourceCost', resourceCostSchema);

