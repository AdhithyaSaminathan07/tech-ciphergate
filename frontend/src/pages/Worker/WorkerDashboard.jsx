import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WorkerLayout from '../../components/layout/WorkerLayout';

// Lazy load worker components
const Dashboard = lazy(() => import('../../components/worker/Dashboard'));
const LeaveApplication = lazy(() => import('../../components/worker/ApplyForLeave'));
const LeaveRequests = lazy(() => import('../../components/worker/LeaveRequests'));
const Comments = lazy(() => import('../../components/worker/Comments'));
const FoodRequest = lazy(() => import('../../components/worker/FoodRequest'));
const AttendanceReport = lazy(() => import('../../components/worker/AttendanceReport'));
const Notifications = lazy(() => import('../../components/worker/Notifications'));
const WorkerTest = lazy(() => import('../../components/worker/WorkerTest'));
const DailyTopics = lazy(() => import('../../components/worker/DailyTopics'));
const FaceAttendancePage = lazy(() => import('../../components/worker/FaceAttendancePage'));
const RFIDAttendance = lazy(() => import('../../components/worker/RFIDAttendance'));
const WorkerInvoiceManagement = lazy(() => import('../../components/worker/WorkerInvoiceManagement'));
const Communication = lazy(() => import('../../pages/Communication'));
const WorkerWorkAllocation = lazy(() => import('../../components/worker/WorkerWorkAllocation'));
const Profile = lazy(() => import('../../components/worker/Profile'));

// Simple loader for worker dashboard
const WorkerPageLoader = () => (
  <div className="flex justify-center items-center h-64">
    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
  </div>
);

const WorkerDashboard = () => {
  // State to track if a test is in progress
  const [isTestInProgress, setIsTestInProgress] = useState(false);

  // Handler to update test state
  const handleTestStateChange = (inProgress) => {
    setIsTestInProgress(inProgress);
  };

  return (
    <WorkerLayout isTestInProgress={isTestInProgress}>
      <Suspense fallback={<WorkerPageLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/attendance" element={<AttendanceReport />} />
          <Route path="/daily-topics" element={<DailyTopics />} />
          <Route path="/tests" element={<WorkerTest onTestStateChange={handleTestStateChange} />} />
          <Route path="/leave-apply" element={<LeaveApplication />} />
          <Route path="/leave-requests" element={<LeaveRequests />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/food-request" element={<FoodRequest />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/face-attendance" element={<FaceAttendancePage />} />
          <Route path="/rfid-attendance" element={<RFIDAttendance />} />
          <Route path="/invoices" element={<WorkerInvoiceManagement />} />
          <Route path="communication" element={<Communication />} />
          <Route path="/work-allocation" element={<WorkerWorkAllocation />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="*" element={<Navigate to="/worker" replace />} />
        </Routes>
      </Suspense>
    </WorkerLayout>
  );
};

export default WorkerDashboard;