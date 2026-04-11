const asyncHandler = require('express-async-handler');
const Leave = require('../models/Leave');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');
const Department = require('../models/Department');

// Make sure to import the notification service
const { sendNewLeaveRequestNotification } = require('../services/notificationService');

// @desc    Get leave application stats for worker
// @route   GET /api/leaves/apply-info/:subdomain
// @access  Private (Worker)
const getLeaveApplyStats = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;
  const workerId = req.user._id;

  const settings = await Settings.findOne({ subdomain });
  const worker = await Worker.findById(workerId);

  if (!worker) {
    res.status(404);
    throw new Error('Worker not found');
  }

  const advancedSettings = settings?.advancedLeaveDeduction || {
    attendanceRuleEnabled: false,
    monthlyLimitRuleEnabled: false,
    thresholds: { company: 80, department: 80, employee: 90 },
    monthlyLimit: 2
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const monthPrefix = indiaTimezoneDate.format(now).substring(0, 7); // "YYYY-MM"

  // 1. Monthly Leave Count
  const leaveCount = await Leave.countDocuments({
    worker: workerId,
    subdomain,
    startDate: { $gte: startOfMonth, $lte: endOfMonth },
    status: { $ne: 'Rejected' },
    leaveType: { $ne: 'Permission' } // Count full leaves, not permissions? Prompt says "2 days salary for 1 day leave"
  });

  // 2. Individual Attendance Stats (Current Month)
  const workerPresentDays = await Attendance.distinct('date', {
    worker: workerId,
    subdomain,
    date: { $regex: new RegExp(`^${monthPrefix}`) },
    presence: true
  });

  const elapsedDays = now.getDate();
  const workerAttendanceRate = elapsedDays > 0 ? (workerPresentDays.length / elapsedDays) * 100 : 100;

  // 3. Department Attendance Stats (Today)
  const totalDeptWorkers = await Worker.countDocuments({
    subdomain,
    department: worker.department,
    status: { $ne: 'Relieved' }
  });

  const todayDateFormatted = indiaTimezoneDate.format(now);
  const presentDeptWorkerIds = await Attendance.distinct('worker', {
    subdomain,
    department: worker.department,
    date: todayDateFormatted,
    presence: true
  });

  const deptAttendanceRate = totalDeptWorkers > 0 ? (presentDeptWorkerIds.length / totalDeptWorkers) * 100 : 100;

  // 4. Company Attendance Stats (Today)
  const totalCompanyWorkers = await Worker.countDocuments({
    subdomain,
    status: { $ne: 'Relieved' }
  });

  const presentCompanyWorkerIds = await Attendance.distinct('worker', {
    subdomain,
    date: todayDateFormatted,
    presence: true
  });

  const companyAttendanceRate = totalCompanyWorkers > 0 ? (presentCompanyWorkerIds.length / totalCompanyWorkers) * 100 : 100;

  // Deduction Factor Calculation
  let willApply2X = false;
  let reasons = {
    attendance: false,
    monthlyLimit: false
  };

  if (advancedSettings.monthlyLimitRuleEnabled) {
    if (leaveCount >= advancedSettings.monthlyLimit) {
      willApply2X = true;
      reasons.monthlyLimit = true;
    }
  }

  if (advancedSettings.attendanceRuleEnabled) {
    const thresh = advancedSettings.thresholds || {};
    const isCompanyEnabled = thresh.company?.enabled ?? true;
    const companyVal = thresh.company?.value ?? thresh.company ?? 80;
    const isDeptEnabled = thresh.department?.enabled ?? true;
    const deptVal = thresh.department?.value ?? thresh.department ?? 80;
    const isEmployeeEnabled = thresh.employee?.enabled ?? true;
    const employeeVal = thresh.employee?.value ?? thresh.employee ?? 90;

    const isCompanyLow = isCompanyEnabled && companyAttendanceRate < companyVal;
    const isDeptLow = isDeptEnabled && deptAttendanceRate < deptVal;
    const isPersonalLow = isEmployeeEnabled && workerAttendanceRate < employeeVal;

    if (isCompanyLow || isDeptLow || isPersonalLow) {
      willApply2X = true;
      reasons.attendance = true;
    }
  }

  res.status(200).json({
    stats: {
      companyAttendance: Math.round(companyAttendanceRate),
      deptAttendance: Math.round(deptAttendanceRate),
      personalAttendance: Math.round(workerAttendanceRate),
      leavesTaken: leaveCount,
      allowedLimit: advancedSettings.monthlyLimit
    },
    willApply2X,
    reasons,
    advancedSettings
  });
});


// @desc    Get all leave applications (for Admin) or own leaves (for Worker)
// @route   GET /api/leaves/:subdomain/:me
// @access  Private
const getLeaves = asyncHandler(async (req, res) => {
  const { subdomain, me } = req.params;

  if (!['1', '0'].includes(me)) {
    res.status(404);
    throw new Error('URL not found');
  }

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error("Company name is missing, login again.");
  }

  let leaves;

  if (me === '1') { // '1' means worker is fetching their own leaves
    leaves = await Leave.find({ worker: req.user._id }).sort({ createdAt: -1 });
  } else if (me === '0') { // '0' means admin is fetching all leaves for the subdomain
    const user = await Admin.findById(req.user._id);
    if (user) {
      leaves = await Leave.find({ subdomain })
        .populate('worker', 'name department')
        .sort({ createdAt: -1 });
    } else {
      res.status(403);
      throw new Error("Access denied. Admin access required.");
    }
  }

  res.status(200).json(leaves);
});

// @desc    Get my leave applications (dedicated route for workers)
// @route   GET /api/leaves/me
// @access  Private (Worker)
const getMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await Leave.find({ worker: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json(leaves);
});

// @desc    Create a new leave application and send WhatsApp notification
// @route   POST /api/leaves
// @access  Private (Worker)
const createLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, totalDays, reason, startTime, endTime, subdomain } = req.body;

  // Basic validation
  if (!leaveType || !startDate || !endDate || !reason || !subdomain) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  // If the leave type is 'Permission', startTime and endTime become mandatory
  if (leaveType === 'Permission' && (!startTime || !endTime)) {
    res.status(400);
    throw new Error('Start Time and End Time are required for Permission leave');
  }

  const document = req.file ? req.file.filename : null;

  // Calculate Deduction Factor based on rules
  let deductionFactor = 1;
  let penaltyReasons = { attendanceRule: false, monthlyLimitRule: false };

  const settings = await Settings.findOne({ subdomain });
  if (settings && settings.advancedLeaveDeduction) {
    const advancedSettings = settings.advancedLeaveDeduction;
    const worker = await Worker.findById(req.user._id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const monthPrefix = indiaTimezoneDate.format(now).substring(0, 7);

    // 1. Monthly Limit Rule
    if (advancedSettings.monthlyLimitRuleEnabled) {
      // Calculate how many leave/absent days have been used this month
      let effectiveLeaveCount = 0;

      const holidays = await Holiday.find({
        subdomain,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });
      const holidayDates = holidays.map(h => h.date.toISOString().split('T')[0]);

      const workerLeaves = await Leave.find({
        worker: req.user._id,
        subdomain,
        startDate: { $lte: endOfMonth },
        endDate: { $gte: startOfMonth },
        status: { $ne: 'Rejected' },
        leaveType: { $ne: 'Permission' }
      });

      const workerAttendances = await Attendance.find({
        worker: req.user._id,
        subdomain,
        date: { $regex: new RegExp(`^${monthPrefix}`) },
        presence: true
      });
      const presentDateStrings = [...new Set(workerAttendances.map(a => a.date))];

      // Iterate through each day of the current month up to the end of the month
      const tempDate = new Date(startOfMonth);
      const todayStr = indiaTimezoneDate.format(now);

      while (tempDate <= endOfMonth) {
        const dStr = indiaTimezoneDate.format(tempDate);
        const dayOfWeek = tempDate.getDay(); // 0 is Sunday

        // Skip Sundays and holidays
        if (dayOfWeek !== 0 && !holidayDates.includes(dStr)) {
          const hasPunch = presentDateStrings.includes(dStr);
          const hasLeave = workerLeaves.find(l => {
            const lStart = indiaTimezoneDate.format(new Date(l.startDate));
            const lEnd = indiaTimezoneDate.format(new Date(l.endDate));
            return dStr >= lStart && dStr <= lEnd;
          });

          if (hasLeave) {
            effectiveLeaveCount++;
          } else if (dStr < todayStr && !hasPunch) {
            // It's a past working day with no punch and no leave request -> Unplanned Absence
            effectiveLeaveCount++;
          }
        }
        tempDate.setDate(tempDate.getDate() + 1);
      }

      const limit = advancedSettings.monthlyLimit || 0;
      if (effectiveLeaveCount >= limit) {
        deductionFactor = 2;
        penaltyReasons.monthlyLimitRule = true;
      }
    }

    // 2. Attendance Rule (if not already 2X or if we want to record all reasons)
    if (advancedSettings.attendanceRuleEnabled) {
      // Individual
      const workerPresentDays = await Attendance.distinct('date', {
        worker: req.user._id,
        subdomain,
        date: { $regex: new RegExp(`^${monthPrefix}`) },
        presence: true
      });
      const elapsedDays = now.getDate();
      const workerAttendanceRate = elapsedDays > 0 ? (workerPresentDays.length / elapsedDays) * 100 : 100;

      // Dept
      const totalDeptWorkers = await Worker.countDocuments({ subdomain, department: worker.department, status: { $ne: 'Relieved' } });
      const todayDateFormatted = indiaTimezoneDate.format(now);
      const presentDeptWorkerIds = await Attendance.distinct('worker', { subdomain, department: worker.department, date: todayDateFormatted, presence: true });
      const deptAttendanceRate = totalDeptWorkers > 0 ? (presentDeptWorkerIds.length / totalDeptWorkers) * 100 : 100;

      // Company
      const totalCompanyWorkers = await Worker.countDocuments({ subdomain, status: { $ne: 'Relieved' } });
      const presentCompanyWorkerIds = await Attendance.distinct('worker', { subdomain, date: todayDateFormatted, presence: true });
      const companyAttendanceRate = totalCompanyWorkers > 0 ? (presentCompanyWorkerIds.length / totalCompanyWorkers) * 100 : 100;

      const thresh = advancedSettings.thresholds || {};
      const isCompanyEnabled = thresh.company?.enabled ?? true;
      const companyVal = thresh.company?.value ?? thresh.company ?? 80;
      const isDeptEnabled = thresh.department?.enabled ?? true;
      const deptVal = thresh.department?.value ?? thresh.department ?? 80;
      const isEmployeeEnabled = thresh.employee?.enabled ?? true;
      const employeeVal = thresh.employee?.value ?? thresh.employee ?? 90;

      const isCompanyLow = isCompanyEnabled && companyAttendanceRate < companyVal;
      const isDeptLow = isDeptEnabled && deptAttendanceRate < deptVal;
      const isPersonalLow = isEmployeeEnabled && workerAttendanceRate < employeeVal;

      if (isCompanyLow || isDeptLow || isPersonalLow) {
        deductionFactor = 2;
        penaltyReasons.attendanceRule = true;
      }
    }
  }

  // Create the leave object in the database
  const leave = await Leave.create({
    worker: req.user._id,
    subdomain,
    leaveType,
    startDate,
    endDate,
    totalDays: totalDays || 0,
    reason,
    document,
    startTime: leaveType === 'Permission' ? startTime : null,
    endTime: leaveType === 'Permission' ? endTime : null,
    status: 'Pending',
    workerViewed: false,
    deductionFactor,
    penaltyReasons
  });

  // After successfully creating the leave, send the notification
  if (leave) {
    console.log(`Leave created. Sending WhatsApp notification for leave ID: ${leave._id}`);

    // Wrap the notification in a try-catch to prevent any errors from affecting the leave creation
    try {
      sendNewLeaveRequestNotification(leave)
        .then(result => {
          if (result.success) {
            console.log(`✅ Leave notification sent successfully. Summary: ${result.summary}`);
          } else {
            console.error(`❌ Failed to send leave notification:`, result.error || 'Unknown error');

            // Log detailed results if available
            if (result.results && Array.isArray(result.results)) {
              result.results.forEach((res, index) => {
                if (!res.success) {
                  console.error(`❌ Failed to send to number ${res.number || 'unknown'}:`, res.error || 'Unknown error');
                }
              });
            }
          }
        })
        .catch(notificationError => {
          console.error(`❌ An unexpected error occurred while sending notification:`, notificationError.message);
        });
    } catch (syncError) {
      console.error(`❌ Error initiating notification:`, syncError.message);
    }
  }

  res.status(201).json(leave);
});

// @desc    Update leave status (admin only)
// @route   PUT /api/leaves/:id/status
// @access  Private/Admin
const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const leaveId = req.params.id;

  if (!['Approved', 'Rejected'].includes(status)) {
    res.status(400);
    throw new Error('Invalid status provided.');
  }

  const leave = await Leave.findById(leaveId);
  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found.');
  }

  // Update the leave status
  const updatedLeave = await Leave.findByIdAndUpdate(
    leaveId,
    { status: status, workerViewed: false }, // Mark as unread for the worker
    { new: true }
  ).populate('worker', 'name');

  // Optional: Handle salary deduction for approved leaves if applicable
  if (status === 'Approved') {
    const worker = await Worker.findById(leave.worker);
    if (worker) {
      let deduction = 0;
      if (leave.leaveType === 'Permission' && leave.startTime && leave.endTime) {
        // Example deduction logic for permissions (can be adjusted)
        const start = new Date(`1970-01-01T${leave.startTime}:00`);
        const end = new Date(`1970-01-01T${leave.endTime}:00`);
        const durationHours = (end - start) / (1000 * 60 * 60);
        const perHourSalary = worker.perDaySalary / 8; // Assuming an 8-hour workday
        deduction = durationHours * perHourSalary;
      } else {
        // Deduction for full-day leaves
        deduction = leave.totalDays * worker.perDaySalary * (leave.deductionFactor || 1);
      }

      worker.finalSalary = Math.max(0, worker.finalSalary - deduction);
      await worker.save();
    }
  }

  res.status(200).json(updatedLeave);
});

// @desc    Filter leaves by status
// @route   GET /api/leaves/status
// @access  Private/Admin
const getLeavesByStatus = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = status && status !== 'all' ? { status } : {};

  // Also filter by subdomain for security
  query.subdomain = req.user.subdomain;

  const leaves = await Leave.find(query)
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.status(200).json(leaves);
});

// @desc    Mark a leave as viewed by the worker
// @route   PUT /api/leaves/:id/viewed
// @access  Private (Worker)
const markLeaveAsViewed = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    res.status(404);
    throw new Error('Leave application not found.');
  }

  // Ensure the worker is marking their own leave
  if (leave.worker.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to perform this action.');
  }

  leave.workerViewed = true;
  await leave.save();
  res.status(200).json({ message: 'Leave marked as viewed' });
});

// @desc    Get leaves within a specific date range
// @route   GET /api/leaves/range
// @access  Private/Admin
const getLeavesByDateRange = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide both start and end dates.');
  }

  const leaves = await Leave.find({
    subdomain: req.user.subdomain, // Filter by subdomain
    $or: [
      { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ]
  })
    .populate('worker', 'name department')
    .sort({ createdAt: -1 });

  res.status(200).json(leaves);
});

// @desc    Mark all leaves as viewed by admin (utility function)
// @route   PUT /api/leaves/mark-viewed-by-admin
// @access  Private/Admin
const markLeavesAsViewedByAdmin = asyncHandler(async (req, res) => {
  await Leave.updateMany(
    { subdomain: req.user.subdomain, workerViewed: false },
    { $set: { workerViewed: true } }
  );
  res.status(200).json({ message: 'All leaves marked as viewed by admin' });
});


module.exports = {
  getLeaves,
  getMyLeaves,
  createLeave,
  updateLeaveStatus,
  getLeavesByStatus,
  markLeaveAsViewed,
  getLeavesByDateRange,
  markLeavesAsViewedByAdmin,
  getLeaveApplyStats
}