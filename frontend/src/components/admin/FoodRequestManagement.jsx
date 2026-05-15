import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { 
  getTodayRequests, 
  toggleFoodRequests, 
  getFoodRequestSettings,
  updateMealSettings,
  getMealsSummary
} from '../../services/foodRequestService';
import api from '../../services/api';
import Button from '../common/Button';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import Table from '../common/Table';
import appContext from '../../context/AppContext';
import Modal from '../common/Modal';
import AdminFoodRequest from './AdminFoodRequest';// Import the new component

const FoodRequestManagement = () => {
  const [requests, setRequests] = useState([]);
  const [emailReportsEnabled, setEmailReportsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState({});
  const [activeMealFilter, setActiveMealFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMealForSettings, setSelectedMealForSettings] = useState('breakfast');
  const [summary, setSummary] = useState({ breakfast: 0, lunch: 0, dinner: 0, total: 0 });
  const [settings, setSettings] = useState({
    breakfast: { enabled: false, openTime: '07:00', closeTime: '09:00', autoSwitch: false },
    lunch: { enabled: true, openTime: '12:00', closeTime: '14:00', autoSwitch: false },
    dinner: { enabled: false, openTime: '18:00', closeTime: '20:00', autoSwitch: false }
  });
  const [settingsData, setSettingsData] = useState({
    openTime: '07:00',
    closeTime: '09:00',
    autoSwitch: false
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const { subdomain } = useContext(appContext);

  const formatTimeTo12Hour = (time24) => {
    if (!time24) return '';
    
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes.padStart(2, '0')} ${period}`;
  };

  const fetchRequests = async (mealType = 'all') => {
    if (!subdomain || subdomain === 'main') {
      toast.error('Invalid subdomain. Please check the URL.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await getTodayRequests({ subdomain, mealType });
      const formatted = data.map((req) => ({
        name: req.worker?.name || 'Unknown Worker',
        rfid: req.worker?.rfid || 'No ID',
        photo: req.worker?.photo || '',
        department: req.department?.name || 'No Department',
        mealType: req.mealType,
        date: new Date(req.date).toLocaleString(),
      }));

      setRequests(formatted);
    } catch (error) {
      toast.error('Failed to fetch food requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    if (!subdomain || subdomain === 'main') return;
    
    try {
      const summaryData = await getMealsSummary({ subdomain });
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchSettings = async () => {
    if (!subdomain || subdomain === 'main') return;
    
    try {
      const settingsData = await getFoodRequestSettings({ subdomain });
      setSettings(settingsData);
      setEmailReportsEnabled(settingsData.emailReportsEnabled || false);
    } catch (error) {
      toast.error('Failed to fetch settings');
    }
  };

  const handleToggleEmailReports = async () => {
    try {
      const response = await api.put(`/food-requests/email-reports/${subdomain}`);
      setEmailReportsEnabled(response.data.emailReportsEnabled);
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Failed to toggle email reports');
    }
  };

  useEffect(() => {
    if (subdomain && subdomain !== 'main') {
      fetchRequests(activeMealFilter);
      fetchSummary();
      fetchSettings();
      
      const interval = setInterval(() => {
        fetchRequests(activeMealFilter);
        fetchSummary();
        fetchSettings();
      }, 30000);
      
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [activeMealFilter, subdomain]);

  const handleToggle = async (mealType) => {
    setToggling(prev => ({ ...prev, [mealType]: true }));
    try {
      const result = await toggleFoodRequests({ subdomain, mealType });
      setSettings(prev => ({
        ...prev,
        [mealType]: { ...prev[mealType], enabled: result.enabled }
      }));
      toast.success(`${mealType.charAt(0).toUpperCase() + mealType.slice(1)} requests ${result.enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      toast.error(`Failed to toggle ${mealType} request status`);
    } finally {
      setToggling(prev => ({ ...prev, [mealType]: false }));
    }
  };

  const openSettingsModal = (mealType) => {
    setSelectedMealForSettings(mealType);
    const mealSettings = settings[mealType];
    setSettingsData({
      openTime: mealSettings.openTime,
      closeTime: mealSettings.closeTime,
      autoSwitch: mealSettings.autoSwitch
    });
    setShowSettings(true);
  };

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettingsData({
      ...settingsData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSettingsSave = async () => {
    setSavingSettings(true);
    try {
      const result = await updateMealSettings({
        subdomain,
        mealType: selectedMealForSettings,
        openTime: settingsData.openTime,
        closeTime: settingsData.closeTime,
        autoSwitch: settingsData.autoSwitch
      });
      
      setSettings(prev => ({
        ...prev,
        [selectedMealForSettings]: {
          ...prev[selectedMealForSettings],
          openTime: result.openTime,
          closeTime: result.closeTime,
          autoSwitch: result.autoSwitch,
          enabled: result.enabled
        }
      }));
      
      setShowSettings(false);
      toast.success(`${selectedMealForSettings.charAt(0).toUpperCase() + selectedMealForSettings.slice(1)} settings updated successfully`);
    } catch (error) {
      toast.error(error.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const getMealStatusBadge = (mealType) => {
    const mealSettings = settings[mealType];
    if (!mealSettings) return null;

    let status = 'Disabled';
    let colorClass = 'bg-red-100 text-red-800';

    if (mealSettings.autoSwitch) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const isInTimeRange = currentTime >= mealSettings.openTime && currentTime < mealSettings.closeTime;
      
      if (isInTimeRange) {
        status = 'Auto-Open';
        colorClass = 'bg-green-100 text-green-800';
      } else {
        status = 'Auto-Closed';
        colorClass = 'bg-orange-100 text-orange-800';
      }
    } else if (mealSettings.enabled) {
      status = 'Manual-Open';
      colorClass = 'bg-blue-100 text-blue-800';
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {status}
      </span>
    );
  };

  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      render: (record) => (
        <div className="flex items-center">
          {record?.photo && (
            <img
              src={record.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}`}
              alt="employee"
              className="w-8 h-8 rounded-full mr-2"
            />
          )}
          {record?.name || 'Unknown'}
        </div>
      )
    },
    {
      header: 'Employee ID',
      accessor: 'rfid',
    },
    {
      header: 'Department',
      accessor: 'department',
    },
    {
      header: 'Meal Type',
      accessor: 'mealType',
      render: (record) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          record.mealType === 'breakfast' ? 'bg-yellow-100 text-yellow-800' :
          record.mealType === 'lunch' ? 'bg-blue-100 text-blue-800' :
          'bg-purple-100 text-purple-800'
        }`}>
          {record.mealType.charAt(0).toUpperCase() + record.mealType.slice(1)}
        </span>
      )
    },
    {
      header: 'Submitted At',
      accessor: 'date',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center md:hidden">
        <h1 className="text-2xl font-bold">Food Request Management</h1>
      </div>

      {/* New component for admin to submit requests */}
      <AdminFoodRequest />

      {/* Email Reports Control */}
      <Card className="hover:border hover:border-dashed hover:border-purple-500 transition-all">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Email Reports</h3>
            <p className="text-sm text-gray-600">
              Automatically send email reports when meals close
            </p>
          </div>
          <Button
            onClick={handleToggleEmailReports}
            variant={emailReportsEnabled ? "danger" : "success"}
            size="sm"
          >
            {emailReportsEnabled ? 'Disable' : 'Enable'} Email Reports
          </Button>
        </div>
        <div className="mt-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            emailReportsEnabled 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {emailReportsEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Individual Meal Cards */}
        {['breakfast', 'lunch', 'dinner'].map(meal => (
          <Card key={meal} className="p-4 hover:border hover:border-dashed hover:border-pink-500 transition-all">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold capitalize">{meal}</h3>
              {getMealStatusBadge(meal)}
            </div>
            
            <div className="text-2xl font-bold text-blue-600 mb-2">
              {summary[meal]}
            </div>
            
            <div className="text-sm text-gray-600 mb-3">
              {formatTimeTo12Hour(settings[meal]?.openTime)} - {formatTimeTo12Hour(settings[meal]?.closeTime)}
            </div>
            
            <div className="flex space-x-2">
              <Button
                onClick={() => handleToggle(meal)}
                disabled={toggling[meal] || settings[meal]?.autoSwitch}
                variant={settings[meal]?.enabled ? "danger" : "success"}
                size="sm"
                className="flex-1"
              >
                {toggling[meal] ? (
                  <Spinner size="sm" />
                ) : settings[meal]?.enabled ? (
                  'Disable'
                ) : (
                  'Enable'
                )}
              </Button>
              
              <Button
                onClick={() => openSettingsModal(meal)}
                variant="secondary"
                size="sm"
              >
                Settings
              </Button>
            </div>
            
            {settings[meal]?.autoSwitch && (
              <div className="mt-2 text-xs text-blue-600">
                Auto-switching enabled
              </div>
            )}
          </Card>
        ))}

        {/* Total Summary Card */}
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 hover:border hover:border-dashed hover:border-blue-300 transition-all">

          <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Today</h3>
          <div className="text-3xl font-bold text-indigo-600 mb-2">
            {summary.total}
          </div>
          <div className="text-sm text-gray-600">
            All meal requests
          </div>
        </Card>
      </div>

      {/* Requests Table */}
      <Card className="hover:border hover:border-dashed hover:border-purple-500 transition-all">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Today's Requests</h2>
          
          {/* Meal Filter Tabs */}
          <div className="flex space-x-2">
            {['all', 'breakfast', 'lunch', 'dinner'].map(meal => (
              <button
                key={meal}
                onClick={() => setActiveMealFilter(meal)}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  activeMealFilter === meal
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {meal === 'all' ? 'All' : meal.charAt(0).toUpperCase() + meal.slice(1)}
                {meal !== 'all' && (
                  <span className="ml-1 text-xs">({summary[meal]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            No {activeMealFilter !== 'all' ? activeMealFilter : ''} food requests submitted today.
          </div>
        ) : (
          <Table
            columns={columns}
            data={requests}
            noDataMessage="No food request records found."
          />
        )}
      </Card>

      {/* Settings Modal */}
      {showSettings && (
        <Modal
          title={`${selectedMealForSettings.charAt(0).toUpperCase() + selectedMealForSettings.slice(1)} Settings`}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        >
          <form className="space-y-4">
            <div className="form-group">
              <label className="form-label">Opening Time</label>
              <input
                type="time"
                name="openTime"
                value={settingsData.openTime}
                onChange={handleSettingsChange}
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Closing Time</label>
              <input
                type="time"
                name="closeTime"
                value={settingsData.closeTime}
                onChange={handleSettingsChange}
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="autoSwitch"
                  checked={settingsData.autoSwitch}
                  onChange={handleSettingsChange}
                  className="form-checkbox"
                />
                <span>Enable automatic switching based on time</span>
              </label>
              <p className="text-sm text-gray-500 mt-1">
                When enabled, {selectedMealForSettings} requests will automatically be enabled during open hours and disabled outside those hours.
                Manual toggling will be disabled.
              </p>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </Button>
              
              <Button
                type="button"
                variant="primary"
                onClick={handleSettingsSave}
                disabled={savingSettings}
              >
                {savingSettings ? <Spinner size="sm" /> : 'Save Settings'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default FoodRequestManagement;