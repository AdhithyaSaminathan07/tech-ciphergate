const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['addition', 'deduction'],
    required: true
  },
  category: {
    type: String,
    enum: ['Bonus', 'Correction', 'Allowance', 'Advance Recovery', 'Reimbursement', 'Incentive', 'Fine', 'Other'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  reason: {
    type: String,
    required: true
  },
  remarks: {
    type: String
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  deletedAt: {
    type: Date
  }
}, { timestamps: true });

const auditHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
    required: true
  },
  adjustmentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  oldValue: {
    type: Object
  },
  newValue: {
    type: Object
  },
  actionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const payrollRecordSchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
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
  status: {
    type: String,
    enum: ['Draft', 'Generated', 'Reviewed', 'Approved', 'Locked', 'Paid'],
    default: 'Draft'
  },
  attendanceSalarySnapshot: {
    type: Number,
    default: null
  },
  adjustments: [adjustmentSchema],
  history: [auditHistorySchema]
}, { timestamps: true });

// Ensure one record per worker per month/year/subdomain
payrollRecordSchema.index({ workerId: 1, month: 1, year: 1, subdomain: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRecord', payrollRecordSchema);
