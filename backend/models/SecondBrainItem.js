const mongoose = require('mongoose');

const secondBrainItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['project', 'worker', 'wiki', 'ticket'],
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  itemRef: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'refModel'
  },
  refModel: {
    type: String,
    required: true,
    enum: ['Department', 'Worker', 'InternalDocument', 'Ticket']
  },
  tags: {
    type: [String],
    default: []
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Define text indexes for MongoDB-based text search
secondBrainItemSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    tags: 5,
    content: 1
  },
  name: "SecondBrainSearchIndex"
});

secondBrainItemSchema.index({ subdomain: 1, type: 1 });
secondBrainItemSchema.index({ itemRef: 1 });

module.exports = mongoose.model('SecondBrainItem', secondBrainItemSchema);
