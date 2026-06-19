import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { FaChevronDown, FaChevronUp, FaSearch, FaBusinessTime } from 'react-icons/fa';
import { FiDollarSign } from 'react-icons/fi';
import { getAllLeaves, markLeavesAsViewedByAdmin, updateLeaveStatus } from '../../services/leaveService';
import appContext from '../../context/AppContext';
import { useSocket } from '../../context/SocketContextNew';
import Spinner from '../common/Spinner';
import Card from '../common/Card';

const LeaveManagement = () => {
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [showAllLeaves, setShowAllLeaves] = useState(false);
  const [activeView, setActiveView] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { subdomain } = useContext(appContext);
  const { socket } = useSocket();

  useEffect(() => {
    const fetchLeaves = async () => {
      try {
        const leavesData = await getAllLeaves({ subdomain });
        setLeaves(leavesData);
        setFilteredLeaves(leavesData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching leaves:', error);
        toast.error('Failed to load leave requests');
        setLoading(false);
      }
    };

    fetchLeaves();
  }, [subdomain]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, activeView, leaves]);

  useEffect(() => {
    if (!socket) return;

    const handleLeaveUpdated = (updatedLeave) => {
      if (!updatedLeave?._id) return;

      setLeaves(prevLeaves =>
        prevLeaves.map(leave =>
          leave._id === updatedLeave._id
            ? { ...leave, ...updatedLeave, worker: updatedLeave.worker || leave.worker }
            : leave
        )
      );

      if (updatedLeave.processedViaWhatsApp) {
        toast.info(`Leave ${updatedLeave.status.toLowerCase()} from WhatsApp`);
      }
    };

    socket.on('leave:updated', handleLeaveUpdated);

    return () => {
      socket.off('leave:updated', handleLeaveUpdated);
    };
  }, [socket]);

  const applyFilters = () => {
    let result = [...leaves];

    if (activeView !== 'all') {
      result = result.filter(leave => leave.status === activeView);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(leave =>
        leave.worker?.name.toLowerCase().includes(term) ||
        leave.leaveType.toLowerCase().includes(term)
      );
    }

    setFilteredLeaves(result);
  };

  const handleReview = async (leaveId, status, leaveData) => {
    setProcessing(prev => ({ ...prev, [leaveId]: true }));

    try {
      const updatedLeave = await updateLeaveStatus(leaveId, status, leaveData);
      setLeaves(leaves.map(leave =>
        leave._id === leaveId ? { ...leave, status, worker: updatedLeave.worker || leave.worker } : leave
      ));
      await markLeavesAsViewedByAdmin(leaveId);
      toast.success(`Leave ${status.toLowerCase()} successfully`);
    } catch (error) {
      toast.error(`Failed to ${status.toLowerCase()} leave`);
    } finally {
      setProcessing(prev => ({ ...prev, [leaveId]: false }));
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setActiveView('all');
  };

  // Format time for display (same as worker's page)
  const formatTime = (timeString) => {
    if (!timeString) return '';
    try {
      const [hours, minutes] = timeString.split(':');
      const time = new Date();
      time.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      return format(time, 'h:mm a');
    } catch (error) {
      return timeString;
    }
  };

  // Calculate permission duration in hours and minutes
  const calculatePermissionDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return '';

    try {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      const durationMinutes = endTotalMinutes - startTotalMinutes;

      if (durationMinutes <= 0) return '';

      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;

      if (hours > 0 && minutes > 0) {
        return `(${hours}h ${minutes}m)`;
      } else if (hours > 0) {
        return `(${hours}h)`;
      } else {
        return `(${minutes}m)`;
      }
    } catch (error) {
      return '';
    }
  };

  const LeaveItem = ({ leave }) => (
    <Card
      className={`mb-4 border-t-4 ${leave.status === 'Approved' ? 'border-green-500' : leave.status === 'Rejected' ? 'border-red-500' : 'border-yellow-500' } ${leave.leaveType === 'Permission' ? 'bg-blue-50' : '' }`}
    >
      <div className="flex justify-between">
        <div>
          <div className="flex items-center mb-1">
            {leave.leaveType === 'Permission' && (
              <FaBusinessTime className="mr-2 text-blue-500" size={16} />
            )}
            <p className="font-medium">{leave.worker?.name || 'Unknown Employee'}</p>
          </div>
          <p className="text-sm text-gray-500">
            {leave.leaveType} • {new Date(leave.createdAt).toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">
            From: {new Date(leave.startDate).toLocaleDateString()} - To: {new Date(leave.endDate).toLocaleDateString()}
          </p>
          {/* Enhanced time display for permissions */}
          {leave.leaveType === 'Permission' && leave.startTime && leave.endTime && (
            <p className="text-sm text-blue-600 font-medium">
              Time: {formatTime(leave.startTime)} - {formatTime(leave.endTime)}
              {calculatePermissionDuration(leave.startTime, leave.endTime) && (
                <span className="text-gray-500 ml-1">
                  {calculatePermissionDuration(leave.startTime, leave.endTime)}
                </span>
              )}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {leave.leaveType === 'Permission' ? (
              calculatePermissionDuration(leave.startTime, leave.endTime) ?
                `Duration: ${calculatePermissionDuration(leave.startTime, leave.endTime).replace(/[()]/g, '')}` :
                'Duration: Permission request'
            ) : (
              `Total days: ${leave.totalDays || 0}`
            )}
          </p>
          {leave.leaveType === 'Paid Leave' && (
            <div className="mt-2 flex flex-wrap gap-1">
              {/* <span className="bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full text-[10px] font-black border border-teal-100 tracking-tighter shadow-sm flex items-center">
                <FiDollarSign className="mr-0.5" /> SALARY: PAID (INDEPENDENT OF APPROVAL)
              </span> */}
            </div>
          )}
          {leave.leaveType !== 'Permission' && leave.leaveType !== 'Paid Leave' && leave.deductionFactor > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded text-[10px] font-bold border border-red-200 tracking-tighter shadow-sm flex items-center">
                <FiDollarSign className="mr-0.5" /> {leave.deductionFactor}X Deduction
              </span>
              {leave.penaltyReasons?.attendanceRule && (
                <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-[10px] font-medium border border-orange-100">
                  Attendance Penalty
                </span>
              )}
              {leave.penaltyReasons?.monthlyLimitRule && (
                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-100">
                  Limit Exceeded
                </span>
              )}
            </div>
          )}
        </div>
        <span
          className={`px-2 h-8 flex justify-center items-center rounded-full text-xs ${leave.status === 'Approved' ? 'bg-green-100 text-green-800' : leave.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800' }`}
        >
          {leave.status}
        </span>
      </div>

      <p className="mt-2 text-gray-500">Reason: {leave.reason}</p>

      {leave.status === 'Pending' && (
        <div className="mt-4 flex space-x-2">
          <button
            onClick={() => handleReview(leave._id, 'Approved', leave)}
            disabled={processing[leave._id]}
            className="px-3 py-1 bg-[#0d9488] text-white rounded hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488]"
          >
            Approve
          </button>
          <button
            onClick={() => handleReview(leave._id, 'Rejected')}
            disabled={processing[leave._id]}
            className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-white hover:text-gray-500 border-2 border-gray-500"
          >
            Reject
          </button>
        </div>
      )}
    </Card>
  );

  const displayLeaves = showAllLeaves ? filteredLeaves : filteredLeaves.slice(0, 5);

  const getTabClassName = (tabName) => {
    return `px-4 py-1.5 rounded-[10px] text-sm font-semibold cursor-pointer whitespace-nowrap transition-all shadow-sm border border-transparent ${activeView === tabName
      ? 'bg-teal-600 text-white border-teal-600'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
      }`;
  };

  return (
    <div className="max-w-[1600px] mx-auto pb-8">
      <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight mb-6 md:hidden px-2">Leave Management</h1>

      {loading ? (
        <Spinner size="md" variant="default" />
      ) : leaves.length === 0 ? (
        <p className="px-2 text-slate-500">No leave requests submitted yet.</p>
      ) : (
        <div>
          {/* Advanced Control Bar */}
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200/80 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-slate-400 w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search by employee name or leave type..."
                  className="pl-9 pr-4 py-2 w-full bg-slate-50/50 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-[10px] hover:bg-slate-200 transition-all whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 px-1">
            <h2 className="text-lg font-display font-bold text-slate-900">Leave List</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-bold bg-slate-100 px-2.5 py-1 rounded-md">
                Showing {displayLeaves.length} of {filteredLeaves.length}
              </span>
              {filteredLeaves.length > 5 && (
                <button
                  onClick={() => setShowAllLeaves(!showAllLeaves)}
                  className="text-teal-600 hover:text-teal-700 text-xs font-bold flex items-center bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100"
                >
                  {showAllLeaves ? (
                    <>Show Less <FaChevronUp className="ml-1" /></>
                  ) : (
                    <>Show All <FaChevronDown className="ml-1" /></>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar pb-1 px-1">
            <div
              className={getTabClassName('all')}
              onClick={() => setActiveView('all')}
            >
              All Leaves
            </div>
            <div
              className={getTabClassName('Pending')}
              onClick={() => setActiveView('Pending')}
            >
              Pending
            </div>
            <div
              className={getTabClassName('Approved')}
              onClick={() => setActiveView('Approved')}
            >
              Approved
            </div>
            <div
              className={getTabClassName('Rejected')}
              onClick={() => setActiveView('Rejected')}
            >
              Rejected
            </div>
          </div>

          {displayLeaves.length === 0 ? (
            <div className="bg-white p-4 rounded-lg text-center">
              <p>No {activeView !== 'all' ? activeView : ''} leaves found with the current filters.</p>
            </div>
          ) : (
            <>
              {displayLeaves.map(leave => (
                <LeaveItem key={leave._id} leave={leave} />
              ))}

              {!showAllLeaves && filteredLeaves.length > 5 && (
                <button
                  onClick={() => setShowAllLeaves(true)}
                  className="mt-4 w-full py-2 text-sm text-[#0d9488] hover:text-[#0d9488] border border-[#0d9488] rounded-full hover:bg-[#0d9488] hover:text-white"
                >
                  View All ({filteredLeaves.length}) Leaves
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveManagement;
