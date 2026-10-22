const express = require('express');
const router = express.Router();
const {
  getTenantKpiSummary,
  getWorkerKpi,
  getDepartmentKpi
} = require('../controllers/kpiController');
const { protect, adminOrWorker } = require('../middleware/authMiddleware');

router.get('/summary', protect, adminOrWorker, getTenantKpiSummary);
router.get('/worker/:id', protect, getWorkerKpi);
router.get('/department/:name', protect, adminOrWorker, getDepartmentKpi);

module.exports = router;
