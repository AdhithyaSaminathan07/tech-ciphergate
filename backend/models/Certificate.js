const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['Intern', 'Offer', 'Acceptance', 'Relieving', 'Experience'],
    },
    content: {
        type: Object, // Stores all dynamic fields for the certificate
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: false
    }
});

module.exports = mongoose.model('Certificate', certificateSchema);
