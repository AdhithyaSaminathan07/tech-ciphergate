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

// Public routes for quick test
router.post('/quick-test', createQuickTest);

module.exports = router;