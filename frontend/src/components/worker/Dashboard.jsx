import { useState, useEffect, useContext, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import { getMyTasks } from '../../services/taskService';
import { getWorkerDashboardSummary } from '../../services/dashboardService';
import { getMySalaryReport } from '../../services/salaryService';
import TaskForm from './TaskForm';
import Scoreboard from './Scoreboard';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import CustomTaskForm from './CustomTaskForm';
import { readNotification } from '../../services/notificationService';
import appContext from '../../context/AppContext';
import { 
  Camera, IdCard, ChevronDown, ChevronUp, Wallet, ArrowRight, Trophy, 
  Medal, Award, AlertTriangle, Bell, ClipboardList, CheckSquare, 
  ArrowUpCircle, ClipboardCheck, Shield, X, Calendar 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import api from '../../services/api';
import { createPortal } from 'react-dom';
import FaceAttendance from '../admin/FaceAttendance';
import RFIDAttendancePopup from './RFIDAttendancePopup';
import MyFines from '../dashboard/MyFines';
import { Link, useNavigate } from 'react-router-dom';
import PerformanceCard from './PerformanceCard';
import MiniLeaderboard from './MiniLeaderboard';
import PointHistory from './PointHistory';
import LeaderboardModal from './LeaderboardModal';
import PointAnimation from './PointAnimation';
import MyWalletCard from './MyWalletCard';

/* ─────────────────────────────────────────
   Shared Components (matching Admin style)
───────────────────────────────────────── */

const SectionHeader = ({ title, sub, action, actionLink }) => (
  <div className="flex items-start justify-between mb-4">
    <div>
      <h2 className="dash-title text-[14px] md:text-[16px] font-bold text-dash-text tracking-tight">
        {title}
      </h2>
      {sub && <p className="text-[11px] text-dash-muted font-medium mt-0.5">{sub}</p>}
    </div>
    {action && actionLink && (
      <Link to={actionLink}
        className="text-[11px] font-bold text-[#0d9488] hover:text-[#0f766e] flex items-center gap-1 flex-shrink-0 transition-colors">
        {action} <ArrowRight size={10} />
      </Link>
    )}
  </div>
);

const Dashboard = () => {
  const { subdomain } = useContext(appContext);
  const { user } = useAuth();
  
  const [showBugBountyPopup, setShowBugBountyPopup] = useState(false);
  const [bugBountyData, setBugBountyData] = useState(null);

  const handleDismissBugBounty = () => {
    setShowBugBountyPopup(false);
    const username = user?.username || 'default';
    localStorage.setItem(`bugBountyPopupLastShown_${username}`, Date.now().toString());
  };
  
  const handleViewBugBountyDetails = () => {
    setShowBugBountyPopup(false);
    const username = user?.username || 'default';
    localStorage.setItem(`bugBountyPopupLastShown_${username}`, Date.now().toString());
    window.open(bugBountyData?.bugReportUrl || 'https://techvaseegrah.com/bug-bounty', '_blank');
  };
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [columns, setColumns] = useState([]);
  const [tasksSummary, setTasksSummary] = useState({ totalPoints: 0, totalCount: 0 });
  const [showAllRecentTasks, setShowAllRecentTasks] = useState(false);
  const [showFaceAttendance, setShowFaceAttendance] = useState(false);
  const [showRFIDAttendance, setShowRFIDAttendance] = useState(false);
  const [accessControl, setAccessControl] = useState({ rfidAttendance: true, faceAttendance: true });
  const [showDeductionBreakdown, setShowDeductionBreakdown] = useState(false);
  const [showUnauthorizedBreakdown, setShowUnauthorizedBreakdown] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [salaryData, setSalaryData] = useState({
    baseSalary: 0,
    finalSalary: 0,
    actualEarnedSalary: 0,
    totalDeductions: 0,
    totalUnauthorizedPenalty: 0,
    unauthorizedAbsencePenalties: [],
    delayedTasks: [],
    taskPenalty: 0,
    report: null,
    totalBonusAmount: 0,
    projectAdjustment: 0
  });
  const [topTeams, setTopTeams] = useState([]);

  const fetchSalary = async () => {
    try {
      const data = await getMySalaryReport();
      setSalaryData({
        baseSalary: data.baseSalary ?? 0,
        finalSalary: data.finalSalary ?? 0,
        actualEarnedSalary: data.actualEarnedSalary ?? 0,
        totalDeductions: data.totalDeductions ?? 0,
        totalUnauthorizedPenalty: data.totalUnauthorizedPenalty ?? 0,
        unauthorizedAbsencePenalties: data.unauthorizedAbsencePenalties ?? [],
        delayedTasks: data.delayedTasks ?? [],
        taskPenalty: data.taskPenalty,
        report: data.report ?? null,
        totalBonusAmount: data.totalBonusAmount ?? 0,
        projectAdjustment: data.projectAdjustment ?? 0
      });
    } catch (error) {
      console.error('Failed to fetch salary report:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await readNotification(subdomain);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  const fetchAttendanceLocation = async () => {
    try {
      if (subdomain && subdomain !== 'main') {
        const response = await api.get(`/settings/public/${subdomain}`);
        if (response.data?.attendanceAccessControl?.employee) {
          setAccessControl(response.data.attendanceAccessControl.employee);
        }
        if (response.data?.bugBountyConfig) {
          const config = response.data.bugBountyConfig;
          setBugBountyData(config);
          
          if (config.popupFrequency && config.popupFrequency !== 'disabled') {
            const username = user?.username || 'default';
            const lastShownKey = `bugBountyPopupLastShown_${username}`;
            const lastShown = localStorage.getItem(lastShownKey);
            
            let shouldShow = false;
            if (config.popupFrequency === 'always') {
              shouldShow = true;
            } else if (!lastShown) {
              shouldShow = true;
            } else {
              const diffMs = Date.now() - parseInt(lastShown);
              const hours = diffMs / (1000 * 60 * 60);
              
              const lastUpdatedTime = config.lastUpdated ? new Date(config.lastUpdated).getTime() : 0;
              const lastShownTime = parseInt(lastShown);
              
              if (lastUpdatedTime > lastShownTime) {
                shouldShow = true;
              } else if (config.popupFrequency === 'every_day') {
                const lastDate = new Date(parseInt(lastShown)).toDateString();
                const currentDate = new Date().toDateString();
                shouldShow = lastDate !== currentDate;
              } else if (config.popupFrequency === 'every_week') {
                shouldShow = hours >= 7 * 24;
              } else if (config.popupFrequency === 'every_month') {
                shouldShow = hours >= 30 * 24;
              } else if (config.popupFrequency === 'once') {
                shouldShow = false;
              }
            }
            
            if (shouldShow) {
              setShowBugBountyPopup(true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching attendance location:', error);
    }
  };

  const fetchTopTeams = async () => {
    try {
      const now = new Date();
      const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
      
      const response = await api.get('/salary/top-teams-earnings', {
        params: { subdomain, fromDate, toDate }
      });
      
      setTopTeams(response.data.topTeams || []);
    } catch (error) {
      console.error('Failed to fetch top teams:', error);
    }
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchNotifications(),
          fetchAttendanceLocation(),
          fetchSalary(),
          fetchTopTeams(),
          (async () => {
            const summary = await getWorkerDashboardSummary(subdomain);
            setTasks(summary.tasksSummary.recentTasks);
            setTasksSummary({
              totalPoints: summary.tasksSummary.totalPoints,
              totalCount: summary.tasksSummary.totalCount
            });
            setTopics(summary.topics || []);
            setColumns(summary.columns || []);
          })()
        ]);
      } catch (error) {
        if (error.response?.status !== 401) {
          toast.error('Failed to load dashboard data');
        }
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) loadDashboardData();
  }, [user, subdomain]);

  const handleAttendanceMarked = () => fetchSalary();
  
  const handleTaskSubmit = (newTask) => {
    setTasks(prev => [newTask, ...prev]);
    toast.success('Task submitted successfully!');
  };

  const totalPoints = useMemo(() => tasksSummary.totalPoints + tasks.filter(t => !t._id).reduce((acc, t) => acc + (t.points || 0), 0), [tasksSummary.totalPoints, tasks]);

  const calculatedTaskPenalties = useMemo(() => {
    if (!salaryData.delayedTasks || salaryData.delayedTasks.length === 0) {
      return { taskPenalties: [], totalTaskPenalty: 0 };
    }

    const taskPenalties = salaryData.delayedTasks.map(task => {
      return {
        ...task,
        taskDeduction: task.taskDeduction || 0,
        period: task.period || 'No Date',
        overdueWorkingDays: task.overdueWorkingDays || 0,
        protectionState: task.protectionState || 'None'
      };
    });

    const totalTaskPenalty = salaryData.taskPenalty ?? taskPenalties.reduce((sum, t) => sum + (t.taskDeduction || 0), 0);

    return { taskPenalties, totalTaskPenalty };
  }, [salaryData.delayedTasks, salaryData.taskPenalty]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#F5F7FA]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="bg-[#F8FAFC] min-h-screen px-3 py-1.5 md:px-6 md:py-3 lg:px-8 lg:py-4">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-4 md:gap-8">
        
        {/* Header / Greeting */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex items-center justify-between relative overflow-hidden">
          {/* Subtle background glow accents */}
          <div className="absolute right-0 top-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 bottom-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col gap-1.5 z-10">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Welcome back, {user?.name || user?.username}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full shadow-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Live
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Active Member of the <span className="text-teal-600 font-bold bg-teal-50/50 border border-teal-100/50 px-2 py-0.5 rounded-md uppercase tracking-wider text-[10px]">{user?.department || 'Ciphergate'}</span> department
            </p>
          </div>
          
          {/* Calendar Date Widget */}
          <div className="hidden md:flex flex-col items-end text-right z-10 border-l border-slate-100 pl-6 shrink-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Calendar size={11} className="text-slate-400" />
              <span>Today's Date</span>
            </span>
            <span className="text-base font-bold text-slate-700 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Attendance Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Attendance</p>
                <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold text-emerald-750 bg-emerald-50 border border-emerald-100 rounded-full">Check-in</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan your face or RFID badge below to log daily attendance.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-6">
                {accessControl.faceAttendance && (
                  <button
                    onClick={() => setShowFaceAttendance(true)}
                    className="flex flex-col items-center justify-center p-4 bg-slate-50/60 hover:bg-teal-50/50 border border-slate-100 hover:border-teal-200 rounded-2xl transition-all duration-200 group gap-3.5 select-none"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      <Camera size={18} />
                    </div>
                    <span className="text-xs font-bold text-slate-700">Face ID</span>
                  </button>
                )}
                {accessControl.rfidAttendance && (
                  <button
                    onClick={() => setShowRFIDAttendance(true)}
                    className="flex flex-col items-center justify-center p-4 bg-slate-50/60 hover:bg-teal-50/50 border border-slate-100 hover:border-teal-200 rounded-2xl transition-all duration-200 group gap-3.5 select-none"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      <IdCard size={18} />
                    </div>
                    <span className="text-xs font-bold text-slate-700">RFID</span>
                  </button>
                )}
              </div>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 text-center mt-6 pt-4 border-t border-slate-50 flex items-center justify-center gap-1.5">
              <Shield className="text-slate-400" size={13} />
              <span>Access verified securely via node</span>
            </div>
          </div>

          {/* 2. Salary Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Salary - Current Month</p>
                <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold text-slate-550 bg-slate-50 border border-slate-150 rounded-full">Estimated</span>
              </div>
              <div className="space-y-3">
                {/* Deduction breakdown lines */}
                <div className="space-y-1.5 text-xs font-semibold">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Base Salary</span>
                    <span className="text-slate-800 font-bold">
                      ₹{Math.round(Number(salaryData.baseSalary) || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {(() => {
                    const grossProject = Number(salaryData.report?.summary?.grossProjectSalary) || 0;
                    const bonus = Number(salaryData.totalBonusAmount) || 0;
                    const adjustment = Number(salaryData.projectAdjustment) || 0;
                    const additional = grossProject + bonus + adjustment;
                    
                    if (additional > 0) {
                      return (
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="text-teal-500">+</span> Project / Other Earnings
                          </span>
                          <span className="text-teal-600 font-bold">
                            +₹{Math.round(additional).toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div 
                    onClick={() => {
                      if (calculatedTaskPenalties.taskPenalties.length > 0) {
                        setShowDeductionBreakdown(!showDeductionBreakdown);
                      }
                    }}
                    className={`flex justify-between items-center text-slate-500 ${calculatedTaskPenalties.taskPenalties.length > 0 ? 'cursor-pointer hover:bg-slate-50/85 p-0.5 rounded transition-all select-none' : ''}`}
                  >
                    <span className="flex items-center gap-1 text-rose-500">
                      <span className="text-slate-400">−</span> Task Delay Penalties
                      {calculatedTaskPenalties.taskPenalties.length > 0 && (
                        <ChevronDown className={`text-slate-400 transition-transform duration-200 ${showDeductionBreakdown ? 'rotate-180' : ''}`} size={10} />
                      )}
                    </span>
                    <span className="text-rose-500 font-bold">−₹{Math.round(calculatedTaskPenalties.totalTaskPenalty).toLocaleString('en-IN')}</span>
                  </div>

                  {/* Task penalty breakdown (expandable) */}
                  {calculatedTaskPenalties.taskPenalties.length > 0 && (
                    <AnimatePresence>
                      {showDeductionBreakdown && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1 mt-1 mb-1 max-h-24 overflow-y-auto pr-1 pl-2">
                            {calculatedTaskPenalties.taskPenalties.map((task, index) => (
                              <div key={index} className="p-2 bg-rose-50/60 border border-rose-100/60 rounded-xl text-[10px] leading-relaxed flex flex-col gap-1">
                                <div className="flex justify-between font-bold">
                                  <span className="text-slate-700 truncate max-w-[70%]">{task.title}</span>
                                  <span className="text-rose-600">−₹{Math.round(task.taskDeduction).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between text-slate-400 font-semibold">
                                  <span>{task.period}</span>
                                  <span>{task.overdueWorkingDays}d late</span>
                                </div>
                                {task.protectionState && (
                                  <div className="flex justify-between items-center mt-1 pt-1 border-t border-rose-100/40">
                                    <span className="text-slate-400 font-semibold text-[9px] uppercase tracking-wider">Salary Protection</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${
                                      task.protectionState === 'Submitted on time' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                      task.protectionState === 'Awaiting review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      task.protectionState === 'Deduction active' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                      task.protectionState === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                      'bg-slate-50 text-slate-500 border-slate-200'
                                    }`}>
                                      {task.protectionState === 'None' ? 'On Track' : task.protectionState}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {salaryData.totalUnauthorizedPenalty > 0 && (
                    <>
                      <div 
                        onClick={() => setShowUnauthorizedBreakdown(!showUnauthorizedBreakdown)}
                        className="flex justify-between items-center text-slate-500 cursor-pointer hover:bg-slate-50/85 p-0.5 rounded transition-all select-none"
                      >
                        <span className="flex items-center gap-1 text-orange-500 font-bold">
                          <span className="text-slate-400">−</span> Unapproved Leave Penalties
                          <ChevronDown className={`text-slate-400 transition-transform duration-200 ${showUnauthorizedBreakdown ? 'rotate-180' : ''}`} size={10} />
                        </span>
                        <span className="text-rose-500 font-bold">
                          −₹{Math.round(salaryData.totalUnauthorizedPenalty).toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Unauthorized penalty breakdown (expandable) */}
                      <AnimatePresence>
                        {showUnauthorizedBreakdown && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1 mt-1 mb-1 max-h-24 overflow-y-auto pr-1 pl-2">
                              {salaryData.unauthorizedAbsencePenalties?.map((p, index) => (
                                <div key={index} className="p-1.5 bg-orange-50 border border-orange-100 rounded-lg text-[10px] leading-relaxed">
                                  <div className="flex justify-between font-bold mb-0.5">
                                    <span className="text-orange-700 truncate max-w-[70%]">{p.displayDate} - {p.status}</span>
                                    <span className="text-rose-600">−₹{Math.round(p.penaltyAmount).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400 font-semibold">
                                    <span>{p.reason}</span>
                                    <span>Factor: 5X</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  <div className="flex justify-between items-center text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="text-slate-400">−</span> Delay Deduction
                    </span>
                    <span className="text-rose-500 font-bold">
                      −₹{Math.round(salaryData.totalDeductions).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-100 pt-1.5 text-slate-600 font-bold">
                    <span>Total Deductions</span>
                    <span className="text-rose-700">−₹{Math.round(salaryData.totalDeductions + calculatedTaskPenalties.totalTaskPenalty + (salaryData.totalUnauthorizedPenalty || 0)).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Hero Stat: Final Payout uses the backend's final calculation directly */}
                {(() => {
                  const finalBackend = Number(salaryData.finalSalary) || 0;
                  const taskPen = Number(calculatedTaskPenalties.totalTaskPenalty) || 0;
                  const displayFinalPayout = Math.max(0, finalBackend - taskPen);
                  
                  // Estimate a gross for payout ratio: base + additional
                  const base = Number(salaryData.baseSalary) || 0;
                  const grossProject = Number(salaryData.report?.summary?.grossProjectSalary) || 0;
                  const bonus = Number(salaryData.totalBonusAmount) || 0;
                  const adjustment = Number(salaryData.projectAdjustment) || 0;
                  const additional = grossProject + bonus + adjustment;
                  const grossEarnings = base + additional;

                  const payoutRatio = grossEarnings > 0
                    ? Math.max(0, Math.min(100, Math.round((displayFinalPayout / grossEarnings) * 100)))
                    : 0;
                  return (
                    <>
                      {/* Progress bar */}
                      {grossEarnings > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-slate-400">
                            <span>Payout ratio</span>
                            <span>{payoutRatio}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-teal-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${payoutRatio}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Final Payout hero */}
                      <div className="bg-teal-50/60 rounded-2xl p-3.5 border border-teal-100/50 flex items-center justify-between">
                        <div>
                          <span className="block text-[10px] text-teal-600 font-black tracking-wider uppercase">Final Payout</span>
                          <span className="text-xl font-black text-teal-700 tracking-tight">
                            ₹{Math.round(displayFinalPayout).toLocaleString('en-IN')}
                          </span>
                          <span className="block text-[9px] text-teal-500 mt-0.5">
                            After all deductions
                          </span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center">
                          <Wallet size={14} />
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* No deductions message */}
                {salaryData.totalDeductions === 0 && calculatedTaskPenalties.taskPenalties.length === 0 && salaryData.totalUnauthorizedPenalty === 0 && (
                  <div className="text-[10px] text-teal-600 text-center font-bold py-1">
                    🎉 Perfect record this month!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Top Team Earnings Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Top Team Earnings</p>
                <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold text-slate-550 bg-slate-50 border border-slate-150 rounded-full">Monthly Rank</span>
              </div>
              <div className="space-y-3.5 mt-4">
                {topTeams && topTeams.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(...topTeams.map(t => t.amount || 1));
                    return topTeams.slice(0, 3).map((team, index) => {
                      const medals = [
                        <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-250 text-amber-600 flex items-center justify-center text-[10px] shrink-0"><Trophy size={11} /></div>,
                        <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[10px] shrink-0"><Medal size={11} /></div>,
                        <div className="w-5 h-5 rounded-full bg-orange-50 border border-orange-200 text-orange-650 flex items-center justify-center text-[10px] shrink-0"><Award size={11} /></div>
                      ];
                      const itemColors = index === 0 ? 'bg-amber-50/40 text-amber-900 border-amber-100/70' :
                                       index === 1 ? 'bg-slate-50/50 text-slate-800 border-slate-200/70' :
                                       'bg-orange-50/45 text-orange-900 border-orange-100/70';
                      const barColors = index === 0 ? 'bg-amber-500' :
                                        index === 1 ? 'bg-slate-400' :
                                        'bg-orange-400';
                      return (
                        <div key={index} className={`flex flex-col p-3 rounded-2xl border transition-all gap-2 ${itemColors}`}>
                          <div className="flex items-center justify-between min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {medals[index] || <span className="text-xs shrink-0 font-bold">#{index + 1}</span>}
                              <span className="text-xs font-bold text-slate-700 truncate">{team.name}</span>
                            </div>
                            <span className="text-xs font-extrabold text-slate-800 flex-shrink-0">
                              ₹{Math.round(team.amount).toLocaleString('en-IN')}
                            </span>
                          </div>
                          {/* Relative progress bar to fill empty space and add visual polish */}
                          <div className="w-full bg-slate-200/50 h-1 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${barColors}`} 
                              style={{ width: `${Math.max(5, (team.amount / maxVal) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    });
                  })()
                ) : (
                  <div className="py-8 text-center flex flex-col items-center justify-center">
                    <p className="text-[10px] font-bold text-slate-350 tracking-wider">No team earnings recorded</p>
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10px] font-medium text-slate-400 text-center mt-5">
              Real-time standing analytics
            </div>
          </div>

          {/* 4. Performance Card */}
          <PerformanceCard onLeaderboardClick={() => setShowLeaderboard(true)} />

        </div>

        {/* Bottom Sections: Grid Layout */}
        <div className="grid grid-cols-1 gap-6">
          
          {/* Row 1: Wallet, Rankings, Fines, Notification */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* My Wallet */}
            <MyWalletCard />

            {/* Mini Leaderboard */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/70 shadow-sm">
                  <Trophy size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Rankings</h2>
              </div>
              <MiniLeaderboard onViewFull={() => setShowLeaderboard(true)} />
            </div>

            {/* My Fines */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100/70 shadow-sm">
                  <AlertTriangle size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">My Fines</h2>
              </div>
              <MyFines noCard={true} />
            </div>

            {/* Latest Notification */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100/70 shadow-sm">
                  <Bell size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Latest Notification</h2>
              </div>
              {notifications.length > 0 ? (
                <div className="p-4 bg-teal-50/30 border border-teal-100/50 rounded-2xl flex-1">
                  <p className="text-sm text-slate-700 mb-2 font-medium">{notifications[0]?.messageData}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(notifications[0]?.createdAt).toLocaleString()}</p>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-400 text-center py-4">No notifications found</p>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Forms Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Submit Custom Task */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/70 shadow-sm">
                  <ClipboardList size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Submit Custom Task</h2>
              </div>
              <CustomTaskForm />
            </div>

            {/* Submit Task */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100/70 shadow-sm">
                  <CheckSquare size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Submit Task</h2>
              </div>
              <TaskForm topics={topics} columns={columns} onTaskSubmit={handleTaskSubmit} />
            </div>
          </div>

          {/* Row 3: Activity & Scoreboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Your Recent Activity */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100/70 shadow-sm">
                  <ClipboardCheck size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Your Recent Activity</h2>
              </div>
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No activity found.</p>
                ) : (
                  <>
                    {(showAllRecentTasks ? tasks : tasks.slice(0, 5)).map((task) => (
                      <div key={task._id} className="flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-100/60 rounded-2xl transition-all duration-200">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-extrabold text-teal-600 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-lg">+{task.points}</span>
                          <div>
                            <p className="text-xs font-bold text-slate-700">{task.topics?.[0]?.name || task.description || 'Task Submission'}</p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{new Date(task.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-100 shadow-sm">Verified</span>
                      </div>
                    ))}
                    {tasksSummary.totalCount > 5 && (
                      <div className="w-full text-xs font-bold text-slate-500 hover:text-teal-600 transition-colors py-2 text-center">
                        <Link to="/worker/tasks">View All {tasksSummary.totalCount} Tasks</Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Department Scoreboard */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/70 shadow-sm">
                  <ArrowUpCircle size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Department Scoreboard</h2>
              </div>
              <Scoreboard department={user.department} noCard={true} />
            </div>
          </div>

        </div>

        {/* Point History Section */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200/80">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/70 shadow-sm">
              <Trophy size={14} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Performance Activity</h2>
          </div>
          <PointHistory />
        </div>

      </div>

      {/* Bug Bounty Program Popup */}
      {createPortal(
        <AnimatePresence>
          {showBugBountyPopup && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleDismissBugBounty}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              {/* Modal Card */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 z-10"
              >
                {/* Header */}
                <div className="p-6 pb-4 flex justify-between items-start border-b border-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0d9488]">
                      <Shield size={20} className="stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                        Bug Bounty Program
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold tracking-wider mt-0.5">
                        Responsible Disclosure
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDismissBugBounty}
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Message */}
                <div className="p-6 py-5">
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">
                    {bugBountyData?.disclosureMessage || 'Visit to check the bug bounty to earn for each bug 1000'}
                  </p>
                </div>

                {/* Footer Buttons */}
                <div className="p-6 pt-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                  <button
                    onClick={handleDismissBugBounty}
                    className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-70 transition-colors"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={handleViewBugBountyDetails}
                    className="px-5 py-2 text-sm font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-xl shadow-md shadow-teal-600/10 hover:shadow-lg hover:shadow-teal-600/15 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    View Details
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Attendance Popups */}
      {showFaceAttendance && (
        <FaceAttendance
          subdomain={subdomain}
          isOpen={showFaceAttendance}
          onClose={() => setShowFaceAttendance(false)}
          workerMode={true}
          currentWorker={user}
          onAttendanceMarked={handleAttendanceMarked}
        />
      )}
      {showRFIDAttendance && (
        <RFIDAttendancePopup
          isOpen={showRFIDAttendance}
          onClose={() => setShowRFIDAttendance(false)}
          subdomain={subdomain}
          user={user}
          onAttendanceMarked={handleAttendanceMarked}
        />
      )}

      {/* Leaderboard Modal */}
      <LeaderboardModal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />

      {/* Floating Point Animation Layer */}
      <PointAnimation />
    </div>
  );
};

export default Dashboard;
