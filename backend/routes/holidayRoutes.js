const express = require('express');
const router = express.Router();
const {
  getHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidaysByDateRange,
  getUpcomingHolidays,
  getHolidaysByWorker,
  isHolidayForWorker
} = require('../controllers/holidayController');

const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/holidays/:subdomain
// @desc    Get all holidays for a subdomain
// @access  Private/Admin
router.get('/:subdomain', protect, getHolidays);

// @route   GET /api/holidays/:subdomain/upcoming
// @desc    Get upcoming holidays (next 30 days)
// @access  Private
router.get('/:subdomain/upcoming', protect, getUpcomingHolidays);

// @route   GET /api/holidays/:subdomain/range
// @desc    Get holidays by date range
// @access  Private/Admin
router.get('/:subdomain/range', protect, getHolidaysByDateRange);

// @route   GET /api/holidays/:subdomain/:id
// @desc    Get holiday by ID
// @access  Private/Admin
router.get('/:subdomain/:id', protect, getHolidayById);

// @route   GET /api/holidays/:subdomain/worker/:workerId
// @desc    Get holidays for a specific worker
// @access  Private/Admin
router.get('/:subdomain/worker/:workerId', protect, getHolidaysByWorker);

// @route   GET /api/holidays/:subdomain/worker/:workerId/date/:date
// @desc    Check if a specific date is a holiday for a worker
// @access  Private
router.get('/:subdomain/worker/:workerId/date/:date', protect, isHolidayForWorker);

// @route   POST /api/holidays
// @desc    Create a new holiday
// @access  Private/Admin
router.post('/', protect, createHoliday);

// @route   PUT /api/holidays/:id
// @desc    Update a holiday
// @access  Private/Admin
router.put('/:id', protect, updateHoliday);

// @route   DELETE /api/holidays/:id
// @desc    Delete a holiday
// @access  Private/Admin
router.delete('/:id', protect, deleteHoliday);

module.exports = router;