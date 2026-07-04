const mongoose = require('mongoose');

const dashboardSalaryStatSchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    unique: true
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
