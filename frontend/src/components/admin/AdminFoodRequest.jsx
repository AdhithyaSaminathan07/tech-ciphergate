// frontend/src/components/admin/AdminFoodRequest.jsx
import { useState, useEffect, useContext, useRef } from 'react';
import { toast } from 'react-toastify';
import Modal from 'react-modal';
import { submitRequestForWorkerByAdmin, getFoodRequestSettings } from '../../services/foodRequestService';
import { getWorkers } from '../../services/workerService';
import appContext from '../../context/AppContext';
import Button from '../common/Button';
import Spinner from '../common/Spinner';

// --- Modal Styles ---
const customStyles = {
  content: {
    top: '50%', left: '50%', right: 'auto', bottom: 'auto',
    marginRight: '-50%', transform: 'translate(-50%, -50%)',
    width: '90%', maxWidth: '450px',
    padding: '0', border: 'none', borderRadius: '8px',
    backdropFilter: 'blur(12px)',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  overlay: { 
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(4px)',
  }
};

Modal.setAppElement('#root');

const AdminFoodRequest = () => {
  const [workers, setWorkers] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { subdomain } = useContext(appContext);
  const dropdownRef = useRef(null);
  const [settings, setSettings] = useState(null); // State to store meal settings
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Fetch all workers and meal settings from the API
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!subdomain) return;
      try {
        const [workersData, settingsData] = await Promise.all([
          getWorkers({ subdomain }),
          getFoodRequestSettings({ subdomain })
        ]);
        setWorkers(workersData);
        
        console.log('🔍 AdminFoodRequest - Settings data received:', settingsData);
        
        // Ensure settings has default values for all meal types
        const defaultSettings = {
          breakfast: { enabled: false, openTime: '07:00', closeTime: '09:00', autoSwitch: false },
          lunch: { enabled: true, openTime: '12:00', closeTime: '14:00', autoSwitch: false },
          dinner: { enabled: false, openTime: '18:00', closeTime: '20:00', autoSwitch: false }
        };
        
        // Merge fetched settings with defaults to ensure all properties exist
        const safeSettings = {
          breakfast: { ...defaultSettings.breakfast, ...(settingsData?.breakfast || {}) },
          lunch: { ...defaultSettings.lunch, ...(settingsData?.lunch || {}) },
          dinner: { ...defaultSettings.dinner, ...(settingsData?.dinner || {}) }
        };
        
        setSettings(safeSettings);
      } catch (error) {
        toast.error('Failed to load data.');
        console.error('Failed to fetch initial data:', error);
        
        // Set default settings on error to prevent crashes
        setSettings({
          breakfast: { enabled: false, openTime: '07:00', closeTime: '09:00', autoSwitch: false },
          lunch: { enabled: true, openTime: '12:00', closeTime: '14:00', autoSwitch: false },
          dinner: { enabled: false, openTime: '18:00', closeTime: '20:00', autoSwitch: false }
        });
      } finally {
        setLoadingWorkers(false);
      }
    };
    fetchInitialData();
  }, [subdomain]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCheckboxChange = (workerId) => {
    setSelectedWorkers(prev => ({
      ...prev,
      [workerId]: !prev[workerId]
    }));
  };

  const handleModalSubmit = (mealType) => {
    setIsModalOpen(false);
    handleRequestSubmit(mealType);
  };

  const handleRequestSubmit = async (mealType) => {
    setIsSubmitting(true);
    const workersToSubmit = workers.filter(worker => selectedWorkers[worker._id]);

    if (workersToSubmit.length === 0) {
      toast.info('Please select at least one employee.');
      setIsSubmitting(false);
      return;
    }

    try {
      const submissionPromises = workersToSubmit.map(worker =>
        submitRequestForWorkerByAdmin({
          workerId: worker._id,
          mealType,
          subdomain
        })
      );
      
      await Promise.all(submissionPromises);
      toast.success(`${workersToSubmit.length} requests for ${mealType} submitted successfully!`);
    } catch (error) {
      toast.error(error.message || `Failed to submit one or more requests.`);
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
      setSelectedWorkers({});
      setIsDropdownOpen(false);
      setSearchQuery('');
    }
  };

  const filteredWorkers = workers.filter(worker =>
    worker.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const selectedWorkerCount = Object.values(selectedWorkers).filter(Boolean).length;
  
  const getMealStatus = (mealType) => {
    if (!settings) return { status: 'loading', label: 'Loading...' };
    
    const mealSettings = settings[mealType];
    
    // Add null check for mealSettings
    if (!mealSettings) {
      return { status: 'disabled', label: 'Not Configured' };
    }
    
    const { enabled, autoSwitch, openTime, closeTime } = mealSettings;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isInTimeRange = currentTime >= openTime && currentTime < closeTime;
    
    if (autoSwitch && isInTimeRange) {
      return { status: 'auto-open', label: 'Auto-Open' };
    }
    
    if (enabled) {
      return { status: 'manual-open', label: 'Manual-Open' };
    }
    
    return { status: 'disabled', label: 'Disabled' };
  };

  const isMealActive = (mealType) => {
    const status = getMealStatus(mealType).status;
    return status === 'auto-open' || status === 'manual-open';
  };

  const allMealsDisabled = !isMealActive('breakfast') && !isMealActive('lunch') && !isMealActive('dinner');

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-md mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Food Request Employees</h2>
          <Button onClick={() => setIsModalOpen(true)} disabled={isSubmitting || selectedWorkerCount === 0 || allMealsDisabled} variant="primary">
            {isSubmitting ? <Spinner size="sm" /> : `Submit (${selectedWorkerCount})`}
          </Button>
        </div>
        <div className="relative" ref={dropdownRef}>
          <div
            className="flex items-center justify-between p-3 border border-gray-300 rounded-lg cursor-pointer bg-white shadow-sm"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className="text-gray-700">
              {selectedWorkerCount > 0 ? `${selectedWorkerCount} employee(s) selected` : 'Select employee(s)...'}
            </span>
            <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
  
          {isDropdownOpen && (
            <div className="absolute z-50 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
              <div className="p-2 border-b sticky top-0 bg-white z-10">
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {loadingWorkers ? (
                 <div className="flex justify-center p-4">
                    <Spinner size="md" />
                 </div>
              ) : filteredWorkers.length > 0 ? (
                filteredWorkers.map(worker => (
                  <div key={worker._id} className="flex items-center p-3 hover:bg-gray-100 cursor-pointer" onClick={() => handleCheckboxChange(worker._id)}>
                    <input
                      type="checkbox"
                      checked={!!selectedWorkers[worker._id]}
                      onChange={() => {}} // onChange is handled by the parent div
                      className="form-checkbox h-5 w-5 text-blue-600 rounded mr-3"
                    />
                    <img
                      src={worker.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`}
                      alt={worker.name}
                      className="w-8 h-8 rounded-full mr-3"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-800">{worker.name}</span>
                  </div>
                ))
              ) : (
                <p className="p-4 text-center text-gray-500">No employees found.</p>
              )}
            </div>
          )}
        </div>
      </div>
  
      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        style={customStyles}
        contentLabel="Select Meal for Employees"
      >
        <div className="p-6 bg-white rounded-lg shadow-xl">
          <h3 className="text-xl font-semibold text-center text-gray-800 mb-4">
            Select Meal for {selectedWorkerCount} Employee(s)
          </h3>
          
          <div className="flex flex-col sm:flex-row justify-around space-y-2 sm:space-y-0 sm:space-x-2">
            <Button onClick={() => handleModalSubmit('breakfast')} disabled={isSubmitting || !isMealActive('breakfast')} variant="primary" className="flex-1">
              {isSubmitting ? <Spinner size="sm" /> : `Breakfast (${getMealStatus('breakfast').label})`}
            </Button>
            <Button onClick={() => handleModalSubmit('lunch')} disabled={isSubmitting || !isMealActive('lunch')} variant="primary" className="flex-1">
              {isSubmitting ? <Spinner size="sm" /> : `Lunch (${getMealStatus('lunch').label})`}
            </Button>
            <Button onClick={() => handleModalSubmit('dinner')} disabled={isSubmitting || !isMealActive('dinner')} variant="primary" className="flex-1">
              {isSubmitting ? <Spinner size="sm" /> : `Dinner (${getMealStatus('dinner').label})`}
            </Button>
          </div>
          
          <div className="mt-6 text-center">
            <Button onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AdminFoodRequest;