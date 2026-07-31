const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const workerSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true
  },
  rfid: {
    type: String,
    required: [true, 'RFID is missing'],
    unique: true
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing'],
  },
  password: {
    type: String,
    required: [true, 'Please add a password']
  },
  batch: { // ADD THIS
    type: String
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },
  photo: {
    type: String,
    default: ''
  },
  // Face embeddings for face recognition
  faceEmbeddings: {
    type: [[Number]], // Storing arrays of numbers for face embeddings
    default: []
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  topicPoints: {
    type: Object,
    default: {}
  },
  lastSubmission: {
    type: Object,
    default: {}
  },
  // Performance & Rewards System Fields
  performancePoints: {
    type: Number,
    default: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  performanceLevel: {
    type: String,
    enum: ['Beginner', 'Performer', 'Rising Star', 'Elite Performer', 'Legend'],
    default: 'Beginner'
  },
  totalCompletedTickets: {
    type: Number,
    default: 0
  },
  totalDelayedTickets: {
    type: Number,
    default: 0
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  salary: {
    type: Number,
    default: 0
  },
  finalSalary: {
    type: Number,
    default: 0
  },
  perDaySalary: {
    type: Number,
    default: 0
  },
  bonuses: {
    type: [{
      amount: Number,
      fromDate: Date,
      toDate: Date,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  },
  fines: {
    type: [{
      amount: Number,
      date: Date,
      reason: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  },
  employeeType: {
    type: String,
    enum: ['intern', 'intern_with_stphen', 'employee', 'developer'],
    default: 'intern'
  },
  role: {
    type: String,
    enum: ['developer', 'manager', 'owner'],
    default: 'developer'
  },
  managedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null
  },
  class: {
    type: String,
    enum: ['A', 'B', 'C'],
    default: 'A'
  },
  status: {
    type: String,
    enum: ['Active', 'Relieved', 'Deleted'],
    default: 'Active'
  },
  relievedAt: {
    type: Date
  },
  original_certificate_status: {
    type: String,
    enum: ['not_submitted', 'submitted', 'returned'],
    default: 'not_submitted'
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  designation: {
    type: String,
    trim: true,
    default: 'Developer'
  },
  certificate_notes: {
    type: String,
    default: ''
  },
  relievingLetterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Certificate'
  },
  bankDetails: {
    accountHolderName: { type: String, trim: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true },
    branchName: { type: String, trim: true },
    upiId: { type: String, trim: true }
  },
  notificationSettings: {
    pushEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    priorityFilter: { type: String, enum: ['All', 'High', 'Medium'], default: 'All' }
  },
  acceptedRulesVersion: {
    type: String,
    default: '0'
  },
  passwordChangedAt: Date,
  // Developer Expertise Fields
  skills: {
    type: [String],
    default: []
  },
  gitContributions: {
    type: Number,
    default: 0
  },
  completedTasksCount: {
    type: Number,
    default: 0
  },
  activeTasksCount: {
    type: Number,
    default: 0
  },
  expertiseProfile: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

workerSchema.virtual('faceEnrolled').get(function () {
  return Array.isArray(this.faceEmbeddings) && this.faceEmbeddings.length > 0;
});

workerSchema.index({ subdomain: 1, status: 1 });

workerSchema.post('save', async function(doc) {
  try {
    const { syncBrainItem } = require('../services/secondBrainService');
    await syncBrainItem('worker', doc, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to sync worker on save:', err.message);
  }
});

workerSchema.post('remove', async function(doc) {
  try {
    const { deleteBrainItem } = require('../services/secondBrainService');
    await deleteBrainItem('worker', doc._id, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to delete worker on remove:', err.message);
  }
});

module.exports = mongoose.model('Worker', workerSchema);