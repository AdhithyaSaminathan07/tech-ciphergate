const express   = require('express');
const router    = express.Router();
const { 
  receiveMessage, 
  getMessages,
  getActiveAccount,
  getAccounts,
  connectAccount,
  activateAccount,
  deleteAccount
} = require('../controllers/instaxbotController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Webhook/generic endpoints
router.post('/messages', receiveMessage);
router.get('/messages',  getMessages);

// Active Instagram account route (Accessible by Admin and Employee)
router.get('/active-account', protect, getActiveAccount);

// Admin-only endpoints for Instagram configuration
router.get('/accounts', protect, adminOnly, getAccounts);
router.post('/accounts', protect, adminOnly, connectAccount);
router.put('/accounts/:id/activate', protect, adminOnly, activateAccount);
router.delete('/accounts/:id', protect, adminOnly, deleteAccount);

module.exports = router;

