const axios = require('axios');
const GowhatsConfig = require('../models/GowhatsConfig');

/**
 * Sends a WhatsApp message using Meta Graph API.
 * @param {String} subdomain - Tenant subdomain
 * @param {String} phone - Recipient phone number
 * @param {Object} data - Message data (text or document)
 */
exports.sendWhatsApp = async (subdomain, phone, data) => {
  try {
    let apiKey, phoneNumberId;
    if (subdomain) {
      const config = await GowhatsConfig.findOne({ subdomain });
      if (config && config.apiKey && config.phoneNumberId) {
        apiKey = config.apiKey;
        phoneNumberId = config.phoneNumberId;
      }
    }

    if (!apiKey || !phoneNumberId) {
      apiKey = process.env.WHATSAPP_ACCESS_TOKEN;
      phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    }

    if (!apiKey || !phoneNumberId) {
      throw new Error('WhatsApp configuration missing');
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let messageData;
    
    if (data.type === 'text') {
      messageData = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: data.text }
      };
    } else if (data.type === 'document') {
      messageData = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'document',
        document: {
          link: data.link,
          filename: data.filename || 'document.pdf',
          caption: data.caption || ''
        }
      };
    }

    const response = await axios.post(url, messageData, { headers });
    return { success: true, response: response.data };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`[WhatsApp Service] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
};
