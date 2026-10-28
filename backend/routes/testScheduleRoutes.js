// routes/testScheduleRoutes.js
const express = require('express');
const router = express.Router();
const {
    createSchedule,
    getSchedules,
    getScheduleById,
    updateSchedule,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
    triggerScheduleNow,
    retrySchedule,
    deleteSchedule,
    getWorkerScheduledTests
} = require('../controllers/testScheduleController');
const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware');

// Worker route — worker can view their own scheduled tests
router.get('/worker/:workerId', protect, adminOrWorker, getWorkerScheduledTests);

// Admin-only routes for schedule management
router.post('/', protect, adminOnly, createSchedule);
router.get('/', protect, adminOnly, getSchedules);
router.get('/:id', protect, adminOnly, getScheduleById);
router.put('/:id', protect, adminOnly, updateSchedule);
router.delete('/:id', protect, adminOnly, deleteSchedule);
router.post('/:id/pause', protect, adminOnly, pauseSchedule);
router.post('/:id/resume', protect, adminOnly, resumeSchedule);
router.post('/:id/cancel', protect, adminOnly, cancelSchedule);
router.post('/:id/generate-now', protect, adminOnly, triggerScheduleNow);
router.post('/:id/retry', protect, adminOnly, retrySchedule);

module.exports = router;

