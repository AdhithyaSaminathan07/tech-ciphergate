const Renewal = require('../models/renewal');
const RenewalNotification = require('../models/RenewalNotification');
const asyncHandler = require('express-async-handler');
const { sendWhatsApp } = require('../services/whatsappService');

// Helper to compute status
function computeStatus(expiryDate) {
  if (!expiryDate) return 'ACTIVE';
  const today = new Date();
  const expiry = new Date(expiryDate);
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= 5) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

// Helper to update statuses for a record
function updateRecordStatuses(record) {
  if (record.domain_expiry_date && record.domain_status !== 'RENEWED') {
    record.domain_status = computeStatus(record.domain_expiry_date);
  }
  if (record.server_expiry_date && record.server_status !== 'RENEWED') {
    record.server_status = computeStatus(record.server_expiry_date);
  }
  return record;
}

// @desc    Create renewal record
// @route   POST /api/renewals
// @access  Admin
const createRenewal = asyncHandler(async (req, res) => {
  const renewalData = req.body;
  renewalData.created_by = req.user._id;
  renewalData.subdomain = req.user.subdomain;

  // Initial status calculation
  if (renewalData.domain_expiry_date) {
    renewalData.domain_status = computeStatus(renewalData.domain_expiry_date);
  }
  if (renewalData.server_expiry_date) {
    renewalData.server_status = computeStatus(renewalData.server_expiry_date);
  }

  const renewal = await Renewal.create(renewalData);
  res.status(201).json({ success: true, data: renewal });
});

// @desc    List all renewals
// @route   GET /api/renewals
// @access  Admin
const getRenewals = asyncHandler(async (req, res) => {
  const { search, status, type, startDate, endDate } = req.query;
  const subdomain = req.user.subdomain;
  
  let query = { deleted_at: null, subdomain };

  if (search) {
    query.$or = [
      { client_name: { $regex: search, $options: 'i' } },
      { domain_name: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by status (complex because domain and server have separate statuses)
  if (status && status !== 'All Status') {
    query.$or = [
      { domain_status: status.toUpperCase() },
      { server_status: status.toUpperCase() }
    ];
  }

  // Filter by type
  if (type === 'Domain Only') {
    query.domain_name = { $ne: null, $exists: true };
  } else if (type === 'Server Only') {
    query.server_provider = { $ne: null, $exists: true };
  }

  // Filter by date range (expiry date)
  if (startDate || endDate) {
    query.$or = [];
    if (startDate && endDate) {
      query.$or.push({ domain_expiry_date: { $gte: new Date(startDate), $lte: new Date(endDate) } });
      query.$or.push({ server_expiry_date: { $gte: new Date(startDate), $lte: new Date(endDate) } });
    } else if (startDate) {
      query.$or.push({ domain_expiry_date: { $gte: new Date(startDate) } });
      query.$or.push({ server_expiry_date: { $gte: new Date(startDate) } });
    } else if (endDate) {
      query.$or.push({ domain_expiry_date: { $lte: new Date(endDate) } });
      query.$or.push({ server_expiry_date: { $lte: new Date(endDate) } });
    }
  }

  let renewals = await Renewal.find(query).sort({ createdAt: -1 });

  // Update statuses on the fly for each fetch
  renewals = renewals.map(r => {
    const obj = r.toObject();
    return updateRecordStatuses(obj);
  });

  res.json({ success: true, data: renewals });
});

// @desc    Get single record with notification log
// @route   GET /api/renewals/:id
// @access  Admin
const getRenewalById = asyncHandler(async (req, res) => {
  const renewal = await Renewal.findById(req.params.id);
  if (!renewal || renewal.deleted_at) {
    res.status(404);
    throw new Error('Renewal record not found');
  }

  const updatedRenewal = updateRecordStatuses(renewal.toObject());
  const logs = await RenewalNotification.find({ renewal_id: req.params.id }).sort({ sent_at: -1 });

  res.json({ success: true, data: updatedRenewal, logs });
});

// @desc    Update record
// @route   PUT /api/renewals/:id
// @access  Admin
const updateRenewal = asyncHandler(async (req, res) => {
  let renewal = await Renewal.findById(req.params.id);
  if (!renewal || renewal.deleted_at) {
    res.status(404);
    throw new Error('Renewal record not found');
  }

  const updateData = req.body;
  // Recalculate status if expiry dates changed
  if (updateData.domain_expiry_date) {
    updateData.domain_status = computeStatus(updateData.domain_expiry_date);
  }
  if (updateData.server_expiry_date) {
    updateData.server_status = computeStatus(updateData.server_expiry_date);
  }

  const updatedRenewal = await Renewal.findByIdAndUpdate(req.params.id, updateData, { new: true });
  res.json({ success: true, data: updatedRenewal });
});

// @desc    Soft delete
// @route   DELETE /api/renewals/:id
// @access  Admin
const deleteRenewal = asyncHandler(async (req, res) => {
  const renewal = await Renewal.findById(req.params.id);
  if (!renewal) {
    res.status(404);
    throw new Error('Renewal record not found');
  }

  renewal.deleted_at = new Date();
  await renewal.save();
  res.json({ success: true, message: 'Record deleted successfully' });
});

// @desc    Manually send WhatsApp now
// @route   POST /api/renewals/:id/send-wa
// @access  Admin
const sendWhatsAppManual = asyncHandler(async (req, res) => {
  const { type } = req.body; // 'DOMAIN' or 'SERVER'
  const renewal = await Renewal.findById(req.params.id);
  if (!renewal) {
    res.status(404);
    throw new Error('Renewal record not found');
  }

  let serviceName, expiryDate;
  if (type === 'DOMAIN') {
    serviceName = renewal.domain_name;
    expiryDate = renewal.domain_expiry_date;
  } else {
    serviceName = `${renewal.server_provider} (${renewal.server_plan})`;
    expiryDate = renewal.server_expiry_date;
  }

  if (!expiryDate) {
    res.status(400);
    throw new Error('Expiry date not set for this service');
  }

  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  const amount = type === 'DOMAIN' ? renewal.domain_cost : renewal.server_cost;

  const sendResult = await sendWhatsApp(renewal.subdomain, renewal.client_whatsapp, {
    clientName: renewal.client_name,
    type: type === 'DOMAIN' ? 'Domain' : 'Server',
    serviceName,
    expiryDate: expiry.toLocaleDateString('en-IN'),
    daysLeft: diffDays,
    amount
  });

  if (sendResult && sendResult.success) {
    await RenewalNotification.create({
      renewal_id: renewal._id,
      type,
      sent_to: renewal.client_whatsapp,
      days_before_expiry: diffDays,
      status: 'SENT'
    });
    
    // Update notified flag
    if (type === 'DOMAIN') renewal.domain_notified = true;
    else renewal.server_notified = true;
    await renewal.save();

    res.json({ success: true, message: 'WhatsApp notification sent' });
  } else {
    await RenewalNotification.create({
      renewal_id: renewal._id,
      type,
      sent_to: renewal.client_whatsapp,
      days_before_expiry: diffDays,
      status: 'FAILED'
    });
    res.status(400).json({ success: false, message: sendResult ? sendResult.message : 'Failed to send WhatsApp message' });
  }
});

// @desc    Mark as renewed
// @route   PUT /api/renewals/:id/mark-renewed
// @access  Admin
const markAsRenewed = asyncHandler(async (req, res) => {
  const { type, newExpiryDate } = req.body; // type: 'DOMAIN' or 'SERVER'
  const renewal = await Renewal.findById(req.params.id);
  if (!renewal) {
    res.status(404);
    throw new Error('Renewal record not found');
  }

  if (type === 'DOMAIN') {
    renewal.domain_expiry_date = newExpiryDate;
    renewal.domain_status = 'RENEWED';
    renewal.domain_notified = false;
  } else {
    renewal.server_expiry_date = newExpiryDate;
    renewal.server_status = 'RENEWED';
    renewal.server_notified = false;
  }

  await renewal.save();
  res.json({ success: true, data: renewal });
});

module.exports = {
  createRenewal,
  getRenewals,
  getRenewalById,
  updateRenewal,
  deleteRenewal,
  sendWhatsAppManual,
  markAsRenewed
};
