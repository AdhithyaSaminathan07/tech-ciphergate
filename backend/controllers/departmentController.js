const Department = require('../models/Department');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance'); // Added import
const asyncHandler = require('express-async-handler');

const createDepartment = asyncHandler(async (req, res) => {
  const {
    name,
    subdomain,
    departmentType,
    description,
    projectStatus,
    projectPriority,
    frontendStack,
    backendStack,
    database,
    cloudProvider,
    deploymentUrl,
    primaryRepoUrl,
    moduleRepos,
    documentationRepoUrl,
    projectLead,
    projectManager,
    assignedDevelopers
  } = req.body;

  // Validate input
  if (!name || name.trim().length < 2) {
    res.status(400);
    throw new Error('Department name must be at least 2 characters long');
  }

  if (!subdomain || subdomain == 'main') {
    res.status(400);
    throw new Error('Company name is missing, login again.');
  }

  try {
    const existingDepartment = await Department.findOne({
      name: name.trim()
    });

    if (existingDepartment) {
      res.status(400);
      throw new Error('Department with this name already exists.');
    }

    // Create department with project metadata
    const department = new Department({
      name: name.trim(),
      subdomain,
      departmentType: departmentType || 'Project',
      description,
      projectStatus: projectStatus || 'In Progress',
      projectPriority: projectPriority || 'Medium',
      frontendStack,
      backendStack,
      database,
      cloudProvider,
      deploymentUrl,
      primaryRepoUrl,
      moduleRepos: Array.isArray(moduleRepos) ? moduleRepos : [],
      documentationRepoUrl,
      projectLead: projectLead || undefined,
      projectManager: projectManager || undefined,
      assignedDevelopers: Array.isArray(assignedDevelopers) ? assignedDevelopers : []
    });

    await department.save();

    await department.populate([
      { path: 'projectLead', select: 'name username photo' },
      { path: 'projectManager', select: 'name username photo' },
      { path: 'assignedDevelopers', select: 'name username photo' }
    ]);

    // Get worker count
    const workerCount = await Worker.countDocuments({
      department: department._id,
      status: 'Active'
    });

    // Prepare response
    const departmentResponse = {
      ...department.toObject(),
      workerCount
    };

    // Trigger Second Brain sync hook (non-blocking)
    try {
      const { syncBrainItem } = require('../services/secondBrainService');
      syncBrainItem('project', department, subdomain).catch(err => 
        console.error('[SecondBrainSync] Project sync error:', err.message)
      );
    } catch (e) {
      // Service might not be created yet, will sync later
    }

    res.status(201).json(departmentResponse);
  } catch (error) {
    console.error('Department Creation Error:', error);
    throw error;
  }
});

const getDepartments = asyncHandler(async (req, res) => {
  const subdomain = req.body.subdomain || req.query.subdomain;
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid.');
  }

  try {
    const page = parseInt(req.query.page) || parseInt(req.body.page) || null;
    const limit = parseInt(req.query.limit) || parseInt(req.body.limit) || 10;

    let query = { subdomain };
    const total = await Department.countDocuments(query);

    let departmentsQuery = Department
      .find(query)
      .populate([
        { path: 'projectLead', select: 'name username photo' },
        { path: 'projectManager', select: 'name username photo' },
        { path: 'assignedDevelopers', select: 'name username photo' }
      ])
      .sort({ createdAt: -1 });

    if (page !== null) {
      departmentsQuery = departmentsQuery.skip((page - 1) * limit).limit(limit);
    }

    const departments = await departmentsQuery;

    // Get today's date in India Timezone
    const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const currentDateFormatted = indiaTimezoneDate.format(new Date());

    // 2. Pre-fetch all active workers and today's presence in one go
    const allActiveWorkers = await Worker
      .find({ subdomain, status: 'Active' })
      .select('name photo department')
      .lean();

    const presentWorkerIds = await Attendance.distinct('worker', {
      subdomain,
      date: currentDateFormatted,
      presence: true
    });
    const presentWorkersSet = new Set(presentWorkerIds.map(id => id.toString()));

    // Group employees by department ID for fast O(1) lookup
    const employeesByDept = {};
    allActiveWorkers.forEach(w => {
      const deptId = w.department ? w.department.toString() : 'none';
      if (!employeesByDept[deptId]) employeesByDept[deptId] = [];
      employeesByDept[deptId].push(w);
    });

    const departmentsWithData = departments.map((department) => {
      const deptIdStr = department._id.toString();
      const employees = employeesByDept[deptIdStr] || [];
      const workerIds = employees.map(e => e._id.toString());

      let percentage = 0;
      let presentCount = 0;

      if (workerIds.length > 0) {
        presentCount = workerIds.filter(id => presentWorkersSet.has(id)).length;
        percentage = Math.round((presentCount / workerIds.length) * 100);
      }

      return {
        // Spread the original department fields (_id, name, createdAt, etc.)
        ...department.toObject(),
        workerCount: employees.length,
        employees,  // [{ name, photo }, …]
        attendancePercentage: percentage,
        presentCount // Optional: helpful for debugging or detailed display
      };
    });

    if (page !== null) {
      res.json({
        departments: departmentsWithData,
        hasMore: page * limit < total,
        total
      });
    } else {
      res.json(departmentsWithData);
    }

  } catch (error) {
    console.error('Get Departments Error:', error);
    res.status(500).json({ message: 'Failed to fetch departments.' });
  }
});


const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);

  if (!department) {
    res.status(404);
    throw new Error('Department not found');
  }

  // Check for associated active workers
  const activeWorkerCount = await Worker.countDocuments({
    department: req.params.id,
    status: 'Active'
  });

  if (activeWorkerCount > 0) {
    res.status(400);
    throw new Error(`Cannot delete department. ${activeWorkerCount} active workers are assigned.`);
  }

  // Set department to null for any remaining non-active workers (Relieved or Deleted)
  await Worker.updateMany(
    { department: req.params.id },
    { $set: { department: null } }
  );

  await department.deleteOne();
  res.json({
    message: 'Department removed successfully',
    departmentId: req.params.id
  });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    departmentType,
    description,
    projectStatus,
    projectPriority,
    frontendStack,
    backendStack,
    database,
    cloudProvider,
    deploymentUrl,
    primaryRepoUrl,
    moduleRepos,
    documentationRepoUrl,
    projectLead,
    projectManager,
    assignedDevelopers
  } = req.body;

  // Validate input
  if (!name || name.trim().length < 2) {
    res.status(400);
    throw new Error('Department name must be at least 2 characters long');
  }

  try {
    // Check for existing department (case-insensitive)
    const existingDepartment = await Department.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      _id: { $ne: id } // Exclude current department
    });

    if (existingDepartment) {
      res.status(400);
      throw new Error('A department with this name already exists');
    }

    // Find the department and update with exact case
    const department = await Department.findById(id);

    if (!department) {
      res.status(404);
      throw new Error('Department not found');
    }

    department.name = name.trim();
    if (departmentType) department.departmentType = departmentType;
    if (description !== undefined) department.description = description;
    if (projectStatus) department.projectStatus = projectStatus;
    if (projectPriority) department.projectPriority = projectPriority;
    if (frontendStack !== undefined) department.frontendStack = frontendStack;
    if (backendStack !== undefined) department.backendStack = backendStack;
    if (database !== undefined) department.database = database;
    if (cloudProvider !== undefined) department.cloudProvider = cloudProvider;
    if (deploymentUrl !== undefined) department.deploymentUrl = deploymentUrl;
    if (primaryRepoUrl !== undefined) department.primaryRepoUrl = primaryRepoUrl;
    if (moduleRepos !== undefined) department.moduleRepos = Array.isArray(moduleRepos) ? moduleRepos : [];
    if (documentationRepoUrl !== undefined) department.documentationRepoUrl = documentationRepoUrl;
    if (projectLead !== undefined) department.projectLead = projectLead || undefined;
    if (projectManager !== undefined) department.projectManager = projectManager || undefined;
    if (assignedDevelopers !== undefined) department.assignedDevelopers = Array.isArray(assignedDevelopers) ? assignedDevelopers : [];

    await department.save(); // Use save() to trigger validation

    await department.populate([
      { path: 'projectLead', select: 'name username photo' },
      { path: 'projectManager', select: 'name username photo' },
      { path: 'assignedDevelopers', select: 'name username photo' }
    ]);

    // Get worker count
    const workerCount = await Worker.countDocuments({
      department: department._id,
      status: 'Active'
    });

    // Prepare response
    const departmentResponse = {
      ...department.toObject(),
      workerCount
    };

    // Trigger Second Brain sync hook (non-blocking)
    try {
      const { syncBrainItem } = require('../services/secondBrainService');
      syncBrainItem('project', department, department.subdomain).catch(err => 
        console.error('[SecondBrainSync] Project sync error:', err.message)
      );
    } catch (e) {
      // Service might not be created yet, will sync later
    }

    res.json(departmentResponse);
  } catch (error) {
    // Handle specific errors
    if (error.code === 11000) {
      res.status(400);
      throw new Error('A department with this name already exists');
    }

    // Rethrow other errors
    throw error;
  }
});

module.exports = {
  createDepartment,
  getDepartments,
  deleteDepartment,
  updateDepartment
};