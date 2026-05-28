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

const { protect, adminOnly, workerOnly, adminOrWorker } = require('../middleware/authMiddleware');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/rules');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

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
router.put('/admin/config', protect, adminOnly, updateRulesConfig);

// CRUD routes
router.route('/')
    .post(protect, adminOnly, upload.array('attachments'), createRule);

router.route('/:id')
    .put(protect, adminOnly, upload.array('attachments'), updateRule)
    .delete(protect, adminOnly, deleteRule);

module.exports = router;
