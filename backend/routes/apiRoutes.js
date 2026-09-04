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
const {
    createInvoice,
    updateInvoice,
    getInvoiceById,
    deleteInvoice
} = require('../controllers/invoiceController');
const {
    getLeaderboard
} = require('../controllers/performanceController');
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

// Middleware to mock the user context based on API Key's subdomain.
// Since the invoice controller requires req.user.role and req.user._id,
// we locate the Admin associated with this subdomain and assign it to req.user.
const mockUserFromSubdomain = async (req, res, next) => {
    try {
        const subdomain = req.apiKey.subdomain;
        const AdminModel = require('../models/Admin');
        const adminInstance = await AdminModel.findOne({ subdomain });
        if (!adminInstance) {
            return res.status(404).json({
                success: false,
                message: `No Admin found for subdomain: ${subdomain}`
            });
        }
        req.user = adminInstance.toObject();
        req.user.role = 'admin';
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Middleware to verify the requested invoice belongs to the API Key's subdomain.
// Prevents cross-tenant queries/mutations.
const verifyInvoiceSubdomain = async (req, res, next) => {
    try {
        const { id } = req.params;
        const subdomain = req.apiKey.subdomain;
        
        // Validate ObjectId
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid invoice ID'
            });
        }
        
        const InvoiceModel = require('../models/Invoice');
        const invoiceInstance = await InvoiceModel.findById(id);
        if (!invoiceInstance) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }
        
        // Fetch creator to check their subdomain
        const AdminModel = require('../models/Admin');
        const WorkerModel = require('../models/Worker');
        
        let creator = await AdminModel.findById(invoiceInstance.createdBy);
        if (!creator) {
            creator = await WorkerModel.findById(invoiceInstance.createdBy);
        }
        
        if (!creator || creator.subdomain !== subdomain) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Invoice does not belong to your subdomain.'
            });
        }
        
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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
router.get('/attendance', authorizeApi('attendance', 'read'), async (req, res) => {
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
router.post('/attendance', authorizeApi('attendance', 'write'), (req, res, next) => {
    putAttendance(req, res, next);
});

/**
 * @route   GET /api/external/report
 * @desc    Get attendance summary/report
 * @access  Private (API Key)
 */
router.get('/report', authorizeApi('attendance', 'read'), (req, res, next) => {
    getAttendanceSummary(req, res, next);
});

// --- Worker Modules ---

/**
 * @route   GET /api/external/workers
 * @desc    Get all active workers
 * @access  Private (API Key)
 */
router.get('/workers', authorizeApi('workers', 'read'), (req, res, next) => {
    getWorkers(req, res, next);
});

/**
 * @route   GET /api/external/workers/:id
 * @desc    Get worker by ID
 * @access  Private (API Key)
 */
router.get('/workers/:id', authorizeApi('workers', 'read'), (req, res, next) => {
    getWorkerById(req, res, next);
});

/**
 * @route   POST /api/external/workers/rfid
 * @desc    Get worker by RFID
 * @access  Private (API Key)
 */
router.post('/workers/rfid', authorizeApi('workers', 'read'), (req, res, next) => {
    getWorkerByRfid(req, res, next);
});

// --- Task Modules ---

/**
 * @route   GET /api/external/tasks
 * @desc    Get all tasks for the company
 * @access  Private (API Key)
 */
router.get('/tasks', authorizeApi('tasks', 'read'), (req, res, next) => {
    getTasks(req, res, next);
});

/**
 * @route   GET /api/external/tasks/range
 * @desc    Get tasks by date range
 * @access  Private (API Key)
 */
router.get('/tasks/range', authorizeApi('tasks', 'read'), (req, res, next) => {
    getTasksByDateRange(req, res, next);
});

// --- Salary Modules ---

/**
 * @route   GET /api/external/salary/report/:id
 * @desc    Get salary report for a worker
 * @access  Private (API Key)
 */
router.get('/salary/report/:id', authorizeApi('salary', 'read'), (req, res, next) => {
    getWorkerSalaryReport(req, res, next);
});

// --- Leave Modules ---

/**
 * @route   GET /api/external/leaves
 * @desc    Get all leave applications for the company
 * @access  Private (API Key)
 */
router.get('/leaves', authorizeApi('leaves', 'read'), (req, res, next) => {
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
router.get('/leaves/range', authorizeApi('leaves', 'read'), (req, res, next) => {
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
router.get('/fines', authorizeApi('fines', 'read'), (req, res, next) => {
    getAllFines(req, res, next);
});

/**
 * @route   GET /api/external/workers/:id/fines
 * @desc    Get fines for a specific worker
 * @access  Private (API Key)
 */
router.get('/workers/:id/fines', authorizeApi('fines', 'read'), (req, res, next) => {
    getWorkerFines(req, res, next);
});

// --- Department Modules ---

/**
 * @route   GET /api/external/departments
 * @desc    Get all departments for the company
 * @access  Private (API Key)
 */
router.get('/departments', authorizeApi('departments', 'read'), (req, res, next) => {
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
router.get('/holidays', authorizeApi('holidays', 'read'), (req, res, next) => {
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
router.get('/tickets', authorizeApi('tickets', 'read'), (req, res, next) => {
    // Controller expects subdomain in req.user or req.query
    req.user = req.user || { subdomain: req.apiKey.subdomain };
    req.user.subdomain = req.apiKey.subdomain;
    getTickets(req, res, next);
});

// --- Work Allocation Modules ---

const handleGetWorkAllocation = async (req, res) => {
    try {
        const subdomain = req.apiKey.subdomain;
        const TicketModel = require('../models/ticketModel');
        const tasks = await TicketModel.find({ subdomain, isDeleted: { $ne: true } })
            .populate('assignee', 'name email department')
            .populate('assignees', 'name email department')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: tasks
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @route   GET /api/external/work-allocation
 * @desc    Get all work allocation tasks for the company
 * @access  Private (API Key)
 */
router.get('/work-allocation', authorizeApi('work_allocation', 'read'), handleGetWorkAllocation);
router.get('/work_allocation', authorizeApi('work_allocation', 'read'), handleGetWorkAllocation);

const handlePostWorkAllocation = async (req, res) => {
    try {
        const subdomain = req.apiKey.subdomain;
        const { title, description, priority, category, dueDate, assignee, team } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        const WorkerModel = require('../models/Worker');
        let assignedWorkerId = null;

        // Smart worker resolution (by ObjectId, Email, or Name)
        if (assignee) {
            const mongoose = require('mongoose');
            if (mongoose.Types.ObjectId.isValid(assignee)) {
                assignedWorkerId = assignee;
            } else {
                const foundWorker = await WorkerModel.findOne({
                    subdomain,
                    $or: [
                        { email: assignee.trim() },
                        { name: new RegExp(`^${assignee.trim()}$`, 'i') }
                    ]
                });
                if (foundWorker) {
                    assignedWorkerId = foundWorker._id;
                }
            }
        }

        const TicketModel = require('../models/ticketModel');
        const taskData = {
            title,
            description: description || '',
            priority: priority || 'Medium',
            category: category || 'General',
            dueDate: dueDate || null,
            team: team || 'DEV',
            subdomain,
            status: req.body.status || 'To Do'
        };

        if (assignedWorkerId) {
            taskData.assignee = assignedWorkerId;
            taskData.assignees = [assignedWorkerId];
        }

        const task = await TicketModel.create(taskData);
        const populatedTask = await TicketModel.findById(task._id)
            .populate('assignee', 'name email department')
            .populate('assignees', 'name email department');

        res.status(201).json({
            success: true,
            data: populatedTask
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @route   POST /api/external/work-allocation
 * @desc    Create a new work allocation task
 * @access  Private (API Key)
 */
router.post('/work-allocation', authorizeApi('work_allocation', 'write'), handlePostWorkAllocation);
router.post('/work_allocation', authorizeApi('work_allocation', 'write'), handlePostWorkAllocation);

// --- Settings Modules ---

/**
 * @route   GET /api/external/settings
 * @desc    Get company settings
 * @access  Private (API Key)
 */
router.get('/settings', authorizeApi('settings', 'read'), (req, res, next) => {
    // Controller expects subdomain in req.params
    req.params.subdomain = req.apiKey.subdomain;
    getSettings(req, res, next);
});

// --- Top Performer / Performance Modules ---

const handleGetTopPerformer = (req, res, next) => {
    req.user = req.user || { _id: 'api-key-system', role: 'admin', subdomain: req.apiKey.subdomain };
    req.user.subdomain = req.apiKey.subdomain;
    getLeaderboard(req, res, next);
};

/**
 * @route   GET /api/external/top-performer
 * @route   GET /api/external/top_performer
 * @route   GET /api/external/top-performers
 * @route   GET /api/external/leaderboard
 * @desc    Get top performers / leaderboard for the company
 * @access  Private (API Key)
 */
router.get('/top-performer', authorizeApi(['top_performer', 'top_performers', 'performance'], 'read'), handleGetTopPerformer);
router.get('/top_performer', authorizeApi(['top_performer', 'top_performers', 'performance'], 'read'), handleGetTopPerformer);
router.get('/top-performers', authorizeApi(['top_performer', 'top_performers', 'performance'], 'read'), handleGetTopPerformer);
router.get('/leaderboard', authorizeApi(['top_performer', 'top_performers', 'performance'], 'read'), handleGetTopPerformer);

// --- Invoice Modules ---

/**
 * @route   GET /api/external/invoices
 * @desc    Get all invoices for the subdomain associated with the API key
 * @access  Private (API Key)
 */
router.get('/invoices', authorizeApi('invoices', 'read'), async (req, res) => {
    try {
        const subdomain = req.apiKey.subdomain;
        const AdminModel = require('../models/Admin');
        const WorkerModel = require('../models/Worker');
        const InvoiceModel = require('../models/Invoice');
        
        const admins = await AdminModel.find({ subdomain }, '_id');
        const workers = await WorkerModel.find({ subdomain }, '_id');
        const userIds = [...admins.map(a => a._id), ...workers.map(w => w._id)];
        
        // Apply standard filters similar to getAllInvoices
        const { filterType, startDate, endDate, gstFilter } = req.query;
        let query = { createdBy: { $in: userIds } };
        
        const now = new Date();
        const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');
        
        if (filterType === 'today') {
            query.actualDate = {
                $gte: startOfDay(now),
                $lte: endOfDay(now)
            };
        } else if (filterType === 'weekly') {
            query.actualDate = {
                $gte: startOfWeek(now, { weekStartsOn: 1 }),
                $lte: endOfWeek(now, { weekStartsOn: 1 })
            };
        } else if (filterType === 'monthly') {
            query.actualDate = {
                $gte: startOfMonth(now),
                $lte: endOfMonth(now)
            };
        } else if (filterType === 'custom' && startDate && endDate) {
            query.actualDate = {
                $gte: startOfDay(new Date(startDate)),
                $lte: endOfDay(new Date(endDate))
            };
        }
        
        if (gstFilter === 'gst') {
            query.gstEnabled = true;
        } else if (gstFilter === 'non-gst') {
            query.gstEnabled = false;
        } else if (gstFilter === 'igst') {
            query.gstEnabled = true;
            query.saleType = 'Interstate';
        } else if (gstFilter === 'cgst-sgst') {
            query.gstEnabled = true;
            query.saleType = 'Intrastate';
        }
        
        const invoices = await InvoiceModel.find(query)
            .populate({
                path: 'createdBy',
                select: 'name email department',
                options: { strictPopulate: false },
                populate: {
                    path: 'department',
                    select: 'name',
                    model: 'Department',
                    options: { strictPopulate: false }
                }
            })
            .sort({ createdAt: -1 });
            
        res.status(200).json({
            success: true,
            message: 'Invoices retrieved successfully',
            data: invoices
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/external/invoices/:id
 * @desc    Get a single invoice by ID (subdomain scoped)
 * @access  Private (API Key)
 */
router.get('/invoices/:id', authorizeApi('invoices', 'read'), verifyInvoiceSubdomain, mockUserFromSubdomain, (req, res, next) => {
    getInvoiceById(req, res, next);
});

/**
 * @route   POST /api/external/invoices
 * @desc    Create a new invoice under the API key's subdomain
 * @access  Private (API Key)
 */
router.post('/invoices', authorizeApi('invoices', 'write'), mockUserFromSubdomain, (req, res, next) => {
    createInvoice(req, res, next);
});

/**
 * @route   PUT /api/external/invoices/:id
 * @desc    Update an invoice (subdomain scoped)
 * @access  Private (API Key)
 */
router.put('/invoices/:id', authorizeApi('invoices', 'write'), verifyInvoiceSubdomain, mockUserFromSubdomain, (req, res, next) => {
    updateInvoice(req, res, next);
});

/**
 * @route   DELETE /api/external/invoices/:id
 * @desc    Delete an invoice (subdomain scoped)
 * @access  Private (API Key)
 */
router.delete('/invoices/:id', authorizeApi('invoices', 'write'), verifyInvoiceSubdomain, mockUserFromSubdomain, (req, res, next) => {
    deleteInvoice(req, res, next);
});

module.exports = router;
