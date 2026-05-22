const mongoose = require('mongoose');

const projectPaymentLedgerSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalaryProject',
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  // What was actually paid at freeze time
  paidAmount: {
    type: Number,
    required: true,
    default: 0
  },
  paidPerDayValue: {
    type: Number,
    required: true,
    default: 0
  },
  // Number of working days the employee worked on this project in this month
  paidWorkingDays: {
    type: Number,
    required: true,
    default: 0
  },
  // Snapshot of total project working days at payment time
  projectTotalWorkingDaysAtPayment: {
    type: Number,
    default: 0
  },
  // Per developer share at payment time
  perDeveloperShareAtPayment: {
    type: Number,
    default: 0
  },
  // These are dynamically recalculated — stored for quick reference
  currentPerDayValue: {
    type: Number,
    default: 0
  },
  currentEntitlement: {
    type: Number,
    default: 0
  },
  adjustmentAmount: {
    type: Number,
    default: 0
  },
  // Whether this entry has been frozen (paid)
  isSettled: {
    type: Boolean,
    default: false
  },
  settledAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index — one entry per employee per project per month
projectPaymentLedgerSchema.index(
  { employeeId: 1, projectId: 1, month: 1, year: 1 },
  { unique: true }
);

projectPaymentLedgerSchema.index({ subdomain: 1, employeeId: 1 });

module.exports = mongoose.model('ProjectPaymentLedger', projectPaymentLedgerSchema);
