const mongoose = require('mongoose');

const intakeItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  hsn: { type: String, default: '' },
  gst: { type: Number, default: 18 },
  qty: { type: Number, required: true, default: 1 },
  rate: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 }
}, { _id: false });

const jobIntakeSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    trim: true
  },
  gatewayPaymentId: {
    type: String,
    sparse: true,
    trim: true
  },
  subdomain: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  customer: {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true }
  },
  jobDetails: {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    serviceCategory: { type: String, default: 'General', trim: true },
    team: { type: String, default: null, trim: true },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'High'
    },
    deliverables: [{ type: String, trim: true }],
    referenceFiles: [{
      url: { type: String, required: true },
      name: { type: String, required: true },
      size: { type: Number, default: 0 },
      fileType: { type: String, default: '' }
    }],
    dueDate: { type: Date }
  },
  payment: {
    gateway: {
      type: String,
      required: true,
      enum: ['razorpay', 'stripe', 'cashfree', 'website_direct', 'manual']
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED'],
      default: 'PENDING'
    },
    verifiedAt: { type: Date },
    transactionRef: { type: String, default: '' },
    gatewaySignature: { type: String, default: '' }
  },
  items: [intakeItemSchema],
  intakeStatus: {
    type: String,
    enum: [
      'RECEIVED',
      'PROCESSING',
      'PAYMENT_VERIFIED',
      'INVOICE_CREATED',
      'TICKET_CREATED',
      'COMPLETED',
      'FAILED'
    ],
    default: 'RECEIVED',
    index: true
  },
  processingStartedAt: { type: Date, default: null },
  processingLeaseOwner: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  invoiceNo: {
    type: String,
    default: null
  },
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  collection: 'jobintakes'
});

// Compound unique index ensuring idempotency is scoped strictly per tenant
jobIntakeSchema.index({ subdomain: 1, orderId: 1 }, { unique: true });
// Secondary index for quick payment reference lookup using partialFilterExpression
jobIntakeSchema.index(
  { subdomain: 1, gatewayPaymentId: 1 },
  { partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } }
);

module.exports = mongoose.model('JobIntake', jobIntakeSchema);
