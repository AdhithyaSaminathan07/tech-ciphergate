const mongoose = require('mongoose');

const instagramAccountSchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: [true, 'Instagram username is required'],
  },
  password: {
    type: String,
    required: [true, 'Instagram password is required'],
  },
  isActive: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
});

// Ensure a user can only add an account once per subdomain
instagramAccountSchema.index({ subdomain: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('InstagramAccount', instagramAccountSchema);
