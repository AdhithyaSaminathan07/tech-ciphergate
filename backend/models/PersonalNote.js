const mongoose = require('mongoose');

const personalNoteSchema = new mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['txt', 'md', 'pdf', 'json'],
    required: true
  },
  originalFilename: {
    type: String,
    required: true,
    trim: true
  },
  sourceType: {
    type: String,
    enum: ['manual_upload', 'connected_folder'],
    default: 'manual_upload',
    index: true
  },
  sourceRelativePath: {
    type: String,
    trim: true
  },
  sourceLastModified: {
    type: Number,
    default: null
  },
  syncId: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: 0
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  tags: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicates per subdomain + filename
personalNoteSchema.index({ subdomain: 1, originalFilename: 1 }, { unique: true });
personalNoteSchema.index(
  { subdomain: 1, sourceType: 1, sourceRelativePath: 1 },
  { unique: true, partialFilterExpression: { sourceType: 'connected_folder' } }
);

// Text search index
personalNoteSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
}, {
  weights: { title: 10, tags: 5, content: 1 },
  name: 'PersonalNoteSearchIndex'
});

module.exports = mongoose.model('PersonalNote', personalNoteSchema);
