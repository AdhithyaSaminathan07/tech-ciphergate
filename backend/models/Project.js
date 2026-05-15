const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  contractValue: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['To Do', 'In Progress', 'Review', 'Done', 'Cancelled'],
    default: 'To Do'
  },
  leadEntryDate: {
    type: Date,
    default: Date.now
  },
  closeDate: {
    type: Date
  },
  department: {
    type: String,
    enum: ['MERN Stack', 'Web Development', 'Other'],
    default: 'Other'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook to update closeDate when status changes to Done
projectSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'Done' && !this.closeDate) {
    this.closeDate = Date.now();
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
