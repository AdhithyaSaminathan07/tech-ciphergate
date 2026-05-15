const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Task = require('../models/Task');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const EmployeeHistory = require('../models/EmployeeHistory');
// const nodemailer = require('nodemailer');
// const QRCode = require('qrcode');

// @desc    Create new worker
// @route   POST /api/workers
// @access  Private/Admin
const createWorker = asyncHandler(async (req, res) => {
  try {
    // Handle both object and string formats for subdomain
    const subdomain = typeof req.body === 'object' && req.body.subdomain
      ? req.body.subdomain.trim()
      : '';

    // Trim and validate name with extra checks
    const name = req.body.name ? req.body.name.trim() : '';
    const username = req.body.username ? req.body.username.trim() : '';
    const rfid = req.body.rfid ? req.body.rfid.trim() : '';
    // FIX: Convert salary to string before calling trim(), then back to number
    const salary = req.body.salary ? Number(String(req.body.salary).trim()) : 0;
    const finalSalary = req.body.salary ? Number(String(req.body.salary).trim()) : 0;
    const password = req.body.password ? req.body.password.trim() : '';
    const department = req.body.department ? req.body.department.trim() : '';
    const photo = req.body.photo ? req.body.photo.trim() : '';
    const batch = req.body.batch ? req.body.batch.trim() : ''; // ADDED THIS
    const faceEmbeddings = req.body.faceEmbeddings ? req.body.faceEmbeddings : []; // ADDED THIS
    const employeeType = req.body.employeeType ? req.body.employeeType.trim() : 'intern';
    const classValue = req.body.class ? req.body.class.trim() : 'A';
    const email = req.body.email ? req.body.email.trim() : '';
    const phoneNumber = req.body.phoneNumber ? req.body.phoneNumber.trim() : '';
    const joiningDate = req.body.joiningDate ? req.body.joiningDate : new Date();
    const designation = req.body.designation ? req.body.designation.trim() : 'Employee';
    const bankDetails = req.body.bankDetails || {};
    let perDaySalary = 0;

    if (salary <= 0) {
      res.status(400);
      throw new Error('Minimum salary is required and cannot be empty');
    }

    perDaySalary = salary / 30;

    // Comprehensive server-side validation
    if (!name || name.length === 0) {
      res.status(400);
      throw new Error('Name is required and cannot be empty');
    }

    if (!username) {
      res.status(400);
      throw new Error('Username is required and cannot be empty');
    }

    if (!subdomain) {
      res.status(400);
      throw new Error('Company name is required, login again.');
    }

    if (!password) {
      res.status(400);
      throw new Error('Password is required and cannot be empty');
    }

    if (!department) {
      res.status(400);
      throw new Error('Department is required');
    }

    // Check if worker exists
    const workerExists = await Worker.findOne({ username });
    if (workerExists) {
      res.status(400);
      throw new Error('Worker with this username already exists');
    }

    // Validate department
    const departmentDoc = await Department.findById(department);
    if (!departmentDoc) {
      res.status(400);
      throw new Error('Invalid department');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create worker
    const worker = await Worker.create({
      name,
      username,
      rfid,
      salary,
      finalSalary,
      perDaySalary,
      subdomain,
      password: hashedPassword,
      department: departmentDoc._id,
      photo: photo || '',
      batch, // ADDED THIS
      faceEmbeddings: faceEmbeddings || [], // ADDED THIS
      employeeType,
      class: classValue,
      email,
      phoneNumber,
      joiningDate,
      designation,
      original_certificate_status: req.body.original_certificate_status || 'not_submitted', // ADDED
      certificate_notes: req.body.certificate_notes || '', // ADDED
      bankDetails: {
        accountHolderName: bankDetails.accountHolderName ? bankDetails.accountHolderName.trim() : '',
        bankName: bankDetails.bankName ? bankDetails.bankName.trim() : '',
        accountNumber: bankDetails.accountNumber ? bankDetails.accountNumber.trim() : '',
        ifscCode: bankDetails.ifscCode ? bankDetails.ifscCode.trim() : '',
        branchName: bankDetails.branchName ? bankDetails.branchName.trim() : '',
        upiId: bankDetails.upiId ? bankDetails.upiId.trim() : ''
      },
      totalPoints: 0
    });

    await EmployeeHistory.create({
      employee: worker._id,
      actionType: 'Created',
      performedBy: req.user ? req.user._id : null,
      afterData: worker.toObject()
    });

    res.status(201).json({
      _id: worker._id,
      name: worker.name,
      username: worker.username,
      salary: worker.salary,
      finalSalary: worker.finalSalary,
      perDaySalary: worker.perDaySalary,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: departmentDoc.name,
      photo: worker.photo,
      batch: worker.batch, // ADDED THIS
      faceEmbeddings: worker.faceEmbeddings, // ADDED THIS
      faceEnrolled: worker.faceEnrolled,
      employeeType: worker.employeeType,
      class: worker.class,
      email: worker.email,
      phoneNumber: worker.phoneNumber,
      joiningDate: worker.joiningDate,
      designation: worker.designation,
      status: worker.status,
      bankDetails: worker.bankDetails
    });

  } catch (error) {
    console.error('Worker Creation Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to create worker');
  }
});
// Generate an unique RFID
const generateUniqueRFID = async () => {
  const generateRFID = () => {
    const letters = String.fromCharCode(
      65 + Math.floor(Math.random() * 26),
      65 + Math.floor(Math.random() * 26)
    );
    const numbers = Math.floor(1000 + Math.random() * 9000).toString();
    return `${letters}${numbers}`;
  };

  let rfid;
  let isUnique = false;

  while (!isUnique) {
    rfid = await generateRFID();
    const existingWorker = await Worker.findOne({ rfid });
    if (!existingWorker) {
      isUnique = true;
    }
  }

  return rfid;
};

// @desc    Check if an RFID is unique
// @route   POST /api/workers/check-rfid
// @access  Public or Protected (depending on your use case)
const generateId = asyncHandler(async (req, res) => {
  const rfid = await generateUniqueRFID();

  res.status(200).json({
    rfid: rfid,
    message: "ID was generated"
  });
});

// @desc    Get all workers
// @route   GET /api/workers
// @access  Private/Admin
const getWorkers = asyncHandler(async (req, res) => {
  try {
    // Handle both object and string formats for subdomain
    const subdomain = typeof req.body === 'object' && req.body.subdomain
      ? req.body.subdomain
      : req.body;

    const query = { subdomain };
    const statusParam = req.query.status || req.body.status;
    if (statusParam) {
      if (statusParam !== 'all') {
        query.status = statusParam;
      }
    } else {
      // Cross-module consistency fix: Only active by default
      query.status = 'Active';
    }

    const workers = await Worker.find(query)
      .select('-password')
      .populate('department', 'name');

    // Transform workers to include department name and full photo URL
    const transformedWorkers = workers.map(worker => ({
      ...worker.toObject(),
      department: worker.department ? worker.department.name : 'N/A',
      photoUrl: worker.photo
        ? `/uploads/${worker.photo}`
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`
    }));

    res.json(transformedWorkers);
  } catch (error) {
    console.error('Get Workers Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers');
  }
});
const getPublicWorkers = asyncHandler(async (req, res) => {
  try {
    // Handle both object and string formats for subdomain
    const subdomain = typeof req.body === 'object' && req.body.subdomain
      ? req.body.subdomain
      : req.body;

    const query = { subdomain };
    if (req.query.status && req.query.status === 'all') {
      // allow fetching all if explicitly requested
    } else {
      query.status = 'Active';
    }

    const workers = await Worker.find(query)
      .select('name username subdomain department photo employeeType class status')
      .populate('department', 'name');

    const transformedWorkers = workers.map(worker => ({
      _id: worker._id,
      name: worker.name,
      username: worker.username,
      subdomain: worker.subdomain,
      department: worker.department ? worker.department.name : 'Unassigned',
      photo: worker.photo,
      employeeType: worker.employeeType,
      class: worker.class
    }));

    res.json(transformedWorkers);
  } catch (error) {
    console.error('Get Public Workers Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers');
  }
});
// @desc    Get worker by ID
// @route   GET /api/workers/:id
// @access  Private
const getWorkerById = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id)
      .select('-password')
      .populate('department', 'name');

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    res.json(worker);
  } catch (error) {
    console.error('Get Worker by ID Error:', error);
    res.status(404);
    throw new Error(error.message || 'Worker not found');
  }
});

// @desc    Update worker 
// @route   PUT /api/workers/:id
// @access  Private/Admin
const updateWorker = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    const { name, username, salary, department, password, photo, batch, faceEmbeddings, employeeType, class: classValue, status, email, phoneNumber, joiningDate, designation, bankDetails } = req.body; // ADDED status and new fields
    const updateData = {};

    const isAdmin = req.user && req.user.role === 'admin';
    const isSelf = req.user && req.user._id.toString() === req.params.id;

    if (!isAdmin && !isSelf) {
      res.status(403);
      throw new Error('Not authorized to update this worker');
    }

    if (!isAdmin) {
      // Workers can only update these fields
      if (photo) updateData.photo = photo;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password, salt);
        updateData.passwordChangedAt = Date.now() - 1000;
      }
    } else {
      // Admin can update everything
      // Validate department if provided
      if (department) {
        const departmentExists = await Department.findById(department);
        if (!departmentExists) {
          res.status(400);
          throw new Error('Invalid department');
        }
        updateData.department = department;
      }

      // Update status if provided
      if (status) {
        updateData.status = status;
      }

      // Update name if provided
      if (name) updateData.name = name;

      // Update username if provided and ensure uniqueness
      if (username) {
        const usernameExists = await Worker.findOne({
          username,
          _id: { $ne: req.params.id }
        });
        if (usernameExists) {
          res.status(400);
          throw new Error('Username already exists');
        }
        updateData.username = username;
      }

      // Update photo if provided
      if (photo) {
        updateData.photo = photo;
      }

      // Handle password update
      if (password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password, salt);
        updateData.passwordChangedAt = Date.now() - 1000;
      }

      // ADDED: Handle batch update
      if (batch) {
        updateData.batch = batch;
      }

      // ADDED: Handle face embeddings update
      if (faceEmbeddings && faceEmbeddings.length > 0) {
        updateData.faceEmbeddings = faceEmbeddings;
      }

      // ADDED: Handle employeeType update
      if (employeeType) {
        updateData.employeeType = employeeType;
      }

      // ADDED: Handle class update
      if (classValue) {
        updateData.class = classValue;
      }
      
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (joiningDate !== undefined) updateData.joiningDate = joiningDate;
      if (designation !== undefined) updateData.designation = designation;

      // ADDED: Certificate Tracking Logic
      if (req.body.original_certificate_status) {
        updateData.original_certificate_status = req.body.original_certificate_status;
      }

      if (req.body.certificate_notes !== undefined) {
        updateData.certificate_notes = req.body.certificate_notes;
      }

      if (bankDetails) {
        updateData.bankDetails = {
          accountHolderName: bankDetails.accountHolderName ? bankDetails.accountHolderName.trim() : '',
          bankName: bankDetails.bankName ? bankDetails.bankName.trim() : '',
          accountNumber: bankDetails.accountNumber ? bankDetails.accountNumber.trim() : '',
          ifscCode: bankDetails.ifscCode ? bankDetails.ifscCode.trim() : '',
          branchName: bankDetails.branchName ? bankDetails.branchName.trim() : '',
          upiId: bankDetails.upiId ? bankDetails.upiId.trim() : ''
        };
      }

      // Update salary-related fields if salary is provided
      if (salary) {
        const numericSalary = Number(salary);
        if (isNaN(numericSalary) || numericSalary <= 0) {
          res.status(400);
          throw new Error('Invalid salary value');
        }

        updateData.salary = numericSalary;
        updateData.finalSalary = numericSalary;
        updateData.perDaySalary = numericSalary / 30;
      }
    }

    const beforeData = worker.toObject();

    // Determine if any change actually occurred
    const hasStatusChanged = updateData.status && updateData.status !== worker.status;
    const hasOtherChanges = Object.keys(updateData).some(key => {
      // Skip status as we check it separately
      if (key === 'status' || key === 'password') return false;
      
      // Basic comparison for other fields
      return String(updateData[key]) !== String(worker[key]);
    });
    const passwordChanged = !!password;

    if (!hasStatusChanged && !hasOtherChanges && !passwordChanged) {
        return res.json(worker);
    }

    // Perform the update
    const updatedWorker = await Worker.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('department', 'name');

    let actionType = 'Updated';
    if (hasStatusChanged) {
       if (updateData.status === 'Relieved') actionType = 'Relieved';
       else if (updateData.status === 'Active' && worker.status === 'Deleted') actionType = 'Restored';
       else if (updateData.status === 'Active' && worker.status === 'Relieved') actionType = 'Restored';
    }

    await EmployeeHistory.create({
      employee: updatedWorker._id,
      actionType,
      performedBy: req.user ? req.user._id : null,
      beforeData,
      afterData: updatedWorker.toObject()
    });

    res.json({
      _id: updatedWorker._id,
      name: updatedWorker.name,
      username: updatedWorker.username,
      salary: updatedWorker.salary,
      perDaySalary: updatedWorker.perDaySalary,
      finalSalary: updatedWorker.finalSalary,
      department: updatedWorker.department ? updatedWorker.department.name : 'N/A',
      photo: updatedWorker.photo,
      batch: updatedWorker.batch, // ADDED this to the response
      faceEmbeddings: updatedWorker.faceEmbeddings, // ADDED this to the response
      faceEnrolled: updatedWorker.faceEnrolled,
      employeeType: updatedWorker.employeeType,
      class: updatedWorker.class,
      email: updatedWorker.email,
      phoneNumber: updatedWorker.phoneNumber,
      joiningDate: updatedWorker.joiningDate,
      designation: updatedWorker.designation,
      status: updatedWorker.status,
      bankDetails: updatedWorker.bankDetails
    });
  } catch (error) {
    console.error('Update Worker Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to update worker');
  }
});

// @desc    Delete worker
// @route   DELETE /api/workers/:id
// @access  Private/Admin
const deleteWorker = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    const beforeWorker = worker.toObject();

    worker.status = 'Deleted';
    await worker.save();

    await EmployeeHistory.create({
      employee: worker._id,
      actionType: 'Deleted',
      performedBy: req.user ? req.user._id : null,
      beforeData: beforeWorker,
      afterData: worker.toObject()
    });

    res.json({ message: 'Worker soft-deleted successfully' });
  } catch (error) {
    console.error('Delete Worker Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to delete worker');
  }
});

// @desc    Get worker activities
// @route   GET /api/workers/:id/activities
// @access  Private
const getWorkerActivities = asyncHandler(async (req, res) => {
  try {
    const tasks = await Task.find({ worker: req.params.id })
      .populate('topics', 'name points')
      .populate('department', 'name')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Get Worker Activities Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve worker activities');
  }
});

// @desc    Reset worker activities
// @route   DELETE /api/workers/:id/activities
// @access  Private/Admin
const resetWorkerActivities = asyncHandler(async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    // Delete all tasks for this worker
    await Task.deleteMany({ worker: req.params.id });

    // Reset worker points
    worker.totalPoints = 0;
    worker.topicPoints = {};
    worker.lastSubmission = {};
    await worker.save();

    res.json({ message: 'Worker activities reset successfully' });
  } catch (error) {
    console.error('Reset Worker Activities Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to reset worker activities');
  }
});

// @desc    Get workers by department
// @route   GET /api/workers/department/:departmentId
// @access  Private/Admin
const getWorkersByDepartment = asyncHandler(async (req, res) => {
  try {
    const workers = await Worker.find({ 
      department: req.params.departmentId,
      status: { $ne: 'Relieved' }
    })
      .select('-password')
      .populate('department', 'name');

    res.json(workers);
  } catch (error) {
    console.error('Get Workers by Department Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve workers by department');
  }
});

// @desc    Get worker by RFID
// @route   POST /api/worker/get-worker-by-rfid
// @access  Private
const getWorkerByRfid = asyncHandler(async (req, res) => {
  try {
    const { rfid } = req.body;

    if (!rfid) {
      res.status(400);
      throw new Error('RFID is required');
    }

    const worker = await Worker.findOne({ rfid })
      .select('-password')
      .populate('department', 'name');

    if (!worker) {
      res.status(404);
      throw new Error('Worker not found');
    }

    res.json({
      worker: {
        _id: worker._id,
        name: worker.name,
        username: worker.username,
        rfid: worker.rfid,
        subdomain: worker.subdomain,
        department: worker.department ? worker.department.name : 'N/A',
        photo: worker.photo,
        faceEnrolled: worker.faceEnrolled,
        employeeType: worker.employeeType,
        class: worker.class
      }
    });
  } catch (error) {
    console.error('Get Worker by RFID Error:', error);
    res.status(400);
    throw new Error(error.message || 'Failed to retrieve worker');
  }
});

// @desc    Get complete employee history
// @route   GET /api/workers/history
// @access  Private/Admin
const getEmployeeHistory = asyncHandler(async (req, res) => {
  try {
    const filters = {};
    if (req.query.employee) filters.employee = req.query.employee;
    if (req.query.actionType) filters.actionType = req.query.actionType;

    const history = await EmployeeHistory.find(filters)
      .populate('employee', 'name username status')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(history);
  } catch (error) {
    console.error('Get Employee History Error:', error);
    res.status(500);
    throw new Error('Failed to retrieve employee history');
  }
});

module.exports = {
  getWorkers,
  createWorker,
  getWorkerById,
  updateWorker,
  deleteWorker,
  getWorkerActivities,
  resetWorkerActivities,
  getWorkersByDepartment,
  getPublicWorkers,
  generateId,
  getWorkerByRfid,
  getEmployeeHistory
};