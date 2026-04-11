const express = require('express');
const router = express.Router();
const { getWallet, getTransactions, debitFund } = require('../controllers/communityFundController');
const { protect } = require('../middleware/authMiddleware');

router.get('/wallet', protect, getWallet);
router.get('/transactions', protect, getTransactions);
router.post('/debit', protect, debitFund);

module.exports = router;

