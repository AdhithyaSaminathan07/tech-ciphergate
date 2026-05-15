const webPush = require('./pushHelper');
const PushSubscription = require('../models/PushSubscription');
const UserNotification = require('../models/UserNotification');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const { getIO } = require('./socket');

const sendNotification = async ({ userId, userModel, subdomain, title, message, type, link, image }) => {
    try {
        // 1. Save to database
        const notification = await UserNotification.create({
            userId,
            userModel,
            subdomain,
            title,
            message,
            type,
            link,
            image
        });

        // 2. Fetch user to check settings
        let user;
        if (userModel === 'Admin') {
            user = await Admin.findById(userId);
        } else {
            user = await Worker.findById(userId);
        }

        const settings = user?.notificationSettings || { pushEnabled: true, soundEnabled: true };

        // 3. Emit via WebSocket
        const io = getIO();
        if (io) {
            // Using user id as room
            io.to(userId.toString()).emit('notification', {
                ...notification.toObject(),
                playSound: settings.soundEnabled
            });
        }

        // 4. Send Web Push if enabled
        if (settings.pushEnabled) {
            const subscriptions = await PushSubscription.find({ userId });
            
            const payload = JSON.stringify({
                title,
                body: message,
                url: link,
                type,
                playSound: settings.soundEnabled,
                image
            });

            for (const sub of subscriptions) {
                try {
                    await webPush.sendNotification(sub.subscription, payload);
                } catch (error) {
                    // If subscription is invalid/expired, remove it
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        await PushSubscription.findByIdAndDelete(sub._id);
                    } else {
                        console.error('Error sending push notification:', error);
                    }
                }
            }
        }

        return notification;
    } catch (error) {
        console.error('Failed to send notification:', error);
        throw error;
    }
};

module.exports = { sendNotification };
