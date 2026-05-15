require('dotenv').config();

const webPush = require('web-push');

if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webPush.setVapidDetails(
    'mailto:support@ciphergate.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  console.log('✅ VAPID keys loaded successfully');
} else {
  console.warn('⚠️ VAPID keys missing in environment variables');
}

module.exports = webPush;
