const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { uploadImage } = require('../utils/uploadConfig');
const { validateRequest } = require('../middleware/validateMiddleware');
const { 
  registerAdminSchema, 
  loginAdminSchema, 
  loginWorkerSchema, 
  passwordResetOtpSchema, 
  resetPasswordWithOtpSchema 
} = require('../validations/authSchemas');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3, // Limit each IP to 3 OTP requests per windowMs
  message: { message: 'Too many OTP requests from this IP, please try again after 15 minutes' }
});

const subdomainLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 subdomain checks per windowMs to prevent enumeration
  message: { available: false, message: 'Rate limit exceeded, please try again later' }
});

const upload = uploadImage('uploads/admins');
// ─────────────────────────────────────────────────────────────────────────────

const { 
  registerAdmin, 
  loginAdmin, 
  loginWorker,
  getMe,
  updateMe,
  checkAdminInitialization, 
  subdomainAvailable, 
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  refreshSession,
  logout
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Subdomain avalability
router.post('/admin/subdomain-available', subdomainLimiter, subdomainAvailable);

// Admin registration and login
router.post('/admin/register', loginLimiter, validateRequest(registerAdminSchema), registerAdmin);
router.post('/admin', loginLimiter, validateRequest(loginAdminSchema), loginAdmin);
router.post('/worker', loginLimiter, validateRequest(loginWorkerSchema), loginWorker);

// Session management
router.post('/refresh', refreshSession);
router.post('/logout', logout);

// Check admin initialization
router.get('/check-admin', checkAdminInitialization);

// Protected route to get current admin info
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.post('/profile-image', protect, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a file' });
  }
  res.json({ photo: `/uploads/admins/${req.file.filename}` });
});

// New routes for forgot password feature
router.post('/request-reset-otp', otpLimiter, validateRequest(passwordResetOtpSchema), requestPasswordResetOtp);
router.put('/reset-password-with-otp', validateRequest(resetPasswordWithOtpSchema), resetPasswordWithOtp);

module.exports = router;