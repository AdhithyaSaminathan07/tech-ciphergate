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

router.route('/').post(protect, createComment);
router.get('/me', protect, adminOrWorker, getMyComments);
router.get('/unread-admin-replies', protect, adminOrWorker, getUnreadAdminReplies);
router.put('/mark-admin-replies-read', protect, markAdminRepliesAsRead);
router.get('/worker/:workerId', protect, adminOnly, getWorkerComments);
router.post('/:id/replies', protect, addReply);
router.put('/:id/read', protect, markCommentAsRead);

router.route('/:subdomain').get(protect, adminOnly, getAllComments);

module.exports = router;