// attendance _31/server/models/Task.js
const mongoose = require('mongoose');

const taskSchema = mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Worker'
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing']
  },
  data: {
    type: Object,
    default: {}
  },
  topics: [{ // This now refers to the main topics selected or those whose subtopics were selected
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  }],
  // NEW FIELD: To store specifically selected subtopics
  selectedSubtopics: {
    type: Object, // Stores an object like { 'mainTopicId': ['subTopicId1', 'subTopicId2'] }
    default: {}
  },
  points: {
    type: Number,
    default: 0
  },
  // New fields for custom tasks
  isCustom: {
    type: Boolean,
    default: false
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Task', taskSchema);