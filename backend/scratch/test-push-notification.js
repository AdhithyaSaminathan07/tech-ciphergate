const mongoose = require('mongoose');
const dotenv = require('dotenv');
const webPush = require('../utils/pushHelper');
const PushSubscription = require('../models/PushSubscription');

dotenv.config();

async function testPush() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is not defined in environment variables');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');

        // Find a recent push subscription in the DB
        const sub = await PushSubscription.findOne().sort({ createdAt: -1 });
        if (!sub) {
            console.warn('\n⚠️ No push subscriptions found in database.');
            console.log('To fully verify end-to-end delivery:');
            console.log('1. Open the application in your browser.');
            console.log('2. Log in and accept notification permissions when prompted.');
            console.log('3. Run this script again to test delivery to your browser.');
            return;
        }

        console.log(`\nFound target subscription for user: ${sub.userId} (${sub.userModel})`);
        console.log(`Endpoint: ${sub.subscription.endpoint}`);

        const payload = JSON.stringify({
            title: 'Web Push Test',
            body: 'Hello! Your Web Push Notifications are configured and working properly! 🎉',
            url: '/'
        });

        console.log('\nSending test push notification...');
        await webPush.sendNotification(sub.subscription, payload);
        console.log('✅ Success! Push notification sent to browser gateway successfully.');

    } catch (error) {
        console.error('❌ Error testing push notification:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

testPush();
