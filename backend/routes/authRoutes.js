// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { 
  registerAdmin, 
  loginAdmin, 
  loginWorker,
  getMe,
  checkAdminInitialization, 
  subdomainAvailable, 
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Subdomain avalability
router.post('/admin/subdomain-available', subdomainAvailable);

// Admin registration and login
router.post('/admin/register', registerAdmin);
router.post('/admin', loginAdmin);
router.post('/worker', loginWorker);

// Check admin initialization
router.get('/check-admin', checkAdminInitialization);

// Protected route to get current admin info
router.get('/me', protect, getMe);

// New routes for forgot password feature
router.post('/request-reset-otp', requestPasswordResetOtp);
router.put('/reset-password-with-otp', resetPasswordWithOtp);

module.exports = router;