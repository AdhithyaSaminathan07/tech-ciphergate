const mongoose = require('mongoose');

const userNotificationSchema = mongoose.Schema({
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
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'task_assigned',
            'task_updated',
            'task_approved',
            'task_rejected',
            'system_alert',
            'proof_submitted'
        ],
        default: 'task_assigned'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    link: {
        type: String // URL to navigate to when clicked
    },
    image: {
        type: String // Optional image URL for push notifications
    }
}, { timestamps: true });

module.exports = mongoose.model('UserNotification', userNotificationSchema);
