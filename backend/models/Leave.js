const mongoose = require('mongoose');

const leaveSchema = mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Worker'
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing']
  },
  leaveType: {
    type: String,
    // Updated enum to include the new 'Permission' leave type.
    enum: ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Permission'],
    required: [true, 'Please add leave type']
  },
  startDate: {
    type: Date,
    required: [true, 'Please add start date']
  },
  endDate: {
    type: Date,
    required: [true, 'Please add end date']
  },
  totalDays: {
    type: Number,
    required: [true, 'Please add total days']
  },
  reason: {
    type: String,
    required: [true, 'Please add a reason']
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  workerViewed: {
    type: Boolean,
    default: false
  },
  document: {
    type: String
  },
  // NEW FIELDS
  startTime: {
    type: String
  },
  endTime: {
    type: String
  },
  deductionFactor: {
    type: Number,
    default: 1
  },
  penaltyReasons: {
    attendanceRule: {
      type: Boolean,
      default: false
    },
    monthlyLimitRule: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Leave', leaveSchema);