import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../../components/admin/Dashboard';
import WorkerManagement from '../../components/admin/WorkerManagement';
import TaskManagement from '../../components/admin/TaskManagement';
import ColumnManagement from '../../components/admin/ColumnManagement';
import CommentManagement from '../../components/admin/CommentManagement';
import LeaveManagement from '../../components/admin/LeaveManagement';
import TopicManagement from '../../components/admin/TopicManager';
import DepartmentManagement from '../../components/admin/DepartmentManagement';
import FoodRequestManagement from '../../components/admin/FoodRequestManagement';
import CustomTasks from '../../components/admin/CustomTasks';
import SalaryManagement from '../../components/admin/SalaryManagement';
import HolidayManagement from '../../components/admin/HolidayManagement';
import FaceAttendancePage from '../../components/admin/FaceAttendancePage';
import FaceTest from '../../components/admin/FaceTest'; // Import FaceTest
import NotificationManagement from '../../components/admin/NotificationManagement'; // Import NotificationManagement
import WorkAllocation from '../../components/admin/WorkAllocation';
import KpiManagement from '../../components/admin/KpiManagement';
const AdminDashboard = () => {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="workers" element={<WorkerManagement />} />
      <Route path="salary" element={<SalaryManagement />} />
      <Route path="tasks" element={<TaskManagement />} />
      <Route path="topics" element={<TopicManagement />} />
      <Route path="columns" element={<ColumnManagement />} />
      <Route path="leaves" element={<LeaveManagement />} />
      <Route path="holidays" element={<HolidayManagement />} />
      <Route path="comments" element={<CommentManagement />} />
      <Route path="departments" element={<DepartmentManagement />} />
      <Route path="work-allocation" element={<WorkAllocation />} />
      <Route path="kpi-management" element={<KpiManagement />} />
      <Route path="food-requests" element={<FoodRequestManagement />} />
      <Route path="custom-tasks" element={<CustomTasks />} />
      <Route path="face-attendance" element={<FaceAttendancePage />} />
      <Route path="face-test" element={<FaceTest />} /> {/* Add FaceTest route */}
      <Route path="notifications" element={<NotificationManagement />} /> {/* Add NotificationManagement route */}
      {/* Redirect to dashboard for unknown routes */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
};

export default AdminDashboard;