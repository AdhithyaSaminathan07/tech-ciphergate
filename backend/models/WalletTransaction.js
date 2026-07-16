const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalaryProject',
    default: null
  },
  type: {
    type: String,
    enum: ['Credit', 'Debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  actionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, {
  timestamps: true
});

walletTransactionSchema.index({ workerId: 1, createdAt: -1 });
walletTransactionSchema.index({ subdomain: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
