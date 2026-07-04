// backend/utils/salaryPenaltyCalculator.js

const getDateStr = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

const backfillReviewCycles = (ticket) => {
  if (ticket.reviewCycles && ticket.reviewCycles.length > 0) {
    return ticket.reviewCycles;
  }
  
  const cycles = [];
  const history = [...(ticket.statusHistory || [])].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
  
  history.forEach(entry => {
    const time = entry.changedAt;
    if (entry.status === 'Review') {
      cycles.push({
        submissionTime: time,
        decision: 'Pending',
        decisionTime: null,
        reviewer: null,
        feedback: ''
      });
    } else if (entry.status === 'Done') {
      const pending = cycles.find(c => c.decision === 'Pending');
      if (pending) {
        pending.decision = 'Approved';
        pending.decisionTime = time;
      } else {
        cycles.push({
          submissionTime: time,
          decision: 'Approved',
          decisionTime: time,
          reviewer: null,
          feedback: ''
        });
      }
    } else if (entry.status === 'In Progress' || entry.status === 'To Do') {
      const pending = cycles.find(c => c.decision === 'Pending');
      if (pending) {
        pending.decision = 'Rejected';
        pending.decisionTime = time;
      }
    }
  });
  
  return cycles;
};

/**
 * Calculates the task penalties and salary-protection states for a worker's tasks.
 * Centralizes logic so worker dashboard, admin single report, admin bulk report,
 * and exports all yield identical figures.
 */
const calculateTaskPenalties = ({ worker, tickets, report, fromDate, toDate }) => {
  const parseSalary = (str) => {
    if (!str) return 0;
    const cleaned = String(str).replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const reportYear = new Date(fromDate).getFullYear();
  const claimedDays = new Set();
  let totalTaskPenalty = 0;

  const taskPenalties = tickets.map(ticket => {
    // 1. Ensure reviewCycles are populated or backfilled
    const cycles = backfillReviewCycles(ticket);

    // 2. Identify due date
    if (!ticket.endDate) {
      return {
        _id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        endDate: null,
        doneDate: null,
        taskDeduction: 0,
        dailyList: [],
        overdueWorkingDays: 0,
        period: 'No Due Date',
        protectionState: 'no_dates'
      };
    }

    const dueDateStr = getDateStr(ticket.endDate);

    // 3. Map review cycles to date strings
    const mappedCycles = cycles.map(c => ({
      submissionDateStr: getDateStr(c.submissionTime),
      submissionTime: new Date(c.submissionTime),
      decision: c.decision,
      decisionDateStr: c.decisionTime ? getDateStr(c.decisionTime) : null,
      decisionTime: c.decisionTime ? new Date(c.decisionTime) : null
    })).sort((a, b) => a.submissionTime - b.submissionTime);

    // Helper to determine if a specific date (YYYY-MM-DD) is penalized for this task
    const isPenalizedOnDate = (dateStr) => {
      // Rules only apply to days after the due date
      if (dateStr <= dueDateStr) return false;

      // Do not apply penalties to future days that haven't occurred yet
      const todayStr = getDateStr(new Date());
      if (dateStr > todayStr) return false;

      // Find review cycles submitted on or before dateStr
      const activeCycles = mappedCycles.filter(c => c.submissionDateStr <= dateStr);

      if (activeCycles.length === 0) {
        // Late submission and not yet submitted on or before dateStr
        return true;
      }

      // Check the latest cycle submitted on or before dateStr
      const latestCycle = activeCycles[activeCycles.length - 1];

      // If submitted on dateStr, the deduction stops on dateStr
      if (latestCycle.submissionDateStr === dateStr) {
        return false;
      }

      if (latestCycle.decision === 'Pending') {
        return false; // Safe while waiting for review
      }

      if (latestCycle.decision === 'Approved') {
        if (!latestCycle.decisionDateStr || latestCycle.decisionDateStr > dateStr) {
          return false; // Still pending on dateStr
        }
        return false; // Approved, permanently ends cycle
      }

      if (latestCycle.decision === 'Rejected') {
        if (!latestCycle.decisionDateStr || latestCycle.decisionDateStr > dateStr) {
          return false; // Still pending on dateStr
        }
        // Rejected on or before dateStr, and not resubmitted yet
        return true;
      }

      return false;
    };

    // 4. Calculate task deductions day-by-day
    let taskDeduction = 0;
    const dailyList = [];

    // Determine the range of days to evaluate: from day after due date to toDate or today, whichever is later
    const startEvalDate = new Date(ticket.endDate);
    startEvalDate.setDate(startEvalDate.getDate() + 1);
    
    // We evaluate up to the report's toDate, or the latest decision/submission date if it extends beyond toDate
    const toDateObj = new Date(toDate);
    const lastCycleDate = mappedCycles.length > 0 
      ? new Date(Math.max(...mappedCycles.map(c => Math.max(c.submissionTime, c.decisionTime || 0))))
      : new Date(0);
    const evalEndDate = new Date(Math.max(toDateObj.getTime(), lastCycleDate.getTime(), Date.now()));
    
    // Iterate through report days to match actual salary deductions in the report period
    if (report && report.report) {
      report.report.forEach(day => {
        // Parse daily report date
        const dayDate = new Date(`${day.date}, ${reportYear}`);
        const dateStr = getDateStr(dayDate);

        if (isPenalizedOnDate(dateStr)) {
          const amt = parseSalary(day.totalSalary);
          if (!claimedDays.has(dateStr)) {
            claimedDays.add(dateStr);
            totalTaskPenalty += amt;
            taskDeduction += amt;
            dailyList.push({ date: day.date, amount: amt });
          } else {
            dailyList.push({ date: day.date, amount: 0, alreadyDeducted: true });
          }
        }
      });
    }

    // 5. Calculate overdue working days for UI listing
    let overdueWorkingDays = 0;
    const cur = new Date(startEvalDate);
    cur.setHours(0,0,0,0);
    const endLimit = evalEndDate < new Date() ? evalEndDate : new Date();
    endLimit.setHours(23,59,59,999);
    
    while (cur <= endLimit) {
      const dateStr = getDateStr(cur);
      if (isPenalizedOnDate(dateStr)) {
        overdueWorkingDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    // 6. Determine current salary-protection state for the card display
    // Possible states: "Submitted on time", "Awaiting review", "Deduction active", "Approved", "None"
    let protectionState = 'None';
    const todayStr = getDateStr(new Date());
    
    if (ticket.status === 'Done') {
      protectionState = 'Approved';
    } else {
      const latestOverallCycle = mappedCycles[mappedCycles.length - 1];
      if (latestOverallCycle) {
        if (latestOverallCycle.decision === 'Pending') {
          if (latestOverallCycle.submissionDateStr <= dueDateStr) {
            protectionState = 'Submitted on time'; // Submitted on or before due date, awaiting review
          } else {
            protectionState = 'Awaiting review'; // Late submission, but currently awaiting review
          }
        } else if (latestOverallCycle.decision === 'Rejected') {
          protectionState = 'Deduction active'; // Rejected and not resubmitted
        } else if (latestOverallCycle.decision === 'Approved') {
          protectionState = 'Approved';
        }
      } else {
        // No cycles at all
        if (todayStr > dueDateStr) {
          protectionState = 'Deduction active'; // Overdue and not submitted
        }
      }
    }

    // Period format
    const startPeriodStr = startEvalDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const doneCycle = mappedCycles.find(c => c.decision === 'Approved');
    const endPeriodStr = doneCycle 
      ? doneCycle.submissionTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : 'Ongoing';

    return {
      _id: ticket._id,
      title: ticket.title,
      status: ticket.status,
      endDate: ticket.endDate,
      doneDate: doneCycle ? doneCycle.submissionTime : null,
      taskDeduction,
      dailyList,
      overdueWorkingDays,
      period: `${startPeriodStr} → ${endPeriodStr}`,
      protectionState
    };
  });

  const todayStr = getDateStr(new Date());
  const filteredPenalties = taskPenalties.filter(task => {
    if (!task.endDate) return false;
    const dueDateStr = getDateStr(task.endDate);
    if (task.status === 'Done') {
      if (!task.doneDate) return false;
      return getDateStr(task.doneDate) > dueDateStr;
    } else {
      return todayStr > dueDateStr;
    }
  });

  return {
    taskPenalties: filteredPenalties,
    totalTaskPenalty
  };
};

module.exports = {
  getDateStr,
  backfillReviewCycles,
  calculateTaskPenalties
};
