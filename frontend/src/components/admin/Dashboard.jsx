import { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaUsers,
  FaTasks,
  FaCalendarAlt,
  FaCalendarCheck,
  FaBuilding,
  FaChartBar,
  FaArrowRight,
  FaComments,
  FaMoneyBillWave,
  FaWallet,
  FaLayerGroup,
  FaUtensils,
  FaCheckCircle,
  FaClock,
  FaSyncAlt
} from 'react-icons/fa';
import { getAdminDashboardSummary } from '../../services/dashboardService';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';
import SalesVelocityWidget from './SalesVelocityWidget';

/* ─────────────────────────────────────────
   Circular Progress
───────────────────────────────────────── */
const CircularProgress = ({
  percentage,
  size = 76,
  strokeWidth = 7,
  color = '#087443',
  showLabel = true
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const validPercentage = Math.min(Math.max(Number(percentage) || 0, 0), 100);
  const offset = circumference - (validPercentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2ECE5"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            style={{ fontSize: size >= 70 ? 15 : size >= 45 ? 12 : 10 }}
            className="font-black text-[#0F241D] leading-none font-display"
          >
            {Math.round(validPercentage)}%
          </span>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   Compact KPI Stat Card (Top Row & Summary)
───────────────────────────────────────── */
const StatCard = ({ title, value, icon: Icon, link, subtitle, alert = false }) => {
  const inner = (
    <div
      className={`bg-white rounded-xl p-3.5 sm:p-4 border transition-all duration-200 flex items-start justify-between gap-2.5 sm:gap-3 group cursor-pointer h-full ${
        alert
          ? 'border-amber-200/90 bg-amber-50/20 hover:border-amber-300 shadow-sm'
          : 'border-[#E2ECE5] hover:border-emerald-300 hover:shadow-md shadow-sm'
      }`}
    >
      <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
        <div>
          <p className="text-[11px] sm:text-xs font-bold text-[#526A5E] uppercase tracking-wider mb-1 leading-snug break-words">
            {title}
          </p>
          <p className="text-lg sm:text-[20px] xl:text-[22px] font-black text-[#0F241D] leading-tight font-display tracking-tight">
            {value}
          </p>
        </div>
        {subtitle && (
          <p
            className={`text-[11px] sm:text-xs font-semibold mt-1.5 leading-snug break-words ${
              alert ? 'text-amber-600' : 'text-[#087443]'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {Icon && (
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-sm mt-0.5 ${
            alert
              ? 'bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white'
              : 'bg-[#F0FAF4] text-[#087443] border border-[#E2ECE5] group-hover:bg-[#087443] group-hover:text-white group-hover:border-[#087443]'
          }`}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      )}
    </div>
  );

  return link ? (
    <Link to={link} className="block w-full h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
};

/* ─────────────────────────────────────────
   Section Header
───────────────────────────────────────── */
const SectionHeader = ({ title, sub, icon: Icon, action, actionLink }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      {Icon && (
        <div className="w-8 h-8 rounded-lg bg-[#F0FAF4] text-[#087443] border border-[#E2ECE5] flex items-center justify-center flex-shrink-0">
          <Icon size={15} />
        </div>
      )}
      <div>
        <h2 className="text-base md:text-lg font-bold text-[#0F241D] tracking-tight leading-tight">
          {title}
        </h2>
        {sub && <p className="text-xs text-[#526A5E] font-medium mt-0.5">{sub}</p>}
      </div>
    </div>
    {action && actionLink && (
      <Link
        to={actionLink}
        className="text-xs font-semibold text-[#087443] hover:text-[#065F37] bg-[#F0FAF4] hover:bg-[#E0F2E8] px-3 py-1.5 rounded-lg border border-[#E2ECE5] transition-all flex items-center gap-1.5 flex-shrink-0"
      >
        <span>{action}</span>
        <FaArrowRight size={10} />
      </Link>
    )}
  </div>
);

/* ─────────────────────────────────────────
   Main Dashboard Component
───────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    workers: 0,
    tasks: 0,
    topics: 0,
    foodRequests: 0,
    leaves: { total: 0, pending: 0, approved: 0, rejected: 0 },
    comments: { total: 0, unread: 0 },
    tickets: { todo: 0, inProgress: 0, review: 0, done: 0 },
    kpi: { avgCycleTime: 0, closedThisWeek: 0, slaBreachRate: 0 },
    renewals: { total: 0, expiringSoon: 0, expired: 0 },
    salary: { base: 0, payout: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [tickets, setTickets] = useState([]);
  const { subdomain } = useContext(appContext);
  const { user } = useContext(AuthContext);

  const loadDashboardData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      setError(null);
      const dashboardData = await getAdminDashboardSummary(subdomain);

      if (dashboardData) {
        setStats(dashboardData.stats || {});
        setPendingLeaves(dashboardData.pendingLeaves || []);
        setDepartments(dashboardData.departments || []);
        setAttendancePercentage(dashboardData.attendancePercentage || 0);
        setTickets(dashboardData.attentionTickets || []);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load dashboard overview data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [subdomain]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[70vh] bg-transparent">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !stats.workers && departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center bg-white rounded-xl border border-rose-200 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <FaSyncAlt size={20} />
        </div>
        <h3 className="text-base font-bold text-[#0F241D] mb-1">Unable to Load Dashboard</h3>
        <p className="text-xs text-[#526A5E] max-w-md mb-4">{error}</p>
        <button
          onClick={() => loadDashboardData(false)}
          className="px-4 py-2 bg-[#087443] hover:bg-[#065F37] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const attentionTickets = tickets || [];

  const deptColor = (pct) =>
    pct >= 90 ? '#087443' : pct >= 70 ? '#0284C7' : pct >= 40 ? '#D97706' : '#E11D48';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="w-full flex flex-col gap-5 md:gap-6 pb-8">

      {/* ══════════════════════════════════════════
          COMPACT DASHBOARD HEADER TOOLBAR
      ══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white px-5 py-4 rounded-xl border border-[#E2ECE5] shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-3 h-3 rounded-full bg-[#087443] ring-4 ring-emerald-100 animate-pulse" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-[#0F241D] tracking-tight leading-none mb-0">
                Admin Overview
              </h1>
              <span className="text-sm font-medium text-slate-300">·</span>
              <span className="text-sm text-[#526A5E] font-medium">
                Hi, <strong className="text-[#0F241D] font-bold">{user?.name || user?.username || 'Administrator'}</strong>
              </span>
            </div>
            <p className="text-xs md:text-sm text-[#526A5E] font-medium mt-1">
              {today} · Live Operations, Financials & Performance Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold text-slate-700 bg-[#F6F9F7] hover:bg-[#E8F3ED] border border-[#E2ECE5] transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-sm"
            title="Refresh Dashboard Data"
          >
            <FaSyncAlt className={`text-xs ${isRefreshing ? 'animate-spin text-[#087443]' : 'text-[#526A5E]'}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <Link
            to="/admin/work-allocation"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-semibold text-white bg-[#087443] hover:bg-[#065F37] shadow-sm hover:shadow transition-all duration-200 active:scale-95"
          >
            <FaTasks className="text-xs" />
            <span>Work Board</span>
          </Link>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          ROW 1 — TOP CRITICAL KPI ROW (5 Cards)
      ══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 md:gap-4">
        <StatCard
          title="Total Developers"
          value={stats.workers || 0}
          icon={FaUsers}
          link="/admin/workers"
          subtitle="Active Staff"
        />
        <StatCard
          title="Active Tasks"
          value={stats.tasks || 0}
          icon={FaTasks}
          link="/admin/work-allocation"
          subtitle={`${stats.tickets?.inProgress || 0} In Progress`}
        />
        <StatCard
          title="Pending Approvals"
          value={stats.leaves?.pending || 0}
          icon={FaClock}
          link="/admin/leaves"
          subtitle="Leave Requests"
          alert={(stats.leaves?.pending || 0) > 0}
        />
        <StatCard
          title="Monthly Base Salary"
          value={`₹${(stats.salary?.base || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          })}`}
          icon={FaMoneyBillWave}
          link="/admin/salary"
          subtitle="Base Payroll"
        />
        <StatCard
          title="Total Net Payout"
          value={`₹${(stats.salary?.payout || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          })}`}
          icon={FaWallet}
          link="/admin/salary"
          subtitle="Disbursement"
        />
      </div>

      {/* ══════════════════════════════════════════
          ROW 2 — OPERATIONS & PIPELINE MAIN GRID
          Left (7 cols on xl): Work Allocation & Operational Queues
          Right (5 cols on xl): Performance, Attendance & Sales Velocity
      ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 md:gap-6">

        {/* ── Left Column (7 cols) ── */}
        <div className="xl:col-span-7 flex flex-col gap-5 md:gap-6">

          {/* 1. Work Allocation Board (Prominent Card) */}
          <div className="bg-white rounded-xl p-5 md:p-6 border border-[#E2ECE5] shadow-sm flex flex-col justify-between">
            <div>
              <SectionHeader
                title="Work Allocation"
                sub="Active task distribution & immediate attention queue"
                icon={FaTasks}
                action="View Board"
                actionLink="/admin/work-allocation"
              />

              {/* Status breakdown pills */}
              <div className="grid grid-cols-4 gap-2.5 mb-4">
                <div className="flex items-center justify-between px-3 py-2 bg-[#F6F9F7] rounded-lg border border-[#E2ECE5]">
                  <span className="text-xs font-semibold text-[#526A5E]">To Do</span>
                  <span className="text-sm font-bold text-[#0F241D]">{stats.tickets?.todo || 0}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-blue-50/70 rounded-lg border border-blue-100">
                  <span className="text-xs font-semibold text-blue-600">Active</span>
                  <span className="text-sm font-bold text-blue-700">{stats.tickets?.inProgress || 0}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50/70 rounded-lg border border-amber-100">
                  <span className="text-xs font-semibold text-amber-600">Review</span>
                  <span className="text-sm font-bold text-amber-700">{stats.tickets?.review || 0}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F0FAF4] rounded-lg border border-emerald-100">
                  <span className="text-xs font-semibold text-[#087443]">Done</span>
                  <span className="text-sm font-bold text-[#087443]">{stats.tickets?.done || 0}</span>
                </div>
              </div>

              {/* Tasks Needing Attention List */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-[#0F241D] uppercase tracking-wider">
                    Tasks Needing Attention
                  </span>
                  {attentionTickets.length > 0 && (
                    <span className="bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">
                      {attentionTickets.length} tasks
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                  {attentionTickets.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket._id}
                      onClick={() => navigate('/admin/work-allocation')}
                      className="flex items-start sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg border border-[#E2ECE5] hover:border-emerald-300 cursor-pointer transition-all group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[#0F241D] leading-snug break-words group-hover:text-[#087443] transition-colors">
                          {ticket.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono font-medium text-[#526A5E]">
                            #{ticket._id.substring(ticket._id.length - 4).toUpperCase()}
                          </span>
                          {ticket.category && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-[11px] text-[#526A5E] font-medium truncate">
                                {ticket.category}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full shrink-0 whitespace-nowrap border self-start sm:self-center ${
                          ticket.status === 'Review'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                  ))}

                  {attentionTickets.length === 0 && (
                    <div className="flex items-center justify-center gap-2.5 py-6 text-center rounded-lg bg-[#F6F9F7] border border-dashed border-[#E2ECE5]">
                      <FaCheckCircle className="text-[#087443] text-sm" />
                      <span className="text-sm text-[#526A5E] font-medium">
                        All tasks are currently on track
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Side-by-Side Operational Queues */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">

            {/* Pending Leaves Queue */}
            <div className="bg-white rounded-xl p-5 border border-[#E2ECE5] shadow-sm flex flex-col justify-between">
              <div>
                <SectionHeader
                  title="Leave Approvals"
                  sub={`${stats.leaves?.pending || 0} pending review`}
                  icon={FaCalendarAlt}
                  action="Review"
                  actionLink="/admin/leaves"
                />

                <div className="space-y-2 mt-2">
                  {pendingLeaves && pendingLeaves.length > 0 ? (
                    pendingLeaves.slice(0, 3).map((leave) => (
                      <div
                        key={leave._id}
                        className="flex items-center justify-between px-3 py-2.5 bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg border border-[#E2ECE5] transition-all text-xs"
                      >
                        <span className="font-semibold text-[#0F241D] text-sm truncate">
                          {leave.worker?.name || 'Unknown'}
                        </span>
                        <span className="text-xs text-[#526A5E] font-medium ml-2 whitespace-nowrap">
                          {new Date(leave.startDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short'
                          })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-5 text-center text-xs text-[#526A5E] font-medium">
                      No pending leave requests
                    </div>
                  )}

                  {(stats.leaves?.pending || 0) > 3 && (
                    <Link
                      to="/admin/leaves"
                      className="block text-center text-xs font-bold text-[#087443] pt-1.5 hover:underline"
                    >
                      +{(stats.leaves?.pending || 0) - 3} more requests
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Service Timelines & System Status */}
            <div className="bg-white rounded-xl p-5 border border-[#E2ECE5] shadow-sm flex flex-col justify-between">
              <div>
                <SectionHeader
                  title="Service Timelines"
                  sub="Domains & Servers"
                  icon={FaCalendarCheck}
                  action="Manage"
                  actionLink="/admin/renewals"
                />

                {/* 3 mini counters */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="flex flex-col items-center py-2 bg-[#F6F9F7] rounded-lg border border-[#E2ECE5]">
                    <span className="text-[10px] font-semibold text-[#526A5E] uppercase">Total</span>
                    <span className="text-sm font-bold text-[#0F241D]">{stats.renewals?.total || 0}</span>
                  </div>
                  <div className="flex flex-col items-center py-2 bg-amber-50/60 rounded-lg border border-amber-100">
                    <span className="text-[10px] font-semibold text-amber-600 uppercase">Expiring</span>
                    <span className="text-sm font-bold text-amber-700">{stats.renewals?.expiringSoon || 0}</span>
                  </div>
                  <div className="flex flex-col items-center py-2 bg-rose-50/60 rounded-lg border border-rose-100">
                    <span className="text-[10px] font-semibold text-rose-600 uppercase">Expired</span>
                    <span className="text-sm font-bold text-rose-700">{stats.renewals?.expired || 0}</span>
                  </div>
                </div>

                {/* System Status Banner */}
                <div
                  className={`rounded-lg px-3 py-2.5 flex items-center justify-between text-xs font-semibold border ${
                    (stats.renewals?.expired || 0) > 0
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-[#F0FAF4] text-[#087443] border-emerald-200'
                  }`}
                >
                  <span>
                    {(stats.renewals?.expired || 0) > 0 ? 'Action Required' : 'All Systems Healthy'}
                  </span>
                  <span className="font-bold text-sm">
                    {(stats.renewals?.expired || 0) > 0 ? '!' : '✓'}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* ── Right Column (5 cols) ── */}
        <div className="xl:col-span-5 flex flex-col gap-5 md:gap-6">

          {/* Performance KPI & Attendance in 2 Balanced Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-5">

            {/* Performance KPI */}
            <div className="bg-white rounded-xl p-5 border border-[#E2ECE5] shadow-sm flex flex-col justify-between">
              <SectionHeader
                title="Performance KPI"
                sub="Core turnaround & SLA index"
                icon={FaChartBar}
                action="Analytics"
                actionLink="/admin/kpi-management"
              />

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="bg-[#F6F9F7] rounded-lg p-3 border border-[#E2ECE5] text-center">
                  <span className="text-[10px] font-semibold text-[#526A5E] uppercase block mb-1">
                    Turnaround
                  </span>
                  <span className="text-lg font-black text-[#0F241D] font-display">
                    {stats.kpi?.avgCycleTime || 0}
                    <span className="text-xs font-normal text-[#526A5E] ml-0.5">d</span>
                  </span>
                </div>

                <div className="bg-[#F6F9F7] rounded-lg p-3 border border-[#E2ECE5] text-center">
                  <span className="text-[10px] font-semibold text-[#526A5E] uppercase block mb-1">
                    Closed 7D
                  </span>
                  <span className="text-lg font-black text-[#0F241D] font-display">
                    {stats.kpi?.closedThisWeek || 0}
                  </span>
                </div>

                <div className="bg-[#F6F9F7] rounded-lg p-3 border border-[#E2ECE5] text-center">
                  <span className="text-[10px] font-semibold text-[#526A5E] uppercase block mb-1">
                    SLA Index
                  </span>
                  <span
                    className={`text-lg font-black font-display ${
                      (stats.kpi?.slaBreachRate || 0) > 20 ? 'text-rose-600' : 'text-[#087443]'
                    }`}
                  >
                    {100 - (stats.kpi?.slaBreachRate || 0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance Overview */}
            <div className="bg-white rounded-xl p-5 border border-[#E2ECE5] shadow-sm flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <SectionHeader
                  title="Attendance"
                  sub="Today's Headcount"
                  icon={FaUsers}
                />
                <div className="flex items-center gap-5 mt-1.5">
                  <div>
                    <span className="text-[10px] font-semibold text-[#526A5E] uppercase block mb-0.5">Status</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        attendancePercentage >= 80
                          ? 'bg-[#F0FAF4] text-[#087443] border-emerald-200'
                          : attendancePercentage >= 50
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {attendancePercentage >= 80
                        ? 'Healthy'
                        : attendancePercentage >= 50
                        ? 'Moderate'
                        : 'Low'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#526A5E] uppercase block mb-0.5">Present</span>
                    <span className="text-base font-black text-[#0F241D] font-display">
                      {Math.round((attendancePercentage / 100) * (stats.workers || 0))} / {stats.workers || 0} Emp
                    </span>
                  </div>
                </div>
              </div>

              <CircularProgress
                percentage={attendancePercentage}
                size={76}
                strokeWidth={7}
                color="#087443"
                showLabel={true}
              />
            </div>

          </div>

          {/* Sales Velocity Widget */}
          <div className="bg-white rounded-xl border border-[#E2ECE5] shadow-sm overflow-hidden">
            <SalesVelocityWidget />
          </div>

        </div>

      </div>

      {/* ══════════════════════════════════════════
          ROW 3 — DEPARTMENTS OVERVIEW (6 cols on lg)
      ══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl p-5 md:p-6 border border-[#E2ECE5] shadow-sm">
        <SectionHeader
          title="Department Attendance & Headcount"
          sub="Active team distribution and attendance across units"
          icon={FaBuilding}
          action="Manage Departments"
          actionLink="/admin/departments"
        />

        {departments && departments.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {departments.map((dept) => (
              <div
                key={dept._id}
                className="flex items-center justify-between p-3 bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg border border-[#E2ECE5] hover:border-emerald-300 transition-all group"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-xs md:text-sm font-semibold text-[#0F241D] truncate leading-tight group-hover:text-[#087443] transition-colors">
                    {dept.name}
                  </p>
                  <p className="text-xs text-[#526A5E] font-medium mt-0.5">
                    {dept.workerCount || 0} Emp
                  </p>
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
          <div className="py-6 text-center text-xs text-[#526A5E] font-medium">
            No departments configured
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          ROW 4 — COMPACT SECONDARY SUMMARY STRIP (4 Cards)
      ══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
        <StatCard
          title="Managed Topics"
          value={stats.topics || 0}
          icon={FaLayerGroup}
          link="/admin/topics"
          subtitle="Topic Registry"
        />
        <StatCard
          title="Leaves Approved"
          value={stats.leaves?.approved || 0}
          icon={FaCalendarCheck}
          link="/admin/leaves"
          subtitle="Historical Approvals"
        />
        <StatCard
          title="Unread Comments"
          value={stats.comments?.unread || 0}
          icon={FaComments}
          link="/admin/comments"
          subtitle="Feedback & Replies"
        />
        <StatCard
          title="Meals Requested"
          value={stats.foodRequests || 0}
          icon={FaUtensils}
          link="/admin/food-requests"
          subtitle="Catering Queue"
        />
      </div>

    </div>
  );
};

export default Dashboard;