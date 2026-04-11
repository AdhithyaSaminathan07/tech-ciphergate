const asyncHandler = require('express-async-handler');
const Holiday = require('../models/Holiday');
const Admin = require('../models/Admin');

// @desc    Get all holidays
// @route   GET /api/holidays/:subdomain
// @access  Private/Admin
const getHolidays = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  const holidays = await Holiday.find({ subdomain })
    .populate('workers', 'name username') // Populate worker details
    .sort({ date: 1 }); // Sort by date ascending

  res.json(holidays);
});

// @desc    Get holiday by ID
// @route   GET /api/holidays/:subdomain/:id
// @access  Private/Admin
const getHolidayById = asyncHandler(async (req, res) => {
  const { subdomain, id } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  const holiday = await Holiday.findOne({ _id: id, subdomain })
    .populate('workers', 'name username');

  if (!holiday) {
    res.status(404);
    throw new Error('Holiday not found');
  }

  res.json(holiday);
});

// @desc    Create a new holiday
// @route   POST /api/holidays
// @access  Private/Admin
const createHoliday = asyncHandler(async (req, res) => {
  const { subdomain, holidayDesc, date, reason, appliesTo, workers, isPaid } = req.body;

  console.log('REQ BODY:', req.body);

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Company name is required, login again.');
  }

  if (!holidayDesc || !date || !reason) {
    res.status(400);
    throw new Error('Please fill in all required fields');
  }

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  // Check if holiday already exists for this date and subdomain
  const existingHoliday = await Holiday.findOne({ 
    subdomain, 
    date: new Date(date) 
  });

  if (existingHoliday) {
    res.status(400);
    throw new Error('Holiday already exists for this date');
  }

  const holiday = await Holiday.create({
    subdomain,
    holidayDesc,
    date,
    reason,
    appliesTo: appliesTo || 'all', // Default to 'all' for backward compatibility
    workers: workers || [],
    isPaid: isPaid !== undefined ? isPaid : true // Default to true for backward compatibility
  });

  // Populate worker details before sending response
  await holiday.populate('workers', 'name username');

  res.status(201).json(holiday);
});

// @desc    Update a holiday
// @route   PUT /api/holidays/:id
// @access  Private/Admin
const updateHoliday = asyncHandler(async (req, res) => {
  const { holidayDesc, date, reason, appliesTo, workers, isPaid } = req.body;

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  // Check if holiday exists
  const holiday = await Holiday.findById(req.params.id);
  if (!holiday) {
    res.status(404);
    throw new Error('Holiday not found');
  }

  // If date is being updated, check for conflicts
  if (date && date !== holiday.date.toISOString().split('T')[0]) {
    const existingHoliday = await Holiday.findOne({ 
      subdomain: holiday.subdomain, 
      date: new Date(date),
      _id: { $ne: req.params.id } // Exclude current holiday from check
    });

    if (existingHoliday) {
      res.status(400);
      throw new Error('Another holiday already exists for this date');
    }
  }

  // Update the holiday
  const updatedHoliday = await Holiday.findByIdAndUpdate(
    req.params.id,
    {
      holidayDesc: holidayDesc || holiday.holidayDesc,
      date: date || holiday.date,
      reason: reason || holiday.reason,
      appliesTo: appliesTo || holiday.appliesTo || 'all',
      workers: workers || holiday.workers || [],
      isPaid: isPaid !== undefined ? isPaid : (holiday.isPaid !== undefined ? holiday.isPaid : true)
    },
    { new: true } // Return the updated document
  );

  // Populate worker details before sending response
  await updatedHoliday.populate('workers', 'name username');

  res.json(updatedHoliday);
});

// @desc    Delete a holiday
// @route   DELETE /api/holidays/:id
// @access  Private/Admin
const deleteHoliday = asyncHandler(async (req, res) => {
  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  // Check if holiday exists
  const holiday = await Holiday.findById(req.params.id);
  if (!holiday) {
    res.status(404);
    throw new Error('Holiday not found');
  }

  await Holiday.findByIdAndDelete(req.params.id);

  res.json({ message: 'Holiday deleted successfully', id: req.params.id });
});

// @desc    Get holidays by date range
// @route   GET /api/holidays/:subdomain/range
// @access  Private/Admin
const getHolidaysByDateRange = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;
  const { startDate, endDate } = req.query;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide start and end dates');
  }

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  const holidays = await Holiday.find({
    subdomain,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
  .populate('workers', 'name username')
  .sort({ date: 1 });

  res.json(holidays);
});

// @desc    Get upcoming holidays (next 30 days)
// @route   GET /api/holidays/:subdomain/upcoming
// @access  Private
const getUpcomingHolidays = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const holidays = await Holiday.find({
    subdomain,
    date: {
      $gte: today,
      $lte: thirtyDaysFromNow
    }
  })
  .populate('workers', 'name username')
  .sort({ date: 1 });

  res.json(holidays);
});

// @desc    Get holidays for a specific worker
// @route   GET /api/holidays/:subdomain/worker/:workerId
// @access  Private/Admin
const getHolidaysByWorker = asyncHandler(async (req, res) => {
  const { subdomain, workerId } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  // Check if user is admin
  const user = await Admin.findById(req.user._id).select('-password');
  if (!user) {
    res.status(403);
    throw new Error("Access denied. Admin access required.");
  }

  const holidays = await Holiday.find({
    subdomain,
    $or: [
      { appliesTo: 'all' }, // Company-wide holidays
      { workers: workerId } // Specific worker holidays
    ]
  })
  .populate('workers', 'name username')
  .sort({ date: 1 });

  res.json(holidays);
});

// @desc    Check if a specific date is a holiday for a worker
// @route   GET /api/holidays/:subdomain/worker/:workerId/date/:date
// @access  Private
const isHolidayForWorker = asyncHandler(async (req, res) => {
  const { subdomain, workerId, date } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  const holidayDate = new Date(date);

  const holiday = await Holiday.findOne({
    subdomain,
    date: holidayDate,
    $or: [
      { appliesTo: 'all' }, // Company-wide holidays
      { workers: workerId } // Specific worker holidays
    ]
  });

  res.json({
    isHoliday: !!holiday,
    holiday: holiday || null
  });
});

module.exports = {
  getHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidaysByDateRange,
  getUpcomingHolidays,
  getHolidaysByWorker,
  isHolidayForWorker
};