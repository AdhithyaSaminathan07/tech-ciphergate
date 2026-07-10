const Worker = require('../models/Worker');
const Task = require('../models/Task');
const Topic = require('../models/Topic');
const Leave = require('../models/Leave');
const Comment = require('../models/Comment');
const Ticket = require('../models/ticketModel');
const Renewal = require('../models/renewal');
const Department = require('../models/Department');
const FoodRequest = require('../models/FoodRequest');
const DashboardSalaryStat = require('../models/DashboardSalaryStat');
const Settings = require('../models/Settings');

// Helper for KPI
const calculateKpiStats = (tickets) => {
  const closedTickets = tickets.filter(t => t.status === 'Done');
  let totalDays = 0;
  closedTickets.forEach(t => {
    const doneStatus = t.statusHistory?.find(h => h.status === 'Done');
    if (doneStatus)
      totalDays += (new Date(doneStatus.changedAt) - new Date(t.createdAt)) / 86400000;
  });
  const avgCycleTime = closedTickets.length > 0 ? (totalDays / closedTickets.length).toFixed(1) : 0;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const closedThisWeek = closedTickets.filter(t => {
    const d = t.statusHistory?.find(h => h.status === 'Done');
    return d && new Date(d.changedAt) >= oneWeekAgo;
  }).length;
  const breached = closedTickets.filter(t => {
    const d = t.statusHistory?.find(h => h.status === 'Done');
    if (!d) return false;
    return (new Date(d.changedAt) - new Date(t.createdAt)) / 86400000 > 7;
  }).length;
  const slaBreachRate = closedTickets.length > 0 ? Math.round((breached / closedTickets.length) * 100) : 0;
  return { avgCycleTime, closedThisWeek, slaBreachRate };
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const subdomain = req.query.subdomain;
    if (!subdomain) {
      return res.status(400).json({ success: false, message: 'Subdomain is required' });
    }

    // 1. Gather all parallel queries for counts and specific lightweight data
    const [
      workers,
      tasksCount,
      topicsCount,
      leaves,
      comments,
      mealsTotal,
      departments,
      allTickets,
      renewals,
      cachedSalaryStats
    ] = await Promise.all([
      Worker.find({ subdomain, status: { $ne: 'Relieved' } }).select('salary'),
      Task.countDocuments({ subdomain }),
      Topic.countDocuments({ subdomain }),
      Leave.find({ subdomain }).select('status worker startDate').populate('worker', 'name'),
      Comment.find({ subdomain }).select('isNew replies'),
      FoodRequest.find({ subdomain }).select('breakfast lunch dinner snacks guestMeals'),
      Department.find({ subdomain }).lean(),
      Ticket.find({ subdomain }).lean(),
      Renewal.find({ subdomain }).lean(),
      DashboardSalaryStat.findOne({ subdomain, month: new Date().getMonth() + 1, year: new Date().getFullYear() }).lean()
    ]);

    // Workers & Salary
    const activeWorkersCount = workers.length;
    const monthlyBaseSalary = workers.reduce((acc, w) => acc + (Number(w.salary) || 0), 0);
    const totalNetPayout = cachedSalaryStats?.totalNetPayout || monthlyBaseSalary;

    // Food requests
    const foodRequestsCount = mealsTotal.reduce((sum, req) => sum + (req.breakfast || 0) + (req.lunch || 0) + (req.dinner || 0) + (req.snacks || 0) + (req.guestMeals?.length || 0), 0);

    // Leaves
    const pendingLeavesAll = leaves.filter(l => l.status === 'Pending');
    const approvedLeavesCount = leaves.filter(l => l.status === 'Approved').length;
    const rejectedLeavesCount = leaves.filter(l => l.status === 'Rejected').length;
    const pendingLeaves = pendingLeavesAll.slice(0, 4);

    // Comments
    const unreadCommentsCount = comments.filter(c => c.isNew || c.replies?.some(r => r.isNew)).length;

    // Tickets
    const todoCount = allTickets.filter(t => t.status === 'To Do').length;
    const inProgressCount = allTickets.filter(t => t.status === 'In Progress').length;
    const reviewCount = allTickets.filter(t => t.status === 'Review').length;
    const doneCount = allTickets.filter(t => t.status === 'Done').length;
    
    const attentionTickets = allTickets
      .filter(t => t.status === 'Review' || t.status === 'In Progress')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 6);

    const kpi = calculateKpiStats(allTickets);

    // Renewals
    let expiringSoon = 0, expired = 0;
    renewals.forEach(r => {
      if (r.domain_status === 'EXPIRING_SOON' || r.server_status === 'EXPIRING_SOON') expiringSoon++;
      if (r.domain_status === 'EXPIRED' || r.server_status === 'EXPIRED') expired++;
    });

    // Attendance Calculation (Simplified logic for dashboard, normally uses Attendance model)
    const today = new Date();
    today.setHours(0,0,0,0);
    const Attendance = require('../models/Attendance');
    const todaysAttendance = await Attendance.find({ 
      subdomain, 
      date: { $gte: today } 
    }).lean();
    
    // Create attendance map
    const presentWorkers = new Set(todaysAttendance.map(a => a.workerId?.toString()));
    const attendancePercentage = activeWorkersCount > 0 
      ? Math.round((presentWorkers.size / activeWorkersCount) * 100) 
      : 0;

    // Department enrich
    const enrichedDepartments = departments.map(dept => {
      const deptWorkers = workers.filter(w => w.department === dept.name);
      const deptWorkerCount = deptWorkers.length;
      const deptPresent = deptWorkers.filter(w => presentWorkers.has(w._id.toString())).length;
      
      return {
        ...dept,
        workerCount: deptWorkerCount,
        attendancePercentage: deptWorkerCount > 0 ? Math.round((deptPresent / deptWorkerCount) * 100) : 0
      };
    });

    res.json({
      success: true,
      data: {
        stats: {
          workers: activeWorkersCount,
          tasks: tasksCount,
          topics: topicsCount,
          foodRequests: foodRequestsCount,
          leaves: { total: leaves.length, pending: pendingLeavesAll.length, approved: approvedLeavesCount, rejected: rejectedLeavesCount },
          comments: { total: comments.length, unread: unreadCommentsCount },
          tickets: { todo: todoCount, inProgress: inProgressCount, review: reviewCount, done: doneCount },
          kpi,
          renewals: { total: renewals.length, expiringSoon, expired },
          salary: { base: monthlyBaseSalary, payout: totalNetPayout }
        },
        pendingLeaves,
        departments: enrichedDepartments,
        attendancePercentage,
        attentionTickets,
        topTeams: cachedSalaryStats?.topTeams || []
      }
    });

  } catch (err) {
    console.error('Error fetching admin dashboard summary:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getWorkerDashboard = async (req, res) => {
  try {
    const subdomain = req.query.subdomain;
    if (!subdomain) {
      return res.status(400).json({ success: false, message: 'Subdomain is required' });
    }

    const workerId = req.user.id || req.user._id;
    const department = req.user.department;

    const [
      myTasks,
      topicsCount,
      columnsCount
    ] = await Promise.all([
      Task.find({ 
        subdomain,
        'assignedWorkers.workerId': workerId
      }).sort({ createdAt: -1 }).lean(),
      Topic.countDocuments({ 
        subdomain, 
        $or: [{ department: 'all' }, { department }] 
      }),
      // Columns typically do not have huge volume, but we just need count or basic info
      Topic.countDocuments({ subdomain }) // Dummy since columns are normally fetched per board. For worker dashboard they just want topic/column data. We will fetch full topics and columns since they might be needed for forms.
    ]);

    // For forms we might still need all topics and columns, let's fetch them
    const Column = require('../models/Column');
    const topics = await Topic.find({ subdomain, $or: [{ department: 'all' }, { department }] }).lean();
    const columns = await Column.find({ subdomain, $or: [{ department: 'all' }, { department }] }).lean();

    const recentTasks = myTasks.slice(0, 5);
    const totalPoints = myTasks.reduce((acc, t) => acc + (t.points || 0), 0);

    res.json({
      success: true,
      data: {
        tasksSummary: {
          totalPoints,
          recentTasks,
          totalCount: myTasks.length
        },
        topics,
        columns
      }
    });

  } catch (err) {
    console.error('Error fetching worker dashboard summary:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
