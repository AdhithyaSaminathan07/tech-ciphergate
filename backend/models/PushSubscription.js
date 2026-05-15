const mongoose = require('mongoose');

const pushSubscriptionSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userModel'
    },
    userModel: {
        type: String,
        required: true,
        enum: ['Admin', 'Worker']
    },
    subdomain: {
        type: String,
        required: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    }
}, { timestamps: true });

// Ensure unique subscriptions per user/endpoint
pushSubscriptionSchema.index({ userId: 1, 'subscription.endpoint': 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
