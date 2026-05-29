const mongoose = require('mongoose');
const dotenv = require('dotenv');
const webPush = require('../utils/pushHelper');
const PushSubscription = require('../models/PushSubscription');

dotenv.config();

async function testAllPush() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is not defined in environment variables');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');

        const subscriptions = await PushSubscription.find({});
        console.log(`Found ${subscriptions.length} subscription(s) in the database.\n`);

        if (subscriptions.length === 0) {
            console.log('To fully verify end-to-end delivery:');
            console.log('1. Open the application in your browser.');
            console.log('2. Log in and accept notification permissions when prompted.');
            console.log('3. Run this script again to test delivery to your browser.');
            return;
        }

        const payload = JSON.stringify({
            title: 'Push Notification Test',
            body: 'Your Web Push Notifications are configured and working properly! 🎉',
            url: '/'
        });

        for (let i = 0; i < subscriptions.length; i++) {
            const sub = subscriptions[i];
            console.log(`[${i + 1}/${subscriptions.length}] Testing subscription for user: ${sub.userId} (${sub.userModel})`);
            console.log(`   Endpoint: ${sub.subscription.endpoint.substring(0, 70)}...`);

            try {
                await webPush.sendNotification(sub.subscription, payload);
                console.log('   ✅ Success! Push notification sent successfully.');
            } catch (error) {
                const status = error.statusCode || (error.response && error.response.status);
                const bodyText = error.body || (error.response && error.response.body) || '';
                if (status === 404 || status === 410 || status === 403) {
                    console.log(`   ⚠️ Stale subscription (status ${status}). Cleaning up from database...`);
                    await PushSubscription.findByIdAndDelete(sub._id);
                    console.log('   🗑️ Stale subscription deleted.');
                } else {
                    console.error(`   ❌ Failed with status ${status} and error:`, error.message || error);
                    console.error(`   Body:`, bodyText);
                }
            }
            console.log('----------------------------------------------------');
        }

    } catch (error) {
        console.error('❌ Error in test run:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

testAllPush();
