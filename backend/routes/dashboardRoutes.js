const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/admin', protect, adminOnly, dashboardController.getAdminDashboard);
router.get('/worker', protect, dashboardController.getWorkerDashboard);

module.exports = router;
