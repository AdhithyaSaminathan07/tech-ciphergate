// backend/routes/commentRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getWorkerComments, 
  getMyComments, 
  getAllComments, 
  createComment, 
  addReply, 
  markAdminRepliesAsRead,
  getUnreadAdminReplies,
  markCommentAsRead 
} = require('../controllers/commentController');

const { protect, adminOnly, adminOrWorker, workerOnly } = require('../middleware/authMiddleware');

// ── STATIC routes MUST come before PARAM routes (:subdomain, :id) ──────────

// Static GET routes first
router.get('/me', protect, workerOnly, getMyComments);
router.get('/unread-admin-replies', protect, workerOnly, getUnreadAdminReplies);

// Static PUT routes first  
router.put('/mark-admin-replies-read', protect, markAdminRepliesAsRead);

// POST root
router.route('/').post(protect, createComment);

// Param routes AFTER static routes
router.route('/:subdomain').get(protect, adminOnly, getAllComments);
router.get('/worker/:workerId', protect, adminOnly, getWorkerComments);
router.post('/:id/replies', protect, addReply);
router.put('/:id/read', protect, markCommentAsRead);

module.exports = router;
