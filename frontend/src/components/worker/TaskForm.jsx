// attendance _31/client/src/components/worker/TaskForm.jsx
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { createTask } from '../../services/taskService';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';

const TaskForm = ({ topics, columns, onTaskSubmit }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({});
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showAllColumns, setShowAllColumns] = useState(false); 
  const [showAllTopics, setShowAllTopics] = useState(false);
  
  // NEW STATE: To manage the expanded state of each topic's subtopics
  const [expandedSubtopicSections, setExpandedSubtopicSections] = useState({});

  const initialDisplayCount = 4; 

  const displayedColumns = showAllColumns ? columns : columns.slice(0, initialDisplayCount); 
  const displayedTopics = showAllTopics ? topics : topics.slice(0, initialDisplayCount);     
  
  // Handle form field changes for columns
  const handleColumnChange = (columnName, value) => {
    setFormData(prev => ({
      ...prev,
      [columnName]: value
    }));
  };
  
  // Handle topic checkbox changes
  const handleMainTopicChange = (topicId) => {
    setSelectedTopics((prevSelectedTopics) => {
            const isTopicSelected = prevSelectedTopics.includes(topicId);
            const topic = topics.find(t => t._id === topicId);
      
            setSelectedSubtopics((prevSelectedSubtopics) => {
              const newSelectedSubtopics = { ...prevSelectedSubtopics };
      
              if (isTopicSelected) {
                // If main topic is being deselected, deselect all its subtopics
                delete newSelectedSubtopics[topicId];
              } else {
                // If main topic is being selected, select all its subtopics (if any)
                // This ensures that when a parent is checked, all children are implicitly checked
                if (topic && topic.subtopics && topic.subtopics.length > 0) {
                  newSelectedSubtopics[topicId] = topic.subtopics.map(sub => sub._id);
                } else {
                  // Ensure an empty array is set if no subtopics to prevent undefined behavior
                  newSelectedSubtopics[topicId] = [];
                }
              }
              return newSelectedSubtopics;
            });
      
            if (isTopicSelected) {
              return prevSelectedTopics.filter(id => id !== topicId);
            } else { // Selecting the main topic
              return [...prevSelectedTopics, topicId];
             }
           });
         };

  const handleSubtopicChange = (topicId, subtopicId) => {
        setSelectedSubtopics(prev => {
          const currentSubtopicsForTopic = prev[topicId] || [];
          let newSubtopicsForTopic;
    
          if (currentSubtopicsForTopic.includes(subtopicId)) {
            newSubtopicsForTopic = currentSubtopicsForTopic.filter(id => id !== subtopicId);
          } else {
            newSubtopicsForTopic = [...currentSubtopicsForTopic, subtopicId];
          }
    
          const newState = {
            ...prev,
            [topicId]: newSubtopicsForTopic.length > 0 ? newSubtopicsForTopic : undefined, // Remove key if no subtopics selected
          };
    
          // Ensure main topic is selected if any subtopic is selected
          if (newSubtopicsForTopic.length > 0 && !selectedTopics.includes(topicId)) {
                   setSelectedTopics((curr) => [...curr, topicId]);
          }
          // If all subtopics are deselected, deselect the main topic too
          if (newSubtopicsForTopic.length === 0 && selectedTopics.includes(topicId)) {
            setSelectedTopics((curr) => curr.filter(id => id !== topicId));
          }

          return newState;
        });
      };
  
  // Toggle the expanded state for subtopics of a specific topic
  const toggleSubtopicSection = (topicId) => {
    setExpandedSubtopicSections(prev => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  // Check if form is valid
  const isFormValid = () => {
    // At least one column value must be greater than 0
    const hasColumnData = Object.values(formData).some(value => parseInt(value) > 0);
    
    // Or at least one topic/subtopic must be selected
    const hasTopicData = selectedTopics.length > 0 || Object.values(selectedSubtopics).some(subtopicsArray => subtopicsArray && subtopicsArray.length > 0);
    
    if (selectedTopics.length === 0 && Object.keys(formData).length === 0) {
      return false; // Require at least one column data or one topic selected
    }
    
    return hasColumnData || hasTopicData;
  };
  
  // Handle form submission
const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!isFormValid()) {
    alert('Please enter at least one value or select a topic.');
    return;
  }
  
  setIsSubmitting(true);
  
  try {
    const taskData = {
      data: formData, 
      topics: selectedTopics,
      subtopics: selectedSubtopics, // Send selected subtopics object
      subdomain: user.subdomain,
    };
    
    const newTask = await createTask(taskData);
    
    // Reset form
    setFormData({});
    setSelectedTopics([]);
    setSelectedSubtopics({});
    setShowAllColumns(false);
    setShowAllTopics(false); 
    setExpandedSubtopicSections({}); // Reset expanded sections
    
    // Notify parent component
    if (onTaskSubmit) {
      onTaskSubmit(newTask);
    }
  } catch (error) {
    console.error('Failed to submit task:', error);
    alert(error.message || 'Failed to submit task. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
  
return (
  <div>
    <h2 className="text-xl font-semibold mb-4">Submit Task</h2>
    
    <form onSubmit={handleSubmit}>
      {/* Column Inputs */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Task Data</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"> {/* Adjusted grid for better responsiveness */}
          {displayedColumns.map((column) => (
            <div key={column._id} className="form-group">
              <label htmlFor={`column-${column._id}`} className="form-label">
                {column.name}
              </label>
              <input
                type="number"
                id={`column-${column._id}`}
                className="form-input"
                value={formData[column.name] || ''}
                onChange={(e) => handleColumnChange(column.name, e.target.value)}
                min="0"
              />
            </div>
          ))}
        </div>
        
        {columns.length > initialDisplayCount && (
          <button
            type="button"
            onClick={() => setShowAllColumns(!showAllColumns)}
            className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md flex items-center justify-center"
          >
            {showAllColumns ? (
              <>Show Less {<FaChevronUp className="ml-1" />}</>
            ) : (
              <>View All ({columns.length}) Task Data {<FaChevronDown className="ml-1" />}</>
            )}
          </button>
        )}
      </div>
      
     {/* Topics Section with Toggles */}
     {topics.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Topics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"> {/* Responsive grid for topic cards */}
            {displayedTopics.map((topic) => (
              <div 
                key={topic._id} 
                className={`
                  p-4 rounded-md border
                  ${selectedTopics.includes(topic._id) || (selectedSubtopics[topic._id] && selectedSubtopics[topic._id].length > 0)
                      ? 'bg-blue-100 border-blue-400 shadow-md' // Highlight selected topic
                      : 'bg-gray-50 border-gray-200'
                  }
                  flex flex-col
                `}
              >
                <label className="inline-flex items-center gap-2 mb-2 cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-blue-600 rounded-sm"
                    checked={selectedTopics.includes(topic._id)}
                    onChange={() => handleMainTopicChange(topic._id)}
                  />
                  <span className="flex-1 font-semibold text-gray-800 break-words">
                    {topic?.name || 'Unknown Topic'} ({topic?.points ?? 0} pts)
                  </span>
                </label>
                
                {/* Toggle for Sub-topics */}
                {topic.subtopics && topic.subtopics.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleSubtopicSection(topic._id)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center justify-between w-full py-1 px-1 -mx-1 rounded-md"
                    >
                      Sub-topics ({topic.subtopics.length})
                      {expandedSubtopicSections[topic._id] ? (
                        <FaChevronUp className="ml-1" />
                      ) : (
                        <FaChevronDown className="ml-1" />
                      )}
                    </button>

                    {/* Render subtopics if expanded */}
                    {expandedSubtopicSections[topic._id] && (
                      <div className="ml-4 mt-2 border-l border-gray-300 pl-4 py-1 space-y-1">
                        {topic.subtopics.map(subtopic => (
                          <label
                            key={subtopic._id}
                            className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded-md cursor-pointer w-full
                              ${selectedSubtopics[topic._id] && selectedSubtopics[topic._id].includes(subtopic._id)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                              }
                            `}
                          >
                            <input
                              type="checkbox"
                              className="form-checkbox h-3 w-3 text-blue-600 rounded-sm"
                              checked={selectedSubtopics[topic._id] && selectedSubtopics[topic._id].includes(subtopic._id)}
                              onChange={() => handleSubtopicChange(topic._id, subtopic._id, subtopic.points)}
                            />
                            <span className="flex-1 min-w-0 break-words">
                              {subtopic.name} ({subtopic.points} pts)
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {topics.length > initialDisplayCount && (
            <button
              type="button"
              onClick={() => setShowAllTopics(!showAllTopics)}
              className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md flex items-center justify-center"
            >
              {showAllTopics ? (
                <>Show Less {<FaChevronUp className="ml-1" />}</>
              ) : (
                <>View All ({topics.length}) Topics {<FaChevronDown className="ml-1" />}</>
              )}
            </button>
          )}
        </div>
      )}
      
      <div className="mt-6">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !isFormValid()}
        >
          {isSubmitting ? <Spinner size="sm" /> : 'Submit Task'}
        </Button>
      </div>
    </form>
  </div>
);
};

export default TaskForm;