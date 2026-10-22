const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  handleCheckoutIntake,
  handleGatewayWebhook,
  handleRetryIntake,
  handleOrderIntake
} = require('../controllers/jobIntakeController');
const { validateApiKey, authorizeApi } = require('../middleware/apiKeyMiddleware');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiters
// ─────────────────────────────────────────────────────────────────────────────

// Dedicated limiter for S2S checkout: 100 requests per 15 minutes per API key / IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.header('x-api-key') || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many checkout intake requests. Please try again later.'
  },
  validate: false
});

// Dedicated limiter for gateway webhooks: 180 requests per minute per IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many webhook requests.'
  },
  validate: false
});

// Dedicated limiter for admin retry: 30 retries per 15 minutes
const retryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many retry requests. Please wait before retrying.'
  },
  validate: false
});

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/intake/checkout
 * @desc    Authenticated server-to-server online checkout job intake
 * @access  Private (Requires valid API key with 'intake:write' or 'admin' scope)
 */
router.post(
  '/checkout',
  checkoutLimiter,
  validateApiKey,
  authorizeApi('intake', 'write'),
  handleCheckoutIntake
);

/**
 * @route   POST /api/intake/webhook/:gateway
 * @desc    Public webhook endpoint for payment gateways (Razorpay, Stripe, Cashfree)
 * @access  Public (Cryptographically verified via gateway HMAC signature and raw body)
 */
router.post(
  '/webhook/:gateway',
  webhookLimiter,
  handleGatewayWebhook
);

/**
 * @route   POST /api/intake/:id/retry
 * @desc    Administrative retry of a failed or stuck intake
 * @access  Private (Requires authenticated Admin JWT token)
 */
router.post(
  '/:id/retry',
  retryLimiter,
  protect,
  adminOnly,
  handleRetryIntake
);

// Hybrid auth middleware supporting either API key or Admin/Worker JWT
const protectOrApiKey = (req, res, next) => {
  if (req.header('x-api-key')) {
    return validateApiKey(req, res, () => {
      return authorizeApi('intake', 'write')(req, res, next);
    });
  }
  return protect(req, res, next);
};

/**
 * @route   POST /api/intake/orders
 * @desc    Accepts an order into System 1 with manual payment verification
 * @access  Private (Requires valid API key or Admin/Worker JWT)
 */
router.post(
  '/orders',
  checkoutLimiter,
  protectOrApiKey,
  handleOrderIntake
);

module.exports = router;
