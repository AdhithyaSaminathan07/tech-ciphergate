// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const RefreshToken = require('../models/RefreshToken');
const { sendPasswordResetEmail } = require('../config/email');
const { logAudit } = require('../services/logger');

const BCRYPT_SALT_ROUNDS = 12;

// Helper: Set secure cookies
const setCookies = (res, accessToken, refreshToken) => {
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 30 * 60 * 1000 // 30 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// Generate Tokens
const generateTokens = async (userId, role) => {
  const accessToken = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: '30m'
  });

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await RefreshToken.create({
    userId,
    userModel: role === 'admin' ? 'Admin' : 'Worker',
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  return { accessToken, refreshToken };
};

// @desc    Refresh Token
// @route   POST /api/auth/refresh
// @access  Public
const refreshSession = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    return res.status(401).json({ message: 'No refresh token' });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const storedToken = await RefreshToken.findOne({ tokenHash });

  if (!storedToken) {
    // Token reuse detected or invalid token
    // In a strict implementation, we would revoke ALL tokens for the user here
    return res.status(403).json({ message: 'Invalid refresh token' });
  }

  if (storedToken.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ _id: storedToken._id });
    return res.status(403).json({ message: 'Refresh token expired' });
  }

  // Delete old refresh token (Rotation)
  await RefreshToken.deleteOne({ _id: storedToken._id });

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = await generateTokens(storedToken.userId, storedToken.userModel === 'Admin' ? 'admin' : 'worker');
  setCookies(res, accessToken, newRefreshToken);

  res.json({ message: 'Token refreshed' });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await RefreshToken.deleteOne({ tokenHash });
  }

  res.clearCookie('token');
  res.clearCookie('refreshToken');
  res.setHeader('Clear-Site-Data', '"cookies", "storage"');

  if (req.user) {
    logAudit({ action: 'LOGOUT', actor: req.user, outcome: 'SUCCESS', ip: req.ip });
  }

  res.json({ message: 'Logged out successfully' });
});


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

  if (!username || !subdomain || !email || !password) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const adminExists = await Admin.findOne({ $or: [{ username }, { email }] });
  if (adminExists) {
    res.status(400);
    throw new Error('Admin already exists');
  }

  const subdomainExists = await Admin.findOne({ subdomain });
  if (subdomainExists) {
    res.status(400);
    throw new Error('Company name already exists');
  }

  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  const hashedPassword = await bcrypt.hash(password, salt);

  const admin = await Admin.create({
    username,
    subdomain,
    email,
    password: hashedPassword,
    role: 'admin'
  });

  if (admin) {
    const { accessToken, refreshToken } = await generateTokens(admin._id, 'admin');
    setCookies(res, accessToken, refreshToken);

    logAudit({ action: 'REGISTER_ADMIN', actor: admin, outcome: 'SUCCESS', ip: req.ip });

    res.status(201).json({
      _id: admin._id,
      username: admin.username,
      subdomain: admin.subdomain,
      email: admin.email,
      role: admin.role,
      // We don't send the token in the body anymore for security
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
  console.log('--- LOGIN ADMIN ATTEMPT ---', req.body);
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username }).select('+password');

  if (admin && (await bcrypt.compare(password, admin.password))) {
    const { accessToken, refreshToken } = await generateTokens(admin._id, 'admin');
    setCookies(res, accessToken, refreshToken);

    logAudit({ action: 'LOGIN_ADMIN', actor: admin, outcome: 'SUCCESS', ip: req.ip });

    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      photo: admin.photo,
      role: 'admin',
      subdomain: admin.subdomain,
      organizationId: admin.organizationId
    });
  } else {
    logAudit({ action: 'LOGIN_ADMIN', actor: { _id: username, role: 'unknown' }, outcome: 'FAILURE', ip: req.ip });
    res.status(401);
    throw new Error('DEBUG: Admin lookup failed for username: "' + username + '". Admin exists: ' + !!admin);
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

  const worker = await Worker.findOne({ username, subdomain }).select('+password').populate('department', 'name');

  if (!worker) {
    logAudit({ action: 'LOGIN_WORKER', actor: { _id: username, role: 'unknown' }, outcome: 'FAILURE', ip: req.ip });
    res.status(401);
    throw new Error("Worker not found, check your Company name.");
  }

  if (worker.status !== 'Active') {
    logAudit({ action: 'LOGIN_WORKER', actor: worker, outcome: 'FAILURE', ip: req.ip, details: { reason: 'Inactive account' } });
    res.status(401);
    throw new Error("Account is inactive. Please contact your administrator.");
  }

  if (worker && (await bcrypt.compare(password, worker.password))) {
    const { accessToken, refreshToken } = await generateTokens(worker._id, 'worker');
    setCookies(res, accessToken, refreshToken);

    logAudit({ action: 'LOGIN_WORKER', actor: worker, outcome: 'SUCCESS', ip: req.ip });

    res.json({
      _id: worker._id,
      username: worker.username,
      name: worker.name,
      email: worker.email,
      subdomain: worker.subdomain,
      photo: worker.photo,
      department: worker.department ? worker.department.name : 'Unassigned',
      role: 'worker',
      rfid: worker.rfid
      // Sensitive fields like salary are not returned directly in login
    });
  } else {
    logAudit({ action: 'LOGIN_WORKER', actor: worker, outcome: 'FAILURE', ip: req.ip, details: { reason: 'Invalid password' } });
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
    // Return the same success message to prevent information disclosure
    return res.status(200).json({ message: 'If the company name exists, a password reset OTP has been sent.' });
  }

  const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
  admin.resetPasswordOtp = resetOtp;
  admin.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await admin.save();

  try {
    await sendPasswordResetEmail(admin.email, resetOtp);
    res.status(200).json({ message: 'If the company name exists, a password reset OTP has been sent.' });
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

  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  admin.password = await bcrypt.hash(password, salt);
  admin.passwordChangedAt = Date.now() - 1000;

  admin.resetPasswordOtp = undefined;
  admin.resetPasswordExpire = undefined;
  await admin.save();

  logAudit({ action: 'RESET_PASSWORD', actor: admin, outcome: 'SUCCESS', ip: req.ip });

  res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
});

// @desc    Update current admin
// @route   PUT /api/auth/me
// @access  Private
const updateMe = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user._id);

  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }

  if (req.body.email) admin.email = req.body.email;
  if (req.body.photo) admin.photo = req.body.photo;

  if (req.body.password) {
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    admin.password = await bcrypt.hash(req.body.password, salt);
    admin.passwordChangedAt = Date.now() - 1000;
  }

  const updatedAdmin = await admin.save();
  logAudit({ action: 'UPDATE_PROFILE', actor: admin, outcome: 'SUCCESS', ip: req.ip });

  res.json({
    _id: updatedAdmin._id,
    username: updatedAdmin.username,
    email: updatedAdmin.email,
    photo: updatedAdmin.photo,
    role: 'admin',
    subdomain: updatedAdmin.subdomain
  });
});

module.exports = {
  subdomainAvailable,
  registerAdmin,
  loginAdmin,
  loginWorker,
  getMe,
  updateMe,
  checkAdminInitialization,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  refreshSession,
  logout
};