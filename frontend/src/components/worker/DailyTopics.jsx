
import React, { useState, useEffect, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  addDailyTopic,
  getWorkerTopics,
  getWeekRange,
  formatDateForDisplay,
  getWeekdayName,
  isValidDate,
  isFutureDate
} from '../../services/dailyTopicService';
import appContext from '../../context/AppContext';
import Button from '../common/Button';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import { 
  FaPlus, 
  FaCalendarAlt, 
  FaBook, 
  FaChevronLeft, 
  FaChevronRight,
  FaTimes,
  FaExclamationCircle,
  FaGraduationCap,
  FaLightbulb,
  FaClock,
  FaCheckCircle
} from 'react-icons/fa';

const DailyTopics = () => {
  const { user } = useAuth();
  const { subdomain } = useContext(appContext);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [newTopic, setNewTopic] = useState({
    date: new Date().toISOString().split('T')[0],
    topic: ''
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user?._id) {
      fetchTopics();
    }
  }, [user, currentWeekOffset]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchTopics = async () => {
    try {
      setLoading(true);
      const response = await getWorkerTopics({
        workerId: user._id,
        subdomain,
        limit: 50
      });
      setTopics(response.topics || []);
    } catch (error) {
      console.error('Error fetching topics:', error);
      setErrors({ fetch: 'Failed to load topics' });
    } finally {
      setLoading(false);
    }
  };

const validateTopic = (topic, date) => {
  const newErrors = {};
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (!topic.trim()) {
    newErrors.topic = 'Topic is required';
  } else if (topic.length > 200) {
    newErrors.topic = 'Topic must be less than 200 characters';
  }

  if (!date) {
    newErrors.date = 'Date is required';
  } else if (!isValidDate(date)) {
    newErrors.date = 'Invalid date format';
  } else if (date !== today) {
    newErrors.date = 'You can only add a topic for today';
  }

  // Check if topic already exists for this date
  const existingTopic = topics.find(t => t.date === date);
  if (existingTopic) {
    newErrors.date = 'A topic already exists for today';
  }

  return newErrors;
};


  const handleAddTopic = async () => {
    const validationErrors = validateTopic(newTopic.topic, newTopic.date);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!user?._id) {
      setErrors({ add: 'User not authenticated' });
      return;
    }

    if (!subdomain) {
      setErrors({ add: 'Subdomain not found' });
      return;
    }

    try {
      setSaving(true);
      await addDailyTopic({
        workerId: user._id,
        date: newTopic.date,
        topic: newTopic.topic.trim(),
        subdomain
      });
      
      setShowAddModal(false);
      setNewTopic({
        date: new Date().toISOString().split('T')[0],
        topic: ''
      });
      setErrors({});
      setSuccessMessage('Topic added successfully!');
      await fetchTopics();
    } catch (error) {
      console.error('Error adding topic:', error);
      
      let errorMessage = 'Failed to add topic';
      
      if (error.response?.status === 401) {
        errorMessage = 'Not authorized. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. You can only add topics for yourself.';
      } else if (error.response?.status === 400) {
        errorMessage = error.response?.data?.message || 'Invalid data provided';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setErrors({ 
        add: errorMessage
      });
    } finally {
      setSaving(false);
    }
  };

  const getWeekDates = () => {
    const { startDate, endDate } = getWeekRange(currentWeekOffset);
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    
    return dates;
  };

  const getTopicForDate = (date) => {
    return topics.find(topic => topic.date === date);
  };

  const clearErrors = () => {
    setErrors({});
  };

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayTopic = topics.find(t => t.date === today);
    const thisWeekTopics = getWeekDates().filter(date => 
      topics.some(t => t.date === date)
    ).length;
    
    return {
      hasToday: !!todayTopic,
      weekProgress: thisWeekTopics,
      totalTopics: topics.length
    };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const weekDates = getWeekDates();
  const { startDate, endDate } = getWeekRange(currentWeekOffset);
  const stats = getTodayStats();

  return (
    <div className="space-y-6">
      {/* Header with Gradient */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              <FaGraduationCap className="mr-3" />
              Daily Learning Journey
            </h1>
            <p className="text-blue-100">Track your daily study topics and build consistent learning habits</p>
          </div>
          <Button
  onClick={() => setShowAddModal(true)}
  className="bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 font-semibold shadow-md"
>
  <FaPlus className="mr-2" />
  Add Today's Topic
</Button>

        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center animate-fade-in">
          <FaCheckCircle className="text-green-500 mr-3 text-xl" />
          <span className="text-green-700 font-medium">{successMessage}</span>
        </div>
      )}

      {/* Error Display */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <FaExclamationCircle className="text-red-400 mr-3 text-xl" />
            <div className="text-sm text-red-700 flex-1">
              {Object.values(errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
            <button
              onClick={clearErrors}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <FaTimes />
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-md p-5 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Today's Status</p>
              <p className="text-2xl font-bold text-gray-800">
                {stats.hasToday ? 'Completed' : 'Pending'}
              </p>
            </div>
            <div className={`p-3 rounded-full ${stats.hasToday ? 'bg-green-100' : 'bg-yellow-100'}`}>
              {stats.hasToday ? 
                <FaCheckCircle className="text-green-600 text-2xl" /> :
                <FaClock className="text-yellow-600 text-2xl" />
              }
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-5 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">This Week</p>
              <p className="text-2xl font-bold text-gray-800">{stats.weekProgress}/5</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <FaCalendarAlt className="text-purple-600 text-2xl" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-5 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Topics</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalTopics}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <FaLightbulb className="text-green-600 text-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <Card className="shadow-lg">
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
              className="flex items-center px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <FaChevronLeft className="mr-2" />
              Previous Week
            </button>
            
            <div className="text-center">
              <h3 className="font-bold text-xl text-gray-800">
                {formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}
              </h3>
              {currentWeekOffset === 0 && (
                <span className="inline-block mt-1 px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded-full">
                  Current Week
                </span>
              )}
            </div>
            
            <button
              onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                currentWeekOffset >= 0 
                  ? 'text-gray-400 cursor-not-allowed' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50'
              }`}
              disabled={currentWeekOffset >= 0}
            >
              Next Week
              <FaChevronRight className="ml-2" />
            </button>
          </div>

          {/* Week Grid with Enhanced UI */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {weekDates.map(date => {
              const topic = getTopicForDate(date);
              const isToday = date === new Date().toISOString().split('T')[0];
              const isFuture = isFutureDate(date);
              const dayName = getWeekdayName(date);
              const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
              
              return (
                <div
                  key={date}
                  className={`relative p-4 rounded-xl transition-all hover:shadow-lg ${
                    isToday ? 'bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-400 shadow-md' : 
                    isFuture ? 'bg-gray-50 border border-gray-200' :
                    topic ? 'bg-green-50 border border-green-300' :
                    isWeekend ? 'bg-orange-50 border border-orange-200' :
                    'bg-white border border-gray-300 hover:border-blue-300'
                  }`}
                >
                  {isToday && (
                    <div className="absolute -top-2 -right-2">
                      <span className="flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500"></span>
                      </span>
                    </div>
                  )}
                  
                  <div className={`text-sm font-bold mb-1 ${
                    isToday ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {dayName}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    {formatDateForDisplay(date)}
                  </div>
                  
                  {topic ? (
                    <div className="space-y-2">
                      <div className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <div className="text-sm text-gray-800 font-medium break-words">
                          {topic.topic}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      {isFuture ? (
                        <div className="text-gray-400">
                          <FaClock className="mx-auto mb-1" />
                          <p className="text-xs">Upcoming</p>
                        </div>
                      ) : isToday ? (
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <FaPlus className="mx-auto mb-1" />
                          <p className="text-xs font-semibold">Add Topic</p>
                        </button>
                      ) : (
                        <div className="text-gray-400">
                          <FaBook className="mx-auto mb-1 opacity-50" />
                          <p className="text-xs">No topic</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Recent Topics with Enhanced Design */}
      <Card className="shadow-lg">
        <div className="flex items-center mb-4">
          <FaBook className="text-purple-600 mr-3 text-xl" />
          <h2 className="text-xl font-bold text-gray-800">Recent Learning Topics</h2>
        </div>
        
        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
          {topics.slice(0, 10).map((topic, index) => (
            <div 
              key={topic._id} 
              className="flex items-start p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex-shrink-0 mr-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-gray-800 mb-1">
                  {topic.topic}
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <FaCalendarAlt className="mr-1" />
                  {formatDateForDisplay(topic.date)} • {getWeekdayName(topic.date)}
                </div>
              </div>
            </div>
          ))}
          
          {topics.length === 0 && (
            <div className="text-center py-12">
              <FaGraduationCap className="mx-auto mb-4 text-6xl text-gray-300" />
              <p className="text-xl font-semibold text-gray-600 mb-2">Start Your Learning Journey</p>
              <p className="text-gray-500">Add your first topic to begin tracking your daily progress!</p>
            </div>
          )}
        </div>
      </Card>

      {/* Add Topic Modal with Enhanced Design */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setNewTopic({
            date: new Date().toISOString().split('T')[0],
            topic: ''
          });
          clearErrors();
        }}
        title="Add Your Study Topic"
      >
        <div className="space-y-5">
          <div className="bg-blue-50 rounded-lg p-4 flex items-start">
            <FaLightbulb className="text-blue-500 mr-3 mt-1 text-xl" />
            <p className="text-sm text-blue-700">
              Record what you learned today. Be specific about the topics or concepts you studied.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <FaCalendarAlt className="inline mr-2" />
              Study Date
            </label>
           <div className="p-3 bg-gray-100 rounded-lg text-gray-700 text-sm">
  {formatDateForDisplay(new Date().toISOString().split('T')[0])}
</div>

            {errors.date && (
              <p className="text-sm text-red-600 mt-1 flex items-center">
                <FaExclamationCircle className="mr-1" />
                {errors.date}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <FaBook className="inline mr-2" />
              What did you study today?
            </label>
            <textarea
              value={newTopic.topic}
              onChange={(e) => setNewTopic({...newTopic, topic: e.target.value})}
              placeholder="Example: React Hooks (useState, useEffect), JavaScript Arrays, Database Normalization, etc."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows="3"
              maxLength="200"
            />
            <div className="flex justify-between mt-2">
              {errors.topic && (
                <p className="text-sm text-red-600 flex items-center">
                  <FaExclamationCircle className="mr-1" />
                  {errors.topic}
                </p>
              )}
              <p className="text-xs text-gray-500 ml-auto">
                {newTopic.topic.length}/200 characters
              </p>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                clearErrors();
              }}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddTopic}
              disabled={saving}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6"
            >
              {saving ? (
                <span className="flex items-center">
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center">
                  <FaCheckCircle className="mr-2" />
                  Save Topic
                </span>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default DailyTopics;