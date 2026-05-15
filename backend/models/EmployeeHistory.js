const mongoose = require('mongoose');

const employeeHistorySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  actionType: {
    type: String,
    enum: ['Created', 'Updated', 'Deleted', 'Restored', 'Relieved'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  beforeData: {
    type: Object
  },
  afterData: {
    type: Object
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EmployeeHistory', employeeHistorySchema);
