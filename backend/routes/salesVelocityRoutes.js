const express = require('express');
const router = express.Router();
const { getSalesVelocityMetrics } = require('../controllers/salesVelocityController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, adminOnly, getSalesVelocityMetrics);

module.exports = router;
