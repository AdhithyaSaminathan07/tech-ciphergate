const mongoose = require('mongoose');

const exitManagementSchema = mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  relievingDate: {
    type: Date,
    required: true
  },
  lastWorkingDay: {
    type: Date,
    required: true
  },
  reason: {
    type: String
  },
  documentsGenerated: [{
    type: String,
    enum: ['Offer Letter', 'Acceptance Letter', 'Relieving Letter', 'Experience Certificate', 'Monthly Payslip', 'Intern Certificate']
  }],
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed'],
    default: 'Pending'
  },
  deliveryStatus: {
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    },
    whatsapp: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    }
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ExitManagement', exitManagementSchema);
