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
    let cleanPhone = (phone || '').toString().replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
    phone = cleanPhone;
    let apiKey = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
    let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if ((!apiKey || !phoneNumberId) && subdomain) {
      const config = await GowhatsConfig.findOne({ subdomain });
      if (config && config.apiKey && config.phoneNumberId) {
        apiKey = config.apiKey;
        phoneNumberId = config.phoneNumberId;
      }
    }

    if (!apiKey || !phoneNumberId) {
      console.error('[WhatsApp Service] WhatsApp credentials missing');
      return { success: false, error: 'WhatsApp API Token / Phone Number ID not configured' };
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
      let mediaId = data.mediaId;

      // If local filePath is provided, upload PDF directly to Meta Cloud Media Storage
      if (!mediaId && data.filePath) {
        try {
          const fs = require('fs');
          const fileBuffer = fs.readFileSync(data.filePath);
          const formData = new FormData();
          formData.append('messaging_product', 'whatsapp');
          formData.append('type', 'application/pdf');
          formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), data.filename || 'invoice.pdf');

          const uploadUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
          console.log(`[WhatsApp Service] Uploading PDF media file to Meta (${data.filePath})...`);
          const uploadRes = await axios.post(uploadUrl, formData, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (uploadRes.data && uploadRes.data.id) {
            mediaId = uploadRes.data.id;
            console.log(`[WhatsApp Service] PDF Media uploaded successfully. Media ID: ${mediaId}`);
          }
        } catch (uploadErr) {
          console.error('[WhatsApp Service] Error uploading media to Meta:', uploadErr.response?.data || uploadErr.message);
        }
      }

      if (mediaId) {
        messageData = {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'document',
          document: {
            id: mediaId,
            filename: data.filename || 'invoice.pdf',
            caption: data.caption || ''
          }
        };
      } else {
        messageData = {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'document',
          document: {
            link: data.link,
            filename: data.filename || 'invoice.pdf',
            caption: data.caption || ''
          }
        };
      }
    } else if (data.type === 'template') {
      let components = data.components || [];

      // If local filePath is provided, upload PDF directly to Meta Cloud Media Storage to get mediaId
      if (data.filePath) {
        try {
          const fs = require('fs');
          const fileBuffer = fs.readFileSync(data.filePath);
          const formData = new FormData();
          formData.append('messaging_product', 'whatsapp');
          formData.append('type', 'application/pdf');
          formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), data.filename || 'invoice.pdf');

          const uploadUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
          console.log(`[WhatsApp Service] Uploading PDF media file to Meta for Template (${data.filePath})...`);
          const uploadRes = await axios.post(uploadUrl, formData, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (uploadRes.data && uploadRes.data.id) {
            const mediaId = uploadRes.data.id;
            console.log(`[WhatsApp Service] Template PDF Media uploaded successfully. Media ID: ${mediaId}`);
            
            // Replace document link with uploaded mediaId in header component
            components = components.map(comp => {
              if (comp.type === 'header' && comp.parameters) {
                return {
                  ...comp,
                  parameters: comp.parameters.map(param => {
                    if (param.type === 'document') {
                      return {
                        type: 'document',
                        document: {
                          id: mediaId,
                          filename: param.document?.filename || data.filename || 'invoice.pdf'
                        }
                      };
                    }
                    return param;
                  })
                };
              }
              return comp;
            });
          }
        } catch (uploadErr) {
          console.error('[WhatsApp Service] Error uploading template media to Meta:', uploadErr.response?.data || uploadErr.message);
        }
      }

      messageData = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: data.templateName || process.env.WHATSAPP_INVOICE_TEMPLATE_NAME || 'invoice_notification',
          language: { code: data.languageCode || 'en' },
          components: components
        }
      };
    }

    console.log(`[WhatsApp Service] Sending ${data.type} to ${phone} via PhoneID ${phoneNumberId}`);
    const response = await axios.post(url, messageData, { headers });
    console.log(`[WhatsApp Service] Success:`, response.data);
    return { success: true, response: response.data };

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`[WhatsApp Service] Error sending message:`, JSON.stringify(errorDetails, null, 2));
    return { success: false, error: errorMessage, errorDetails };
  }
};
