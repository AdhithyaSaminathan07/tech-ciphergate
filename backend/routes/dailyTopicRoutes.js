const express = require('express');
const router = express.Router();
const {
  addDailyTopic,
  getWeeklyTopics,
  getWeeklyTopicsAdmin,
  getWorkerTopics,
  deleteDailyTopic
} = require('../controllers/dailyTopicController');
const { protect, adminOrWorker, adminOnly } = require('../middleware/authMiddleware');

// @desc    Add a daily topic for a worker
// @route   POST /api/topics
// @access  Private/Worker and Admin
router.post('/', protect, adminOrWorker, addDailyTopic);

// @desc    Get weekly topics for a worker (for admin use in question generation)
// @route   GET /api/topics/weekly/:workerId
// @access  Private/Admin and Worker (own topics only)
router.get('/weekly/:workerId', protect, adminOrWorker, getWeeklyTopics);

// @desc    Get weekly topics for any worker (admin-only for question generation)
// @route   GET /api/topics/admin/weekly/:workerId
// @access  Private/Admin Only
router.get('/admin/weekly/:workerId', protect, adminOnly, getWeeklyTopicsAdmin);

// @desc    Get all topics for a worker (for worker's own viewing/editing)
// @route   GET /api/topics/worker/:workerId
// @access  Private/Worker (own topics only) or Admin
router.get('/worker/:workerId', protect, adminOrWorker, getWorkerTopics);

// @desc    Delete a daily topic
// @route   DELETE /api/topics/:topicId
// @access  Private/Worker (own topics only) or Admin
router.delete('/:topicId', protect, adminOrWorker, deleteDailyTopic);

module.exports = router;