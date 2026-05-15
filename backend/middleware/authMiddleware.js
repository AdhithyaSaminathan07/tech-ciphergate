const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Use the role from the token to find the user in the correct collection
    if (decoded.role === 'admin') {
      const user = await Admin.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Admin not found' });
      }
      req.user = user.toObject();
      req.user.role = 'admin';
    } else if (decoded.role === 'worker') {
      const user = await Worker.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Worker not found' });
      }
      req.user = user.toObject();
      req.user.role = 'worker';
    } else {
      // Fallback for older tokens or if role is missing in token
      let user = await Admin.findById(decoded.id).select('-password');
      if (user) {
        req.user = user.toObject();
        req.user.role = 'admin';
      } else {
        user = await Worker.findById(decoded.id).select('-password');
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
        req.user = user.toObject();
        req.user.role = 'worker';
      }
    }

    // Check if password was changed after token was issued
    if (req.user.passwordChangedAt) {
      const changedDate = new Date(req.user.passwordChangedAt);
      const changedTimestamp = parseInt(changedDate.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({ message: 'Password recently changed. Please log in again.' });
      }
    }

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed', error: error.message });
  }
});

const roleCheck = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
};

const workerOnly = roleCheck(['worker']);
const adminOnly = roleCheck(['admin']);
const adminOrWorker = roleCheck(['admin', 'worker']);

module.exports = { protect, adminOnly, workerOnly, adminOrWorker };
