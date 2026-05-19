import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaUsers, FaTasks, FaCalendarAlt, FaBuilding,
  FaChartBar, FaArrowRight, FaComments, FaMoneyBillWave, FaWallet
} from 'react-icons/fa';
import { getWorkers } from '../../services/workerService';
import { getAllTasks } from '../../services/taskService';
import { getAllLeaves } from '../../services/leaveService';
import { getAllComments } from '../../services/commentService';
import { getTopics } from '../../services/topicService';
import { getColumns } from '../../services/columnService';
import { getMealsSummary } from '../../services/foodRequestService';
import { getDepartments } from '../../services/departmentService';
import { getAttendanceSummary } from '../../services/attendanceService';
import { getTickets } from '../../services/ticketService';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';
import WelcomeBanner from './WelcomeBanner';
import SalesVelocityWidget from './SalesVelocityWidget';
import renewalService from '../../services/renewalService';
import { getSalaryProjects, getBulkSalaryReport } from '../../services/salaryService';

/* ─────────────────────────────────────────
   Circular Progress
───────────────────────────────────────── */
const CircularProgress = ({
  percentage, size = 80, strokeWidth = 8,
  color = '#5EB063', showLabel = true
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius}
          stroke="rgba(0,0,0,0.04)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size/2} cy={size/2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-[1400ms] ease-in-out" />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: size >= 80 ? 16 : size >= 50 ? 12 : 10 }}
            className="font-bold text-dash-text leading-none">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   KPI Calculation
───────────────────────────────────────── */
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

/* ─────────────────────────────────────────
   Compact Stat Card  (top strip + bottom strip)
───────────────────────────────────────── */
const StatCard = ({ title, value, icon: Icon, link }) => {
  const inner = (
    <div className="dash-card px-2 py-2 md:px-5 md:py-4 flex items-center justify-between gap-1.5 min-h-[60px] md:min-h-[90px] h-auto group cursor-pointer">
      <div className="min-w-0 flex-1">
        <p className="dash-label mb-0 text-[9px] md:text-[11px] leading-tight">
          {title}
        </p>
        <p className="dash-value text-[13px] md:text-[21px] font-black leading-tight truncate">
          {value}
        </p>
      </div>
      {Icon && (
        <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-dash-soft-green text-dash-green flex items-center justify-center flex-shrink-0 group-hover:bg-dash-green group-hover:text-white transition-all duration-300">
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
      )}
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
};

/* ─────────────────────────────────────────
   Section Header
───────────────────────────────────────── */
const SectionHeader = ({ title, sub, action, actionLink }) => (
  <div className="flex items-start justify-between mb-2 md:mb-4">
    <div>
      <h2 className="dash-title">
        {title}
      </h2>
      {sub && <p className="text-[12px] text-dash-muted font-medium mt-0.5">{sub}</p>}
    </div>
    {action && actionLink && (
      <Link to={actionLink}
        className="text-[12px] font-bold text-dash-green hover:opacity-80 flex items-center gap-1 flex-shrink-0 transition-opacity">
        {action} <FaArrowRight size={10} />
      </Link>
    )}
  </div>
);



/* ─────────────────────────────────────────
   Main Dashboard
───────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    workers: 0, tasks: 0, topics: 0, foodRequests: 0,
    leaves: { total: 0, pending: 0, approved: 0, rejected: 0 },
    comments: { total: 0, unread: 0 },
    tickets: { todo: 0, inProgress: 0, review: 0, done: 0 },
    kpi: { avgCycleTime: 0, closedThisWeek: 0, slaBreachRate: 0 },
    renewals: { total: 0, expiringSoon: 0, expired: 0 },
    salary: { base: 0, payout: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [topTeams, setTopTeams] = useState([]);
  const { subdomain } = useContext(appContext);
  const { user } = useContext(AuthContext);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const results = await Promise.allSettled([
        getWorkers({ subdomain }),
        getAllTasks({ subdomain }),
        getTopics({ subdomain }),
        getColumns({ subdomain }),
        getAllLeaves({ subdomain }),
        getAllComments({ subdomain }),
        getMealsSummary({ subdomain }),
        getDepartments({ subdomain }),
        getAttendanceSummary({ subdomain }),
        getTickets({ subdomain }),
        renewalService.getRenewals({ subdomain }),
        // Fetch current month's salary reports for all workers (Live Daily)
        getBulkSalaryReport(
          subdomain, 
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
          new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString('en-CA')
        )
      ]);

      const workersData         = results[0].status === 'fulfilled' ? results[0].value : [];
      const tasksData           = results[1].status === 'fulfilled' ? results[1].value : [];
      const topicsData          = results[2].status === 'fulfilled' ? results[2].value : [];
      const leavesData          = results[4].status === 'fulfilled' ? results[4].value : [];
      const commentsData        = results[5].status === 'fulfilled' ? results[5].value : [];
      const mealsSummary        = results[6].status === 'fulfilled' ? results[6].value : { total: 0 };
      const departmentsDataRaw  = results[7].status === 'fulfilled' ? results[7].value : [];
      const attendanceSummary   = results[8].status === 'fulfilled' ? results[8].value : { percentage: 0 };
      const ticketsData         = results[9].status === 'fulfilled' ? results[9].value : [];
      const renewalsData        = results[10]?.status === 'fulfilled' ? results[10].value.data || [] : [];
      const bulkSalaryData      = results[11]?.status === 'fulfilled' ? results[11].value.reports || [] : [];

      const deptsSafe      = Array.isArray(departmentsDataRaw) ? departmentsDataRaw : [];
      const pending        = leavesData.filter(l => l.status === 'Pending');
      const approved       = leavesData.filter(l => l.status === 'Approved');
      const rejected       = leavesData.filter(l => l.status === 'Rejected');
      const unread         = commentsData.filter(c => c.isNew || c.replies?.some(r => r.isNew));
      const activeWorkers  = workersData.filter(w => w.status !== 'Relieved');

      const activeWorkerIds = new Set(activeWorkers.map(w => w._id.toString()));
      const monthlyBaseSalary = activeWorkers.reduce((acc, w) => acc + (Number(w.salary) || 0), 0);
      const totalNetPayout = bulkSalaryData
        .filter(r => activeWorkerIds.has(r.workerId))
        .reduce((acc, r) => acc + (Number(r.grossFinalSalary || r.totalFinalSalary) || 0), 0);

      let expiringSoon = 0, expired = 0;
      renewalsData.forEach(r => {
        if (r.domain_status === 'EXPIRING_SOON' || r.server_status === 'EXPIRING_SOON') expiringSoon++;
        if (r.domain_status === 'EXPIRED'       || r.server_status === 'EXPIRED')        expired++;
      });

      setStats({
        workers: activeWorkers.length,
        tasks: tasksData.length,
        topics: topicsData.length,
        foodRequests: mealsSummary.total,
        leaves: { total: leavesData.length, pending: pending.length, approved: approved.length, rejected: rejected.length },
        comments: { total: commentsData.length, unread: unread.length },
        tickets: {
          todo:       ticketsData.filter(t => t.status === 'To Do').length,
          inProgress: ticketsData.filter(t => t.status === 'In Progress').length,
          review:     ticketsData.filter(t => t.status === 'Review').length,
          done:       ticketsData.filter(t => t.status === 'Done').length,
        },
        kpi: calculateKpiStats(ticketsData),
        renewals: { total: renewalsData.length, expiringSoon, expired },
        salary: { base: monthlyBaseSalary, payout: totalNetPayout }
      });

      setPendingLeaves(pending.slice(0, 4));
      setDepartments(deptsSafe);
      setAttendancePercentage(attendanceSummary?.percentage || 0);
      setTickets(ticketsData);

      // Calculate Top Teams from Bulk Salary Reports
      const teamEarnings = {};
      bulkSalaryData
        .filter(r => activeWorkerIds.has(r.workerId))
        .forEach(report => {
          const deptName = report.department;
          if (deptName && deptName !== 'N/A') {
            teamEarnings[deptName] = (teamEarnings[deptName] || 0) + (report.totalFinalSalary || 0);
          }
        });
      
      const sortedTeams = Object.entries(teamEarnings)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);
      
      setTopTeams(sortedTeams);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadDashboardData(); }, [subdomain]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#F5F7FA]">
        <Spinner size="lg" />
      </div>
    );
  }

  const attentionTickets = tickets.filter(
    t => t.status === 'Review' || t.status === 'In Progress'
  );

  /* ── attendance colour helper ── */
  const deptColor = (pct) =>
    pct >= 90 ? '#5EB063' :
    pct >= 70 ? '#3B82F6' :
    pct >= 40 ? '#FFA756' : '#F43F5E';

  const totalTickets = stats.tickets.todo + stats.tickets.inProgress + stats.tickets.review + stats.tickets.done;
  const completionRate = totalTickets > 0 ? Math.round((stats.tickets.done / totalTickets) * 100) : 0;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="bg-dash-bg min-h-screen">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-4 md:gap-6 pb-10">

        <WelcomeBanner 
          userName={user?.name || user?.username || 'admin21'} 
          pendingReviews={stats.tickets.review}
          totalTasks={totalTickets}
          completionRate={completionRate}
          topTeams={topTeams}
        />

        {/* ══════════════════════════════════════════
            ROW 1 — COMPACT STAT STRIP (5 cards)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
          <div className="col-span-2 md:col-span-1">
            <StatCard title="Total Employees"  value={stats.workers}          icon={FaUsers}       link="/admin/workers"  />
          </div>
          <StatCard title="Active Tasks"     value={stats.tasks}            icon={FaTasks}       link="/admin/tasks"    />
          <StatCard title="Topics"           value={stats.topics}           icon={FaTasks}       link="/admin/topics"   />
          <StatCard title="Monthly Base Salary" value={`₹${stats.salary.base.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={FaMoneyBillWave} />
          <StatCard title="Total Net Payout"    value={`₹${stats.salary.payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={FaWallet} />
        </div>

        {/* ══════════════════════════════════════════
            ROW 2 — 3-COLUMN MAIN GRID
            Col A: Work Allocation
            Col B: Sales Velocity
            Col C: KPI (top) + Attendance (bottom)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

          {/* ── Col A: Work Allocation Board ── */}
          <div className="dash-card p-4 md:p-6 flex flex-col gap-4">
            <SectionHeader
              title="Work Allocation"
              sub="Task distribution by status"
              action="View Board"
              actionLink="/admin/work-allocation"
            />

            {/* Needs Attention at the top */}
            <div className="flex-1 flex flex-col min-h-0">
              <p className="dash-label mb-3 flex items-center justify-between">
                Needs Attention
                {attentionTickets.length > 0 && (
                  <span className="bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {attentionTickets.length}
                  </span>
                )}
              </p>
              <div className="space-y-2 overflow-y-auto max-h-[180px] pr-1 custom-scrollbar">
                {attentionTickets.slice(0, 6).map(ticket => (
                  <div key={ticket._id}
                    onClick={() => navigate('/admin/work-allocation')}
                    className="flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 bg-dash-bg/40 rounded-xl md:rounded-2xl border border-dash-border hover:border-dash-green/30 hover:bg-white cursor-pointer transition-all duration-200 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-dash-text truncate group-hover:text-dash-green transition-colors">
                        {ticket.title}
                      </p>
                      <p className="text-[10px] font-medium text-dash-muted uppercase tracking-wider mt-0.5">
                        #{ticket._id.substring(ticket._id.length - 4).toUpperCase()}
                      </p>
                    </div>
                    <span className={`ml-3 text-[10px] font-bold uppercase px-3 py-1 rounded-full flex-shrink-0 ${
                      ticket.status === 'Review'
                        ? 'bg-dash-soft-orange text-dash-orange'
                        : 'bg-blue-50 text-blue-600'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                ))}
                {attentionTickets.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-dash-soft-green flex items-center justify-center text-dash-green mb-2">
                      <FaTasks size={16} />
                    </div>
                    <p className="text-[12px] text-dash-muted font-medium">All tasks are currently on track</p>
                  </div>
                )}
              </div>
            </div>

            {/* Small Task status summary at the bottom */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-dash-border/50">
              <div className="flex flex-col items-center py-2 bg-dash-bg/40 rounded-xl border border-dash-border">
                <span className="text-[9px] font-bold text-dash-muted uppercase">To Do</span>
                <span className="text-[14px] font-bold text-dash-text">{stats.tickets.todo}</span>
              </div>
              <div className="flex flex-col items-center py-2 bg-dash-bg/40 rounded-xl border border-dash-border">
                <span className="text-[9px] font-bold text-dash-muted uppercase text-blue-600">Active</span>
                <span className="text-[14px] font-bold text-blue-600">{stats.tickets.inProgress}</span>
              </div>
              <div className="flex flex-col items-center py-2 bg-dash-bg/40 rounded-xl border border-dash-border">
                <span className="text-[9px] font-bold text-dash-muted uppercase text-dash-orange">Review</span>
                <span className="text-[14px] font-bold text-dash-orange">{stats.tickets.review}</span>
              </div>
              <div className="flex flex-col items-center py-2 bg-dash-bg/40 rounded-xl border border-dash-border">
                <span className="text-[9px] font-bold text-dash-muted uppercase text-dash-green">Done</span>
                <span className="text-[14px] font-bold text-dash-green">{stats.tickets.done}</span>
              </div>
            </div>
          </div>

          {/* ── Col B: Sales Velocity ── */}
          <div className="dash-card overflow-hidden">
            <SalesVelocityWidget />
          </div>

          {/* ── Col C: KPI (top) + Attendance (bottom) ── */}
          <div className="flex flex-col gap-6">

            {/* Performance KPI */}
            <div className="dash-card p-4 md:p-6 flex flex-col flex-1">
              <SectionHeader
                title="Performance KPI"
                sub="Core efficiency metrics"
                action="Analytics"
                actionLink="/admin/kpi-management"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 pt-2 flex-1 items-center divide-y divide-dash-border/50 sm:divide-y-0 sm:divide-x divide-dash-border/50">
                {/* Turnaround */}
                <div className="text-center px-2 flex flex-col items-center pb-3 sm:pb-0">
                  <p className="dash-label mb-2">Turnaround</p>
                  <div className="flex items-baseline gap-1">
                    <span className="dash-value">{stats.kpi.avgCycleTime}</span>
                    <span className="text-[12px] font-bold text-dash-muted">Days</span>
                  </div>
                </div>
                {/* Closed 7D */}
                <div className="text-center px-2 flex flex-col items-center py-3 sm:py-0">
                  <p className="dash-label mb-2">Closed 7D</p>
                  <span className="dash-value">{stats.kpi.closedThisWeek}</span>
                </div>
                {/* SLA Index */}
                <div className="text-center px-2 flex flex-col items-center pt-3 sm:pt-0">
                  <p className="dash-label mb-2">SLA Index</p>
                  <span className={`dash-value ${
                    stats.kpi.slaBreachRate > 20 ? 'text-rose-500' : 'text-dash-green'
                  }`}>
                    {100 - stats.kpi.slaBreachRate}%
                  </span>
                </div>
              </div>
            </div>

            {/* Overall Attendance */}
            <div className="dash-card p-4 md:p-6 flex-1 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <SectionHeader title="Attendance" sub="Today's overview" />
                <div className="flex gap-6 mt-2">
                  <div>
                    <p className="dash-label mb-1">Status</p>
                    <p className={`text-[14px] font-bold uppercase ${
                      attendancePercentage >= 80 ? 'text-dash-green' :
                      attendancePercentage >= 50 ? 'text-blue-500' : 'text-rose-500'
                    }`}>
                      {attendancePercentage >= 80 ? 'Healthy' :
                       attendancePercentage >= 50 ? 'Moderate' : 'Low'}
                    </p>
                  </div>
                  <div>
                    <p className="dash-label mb-1">Present</p>
                    <p className="text-[14px] font-bold text-dash-text">
                      {Math.round((attendancePercentage / 100) * stats.workers)} Emp
                    </p>
                  </div>
                </div>
              </div>
              <CircularProgress
                percentage={attendancePercentage}
                size={90}
                strokeWidth={10}
                color="#5EB063"
                showLabel={true}
              />
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════
            ROW 3 — Departments (left) + Renewals (right)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

          {/* ── Departments ── */}
          <div className="dash-card p-4 md:p-6 flex flex-col h-full">
            <SectionHeader title="Departments" sub="Organization attendance overview" />
            {departments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 pr-1 custom-scrollbar overflow-y-auto max-h-[440px]">
                {departments.map((dept) => (
                  <div key={dept._id}
                    className="flex items-center justify-between px-2 py-2.5 md:px-4 md:py-3.5 bg-dash-bg/40 rounded-xl md:rounded-2xl border border-dash-border hover:border-dash-green/30 hover:bg-white transition-all duration-200 group gap-2 h-[60px] md:h-[75px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white border border-dash-border flex items-center justify-center text-dash-green flex-shrink-0 shadow-sm group-hover:bg-dash-green group-hover:text-white transition-all">
                        <FaBuilding size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] md:text-[13px] font-bold text-dash-text truncate leading-tight">
                          {dept.name}
                        </p>
                        <p className="text-[9px] md:text-[11px] text-dash-muted font-medium mt-0.5">
                          {dept.workerCount || 0} Emp
                        </p>
                      </div>
                    </div>
                    <CircularProgress
                      percentage={dept.attendancePercentage || 0}
                      size={36}
                      strokeWidth={4}
                      color={deptColor(dept.attendancePercentage || 0)}
                      showLabel={true}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 rounded-[24px] border-2 border-dashed border-dash-border bg-dash-bg/30">
                <p className="text-[14px] text-dash-muted font-bold uppercase tracking-widest">
                  No departments found
                </p>
              </div>
            )}
          </div>

          {/* ── Renewals ── */}
          <div className="dash-card p-4 md:p-6 flex flex-col h-full">
            <SectionHeader
              title="Renewals"
              sub="Service timelines"
              action="View All"
              actionLink="/admin/renewals"
            />

            {/* 3-stat row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Total',    value: stats.renewals.total,       cls: 'text-dash-text', bg: 'bg-white' },
                { label: 'Expiring', value: stats.renewals.expiringSoon, cls: 'text-dash-orange', bg: 'bg-dash-soft-orange' },
                { label: 'Expired',  value: stats.renewals.expired,      cls: 'text-rose-500', bg: 'bg-rose-50' },
              ].map(({ label, value, cls, bg }) => (
                <div key={label} className={`flex flex-col items-center justify-center py-4 ${bg} rounded-2xl border border-dash-border shadow-sm`}>
                  <p className="dash-label mb-1">{label}</p>
                  <p className={`text-[18px] md:text-[24px] font-bold leading-none ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Status banner */}
            <div className={`rounded-2xl px-5 py-4 flex items-center justify-between ${
              stats.renewals.expired > 0
                ? 'bg-rose-50 border border-rose-100'
                : 'bg-dash-soft-green border border-dash-green/20'
            }`}>
              <div>
                <p className="dash-label mb-1 opacity-80">
                  System Status
                </p>
                <p className={`text-[15px] font-bold ${
                  stats.renewals.expired > 0 ? 'text-rose-500' : 'text-dash-green'
                }`}>
                  {stats.renewals.expired > 0 ? 'Action Required' : 'All Systems Good'}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[20px] ${
                stats.renewals.expired > 0 ? 'bg-rose-100' : 'bg-green-100'
              }`}>
                {stats.renewals.expired > 0 ? '⚠' : '✓'}
              </div>
            </div>

            {/* Pending leave quick list */}
            {pendingLeaves.length > 0 && (
              <div className="mt-6 pt-6 border-t border-dash-border">
                <p className="dash-label mb-4 flex items-center justify-between">
                  Pending Leave Requests
                  <span className="bg-dash-soft-orange text-dash-orange text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {stats.leaves.pending}
                  </span>
                </p>
                <div className="space-y-2">
                  {pendingLeaves.map(leave => (
                    <div key={leave._id}
                      className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-dash-border hover:shadow-sm transition-all">
                      <span className="text-[13px] font-bold text-dash-text truncate">
                        {leave.worker?.name || 'Unknown'}
                      </span>
                      <span className="text-[11px] text-dash-muted font-medium whitespace-nowrap ml-3">
                        {new Date(leave.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  ))}
                  {stats.leaves.pending > 4 && (
                    <Link to="/admin/leaves"
                      className="block text-center text-[12px] font-bold text-dash-green mt-3 hover:underline">
                      +{stats.leaves.pending - 4} more
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ROW 4 — BOTTOM SUMMARY STRIP
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard title="Leaves Pending"   value={stats.leaves.pending}   icon={FaCalendarAlt} link="/admin/leaves"   />
          <StatCard title="Leaves Approved"  value={stats.leaves.approved}  icon={FaCalendarAlt} link="/admin/leaves"   />
          <StatCard title="Comments Unread"  value={stats.comments.unread}  icon={FaComments}    link="/admin/comments" />
          <StatCard title="Meals Requested"  value={stats.foodRequests}     icon={FaUsers}                              />
        </div>

      </div>
    </div>
  );
};

export default Dashboard;