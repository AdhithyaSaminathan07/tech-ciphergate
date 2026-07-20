// backend/controllers/salaryController.js
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const Settings = require('../models/Settings');
const DeveloperProject = require('../models/DeveloperProject');
const SalaryProject = require('../models/SalaryProject');
const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');
const Ticket = require('../models/ticketModel');
const { calculateTaskPenalties } = require('../utils/salaryPenaltyCalculator');
const DashboardSalaryStat = require('../models/DashboardSalaryStat');
const WalletTransaction = require('../models/WalletTransaction');

// ─── Helper: Calculate 5X Unauthorized Absence Penalty ─────────────────────
// Applies ONLY to past days where employee was absent (no punch-in),
// has no Approved leave, no Pending leave, AND either has a Rejected leave
// or submitted no leave at all.
// Permissions are completely excluded — this applies to full-day Leaves only.
const calculateUnauthorizedAbsencePenalty = (worker, fromDate, toDate, allLeaves, attendanceData, holidays, settings) => {
  const penalties = [];
  let totalPenalty = 0;

  // Get today's date in IST (same timezone as the rest of the app)
  const now = new Date();
  const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const todayStr = indiaDateFormatter.format(now);

  // Compute perDaySalary: salary / working days in period (excluding Sundays)
  const fromDateObj = new Date(fromDate);
  const toDateObj = new Date(toDate);
  let workingDays = 0;
  const counter = new Date(fromDateObj);
  while (counter <= toDateObj) {
    if (counter.getDay() !== 0) workingDays++;
    counter.setDate(counter.getDate() + 1);
  }
  const perDaySalary = workingDays > 0 ? (worker.salary || 0) / workingDays : 0;

  // Build a set of dateStrings that have a punch-in (presence === true)
  const punchInDates = new Set();
  attendanceData.forEach(att => {
    if (att.presence === true) {
      // Attendance date is stored as a string in the DB
      const dStr = typeof att.date === 'string' ? att.date : indiaDateFormatter.format(new Date(att.date));
      punchInDates.add(dStr);
    }
  });

  // Build holiday date set for quick lookup
  const holidayDates = new Set();
  holidays.forEach(h => {
    const hDate = indiaDateFormatter.format(new Date(h.date));
    holidayDates.add(hDate);
  });

  const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
  const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;

  // Compute per-minute salary if permission penalty is enabled
  let perMinuteSalary = 0;
  let workStart = 0;
  let workEnd = 0;
  let lunchStart = 0;
  let lunchEnd = 0;
  let isLunchConsider = false;
  
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    let time = timeStr.trim();
    const match = time.match(/^(\d+):(\d+)(?:\s*(AM|PM))?$/i);
    if (!match) return 0;
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
  };

  if (enableUnauthorizedPermissionPenalty) {
    const selectedBatch = settings?.batches?.find(batch => batch.batchName === worker.batch);
    const workStartTime = selectedBatch ? selectedBatch.from : '09:00';
    const workEndTime = selectedBatch ? selectedBatch.to : '19:00';
    workStart = timeToMinutes(workStartTime);
    workEnd = timeToMinutes(workEndTime);
    let standardWorkingMinutes = workEnd - workStart;

    isLunchConsider = selectedBatch ? selectedBatch.isLunchConsider : false;
    if (!isLunchConsider) {
      const lunchFrom = selectedBatch ? selectedBatch.lunchFrom : '12:00';
      const lunchTo = selectedBatch ? selectedBatch.lunchTo : '13:00';
      lunchStart = timeToMinutes(lunchFrom);
      lunchEnd = timeToMinutes(lunchTo);
      const lunchOverlapStart = Math.max(workStart, lunchStart);
      const lunchOverlapEnd = Math.min(workEnd, lunchEnd);
      if (lunchOverlapEnd > lunchOverlapStart) {
        standardWorkingMinutes -= (lunchOverlapEnd - lunchOverlapStart);
      }
    }

    if (settings?.intervals) {
      settings.intervals.forEach(interval => {
        if (!interval.isBreakConsider) {
          const intervalStart = timeToMinutes(interval.from);
          const intervalEnd = timeToMinutes(interval.to);
          const intervalOverlapStart = Math.max(workStart, intervalStart);
          const intervalOverlapEnd = Math.min(workEnd, intervalEnd);
          if (intervalOverlapEnd > intervalOverlapStart) {
            standardWorkingMinutes -= (intervalOverlapEnd - intervalOverlapStart);
          }
        }
      });
    }

    if (standardWorkingMinutes <= 0) standardWorkingMinutes = 540;
    perMinuteSalary = perDaySalary / standardWorkingMinutes;
  }

  // Iterate every day in the report range
  const d = new Date(fromDateObj);
  while (d <= toDateObj) {
    const dateStr = indiaDateFormatter.format(d);

    // ── Safety Rule: Only evaluate PAST and PRESENT days ──
    if (dateStr > todayStr) {
      d.setDate(d.getDate() + 1);
      continue;
    }

    // ── Skip Sundays ──
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
      continue;
    }

    // ── Skip Holidays ──
    if (holidayDates.has(dateStr)) {
      d.setDate(d.getDate() + 1);
      continue;
    }

    let hasDeductedFullDay = false;

    // ── 1. Full-day Penalty Check ──
    if (enableUnauthorizedLeavePenalty) {
      // Safety Rule: If employee punched in, NO 5X full-day penalty
      if (!punchInDates.has(dateStr)) {
        // Find any full-day leaves covering this date
        const fullDayLeavesForDay = allLeaves.filter(l => {
          if (l.leaveType === 'Permission') return false;
          const start = indiaDateFormatter.format(new Date(l.startDate));
          const end = indiaDateFormatter.format(new Date(l.endDate));
          return dateStr >= start && dateStr <= end;
        });

        // Safety Rule: Approved leave → normal processing, skip
        const hasApprovedLeave = fullDayLeavesForDay.some(l => l.status === 'Approved' || l.leaveType === 'Paid Leave');
        
        if (!hasApprovedLeave) {
          const hasRejectedLeave = fullDayLeavesForDay.some(l => l.status === 'Rejected');
          const hasPendingLeave = fullDayLeavesForDay.some(l => l.status === 'Pending');
          const hasNoLeave = fullDayLeavesForDay.length === 0;

          if (hasRejectedLeave || hasPendingLeave || hasNoLeave) {
            const penaltyAmount = parseFloat((perDaySalary * 5).toFixed(4));
            
            let leaveStatus = 'No Leave Request';
            let status = 'Unauthorized Absence';
            let reason = 'Absent Without Leave Request';

            if (hasRejectedLeave) {
              leaveStatus = 'Rejected';
              status = 'Unauthorized Leave';
              reason = 'Leave Request Rejected';
            } else if (hasPendingLeave) {
              leaveStatus = 'Pending';
              status = 'Unauthorized Leave';
              reason = 'Leave Request Pending Approval';
            }

            penalties.push({
              date: dateStr,
              displayDate: new Intl.DateTimeFormat('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                timeZone: 'Asia/Kolkata'
              }).format(new Date(dateStr + 'T00:00:00')),
              status,
              leaveStatus,
              penaltyFactor: 5,
              penaltyAmount,
              perDaySalary: parseFloat(perDaySalary.toFixed(4)),
              reason
            });
            totalPenalty += penaltyAmount;
            hasDeductedFullDay = true;
          }
        }
      }
    }

    // ── 2. Permission Penalty Check ──
    if (enableUnauthorizedPermissionPenalty && !hasDeductedFullDay) {
      // Find any permissions covering this date
      const permissionsForDay = allLeaves.filter(l => {
        if (l.leaveType !== 'Permission') return false;
        const start = indiaDateFormatter.format(new Date(l.startDate));
        const end = indiaDateFormatter.format(new Date(l.endDate));
        return dateStr >= start && dateStr <= end;
      });

      const unapprovedPermissions = permissionsForDay.filter(l => l.status === 'Pending' || l.status === 'Rejected');

      unapprovedPermissions.forEach(perm => {
        const permStart = Math.max(timeToMinutes(perm.startTime), workStart);
        const permEnd = Math.min(timeToMinutes(perm.endTime), workEnd);
        let permMinutes = permEnd - permStart;

        if (permMinutes > 0) {
          // Adjust for lunch overlap
          if (!isLunchConsider) {
            const overlapStart = Math.max(permStart, lunchStart);
            const overlapEnd = Math.min(permEnd, lunchEnd);
            if (overlapEnd > overlapStart) {
              permMinutes -= (overlapEnd - overlapStart);
            }
          }

          // Adjust for other configured intervals (tea breaks)
          if (settings?.intervals) {
            settings.intervals.forEach(interval => {
              if (!interval.isBreakConsider) {
                const intervalStart = timeToMinutes(interval.from);
                const intervalEnd = timeToMinutes(interval.to);
                const overlapStart = Math.max(permStart, intervalStart);
                const overlapEnd = Math.min(permEnd, intervalEnd);
                if (overlapEnd > overlapStart) {
                  permMinutes -= (overlapEnd - overlapStart);
                }
              }
            });
          }

          permMinutes = Math.max(0, permMinutes);

          if (permMinutes > 0) {
            const penaltyAmount = parseFloat((permMinutes * perMinuteSalary * 5).toFixed(4));

            const formatTime = (timeStr) => {
              if (!timeStr) return '';
              if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
              try {
                const [hourStr, minStr] = timeStr.split(':');
                let hour = parseInt(hourStr);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour % 12 || 12;
                return `${displayHour}:${minStr.substring(0, 2)} ${ampm}`;
              } catch (e) {
                return timeStr;
              }
            };

            const displayTime = `${formatTime(perm.startTime)} - ${formatTime(perm.endTime)}`;
            const reason = perm.status === 'Rejected'
              ? `Permission Request Rejected (${displayTime})`
              : `Permission Request Pending Approval (${displayTime})`;

            penalties.push({
              date: dateStr,
              displayDate: new Intl.DateTimeFormat('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                timeZone: 'Asia/Kolkata'
              }).format(new Date(dateStr + 'T00:00:00')),
              status: 'Unauthorized Permission',
              leaveStatus: perm.status,
              penaltyFactor: 5,
              penaltyAmount,
              perDaySalary: parseFloat(perDaySalary.toFixed(4)),
              reason
            });
            totalPenalty += penaltyAmount;
          }
        }
      });
    }

    d.setDate(d.getDate() + 1);
  }

  return {
    penalties,
    totalUnauthorizedPenalty: parseFloat(totalPenalty.toFixed(4))
  };
};

// ─── Helper: Automatically record/freeze project payments for a past month ───
const autoRecordProjectPaymentsHelper = async (employeeId, subdomain, month, year) => {
  const monthStart = new Date(year, month - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Find all projects this employee is assigned to that overlap with this month
  const salaryProjects = await SalaryProject.find({
    subdomain,
    developers: employeeId,
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart }
  }).populate('developers', 'name');

  if (salaryProjects.length === 0) {
    return [];
  }

  const ledgers = [];
  for (const project of salaryProjects) {
    // Only record if not already recorded/settled
    const existing = await ProjectPaymentLedger.findOne({ employeeId, projectId: project._id, month, year });
    if (existing && existing.isSettled) {
      continue;
    }

    const pObj = project.toObject();
    const devCount = pObj.developers.length || 1;
    const share = pObj.projectProfit / devCount;
    const startD = new Date(pObj.startDate);
    const endD = new Date(pObj.endDate);
    let totalWorkingDays = 0;
    const cur = new Date(startD);
    while (cur <= endD) {
      if (cur.getDay() !== 0) totalWorkingDays++;
      cur.setDate(cur.getDate() + 1);
    }
    const perDayValue = totalWorkingDays > 0 ? share / totalWorkingDays : 0;

    const projectStart = new Date(pObj.startDate);
    projectStart.setHours(0, 0, 0, 0);
    const projectEnd = new Date(pObj.endDate);
    projectEnd.setHours(23, 59, 59, 999);
    const overlapStart = new Date(Math.max(monthStart.getTime(), projectStart.getTime()));
    const overlapEnd = new Date(Math.min(monthEnd.getTime(), projectEnd.getTime()));

    let paidWorkingDays = 0;
    if (overlapStart <= overlapEnd) {
      const d = new Date(overlapStart);
      d.setHours(0, 0, 0, 0);
      while (d <= overlapEnd) {
        if (d.getDay() !== 0) paidWorkingDays++;
        d.setDate(d.getDate() + 1);
      }
    }

    const paidAmount = paidWorkingDays * perDayValue;

    const ledger = await ProjectPaymentLedger.findOneAndUpdate(
      { employeeId, projectId: project._id, month, year },
      {
        subdomain,
        paidAmount,
        paidPerDayValue: perDayValue,
        paidWorkingDays,
        projectTotalWorkingDaysAtPayment: totalWorkingDays,
        perDeveloperShareAtPayment: share,
        currentPerDayValue: perDayValue,
        currentEntitlement: paidAmount,
        adjustmentAmount: 0,
        isSettled: true,
        settledAt: new Date(),
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    ledgers.push(ledger);
  }
  return ledgers;
};

// ─── Helper: Calculate project adjustments from frozen ledger entries ──────────
// This function recalculates adjustments for ALL past frozen payments for a worker.
// It uses CURRENT project data (duration, developer count) to compute what the
// employee SHOULD have earned, then compares against what was actually paid.
// Adjustment = currentEntitlement - paidAmount (negative = overpaid)
const calculateProjectAdjustments = async (workerId, subdomain, currentMonth, currentYear) => {
  // Find all settled/frozen ledger entries for this worker (past months only)
  const ledgerEntries = await ProjectPaymentLedger.find({
    employeeId: workerId,
    subdomain,
    isSettled: true,
    // Exclude current month — current month hasn't been paid yet
    $or: [
      { year: { $lt: currentYear } },
      { year: currentYear, month: { $lt: currentMonth } }
    ]
  });

  if (ledgerEntries.length === 0) {
    return { totalAdjustment: 0, adjustmentDetails: [] };
  }

  // Get unique project IDs from ledger
  const projectIds = [...new Set(ledgerEntries.map(l => l.projectId.toString()))];

  // Fetch CURRENT project data to get the latest duration
  const projects = await SalaryProject.find({ _id: { $in: projectIds } }).populate('developers', 'name');
  const projectMap = {};
  projects.forEach(p => {
    const pObj = p.toObject();
    const devCount = pObj.developers.length || 1;
    const share = pObj.projectProfit / devCount;
    // Count CURRENT total working days (excluding Sundays)
    const start = new Date(pObj.startDate);
    const end = new Date(pObj.endDate);
    let workingDays = 0;
    const cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 0) workingDays++;
      cur.setDate(cur.getDate() + 1);
    }
    const currentPerDay = workingDays > 0 ? share / workingDays : 0;
    projectMap[pObj._id.toString()] = {
      ...pObj,
      currentPerDeveloperShare: share,
      currentTotalWorkingDays: workingDays,
      currentPerDayValue: currentPerDay
    };
  });

  let totalAdjustment = 0;
  const adjustmentDetails = [];

  for (const entry of ledgerEntries) {
    const project = projectMap[entry.projectId.toString()];
    if (!project) continue;

    // Recalculate: what SHOULD have been paid for that month
    const currentEntitlement = entry.paidWorkingDays * project.currentPerDayValue;
    const adjustment = currentEntitlement - entry.paidAmount;

    // Update ledger entry with recalculated values (for audit trail) only if they changed
    if (
      entry.currentPerDayValue !== project.currentPerDayValue ||
      entry.currentEntitlement !== currentEntitlement ||
      entry.adjustmentAmount !== adjustment
    ) {
      entry.currentPerDayValue = project.currentPerDayValue;
      entry.currentEntitlement = currentEntitlement;
      entry.adjustmentAmount = adjustment;
      entry.updatedAt = new Date();
      await entry.save();
    }

    totalAdjustment += adjustment;
    adjustmentDetails.push({
      projectId: entry.projectId,
      projectName: project.projectName,
      month: entry.month,
      year: entry.year,
      paidAmount: entry.paidAmount,
      paidPerDayValue: entry.paidPerDayValue,
      paidWorkingDays: entry.paidWorkingDays,
      currentPerDayValue: project.currentPerDayValue,
      currentEntitlement,
      adjustment,
      originalTotalDays: entry.projectTotalWorkingDaysAtPayment,
      currentTotalDays: project.currentTotalWorkingDays
    });
  }

  return { totalAdjustment, adjustmentDetails };
};

const calculateDailyAttendancePenalties = async (subdomain, fromDate, toDate, workerId, workerDeptId, thresh) => {
  const companyPenaltyMap = {};
  const deptPenaltyMap = {};

  const companyEnabled = thresh.company?.enabled ?? true;
  const deptEnabled = thresh.department?.enabled ?? true;

  if (!companyEnabled && !deptEnabled) return { companyPenaltyMap, deptPenaltyMap };

  const companyVal = thresh.company?.value ?? thresh.company ?? 80;
  const deptVal = thresh.department?.value ?? thresh.department ?? 80;

  const allCompanyWorkers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } })
    .select('_id department')
    .lean();
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
  }).select('worker date').lean();

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

  const allLeavesForPenalty = await Leave.find({ worker: id });
  const leaveData = allLeavesForPenalty.filter(l => l.status === 'Approved' || l.leaveType === 'Paid Leave');

  const holidays = await Holiday.find({});
  const settings = await Settings.findOne({ subdomain: worker.subdomain });
  const batches = settings ? settings.batches : [];

  // Calculate worker productivity to get actual earned salary
  const productivityReport = calculateWorkerProductivity({
    worker,
    attendanceData,
    fromDate,
    toDate,
    leaveData,
    options: {
      batches,
      holidays,
      permissionTimeMinutes: settings ? settings.permissionTimeMinutes : 15,
      deductSalary: settings ? settings.deductSalary : true,
      intervals: settings ? settings.intervals : []
    }
  });

  // Get the worker's actual earned salary from the report and apply 5X penalty
  const standardEarnedSalary = productivityReport.summary.finalSalary || 0;
  const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
  const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
  const { totalUnauthorizedPenalty } = (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
    ? calculateUnauthorizedAbsencePenalty(
        worker,
        fromDate,
        toDate,
        allLeavesForPenalty,
        attendanceData,
        holidays,
        settings
      )
    : { totalUnauthorizedPenalty: 0 };

  const actualEarnedSalary = Math.max(0, standardEarnedSalary - totalUnauthorizedPenalty);
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

    // Filter attendance data directly in the database using range queries on the date string
    const attendanceData = await Attendance.find({
      worker: id,
      date: { $gte: fromDate, $lte: toDate }
    });

    const leaveData = await Leave.find({
      worker: id,
      $or: [
        { status: 'Approved' },
        { leaveType: 'Paid Leave' }
      ]
    });

    // Fetch ALL leaves (all statuses) separately for the 5X unauthorized absence penalty check
    // This does NOT affect the existing salary calculation (leaveData above remains unchanged)
    const allLeavesForPenalty = await Leave.find({ worker: id });

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

    // Fetch all tasks for this worker
    const allTasks = await Ticket.find({
      $or: [
        { assignee: id },
        { assignees: id }
      ],
      subdomain: worker.subdomain,
      isDeleted: { $ne: true }
    });

    const { taskPenalties: delayedTasks, totalTaskPenalty: taskPenalty } = calculateTaskPenalties({
      worker,
      tickets: allTasks,
      report,
      fromDate,
      toDate
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

    // ─── PROJECT ADJUSTMENT LEDGER: Recalculate past overpayments/underpayments ──
    const reportFromDate = new Date(fromDate);
    const currentReportMonth = reportFromDate.getMonth() + 1;
    const currentReportYear = reportFromDate.getFullYear();

    // Auto-record if it is a completed past month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isPastMonth = (currentReportYear < currentYear) || (currentReportYear === currentYear && currentReportMonth < currentMonth);
    if (isPastMonth) {
      await autoRecordProjectPaymentsHelper(id, worker.subdomain, currentReportMonth, currentReportYear);
    }

    const { totalAdjustment: projectAdjustment, adjustmentDetails: projectAdjustmentDetails } = await calculateProjectAdjustments(
      id, worker.subdomain, currentReportMonth, currentReportYear
    );

    // Apply project adjustment to final salary (adjustment may be negative for overpayments)
    const finalSalaryWithAdjustment = Math.max(0, finalSalaryWithFines + projectAdjustment);

    // ── 5X Unauthorized Absence Penalty (separate from all existing calculations) ──
    // Only triggers for past days where employee: did not punch in, has no Approved/Pending leave,
    // and either has a Rejected leave OR submitted no leave at all.
    // Permissions are excluded entirely. Does NOT modify leaveData or existing salary logic.
    const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
    const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
    const { penalties: unauthorizedAbsencePenalties, totalUnauthorizedPenalty } =
      (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
        ? calculateUnauthorizedAbsencePenalty(
            worker,
            fromDate,
            toDate,
            allLeavesForPenalty,
            attendanceData,
            holidays,
            settings
          )
        : { penalties: [], totalUnauthorizedPenalty: 0 };

    // Final salary after subtracting unauthorized absence penalty
    const finalSalaryAfterUnauthorizedPenalty = Math.max(0, finalSalaryWithAdjustment - totalUnauthorizedPenalty);

    res.status(200).json({
      message: 'Salary report generated successfully',
      baseSalary: worker.salary,
      finalSalary: finalSalaryAfterUnauthorizedPenalty,
      actualEarnedSalary: report.summary.finalSalary || 0,
      totalDeductions: (report.summary.totalSalaryDeduction || 0) + totalFinesAmount,
      report,
      bonuses: bonusesForPeriod,
      totalBonusAmount: totalBonusAmount,
      totalFinesAmount: totalFinesAmount,
      finalSalaryWithBonus: finalSalaryWithBonus,
      finalSalaryWithFines: finalSalaryAfterUnauthorizedPenalty, // includes unauthorized penalty deduction
      projectAdjustment,
      projectAdjustmentDetails,
      isCurrentlyViolating,
      earliestDeadline,
      delayedTasks,
      taskPenalty,
      projectBreakdown,
      // 5X Unauthorized Absence Penalty — stored separately for display
      unauthorizedAbsencePenalties,
      totalUnauthorizedPenalty,
      worker: {
        name: worker.name,
        salary: worker.salary,
        finalSalary: worker.finalSalary,
        perDaySalary: worker.perDaySalary,
        fines: worker.fines
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

    // Filter attendance data directly in the database using range queries on the date string
    const attendanceData = await Attendance.find({
      worker: id,
      date: { $gte: start, $lte: end }
    });

    const leaveData = await Leave.find({
      worker: id,
      $or: [
        { status: 'Approved' },
        { leaveType: 'Paid Leave' }
      ]
    });

    // Fetch ALL leaves (all statuses) separately for the 5X unauthorized absence penalty check
    const allLeavesForPenalty = await Leave.find({ worker: id });

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

    const rptStartDateObj = new Date(start);
    const rptMonth = rptStartDateObj.getMonth() + 1;
    const rptYear = rptStartDateObj.getFullYear();
    const settledLedgers = await ProjectPaymentLedger.find({
      employeeId: id,
      month: rptMonth,
      year: rptYear,
      isSettled: true,
      subdomain: worker.subdomain
    });

    const enrichedProjects = salaryProjects.map(p => {
      const pObj = p.toObject();
      const devCount = pObj.developers.length || 1;
      let share = pObj.projectProfit / devCount;
      const pStart = new Date(pObj.startDate);
      const pEnd = new Date(pObj.endDate);
      let workingDays = 0;
      const cur = new Date(pStart);
      while (cur <= pEnd) {
        if (cur.getDay() !== 0) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
      
      let perDayValue = workingDays > 0 ? share / workingDays : 0;
      let totalWorkingDays = workingDays;

      const ledger = settledLedgers.find(l => l.projectId.toString() === pObj._id.toString());
      if (ledger) {
        share = ledger.perDeveloperShareAtPayment;
        perDayValue = ledger.paidPerDayValue;
        totalWorkingDays = ledger.projectTotalWorkingDaysAtPayment || totalWorkingDays;
      }

      return { ...pObj, perDeveloperShare: share, totalWorkingDays: totalWorkingDays, perDayValue: perDayValue };
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
        paidLeaveConfig: settings ? settings.paidLeaveConfig : null,
        isEmployeeDashboard: true
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
          return fineDate >= new Date(start) && fineDate <= new Date(end);
        })
        .reduce((total, fine) => total + (fine.amount || 0), 0);
    }

    const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

    // Fetch all tasks for this worker
    const allTasks = await Ticket.find({
      $or: [
        { assignee: id },
        { assignees: id }
      ],
      subdomain: worker.subdomain,
      isDeleted: { $ne: true }
    });

    const { taskPenalties: delayedTasks, totalTaskPenalty: taskPenalty } = calculateTaskPenalties({
      worker,
      tickets: allTasks,
      report,
      fromDate: start,
      toDate: end
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

    // ─── PROJECT ADJUSTMENT LEDGER: Recalculate past overpayments/underpayments ──
    const startDateObj = new Date(start);
    const currentReportMonth = startDateObj.getMonth() + 1;
    const currentReportYear = startDateObj.getFullYear();

    // Auto-record if it is a completed past month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isPastMonth = (currentReportYear < currentYear) || (currentReportYear === currentYear && currentReportMonth < currentMonth);
    if (isPastMonth) {
      await autoRecordProjectPaymentsHelper(id, worker.subdomain, currentReportMonth, currentReportYear);
    }

    const { totalAdjustment: projectAdjustment, adjustmentDetails: projectAdjustmentDetails } = await calculateProjectAdjustments(
      id, worker.subdomain, currentReportMonth, currentReportYear
    );

    // Apply project adjustment to final salary
    const finalSalaryWithAdjustment = Math.max(0, finalSalaryWithFines + projectAdjustment);

    // ── 5X Unauthorized Absence Penalty (separate from all existing calculations) ──
    const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
    const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
    const { penalties: unauthorizedAbsencePenalties, totalUnauthorizedPenalty } =
      (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
        ? calculateUnauthorizedAbsencePenalty(
            worker,
            start,
            end,
            allLeavesForPenalty,
            attendanceData,
            holidays,
            settings
          )
        : { penalties: [], totalUnauthorizedPenalty: 0 };

    const finalSalaryAfterUnauthorizedPenalty = Math.max(0, finalSalaryWithAdjustment - totalUnauthorizedPenalty);

    const responseData = {
      message: 'Salary report generated successfully',
      baseSalary: worker.salary,
      finalSalary: finalSalaryAfterUnauthorizedPenalty,
      actualEarnedSalary: report.summary.finalSalary || 0,
      totalDeductions: (report.summary.totalSalaryDeduction || 0) + totalFinesAmount,
      report,
      bonuses: bonusesForPeriod,
      totalBonusAmount: totalBonusAmount,
      totalFinesAmount: totalFinesAmount,
      finalSalaryWithBonus: finalSalaryWithBonus,
      finalSalaryWithFines: finalSalaryAfterUnauthorizedPenalty,
      projectAdjustment,
      projectAdjustmentDetails,
      isCurrentlyViolating,
      earliestDeadline,
      delayedTasks,
      taskPenalty,
      projectBreakdown,
      // 5X Unauthorized Absence Penalty — stored separately for display
      unauthorizedAbsencePenalties,
      totalUnauthorizedPenalty,
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
  const { projectName, projectAmount, profitPercentage, walletPercentage, developers, startDate, endDate, subdomain } = req.body;

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
    walletPercentage: parseFloat(walletPercentage || 0),
    developers: developers || [],
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    subdomain
  });

  await project.save();

  // Credit wallets if applicable
  if (project.walletAmount > 0 && project.developers.length > 0) {
    const Worker = require('../models/Worker');
    const WalletTransaction = require('../models/WalletTransaction');
    
    for (const devId of project.developers) {
      const worker = await Worker.findById(devId);
      if (worker) {
        worker.walletBalance = (worker.walletBalance || 0) + project.perDeveloperWalletShare;
        await worker.save();
        
        await WalletTransaction.create({
          workerId: devId,
          projectId: project._id,
          type: 'Credit',
          amount: project.perDeveloperWalletShare,
          balanceAfter: worker.walletBalance,
          description: `Wallet share (Project: ${project.projectName})`,
          subdomain,
          actionBy: req.user ? req.user._id : null
        });
      }
    }
  }

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
  const { projectName, projectAmount, profitPercentage, walletPercentage, developers, startDate, endDate } = req.body;

  const project = await SalaryProject.findById(id);
  if (!project) return res.status(404).json({ message: 'Salary project not found' });

  // REVERT OLD WALLET CREDITS
  const Worker = require('../models/Worker');
  const WalletTransaction = require('../models/WalletTransaction');
  const oldWalletTxns = await WalletTransaction.find({ projectId: project._id, type: 'Credit' });
  for (const txn of oldWalletTxns) {
    const worker = await Worker.findById(txn.workerId);
    if (worker) {
      worker.walletBalance = Math.max(0, (worker.walletBalance || 0) - txn.amount);
      await worker.save();
    }
    await WalletTransaction.findByIdAndDelete(txn._id);
  }

  if (projectName !== undefined) project.projectName = projectName;
  if (projectAmount !== undefined) project.projectAmount = parseFloat(projectAmount);
  if (profitPercentage !== undefined) project.profitPercentage = parseFloat(profitPercentage);
  if (walletPercentage !== undefined) project.walletPercentage = parseFloat(walletPercentage);
  if (developers !== undefined) project.developers = developers;
  if (startDate !== undefined) project.startDate = new Date(startDate);
  if (endDate !== undefined) project.endDate = new Date(endDate);

  if (project.startDate > project.endDate) {
    return res.status(400).json({ message: 'startDate must be before or equal to endDate' });
  }

  await project.save();

  // APPLY NEW WALLET CREDITS
  if (project.walletAmount > 0 && project.developers.length > 0) {
    for (const devId of project.developers) {
      const worker = await Worker.findById(devId);
      if (worker) {
        worker.walletBalance = (worker.walletBalance || 0) + project.perDeveloperWalletShare;
        await worker.save();
        
        await WalletTransaction.create({
          workerId: devId,
          projectId: project._id,
          type: 'Credit',
          amount: project.perDeveloperWalletShare,
          balanceAfter: worker.walletBalance,
          description: `Wallet share (Project: ${project.projectName})`,
          subdomain: project.subdomain,
          actionBy: req.user ? req.user._id : null
        });
      }
    }
  }

  // FIX: Sync existing frozen project ledgers to match new project details to avoid unintended adjustments
  const ledgers = await ProjectPaymentLedger.find({ projectId: project._id, isSettled: true });
  if (ledgers.length > 0) {
    const devCount = project.developers.length || 1;
    const share = project.projectProfit / devCount;
    const startD = new Date(project.startDate);
    const endD = new Date(project.endDate);
    let totalWorkingDays = 0;
    const cur = new Date(startD);
    while (cur <= endD) {
      if (cur.getDay() !== 0) totalWorkingDays++;
      cur.setDate(cur.getDate() + 1);
    }
    const perDayValue = totalWorkingDays > 0 ? share / totalWorkingDays : 0;

    for (const ledger of ledgers) {
      const currentEntitlement = ledger.paidWorkingDays * perDayValue;
      ledger.paidAmount = currentEntitlement;
      ledger.paidPerDayValue = perDayValue;
      ledger.projectTotalWorkingDaysAtPayment = totalWorkingDays;
      ledger.perDeveloperShareAtPayment = share;
      ledger.currentPerDayValue = perDayValue;
      ledger.currentEntitlement = currentEntitlement;
      ledger.adjustmentAmount = 0;
      await ledger.save();
    }
  }

  const populated = await SalaryProject.findById(project._id).populate('developers', 'name rfid department');

  res.status(200).json({ message: 'Salary project updated', project: populated });
});

// Delete a salary project
const deleteSalaryProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Revert wallet credits first
  const Worker = require('../models/Worker');
  const WalletTransaction = require('../models/WalletTransaction');
  const oldWalletTxns = await WalletTransaction.find({ projectId: id, type: 'Credit' });
  for (const txn of oldWalletTxns) {
    const worker = await Worker.findById(txn.workerId);
    if (worker) {
      worker.walletBalance = Math.max(0, (worker.walletBalance || 0) - txn.amount);
      await worker.save();
    }
    await WalletTransaction.findByIdAndDelete(txn._id);
  }

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const isExport = req.query.isExport === 'true';
    const { searchTerm, filterDepartment, filterMinSalary, filterMaxSalary, filterFineStatus, filterBankStatus, sortBy } = req.query;

    const query = { subdomain, status: { $ne: 'Relieved' } };

    // 1. Search Term (name, rfid, or department name)
    if (searchTerm) {
      const Department = require('../models/Department');
      const matchedDepts = await Department.find({ subdomain, name: { $regex: searchTerm, $options: 'i' } });
      const matchedDeptIds = matchedDepts.map(d => d._id);

      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { rfid: { $regex: searchTerm, $options: 'i' } },
        { department: { $in: matchedDeptIds } }
      ];
    }

    // 2. Department filter
    if (filterDepartment && filterDepartment !== 'All') {
      query.department = filterDepartment;
    }

    // 3. Min/Max Salary
    if (filterMinSalary) {
      query.salary = { ...query.salary, $gte: parseFloat(filterMinSalary) };
    }
    if (filterMaxSalary) {
      query.salary = { ...query.salary, $lte: parseFloat(filterMaxSalary) };
    }

    // 4. Fine Status (Has Fines / No Fines)
    if (filterFineStatus && filterFineStatus !== 'All') {
      const startOfMonth = new Date(fromDate);
      const endOfMonth = new Date(toDate);
      if (filterFineStatus === 'Has Fines') {
        query.fines = {
          $elemMatch: {
            date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        };
      } else if (filterFineStatus === 'No Fines') {
        query.fines = {
          $not: {
            $elemMatch: {
              date: { $gte: startOfMonth, $lte: endOfMonth }
            }
          }
        };
      }
    }

    // 5. Bank Status
    if (filterBankStatus && filterBankStatus !== 'All') {
      if (filterBankStatus === 'Added') {
        query['bankDetails.accountNumber'] = { $exists: true, $ne: '' };
        query['bankDetails.ifscCode'] = { $exists: true, $ne: '' };
      } else if (filterBankStatus === 'Pending') {
        query.$or = [
          { 'bankDetails.accountNumber': { $exists: false } },
          { 'bankDetails.accountNumber': '' },
          { 'bankDetails.ifscCode': { $exists: false } },
          { 'bankDetails.ifscCode': '' }
        ];
      }
    }

    // Determine total matching workers count
    const totalWorkersCount = await Worker.countDocuments(query);

    // Dynamic sort vs DB sort
    const needsInMemorySort = ['final-asc', 'final-desc', 'fine-desc'].includes(sortBy);

    let workersQuery = Worker.find(query).populate('department').select('+fines');

    if (!needsInMemorySort && !isExport && req.query.page) {
      if (sortBy === 'name-asc') {
        workersQuery = workersQuery.sort({ name: 1 });
      } else if (sortBy === 'name-desc') {
        workersQuery = workersQuery.sort({ name: -1 });
      } else if (sortBy === 'salary-asc') {
        workersQuery = workersQuery.sort({ salary: 1 });
      } else if (sortBy === 'salary-desc') {
        workersQuery = workersQuery.sort({ salary: -1 });
      } else {
        workersQuery = workersQuery.sort({ name: 1 }); // default fallback
      }
      workersQuery = workersQuery.skip((page - 1) * limit).limit(limit);
    } else if (!needsInMemorySort) {
      // Default sorting for non-paginated queries (e.g. export or no-page)
      workersQuery = workersQuery.sort({ name: 1 });
    }

    const workers = await workersQuery;
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
      subdomain
    });
    const allSalaryProjects = await SalaryProject.find({
      subdomain,
      $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
    }).populate('developers', 'name');
    const allTickets = await Ticket.find({ subdomain, isDeleted: { $ne: true } });

    // Enterprise Payroll Module: Fetch payroll records for this month
    const bulkFromDate = new Date(fromDate);
    const bulkMonth = bulkFromDate.getMonth() + 1;
    const bulkYear = bulkFromDate.getFullYear();
    const PayrollRecord = require('../models/PayrollRecord');
    const allPayrollRecords = await PayrollRecord.find({
      subdomain,
      month: bulkMonth,
      year: bulkYear
    }).populate('adjustments.addedBy', 'name');

    // PRE-FETCH AND PRE-COMPUTE DATA FOR LOOP OPTIMIZATION
    const attendanceByDate = {};
    allAttendanceData.forEach(att => {
      if (att.presence) {
        if (!attendanceByDate[att.date]) attendanceByDate[att.date] = { company: [], dept: {} };
        const wId = att.worker.toString();
        attendanceByDate[att.date].company.push(wId);
        const attWorker = workers.find(w => w._id.toString() === wId);
        if (attWorker) {
          const attWorkerDeptId = attWorker.department?._id?.toString() || attWorker.department?.toString();
          if (!attendanceByDate[att.date].dept[attWorkerDeptId]) {
             attendanceByDate[att.date].dept[attWorkerDeptId] = [];
          }
          attendanceByDate[att.date].dept[attWorkerDeptId].push(wId);
        }
      }
    });

    const datesArr = [];
    let curD = new Date(fromDate);
    const eD = new Date(toDate);
    while (curD <= eD) {
      datesArr.push(curD.toISOString().split('T')[0]);
      curD.setDate(curD.getDate() + 1);
    }

    const buildPenaltyMapsForWorker = (wId, wDeptId, thresh, dArr) => {
        const cMap = {};
        const dMap = {};
        const cEnabled = thresh.company?.enabled ?? true;
        const dEnabled = thresh.department?.enabled ?? true;
        if (!cEnabled && !dEnabled) return { companyPenaltyMap: cMap, deptPenaltyMap: dMap };
        
        const cVal = thresh.company?.value ?? thresh.company ?? 80;
        const dVal = thresh.department?.value ?? thresh.department ?? 80;
        const tDeptW = workers.filter(w => (w.department?._id?.toString() || w.department?.toString()) === wDeptId).length;
        
        const wIdStr = wId.toString();
        dArr.forEach(dateStr => {
           const dayData = attendanceByDate[dateStr] || { company: [], dept: {} };
           if (cEnabled) {
             const oW = Math.max(1, workers.length - 1);
             const pW = dayData.company.filter(id => id !== wIdStr).length;
             cMap[dateStr] = ((pW / oW) * 100) < cVal;
           }
           if (dEnabled) {
             const deptList = dayData.dept[wDeptId] || [];
             const oDW = Math.max(1, tDeptW - 1);
             const pDW = deptList.filter(id => id !== wIdStr).length;
             dMap[dateStr] = ((pDW / oDW) * 100) < dVal;
           }
        });
        return { companyPenaltyMap: cMap, deptPenaltyMap: dMap };
    };

    const results = await Promise.all(workers.map(async worker => {
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

      // Calculate Company/Dept Attendance Penalties (Daily rates)
      let companyPenaltyMap = {};
      let deptPenaltyMap = {};

      if (settings && settings.advancedLeaveDeduction && settings.advancedLeaveDeduction.attendanceRuleEnabled) {
        const adv = settings.advancedLeaveDeduction;
        const thresh = adv.thresholds || {};
        const workerDeptId = worker.department?._id?.toString() || worker.department?.toString();

        const penaltyMaps = buildPenaltyMapsForWorker(workerId, workerDeptId, thresh, datesArr);
        companyPenaltyMap = penaltyMaps.companyPenaltyMap;
        deptPenaltyMap = penaltyMaps.deptPenaltyMap;
      }

      // Calculate productivity (filtering only approved/paid leaves for standard logic)
      const report = calculateWorkerProductivity({
        worker,
        attendanceData: workerAttendance,
        fromDate,
        toDate,
        leaveData: workerLeaves.filter(l => l.status === 'Approved' || l.leaveType === 'Paid Leave'),
        projects: enrichedProjects,
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

      // Bonus
      const totalBonusAmount = worker.bonuses
        .filter(b => new Date(b.fromDate) <= toDateObj && new Date(b.toDate) >= fromDateObj)
        .reduce((sum, b) => sum + b.amount, 0);

      const bonusesForPeriod = worker.bonuses.filter(bonus => {
        return (
          (new Date(bonus.fromDate) <= toDateObj) &&
          (new Date(bonus.toDate) >= fromDateObj)
        );
      });

      let finalSalaryWithBonus = (report.summary.finalSalary || 0) + totalBonusAmount;

      // Fines
      const totalFinesAmount = (worker.fines || [])
        .filter(f => {
          const fDate = new Date(f.date);
          return fDate >= fromDateObj && fDate <= toDateObj;
        })
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

      // Calculate 5X Unauthorized Absence Penalty
      const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
      const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
      const { penalties: unauthorizedAbsencePenalties, totalUnauthorizedPenalty } =
        (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
          ? calculateUnauthorizedAbsencePenalty(
              worker,
              fromDate,
              toDate,
              workerLeaves,
              workerAttendance,
              holidays,
              settings
            )
          : { penalties: [], totalUnauthorizedPenalty: 0 };

      const finalSalaryAfterUnauthorizedPenalty = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);

      // Task Penalty
      const workerTickets = allTickets.filter(task => {
        return task.assignee?.toString() === workerId ||
          (Array.isArray(task.assignees) && task.assignees.some(a => a.toString() === workerId));
      });

      const { taskPenalties: delayedTasks, totalTaskPenalty: taskPenalty } = calculateTaskPenalties({
        worker,
        tickets: workerTickets,
        report,
        fromDate,
        toDate
      });

      // ─── PROJECT ADJUSTMENT for bulk ──
      // Note: for bulk we use a sync-compatible approach — query ledger entries
      // We'll calculate this in a post-processing step below
      return {
        workerId,
        _id: worker._id,
        rfid: worker.rfid,
        salary: worker.salary,
        bankDetails: worker.bankDetails,
        fines: worker.fines,
        bonuses: worker.bonuses,
        name: worker.name,
        department: worker.department?.name || 'N/A',
        totalWorkingDays: report.summary?.totalWorkingDaysInPeriod || 0,
        actualWorkingDays: report.summary?.actualWorkingDays || 0,
        totalAbsentDays: report.summary?.totalAbsentDays || 0,
        totalLeaveDays: report.summary?.totalLeaveDays || 0,
        grossFinalSalary: finalSalaryAfterUnauthorizedPenalty,
        taskPenalty: taskPenalty,
        totalFinalSalary: finalSalaryAfterUnauthorizedPenalty,
        subdomain: worker.subdomain,
        fullReport: {
          report,
          bonuses: bonusesForPeriod,
          totalBonusAmount,
          totalFinesAmount,
          finalSalaryWithBonus,
          finalSalaryWithFines: finalSalaryAfterUnauthorizedPenalty,
          delayedTasks,
          unauthorizedAbsencePenalties,
          totalUnauthorizedPenalty,
          worker: {
            name: worker.name,
            salary: worker.salary,
            finalSalary: worker.finalSalary,
            perDaySalary: worker.perDaySalary,
            fines: worker.fines
          }
        }
      };
    }));

    // ─── Apply project adjustments to bulk results ──

    // Auto-record if it is a completed past month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isPastMonth = (bulkYear < currentYear) || (bulkYear === currentYear && bulkMonth < currentMonth);

    // Pre-fetch all past ledger entries and relevant projects to avoid N+1 queries during project adjustments
    const allPastLedgers = await ProjectPaymentLedger.find({
      subdomain,
      isSettled: true,
      $or: [
        { year: { $lt: bulkYear } },
        { year: bulkYear, month: { $lt: bulkMonth } }
      ]
    });
    
    const uniqueProjectIdsForLedgers = [...new Set(allPastLedgers.map(l => l.projectId.toString()))];
    const allPastProjects = await SalaryProject.find({ _id: { $in: uniqueProjectIdsForLedgers } }).populate('developers');
    const pastProjectsMap = {};
    allPastProjects.forEach(p => pastProjectsMap[p._id.toString()] = p);

    const calculateProjectAdjustmentsOptimized = async (wId) => {
      const workerLedgers = allPastLedgers.filter(l => l.employeeId.toString() === wId.toString());
      if (workerLedgers.length === 0) return { totalAdjustment: 0, adjustmentDetails: [] };

      const projectMap = {};
      workerLedgers.forEach(entry => {
        const pStr = entry.projectId.toString();
        if (pastProjectsMap[pStr] && !projectMap[pStr]) {
          const project = pastProjectsMap[pStr];
          const devCount = project.developers.length || 1;
          const share = project.projectProfit / devCount;
          const start = new Date(project.startDate);
          const end = new Date(project.endDate);
          let workingDays = 0;
          const cur = new Date(start);
          while (cur <= end) {
            if (cur.getDay() !== 0) workingDays++;
            cur.setDate(cur.getDate() + 1);
          }
          projectMap[pStr] = {
             projectName: project.projectName,
             currentTotalWorkingDays: workingDays,
             currentPerDayValue: workingDays > 0 ? share / workingDays : 0
          };
        }
      });

      let totalAdjustment = 0;
      const adjustmentDetails = [];
      const ledgerUpdates = [];

      for (const entry of workerLedgers) {
        const project = projectMap[entry.projectId.toString()];
        if (!project) continue;
        const currentEntitlement = entry.paidWorkingDays * project.currentPerDayValue;
        const adjustment = currentEntitlement - entry.paidAmount;

        // Queue updates
        ledgerUpdates.push(ProjectPaymentLedger.updateOne(
          { _id: entry._id },
          {
            currentPerDayValue: project.currentPerDayValue,
            currentEntitlement,
            adjustmentAmount: adjustment,
            updatedAt: new Date()
          }
        ));

        totalAdjustment += adjustment;
        adjustmentDetails.push({
          projectId: entry.projectId,
          projectName: project.projectName,
          month: entry.month,
          year: entry.year,
          paidAmount: entry.paidAmount,
          paidPerDayValue: entry.paidPerDayValue,
          paidWorkingDays: entry.paidWorkingDays,
          currentPerDayValue: project.currentPerDayValue,
          currentEntitlement,
          adjustment,
          originalTotalDays: entry.projectTotalWorkingDaysAtPayment,
          currentTotalDays: project.currentTotalWorkingDays
        });
      }
      if (ledgerUpdates.length > 0) {
        await Promise.all(ledgerUpdates);
      }
      return { totalAdjustment, adjustmentDetails };
    };

    const adjustedResults = await Promise.all(results.map(async (result) => {
      try {
        if (isPastMonth) {
          // It's acceptable to use the existing helper since it only acts for past months once
          await autoRecordProjectPaymentsHelper(result.workerId, result.subdomain || subdomain, bulkMonth, bulkYear);
        }
        const { totalAdjustment, adjustmentDetails } = await calculateProjectAdjustmentsOptimized(result.workerId);
        const finalSalaryWithAdjustment = Math.max(0, result.totalFinalSalary + totalAdjustment);

        // Enterprise Payroll Module: Attach Payroll Record
        const payrollRecord = allPayrollRecords.find(pr => pr.workerId.toString() === result.workerId);
        
        let totalAdditions = 0;
        let totalDeductions = 0;
        
        if (payrollRecord && payrollRecord.adjustments) {
          payrollRecord.adjustments.forEach(adj => {
            if (!adj.isDeleted) {
              if (adj.type === 'addition') totalAdditions += adj.amount;
              if (adj.type === 'deduction') totalDeductions += adj.amount;
            }
          });
        }
        
        const attendanceSalary = payrollRecord && ['Locked', 'Paid'].includes(payrollRecord.status) && payrollRecord.attendanceSalarySnapshot !== null 
          ? payrollRecord.attendanceSalarySnapshot 
          : finalSalaryWithAdjustment;
          
        const payableSalary = Math.max(0, attendanceSalary + totalAdditions - totalDeductions);

        const finalSalaryCalculated = Math.max(0, finalSalaryWithAdjustment - (result.taskPenalty || 0));

        return {
          ...result,
          projectAdjustment: totalAdjustment,
          totalFinalSalary: finalSalaryWithAdjustment, // Treat as original base/Attendance Salary
          payrollRecord: payrollRecord || null,
          payableSalary: payableSalary,
          attendanceSalary: attendanceSalary,
          totalAdditions,
          totalDeductions,
          finalSalary: finalSalaryCalculated,
          fullReport: {
            ...result.fullReport,
            projectAdjustment: totalAdjustment,
            projectAdjustmentDetails: adjustmentDetails,
            finalSalaryWithFines: finalSalaryWithAdjustment
          }
        };
      } catch (err) {
        // If adjustment calculation fails, return original result
        const finalSalaryCalculated = Math.max(0, result.totalFinalSalary - (result.taskPenalty || 0));
        return {
          ...result,
          projectAdjustment: 0,
          finalSalary: finalSalaryCalculated,
          fullReport: {
            ...result.fullReport,
            projectAdjustment: 0,
            projectAdjustmentDetails: [],
            finalSalaryWithFines: result.totalFinalSalary
          }
        };
      }
    }));

    // Save totalNetPayout and topTeams to DashboardSalaryStat only when page is not present or isExport is true
    if (isExport || !req.query.page) {
      const teamEarnings = {};
      const activeWorkerIds = new Set(workers.map(w => w._id.toString()));
      
      let totalNetPayout = 0;
      adjustedResults.forEach(r => {
        if (activeWorkerIds.has(r.workerId)) {
          totalNetPayout += (Number(r.grossFinalSalary || r.totalFinalSalary) || 0);
          
          if (r.department && r.department !== 'N/A') {
            teamEarnings[r.department] = (teamEarnings[r.department] || 0) + (Number(r.totalFinalSalary) || 0);
          }
        }
      });
      
      const sortedTeams = Object.entries(teamEarnings)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);
        
      await DashboardSalaryStat.findOneAndUpdate(
        { subdomain },
        { totalNetPayout, topTeams: sortedTeams, lastCalculated: new Date() },
        { upsert: true, new: true }
      );
    }

    if (needsInMemorySort) {
      if (sortBy === 'final-asc') {
        adjustedResults.sort((a, b) => a.finalSalary - b.finalSalary);
      } else if (sortBy === 'final-desc') {
        adjustedResults.sort((a, b) => b.finalSalary - a.finalSalary);
      } else if (sortBy === 'fine-desc') {
        adjustedResults.sort((a, b) => {
          const fineA = a.fullReport?.totalFinesAmount || 0;
          const fineB = b.fullReport?.totalFinesAmount || 0;
          return fineB - fineA;
        });
      }

      if (!isExport && req.query.page) {
        const startIndex = (page - 1) * limit;
        const paginatedResults = adjustedResults.slice(startIndex, startIndex + limit);
        return res.status(200).json({
          reports: paginatedResults,
          pagination: {
            page,
            limit,
            total: totalWorkersCount,
            hasMore: page * limit < totalWorkersCount
          }
        });
      }
    }

    if (!isExport && req.query.page) {
      return res.status(200).json({
        reports: adjustedResults,
        pagination: {
          page,
          limit,
          total: totalWorkersCount,
          hasMore: page * limit < totalWorkersCount
        }
      });
    }

    res.status(200).json({ reports: adjustedResults });
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
    // 1. Check cache first for instant retrieval
    const cachedStat = await DashboardSalaryStat.findOne({ subdomain });
    if (cachedStat && cachedStat.topTeams && cachedStat.topTeams.length > 0) {
      return res.status(200).json({ topTeams: cachedStat.topTeams });
    }

    // 2. Cache miss: Compute dates for the completed previous month to freeze calculations
    const reqStartDate = new Date(fromDate);
    const prevMonthDate = new Date(reqStartDate.getFullYear(), reqStartDate.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonthNum = prevMonthDate.getMonth() + 1;
    const calcFromDate = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-01`;
    const calcToDate = new Date(prevYear, prevMonthNum, 0).toLocaleDateString('en-CA');

    const workers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } }).populate('department').select('+fines');
    const holidays = await Holiday.find({});
    const settings = await Settings.findOne({ subdomain });
    const batches = settings ? settings.batches : [];
    const fromDateObj = new Date(calcFromDate);
    const toDateObj = new Date(calcToDate);

    const allAttendanceData = await Attendance.find({
      subdomain,
      date: { $gte: calcFromDate, $lte: calcToDate }
    });
    const allLeaveData = await Leave.find({
      subdomain
    });
    const allSalaryProjects = await SalaryProject.find({
      subdomain,
      $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
    }).populate('developers', 'name');
    const allTickets = await Ticket.find({ subdomain, isDeleted: { $ne: true } });

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
        return {
          projectId: pObj._id,
          projectName: pObj.projectName,
          perDayValue: share / (pObj.totalWorkingDays || 1)
        };
      });

      // Calculate productivity (filtering only approved/paid leaves for standard logic)
      const report = calculateWorkerProductivity({
        worker,
        attendanceData: workerAttendance,
        fromDate: calcFromDate,
        toDate: calcToDate,
        leaveData: workerLeaves.filter(l => l.status === 'Approved' || l.leaveType === 'Paid Leave'),
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

      const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
      const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
      const { totalUnauthorizedPenalty } = (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
        ? calculateUnauthorizedAbsencePenalty(
            worker,
            calcFromDate,
            calcToDate,
            workerLeaves,
            workerAttendance,
            holidays,
            settings
          )
        : { totalUnauthorizedPenalty: 0 };

      const workerTickets = allTickets.filter(task => {
        return task.assignee?.toString() === workerId ||
          (Array.isArray(task.assignees) && task.assignees.some(a => a.toString() === workerId));
      });

      const { totalTaskPenalty: taskPenalty } = calculateTaskPenalties({
        worker,
        tickets: workerTickets,
        report,
        fromDate: calcFromDate,
        toDate: calcToDate
      });

      const totalFinalSalary = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);
      const deptName = worker.department?.name || 'N/A';
      if (deptName !== 'N/A') {
        teamEarnings[deptName] = (teamEarnings[deptName] || 0) + totalFinalSalary;
      }
    });

    const sortedTeams = Object.entries(teamEarnings)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    // Save to cache for subsequent 1ms loads
    await DashboardSalaryStat.findOneAndUpdate(
      { subdomain },
      {
        topTeams: sortedTeams,
        lastCalculated: new Date()
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ topTeams: sortedTeams });
  } catch (error) {
    console.error('Top teams earnings error:', error);
    res.status(500).json({ message: 'Failed to calculate top teams earnings' });
  }
});

// ─── Record/Freeze Project Payment for a month ────────────────────────────────
// Called by admin to freeze the current month's project salary into the ledger.
// Once frozen, any future project extension will create an adjustment.
const recordProjectPayment = asyncHandler(async (req, res) => {
  const { employeeId, projectId, subdomain, month, year } = req.body;

  if (!employeeId || !projectId || !subdomain || !month || !year) {
    return res.status(400).json({ message: 'employeeId, projectId, subdomain, month, and year are required' });
  }

  // Check if already recorded
  const existing = await ProjectPaymentLedger.findOne({ employeeId, projectId, month, year });
  if (existing && existing.isSettled) {
    return res.status(400).json({ message: 'Payment for this project/month is already recorded', ledger: existing });
  }

  // Get current project data
  const project = await SalaryProject.findById(projectId).populate('developers', 'name');
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  // Calculate current per-day value
  const pObj = project.toObject();
  const devCount = pObj.developers.length || 1;
  const share = pObj.projectProfit / devCount;
  const startD = new Date(pObj.startDate);
  const endD = new Date(pObj.endDate);
  let totalWorkingDays = 0;
  const cur = new Date(startD);
  while (cur <= endD) {
    if (cur.getDay() !== 0) totalWorkingDays++;
    cur.setDate(cur.getDate() + 1);
  }
  const perDayValue = totalWorkingDays > 0 ? share / totalWorkingDays : 0;

  // Calculate working days for this employee in this project for the given month
  const monthStart = new Date(year, month - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0);
  monthEnd.setHours(23, 59, 59, 999);
  const projectStart = new Date(pObj.startDate);
  projectStart.setHours(0, 0, 0, 0);
  const projectEnd = new Date(pObj.endDate);
  projectEnd.setHours(23, 59, 59, 999);

  // Overlap between project range and month range
  const overlapStart = new Date(Math.max(monthStart.getTime(), projectStart.getTime()));
  const overlapEnd = new Date(Math.min(monthEnd.getTime(), projectEnd.getTime()));

  let paidWorkingDays = 0;
  if (overlapStart <= overlapEnd) {
    const d = new Date(overlapStart);
    d.setHours(0, 0, 0, 0);
    while (d <= overlapEnd) {
      if (d.getDay() !== 0) paidWorkingDays++;
      d.setDate(d.getDate() + 1);
    }
  }

  const paidAmount = paidWorkingDays * perDayValue;

  // Upsert the ledger entry
  const ledger = await ProjectPaymentLedger.findOneAndUpdate(
    { employeeId, projectId, month, year },
    {
      subdomain,
      paidAmount,
      paidPerDayValue: perDayValue,
      paidWorkingDays,
      projectTotalWorkingDaysAtPayment: totalWorkingDays,
      perDeveloperShareAtPayment: share,
      currentPerDayValue: perDayValue,
      currentEntitlement: paidAmount,
      adjustmentAmount: 0,
      isSettled: true,
      settledAt: new Date(),
      updatedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    message: 'Project payment recorded successfully',
    ledger,
    details: {
      perDayValue,
      paidWorkingDays,
      totalWorkingDays,
      perDeveloperShare: share,
      paidAmount
    }
  });
});

// ─── Bulk Record: Freeze payments for ALL projects of an employee for a month ─
const recordAllProjectPayments = asyncHandler(async (req, res) => {
  const { employeeId, subdomain, month, year } = req.body;

  if (!employeeId || !subdomain || !month || !year) {
    return res.status(400).json({ message: 'employeeId, subdomain, month, and year are required' });
  }

  const monthStart = new Date(year, month - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Find all projects this employee is assigned to that overlap with this month
  const salaryProjects = await SalaryProject.find({
    subdomain,
    developers: employeeId,
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart }
  }).populate('developers', 'name');

  if (salaryProjects.length === 0) {
    return res.status(200).json({ message: 'No projects found for this employee in the given month', ledgers: [] });
  }

  const ledgers = [];
  for (const project of salaryProjects) {
    const pObj = project.toObject();
    const devCount = pObj.developers.length || 1;
    const share = pObj.projectProfit / devCount;
    const startD = new Date(pObj.startDate);
    const endD = new Date(pObj.endDate);
    let totalWorkingDays = 0;
    const cur = new Date(startD);
    while (cur <= endD) {
      if (cur.getDay() !== 0) totalWorkingDays++;
      cur.setDate(cur.getDate() + 1);
    }
    const perDayValue = totalWorkingDays > 0 ? share / totalWorkingDays : 0;

    const projectStart = new Date(pObj.startDate);
    projectStart.setHours(0, 0, 0, 0);
    const projectEnd = new Date(pObj.endDate);
    projectEnd.setHours(23, 59, 59, 999);
    const overlapStart = new Date(Math.max(monthStart.getTime(), projectStart.getTime()));
    const overlapEnd = new Date(Math.min(monthEnd.getTime(), projectEnd.getTime()));

    let paidWorkingDays = 0;
    if (overlapStart <= overlapEnd) {
      const d = new Date(overlapStart);
      d.setHours(0, 0, 0, 0);
      while (d <= overlapEnd) {
        if (d.getDay() !== 0) paidWorkingDays++;
        d.setDate(d.getDate() + 1);
      }
    }

    const paidAmount = paidWorkingDays * perDayValue;

    const ledger = await ProjectPaymentLedger.findOneAndUpdate(
      { employeeId, projectId: project._id, month, year },
      {
        subdomain,
        paidAmount,
        paidPerDayValue: perDayValue,
        paidWorkingDays,
        projectTotalWorkingDaysAtPayment: totalWorkingDays,
        perDeveloperShareAtPayment: share,
        currentPerDayValue: perDayValue,
        currentEntitlement: paidAmount,
        adjustmentAmount: 0,
        isSettled: true,
        settledAt: new Date(),
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    ledgers.push(ledger);
  }

  res.status(200).json({
    message: `${ledgers.length} project payment(s) recorded successfully`,
    ledgers
  });
});

// ─── Get Project Adjustment Ledger History ─────────────────────────────────────
const getProjectAdjustmentLedger = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  const { subdomain } = req.query;

  if (!workerId) {
    return res.status(400).json({ message: 'workerId is required' });
  }

  const ledgerEntries = await ProjectPaymentLedger.find({
    employeeId: workerId,
    ...(subdomain ? { subdomain } : {})
  })
    .populate('projectId', 'projectName startDate endDate projectAmount projectProfit')
    .sort({ year: -1, month: -1 });

  // Also recalculate adjustments against current project data
  const now = new Date();
  const { totalAdjustment, adjustmentDetails } = await calculateProjectAdjustments(
    workerId, subdomain || '', now.getMonth() + 1, now.getFullYear()
  );

  res.status(200).json({
    ledgerEntries,
    totalAdjustment,
    adjustmentDetails
  });
});

// ─── PAYROLL ADJUSTMENTS (ENTERPRISE MODULE) ───
const PayrollRecord = require('../models/PayrollRecord');

const getPayrollRecord = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { month, year, subdomain } = req.query;

    if (!workerId || !month || !year || !subdomain) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    let record = await PayrollRecord.findOne({
      workerId,
      month: parseInt(month),
      year: parseInt(year),
      subdomain
    }).populate('adjustments.addedBy', 'name email').populate('adjustments.deletedBy', 'name email').populate('history.actionBy', 'name email');

    if (!record) {
      record = new PayrollRecord({
        workerId,
        subdomain,
        month: parseInt(month),
        year: parseInt(year),
        status: 'Draft',
        adjustments: [],
        history: []
      });
      await record.save();
    }

    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error('Error fetching payroll record:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const addPayrollAdjustment = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { month, year, subdomain, type, category, amount, reason, remarks } = req.body;
    
    let record = await PayrollRecord.findOne({ workerId, month, year, subdomain });
    
    if (!record) {
      record = new PayrollRecord({
        workerId,
        subdomain,
        month,
        year,
        status: 'Draft',
        adjustments: [],
        history: []
      });
    }

    if (['Locked', 'Paid'].includes(record.status)) {
      return res.status(400).json({ success: false, message: 'Cannot modify adjustments for a Locked or Paid payroll.' });
    }

    const newAdjustment = {
      type,
      category,
      amount,
      reason,
      remarks,
      addedBy: req.user._id,
      isDeleted: false
    };

    record.adjustments.push(newAdjustment);
    const addedAdjustment = record.adjustments[record.adjustments.length - 1];

    record.history.push({
      action: 'CREATE',
      adjustmentId: addedAdjustment._id,
      newValue: { type, category, amount, reason, remarks },
      actionBy: req.user._id
    });

    await record.save();
    res.status(200).json({ success: true, record, message: 'Adjustment added successfully' });
  } catch (error) {
    console.error('Error adding adjustment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updatePayrollAdjustment = async (req, res) => {
  try {
    const { workerId, adjustmentId } = req.params;
    const { month, year, subdomain, type, category, amount, reason, remarks } = req.body;

    const record = await PayrollRecord.findOne({ workerId, month, year, subdomain });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    if (['Locked', 'Paid'].includes(record.status)) {
      return res.status(400).json({ success: false, message: 'Cannot modify adjustments for a Locked or Paid payroll.' });
    }

    const adjustment = record.adjustments.id(adjustmentId);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found' });

    const oldValue = {
      type: adjustment.type,
      category: adjustment.category,
      amount: adjustment.amount,
      reason: adjustment.reason,
      remarks: adjustment.remarks
    };

    adjustment.type = type;
    adjustment.category = category;
    adjustment.amount = amount;
    adjustment.reason = reason;
    adjustment.remarks = remarks;

    record.history.push({
      action: 'UPDATE',
      adjustmentId: adjustment._id,
      oldValue,
      newValue: { type, category, amount, reason, remarks },
      actionBy: req.user._id
    });

    await record.save();
    res.status(200).json({ success: true, record, message: 'Adjustment updated successfully' });
  } catch (error) {
    console.error('Error updating adjustment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deletePayrollAdjustment = async (req, res) => {
  try {
    const { workerId, adjustmentId } = req.params;
    const { month, year, subdomain } = req.query;

    const record = await PayrollRecord.findOne({ workerId, month: parseInt(month), year: parseInt(year), subdomain });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    if (['Locked', 'Paid'].includes(record.status)) {
      return res.status(400).json({ success: false, message: 'Cannot modify adjustments for a Locked or Paid payroll.' });
    }

    const adjustment = record.adjustments.id(adjustmentId);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found' });

    adjustment.isDeleted = true;
    adjustment.deletedBy = req.user._id;
    adjustment.deletedAt = new Date();

    const oldValue = {
      type: adjustment.type,
      category: adjustment.category,
      amount: adjustment.amount,
      reason: adjustment.reason,
      remarks: adjustment.remarks
    };

    record.history.push({
      action: 'DELETE',
      adjustmentId: adjustment._id,
      oldValue,
      actionBy: req.user._id
    });

    await record.save();
    res.status(200).json({ success: true, record, message: 'Adjustment deleted successfully' });
  } catch (error) {
    console.error('Error deleting adjustment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const restorePayrollAdjustment = async (req, res) => {
  try {
    const { workerId, adjustmentId } = req.params;
    const { month, year, subdomain } = req.body;

    const record = await PayrollRecord.findOne({ workerId, month, year, subdomain });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    if (['Locked', 'Paid'].includes(record.status)) {
      return res.status(400).json({ success: false, message: 'Cannot modify adjustments for a Locked or Paid payroll.' });
    }

    const adjustment = record.adjustments.id(adjustmentId);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found' });

    adjustment.isDeleted = false;
    adjustment.deletedBy = null;
    adjustment.deletedAt = null;

    record.history.push({
      action: 'RESTORE',
      adjustmentId: adjustment._id,
      actionBy: req.user._id
    });

    await record.save();
    res.status(200).json({ success: true, record, message: 'Adjustment restored successfully' });
  } catch (error) {
    console.error('Error restoring adjustment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updatePayrollStatus = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { month, year, subdomain, status, attendanceSalarySnapshot } = req.body;

    let record = await PayrollRecord.findOne({ workerId, month, year, subdomain });
    if (!record) {
      record = new PayrollRecord({
        workerId,
        subdomain,
        month,
        year,
        status: 'Draft',
        adjustments: [],
        history: []
      });
    }

    record.status = status;
    if (['Locked', 'Paid'].includes(status) && attendanceSalarySnapshot !== undefined) {
      record.attendanceSalarySnapshot = attendanceSalarySnapshot;
    }

    await record.save();
    res.status(200).json({ success: true, record, message: `Status updated to ${status}` });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getDashboardSalaryStats = asyncHandler(async (req, res) => {
  const { subdomain } = req.query;

  if (!subdomain) {
    return res.status(400).json({ message: 'Subdomain is required' });
  }

  try {
    const stat = await DashboardSalaryStat.findOne({ subdomain });
    
    // Check if stat exists and is less than 7 days old
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    if (stat && stat.lastCalculated > oneWeekAgo && !req.query.forceRecalculate) {
      return res.status(200).json(stat);
    }
    
    // If we reach here, we need to calculate it (heavy processing)
    // We will simulate the bulk salary logic for the current month
    const now = new Date();
    const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
    
    // For calculating the stats properly, we would ideally just call the logic in getBulkSalaryReport,
    // but since we want this as an API, we can either re-use getTopTeamsEarnings logic or just return empty for now
    // and wait for the admin to generate a bulk report.
    // However, to ensure they see SOMETHING if it's missing, let's just do a basic fallback or call the heavy logic.
    // Actually, we can just use the fast approximation for totalNetPayout based on active workers base salary!
    const workers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } }).populate('department');
    
    const teamEarnings = {};
    let totalNetPayout = 0;
    
    workers.forEach(worker => {
      const deptName = worker.department?.name || 'N/A';
      const salary = Number(worker.finalSalary || worker.salary) || 0;
      totalNetPayout += salary;
      if (deptName !== 'N/A') {
        teamEarnings[deptName] = (teamEarnings[deptName] || 0) + salary;
      }
    });
    
    const sortedTeams = Object.entries(teamEarnings)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
      
    const newStat = await DashboardSalaryStat.findOneAndUpdate(
      { subdomain },
      { totalNetPayout, topTeams: sortedTeams, lastCalculated: new Date() },
      { upsert: true, new: true }
    );
    
    return res.status(200).json(newStat);
  } catch (error) {
    console.error('Dashboard salary stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard salary stats' });
  }
});

// ─── Wallet Controllers ───
const getWalletBalances = asyncHandler(async (req, res) => {
  const { subdomain } = req.query;
  if (!subdomain) return res.status(400).json({ message: 'Subdomain is required' });

  const workers = await Worker.find({ subdomain, status: { $ne: 'Deleted' } })
    .select('name rfid department walletBalance status')
    .populate('department', 'name');

  res.status(200).json({ wallets: workers });
});

const getWalletHistory = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  const { subdomain } = req.query;
  if (!subdomain || !workerId) return res.status(400).json({ message: 'Subdomain and workerId required' });

  const worker = await Worker.findById(workerId).select('walletBalance');

  const history = await WalletTransaction.find({ workerId, subdomain })
    .sort({ createdAt: -1 })
    .populate('actionBy', 'name email');

  res.status(200).json({ history, balance: worker?.walletBalance || 0 });
});

const debitWallet = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  const { amount, debitType, description, month, year, subdomain } = req.body;
  
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount is required' });
  if (!debitType || !['Direct', 'Salary'].includes(debitType)) return res.status(400).json({ message: 'Valid debitType required' });

  const worker = await Worker.findById(workerId);
  if (!worker || worker.subdomain !== subdomain) return res.status(404).json({ message: 'Worker not found' });
  
  if ((worker.walletBalance || 0) < amount) {
    return res.status(400).json({ message: 'Insufficient wallet balance' });
  }

  worker.walletBalance -= amount;
  await worker.save();

  const txn = await WalletTransaction.create({
    workerId,
    type: 'Debit',
    amount,
    balanceAfter: worker.walletBalance,
    description: `${debitType} Debit: ${description || ''}`,
    subdomain,
    actionBy: req.user ? req.user._id : null
  });

  // If Salary Debit, we auto-create a Payroll Adjustment for the given month/year
  if (debitType === 'Salary') {
    if (!month || !year) {
       // rollback?
       return res.status(400).json({ message: 'Month and year are required for Salary Debit' });
    }
    let record = await PayrollRecord.findOne({ workerId, month, year, subdomain });
    if (!record) {
      record = new PayrollRecord({ workerId, month, year, subdomain, adjustments: [], history: [] });
    }
    
    const adjustment = {
      type: 'addition',
      category: 'Other',
      amount: Number(amount),
      reason: `Wallet Withdrawal: ${description || ''}`,
      date: new Date(),
      addedBy: req.user ? req.user._id : null
    };
    record.adjustments.push(adjustment);
    record.history.push({
      action: 'Added Adjustment (Wallet Debit)',
      newValue: adjustment,
      actionBy: req.user ? req.user._id : null
    });
    
    await record.save();
  }

  res.status(200).json({ message: 'Wallet debited successfully', balance: worker.walletBalance, transaction: txn });
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
  createSalaryProject,
  getSalaryProjects,
  getSalaryProjectsForWorker,
  updateSalaryProject,
  deleteSalaryProject,
  recordProjectPayment,
  recordAllProjectPayments,
  getProjectAdjustmentLedger,
  getPayrollRecord,
  addPayrollAdjustment,
  updatePayrollAdjustment,
  deletePayrollAdjustment,
  restorePayrollAdjustment,
  updatePayrollStatus,
  getDashboardSalaryStats,
  getWalletBalances,
  getWalletHistory,
  debitWallet
};
