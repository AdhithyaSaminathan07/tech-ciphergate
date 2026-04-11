const mongoose = require('mongoose');

const communityFundTransactionSchema = mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: false  // Made optional for expense transactions
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        default: 'credit'
    },
    source: {
        type: String,
        enum: ['fine', 'expense'],  // Added 'expense' for company debits
        default: 'fine'
    },
    reason: {
        type: String,
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: false
    },
    subdomain: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CommunityFundTransaction', communityFundTransactionSchema);

