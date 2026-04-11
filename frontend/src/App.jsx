import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';

// Public pages
import Home from './pages/Home';
import AdminLogin from './pages/Admin/AdminLogin';
import AdminRegister from './pages/Admin/AdminRegister';
import WorkerLogin from './pages/Worker/WorkerLogin';

// Protected pages
import AdminDashboard from './pages/Admin/AdminDashboard';
import WorkerDashboard from './pages/Worker/WorkerDashboard';

// Communication page
import Communication from './pages/Communication';

// Management Pages
import WorkerManagement from './components/admin/WorkerManagement';
import DepartmentManagement from './components/admin/DepartmentManagement';
import ColumnManagement from './components/admin/ColumnManagement';
import TaskManagement from './components/admin/TaskManagement';
import LeaveManagement from './components/admin/LeaveManagement';
import CommentManagement from './components/admin/CommentManagement';
import TopicManagement from './components/admin/TopicManager';
import FoodRequestManagement from './components/admin/FoodRequestManagement';
import CustomTasks from './components/admin/CustomTasks';
import AttendanceManagement from './components/admin/AttendanceManagement';
import NotificationManagement from './components/admin/NotificationManagement';
import SalaryManagement from './components/admin/SalaryManagement';
import GoWhatsIntegration from './components/admin/GoWhatsIntegration';
import InternCertificate from './components/admin/InternCertificate';
import OfferLetter from './components/admin/OfferLetter';

// Test Management Components - Lazy loaded to prevent initialization in worker sessions
const GenerateQuestions = lazy(() => import('./components/admin/GenerateQuestions'));
const QuestionHistory = lazy(() => import('./components/admin/QuestionHistory'));
const EmployeeScores = lazy(() => import('./components/admin/EmployeeScores'));
const GlobalScoreboard = lazy(() => import('./components/admin/GlobalScoreboard'));
import QuickTest from './components/common/QuickTest';

// Protected route component
import PrivateRoute from './components/common/PrivateRoute';

// Context
import appContext from './context/AppContext';
import { useEffect, useState } from 'react';
import WorkerAttendance from './components/admin/WorkerAttendance';
import Settings from './components/admin/Settings';
import InstallPrompt from './components/common/InstallPrompt';

// NEW COMPONENTS

import ForgotPassword from './components/admin/ForgotPassword';
import ResetPassword from './components/admin/ResetPassword';
import HolidayManagement from './components/admin/HolidayManagement';
import AcceptanceLetter from './components/admin/AcceptanceLetter';

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
      {/* Updated with consistent theme colors */}
      <div className="App w-full overflow-x-hidden bg-[#FFF3F2]">
        {/* Debug info - remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            background: '#000',
            color: '#fff',
            padding: '5px',
            fontSize: '12px',
            zIndex: 9999
          }}>
            Company Name: {subdomain || 'null'}
          </div>
        )}

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

          {/* Test Animation Route */}

          {/* Protected Admin routes with Layout */}
          <Route element={<PrivateRoute allowedRoles={['admin']} />}>
            <Route path="/admin/*" element={<AdminLayout />}>
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
              <Route path="communication" element={<Communication />} />
              <Route path="intern-certificate" element={<InternCertificate />} />
              <Route path="offer-letter" element={<OfferLetter />} />
              <Route path="acceptance-letter" element={<AcceptanceLetter />} />

              {/* Test Management Routes - Wrapped with Suspense for lazy loading */}
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

        <InstallPrompt />
      </div>
    </appContext.Provider>
  );
}

export default App;