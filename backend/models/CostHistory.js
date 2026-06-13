const mongoose = require('mongoose');

const costHistorySchema = new mongoose.Schema({
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
    required: true,
    index: true
  },
  cost: {
    type: Number,
    required: true
  },
  tags: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CostHistory', costHistorySchema);
