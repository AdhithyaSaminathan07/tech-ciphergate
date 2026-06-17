import React, { useState, useEffect, useContext, useRef } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaEdit, FaUserFriends, FaGithub, FaLink, FaCode, FaCrown } from 'react-icons/fa';
import { getDepartments, createDepartment, deleteDepartment, updateDepartment } from '../../services/departmentService';
import { getWorkers } from '../../services/workerService';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const DepartmentManagement = () => {
  const departmentInputRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [viewEmployeesModalOpen, setViewEmployeesModalOpen] = useState(false);
  const [viewingDepartmentEmployees, setViewingDepartmentEmployees] = useState([]);

  // Tabs state for Modals
  const [activeAddTab, setActiveAddTab] = useState('general');
  const [activeEditTab, setActiveEditTab] = useState('general');

  // Add Form State
  const [addForm, setAddForm] = useState({
    name: '',
    departmentType: 'Project',
    description: '',
    projectStatus: 'In Progress',
    projectPriority: 'Medium',
    frontendStack: '',
    backendStack: '',
    database: '',
    cloudProvider: '',
    deploymentUrl: '',
    primaryRepoUrl: '',
    moduleRepos: [],
    documentationRepoUrl: '',
    projectLead: '',
    projectManager: '',
    assignedDevelopers: []
  });

  // Edit Form State
  const [editingDepartment, setEditingDepartment] = useState(null);

  const { subdomain } = useContext(appContext);

  useEffect(() => {
    if (isAddModalOpen && departmentInputRef.current) {
      setTimeout(() => departmentInputRef.current.focus(), 100);
    }
  }, [isAddModalOpen]);

  const loadDepartments = async () => {
    setIsLoading(true);
    if (!subdomain || subdomain === 'main') {
      setIsLoading(false);
      return;
    }

    try {
      const departmentsData = await getDepartments({ subdomain });
      console.log('Departments Loaded:', departmentsData);
      
      const safeDepartments = Array.isArray(departmentsData) 
        ? departmentsData.map(dept => ({
            ...dept,
            key: dept._id || Math.random().toString(36).substr(2, 9)
          }))
        : [];
      
      setDepartments(safeDepartments);
    } catch (error) {
      console.error('Department Load Error:', error);
      toast.error('Failed to load departments');
      setDepartments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorkers = async () => {
    if (!subdomain || subdomain === 'main') return;
    try {
      const workersData = await getWorkers({ subdomain });
      setWorkers(Array.isArray(workersData) ? workersData : []);
    } catch (error) {
      console.error('Failed to load workers:', error);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadWorkers();
  }, [subdomain]);

  const handleViewEmployees = (department) => {
    if (!Array.isArray(department.employees)) {
      toast.warn("No employee data available for this department.");
      return;
    }
    setViewingDepartmentEmployees(department.employees);
    setViewEmployeesModalOpen(true);
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    const trimmedName = addForm.name.trim();
    if (!trimmedName) {
      toast.error('Department name cannot be empty');
      return;
    }

    if (!subdomain || subdomain === 'main') {
      toast.error('Subdomain is missing, check the URL.');
      return;
    }
    
    try {
      const newDepartment = await createDepartment({
        ...addForm,
        name: trimmedName,
        subdomain
      });
      
      const departmentWithKey = {
        ...newDepartment,
        key: newDepartment._id || Math.random().toString(36).substr(2, 9)
      };
      
      setDepartments(prev => [...(Array.isArray(prev) ? prev : []), departmentWithKey]);
      setIsAddModalOpen(false);
      toast.success('Project/Department created successfully');
    } catch (error) {
      console.error('Add Department Error:', error);
      toast.error(error.message || 'Failed to add department');
    }
  };

  const handleEditDepartment = async (e) => {
    e.preventDefault();
    if (!editingDepartment) return;
    
    const trimmedName = editingDepartment.name.trim();
    if (!trimmedName) {
      toast.error('Department name cannot be empty');
      return;
    }
    
    try {
      const updatedDepartment = await updateDepartment(editingDepartment._id, {
        ...editingDepartment,
        name: trimmedName
      });
      
      setDepartments(prev => 
        prev.map(dept => dept._id === updatedDepartment._id ? { ...updatedDepartment, key: updatedDepartment._id } : dept)
      );
      
      setEditingDepartment(null);
      setIsEditModalOpen(false);
      toast.success('Project/Department updated successfully');
    } catch (error) {
      console.error('Edit Department Error:', error);
      toast.error(error.message || 'Failed to update department');
    }
  };

  const handleDeleteDepartment = async () => {
    if (!selectedDepartment) return;
    try {
      await deleteDepartment(selectedDepartment._id);
      setDepartments(prev => (Array.isArray(prev) ? prev : []).filter(dept => dept._id !== selectedDepartment._id));
      setIsDeleteModalOpen(false);
      toast.success('Department deleted successfully');
    } catch (error) {
      console.error('Delete Department Error:', error);
      toast.error(error.message || 'Failed to delete department');
    }
  };

  // Helpers for dynamic Module Repos inputs
  const handleAddModuleRepo = (formType) => {
    if (formType === 'add') {
      setAddForm(prev => ({
        ...prev,
        moduleRepos: [...prev.moduleRepos, '']
      }));
    } else {
      setEditingDepartment(prev => ({
        ...prev,
        moduleRepos: [...(prev.moduleRepos || []), '']
      }));
    }
  };

  const handleModuleRepoChange = (idx, value, formType) => {
    if (formType === 'add') {
      setAddForm(prev => {
        const copy = [...prev.moduleRepos];
        copy[idx] = value;
        return { ...prev, moduleRepos: copy };
      });
    } else {
      setEditingDepartment(prev => {
        const copy = [...(prev.moduleRepos || [])];
        copy[idx] = value;
        return { ...prev, moduleRepos: copy };
      });
    }
  };

  const handleRemoveModuleRepo = (idx, formType) => {
    if (formType === 'add') {
      setAddForm(prev => ({
        ...prev,
        moduleRepos: prev.moduleRepos.filter((_, i) => i !== idx)
      }));
    } else {
      setEditingDepartment(prev => ({
        ...prev,
        moduleRepos: (prev.moduleRepos || []).filter((_, i) => i !== idx)
      }));
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">Project & Department Management</h1>
          <p className="text-sm text-slate-500 mt-1 leading-snug md:hidden lg:block">Organize, track, and manage your teams and projects efficiently.</p>
        </div>
        <Button 
          variant="primary" 
          className="w-full md:w-auto flex items-center justify-center bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-sm text-sm px-4 py-2 rounded-[10px] transition-all whitespace-nowrap"
          onClick={() => {
            setAddForm({
              name: '',
              departmentType: 'Project',
              description: '',
              projectStatus: 'In Progress',
              projectPriority: 'Medium',
              frontendStack: '',
              backendStack: '',
              database: '',
              cloudProvider: '',
              deploymentUrl: '',
              primaryRepoUrl: '',
              moduleRepos: [],
              documentationRepoUrl: '',
              projectLead: '',
              projectManager: '',
              assignedDevelopers: []
            });
            setActiveAddTab('general');
            setIsAddModalOpen(true);
          }}
        >
          <FaPlus className="mr-1.5" /> Add Project/Department
        </Button>
      </div>
  
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No departments or projects found. Add one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {departments.map(department => (
              <div 
                key={department._id} 
                className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex flex-col justify-between hover:shadow-md transition-shadow duration-200"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-900 truncate pr-2">{department.name}</h3>
                    <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${ department.departmentType === 'Product' ? 'bg-purple-100 text-purple-800' : department.departmentType === 'Department' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800' }`}>
                      {department.departmentType || 'Project'}
                    </span>
                  </div>

                  {department.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{department.description}</p>
                  )}

                  {/* Metadata Indicators for projects */}
                  {department.departmentType !== 'Department' && (
                    <div className="space-y-2 mb-4 text-xs text-gray-500 border-t pt-3">
                      {(department.projectStatus || department.projectPriority) && (
                        <div className="flex space-x-2">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                            Status: {department.projectStatus || 'In Progress'}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-medium ${ department.projectPriority === 'Critical' ? 'bg-red-100 text-red-800' : department.projectPriority === 'High' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800' }`}>
                            Priority: {department.projectPriority || 'Medium'}
                          </span>
                        </div>
                      )}

                      {/* Display Lead and Manager */}
                      {department.projectLead && (
                        <div className="flex items-center space-x-1">
                          <FaCrown className="text-amber-500 w-3 h-3" />
                          <span>Lead: <strong>{department.projectLead.name || department.projectLead}</strong></span>
                        </div>
                      )}

                      {/* Stack details snippet */}
                      {(department.frontendStack || department.backendStack || department.database) && (
                        <div className="flex items-center space-x-1 truncate">
                          <FaCode className="text-gray-400 w-3 h-3 flex-shrink-0" />
                          <span className="truncate">
                            {[department.frontendStack, department.backendStack, department.database].filter(Boolean).join(' • ')}
                          </span>
                        </div>
                      )}

                      {/* Repo and Deployment shortcuts */}
                      {(department.primaryRepoUrl || department.deploymentUrl) && (
                        <div className="flex items-center space-x-3 pt-1">
                          {department.primaryRepoUrl && (
                            <a 
                              href={department.primaryRepoUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-gray-600 hover:text-gray-900 inline-flex items-center space-x-1"
                            >
                              <FaGithub className="w-3.5 h-3.5" />
                              <span>GitHub</span>
                            </a>
                          )}
                          {department.deploymentUrl && (
                            <a 
                              href={department.deploymentUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-indigo-600 hover:text-indigo-800 inline-flex items-center space-x-1"
                            >
                              <FaLink className="w-3 h-3" />
                              <span>Live Link</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleViewEmployees(department)}
                    className="inline-flex items-center mt-2 text-indigo-600 font-semibold text-sm hover:text-indigo-800 active:text-indigo-900 cursor-pointer transition-colors duration-150 focus:outline-none"
                  >
                    <FaUserFriends className="inline mr-1.5 align-middle" />
                    {department.workerCount || 0} Employee{(department.workerCount || 0) !== 1 ? 's' : ''}
                  </button>
                </div>

                <div className="flex items-center justify-end space-x-3 border-t pt-3 mt-4">
                  <button
                    className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 hover:bg-blue-50 rounded-lg"
                    title="Edit details"
                    onClick={() => {
                      setEditingDepartment({
                        ...department,
                        projectLead: department.projectLead?._id || department.projectLead || '',
                        projectManager: department.projectManager?._id || department.projectManager || '',
                        assignedDevelopers: department.assignedDevelopers?.map(dev => dev._id || dev) || [],
                        moduleRepos: department.moduleRepos || []
                      });
                      setActiveEditTab('general');
                      setIsEditModalOpen(true);
                    }}
                  >
                    <FaEdit className="w-4 h-4" />
                  </button>
                  <button
                    className="text-red-500 hover:text-red-700 transition-colors p-1.5 hover:bg-red-50 rounded-lg"
                    title="Delete"
                    onClick={() => {
                      setSelectedDepartment(department);
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    <FaTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
  
      {/* Add Department/Project Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Project or Department"
      >
        <form onSubmit={handleAddDepartment} className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200">
            {['General', 'Tech Stack', 'Ownership', 'GitHub Repos'].map((tabLabel, idx) => {
              const tabKey = ['general', 'stack', 'ownership', 'repos'][idx];
              const isActive = activeAddTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveAddTab(tabKey)}
                  className={`py-2 px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-150 ${ isActive ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-indigo-600 hover:border-gray-300' }`}
                >
                  {tabLabel}
                </button>
              );
            })}
          </div>

          {/* General Tab */}
          {activeAddTab === 'general' && (
            <div className="space-y-3 pt-2">
              <div className="form-group">
                <label className="form-label text-sm font-semibold">Name</label>
                <input
                  ref={departmentInputRef}
                  type="text"
                  className="form-input w-full p-2 border rounded"
                  value={addForm.name}
                  onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. InstaxBot or HR"
                  required
                  maxLength={50}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Type</label>
                  <select
                    className="form-input w-full p-2 border rounded"
                    value={addForm.departmentType}
                    onChange={e => setAddForm(prev => ({ ...prev, departmentType: e.target.value }))}
                  >
                    <option value="Department">Department</option>
                    <option value="Project">Project</option>
                    <option value="Product">Product</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Status</label>
                  <select
                    className="form-input w-full p-2 border rounded"
                    value={addForm.projectStatus}
                    onChange={e => setAddForm(prev => ({ ...prev, projectStatus: e.target.value }))}
                    disabled={addForm.departmentType === 'Department'}
                  >
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Done">Done</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Priority</label>
                  <select
                    className="form-input w-full p-2 border rounded"
                    value={addForm.projectPriority}
                    onChange={e => setAddForm(prev => ({ ...prev, projectPriority: e.target.value }))}
                    disabled={addForm.departmentType === 'Department'}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-sm font-semibold">Description</label>
                <textarea
                  className="form-input w-full p-2 border rounded"
                  rows="3"
                  value={addForm.description}
                  onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Provide a detailed description of this department, project, or product..."
                />
              </div>
            </div>
          )}

          {/* Tech Stack Tab */}
          {activeAddTab === 'stack' && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Frontend Stack</label>
                  <input
                    type="text"
                    className="form-input w-full p-2 border rounded"
                    value={addForm.frontendStack}
                    onChange={e => setAddForm(prev => ({ ...prev, frontendStack: e.target.value }))}
                    placeholder="e.g. React, Tailwind"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Backend Stack</label>
                  <input
                    type="text"
                    className="form-input w-full p-2 border rounded"
                    value={addForm.backendStack}
                    onChange={e => setAddForm(prev => ({ ...prev, backendStack: e.target.value }))}
                    placeholder="e.g. Node.js, Express"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Database</label>
                  <input
                    type="text"
                    className="form-input w-full p-2 border rounded"
                    value={addForm.database}
                    onChange={e => setAddForm(prev => ({ ...prev, database: e.target.value }))}
                    placeholder="e.g. MongoDB"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Cloud Provider</label>
                  <input
                    type="text"
                    className="form-input w-full p-2 border rounded"
                    value={addForm.cloudProvider}
                    onChange={e => setAddForm(prev => ({ ...prev, cloudProvider: e.target.value }))}
                    placeholder="e.g. AWS, GCP"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-sm font-semibold">Deployment URL</label>
                <input
                  type="url"
                  className="form-input w-full p-2 border rounded"
                  value={addForm.deploymentUrl}
                  onChange={e => setAddForm(prev => ({ ...prev, deploymentUrl: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          )}

          {/* Ownership Tab */}
          {activeAddTab === 'ownership' && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Project Lead</label>
                  <select
                    className="form-input w-full p-2 border rounded"
                    value={addForm.projectLead}
                    onChange={e => setAddForm(prev => ({ ...prev, projectLead: e.target.value }))}
                  >
                    <option value="">Select Project Lead</option>
                    {workers.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Project Manager</label>
                  <select
                    className="form-input w-full p-2 border rounded"
                    value={addForm.projectManager}
                    onChange={e => setAddForm(prev => ({ ...prev, projectManager: e.target.value }))}
                  >
                    <option value="">Select Project Manager</option>
                    {workers.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-sm font-semibold mb-1 block">Assigned Developers</label>
                <div className="border border-gray-200 rounded p-2.5 max-h-48 overflow-y-auto space-y-1 bg-gray-50">
                  {workers.length === 0 ? (
                    <span className="text-xs text-gray-500">No developers found.</span>
                  ) : (
                    workers.map(worker => {
                      const isChecked = addForm.assignedDevelopers.includes(worker._id);
                      return (
                        <label key={worker._id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAddForm(prev => ({
                                  ...prev,
                                  assignedDevelopers: [...prev.assignedDevelopers, worker._id]
                                }));
                              } else {
                                setAddForm(prev => ({
                                  ...prev,
                                  assignedDevelopers: prev.assignedDevelopers.filter(id => id !== worker._id)
                                }));
                              }
                            }}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{worker.name} ({worker.username})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GitHub Repos Tab */}
          {activeAddTab === 'repos' && (
            <div className="space-y-3 pt-2">
              <div className="form-group">
                <label className="form-label text-sm font-semibold">Primary GitHub Repo URL</label>
                <input
                  type="url"
                  className="form-input w-full p-2 border rounded"
                  value={addForm.primaryRepoUrl}
                  onChange={e => setAddForm(prev => ({ ...prev, primaryRepoUrl: e.target.value }))}
                  placeholder="https://github.com/company/project"
                />
              </div>

              <div className="form-group">
                <label className="form-label text-sm font-semibold">Documentation Repo URL</label>
                <input
                  type="url"
                  className="form-input w-full p-2 border rounded"
                  value={addForm.documentationRepoUrl}
                  onChange={e => setAddForm(prev => ({ ...prev, documentationRepoUrl: e.target.value }))}
                  placeholder="https://github.com/company/project-docs"
                />
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="form-label text-sm font-semibold">Module Repositories</label>
                  <button
                    type="button"
                    onClick={() => handleAddModuleRepo('add')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    + Add Module Repo
                  </button>
                </div>
                {addForm.moduleRepos.map((repo, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="url"
                      className="form-input flex-1 p-2 border rounded"
                      value={repo}
                      onChange={(e) => handleModuleRepoChange(idx, e.target.value, 'add')}
                      placeholder="e.g. Microservice module GitHub URL"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveModuleRepo(idx, 'add')}
                      className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded"
                    >
                      <FaTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end mt-6 space-x-2 border-t pt-4">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!addForm.name.trim()}>
              Add Project/Dept
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Department/Project Modal */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingDepartment(null);
        }} 
        title="Edit Project or Department"
      >
        {editingDepartment && (
          <form onSubmit={handleEditDepartment} className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
              {['General', 'Tech Stack', 'Ownership', 'GitHub Repos'].map((tabLabel, idx) => {
                const tabKey = ['general', 'stack', 'ownership', 'repos'][idx];
                const isActive = activeEditTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveEditTab(tabKey)}
                    className={`py-2 px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-150 ${ isActive ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-indigo-600 hover:border-gray-300' }`}
                  >
                    {tabLabel}
                  </button>
                );
              })}
            </div>

            {/* General Tab */}
            {activeEditTab === 'general' && (
              <div className="space-y-3 pt-2">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Name</label>
                  <input
                    type="text"
                    className="form-input w-full p-2 border rounded"
                    value={editingDepartment.name}
                    onChange={e => setEditingDepartment(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. InstaxBot or HR"
                    required
                    maxLength={50}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Type</label>
                    <select
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.departmentType || 'Project'}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, departmentType: e.target.value }))}
                    >
                      <option value="Department">Department</option>
                      <option value="Project">Project</option>
                      <option value="Product">Product</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Status</label>
                    <select
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.projectStatus || 'In Progress'}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, projectStatus: e.target.value }))}
                      disabled={editingDepartment.departmentType === 'Department'}
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Review">Review</option>
                      <option value="Done">Done</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Priority</label>
                    <select
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.projectPriority || 'Medium'}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, projectPriority: e.target.value }))}
                      disabled={editingDepartment.departmentType === 'Department'}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Description</label>
                  <textarea
                    className="form-input w-full p-2 border rounded"
                    rows="3"
                    value={editingDepartment.description || ''}
                    onChange={e => setEditingDepartment(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Provide a detailed description of this department, project, or product..."
                  />
                </div>
              </div>
            )}

            {/* Tech Stack Tab */}
            {activeEditTab === 'stack' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Frontend Stack</label>
                    <input
                      type="text"
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.frontendStack || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, frontendStack: e.target.value }))}
                      placeholder="e.g. React, Tailwind"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Backend Stack</label>
                    <input
                      type="text"
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.backendStack || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, backendStack: e.target.value }))}
                      placeholder="e.g. Node.js, Express"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Database</label>
                    <input
                      type="text"
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.database || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, database: e.target.value }))}
                      placeholder="e.g. MongoDB"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Cloud Provider</label>
                    <input
                      type="text"
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.cloudProvider || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, cloudProvider: e.target.value }))}
                      placeholder="e.g. AWS, GCP"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Deployment URL</label>
                  <input
                    type="url"
                    className="form-input w-full p-2 border rounded"
                    value={editingDepartment.deploymentUrl || ''}
                    onChange={e => setEditingDepartment(prev => ({ ...prev, deploymentUrl: e.target.value }))}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            )}

            {/* Ownership Tab */}
            {activeEditTab === 'ownership' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Project Lead</label>
                    <select
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.projectLead || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, projectLead: e.target.value }))}
                    >
                      <option value="">Select Project Lead</option>
                      {workers.map(w => (
                        <option key={w._id} value={w._id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label text-sm font-semibold">Project Manager</label>
                    <select
                      className="form-input w-full p-2 border rounded"
                      value={editingDepartment.projectManager || ''}
                      onChange={e => setEditingDepartment(prev => ({ ...prev, projectManager: e.target.value }))}
                    >
                      <option value="">Select Project Manager</option>
                      {workers.map(w => (
                        <option key={w._id} value={w._id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold mb-1 block">Assigned Developers</label>
                  <div className="border border-gray-200 rounded p-2.5 max-h-48 overflow-y-auto space-y-1 bg-gray-50">
                    {workers.length === 0 ? (
                      <span className="text-xs text-gray-500">No developers found.</span>
                    ) : (
                      workers.map(worker => {
                        const isChecked = (editingDepartment.assignedDevelopers || []).includes(worker._id);
                        return (
                          <label key={worker._id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditingDepartment(prev => ({
                                    ...prev,
                                    assignedDevelopers: [...(prev.assignedDevelopers || []), worker._id]
                                  }));
                                } else {
                                  setEditingDepartment(prev => ({
                                    ...prev,
                                    assignedDevelopers: (prev.assignedDevelopers || []).filter(id => id !== worker._id)
                                  }));
                                }
                              }}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>{worker.name} ({worker.username})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* GitHub Repos Tab */}
            {activeEditTab === 'repos' && (
              <div className="space-y-3 pt-2">
                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Primary GitHub Repo URL</label>
                  <input
                    type="url"
                    className="form-input w-full p-2 border rounded"
                    value={editingDepartment.primaryRepoUrl || ''}
                    onChange={e => setEditingDepartment(prev => ({ ...prev, primaryRepoUrl: e.target.value }))}
                    placeholder="https://github.com/company/project"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label text-sm font-semibold">Documentation Repo URL</label>
                  <input
                    type="url"
                    className="form-input w-full p-2 border rounded"
                    value={editingDepartment.documentationRepoUrl || ''}
                    onChange={e => setEditingDepartment(prev => ({ ...prev, documentationRepoUrl: e.target.value }))}
                    placeholder="https://github.com/company/project-docs"
                  />
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="form-label text-sm font-semibold">Module Repositories</label>
                    <button
                      type="button"
                      onClick={() => handleAddModuleRepo('edit')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      + Add Module Repo
                  </button>
                  </div>
                  {(editingDepartment.moduleRepos || []).map((repo, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="url"
                        className="form-input flex-1 p-2 border rounded"
                        value={repo}
                        onChange={(e) => handleModuleRepoChange(idx, e.target.value, 'edit')}
                        placeholder="e.g. Microservice module GitHub URL"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveModuleRepo(idx, 'edit')}
                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded"
                      >
                        <FaTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6 space-x-2 border-t pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingDepartment(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="primary" 
                disabled={!editingDepartment.name?.trim()}
              >
                Update Project/Dept
              </Button>
            </div>
          </form>
        )}
      </Modal>
  
      {/* Delete Department Modal */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Delete Department"
      >
        {selectedDepartment && (
          <div>
            <p className="mb-4">
              Are you sure you want to delete <strong>{selectedDepartment.name}</strong>?
            </p>
            <p className="mb-4 text-red-600">
              {selectedDepartment.workerCount > 0 
                ? `This department has ${selectedDepartment.workerCount} employee(s). You cannot delete it.`
                : 'This action cannot be undone.'}
            </p>
            
            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="danger" 
                onClick={handleDeleteDepartment}
                disabled={selectedDepartment.workerCount > 0}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
      
      {/* Employees Viewer Modal */}
      <Modal 
          isOpen={viewEmployeesModalOpen} 
          onClose={() => setViewEmployeesModalOpen(false)} 
          title="Department Employees"
      >
          {viewingDepartmentEmployees.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No employees found in this department.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {viewingDepartmentEmployees.map((emp, idx) => (
                <div key={idx} className="flex items-center space-x-4 bg-gray-50 p-3 rounded shadow-sm">
                  <img 
                    src={emp.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}`}
                    alt={emp.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <span className="text-md font-medium">{emp.name}</span>
                </div>
              ))}
            </div>
          )}
      </Modal>
    </div>
  );
}

export default DepartmentManagement;