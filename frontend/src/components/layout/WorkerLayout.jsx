import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  FaHome,
  FaCalendarPlus,
  FaCalendarCheck,
  FaComments,
  FaPizzaSlice,
  FaRegCalendarCheck,
  FaRegBell,
  FaClipboardList,
  FaBook,
  FaGraduationCap,
  FaCommentDots
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { getMyLeaves } from '../../services/leaveService';
import {
  getMyComments,
  getUnreadAdminReplies
} from '../../services/commentService';
import Sidebar from './Sidebar';
import appContext from '../../context/AppContext';

const WorkerLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const [newComments, setNewComments] = useState(0);
  const [leaveUpdates, setLeaveUpdates] = useState(0);
  const navigate = useNavigate();
  const { subdomain } = useContext(appContext);

  // Check for new comments and leave updates
  useEffect(() => {
    const fetchNotificationCounts = async () => {
      try {
        if (!subdomain || subdomain == 'main') {
          return;
        }

        // Fetch leaves
        const leaves = await getMyLeaves({ subdomain });
        const unviewedLeaves = leaves.filter(leave =>
          !leave.workerViewed &&
          (leave.status === 'Pending' || leave.status === 'Approved')
        ).length;
        setLeaveUpdates(unviewedLeaves);

        // Fetch comments
        const comments = await getMyComments();
        const unreadAdminReplies = await getUnreadAdminReplies();

        const newUnreadComments = comments.filter(comment =>
          comment.isNew ||
          (comment.replies && comment.replies.some(reply => reply.isNew))
        ).length;

        // Add unread admin replies to notification count
        setNewComments(newUnreadComments + unreadAdminReplies.length);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    // Fetch immediately on mount
    fetchNotificationCounts();

    // Set up periodic refresh (every 5 minutes)
    const intervalId = setInterval(fetchNotificationCounts, 5 * 60 * 1000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/worker/login');
  };

  const sidebarLinks = [
    {
      to: '/worker',
      icon: <FaHome />,
      label: 'Dashboard'
    },
    {
      to: '/worker/attendance',
      icon: <FaRegCalendarCheck />,
      label: 'Attendance Report'
    },
    {
      isDropdown: true,
      icon: <FaGraduationCap />,
      label: 'Test',
      children: [
        {
          to: '/worker/tests',
          icon: <FaClipboardList />,
          label: 'My Test'
        },
        {
          to: '/worker/daily-topics',
          icon: <FaBook />,
          label: 'Daily Topics'
        }
      ]
    },
    {
      to: '/worker/food-request',
      icon: <FaPizzaSlice />,
      label: 'Food Request'
    },
    {
      to: '/worker/leave-apply',
      icon: <FaCalendarPlus />,
      label: 'Apply for Leave'
    },
    {
      to: '/worker/leave-requests',
      icon: <FaCalendarCheck />,
      label: 'Leave Requests',
      badge: leaveUpdates > 0 ? leaveUpdates : null
    },
    {
      to: '/worker/notifications',
      icon: <FaRegBell />,
      label: 'Notifications',
      badge: newComments > 0 ? newComments : null
    },
    {
      to: '/worker/comments',
      icon: <FaComments />,
      label: 'Comments',
      badge: newComments > 0 ? newComments : null
    },
    {
      to: '/worker/communication',
      icon: <FaCommentDots />,
      label: 'Communication'
    },
    {
      to: '/worker/invoices',
      icon: <FaClipboardList />,
      label: 'Invoices'
    }
  ];

  return (
    // Added w-full overflow-x-hidden to prevent horizontal scrolling
    <div className="flex bg-gray-100 w-full overflow-x-hidden">
      <Sidebar
        links={sidebarLinks}
        logoText="Employee Dashboard"
        user={{
          ...user,
          displayName: `${user.name} (${user.department})` // Show name and department
        }}
        onLogout={handleLogout}
      />

      {/* Main content area - adjusted for sidebar */}
      <div className="flex-1 md:ml-64 w-full overflow-x-hidden"> 
        <main className="p-4 md:p-6 min-h-screen w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default WorkerLayout;