import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom'; // Added useLocation import
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaCamera } from 'react-icons/fa';
import { getWorkers, createWorker, updateWorker, deleteWorker, getUniqueId } from '../../services/workerService';
import { getDepartments } from '../../services/departmentService';
import { getSettings } from '../../services/settingsService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import QRCode from 'qrcode';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import FaceCapture from './FaceCapture'; // Import FaceCapture component

const WorkerManagement = () => {
  const location = useLocation(); // Added useLocation hook
  const nameInputRef = useRef(null);
  const [workers, setWorkers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [batches, setBatches] = useState([]); // <-- This line was missing
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [showFaceCapture, setShowFaceCapture] = useState(false); // State for face capture modal
  const [selectedWorkerForFace, setSelectedWorkerForFace] = useState(null); // Worker selected for face capture
  const [workerFaceEmbeddings, setWorkerFaceEmbeddings] = useState([]); // Store face embeddings for worker

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    setFormData(prev => ({ ...prev, photo: file }));
  };

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    rfid: '',
    salary: 0,
    batch: '',
    password: '',
    confirmPassword: '',
    department: '',
    photo: '',
    original_certificate_status: 'not_submitted', // ADDED
    faceEmbeddings: [] // Add face embeddings to form data
  });

  // Subdomain
  const { subdomain } = useContext(appContext);

  // Load workers and departments
  const loadData = async () => {
    setIsLoading(true);
    setIsLoadingDepartments(true);

    try {
      const [workersData, departmentsData, settingsData] = await Promise.all([
        getWorkers({ subdomain }),
        getDepartments({ subdomain }),
        getSettings({ subdomain })
      ]);

      const safeWorkersData = Array.isArray(workersData) ? workersData : [];
      const safeDepartmentsData = Array.isArray(departmentsData) ? departmentsData : [];
      const safeSettingsData = settingsData || {};

      setWorkers(safeWorkersData);
      setDepartments(safeDepartmentsData);
      setBatches(safeSettingsData.batches || []);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
      setWorkers([]);
      setDepartments([]);
      setBatches([]);
    } finally {
      setIsLoading(false);
      setIsLoadingDepartments(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getWorkerId = async () => {
    await getUniqueId()
      .then((response) => {
        setFormData(prev => ({ ...prev, rfid: response.rfid }));
      })
      .catch((e) => console.log(e.message));
  }

  useEffect(() => {
    getWorkerId();
  }, []);

  // Handle form input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Filter workers
  const filteredWorkers = Array.isArray(workers)
    ? workers.filter(
      worker => {
        // Check if there's a department filter in the URL
        const urlParams = new URLSearchParams(location.search);
        const departmentFilter = urlParams.get('department');

        // Apply department filter if present
        const matchesDepartment = departmentFilter
          ? worker.department === departmentFilter || worker.department?._id === departmentFilter
          : true;

        // Apply search term filter
        const matchesSearch = worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (worker.department && worker.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (worker.rfid && worker.rfid.toLowerCase().includes(searchTerm.toLowerCase()));

        return matchesDepartment && matchesSearch;
      }
    )
    : [];

  useEffect(() => {
    if (isAddModalOpen) {
      nameInputRef.current?.focus();
    }
  }, [isAddModalOpen]);

  // Open add worker modal
  const openAddModal = () => {
    setFormData(prev => ({
      ...prev,
      name: '',
      username: '',
      password: '',
      department: departments.length > 0 ? departments[0]._id : '', // Ensure first department is selected
      photo: '',
      batch: batches.length > 0 ? batches[0].batchName : '', // ADDED: Set the first batch as default
      faceEmbeddings: [] // Reset face embeddings
    }));
    getWorkerId();
    setIsAddModalOpen(true);
  };

  // Open edit worker modal
  const openEditModal = (worker) => {
    // Determine the correct department ID
    const departmentId = typeof worker.department === 'object'
      ? worker.department._id
      : (departments.find(dept => dept.name === worker.department)?._id || worker.department);

    setSelectedWorker(worker);
    setFormData({
      name: worker.name,
      username: worker.username,
      department: departmentId, // Use the department ID
      photo: worker.photo || '',
      salary: worker.salary,
      password: '',
      confirmPassword: '',
      batch: worker.batch || '', // ADDED: Set the worker's current batch
      original_certificate_status: worker.original_certificate_status || 'not_submitted', // ADDED
      faceEmbeddings: worker.faceEmbeddings || [] // Set existing face embeddings
    });
    setIsEditModalOpen(true);
  };

  // Open delete worker modal
  const openDeleteModal = (worker) => {
    setSelectedWorker(worker);
    setIsDeleteModalOpen(true);
  };

  // Open face capture modal
  const openFaceCaptureModal = (worker) => {
    setSelectedWorkerForFace(worker);
    setWorkerFaceEmbeddings(worker.faceEmbeddings || []);
    setShowFaceCapture(true);
  };

  // Handle face embeddings captured
  const handleFacesCaptured = async (faces) => {
    const embeddings = faces.map(face => face.embedding);
    setWorkerFaceEmbeddings(embeddings);

    // If we're editing an existing worker, update their face embeddings immediately
    if (selectedWorkerForFace) {
      try {
        const updateData = {
          faceEmbeddings: embeddings
        };

        const updatedWorker = await updateWorker(selectedWorkerForFace._id, updateData);

        // Update the workers list
        setWorkers(prev =>
          prev.map(worker =>
            worker._id === selectedWorkerForFace._id ? updatedWorker : worker
          )
        );

        toast.success('Face data captured and saved successfully');
      } catch (error) {
        console.error('Error saving face data:', error);
        toast.error('Failed to save face data');
      }
    }

    setShowFaceCapture(false);
  };

  const generateQRCode = async (username, uniqueId) => {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(uniqueId, { width: 300 });
      const link = document.createElement('a');
      link.href = qrCodeDataURL;
      link.download = `${username}_${uniqueId}.png`;
      link.click();
    } catch (error) {
      console.error('QR Code generation error:', error);
    }
  };

  // Handle add worker
  const handleAddWorker = async (e) => {
    e.preventDefault();

    // FIXED THIS LINE: Convert salary to string before trimming
    const trimmedName = formData.name.trim();
    const trimmedUsername = formData.username.trim();
    const trimmedPassword = formData.password.trim();
    const trimmedSalary = String(formData.salary).trim();

    // Validation checks
    if (!subdomain || subdomain == 'main') {
      toast.error('Subdomain is missing, check the url');
      return;
    }

    if (!trimmedName) {
      toast.error('Name is required and cannot be empty');
      return;
    }

    if (!trimmedUsername) {
      toast.error('Username is required and cannot be empty');
      return;
    }

    if (!trimmedSalary || trimmedSalary === '') {
      toast.error('Salary is required and cannot be empty');
      return;
    }

    if (isNaN(Number(trimmedSalary)) || Number(trimmedSalary) <= 0) {
      toast.error('Salary must be a positive number');
      return;
    }

    if (!trimmedPassword) {
      toast.error('Password is required and cannot be empty');
      return;
    }

    if (!formData.department) {
      toast.error('Department is required');
      return;
    }

    if (!formData.rfid) {
      toast.error('Unique ID is required');
      return;
    }

    // ADDED: Check if batch is selected
    if (!formData.batch) {
      toast.error('Batch is required');
      return;
    }

    try {
      const newWorker = await createWorker({
        ...formData,
        name: trimmedName,
        username: trimmedUsername,
        rfid: formData.rfid,
        salary: Number(trimmedSalary), // Ensure salary is a number
        subdomain,
        password: trimmedPassword,
        photo: formData.photo || '',
        batch: formData.batch, // ADDED: Include the batch
        faceEmbeddings: workerFaceEmbeddings // Include face embeddings
      });

      generateQRCode(trimmedUsername, formData.rfid);
      setWorkers(prev => [...prev, newWorker]);
      setIsAddModalOpen(false);
      toast.success('Employee added successfully');
    } catch (error) {
      console.error('Add Employee Error:', error);
      toast.error(error.message || 'Failed to add employee');
    }
  };

  // Handle edit worker
  const handleEditWorker = async (e) => {
    e.preventDefault();

    // Validate inputs
    if (!formData.name || !formData.username || !formData.department) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Password validation if provided
    if (formData.password) {
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (formData.password.length < 6) {
        toast.error('Password must be at least 6 characters long');
        return;
      }
    }

    try {
      const updateData = {
        name: formData.name,
        username: formData.username,
        department: formData.department, // Always include department
        original_certificate_status: formData.original_certificate_status, // ADDED
        faceEmbeddings: workerFaceEmbeddings // Include face embeddings
      };

      // ADDED: Only include batch if it has a value
      if (formData.batch) {
        updateData.batch = formData.batch;
      }

      // Only add password if provided
      if (formData.password) {
        updateData.password = formData.password;
      }

      if (formData.salary) {
        updateData.salary = formData.salary;
      }

      // Only include photo if a new file is selected
      if (formData.photo instanceof File) {
        updateData.photo = formData.photo;
      }

      const updatedWorker = await updateWorker(selectedWorker._id, updateData);

      setWorkers(prev =>
        prev.map(worker =>
          worker._id === selectedWorker._id ? {
            ...updatedWorker,
            department: departments.find(dept => dept._id === updatedWorker.department)?.name || updatedWorker.department
          } : worker
        )
      );

      setIsEditModalOpen(false);
      toast.success('Employee updated successfully');
      loadData();
    } catch (error) {
      console.error('Update Error:', error);
      toast.error(error.message || 'Failed to update employee');
    }
  };
  // Handle delete worker
  const handleDeleteWorker = async () => {
    try {
      await deleteWorker(selectedWorker._id);
      setWorkers(prev => prev.filter(worker => worker._id !== selectedWorker._id));
      setIsDeleteModalOpen(false);
      toast.success('Employee deleted successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to delete employee');
    }
  };

  // Table columns configuration
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
          <span>{record.name}</span>
        </div>
      ),
    },
    {
      header: 'Username',
      accessor: 'username',
    },
    {
      header: 'Department',
      accessor: 'department',
      render: (record) => (
        <span>
          {typeof record.department === 'object'
            ? record.department.name
            : (departments.find(dept => dept._id === record.department)?.name || record.department || 'N/A')}
        </span>
      ),
    },
    {
      header: 'Batch',
      accessor: 'batch',
    },
    {
      header: 'RFID',
      accessor: 'rfid',
    },
    {
      header: 'Face Enroll',
      accessor: 'faceEnroll',
      render: (record) => {
        const isCaptured = record.faceEmbeddings && record.faceEmbeddings.length > 0;

        if (isCaptured) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
              Captured
            </span>
          );
        }

        return (
          <button
            onClick={() => openFaceCaptureModal(record)}
            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            <FaCamera className="mr-1" />
            Not Captured
          </button>
        );
      }
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (record) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${record.status === 'Relieved'
          ? 'bg-red-100 text-red-800'
          : 'bg-green-100 text-green-800'
          }`}>
          {record.status || 'Active'}
        </span>
      ),
    },
    {
      header: 'Original Cert. Status',
      accessor: 'original_certificate_status',
      render: (record) => {
        let statusText = 'Not Submitted';
        let statusColor = 'bg-gray-100 text-gray-800';

        switch (record.original_certificate_status) {
          case 'submitted':
            statusText = 'Submitted';
            statusColor = 'bg-blue-100 text-blue-800';
            break;
          case 'returned':
            statusText = 'Returned';
            statusColor = 'bg-green-100 text-green-800';
            break;
          case 'not_submitted':
          default:
            statusText = 'Not Submitted';
            statusColor = 'bg-yellow-100 text-yellow-800';
            break;
        }

        return (
          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
            {statusText}
          </span>
        );
      }
    },
    {
      header: 'Actions',
      accessor: 'actions',
      render: (record) => {
        const isRelieved = record.status === 'Relieved';
        return (
          <div className="flex space-x-2">
            <button
              onClick={() => !isRelieved && openEditModal(record)}
              className={`text-blue-500 hover:text-blue-700 ${isRelieved ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isRelieved}
              title={isRelieved ? "Relieved Employee" : "Edit"}
            >
              <FaEdit />
            </button>
            <button
              onClick={() => openDeleteModal(record)}
              className="text-red-500 hover:text-red-700"
              title="Delete"
            >
              <FaTrash />
            </button>
            <button
              onClick={() => !isRelieved && openFaceCaptureModal(record)}
              className={`text-green-500 hover:text-green-700 ${isRelieved ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isRelieved}
              title={isRelieved ? "Relieved Employee" : "Capture Face"}
            >
              <FaCamera />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Employee Management</h1>
        <Button variant="primary" onClick={openAddModal}>
          <FaPlus className="mr-2 inline" /> Add Employee
        </Button>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 space-y-4 md:space-y-0">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search employees..."
              className="form-input w-full md:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            data={filteredWorkers}
            isLoading={isLoading}
          />
        )}
      </Card>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Employee"
      >
        <form onSubmit={handleAddWorker}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                ref={nameInputRef}
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter employee name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                name="username"
                className="form-input"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter username"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  className="form-input pr-10"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Department *</label>
              <select
                name="department"
                className="form-input"
                value={formData.department}
                onChange={handleChange}
                required
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Batch *</label>
              <select
                name="batch"
                className="form-input"
                value={formData.batch}
                onChange={handleChange}
                required
              >
                <option value="">Select Batch</option>
                {batches.map((batch) => (
                  <option key={batch._id} value={batch.batchName}>
                    {batch.batchName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Salary *</label>
              <input
                type="number"
                name="salary"
                className="form-input"
                value={formData.salary}
                onChange={handleChange}
                placeholder="Enter salary"
                required
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Unique ID</label>
              <div className="flex">
                <input
                  type="text"
                  name="rfid"
                  className="form-input rounded-r-none"
                  value={formData.rfid}
                  onChange={handleChange}
                  placeholder="Auto-generated"
                  readOnly
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={getWorkerId}
                  className="rounded-l-none"
                >
                  Generate
                </Button>
              </div>
            </div>

            <div className="form-group md:col-span-2">
              <label className="form-label">Photo</label>
              <input
                type="file"
                accept="image/*"
                className="form-input"
                onChange={handlePhotoChange}
              />
            </div>
          </div>

          <div className="flex justify-end mt-6 space-x-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Employee"
      >
        <form onSubmit={handleEditWorker}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter employee name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                name="username"
                className="form-input"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter username"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showEditPassword ? "text" : "password"}
                  name="password"
                  className="form-input pr-10"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter new password (optional)"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                >
                  {showEditPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <div className="relative">
                <input
                  type={showEditConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  className="form-input pr-10"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                >
                  {showEditConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Department *</label>
              <select
                name="department"
                className="form-input"
                value={formData.department}
                onChange={handleChange}
                required
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Batch *</label>
              <select
                name="batch"
                className="form-input"
                value={formData.batch}
                onChange={handleChange}
              >
                <option value="">Select Batch</option>
                {batches.map((batch) => (
                  <option key={batch._id} value={batch.batchName}>
                    {batch.batchName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Salary</label>
              <input
                type="number"
                name="salary"
                className="form-input"
                value={formData.salary}
                onChange={handleChange}
                placeholder="Enter salary"
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Original Certificate Status</label>
              <select
                name="original_certificate_status"
                className="form-input"
                value={formData.original_certificate_status}
                onChange={handleChange}
              >
                <option value="not_submitted">Not Submitted</option>
                <option value="submitted">Submitted </option>
                <option value="returned">Returned to Employee</option>
              </select>
            </div>

            <div className="form-group md:col-span-2">
              <label className="form-label">Photo</label>
              <input
                type="file"
                accept="image/*"
                className="form-input"
                onChange={handlePhotoChange}
              />
            </div>
          </div>

          <div className="flex justify-end mt-6 space-x-2">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Face Capture Modal */}
      <Modal
        isOpen={showFaceCapture}
        onClose={() => setShowFaceCapture(false)}
        title={selectedWorkerForFace ? `Capture Face for ${selectedWorkerForFace.name}` : "Capture Face"}
        size="lg"
      >
        <FaceCapture onFacesCaptured={handleFacesCaptured} />
      </Modal>

      {/* Delete Worker Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Employee"
      >
        <p className="mb-4">
          Are you sure you want to delete <strong>{selectedWorker?.name}</strong>?
          This action cannot be undone.
        </p>

        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteWorker}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default WorkerManagement;