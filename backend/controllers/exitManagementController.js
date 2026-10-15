const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Certificate = require('../models/Certificate');
const ExitManagement = require('../models/ExitManagement');
const EmployeeHistory = require('../models/EmployeeHistory');
const { sendEmail } = require('../services/emailService');
const { sendWhatsApp } = require('../services/whatsappService');
const path = require('path');
const fs = require('fs');

// @desc    Process employee relieve and send documents
// @route   POST /api/exit-management/relieve
// @access  Private/Admin
const processRelieve = asyncHandler(async (req, res) => {
  const { 
    workerId, 
    relievingDate, 
    lastWorkingDay, 
    reason, 
    selectedDocuments, 
    deliveryOptions = {},
    documentFiles, // Array of objects { name, base64 }
    email, // Optional: override worker email
    phoneNumber // Optional: override worker phone
  } = req.body;

  const worker = await Worker.findById(workerId);
  if (!worker) {
    res.status(404);
    throw new Error('Worker not found');
  }

  // Use provided email/phone or fallback to worker's stored details
  const targetEmail = (email || worker.email || '').trim();
  const targetPhone = (phoneNumber || worker.phoneNumber || '').trim();

  // 1. Create Exit Management record
  const exitRecord = await ExitManagement.create({
    worker: workerId,
    subdomain: worker.subdomain,
    relievingDate,
    lastWorkingDay,
    reason,
    documentsGenerated: selectedDocuments || [],
    performedBy: req.user ? req.user._id : null
  });

  // 2. Mark worker as relieved and log history
  const beforeData = worker.toObject();
  worker.status = 'Relieved';
  worker.relievedAt = relievingDate;
  await worker.save();

  try {
    await EmployeeHistory.create({
      employee: worker._id,
      actionType: 'Relieved',
      performedBy: req.user ? req.user._id : null,
      beforeData,
      afterData: worker.toObject()
    });
  } catch (err) {
    console.error('Failed to log relieve to EmployeeHistory:', err);
  }

  // 3. Process attachments for email
  const attachments = [];
  if (documentFiles && documentFiles.length > 0) {
    documentFiles.forEach(doc => {
      if (doc && doc.base64) {
        attachments.push({
          filename: doc.name,
          content: doc.base64.includes('base64,') ? doc.base64.split('base64,')[1] : doc.base64,
          encoding: 'base64'
        });
      }
    });
  }

  const deliveryStatus = {
    email: { sent: false },
    whatsapp: { sent: false }
  };

  const shouldSendEmail = Boolean(deliveryOptions.email && targetEmail);
  const shouldSendWhatsApp = Boolean(deliveryOptions.whatsapp && targetPhone);

  // 4. Send Email
  if (shouldSendEmail) {
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: `Relieving Documents - ${worker.name}`,
      text: `Dear ${worker.name},\n\nPlease find attached your relieving documents from Tech Vaseegrah.\n\nBest regards,\nManagement`,
      html: `<p>Dear ${worker.name},</p><p>Please find attached your relieving documents from Tech Vaseegrah.</p><p>Best regards,<br>Management</p>`,
      attachments
    });
    
    deliveryStatus.email.sent = Boolean(emailResult?.success);
    deliveryStatus.email.sentAt = new Date();
    if (!emailResult?.success) {
      deliveryStatus.email.error = emailResult?.error || 'Failed to send email';
      console.error('Email delivery failed during relieve:', emailResult?.error);
    }
  }

  // 5. Send WhatsApp
  if (shouldSendWhatsApp) {
    const whatsappResult = await sendWhatsApp(worker.subdomain, targetPhone, {
      type: 'text',
      text: `Hello ${worker.name}, your relieving documents have been prepared. Please check and download them.`
    });
    
    deliveryStatus.whatsapp.sent = Boolean(whatsappResult?.success);
    deliveryStatus.whatsapp.sentAt = new Date();
    if (!whatsappResult?.success) {
      deliveryStatus.whatsapp.error = whatsappResult?.error || 'Failed to send WhatsApp message';
    }
  }

  // 6. Update Exit Record with delivery status
  exitRecord.deliveryStatus = deliveryStatus;
  exitRecord.status = 'Completed';
  await exitRecord.save();

  let message = 'Employee relieved successfully';
  if (shouldSendEmail && deliveryStatus.email.sent) {
    message = 'Employee relieved and documents sent via email successfully';
  } else if (shouldSendEmail && !deliveryStatus.email.sent) {
    message = `Employee relieved, but document email delivery failed: ${deliveryStatus.email.error || 'Unknown email error'}. Please check your mail settings and resend manually from history.`;
  }

  res.status(200).json({
    success: true,
    message,
    exitRecord,
    deliveryStatus
  });
});

// @desc    Get exit history for a worker or tenant
// @route   GET /api/exit-management/history
// @access  Private/Admin
const getExitHistory = asyncHandler(async (req, res) => {
  const { workerId, subdomain } = req.query;
  const query = {};
  if (workerId) query.worker = workerId;
  if (subdomain) query.subdomain = subdomain;

  const history = await ExitManagement.find(query)
    .populate('worker', 'name username rfid photo')
    .populate('performedBy', 'name email')
    .sort({ createdAt: -1 });

  res.json(history);
});

module.exports = {
  processRelieve,
  getExitHistory
};
