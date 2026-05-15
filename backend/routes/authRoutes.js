const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Multer config for Admins: save to backend/uploads/admins/ ───────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/admins');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
                allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
  },
});
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
router.put('/me', protect, updateMe);
router.post('/profile-image', protect, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a file' });
  }
  res.json({ photo: `/uploads/admins/${req.file.filename}` });
});

// New routes for forgot password feature
router.post('/request-reset-otp', requestPasswordResetOtp);
router.put('/reset-password-with-otp', resetPasswordWithOtp);

module.exports = router;