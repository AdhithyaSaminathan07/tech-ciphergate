import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import api from '../../services/api';
import { getWorkers } from '../../services/workerService';
import { getWeeklyTopicsAdmin } from '../../services/dailyTopicService';
import Button from '../../components/common/Button';
import {
  Plus, X, BookOpen, UserCheck, Settings, ChevronDown, ChevronUp,
  Search, Users, Clock, Zap, Target, Calendar, AlertCircle, CheckCircle,
  Filter, RefreshCw, Download, AlertTriangle, Loader2
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import appContext from '../../context/AppContext';

// --- UI Components from Template ---

const ProgressIndicator = ({ progress, onCancel, selectedWorkers, numQuestions = 10 }) => {
  if (!progress.isGenerating && progress.percentage < 100) return null;

  const isFinished = !progress.isGenerating && progress.percentage === 100;
  
  // Get real-time worker completion data
  const completedWorkers = progress.details?.completedWorkers || progress.result?.results?.length || 0;
  const failedWorkers = progress.details?.failedWorkers || progress.result?.failedWorkers?.length || 0;
  const processedWorkers = completedWorkers + failedWorkers;
  const totalWorkers = selectedWorkers?.length || progress.details?.totalWorkers || 0;
  
  // Calculate questions generated and target questions more accurately
  let questionsGenerated = 0;
  let targetQuestions = 0;
  
  if (progress.result) {
    // Get total questions generated from the result
    questionsGenerated = progress.result.totalQuestionsGenerated || 0;
    
    // Calculate target questions based on selected workers and numQuestions
    // This is more accurate than trying to parse from results
    targetQuestions = totalWorkers * (progress.result.results?.[0]?.targetQuestions || numQuestions);
  }

  return (
    <Motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed bottom-6 right-6 bg-white rounded-2xl shadow-2xl p-6 z-50 w-full max-w-md border-t-4 border-green-500"
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-gray-800 text-lg">
          {isFinished ? 'Generation Complete!' : 'Generation In Progress'}
        </h4>
        <div className="flex items-center space-x-2">
          {isFinished ? (
            <CheckCircle className="text-green-600" size={24} />
          ) : (
            <Loader2 className="animate-spin text-green-600" size={24} />
          )}
          <button 
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm font-medium text-gray-600 mb-1">
            <span>Overall Progress</span>
            <span className="font-semibold text-green-700">{Math.round(progress.percentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-green-400 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>
        
        {/* Real-time worker completion display */}
        <div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Employees Processed</span>
            <span className="font-semibold">
              {processedWorkers}/{totalWorkers} 
              {completedWorkers > 0 && (
                <span className="text-green-600 ml-1">({completedWorkers} completed)</span>
              )}
              {failedWorkers > 0 && (
                <span className="text-red-600 ml-1">({failedWorkers} failed)</span>
              )}
            </span>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Questions Generated</span>
            <span className="font-semibold">{questionsGenerated}/{targetQuestions > 0 ? targetQuestions : (totalWorkers * numQuestions)}</span>
          </div>
        </div>
      </div>

      {/* Show recently completed workers */}
      {progress.details?.completedWorkers && progress.details.completedWorkers.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto">
          <div className="text-xs text-gray-500 font-medium mb-1">Recently completed:</div>
          {progress.details.completedWorkers.slice(-3).map((worker, index) => (
            <div key={index} className="text-xs text-green-600 flex justify-between">
              <span>{worker.workerName}</span>
              <span>{worker.questionsGenerated} questions</span>
            </div>
          ))}
        </div>
      )}

      {failedWorkers > 0 && (
        <div className="mt-3 text-xs text-red-600 font-semibold">
          {failedWorkers} employee(s) encountered an issue.
        </div>
      )}
      
      <div className="flex justify-between mt-4">
        <p className="text-xs text-gray-500">
          {isFinished ? 'Process finished. Closing in 5 seconds...' : 
           'This is running in the background. You can navigate away from this page.'}
        </p>
        {progress.isGenerating && (
          <button 
            onClick={onCancel}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Cancel
          </button>
        )}
      </div>
    </Motion.div>
  );
};

const Card = ({ title, children, icon: Icon, className = "", headerActions }) => (
  <Motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.1 }}
    className={`bg-white rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 ${className}`}>
   <div className="p-4 md:p-6 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
         {Icon && <Icon className="text-gray-600 mr-3" size={24} />}
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        </div>
        {headerActions && <div className="flex items-center space-x-2">{headerActions}</div>}
      </div>
    </div>
    <div className="p-4 md:p-6">{children}</div>
  </Motion.div>
);

const Alert = ({ type, message, onClose }) => {
  const bgColor = type === 'error' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200';
  const textColor = type === 'error' ? 'text-red-700' : 'text-green-700';
  const iconColor = type === 'error' ? 'text-red-500' : 'text-green-500';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;

  if (!message) return null;

  return (
    <Motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`${bgColor} border rounded-xl p-4 mb-6 flex items-start gap-3`}
    >
      <Icon className={`${iconColor} mt-0.5 flex-shrink-0`} size={20} />
      <div className="flex-1">
        <p className={`${textColor} text-sm leading-relaxed`}>{message}</p>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className={`${iconColor} hover:opacity-70`}>
          <X size={16} />
        </button>
      )}
    </Motion.div>
  );
};

const Loader = () => (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-green-500" />
    </div>
);


// --- Main Component ---
const GenerateQuestions = () => {
  // --- State Management (Original) ---
  const [workers, setWorkers] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(''); // Added department filter state
  const [topicMode, setTopicMode] = useState('common');
  const [commonTopics, setCommonTopics] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('Medium');
  const [timeDuration, setTimeDuration] = useState(60);
  const [totalTestDuration, setTotalTestDuration] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manualTopics, setManualTopics] = useState({});
  const [individualTopics, setIndividualTopics] = useState({});
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
  const [showTopicDetails, setShowTopicDetails] = useState(false);
  const { subdomain } = useContext(appContext);
  const [generationProgress, setGenerationProgress] = useState({
    isGenerating: false,
    percentage: 0,
    result: null,
    onClose: null
  });
  const [jobId, setJobId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [questionFormat, setQuestionFormat] = useState('mcq'); // Add question format state here
  const cancelRef = useRef(false);

  const dropdownRef = useRef(null);

  // --- Computed Values (Original) ---
  const filteredWorkers = useMemo(() => {
    return workers.filter(worker => {
      const searchTermLower = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchTermLower ||
        (worker.name && worker.name.toLowerCase().includes(searchTermLower)) ||
        (worker.email && worker.email.toLowerCase().includes(searchTermLower)) ||
        (worker.username && worker.username.toLowerCase().includes(searchTermLower));
      
      // Add department filter
      const matchesDepartment = !departmentFilter || worker.department === departmentFilter;
      
      return matchesSearch && matchesDepartment;
    });
  }, [workers, searchTerm, departmentFilter]);

  // Extract unique departments for filtering
  const uniqueDepartments = useMemo(() => {
    const deptSet = new Set(workers.map(worker => worker.department).filter(Boolean));
    return Array.from(deptSet).sort();
  }, [workers]);
  
  // Calculate department counts for UI
  const departmentCounts = useMemo(() => {
    const counts = {};
    workers.forEach(worker => {
      if (worker.department) {
        counts[worker.department] = (counts[worker.department] || 0) + 1;
      }
    });
    return counts;
  }, [workers]);
  
  // Calculate selected workers per department
  const selectedByDepartment = useMemo(() => {
    const counts = {};
    if (selectedWorkers.length === 0) return counts;
    
    selectedWorkers.forEach(workerId => {
      const worker = workers.find(w => w._id === workerId);
      if (worker?.department) {
        counts[worker.department] = (counts[worker.department] || 0) + 1;
      }
    });
    return counts;
  }, [selectedWorkers, workers]);

  // --- Effects (Original) ---
  useEffect(() => {
    fetchWorkers();
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    setDateRange({
      startDate: startOfWeek.toISOString().split('T')[0],
      endDate: endOfWeek.toISOString().split('T')[0]
    });
  }, []);

  useEffect(() => {
    if (workers.length > 0) {
      // Extract unique departments is now handled by the uniqueDepartments memo
    }
  }, [workers]);
  
  useEffect(() => {
    if (topicMode === 'individual' && selectedWorkers.length > 0) {
      loadIndividualTopics();
    }
  }, [selectedWorkers, dateRange, topicMode]);

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setShowWorkerDropdown(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-close progress indicator after 5 seconds when generation is complete
  useEffect(() => {
    let timer;
    if (!generationProgress.isGenerating && generationProgress.percentage === 100) {
      timer = setTimeout(() => {
        setGenerationProgress(prev => ({ ...prev, percentage: 0, isGenerating: false }));
      }, 5000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [generationProgress.isGenerating, generationProgress.percentage]);

  // --- Authentication Check (Original) ---
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [isAuthorized, setIsAuthorized] = useState(user && user.role === 'admin');
  
  // Update authorization when user changes
  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAuthorized(currentUser && currentUser.role === 'admin');
  }, []);

  // --- API Functions (Original) ---
  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const workersData = await getWorkers({ subdomain });
      // Ensure department information is properly handled
      const transformedWorkers = Array.isArray(workersData) ? workersData.map(worker => ({
        ...worker,
        department: worker.department || 'N/A'
      })) : [];
      setWorkers(transformedWorkers);
    } catch (err) {
      console.error('Failed to load employees:', err);
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const loadIndividualTopics = async () => {
    if (!dateRange.startDate || !dateRange.endDate) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user || user.role !== 'admin') {
      setError('Admin privileges required to load individual topics.');
      return;
    }
    try {
      setLoadingTopics(true);
      const promises = selectedWorkers.map(async (workerId) => {
        try {
          const data = await getWeeklyTopicsAdmin({
            workerId,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            subdomain
          });
          return { workerId, data };
        } catch (err) {
          console.error(`Failed to load topics for worker ${workerId}:`, err);
          return { workerId, data: { topics: [], workerName: workers.find(w => w._id === workerId)?.name || 'Unknown' } };
        }
      });
      const results = await Promise.all(promises);
      const topicsMap = {};
      results.forEach(({ workerId, data }) => {
        const topicStrings = (data.topics || [])
          .filter(item => item.topic && item.topic.topic)
          .map(item => item.topic.topic);
        topicsMap[workerId] = {
          topics: topicStrings,
          workerName: data.workerName || workers.find(w => w._id === workerId)?.name || 'Unknown'
        };
      });
      setIndividualTopics(topicsMap);
    } catch (err) {
      console.error('Failed to load individual topics:', err);
      if (err.response?.status === 403) {
        setError('Access denied. Admin privileges required to load employee topics.');
      } else {
        setError('Failed to load individual topics');
      }
    } finally {
      setLoadingTopics(false);
    }
  };

  // --- Event Handlers (Original) ---
  const handleWorkerSelect = (workerId) => {
    setSelectedWorkers(prev => prev.includes(workerId) ? prev.filter(id => id !== workerId) : [...prev, workerId]);
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredWorkers.map(w => w._id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedWorkers.includes(id));
    if (allSelected) {
      setSelectedWorkers(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedWorkers(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const removeSelectedWorker = (workerId) => {
    setSelectedWorkers(prev => prev.filter(id => id !== workerId));
    setManualTopics(prev => {
      const newTopics = { ...prev };
      delete newTopics[workerId];
      return newTopics;
    });
  };

  const clearAllSelected = () => {
    setSelectedWorkers([]);
    setManualTopics({});
    setIndividualTopics({});
  };

  const handleDepartmentFilter = (department) => {
    setDepartmentFilter(department);
  };

  const selectAllFromDepartment = (department) => {
    const departmentWorkerIds = workers
      .filter(w => w.department === department)
      .map(w => w._id);
    
    setSelectedWorkers(prev => {
      // Check if all workers from this department are already selected
      const allSelected = departmentWorkerIds.every(id => prev.includes(id));
      
      if (allSelected) {
        // If all are selected, remove them all
        return prev.filter(id => !departmentWorkerIds.includes(id));
      } else {
        // Otherwise, add any that are not already selected
        return [...new Set([...prev, ...departmentWorkerIds])];
      }
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
  };

  const handleManualTopicChange = (workerId, topics) => {
    setManualTopics(prev => ({ ...prev, [workerId]: topics }));
  };

  const validateForm = () => {
    if (selectedWorkers.length === 0) {
      setError('Please select at least one employee.');
      return false;
    }
    if (topicMode === 'common' && !commonTopics.trim()) {
      setError('Please enter common topics.');
      return false;
    }
    if (!numQuestions || numQuestions < 1) {
      setError('Please enter a valid number of questions.');
      return false;
    }
    return true;
  };
  
  const handleGenerate = async () => {
    setError('');
    setMessage('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token');
    if (!user || user.role !== 'admin') {
      setError('Access denied. This feature requires admin privileges. Please log in as admin.');
      return;
    }
    if (!token) {
      setError('Authentication required. Please log in again.');
      return;
    }
    if (!validateForm()) return;
    
    try {
      const payload = {
        workerIds: selectedWorkers,
        numQuestions: parseInt(numQuestions),
        difficulty,
        timeDuration: parseInt(timeDuration),
        totalTestDuration: parseInt(totalTestDuration),
        topicMode,
        questionFormat, // Add question format to payload
        totalWorkers: selectedWorkers.length,
        totalQuestions: selectedWorkers.length * parseInt(numQuestions)
      };
      if (topicMode === 'common') {
        // For common mode, use the topic as entered by the admin
        // Send both for backward compatibility
        payload.topic = commonTopics;
        payload.commonTopics = commonTopics.split(',').map(t => t.trim()).filter(Boolean);
      } else {
        payload.individualTopics = {};
        selectedWorkers.forEach(workerId => {
          const dbTopics = individualTopics[workerId]?.topics || [];
          const manual = manualTopics[workerId] || '';
          const manualArray = manual.split(',').map(t => t.trim()).filter(Boolean);
          payload.individualTopics[workerId] = [...dbTopics, ...manualArray];
        });
      }
      
      // Start generation and get job ID
      const response = await api.post('/test/questions/generate', payload);
      
      if (response.data.jobId) {
        setJobId(response.data.jobId);
        setIsPolling(true);
        setGenerationProgress({
          isGenerating: true,
          percentage: 0,
          result: null,
          totalWorkers: selectedWorkers.length, // Pass total workers for progress display
          totalQuestions: selectedWorkers.length * parseInt(numQuestions), // Pass total questions for progress display
          onClose: () => setGenerationProgress(prev => ({ ...prev, percentage: 0, isGenerating: false }))
        });
      } else {
        throw new Error('Failed to start generation job');
      }
    } catch (err) {
      console.error('Question generation error:', err);
      setGenerationProgress({ isGenerating: false, percentage: 0, result: null, onClose: null });
      let errorMessage = 'Failed to generate questions.';
      if (err.response?.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
        setTimeout(() => { window.location.href = '/admin/login'; }, 2000);
      } else if (err.response?.status === 403) {
        errorMessage = 'Access denied. This feature requires admin privileges.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    }
  };

  // Poll for job status
  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      // Early return if not polling or no jobId
      if (!jobId || !isPolling) return;

      try {
        const res = await api.get(`/jobs/status/${jobId}`);
        if (!res.data) {
          console.warn(`Job ${jobId} not found. Stopping polling.`);
          setIsPolling(false);
          setJobId(null);
          return;
        }

        const { state, progress, reason, returnValue, completedWorkers = [], failedWorkers = [], totalWorkers = 0 } = res.data;
        
        // Enhanced progress tracking with more detailed information
        const enhancedProgress = {
          isGenerating: true,
          percentage: progress || 0,
          result: returnValue,
          state: state,
          details: {
            completedWorkers: completedWorkers.length || returnValue?.results?.length || 0,
            failedWorkers: failedWorkers.length || returnValue?.failedWorkers?.length || 0,
            totalWorkers: totalWorkers || selectedWorkers.length,
            recentlyCompleted: completedWorkers.slice(-3) // Last 3 completed workers
          }
        };
        
        setGenerationProgress(enhancedProgress);

        if (state === 'completed' || state === 'failed') {
          setIsPolling(false);
          setJobId(null);
          setGenerationProgress(prev => ({
            ...prev,
            isGenerating: false,
            percentage: 100,
            result: returnValue,
            state: state
          }));
          
          if (state === 'completed') {
            const failedCount = returnValue?.failedWorkers?.length || 0;
            if (failedCount > 0) {
               const failedNames = returnValue.failedWorkers.map(fw => fw.workerName).join(', ');
               setMessage(`Generation completed, but failed for: ${failedNames}.`);
            } else {
              setMessage('All questions generated successfully!');
            }
          } else {
            setError(`Job failed: ${reason || 'An unknown error occurred.'}`);
          }
        }
      } catch (err) {
        setError('Could not get job status.');
        setIsPolling(false);
        setJobId(null);
      }
    };

    // Only start polling if we have a jobId and are polling
    // Increase polling frequency for more real-time updates
    if (jobId && isPolling) {
      checkStatus(); 
      intervalId = setInterval(checkStatus, 1000); // Poll every second for more real-time updates
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobId, isPolling]);

  // Function to cancel generation
  const handleCancelGeneration = () => {
    cancelRef.current = true;
    setGenerationProgress({ isGenerating: false, percentage: 0, result: null, onClose: null });
    setIsPolling(false);
    setJobId(null);
    setMessage('Generation process cancelled.');
  };

  if (loading) return <Loader />;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-md mx-auto text-center">
          <div className="bg-red-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">This feature requires admin privileges. You are currently not logged in as an admin.</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/admin/login'}
              className="w-full bg-gray-700 text-white py-2.5 px-4 rounded-lg hover:bg-gray-800 transition-colors font-semibold"
            >
              Login as Admin
            </button>
            <button
              onClick={() => window.location.href = '/worker/dashboard'}
              className="w-full bg-gray-100 text-gray-700 py-2.5 px-4 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
            >
              Go to Worker Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
   <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-4 md:py-8">
        <AnimatePresence>
            {(generationProgress.isGenerating || generationProgress.percentage > 0) && (
              <ProgressIndicator 
                progress={generationProgress} 
                onCancel={handleCancelGeneration}
                selectedWorkers={selectedWorkers}
                numQuestions={parseInt(numQuestions)}
              />
            )}
        </AnimatePresence>

        <div className="text-center mb-4 md:mb-8">
            <h1 className="text-2xl md:text-4xl font-bold text-gray-800 mb-2 md:mb-4">
                AI Question Generator
            </h1>
            <p className="text-gray-600 text-sm md:text-lg">Create intelligent assessments for your employees with advanced AI</p>
        </div>
        
        <AnimatePresence>
            <Alert type="error" message={error} onClose={() => setError('')} />
        </AnimatePresence>
        <AnimatePresence>
            <Alert type="success" message={message} onClose={() => setMessage('')} />
        </AnimatePresence>
        
        <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="space-y-4 md:space-y-8">
            <Card title="Step 1: Select Employees" icon={UserCheck}>
                <div className="space-y-3">
                    <AnimatePresence>
                        {selectedWorkers.length > 0 && (
                            <Motion.div 
                                initial={{ opacity: 0, height: 0 }} 
                                animate={{ opacity: 1, height: 'auto' }} 
                                exit={{ opacity: 0, height: 0 }} 
                                className="bg-green-50 border border-green-200 rounded-xl p-4 overflow-hidden"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center">
                                        <UserCheck className="text-green-600 mr-2" size={18} />
                                        <span className="text-sm font-semibold text-green-800">Selected Employees ({selectedWorkers.length})</span>
                                    </div>
                                    <button type="button" onClick={clearAllSelected} className="text-green-600 hover:text-red-600 transition-colors text-sm font-medium">Clear All</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedWorkers.map(workerId => {
                                        const worker = workers.find(w => w._id === workerId);
                                        return (
                                            <span key={workerId} className="inline-flex items-center bg-green-100 text-green-800 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-green-200 transition-colors">
                                                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                                {worker?.name || 'Unknown'} ({worker?.department || 'N/A'})
                                                <button type="button" onClick={() => removeSelectedWorker(workerId)} className="ml-2 text-green-600 hover:text-red-600 transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            </Motion.div>
                        )}
                    </AnimatePresence>
                    <div className="relative" ref={dropdownRef}>
                        <div 
                            className={`p-4 border-2 rounded-xl cursor-pointer flex items-center justify-between min-h-[60px] transition-all duration-200 hover:border-green-300 ${error && selectedWorkers.length === 0 ? 'border-red-300 bg-red-50' : showWorkerDropdown ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`} 
                            onClick={() => setShowWorkerDropdown(!showWorkerDropdown)}
                        >
                            <div className="flex items-center">
                                <Users className="text-gray-500 mr-3" size={20} />
                                <span className={selectedWorkers.length > 0 ? 'text-gray-700' : 'text-gray-400'}>
                                    {selectedWorkers.length > 0 ? `${selectedWorkers.length} employee${selectedWorkers.length > 1 ? 's' : ''} selected` : 'Click to select employees...'}
                                </span>
                            </div>
                            <ChevronDown size={20} className={`transition-transform duration-200 ${showWorkerDropdown ? 'rotate-180 text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <AnimatePresence>
                            {showWorkerDropdown && (
                                <Motion.div 
                                    initial={{ opacity: 0, y: -10 }} 
                                    animate={{ opacity: 1, y: 0 }} 
                                    exit={{ opacity: 0, y: -10 }} 
                                    className="absolute top-full left-0 z-50 w-full bg-white border border-gray-200 rounded-xl shadow-2xl mt-2 overflow-hidden"
                                >
                                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                        <div className="space-y-3">
                                            <div className="relative">
                                                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                <input type="text" placeholder="Search by name or email..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                            </div>
                                            
                                            {/* Department Filter UI */}
                                            <div className="flex flex-col">
                                                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                                                    <Filter size={16} className="mr-2 text-gray-500" />
                                                    Filter by Department
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDepartmentFilter('')}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center ${
                                                            departmentFilter === '' 
                                                            ? 'bg-green-500 text-white' 
                                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                        }`}
                                                    >
                                                        All Departments
                                                        <span className="ml-1.5 bg-white bg-opacity-20 px-1.5 py-0.5 rounded-full text-xs">
                                                            {workers.length}
                                                        </span>
                                                    </button>
                                                    
                                                    {uniqueDepartments.map(dept => {
                                                        const deptCount = departmentCounts[dept] || 0;
                                                        const selectedCount = selectedByDepartment[dept] || 0;
                                                        const allSelected = selectedCount === deptCount;
                                                        const partiallySelected = selectedCount > 0 && selectedCount < deptCount;
                                                        
                                                        return (
                                                            <div key={dept} className="relative group">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDepartmentFilter(dept)}
                                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center group-hover:pr-8 ${
                                                                        departmentFilter === dept 
                                                                        ? 'bg-green-500 text-white' 
                                                                        : partiallySelected
                                                                          ? 'bg-green-100 text-green-800 border border-green-300'
                                                                          : allSelected
                                                                            ? 'bg-green-200 text-green-800 border border-green-300'
                                                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                                    }`}
                                                                >
                                                                    {dept}
                                                                    <span className="ml-1.5 bg-white bg-opacity-20 px-1.5 py-0.5 rounded-full text-xs flex items-center">
                                                                        {selectedCount > 0 && (
                                                                            <span className="mr-1 font-bold">{selectedCount}/</span>
                                                                        )}
                                                                        {deptCount}
                                                                    </span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => selectAllFromDepartment(dept)}
                                                                    className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-green-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                                                                    title={allSelected ? `Deselect all from ${dept}` : `Select all from ${dept}`}
                                                                >
                                                                    {allSelected ? '-' : '+'}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {(departmentFilter || searchTerm) && (
                                                    <button
                                                        type="button"
                                                        onClick={clearFilters}
                                                        className="text-xs text-green-600 hover:text-green-800 mt-2 self-end font-medium"
                                                    >
                                                        Clear Filters
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {/* Department Stats */}
                                            <div className="border-t pt-2 mt-2">
                                                <div className="flex justify-between items-center text-xs text-gray-500">
                                                    <span>
                                                        {departmentFilter ? 
                                                            `${filteredWorkers.length} employee(s) in ${departmentFilter}` : 
                                                            `${filteredWorkers.length} employee(s) in ${uniqueDepartments.length} department(s)`
                                                        }
                                                    </span>
                                                    <span className="font-medium text-green-600">
                                                        {selectedWorkers.length} selected
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-3 border-b border-gray-100 bg-blue-50">
                                        <label className="flex items-center cursor-pointer hover:bg-blue-100 p-2 rounded-lg transition-colors">
                                            <input type="checkbox" checked={filteredWorkers.length > 0 && filteredWorkers.every(w => selectedWorkers.includes(w._id))} onChange={handleSelectAllFiltered} className="form-checkbox h-5 w-5 text-blue-600 focus:ring-blue-500 rounded border-2" />
                                            <span className="ml-3 font-semibold text-blue-800">Select All Filtered Employees</span>
                                            <span className="ml-2 text-blue-600 text-sm">({filteredWorkers.length})</span>
                                        </label>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto">
                                        {filteredWorkers.length > 0 ? (
                                            departmentFilter ? (
                                                // When a department is selected, show employees from that department
                                                filteredWorkers.map(worker => {
                                                    return (
                                                    <div key={worker._id} className={`border-b border-gray-50 last:border-b-0`}>
                                                        <label className="flex items-center w-full p-4 hover:bg-gray-50 cursor-pointer transition-colors">
                                                            <input type="checkbox" checked={selectedWorkers.includes(worker._id)} onChange={() => handleWorkerSelect(worker._id)} className="form-checkbox h-5 w-5 text-green-600 focus:ring-green-500 rounded border-2" />
                                                            <div className="ml-3 flex-1">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <div className={`font-medium text-gray-900`}>
                                                                            {worker.name}
                                                                        </div>
                                                                        <div className="text-sm text-gray-500">{worker.email || worker.username || ''}</div>
                                                                    </div>
                                                                    {selectedWorkers.includes(worker._id) && <CheckCircle className="text-green-500" size={16} />}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    </div>
                                                    );
                                                })
                                            ) : (
                                                // When no department filter is active, group by department
                                                uniqueDepartments.map(dept => {
                                                    const deptWorkers = filteredWorkers.filter(w => w.department === dept);
                                                    if (deptWorkers.length === 0) return null;
                                                    
                                                    const allSelected = deptWorkers.every(w => selectedWorkers.includes(w._id));
                                                    const someSelected = deptWorkers.some(w => selectedWorkers.includes(w._id));
                                                    
                                                    return (
                                                        <div key={dept} className="border-b border-gray-100">
                                                            <div className="p-2 bg-gray-50 flex items-center justify-between">
                                                                <div className="flex items-center">
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => selectAllFromDepartment(dept)}
                                                                        className={`mr-2 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                                                                            allSelected 
                                                                                ? 'bg-green-500 border-green-500 text-white'
                                                                                : someSelected
                                                                                    ? 'bg-green-100 border-green-500 text-green-500'
                                                                                    : 'border-gray-300 text-gray-400 hover:border-green-500'
                                                                        }`}
                                                                    >
                                                                        {allSelected ? '✓' : someSelected ? '-' : '+'}
                                                                    </button>
                                                                    <span className="font-medium text-gray-800">{dept}</span>
                                                                </div>
                                                                <span className="text-xs text-gray-500">{deptWorkers.length} employees</span>
                                                            </div>
                                                            
                                                            {deptWorkers.map(worker => {
                                                                return (
                                                                <div key={worker._id} className={`border-t border-gray-50 first:border-t-0`}>
                                                                    <label className="flex items-center w-full p-3 pl-8 hover:bg-gray-50 cursor-pointer transition-colors">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={selectedWorkers.includes(worker._id)} 
                                                                            onChange={() => handleWorkerSelect(worker._id)} 
                                                                            className="form-checkbox h-4 w-4 text-green-600 focus:ring-green-500 rounded border-2" 
                                                                        />
                                                                        <div className="ml-3 flex-1">
                                                                            <div className="flex items-center justify-between">
                                                                                <div>
                                                                                    <div className={`font-medium text-gray-900`}>
                                                                                        {worker.name}
                                                                                    </div>
                                                                                    <div className="text-xs text-gray-500">{worker.email || worker.username || ''}</div>
                                                                                </div>
                                                                                {selectedWorkers.includes(worker._id) && <CheckCircle className="text-green-500" size={14} />}
                                                                            </div>
                                                                        </div>
                                                                    </label>
                                                                </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })
                                            )
                                        ) : (
                                            <div className="p-8 text-center text-gray-500">
                                                <Users size={24} className="mx-auto mb-2 opacity-50" />
                                                <p>No employees found matching your search.</p>
                                            </div>
                                        )}
                                    </div>
                                </Motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </Card>

            <Card 
                title="Step 2: Configure Topics" 
                icon={BookOpen} 
                headerActions={
                    <div className="flex items-center space-x-2">
                        <button type="button" onClick={() => setTopicMode('common')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${topicMode === 'common' ? 'bg-[#0d9488] text-white shadow-md' : 'bg-gray-200 text-gray-600 hover:bg-[#0d9488] hover:text-white'}`}>Common Topic</button>
                        <button type="button" onClick={() => setTopicMode('individual')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${topicMode === 'individual' ? 'bg-[#0d9488] text-white shadow-md' : 'bg-gray-200 text-gray-600 hover:bg-[#0d9488] hover:text-white'}`}>Individual Topics</button>
                    </div>
                }
            >
                {topicMode === 'common' && (
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><BookOpen className="mr-2 text-gray-500" size={16} />Enter Common Topic(s)</label>
                        <div className="flex items-center space-x-3">
                            <div className="flex-1 relative">
                                <input type="text" placeholder="e.g., JavaScript, Python (comma-separated)" value={commonTopics} onChange={(e) => setCommonTopics(e.target.value)} className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                        </div>
                    </div>
                )}
                {topicMode === 'individual' && (
                    <div className="space-y-4">
                         <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <h4 className="font-semibold text-blue-800 mb-3 flex items-center"><Calendar className="mr-2" size={18} />Select Date Range for Topics</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="block text-sm font-medium text-blue-700 mb-1">Start Date
                                    <input type="date" value={dateRange.startDate} onChange={e => setDateRange(prev => ({...prev, startDate: e.target.value}))} className="w-full mt-1 p-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </label>
                                <label className="block text-sm font-medium text-blue-700 mb-1">End Date
                                    <input type="date" value={dateRange.endDate} onChange={e => setDateRange(prev => ({...prev, endDate: e.target.value}))} className="w-full mt-1 p-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </label>
                            </div>
                            <p className="text-sm text-blue-700 mt-3 bg-blue-100 p-2 rounded-md flex items-center">
                                {loadingTopics ? (
                                    <>
                                        <RefreshCw className="mr-2 animate-spin" size={14} />
                                        Loading topics for selected employees...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2" size={14} /> 
                                        Topics will be automatically loaded for selected employees
                                    </>
                                )}
                            </p>
                        </div>
                        {/* Individual Topics Display Area */}
                        {selectedWorkers.length > 0 && Object.keys(individualTopics).length > 0 && (
                            <div className="border border-gray-200 rounded-lg mt-4">
                                <div onClick={() => setShowTopicDetails(!showTopicDetails)} className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200 cursor-pointer">
                                    <span className="font-medium">View/Edit Topics for {selectedWorkers.length} Employees</span>
                                    {showTopicDetails ? <ChevronUp /> : <ChevronDown />}
                                </div>
                                <AnimatePresence>
                                    {showTopicDetails && (
                                        <Motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden p-4 space-y-4">
                                            {selectedWorkers.map(workerId => {
                                                const worker = workers.find(w => w._id === workerId);
                                                const dbTopics = individualTopics[workerId]?.topics || [];
                                                return (
                                                    <div key={workerId} className={`border rounded-lg p-4 ${(dbTopics.length === 0 && !(manualTopics[workerId] || '').trim()) ? 'bg-orange-50 border-orange-200' : ''}`}>
                                                        <p className="font-semibold">
                                                            {worker?.name || 'Unknown'} ({worker?.department || 'N/A'})
                                                            {(dbTopics.length === 0 && !(manualTopics[workerId] || '').trim()) && (
                                                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                                    No topics
                                                                </span>
                                                            )}
                                                        </p>
                                                        {dbTopics.length > 0 && (
                                                            <div className="my-2">
                                                                <h4 className="text-sm font-medium text-gray-700 mb-2">Database Topics:</h4>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {dbTopics.map((topic, idx) => <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{topic}</span>)}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <input 
                                                            type="text"
                                                            placeholder="Add more topics, comma-separated"
                                                            value={manualTopics[workerId] || ''}
                                                            onChange={(e) => handleManualTopicChange(workerId, e.target.value)}
                                                            className="w-full mt-2 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </Motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            <Card title="Step 3: Question Configuration" icon={Settings}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Target className="mr-2 text-gray-500" size={16} />Questions Per Employee</label>
                        <input type="number" min="1" max="100" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                        <p className="text-xs text-gray-500 mt-1">Each employee gets {numQuestions} questions</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Zap className="mr-2 text-gray-500" size={16} />Difficulty Level</label>
                        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Clock className="mr-2 text-gray-500" size={16} />Time per Question (sec)</label>
                        <input type="number" min="10" max="300" value={timeDuration} onChange={(e) => setTimeDuration(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Clock className="mr-2 text-gray-500" size={16} />Total Test Duration (min)</label>
                        <input type="number" min="1" max="120" value={totalTestDuration} onChange={(e) => setTotalTestDuration(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                        <p className="text-xs text-gray-500 mt-1">e.g., 10 for 10 minutes</p>
                    </div>
                    {/* New Question Format Toggle */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center"><Settings className="mr-2 text-gray-500" size={16} />Question Format</label>
                        <div className="flex space-x-2">
                            <button
                                type="button"
                                onClick={() => setQuestionFormat('mcq')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    questionFormat === 'mcq' 
                                        ? 'bg-[#0d9488] text-white shadow-md' 
                                        : 'bg-gray-200 text-gray-600 hover:bg-[#0d9488] hover:text-white'
                                }`}
                            >
                                MCQ Type
                            </button>
                            <button
                                type="button"
                                onClick={() => setQuestionFormat('upsc')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    questionFormat === 'upsc' 
                                        ? 'bg-[#0d9488] text-white shadow-md' 
                                        : 'bg-gray-200 text-gray-600 hover:bg-[#0d9488] hover:text-white'
                                }`}
                            >
                                UPSC/GK Style
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {questionFormat === 'mcq' 
                                ? 'Standard multiple-choice questions' 
                                : 'Structured statements with reasoning'}
                        </p>
                    </div>
                </div>
            </Card>

            <div className="flex justify-center space-x-4">
                <Button type="submit" disabled={generationProgress.isGenerating || selectedWorkers.length === 0} className="px-12 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xl font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 flex items-center">
                    {generationProgress.isGenerating ? (<><RefreshCw className="mr-3 animate-spin" size={24} /> Generating...</>) : (<><Zap className="mr-3" size={24} /> Generate AI Questions</>)}
                </Button>
            </div>
            
            {selectedWorkers.length === 0 && (
                <p className="text-center text-gray-500 mt-4">Please select at least one employee to continue</p>
            )}
        </form>
      </div>
    </div>
  );
};

export default GenerateQuestions;