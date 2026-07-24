import React, { useState, useEffect, useContext, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCalendarAlt, FaFilter, FaUser, FaUsers, FaSearch } from 'react-icons/fa';
import { toast } from 'react-toastify';
import appContext from '../../context/AppContext';
import Spinner from '../common/Spinner';
import { 
  readHolidays, 
  createHoliday, 
  updateHoliday, 
  deleteHoliday, 
  getUpcomingHolidays, 
  getHolidaysByDateRange 
} from '../../services/holidayService';
import { getWorkers } from '../../services/workerService';

const HolidayManagement = () => {
  const holidayDescRef = useRef(null);
  const { subdomain } = useContext(appContext);
  const [holidays, setHolidays] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [formData, setFormData] = useState({ 
    holidayDesc: '', 
    date: '', 
    reason: '',
    appliesTo: 'all',
    workers: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showUpcoming, setShowUpcoming] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchHolidays();
    fetchWorkers();
  }, []);

  const fetchHolidays = async () => {
    setIsLoading(true);
    try {
      const data = await readHolidays(subdomain);
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch holidays');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const data = await getWorkers({ subdomain });
      setWorkers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch workers', err);
    }
  };

  const fetchUpcomingHolidays = async () => {
    setIsLoading(true);
    try {
      const data = await getUpcomingHolidays(subdomain);
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch upcoming holidays');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHolidaysByDateRange = async () => {
    if (!filterStartDate || !filterEndDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await getHolidaysByDateRange(subdomain, filterStartDate, filterEndDate);
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch holidays by date range');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAddModalOpen || isEditModalOpen) {
      holidayDescRef.current?.focus();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const openAddModal = () => {
    setFormData({ 
      holidayDesc: '', 
      date: '', 
      reason: '',
      appliesTo: 'all',
      workers: []
    });
    setSearchTerm('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (holiday) => {
    setSelectedHoliday(holiday);
    setFormData({ 
      holidayDesc: holiday.holidayDesc,
      date: new Date(holiday.date).toISOString().split('T')[0],
      reason: holiday.reason,
      appliesTo: holiday.appliesTo || 'all',
      workers: holiday.workers ? holiday.workers.map(w => w._id || w) : []
    });
    setSearchTerm('');
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (holiday) => {
    setSelectedHoliday(holiday);
    setIsDeleteModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleWorkerSelect = (workerId) => {
    setFormData(prev => {
      const workers = [...prev.workers];
      if (workers.includes(workerId)) {
        return { ...prev, workers: workers.filter(id => id !== workerId) };
      } else {
        return { ...prev, workers: [...workers, workerId] };
      }
    });
  };

  const handleSelectAllWorkers = () => {
    const allWorkerIds = workers.map(worker => worker._id);
    setFormData({ ...formData, workers: allWorkerIds });
  };

  const handleClearWorkers = () => {
    setFormData({ ...formData, workers: [] });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const newHoliday = await createHoliday({
        ...formData,
        subdomain
      });
      setHolidays((prev) => [newHoliday, ...prev]);
      toast.success('Holiday created successfully');
      setIsAddModalOpen(false);
      setSearchTerm('');
      setFormData({ 
        holidayDesc: '', 
        date: '', 
        reason: '',
        appliesTo: 'all',
        workers: []
      });
    } catch (err) {
      toast.error(err.message || 'Failed to create holiday');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const updated = await updateHoliday(selectedHoliday._id, {
        ...formData,
        subdomain
      });
      setHolidays((prev) =>
        prev.map((h) => (h._id === updated._id ? updated : h))
      );
      toast.success('Holiday updated successfully');
      setIsEditModalOpen(false);
      setSearchTerm('');
    } catch (err) {
      toast.error(err.message || 'Failed to update holiday');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHoliday(selectedHoliday._id);
      setHolidays((prev) =>
        prev.filter((h) => h._id !== selectedHoliday._id)
      );
      toast.success('Holiday deleted successfully');
      setIsDeleteModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'Failed to delete holiday');
    }
  };

  const clearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setShowUpcoming(false);
    fetchHolidays();
  };

  const handleUpcomingToggle = () => {
    if (!showUpcoming) {
      fetchUpcomingHolidays();
      setShowUpcoming(true);
    } else {
      setShowUpcoming(false);
      fetchHolidays();
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isHolidayPast = (date) => {
    return new Date(date) < new Date();
  };

  const getWorkerName = (workerId) => {
    const worker = workers.find(w => w._id === workerId) || 
                  (selectedHoliday && selectedHoliday.workers && selectedHoliday.workers.find(w => (w._id || w) === workerId));
    return worker ? worker.name : 'Unknown Worker';
  };

  const getWorkerCount = (holiday) => {
    if (holiday.appliesTo === 'all') {
      return 'All Employees';
    }
    if (holiday.workers && holiday.workers.length > 0) {
      return `${holiday.workers.length} Employee${holiday.workers.length > 1 ? 's' : ''}`;
    }
    return 'No Employees';
  };
  
  const filteredWorkers = workers.filter(worker => 
    (worker.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (worker.username || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full text-slate-800 font-sans p-1 sm:p-4">
      {/* Header Banner - Fully Responsive */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FaCalendarAlt className="text-[#006666] h-5 w-5" />
            Holiday Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure company holidays, date ranges, and employee-specific leave allocations
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#006666] hover:bg-[#004d4d] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#006666]/15 active:scale-95 flex-shrink-0"
        >
          <FaPlus className="h-3.5 w-3.5" />
          <span>Add New Holiday</span>
        </button>
      </div>

      {/* Filters Card - Fully Responsive Grid */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 sm:p-5 mb-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <FaFilter className="text-[#006666] h-3.5 w-3.5" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Search & Filter Holidays</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2 items-end">
            <button 
              type="button"
              onClick={fetchHolidaysByDateRange}
              disabled={!filterStartDate || !filterEndDate}
              className="w-full py-2 px-3 bg-[#006666] hover:bg-[#004d4d] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            >
              Apply Range
            </button>
            <button 
              type="button"
              onClick={handleUpcomingToggle}
              className={`w-full py-2 px-3 text-xs font-bold rounded-xl border transition-all shadow-2xs ${
                showUpcoming 
                  ? 'bg-purple-600 text-white border-purple-600' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showUpcoming ? 'Upcoming (Active)' : 'Upcoming'}
            </button>
          </div>
        </div>
        {(filterStartDate || filterEndDate || showUpcoming) && (
          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-bold text-rose-600 hover:underline"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" color="#006666" />
        </div>
      ) : (
        <div className="space-y-3.5">
          {holidays.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-2xs">
              <FaCalendarAlt className="mx-auto text-4xl text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-800">No Holidays Found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {showUpcoming ? 'No upcoming holidays found in the next 30 days.' : 'Start by creating your first holiday record.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Showing {holidays.length} holiday{holidays.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {holidays.map((holiday) => (
                <div key={holiday._id} className={`rounded-2xl border p-4 transition-all ${ isHolidayPast(holiday.date) ? 'bg-slate-50/80 border-slate-200 opacity-80' : 'bg-white border-slate-200/90 shadow-2xs hover:border-[#006666]/40' }`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div className="space-y-2 flex-grow min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FaCalendarAlt className="text-[#006666] h-4 w-4 flex-shrink-0" />
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                          {holiday.holidayDesc}
                        </h3>
                        {isHolidayPast(holiday.date) && (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full">
                            Past
                          </span>
                        )}
                        {holiday.appliesTo === 'specific' ? (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold rounded-full">
                            Specific Staff
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full">
                            All Staff
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-500">Date:</span>
                          <span className="font-bold text-[#006666]">
                            {formatDate(holiday.date)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-500">Applies:</span>
                          <span className="text-slate-800 font-semibold flex items-center gap-1">
                            {holiday.appliesTo === 'all' ? (
                              <>
                                <FaUsers className="text-emerald-600" /> All Employees
                              </>
                            ) : (
                              <>
                                <FaUser className="text-purple-600" /> {getWorkerCount(holiday)}
                              </>
                            )}
                          </span>
                        </div>

                        <div className="sm:col-span-2 flex items-start gap-1.5">
                          <span className="font-bold text-slate-500 flex-shrink-0">Reason:</span>
                          <span className="text-slate-700 font-medium leading-relaxed">
                            {holiday.reason}
                          </span>
                        </div>

                        {holiday.appliesTo === 'specific' && holiday.workers && holiday.workers.length > 0 && (
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="font-bold text-slate-500 text-[11px]">Workers:</span>
                            {holiday.workers.slice(0, 4).map((worker, index) => (
                              <span key={index} className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold rounded-md">
                                {worker.name || getWorkerName(worker._id || worker)}
                              </span>
                            ))}
                            {holiday.workers.length > 4 && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md">
                                +{holiday.workers.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 self-end sm:self-start flex-shrink-0 pt-2 sm:pt-0">
                      <button
                        type="button"
                        className="p-2 text-slate-600 hover:text-[#006666] hover:bg-slate-100 rounded-xl transition-colors"
                        onClick={() => openEditModal(holiday)}
                        title="Edit Holiday"
                      >
                        <FaEdit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                        onClick={() => openDeleteModal(holiday)}
                        title="Delete Holiday"
                      >
                        <FaTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Add New Holiday</h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSearchTerm('');
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Holiday Name *</label>
                <input
                  ref={holidayDescRef}
                  type="text"
                  name="holidayDesc"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.holidayDesc}
                  onChange={handleChange}
                  placeholder="e.g., Christmas Day, Diwali, New Year"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Date *</label>
                <input
                  type="date"
                  name="date"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Reason/Description *</label>
                <textarea
                  name="reason"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.reason}
                  onChange={handleChange}
                  placeholder="Brief description or official reason for the holiday"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Applies To *</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                    formData.appliesTo === 'all'
                      ? 'bg-[#006666]/10 border-[#006666] text-[#006666]'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="appliesTo"
                      value="all"
                      checked={formData.appliesTo === 'all'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span>All Employees</span>
                  </label>

                  <label className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                    formData.appliesTo === 'specific'
                      ? 'bg-[#006666]/10 border-[#006666] text-[#006666]'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="appliesTo"
                      value="specific"
                      checked={formData.appliesTo === 'specific'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span>Specific Employees</span>
                  </label>
                </div>
              </div>
              
              {formData.appliesTo === 'specific' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Select Staff Members</label>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={handleSelectAllWorkers}
                        className="text-[11px] font-bold text-[#006666] hover:underline"
                      >
                        Select All
                      </button>
                      <button 
                        type="button" 
                        onClick={handleClearWorkers}
                        className="text-[11px] font-bold text-rose-600 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <FaSearch className="absolute left-3 top-3 text-slate-400 text-xs" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white"
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto p-2 divide-y divide-slate-100">
                    {workers.length > 0 ? (
                      filteredWorkers.map(worker => (
                        <label key={worker._id} className="flex items-center p-2 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={formData.workers.includes(worker._id)}
                            onChange={() => handleWorkerSelect(worker._id)}
                            className="h-4 w-4 text-[#006666] focus:ring-[#006666] border-slate-300 rounded mr-2.5"
                          />
                          <span>{worker.name} ({worker.username})</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-slate-400 p-2 text-xs text-center">No workers available</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSearchTerm('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#006666] hover:bg-[#004d4d] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#006666]/15"
                >
                  Create Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit Holiday</h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSearchTerm('');
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Holiday Name *</label>
                <input
                  ref={holidayDescRef}
                  type="text"
                  name="holidayDesc"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.holidayDesc}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Date *</label>
                <input
                  type="date"
                  name="date"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Reason/Description *</label>
                <textarea
                  name="reason"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                  value={formData.reason}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Applies To *</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                    formData.appliesTo === 'all'
                      ? 'bg-[#006666]/10 border-[#006666] text-[#006666]'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="appliesTo"
                      value="all"
                      checked={formData.appliesTo === 'all'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span>All Employees</span>
                  </label>

                  <label className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                    formData.appliesTo === 'specific'
                      ? 'bg-[#006666]/10 border-[#006666] text-[#006666]'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="appliesTo"
                      value="specific"
                      checked={formData.appliesTo === 'specific'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span>Specific Employees</span>
                  </label>
                </div>
              </div>
              
              {formData.appliesTo === 'specific' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Select Staff Members</label>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={handleSelectAllWorkers}
                        className="text-[11px] font-bold text-[#006666] hover:underline"
                      >
                        Select All
                      </button>
                      <button 
                        type="button" 
                        onClick={handleClearWorkers}
                        className="text-[11px] font-bold text-rose-600 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <FaSearch className="absolute left-3 top-3 text-slate-400 text-xs" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white"
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto p-2 divide-y divide-slate-100">
                    {workers.length > 0 ? (
                      filteredWorkers.map(worker => (
                        <label key={worker._id} className="flex items-center p-2 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={formData.workers.includes(worker._id)}
                            onChange={() => handleWorkerSelect(worker._id)}
                            className="h-4 w-4 text-[#006666] focus:ring-[#006666] border-slate-300 rounded mr-2.5"
                          />
                          <span>{worker.name} ({worker.username})</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-slate-400 p-2 text-xs text-center">No workers available</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSearchTerm('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#006666] hover:bg-[#004d4d] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#006666]/15"
                >
                  Update Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-2xl bg-rose-100 text-rose-600">
              <FaTrash className="h-5 w-5" />
            </div>
            
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Delete Holiday
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-800">"{selectedHoliday?.holidayDesc}"</strong>? This action cannot be undone.
              </p>
            </div>
            
            <div className="flex justify-center gap-2.5 pt-2">
              <button 
                type="button"
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-rose-600/15"
                onClick={handleDelete}
              >
                Delete Holiday
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidayManagement;