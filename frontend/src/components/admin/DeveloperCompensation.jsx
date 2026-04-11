import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaUserPlus, FaFilter, FaSearch, FaEdit, FaTrash, FaFilePdf, FaPlus, FaTimes, FaChartBar, FaCalculator } from 'react-icons/fa';
import { getWorkers } from '../../services/workerService';
import { addDeveloperProject, getDeveloperProjects, getDeveloperProjectsByMonth, deleteDeveloperProject, getDeveloperProjectsSummary, getSalaryReport } from '../../services/salaryService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const DeveloperCompensation = () => {
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, active, inactive
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCalculationModalOpen, setIsCalculationModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [selectedDeveloper, setSelectedDeveloper] = useState(null);
  const [projectForm, setProjectForm] = useState({
    projectName: '',
    projectAmount: '',
    projectDate: new Date().toISOString().split('T')[0]
  });
  const [developerProjects, setDeveloperProjects] = useState({});
  const [calculationResult, setCalculationResult] = useState(null);
  const [summaryData, setSummaryData] = useState(null);

  const { subdomain } = useContext(appContext);

  const developerTypes = [
    { value: 'developer', label: 'Developer', hasClasses: false }
  ];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const workersData = await getWorkers({ subdomain });
      const safeWorkersData = Array.isArray(workersData) ? workersData : [];
      const developers = safeWorkersData.filter(worker => worker.employeeType === 'developer');
      setWorkers(developers);

      // Load developer projects from backend
      for (const developer of developers) {
        try {
          const projectsData = await getDeveloperProjects(developer._id, subdomain);
          setDeveloperProjects(prev => ({
            ...prev,
            [developer._id]: projectsData.projects
          }));
        } catch (err) {
          // If no projects found for this developer, continue with empty array
          setDeveloperProjects(prev => ({
            ...prev,
            [developer._id]: []
          }));
        }
      }
    } catch (error) {
      toast.error('Failed to load developers');
      console.error(error);
      setWorkers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = worker.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleAddProject = async (e) => {
    e.preventDefault();
    
    if (!selectedDeveloper) {
      toast.error('Please select a developer first');
      return;
    }
    
    try {
      const projectAmount = parseFloat(projectForm.projectAmount);
      if (isNaN(projectAmount) || projectAmount <= 0) {
        toast.error('Please enter a valid project amount');
        return;
      }

      const developerId = selectedDeveloper._id;
      const sixtyPercent = projectAmount * 0.6;
      
      // Prepare project data
      const projectData = {
        developerId: developerId,
        projectName: projectForm.projectName,
        projectAmount: projectAmount,
        projectDate: projectForm.projectDate,
        subdomain: subdomain
      };

      const response = await addDeveloperProject(projectData);

      // Update local state
      setDeveloperProjects(prev => ({
        ...prev,
        [developerId]: [...(prev[developerId] || []), response.project]
      }));

      toast.success(`Project added successfully! Developer will earn ₹${response.calculationDetails?.finalProfitSharing?.toFixed(2) || sixtyPercent.toFixed(2)}`);
      setProjectForm({
        projectName: '',
        projectAmount: '',
        projectDate: new Date().toISOString().split('T')[0]
      });
      setIsProjectModalOpen(false);
      setSelectedDeveloper(null);
    } catch (error) {
      toast.error(error.message || 'Failed to add project');
    }
  };

  const handleCalculateEarnings = (developer) => {
    const projects = developerProjects[developer._id] || [];
    
    // Calculate totals with profit sharing logic
    let totalEarnings = 0;
    let totalFinalProfitSharing = 0;
    let totalBaseSalary = 0;
    let totalActualSalary = 0;
    let totalDeductedAmount = 0;
    
    projects.forEach(project => {
      totalEarnings += project.developerEarnings;
      
      // Calculate final profit sharing for each project
      let finalProfitSharing = project.developerEarnings;
      if (project.baseSalary && project.actualSalary) {
        const deductedAmount = project.baseSalary - project.actualSalary;
        finalProfitSharing = project.developerEarnings - deductedAmount;
        totalDeductedAmount += deductedAmount;
        totalBaseSalary += project.baseSalary;
        totalActualSalary += project.actualSalary;
      }
      totalFinalProfitSharing += finalProfitSharing;
    });
    
    const totalProjects = projects.length;
    
    setCalculationResult({
      developer: developer,
      totalEarnings: totalEarnings,
      totalFinalProfitSharing: totalFinalProfitSharing,
      totalProjects: totalProjects,
      totalBaseSalary: totalBaseSalary,
      totalActualSalary: totalActualSalary,
      totalDeductedAmount: totalDeductedAmount,
      projects: projects
    });
    setIsCalculationModalOpen(true);
  };

  const handleDeleteProject = async (developerId, projectIndex, projectId) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteDeveloperProject(projectId);
        
        // Update local state to remove the project
        setDeveloperProjects(prev => {
          const updatedProjects = prev[developerId].filter(project => project._id !== projectId);
          const newDeveloperProjects = {
            ...prev,
            [developerId]: updatedProjects
          };
          
          // Refresh the calculation result if it's currently displayed
          if (calculationResult && calculationResult.developer._id === developerId) {
            const totalEarnings = updatedProjects.reduce((sum, project) => sum + project.developerEarnings, 0);
            const totalProjects = updatedProjects.length;
            
            setCalculationResult({
              ...calculationResult,
              totalEarnings: totalEarnings,
              totalProjects: totalProjects,
              projects: updatedProjects
            });
          }
          
          return newDeveloperProjects;
        });
        
        toast.success('Project deleted successfully');
      } catch (error) {
        toast.error('Failed to delete project');
      }
    }
  };

  const [summaryFilter, setSummaryFilter] = useState({ month: '', year: '' });
  const [profitSharingFilter, setProfitSharingFilter] = useState({ 
    month: new Date().getMonth() + 1, 
    year: new Date().getFullYear() 
  });
  const [profitSharingData, setProfitSharingData] = useState(null);
  const [isProfitSharingModalOpen, setIsProfitSharingModalOpen] = useState(false);

  const handleViewSummary = async () => {
    try {
      const summary = await getDeveloperProjectsSummary(subdomain, summaryFilter.month, summaryFilter.year);
      setSummaryData(summary);
      setIsSummaryModalOpen(true);
    } catch (error) {
      toast.error('Failed to load developer projects summary');
    }
  };

  const handleSummaryFilterChange = (e) => {
    const { name, value } = e.target;
    setSummaryFilter(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProfitSharingFilterChange = (e) => {
    const { name, value } = e.target;
    setProfitSharingFilter(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleViewProfitSharing = async () => {
    try {
      setIsLoading(true);
      
      // Get all developers
      const allDevelopers = await getWorkers({ subdomain });
      const developers = allDevelopers.filter(worker => worker.employeeType === 'developer');
      
      // For each developer, get their salary report for the selected month/year
      const profitSharingResults = [];
      
      for (const developer of developers) {
        // Calculate the start and end dates for the selected month/year
        const startDate = new Date(profitSharingFilter.year, profitSharingFilter.month - 1, 1);
        const endDate = new Date(profitSharingFilter.year, profitSharingFilter.month, 0);
        
        try {
          // Get developer projects for this month/year directly from backend
          const projects = await getDeveloperProjectsByMonth(developer._id, subdomain, profitSharingFilter.month, profitSharingFilter.year);
          
          // Use values returned from backend
          const totalProjectAmount = projects.projects.reduce((sum, project) => sum + project.projectAmount, 0);
          const sixtyPercentProfit = projects.totalEarnings; // This is the sum of 60% of each project amount
          
          // Get salary report for the selected month/year to get actual salary
          const salaryReport = await getSalaryReport(developer._id, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
          
          // Calculate profit sharing based on the formula: 60% of project profit - (base salary - actual salary)
          const baseSalary = developer.salary || 0;
          const actualSalary = salaryReport.finalSalaryWithFines || salaryReport.report?.summary?.finalSalary || 0;
          const deductedAmount = Math.max(0, baseSalary - actualSalary);
          
          const finalProfitSharing = sixtyPercentProfit - deductedAmount;
          
          profitSharingResults.push({
            developerId: developer._id,
            developerName: developer.name,
            baseSalary,
            actualSalary,
            deductedAmount,
            totalProjectAmount,
            sixtyPercentProfit,
            finalProfitSharing,
            projects: projects.projects
          });
        } catch (err) {
          console.error(`Error fetching salary report for developer ${developer.name}:`, err);
          // If there's an error getting salary report for this developer, add with default values
          profitSharingResults.push({
            developerId: developer._id,
            developerName: developer.name,
            baseSalary: developer.salary || 0,
            actualSalary: 0, // Default to 0 if salary report fails
            deductedAmount: Math.max(0, (developer.salary || 0) - 0), // Since actual salary is 0
            totalProjectAmount: 0,
            sixtyPercentProfit: 0,
            finalProfitSharing: 0 - Math.max(0, (developer.salary || 0) - 0),
            projects: []
          });
        }
      }
      
      setProfitSharingData({
        month: profitSharingFilter.month,
        year: profitSharingFilter.year,
        results: profitSharingResults
      });
      setIsProfitSharingModalOpen(true);
    } catch (error) {
      toast.error('Failed to load profit sharing data');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setProjectForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const openProjectModal = (developer) => {
    setSelectedDeveloper(developer);
    setProjectForm({
      projectName: '',
      projectAmount: '',
      projectDate: new Date().toISOString().split('T')[0]
    });
    setIsProjectModalOpen(true);
  };

  const getSalaryDisplay = (worker) => {
    const projects = developerProjects[worker._id] || [];
    const totalEarnings = projects.reduce((sum, project) => sum + project.developerEarnings, 0);
    return `₹${totalEarnings.toFixed(2)} from ${projects.length} projects`;
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
              alt="Developer"
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
        return 'Developer';
      }
    },
    {
      header: 'Total Earnings',
      accessor: 'totalEarnings',
      render: (record) => getSalaryDisplay(record)
    },
    {
      header: 'Actions',
      accessor: 'actions',
      render: (developer) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openProjectModal(developer)}
            className="p-1 text-blue-600 hover:text-blue-800"
            title="Add Project"
          >
            <FaPlus className='text-xl' />
          </button>
          <button
            onClick={() => handleCalculateEarnings(developer)}
            className="p-1 text-green-600 hover:text-green-800"
            title="View Earnings"
          >
            <FaCalculator className='text-xl' />
          </button>
          <button
            onClick={() => {
              const projects = developerProjects[developer._id] || [];
              if (projects.length > 0) {
                // For now, we'll just show a message since we need to know which project to delete
                toast.info('Use the project list in earnings modal to delete specific projects');
              } else {
                toast.info('No projects to delete');
              }
            }}
            className="p-1 text-red-600 hover:text-red-800"
            title="Delete Projects"
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
        <h1 className="text-2xl font-bold">Developer Compensation</h1>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Button
            variant="primary"
            className='flex items-center justify-center'
            onClick={handleViewProfitSharing}
          >
            <FaChartBar className="mr-2" /> View Profit Sharing
          </Button>
          <Button
            variant="primary"
            className='flex items-center justify-center'
            onClick={handleViewSummary}
          >
            <FaChartBar className="mr-2" /> View Summary
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
            noDataMessage="No developers found."
          />
        )}
      </Card>

      {/* Add Project Modal */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setSelectedDeveloper(null);
        }}
        title={`Add Project for ${selectedDeveloper?.name || ''}`}
      >
        <form onSubmit={handleAddProject}>
          <div className="space-y-4">
            <div>
              <label htmlFor="projectName" className="form-label">Project Name</label>
              <input
                type="text"
                id="projectName"
                name="projectName"
                className="form-input"
                value={projectForm.projectName}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div>
              <label htmlFor="projectAmount" className="form-label">Project Amount (₹)</label>
              <input
                type="number"
                id="projectAmount"
                name="projectAmount"
                className="form-input"
                value={projectForm.projectAmount}
                onChange={handleFormChange}
                required
                min="0"
                step="0.01"
              />
            </div>
            
            <div>
              <label htmlFor="projectDate" className="form-label">Project Date</label>
              <input
                type="date"
                id="projectDate"
                name="projectDate"
                className="form-input"
                value={projectForm.projectDate}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div className="pt-4">
              <p className="text-sm text-gray-600">
                <strong>Calculation:</strong><br />
                Developer will receive 60% of the project amount.<br />
                {projectForm.projectAmount && !isNaN(parseFloat(projectForm.projectAmount)) ? (
                  `For ₹${parseFloat(projectForm.projectAmount).toFixed(2)}, developer will earn ₹${(parseFloat(projectForm.projectAmount) * 0.6).toFixed(2)}`
                ) : 'Enter project amount to see calculation'}
              </p>
            </div>
          </div>
          
          <div className="flex justify-end mt-6 space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsProjectModalOpen(false);
                setSelectedDeveloper(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Add Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Calculation Result Modal */}
      <Modal
        isOpen={isCalculationModalOpen}
        onClose={() => setIsCalculationModalOpen(false)}
        title={`Earnings for ${calculationResult?.developer?.name || ''}`}
        size="xl"
      >
        <div>
          {calculationResult && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-800">Total Projects</h3>
                  <p className="text-2xl font-bold text-blue-600">{calculationResult.totalProjects}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">Total Earnings (60%)</h3>
                  <p className="text-2xl font-bold text-green-600">₹{calculationResult.totalEarnings?.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800">Final Profit Sharing</h3>
                  <p className="text-2xl font-bold text-purple-600">₹{calculationResult.totalFinalProfitSharing?.toFixed(2)}</p>
                </div>
              </div>
              
              {/* Net Profit Sharing Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">Total Earnings (60%)</h3>
                  <p className="text-xl font-bold text-green-600">₹{calculationResult.totalEarnings?.toFixed(2)}</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-indigo-800">Net Profit Sharing</h3>
                  <p className="text-xl font-bold text-indigo-600">₹{calculationResult.totalFinalProfitSharing?.toFixed(2)}</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">60% Profit</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Profit Sharing</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculationResult.projects.map((project, index) => {
                      const deductedAmount = project.baseSalary && project.actualSalary ? project.baseSalary - project.actualSalary : 0;
                      const finalProfitSharing = project.developerEarnings - deductedAmount;
                      
                      return (
                        <tr key={project._id || index}>
                          <td className="px-6 py-4 whitespace-nowrap">{project.projectName}</td>
                          <td className="px-6 py-4 whitespace-nowrap">₹{project.projectAmount?.toFixed(2)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-green-600 font-semibold">₹{project.developerEarnings?.toFixed(2)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-semibold">₹{finalProfitSharing.toFixed(2)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{project.projectDate}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteProject(calculationResult.developer._id, index, project._id)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Delete Project"
                            >
                              <FaTrash className='text-lg' />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setIsCalculationModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Summary Modal */}
      <Modal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        title="Developer Projects Summary"
        size="xl"
      >
        <div>
          {summaryData && (
            <div>
              {/* Month/Year filter display */}
              <div className="mb-4 p-3 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Filter:</strong> {summaryData.filter?.month && summaryData.filter?.year 
                    ? `Month: ${summaryData.filter.month}, Year: ${summaryData.filter.year}` 
                    : 'All months and years'}
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-800">Total Developers</h3>
                  <p className="text-2xl font-bold text-blue-600">{summaryData.totalDevelopers}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">Total Projects</h3>
                  <p className="text-2xl font-bold text-green-600">{summaryData.overallTotalProjects}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800">Total Earnings (60%)</h3>
                  <p className="text-2xl font-bold text-purple-600">₹{summaryData.overallTotalEarnings?.toFixed(2)}</p>
                </div>
              </div>
              
              {/* Additional summary details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800">Total Base Salary</h3>
                  <p className="text-xl font-bold text-gray-600">₹{summaryData.overallTotalBaseSalary?.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800">Total Actual Salary</h3>
                  <p className="text-xl font-bold text-gray-600">₹{summaryData.overallTotalActualSalary?.toFixed(2)}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-yellow-800">Total Deducted Amount</h3>
                  <p className="text-xl font-bold text-yellow-600">₹{summaryData.overallTotalDeductedAmount?.toFixed(2)}</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-indigo-800">Total Final Profit Sharing</h3>
                  <p className="text-xl font-bold text-indigo-600">₹{summaryData.overallTotalFinalProfitSharing?.toFixed(2)}</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Developer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Projects</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">60% Profit</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Salary</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Salary</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deducted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Profit Sharing</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summaryData.developerSummaries.map((devSummary, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">{devSummary.developer.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{devSummary.totalProjects}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-green-600 font-semibold">₹{devSummary.totalEarnings?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{devSummary.totalBaseSalary?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{devSummary.totalActualSalary?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{devSummary.totalDeductedAmount?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-semibold">₹{devSummary.totalFinalProfitSharing?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Month/Year filter controls */}
          <div className="mb-4 p-4 border rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Filter by Month/Year</h3>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  name="month"
                  value={summaryFilter.month}
                  onChange={handleSummaryFilterChange}
                  className="form-input w-full"
                >
                  <option value="">All Months</option>
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select
                  name="year"
                  value={summaryFilter.year}
                  onChange={handleSummaryFilterChange}
                  className="form-input w-full"
                >
                  <option value="">All Years</option>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() - 5 + i;
                    return (
                      <option key={year} value={year}>{year}</option>
                    );
                  })}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="primary"
                  onClick={handleViewSummary}
                  className="w-full"
                >
                  Apply Filter
                </Button>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setIsSummaryModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Profit Sharing Modal */}
      <Modal
        isOpen={isProfitSharingModalOpen}
        onClose={() => setIsProfitSharingModalOpen(false)}
        title={`Profit Sharing for ${profitSharingData?.month ? new Date(profitSharingData.year, profitSharingData.month - 1).toLocaleString('default', { month: 'long' }) : ''} ${profitSharingData?.year || ''}`}
        size="xl"
      >
        <div>
          {profitSharingData && (
            <div>
              {/* Month/Year filter controls */}
              <div className="mb-4 p-4 border rounded-lg">
                <h3 className="text-lg font-semibold mb-3">Filter by Month/Year</h3>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                    <select
                      name="month"
                      value={profitSharingFilter.month}
                      onChange={handleProfitSharingFilterChange}
                      className="form-input w-full"
                    >
                      <option value="1">January</option>
                      <option value="2">February</option>
                      <option value="3">March</option>
                      <option value="4">April</option>
                      <option value="5">May</option>
                      <option value="6">June</option>
                      <option value="7">July</option>
                      <option value="8">August</option>
                      <option value="9">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <select
                      name="year"
                      value={profitSharingFilter.year}
                      onChange={handleProfitSharingFilterChange}
                      className="form-input w-full"
                    >
                      {Array.from({ length: 10 }, (_, i) => {
                        const year = new Date().getFullYear() - 5 + i;
                        return (
                          <option key={year} value={year}>{year}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="primary"
                      onClick={handleViewProfitSharing}
                      className="w-full"
                    >
                      Apply Filter
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-800">Total Developers</h3>
                  <p className="text-2xl font-bold text-blue-600">{profitSharingData.results.length}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">Total Projects</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {profitSharingData.results.reduce((sum, item) => sum + item.projects.length, 0)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800">Total 60% Profit</h3>
                  <p className="text-2xl font-bold text-purple-600">
                    ₹{profitSharingData.results.reduce((sum, item) => sum + item.sixtyPercentProfit, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-indigo-800">Total Final Profit Sharing</h3>
                  <p className="text-2xl font-bold text-indigo-600">
                    ₹{profitSharingData.results.reduce((sum, item) => sum + item.finalProfitSharing, 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Developer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Salary</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Salary</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deducted Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">60% Profit</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Profit Sharing</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profitSharingData.results.map((result, index) => (
                      <tr key={result.developerId}>
                        <td className="px-6 py-4 whitespace-nowrap">{result.developerName}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{result.baseSalary?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{result.actualSalary?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{result.deductedAmount?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₹{result.totalProjectAmount?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-green-600 font-semibold">₹{result.sixtyPercentProfit?.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-semibold">₹{result.finalProfitSharing?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setIsProfitSharingModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DeveloperCompensation;