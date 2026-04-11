const mongoose = require('mongoose');

const developerProjectSchema = new mongoose.Schema({
  developerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  projectName: {
    type: String,
    required: true
  },
  projectAmount: {
    type: Number,
    required: true
  },
  developerEarnings: {
    type: Number,
    required: true
  },
  projectDate: {
    type: Date,
    required: true
  },
  subdomain: {
    type: String,
    required: true
  },
  baseSalary: {
    type: Number,
  },
  actualSalary: {
    type: Number,
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

module.exports = mongoose.model('DeveloperProject', developerProjectSchema);