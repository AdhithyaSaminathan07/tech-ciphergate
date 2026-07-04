const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in cookies first, then authorization header
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
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
      const user = await Worker.findById(decoded.id).select('-password').populate('department', 'name');
      if (!user) {
        return res.status(401).json({ message: 'Worker not found' });
      }
      req.user = user.toObject();
      req.user.department = user.department ? user.department.name : 'Unassigned';
      req.user.role = 'worker';
    } else {
      // Fallback for older tokens or if role is missing in token
      let user = await Admin.findById(decoded.id).select('-password');
      if (user) {
        req.user = user.toObject();
        req.user.role = 'admin';
      } else {
        user = await Worker.findById(decoded.id).select('-password').populate('department', 'name');
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
        req.user = user.toObject();
        req.user.department = user.department ? user.department.name : 'Unassigned';
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

    // Check rules acceptance for workers
    if (req.user.role === 'worker') {
      const isBypassRoute = req.originalUrl.includes('/api/rules/active') || 
                            req.originalUrl.includes('/api/rules/accept') || 
                            req.originalUrl.includes('/api/rules/status') || 
                            req.originalUrl.includes('/api/auth/me');

      if (!isBypassRoute) {
        const Settings = require('../models/Settings');
        const settings = await Settings.findOne({ subdomain: req.user.subdomain });
        
        if (settings && settings.rulesConfiguration && settings.rulesConfiguration.forceAcceptance) {
          const currentVersion = settings.rulesConfiguration.currentVersion || '1.0';
          const acceptedVersion = req.user.acceptedRulesVersion || '0';

          if (acceptedVersion !== currentVersion) {
            // Only block if there are actually active rules in the database
            const Rule = require('../models/Rule');
            const activeRulesCount = await Rule.countDocuments({ subdomain: req.user.subdomain, status: 'active' });

            if (activeRulesCount > 0) {
              // Check if grace period is active
              let gracePeriodActive = false;
              const gracePeriodDays = settings.rulesConfiguration.gracePeriodDays || 0;
              if (gracePeriodDays > 0 && settings.lastUpdated) {
                const timeDiff = Date.now() - new Date(settings.lastUpdated).getTime();
                const daysDiff = timeDiff / (1000 * 3600 * 24);
                if (daysDiff <= gracePeriodDays) {
                  gracePeriodActive = true;
                }
              }

              if (!gracePeriodActive) {
                return res.status(403).json({
                  message: 'Rules acceptance required',
                  rulesAcceptanceRequired: true,
                  currentVersion
                });
              }
            }
          }
        }
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
