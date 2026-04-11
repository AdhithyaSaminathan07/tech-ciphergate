import React, { useState, useEffect, useContext, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCalendarAlt, FaFilter, FaUser, FaUsers } from 'react-icons/fa';
import { toast } from 'react-toastify';
import appContext from '../../context/AppContext';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
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
    appliesTo: 'all', // New field: 'all' or 'specific'
    workers: [] // New field: array of worker IDs
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showUpcoming, setShowUpcoming] = useState(false);

  // Search state for employee selection
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchHolidays();
    fetchWorkers();
  }, []);

  const fetchHolidays = async () => {
    setIsLoading(true);
    try {
      console.log(subdomain);
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
      const data = await getWorkers(subdomain);
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
    setSearchTerm(''); // Reset search term
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
    setSearchTerm(''); // Reset search term
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
      setSearchTerm(''); // Reset search term
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
      setSearchTerm(''); // Reset search term
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
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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
  
  // Filter workers based on search term
  const filteredWorkers = workers.filter(worker => 
    worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Holiday Management</h1>
        <Button variant="primary" onClick={openAddModal} className="flex items-center">
          <FaPlus className="mr-2" /> Add Holiday
        </Button>
      </div>

      {/* Filters Section */}
      <Card className="mb-6 p-4">
        <div className="flex items-center mb-4">
          <FaFilter className="mr-2 text-gray-600" />
          <h3 className="text-lg font-semibold">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              className="form-input w-full"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              className="form-input w-full"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              onClick={fetchHolidaysByDateRange}
              disabled={!filterStartDate || !filterEndDate}
            >
              Apply Range
            </Button>
            <Button 
              variant={showUpcoming ? "primary" : "outline"} 
              onClick={handleUpcomingToggle}
            >
              Upcoming
            </Button>
          </div>
          <div>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {holidays.length === 0 ? (
            <Card className="p-8 text-center">
              <FaCalendarAlt className="mx-auto text-4xl text-gray-400 mb-4" />
              <p className="text-xl text-gray-600">No holidays found.</p>
              <p className="text-gray-500 mt-2">
                {showUpcoming ? 'No upcoming holidays in the next 30 days.' : 'Start by adding your first holiday.'}
              </p>
            </Card>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Showing {holidays.length} holiday{holidays.length !== 1 ? 's' : ''}
                  {showUpcoming && ' (upcoming in next 30 days)'}
                  {filterStartDate && filterEndDate && ` (${filterStartDate} to ${filterEndDate})`}
                </p>
              </div>
              
              {holidays.map((holiday) => (
                <Card key={holiday._id} className={`shadow-sm border transition-all hover:shadow-md ${
                  isHolidayPast(holiday.date) ? 'bg-gray-50 opacity-75' : 'bg-white'
                }`}>
                  <div className="flex justify-between items-start w-full">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <FaCalendarAlt className="text-blue-600 mr-2" />
                        <h3 className="text-xl font-semibold text-gray-800">
                          {holiday.holidayDesc}
                        </h3>
                        {isHolidayPast(holiday.date) && (
                          <span className="ml-2 px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
                            Past
                          </span>
                        )}
                        {holiday.appliesTo === 'specific' && (
                          <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-full">
                            Specific Employees
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-600 w-16">Date:</span>
                          <span className="text-lg font-medium text-blue-600">
                            {formatDate(holiday.date)}
                          </span>
                        </div>
                        
                        <div className="flex items-start">
                          <span className="text-sm font-medium text-gray-600 w-16 mt-1">Reason:</span>
                          <span className="text-gray-700 flex-1">
                            {holiday.reason}
                          </span>
                        </div>
                        
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-600 w-16">Applies:</span>
                          <span className="text-gray-700 flex items-center">
                            {holiday.appliesTo === 'all' ? (
                              <>
                                <FaUsers className="mr-1" /> All Employees
                              </>
                            ) : (
                              <>
                                <FaUser className="mr-1" /> {getWorkerCount(holiday)}
                              </>
                            )}
                          </span>
                        </div>
                        
                        {holiday.appliesTo === 'specific' && holiday.workers && holiday.workers.length > 0 && (
                          <div className="flex items-start">
                            <span className="text-sm font-medium text-gray-600 w-16 mt-1">Workers:</span>
                            <div className="flex flex-wrap gap-1">
                              {holiday.workers.slice(0, 3).map((worker, index) => (
                                <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                  {worker.name || getWorkerName(worker._id || worker)}
                                </span>
                              ))}
                              {holiday.workers.length > 3 && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                                  +{holiday.workers.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-600 w-16">Added:</span>
                          <span className="text-sm text-gray-500">
                            {new Date(holiday.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 ml-4">
                      <button
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                        onClick={() => openEditModal(holiday)}
                        title="Edit Holiday"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={() => openDeleteModal(holiday)}
                        title="Delete Holiday"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* Add Modal */}
      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => {
          setIsAddModalOpen(false);
          setSearchTerm(''); // Reset search term
        }} 
        title="Add New Holiday"
        size="lg"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Holiday Name *</label>
            <input
              ref={holidayDescRef}
              type="text"
              name="holidayDesc"
              className="form-input"
              value={formData.holidayDesc}
              onChange={handleChange}
              placeholder="e.g., Christmas Day, Independence Day"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input
              type="date"
              name="date"
              className="form-input"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Reason/Description *</label>
            <textarea
              name="reason"
              className="form-input"
              rows="3"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Brief description or reason for the holiday"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Applies To *</label>
            <div className="flex space-x-4 mt-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="appliesTo"
                  value="all"
                  checked={formData.appliesTo === 'all'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span>All Employees</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="appliesTo"
                  value="specific"
                  checked={formData.appliesTo === 'specific'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span>Specific Employees</span>
              </label>
            </div>
          </div>
          
          {formData.appliesTo === 'specific' && (
            <div className="form-group">
              <label className="form-label">Select Employees</label>
              <div className="flex space-x-2 mb-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAllWorkers}
                >
                  Select All
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearWorkers}
                >
                  Clear All
                </Button>
              </div>
              <div className="border rounded-lg p-2 mb-2">
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="border rounded-lg max-h-40 overflow-y-auto p-2">
                {workers.length > 0 ? (
                  filteredWorkers.map(worker => (
                    <label key={worker._id} className="flex items-center p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={formData.workers.includes(worker._id)}
                        onChange={() => handleWorkerSelect(worker._id)}
                        className="mr-2"
                      />
                      <span>{worker.name} ({worker.username})</span>
                    </label>
                  ))
                ) : (
                  <p className="text-gray-500 p-2">No workers available</p>
                )}
                {workers.length > 0 && filteredWorkers.length === 0 && (
                  <p className="text-gray-500 p-2">No employees found matching your search</p>
                )}
              </div>
            </div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddModalOpen(false);
                setSearchTerm(''); // Reset search term
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Holiday
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => {
          setIsEditModalOpen(false);
          setSearchTerm(''); // Reset search term
        }} 
        title="Edit Holiday"
        size="lg"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Holiday Name *</label>
            <input
              ref={holidayDescRef}
              type="text"
              name="holidayDesc"
              className="form-input"
              value={formData.holidayDesc}
              onChange={handleChange}
              placeholder="e.g., Christmas Day, Independence Day"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input
              type="date"
              name="date"
              className="form-input"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Reason/Description *</label>
            <textarea
              name="reason"
              className="form-input"
              rows="3"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Brief description or reason for the holiday"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Applies To *</label>
            <div className="flex space-x-4 mt-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="appliesTo"
                  value="all"
                  checked={formData.appliesTo === 'all'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span>All Employees</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="appliesTo"
                  value="specific"
                  checked={formData.appliesTo === 'specific'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span>Specific Employees</span>
              </label>
            </div>
          </div>
          
          {formData.appliesTo === 'specific' && (
            <div className="form-group">
              <label className="form-label">Select Employees</label>
              <div className="flex space-x-2 mb-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAllWorkers}
                >
                  Select All
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearWorkers}
                >
                  Clear All
                </Button>
              </div>
              <div className="border rounded-lg p-2 mb-2">
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="border rounded-lg max-h-40 overflow-y-auto p-2">
                {workers.length > 0 ? (
                  filteredWorkers.map(worker => (
                    <label key={worker._id} className="flex items-center p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={formData.workers.includes(worker._id)}
                        onChange={() => handleWorkerSelect(worker._id)}
                        className="mr-2"
                      />
                      <span>{worker.name} ({worker.username})</span>
                    </label>
                  ))
                ) : (
                  <p className="text-gray-500 p-2">No workers available</p>
                )}
                {workers.length > 0 && filteredWorkers.length === 0 && (
                  <p className="text-gray-500 p-2">No employees found matching your search</p>
                )}
              </div>
            </div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsEditModalOpen(false);
                setSearchTerm(''); // Reset search term
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Holiday
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Delete Holiday"
        size="sm"
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <FaTrash className="text-red-600" />
          </div>
          
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Delete Holiday
          </h3>
          
          <p className="text-sm text-gray-500 mb-6">
            Are you sure you want to delete <strong>"{selectedHoliday?.holidayDesc}"</strong>? 
            This action cannot be undone.
          </p>
          
          <div className="flex justify-center space-x-3">
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete Holiday
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default HolidayManagement;