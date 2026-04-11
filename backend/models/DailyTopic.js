const mongoose = require('mongoose');

const dailyTopicSchema = mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: [true, 'Worker ID is required']
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: [true, 'Date is required']
  },
  topic: {
    type: String,
    required: [true, 'Topic is required'],
    trim: true,
    maxlength: [200, 'Topic cannot exceed 200 characters']
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is required']
  }
}, {
  timestamps: true
});

// Create compound index to ensure one topic per worker per date
dailyTopicSchema.index({ workerId: 1, date: 1, subdomain: 1 }, { unique: true });

// Create index for efficient queries by worker and date range
dailyTopicSchema.index({ workerId: 1, subdomain: 1, date: 1 });

// Virtual for worker information
dailyTopicSchema.virtual('worker', {
  ref: 'Worker',
  localField: 'workerId',
  foreignField: '_id',
  justOne: true
});

// Ensure virtuals are included in JSON output
dailyTopicSchema.set('toJSON', { virtuals: true });
dailyTopicSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DailyTopic', dailyTopicSchema);