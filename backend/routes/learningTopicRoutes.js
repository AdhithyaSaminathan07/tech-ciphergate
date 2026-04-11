// routes/learningTopicRoutes.js
const express = require('express');
const {
    submitTopic,
    getWeeklyTopicsForWorker,
    checkTopicForToday,
    getAllTopics,
    assignTopicsToWorkers
} = require('../controllers/learningTopicController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Worker routes
router.post('/', protect, submitTopic);
router.post('/check', protect, checkTopicForToday);

// Admin routes
router.get('/', protect, adminOnly, getAllTopics);
router.get('/weekly/:workerId', protect, adminOnly, getWeeklyTopicsForWorker);
router.post('/assign', protect, adminOnly, assignTopicsToWorkers);

module.exports = router;