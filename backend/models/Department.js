const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    unique: true,
    trim: true,
  },
  subdomain: {
    type: String,
    required: [true, 'Company name is missing'],
  },
  departmentType: {
    type: String,
    enum: ['Department', 'Project', 'Product'],
    default: 'Project'
  },
  description: {
    type: String,
    trim: true
  },
  projectStatus: {
    type: String,
    enum: ['To Do', 'In Progress', 'Review', 'Done', 'Cancelled'],
    default: 'In Progress'
  },
  projectPriority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  frontendStack: {
    type: String,
    trim: true
  },
  backendStack: {
    type: String,
    trim: true
  },
  database: {
    type: String,
    trim: true
  },
  cloudProvider: {
    type: String,
    trim: true
  },
  deploymentUrl: {
    type: String,
    trim: true
  },
  primaryRepoUrl: {
    type: String,
    trim: true
  },
  moduleRepos: {
    type: [String],
    default: []
  },
  documentationRepoUrl: {
    type: String,
    trim: true
  },
  projectLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  },
  projectManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  },
  assignedDevelopers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

departmentSchema.pre('save', async function(next) {
  console.log('Pre-save Hook - Original Name:', this.name);
  
  if (this.isModified('name')) {
    // Remove any automatic transformations
    this.name = this.name.trim();
    
    console.log('Pre-save Hook - Processed Name:', this.name);

    const existingDepartment = await this.constructor.findOne({ 
      name: this.name
    });

    if (existingDepartment && existingDepartment._id.toString() !== this._id.toString()) {
      const error = new Error('A department with this name already exists');
      return next(error);
    }
  }
  next();
});

departmentSchema.post('save', async function(doc) {
  try {
    const { syncBrainItem } = require('../services/secondBrainService');
    await syncBrainItem('project', doc, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to sync project on save:', err.message);
  }
});

departmentSchema.post('remove', async function(doc) {
  try {
    const { deleteBrainItem } = require('../services/secondBrainService');
    await deleteBrainItem('project', doc._id, doc.subdomain);
  } catch (err) {
    console.error('[SecondBrain Sync] Failed to delete project on remove:', err.message);
  }
});

module.exports = mongoose.model('Department', departmentSchema);