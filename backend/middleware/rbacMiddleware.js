const asyncHandler = require('express-async-handler');

// This middleware enforces Role-Based Access Control and Tenant Isolation
const enforceRBAC = ({ allowedRoles = [], checkTenant = true }) => {
  return asyncHandler(async (req, res, next) => {
    // 1. Ensure user is authenticated (should be run after authMiddleware protect)
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // 2. Role Verification
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied: insufficient permissions' });
    }

    // 3. Tenant Isolation Verification
    // Check if route has a subdomain parameter and verify it matches the user's subdomain
    if (checkTenant && req.params.subdomain) {
      if (req.user.subdomain !== req.params.subdomain) {
        return res.status(403).json({ message: 'Access denied: cross-tenant access is strictly prohibited' });
      }
    }

    next();
  });
};

module.exports = { enforceRBAC };
