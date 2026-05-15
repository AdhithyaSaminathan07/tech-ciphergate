const mongoose = require('mongoose');

const salaryProjectSchema = new mongoose.Schema({
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  projectAmount: {
    type: Number,
    required: true,
    min: 0
  },
  profitPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 60
  },
  // Array of developer IDs assigned to this project
  developers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker'
    }
  ],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  // Computed at creation / update for quick lookup
  projectProfit: {
    type: Number,
    default: 0
  },
  perDeveloperShare: {
    type: Number,
    default: 0
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

// Pre-save hook to compute profit and per-developer share
salaryProjectSchema.pre('save', function (next) {
  this.projectProfit = this.projectAmount * (this.profitPercentage / 100);
  const devCount = this.developers.length || 1;
  this.perDeveloperShare = this.projectProfit / devCount;
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SalaryProject', salaryProjectSchema);
