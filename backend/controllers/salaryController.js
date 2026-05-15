// backend/controllers/salaryController.js
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const Settings = require('../models/Settings');
const DeveloperProject = require('../models/DeveloperProject');
const SalaryProject = require('../models/SalaryProject');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const Ticket = require('../models/ticketModel');

const calculateDailyAttendancePenalties = async (subdomain, fromDate, toDate, workerId, workerDeptId, thresh) => {
  const companyPenaltyMap = {};
  const deptPenaltyMap = {};

  const companyEnabled = thresh.company?.enabled ?? true;
  const deptEnabled = thresh.department?.enabled ?? true;

  if (!companyEnabled && !deptEnabled) return { companyPenaltyMap, deptPenaltyMap };

  const companyVal = thresh.company?.value ?? thresh.company ?? 80;
  const deptVal = thresh.department?.value ?? thresh.department ?? 80;

  const allCompanyWorkers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } });
  const totalCompanyWorkers = allCompanyWorkers.length;
  const deptWorkers = allCompanyWorkers.filter(w => {
    const wDeptId = w.department?._id?.toString() || w.department?.toString();
    return wDeptId === workerDeptId;
  });
  const totalDeptWorkers = deptWorkers.length;

  const allAttendancesInRange = await Attendance.find({
    subdomain,
    date: { $gte: fromDate, $lte: toDate },
    presence: true
  });

  const attendanceByDate = {};
  allAttendancesInRange.forEach(att => {
    if (!attendanceByDate[att.date]) attendanceByDate[att.date] = { company: [], dept: [] };
    const wId = att.worker.toString();
    attendanceByDate[att.date].company.push(wId);
    
    const attWorker = allCompanyWorkers.find(w => w._id.toString() === wId);
    if (attWorker) {
      const attWorkerDeptId = attWorker.department?._id?.toString() || attWorker.department?.toString();
      if (attWorkerDeptId === workerDeptId) {
        attendanceByDate[att.date].dept.push(wId);
      }
    }
  });

  const workerIdStr = workerId.toString();
  const dates = [];
  let curDate = new Date(fromDate);
  const endD = new Date(toDate);
  while (curDate <= endD) {
    dates.push(curDate.toISOString().split('T')[0]);
    curDate.setDate(curDate.getDate() + 1);
  }

  dates.forEach(dateStr => {
    const dayData = attendanceByDate[dateStr] || { company: [], dept: [] };
    
    if (companyEnabled) {
      const otherCompanyWorkers = Math.max(1, totalCompanyWorkers - 1);
      const presentOtherCompanyWorkers = dayData.company.filter(id => id !== workerIdStr).length;
      const companyRate = (presentOtherCompanyWorkers / otherCompanyWorkers) * 100;
      companyPenaltyMap[dateStr] = companyRate < companyVal;
    }

    if (deptEnabled) {
      const otherDeptWorkers = Math.max(1, totalDeptWorkers - 1);
      const presentOtherDeptWorkers = dayData.dept.filter(id => id !== workerIdStr).length;
      const deptRate = (presentOtherDeptWorkers / otherDeptWorkers) * 100;
      deptPenaltyMap[dateStr] = deptRate < deptVal;
    }
  });

  return { companyPenaltyMap, deptPenaltyMap };
};

const giveBonus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, fromDate, toDate } = req.body;

  if (!amount || isNaN(amount)) {
    return res.status(400).json({ message: 'Bonus amount must be a valid number' });
  }

  // Validate date range for calculating actual earned salary
  if (!fromDate || !toDate) {
    return res.status(400).json({ message: 'Date range (fromDate and toDate) is required for bonus calculation' });
  }

  const worker = await Worker.findById(id);
  if (!worker) {
    return res.status(404).json({ message: 'Worker not found' });
  }

  // Get attendance data for the specified period
  const attendanceData = await Attendance.find({
    worker: id,
    date: {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    }
  });

  const leaveData = await Leave.find({
    worker: id,
    status: 'Approved'
  });

  const holidays = await Holiday.find({});
  const settings = await Settings.findOne({ subdomain: worker.subdomain });
  const batches = settings ? settings.batches : [];

  // Calculate worker productivity to get actual earned salary
  const productivityReport = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    options: {
      batches,
      holidays,
      permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
      deductSalary: settings ? settings.deductSalary : true,
      intervals: settings ? settings.intervals : []
    }
  });

  // Get the worker's actual earned salary from the report
  const actualEarnedSalary = productivityReport.summary.finalSalary || 0;
  const baseSalary = worker.salary || 0;

  // Calculate the new bonus logic:
  // 1. Subtract base salary from bonus amount
  // 2. Instead of paying full base salary, pay what they actually earned
  // 3. Add remaining bonus to their actual earnings
  const bonusAmount = Number(amount);
  const remainingBonus = Math.max(0, bonusAmount - baseSalary);
  const finalPayout = actualEarnedSalary + remainingBonus;

  // Store bonus information
  worker.bonuses.push({
    amount: bonusAmount,
    fromDate: new Date(fromDate),
    toDate: new Date(toDate)
  });

  // Update worker's final salary with the new calculation
  worker.finalSalary = finalPayout;
  await worker.save();

  res.status(200).json({
    message: 'Bonus calculated and added successfully',
    worker,
    calculationDetails: {
      baseSalary: baseSalary,
      bonusAmount: bonusAmount,
      actualEarnedSalary: actualEarnedSalary,
      remainingBonus: remainingBonus,
      finalPayout: finalPayout
    }
  });
});

const removeBonus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const worker = await Worker.findById(id);
  if (!worker) {
    return res.status(404).json({ message: 'Worker not found' });
  }

  // Reset the worker's final salary to their base salary
  worker.finalSalary = worker.salary;

  // Remove all bonuses
  worker.bonuses = [];

  await worker.save();

  res.status(200).json({
    message: 'Bonus removed successfully',
    worker
  });
});

const resetSalary = asyncHandler(async (req, res) => {
  const { subdomain } = req.body;

  if (!subdomain) {
    return res.status(400).json({ message: 'Subdomain is required' });
  }

  const workers = await Worker.find({ subdomain });

  if (workers.length === 0) {
    return res.status(404).json({ message: 'No workers found for this subdomain' });
  }

  const updatePromises = workers.map(worker => {
    worker.finalSalary = worker.salary;
    // Remove all bonuses when resetting salary
    worker.bonuses = [];
    return worker.save();
  });

  await Promise.all(updatePromises);

  res.status(200).json({ message: 'Salaries reset successfully', updatedCount: workers.length });
});

const getWorkerSalaryReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ message: 'Start and end dates are required' });
  }

  try {
    // POPULATE DEPARTMENT AND INCLUDE FINES IN THE WORKER DATA
    const worker = await Worker.findById(id).populate('department').select('+fines');

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    // Since the date field in Attendance model is stored as a string,
    // we need to fetch all attendance records and filter them manually
    const allAttendanceData = await Attendance.find({
      worker: id
    });

    // Filter attendance data manually by parsing the date strings
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    const attendanceData = allAttendanceData.filter(record => {
      // Parse the string date from the record
      const recordDate = new Date(record.date);
      return recordDate >= fromDateObj && recordDate <= toDateObj;
    });

    const leaveData = await Leave.find({
      worker: id,
      $or: [
        { status: 'Approved' },
        { leaveType: 'Paid Leave' }
      ]
    });

    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain: worker.subdomain });
    const batches = settings ? settings.batches : [];

    // Calculate Company/Dept Attendance Penalties (Daily rates)
    let companyPenaltyMap = {};
    let deptPenaltyMap = {};

    if (settings && settings.advancedLeaveDeduction && settings.advancedLeaveDeduction.attendanceRuleEnabled) {
      const adv = settings.advancedLeaveDeduction;
      const thresh = adv.thresholds || {};
      const workerDeptId = worker.department?._id?.toString() || worker.department?.toString();

      const penaltyMaps = await calculateDailyAttendancePenalties(worker.subdomain, fromDate, toDate, id, workerDeptId, thresh);
      companyPenaltyMap = penaltyMaps.companyPenaltyMap;
      deptPenaltyMap = penaltyMaps.deptPenaltyMap;
    }

    // FIXED THIS LINE: Pass the worker object to the calculator function
    // Fetch salary projects for this worker overlapping the report period
    const salaryProjects = await SalaryProject.find({
      subdomain: worker.subdomain,
      developers: id,
      $or: [{ startDate: { $lte: new Date(toDate) }, endDate: { $gte: new Date(fromDate) } }]
    }).populate('developers', 'name rfid');

    // Enrich projects with per-day value
    const enrichedProjects = salaryProjects.map(p => {
      const pObj = p.toObject();
      const devCount = pObj.developers.length || 1;
      const share = pObj.projectProfit / devCount;
      const start = new Date(pObj.startDate);
      const end = new Date(pObj.endDate);
      let workingDays = 0;
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getDay() !== 0) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
      return { ...pObj, perDeveloperShare: share, totalWorkingDays: workingDays, perDayValue: workingDays > 0 ? share / workingDays : 0 };
    });

    const report = calculateWorkerProductivity({
      worker, // ADDED: Pass the worker object
      attendanceData,
      fromDate,
      toDate,
      leaveData, // ADDED: Pass the leave data
      projects: enrichedProjects, // HYBRID: Pass salary projects
      options: {
        batches,
        holidays,
        permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
        deductSalary: settings ? settings.deductSalary : true,
        intervals: settings ? settings.intervals : [],
        advancedLeaveDeduction: settings ? settings.advancedLeaveDeduction : null,
        companyPenaltyMap,
        deptPenaltyMap,
        includePermission: settings?.includePermission || false,
        paidLeaveConfig: settings ? settings.paidLeaveConfig : null
      }
    });

    // Check if there are any bonuses for this period
    const bonusesForPeriod = worker.bonuses.filter(bonus => {
      return (
        (new Date(bonus.fromDate) <= new Date(toDate)) &&
        (new Date(bonus.toDate) >= new Date(fromDate))
      );
    });

    // Calculate total bonus amount for this period
    const totalBonusAmount = bonusesForPeriod.reduce((total, bonus) => total + bonus.amount, 0);

    let finalSalaryWithBonus = report.summary.finalSalary || 0;
    if (totalBonusAmount > 0) {
      finalSalaryWithBonus = finalSalaryWithBonus + totalBonusAmount;
    }

    // ADD FINE CALCULATION FOR THE REPORT PERIOD
    // Calculate total fines for the report period
    let totalFinesAmount = 0;
    if (worker.fines && Array.isArray(worker.fines)) {
      const reportStartDate = new Date(fromDate);
      const reportEndDate = new Date(toDate);

      totalFinesAmount = worker.fines
        .filter(fine => {
          const fineDate = new Date(fine.date);
          return fineDate >= reportStartDate && fineDate <= reportEndDate;
        })
        .reduce((total, fine) => total + (fine.amount || 0), 0);
    }

    // Calculate final salary after deducting fines
    const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

    // Fetch all tasks for this worker that were ever delayed or are currently overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allTasks = await Ticket.find({
      $or: [
        { assignee: id },
        { assignees: id }
      ],
      subdomain: worker.subdomain
    });

    const delayedTasks = allTasks.filter(task => {
      if (!task.endDate) return false;
      const deadline = new Date(task.endDate);
      deadline.setHours(0, 0, 0, 0);

      if (task.status === 'Done') {
        // Find when it was marked as Done
        const doneEntry = task.statusHistory
          .filter(h => h.status === 'Done')
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
        
        if (doneEntry) {
          const doneDate = new Date(doneEntry.changedAt);
          doneDate.setHours(0, 0, 0, 0);
          return doneDate > deadline;
        }
        return false;
      } else {
        // Not Done yet, check if it's past deadline
        return today > deadline;
      }
    }).map(task => {
      const doneEntry = task.statusHistory
        .filter(h => h.status === 'Done')
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
      
      return {
        _id: task._id,
        title: task.title,
        endDate: task.endDate,
        doneDate: doneEntry ? doneEntry.changedAt : null,
        status: task.status
      };
    });

    const isCurrentlyViolating = delayedTasks.some(t => t.status !== 'Done');
    let earliestDeadline = null;
    if (delayedTasks.length > 0) {
      const sortedDeadlines = delayedTasks.map(t => new Date(t.endDate)).sort((a, b) => a - b);
      earliestDeadline = sortedDeadlines[0];
    }

    // Build project breakdown summary
    const projectBreakdown = enrichedProjects.map(p => {
      const pid = p._id.toString();
      const calcData = (report.summary?.projectBreakdownMap && report.summary.projectBreakdownMap[pid]) || { totalEarned: 0, totalDeduction: 0, daysCount: 0 };
      
      return {
        projectId: p._id,
        projectName: p.projectName,
        startDate: p.startDate,
        endDate: p.endDate,
        totalWorkingDays: p.totalWorkingDays,
        perDayValue: p.perDayValue,
        perDeveloperShare: p.perDeveloperShare,
        projectProfit: p.projectProfit,
        totalDeduction: calcData.totalDeduction,
        totalEarned: calcData.totalEarned,
        daysInReport: calcData.daysCount
      };
    });

    res.status(200).json({
      message: 'Salary report generated successfully',
      report,
      bonuses: bonusesForPeriod,
      totalBonusAmount: totalBonusAmount,
      totalFinesAmount: totalFinesAmount, // ADD THIS
      finalSalaryWithBonus: finalSalaryWithBonus,
      finalSalaryWithFines: finalSalaryWithFines, // ADD THIS
      isCurrentlyViolating,
      earliestDeadline,
      delayedTasks,
      projectBreakdown, // HYBRID
      worker: {
        name: worker.name,
        salary: worker.salary,
        finalSalary: worker.finalSalary,
        perDaySalary: worker.perDaySalary,
        fines: worker.fines // ADD THIS
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate salary report' });
  }
});

const getMySalaryReport = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const id = req.user._id;

  console.log('Generating salary report for worker:', id);

  // Calculate current month date range if not provided
  let start, end;
  if (!fromDate || !toDate) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const formatDate = (d) => {
      let m = '' + (d.getMonth() + 1);
      let day = '' + d.getDate();
      const y = d.getFullYear();
      if (m.length < 2) m = '0' + m;
      if (day.length < 2) day = '0' + day;
      return [y, m, day].join('-');
    };
    
    start = formatDate(firstDay);
    end = formatDate(lastDay);
  } else {
    start = fromDate;
    end = toDate;
  }

  try {
    const worker = await Worker.findById(id).populate('department').select('+fines');

    if (!worker) {
      console.log('Worker not found:', id);
      return res.status(404).json({ message: 'Worker not found' });
    }

    const allAttendanceData = await Attendance.find({ worker: id });

    const fromDateObj = new Date(start);
    const toDateObj = new Date(end);

    const attendanceData = allAttendanceData.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= fromDateObj && recordDate <= toDateObj;
    });

    const leaveData = await Leave.find({
      worker: id,
      $or: [
        { status: 'Approved' },
        { leaveType: 'Paid Leave' }
      ]
    });

    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain: worker.subdomain });
    const batches = settings ? settings.batches : [];

    // Calculate Company/Dept Attendance Penalties (Daily rates)
    let companyPenaltyMap = {};
    let deptPenaltyMap = {};

    if (settings && settings.advancedLeaveDeduction && settings.advancedLeaveDeduction.attendanceRuleEnabled) {
      const adv = settings.advancedLeaveDeduction;
      const thresh = adv.thresholds || {};
      const workerDeptId = worker.department?._id?.toString() || worker.department?.toString();

      const penaltyMaps = await calculateDailyAttendancePenalties(worker.subdomain, start, end, id, workerDeptId, thresh);
      companyPenaltyMap = penaltyMaps.companyPenaltyMap;
      deptPenaltyMap = penaltyMaps.deptPenaltyMap;
    }

    // Hybrid: Fetch and enrichment projects
    const salaryProjects = await SalaryProject.find({
      subdomain: worker.subdomain,
      developers: id,
      $or: [{ startDate: { $lte: new Date(end) }, endDate: { $gte: new Date(start) } }]
    }).populate('developers', 'name');

    const enrichedProjects = salaryProjects.map(p => {
      const pObj = p.toObject();
      const devCount = pObj.developers.length || 1;
      const share = pObj.projectProfit / devCount;
      const pStart = new Date(pObj.startDate);
      const pEnd = new Date(pObj.endDate);
      let workingDays = 0;
      const cur = new Date(pStart);
      while (cur <= pEnd) {
        if (cur.getDay() !== 0) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
      return { ...pObj, perDeveloperShare: share, totalWorkingDays: workingDays, perDayValue: workingDays > 0 ? share / workingDays : 0 };
    });

    const report = calculateWorkerProductivity({
      worker,
      attendanceData,
      fromDate: start,
      toDate: end,
      leaveData,
      projects: enrichedProjects, // Added projects
      options: {
        batches,
        holidays,
        permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
        deductSalary: settings ? settings.deductSalary : true,
        intervals: settings ? settings.intervals : [],
        advancedLeaveDeduction: settings ? settings.advancedLeaveDeduction : null,
        companyPenaltyMap,
        deptPenaltyMap,
        includePermission: settings?.includePermission || false,
        paidLeaveConfig: settings ? settings.paidLeaveConfig : null
      }
    });

    const bonusesForPeriod = worker.bonuses.filter(bonus => {
      return (
        (new Date(bonus.fromDate) <= new Date(end)) &&
        (new Date(bonus.toDate) >= new Date(start))
      );
    });

    const totalBonusAmount = bonusesForPeriod.reduce((total, bonus) => total + bonus.amount, 0);
    let finalSalaryWithBonus = report.summary.finalSalary;

    if (totalBonusAmount > 0 && bonusesForPeriod.length > 0) {
      const bonus = bonusesForPeriod[0];
      const baseSalary = worker.salary || 0;
      const actualEarnedSalary = report.summary.finalSalary || 0;
      const remainingBonus = Math.max(0, bonus.amount - baseSalary);
      finalSalaryWithBonus = actualEarnedSalary + remainingBonus;
    }

    let totalFinesAmount = 0;
    if (worker.fines && Array.isArray(worker.fines)) {
      totalFinesAmount = worker.fines
        .filter(fine => {
          const fineDate = new Date(fine.date);
          return fineDate >= fromDateObj && fineDate <= toDateObj;
        })
        .reduce((total, fine) => total + (fine.amount || 0), 0);
    }

    const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

    // Fetch all tasks for this worker that were ever delayed or are currently overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allTasks = await Ticket.find({
      $or: [
        { assignee: id },
        { assignees: id }
      ],
      subdomain: worker.subdomain
    });

    const delayedTasks = allTasks.filter(task => {
      if (!task.endDate) return false;
      const deadline = new Date(task.endDate);
      deadline.setHours(0, 0, 0, 0);

      if (task.status === 'Done') {
        const doneEntry = task.statusHistory
          .filter(h => h.status === 'Done')
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
        
        if (doneEntry) {
          const doneDate = new Date(doneEntry.changedAt);
          doneDate.setHours(0, 0, 0, 0);
          return doneDate > deadline;
        }
        return false;
      } else {
        return today > deadline;
      }
    }).map(task => {
      const doneEntry = task.statusHistory
        .filter(h => h.status === 'Done')
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
      
      return {
        _id: task._id,
        title: task.title,
        endDate: task.endDate,
        doneDate: doneEntry ? doneEntry.changedAt : null,
        status: task.status
      };
    });

    const isCurrentlyViolating = delayedTasks.some(t => t.status !== 'Done');
    let earliestDeadline = null;
    if (delayedTasks.length > 0) {
      const sortedDeadlines = delayedTasks.map(t => new Date(t.endDate)).sort((a, b) => a - b);
      earliestDeadline = sortedDeadlines[0];
    }

    // Build project breakdown summary
    const projectBreakdown = enrichedProjects.map(p => {
      const pid = p._id.toString();
      const calcData = (report.summary?.projectBreakdownMap && report.summary.projectBreakdownMap[pid]) || { totalEarned: 0, totalDeduction: 0, daysCount: 0 };
      
      return {
        projectId: p._id,
        projectName: p.projectName,
        startDate: p.startDate,
        endDate: p.endDate,
        totalWorkingDays: p.totalWorkingDays,
        perDayValue: p.perDayValue,
        perDeveloperShare: p.perDeveloperShare,
        projectProfit: p.projectProfit,
        totalDeduction: calcData.totalDeduction,
        totalEarned: calcData.totalEarned,
        daysInReport: calcData.daysCount
      };
    });

    const responseData = {
      message: 'Salary report generated successfully',
      baseSalary: worker.salary,
      finalSalary: finalSalaryWithFines,
      actualEarnedSalary: report.summary.finalSalary || 0,
      totalDeductions: (report.summary.totalSalaryDeduction || 0) + totalFinesAmount,
      report,
      bonuses: bonusesForPeriod,
      totalBonusAmount: totalBonusAmount,
      totalFinesAmount: totalFinesAmount,
      finalSalaryWithBonus: finalSalaryWithBonus,
      isCurrentlyViolating,
      earliestDeadline,
      delayedTasks,
      projectBreakdown, // Added breakdown
      worker: {
        name: worker.name,
        salary: worker.salary,
        finalSalary: worker.finalSalary,
        perDaySalary: worker.perDaySalary
      }
    };

    console.log('Salary API Response (Strict):', {
      baseSalary: responseData.baseSalary,
      finalSalary: responseData.finalSalary
    });
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Failed to generate salary report:', error);
    res.status(500).json({ message: 'Failed to generate salary report', error: error.message });
  }
});

// Get compensation report for all workers based on type and class
const getCompensationReport = asyncHandler(async (req, res) => {
  const { subdomain } = req.body;
  const { employeeType, class: classFilter } = req.query;

  try {
    let query = { subdomain };
    if (employeeType) query.employeeType = employeeType;
    if (classFilter) query.class = classFilter;

    const workers = await Worker.find(query)
      .select('name employeeType class salary finalSalary rfid department')
      .populate('department', 'name');

    // Calculate compensation details for each worker
    const compensationReport = workers.map(worker => {
      let calculatedSalary = worker.salary;
      if (worker.employeeType === 'developer') {
        // For developers, we would calculate based on project profit (this is a placeholder)
        // In a real implementation, this would involve calculating 60% of project profits
        calculatedSalary = worker.finalSalary; // Using finalSalary as placeholder
      }

      return {
        _id: worker._id,
        name: worker.name,
        employeeType: worker.employeeType,
        class: worker.class,
        baseSalary: worker.salary,
        calculatedSalary: calculatedSalary,
        finalSalary: worker.finalSalary,
        department: worker.department?.name || 'N/A',
        rfid: worker.rfid
      };
    });

    res.status(200).json({
      message: 'Compensation report generated successfully',
      report: compensationReport,
      totalWorkers: compensationReport.length,
      totalCompensation: compensationReport.reduce((sum, worker) => sum + worker.calculatedSalary, 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate compensation report' });
  }
});

// Add developer project
const addDeveloperProject = asyncHandler(async (req, res) => {
  const { developerId, projectName, projectAmount, projectDate, subdomain, baseSalary, actualSalary } = req.body;

  if (!developerId || !projectName || !projectAmount || !projectDate || !subdomain) {
    return res.status(400).json({ message: 'All fields are required: developerId, projectName, projectAmount, projectDate, subdomain' });
  }

  if (isNaN(parseFloat(projectAmount)) || parseFloat(projectAmount) <= 0) {
    return res.status(400).json({ message: 'Project amount must be a valid positive number' });
  }

  // Verify developer exists
  const developer = await Worker.findById(developerId);
  if (!developer) {
    return res.status(404).json({ message: 'Developer not found' });
  }

  const projectAmountNum = parseFloat(projectAmount);
  const developerEarnings = projectAmountNum * 0.6;

  // Calculate final profit sharing based on salary deductions
  let finalProfitSharing = developerEarnings;
  if (baseSalary && actualSalary) {
    const deductedAmount = parseFloat(baseSalary) - parseFloat(actualSalary);
    finalProfitSharing = developerEarnings - deductedAmount;
  }

  const project = new DeveloperProject({
    developerId,
    projectName,
    projectAmount: projectAmountNum,
    developerEarnings,
    projectDate: new Date(projectDate),
    subdomain,
    baseSalary: baseSalary ? parseFloat(baseSalary) : undefined,
    actualSalary: actualSalary ? parseFloat(actualSalary) : undefined
  });

  await project.save();

  res.status(201).json({
    message: 'Developer project added successfully',
    project,
    calculationDetails: {
      projectAmount: projectAmountNum,
      sixtyPercentProfit: developerEarnings,
      baseSalary: baseSalary ? parseFloat(baseSalary) : 0,
      actualSalary: actualSalary ? parseFloat(actualSalary) : 0,
      deductedAmount: baseSalary && actualSalary ? parseFloat(baseSalary) - parseFloat(actualSalary) : 0,
      finalProfitSharing: finalProfitSharing
    }
  });
});

// Get developer projects by developer ID
const getDeveloperProjects = asyncHandler(async (req, res) => {
  const { developerId } = req.params;
  const { subdomain, month, year } = req.query;

  if (!developerId) {
    return res.status(400).json({ message: 'Developer ID is required' });
  }

  let query = { developerId };
  if (subdomain) {
    query.subdomain = subdomain;
  }

  // If month and year are provided, filter by that month/year
  if (month && year) {
    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 1);

    query.projectDate = {
      $gte: startDate,
      $lt: endDate
    };
  }

  const projects = await DeveloperProject.find(query).sort({ createdAt: -1 });

  // Calculate totals with profit sharing logic
  let totalEarnings = 0;
  let totalProjects = projects.length;
  let totalFinalProfitSharing = 0;

  projects.forEach(project => {
    totalEarnings += project.developerEarnings;

    // Calculate final profit sharing for each project
    let finalProfitSharing = project.developerEarnings;
    if (project.baseSalary && project.actualSalary) {
      const deductedAmount = project.baseSalary - project.actualSalary;
      finalProfitSharing = project.developerEarnings - deductedAmount;
    }
    totalFinalProfitSharing += finalProfitSharing;
  });

  res.status(200).json({
    projects,
    totalEarnings,
    totalFinalProfitSharing,
    totalProjects
  });
});

// Delete developer project
const deleteDeveloperProject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const project = await DeveloperProject.findByIdAndDelete(id);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  res.status(200).json({
    message: 'Project deleted successfully'
  });
});

// Get all developer projects summary for a subdomain
const getAllDeveloperProjectsSummary = asyncHandler(async (req, res) => {
  const { subdomain, month, year } = req.query; // Added month and year parameters for filtering

  if (!subdomain) {
    return res.status(400).json({ message: 'Subdomain is required' });
  }

  // Build query with optional month/year filtering
  let query = { subdomain };
  if (month && year) {
    // Filter by specific month and year
    const startDate = new Date(year, parseInt(month) - 1, 1); // month is 1-indexed
    const endDate = new Date(year, parseInt(month), 1); // Next month start

    query.projectDate = {
      $gte: startDate,
      $lt: endDate
    };
  }

  const projects = await DeveloperProject.find(query).populate('developerId', 'name salary');

  // Group projects by developer
  const projectsByDeveloper = {};
  projects.forEach(project => {
    const developerId = project.developerId._id.toString();
    if (!projectsByDeveloper[developerId]) {
      projectsByDeveloper[developerId] = {
        developer: project.developerId,
        projects: [],
        totalEarnings: 0,
        totalFinalProfitSharing: 0, // New field for calculated profit sharing
        totalProjects: 0,
        totalBaseSalary: 0,
        totalActualSalary: 0,
        totalDeductedAmount: 0
      };
    }

    projectsByDeveloper[developerId].projects.push(project);
    projectsByDeveloper[developerId].totalEarnings += project.developerEarnings;

    // Calculate final profit sharing for this project
    let finalProfitSharing = project.developerEarnings;
    if (project.baseSalary && project.actualSalary) {
      const deductedAmount = project.baseSalary - project.actualSalary;
      finalProfitSharing = project.developerEarnings - deductedAmount;
      projectsByDeveloper[developerId].totalDeductedAmount += deductedAmount;
      projectsByDeveloper[developerId].totalBaseSalary += project.baseSalary;
      projectsByDeveloper[developerId].totalActualSalary += project.actualSalary;
    }
    projectsByDeveloper[developerId].totalFinalProfitSharing += finalProfitSharing;

    projectsByDeveloper[developerId].totalProjects += 1;
  });

  // Convert to array format
  const developerSummaries = Object.values(projectsByDeveloper);

  // Calculate overall totals
  const overallTotalEarnings = developerSummaries.reduce((sum, dev) => sum + dev.totalEarnings, 0);
  const overallTotalFinalProfitSharing = developerSummaries.reduce((sum, dev) => sum + dev.totalFinalProfitSharing, 0);
  const overallTotalProjects = developerSummaries.reduce((sum, dev) => sum + dev.totalProjects, 0);
  const overallTotalBaseSalary = developerSummaries.reduce((sum, dev) => sum + dev.totalBaseSalary, 0);
  const overallTotalActualSalary = developerSummaries.reduce((sum, dev) => sum + dev.totalActualSalary, 0);
  const overallTotalDeductedAmount = developerSummaries.reduce((sum, dev) => sum + dev.totalDeductedAmount, 0);

  res.status(200).json({
    developerSummaries,
    overallTotalEarnings,
    overallTotalFinalProfitSharing,
    overallTotalProjects,
    overallTotalBaseSalary,
    overallTotalActualSalary,
    overallTotalDeductedAmount,
    totalDevelopers: developerSummaries.length,
    filter: { subdomain, month, year } // Include filter info in response
  });
});

// ─── SalaryProject (Hybrid System) CRUD ───────────────────────────────────────

// Create a new salary project
const createSalaryProject = asyncHandler(async (req, res) => {
  const { projectName, projectAmount, profitPercentage, developers, startDate, endDate, subdomain } = req.body;

  if (!projectName || !projectAmount || !startDate || !endDate || !subdomain) {
    return res.status(400).json({ message: 'projectName, projectAmount, startDate, endDate, subdomain are required' });
  }

  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ message: 'startDate must be before or equal to endDate' });
  }

  const project = new SalaryProject({
    projectName,
    projectAmount: parseFloat(projectAmount),
    profitPercentage: parseFloat(profitPercentage || 60),
    developers: developers || [],
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    subdomain
  });

  await project.save();
  const populated = await SalaryProject.findById(project._id).populate('developers', 'name rfid department');

  res.status(201).json({ message: 'Salary project created', project: populated });
});

// Get all salary projects for a subdomain (with optional month/year filter)
const getSalaryProjects = asyncHandler(async (req, res) => {
  const { subdomain, month, year } = req.query;

  if (!subdomain) return res.status(400).json({ message: 'subdomain is required' });

  let query = { subdomain };

  if (month && year) {
    const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    // Projects that overlap with this month
    query.$or = [
      { startDate: { $lte: endOfMonth }, endDate: { $gte: startOfMonth } }
    ];
  }

  const projects = await SalaryProject.find(query)
    .populate('developers', 'name rfid department')
    .sort({ startDate: -1 });

  res.status(200).json({ projects });
});

// Get salary projects for a specific worker within a date range
const getSalaryProjectsForWorker = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  const { subdomain, fromDate, toDate } = req.query;

  if (!workerId || !subdomain) {
    return res.status(400).json({ message: 'workerId and subdomain are required' });
  }

  let query = { subdomain, developers: workerId };

  if (fromDate && toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    // Projects that overlap with the date range
    query.$or = [
      { startDate: { $lte: to }, endDate: { $gte: from } }
    ];
  }

  const projects = await SalaryProject.find(query)
    .populate('developers', 'name rfid')
    .sort({ startDate: 1 });

  // For each project, calculate per-day value for this specific worker
  const enriched = projects.map(p => {
    const projectObj = p.toObject();
    const devCount = projectObj.developers.length || 1;
    const share = projectObj.projectProfit / devCount;

    // Count working days (exclude Sundays) in the project range
    const start = new Date(projectObj.startDate);
    const end = new Date(projectObj.endDate);
    let workingDays = 0;
    const cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 0) workingDays++; // Exclude Sundays
      cur.setDate(cur.getDate() + 1);
    }

    const perDayValue = workingDays > 0 ? share / workingDays : 0;

    return {
      ...projectObj,
      perDeveloperShare: share,
      totalWorkingDays: workingDays,
      perDayValue
    };
  });

  res.status(200).json({ projects: enriched });
});

// Update a salary project
const updateSalaryProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { projectName, projectAmount, profitPercentage, developers, startDate, endDate } = req.body;

  const project = await SalaryProject.findById(id);
  if (!project) return res.status(404).json({ message: 'Salary project not found' });

  if (projectName !== undefined) project.projectName = projectName;
  if (projectAmount !== undefined) project.projectAmount = parseFloat(projectAmount);
  if (profitPercentage !== undefined) project.profitPercentage = parseFloat(profitPercentage);
  if (developers !== undefined) project.developers = developers;
  if (startDate !== undefined) project.startDate = new Date(startDate);
  if (endDate !== undefined) project.endDate = new Date(endDate);

  if (project.startDate > project.endDate) {
    return res.status(400).json({ message: 'startDate must be before or equal to endDate' });
  }

  await project.save();
  const populated = await SalaryProject.findById(project._id).populate('developers', 'name rfid department');

  res.status(200).json({ message: 'Salary project updated', project: populated });
});

// Delete a salary project
const deleteSalaryProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const project = await SalaryProject.findByIdAndDelete(id);
  if (!project) return res.status(404).json({ message: 'Salary project not found' });
  res.status(200).json({ message: 'Salary project deleted' });
});

// Get bulk salary report for all workers in a date range
const getBulkSalaryReport = asyncHandler(async (req, res) => {
  const { subdomain, fromDate, toDate } = req.query;

  if (!subdomain || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Subdomain, fromDate, and toDate are required' });
  }

  try {
    const workers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } }).populate('department').select('+fines');
    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain });
    const batches = settings ? settings.batches : [];
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    const reportYear = fromDateObj.getFullYear();

    // Fetch all needed data for the subdomain once
    const allAttendanceData = await Attendance.find({ 
      subdomain,
      date: { $gte: fromDate, $lte: toDate }
    });
    const allLeaveData = await Leave.find({
      subdomain,
      $or: [{ status: 'Approved' }, { leaveType: 'Paid Leave' }]
    });
    const allSalaryProjects = await SalaryProject.find({
      subdomain,
      $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
    }).populate('developers', 'name');
    const allTickets = await Ticket.find({ subdomain });

    const results = workers.map(worker => {
      const workerId = worker._id.toString();
      
      // Filter data for this worker
      const workerAttendance = allAttendanceData.filter(record => {
        const recordDate = new Date(record.date);
        return record.worker.toString() === workerId && recordDate >= fromDateObj && recordDate <= toDateObj;
      });

      const workerLeaves = allLeaveData.filter(l => l.worker.toString() === workerId);
      
      const workerSalaryProjects = allSalaryProjects.filter(p => 
        p.developers.some(dev => dev._id.toString() === workerId)
      );

      const enrichedProjects = workerSalaryProjects.map(p => {
        const pObj = p.toObject();
        const devCount = pObj.developers.length || 1;
        const share = pObj.projectProfit / devCount;
        const start = new Date(pObj.startDate);
        const end = new Date(pObj.endDate);
        let workingDays = 0;
        const cur = new Date(start);
        while (cur <= end) {
          if (cur.getDay() !== 0) workingDays++;
          cur.setDate(cur.getDate() + 1);
        }
        return { ...pObj, perDeveloperShare: share, totalWorkingDays: workingDays, perDayValue: workingDays > 0 ? share / workingDays : 0 };
      });

      // Calculate productivity
      const report = calculateWorkerProductivity({
        worker,
        attendanceData: workerAttendance,
        fromDate,
        toDate,
        leaveData: workerLeaves,
        projects: enrichedProjects,
        options: {
          batches,
          holidays,
          permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
          deductSalary: settings ? settings.deductSalary : true,
          intervals: settings ? settings.intervals : [],
          advancedLeaveDeduction: settings ? settings.advancedLeaveDeduction : null,
          includePermission: settings?.includePermission || false,
          paidLeaveConfig: settings ? settings.paidLeaveConfig : null
        }
      });

      // Bonus
      const totalBonusAmount = worker.bonuses
        .filter(b => new Date(b.fromDate) <= toDateObj && new Date(b.toDate) >= fromDateObj)
        .reduce((sum, b) => sum + b.amount, 0);

      let finalSalaryWithBonus = (report.summary.finalSalary || 0) + totalBonusAmount;

      // Fines
      const totalFinesAmount = (worker.fines || [])
        .filter(f => {
          const fDate = new Date(f.date);
          return fDate >= fromDateObj && fDate <= toDateObj;
        })
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

      // Task Penalty
      const delayedTasks = allTickets.filter(task => {
        if (!task.endDate) return false;
        const isAssignee = task.assignee?.toString() === workerId || 
                          (Array.isArray(task.assignees) && task.assignees.some(a => a.toString() === workerId));
        if (!isAssignee) return false;

        const deadline = new Date(task.endDate);
        deadline.setHours(0, 0, 0, 0);

        if (task.status === 'Done') {
          const doneEntry = (task.statusHistory || [])
            .filter(h => h.status === 'Done')
            .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
          
          if (doneEntry) {
            const doneDate = new Date(doneEntry.changedAt);
            doneDate.setHours(0, 0, 0, 0);
            return doneDate > deadline;
          }
          return false;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return today > deadline;
        }
      }).map(task => {
        const doneEntry = (task.statusHistory || [])
          .filter(h => h.status === 'Done')
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
        return {
          endDate: task.endDate,
          doneDate: doneEntry ? doneEntry.changedAt : null
        };
      });

      // Calculate penalty using the same logic as frontend
      const parseSalary = (str) => {
        if (!str) return 0;
        const cleaned = String(str).replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
      };

      const claimedDays = new Set();
      let taskPenalty = 0;

      delayedTasks.forEach(task => {
        const start = new Date(task.endDate);
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        const end = task.doneDate ? new Date(task.doneDate) : new Date();
        end.setHours(23, 59, 59, 999);

        (report.report || []).forEach(day => {
          const dDate = new Date(`${day.date}, ${reportYear}`);
          if (dDate >= start && dDate <= end) {
            if (!claimedDays.has(day.date)) {
              claimedDays.add(day.date);
              taskPenalty += parseSalary(day.totalSalary);
            }
          }
        });
      });

      return {
        workerId,
        name: worker.name,
        department: worker.department?.name || 'N/A',
        grossFinalSalary: finalSalaryWithFines,
        taskPenalty: taskPenalty,
        totalFinalSalary: finalSalaryWithFines
      };
    });

    res.status(200).json({ reports: results });
  } catch (error) {
    console.error('Bulk salary report error:', error);
    res.status(500).json({ message: 'Failed to generate bulk salary report' });
  }
});

// Get top teams earnings summary (secure for public/worker view)
const getTopTeamsEarnings = asyncHandler(async (req, res) => {
  const { subdomain, fromDate, toDate } = req.query;

  if (!subdomain || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Subdomain, fromDate, and toDate are required' });
  }

  try {
    const workers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } }).populate('department').select('+fines');
    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain });
    const batches = settings ? settings.batches : [];
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    const reportYear = fromDateObj.getFullYear();

    const allAttendanceData = await Attendance.find({ 
      subdomain,
      date: { $gte: fromDate, $lte: toDate }
    });
    const allLeaveData = await Leave.find({
      subdomain,
      $or: [{ status: 'Approved' }, { leaveType: 'Paid Leave' }]
    });
    const allSalaryProjects = await SalaryProject.find({
      subdomain,
      $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
    }).populate('developers', 'name');
    const allTickets = await Ticket.find({ subdomain });

    const teamEarnings = {};

    workers.forEach(worker => {
      const workerId = worker._id.toString();
      const workerAttendance = allAttendanceData.filter(record => {
        const recordDate = new Date(record.date);
        return record.worker.toString() === workerId && recordDate >= fromDateObj && recordDate <= toDateObj;
      });
      const workerLeaves = allLeaveData.filter(l => l.worker.toString() === workerId);
      const workerSalaryProjects = allSalaryProjects.filter(p => 
        p.developers.some(dev => dev._id.toString() === workerId)
      );

      const enrichedProjects = workerSalaryProjects.map(p => {
        const pObj = p.toObject();
        const devCount = pObj.developers.length || 1;
        const share = pObj.projectProfit / devCount;
        const start = new Date(pObj.startDate);
        const end = new Date(pObj.endDate);
        let workingDays = 0;
        const cur = new Date(start);
        while (cur <= end) {
          if (cur.getDay() !== 0) workingDays++;
          cur.setDate(cur.getDate() + 1);
        }
        return { ...pObj, perDeveloperShare: share, totalWorkingDays: workingDays, perDayValue: workingDays > 0 ? share / workingDays : 0 };
      });

      const report = calculateWorkerProductivity({
        worker,
        attendanceData: workerAttendance,
        fromDate,
        toDate,
        leaveData: workerLeaves,
        projects: enrichedProjects,
        options: {
          batches,
          holidays,
          permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
          deductSalary: settings ? settings.deductSalary : true,
          intervals: settings ? settings.intervals : [],
          advancedLeaveDeduction: settings ? settings.advancedLeaveDeduction : null,
          includePermission: settings?.includePermission || false,
          paidLeaveConfig: settings ? settings.paidLeaveConfig : null
        }
      });

      const totalBonusAmount = worker.bonuses
        .filter(b => new Date(b.fromDate) <= toDateObj && new Date(b.toDate) >= fromDateObj)
        .reduce((sum, b) => sum + b.amount, 0);

      let finalSalaryWithBonus = (report.summary.finalSalary || 0) + totalBonusAmount;
      const totalFinesAmount = (worker.fines || [])
        .filter(f => {
          const fDate = new Date(f.date);
          return fDate >= fromDateObj && fDate <= toDateObj;
        })
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

      const delayedTasks = allTickets.filter(task => {
        if (!task.endDate) return false;
        const isAssignee = task.assignee?.toString() === workerId || 
                          (Array.isArray(task.assignees) && task.assignees.some(a => a.toString() === workerId));
        if (!isAssignee) return false;
        const deadline = new Date(task.endDate);
        deadline.setHours(0, 0, 0, 0);
        if (task.status === 'Done') {
          const doneEntry = (task.statusHistory || []).filter(h => h.status === 'Done').sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
          if (doneEntry) {
            const doneDate = new Date(doneEntry.changedAt);
            doneDate.setHours(0, 0, 0, 0);
            return doneDate > deadline;
          }
          return false;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return today > deadline;
        }
      }).map(task => {
        const doneEntry = (task.statusHistory || []).filter(h => h.status === 'Done').sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))[0];
        return { endDate: task.endDate, doneDate: doneEntry ? doneEntry.changedAt : null };
      });

      const parseSalary = (str) => {
        if (!str) return 0;
        const cleaned = String(str).replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
      };

      const claimedDays = new Set();
      let taskPenalty = 0;
      delayedTasks.forEach(task => {
        const start = new Date(task.endDate);
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        const end = task.doneDate ? new Date(task.doneDate) : new Date();
        end.setHours(23, 59, 59, 999);
        (report.report || []).forEach(day => {
          const dDate = new Date(`${day.date}, ${reportYear}`);
          if (dDate >= start && dDate <= end) {
            if (!claimedDays.has(day.date)) {
              claimedDays.add(day.date);
              taskPenalty += parseSalary(day.totalSalary);
            }
          }
        });
      });

      const totalFinalSalary = finalSalaryWithFines;
      const deptName = worker.department?.name || 'N/A';
      if (deptName !== 'N/A') {
        teamEarnings[deptName] = (teamEarnings[deptName] || 0) + totalFinalSalary;
      }
    });

    const sortedTeams = Object.entries(teamEarnings)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    res.status(200).json({ topTeams: sortedTeams });
  } catch (error) {
    console.error('Top teams earnings error:', error);
    res.status(500).json({ message: 'Failed to calculate top teams earnings' });
  }
});

module.exports = {
  giveBonus,
  removeBonus,
  resetSalary,
  getWorkerSalaryReport,
  getMySalaryReport,
  getCompensationReport,
  getBulkSalaryReport,
  getTopTeamsEarnings,
  addDeveloperProject,
  getDeveloperProjects,
  deleteDeveloperProject,
  getAllDeveloperProjectsSummary,
  // Hybrid salary project
  createSalaryProject,
  getSalaryProjects,
  getSalaryProjectsForWorker,
  updateSalaryProject,
  deleteSalaryProject
};