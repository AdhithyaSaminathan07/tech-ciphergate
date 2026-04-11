import React, { useState, useEffect, useContext,useRef } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaEdit,FaUserFriends } from 'react-icons/fa';
import { getDepartments, createDepartment, deleteDepartment,updateDepartment } from '../../services/departmentService';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const DepartmentManagement = () => {
  const departmentInputRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentName, setDepartmentName] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [viewEmployeesModalOpen, setViewEmployeesModalOpen] = useState(false);
  const [viewingDepartmentEmployees, setViewingDepartmentEmployees] = useState([]);

  const handleViewEmployees = (department) => {
    if (!Array.isArray(department.employees)) {
      toast.warn("No employee data available for this department.");
      return;
    }
  
    setViewingDepartmentEmployees(department.employees); // expected: array of { name, photo }
    setViewEmployeesModalOpen(true);
  };
  
  const { subdomain } = useContext(appContext);

  useEffect(() => {
    if (isAddModalOpen && departmentInputRef.current) {
      setTimeout(() => departmentInputRef.current.focus(), 100);
    }
  }, [isAddModalOpen]);

  const loadDepartments = async () => {
    setIsLoading(true);
    if (!subdomain || subdomain == 'main') {
      return;
    }

    try {
      const departmentsData = await getDepartments({ subdomain });
      console.log('Departments Loaded:', departmentsData);
      
      // Ensure departmentsData is an array and has unique identifiers
      const safeDepartments = Array.isArray(departmentsData) 
        ? departmentsData.map(dept => ({
            ...dept,
            // Ensure a unique key if not already present
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

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    
    // Trim and validate department name
    const trimmedName = departmentName.trim();
    if (!trimmedName) {
      toast.error('Department name cannot be empty');
      return;
    }

    if (!subdomain || subdomain == 'main') {
      console.log(subdomain);
      toast.error('Subdomain is missing, check the URL.');
      return;
    }
    
    try {
      // Create department
      const newDepartment = await createDepartment({ name: trimmedName, subdomain });
      
      // Add a unique key to the new department
      const departmentWithKey = {
        ...newDepartment,
        key: newDepartment._id || Math.random().toString(36).substr(2, 9)
      };
      
      // Update local state
      setDepartments(prev => {
        // Ensure prev is an array before spreading
        const currentDepartments = Array.isArray(prev) ? prev : [];
        return [...currentDepartments, departmentWithKey];
      });
      
      // Reset form and close modal
      setDepartmentName('');
      setIsAddModalOpen(false);
      
      toast.success('Department added successfully');
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
      // Update department
      const updatedDepartment = await updateDepartment(editingDepartment._id, { 
        name: trimmedName 
      });
      
      // Update local state
      setDepartments(prev => 
        prev.map(dept => 
          dept._id === updatedDepartment._id ? updatedDepartment : dept
        )
      );
      
      // Reset and close modal
      setEditingDepartment(null);
      setIsEditModalOpen(false);
      
      toast.success('Department updated successfully');
    } catch (error) {
      console.error('Edit Department Error:', error);
      toast.error(error.message || 'Failed to update department');
    }
  };

  const handleDeleteDepartment = async () => {
    if (!selectedDepartment) return;
    
    try {
      // Delete department
      await deleteDepartment(selectedDepartment._id);
      
      // Update local state
      setDepartments(prev => {
        // Ensure prev is an array before filtering
        const currentDepartments = Array.isArray(prev) ? prev : [];
        return currentDepartments.filter(dept => dept._id !== selectedDepartment._id);
      });
      
      // Close modal
      setIsDeleteModalOpen(false);
      
      toast.success('Department deleted successfully');
    } catch (error) {
      console.error('Delete Department Error:', error);
      toast.error(error.message || 'Failed to delete department');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Department Management</h1>
        <Button 
          variant="primary" 
          onClick={() => setIsAddModalOpen(true)}
        >
          <FaPlus className="mr-2 inline" /> Add Department
        </Button>
      </div>
  
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No departments found. Add a department to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(department => (
              <div 
                key={department._id} 
                className="bg-white border rounded-lg p-4 flex justify-between items-center"
              >
                {/* …inside your departments.map(…) */}
                <div>
                  <h3 className="text-lg font-medium">{department.name}</h3>
                  <button
                    onClick={() => handleViewEmployees(department)}
                    className="
                      inline-flex items-center
                      text-indigo-600 font-semibold
                      hover:text-indigo-800 active:text-indigo-900
                      cursor-pointer
                      transform hover:scale-105
                      transition-transform duration-75 ease-in-out
                      focus:outline-none
                    "
                  >
                    <FaUserFriends className="inline mr-1 align-text-bottom" />
                    {department.workerCount || 0} Employee{(department.workerCount || 0) !== 1 ? 's' : ''}
                  </button>

                </div>

                <div className="flex items-center space-x-2">
                  <button
                    className="text-blue-500 hover:text-blue-700 mr-2"
                    onClick={() => {
                      setEditingDepartment(department);
                      setIsEditModalOpen(true);
                    }}
                  >
                    <FaEdit />
                  </button>
                  <button
                    className="text-red-500 hover:text-red-700"
                    onClick={() => {
                      setSelectedDepartment(department);
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
  
      {/* Add Department Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Department"
      >
        <form onSubmit={handleAddDepartment}>
          <div className="form-group mb-4">
            <label className="form-label">Department Name</label>
            <input
              ref={departmentInputRef}
              type="text"
              className="form-input"
              value={departmentName}
              onChange={e => setDepartmentName(e.target.value)}
              placeholder="Enter department name"
              required
              maxLength={50}
            />
          </div>
          <div className="flex justify-end mt-6 space-x-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!departmentName.trim()}>
              Add Department
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Department Modal */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingDepartment(null);
        }} 
        title="Edit Department"
      >
        <form onSubmit={handleEditDepartment}>
          <div className="form-group mb-4">
            <label className="form-label">Department Name</label>
            <input
              type="text"
              className="form-input"
              value={editingDepartment?.name || ''}
              onChange={e => setEditingDepartment(prev => ({
                ...prev,
                name: e.target.value
              }))}
              placeholder="Enter department name"
              required
              maxLength={50}
            />
          </div>
          <div className="flex justify-end mt-6 space-x-2">
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
              disabled={!editingDepartment?.name?.trim()}
            >
              Update Department
            </Button>
          </div>
        </form>
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