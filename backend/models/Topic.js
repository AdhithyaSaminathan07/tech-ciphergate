const mongoose = require('mongoose');

const subTopicSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a sub-topic name']
  },
  points: {
    type: Number,
    required: [true, 'Please add points'],
    default: 0
  }
}, {
  timestamps: true // Add timestamps to subtopics for better tracking
});

const topicSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a topic name']
    // Removed unique: true here as topics can now have subtopics,
    // and uniqueness might be desired per department + parent topic,
    // which will be handled in the controller if needed.
  },
  points: {
    type: Number,
    required: [true, 'Please add points'],
    default: 0
  },
  department: {
    type: String,
    default: 'all'
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing']
  },
  // New field to store sub-topics
  subtopics: [subTopicSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('Topic', topicSchema);