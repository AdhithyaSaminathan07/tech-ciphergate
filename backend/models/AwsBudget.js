const mongoose = require('mongoose');

const awsBudgetSchema = new mongoose.Schema({
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
  budgetName: {
    type: String,
    required: true
  },
  monthlyBudget: {
    type: Number,
    required: true
  },
  thresholdPercent: {
    type: Number,
    default: 80
  },
  alertEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index per account budget
awsBudgetSchema.index({ subdomain: 1, awsAccountId: 1, budgetName: 1 }, { unique: true });

module.exports = mongoose.model('AwsBudget', awsBudgetSchema);
