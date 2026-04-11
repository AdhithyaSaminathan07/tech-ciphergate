// attendance UI/client/src/pages/Worker/WorkerLogin.jsx

import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaSearch,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import { IoMdRefresh } from "react-icons/io";
import { useAuth } from '../../hooks/useAuth';
import { getPublicWorkers } from '../../services/workerService';
import Spinner from '../../components/common/Spinner';
import appContext from '../../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../../components/common/Modal'; // Add this line
import Button from '../../components/common/Button';

const WorkerLogin = () => {
  const [showWrongSubdomainModal, setShowWrongSubdomainModal] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [filteredWorkers, setFilteredWorkers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [department, setDepartment] = useState('All');
  const [manualSubdomain, setManualSubdomain] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const manualSubdomainInputRef = useRef(null);

  const navigate = useNavigate();
  const { login } = useAuth();
  const { subdomain, setSubdomain } = useContext(appContext);

  const workersPerPage = 12;
  const totalWorkers = filteredWorkers.length;
  const totalPages = Math.ceil(totalWorkers / workersPerPage);

  // Generate floating particles for background animation - moved to component level
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 10,
    delay: Math.random() * 5
  }));

  // Handle subdomain submission
  const handleSubdomainSubmit = (e) => {
    e.preventDefault();
    if (!manualSubdomain.trim()) {
      toast.error('Please enter a subdomain.');
      return;
    }
    // Set 'main' as a fallback if manualSubdomain is empty/whitespace
    localStorage.setItem('tasktracker-subdomain', manualSubdomain.trim() || 'main');
    setSubdomain(manualSubdomain.trim() || 'main');
  };

  const loadWorkers = useCallback(async () => {
    // Keep this check to prevent unnecessary API calls if subdomain is already 'main'
    if (!subdomain || subdomain === 'main') {
      setIsLoadingWorkers(false);
      return;
    }

    try {
      setIsLoadingWorkers(true);
      const workersData = await getPublicWorkers({ subdomain });

      // MODIFIED BLOCK: Ensure the modal is shown when no workers are found for the subdomain
      if (!Array.isArray(workersData) || workersData.length === 0) {
        setShowWrongSubdomainModal(true); // Directly show the modal
        setWorkers([]); // Clear any previous worker data
        setFilteredWorkers([]);
        setSelectedWorker(null);
        // Do NOT reset subdomain here. The 'Re-enter Company Name' button in the modal will handle this.
        return; // Exit the function to prevent further processing of empty data
      }

      setWorkers(workersData); // Only set workers if data is valid
    } catch (error) {
      console.error('Employee load error:', error);
      // If there's an API error, it could also mean a wrong subdomain or server issue.
      // Show the modal in this case too, or handle specifically if you prefer a different error message.
      setShowWrongSubdomainModal(true); // Consider showing the modal for fetch errors too
      setWorkers([]); // Clear data on error
      setFilteredWorkers([]);
      setSelectedWorker(null);
      // toast.error('Failed to load employees. Please try again later.'); // Optional: keep toast for network/server errors
    } finally {
      setIsLoadingWorkers(false);
    }
  }, [subdomain, setSubdomain]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers, subdomain]); // Keep subdomain as a dependency to react to its changes

  useEffect(() => {
    if ((!subdomain || subdomain === 'main') && manualSubdomainInputRef.current) {
      manualSubdomainInputRef.current.focus();
    }
  }, [subdomain]);

  // Filter workers
  useEffect(() => {
    const filtered = workers.filter(worker => {
      const matchesSearch = !searchTerm ||
        worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (worker.department && worker.department.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesDepartment = department === 'All' ||
        worker.department === department;

      return matchesSearch && matchesDepartment;
    });

    setFilteredWorkers(filtered);
    setCurrentPage(1);
  }, [workers, searchTerm, department]);

  const paginatedWorkers = filteredWorkers.slice(
    (currentPage - 1) * workersPerPage,
    currentPage * workersPerPage
  );

  const departments = ['All', ...new Set(workers.map(w => w.department).filter(Boolean))];

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!selectedWorker || !password) {
      toast.error('Please select a employee and enter password');
      return;
    }

    if (!subdomain || subdomain === 'main') {
      toast.error('Subdomain is missing, please enter your company name.');
      return;
    }

    setIsLoading(true);

    try {
      // Authenticate worker with credentials and subdomain
      await login({
        username: selectedWorker.username,
        password,
        subdomain
      }, 'worker');

      toast.success(`Welcome, ${selectedWorker.name}!`);
      navigate('/worker');
    } catch (error) {
      // Show error message but don't redirect
      toast.error(error.message || 'Login failed. Check your credentials.');
      // Clear password field for retry
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (currentPage > 1) {
      pageNumbers.push(
        <motion.button 
          key="prev" 
          onClick={() => setCurrentPage(currentPage - 1)} 
          className="p-2 bg-[#0d9488] text-white rounded-full hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <FaChevronLeft />
        </motion.button>
      );
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <motion.button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={`w-9 h-9 rounded-full flex items-center justify-center ${
            currentPage === i 
              ? 'bg-[#0d9488] text-white' 
              : 'bg-gray-200 text-black hover:bg-[#0d9488] hover:text-white'
          } transition-colors border-2 border-[#0d9488]`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {i}
        </motion.button>
      );
    }

    if (currentPage < totalPages) {
      pageNumbers.push(
        <motion.button 
          key="next" 
          onClick={() => setCurrentPage(currentPage + 1)} 
          className="p-2 bg-[#0d9488] text-white rounded-full hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <FaChevronRight />
        </motion.button>
      );
    }

    return (
      <div className="flex justify-center items-center space-x-2 mt-6">
        {pageNumbers}
      </div>
    );
  };

  // If no subdomain or subdomain is 'main', show the company name input
  if (!subdomain || subdomain === "main") {
    return (
      <div className="min-h-screen bg-white text-black p-4 relative overflow-hidden flex items-center justify-center">
        {/* Animated Particles */}
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full bg-gray-200/20"
            initial={{ 
              x: `${particle.x}%`, 
              y: `${particle.y}%`, 
              opacity: 0.1 + Math.random() * 0.3 
            }}
            animate={{ 
              x: [`${particle.x}%`, `${particle.x + (Math.random() * 10 - 5)}%`],
              y: [`${particle.y}%`, `${particle.y - 20}%`],
              opacity: [0.1 + Math.random() * 0.3, 0]
            }}
            transition={{ 
              repeat: Infinity,
              duration: particle.duration,
              delay: particle.delay,
              ease: "linear"
            }}
            style={{ 
              width: `${particle.size}px`, 
              height: `${particle.size}px` 
            }}
          />
        ))}
        
        {/* Gradient Orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gray-200/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gray-200/10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2 pointer-events-none"></div>
        
        <div className="container mx-auto relative z-10 flex items-center justify-center min-h-full w-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-[95%] max-w-md z-10 bg-white backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-200 mx-auto"
          >
            <div className="mb-6 text-center">
              <motion.h1 
                className="text-2xl sm:text-3xl font-bold text-[#0d9488]"
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                Enter Your Company Name
              </motion.h1>
              <motion.div 
                className="h-1 bg-[#0d9488] rounded-full w-0 mx-auto mt-2"
                initial={{ width: 0 }}
                animate={{ width: "60px" }}
                transition={{ duration: 0.5, delay: 0.4 }}
              />
            </div>

            <form onSubmit={handleSubdomainSubmit} className="space-y-4">
            <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <label className="text-black text-sm font-medium mb-2 block">Company Domain</label>
                <input
                  ref={manualSubdomainInputRef} 
                  placeholder="e.g. company123"
                  value={manualSubdomain}
                  onChange={(e) => setManualSubdomain(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
                  required
                />
              </motion.div>
              
              <motion.button
                type="submit"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ 
                  type: "spring", 
                  duration: 0.5, 
                  delay: 0.5,
                  stiffness: 120 
                }}
                className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors font-medium"
              >
                Continue
              </motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

  // Main Worker Login UI (This part remains unchanged from previous responses for clarity,
  // as the request specifically asked for modifications to the 'if (!subdomain || subdomain === "main")' block.)
  return (
    <div className="min-h-screen bg-white text-black p-4 relative overflow-hidden">
      {/* Animated Particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-gray-200/20"
          initial={{ 
            x: `${particle.x}%`, 
            y: `${particle.y}%`, 
            opacity: 0.1 + Math.random() * 0.3 
          }}
          animate={{ 
            x: [`${particle.x}%`, `${particle.x + (Math.random() * 10 - 5)}%`],
            y: [`${particle.y}%`, `${particle.y - 20}%`],
            opacity: [0.1 + Math.random() * 0.3, 0]
          }}
          transition={{ 
            repeat: Infinity,
            duration: particle.duration,
            delay: particle.delay,
            ease: "linear"
          }}
          style={{ 
            width: `${particle.size}px`, 
            height: `${particle.size}px` 
          }}
        />
      ))}
      
      {/* Gradient Orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gray-200/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gray-200/10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2 pointer-events-none"></div>
      
      <div className="container mx-auto relative z-10">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0d9488] text-center w-full md:w-auto">
            Employee Login
          </h1>

          <button
            onClick={() => {
              setSubdomain('main'); // Set subdomain to 'main'
              localStorage.removeItem('tasktracker-subdomain'); // Clear from local storage
              setWorkers([]); // Clear workers to ensure the company input shows
              setFilteredWorkers([]);
              setSelectedWorker(null);
              setSearchTerm('');
              setPassword('');
              setCurrentPage(1);
              setDepartment('All');
            }}
            className="absolute top-4 right-4 px-3 py-2 bg-gray-200 border border-gray-300 text-black rounded-lg hover:bg-[#0d9488] hover:text-white transition-colors flex items-center gap-1 text-xs sm:text-sm md:static md:mt-0"
          >
            <span className="hidden sm:inline">Change Company</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>

          </button>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#0d9488]" />
            </div>

            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black w-full sm:w-auto"
            >
              {departments.map(dept => (
                <option key={dept} value={dept} className="text-black">{dept}</option>
              ))}
            </select>
          </div>
        </motion.div>

        {isLoadingWorkers ? (
          <div className="flex justify-center items-center h-96">
            <Spinner size="lg" className="text-[#0d9488]" />
          </div>
        ) : (filteredWorkers.length === 0 && (subdomain && subdomain !== 'main')) ? ( // This line was modified previously
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16 text-black"
          >
            No employees found for {subdomain}. Try adjusting your search or filter.
            <motion.button
              whileHover={{ scale: 1.1, rotate: 180 }}
              transition={{ duration: 0.5 }}
              className='block mx-auto bg-gray-200 border border-gray-300 p-3 my-3 rounded-full text-black'
              onClick={loadWorkers}
            >
              <IoMdRefresh />
            </motion.button>
          </motion.div>
        ) : filteredWorkers.length === 0 ? ( 
          null 
        ) : (
          <>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
            >
              {paginatedWorkers.map((worker, index) => (
                <motion.div
                  key={worker._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => setSelectedWorker(worker)}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className={`cursor-pointer p-4 rounded-lg text-center transition-all ${
                    selectedWorker?._id === worker._id
                      ? 'bg-white border-2 border-[#0d9488] shadow-lg shadow-[#0d9488]/20'
                      : 'bg-white border border-gray-300 hover:border-[#0d9488]'
                  }`}
                >
                  <div className="w-16 h-16 rounded-full mx-auto mb-3 overflow-hidden border-2 border-[#0d9488]/30">
                    <img
                      src={
                        worker.photo
                          ? worker.photo
                          : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}&background=0d9488&color=fff`
                      }
                      alt="Employee"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className={`font-semibold truncate ${selectedWorker?._id === worker._id ? 'text-[#0d9488]' : 'text-black'}`}>
                    {worker.name}
                  </h3>
                  <p className={`text-sm truncate ${selectedWorker?._id === worker._id ? 'text-[#0d9488]' : 'text-gray-600'}`}>
                    {worker.department || 'No Department'}
                  </p>
                </motion.div>
              ))}
            </motion.div>

            {renderPagination()}
          </>
        )}

        {/* Worker Login Modal */}
        <AnimatePresence>
          {selectedWorker && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedWorker(null);
              }}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white backdrop-blur-lg border border-gray-300 rounded-2xl p-6 w-full max-w-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center mb-6">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#0d9488]/50 mr-4 flex-shrink-0">
                    <img
                      src={
                        selectedWorker.photo
                          ? selectedWorker.photo
                          : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedWorker.name)}&background=0d9488&color=fff`
                      }
                      alt="Employee"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-[#0d9488] truncate">{selectedWorker.name}</h2>
                    <p className="text-[#0d9488] truncate">{selectedWorker.department}</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setSelectedWorker(null);
                      setPassword(''); // Clear password when closing modal
                    }}
                    className="ml-auto text-gray-600 hover:text-[#0d9488] focus:outline-none rounded-full w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-[#0d9488] hover:text-white flex-shrink-0"
                  >
                    ✕
                  </motion.button>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="form-group relative">
                    <label htmlFor="password" className="text-black flex items-center text-sm font-medium mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0d9488]" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-[#0d9488] focus:outline-none"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors disabled:opacity-70 font-medium"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing In...
                      </span>
                    ) : 'Sign In'}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wrong Subdomain Modal */}
        <Modal
          isOpen={showWrongSubdomainModal}
          onClose={() => setShowWrongSubdomainModal(false)}
          title="Company Not Found"
        >
          <div className="p-4">
            <p className="text-black mb-4">
              We couldn't find any company with the name "<span className="font-semibold">{subdomain}</span>".
            </p>
            <p className="text-black mb-6">
              Please check the spelling and try again, or enter a different company name.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWrongSubdomainModal(false);
                  setSubdomain('main');
                  localStorage.removeItem('tasktracker-subdomain');
                }}
                className="flex-1 bg-gray-200 border-gray-300 text-black hover:bg-[#0d9488] hover:text-white"
              >
                Re-enter Company Name
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowWrongSubdomainModal(false);
                  loadWorkers();
                }}
                className="flex-1 bg-[#0d9488] text-white hover:bg-white hover:text-[#0d9488] border-[#0d9488]"
              >
                Try Again
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default WorkerLogin;