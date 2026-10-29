const mongoose = require('mongoose');
const ApiKey = require('../models/ApiKey');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('express-async-handler');

// @desc    Generate a new API key
// @route   POST /api/admin/keys
// @access  Private/Admin
const generateApiKey = asyncHandler(async (req, res) => {
    const { clientName, subdomain, permissions, expiryDays } = req.body;

    const trimmedClientName = typeof clientName === 'string' ? clientName.trim() : '';
    if (!trimmedClientName) {
        res.status(400);
        throw new Error('Client name is required');
    }

    // Enforce tenant isolation for non-main admins
    let effectiveSubdomain = '';
    if (req.user && req.user.subdomain && req.user.subdomain !== 'main') {
        effectiveSubdomain = req.user.subdomain;
    } else {
        effectiveSubdomain = typeof subdomain === 'string' && subdomain.trim() 
            ? subdomain.trim() 
            : (req.user?.subdomain || '');
    }

    if (!effectiveSubdomain) {
        res.status(400);
        throw new Error('Subdomain is required');
    }

    // Validate expiryDays if provided
    let expiry = null;
    if (expiryDays !== undefined && expiryDays !== null && expiryDays !== '' && expiryDays !== 0) {
        const parsedDays = Number(expiryDays);
        if (isNaN(parsedDays) || !Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > 3650) {
            res.status(400);
            throw new Error('Expiry days must be a positive integer between 1 and 3650');
        }
        expiry = new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000);
    }

    // Sanitize permissions
    let cleanPermissions = ['read'];
    if (Array.isArray(permissions) && permissions.length > 0) {
        cleanPermissions = permissions
            .filter(p => typeof p === 'string' && p.trim())
            .map(p => p.trim());
        if (cleanPermissions.length === 0) {
            cleanPermissions = ['read'];
        }
    }

    const key = `cg_${uuidv4().replace(/-/g, '')}`; // Prefix with cg_ for CipherGate

    const apiKey = await ApiKey.create({
        key,
        clientName: trimmedClientName,
        subdomain: effectiveSubdomain,
        permissions: cleanPermissions,
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
    const filter = {};

    // Enforce tenant isolation for non-main admins
    if (req.user && req.user.subdomain && req.user.subdomain !== 'main') {
        filter.subdomain = req.user.subdomain;
    }

    const keys = await ApiKey.find(filter).sort({ createdAt: -1 });
    res.json({
        success: true,
        data: keys
    });
});

// @desc    Revoke/Delete an API key
// @route   DELETE /api/admin/keys/:id
// @access  Private/Admin
const revokeApiKey = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid API Key ID');
    }

    const apiKey = await ApiKey.findById(id);

    if (!apiKey) {
        res.status(404);
        throw new Error('API Key not found');
    }

    // Enforce tenant isolation for non-main admins
    if (req.user && req.user.subdomain && req.user.subdomain !== 'main') {
        if (apiKey.subdomain !== req.user.subdomain) {
            res.status(403);
            throw new Error('Not authorized to revoke API key from another tenant');
        }
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
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid API Key ID');
    }

    const apiKey = await ApiKey.findById(id);

    if (!apiKey) {
        res.status(404);
        throw new Error('API Key not found');
    }

    // Enforce tenant isolation for non-main admins
    if (req.user && req.user.subdomain && req.user.subdomain !== 'main') {
        if (apiKey.subdomain !== req.user.subdomain) {
            res.status(403);
            throw new Error('Not authorized to modify API key from another tenant');
        }
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
