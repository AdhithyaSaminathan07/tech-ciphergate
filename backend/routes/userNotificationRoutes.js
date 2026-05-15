const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, subscribePush, updateSettings } = require('../controllers/userNotificationController');
const { protect, adminOrWorker } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, adminOrWorker, getNotifications);

router.route('/:id/read')
    .put(protect, adminOrWorker, markAsRead);

router.route('/subscribe')
    .post(protect, adminOrWorker, subscribePush);

router.route('/settings')
    .put(protect, adminOrWorker, updateSettings);

module.exports = router;
