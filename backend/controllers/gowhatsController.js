const asyncHandler = require('express-async-handler');
const GowhatsConfig = require('../models/GowhatsConfig');
const { verifyGowhatsCredentials } = require('../services/gowhatsValidationService');

const getConfig = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const config = await GowhatsConfig.findOne({ subdomain }).select('-apiKey');

  if (config) {
    res.json(config);
  } else {
    res.json({
      apiKey: '',
      phoneNumberId: '',
      businessAccountId: '',
      adminWhatsappNumbers: [''],
    });
  }
});

const saveConfig = asyncHandler(async (req, res) => {
  const { apiKey, phoneNumberId, businessAccountId, adminWhatsappNumbers } = req.body;
  const subdomain = req.user.subdomain;

  // Validation
  if (!apiKey || !phoneNumberId || !businessAccountId || !adminWhatsappNumbers || adminWhatsappNumbers.length === 0) {
    res.status(400);
    throw new Error('Please provide all required fields including at least one admin WhatsApp number');
  }

  if (adminWhatsappNumbers.length > 5) {
    res.status(400);
    throw new Error('Maximum 5 admin WhatsApp numbers allowed');
  }

  try {
    await verifyGowhatsCredentials({ apiKey, phoneNumberId });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }

  const config = await GowhatsConfig.findOneAndUpdate(
    { subdomain },
    { subdomain, apiKey, phoneNumberId, businessAccountId, adminWhatsappNumbers },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json({
    message: 'Configuration verified and saved successfully!',
    config: {
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      adminWhatsappNumbers: config.adminWhatsappNumbers,
    }
  });
});

module.exports = {
  getConfig,
  saveConfig,
};