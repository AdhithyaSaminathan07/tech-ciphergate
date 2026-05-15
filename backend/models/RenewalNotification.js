const mongoose = require('mongoose');

const renewalNotificationSchema = new mongoose.Schema({
  renewal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Renewal', required: true },
  type: { type: String, enum: ['DOMAIN', 'SERVER'] },
  sent_to: { type: String },
  days_before_expiry: { type: Number },
  status: { type: String, enum: ['SENT', 'FAILED'] },
  sent_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RenewalNotification', renewalNotificationSchema);
