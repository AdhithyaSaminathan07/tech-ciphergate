// backend/controllers/communityFundController.js
const asyncHandler = require('express-async-handler');
const CommunityFundWallet = require('../models/CommunityFundWallet');
const CommunityFundTransaction = require('../models/CommunityFundTransaction');

// @desc    Get Community Fund Wallet Balance
// @route   GET /api/community-fund/wallet
// @access  Private/Admin
const getWallet = asyncHandler(async (req, res) => {
    const { subdomain } = req.user;

    let wallet = await CommunityFundWallet.findOne({ subdomain });

    // If wallet doesn't exist, create it (initialization)
    if (!wallet) {
        wallet = await CommunityFundWallet.create({
            totalBalance: 0,
            totalFinesCollected: 0,
            subdomain
        });
    }

    // Calculate totals from transactions
    const allTransactions = await CommunityFundTransaction.find({ subdomain });

    const totalCredits = allTransactions
        .filter(t => t.type === 'credit')
        .reduce((acc, t) => acc + t.amount, 0);

    const totalDebits = allTransactions
        .filter(t => t.type === 'debit')
        .reduce((acc, t) => acc + t.amount, 0);

    const actualBalance = totalCredits - totalDebits;

    // Calculate current month credits
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const currentMonthCredits = allTransactions
        .filter(t => t.type === 'credit' && new Date(t.createdAt) >= startOfMonth)
        .reduce((acc, t) => acc + t.amount, 0);

    res.status(200).json({
        totalBalance: actualBalance,
        totalCredits,
        totalDebits,
        totalLifetimeCollected: totalCredits,
        currentMonthTotal: currentMonthCredits
    });
});

// @desc    Get Community Fund Transactions
// @route   GET /api/community-fund/transactions
// @access  Private/Admin
const getTransactions = asyncHandler(async (req, res) => {
    const { subdomain } = req.user;

    const transactions = await CommunityFundTransaction.find({ subdomain })
        .populate('employeeId', 'name username subdomain')
        .populate('createdBy', 'username email')
        .sort({ createdAt: -1 });

    res.status(200).json(transactions);
});

// @desc    Debit from Community Fund for company usage
// @route   POST /api/community-fund/debit
// @access  Private/Admin
const debitFund = asyncHandler(async (req, res) => {
    const { amount, reason, date } = req.body;
    const { subdomain } = req.user;

    // Validate inputs
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Amount must be a valid positive number' });
    }

    if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: 'Reason is required' });
    }

    // Calculate current balance
    const allTransactions = await CommunityFundTransaction.find({ subdomain });
    const totalCredits = allTransactions
        .filter(t => t.type === 'credit')
        .reduce((acc, t) => acc + t.amount, 0);
    const totalDebits = allTransactions
        .filter(t => t.type === 'debit')
        .reduce((acc, t) => acc + t.amount, 0);
    const currentBalance = totalCredits - totalDebits;

    // Check if sufficient balance
    if (amount > currentBalance) {
        return res.status(400).json({
            message: `Insufficient balance. Available: ₹${currentBalance.toFixed(2)}, Requested: ₹${amount}`
        });
    }

    // Update wallet
    let wallet = await CommunityFundWallet.findOne({ subdomain });
    if (wallet) {
        wallet.totalBalance = currentBalance - amount;
        await wallet.save();
    }

    // Create debit transaction
    const transaction = await CommunityFundTransaction.create({
        amount: Number(amount),
        type: 'debit',
        source: 'expense',
        reason: reason.trim(),
        createdBy: req.user ? req.user._id : null,
        createdAt: date ? new Date(date) : new Date(),
        subdomain
    });

    res.status(201).json({
        message: 'Fund debited successfully',
        transaction,
        newBalance: currentBalance - amount
    });
});

module.exports = {
    getWallet,
    getTransactions,
    debitFund
};

