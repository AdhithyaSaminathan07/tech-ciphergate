import { useState, useEffect, useContext, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import { getMyTasks } from '../../services/taskService';
import { getTopics } from '../../services/topicService';
import { getColumns } from '../../services/columnService';
import { getMySalaryReport } from '../../services/salaryService';
import TaskForm from './TaskForm';
import Scoreboard from './Scoreboard';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import CustomTaskForm from './CustomTaskForm';
import { readNotification } from '../../services/notificationService';
import appContext from '../../context/AppContext';
import { FaMoneyBillAlt, FaCamera, FaTasks, FaHistory, FaBell, FaExclamationTriangle, FaTrophy, FaChevronDown, FaChevronUp, FaWallet, FaArrowRight, FaCrown, FaMedal, FaArrowCircleUp, FaClipboardList, FaClipboardCheck } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import api from '../../services/api';
import FaceAttendance from '../admin/FaceAttendance';
import RFIDAttendancePopup from './RFIDAttendancePopup';
import MyFines from '../dashboard/MyFines';
import { Link, useNavigate } from 'react-router-dom';

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
        className="text-[11px] font-bold text-dash-green hover:opacity-80 flex items-center gap-1 flex-shrink-0 transition-opacity">
        {action} <FaArrowRight size={10} />
      </Link>
    )}
  </div>
);

const Dashboard = () => {
  const { subdomain } = useContext(appContext);
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [columns, setColumns] = useState([]);
  const [showAllRecentTasks, setShowAllRecentTasks] = useState(false);
  const [showFaceAttendance, setShowFaceAttendance] = useState(false);
  const [showRFIDAttendance, setShowRFIDAttendance] = useState(false);
  const [accessControl, setAccessControl] = useState({ rfidAttendance: true, faceAttendance: true });
  const [showDeductionBreakdown, setShowDeductionBreakdown] = useState(false);
  const [salaryData, setSalaryData] = useState({
    baseSalary: 0,
    finalSalary: 0,
    totalDeductions: 0,
    delayedTasks: [],
    report: null
  });
  const [topTeams, setTopTeams] = useState([]);

  const fetchSalary = async () => {
    try {
      const data = await getMySalaryReport();
      setSalaryData({
        baseSalary: data.baseSalary ?? 0,
        finalSalary: data.finalSalary ?? 0,
        totalDeductions: data.totalDeductions ?? 0,
        delayedTasks: data.delayedTasks ?? [],
        report: data.report ?? null
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
            const [tasksData, topicsData, columnsData] = await Promise.all([
              getMyTasks(),
              getTopics({ subdomain: user.subdomain }),
              getColumns({ subdomain: user.subdomain })
            ]);
            setTasks(tasksData);
            setTopics(topicsData.filter(topic => topic.department === 'all' || topic.department === user.department));
            setColumns(columnsData.filter(column => column.department === 'all' || column.department === user.department));
          })()
        ]);
      } catch (error) {
        toast.error('Failed to load dashboard data');
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

  const totalPoints = useMemo(() => tasks.reduce((acc, t) => acc + (t.points || 0), 0), [tasks]);

  const calculatedTaskPenalties = useMemo(() => {
    if (!salaryData.delayedTasks || salaryData.delayedTasks.length === 0 || !salaryData.report?.report) {
      return { taskPenalties: [], totalTaskPenalty: 0 };
    }

    const parseSalary = (str) => {
      if (!str) return 0;
      const cleaned = str.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    };

    const now = new Date();
    const reportYear = now.getFullYear();

    const claimedDays = new Set();
    let totalDeductionVal = 0;

    const taskPenalties = salaryData.delayedTasks.map(task => {
      const start = new Date(task.endDate);
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);

      const end = task.doneDate ? new Date(task.doneDate) : new Date();
      end.setHours(23, 59, 59, 999);

      let taskDeduction = 0;
      const dailyList = [];

      salaryData.report.report.forEach(day => {
        const dDate = new Date(`${day.date}, ${reportYear}`);
        if (dDate >= start && dDate <= end) {
          const amt = parseSalary(day.totalSalary);
          if (!claimedDays.has(day.date)) {
            claimedDays.add(day.date);
            totalDeductionVal += amt;
            taskDeduction += amt;
            dailyList.push({ date: day.date, amount: amt });
          } else {
            dailyList.push({ date: day.date, amount: 0, alreadyDeducted: true });
          }
        }
      });

      return {
        ...task,
        taskDeduction,
        dailyList,
        overdueWorkingDays: dailyList.length,
        period: `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → ${task.doneDate ? new Date(task.doneDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Ongoing'}`
      };
    });

    return { taskPenalties, totalTaskPenalty: totalDeductionVal };
  }, [salaryData.delayedTasks, salaryData.report]);

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
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-base md:text-lg font-semibold text-slate-900 tracking-tight">
              Welcome back, {user?.name || user?.username}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">
              <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse"></span>
              Live
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            You are in the <span className="font-medium text-slate-600">{user?.department}</span> department.
          </p>
        </div>

        {/* Top Grid: Attendance, Salary, Top Teams */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          
          {/* 1. Attendance Card */}
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Attendance</p>
              <div className="flex flex-col gap-3">
                {accessControl.faceAttendance && (
                  <button
                    onClick={() => setShowFaceAttendance(true)}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-white text-slate-700 flex items-center justify-center border border-slate-100 shadow-sm group-hover:text-teal-600 transition-colors">
                        <FaCamera size={12} />
                      </div>
                      <span className="text-sm font-medium text-slate-800">Face ID</span>
                    </div>
                    <FaArrowRight className="text-slate-300 group-hover:text-teal-600 transition-colors" size={10} />
                  </button>
                )}
                {accessControl.rfidAttendance && (
                  <button
                    onClick={() => setShowRFIDAttendance(true)}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-white text-slate-700 flex items-center justify-center border border-slate-100 shadow-sm group-hover:text-teal-600 transition-colors">
                        <FaHistory size={12} />
                      </div>
                      <span className="text-sm font-medium text-slate-800">RFID Tap</span>
                    </div>
                    <FaArrowRight className="text-slate-300 group-hover:text-teal-600 transition-colors" size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Salary Card */}
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Salary - Current Month</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Base Salary</span>
                  <span className="text-sm font-semibold text-slate-800">₹{salaryData.baseSalary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Final Payout</span>
                  <span className="text-sm font-bold text-teal-600">₹{salaryData.finalSalary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                  <span className="text-sm text-slate-600">Deductions</span>
                  <span className="text-sm font-semibold text-rose-600">₹{salaryData.totalDeductions.toLocaleString('en-IN')}</span>
                </div>

                {/* Breakdown Toggle */}
                {calculatedTaskPenalties.taskPenalties.length > 0 && (
                  <button
                    onClick={() => setShowDeductionBreakdown(!showDeductionBreakdown)}
                    className="text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors flex items-center gap-1 mt-2"
                  >
                    {showDeductionBreakdown ? 'Hide Breakdown' : 'View Breakdown'}
                    <FaChevronDown className={`transition-transform ${showDeductionBreakdown ? 'rotate-180' : ''}`} size={10} />
                  </button>
                )}

                {/* Breakdown Content */}
                <AnimatePresence>
                  {showDeductionBreakdown && calculatedTaskPenalties.taskPenalties.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 mt-2">
                        {calculatedTaskPenalties.taskPenalties.map((task, index) => (
                          <div key={index} className="p-2 bg-slate-50 rounded-lg text-xs">
                            <div className="flex justify-between mb-1">
                              <span className="font-semibold text-slate-700 truncate max-w-[70%]">{task.title}</span>
                              <span className="font-semibold text-rose-600">₹{task.taskDeduction.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-slate-500">
                              <span>{task.period}</span>
                              <span>{task.overdueWorkingDays} days overdue</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* 3. Top Teams Card */}
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Top Teams</p>
              <div className="space-y-3">
                {topTeams && topTeams.length > 0 ? (
                  topTeams.slice(0, 3).map((team, index) => (
                    <div key={index} className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${
                      index === 0 ? 'bg-amber-50/50 border border-amber-100' :
                      index === 1 ? 'bg-slate-50/50 border border-slate-200' :
                      index === 2 ? 'bg-orange-50/50 border border-orange-100' :
                      'bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 flex items-center justify-center">
                          {index === 0 ? (
                            <FaCrown className="text-amber-500" size={14} />
                          ) : index === 1 ? (
                            <FaMedal className="text-slate-400" size={14} />
                          ) : index === 2 ? (
                            <FaMedal className="text-orange-400" size={14} />
                          ) : (
                            <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-slate-700 truncate max-w-[120px]">{team.name}</span>
                      </div>
                      <span className={`text-sm font-bold ${
                        index === 0 ? 'text-amber-600' :
                        index === 1 ? 'text-slate-600' :
                        index === 2 ? 'text-orange-600' :
                        'text-slate-800'
                      }`}>₹{team.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center flex-1 flex flex-col items-center justify-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Sections: Grid Layout */}
        <div className="grid grid-cols-1 gap-6">
          
          {/* Row 1: Notification & Fines */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latest Notification */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaBell size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Latest Notification</h2>
              </div>
              {notifications.length > 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-700 mb-2">{notifications[0]?.messageData}</p>
                  <p className="text-xs text-slate-400 font-medium">{new Date(notifications[0]?.createdAt).toLocaleString()}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No notifications found</p>
              )}
            </div>

            {/* My Fines */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaExclamationTriangle size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">My Fines</h2>
              </div>
              <MyFines noCard={true} />
            </div>
          </div>

          {/* Row 2: Forms Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Submit Custom Task */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaClipboardList size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Submit Custom Task</h2>
              </div>
              <CustomTaskForm />
            </div>

            {/* Submit Task */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaTasks size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Submit Task</h2>
              </div>
              <TaskForm topics={topics} columns={columns} onTaskSubmit={handleTaskSubmit} />
            </div>
          </div>

          {/* Row 3: Activity & Scoreboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Your Recent Activity */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaClipboardCheck size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Your Recent Activity</h2>
              </div>
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No activity found.</p>
                ) : (
                  <>
                    {(showAllRecentTasks ? tasks : tasks.slice(0, 5)).map((task) => (
                      <div key={task._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-teal-600">+{task.points}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{task.topics?.[0]?.name || task.description || 'Task Submission'}</p>
                            <p className="text-xs text-slate-400">{new Date(task.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">Verified</span>
                      </div>
                    ))}
                    {tasks.length > 5 && (
                      <button
                        onClick={() => setShowAllRecentTasks(!showAllRecentTasks)}
                        className="w-full text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors py-2"
                      >
                        {showAllRecentTasks ? 'Show Less' : `View All ${tasks.length} Tasks`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Department Scoreboard */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100">
                  <FaArrowCircleUp size={14} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Department Scoreboard</h2>
              </div>
              <Scoreboard department={user.department} noCard={true} />
            </div>
          </div>

        </div>

      </div>

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
    </div>
  );
};

export default Dashboard;