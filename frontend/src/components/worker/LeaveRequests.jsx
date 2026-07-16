import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { format, isWithinInterval, startOfMonth, endOfMonth, parseISO, isFuture } from 'date-fns';
import { getMyLeaves, markLeaveAsViewed } from '../../services/leaveService';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import Button from '../common/Button';
import appContext from '../../context/AppContext';
import { FaCalendarAlt, FaFilter, FaTimes, FaCheck, FaClock, FaTimesCircle } from 'react-icons/fa';
import { FiDollarSign } from 'react-icons/fi';

const LeaveRequests = () => {
  const [leaves, setLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { subdomain } = useContext(appContext);

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isThisMonthActive, setIsThisMonthActive] = useState(false);
  const [showFutureLeaves, setShowFutureLeaves] = useState(true);

  useEffect(() => {
    const loadLeaves = async () => {
      if (!subdomain || subdomain === 'main') {
        return;
      }

      setIsLoading(true);
      try {
        const leavesData = await getMyLeaves({ subdomain });
        const safeLeaves = Array.isArray(leavesData) ? leavesData : [];
        setLeaves(safeLeaves);

        // Mark leaves with updates as viewed
        const leavesWithUpdates = safeLeaves.filter(
          (leave) =>
            (leave.status === 'Approved' || leave.status === 'Rejected') &&
            !leave.workerViewed
        );

        if (leavesWithUpdates.length > 0) {
          for (const leave of leavesWithUpdates) {
            await markLeaveAsViewed(leave._id);
          }
        }
      } catch (error) {
        toast.error('Failed to load leave requests');
        console.error('Leave Loading Error:', error);
        setLeaves([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaves();
  }, [subdomain]);

  // Set "This Month" filter
  const handleThisMonthFilter = () => {
    const today = new Date();
    const firstDay = startOfMonth(today);
    const lastDay = endOfMonth(today);

    setDateRange({
      start: format(firstDay, 'yyyy-MM-dd'),
      end: format(lastDay, 'yyyy-MM-dd')
    });
    setIsThisMonthActive(true);
  };

  // Reset all filters
  const resetFilters = () => {
    setStatusFilter('all');
    setDateRange({ start: '', end: '' });
    setIsThisMonthActive(false);
    setShowFutureLeaves(true);
  };

  // Filter leaves based on selected filters
  const getFilteredLeaves = () => {
    return leaves.filter(leave => {
      // Status filter
      if (statusFilter !== 'all' && leave.status !== statusFilter) {
        return false;
      }

      // Future leaves filter
      if (!showFutureLeaves) {
        const leaveEndDate = new Date(leave.endDate);
        if (isFuture(leaveEndDate)) {
          return false;
        }
      }

      // Date range filter
      if (dateRange.start && dateRange.end) {
        try {
          const leaveStartDate = parseISO(leave.startDate);
          const leaveEndDate = parseISO(leave.endDate);
          const filterStartDate = parseISO(dateRange.start);
          const filterEndDate = parseISO(dateRange.end);

          // Check if leave period overlaps with filter period
          const startInRange = isWithinInterval(leaveStartDate, {
            start: filterStartDate,
            end: filterEndDate
          });

          const endInRange = isWithinInterval(leaveEndDate, {
            start: filterStartDate,
            end: filterEndDate
          });

          const encompassesRange = leaveStartDate <= filterStartDate && leaveEndDate >= filterEndDate;

          if (!(startInRange || endInRange || encompassesRange)) {
            return false;
          }
        } catch (error) {
          console.error('Date filtering error:', error);
          return true; // If there's an error in date parsing, include the leave
        }
      }

      return true;
    });
  };

  // Format date for display
  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  // Get status badge style and icon
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return {
          className: "bg-green-100 text-green-800 border border-green-200",
          icon: <FaCheck className="mr-1 text-green-600" size={10} />
        };
      case 'Rejected':
        return {
          className: "bg-red-100 text-red-800 border border-red-200",
          icon: <FaTimesCircle className="mr-1 text-red-600" size={10} />
        };
      case 'Pending':
        return {
          className: "bg-yellow-100 text-yellow-800 border border-yellow-200",
          icon: <FaClock className="mr-1 text-yellow-600" size={10} />
        };
      default:
        return {
          className: "bg-gray-100 text-gray-800 border border-gray-200",
          icon: null
        };
    }
  };

  const filteredLeaves = getFilteredLeaves();

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">My Leave Requests</h1>
        <Card>
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        </Card>
      </div>
    );
  }

  const statusOptions = [
    { value: 'all', label: 'All', fullLabel: 'All Requests' },
    { value: 'Pending', label: 'Pending', fullLabel: 'Pending' },
    { value: 'Approved', label: 'Approved', fullLabel: 'Approved' },
    { value: 'Rejected', label: 'Rejected', fullLabel: 'Rejected' }
  ];

  return (
    <div className="px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">My Leave Requests</h1>
        <Button
          variant="primary"
          onClick={() => window.location.href = '/worker/leave-apply'}
          className="text-xs sm:text-sm w-full sm:w-auto px-4 py-2"
        >
          + New Request
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="mb-6 border-t-4 border-blue-500 overflow-hidden shadow-sm">
        <div className="bg-gray-50 px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-gray-200">
          <div className="flex items-center">
            <FaFilter className="text-blue-600 mr-2 text-xs sm:text-base" />
            <h2 className="text-sm sm:text-lg font-bold mb-0">Filters</h2>
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-4">
          {/* Status Filter Tabs */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-600 mb-1.5">Status</label>
            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1 sm:gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`py-1.5 px-0.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-sm font-bold focus:outline-none transition-all duration-200 text-center ${
                    statusFilter === option.value 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="hidden sm:inline">{option.fullLabel}</span>
                  <span className="sm:hidden">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Filters */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-600 mb-1.5">
              <div className="flex items-center">
                <FaCalendarAlt className="text-blue-600 mr-1.5 text-xs sm:text-base" />
                <span>Date Range</span>
              </div>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              <div className="col-span-1">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-[10px] sm:text-xs">From</span>
                  </div>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, start: e.target.value }));
                      setIsThisMonthActive(false);
                    }}
                    className="w-full pl-11 pr-1.5 py-1.5 sm:py-2 border border-gray-200 rounded-md text-[11px] sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="col-span-1">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-[10px] sm:text-xs">To</span>
                  </div>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                      setIsThisMonthActive(false);
                    }}
                    className="w-full pl-7 pr-1.5 py-1.5 sm:py-2 border border-gray-200 rounded-md text-[11px] sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="col-span-2 flex gap-1.5 sm:gap-2">
                <button
                  onClick={handleThisMonthFilter}
                  className={`flex-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-semibold transition-all ${
                    isThisMonthActive 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50' 
                  }`}
                >
                  This Month
                </button>

                {(statusFilter !== 'all' || dateRange.start || dateRange.end || !showFutureLeaves) && (
                  <button
                    onClick={resetFilters}
                    className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-xs sm:text-sm font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                  >
                    <FaTimes className="mr-1" /> Reset All
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Filters Summary */}
        {(statusFilter !== 'all' || dateRange.start || dateRange.end || !showFutureLeaves) && (
          <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-blue-50 border-t border-blue-100">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs sm:text-sm font-medium text-blue-700">Active Filters:</span>

              {statusFilter !== 'all' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800">
                  Status: {statusFilter}
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <FaTimes size={10} />
                  </button>
                </span>
              )}

              {dateRange.start && dateRange.end && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800">
                  {isThisMonthActive ? "This Month" : `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`}
                  <button
                    onClick={() => {
                      setDateRange({ start: '', end: '' });
                      setIsThisMonthActive(false);
                    }}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <FaTimes size={10} />
                  </button>
                </span>
              )}

              {!showFutureLeaves && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800">
                  Future leaves hidden
                  <button
                    onClick={() => setShowFutureLeaves(true)}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <FaTimes size={10} />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Leave Requests List */}
      <Card className="border-t-4 border-blue-500 overflow-hidden shadow-sm">
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-bold text-gray-700 mb-0 text-sm sm:text-base">Leave Requests</h3>
          <span className="text-xs sm:text-sm text-gray-500">
            {filteredLeaves.length} {filteredLeaves.length === 1 ? 'request' : 'requests'} found
          </span>
        </div>

        {leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="rounded-full bg-blue-50 p-3 mb-4">
              <FaCalendarAlt className="text-blue-500 text-xl" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No leave requests yet</h3>
            <p className="text-gray-500 mb-6 max-w-md">
              You haven't submitted any leave requests yet. Click the button below to create your first request.
            </p>
            <Button
              variant="primary"
              onClick={() => window.location.href = '/worker/leave-apply'}
            >
              Apply for Leave
            </Button>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="rounded-full bg-yellow-50 p-3 mb-4">
              <FaFilter className="text-yellow-500 text-xl" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
            <p className="text-gray-500 mb-6 max-w-md">
              No leave requests match your current filters. Try adjusting your filters or reset them to view all requests.
            </p>
            <Button
              variant="secondary"
              onClick={resetFilters}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredLeaves.map((leave) => (
              <div
                key={leave._id}
                className={`p-3.5 sm:p-6 transition-all hover:bg-gray-50 border-l-4 ${leave.status === 'Approved' ? 'border-green-500' : leave.status === 'Rejected' ? 'border-red-500' : 'border-yellow-500' } ${!leave.workerViewed && (leave.status === 'Approved' || leave.status === 'Rejected') ? 'bg-blue-50/50' : '' }`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-2">
                  <div>
                    <h4 className="font-medium text-gray-900 text-base sm:text-lg">{leave.leaveType}</h4>
                    <div className="mt-1 flex items-center">
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">{leave.totalDays}</span> {leave.totalDays === 1 ? 'day' : 'days'} •
                        Submitted on {formatDate(leave.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Deduction Penalty Indicator */}
                    {leave.leaveType === 'Paid Leave' && (
                      <span className="bg-teal-50 text-teal-600 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black border border-teal-200 tracking-tight flex items-center shadow-sm">
                        <FiDollarSign className="mr-0.5" /> SALARY: PAID (IMMEDIATE)
                      </span>
                    )}
                    {leave.leaveType !== 'Permission' && leave.leaveType !== 'Paid Leave' && leave.deductionFactor > 1 && (
                      <span className="bg-red-50 text-red-600 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black border border-red-200 tracking-tight flex items-center shadow-sm">
                        <FiDollarSign className="mr-0.5" /> {leave.deductionFactor}X DEDUCTION
                      </span>
                    )}
                    {/* Status Badge */}
                    {(() => {
                      const { className, icon } = getStatusBadge(leave.status);
                      return (
                        <span className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium flex items-center ${className}`}>
                          {icon} {leave.status}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Leave Details */}
                <div className="bg-white rounded-md border border-gray-200 divide-y divide-gray-200 mt-3">
                  <div className="grid grid-cols-2 divide-x divide-gray-200">
                    <div className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 tracking-wide font-medium mb-0.5">Duration</p>
                      <div className="text-xs sm:text-sm font-medium text-gray-900 leading-normal">
                        {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                      </div>
                    </div>

                    <div className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 tracking-wide font-medium mb-0.5">Status</p>
                      <div className="text-xs sm:text-sm font-medium text-gray-900 leading-normal">
                        {leave.status === 'Approved' && <span className="text-green-600 font-semibold">Approved</span>}
                        {leave.status === 'Rejected' && <span className="text-red-600 font-semibold">Rejected</span>}
                        {leave.status === 'Pending' && <span className="text-yellow-600 font-semibold">Pending Review</span>}
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-gray-500 tracking-wide font-medium mb-0.5">Reason</p>
                    <p className="text-xs sm:text-sm text-gray-700 leading-normal whitespace-pre-line">{leave.reason}</p>
                  </div>

                  {/* Document (if any) */}
                  {leave.document && (
                    <div className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 tracking-wide font-medium mb-0.5">Supporting Document</p>
                      <a
                        href={leave.document}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        View Document
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default LeaveRequests;