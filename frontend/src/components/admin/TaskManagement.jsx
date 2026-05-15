// attendance _31/client/src/components/admin/TaskManagement.jsx
import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { getAllTasks, resetAllTasks } from '../../services/taskService';
import { getWorkers } from '../../services/workerService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const TaskManagement = () => {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  // Modal states
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // context
  const { subdomain } = useContext(appContext);

  // Load tasks and workers
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [tasksData, workersData] = await Promise.all([
          getAllTasks({ subdomain }),
          getWorkers({ subdomain })
        ]);
        
        // Ensure data is an array
        const safeTasks = Array.isArray(tasksData) ? tasksData : [];
        const safeWorkers = Array.isArray(workersData) ? workersData : [];
        
        console.log('Tasks Data:', safeTasks);
        console.log('Employees Data:', safeWorkers);
        
        setTasks(safeTasks);
        setWorkers(safeWorkers);
      } catch (error) {
        toast.error('Failed to load data');
        console.error(error);
        setTasks([]);
        setWorkers([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  
  // Filter tasks
  const filteredTasks = Array.isArray(tasks) 
  ? tasks.filter(task => {
      // Ensure task is an object before filtering
      if (!task || typeof task !== 'object') return false;

      // Safely check for worker properties
      const workerName = task.worker?.name || '';
      const workerDept = task.worker?.department?.name || '';
      
      // Search term filter (worker name or department)
      const matchesSearch = !searchTerm || (
        workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        workerDept.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      // Worker filter
      const matchesWorker = !filterWorker || task.worker?._id === filterWorker;
      
      // Date range filter
      const taskDate = task.createdAt ? new Date(task.createdAt) : null;
      const matchesDateFrom = !filterDateFrom || (taskDate && taskDate >= new Date(filterDateFrom));
      const matchesDateTo = !filterDateTo || (taskDate && taskDate <= new Date(filterDateTo + 'T23:59:59'));
      
      return matchesSearch && matchesWorker && matchesDateFrom && matchesDateTo;
    }) 
  : [];
  
  // View task details
  const viewTaskDetails = (task) => {
    setSelectedTask(task);
    setIsViewModalOpen(true);
  };
  
  // Open reset tasks modal
  const openResetModal = () => {
    setIsResetModalOpen(true);
  };
  
  // Reset all tasks
  const handleResetAllTasks = async () => {
    try {
      await resetAllTasks({ subdomain });
      setTasks([]);
      setIsResetModalOpen(false);
      toast.success('All tasks have been reset');
    } catch (error) {
      console.error('Reset tasks error:', error);
      toast.error(error.message || 'Failed to reset tasks');
    }
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy h:mm a');
    } catch (error) {
      return dateString;
    }
  };
  
  // Table columns configuration
  const columns = [
    {
      header: 'Employee',
      accessor: 'worker',
      render: (task) => task.worker?.name || 'Unknown'
    },
    {
      header: 'Department',
      accessor: 'department',
      render: (task) => task.worker?.department?.name || 'Unknown'
    },
    {
      header: 'Points',
      accessor: 'points',
      render: (task) => <span className="font-medium">{task.points}</span>
    },
    {
      header: 'Topics',
      accessor: 'topics',
      render: (task) => (
        // Check if task.topics exists and has items
        Array.isArray(task.topics) && task.topics.length > 0 ? (
          <div className="flex flex-col space-y-2">
            {Array.from(new Set(task.topics.map(t => t._id))) // Ensure unique main topics
              .map(uniqueTopicId => task.topics.find(t => t._id === uniqueTopicId))
              .filter(Boolean) // Remove any undefined topics
              .map((topic) => {
                // Filter subtopics based on task.selectedSubtopics
                const selectedSubtopicIdsForThisTopic = task.selectedSubtopics && task.selectedSubtopics[topic._id]
                  ? task.selectedSubtopics[topic._id]
                  : [];

                const displayedSubtopics = Array.isArray(topic.subtopics)
                  ? topic.subtopics.filter(sub => selectedSubtopicIdsForThisTopic.includes(sub._id))
                  : [];

                return (
                  <div key={topic._id} className="p-2 border border-blue-200 rounded-md bg-blue-50">
                    <span className="font-semibold text-blue-800">{topic.name} ({topic.points} pts)</span>
                    {displayedSubtopics.length > 0 && (
                      <div className="mt-1 pl-2 border-l border-blue-200">
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {displayedSubtopics.map(sub => (
                            <li key={sub._id}>
                              {sub.name} (<span className="font-medium text-green-600">{sub.points} pts</span>)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <span className="text-gray-400">None</span>
        )
      )
    },
    {
      header: 'Date',
      accessor: 'createdAt',
      render: (task) => formatDate(task.createdAt)
    },
    {
      header: 'Actions',
      accessor: 'actions',
      render: (task) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => viewTaskDetails(task)}
        >
          View Details
        </Button>
      )
    }
  ];
  
  return (
    <div>
      <div className="flex justify-between md:justify-end items-center mb-6">
        <h1 className="text-2xl font-bold md:hidden">Task Management</h1>
        <Button
          variant="danger"
          onClick={openResetModal}
        >
          Reset All Tasks
        </Button>
      </div>
      
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <input
              type="text"
              className="form-input"
              placeholder="Search employee or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-input"
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
            >
              <option value="">All Employee</option>
              {workers.map((worker) => (
                <option key={worker._id} value={worker._id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input
              type="date"
              className="form-input"
              placeholder="From Date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <input
              type="date"
              className="form-input"
              placeholder="To Date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredTasks}
            noDataMessage="No tasks found."
          />
        )}
      </Card>
      
      {/* View Task Details Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Task Details"
      >
        {selectedTask && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Employee</p>
                <p className="font-medium">{selectedTask.worker?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Department</p>
                <p className="font-medium">{selectedTask.worker?.department?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Points</p>
                <p className="font-medium">{selectedTask.points}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-medium">{formatDate(selectedTask.createdAt)}</p>
              </div>
            </div>
            
            {/* Topics with Selected Subtopics */}
            <div>
              <p className="text-sm text-gray-500">Topics & Selected Sub-topics</p>
              {selectedTask.topics && selectedTask.topics.length > 0 ? (
                <div className="flex flex-col space-y-2 mt-1">
                  {/* --- MODIFIED LOGIC HERE --- */}
                  {Array.from(new Set(selectedTask.topics.map(t => t._id))) // Get unique topic IDs
                    .map(uniqueTopicId => selectedTask.topics.find(t => t._id === uniqueTopicId)) // Find the corresponding topic object
                    .filter(Boolean) // Remove any null/undefined results
                    .map((topic) => {
                      const selectedSubtopicIdsForThisTopic = selectedTask.selectedSubtopics && selectedTask.selectedSubtopics[topic._id]
                        ? selectedTask.selectedSubtopics[topic._id]
                        : [];

                      const displayedSubtopics = Array.isArray(topic.subtopics)
                        ? topic.subtopics.filter(sub => selectedSubtopicIdsForThisTopic.includes(sub._id))
                        : [];

                      // Only render a topic card if it has selected subtopics OR if it's a main topic with no subtopics
                      // (meaning it was selected directly, not via subtopics)
                      if (displayedSubtopics.length > 0 || (!topic.subtopics || topic.subtopics.length === 0)) {
                        return (
                          <div key={topic._id} className="p-2 border border-blue-200 rounded-md bg-blue-50">
                            <span className="font-semibold text-blue-800">{topic.name} ({topic.points} pts)</span>
                            {displayedSubtopics.length > 0 && (
                              <div className="mt-1 pl-2 border-l border-blue-200">
                                <ul className="list-disc list-inside text-sm text-gray-700">
                                  {displayedSubtopics.map(sub => (
                                    <li key={sub._id}>
                                      {sub.name} (<span className="font-medium text-green-600">{sub.points} pts</span>)
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* If main topic has no subtopics but was explicitly chosen and displayed */}
                            {(!topic.subtopics || topic.subtopics.length === 0) && (
                                <span className="text-gray-600 text-sm italic block mt-1">No sub-topics for this entry.</span>
                            )}
                          </div>
                        );
                      }
                      return null; // Don't render if no subtopics selected and it's not a standalone main topic
                    })}
                  {/* --- END MODIFIED LOGIC --- */}
                </div>
              ) : (
                <p className="text-gray-400 mt-1">No topics or sub-topics selected</p>
              )}
            </div>
            
            {/* Task Data */}
            <div>
              <p className="text-sm text-gray-500">Task Data</p>
              {selectedTask.data && Object.keys(selectedTask.data).length > 0 ? (
                <div className="bg-gray-50 p-3 rounded-md mt-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left font-medium text-gray-500">Field</th>
                        <th className="text-right font-medium text-gray-500">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedTask.data).map(([key, value]) => (
                        <tr key={key}>
                          <td className="py-1">{key}</td>
                          <td className="py-1 text-right">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400 mt-1">No task data available</p>
              )}
            </div>
          </div>
        )}
      </Modal>
      
      {/* Reset Tasks Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset All Tasks"
      >
        <div className="p-2">
          <p className="mb-4 text-red-600 font-medium">Warning: This action cannot be undone!</p>
          <p className="mb-6">
            Resetting all tasks will:
            <ul className="list-disc ml-6 mt-2">
              <li>Delete all task submissions from the database</li>
              <li>Reset all employee points to zero</li>
              <li>Clear all activity history</li>
            </ul>
          </p>
          
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => setIsResetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleResetAllTasks}
            >
              Reset All Tasks
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TaskManagement;