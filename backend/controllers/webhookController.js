// controllers/webhookController.js

const asyncHandler = require('express-async-handler');
const axios = require('axios');
const Leave = require('../models/Leave');
const Worker = require('../models/Worker');
const GowhatsConfig = require('../models/GowhatsConfig');
const { getIO } = require('../utils/socket');

const normalizePhoneNumber = (phoneNumber = '') => {
  const cleaned = String(phoneNumber).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 11) return `91${cleaned.substring(1)}`;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
};

const getButtonPayload = (message) => {
  if (message.type === 'button') return message.button?.payload || message.button?.text;
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.id || message.interactive?.button_reply?.title;
  }
  return null;
};

/**
 * Helper function to send a confirmation or error message via WhatsApp.
 * It uses the tenant-specific API key and phone number ID from the config.
 */
const sendConfirmationMessage = async (config, recipientNumber, messageText) => {
  // Ensure we have the necessary config to send a message
  if (!config || !config.apiKey || !config.phoneNumberId) {
    console.error('[Webhook] Cannot send confirmation: Missing apiKey or phoneNumberId in config.');
    return;
  }

  try {
    const { apiKey, phoneNumberId } = config;
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const messageData = {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'text',
      text: {
        body: messageText
      }
    };

    await axios.post(url, messageData, { headers });
    console.log(`[Webhook] Confirmation message sent to ${recipientNumber}`);

  } catch (error) {
    // Log detailed error from Facebook API if available
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`[Webhook] Error sending confirmation message: ${errorMessage}`);
  }
};

// @desc    Handle incoming WhatsApp webhook events
// @route   POST /api/webhook/whatsapp
// @access  Public
const handleWhatsAppWebhook = asyncHandler(async (req, res) => {
  console.log('[Webhook] Received webhook:', JSON.stringify(req.body, null, 2));

  const { entry } = req.body;

  // Validate the incoming webhook structure
  if (!entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    console.log('[Webhook] Ignoring event: Not a message notification.');
    return res.status(200).json({ status: 'ok' });
  }

  const message = entry[0].changes[0].value.messages[0];
  const fromNumber = message.from;
  const normalizedFromNumber = normalizePhoneNumber(fromNumber);

  // Find which tenant this admin number belongs to
  const configs = await GowhatsConfig.find({ adminWhatsappNumbers: { $exists: true, $ne: [] } });
  const config = configs.find(item =>
    item.adminWhatsappNumbers.some(number => normalizePhoneNumber(number) === normalizedFromNumber)
  );

  if (!config) {
    console.log(`[Webhook] No tenant found for admin number: ${fromNumber}. Ignoring.`);
    return res.status(200).json({ status: 'ok' });
  }

  console.log(`[Webhook] Message received from a valid admin of tenant: ${config.subdomain}`);
  
  // Process only if it's a button response with a specific payload
  const payload = getButtonPayload(message);
  if (payload) {
    
    // Check if the button payload is for leave management
    if (payload.startsWith('ACCEPT_LEAVE_') || payload.startsWith('REJECT_LEAVE_')) {
      const isApprove = payload.startsWith('ACCEPT_LEAVE_');
      const action = isApprove ? 'Approved' : 'Rejected';
      const leaveId = payload.replace(isApprove ? 'ACCEPT_LEAVE_' : 'REJECT_LEAVE_', '');
      
      console.log(`[Webhook] Processing action '${action}' for leave ID '${leaveId}'`);

      try {
        // Find the leave application ensuring it belongs to the correct tenant
        const leave = await Leave.findOne({
          _id: leaveId,
          subdomain: config.subdomain
        }).populate('worker', 'name perDaySalary');

        if (!leave) {
          console.error(`[Webhook] Leave not found: ${leaveId} for tenant: ${config.subdomain}`);
          await sendConfirmationMessage(config, fromNumber, `❌ Leave application not found or it does not belong to your organization.`);
          return res.status(200).json({ status: 'ok' });
        }

        // Prevent re-processing a leave request
        if (leave.status !== 'Pending') {
          console.log(`[Webhook] Leave ${leaveId} already processed with status: ${leave.status}`);
          await sendConfirmationMessage(config, fromNumber, `ℹ️ This leave request has already been ${leave.status.toLowerCase()}. No action was taken.`);
          return res.status(200).json({ status: 'ok' });
        }

        // Update leave status and log who processed it
        const updatedLeave = await Leave.findByIdAndUpdate(leaveId, { 
          status: action,
          workerViewed: false, // Notify worker
          processedViaWhatsApp: true,
          processedBy: normalizedFromNumber,
          processedAt: new Date()
        }, { new: true }).populate('worker', 'name department');

        // If approved and the leave is unpaid, handle salary deduction
        if (action === 'Approved' && !leave.isPaidLeave) {
          const worker = await Worker.findById(leave.worker._id);
          if (worker && worker.perDaySalary > 0) {
            let deduction = 0;
            if (leave.leaveType === 'Permission' && leave.startTime && leave.endTime) {
              const start = new Date(`1970-01-01T${leave.startTime}:00`);
              const end = new Date(`1970-01-01T${leave.endTime}:00`);
              const durationHours = (end - start) / (1000 * 60 * 60);
              const perHourSalary = worker.perDaySalary / 8;
              deduction = Math.max(0, durationHours * perHourSalary);
            } else {
              deduction = leave.totalDays * worker.perDaySalary * (leave.deductionFactor || 1);
            }
            const updatedFinalSalary = Math.max(0, worker.finalSalary - deduction);
            
            await Worker.updateOne(
              { _id: leave.worker._id },
              { $set: { finalSalary: updatedFinalSalary } }
            );
            
            console.log(`[Webhook] Salary updated for worker ${worker.name}: deducted ${deduction}`);
          }
        }

        try {
          const io = getIO();
          io.to(config.subdomain).emit('leave:updated', updatedLeave);
          if (updatedLeave.worker?._id) {
            io.to(updatedLeave.worker._id.toString()).emit('leave:updated', updatedLeave);
          }
        } catch (socketError) {
          console.error('[Webhook] Socket emission error:', socketError.message);
        }

        console.log(`[Webhook] Leave ${leaveId} successfully ${action.toLowerCase()} by ${fromNumber} for worker ${leave.worker.name}`);
        
        // Send a detailed confirmation message back to the admin
        const confirmationMessage = isApprove 
          ? `✅ Leave request APPROVED for ${leave.worker.name}.\n\nType: ${leave.leaveType}\nDates: ${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()}\nTotal Days: ${leave.totalDays}`
          : `❌ Leave request REJECTED for ${leave.worker.name}.\n\nReason for rejection can be added in the admin panel if needed.`;
        
        await sendConfirmationMessage(config, fromNumber, confirmationMessage);
        
      } catch (error) {
        console.error('[Webhook] CRITICAL ERROR processing leave action:', error.message);
        await sendConfirmationMessage(config, fromNumber, `❌ A server error occurred while processing your request. Please try again or use the admin panel.`);
      }
    }
  }

  // Always respond with 200 OK to WhatsApp to acknowledge receipt
  res.status(200).json({ status: 'ok' });
});


// @desc    Verify webhook subscription for WhatsApp
// @route   GET /api/webhook/whatsapp
// @access  Public
const verifyWebhook = asyncHandler(async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Your secure verify token from environment variables
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!VERIFY_TOKEN) {
    console.error('WHATSAPP_VERIFY_TOKEN is not set in environment variables.');
    return res.sendStatus(403);
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verification successful!');
    res.status(200).send(challenge);
  } else {
    console.warn('[Webhook] Verification failed. Check token.');
    res.sendStatus(403);
  }
});

module.exports = {
  handleWhatsAppWebhook,
  verifyWebhook
};
