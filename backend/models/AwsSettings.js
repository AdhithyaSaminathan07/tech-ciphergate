const mongoose = require('mongoose');

const awsSettingsSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  anomalyThreshold: {
    type: Number,
    default: 30
  },
  syncSchedule: {
    type: String,
    enum: ['6h', '12h', 'daily'],
    default: 'daily'
  },
  alertsEnabled: {
    type: Boolean,
    default: true
  },
  slackWebhookUrl: {
    type: String,
    default: ''
  },
  alertEmails: {
    type: String, // Comma-separated list of emails
    default: ''
  },
  billingBucket: {
    type: String,
    default: ''
  },
  glueDatabase: {
    type: String,
    default: ''
  },
  athenaWorkgroup: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AwsSettings', awsSettingsSchema);
