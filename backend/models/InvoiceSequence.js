const mongoose = require('mongoose');

const invoiceSequenceSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'invoicesequences'
});

module.exports = mongoose.model('InvoiceSequence', invoiceSequenceSchema);
