const mongoose = require('mongoose');

const internalDocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Wiki title is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Wiki content is required'],
    trim: true
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  tags: {
    type: [String],
    default: []
  },
  subdomain: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  }
}, {
  timestamps: true
});

internalDocumentSchema.index({ subdomain: 1 });
internalDocumentSchema.index({ category: 1 });

internalDocumentSchema.post('save', async function(doc) {
  try {
    const { syncBrainItem } = require('../services/secondBrainService');
    await syncBrainItem('wiki', doc, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to sync wiki on save:', err.message);
  }
});

internalDocumentSchema.post('remove', async function(doc) {
  try {
    const { deleteBrainItem } = require('../services/secondBrainService');
    await deleteBrainItem('wiki', doc._id, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to delete wiki on remove:', err.message);
  }
});

module.exports = mongoose.model('InternalDocument', internalDocumentSchema);
