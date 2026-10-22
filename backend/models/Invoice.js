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
  actualDate: { type: Date }, // Added for efficient filtering
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
  upiNumber: { type: String, default: '' },
  gstEnabled: { type: Boolean, default: true },
  saleType: { type: String, enum: ['Intrastate', 'Interstate'], default: 'Intrastate' },
  customerGst: { type: String, default: '' },
  invoiceType: { type: String, enum: ['INVOICE', 'PROFORMA INVOICE', 'TAX INVOICE'], default: 'PROFORMA INVOICE' },
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
    enum: ['admin', 'worker', 'intake', 'website'], 
    default: 'admin' 
  },
  externalOrderId: {
    type: String,
    sparse: true
  },
  // Field to track when admin last viewed invoices
  adminLastViewed: {
    type: Date,
    default: null
  },
  paymentDetails: {
    date: { type: Date },
    proof: { type: String },  // Legacy single proof (backward compat)
    proofs: [{ date: { type: Date }, url: { type: String } }]  // Multiple proofs array
  },
  workDetails: {
    date: { type: Date },
    proof: { type: String },  // Legacy single proof (backward compat)
    proofs: [{ date: { type: Date }, url: { type: String } }]  // Multiple proofs array
  },
  closureDetails: {
    date: { type: Date },
    proof: { type: String },  // Legacy single proof (backward compat)
    proofs: [{ date: { type: Date }, url: { type: String } }]  // Multiple proofs array
  },
  status: { 
    type: String, 
    enum: ['Invoice', 'Payment Received', 'Work completion', 'Closure agreement'], 
    default: 'Invoice' 
  },
  isPaid: { type: Boolean, default: false },
  paymentRecords: [{
    amount: { type: Number },
    dateReceived: { type: String },
    transactionId: { type: String }
  }],
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema index definition with partialFilterExpression for fast, non-colliding order lookups
invoiceSchema.index(
  { externalOrderId: 1, createdBy: 1 },
  { partialFilterExpression: { externalOrderId: { $type: 'string' } } }
);

// Pre-save hook to ensure invoiceType and status reflect payment proof presence or existing state
invoiceSchema.pre('save', function(next) {
  const hasPayment = !!(this.paymentDetails && ((Array.isArray(this.paymentDetails.proofs) && this.paymentDetails.proofs.some(p => (p.url || p.proof || (typeof p === 'string' && p.trim() !== '')))) || (this.paymentDetails.proof && String(this.paymentDetails.proof).trim().length > 0)));
  if (hasPayment) {
    this.invoiceType = 'TAX INVOICE';
    if (!this.status || this.status === 'Invoice') {
      this.status = 'Payment Received';
    }
  }
  next();
});

// Getter / toObject / toJSON transforms
invoiceSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    const hasPayment = !!(ret.paymentDetails && ((Array.isArray(ret.paymentDetails.proofs) && ret.paymentDetails.proofs.some(p => (p.url || p.proof || (typeof p === 'string' && p.trim() !== '')))) || (ret.paymentDetails.proof && String(ret.paymentDetails.proof).trim().length > 0)));
    if (hasPayment) {
      ret.invoiceType = 'TAX INVOICE';
      if (!ret.status || ret.status === 'Invoice') {
        ret.status = 'Payment Received';
      }
    }
    return ret;
  }
});

invoiceSchema.set('toObject', {
  virtuals: true,
  transform: function(doc, ret) {
    const hasPayment = !!(ret.paymentDetails && ((Array.isArray(ret.paymentDetails.proofs) && ret.paymentDetails.proofs.some(p => (p.url || p.proof || (typeof p === 'string' && p.trim() !== '')))) || (ret.paymentDetails.proof && String(ret.paymentDetails.proof).trim().length > 0)));
    if (hasPayment) {
      ret.invoiceType = 'TAX INVOICE';
      if (!ret.status || ret.status === 'Invoice') {
        ret.status = 'Payment Received';
      }
    }
    return ret;
  }
});

module.exports = mongoose.model('Invoice', invoiceSchema);