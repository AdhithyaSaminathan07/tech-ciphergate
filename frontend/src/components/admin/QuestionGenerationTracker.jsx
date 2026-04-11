// Question Generation Tracker Component
import React, { useState, useEffect } from 'react';
import { 
  FaTimes, 
  FaCheckCircle, 
  FaClock, 
  FaExclamationCircle,
  FaRobot,
  FaChevronDown,
  FaChevronUp,
  FaUser
} from 'react-icons/fa';

const QuestionGenerationTracker = ({ 
  isVisible, 
  onClose, 
  generationData = null,
  isGenerating = false 
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [progress, setProgress] = useState({
    totalEmployees: 0,
    processedEmployees: 0,
    totalQuestions: 0,
    generatedQuestions: 0,
    employees: []
  });

  // Update progress when generationData changes
  useEffect(() => {
    if (generationData) {
      const totalEmployees = generationData.employees?.length || 0;
      const processedEmployees = generationData.employees?.filter(emp => 
        emp.status === 'completed' || emp.status === 'failed'
      ).length || 0;
      
      const totalQuestions = generationData.employees?.reduce((sum, emp) => 
        sum + (emp.expectedQuestions || 0), 0
      ) || 0;
      
      const generatedQuestions = generationData.employees?.reduce((sum, emp) => 
        sum + (emp.generatedQuestions || 0), 0
      ) || 0;

      setProgress({
        totalEmployees,
        processedEmployees,
        totalQuestions,
        generatedQuestions,
        employees: generationData.employees || []
      });
    }
  }, [generationData]);

  // Auto-close when generation is complete
  useEffect(() => {
    if (!isGenerating && progress.processedEmployees === progress.totalEmployees && progress.totalEmployees > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto-close after 5 seconds when complete
      
      return () => clearTimeout(timer);
    }
  }, [isGenerating, progress, onClose]);

  if (!isVisible) return null;

  const overallProgress = progress.totalEmployees > 0 
    ? Math.round((progress.processedEmployees / progress.totalEmployees) * 100) 
    : 0;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <FaCheckCircle className="text-green-500" />;
      case 'in-progress':
        return <FaClock className="text-orange-500 animate-pulse" />;
      case 'failed':
        return <FaExclamationCircle className="text-red-500" />;
      default:
        return <FaClock className="text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 border-green-300';
      case 'in-progress':
        return 'bg-orange-100 border-orange-300';
      case 'failed':
        return 'bg-red-100 border-red-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const getProgressBarColor = (percentage) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`bg-white rounded-lg shadow-2xl border border-gray-200 transition-all duration-300 ${
        isMinimized ? 'w-80' : 'w-96'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-lg">
          <div className="flex items-center space-x-2">
            <FaRobot className="text-lg" />
            <span className="font-semibold">Question Generation</span>
            {isGenerating && (
              <div className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-white hover:text-blue-200 transition-colors"
            >
              {isMinimized ? <FaChevronUp /> : <FaChevronDown />}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-4">
            {/* Overall Progress */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm text-gray-600">{overallProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${getProgressBarColor(overallProgress)}`}
                  style={{ width: `${overallProgress}%` }}
                ></div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-blue-50 p-2 rounded">
                  <div className="text-blue-600 font-semibold">
                    {progress.processedEmployees}/{progress.totalEmployees}
                  </div>
                  <div className="text-blue-500 text-xs">Employees</div>
                </div>
                <div className="bg-purple-50 p-2 rounded">
                  <div className="text-purple-600 font-semibold">
                    {progress.generatedQuestions}/{progress.totalQuestions}
                  </div>
                  <div className="text-purple-500 text-xs">Questions</div>
                </div>
              </div>
            </div>

            {/* Employee List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Employee Progress</span>
                {isGenerating && (
                  <span className="text-xs text-orange-600 animate-pulse">Generating...</span>
                )}
              </div>
              
              <div className={`space-y-2 ${progress.employees.length > 5 ? 'max-h-60 overflow-y-auto' : ''}`}>
                {progress.employees.map((employee, index) => {
                  const empProgress = employee.expectedQuestions > 0 
                    ? Math.round((employee.generatedQuestions / employee.expectedQuestions) * 100) 
                    : 0;
                  
                  return (
                    <div 
                      key={employee.id || index}
                      className={`p-3 rounded-lg border transition-all ${getStatusColor(employee.status)}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(employee.status)}
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {employee.name}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600">
                          {employee.generatedQuestions || 0}/{employee.expectedQuestions || 0}
                        </span>
                      </div>
                      
                      {/* Mini Progress Bar */}
                      <div className="w-full bg-white rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            employee.status === 'completed' ? 'bg-green-500' :
                            employee.status === 'in-progress' ? 'bg-orange-500' :
                            employee.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${empProgress}%` }}
                        ></div>
                      </div>
                      
                      {/* Status Text */}
                      <div className="mt-1 text-xs text-gray-600">
                        {employee.status === 'completed' && '✅ Completed'}
                        {employee.status === 'in-progress' && '⏳ Generating...'}
                        {employee.status === 'failed' && '❌ Failed'}
                        {employee.status === 'pending' && '⏳ Pending'}
                        {employee.remainingQuestions > 0 && (
                          <span className="ml-2">
                            ({employee.remainingQuestions} remaining)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Status */}
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {isGenerating ? 'Generation in progress...' : 
                   progress.processedEmployees === progress.totalEmployees && progress.totalEmployees > 0 ?
                   'Generation completed!' : 'Ready to generate'}
                </span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Minimized View */}
        {isMinimized && (
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  isGenerating ? 'bg-orange-500 animate-pulse' : 
                  progress.processedEmployees === progress.totalEmployees ? 'bg-green-500' : 'bg-gray-400'
                }`}></div>
                <span className="text-sm text-gray-700">
                  {progress.processedEmployees}/{progress.totalEmployees} employees
                </span>
              </div>
              <span className="text-sm font-medium text-gray-600">{overallProgress}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionGenerationTracker;