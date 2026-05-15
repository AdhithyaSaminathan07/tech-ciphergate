const ApiKey = require('../models/ApiKey');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('express-async-handler');

// @desc    Generate a new API key
// @route   POST /api/admin/keys
// @access  Private/Admin
const generateApiKey = asyncHandler(async (req, res) => {
    const { clientName, subdomain, permissions, expiryDays } = req.body;

    if (!clientName || !subdomain) {
        res.status(400);
        throw new Error('Client name and subdomain are required');
    }

    const key = `cg_${uuidv4().replace(/-/g, '')}`; // Prefix with cg_ for CipherGate

    const expiry = expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;

    const apiKey = await ApiKey.create({
        key,
        clientName,
        subdomain,
        permissions: permissions || ['read'],
        expiry
    });

    res.status(201).json({
        success: true,
        data: apiKey
    });
});

// @desc    Get all API keys
// @route   GET /api/admin/keys
// @access  Private/Admin
const getApiKeys = asyncHandler(async (req, res) => {
    const keys = await ApiKey.find({}).sort({ createdAt: -1 });
    res.json({
        success: true,
        data: keys
    });
});

// @desc    Revoke/Delete an API key
// @route   DELETE /api/admin/keys/:id
// @access  Private/Admin
const revokeApiKey = asyncHandler(async (req, res) => {
    const apiKey = await ApiKey.findById(req.params.id);

    if (!apiKey) {
        res.status(404);
        throw new Error('API Key not found');
    }

    await apiKey.deleteOne();
    res.json({
        success: true,
        message: 'API Key revoked successfully'
    });
});

// @desc    Toggle API key status
// @route   PATCH /api/admin/keys/:id/toggle
// @access  Private/Admin
const toggleApiKey = asyncHandler(async (req, res) => {
    const apiKey = await ApiKey.findById(req.params.id);

    if (!apiKey) {
        res.status(404);
        throw new Error('API Key not found');
    }

    apiKey.isActive = !apiKey.isActive;
    await apiKey.save();

    res.json({
        success: true,
        data: apiKey
    });
});

module.exports = {
    generateApiKey,
    getApiKeys,
    revokeApiKey,
    toggleApiKey
};
