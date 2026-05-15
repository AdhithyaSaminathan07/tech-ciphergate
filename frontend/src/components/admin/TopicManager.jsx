// client/src/components/admin/TopicManager.jsx
import { useState, useEffect, useContext, useRef } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  addSubtopicToTopic,
  updateSubtopic,
  deleteSubtopic
} from '../../services/topicService';
import { getDepartments } from '../../services/departmentService';
import appContext from '../../context/AppContext';
import Card from '../common/Card'; // Assuming this Card component exists and is flexible
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';

const TopicManagement = () => {
  const nameInputRef = useRef(null);
  const [topics, setTopics] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState([]);

  // Modal states for main topic operations
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // NEW MODAL STATES for nested hierarchy operations (add sub-topic, add action)
  const [isAddSubTopicModalOpen, setIsAddSubTopicModalOpen] = useState(false);
  const [isEditSubtopicModalOpen, setIsEditSubtopicModalOpen] = useState(false);
  const [isDeleteSubtopicModalOpen, setIsDeleteSubtopicModalOpen] = useState(false);


  const [selectedTopic, setSelectedTopic] = useState(null); // The current topic being edited/modified
  const [selectedSubTopic, setSelectedSubTopic] = useState(null);

  // Form states for adding/editing top-level topics
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    points: '' // Initialized as empty string for text input
  });
  // NEW FORM STATES for adding nested elements
  const [newSubTopicData, setNewSubTopicData] = useState({ name: '', points: '' }); // Initialized as empty string for text input
  const [subtopicFormData, setSubtopicFormData] = useState({ name: '', points: '' }); // Initialized as empty string for text input

  const { subdomain } = useContext(appContext);

  // State to manage expanded rows in the table for displaying nested content
  const [expandedTopics, setExpandedTopics] = useState({}); // { topicId: true/false }

  useEffect(() => {
    fetchTopicsAndDepartments();
  }, [subdomain]);

  // Function to fetch topics and departments from the backend
  const fetchTopicsAndDepartments = async () => {
    setIsLoading(true);
    try {
      const fetchedTopics = await getTopics({ subdomain });
      const processedTopics = fetchedTopics.map(topic => ({
        ...topic,
        subtopics: (topic.subtopics || []).map(sub => ({
          ...sub,
        }))
      }));
      setTopics(processedTopics);

      const fetchedDepartments = await getDepartments({ subdomain });
      setDepartments(fetchedDepartments);
    } catch (error) {
      toast.error(error.message || 'Failed to fetch topics or departments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTopic = (topicId) => {
    setSelectedTopicIds(prevSelected =>
      prevSelected.includes(topicId)
        ? prevSelected.filter(id => id !== topicId)
        : [...prevSelected, topicId]
    );
  };

  const handleSelectAllTopics = (e) => {
    if (e.target.checked) {
      const allTopicIds = filteredTopics.map(topic => topic._id);
      setSelectedTopicIds(allTopicIds);
    } else {
      setSelectedTopicIds([]);
    }
  };

  // Handles input changes for form fields, including points
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Specific validation for 'points' field
    if (name === 'points') {
      if (value === '' || /^\d*\.?\d*$/.test(value)) { // Allows empty string, digits, and one decimal
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Handles submission for creating a new top-level topic
  const handleAddTopic = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { // Trim name to ensure it's not just whitespace
      toast.error('Topic name is required');
      return;
    }

    // Validate and parse points for submission
    // If points field is empty, treat as 0
    const pointsToSubmit = formData.points.trim() === '' ? 0 : parseFloat(formData.points);
    if (isNaN(pointsToSubmit) || pointsToSubmit < 0) {
      toast.error('Points must be a non-negative number or left blank.');
      return;
    }

    try {
      // Pass the parsed numeric points to the API call
      await createTopic({ ...formData, points: pointsToSubmit, subdomain });
      toast.success('Topic added successfully');
      setIsAddModalOpen(false);
      setFormData({ name: '', department: '', points: '' }); // Reset points as empty string
      fetchTopicsAndDepartments(); // Re-fetch to update the table
    }
    catch (error) {
      toast.error(error.message || 'Failed to add topic');
    }
  };

  // Handles submission for updating an existing top-level topic
  const handleUpdateTopic = async (e) => {
    e.preventDefault();
    if (!selectedTopic || !formData.name.trim()) { // Trim name
      toast.error('Invalid topic or name missing');
      return;
    }

    // If top-level topics have points, ensure validation and parsing here too
    // For this UI, topic points are not directly editable in the main edit modal.
    // If they were, you would uncomment the block below and pass pointsToSubmit to updateTopic.
    // const pointsToSubmit = parseFloat(formData.points);
    // if (formData.points.trim() === '' || isNaN(pointsToSubmit) || pointsToSubmit < 0) {
    //   toast.error('Points must be a non-negative number.');
    //   return;
    // }

    try {
      // Assuming topic points are not updated directly in this modal, keep existing topic points
      await updateTopic(selectedTopic._id, { name: formData.name, department: formData.department, points: selectedTopic.points }, subdomain);
      toast.success('Topic updated successfully');
      setIsEditModalOpen(false);
      setSelectedTopic(null);
      setFormData({ name: '', department: '', points: '' }); // Reset to empty string
      fetchTopicsAndDepartments();
    } catch (error) {
      toast.error(error.message || 'Failed to update topic');
    }
  };

  // Handles deleting a topic and all its nested content
  const handleDeleteTopic = async () => {
    setIsLoading(true);
    try {
      const topicsToDelete = selectedTopicIds.length > 0 ? selectedTopicIds : (selectedTopic ? [selectedTopic._id] : []);

      if (topicsToDelete.length === 0) {
        toast.error('No topics selected for deletion.');
        setIsLoading(false);
        return;
      }

      for (const topicId of topicsToDelete) {
        await deleteTopic(topicId, subdomain);
      }

      toast.success(
        topicsToDelete.length > 1
          ? `${topicsToDelete.length} topics deleted successfully!`
          : 'Topic deleted successfully!'
      );
      fetchTopicsAndDepartments(); // Re-fetch to update the table
      setSelectedTopicIds([]); // Clear selections
      setIsDeleteModalOpen(false); // Close modal
    } catch (error) {
      console.error('Failed to delete topic(s):', error);
      toast.error(error.response?.data?.message || 'Failed to delete topic(s).');
    } finally {
      setIsLoading(false);
    }
  };

  // Opens the modal for adding a new top-level topic
  const openAddTopicModal = () => {
    setFormData({ name: '', department: '', points: '' }); // CHANGED: Reset points as empty string
    setIsAddModalOpen(true);
    setTimeout(() => nameInputRef.current && nameInputRef.current.focus(), 100);
  };

  // Opens the modal for editing a top-level topic
  const openEditModal = (topic) => {
    setSelectedTopic(topic);
    setFormData({ name: topic.name, department: topic.department || '', points: topic.points.toString() }); // CHANGED: Set points as string
    setIsEditModalOpen(true);
  };

  // NEW FUNCTION: Opens the modal for adding a new sub-topic to a selected topic
  const openAddSubTopicModal = (topic) => {
    setSelectedTopic(topic);
    setNewSubTopicData({ name: '', points: '' }); // CHANGED: points as empty string
    setIsAddSubTopicModalOpen(true);
  };

  // NEW FUNCTION: Handles submission for adding a new sub-topic
  const handleAddSubTopic = async (e) => {
    e.preventDefault();
    if (!selectedTopic || !newSubTopicData.name.trim()) { // Trim name
      toast.error('Parent topic or sub-topic name is missing.');
      return;
    }

    // Validate and parse points for submission
    // If points field is empty, treat as 0
    const pointsToSubmit = newSubTopicData.points.trim() === '' ? 0 : parseFloat(newSubTopicData.points);
    if (isNaN(pointsToSubmit) || pointsToSubmit < 0) {
      toast.error('Points must be a non-negative number or left blank.');
      return;
    }

    try {
      // Pass the parsed numeric points to the API call
      await addSubtopicToTopic(selectedTopic._id, { name: newSubTopicData.name.trim(), points: pointsToSubmit }, subdomain);
      toast.success('Sub-topic added successfully!');
      setIsAddSubTopicModalOpen(false);
      setNewSubTopicData({ name: '', points: '' }); // Reset points as empty string
      fetchTopicsAndDepartments(); // Re-fetch topics to update the UI with new sub-topic
    } catch (error) {
      toast.error(error.message || 'Failed to add sub-topic.');
    }
  };

  // NEW FUNCTION: Opens the modal for editing a sub-topic
  const openEditSubtopicModal = (topic, subTopic) => {
    setSelectedTopic(topic);
    setSelectedSubTopic(subTopic);
    setSubtopicFormData({ name: subTopic.name, points: subTopic.points.toString() }); // CHANGED: Set points as string
    setIsEditSubtopicModalOpen(true);
  };

  // NEW FUNCTION: Handles submission for updating a sub-topic
  const handleUpdateSubtopic = async (e) => {
    e.preventDefault();
    if (!selectedTopic || !selectedSubTopic || !subtopicFormData.name.trim()) { // Trim name
      toast.error('Parent topic, sub-topic, or name is missing.');
      return;
    }

    // Validate and parse points for submission
    // If points field is empty, treat as 0
    const pointsToSubmit = subtopicFormData.points.trim() === '' ? 0 : parseFloat(subtopicFormData.points); // Use parseFloat as points can be decimal
    if (isNaN(pointsToSubmit) || pointsToSubmit < 0) {
      toast.error('Points must be a non-negative number or left blank.');
      return;
    }

    try {
      // Pass the parsed numeric points to the API call
      await updateSubtopic(selectedTopic._id, selectedSubTopic._id, { name: subtopicFormData.name.trim(), points: pointsToSubmit }, subdomain);
      toast.success('Sub-topic updated successfully!');
      setIsEditSubtopicModalOpen(false);
      setSubtopicFormData({ name: '', points: '' }); // Reset points as empty string
      fetchTopicsAndDepartments(); // Re-fetch topics to update the UI
    } catch (error) {
      toast.error(error.message || 'Failed to update sub-topic.');
    }
  };

  // NEW FUNCTION: Handles deleting a sub-topic
  const handleDeleteSubtopic = async (topicId, subtopicId) => {
    try {
      await deleteSubtopic(topicId, subtopicId, subdomain);
      toast.success('Sub-topic deleted successfully!');
      fetchTopicsAndDepartments();
    } catch (error) {
      toast.error(error.message || 'Failed to delete sub-topic.');
    }
  };


  // Filters topics based on search term and department
  const filteredTopics = topics.filter(topic => {
    return (
      (searchTerm === '' || topic.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (filterDepartment === '' || topic.department === filterDepartment)
    );
  });

  // Toggle expand/collapse for a main topic card
  const toggleTopicExpand = (topicId) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 md:hidden">Topic Management</h1>

      <Card className="mb-6 p-4">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-semibold">Manage Topics</h2>
          <div className="flex gap-2">
            {selectedTopicIds.length > 0 && (
              <Button
                variant="danger"
                onClick={() => {
                  setSelectedTopic(null); // Clear single selection if multiple are selected
                  setIsDeleteModalOpen(true);
                }}
                disabled={isLoading}
              >
                Delete Selected ({selectedTopicIds.length})
              </Button>
            )}
            <Button
              onClick={openAddTopicModal}
            >
              <FaPlus className="mr-2" /> Add New Topic
            </Button>
          </div>
        </div>

        <div className="flex space-x-4 mb-4 flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search topics..."
            className="form-input flex-1 rounded-lg min-w-[180px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="form-select flex-1 min-w-[180px]"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept.name}>
                  {dept.name}
                </option>
            ))}
          </select>
        </div>

        {/* This UI uses cards, not a traditional table structure with headers like the previous request.
            So, the "Column Headers" section is commented out or removed. */}
        {/*
        <div className="hidden md:grid md:grid-cols-topic-management bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-t-lg border-b border-gray-200">
            <div className="text-left">
                <input
                    type="checkbox"
                    onChange={handleSelectAllTopics}
                    checked={filteredTopics.length > 0 && selectedTopicIds.length === filteredTopics.length}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                />
            </div>
            <div className="text-left">NAME</div>
            <div className="text-left">DEPARTMENT</div>
            <div className="text-left">SUB-TOPICS / ACTIONS</div>
            <div className="text-center">ACTIONS</div>
        </div>
        */}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No topics found. Add a topic to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"> {/* Responsive grid for cards */}
            {filteredTopics.map((topic) => (
              <Card key={topic._id} className="relative overflow-hidden">
                <div className="absolute top-4 left-4">
                  <input
                    type="checkbox"
                    checked={selectedTopicIds.includes(topic._id)}
                    onChange={() => handleSelectTopic(topic._id)}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                </div>
                <div className="flex flex-col p-4 pt-8"> {/* Adjusted padding to make space for checkbox */}
                  <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
                    <span className="text-gray-800">{topic.name}</span>
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); openEditModal(topic); }}
                        className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        <FaEdit size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); setIsDeleteModalOpen(true); setSelectedTopic(topic); }}
                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-100 transition-colors"
                      >
                        <FaTrash size={16} />
                      </Button>
                    </div>
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Department: {topic.department === 'all' ? 'All Departments' : topic.department} | Points: {topic.points}
                  </p>

                  {/* Sub-topics section (Accordion) */}
                  <div className="border-t pt-4 mt-2">
                    <button
                      type="button"
                      onClick={() => toggleTopicExpand(topic._id)}
                      className="flex items-center justify-between w-full text-left font-medium text-blue-700 hover:text-blue-900 focus:outline-none"
                    >
                      <span>Sub-topics ({topic.subtopics?.length || 0})</span>
                      {expandedTopics[topic._id] ? <FaChevronUp className="text-blue-500 ml-2" /> : <FaChevronDown className="text-blue-500 ml-2" />}
                    </button>

                    {expandedTopics[topic._id] && (
                      <div className="mt-4 space-y-2">
                        {topic.subtopics && topic.subtopics.length > 0 ? (
                          topic.subtopics.map(subtopic => (
                            <div key={subtopic._id} className="bg-blue-50 p-3 rounded-md border border-blue-200">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-gray-800">{subtopic.name} ({subtopic.points} pts)</span>
                                <div className="flex space-x-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); openEditSubtopicModal(topic, subtopic); }}
                                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-100 transition-colors"
                                  >
                                    <FaEdit size={14} />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSubtopic(topic._id, subtopic._id); }}
                                    className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors"
                                  >
                                    <FaTrash size={14} />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 italic text-sm">No sub-topics defined for this topic.</p>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openAddSubTopicModal(topic); }}
                          className="mt-4 text-sm w-full"
                        >
                          <FaPlus className="mr-1" /> Add Sub-Topic
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Modal for adding a new top-level topic */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Topic"
      >
        <form onSubmit={handleAddTopic}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-gray-700 text-sm font-bold mb-2">
              Topic Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              ref={nameInputRef}
              className="form-input w-full"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="points" className="block text-gray-700 text-sm font-bold mb-2">
              Points
            </label>
            <input
              type="text" // Changed to text
              id="points"
              name="points"
              className="form-input w-full"
              value={formData.points}
              onChange={handleInputChange} // Uses the general handleInputChange
              pattern="^\d*\.?\d*$"
              title="Please enter a non-negative number (e.g., 100 or 50.50)"
              // removed required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="department" className="block text-gray-700 text-sm font-bold mb-2">
              Department
            </label>
            <select
              id="department"
              name="department"
              className="form-select w-full"
              value={formData.department}
              onChange={handleInputChange}
            >
              <option value="">Select Department</option>
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end mt-6 space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Add Topic
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal for editing a top-level topic */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Topic: ${selectedTopic?.name}`}
      >
        <form onSubmit={handleUpdateTopic}>
          <div className="mb-4">
            <label htmlFor="edit-name" className="block text-gray-700 text-sm font-bold mb-2">
              Topic Name
            </label>
            <input
              type="text"
              id="edit-name"
              name="name"
              className="form-input w-full"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>
          {/* Add a points input here IF you want to enable direct editing of top-level topic points */}
          {/* For now, it is assumed top-level topic points are derived from sub-topics or are fixed. */}
          {/* If you need it, uncomment and update formData.points logic in handleUpdateTopic accordingly: */}
          {/*
          <div className="mb-4">
            <label htmlFor="edit-points" className="block text-gray-700 text-sm font-bold mb-2">
              Points
            </label>
            <input
              type="text"
              id="edit-points"
              name="points"
              className="form-input w-full"
              value={formData.points} // This would come from selectedTopic.points
              onChange={handleInputChange} // Uses the general handleInputChange
              pattern="^\d*\.?\d*$"
              title="Please enter a non-negative number (e.g., 100 or 50.50)"
              required
            />
          </div>
          */}
          <div className="mb-4">
            <label htmlFor="edit-department" className="block text-gray-700 text-sm font-bold mb-2">
              Department
            </label>
            <select
              id="edit-department"
              name="department"
              className="form-select w-full"
              value={formData.department}
              onChange={handleInputChange}
            >
              <option value="">Select Department</option>
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end mt-6 space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Update Topic
            </Button>
          </div>
        </form>
      </Modal>

      {/* NEW MODAL: Modal for adding a sub-topic to a selected main topic */}
      <Modal
        isOpen={isAddSubTopicModalOpen}
        onClose={() => setIsAddSubTopicModalOpen(false)}
        title={`Add Sub-Topic to: ${selectedTopic?.name}`}
      >
        <form onSubmit={handleAddSubTopic}>
          <div className="mb-4">
            <label htmlFor="new-subtopic-name" className="block text-gray-700 text-sm font-bold mb-2">
              Sub-Topic Name
            </label>
            <input
              type="text"
              id="new-subtopic-name"
              className="form-input w-full"
              value={newSubTopicData.name}
              onChange={(e) => setNewSubTopicData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="new-subtopic-points" className="block text-gray-700 text-sm font-bold mb-2">
              Points
            </label>
            <input
              type="text" // CHANGED: from "number" to "text"
              id="new-subtopic-points"
              className="form-input w-full"
              value={newSubTopicData.points}
              onChange={(e) => { // Refined onChange for newSubTopicData.points
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setNewSubTopicData(prev => ({ ...prev, points: value }));
                }
              }}
              pattern="^\d*\.?\d*$" // ADDED: Pattern for client-side visual hint
              title="Please enter a non-negative number (e.g., 100 or 50.50)" // ADDED: Title for pattern hint
              // removed required
            />
          </div>
          <div className="flex justify-end mt-6 space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddSubTopicModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Add Sub-Topic
            </Button>
          </div>
        </form>
      </Modal>

      {/* NEW MODAL: Modal for editing a sub-topic */}
      <Modal
        isOpen={isEditSubtopicModalOpen}
        onClose={() => setIsEditSubtopicModalOpen(false)}
        title={`Edit Sub-Topic: ${selectedSubTopic?.name} (under ${selectedTopic?.name})`}
      >
        <form onSubmit={handleUpdateSubtopic}>
          <div className="mb-4">
            <label htmlFor="edit-subtopic-name" className="block text-gray-700 text-sm font-bold mb-2">
              Sub-Topic Name
            </label>
            <input
              type="text"
              id="edit-subtopic-name"
              className="form-input w-full"
              value={subtopicFormData.name}
              onChange={(e) => setSubtopicFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="edit-subtopic-points" className="block text-gray-700 text-sm font-bold mb-2">
              Points
            </label>
            <input
              type="text" // CHANGED: from "number" to "text"
              id="edit-subtopic-points"
              className="form-input w-full"
              value={subtopicFormData.points}
              onChange={(e) => { // Refined onChange for subtopicFormData.points
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setSubtopicFormData(prev => ({ ...prev, points: value }));
                }
              }}
              pattern="^\d*\.?\d*$" // ADDED: Pattern for client-side visual hint
              title="Please enter a non-negative number (e.g., 100 or 50.50)" // ADDED: Title for pattern hint
              // removed required
            />
          </div>
          <div className="flex justify-end mt-6 space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditSubtopicModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Update Sub-Topic
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal for confirming topic deletion */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Topic(s)"
      >
        {selectedTopicIds.length > 0 ? (
          <p className="mb-4">
            Are you sure you want to delete {selectedTopicIds.length} selected topic(s)?
            This action cannot be undone. It will delete all associated sub-topics.
          </p>
        ) : (
          <p className="mb-4">
            Are you sure you want to delete <strong>{selectedTopic?.name}</strong>?
            This action cannot be undone. It will delete all associated sub-topics.
          </p>
        )}

        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteTopic}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default TopicManagement;