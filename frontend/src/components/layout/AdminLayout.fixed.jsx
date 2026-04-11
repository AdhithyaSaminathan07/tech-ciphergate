import React, { useState, useEffect, useContext, Suspense } from 'react';
import { useNavigate, Outlet, Routes, Route, Navigate } from 'react-router-dom';
import {
  FaHome,
  FaUsers,
  FaBuilding,
  FaTasks,
  FaColumns,
  FaCalendarAlt,
  FaComments,
  FaTags,
  FaPizzaSlice,
  FaClipboardList,
  FaRegCalendarCheck,
  FaRegBell,
  FaDollarSign,
  FaQuestionCircle,
  FaHistory,
  FaTrophy,
  FaChartBar,
  FaAsterisk,
  FaWhatsapp,
  FaAward
} from 'react-icons/fa';
import { IoMdSettings } from 'react-icons/io';

import { useAuth } from '../../hooks/useAuth';
import { getAllLeaves } from '../../services/leaveService';
import { getAllComments } from '../../services/commentService';
import { getNewInvoiceCount } from '../../services/invoiceService';
import Sidebar from './Sidebar';
import QuestionGenerationTracker from '../admin/QuestionGenerationTracker';
import appContext from '../../context/AppContext';

// Import management components
import WorkerManagement from '../admin/WorkerManagement';
import DepartmentManagement from '../admin/DepartmentManagement';
import ColumnManagement from '../admin/ColumnManagement';
import TaskManagement from '../admin/TaskManagement';
import LeaveManagement from '../admin/LeaveManagement';
import CommentManagement from '../admin/CommentManagement';
import TopicManagement from '../admin/TopicManager';
import FoodRequestManagement from '../admin/FoodRequestManagement';
import CustomTasks from '../admin/CustomTasks';
import AttendanceManagement from '../admin/AttendanceManagement';
import NotificationManagement from '../admin/NotificationManagement';
import SalaryManagement from '../admin/SalaryManagement';
import GoWhatsIntegration from '../admin/GoWhatsIntegration';
import HolidayManagement from '../admin/HolidayManagement';
import Settings from '../admin/Settings';
import WorkerAttendance from '../admin/WorkerAttendance';
import InvoiceManagement from '../admin/InvoiceManagement'; 
import AdminDashboard from '../../pages/Admin/AdminDashboard'; 
import InternCertificate from '../admin/InternCertificate';

// Lazy load test management components
const GenerateQuestions = React.lazy(() => import('../admin/GenerateQuestions'));
const QuestionHistory = React.lazy(() => import('../admin/QuestionHistory'));
const EmployeeScores = React.lazy(() => import('../admin/EmployeeScores'));
const GlobalScoreboard = React.lazy(() => import('../admin/GlobalScoreboard'));

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [newComments, setNewComments] = useState(0);
  const [newInvoices, setNewInvoices] = useState(0);
  
  const [showGlobalTracker] = useState(false);
  
  const navigate = useNavigate();
  const { subdomain } = useContext(appContext);

  useEffect(() => {
    const fetchNotificationCounts = async () => {
      try {
        const leaves = await getAllLeaves({ subdomain }) || [];
        const unviewedLeaves = Array.isArray(leaves) ? leaves.filter(leave =>
          !leave.workerViewed &&
          (leave.status === 'Pending' || leave.status === 'Approved')
        ).length : 0;
        setPendingLeaves(unviewedLeaves);

        const comments = await getAllComments({ subdomain });
        const newUnreadComments = comments.filter(comment =>
          comment.isNew ||
          (comment.replies && comment.replies.some(reply => reply.isNew))
        ).length;
        setNewComments(newUnreadComments);

        const invoiceData = await getNewInvoiceCount();
        setNewInvoices(invoiceData.data?.count || 0);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotificationCounts();

    const intervalId = setInterval(fetchNotificationCounts, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  // NOTE: Removed hardcoded iconColors to allow Sidebar CSS to control active/inactive state colors
  // Icons now inherit text color from parent (White for inactive, Teal for active)

  const sidebarLinks = [
    {
      to: '/admin',
      icon: <FaHome />,
      label: 'Dashboard'
    },
    {
      to: '/admin/workers',
      icon: <FaUsers />,
      label: 'Employees'
    },
    {
      to: '/admin/salary',
      icon: <FaDollarSign />,
      label: 'Salary'
    },
    {
      to: '/admin/invoices',
      icon: <FaDollarSign />,
      label: 'Invoices',
      badge: newInvoices > 0 ? newInvoices : null
    },
    {
      to: '/admin/attendance',
      icon: <FaRegCalendarCheck />,
      label: 'Attendance'
    },
    {
      to: '/admin/departments',
      icon: <FaBuilding />,
      label: 'Departments'
    },

    {
      to: '/admin/food-requests',
      icon: <FaPizzaSlice />,
      label: 'Food Requests'
    },
    {
      label: 'Certificate',
      isDropdown: true,
      icon: <FaAward />,
      children: [
        {
          to: '/admin/intern-certificate',
          icon: <FaAward />,
          label: 'Intern Certificate'
        }
      ]
    },
    {
      to: '/admin/tasks',
      icon: <FaTasks />,
      label: 'Tasks'
    },
    {
      to: '/admin/columns',
      icon: <FaColumns />,
      label: 'columns'
    },
    {
      to: '/admin/topics',
      icon: <FaTags />,
      label: 'Topics'
    },
    {
      to: '/admin/custom-tasks',
      icon: <FaClipboardList />,
      label: 'Custom Tasks'
    },
    {
      to: '/admin/leaves',
      icon: <FaCalendarAlt />,
      label: 'Leave Requests',
      badge: pendingLeaves > 0 ? pendingLeaves : null
    },
    {
      to: '/admin/gowhats',
      icon: <FaWhatsapp />,
      label: 'GoWhats',
    },
    {
      to: '/admin/holidays',
      icon: <FaAsterisk />,
      label: 'Holidays'
    },
    {
      to: '/admin/notifications',
      icon: <FaRegBell />,
      label: 'Notifications',
      badge: newComments > 0 ? newComments : null
    },
    {
      to: '/admin/comments',
      icon: <FaComments />,
      label: 'Comments',
      badge: newComments > 0 ? newComments : null
    },
    
    // Test Management Dropdown Section
    {
      label: 'Test Management',
      isDropdown: true,
      icon: <FaQuestionCircle />,
      children: [
        {
          to: '/admin/test/generate-questions',
          icon: <FaQuestionCircle />,
          label: 'Generate Questions'
        },
        {
          to: '/admin/test/question-history',
          icon: <FaHistory />,
          label: 'Questions History'
        },
        {
          to: '/admin/test/employee-scores',
          icon: <FaChartBar />,
          label: 'Employee Scores'
        },
        {
          to: '/admin/test/global-scoreboard',
          icon: <FaTrophy />,
          label: 'Global Scoreboard'
        }
      ]
    },
    {
      to: '/admin/settings',
      icon: <IoMdSettings />,
      label: 'Settings',
    }
  ];

  return (
    <div className="flex h-screen bg-[#f3f4f6]">
      <Sidebar
        links={sidebarLinks}
        logoText="Admin Dashboard"
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 overflow-auto md:ml-64">
        <main className="p-4 md:p-6">
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="workers" element={<WorkerManagement />} />
            <Route path="salary" element={<SalaryManagement />} />
            <Route path="attendance" element={<AttendanceManagement />} />
            <Route path="attendance/:id" element={<WorkerAttendance />} />
            <Route path="departments" element={<DepartmentManagement />} />
            <Route path="columns" element={<ColumnManagement />} />
            <Route path="tasks" element={<TaskManagement />} />
            <Route path="leaves" element={<LeaveManagement />} />
            <Route path="holidays" element={<HolidayManagement />} />
            <Route path="comments" element={<CommentManagement />} />
            <Route path="topics" element={<TopicManagement />} />
            <Route path="food-requests" element={<FoodRequestManagement />} />
            <Route path="custom-tasks" element={<CustomTasks />} />
            <Route path="notifications" element={<NotificationManagement />} />
            <Route path="settings" element={<Settings />} />
            <Route path="gowhats" element={<GoWhatsIntegration />} />
            <Route path="invoices" element={<InvoiceManagement />} />
            <Route path="intern-certificate" element={<InternCertificate />} />
            
            {/* Test Management Routes */}
            <Route path="test/generate-questions" element={
              <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div></div>}>
                <GenerateQuestions />
              </Suspense>
            } />
            <Route path="test/question-history" element={
              <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div></div>}>
                <QuestionHistory />
              </Suspense>
            } />
            <Route path="test/employee-scores" element={
              <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div></div>}>
                <EmployeeScores />
              </Suspense>
            } />
            <Route path="test/global-scoreboard" element={
              <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div></div>}>
                <GlobalScoreboard />
              </Suspense>
            } />
            
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
      
      <QuestionGenerationTracker
        isVisible={showGlobalTracker}
        onClose={() => {}}
        generationData={null}
        isGenerating={false}
      />
    </div>
  );
};

export default AdminLayout;