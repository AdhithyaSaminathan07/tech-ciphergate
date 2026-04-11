import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaUsers, FaTasks, FaUtensils, FaCalendarAlt, FaComments, FaArrowRight, FaEllipsisV, FaBuilding } from 'react-icons/fa';
import { getWorkers } from '../../services/workerService';
import { getAllTasks } from '../../services/taskService';
import { getAllLeaves } from '../../services/leaveService';
import { getAllComments } from '../../services/commentService';
import { getTopics } from '../../services/topicService';
import { getColumns } from '../../services/columnService';
import { getMealsSummary } from '../../services/foodRequestService';
import { getDepartments } from '../../services/departmentService';
import { getAttendanceSummary } from '../../services/attendanceService'; // Added import
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

// Circular Progress Component
const CircularProgress = ({ percentage, size = 120, strokeWidth = 8, color = '#0d9488', showLabel = true }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
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
          <span className="text-2xl font-bold" style={{ color }}>
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    workers: 0,
    tasks: 0,
    topics: 0,
    columns: 0,
    foodRequests: 0,
    leaves: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    },
    comments: {
      total: 0,
      unread: 0,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState([]); // Changed from topWorkers to departments
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [attendancePercentage, setAttendancePercentage] = useState(0); // Added state
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
        getAttendanceSummary({ subdomain })
      ]);

      const workersData = results[0].status === 'fulfilled' ? results[0].value : [];
      const tasksData = results[1].status === 'fulfilled' ? results[1].value : [];
      const topicsData = results[2].status === 'fulfilled' ? results[2].value : [];
      const columnsData = results[3].status === 'fulfilled' ? results[3].value : [];
      const leavesData = results[4].status === 'fulfilled' ? results[4].value : [];
      const commentsData = results[5].status === 'fulfilled' ? results[5].value : [];
      const mealsSummary = results[6].status === 'fulfilled' ? results[6].value : { total: 0 };
      const departmentsDataRaw = results[7].status === 'fulfilled' ? results[7].value : [];
      const attendanceSummaryData = results[8].status === 'fulfilled' ? results[8].value : { percentage: 0 };

      // Ensure array type safety
      const departmentsDataSafe = Array.isArray(departmentsDataRaw) ? departmentsDataRaw : [];



      const pendingLeaves = leavesData.filter(leave => leave.status === 'Pending');
      const approvedLeaves = leavesData.filter(leave => leave.status === 'Approved');
      const rejectedLeaves = leavesData.filter(leave => leave.status === 'Rejected');
      const unreadComments = commentsData.filter(comment =>
        comment.isNew || comment.replies?.some(reply => reply.isNew)
      );

      console.log('Workers Data Raw:', workersData);
      const activeWorkers = workersData.filter(w => w.status !== 'Relieved');
      console.log('Active Workers Count:', activeWorkers.length);

      setStats({
        workers: activeWorkers.length, // Filter for active workers
        tasks: tasksData.length,
        topics: topicsData.length,
        columns: columnsData.length,
        foodRequests: mealsSummary.total,
        leaves: {
          total: leavesData.length,
          pending: pendingLeaves.length,
          approved: approvedLeaves.length,
          rejected: rejectedLeaves.length,
        },
        comments: {
          total: commentsData.length,
          unread: unreadComments.length,
        },
      });

      // Set pending leaves for display
      setPendingLeaves(pendingLeaves.slice(0, 3));

      // Set departments data
      // Set departments data
      setDepartments(departmentsDataSafe);

      // Set attendance percentage
      setAttendancePercentage(attendanceSummaryData?.percentage || 0);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [subdomain])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#f3f4f6]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Helper function to get color based on percentage
  const getColorForPercentage = (percentage) => {
    if (percentage >= 90) return '#10b981'; // green
    if (percentage >= 50) return '#f59e0b'; // yellow/orange
    return '#ef4444'; // red
  };

  // Helper component for Stat Cards
  const StatCard = ({ title, value, icon: Icon, colorClass, link }) => (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-gray-500 text-sm font-medium mb-2">{title}</h3>
          <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
        <div className={`p-3 rounded-2xl ${colorClass} bg-opacity-10`}>
          <Icon className={`text-xl ${colorClass.replace('bg-', 'text-')}`} />
        </div>
      </div>
      {link && (
        <Link to={link} className="flex items-center text-xs font-semibold text-gray-400 mt-4 hover:text-[#0d9488]">
          View details <FaArrowRight className="ml-1 text-[10px]" />
        </Link>
      )}
    </div>
  );

  return (
    <div className="bg-[#f3f4f6] min-h-screen p-2">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">My Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Overview of your administration</p>
        </div>
      </div>

      {/* Stats Grid - Clean Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Employees"
          value={stats.workers}
          icon={FaUsers}
          colorClass="bg-blue-500"
          link="/admin/workers"
        />
        <StatCard
          title="Active Tasks"
          value={stats.tasks}
          icon={FaTasks}
          colorClass="bg-green-500"
          link="/admin/tasks"
        />
        <StatCard
          title="Topics"
          value={stats.topics}
          icon={FaTasks}
          colorClass="bg-purple-500"
          link="/admin/topics"
        />
        <StatCard
          title="Food Requests"
          value={stats.foodRequests}
          icon={FaUtensils}
          colorClass="bg-orange-400"
          link="/admin/food-requests"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area - Departments Section */}
        <div className="lg:col-span-2">
          {/* Attendance Percentage Section */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Overall Attendance</h2>
                <p className="text-gray-500 text-sm">Today's attendance overview</p>
              </div>
              <div>
                <CircularProgress
                  percentage={attendancePercentage}
                  size={100}
                  strokeWidth={8}
                  color={getColorForPercentage(attendancePercentage)}
                />
              </div>
            </div>
          </div>

          {/* Departments Section */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Departments</h2>
            </div>

            <div className="overflow-x-auto">
              {departments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {departments.map((department) => (
                    <div
                      key={department._id}
                      className="border border-gray-200 rounded-xl p-4"
                    >
                      <div className="flex items-center">
                        <div className="bg-blue-100 p-3 rounded-lg mr-4">
                          <FaBuilding className="text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800 mb-1">{department.name}</h3>
                          <p className="text-sm text-gray-500">
                            {department.workerCount || 0} Employee{(department.workerCount || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="ml-4">
                          <CircularProgress
                            percentage={department.attendancePercentage || 0}
                            size={70}
                            strokeWidth={6}
                            color={getColorForPercentage(department.attendancePercentage || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  No departments found.
                </div>
              )}
            </div>
          </div>

          {/* Secondary Stats (Leaves) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-gray-500 text-sm font-medium">Pending Leaves</h4>
                <h2 className="text-3xl font-bold text-gray-800 mt-2">{stats.leaves.pending}</h2>
              </div>
              <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                <FaCalendarAlt />
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-gray-500 text-sm font-medium">Approved Leaves</h4>
                <h2 className="text-3xl font-bold text-gray-800 mt-2">{stats.leaves.approved}</h2>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                <FaCalendarAlt />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column / Promo Card Style */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-[#80d8d0] to-[#0d9488] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg h-full min-h-[300px] flex flex-col justify-between">
            {/* Decoratiive circles */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-10 rounded-full -ml-10 -mb-10"></div>

            <div className="relative z-10">
              <h2 className="text-2xl font-bold mb-2">Needs Attention!</h2>
              <p className="text-teal-50 text-sm mb-6 opacity-90">
                You have pending items requiring your approval.
              </p>

              <div className="space-y-4">
                {stats.leaves.pending > 0 && (
                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <p className="text-sm font-medium mb-2 text-gray-800">Leave Requests</p>
                    <p className="text-xs text-gray-600 mb-2">{stats.leaves.pending} pending</p>

                    {/* Display pending leave requests */}
                    {pendingLeaves.map((leave) => (
                      <div key={leave._id} className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs font-medium truncate text-gray-800">{leave.worker?.name || 'Unknown Employee'}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                        </p>
                      </div>
                    ))}

                    {stats.leaves.pending > 3 && (
                      <p className="text-xs text-gray-600 mt-1">+{stats.leaves.pending - 3} more</p>
                    )}
                  </div>
                )}

                {stats.comments.unread > 0 && (
                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <p className="text-sm font-medium text-gray-800">Unread Comments</p>
                    <p className="text-xs text-gray-600">{stats.comments.unread} new</p>
                  </div>
                )}

                {stats.leaves.pending === 0 && stats.comments.unread === 0 && (
                  <div className="bg-white p-3 rounded-xl border border-gray-200 flex items-center">
                    <span className="text-xl mr-2">🎉</span>
                    <p className="text-sm text-gray-800">All caught up!</p>
                  </div>
                )}
              </div>
            </div>

            <Link
              to="/admin/leaves"
              className="relative z-10 mt-8 w-full bg-white text-[#0d9488] py-3 rounded-xl font-bold text-center hover:bg-teal-50 transition-colors shadow-md"
            >
              Check Approvals
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;