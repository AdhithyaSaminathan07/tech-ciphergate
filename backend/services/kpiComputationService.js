/**
 * System 3: KPI Computation Engine Service
 * Tech Ciphergate - Authoritative Performance Calculation Engine
 * 
 * Guarantees:
 * 1. Execution time accuracy: Inspects `statusHistory` for first transition to `In Progress`.
 *    Marks execution duration unavailable if reliable timestamps are missing; never assumes planned `startDate`.
 * 2. Clear percentage conventions: OTCR and FTAR are strictly 0–100% before applying 0–50 System 2 scoring.
 * 3. Safe, side-effect free, deterministic computation: Read-only calculation; reports data coverage.
 * 4. Idempotency: Duplicate calls or ticket retries produce identical scores without mutating state.
 * 5. Backwards-compatible integration with System 2 assignment engine constraints.
 */

const Ticket = require('../models/ticketModel');
const Worker = require('../models/Worker');
const Department = require('../models/Department');

/**
 * Extracts unique assignee IDs from a ticket, supporting single `assignee` and `assignees` array.
 */
const getTicketAssigneeIds = (ticket) => {
  if (!ticket) return [];
  const ids = new Set();
  if (ticket.assignee) {
    const id = ticket.assignee._id ? String(ticket.assignee._id) : String(ticket.assignee);
    if (id && id !== 'undefined' && id !== 'null') ids.add(id);
  }
  if (Array.isArray(ticket.assignees)) {
    ticket.assignees.forEach(a => {
      if (a) {
        const id = a._id ? String(a._id) : String(a);
        if (id && id !== 'undefined' && id !== 'null') ids.add(id);
      }
    });
  }
  return Array.from(ids);
};

/**
 * Requirement 1: Resolves actual execution start timestamp from statusHistory.
 * Finds the first transition to 'In Progress' with a valid timestamp.
 * Returns null if no reliable transition to 'In Progress' exists.
 */
const getActualExecutionStart = (ticket) => {
  if (!ticket) return null;
  if (Array.isArray(ticket.statusHistory) && ticket.statusHistory.length > 0) {
    for (let i = 0; i < ticket.statusHistory.length; i++) {
      const entry = ticket.statusHistory[i];
      if (entry && entry.status === 'In Progress' && entry.changedAt) {
        const d = new Date(entry.changedAt);
        if (!isNaN(d.getTime())) {
          return d;
        }
      }
    }
  }
  return null;
};

/**
 * Resolves actual completion timestamp.
 * Prioritizes the last approved review cycle submission time (isolating developer execution from admin review lag).
 * Falls back to ticket.actualCompletionDate, latest valid 'Done' statusHistory entry, or ticket.updatedAt.
 */
const getActualExecutionCompletion = (ticket) => {
  if (!ticket) return null;

  // 1. Check review cycles for the approved submission time
  if (Array.isArray(ticket.reviewCycles) && ticket.reviewCycles.length > 0) {
    for (let i = ticket.reviewCycles.length - 1; i >= 0; i--) {
      const cycle = ticket.reviewCycles[i];
      if (cycle && cycle.decision === 'Approved' && cycle.submissionTime) {
        const d = new Date(cycle.submissionTime);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  // 2. Pre-calculated actualCompletionDate on ticket
  if (ticket.actualCompletionDate) {
    const d = new Date(ticket.actualCompletionDate);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Latest valid Done entry in statusHistory
  if (Array.isArray(ticket.statusHistory) && ticket.statusHistory.length > 0) {
    for (let i = ticket.statusHistory.length - 1; i >= 0; i--) {
      const entry = ticket.statusHistory[i];
      if (entry && entry.status === 'Done' && entry.changedAt) {
        const d = new Date(entry.changedAt);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  // 4. Fallback for Done tickets without statusHistory
  if (ticket.status === 'Done' && ticket.updatedAt) {
    const d = new Date(ticket.updatedAt);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
};

/**
 * Requirement 1: Computes actual execution duration.
 * Returns { isAvailable: false } when reliable In Progress start or completion timestamp is missing.
 */
const calculateExecutionDuration = (ticket) => {
  const start = getActualExecutionStart(ticket);
  const end = getActualExecutionCompletion(ticket);

  if (!start || !end) {
    return {
      isAvailable: false,
      durationHours: null,
      durationDays: null,
      startedAt: start,
      completedAt: end,
      reason: !start ? 'No In Progress transition found in status history' : 'No completion timestamp found'
    };
  }

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const durationHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
  const durationDays = Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;

  return {
    isAvailable: true,
    durationHours,
    durationDays,
    startedAt: start,
    completedAt: end,
    reason: null
  };
};

/**
 * Evaluates ticket completion against agreed deadline (endDate).
 */
const evaluateDeadlinePerformance = (ticket) => {
  if (!ticket || !ticket.endDate) {
    return {
      hasDeadline: false,
      performanceStatus: 'no_dates',
      isOnTime: false,
      isDelayed: false,
      varianceDays: null
    };
  }

  const deadline = new Date(ticket.endDate);
  if (isNaN(deadline.getTime())) {
    return {
      hasDeadline: false,
      performanceStatus: 'no_dates',
      isOnTime: false,
      isDelayed: false,
      varianceDays: null
    };
  }

  // Set deadline to end of that calendar day for full day allowance
  const deadlineEnd = new Date(deadline);
  deadlineEnd.setHours(23, 59, 59, 999);

  const completion = getActualExecutionCompletion(ticket);
  if (!completion) {
    // Ticket is active (not completed)
    const now = new Date();
    const isOverdue = now > deadlineEnd;
    return {
      hasDeadline: true,
      performanceStatus: isOverdue ? 'overdue_active' : 'pending',
      isOnTime: !isOverdue,
      isDelayed: isOverdue,
      varianceDays: isOverdue ? Math.round((now - deadlineEnd) / (1000 * 60 * 60 * 24)) : 0
    };
  }

  const isOnTime = completion <= deadlineEnd;
  const varianceDays = Math.round((completion.getTime() - deadlineEnd.getTime()) / (1000 * 60 * 60 * 24));

  return {
    hasDeadline: true,
    performanceStatus: isOnTime ? 'on_time' : 'delayed',
    isOnTime,
    isDelayed: !isOnTime,
    varianceDays
  };
};

/**
 * Requirement 3: Calculates On-Time Completion Rate (OTCR) strictly as 0–100%.
 * Returns null if no tickets have deadlines (preventing unfair penalty).
 */
const calculateOtcr = (completedTickets) => {
  const ticketsWithDeadline = (completedTickets || []).filter(t => {
    const evalResult = evaluateDeadlinePerformance(t);
    return evalResult.hasDeadline;
  });

  if (ticketsWithDeadline.length === 0) {
    return {
      otcr: null,
      totalWithDeadline: 0,
      onTimeCount: 0,
      delayedCount: 0,
      coveragePercentage: 0
    };
  }

  let onTimeCount = 0;
  let delayedCount = 0;

  ticketsWithDeadline.forEach(t => {
    const evalResult = evaluateDeadlinePerformance(t);
    if (evalResult.isOnTime) onTimeCount++;
    else if (evalResult.isDelayed) delayedCount++;
  });

  const otcr = Math.round((onTimeCount / ticketsWithDeadline.length) * 100);
  const totalCompleted = completedTickets.length;
  const coveragePercentage = totalCompleted > 0 ? Math.round((ticketsWithDeadline.length / totalCompleted) * 100) : 0;

  return {
    otcr: Math.max(0, Math.min(100, otcr)),
    totalWithDeadline: ticketsWithDeadline.length,
    onTimeCount,
    delayedCount,
    coveragePercentage
  };
};

/**
 * Requirement 3: Calculates First-Time Approval Rate (FTAR) strictly as 0–100%.
 * Rejection indicator based on reviewCycles.
 * Returns null if no tickets have review cycle data.
 */
const calculateFtar = (completedTickets) => {
  const reviewedTickets = (completedTickets || []).filter(t => Array.isArray(t.reviewCycles) && t.reviewCycles.length > 0);

  if (reviewedTickets.length === 0) {
    return {
      ftar: null,
      totalReviewed: 0,
      firstTimeApprovedCount: 0,
      reworkCount: 0,
      totalRejections: 0,
      coveragePercentage: 0
    };
  }

  let firstTimeApprovedCount = 0;
  let reworkCount = 0;
  let totalRejections = 0;

  reviewedTickets.forEach(t => {
    const rejections = t.reviewCycles.filter(c => c && c.decision === 'Rejected').length;
    totalRejections += rejections;

    if (rejections === 0 && t.reviewCycles.some(c => c && c.decision === 'Approved')) {
      firstTimeApprovedCount++;
    } else if (rejections > 0) {
      reworkCount++;
    }
  });

  const ftar = Math.round((firstTimeApprovedCount / reviewedTickets.length) * 100);
  const totalCompleted = completedTickets.length;
  const coveragePercentage = totalCompleted > 0 ? Math.round((reviewedTickets.length / totalCompleted) * 100) : 0;

  return {
    ftar: Math.max(0, Math.min(100, ftar)),
    totalReviewed: reviewedTickets.length,
    firstTimeApprovedCount,
    reworkCount,
    totalRejections,
    coveragePercentage
  };
};

/**
 * Requirement 3 & 6: Unified 0–50 System 2 Assignment KPI Formula.
 *
 * Components (Max 50):
 * - Performance Points Tier: Up to 30 pts (Math.min(30, Math.floor(points / 10)))
 * - On-Time Completion Rate: Up to 15 pts (Math.round((otcr / 100) * 15))
 * - Quality / FTAR: Up to 5 pts (Math.round((ftar / 100) * 5))
 *
 * Missing data handling:
 * - When OTCR is null (no deadlines), applies neutral baseline (pointsScore * 0.5 capped at 15).
 * - When FTAR is null (no review cycles), applies neutral baseline (pointsScore * 0.16 capped at 5).
 * - Employees are never penalized with 0 for missing project dates or review history.
 */
const calculateAssignmentKpiScore = ({ performancePoints = 0, otcr = null, ftar = null }) => {
  const validPoints = Math.max(0, Number(performancePoints) || 0);

  // 1. Performance Points component (0–30 pts)
  const pointsScore = Math.min(30, Math.floor(validPoints / 10));

  // 2. OTCR component (0–15 pts)
  let otcrScore = 0;
  if (otcr !== null && !isNaN(otcr)) {
    const boundedOtcr = Math.max(0, Math.min(100, Number(otcr)));
    otcrScore = Math.round((boundedOtcr / 100) * 15);
  } else {
    // Neutral fallback based on demonstrated output
    otcrScore = Math.min(15, Math.round(pointsScore * 0.5));
  }

  // 3. FTAR component (0–5 pts)
  let ftarScore = 0;
  if (ftar !== null && !isNaN(ftar)) {
    const boundedFtar = Math.max(0, Math.min(100, Number(ftar)));
    ftarScore = Math.round((boundedFtar / 100) * 5);
  } else {
    // Neutral fallback
    ftarScore = Math.min(5, Math.round(pointsScore * 0.16));
  }

  const totalScore = Math.min(50, Math.max(0, pointsScore + otcrScore + ftarScore));

  return {
    totalScore,
    breakdown: {
      pointsScore,
      otcrScore,
      ftarScore
    }
  };
};

/**
 * Requirement 4: Computes complete, deterministic KPI profile for a single worker.
 */
const computeWorkerKpi = async (workerParam, subdomain, options = {}) => {
  const tenant = (subdomain || '').trim().toLowerCase();
  let worker = workerParam;
  if (!worker || typeof worker !== 'object' || !worker.name) {
    const queryId = (workerParam && workerParam._id && workerParam.name) ? workerParam._id : workerParam;
    worker = await Worker.findOne({ _id: queryId, subdomain: tenant }).lean();
  }
  if (!worker) {
    throw new Error(`Worker '${workerParam}' not found in organization '${tenant}'`);
  }

  // Fetch all active/completed tickets attributed to worker in this tenant
  const tickets = await Ticket.find({
    subdomain: tenant,
    isDeleted: { $ne: true },
    $or: [
      { assignee: worker._id },
      { assignees: worker._id }
    ]
  }).lean();

  // Filter completed tickets by date range if provided
  let completedTickets = tickets.filter(t => t.status === 'Done');
  if (options.startDate || options.endDate) {
    const start = options.startDate ? new Date(options.startDate) : new Date(0);
    const end = options.endDate ? new Date(options.endDate) : new Date('2099-12-31');
    if (!isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (!isNaN(end.getTime())) end.setHours(23, 59, 59, 999);

    completedTickets = completedTickets.filter(t => {
      const resDate = getActualExecutionCompletion(t) || (t.updatedAt ? new Date(t.updatedAt) : null);
      return resDate && resDate >= start && resDate <= end;
    });
  }

  const activeTickets = tickets.filter(t => ['To Do', 'In Progress', 'Review'].includes(t.status));

  // 1. Durations (only where execution start is available)
  let totalExecHours = 0;
  let availableExecCount = 0;
  completedTickets.forEach(t => {
    const exec = calculateExecutionDuration(t);
    if (exec.isAvailable) {
      totalExecHours += exec.durationHours;
      availableExecCount++;
    }
  });
  const avgExecutionHours = availableExecCount > 0 ? Math.round((totalExecHours / availableExecCount) * 10) / 10 : null;
  const avgExecutionDays = avgExecutionHours !== null ? Math.round((avgExecutionHours / 24) * 10) / 10 : null;

  // 2. OTCR & Delayed Completed Rate
  const otcrResult = calculateOtcr(completedTickets);
  const delayedCompletedRate = otcrResult.totalWithDeadline > 0
    ? Math.round((otcrResult.delayedCount / otcrResult.totalWithDeadline) * 100)
    : null;

  // 3. FTAR (Quality)
  const ftarResult = calculateFtar(completedTickets);

  // 4. System 2 Assignment KPI Score
  const assignmentKpi = calculateAssignmentKpiScore({
    performancePoints: worker.performancePoints || 0,
    otcr: otcrResult.otcr,
    ftar: ftarResult.ftar
  });

  // 5. Workload, Capacity & Active Overdue
  const activeTasks = activeTickets.length;
  const maxCapacity = 5;
  const availableCapacity = Math.max(0, maxCapacity - activeTasks);
  const capacityUtilizationPct = Math.round((activeTasks / maxCapacity) * 100);

  const now = new Date();
  const activeWithDeadline = activeTickets.filter(t => t.endDate && !isNaN(new Date(t.endDate).getTime()));
  const activeOverdueTickets = activeWithDeadline.filter(t => {
    const deadlineEnd = new Date(t.endDate);
    deadlineEnd.setHours(23, 59, 59, 999);
    return now > deadlineEnd;
  });
  const activeOverdueRate = activeWithDeadline.length > 0
    ? Math.round((activeOverdueTickets.length / activeWithDeadline.length) * 100)
    : null;

  // 6. Data Coverage Summary
  const dataCoverage = {
    totalTickets: tickets.length,
    completedTickets: completedTickets.length,
    activeTickets: activeTasks,
    activeWithDeadlineCount: activeWithDeadline.length,
    activeOverdueCount: activeOverdueTickets.length,
    deadlineTrackingPercentage: otcrResult.coveragePercentage,
    executionTimeTrackingPercentage: completedTickets.length > 0 ? Math.round((availableExecCount / completedTickets.length) * 100) : 0,
    reviewTrackingPercentage: ftarResult.coveragePercentage
  };

  const explanation = `KPI Score ${assignmentKpi.totalScore}/50 (Points tier: ${assignmentKpi.breakdown.pointsScore}/30, OTCR: ${otcrResult.otcr !== null ? `${otcrResult.otcr}% (${assignmentKpi.breakdown.otcrScore}/15)` : 'N/A (neutral baseline)'}, Quality FTAR: ${ftarResult.ftar !== null ? `${ftarResult.ftar}% (${assignmentKpi.breakdown.ftarScore}/5)` : 'N/A (neutral baseline)'}). Active load: ${activeTasks}/${maxCapacity}.`;

  return {
    worker: {
      _id: worker._id,
      name: worker.name,
      username: worker.username,
      department: worker.department,
      status: worker.status,
      performancePoints: worker.performancePoints || 0,
      currentStreak: worker.currentStreak || 0,
      longestStreak: worker.longestStreak || 0,
      performanceLevel: worker.performanceLevel || 'Beginner'
    },
    metrics: {
      onTimeCompletionRate: otcrResult.otcr,
      delayedCompletedRate,
      activeOverdueRate,
      firstTimeApprovalRate: ftarResult.ftar,
      avgExecutionHours,
      avgExecutionDays,
      completedTicketsCount: completedTickets.length,
      activeTasksCount: activeTasks,
      activeOverdueCount: activeOverdueTickets.length,
      availableCapacity,
      capacityUtilizationPct,
      delayedTicketsCount: otcrResult.delayedCount,
      reworkTicketsCount: ftarResult.reworkCount,
      totalReviewRejections: ftarResult.totalRejections
    },
    system2Assignment: {
      kpiScore: assignmentKpi.totalScore,
      breakdown: assignmentKpi.breakdown,
      explanation
    },
    dataCoverage
  };
};

/**
 * Requirement 4: Computes department-level aggregated KPI metrics.
 */
const computeDepartmentKpi = async (departmentName, subdomain, options = {}) => {
  const tenant = (subdomain || '').trim().toLowerCase();
  const dept = await Department.findOne({
    subdomain: tenant,
    name: new RegExp(`^${departmentName.trim()}$`, 'i')
  }).lean();

  const workers = await Worker.find({
    subdomain: tenant,
    status: 'Active',
    ...(dept ? { department: dept._id } : {})
  }).lean();

  const workerKpis = [];
  for (const w of workers) {
    const kpi = await computeWorkerKpi(w, tenant, options);
    workerKpis.push(kpi);
  }

  const memberCount = workers.length;
  const totalActiveTasks = workerKpis.reduce((acc, k) => acc + k.metrics.activeTasksCount, 0);
  const totalCompletedTasks = workerKpis.reduce((acc, k) => acc + k.metrics.completedTicketsCount, 0);

  // Weighted department OTCR
  const membersWithOtcr = workerKpis.filter(k => k.metrics.onTimeCompletionRate !== null);
  const deptOtcr = membersWithOtcr.length > 0
    ? Math.round(membersWithOtcr.reduce((acc, k) => acc + k.metrics.onTimeCompletionRate, 0) / membersWithOtcr.length)
    : null;

  // Weighted department FTAR
  const membersWithFtar = workerKpis.filter(k => k.metrics.firstTimeApprovalRate !== null);
  const deptFtar = membersWithFtar.length > 0
    ? Math.round(membersWithFtar.reduce((acc, k) => acc + k.metrics.firstTimeApprovalRate, 0) / membersWithFtar.length)
    : null;

  // Active overdue count across team
  const totalActiveOverdue = workerKpis.reduce((acc, k) => acc + (k.metrics.activeOverdueCount || 0), 0);
  const activeWithDeadline = workerKpis.reduce((acc, k) => acc + (k.dataCoverage.activeWithDeadlineCount || 0), 0);
  const teamActiveOverdueRate = activeWithDeadline > 0
    ? Math.round((totalActiveOverdue / activeWithDeadline) * 100)
    : null;

  const totalCapacity = memberCount * 5;
  const availableCapacity = Math.max(0, totalCapacity - totalActiveTasks);
  const teamUtilizationPct = totalCapacity > 0 ? Math.round((totalActiveTasks / totalCapacity) * 100) : 0;

  return {
    department: {
      name: dept ? dept.name : departmentName,
      subdomain: tenant,
      memberCount
    },
    summary: {
      teamOnTimeCompletionRate: deptOtcr,
      teamFirstTimeApprovalRate: deptFtar,
      teamActiveOverdueRate,
      totalActiveTasks,
      totalActiveOverdue,
      totalCompletedTasks,
      totalCapacity,
      availableCapacity,
      teamUtilizationPct
    },
    members: workerKpis
  };
};

/**
 * Requirement 4: Computes organization-wide summary across all departments.
 */
const computeTenantKpiSummary = async (subdomain, options = {}) => {
  const tenant = (subdomain || '').trim().toLowerCase();
  let departments = await Department.find({ subdomain: tenant }).lean();

  if (options.department || options.team) {
    const targetDept = (options.department || options.team).trim().toLowerCase();
    departments = departments.filter(d => d.name.toLowerCase() === targetDept || String(d._id) === targetDept);
  }

  const deptSummaries = [];
  for (const dept of departments) {
    const dKpi = await computeDepartmentKpi(dept.name, tenant, options);
    deptSummaries.push(dKpi);
  }

  const deptIds = departments.map(d => d._id);
  const isDeptFiltered = Boolean(options.department || options.team);

  const allActiveWorkers = await Worker.find({
    subdomain: tenant,
    status: 'Active',
    ...(isDeptFiltered && deptIds.length > 0 ? { department: { $in: deptIds } } : {})
  }).lean();

  const workerIds = allActiveWorkers.map(w => w._id);
  let allTickets = await Ticket.find({
    subdomain: tenant,
    isDeleted: { $ne: true },
    ...(isDeptFiltered && workerIds.length > 0 ? {
      $or: [
        { assignee: { $in: workerIds } },
        { assignees: { $in: workerIds } }
      ]
    } : (isDeptFiltered ? { _id: null } : {}))
  }).lean();

  let completed = allTickets.filter(t => t.status === 'Done');
  if (options.startDate || options.endDate) {
    const start = options.startDate ? new Date(options.startDate) : new Date(0);
    const end = options.endDate ? new Date(options.endDate) : new Date('2099-12-31');
    if (!isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (!isNaN(end.getTime())) end.setHours(23, 59, 59, 999);

    completed = completed.filter(t => {
      const resDate = getActualExecutionCompletion(t) || (t.updatedAt ? new Date(t.updatedAt) : null);
      return resDate && resDate >= start && resDate <= end;
    });
  }

  const active = allTickets.filter(t => ['To Do', 'In Progress', 'Review'].includes(t.status));

  // Durations
  let totalExecHours = 0;
  let availableExecCount = 0;
  completed.forEach(t => {
    const exec = calculateExecutionDuration(t);
    if (exec.isAvailable) {
      totalExecHours += exec.durationHours;
      availableExecCount++;
    }
  });
  const avgExecutionHours = availableExecCount > 0 ? Math.round((totalExecHours / availableExecCount) * 10) / 10 : null;
  const avgExecutionDays = avgExecutionHours !== null ? Math.round((avgExecutionHours / 24) * 10) / 10 : null;

  const otcrAll = calculateOtcr(completed);
  const ftarAll = calculateFtar(completed);

  const delayedCompletedRate = otcrAll.totalWithDeadline > 0
    ? Math.round((otcrAll.delayedCount / otcrAll.totalWithDeadline) * 100)
    : null;

  const now = new Date();
  const activeWithDeadline = active.filter(t => t.endDate && !isNaN(new Date(t.endDate).getTime()));
  const activeOverdue = activeWithDeadline.filter(t => {
    const deadlineEnd = new Date(t.endDate);
    deadlineEnd.setHours(23, 59, 59, 999);
    return now > deadlineEnd;
  });
  const activeOverdueRate = activeWithDeadline.length > 0
    ? Math.round((activeOverdue.length / activeWithDeadline.length) * 100)
    : null;

  const totalCapacity = allActiveWorkers.length * 5;
  const availableCapacity = Math.max(0, totalCapacity - active.length);
  const capacityUtilizationPct = totalCapacity > 0 ? Math.round((active.length / totalCapacity) * 100) : 0;

  return {
    subdomain: tenant,
    totalWorkers: allActiveWorkers.length,
    totalTickets: allTickets.length,
    activeTicketsCount: active.length,
    completedTicketsCount: completed.length,
    overallOtcr: otcrAll.otcr,
    overallFtar: ftarAll.ftar,
    overallDelayedCompletedRate: delayedCompletedRate,
    overallActiveOverdueRate: activeOverdueRate,
    activeOverdueCount: activeOverdue.length,
    activeWithDeadlineCount: activeWithDeadline.length,
    avgExecutionHours,
    avgExecutionDays,
    totalCapacity,
    availableCapacity,
    capacityUtilizationPct,
    dataCoverage: {
      deadlineCoveragePct: otcrAll.coveragePercentage,
      reviewCoveragePct: ftarAll.coveragePercentage,
      executionCoveragePct: completed.length > 0 ? Math.round((availableExecCount / completed.length) * 100) : 0,
      completedTicketsCount: completed.length,
      activeTicketsCount: active.length
    },
    departments: deptSummaries
  };
};

module.exports = {
  getTicketAssigneeIds,
  getActualExecutionStart,
  getActualExecutionCompletion,
  calculateExecutionDuration,
  evaluateDeadlinePerformance,
  calculateOtcr,
  calculateFtar,
  calculateAssignmentKpiScore,
  computeWorkerKpi,
  computeDepartmentKpi,
  computeTenantKpiSummary
};
