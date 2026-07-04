const express = require('express');
const { getLeavesByStatus } = require('../controllers/leaveController');
const router = express.Router();
const {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeaveStatus,
  markLeaveAsViewed,
  markLeavesAsViewedByAdmin,
  getLeavesByDateRange,
  getLeaveApplyStats
} = require('../controllers/leaveController');
const { protect, adminOnly, adminOrWorker, workerOnly } = require('../middleware/authMiddleware');
const { validateRequest } = require('../middleware/validateMiddleware');
const { applyLeaveSchema, updateLeaveStatusSchema } = require('../validations/leaveSchemas');
const { uploadDocument, verifyMagicBytes } = require('../utils/uploadConfig');
const upload = uploadDocument('uploads/leaves');

router.get('/apply-info/:subdomain', protect, workerOnly, getLeaveApplyStats);
router.route('/').post(protect, upload.single('document'), verifyMagicBytes, validateRequest(applyLeaveSchema), createLeave);
router.route('/:subdomain/:me').get(protect, getLeaves)

router.get('/me', protect, workerOnly, getMyLeaves);
router.get('/range', protect, adminOnly, getLeavesByDateRange);
router.get('/status', protect, adminOnly, getLeavesByStatus);
router.put('/:id/status', protect, adminOnly, validateRequest(updateLeaveStatusSchema), updateLeaveStatus);
router.put('/:id/viewed', protect, markLeaveAsViewed);
router.put('/mark-viewed-by-admin', protect, adminOnly, markLeavesAsViewedByAdmin);
module.exports = router;
