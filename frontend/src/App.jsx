import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';

// Public pages
const Home = lazy(() => import('./pages/Home'));
const AdminLogin = lazy(() => import('./pages/Admin/AdminLogin'));
const AdminRegister = lazy(() => import('./pages/Admin/AdminRegister'));
const WorkerLogin = lazy(() => import('./pages/Worker/WorkerLogin'));

// Protected pages
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const WorkerDashboard = lazy(() => import('./pages/Worker/WorkerDashboard'));

// Communication page
const Communication = lazy(() => import('./pages/Communication'));

// Management Pages
const WorkerManagement = lazy(() => import('./components/admin/WorkerManagement'));
const DepartmentManagement = lazy(() => import('./components/admin/DepartmentManagement'));
const ColumnManagement = lazy(() => import('./components/admin/ColumnManagement'));
const TaskManagement = lazy(() => import('./components/admin/TaskManagement'));
const LeaveManagement = lazy(() => import('./components/admin/LeaveManagement'));
const CommentManagement = lazy(() => import('./components/admin/CommentManagement'));
const TopicManagement = lazy(() => import('./components/admin/TopicManager'));
const FoodRequestManagement = lazy(() => import('./components/admin/FoodRequestManagement'));
const CustomTasks = lazy(() => import('./components/admin/CustomTasks'));
const AttendanceManagement = lazy(() => import('./components/admin/AttendanceManagement'));
const NotificationManagement = lazy(() => import('./components/admin/NotificationManagement'));
const SalaryManagement = lazy(() => import('./components/admin/SalaryManagement'));
const SalaryProjectManagement = lazy(() => import('./components/admin/SalaryProjectManagement'));
const GoWhatsIntegration = lazy(() => import('./components/admin/GoWhatsIntegration'));
const InternCertificate = lazy(() => import('./components/admin/InternCertificate'));
const OfferLetter = lazy(() => import('./components/admin/OfferLetter'));
const RenewalManagement = lazy(() => import('./components/admin/RenewalManagement'));

// Test Management Components
const GenerateQuestions = lazy(() => import('./components/admin/GenerateQuestions'));
const QuestionHistory = lazy(() => import('./components/admin/QuestionHistory'));
const EmployeeScores = lazy(() => import('./components/admin/EmployeeScores'));
const GlobalScoreboard = lazy(() => import('./components/admin/GlobalScoreboard'));
const QuickTest = lazy(() => import('./components/common/QuickTest'));

// Protected route component
import PrivateRoute from './components/common/PrivateRoute';

// Context
import appContext from './context/AppContext';
import { useEffect, useState } from 'react';
const WorkerAttendance = lazy(() => import('./components/admin/WorkerAttendance'));
const Settings = lazy(() => import('./components/admin/Settings'));
const AdminProfile = lazy(() => import('./components/admin/AdminProfile'));
import InstallPrompt from './components/common/InstallPrompt';

// NEW COMPONENTS
const ForgotPassword = lazy(() => import('./components/admin/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/admin/ResetPassword'));
const HolidayManagement = lazy(() => import('./components/admin/HolidayManagement'));
const AcceptanceLetter = lazy(() => import('./components/admin/AcceptanceLetter'));
import { SocketProvider } from './context/SocketContextNew';
import { NotificationProvider } from './context/NotificationContext';

// Loading Fallback
const MainLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-white">
    <div className="flex flex-col items-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      <p className="mt-4 text-gray-600 font-medium">Initializing CipherGate...</p>
    </div>
  </div>
);

function App() {
  // Initialize subdomain with the actual value from localStorage immediately
  const [subdomain, setSubdomain] = useState(() => {
    const stored = localStorage.getItem('tasktracker-subdomain');
    console.log('剥 DEBUG: Initial subdomain from localStorage:', stored);
    return stored || 'main'; // Default to 'main' instead of null
  });

  const getSubdomain = () => {
    return localStorage.getItem('tasktracker-subdomain') || 'main';
  };

  // Custom function to update subdomain and localStorage
  const updateSubdomain = (newSubdomain) => {
    console.log('剥 DEBUG: Updating subdomain to:', newSubdomain);
    if (newSubdomain && newSubdomain !== 'main') {
      localStorage.setItem('tasktracker-subdomain', newSubdomain);
    } else {
      localStorage.removeItem('tasktracker-subdomain');
    }
    setSubdomain(newSubdomain || 'main');
  };

  // Monitor localStorage changes and subdomain updates
  useEffect(() => {
    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e) => {
      if (e.key === 'tasktracker-subdomain') {
        const newValue = e.newValue || 'main';
        console.log('剥 DEBUG: Storage change detected:', newValue);
        setSubdomain(newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also check periodically for subdomain changes
    const interval = setInterval(() => {
      const current = getSubdomain();
      setSubdomain(prev => {
        if (prev !== current) {
          console.log('剥 DEBUG: Subdomain changed from', prev, 'to', current);
          return current;
        }
        return prev;
      });
    }, 2000); // Check every 2 seconds (reduced frequency)

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Log subdomain changes for debugging
  useEffect(() => {
    console.log('剥 DEBUG: App.jsx subdomain state changed to:', subdomain);
  }, [subdomain]);

  const contextValue = {
    subdomain,
    setSubdomain: updateSubdomain // Use our custom function
  };

  return (
    <appContext.Provider value={contextValue}>
      <SocketProvider>
        <NotificationProvider>
          {/* Updated with consistent theme colors */}
          <div className="App w-full overflow-x-hidden bg-[#FFF3F2]">


          <Suspense fallback={<MainLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Home />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/register" element={<AdminRegister />} />
              <Route path="/worker/login" element={<WorkerLogin />} />
              <Route path="/quick-test" element={<QuickTest />} />

              {/* NEW PASSWORD ROUTES */}
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />

              {/* Protected Admin routes with Layout */}
              <Route element={<PrivateRoute allowedRoles={['admin']} />}>
                <Route path="/admin/*" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="workers" element={<WorkerManagement />} />
                  <Route path="salary" element={<SalaryManagement />} />
                  <Route path="salary-projects" element={<SalaryProjectManagement />} />
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
                  <Route path="profile" element={<AdminProfile />} />
                  <Route path="gowhats" element={<GoWhatsIntegration />} />
                  <Route path="communication" element={<Communication />} />
                  <Route path="intern-certificate" element={<InternCertificate />} />
                  <Route path="offer-letter" element={<OfferLetter />} />
                  <Route path="acceptance-letter" element={<AcceptanceLetter />} />
                  <Route path="renewals" element={<RenewalManagement />} />

                  {/* Test Management Routes */}
                  <Route path="test/generate-questions" element={<GenerateQuestions />} />
                  <Route path="test/question-history" element={<QuestionHistory />} />
                  <Route path="test/employee-scores" element={<EmployeeScores />} />
                  <Route path="test/global-scoreboard" element={<GlobalScoreboard />} />

                  {/* Catch-all route for unknown admin paths */}
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Route>

              {/* Protected Worker routes */}
              <Route element={<PrivateRoute allowedRoles={['worker']} />}>
                <Route path="worker/*" element={<WorkerDashboard />}>
                  {/* Worker routes are handled inside WorkerDashboard component */}
                  <Route path="*" element={<Navigate to="/worker" replace />} />
                </Route>
              </Route>

              {/* 404 Not Found Route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          <InstallPrompt />
        </div>
        </NotificationProvider>
      </SocketProvider>
    </appContext.Provider>
  );
}

export default App;