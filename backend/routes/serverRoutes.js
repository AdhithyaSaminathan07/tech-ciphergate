const express = require('express');
const router = express.Router();
const {
  getAccounts,
  createAccount,
  verifyAccount,
  deleteAccount,
  scanOrganization,
  initializeOrganization,
  getCostsSummary,
  getCostsTrend,
  triggerSyncJob,
  getInventory,
  getRelationships,
  getCostsAttribution,
  getTopResources,
  getTagCompliance,
  getRecommendations,
  getRecommendationById,
  approveRecommendation,
  rejectRecommendation,
  getAnomalies,
  resolveAnomaly,
  getForecasts,
  getAuditLogs,
  chatWithAgent,
  getCostLakeStatus
} = require('../controllers/serverController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Mount routes with admin protection
router.route('/accounts')
  .get(protect, adminOnly, getAccounts)
  .post(protect, adminOnly, createAccount);

router.route('/accounts/:id/verify')
  .post(protect, adminOnly, verifyAccount);

router.route('/accounts/:id')
  .delete(protect, adminOnly, deleteAccount);

router.route('/organizations/initialize')
  .post(protect, adminOnly, initializeOrganization);

router.route('/organizations/scan')
  .post(protect, adminOnly, scanOrganization);

router.route('/costs/summary')
  .get(protect, adminOnly, getCostsSummary);

router.route('/costs/trend')
  .get(protect, adminOnly, getCostsTrend);

router.route('/status')
  .get(protect, adminOnly, getCostLakeStatus);

router.route('/sync')
  .post(protect, adminOnly, triggerSyncJob);

router.route('/inventory')
  .get(protect, adminOnly, getInventory);

router.route('/relationships')
  .get(protect, adminOnly, getRelationships);

router.route('/costs/attribution')
  .get(protect, adminOnly, getCostsAttribution);

router.route('/costs/top-resources')
  .get(protect, adminOnly, getTopResources);

router.route('/costs/tag-compliance')
  .get(protect, adminOnly, getTagCompliance);

// Optimization Recommendations & Approvals routes
router.route('/recommendations')
  .get(protect, adminOnly, getRecommendations);

router.route('/recommendations/:id')
  .get(protect, adminOnly, getRecommendationById);

router.route('/recommendations/:id/approve')
  .post(protect, adminOnly, approveRecommendation);

router.route('/recommendations/:id/reject')
  .post(protect, adminOnly, rejectRecommendation);

// Phase 6: Anomaly Detection & Forecasting
router.route('/anomalies')
  .get(protect, adminOnly, getAnomalies);

router.route('/anomalies/:id/resolve')
  .post(protect, adminOnly, resolveAnomaly);

router.route('/forecasts')
  .get(protect, adminOnly, getForecasts);

// Phase 7: AI Chat
router.route('/chat')
  .post(protect, adminOnly, chatWithAgent);

// Phase 8: Audit Logs
router.route('/audit-logs')
  .get(protect, adminOnly, getAuditLogs);

module.exports = router;

