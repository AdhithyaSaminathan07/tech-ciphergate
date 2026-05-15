// backend/models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Please add a username'],
      unique: true,
    },
    subdomain: {  // subdomain is an unique key of a company
      type: String,
      required: [true, 'Please add a subdomain'],
      unique: true
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      default: 'admin',
    },
    photo: {
      type: String,
    },
    // New fields for password reset with OTP
    resetPasswordOtp: String,
    resetPasswordExpire: Date,
    notificationSettings: {
      pushEnabled: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: true },
      priorityFilter: { type: String, enum: ['All', 'High', 'Medium'], default: 'All' }
    },
    passwordChangedAt: Date
  },
  {
    timestamps: true,
  }
);



module.exports = mongoose.model('Admin', adminSchema);
