const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Certificate = require('../models/Certificate');
const ExitManagement = require('../models/ExitManagement');
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
    deliveryOptions,
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
  const targetEmail = email || worker.email;
  const targetPhone = phoneNumber || worker.phoneNumber;

  // 1. Create Exit Management record
  const exitRecord = await ExitManagement.create({
    worker: workerId,
    subdomain: worker.subdomain,
    relievingDate,
    lastWorkingDay,
    reason,
    documentsGenerated: selectedDocuments,
    performedBy: req.user._id
  });

  // 2. Mark worker as relieved
  worker.status = 'Relieved';
  worker.relievedAt = relievingDate;
  await worker.save();

  // 3. Process attachments for email
  const attachments = [];
  if (documentFiles && documentFiles.length > 0) {
    documentFiles.forEach(doc => {
      attachments.push({
        filename: doc.name,
        content: doc.base64.split('base64,')[1],
        encoding: 'base64'
      });
    });
  }

  const deliveryStatus = {
    email: { sent: false },
    whatsapp: { sent: false }
  };

  // 4. Send Email
  if (deliveryOptions.email && targetEmail) {
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: `Relieving Documents - ${worker.name}`,
      text: `Dear ${worker.name},\n\nPlease find attached your relieving documents from Tech Vaseegrah.\n\nBest regards,\nManagement`,
      html: `<p>Dear ${worker.name},</p><p>Please find attached your relieving documents from Tech Vaseegrah.</p><p>Best regards,<br>Management</p>`,
      attachments
    });
    
    deliveryStatus.email.sent = emailResult.success;
    deliveryStatus.email.sentAt = new Date();
    if (!emailResult.success) {
      deliveryStatus.email.error = emailResult.error;
      console.error('Email delivery failed during relieve:', emailResult.error);
    }
  }

  // 5. Send WhatsApp
  if (deliveryOptions.whatsapp && targetPhone) {
    const whatsappResult = await sendWhatsApp(worker.subdomain, targetPhone, {
      type: 'text',
      text: `Hello ${worker.name}, your relieving documents have been sent to your email (${targetEmail}). Please check and download them.`
    });
    
    deliveryStatus.whatsapp.sent = whatsappResult.success;
    deliveryStatus.whatsapp.sentAt = new Date();
    if (!whatsappResult.success) {
      deliveryStatus.whatsapp.error = whatsappResult.error;
    }
  }

  // 6. Update Exit Record with delivery status
  exitRecord.deliveryStatus = deliveryStatus;
  exitRecord.status = 'Completed';
  await exitRecord.save();

  res.status(200).json({
    success: true,
    message: deliveryStatus.email.sent 
      ? 'Employee relieved and documents sent successfully' 
      : `Employee relieved, but document delivery failed: ${deliveryStatus.email.error || 'Unknown error'}. Please check your mail settings and resend manually from history.`,
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
