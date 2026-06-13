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

module.exports = mongoose.model('ResourceCost', resourceCostSchema);
