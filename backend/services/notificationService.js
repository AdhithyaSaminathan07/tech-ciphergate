// services/notificationService.js

const axios = require('axios');
const GowhatsConfig = require('../models/GowhatsConfig');
const Worker = require('../models/Worker');

/**
 * A reusable function to send any WhatsApp template message.
 * It fetches the API key and phone number ID for a given subdomain.
 * @param {string} subdomain - The tenant's subdomain.
 * @param {string} templateName - The exact name of the template in WhatsApp Manager.
 * @param {string} recipientNumber - The recipient's phone number in international format (e.g., 919876543210).
 * @param {Array|null} headerParams - An array of parameter objects for the template header.
 * @param {Array|null} bodyParams - An array of parameter objects for the template body.
 * @returns {Promise<Object>} - A promise that resolves to an object indicating success or failure.
 */
const sendWhatsAppTemplateMessage = async (subdomain, templateName, recipientNumber, headerParams, bodyParams) => {
  try {
    const config = await GowhatsConfig.findOne({ subdomain });

    if (!config || !config.apiKey || !config.phoneNumberId) {
      console.error(`[WhatsApp Error] GoWhats configuration not found or incomplete for subdomain: ${subdomain}`);
      return { success: false, error: 'Configuration not found or incomplete' };
    }

    // Format phone number properly for WhatsApp (should be in international format without + or leading zeros)
    const formattedRecipientNumber = formatPhoneNumber(recipientNumber);
    
    const { apiKey, phoneNumberId } = config;
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const templateComponents = [];

    if (headerParams && headerParams.length > 0) {
      templateComponents.push({
        type: 'header',
        parameters: headerParams
      });
    }

    if (bodyParams && bodyParams.length > 0) {
      templateComponents.push({
        type: 'body',
        parameters: bodyParams
      });
    }

    const messageData = {
      messaging_product: 'whatsapp',
      to: formattedRecipientNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: templateComponents
      }
    };

    console.log('[WhatsApp] Sending template message payload:', JSON.stringify(messageData, null, 2));
    const response = await axios.post(url, messageData, { headers });

    console.log(`[WhatsApp Success] Message sent successfully to ${formattedRecipientNumber}`);
    return { success: true, messageId: response.data.messages[0].id };
  } catch (error) {
    const errorMessage = error.response ?
      error.response.data.error.message :
      error.message;

    console.log('[WhatsApp Error Details]', {
      statusCode: error.response?.status,
      errorCode: error.response?.data?.error?.code,
      errorDetails: error.response?.data?.error,
      message: errorMessage
    });

    // Check specifically for template not found error (code 132001) or other common errors
    if (error.response?.data?.error?.code === 132001 || error.response?.data?.error?.code === 131047 || error.response?.data?.error?.code === 130038) {
      console.warn(`[WhatsApp] Template error (code ${error.response?.data?.error?.code}), falling back to text message`);
      
      try {
        // Fall back to sending a text message instead of template
        const config = await GowhatsConfig.findOne({ subdomain });
        if (!config || !config.apiKey || !config.phoneNumberId) {
          return { success: false, error: 'Configuration not found or incomplete' };
        }
        
        const formattedRecipientNumber = formatPhoneNumber(recipientNumber);
        
        const { apiKey, phoneNumberId } = config;
        const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
        
        const headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
        
        const textMessageData = {
          messaging_product: 'whatsapp',
          to: formattedRecipientNumber,
          type: 'text',
          text: {
            body: formatFallbackMessage(templateName, headerParams, bodyParams)
          }
        };
        
        console.log('[WhatsApp] Sending fallback text message');
        const response = await axios.post(url, textMessageData, { headers });
        
        console.log(`[WhatsApp Success] Fallback text message sent successfully to ${formattedRecipientNumber}`);
        return { success: true, messageId: response.data.messages[0].id };
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError.response ?
          fallbackError.response.data.error.message :
          fallbackError.message;
        console.error(`[WhatsApp Error] Failed to send fallback text message:`, fallbackErrorMessage);
        return { success: false, error: fallbackErrorMessage };
      }
    }
    
    // Check for common WhatsApp API errors
    if (error.response?.data?.error?.code === 131047) {
      console.error(`[WhatsApp Error] Recipient must have initiated conversation first: ${errorMessage}`);
      return { success: false, error: 'Recipient must have initiated conversation first. This is a WhatsApp Business API restriction.' };
    } else if (error.response?.data?.error?.code === 132000) {
      console.error(`[WhatsApp Error] Message blocked by recipient: ${errorMessage}`);
      return { success: false, error: 'Message blocked by recipient or business.' };
    } else if (error.response?.data?.error?.code === 130038) {
      console.error(`[WhatsApp Error] Invalid phone number: ${errorMessage}`);
      return { success: false, error: 'Invalid phone number format.' };
    }
    
    console.error(`[WhatsApp Error] Failed to send message:`, errorMessage);
    return { success: false, error: errorMessage };
  }
};

// Helper function to format phone number for WhatsApp API
const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  let cleanedNumber = phoneNumber.replace(/\D/g, '');
  
  // Handle Indian numbers that start with 91 or 0
  if (cleanedNumber.startsWith('91')) {
    // Already in international format
    return cleanedNumber;
  } else if (cleanedNumber.startsWith('0')) {
    // Remove leading zero and add country code
    return '91' + cleanedNumber.substring(1);
  } else if (cleanedNumber.length === 10) {
    // Assume it's an Indian number without country code
    return '91' + cleanedNumber;
  } else {
    // Return as is if already in international format
    return cleanedNumber;
  }
};

// Helper function to format fallback text message
const formatFallbackMessage = (templateName, headerParams, bodyParams) => {
  if (templateName === 'leave_request' && bodyParams && bodyParams.length >= 8) {
    // Format the leave request message as a readable text
    return `🔔 NEW LEAVE REQUEST ALERT 🔔\n\n` +
           `Employee: ${bodyParams[0]?.text || 'N/A'}\n` +
           `Leave Type: ${bodyParams[1]?.text || 'N/A'}\n` +
           `Start Date: ${bodyParams[2]?.text || 'N/A'}\n` +
           `End Date: ${bodyParams[3]?.text || 'N/A'}\n` +
           `Start Time: ${bodyParams[4]?.text || 'N/A'}\n` +
           `End Time: ${bodyParams[5]?.text || 'N/A'}\n` +
           `Total Days: ${bodyParams[6]?.text || 'N/A'}\n` +
           `Reason: ${bodyParams[7]?.text || 'N/A'}\n\n` +
           `Please review and approve/reject this request.`;
  }
  
  // Generic fallback for other templates
  return `Notification: A new ${templateName.replace('_', ' ')} notification has been triggered. ` +
         `Parameters: ${JSON.stringify(bodyParams || [])}`;
};


/**
 * Specifically handles sending the "leave_request" notification to all configured admin numbers.
 * It fetches the leave details, formats them, and calls the generic message sender.
 * @param {Object} leave - The Mongoose leave document containing all details of the leave application.
 * @returns {Promise<Object>} - A promise that resolves to an object summarizing the notification results.
 */
const sendNewLeaveRequestNotification = async (leave) => {
  try {
    console.log('[WhatsApp Debug] Processing leave notification:', {
      subdomain: leave.subdomain,
      workerId: leave.worker,
      leaveType: leave.leaveType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      totalDays: leave.totalDays,
      reason: leave.reason
    });
    
    // Destructure all required fields from the leave object
    const { subdomain, worker: workerId, leaveType, startDate, endDate, totalDays, reason, startTime, endTime } = leave;

    const config = await GowhatsConfig.findOne({ subdomain });
    console.log('[WhatsApp Debug] Config found:', !!config, 'Admin numbers:', config?.adminWhatsappNumbers);
    
    if (!config || !config.adminWhatsappNumbers || config.adminWhatsappNumbers.length === 0) {
      console.error(`[WhatsApp Error] Admin WhatsApp numbers not configured for ${subdomain}`);
      return { success: false, error: 'Admin numbers not configured' };
    }

    const worker = await Worker.findById(workerId).select('name');
    if (!worker) {
      console.error(`[WhatsApp Error] Worker not found with ID: ${workerId}`);
      return { success: false, error: 'Worker not found' };
    }

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    // --- CRITICAL FIX ---
    // The following code ensures that even if `startTime` or `endTime` are undefined or null,
    // a fallback string 'N/A' is used. This prevents the "Invalid parameter" API error.
    const bodyParameters = [
      { type: 'text', text: worker.name },                                                // {{1}} Employee Name
      { type: 'text', text: leaveType },                                                    // {{2}} Leave Type
      { type: 'text', text: formatDate(startDate) },                                        // {{3}} Start Date
      { type: 'text', text: formatDate(endDate) },                                          // {{4}} End Date
      { type: 'text', text: leaveType === 'Permission' ? (startTime || 'N/A') : 'N/A' },    // {{5}} Start Time (Corrected)
      { type: 'text', text: leaveType === 'Permission' ? (endTime || 'N/A') : 'N/A' },      // {{6}} End Time (Corrected)
      { type: 'text', text: totalDays.toString() },                                         // {{7}} Total Days
      { type: 'text', text: reason }                                                        // {{8}} Reason
    ];

    // Send the notification to all configured admin numbers
    console.log(`[WhatsApp] Attempting to send notifications to ${config.adminWhatsappNumbers.length} admin numbers`);
    const results = [];
    for (const adminNumber of config.adminWhatsappNumbers) {
      console.log(`[WhatsApp] Sending notification to admin number: ${adminNumber}`);
      const result = await sendWhatsAppTemplateMessage(
        subdomain,
        'leave_request', // Ensure this matches your template name in WhatsApp Manager
        adminNumber,
        null, // No header parameters
        bodyParameters
      );
      console.log(`[WhatsApp] Result for ${adminNumber}:`, result);
      results.push({ number: adminNumber, ...result });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[WhatsApp] Notifications sent to ${successful}/${config.adminWhatsappNumbers.length} admin numbers`);

    return {
      success: successful > 0,
      results: results,
      summary: `${successful} successful, ${failed} failed`
    };

  } catch (error) {
    console.error('[WhatsApp Error] Critical failure in sendNewLeaveRequestNotification:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNewLeaveRequestNotification,
  sendWhatsAppTemplateMessage
};