import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import appContext from '../../context/AppContext';
import { getMyTasks } from '../../services/taskService';
import Spinner from '../common/Spinner';

const CustomTaskForm = () => {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customTasks, setCustomTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [activeView, setActiveView] = useState('recent'); // 'recent', 'pending', 'approved', 'rejected'
  const { subdomain } = useContext(appContext);

  // Fetch worker's custom tasks
  useEffect(() => {
    const fetchCustomTasks = async () => {
      try {
        const tasksData = await getMyTasks();
        const customTasksData = tasksData.filter(task => task.isCustom === true);
        setCustomTasks(customTasksData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching custom tasks:', error);
        toast.error('Failed to load custom tasks');
        setLoading(false);
      }
    };

    fetchCustomTasks();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.error('Please provide a task description');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/tasks/custom', { description, subdomain });
      setCustomTasks([response.data, ...customTasks]);
      setDescription('');
      toast.success('Custom task submitted successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit custom task');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Rejected</span>;
      default:
        return null;
    }
  };

  const filterTasks = () => {
    if (activeView === 'recent') {
      return customTasks.slice(0, showAllTasks ? customTasks.length : 3);
    } else if (activeView === 'pending') {
      const filtered = customTasks.filter(task => task.status === 'pending');
      return showAllTasks ? filtered : filtered.slice(0, 3);
    } else if (activeView === 'approved') {
      const filtered = customTasks.filter(task => task.status === 'approved');
      return showAllTasks ? filtered : filtered.slice(0, 3);
    } else if (activeView === 'rejected') {
      const filtered = customTasks.filter(task => task.status === 'rejected');
      return showAllTasks ? filtered : filtered.slice(0, 3);
    }
    return [];
  };

  const getTabClassName = (tabName) => {
    return `px-3 py-2 rounded-md cursor-pointer text-sm sm:text-base ${activeView === tabName
      ? 'bg-[#0d9488] text-white'
      : 'bg-gray-200 text-gray-700 hover:bg-[#0d9488] hover:text-white'
      }`;
  };

  return (
    <div className="w-full">

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
            Task Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-4 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all min-h-[56px] outline-none placeholder:text-slate-400 font-medium"
            placeholder="What tasks have you completed today?"
            disabled={submitting}
          ></textarea>
        </div>

        <button
          type="submit"
          className={`px-4 py-1.5 rounded-lg text-white text-sm font-semibold ${submitting ? 'bg-[#0d9488]' : 'bg-[#0d9488] hover:bg-[#0f766e] transition-colors'
            }`}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Task'}
        </button>
      </form>

      {/* Custom tasks section */}
      {customTasks.length > 0 && (
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-medium">Your Custom Tasks</h3>
            <button
              onClick={() => setShowAllTasks(!showAllTasks)}
              className="text-[#0d9488] hover:text-[#0d9488] text-sm flex items-center"
            >
              {showAllTasks ? (
                <>Show Less {<FaChevronUp className="ml-1" />}</>
              ) : (
                <>Show All {<FaChevronDown className="ml-1" />}</>
              )}
            </button>
          </div>

          {/* View tabs - Improved mobile responsiveness */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div
              className={getTabClassName('recent')}
              onClick={() => setActiveView('recent')}
            >
              Recent
            </div>
            <div
              className={getTabClassName('pending')}
              onClick={() => setActiveView('pending')}
            >
              Pending
            </div>
            <div
              className={getTabClassName('approved')}
              onClick={() => setActiveView('approved')}
            >
              Approved
            </div>
            <div
              className={getTabClassName('rejected')}
              onClick={() => setActiveView('rejected')}
            >
              Rejected
            </div>
          </div>

          <div className="space-y-2">
            {filterTasks().map(task => (
              <div key={task._id} className="p-3 border rounded-md">
                <div className="flex justify-between">
                  <span className="text-gray-700">{task.description}</span>
                  <div className="flex items-center">
                    {getStatusBadge(task.status)}
                    {task.status === 'approved' && (
                      <span className="ml-2 font-medium text-green-600">
                        +{task.points} pts
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(task.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Show "View All" button if there are more tasks than shown */}
          {!showAllTasks && customTasks.length > 3 && (
            <button
              onClick={() => setShowAllTasks(true)}
              className="mt-4 w-full py-2 text-sm text-[#0d9488] hover:text-[#0d9488] border border-[#0d9488] rounded-md hover:bg-[#0d9488] hover:text-white"
            >
              View All ({customTasks.length}) Tasks
            </button>
          )}
        </div>
      )}

      {loading && <Spinner size="md" variant="default" />}

      {!loading && customTasks.length === 0 && (
        <p className="text-center mt-4 text-gray-500">
          You haven't submitted any custom tasks yet.
        </p>
      )}
    </div>
  );
};

export default CustomTaskForm;