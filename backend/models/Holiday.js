const mongoose = require('mongoose');

const holidaySchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: [true, 'Company name is missing']
  },
  holidayDesc: {
    type: String,
    required: [true, 'Please add a holiday description'],
  },
  date: {
    type: Date,
    required: [true, 'Please add start date']
  },
  reason: {
    type: String,
    required: [true, 'Please add a reason']
  },
  // New fields for employee-specific holidays
  appliesTo: {
    type: String,
    enum: ['all', 'specific'],
    default: 'all'
  },
  workers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],
  isPaid: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Holiday', holidaySchema);