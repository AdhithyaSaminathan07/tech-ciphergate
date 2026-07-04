const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    getActiveRules,
    getRulesHistory,
    getMyAcceptances,
    submitAcceptance,
    getAdminDashboardStats,
    getAcceptanceMonitoringList,
    sendReminder,
    createRule,
    updateRule,
    deleteRule,
    updateRulesConfig,
    getRulesStatus
} = require('../controllers/ruleController');

const { validateRequest } = require('../middleware/validateMiddleware');
const { createRuleSchema, updateRuleSchema, updateRulesConfigSchema } = require('../validations/ruleSchemas');
const { protect, adminOnly, workerOnly, adminOrWorker } = require('../middleware/authMiddleware');

const { uploadDocument, verifyMagicBytes } = require('../utils/uploadConfig');

const upload = uploadDocument('uploads/rules');

// Worker & Admin shared endpoints
router.get('/active', protect, getActiveRules);
router.get('/history', protect, getRulesHistory);
router.get('/status', protect, getRulesStatus);

// Worker only endpoints
router.get('/my-acceptances', protect, workerOnly, getMyAcceptances);
router.post('/accept', protect, workerOnly, submitAcceptance);

// Admin only endpoints
router.get('/admin/dashboard', protect, adminOnly, getAdminDashboardStats);
router.get('/acceptances', protect, adminOnly, getAcceptanceMonitoringList);
router.post('/remind', protect, adminOnly, sendReminder);
router.put('/admin/config', protect, adminOnly, validateRequest(updateRulesConfigSchema), updateRulesConfig);

// CRUD routes
router.route('/')
    .post(protect, adminOnly, upload.array('attachments'), createRule);

router.route('/:id')
    .put(protect, adminOnly, upload.array('attachments'), updateRule)
    .delete(protect, adminOnly, deleteRule);

module.exports = router;
