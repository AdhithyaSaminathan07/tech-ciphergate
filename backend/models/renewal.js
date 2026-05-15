const mongoose = require('mongoose');

const renewalSchema = new mongoose.Schema({
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  client_name: { type: String, required: true },
  client_whatsapp: { type: String, required: true },
  subdomain: { type: String, required: true },

  // Domain
  domain_name: { type: String },
  domain_registrar: { type: String },
  domain_expiry_date: { type: Date },
  domain_cost: { type: Number },
  domain_status: { 
    type: String, 
    enum: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED'], 
    default: 'ACTIVE' 
  },
  domain_notified: { type: Boolean, default: false },

  // Server / hosting
  server_provider: { type: String },
  server_plan: { type: String },
  server_expiry_date: { type: Date },
  server_cost: { type: Number },
  server_status: { 
    type: String, 
    enum: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED'], 
    default: 'ACTIVE' 
  },
  server_notified: { type: Boolean, default: false },

  notes: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  deleted_at: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Renewal', renewalSchema);
