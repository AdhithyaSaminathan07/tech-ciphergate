// backend/middleware/authMiddleware.js
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

    // decoded.role is embedded in the JWT from generateToken(id, role)
    // Use it directly instead of re-assigning on Mongoose doc
    
    let user = null;

    if (decoded.role === 'admin') {
      user = await Admin.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Admin not found' });
      }
    } else {
      user = await Worker.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Worker not found' });
      }
    }

    // Convert to plain object so role assignment is safe
    req.user = user.toObject();
    req.user.role = decoded.role; // Use role from JWT token (reliable)

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ 
      message: 'Not authorized, token failed', 
      error: error.message 
    });
  }
});

const roleCheck = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    console.log(`[roleCheck] user role: ${req.user.role}, required: ${roles}`);

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied',
        userRole: req.user.role,
        requiredRoles: roles
      });
    }

    next();
  };
};

const workerOnly    = roleCheck(['worker']);
const adminOnly     = roleCheck(['admin']);
const adminOrWorker = roleCheck(['admin', 'worker']);

module.exports = { protect, adminOnly, workerOnly, adminOrWorker };
