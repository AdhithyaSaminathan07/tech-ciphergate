const rateLimit = require('express-rate-limit');

/**
 * Rate limiter middleware configured for API key usage.
 * Limits requests based on the x-api-key header.
 */
const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each API key to 100 requests per windowMs
    keyGenerator: (req) => {
        return req.header('x-api-key') || req.ip; 
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests from this API key. Please try again after 15 minutes.'
        });
    },
    standardHeaders: true, 
    legacyHeaders: false,
    validate: false, // Disable all validation checks for development
});

module.exports = apiRateLimiter;
