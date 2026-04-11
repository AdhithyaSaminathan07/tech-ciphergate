// models/GowhatsConfig.js
const mongoose = require('mongoose');

const gowhatsConfigSchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    unique: true,
  },
  apiKey: {
    type: String,
    required: [true, 'GoWhats API Key is required'],
  },
  phoneNumberId: {
    type: String,
    required: [true, 'Phone Number ID is required'],
  },
  businessAccountId: {
    type: String,
    required: [true, 'Business Account ID is required'],
  },
  adminWhatsappNumbers: [{
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{10,15}$/.test(v); // Validates phone number format
      },
      message: 'Please provide a valid phone number'
    }
  }],
}, {
  timestamps: true,
});

// Ensure at least one admin number and maximum 5
gowhatsConfigSchema.pre('save', function(next) {
  if (this.adminWhatsappNumbers.length === 0) {
    next(new Error('At least one admin WhatsApp number is required'));
  } else if (this.adminWhatsappNumbers.length > 5) {
    next(new Error('Maximum 5 admin WhatsApp numbers allowed'));
  } else {
    next();
  }
});

module.exports = mongoose.model('GowhatsConfig', gowhatsConfigSchema);