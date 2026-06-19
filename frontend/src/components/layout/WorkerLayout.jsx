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
  FaCommentDots,
  FaTasks,
  FaTrophy
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { getMyLeaves } from '../../services/leaveService';
import {
  getMyComments,
  getUnreadAdminReplies
} from '../../services/commentService';
import Sidebar from './Sidebar';
import appContext from '../../context/AppContext';
import Header from './Header';
import BottomNavigation from './BottomNavigation';

const WorkerLayout = ({ children, isTestInProgress }) => {
  const { user, logout } = useAuth();
  const [newComments, setNewComments] = useState(0);
  const [leaveUpdates, setLeaveUpdates] = useState(0);
  const navigate = useNavigate();
  const { subdomain } = useContext(appContext);

  useEffect(() => {
    const fetchNotificationCounts = async () => {
      try {
        if (!subdomain || subdomain == 'main') {
          return;
        }
        const leaves = await getMyLeaves({ subdomain });
        const unviewedLeaves = leaves.filter(leave =>
          !leave.workerViewed &&
          (leave.status === 'Pending' || leave.status === 'Approved')
        ).length;
        setLeaveUpdates(unviewedLeaves);

        const comments = await getMyComments();
        const unreadAdminReplies = await getUnreadAdminReplies();

        const newUnreadComments = comments.filter(comment =>
          comment.isNew ||
          (comment.replies && comment.replies.some(reply => reply.isNew))
        ).length;
        setNewComments(newUnreadComments + unreadAdminReplies.length);
      } catch (error) {
        console.error('Failed to fetch notifications:', error.message || error);
      }
    };
    fetchNotificationCounts();
    const intervalId = setInterval(fetchNotificationCounts, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [subdomain]);

  const handleLogout = () => {
    logout();
    navigate('/worker/login');
  };

  const sidebarLinks = [
    { to: '/worker', icon: <FaHome />, label: 'Dashboard' },
    {
      label: 'Attendance',
      icon: <FaRegCalendarCheck />,
      isDropdown: true,
      children: [
        { to: '/worker/attendance', label: 'Attendance Report' },
        { to: '/worker/leave-apply', label: 'Apply for Leave' },
        { to: '/worker/leave-requests', label: 'Leave Requests', badge: leaveUpdates > 0 ? leaveUpdates : null },
      ]
    },
    {
      label: 'Operations',
      icon: <FaTasks />,
      isDropdown: true,
      children: [
        { to: '/worker/work-allocation', label: 'Work Allocation' },
        { to: '/worker/invoices', label: 'Invoices' },
        { to: '/worker/performance', label: 'My Performance', icon: <FaTrophy /> },
      ]
    },
    {
      label: 'Communication',
      icon: <FaComments />,
      isDropdown: true,
      children: [
        { to: '/worker/comments', label: 'Comments', badge: newComments > 0 ? newComments : null },
        { to: '/worker/communication', label: 'Communication' },
        { to: '/worker/food-request', label: 'Food Request' },
      ]
    },
    {
      label: 'Training',
      icon: <FaGraduationCap />,
      isDropdown: true,
      children: [
        { to: '/worker/tests', label: 'My Test' },
        { to: '/worker/daily-topics', label: 'Daily Topics' },
      ]
    },
    {
      to: '/worker/rules',
      label: 'Rules & Regulations',
      icon: <FaBook />,
    },
  ];

  const bottomNavItems = [
    { to: '/worker', icon: <FaHome />, label: 'Home' },
    { to: '/worker/work-allocation', icon: <FaTasks />, label: 'Work' },
    { to: '/worker/leave-requests', icon: <FaCalendarCheck />, label: 'Leave', badgeKey: 'leaves' },
    { to: '/worker/attendance', icon: <FaRegCalendarCheck />, label: 'Reports' },
    { to: '/worker/tests', icon: <FaGraduationCap />, label: 'Training' },
  ];

  const bottomNavPaths = bottomNavItems.map(item => item.to);

  const allLinks = sidebarLinks.reduce((acc, link) => {
    if (link.isDropdown && link.children) {
      const mappedChildren = link.children
        .filter(child => !child.isSubHeader)
        .map(child => ({
          ...child,
          icon: child.icon || link.icon
        }));
      return [...acc, ...mappedChildren];
    }
    if (!link.isHeader && !link.isDropdown) {
      return [...acc, link];
    }
    return acc;
  }, []);

  const menuLinks = allLinks.filter(link => !bottomNavPaths.includes(link.to));

  return (
    <div className="flex h-screen bg-[#f8fafc] w-full overflow-hidden">
      {!isTestInProgress && (
        <div className="hidden md:block">
          <Sidebar
            links={sidebarLinks}
            logoText="Employee Dashboard"
            user={{
              ...user,
              displayName: `${user.name} (${user.department})`
            }}
            onLogout={handleLogout}
            isAdmin={false}
          />
        </div>
      )}

      <div className="flex-1 w-full flex flex-col h-screen overflow-hidden relative">
        {!isTestInProgress && (
          <Header 
            user={{ ...user, displayName: `${user.name} (${user.department})` }} 
            menuLinks={menuLinks} 
            onLogout={handleLogout}
            isAdmin={false}
            onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}
        <main className={isTestInProgress ? "flex-1 w-full h-full overflow-x-hidden overflow-y-auto" : "flex-1 p-1 sm:p-4 md:p-6 pb-24 md:pb-6 overflow-x-hidden overflow-y-auto custom-main-scroll"}>
          {children}
        </main>
        {!isTestInProgress && (
          <BottomNavigation navItems={bottomNavItems} badges={{ comments: newComments, leaves: leaveUpdates }} />
        )}
      </div>
    </div>
  );
};

export default WorkerLayout;