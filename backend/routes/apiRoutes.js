const express = require('express');
const router = express.Router();
const { 
    getAttendance, 
    putAttendance, 
    getAttendanceSummary 
} = require('../controllers/attendanceController');
const {
    getWorkers,
    getWorkerById,
    getWorkerByRfid
} = require('../controllers/workerController');
const {
    getTasks,
    getTasksByDateRange
} = require('../controllers/taskController');
const {
    getWorkerSalaryReport
} = require('../controllers/salaryController');
const {
    getLeaves,
    getLeavesByDateRange: getLeavesByDateRangeController
} = require('../controllers/leaveController');
const {
    getAllFines,
    getWorkerFines
} = require('../controllers/fineController');
const {
    getDepartments
} = require('../controllers/departmentController');
const {
    getHolidays
} = require('../controllers/holidayController');
const {
    getTickets
} = require('../controllers/ticketController');
const {
    getSettings
} = require('../controllers/settingsController');
const { validateApiKey, authorizeApi } = require('../middleware/apiKeyMiddleware');
const apiRateLimiter = require('../middleware/rateLimiter');

// Middleware to inject subdomain from API key into req.body
// This allows reusing existing controllers that expect req.body.subdomain
const injectSubdomain = (req, res, next) => {
    if (req.apiKey && req.apiKey.subdomain) {
        req.body.subdomain = req.apiKey.subdomain;
    }
    next();
};

// Apply security and rate limiting to all routes in this router
router.use(apiRateLimiter);
router.use(validateApiKey);
router.use(injectSubdomain);

/**
 * @route   GET /api/external/attendance
 * @desc    Get attendance records with optional filters (date, rfid)
 * @access  Private (API Key)
 */
router.get('/attendance', authorizeApi('read'), async (req, res) => {
    try {
        const { date, rfid } = req.query;
        const { subdomain } = req.body;

        // Create query object
        let query = { subdomain };

        // 1. Filter by Date (Default to today if not provided)
        if (date) {
            query.date = date;
        } else {
            // Get today's date in India timezone (matching your controller logic)
            const indiaTime = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());
            query.date = indiaTime;
        }

        // 2. Filter by Worker RFID
        if (rfid) {
            query.rfid = rfid;
        }

        const attendanceData = await require('../models/Attendance')
            .find(query)
            .populate('worker', 'name username rfid')
            .populate('department', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: attendanceData.length,
            filter: { date: query.date, rfid: rfid || 'all' },
            attendance: attendanceData
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/external/attendance
 * @desc    Mark attendance for a worker via RFID
 * @access  Private (API Key)
 */
router.post('/attendance', authorizeApi('write'), (req, res, next) => {
    putAttendance(req, res, next);
});

/**
 * @route   GET /api/external/report
 * @desc    Get attendance summary/report
 * @access  Private (API Key)
 */
router.get('/report', authorizeApi('read'), (req, res, next) => {
    getAttendanceSummary(req, res, next);
});

// --- Worker Modules ---

/**
 * @route   GET /api/external/workers
 * @desc    Get all active workers
 * @access  Private (API Key)
 */
router.get('/workers', authorizeApi('read'), (req, res, next) => {
    getWorkers(req, res, next);
});

/**
 * @route   GET /api/external/workers/:id
 * @desc    Get worker by ID
 * @access  Private (API Key)
 */
router.get('/workers/:id', authorizeApi('read'), (req, res, next) => {
    getWorkerById(req, res, next);
});

/**
 * @route   POST /api/external/workers/rfid
 * @desc    Get worker by RFID
 * @access  Private (API Key)
 */
router.post('/workers/rfid', authorizeApi('read'), (req, res, next) => {
    getWorkerByRfid(req, res, next);
});

// --- Task Modules ---

/**
 * @route   GET /api/external/tasks
 * @desc    Get all tasks for the company
 * @access  Private (API Key)
 */
router.get('/tasks', authorizeApi('read'), (req, res, next) => {
    getTasks(req, res, next);
});

/**
 * @route   GET /api/external/tasks/range
 * @desc    Get tasks by date range
 * @access  Private (API Key)
 */
router.get('/tasks/range', authorizeApi('read'), (req, res, next) => {
    getTasksByDateRange(req, res, next);
});

// --- Salary Modules ---

/**
 * @route   GET /api/external/salary/report/:id
 * @desc    Get salary report for a worker
 * @access  Private (API Key)
 */
router.get('/salary/report/:id', authorizeApi('read'), (req, res, next) => {
    getWorkerSalaryReport(req, res, next);
});

// --- Leave Modules ---

/**
 * @route   GET /api/external/leaves
 * @desc    Get all leave applications for the company
 * @access  Private (API Key)
 */
router.get('/leaves', authorizeApi('read'), (req, res, next) => {
    // Manually set params for getLeaves controller
    req.params.subdomain = req.apiKey.subdomain;
    req.params.me = '0'; // Admin view
    getLeaves(req, res, next);
});

/**
 * @route   GET /api/external/leaves/range
 * @desc    Get leave applications by date range
 * @access  Private (API Key)
 */
router.get('/leaves/range', authorizeApi('read'), (req, res, next) => {
    // Ensure subdomain is set in req.user for this controller
    req.user = req.user || {};
    req.user.subdomain = req.apiKey.subdomain;
    getLeavesByDateRangeController(req, res, next);
});

// --- Fine Modules ---

/**
 * @route   GET /api/external/fines
 * @desc    Get all fines for the company
 * @access  Private (API Key)
 */
router.get('/fines', authorizeApi('read'), (req, res, next) => {
    getAllFines(req, res, next);
});

/**
 * @route   GET /api/external/workers/:id/fines
 * @desc    Get fines for a specific worker
 * @access  Private (API Key)
 */
router.get('/workers/:id/fines', authorizeApi('read'), (req, res, next) => {
    getWorkerFines(req, res, next);
});

// --- Department Modules ---

/**
 * @route   GET /api/external/departments
 * @desc    Get all departments for the company
 * @access  Private (API Key)
 */
router.get('/departments', authorizeApi('read'), (req, res, next) => {
    // Controller expects subdomain in req.body
    req.body.subdomain = req.apiKey.subdomain;
    getDepartments(req, res, next);
});

// --- Holiday Modules ---

/**
 * @route   GET /api/external/holidays
 * @desc    Get all holidays for the company
 * @access  Private (API Key)
 */
router.get('/holidays', authorizeApi('read'), (req, res, next) => {
    // Controller expects subdomain in req.params and user in req.user
    req.params.subdomain = req.apiKey.subdomain;
    req.user = req.user || { _id: 'api-key-system', role: 'admin' };
    getHolidays(req, res, next);
});

// --- Ticket/Helpdesk Modules ---

/**
 * @route   GET /api/external/tickets
 * @desc    Get all tickets for the company
 * @access  Private (API Key)
 */
router.get('/tickets', authorizeApi('read'), (req, res, next) => {
    // Controller expects subdomain in req.user or req.query
    req.user = req.user || { subdomain: req.apiKey.subdomain };
    req.user.subdomain = req.apiKey.subdomain;
    getTickets(req, res, next);
});

// --- Settings Modules ---

/**
 * @route   GET /api/external/settings
 * @desc    Get company settings
 * @access  Private (API Key)
 */
router.get('/settings', authorizeApi('read'), (req, res, next) => {
    // Controller expects subdomain in req.params
    req.params.subdomain = req.apiKey.subdomain;
    getSettings(req, res, next);
});

module.exports = router;
