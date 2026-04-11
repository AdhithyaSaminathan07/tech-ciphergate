// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');

const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../config/email');

// Generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Check subdomain availability
// @route   POST /api/auth/admin/subdomain-available
// @access  Public
const subdomainAvailable = asyncHandler(async (req, res) => {
  const { subdomain } = req.body;

  // Validate input
  if (!subdomain) {
    res.status(400).json({ available: false, message: 'Subdomain must be minium 5 characters' });
    throw new Error('Company name is required, login again');
  }

  // Check subdomain length and allowed characters
  const isValidSubdomain = /^[a-zA-Z-]{5,}$/.test(subdomain) &&
    !subdomain.startsWith('-') &&
    !subdomain.endsWith('-');
  if (!isValidSubdomain) {
    res.status(400);
    throw new Error('Company name must be at least 5 characters long and can only contain letters, numbers, and hyphens (-), but cannot start or end with a hyphen');
  }

  // Check if subdomain exists
  const subdomainExists = await Admin.findOne({ subdomain });

  if (subdomainExists) {
    res.json({ available: false, message: 'Company name is already taken' });
  } else {
    res.json({ available: true, message: 'Company name is available' });
  }
});

// @desc    Register a new admin
// @route   POST /api/auth/admin/register
// @access  Public
const registerAdmin = asyncHandler(async (req, res) => {
  const { username, subdomain, email, password } = req.body;

  // Validate input
  if (!username || !subdomain || !email || !password) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  // Check if admin already exists
  const adminExists = await Admin.findOne({ $or: [{ username }, { email }] });

  if (adminExists) {
    res.status(400);
    throw new Error('Admin already exists');
  }

  // check if subdomain exixts
  const subdomainExists = await Admin.findOne({ subdomain });

  if (subdomainExists) {
    res.status(400);
    throw new Error('Company name already exists');
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create admin
  const admin = await Admin.create({
    username,
    subdomain,
    email,
    password: hashedPassword,
    role: 'admin'
  });

  if (admin) {
    res.status(201).json({
      _id: admin._id,
      username: admin.username,
      subdomain: admin.subdomain,
      email: admin.email,
      role: admin.role,
      token: generateToken(admin._id, 'admin')
    });
  } else {
    res.status(400);
    throw new Error('Invalid admin data');
  }
});

// @desc    Login admin
// @route   POST /api/auth/admin
// @access  Public
const loginAdmin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // Find admin and include password field
  const admin = await Admin.findOne({ username }).select('+password');

  if (admin && (await bcrypt.compare(password, admin.password))) {
    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      role: 'admin',
      subdomain: admin.subdomain,
      organizationId: admin.organizationId,
      token: generateToken(admin._id, 'admin')
    });
  } else {
    res.status(401);
    throw new Error('Invalid credentials');
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  res.json(req.user);
});

// @desc    Check admin initialization
// @route   GET /api/auth/check-admin
// @access  Public
const checkAdminInitialization = asyncHandler(async (req, res) => {
  const adminCount = await Admin.countDocuments();

  if (adminCount === 0) {
    res.json({
      needInitialAdmin: true,
      message: 'No admin exists. First admin can be created.'
    });
  } else {
    res.json({
      needInitialAdmin: false,
      message: 'Admins already exist.'
    });
  }
});


// @desc    Login worker
// @route   POST /api/auth/worker
// @access  Public
const loginWorker = asyncHandler(async (req, res) => {
  const { username, password, subdomain } = req.body;

  const worker = await Worker.findOne({ username, subdomain }).populate('department', 'name');

  if (!worker) {
    res.status(401);
    throw new Error("Worker not found, check your Company name.");
  }

  if (worker && (await bcrypt.compare(password, worker.password))) {
    res.json({
      _id: worker._id,
      username: worker.username,
      name: worker.name,
      subdomain: worker.subdomain,
      salary: worker.salary,
      finalSalary: worker.finalSalary,
      photo: worker.photo,
      rfid: worker.rfid ? worker.rfid : 'unassigned',
      department: worker.department ? worker.department.name : 'Unassigned',
      role: 'worker',
      token: generateToken(worker._id, 'worker')
    });
  } else {
    res.status(401);
    throw new Error('Invalid credentials');
  }
});

// @desc    Request password reset OTP for Admin
// @route   POST /api/auth/request-reset-otp
// @access  Public
const requestPasswordResetOtp = asyncHandler(async (req, res) => {
  const { subdomain } = req.body;

  if (!subdomain) {
    res.status(400);
    throw new Error('Please enter a registered company name.');
  }

  const admin = await Admin.findOne({ subdomain });

  if (!admin) {
    res.status(404);
    throw new Error('Admin for that company name does not exist.');
  }

  // Generate 6-digit numeric OTP and set expiration (10 minutes)
  const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
  admin.resetPasswordOtp = resetOtp;
  admin.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await admin.save();

  try {
    await sendPasswordResetEmail(admin.email, resetOtp);
    res.status(200).json({ message: 'A password reset OTP has been sent to your registered email address.' });
  } catch (err) {
    admin.resetPasswordOtp = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();
    res.status(500);
    throw new Error('Email could not be sent. Please try again later.');
  }
});

// @desc    Reset password with OTP for Admin
// @route   PUT /api/auth/reset-password-with-otp
// @access  Public
const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const { subdomain, otp, password } = req.body;

  if (!subdomain || !otp || !password) {
    res.status(400);
    throw new Error('All fields are required.');
  }

  const admin = await Admin.findOne({
    subdomain,
    resetPasswordOtp: otp,
    resetPasswordExpire: { $gt: Date.now() }
  }).select('+password');

  if (!admin) {
    res.status(400);
    throw new Error('Invalid or expired OTP.');
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  admin.password = await bcrypt.hash(password, salt);

  // Clear OTP fields
  admin.resetPasswordOtp = undefined;
  admin.resetPasswordExpire = undefined;
  await admin.save();

  res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
});

module.exports = {
  subdomainAvailable,
  registerAdmin,
  loginAdmin,
  loginWorker,
  getMe,
  checkAdminInitialization,
  requestPasswordResetOtp,
  resetPasswordWithOtp
};