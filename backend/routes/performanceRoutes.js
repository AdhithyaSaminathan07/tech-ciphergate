const express = require('express');
const router = express.Router();
const {
    getMyPerformance,
    getMyPointHistory,
    getLeaderboard,
    getAdminPerformanceOverview,
    getAdminEmployeeAnalytics,
    manualBonus,
    getPerformanceSettings,
    updatePerformanceSettings
} = require('../controllers/performanceController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Worker routes
router.get('/me', protect, getMyPerformance);
router.get('/history', protect, getMyPointHistory);
router.get('/leaderboard', protect, getLeaderboard);

// Admin routes
router.get('/admin/overview', protect, adminOnly, getAdminPerformanceOverview);
router.get('/admin/analytics', protect, adminOnly, getAdminEmployeeAnalytics);
router.post('/admin/bonus', protect, adminOnly, manualBonus);

// Settings routes
router.get('/settings', protect, adminOnly, getPerformanceSettings);
router.put('/settings', protect, adminOnly, updatePerformanceSettings);

module.exports = router;
