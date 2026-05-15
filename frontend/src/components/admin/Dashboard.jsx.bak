import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaUsers, FaTasks, FaCalendarAlt, FaBuilding,
  FaChartBar, FaArrowRight, FaComments
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
import SalesVelocityWidget from './SalesVelocityWidget';
import renewalService from '../../services/renewalService';

/* ─────────────────────────────────────────
   Circular Progress
───────────────────────────────────────── */
const CircularProgress = ({
  percentage, size = 80, strokeWidth = 6,
  color = '#0D9488', showLabel = true
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius}
          stroke="rgba(0,0,0,0.06)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size/2} cy={size/2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-[1400ms] ease-in-out" />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: size >= 80 ? 14 : size >= 50 ? 11 : 9 }}
            className="font-black text-[#111827] leading-none">
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
    <div className="bg-white rounded-xl px-4 py-3 border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:border-[#0D9488]/25 transition-all duration-200 group flex items-center justify-between gap-3 h-[72px]">
      <div className="min-w-0">
        <p className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] truncate leading-none mb-1.5">
          {title}
        </p>
        <p className="text-[26px] font-black text-[#111827] leading-none">
          {value}
        </p>
      </div>
      <div className="w-9 h-9 rounded-lg bg-[#F0FDF9] text-[#0D9488] flex items-center justify-center flex-shrink-0 group-hover:bg-[#0D9488] group-hover:text-white transition-colors duration-200">
        <Icon size={16} />
      </div>
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
};

/* ─────────────────────────────────────────
   Section Header
───────────────────────────────────────── */
const SectionHeader = ({ title, sub, action, actionLink }) => (
  <div className="flex items-start justify-between mb-3">
    <div>
      <h2 className="text-[12px] font-black text-[#111827] uppercase tracking-[0.12em] leading-none">
        {title}
      </h2>
      {sub && <p className="text-[11px] text-[#9CA3AF] font-medium mt-0.5">{sub}</p>}
    </div>
    {action && actionLink && (
      <Link to={actionLink}
        className="text-[9.5px] font-black text-[#0D9488] uppercase tracking-[0.14em] hover:underline flex items-center gap-1 flex-shrink-0">
        {action} <FaArrowRight size={8} />
      </Link>
    )}
  </div>
);

/* ─────────────────────────────────────────
   Status Pill for Work Allocation
───────────────────────────────────────── */
const StatusPill = ({ label, value, borderColor, badgeClass }) => (
  <div className={`flex items-center justify-between h-[34px] px-3 bg-white border border-[#E9EEF3] border-l-[4px] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)]`}
    style={{ borderLeftColor: borderColor }}>
    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#6B7280]">{label}</span>
    <span className={`text-[13px] font-black ${badgeClass}`}>{value}</span>
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
    renewals: { total: 0, expiringSoon: 0, expired: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [tickets, setTickets] = useState([]);
  const { subdomain } = useContext(appContext);

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
        renewalService.getRenewals({ subdomain })
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

      const deptsSafe      = Array.isArray(departmentsDataRaw) ? departmentsDataRaw : [];
      const pending        = leavesData.filter(l => l.status === 'Pending');
      const approved       = leavesData.filter(l => l.status === 'Approved');
      const rejected       = leavesData.filter(l => l.status === 'Rejected');
      const unread         = commentsData.filter(c => c.isNew || c.replies?.some(r => r.isNew));
      const activeWorkers  = workersData.filter(w => w.status !== 'Relieved');

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
        renewals: { total: renewalsData.length, expiringSoon, expired }
      });

      setPendingLeaves(pending.slice(0, 4));
      setDepartments(deptsSafe);
      setAttendancePercentage(attendanceSummary?.percentage || 0);
      setTickets(ticketsData);
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
    pct >= 90 ? '#0D9488' :
    pct >= 70 ? '#3B82F6' :
    pct >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <div className="bg-[#F5F7FA] min-h-screen p-4 lg:p-5">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-4">

        {/* ══════════════════════════════════════════
            ROW 1 — COMPACT STAT STRIP (6 cards)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard title="Total Employees"  value={stats.workers}          icon={FaUsers}       link="/admin/workers"  />
          <StatCard title="Active Tasks"     value={stats.tasks}            icon={FaTasks}       link="/admin/tasks"    />
          <StatCard title="Topics"           value={stats.topics}           icon={FaTasks}       link="/admin/topics"   />
          <StatCard title="Attendance"       value={`${Math.round(attendancePercentage)}%`} icon={FaChartBar} />
          <StatCard title="Pending Leaves"   value={stats.leaves.pending}   icon={FaCalendarAlt} link="/admin/leaves"   />
          <StatCard title="Unread Comments"  value={stats.comments.unread}  icon={FaComments}    link="/admin/comments" />
        </div>

        {/* ══════════════════════════════════════════
            ROW 2 — 3-COLUMN MAIN GRID
            Col A: Work Allocation
            Col B: Sales Velocity
            Col C: KPI (top) + Attendance (bottom)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Col A: Work Allocation Board ── */}
          <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3">
            <SectionHeader
              title="Work Allocation"
              sub="Task distribution by status"
              action="View Board"
              actionLink="/admin/work-allocation"
            />

            {/* Status pills */}
            <div className="flex flex-col gap-1.5">
              <StatusPill label="To Do"  value={stats.tickets.todo}       borderColor="#9CA3AF" badgeClass="text-[#6B7280]"  />
              <StatusPill label="Active" value={stats.tickets.inProgress}  borderColor="#3B82F6" badgeClass="text-[#3B82F6]"  />
              <StatusPill label="Review" value={stats.tickets.review}      borderColor="#F59E0B" badgeClass="text-[#F59E0B]"  />
              <StatusPill label="Done"   value={stats.tickets.done}        borderColor="#0D9488" badgeClass="text-[#0D9488]"  />
            </div>

            {/* Divider */}
            <div className="border-t border-[#F1F4F8]" />

            {/* Needs Attention */}
            <div className="flex-1 flex flex-col min-h-0">
              <p className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">
                Needs Attention
                {attentionTickets.length > 0 && (
                  <span className="ml-2 bg-[#EF4444]/10 text-[#EF4444] px-1.5 py-0.5 rounded text-[8px]">
                    {attentionTickets.length}
                  </span>
                )}
              </p>
              <div className="space-y-1.5 overflow-y-auto max-h-[200px] pr-0.5">
                {attentionTickets.slice(0, 6).map(ticket => (
                  <div key={ticket._id}
                    onClick={() => navigate('/admin/work-allocation')}
                    className="flex items-center justify-between px-3 py-2 bg-[#F8FAFC] rounded-lg border border-[#EEF1F5] hover:border-[#0D9488]/20 hover:bg-[#F0FDF9]/50 cursor-pointer transition-all duration-150 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-bold text-[#111827] truncate group-hover:text-[#0D9488] transition-colors">
                        {ticket.title}
                      </p>
                      <p className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-wide">
                        #{ticket._id.substring(ticket._id.length - 4).toUpperCase()}
                      </p>
                    </div>
                    <span className={`ml-2 text-[8.5px] font-black uppercase px-2 py-0.5 rounded flex-shrink-0 ${
                      ticket.status === 'Review'
                        ? 'bg-[#F59E0B]/10 text-[#D97706]'
                        : 'bg-[#3B82F6]/10 text-[#2563EB]'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                ))}
                {attentionTickets.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-[11px] text-[#9CA3AF] font-medium">
                    ✓ All clear — no tasks need attention
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Col B: Sales Velocity ── */}
          <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <SalesVelocityWidget />
          </div>

          {/* ── Col C: KPI (top) + Attendance (bottom) ── */}
          <div className="flex flex-col gap-4">

            {/* Performance KPI */}
            <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4">
              <SectionHeader
                title="Performance KPI"
                sub="Core efficiency metrics"
                action="Analytics"
                actionLink="/admin/kpi-management"
              />
              <div className="grid grid-cols-3 divide-x divide-[#F1F4F8] pt-1">
                {/* Turnaround */}
                <div className="text-center px-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-1.5 leading-none">
                    Turnaround
                  </p>
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-[24px] font-black text-[#111827] leading-none">
                      {stats.kpi.avgCycleTime}
                    </span>
                    <span className="text-[10px] font-bold text-[#9CA3AF] pb-0.5">D</span>
                  </div>
                </div>
                {/* Closed 7D */}
                <div className="text-center px-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-1.5 leading-none">
                    Closed 7D
                  </p>
                  <span className="text-[24px] font-black text-[#111827] leading-none">
                    {stats.kpi.closedThisWeek}
                  </span>
                </div>
                {/* SLA Index */}
                <div className="text-center px-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-1.5 leading-none">
                    SLA Index
                  </p>
                  <span className={`text-[24px] font-black leading-none ${
                    stats.kpi.slaBreachRate > 20 ? 'text-[#EF4444]' : 'text-[#0D9488]'
                  }`}>
                    {100 - stats.kpi.slaBreachRate}%
                  </span>
                </div>
              </div>
            </div>

            {/* Overall Attendance */}
            <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <SectionHeader title="Attendance" sub="Today's overview" />
                <div className="flex gap-5 mt-1">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-0.5">Status</p>
                    <p className="text-[11px] font-black text-[#0D9488] uppercase">
                      {attendancePercentage >= 80 ? 'Healthy' :
                       attendancePercentage >= 50 ? 'Moderate' : 'Low'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-0.5">Present</p>
                    <p className="text-[11px] font-black text-[#111827]">
                      {Math.round((attendancePercentage / 100) * stats.workers)} Emp
                    </p>
                  </div>
                </div>
              </div>
              <CircularProgress
                percentage={attendancePercentage}
                size={82}
                strokeWidth={8}
                color="#0D9488"
                showLabel={true}
              />
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════
            ROW 3 — Departments (left) + Renewals (right)
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Departments ── */}
          <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4">
            <SectionHeader title="Departments" sub="Organization attendance overview" />
            {departments.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto">
                {departments.map((dept) => (
                  <div key={dept._id}
                    className="flex items-center justify-between px-3 py-2.5 bg-[#F8FAFC] rounded-lg border border-[#EEF1F5] hover:border-[#0D9488]/20 hover:bg-[#F0FDF9]/40 transition-all duration-150 group gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-white border border-[#E9EEF3] flex items-center justify-center text-[#0D9488] flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <FaBuilding size={12} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-[#111827] truncate leading-none">
                          {dept.name}
                        </p>
                        <p className="text-[9px] text-[#9CA3AF] font-medium mt-0.5">
                          {dept.workerCount || 0} emp
                        </p>
                      </div>
                    </div>
                    <CircularProgress
                      percentage={dept.attendancePercentage || 0}
                      size={38}
                      strokeWidth={4}
                      color={deptColor(dept.attendancePercentage || 0)}
                      showLabel={true}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-10 rounded-lg border border-dashed border-[#E9EEF3] bg-[#F8FAFC]">
                <p className="text-[11px] text-[#9CA3AF] font-bold uppercase tracking-widest">
                  No departments found
                </p>
              </div>
            )}
          </div>

          {/* ── Renewals ── */}
          <div className="bg-white rounded-xl border border-[#E9EEF3] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4 flex flex-col">
            <SectionHeader
              title="Renewals"
              sub="Service timelines"
              action="View All"
              actionLink="/admin/renewals"
            />

            {/* 3-stat row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Total',    value: stats.renewals.total,       cls: 'text-[#111827]' },
                { label: 'Expiring', value: stats.renewals.expiringSoon, cls: 'text-[#F59E0B]' },
                { label: 'Expired',  value: stats.renewals.expired,      cls: 'text-[#EF4444]' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex flex-col items-center justify-center py-3 bg-[#F8FAFC] rounded-lg border border-[#EEF1F5]">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-1">{label}</p>
                  <p className={`text-[22px] font-black leading-none ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Status banner */}
            <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
              stats.renewals.expired > 0
                ? 'bg-[#FEF2F2] border border-[#FCA5A5]/40'
                : 'bg-[#F0FDF9] border border-[#6EE7B7]/40'
            }`}>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-0.5">
                  System Status
                </p>
                <p className={`text-[13px] font-black ${
                  stats.renewals.expired > 0 ? 'text-[#EF4444]' : 'text-[#0D9488]'
                }`}>
                  {stats.renewals.expired > 0 ? 'Action Required' : 'All Systems Good'}
                </p>
              </div>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[16px] ${
                stats.renewals.expired > 0 ? 'bg-[#FEE2E2]' : 'bg-[#CCFBF1]'
              }`}>
                {stats.renewals.expired > 0 ? '⚠' : '✓'}
              </div>
            </div>

            {/* Pending leave quick list (re-used space) */}
            {pendingLeaves.length > 0 && (
              <div className="mt-4">
                <p className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">
                  Pending Leave Requests
                  <span className="ml-1.5 bg-[#F59E0B]/10 text-[#D97706] text-[8px] font-black px-1.5 py-0.5 rounded">
                    {stats.leaves.pending}
                  </span>
                </p>
                <div className="space-y-1">
                  {pendingLeaves.map(leave => (
                    <div key={leave._id}
                      className="flex items-center justify-between px-3 py-2 bg-[#FFFBEB] rounded-lg border border-[#FDE68A]/40">
                      <span className="text-[11px] font-bold text-[#111827] truncate">
                        {leave.worker?.name || 'Unknown'}
                      </span>
                      <span className="text-[9px] text-[#9CA3AF] font-medium whitespace-nowrap ml-2">
                        {new Date(leave.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  ))}
                  {stats.leaves.pending > 4 && (
                    <Link to="/admin/leaves"
                      className="block text-center text-[9.5px] font-black text-[#0D9488] uppercase tracking-widest pt-1 hover:underline">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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