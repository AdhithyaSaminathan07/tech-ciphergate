const mongoose = require('mongoose');

const deleteHistorySchema = new mongoose.Schema({
  invoiceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Invoice',
    required: true
  },
  invoiceNo: { 
    type: String, 
    required: true 
  },
  invoiceDate: { 
    type: String, 
    required: true 
  },
  customerName: { 
    type: String, 
    default: '' 
  },
  totalAmount: { 
    type: Number, 
    required: true 
  },
  deletedAt: { 
    type: Date, 
    default: Date.now 
  },
  deletedByRole: { 
    type: String, 
    enum: ['Admin', 'Worker'],
    required: true
  },
  deletedByName: { 
    type: String, 
    required: true 
  },
  deletedById: { 
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // Reference to the original invoice data for viewing details
  originalInvoiceData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
});

module.exports = mongoose.model('DeleteHistory', deleteHistorySchema);