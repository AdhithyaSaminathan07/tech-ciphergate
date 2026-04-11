import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaUserPlus, FaFilter, FaSearch, FaEdit, FaTrash, FaFilePdf, FaPlus, FaTimes, FaChartBar, FaCog } from 'react-icons/fa';
import { getWorkers } from '../../services/workerService';
import { addWorkerWithCompensation, updateWorkerCompensation } from '../../services/workerService';
import { getCompensationReport } from '../../services/salaryService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const EmployeeCompensation = () => {
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, intern, intern_with_stphen, employee, developer
  const [selectedClassFilter, setSelectedClassFilter] = useState('all'); // all, A, B, C, etc.
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [compensationReport, setCompensationReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [selectedConfigType, setSelectedConfigType] = useState('intern');
  const [configClasses, setConfigClasses] = useState({
    intern_with_stphen: { A: 7000, B: 5000, C: 3000 },
    employee: { A: 12000, B: 9000, C: 7000 }
  });
  const [newClass, setNewClass] = useState({ name: '', amount: '' });
  const [editingClass, setEditingClass] = useState({ name: '', amount: '' });
  const [editingClassKey, setEditingClassKey] = useState(null);
  const [workerForm, setWorkerForm] = useState({
    name: '',
    employeeType: 'intern',
    class: 'A',
    salary: 0
  });

  const { subdomain } = useContext(appContext);

  const employeeTypes = [
    { value: 'intern', label: 'Intern', hasClasses: false },
    { value: 'intern_with_stphen', label: 'Intern with Stphen', hasClasses: true },
    { value: 'employee', label: 'Employee', hasClasses: true },
    { value: 'developer', label: 'Developer', hasClasses: false }
  ];

  const employeeClasses = [
    { value: 'A', label: 'Class A' },
    { value: 'B', label: 'Class B' },
    { value: 'C', label: 'Class C' }
  ];

  const classSalaryAmounts = {
    intern_with_stphen: {
      A: 7000,
      B: 5000,
      C: 3000
    },
    employee: {
      A: 12000,
      B: 9000,
      C: 7000
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const workersData = await getWorkers({ subdomain });
      const safeWorkersData = Array.isArray(workersData) ? workersData : [];
      setWorkers(safeWorkersData);
    } catch (error) {
      toast.error('Failed to load workers');
      console.error(error);
      setWorkers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCompensationReport = async () => {
    setReportLoading(true);
    try {
      const filters = {};
      if (selectedFilter !== 'all') {
        filters.employeeType = selectedFilter;
      }
      if (selectedClassFilter !== 'all') {
        filters.class = selectedClassFilter;
      }
      
      const reportData = await getCompensationReport(subdomain, filters);
      setCompensationReport(reportData);
    } catch (error) {
      toast.error('Failed to load compensation report');
      console.error(error);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isReportModalOpen) {
      loadCompensationReport();
    }
  }, [isReportModalOpen, selectedFilter, selectedClassFilter]);

  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = worker.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || worker.employeeType === selectedFilter;
    const matchesClassFilter = selectedClassFilter === 'all' || worker.class === selectedClassFilter;
    return matchesSearch && matchesFilter && matchesClassFilter;
  });

  const handleAddWorker = async (e) => {
    e.preventDefault();
    
    try {
      // Calculate salary based on type and class
      let calculatedSalary = 0;
      if (workerForm.employeeType === 'intern') {
        calculatedSalary = 0;
      } else if (workerForm.employeeType === 'intern_with_stphen' || workerForm.employeeType === 'employee') {
        const classAmounts = configClasses[workerForm.employeeType] || classSalaryAmounts[workerForm.employeeType];
        calculatedSalary = classAmounts[workerForm.class] || 0;
      } else if (workerForm.employeeType === 'developer') {
        calculatedSalary = 0; // Developers get 60% of project profit, handled separately
      }

      const workerData = {
        ...workerForm,
        salary: calculatedSalary,
        subdomain
      };

      await addWorkerWithCompensation(workerData);
      toast.success('Worker added successfully');
      setIsAddModalOpen(false);
      setWorkerForm({
        name: '',
        employeeType: 'intern',
        class: 'A',
        salary: 0
      });
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to add worker');
    }
  };

  const handleUpdateWorker = async (e) => {
    e.preventDefault();
    
    try {
      // Calculate salary based on type and class
      let calculatedSalary = 0;
      if (workerForm.employeeType === 'intern') {
        calculatedSalary = 0;
      } else if (workerForm.employeeType === 'intern_with_stphen' || workerForm.employeeType === 'employee') {
        const classAmounts = configClasses[workerForm.employeeType] || classSalaryAmounts[workerForm.employeeType];
        calculatedSalary = classAmounts[workerForm.class] || 0;
      } else if (workerForm.employeeType === 'developer') {
        calculatedSalary = 0; // Developers get 60% of project profit, handled separately
      }

      const workerData = {
        ...workerForm,
        salary: calculatedSalary
      };

      await updateWorkerCompensation(selectedWorker._id, workerData);
      toast.success('Worker updated successfully');
      setIsEditModalOpen(false);
      setSelectedWorker(null);
      setWorkerForm({
        name: '',
        employeeType: 'intern',
        class: 'A',
        salary: 0
      });
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to update worker');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setWorkerForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const openAddModal = () => {
    setWorkerForm({
      name: '',
      employeeType: 'intern',
      class: 'A',
      salary: 0
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (worker) => {
    setSelectedWorker(worker);
    setWorkerForm({
      name: worker.name || '',
      employeeType: worker.employeeType || 'intern',
      class: worker.class || 'A',
      salary: worker.salary || 0
    });
    setIsEditModalOpen(true);
  };

  // Configuration functions
  const openConfigModal = (type = 'intern_with_stphen') => {
    setSelectedConfigType(type);
    setIsConfigModalOpen(true);
  };

  const handleAddNewClass = () => {
    if (!newClass.name || !newClass.amount) {
      toast.error('Please enter both class name and amount');
      return;
    }

    const classAmount = parseFloat(newClass.amount);
    if (isNaN(classAmount) || classAmount < 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setConfigClasses(prev => ({
      ...prev,
      [selectedConfigType]: {
        ...prev[selectedConfigType],
        [newClass.name]: classAmount
      }
    }));

    setNewClass({ name: '', amount: '' });
    toast.success(`Class ${newClass.name} added successfully`);
  };

  const handleEditClass = (className) => {
    const amount = configClasses[selectedConfigType][className] || classSalaryAmounts[selectedConfigType][className];
    setEditingClass({ name: className, amount: amount.toString() });
    setEditingClassKey(className);
  };

  const handleSaveEditClass = () => {
    if (!editingClass.name || !editingClass.amount) {
      toast.error('Please enter both class name and amount');
      return;
    }

    const classAmount = parseFloat(editingClass.amount);
    if (isNaN(classAmount) || classAmount < 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setConfigClasses(prev => ({
      ...prev,
      [selectedConfigType]: {
        ...prev[selectedConfigType],
        [editingClassKey]: classAmount
      }
    }));

    // If class name changed, remove the old key
    if (editingClass.name !== editingClassKey) {
      setConfigClasses(prev => {
        const newClasses = { ...prev[selectedConfigType] };
        delete newClasses[editingClassKey];
        return {
          ...prev,
          [selectedConfigType]: {
            ...newClasses,
            [editingClass.name]: classAmount
          }
        };
      });
    }

    setEditingClass({ name: '', amount: '' });
    setEditingClassKey(null);
    toast.success('Class updated successfully');
  };

  const handleDeleteClass = (className) => {
    if (window.confirm(`Are you sure you want to delete class ${className}?`)) {
      setConfigClasses(prev => {
        const newClasses = { ...prev[selectedConfigType] };
        delete newClasses[className];
        return {
          ...prev,
          [selectedConfigType]: newClasses
        };
      });
      toast.success(`Class ${className} deleted successfully`);
    }
  };

  const getSalaryDisplay = (worker) => {
    if (worker.employeeType === 'developer') {
      return '60% of project profit';
    }
    if (worker.employeeType === 'intern') {
      return 'No salary';
    }
    return `₹${worker.salary?.toFixed(2) || '0.00'}`;
  };

  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      render: (record) => (
        <div className="flex items-center">
          {record?.photo && (
            <img
              src={record.photo
                ? record.photo
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}`}
              alt="Employee"
              className="w-8 h-8 rounded-full mr-2"
            />
          )}
          {record?.name || 'Unknown'}
        </div>
      )
    },
    {
      header: 'Employee Type',
      accessor: 'employeeType',
      render: (record) => {
        const type = employeeTypes.find(t => t.value === record.employeeType);
        return type ? type.label : record.employeeType;
      }
    },
    {
      header: 'Class',
      accessor: 'class',
      render: (record) => {
        if (record.employeeType === 'intern' || record.employeeType === 'developer') {
          return '-';
        }
        const classType = employeeClasses.find(c => c.value === record.class);
        return classType ? classType.label : record.class;
      }
    },
    {
      header: 'Salary',
      accessor: 'salary',
      render: (record) => getSalaryDisplay(record)
    },
    {
      header: 'Actions',
      accessor: 'actions',
      render: (worker) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openEditModal(worker)}
            className="p-1 text-blue-600 hover:text-blue-800"
            title="Edit"
          >
            <FaEdit className='text-xl' />
          </button>
          <button
            onClick={() => {}}
            className="p-1 text-red-600 hover:text-red-800"
            title="Delete"
          >
            <FaTrash className='text-xl' />
          </button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">Employee Compensation</h1>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Button
            variant="secondary"
            className='flex items-center justify-center'
            onClick={() => openConfigModal()}
          >
            <FaCog className="mr-2" /> Manage Classes & Salaries
          </Button>
          <Button
            variant="primary"
            className='flex items-center justify-center'
            onClick={openAddModal}
          >
            <FaUserPlus className="mr-2" /> Add Worker
          </Button>
          <Button
            variant="secondary"
            className='flex items-center justify-center'
            onClick={() => setIsReportModalOpen(true)}
          >
            <FaChartBar className="mr-2" /> View Report
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="form-input pl-10 w-full"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <div className="relative">
              <FaFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select
                className="form-input pl-10 w-full"
                value={selectedFilter}
                onChange={(e) => {
                  setSelectedFilter(e.target.value);
                  // Reset class filter when type changes
                  setSelectedClassFilter('all');
                }}
              >
                <option value="all">All Types</option>
                <option value="intern">Intern</option>
                <option value="intern_with_stphen">Intern with Stphen</option>
                <option value="employee">Employee</option>
                <option value="developer">Developer</option>
              </select>
            </div>
          </div>
          
          {/* Class Filter - Only show when a type with classes is selected */}
          {(selectedFilter === 'intern_with_stphen' || selectedFilter === 'employee') && (
            <div className="w-full md:w-48">
              <div className="relative">
                <FaFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                  className="form-input pl-10 w-full"
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                >
                  <option value="all">All Classes</option>
                  {Object.keys(configClasses[selectedFilter] || classSalaryAmounts[selectedFilter] || {}).map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredWorkers}
            noDataMessage="No employees found."
          />
        )}
      </Card>

      {/* Add Worker Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Worker"
      >
        <form onSubmit={handleAddWorker}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="form-label">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                className="form-input"
                value={workerForm.name}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div>
              <label htmlFor="employeeType" className="form-label">Employee Type</label>
              <select
                id="employeeType"
                name="employeeType"
                className="form-input"
                value={workerForm.employeeType}
                onChange={handleFormChange}
                required
              >
                {employeeTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            
            {(employeeTypes.find(t => t.value === workerForm.employeeType)?.hasClasses) && (
              <div>
                <label htmlFor="class" className="form-label">Class</label>
                <select
                  id="class"
                  name="class"
                  className="form-input"
                  value={workerForm.class}
                  onChange={handleFormChange}
                  required
                >
                  {Object.keys(configClasses[workerForm.employeeType] || classSalaryAmounts[workerForm.employeeType] || {}).map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="pt-4">
              <p className="text-sm text-gray-600">
                <strong>Salary Information:</strong><br />
                {workerForm.employeeType === 'intern' && 'No salary for interns'}
                {workerForm.employeeType === 'intern_with_stphen' && (
                  <>
                    {Object.entries(configClasses['intern_with_stphen'] || classSalaryAmounts['intern_with_stphen'] || {}).map(([cls, amount]) => (
                      <div key={cls}>{cls}: ₹{amount}</div>
                    ))}
                  </>
                )}
                {workerForm.employeeType === 'employee' && (
                  <>
                    {Object.entries(configClasses['employee'] || classSalaryAmounts['employee'] || {}).map(([cls, amount]) => (
                      <div key={cls}>{cls}: ₹{amount}</div>
                    ))}
                  </>
                )}
                {workerForm.employeeType === 'developer' && '60% of project profit'}
              </p>
            </div>
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
              Add Worker
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Worker Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Worker"
      >
        <form onSubmit={handleUpdateWorker}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="form-label">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                className="form-input"
                value={workerForm.name}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div>
              <label htmlFor="employeeType" className="form-label">Employee Type</label>
              <select
                id="employeeType"
                name="employeeType"
                className="form-input"
                value={workerForm.employeeType}
                onChange={handleFormChange}
                required
              >
                {employeeTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            
            {(employeeTypes.find(t => t.value === workerForm.employeeType)?.hasClasses) && (
              <div>
                <label htmlFor="class" className="form-label">Class</label>
                <select
                  id="class"
                  name="class"
                  className="form-input"
                  value={workerForm.class}
                  onChange={handleFormChange}
                  required
                >
                  {Object.keys(configClasses[workerForm.employeeType] || classSalaryAmounts[workerForm.employeeType] || {}).map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="pt-4">
              <p className="text-sm text-gray-600">
                <strong>Salary Information:</strong><br />
                {workerForm.employeeType === 'intern' && 'No salary for interns'}
                {workerForm.employeeType === 'intern_with_stphen' && (
                  <>
                    {Object.entries(configClasses['intern_with_stphen'] || classSalaryAmounts['intern_with_stphen'] || {}).map(([cls, amount]) => (
                      <div key={cls}>{cls}: ₹{amount}</div>
                    ))}
                  </>
                )}
                {workerForm.employeeType === 'employee' && (
                  <>
                    {Object.entries(configClasses['employee'] || classSalaryAmounts['employee'] || {}).map(([cls, amount]) => (
                      <div key={cls}>{cls}: ₹{amount}</div>
                    ))}
                  </>
                )}
                {workerForm.employeeType === 'developer' && '60% of project profit'}
              </p>
            </div>
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
              Update Worker
            </Button>
          </div>
        </form>
      </Modal>

      {/* Compensation Configuration Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Manage Classes & Salaries"
        size="lg"
      >
        <div>
          <div className="mb-4">
            <label className="form-label">Select Employee Type</label>
            <select
              className="form-input w-full"
              value={selectedConfigType}
              onChange={(e) => setSelectedConfigType(e.target.value)}
            >
              {employeeTypes.filter(type => type.hasClasses).map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">
              Classes for {employeeTypes.find(t => t.value === selectedConfigType)?.label || selectedConfigType}
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(configClasses[selectedConfigType] || classSalaryAmounts[selectedConfigType] || {}).map(([cls, amount]) => (
                    <tr key={cls}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingClassKey === cls ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingClass.name}
                            onChange={(e) => setEditingClass({...editingClass, name: e.target.value})}
                          />
                        ) : (
                          <span>{cls}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingClassKey === cls ? (
                          <input
                            type="number"
                            className="form-input"
                            value={editingClass.amount}
                            onChange={(e) => setEditingClass({...editingClass, amount: e.target.value})}
                            min="0"
                            step="0.01"
                          />
                        ) : (
                          <span>₹{amount?.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingClassKey === cls ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={handleSaveEditClass}
                              className="p-1 text-green-600 hover:text-green-800"
                              title="Save"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => {
                                setEditingClass({ name: '', amount: '' });
                                setEditingClassKey(null);
                              }}
                              className="p-1 text-gray-600 hover:text-gray-800"
                              title="Cancel"
                            >
                              <FaTimes />
                            </button>
                          </div>
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditClass(cls)}
                              className="p-1 text-blue-600 hover:text-blue-800"
                              title="Edit"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteClass(cls)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Add New Class</h3>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Class Name (e.g., D, E, etc.)"
                className="form-input flex-1"
                value={newClass.name}
                onChange={(e) => setNewClass({...newClass, name: e.target.value})}
              />
              <input
                type="number"
                placeholder="Amount (₹)"
                className="form-input w-32"
                value={newClass.amount}
                onChange={(e) => setNewClass({...newClass, amount: e.target.value})}
                min="0"
                step="0.01"
              />
              <Button
                variant="primary"
                onClick={handleAddNewClass}
              >
                Add Class
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setIsConfigModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Compensation Report Modal */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Compensation Report"
        size="xl"
      >
        <div>
          {reportLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : compensationReport ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-800">Total Workers</h3>
                  <p className="text-2xl font-bold text-blue-600">{compensationReport.totalWorkers}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">Total Compensation</h3>
                  <p className="text-2xl font-bold text-green-600">₹{compensationReport.totalCompensation?.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800">Filter Applied</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    {selectedFilter === 'all' ? 'All Types' : 
                     employeeTypes.find(t => t.value === selectedFilter)?.label || 'All Types'}
                  </p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {compensationReport.report.map((worker) => (
                      <tr key={worker._id}>
                        <td className="px-6 py-4 whitespace-nowrap">{worker.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {employeeTypes.find(t => t.value === worker.employeeType)?.label || worker.employeeType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{worker.class}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{worker.department}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{worker.calculatedSalary?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">No report data available</p>
          )}
          
          <div className="flex justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setIsReportModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeeCompensation;