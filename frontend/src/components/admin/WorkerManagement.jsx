import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  FaPlus, FaEdit, FaTrash, FaCamera, FaHistory, FaSearch, 
  FaFilter, FaSortAmountDown, FaEllipsisV, FaUserCheck, 
  FaUserMinus, FaUserTimes, FaBuilding, FaLayerGroup 
} from 'react-icons/fa';
import { 
  MoreVertical, Search, Filter, UserCheck, UserMinus, 
  UserX, Download, RefreshCw, Calendar, ArrowUpDown,
  Users, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import WorkerHistoryModal from './WorkerHistoryModal';
import { getFullFileUrl } from '../../utils/fileUtils';
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
import FaceCapture from './FaceCapture';
import RelieveEmployeeModal from './modals/RelieveEmployeeModal';

const WorkerManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const nameInputRef = useRef(null);
  const [workers, setWorkers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Advanced Filter States
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [batchFilter, setBatchFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [selectedWorkerForFace, setSelectedWorkerForFace] = useState(null);
  const [workerFaceEmbeddings, setWorkerFaceEmbeddings] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // active, archived

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    setFormData(prev => ({ ...prev, photo: file }));
  };

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRelieveModalOpen, setIsRelieveModalOpen] = useState(false);
  const [relieveConfirmName, setRelieveConfirmName] = useState('');
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
    faceEmbeddings: [], // Add face embeddings to form data
    email: '',
    phoneNumber: '',
    joiningDate: new Date().toISOString().split('T')[0],
    designation: 'Employee',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    branchName: '',
    upiId: ''
  });

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Subdomain
  const { subdomain } = useContext(appContext);

  // Load workers and departments
  const loadData = async () => {
    setIsLoading(true);
    setIsLoadingDepartments(true);

    try {
      const [workersData, departmentsData, settingsData] = await Promise.all([
        getWorkers({ subdomain, status: 'all' }),
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
    
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024); // Card view for screens smaller than 1024px
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    
    return () => window.removeEventListener('resize', handleResize);
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

  // Advanced Filtering and Sorting Logic
  const processedWorkers = useMemo(() => {
    if (!Array.isArray(workers)) return { active: [], archived: [] };

    let filtered = workers.filter(worker => {
      // Search Box Filter (Name, Username, RFID)
      const searchMatch = 
        worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (worker.rfid && worker.rfid.toLowerCase().includes(searchTerm.toLowerCase()));

      // Department Filter - Robust matching for both ID and Name
      const deptId = typeof worker.department === 'object' ? worker.department?._id : worker.department;
      const selectedDept = departments.find(d => d._id === departmentFilter);
      
      const deptMatch = departmentFilter === 'All' || 
                        deptId === departmentFilter || 
                        worker.department === departmentFilter || 
                        worker.department === selectedDept?.name || 
                        worker.department?.name === selectedDept?.name;

      // Batch Filter
      const batchMatch = batchFilter === 'All' || worker.batch === batchFilter;

      return searchMatch && deptMatch && batchMatch;
    });

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-az':
          return a.name.localeCompare(b.name);
        case 'name-za':
          return b.name.localeCompare(a.name);
        case 'newest':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'oldest':
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        default:
          return 0;
      }
    });

    // Split into Active vs Archived (for visual separation)
    const active = filtered.filter(w => w.status === 'Active' || !w.status);
    const archived = filtered.filter(w => w.status === 'Relieved');

    return { active, archived };
  }, [workers, searchTerm, departmentFilter, batchFilter, sortBy]);

  // Combined list for display
  const displayWorkers = [...processedWorkers.active, ...processedWorkers.archived];

  useEffect(() => {
    if (isAddModalOpen) {
      nameInputRef.current?.focus();
    }
  }, [isAddModalOpen]);

  // Handle form input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

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
      faceEmbeddings: [], // Reset face embeddings
      email: '',
      phoneNumber: '',
      joiningDate: new Date().toISOString().split('T')[0],
      designation: 'Employee',
      accountHolderName: '',
      bankName: '',
      accountNumber: '',
      confirmAccountNumber: '',
      ifscCode: '',
      branchName: '',
      upiId: ''
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
      faceEmbeddings: worker.faceEmbeddings || [], // Set existing face embeddings
      email: worker.email || '',
      phoneNumber: worker.phoneNumber || '',
      joiningDate: worker.joiningDate ? new Date(worker.joiningDate).toISOString().split('T')[0] : '',
      designation: worker.designation || '',
      accountHolderName: worker.bankDetails?.accountHolderName || '',
      bankName: worker.bankDetails?.bankName || '',
      accountNumber: worker.bankDetails?.accountNumber || '',
      confirmAccountNumber: worker.bankDetails?.accountNumber || '',
      ifscCode: worker.bankDetails?.ifscCode || '',
      branchName: worker.bankDetails?.branchName || '',
      upiId: worker.bankDetails?.upiId || ''
    });
    setIsEditModalOpen(true);
  };

  // Open delete worker modal
  const openDeleteModal = (worker) => {
    setSelectedWorker(worker);
    setIsDeleteModalOpen(true);
  };

  // Open relieve worker modal
  const openRelieveModal = (worker) => {
    setSelectedWorker(worker);
    setRelieveConfirmName('');
    setIsRelieveModalOpen(true);
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

    if (!formData.accountNumber) {
      toast.error('Account number is required');
      return;
    }

    if (!formData.ifscCode) {
      toast.error('IFSC code is required');
      return;
    }

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      toast.error('Account numbers do not match');
      return;
    }

    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(formData.ifscCode)) {
      toast.error('Invalid IFSC code format');
      return;
    }

    const duplicateAccount = workers.find(w => w.bankDetails?.accountNumber === formData.accountNumber);
    if (duplicateAccount) {
      toast.error('Account number already exists');
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
        faceEmbeddings: workerFaceEmbeddings, // Include face embeddings
        bankDetails: {
          accountHolderName: formData.accountHolderName,
          bankName: formData.bankName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          branchName: formData.branchName,
          upiId: formData.upiId
        }
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

    if (!formData.accountNumber) {
      toast.error('Account number is required');
      return;
    }

    if (!formData.ifscCode) {
      toast.error('IFSC code is required');
      return;
    }

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      toast.error('Account numbers do not match');
      return;
    }

    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(formData.ifscCode)) {
      toast.error('Invalid IFSC code format');
      return;
    }

    const duplicateAccount = workers.find(w => w._id !== selectedWorker._id && w.bankDetails?.accountNumber === formData.accountNumber);
    if (duplicateAccount) {
      toast.error('Account number already exists');
      return;
    }

    try {
      const updateData = {
        name: formData.name,
        username: formData.username,
        department: formData.department, // Always include department
        original_certificate_status: formData.original_certificate_status, // ADDED
        faceEmbeddings: workerFaceEmbeddings, // Include face embeddings
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        joiningDate: formData.joiningDate,
        designation: formData.designation,
        bankDetails: {
          accountHolderName: formData.accountHolderName,
          bankName: formData.bankName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          branchName: formData.branchName,
          upiId: formData.upiId
        }
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
  // Helper for status colors
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">Active</span>;
      case 'Relieved': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">Relieved</span>;
      case 'Deleted':
      case 'Archived': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">Archived</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">Active</span>;
    }
  };

  const getFaceEnrollBadge = (faceEnrolled) => {
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ faceEnrolled ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200" }`}>
        {faceEnrolled ? 'Captured' : 'Not Captured'}
      </span>
    );
  };

  const handleStatusChange = async (workerId, newStatus) => {
    try {
      await updateWorker(workerId, { status: newStatus });
      toast.success(`Employee marked as ${newStatus}`);
      loadData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteWorker = async () => {
    try {
      await deleteWorker(selectedWorker._id);
      setWorkers(prev => prev.filter(worker => worker._id !== selectedWorker._id));
      setIsDeleteModalOpen(false);
      toast.success('Employee deleted successfully');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to delete employee');
    }
  };

  // Table columns configuration
  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      width: '240px',
      nowrap: false,
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => {
        const getPhotoSrc = (photo, name) => {
          const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d9488&color=fff`;
          if (!photo) return avatarFallback;
          return getFullFileUrl(photo);
        };
        const isMuted = record.status === 'Relieved' || record.status === 'Deleted';
        return (
          <div className={`flex items-center space-x-2 ${isMuted ? 'opacity-60' : ''}`}>
            <div className="relative flex-shrink-0">
              <img
                src={getPhotoSrc(record.photo, record.name)}
                alt={record.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}&background=0d9488&color=fff`; }}
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${record.status === 'Active' || !record.status ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            </div>
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-sm font-bold text-gray-900 leading-tight whitespace-normal">{record.name}</span>
              <span className="text-[10px] text-gray-500 font-medium">ID: {record.rfid || 'N/A'}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Username',
      accessor: 'username',
      width: '120px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => <span className="text-gray-600 font-medium text-xs truncate block">{record.username}</span>
    },
    {
      header: 'Department',
      accessor: 'department',
      width: '140px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => {
        const deptName = typeof record.department === 'object' ? record.department.name : (departments.find(dept => dept._id === record.department)?.name || record.department || 'N/A');
        return (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 bg-gray-50 rounded-md border border-gray-100 max-w-[130px]">
            <FaBuilding className="text-gray-400 text-[10px] flex-shrink-0" />
            <span className="text-[10px] font-bold text-gray-700 truncate">{deptName}</span>
          </div>
        );
      }
    },
    {
      header: 'RFID',
      accessor: 'rfid',
      width: '100px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-mono">{record.rfid}</code>
    },
    {
      header: 'Face Enroll',
      accessor: 'faceEnrolled',
      width: '120px',
      headerAlign: 'text-center',
      align: 'text-center',
      render: (record) => getFaceEnrollBadge(record.faceEnrolled || (Array.isArray(record.faceEmbeddings) && record.faceEmbeddings.length > 0))
    },
    {
      header: 'Status',
      accessor: 'status',
      width: '100px',
      headerAlign: 'text-center',
      align: 'text-center',
      render: (record) => getStatusBadge(record.status)
    },
    {
      header: 'Actions',
      accessor: 'actions',
      width: '150px',
      sticky: 'right',
      headerAlign: 'text-right',
      align: 'text-right',
      render: (record) => {
        const isRelieved = record.status === 'Relieved';
        const isActive = record.status === 'Active' || !record.status;
        
        return (
          <div className="flex items-center justify-end space-x-1">
            {isActive ? (
              <>
                <button
                  onClick={() => openEditModal(record)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit Employee"
                >
                  <FaEdit size={14} />
                </button>
                <button
                  onClick={() => openFaceCaptureModal(record)}
                  className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  title="Capture / Update Face"
                >
                  <FaCamera size={14} />
                </button>
                <button
                  onClick={() => openRelieveModal(record)}
                  className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                  title="Relieve Employee"
                >
                  <UserMinus size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => handleStatusChange(record._id, 'Active')}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center space-x-1"
                title="Restore to Active"
              >
                <RefreshCw size={14} />
                <span className="text-[10px] font-bold">Restore</span>
              </button>
            )}
            <button
              onClick={() => openDeleteModal(record)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete Employee"
            >
              <FaTrash size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  // Mobile Card Component
  const WorkerCard = ({ worker }) => {
    const isMuted = worker.status === 'Relieved' || worker.status === 'Deleted';
    const deptName = typeof worker.department === 'object' ? worker.department.name : (departments.find(dept => dept._id === worker.department)?.name || worker.department || 'N/A');

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white p-3.5 rounded-[12px] border ${isMuted ? 'border-slate-200 bg-slate-50/50' : 'border-slate-200/60 shadow-sm'} mb-3`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <img
                src={getFullFileUrl(worker.photo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}&background=0d9488&color=fff`}
                alt={worker.name}
                className={`w-10 h-10 rounded-full object-cover border border-slate-100 ${isMuted ? 'grayscale opacity-60' : ''}`}
                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}&background=0d9488&color=fff`; }}
              />
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${worker.status === 'Active' || !worker.status ? 'bg-green-500' : 'bg-slate-400'}`}></div>
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isMuted ? 'text-slate-500' : 'text-slate-900'} leading-none`}>{worker.name}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">@{worker.username}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(worker.status)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
            <p className="text-[9px] text-slate-400 font-bold tracking-widest mb-0.5">Department</p>
            <p className="text-xs font-semibold text-slate-700 truncate">{deptName}</p>
          </div>
          <div className="bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100">
            <p className="text-[9px] text-slate-400 font-bold tracking-widest mb-0.5">ID / RFID</p>
            <p className="text-xs font-mono font-semibold text-slate-700">{worker.rfid}</p>
          </div>
          <div className="col-span-2 bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-100 flex justify-between items-center">
            <p className="text-[9px] text-slate-400 font-bold tracking-widest">Face Enroll</p>
            {getFaceEnrollBadge(worker.faceEnrolled || (Array.isArray(worker.faceEmbeddings) && worker.faceEmbeddings.length > 0))}
          </div>
        </div>

        <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
          <div className="flex space-x-1">
            <button 
              onClick={() => openEditModal(worker)}
              className="px-2 py-1.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
              disabled={isMuted}
              title="Edit Employee"
            >
              <FaEdit />
            </button>
            <button 
              onClick={() => openFaceCaptureModal(worker)}
              className="px-2 py-1.5 text-xs font-bold bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
              disabled={isMuted}
              title="Capture / Update Face"
            >
              <FaCamera />
            </button>
          </div>
          <div className="flex space-x-2">
            {worker.status === 'Active' || !worker.status ? (
              <button 
                onClick={() => openRelieveModal(worker)}
                className="p-1 px-3 text-xs font-bold text-orange-600 hover:bg-orange-50 rounded-lg"
                title="Relieve Employee"
              >
                Relieve
              </button>
            ) : worker.status === 'Relieved' ? (
              <>
                <button 
                  disabled
                  className="p-1 px-3 text-xs font-bold text-gray-400 opacity-50 cursor-not-allowed"
                >
                  Relieved
                </button>
                <button 
                  onClick={() => handleStatusChange(worker._id, 'Active')}
                  className="p-1 px-3 text-xs font-bold text-green-600 hover:bg-green-50 rounded-lg"
                >
                  Restore
                </button>
              </>
            ) : (
              <button 
                onClick={() => handleStatusChange(worker._id, 'Active')}
                className="p-1 px-3 text-xs font-bold text-green-600 hover:bg-green-50 rounded-lg"
              >
                Restore
              </button>
            )}
            <button 
               onClick={() => openDeleteModal(worker)}
               className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
               title="Delete Employee"
            >
              <FaTrash size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };



  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:justify-end mb-6 gap-4">
        <div className="md:hidden mb-1">
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">Employee Management</h1>
          <p className="text-sm text-slate-500 mt-1 leading-snug">Manage, filter and track your workforce efficiently.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
          <button 
            type="button"
            onClick={() => setIsHistoryModalOpen(true)} 
            className="flex shrink-0 items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm w-[38px] h-[38px] md:w-auto md:px-3 rounded-[10px] transition-all focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] !p-0 md:!py-2 text-sm font-semibold"
            title="History"
          >
            <FaHistory className="text-slate-500" size={15} />
            <span className="hidden md:inline ml-1.5">History</span>
          </button>
          <Button 
            variant="primary" 
            onClick={openAddModal} 
            className="flex-1 md:flex-none flex items-center justify-center bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-sm text-sm px-4 h-[38px] rounded-[10px] whitespace-nowrap transition-all !py-0"
          >
            <FaPlus size={14} className="mr-1.5" /> Add Employee
          </Button>
        </div>
      </div>
      
      {/* Tabs Switcher */}
      <div className="grid grid-cols-2 md:flex md:items-center gap-1 p-1 bg-slate-100/80 backdrop-blur-sm rounded-[12px] mb-6 w-full md:w-fit shadow-sm border border-slate-200/60">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-[10px] text-xs md:text-sm font-semibold transition-all ${activeTab === 'active' ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'}`}
        >
          <div className="flex items-center gap-1.5">
            <UserCheck size={15} className={`flex-shrink-0 ${activeTab === 'active' ? 'text-teal-600' : 'text-slate-400'}`} />
            <span className="truncate tracking-wide">Active</span>
          </div>
          <span className={`px-1.5 md:px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'active' ? 'bg-teal-50 text-teal-700' : 'bg-slate-200/70 text-slate-500'}`}>
            {processedWorkers.active.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-[10px] text-xs md:text-sm font-semibold transition-all ${activeTab === 'archived' ? 'bg-white text-orange-700 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'}`}
        >
          <div className="flex items-center gap-1.5">
            <UserX size={15} className={`flex-shrink-0 ${activeTab === 'archived' ? 'text-orange-500' : 'text-slate-400'}`} />
            <span className="truncate tracking-wide">Relieved</span>
          </div>
          <span className={`px-1.5 md:px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'archived' ? 'bg-orange-50 text-orange-700' : 'bg-slate-200/70 text-slate-500'}`}>
            {processedWorkers.archived.length}
          </span>
        </button>
      </div>

      {/* Advanced Control Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-3 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative lg:col-span-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search name, rfid..."
              className="block w-full pl-9 pr-8 py-2 bg-slate-50/50 border border-slate-200 rounded-[10px] text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] focus:bg-white transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaBuilding className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <select
              className="block w-full pl-9 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-[10px] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] focus:bg-white transition-all appearance-none shadow-sm cursor-pointer"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="All">All Departments</option>
              {departments.map(dept => (
                <option key={dept._id} value={dept._id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaLayerGroup className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <select
              className="block w-full pl-9 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-[10px] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] focus:bg-white transition-all appearance-none shadow-sm cursor-pointer"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
            >
              <option value="All">All Batches</option>
              {batches.map(batch => (
                <option key={batch._id} value={batch.batchName}>{batch.batchName}</option>
              ))}
            </select>
          </div>

          {/* Sorting */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <select
              className="block w-full pl-9 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-[10px] text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] focus:bg-white transition-all appearance-none shadow-sm cursor-pointer"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Recently Added</option>
              <option value="name-az">Name (A-Z)</option>
              <option value="name-za">Name (Z-A)</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Reset Filters Link */}
        {(searchTerm || departmentFilter !== 'All' || batchFilter !== 'All') && (
          <div className="mt-2.5 flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setDepartmentFilter('All');
                setBatchFilter('All');
                setSortBy('newest');
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center bg-slate-100/50 px-2.5 py-1 rounded-md border border-slate-200/50 transition-all"
            >
              <RefreshCw className="h-3 w-3 mr-1.5" /> Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-100 shadow-sm"
            >
              <Spinner size="xl" />
              <p className="mt-4 text-gray-500 animate-pulse font-medium">Fetching employee records...</p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Conditional Tab Rendering */}
              {activeTab === 'active' ? (
                <div>
                  <div className="flex items-center space-x-2 mb-4 px-2">
                    <UserCheck className="h-5 w-5 text-green-500" />
                    <h2 className="text-lg font-bold text-gray-900">Active Employees</h2>
                    <span className="bg-green-100 text-green-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {processedWorkers.active.length}
                    </span>
                  </div>
                  
                  {isMobile ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {processedWorkers.active.map(worker => (
                        <WorkerCard key={worker._id} worker={worker} />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <Table
                        columns={columns}
                        data={processedWorkers.active}
                        striped={false}
                        hover={true}
                        compact={true}
                      />
                    </div>
                  )}
                  
                  {processedWorkers.active.length === 0 && (
                    <div className="py-20 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Users className="h-8 w-8 text-gray-300" />
                      </div>
                      <h3 className="text-gray-900 font-bold text-lg">No active employees found</h3>
                      <p className="text-gray-500 font-medium max-w-xs mx-auto mt-1">Try adjusting your filters or search terms to find what you're looking for.</p>
                      {(searchTerm || departmentFilter !== 'All' || batchFilter !== 'All') && (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setDepartmentFilter('All');
                            setBatchFilter('All');
                          }}
                          className="mt-6 text-sm font-bold text-[#0d9488] hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center space-x-2 mb-4 px-2">
                    <UserX className="h-5 w-5 text-gray-400" />
                    <h2 className="text-lg font-bold text-gray-500">Relieved & Archived</h2>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {processedWorkers.archived.length}
                    </span>
                  </div>
                  
                  {isMobile ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {processedWorkers.archived.map(worker => (
                        <WorkerCard key={worker._id} worker={worker} />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50/50 rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <Table
                        columns={columns}
                        data={processedWorkers.archived}
                        striped={false}
                        hover={true}
                        compact={true}
                      />
                    </div>
                  )}

                  {processedWorkers.archived.length === 0 && (
                    <div className="py-20 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <UserX className="h-8 w-8 text-gray-300" />
                      </div>
                      <h3 className="text-gray-900 font-bold text-lg">No archived employees found</h3>
                      <p className="text-gray-500 font-medium max-w-xs mx-auto mt-1">Try adjusting your filters or search terms to find what you're looking for.</p>
                      {(searchTerm || departmentFilter !== 'All' || batchFilter !== 'All') && (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setDepartmentFilter('All');
                            setBatchFilter('All');
                          }}
                          className="mt-6 text-sm font-bold text-[#0d9488] hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}


            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

            <div className="form-group">
              <label className="form-label">Joining Date *</label>
              <input
                type="date"
                name="joiningDate"
                className="form-input"
                value={formData.joiningDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter email address"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                name="phoneNumber"
                className="form-input"
                value={formData.phoneNumber}
                onChange={handleChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Designation</label>
              <input
                type="text"
                name="designation"
                className="form-input"
                value={formData.designation}
                onChange={handleChange}
                placeholder="Enter designation"
              />
            </div>

            <div className="md:col-span-2 mt-4 mb-2">
              <h3 className="text-sm font-bold text-gray-700 tracking-wider">Bank Details</h3>
              <div className="border-t border-gray-200 mt-1"></div>
            </div>

            <div className="form-group">
              <label className="form-label">Account Holder Name *</label>
              <input
                type="text"
                name="accountHolderName"
                className="form-input"
                value={formData.accountHolderName}
                onChange={handleChange}
                placeholder="Enter account holder name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Bank Name *</label>
              <input
                type="text"
                name="bankName"
                className="form-input"
                value={formData.bankName}
                onChange={handleChange}
                placeholder="Enter bank name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Account Number *</label>
              <input
                type="text"
                name="accountNumber"
                className="form-input"
                value={formData.accountNumber}
                onChange={handleChange}
                placeholder="Enter account number"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Account Number *</label>
              <input
                type="text"
                name="confirmAccountNumber"
                className="form-input"
                value={formData.confirmAccountNumber}
                onChange={handleChange}
                placeholder="Confirm account number"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">IFSC Code *</label>
              <input
                type="text"
                name="ifscCode"
                className="form-input"
                value={formData.ifscCode}
                onChange={handleChange}
                placeholder="Enter IFSC code"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Branch Name *</label>
              <input
                type="text"
                name="branchName"
                className="form-input"
                value={formData.branchName}
                onChange={handleChange}
                placeholder="Enter branch name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">UPI ID (Optional)</label>
              <input
                type="text"
                name="upiId"
                className="form-input"
                value={formData.upiId}
                onChange={handleChange}
                placeholder="Enter UPI ID"
              />
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

            <div className="form-group">
              <label className="form-label">Joining Date *</label>
              <input
                type="date"
                name="joiningDate"
                className="form-input"
                value={formData.joiningDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter email address"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                name="phoneNumber"
                className="form-input"
                value={formData.phoneNumber}
                onChange={handleChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Designation</label>
              <input
                type="text"
                name="designation"
                className="form-input"
                value={formData.designation}
                onChange={handleChange}
                placeholder="Enter designation"
              />
            </div>

            <div className="md:col-span-2 mt-4 mb-2">
              <h3 className="text-sm font-bold text-gray-700 tracking-wider">Bank Details</h3>
              <div className="border-t border-gray-200 mt-1"></div>
            </div>

            <div className="form-group">
              <label className="form-label">Account Holder Name *</label>
              <input
                type="text"
                name="accountHolderName"
                className="form-input"
                value={formData.accountHolderName}
                onChange={handleChange}
                placeholder="Enter account holder name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Bank Name *</label>
              <input
                type="text"
                name="bankName"
                className="form-input"
                value={formData.bankName}
                onChange={handleChange}
                placeholder="Enter bank name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Account Number *</label>
              <input
                type="text"
                name="accountNumber"
                className="form-input"
                value={formData.accountNumber}
                onChange={handleChange}
                placeholder="Enter account number"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Account Number *</label>
              <input
                type="text"
                name="confirmAccountNumber"
                className="form-input"
                value={formData.confirmAccountNumber}
                onChange={handleChange}
                placeholder="Confirm account number"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">IFSC Code *</label>
              <input
                type="text"
                name="ifscCode"
                className="form-input"
                value={formData.ifscCode}
                onChange={handleChange}
                placeholder="Enter IFSC code"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Branch Name *</label>
              <input
                type="text"
                name="branchName"
                className="form-input"
                value={formData.branchName}
                onChange={handleChange}
                placeholder="Enter branch name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">UPI ID (Optional)</label>
              <input
                type="text"
                name="upiId"
                className="form-input"
                value={formData.upiId}
                onChange={handleChange}
                placeholder="Enter UPI ID"
              />
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

      {/* New Automated Relieve Employee Modal */}
      <RelieveEmployeeModal
        isOpen={isRelieveModalOpen}
        onClose={() => setIsRelieveModalOpen(false)}
        worker={selectedWorker}
        onComplete={loadData}
      />


      <WorkerHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onRestore={loadData}
      />
    </div>
  );
};

export default WorkerManagement;