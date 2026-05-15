const Renewal = require('../models/RenewalNotification');
const RenewalNotification = require('../models/RenewalNotification');
const { sendWhatsApp } = require('../services/whatsappService');

// This imports the model from 'models/renewal.js' if that's what it was named.
// Wait, in controllers, they imported Renewal via: `const Renewal = require('../models/RenewalNotification');` Wait! In controller it does `const Renewal = require('../models/RenewalNotification'); const RenewalNotification = require('../models/RenewalNotification');`
// BUT the user just pushed an update to `d:\\JAN 2026 projects\\ciphergate_april_20\\ciphergate\\backend\\models\\renewal.js` exporting 'Renewal'!
// Let me look at models.

const RenewalModel = require('../models/renewal');
const NotificationLog = require('../models/RenewalNotification'); // Assuming it exists, if not, I might need to mock or ensure it handles it.

exports.runRenewalAlerts = async () => {
  console.log('Running daily renewal alerts scheduler...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const renewals = await RenewalModel.find({ deleted_at: null });

    for (const r of renewals) {
      if (!r.client_whatsapp) continue;

      // Check Domain
      if (r.domain_expiry_date && r.domain_status !== 'RENEWED') {
        const dExpiry = new Date(r.domain_expiry_date);
        dExpiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dExpiry - today) / (1000 * 60 * 60 * 24));
        
        if ([15, 7, 1].includes(diffDays)) {
          console.log(`Sending automated Domain WA alert to ${r.client_name}`);
          const sendResult = await sendWhatsApp(r.subdomain, r.client_whatsapp, {
            clientName: r.client_name,
            type: 'Domain',
            serviceName: r.domain_name,
            expiryDate: dExpiry.toLocaleDateString('en-IN'),
            daysLeft: diffDays,
            amount: r.domain_cost
          });
          if (sendResult && sendResult.success) { r.domain_notified = true; await r.save(); }
        }
      }

      // Check Server
      if (r.server_expiry_date && r.server_status !== 'RENEWED') {
        const sExpiry = new Date(r.server_expiry_date);
        sExpiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((sExpiry - today) / (1000 * 60 * 60 * 24));
        
        if ([15, 7, 1].includes(diffDays)) {
          console.log(`Sending automated Server WA alert to ${r.client_name}`);
          const sendResult = await sendWhatsApp(r.subdomain, r.client_whatsapp, {
            clientName: r.client_name,
            type: 'Server',
            serviceName: `${r.server_provider} (${r.server_plan})`,
            expiryDate: sExpiry.toLocaleDateString('en-IN'),
            daysLeft: diffDays,
            amount: r.server_cost
          });
          if (sendResult && sendResult.success) { r.server_notified = true; await r.save(); }
        }
      }
    }
    console.log('Renewal scheduler finished.');
  } catch (error) {
    console.error('Error in renewal scheduler:', error);
  }
};
