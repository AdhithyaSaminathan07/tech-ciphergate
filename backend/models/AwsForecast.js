const mongoose = require('mongoose');

const awsForecastSchema = new mongoose.Schema({
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
  forecastType: {
    type: String,
    enum: ['month_end', 'quarterly', 'annual'],
    required: true
  },
  targetDate: {
    type: Date,
    required: true
  },
  predictedSpend: {
    type: Number,
    required: true
  },
  baselineSpend: {
    type: Number,
    required: true
  },
  confidenceLow: {
    type: Number,
    required: true
  },
  confidenceHigh: {
    type: Number,
    required: true
  },
  trendAnalysis: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AwsForecast', awsForecastSchema);
