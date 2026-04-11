const mongoose = require('mongoose');

const communityFundWalletSchema = mongoose.Schema({
    totalBalance: {
        type: Number,
        required: true,
        default: 0
    },
    totalFinesCollected: {
        type: Number,
        required: true,
        default: 0
    },
    subdomain: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CommunityFundWallet', communityFundWalletSchema);
