const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  hsn: { type: String, default: '' },
  gst: { type: Number, default: 0 },
  qty: { type: Number, required: true },
  rate: { type: Number, required: true },
  total: { type: Number, required: true },
  isTotalOverridden: { type: Boolean, default: false }
});

const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  invoiceDate: { type: String, required: true },
  customerName: { type: String, default: '' },
  customerContact: { type: String, default: '' },
  salesPerson: { type: String, default: '' },
  terms: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  items: [invoiceItemSchema],
  bankName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  ifscCode: { type: String, default: '' },
  upiId: { type: String, default: '' },
  gstEnabled: { type: Boolean, default: false },
  saleType: { type: String, enum: ['Intrastate', 'Interstate'], default: 'Intrastate' },
  customerGst: { type: String, default: '' },
  invoiceType: { type: String, enum: ['INVOICE', 'PROFORMA INVOICE', 'TAX INVOICE'], default: 'INVOICE' },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    refPath: 'createdByModel'
  },
  createdByModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Worker']
  },
  workerInfo: {
    workerName: { type: String, default: '' },
    workerDepartment: { type: String, default: '' }
  },
  source: { 
    type: String, 
    enum: ['admin', 'worker'], 
    default: 'admin' 
  },
  // Field to track when admin last viewed invoices
  adminLastViewed: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Invoice', invoiceSchema);