// routes/testQuestionRoutes.js
const express = require('express');
const {
    generateAndStoreQuestions,
    getQuestionsForTest,
    getAllQuestions,
    createQuickTest,
    validateQuestionGeneration
} = require('../controllers/questionController');
const { protect, adminOrWorker, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Admin routes - protected by auth and admin role
router.post('/generate', protect, adminOnly, validateQuestionGeneration, generateAndStoreQuestions);
router.get('/', protect, adminOnly, getAllQuestions);

// Worker routes - protected by auth, both admin and worker can access
router.get('/:workerId', protect, adminOrWorker, getQuestionsForTest);

const rateLimit = require('express-rate-limit');

// Strict rate limiter for public quick-test generation (max 5 tests per IP per hour)
const quickTestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { message: 'Quick test generation limit reached for your IP address. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Public routes for quick test
router.post('/quick-test', quickTestLimiter, createQuickTest);

module.exports = router;