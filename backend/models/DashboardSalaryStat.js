const mongoose = require('mongoose');

const dashboardSalaryStatSchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    unique: true
  },
  month: {
    type: Number,
    min: 1,
    max: 12
  },
  year: {
    type: Number
  },
  status: {
    type: String,
    enum: ['Estimated', 'Generated', 'Finalized'],
    default: 'Estimated'
  },
  isCohortComplete: {
    type: Boolean,
    default: false
  },
  activeWorkerCount: {
    type: Number,
    default: 0
  },
  recordedWorkerCount: {
    type: Number,
    default: 0
  },
  totalNetPayout: {
    type: Number,
    default: 0
  },
  topTeams: {
    type: Array,
    default: []
  },
  lastCalculated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DashboardSalaryStat', dashboardSalaryStatSchema);
