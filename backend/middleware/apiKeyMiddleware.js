const ApiKey = require('../models/ApiKey');
const asyncHandler = require('express-async-handler');

/**
 * Middleware to validate API key from request headers
 */
const validateApiKey = asyncHandler(async (req, res, next) => {
    const key = req.header('x-api-key');

    if (!key) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. API key is missing.'
        });
    }

    const apiKeyDoc = await ApiKey.findOne({ key, isActive: true });

    if (!apiKeyDoc) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or inactive API key.'
        });
    }

    // Check expiry
    if (apiKeyDoc.expiry && new Date() > apiKeyDoc.expiry) {
        return res.status(403).json({
            success: false,
            message: 'API key has expired.'
        });
    }

    // Attach client info to request
    req.apiKey = apiKeyDoc;
    
    // Logging usage (Async - don't wait for it to finish to speed up request)
    apiKeyDoc.usageCount += 1;
    apiKeyDoc.lastUsed = new Date();
    apiKeyDoc.save().catch(err => console.error('Error updating API key usage:', err));

    console.log(`[API ACCESS] Client: ${apiKeyDoc.clientName} | Endpoint: ${req.method} ${req.originalUrl}`);

    next();
});

/**
 * Middleware to check specific permissions
 * @param {string} requiredPermission - 'read', 'write', or 'admin'
 */
const authorizeApi = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(500).json({
                success: false,
                message: 'API key validation missing in route chain.'
            });
        }

        const hasPermission = req.apiKey.permissions.includes(requiredPermission) || 
                            req.apiKey.permissions.includes('admin');

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: `Insufficient permissions. Required: ${requiredPermission}`
            });
        }

        next();
    };
};

module.exports = { validateApiKey, authorizeApi };
