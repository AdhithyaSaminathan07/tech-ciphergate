const asyncHandler = require('express-async-handler');
const UserNotification = require('../models/UserNotification');
const PushSubscription = require('../models/PushSubscription');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');

// @desc    Get all notifications for a user
// @route   GET /api/user-notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
    }

    const notifications = await UserNotification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50); // Get latest 50 notifications

    const unreadCount = await UserNotification.countDocuments({ userId, isRead: false });

    res.json({ notifications, unreadCount });
});

// @desc    Mark notification as read
// @route   PUT /api/user-notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    if (req.params.id === 'all') {
        await UserNotification.updateMany({ userId, isRead: false }, { isRead: true });
        return res.json({ message: 'All notifications marked as read' });
    }

    const notification = await UserNotification.findOneAndUpdate(
        { _id: req.params.id, userId },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        res.status(404);
        throw new Error('Notification not found');
    }

    res.json(notification);
});

// @desc    Subscribe to push notifications
// @route   POST /api/user-notifications/subscribe
// @access  Private
const subscribePush = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const userModel = req.user.role === 'admin' ? 'Admin' : 'Worker';
    const subdomain = req.user.subdomain;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
        res.status(400);
        throw new Error('Invalid subscription payload');
    }

    await PushSubscription.findOneAndUpdate(
        { userId, 'subscription.endpoint': subscription.endpoint },
        {
            userId,
            userModel,
            subdomain,
            subscription
        },
        { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Subscribed successfully' });
});

// @desc    Update notification settings
// @route   PUT /api/user-notifications/settings
// @access  Private
const updateSettings = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { pushEnabled, soundEnabled, priorityFilter } = req.body;

    let user;
    if (req.user.role === 'admin') {
        user = await Admin.findById(userId);
    } else {
        user = await Worker.findById(userId);
    }

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (!user.notificationSettings) user.notificationSettings = {};
    if (pushEnabled !== undefined) user.notificationSettings.pushEnabled = pushEnabled;
    if (soundEnabled !== undefined) user.notificationSettings.soundEnabled = soundEnabled;
    if (priorityFilter !== undefined) user.notificationSettings.priorityFilter = priorityFilter;

    await user.save();

    res.json(user.notificationSettings);
});

// @desc    Test push notification for a user (diagnostic)
// @route   POST /api/user-notifications/test-push
// @access  Private
const testPushNotification = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const clientPermission = req.body.permissionStatus || 'unknown';
    
    const subscriptions = await PushSubscription.find({ userId });
    
    let sentCount = 0;
    let failedCount = 0;
    let removedCount = 0;
    const errorDetails = [];

    if (!subscriptions || subscriptions.length === 0) {
        return res.status(404).json({
            success: false,
            permissionStatus: clientPermission,
            subscriptionCount: 0,
            notificationsSent: 0,
            notificationsFailed: 0,
            expiredSubscriptionsRemoved: 0,
            errorDetails: ['No active push subscriptions found in database for this user. Please register/subscribe first.']
        });
    }

    const webPush = require('../utils/pushHelper');
    const payload = JSON.stringify({
        title: 'Diagnostic Test',
        body: 'This is a diagnostic push notification from CipherGate.',
        url: '/admin/github-tracker',
        type: 'diagnostic',
        playSound: true
    });

    for (const sub of subscriptions) {
        try {
            await webPush.sendNotification(sub.subscription, payload);
            sentCount++;
        } catch (error) {
            failedCount++;
            errorDetails.push({
                endpoint: sub.subscription?.endpoint,
                statusCode: error.statusCode,
                message: error.message
            });
            // Clean up invalid/expired subscriptions
            if (error.statusCode === 404 || error.statusCode === 410 || error.statusCode === 403) {
                await PushSubscription.findByIdAndDelete(sub._id);
                removedCount++;
            }
        }
    }

    res.json({
        success: failedCount === 0,
        permissionStatus: clientPermission,
        subscriptionCount: subscriptions.length,
        notificationsSent: sentCount,
        notificationsFailed: failedCount,
        expiredSubscriptionsRemoved: removedCount,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined
    });
});

module.exports = {
    getNotifications,
    markAsRead,
    subscribePush,
    updateSettings,
    testPushNotification
};

