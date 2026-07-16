// attendance _31/client/src/components/admin/SalaryManagement.jsx
import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
    Coins,
    Eye,
    FileDown,
    Trash2,
    Calendar,
    List,
    ChevronLeft,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    X,
    Sliders,
    FileText,
    Receipt,
    Wallet,
    Filter,
    AlertTriangle
} from 'lucide-react';
import { getWorkers } from '../../services/workerService';
import { getDepartments } from '../../services/departmentService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { giveBonusAmount, removeBonusAmount, resetSalaryAmount, getSalaryReport, getBulkSalaryReport } from '../../services/salaryService';
import { deleteFine, getAllFines } from '../../services/fineService';
import { getAllHolidays } from '../../services/holidayService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AddFineModal from './modals/AddFineModal';
import PayrollAdjustmentModal from './modals/PayrollAdjustmentModal';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const calculateTaskDelayPenalty = (reportData, reportYear) => {
    if (!reportData || !reportData.delayedTasks || reportData.delayedTasks.length === 0 || !reportData.report?.report) {
        return 0;
    }

    const parseSalary = (str) => {
        if (!str) return 0;
        const cleaned = str.replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
    };

    const claimedDays = new Set();
    let totalPenalty = 0;

    reportData.delayedTasks.forEach(task => {
        const start = new Date(task.endDate);
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);

        const end = task.doneDate ? new Date(task.doneDate) : new Date();
        end.setHours(23, 59, 59, 999);

        reportData.report.report.forEach(day => {
            const dDate = new Date(`${day.date}, ${reportYear}`);
            if (dDate >= start && dDate <= end) {
                if (!claimedDays.has(day.date)) {
                    claimedDays.add(day.date);
                    totalPenalty += parseSalary(day.totalSalary);
                }
            }
        });
    });

    return parseFloat(totalPenalty.toFixed(4));
};

const WorkerAvatar = ({ record }) => {
    const [imgFailed, setImgFailed] = React.useState(false);
    const photoUrl = record?.photo;
    const hasPhoto = photoUrl && photoUrl !== 'null' && photoUrl !== 'undefined' && photoUrl !== '';

    if (hasPhoto && !imgFailed) {
        return (
            <img
                src={photoUrl}
                alt={record.name || 'Employee'}
                className="w-9 h-9 rounded-full object-cover border border-slate-100 shadow-sm mr-3 flex-none"
                onError={() => setImgFailed(true)}
            />
        );
    }

    const initials = record?.name
        ? record.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase()
        : '??';

    return (
        <div className="w-9 h-9 rounded-full bg-teal-50 border border-teal-100/80 flex items-center justify-center text-teal-700 font-extrabold text-xs mr-3 flex-none">
            {initials}
        </div>
    );
};

const SalaryManagement = () => {
    const [workers, setWorkers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const observerRef = useRef(null);
    const [searchTerm, setSearchTerm] = useState(() => {
        const val = localStorage.getItem('salarySearchTerm');
        return (val === null || val === 'null' || val === 'undefined') ? '' : val;
    });
    const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
    const [formData, setFormData] = useState({
        bonus: '',
        fromDate: new Date().toISOString().slice(0, 10),
        toDate: new Date().toISOString().slice(0, 10)
    });

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportData, setReportData] = useState(null);
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [reportDateRange, setReportDateRange] = useState({
        fromDate: new Date().toISOString().slice(0, 10),
        toDate: new Date().toISOString().slice(0, 10)
    });

    // Add state for month selection
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // Default to current month
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Default to current year
    const [useMonthSelection, setUseMonthSelection] = useState(true); // Toggle between month and date range

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState(null);
    // Add state for delete confirmation modal
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [workerToDelete, setWorkerToDelete] = useState(null);

    // ADD FINE STATE
    const [isFineModalOpen, setIsFineModalOpen] = useState(false);

    // PAYROLL ADJUSTMENT STATE
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [expandedAdjustments, setExpandedAdjustments] = useState({});

    // State for fine filter
    const [isFineFilterOpen, setIsFineFilterOpen] = useState(false);
    const [selectedFineMonth, setSelectedFineMonth] = useState('');
    const [selectedFineYear, setSelectedFineYear] = useState('');
    const [finesData, setFinesData] = useState([]);
    const [isLoadingFines, setIsLoadingFines] = useState(false);

    // NEW: State for bulk salary report
    const [isBulkReportModalOpen, setIsBulkReportModalOpen] = useState(false);
    const [selectedWorkersForReport, setSelectedWorkersForReport] = useState([]);
    const [isBulkReportLoading, setIsBulkReportLoading] = useState(false);
    const [bulkReportData, setBulkReportData] = useState([]);
    const [isIndividualReportModalOpen, setIsIndividualReportModalOpen] = useState(false);
    const [selectedIndividualWorker, setSelectedIndividualWorker] = useState(null);
    const [isIndividualReportLoading, setIsIndividualReportLoading] = useState(false);
    const [individualReportData, setIndividualReportData] = useState(null);
    const [deductionView, setDeductionView] = useState(() => {
        const saved = localStorage.getItem('deductionView');
        return saved === null ? true : saved === 'true';
    });
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
    const [showTaskDeductionBreakdown, setShowTaskDeductionBreakdown] = useState(false);
    const [penaltyExplanation, setPenaltyExplanation] = useState(null);

    const [bulkSearchTerm, setBulkSearchTerm] = useState('');
    const [bulkDepartmentFilter, setBulkDepartmentFilter] = useState('All');
    const [bulkAttendanceFilter, setBulkAttendanceFilter] = useState('All');
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

    // Advanced filtering state variables
    const [isSalaryFilterOpen, setIsSalaryFilterOpen] = useState(() => {
        return localStorage.getItem('isSalaryFilterOpen') === 'true';
    });
    const [filterDepartment, setFilterDepartment] = useState(() => {
        const val = localStorage.getItem('salaryFilterDepartment');
        return (val === null || val === 'null' || val === 'undefined') ? '' : val;
    });
    const [filterMinSalary, setFilterMinSalary] = useState(() => {
        const val = localStorage.getItem('salaryFilterMinSalary');
        return (val === null || val === 'null' || val === 'undefined') ? '' : val;
    });
    const [filterMaxSalary, setFilterMaxSalary] = useState(() => {
        const val = localStorage.getItem('salaryFilterMaxSalary');
        return (val === null || val === 'null' || val === 'undefined') ? '' : val;
    });
    const [filterFineStatus, setFilterFineStatus] = useState(() => {
        const val = localStorage.getItem('salaryFilterFineStatus');
        return (val === null || val === 'null' || val === 'undefined') ? 'All' : val;
    });
    const [filterBankStatus, setFilterBankStatus] = useState(() => {
        const val = localStorage.getItem('salaryFilterBankStatus');
        return (val === null || val === 'null' || val === 'undefined') ? 'All' : val;
    });
    const [sortBy, setSortBy] = useState(() => {
        const val = localStorage.getItem('salarySortBy');
        return (val === null || val === 'null' || val === 'undefined') ? '' : val;
    });

    const getActiveFilterCount = () => {
        let count = 0;
        if (searchTerm) count++;
        if (filterDepartment && filterDepartment !== 'All') count++;
        if (filterFineStatus && filterFineStatus !== 'All') count++;
        if (filterBankStatus && filterBankStatus !== 'All') count++;
        if (filterMinSalary) count++;
        if (filterMaxSalary) count++;
        if (sortBy) count++;
        return count;
    };

    const resetSalaryFilters = () => {
        setFilterDepartment('');
        setFilterFineStatus('All');
        setFilterBankStatus('All');
        setFilterMinSalary('');
        setFilterMaxSalary('');
        setSortBy('');
        setSearchTerm('');
    };

    useEffect(() => {
        localStorage.setItem('salarySearchTerm', searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        localStorage.setItem('isSalaryFilterOpen', isSalaryFilterOpen);
    }, [isSalaryFilterOpen]);

    useEffect(() => {
        localStorage.setItem('salaryFilterDepartment', filterDepartment);
    }, [filterDepartment]);

    useEffect(() => {
        localStorage.setItem('salaryFilterMinSalary', filterMinSalary);
    }, [filterMinSalary]);

    useEffect(() => {
        localStorage.setItem('salaryFilterMaxSalary', filterMaxSalary);
    }, [filterMaxSalary]);

    useEffect(() => {
        localStorage.setItem('salaryFilterFineStatus', filterFineStatus);
    }, [filterFineStatus]);

    useEffect(() => {
        localStorage.setItem('salaryFilterBankStatus', filterBankStatus);
    }, [filterBankStatus]);

    useEffect(() => {
        localStorage.setItem('salarySortBy', sortBy);
    }, [sortBy]);

    useEffect(() => {
        localStorage.setItem('deductionView', deductionView);
    }, [deductionView]);

    const { subdomain } = useContext(appContext);

    const [reports, setReports] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

    const fetchReports = async (pageNumber, isRefresh = false) => {
        if (pageNumber === 1 && !isRefresh) {
            setIsLoading(true);
        } else if (pageNumber > 1) {
            setIsFetchingNextPage(true);
        }

        try {
            const year = selectedYear;
            const month = selectedMonth;

            const formatDate = (date) => {
                const d = new Date(date);
                let m = '' + (d.getMonth() + 1);
                let day = '' + d.getDate();
                const yr = d.getFullYear();
                if (m.length < 2) m = '0' + m;
                if (day.length < 2) day = '0' + day;
                return [yr, m, day].join('-');
            };

            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);

            const fromDateStr = formatDate(firstDay);
            const toDateStr = formatDate(lastDay);

            const response = await getBulkSalaryReport(subdomain, fromDateStr, toDateStr, {
                page: pageNumber,
                limit: 10,
                searchTerm,
                filterDepartment,
                filterMinSalary,
                filterMaxSalary,
                filterFineStatus,
                filterBankStatus,
                sortBy
            });

            if (pageNumber === 1) {
                setReports(response.reports || []);
            } else {
                setReports(prev => {
                    const existingIds = new Set(prev.map(r => r._id));
                    const newReports = (response.reports || []).filter(r => !existingIds.has(r._id));
                    return [...prev, ...newReports];
                });
            }

            setHasMore(response.pagination?.hasMore || false);
            setPage(pageNumber);
        } catch (error) {
            toast.error('Failed to load salary data');
            console.error(error);
        } finally {
            setIsLoading(false);
            setIsFetchingNextPage(false);
        }
    };

    const loadData = async () => {
        setIsLoadingDepartments(true);

        try {
            const [workersData, departmentsData] = await Promise.all([
                getWorkers({ subdomain }),
                getDepartments({ subdomain })
            ]);

            setWorkers(Array.isArray(workersData) ? workersData : []);
            setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
        } catch (error) {
            toast.error('Failed to load metadata');
            console.error(error);
            setWorkers([]);
            setDepartments([]);
        } finally {
            setIsLoadingDepartments(false);
        }
    };

    useEffect(() => {
        loadData();
        // Set initial date range to current month
        setMonthDateRange();
    }, []);

    useEffect(() => {
        fetchReports(1, true);
    }, [searchTerm, filterDepartment, filterMinSalary, filterMaxSalary, filterFineStatus, filterBankStatus, sortBy, selectedMonth, selectedYear]);

    // Infinite scroll observer using callback ref to avoid AnimatePresence race conditions
    const sentinelRef = useCallback((node) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        if (node && hasMore && !isFetchingNextPage && !isLoading) {
            const scrollContainer = document.querySelector('.custom-main-scroll');
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    fetchReports(page + 1);
                }
            }, {
                root: scrollContainer || null,
                rootMargin: '100px',
                threshold: 0.01
            });
            observer.observe(node);
            observerRef.current = observer;
        }
    }, [page, hasMore, isFetchingNextPage, isLoading, searchTerm, filterDepartment, filterMinSalary, filterMaxSalary, filterFineStatus, filterBankStatus, sortBy, selectedMonth, selectedYear]);

    // ADD FUNCTION TO CALCULATE MONTHLY FINES
    const calculateMonthlyFines = (worker, month, year) => {
        if (!worker.fines || !Array.isArray(worker.fines) || worker.fines.length === 0) {
            return 0;
        }

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        // If no specific month/year provided, use current month/year
        const targetMonth = month || currentMonth;
        const targetYear = year || currentYear;

        return worker.fines
            .filter(fine => {
                // Make sure fine.date is a valid date
                if (!fine.date) return false;
                const fineDate = new Date(fine.date);
                // Check if the date is valid
                if (isNaN(fineDate.getTime())) return false;
                return fineDate.getMonth() + 1 === targetMonth && fineDate.getFullYear() === targetYear;
            })
            .reduce((total, fine) => total + (fine.amount || 0), 0);
    };

    const getWorkerDeptId = (worker) => {
        if (!worker || !worker.department) return null;
        if (typeof worker.department === 'object') {
            return worker.department._id;
        }
        const dept = departments.find(d => d._id === worker.department || d.name === worker.department);
        return dept ? dept._id : worker.department;
    };

    const filteredWorkers = Array.isArray(workers)
        ? workers
            .filter(worker => {
                // 1. Status is not Relieved
                if (worker.status === 'Relieved') return false;

                // 2. Search term filter (Name or Department or RFID/Employee ID)
                const matchesSearch = !searchTerm ||
                    (worker.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (worker.department && (typeof worker.department === 'object' ? worker.department.name : worker.department).toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (worker.rfid || '').toLowerCase().includes(searchTerm.toLowerCase());

                if (!matchesSearch) return false;

                // 3. Department filter
                if (filterDepartment && filterDepartment !== 'All') {
                    const workerDeptId = getWorkerDeptId(worker);
                    if (workerDeptId !== filterDepartment) return false;
                }

                // 4. Min Salary filter
                if (filterMinSalary) {
                    const minSal = parseFloat(filterMinSalary);
                    if (!isNaN(minSal) && (worker.salary || 0) < minSal) return false;
                }

                // 5. Max Salary filter
                if (filterMaxSalary) {
                    const maxSal = parseFloat(filterMaxSalary);
                    if (!isNaN(maxSal) && (worker.salary || 0) > maxSal) return false;
                }

                // 6. Fine status filter
                if (filterFineStatus && filterFineStatus !== 'All') {
                    const currentMonth = new Date().getMonth() + 1;
                    const currentYear = new Date().getFullYear();
                    const workerFineAmount = calculateMonthlyFines(worker, currentMonth, currentYear);
                    if (filterFineStatus === 'Has Fines' && workerFineAmount === 0) return false;
                    if (filterFineStatus === 'No Fines' && workerFineAmount > 0) return false;
                }

                // 7. Bank Details status filter
                if (filterBankStatus && filterBankStatus !== 'All') {
                    const hasBankDetails = worker?.bankDetails?.accountNumber && worker?.bankDetails?.ifscCode;
                    if (filterBankStatus === 'Added' && !hasBankDetails) return false;
                    if (filterBankStatus === 'Pending' && hasBankDetails) return false;
                }

                return true;
            })
            .sort((a, b) => {
                if (!sortBy) return 0;

                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();

                if (sortBy === 'name-asc') {
                    return (a.name || '').localeCompare(b.name || '');
                } else if (sortBy === 'name-desc') {
                    return (b.name || '').localeCompare(a.name || '');
                } else if (sortBy === 'salary-asc') {
                    return (a.salary || 0) - (b.salary || 0);
                } else if (sortBy === 'salary-desc') {
                    return (b.salary || 0) - (a.salary || 0);
                } else if (sortBy === 'final-asc') {
                    return (a.finalSalary || 0) - (b.finalSalary || 0);
                } else if (sortBy === 'final-desc') {
                    return (b.finalSalary || 0) - (a.finalSalary || 0);
                } else if (sortBy === 'fine-desc') {
                    const fineA = calculateMonthlyFines(a, currentMonth, currentYear);
                    const fineB = calculateMonthlyFines(b, currentMonth, currentYear);
                    return fineB - fineA;
                }
                return 0;
            })
        : [];

    const bulkFilteredWorkers = Array.isArray(workers)
        ? workers.filter(worker => {
            const matchesSearch = worker.name.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
                (worker.department?.name || worker.department || '').toLowerCase().includes(bulkSearchTerm.toLowerCase());

            const workerDeptId = getWorkerDeptId(worker);
            const matchesDepartment = bulkDepartmentFilter === 'All' || workerDeptId === bulkDepartmentFilter;

            return matchesSearch && matchesDepartment && worker.status !== 'Relieved';
        })
        : [];

    const openEditModal = (worker) => {
        const departmentId = getWorkerDeptId(worker);
        setSelectedWorker(worker);
        setFormData({
            bonus: '',
            fromDate: new Date().toISOString().slice(0, 10),
            toDate: new Date().toISOString().slice(0, 10)
        });
        setIsEditModalOpen(true);
    };

    const handleEditWorker = async (e) => {
        e.preventDefault();
        const bonusAmount = parseFloat(formData.bonus);
        if (isNaN(bonusAmount) || bonusAmount < 0) {
            toast.error('Bonus amount must be a non-negative number.');
            return;
        }

        // Validate date range
        if (!formData.fromDate || !formData.toDate) {
            toast.error('Please select a date range for bonus calculation.');
            return;
        }

        if (new Date(formData.fromDate) > new Date(formData.toDate)) {
            toast.error('From date must be before to date.');
            return;
        }

        await giveBonusAmount({
            id: selectedWorker._id,
            amount: bonusAmount,
            fromDate: formData.fromDate,
            toDate: formData.toDate
        })
            .then((response) => {
                toast.success(response.message);
                loadData();
                fetchReports(1, true);
                setFormData({
                    bonus: '',
                    fromDate: new Date().toISOString().slice(0, 10),
                    toDate: new Date().toISOString().slice(0, 10)
                });
                setIsEditModalOpen(false);
            })
            .catch((error) => {
                toast.error(error.message || 'Failed to give bonus');
            });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'bonus') {
            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
        } else {
        }
    };

    const handleSalaryReset = async (e) => {
        e.preventDefault();
        await resetSalaryAmount({ subdomain })
            .then((response) => {
                toast.success(response.message);
                loadData();
                fetchReports(1, true);
            })
            .catch((error) => {
                toast.error(error.message || 'Failed to give bonus');
            });
    }

    const handleReportDateChange = (e) => {
        setReportDateRange(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // Add function to handle month/year selection
    const handleMonthChange = (e) => {
        setSelectedMonth(parseInt(e.target.value));
    };

    const handleYearChange = (e) => {
        setSelectedYear(parseInt(e.target.value));
    };

    // Add function to toggle between month selection and date range
    const toggleDateSelection = () => {
        setUseMonthSelection(!useMonthSelection);
    };

    // Add function to set date range based on selected month
    const setMonthDateRange = () => {
        const year = selectedYear;
        const month = selectedMonth; // 1-12 (August = 8)

        // Format dates as YYYY-MM-DD strings
        const formatDate = (date) => {
            const d = new Date(date);
            let month = '' + (d.getMonth() + 1);
            let day = '' + d.getDate();
            const year = d.getFullYear();

            if (month.length < 2) month = '0' + month;
            if (day.length < 2) day = '0' + day;

            return [year, month, day].join('-');
        };

        // Create first day of the month
        const firstDay = new Date(year, month - 1, 1);

        // Create last day of the month
        const lastDay = new Date(year, month, 0);

        setReportDateRange({
            fromDate: formatDate(firstDay),
            toDate: formatDate(lastDay)
        });
    };

    const handleViewReport = (worker) => {
        setSelectedWorker(worker);
        setReportData(null);
        setIsReportModalOpen(true);
        // Set default date range to current month when opening report
        setMonthDateRange();
        // Default deductionView to true when opening individual reports
        setDeductionView(true);
        setShowDetailedBreakdown(false);
        setShowTaskDeductionBreakdown(false);
    };

    const fetchReport = async () => {
        let fromDate, toDate;

        if (useMonthSelection) {
            // Compute dates directly from selectedMonth/selectedYear (avoid stale state)
            const formatDateLocal = (date) => {
                const d = new Date(date);
                let m = '' + (d.getMonth() + 1);
                let day = '' + d.getDate();
                const y = d.getFullYear();
                if (m.length < 2) m = '0' + m;
                if (day.length < 2) day = '0' + day;
                return [y, m, day].join('-');
            };
            const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
            const lastDay = new Date(selectedYear, selectedMonth, 0);
            fromDate = formatDateLocal(firstDay);
            toDate = formatDateLocal(lastDay);
            // Also update state so PDF/other consumers stay in sync
            setReportDateRange({ fromDate, toDate });
        } else {
            fromDate = reportDateRange.fromDate;
            toDate = reportDateRange.toDate;
        }

        if (!fromDate || !toDate) {
            toast.error('Please select a date range.');
            return;
        }
        setIsReportLoading(true);
        setReportData(null);
        try {
            const data = await getSalaryReport(selectedWorker._id, fromDate, toDate);
            setReportData(data);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch report');
            setReportData(null);
        } finally {
            setIsReportLoading(false);
        }
    };

    const generatePDFReport = (worker, data, fromDate) => {
        const doc = new jsPDF();
        const startY = 20;
        doc.setFontSize(18);
        doc.text(`Salary Report for ${worker.name}`, 14, startY);
        doc.setFontSize(12);
        doc.text('Summary', 14, startY + 15);

        // Prepare summary data including bonus and fine information
        // Fix currency formatting to ensure clean, professional appearance
        // Updated to use "Rs." instead of "₹" symbol as per requirements
        const formatCurrencyForPDF = (amount) => {
            // Handle different input types
            if (typeof amount === 'string') {
                // Remove currency symbols, commas, and spaces, but KEEP the dot
                const numericValue = parseFloat(amount.replace(/[₹Rs,\s]/g, ''));
                if (isNaN(numericValue)) {
                    return 'Rs. 0.00';
                }
                return `Rs. ${numericValue.toFixed(2)}`;
            }
            // If it's a number, format it properly
            return `Rs. ${Number(amount).toFixed(2)}`;
        };

        const summaryData = [
            ['Employee Name', worker?.name], // Added Employee Name to match UI
            ['Employee ID', worker?.rfid],
            ['Monthly Base Salary', formatCurrencyForPDF(data.report.summary?.originalSalary || 0)],
            ['Base Salary (SaaS Only)', formatCurrencyForPDF(data.report.summary?.expectedSaaSSalary || data.report.summary?.originalSalary || 0)],
            ['Total Deductions', formatCurrencyForPDF(data.report.totalSalaryDeduction || 0)],
            ['Net Base Salary', formatCurrencyForPDF(data.report.summary?.netBaseSalary || 0)],
            ['Project Earnings', formatCurrencyForPDF(data.report.summary?.totalProjectSalary || 0)],
            ...(data.projectAdjustment && data.projectAdjustment !== 0 ? [
                ['Project Adjustment', `${data.projectAdjustment > 0 ? '+' : ''}${formatCurrencyForPDF(data.projectAdjustment)}`],
                ['Final Project Pay', formatCurrencyForPDF(Math.max(0, (data.report.summary?.totalProjectSalary || 0) + (data.projectAdjustment || 0)))]
            ] : []),
            // ADD FINE INFORMATION TO THE SUMMARY
            ...(data.totalFinesAmount > 0 ? [
                ['Total Fines', formatCurrencyForPDF(data.totalFinesAmount)]
            ] : []),
            ...(deductionView && data.delayedTasks?.length > 0 ? (() => {
                const reportYear = fromDate ? new Date(fromDate).getFullYear() : new Date().getFullYear();
                const totalDeducted = calculateTaskDelayPenalty(data, reportYear);

                return [
                    ['Task Delay Deduction Applied', 'YES'],
                    ['Permanent Delay Penalty', formatCurrencyForPDF(totalDeducted)],
                    ['Total Final Salary', formatCurrencyForPDF((data.finalSalaryWithFines || 0) - totalDeducted)]
                ];
            })() : [
                ['Total Final Salary', formatCurrencyForPDF(data.finalSalaryWithFines || 0)]
            ]),
            ['Total Days in Period', data.report.summary?.totalDaysInPeriod || 0],
            ['Total Working Days', data.report.summary?.totalWorkingDaysInPeriod || 0],
            ['Total Absent Days', data.report.summary?.totalAbsentDays || 0],
            ['Total Leave Days', data.report.summary?.totalLeaveDays || 0],
            ['Total Holidays', data.report.summary?.totalHolidaysInPeriod || 0],
            ['Total Sundays', data.report.summary?.totalSundaysInPeriod || 0],
            ['Actual Working Days', data.report.summary?.actualWorkingDays || 0],
            ['Total Working Hours', `${Number(data.report.totalWorkingHours || 0).toFixed(2)} hrs`],
            ['Total Permission Time', `${data.report.totalPermissionTime || 0} mins`],
            ['Absent Deduction', formatCurrencyForPDF(data.report.summary?.absentDeduction || 0)],
            ['Leave Deduction', formatCurrencyForPDF(data.report.summary?.leaveDeduction || 0)],
            ['Permission Deduction', formatCurrencyForPDF(data.report.summary?.permissionDeduction || 0)],
            ['Attendance Rate', `${Number(data.report.summary?.attendanceRate || 0).toFixed(2)}%`],
            ['Per Minute Salary', `Rs. ${Number(data.report.summary?.perMinuteSalary || 0).toFixed(4)}`],
        ];

        // Add bonus information if available
        if (data.totalBonusAmount > 0) {
            summaryData.push(['Bonus Amount Applied', formatCurrencyForPDF(data.totalBonusAmount)]);

            // Add details of each bonus
            data.bonuses.forEach((bonus, index) => {
                summaryData.push([`Bonus Period ${index + 1}`, `${new Date(bonus.fromDate).toLocaleDateString()} to ${new Date(bonus.toDate).toLocaleDateString()}`]);
            });
        }

        // Set font properties to prevent spacing issues
        doc.setFont('helvetica');
        doc.setFontSize(9);

        autoTable(doc, {
            startY: startY + 20,
            head: [['Metric', 'Value']],
            body: summaryData,
            theme: 'striped',
            headStyles: { fillColor: [52, 73, 94] },
            styles: {
                fontSize: 9,
                font: 'helvetica',
                cellPadding: 2
            },
            columnStyles: {
                1: { cellWidth: 50 } // Fixed width for value column
            }
        });

        // Add bonus period details if there are bonuses
        if (data.totalBonusAmount > 0 && data.bonuses && data.bonuses.length > 0) {
            doc.addPage();
            doc.setFontSize(18);
            doc.text('Bonus Details', 14, 20);

            const bonusColumns = ['Period', 'From Date', 'To Date', 'Amount'];
            const bonusRows = data.bonuses.map((bonus, index) => [
                `Bonus Period ${index + 1}`,
                new Date(bonus.fromDate).toLocaleDateString(),
                new Date(bonus.toDate).toLocaleDateString(),
                formatCurrencyForPDF(bonus.amount)
            ]);

            doc.setFontSize(12);
            autoTable(doc, {
                startY: 30,
                head: [bonusColumns],
                body: bonusRows,
                theme: 'striped',
                headStyles: { fillColor: [52, 73, 94] },
                styles: {
                    fontSize: 9,
                    font: 'helvetica',
                    cellPadding: 2
                }
            });
        }

        // Add detailed fines table if there are fines
        if (data.worker?.fines && data.worker.fines.length > 0) {
            const filteredFines = data.worker.fines.filter(fine => {
                const fineDate = new Date(fine.date);
                const fromDate = new Date(reportDateRange.fromDate);
                const toDate = new Date(reportDateRange.toDate);
                return fineDate >= fromDate && fineDate <= toDate;
            });

            if (filteredFines.length > 0) {
                doc.addPage();
                doc.setFontSize(18);
                doc.text('Fines', 14, 20);

                const finesColumns = ['Date', 'Amount', 'Reason'];
                const finesRows = filteredFines.map(fine => [
                    new Date(fine.date).toLocaleDateString(),
                    formatCurrencyForPDF(fine.amount),
                    fine.reason
                ]);

                doc.setFontSize(12);
                autoTable(doc, {
                    startY: 30,
                    head: [finesColumns],
                    body: finesRows,
                    theme: 'striped',
                    headStyles: { fillColor: [52, 73, 94] },
                    styles: {
                        fontSize: 9,
                        font: 'helvetica',
                        cellPadding: 2
                    }
                });
            }
        }

        doc.addPage();
        doc.setFontSize(18);
        doc.text('Daily Breakdown', 14, 20);
        // Updated table columns to match UI - added Total Salary column
        const tableColumn = [
            'Date', 'Status', 'In Time', 'Out Time',
            'Delay Time', 'Delay Deduction', 'Total Salary'
        ];

        // Fix formatting for daily breakdown table
        // Format Delay Deduction and Total Salary with "Rs" instead of "₹" for PDF
        const tableRows = data.report.report.map(row => [
            row.date,
            row.status,
            row.inTime,
            row.outTime,
            row.delayTime,
            row.deductionAmount.replace('₹', 'Rs '), // Replace ₹ with Rs for Delay Deduction
            row.totalSalary.replace('₹', 'Rs ') // Replace ₹ with Rs for Total Salary
        ]);

        // Set font properties for daily breakdown table
        doc.setFont('helvetica');
        doc.setFontSize(8);

        autoTable(doc, {
            startY: 30,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [52, 73, 94] },
            styles: {
                fontSize: 8,
                font: 'helvetica',
                cellPadding: 1.5
            },
            columnStyles: {
                5: { cellWidth: 30 }, // Fixed width for delay deduction column
                6: { cellWidth: 30 }  // Fixed width for total salary column
            }
        });
        doc.save(`salary_report_${worker.name}.pdf`);
    };

    const downloadPDF = () => {
        if (!reportData || !selectedWorker) {
            toast.error("No report data available to download.");
            return;
        }
        generatePDFReport(selectedWorker, reportData, reportDateRange.fromDate);
    };

    const handleDownloadPDF = async (worker) => {
        toast.info(`Generating PDF report for ${worker.name}...`);
        try {
            // Get date range for the current month
            const year = selectedYear;
            const month = selectedMonth;

            const formatDate = (date) => {
                const d = new Date(date);
                let m = '' + (d.getMonth() + 1);
                let day = '' + d.getDate();
                const yr = d.getFullYear();
                if (m.length < 2) m = '0' + m;
                if (day.length < 2) day = '0' + day;
                return [yr, m, day].join('-');
            };

            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);

            const fromDate = formatDate(firstDay);
            const toDate = formatDate(lastDay);

            const data = await getSalaryReport(worker._id, fromDate, toDate);
            if (!data) throw new Error("No data returned from API");

            generatePDFReport(worker, data, fromDate);
            toast.success(`PDF downloaded for ${worker.name}`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error(error.message || 'Failed to generate PDF');
        }
    };

    const handleRemoveBonus = async (worker) => {
        // Instead of using window.confirm, set state to show custom modal
        setWorkerToDelete(worker);
        setIsDeleteConfirmOpen(true);
    };

    // Add function to handle the actual bonus removal
    const confirmRemoveBonus = async () => {
        if (!workerToDelete) return;

        try {
            const response = await removeBonusAmount(workerToDelete._id);
            toast.success(response.message);
            loadData();
            fetchReports(1, true);
        } catch (error) {
            toast.error(error.message || 'Failed to remove bonus');
        } finally {
            // Close the modal and reset state
            setIsDeleteConfirmOpen(false);
            setWorkerToDelete(null);
        }
    };

    // Add function to cancel the bonus removal
    const cancelRemoveBonus = () => {
        setIsDeleteConfirmOpen(false);
        setWorkerToDelete(null);
    };

    // ADD DELETE FINE FUNCTION
    const handleDeleteFine = async (workerId, fineId) => {
        if (window.confirm('Are you sure you want to delete this fine?')) {
            try {
                const response = await deleteFine(workerId, fineId);
                toast.success(response.message);
                loadData();
                fetchReports(1, true);
                // Refresh the report if it's open
                if (isReportModalOpen && selectedWorker) {
                    fetchReport();
                }
                // Also refresh fines data if fine filter is open
                if (isFineFilterOpen) {
                    fetchFinesData();
                }
            } catch (error) {
                toast.error(error.message || 'Failed to delete fine');
            }
        }
    };

    // Function to fetch all fines
    const fetchFinesData = async () => {
        setIsLoadingFines(true);
        try {
            const params = {};
            if (selectedFineMonth) params.month = selectedFineMonth;
            if (selectedFineYear) params.year = selectedFineYear;

            const response = await getAllFines(params);
            setFinesData(response.fines);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch fines');
            setFinesData([]);
        } finally {
            setIsLoadingFines(false);
        }
    };

    // Function to handle fine filter submission
    const handleFineFilterSubmit = async (e) => {
        e.preventDefault();
        await fetchFinesData();
    };

    // Function to toggle fine filter panel
    const toggleFineFilterPanel = () => {
        setIsFineFilterOpen(!isFineFilterOpen);
        if (!isFineFilterOpen) {
            // Fetch data when opening the filter panel
            fetchFinesData();
        }
    };

    // NEW: Bulk report functions
    const openBulkReportModal = () => {
        setSelectedWorkersForReport([]);
        setIsBulkReportModalOpen(true);
    };

    const toggleWorkerSelection = (workerId) => {
        setSelectedWorkersForReport(prev => {
            if (prev.includes(workerId)) {
                return prev.filter(id => id !== workerId);
            } else {
                return [...prev, workerId];
            }
        });
    };

    const toggleAllWorkersSelection = () => {
        if (selectedWorkersForReport.length === bulkFilteredWorkers.length) {
            setSelectedWorkersForReport([]);
        } else {
            setSelectedWorkersForReport(bulkFilteredWorkers.map(w => w._id));
        }
    };

    const generateBulkReport = async () => {
        if (selectedWorkersForReport.length === 0) {
            toast.error('Please select at least one worker.');
            return;
        }

        setIsBulkReportLoading(true);
        setBulkReportData([]);
        try {
            // Calculate the date range for the selected month
            const year = selectedYear;
            const month = selectedMonth;

            const formatDate = (date) => {
                const d = new Date(date);
                let m = '' + (d.getMonth() + 1);
                let day = '' + d.getDate();
                const yr = d.getFullYear();

                if (m.length < 2) m = '0' + m;
                if (day.length < 2) day = '0' + day;

                return [yr, m, day].join('-');
            };

            // Create first day of the month
            const firstDay = new Date(year, month - 1, 1);
            // Create last day of the month
            const lastDay = new Date(year, month, 0);

            const fromDate = formatDate(firstDay);
            const toDate = formatDate(lastDay);

            const response = await getBulkSalaryReport(subdomain, fromDate, toDate, { isExport: true });
            if (response && response.reports) {
                // Filter to only include the selected workers
                const filteredReports = response.reports.filter(r => selectedWorkersForReport.includes(r.workerId));
                setBulkReportData(filteredReports);
            } else {
                setBulkReportData([]);
            }
        } catch (error) {
            toast.error('Failed to generate bulk report');
            console.error(error);
        } finally {
            setIsBulkReportLoading(false);
        }
    };

    const openIndividualReport = async (worker) => {
        setSelectedIndividualWorker(worker);
        setIsIndividualReportModalOpen(true);
        setIsIndividualReportLoading(true);
        // Default deductionView to true when opening individual reports
        setDeductionView(true);

        try {
            // Calculate the date range for the selected month
            const year = selectedYear;
            const month = selectedMonth;

            const formatDate = (date) => {
                const d = new Date(date);
                let month = '' + (d.getMonth() + 1);
                let day = '' + d.getDate();
                const year = d.getFullYear();

                if (month.length < 2) month = '0' + month;
                if (day.length < 2) day = '0' + day;

                return [year, month, day].join('-');
            };

            // Create first day of the month
            const firstDay = new Date(year, month - 1, 1);

            // Create last day of the month
            const lastDay = new Date(year, month, 0);

            const fromDate = formatDate(firstDay);
            const toDate = formatDate(lastDay);

            const report = await getSalaryReport(worker.workerId, fromDate, toDate);
            setIndividualReportData(report);
        } catch (error) {
            toast.error('Failed to fetch individual report');
            console.error(error);
        } finally {
            setIsIndividualReportLoading(false);
        }
    };

    const downloadIndividualPDF = () => {
        if (!individualReportData || !selectedIndividualWorker) {
            toast.error("No report data available to download.");
            return;
        }

        const doc = new jsPDF();
        const startY = 20;
        doc.setFontSize(18);
        doc.text(`Salary Report for ${selectedIndividualWorker.name}`, 14, startY);
        doc.setFontSize(12);
        doc.text('Summary', 14, startY + 15);

        // Prepare summary data including bonus and fine information
        const formatCurrencyForPDF = (amount) => {
            // Handle different input types
            if (typeof amount === 'string') {
                // Remove currency symbols, commas, and spaces, but KEEP the dot
                const numericValue = parseFloat(amount.replace(/[₹Rs,\s]/g, ''));
                if (isNaN(numericValue)) {
                    return 'Rs. 0.00';
                }
                return `Rs. ${numericValue.toFixed(2)}`;
            }
            // If it's a number, format it properly
            return `Rs. ${Number(amount).toFixed(2)}`;
        };

        const summaryData = [
            ['Employee Name', selectedIndividualWorker?.name], // Added Employee Name to match UI
            ['Employee ID', workers.find(w => w._id === selectedIndividualWorker.workerId)?.rfid || 'N/A'],
            ['Monthly Base Salary', formatCurrencyForPDF(individualReportData.report.summary?.originalSalary || 0)],
            ['Base Salary (SaaS Only)', formatCurrencyForPDF(individualReportData.report.summary?.expectedSaaSSalary || individualReportData.report.summary?.originalSalary || 0)],
            ['Total Deductions', formatCurrencyForPDF(individualReportData.report.totalSalaryDeduction || 0)],
            ['Net Base Salary', formatCurrencyForPDF(individualReportData.report.summary?.netBaseSalary || 0)],
            ['Project Earnings', formatCurrencyForPDF(individualReportData.report.summary?.totalProjectSalary || 0)],
            ...(individualReportData.projectAdjustment && individualReportData.projectAdjustment !== 0 ? [
                ['Project Adjustment', `${individualReportData.projectAdjustment > 0 ? '+' : ''}${formatCurrencyForPDF(individualReportData.projectAdjustment)}`],
                ['Final Project Pay', formatCurrencyForPDF(Math.max(0, (individualReportData.report.summary?.totalProjectSalary || 0) + (individualReportData.projectAdjustment || 0)))]
            ] : []),
            // ADD FINE INFORMATION TO THE SUMMARY
            ...(individualReportData.totalFinesAmount > 0 ? [
                ['Total Fines', formatCurrencyForPDF(individualReportData.totalFinesAmount)]
            ] : []),
            ...(deductionView && individualReportData.delayedTasks?.length > 0 ? (() => {
                const reportYear = selectedYear || new Date().getFullYear();
                const totalDeducted = calculateTaskDelayPenalty(individualReportData, reportYear);

                return [
                    ['Task Delay Deduction Applied', 'YES'],
                    ['Permanent Delay Penalty', formatCurrencyForPDF(totalDeducted)],
                    ['Total Final Salary', formatCurrencyForPDF((individualReportData.finalSalaryWithFines || 0) - totalDeducted)]
                ];
            })() : [
                ['Total Final Salary', formatCurrencyForPDF(individualReportData.finalSalaryWithFines || 0)]
            ]),
            ['Total Days in Period', individualReportData.report.summary?.totalDaysInPeriod || 0],
            ['Total Working Days', individualReportData.report.summary?.totalWorkingDaysInPeriod || 0],
            ['Total Absent Days', individualReportData.report.summary?.totalAbsentDays || 0],
            ['Total Leave Days', individualReportData.report.summary?.totalLeaveDays || 0],
            ['Total Holidays', individualReportData.report.summary?.totalHolidaysInPeriod || 0],
            ['Total Sundays', individualReportData.report.summary?.totalSundaysInPeriod || 0],
            ['Actual Working Days', individualReportData.report.summary?.actualWorkingDays || 0],
            ['Total Working Hours', `${Number(individualReportData.report.totalWorkingHours || 0).toFixed(2)} hrs`],
            ['Total Permission Time', `${individualReportData.report.totalPermissionTime || 0} mins`],
            ['Absent Deduction', formatCurrencyForPDF(individualReportData.report.summary?.absentDeduction || 0)],
            ['Leave Deduction', formatCurrencyForPDF(individualReportData.report.summary?.leaveDeduction || 0)],
            ['Permission Deduction', formatCurrencyForPDF(individualReportData.report.summary?.permissionDeduction || 0)],
            ['Attendance Rate', `${Number(individualReportData.report.summary?.attendanceRate || 0).toFixed(2)}%`],
            ['Per Minute Salary', `Rs. ${Number(individualReportData.report.summary?.perMinuteSalary || 0).toFixed(4)}`],
        ];

        // Add bonus information if available
        if (individualReportData.totalBonusAmount > 0) {
            summaryData.push(['Bonus Amount Applied', formatCurrencyForPDF(individualReportData.totalBonusAmount)]);

            // Add details of each bonus
            individualReportData.bonuses.forEach((bonus, index) => {
                summaryData.push([`Bonus Period ${index + 1}`, `${new Date(bonus.fromDate).toLocaleDateString()} to ${new Date(bonus.toDate).toLocaleDateString()}`]);
            });
        }

        // Set font properties to prevent spacing issues
        doc.setFont('helvetica');
        doc.setFontSize(9);

        autoTable(doc, {
            startY: startY + 20,
            head: [['Metric', 'Value']],
            body: summaryData,
            theme: 'striped',
            headStyles: { fillColor: [52, 73, 94] },
            styles: {
                fontSize: 9,
                font: 'helvetica',
                cellPadding: 2
            },
            columnStyles: {
                1: { cellWidth: 50 } // Fixed width for value column
            }
        });

        // Add bonus period details if there are bonuses
        if (individualReportData.totalBonusAmount > 0 && individualReportData.bonuses && individualReportData.bonuses.length > 0) {
            doc.addPage();
            doc.setFontSize(18);
            doc.text('Bonus Details', 14, 20);

            const bonusColumns = ['Period', 'From Date', 'To Date', 'Amount'];
            const bonusRows = individualReportData.bonuses.map((bonus, index) => [
                `Bonus Period ${index + 1}`,
                new Date(bonus.fromDate).toLocaleDateString(),
                new Date(bonus.toDate).toLocaleDateString(),
                formatCurrencyForPDF(bonus.amount)
            ]);

            doc.setFontSize(12);
            autoTable(doc, {
                startY: 30,
                head: [bonusColumns],
                body: bonusRows,
                theme: 'striped',
                headStyles: { fillColor: [52, 73, 94] },
                styles: {
                    fontSize: 9,
                    font: 'helvetica',
                    cellPadding: 2
                }
            });
        }

        // Add detailed fines table if there are fines
        if (individualReportData.worker?.fines && individualReportData.worker.fines.length > 0) {
            const filteredFines = individualReportData.worker.fines.filter(fine => {
                const fineDate = new Date(fine.date);
                const fromDate = new Date(reportDateRange.fromDate);
                const toDate = new Date(reportDateRange.toDate);
                return fineDate >= fromDate && fineDate <= toDate;
            });

            if (filteredFines.length > 0) {
                doc.addPage();
                doc.setFontSize(18);
                doc.text('Fines', 14, 20);

                const finesColumns = ['Date', 'Amount', 'Reason'];
                const finesRows = filteredFines.map(fine => [
                    new Date(fine.date).toLocaleDateString(),
                    formatCurrencyForPDF(fine.amount),
                    fine.reason
                ]);

                doc.setFontSize(12);
                autoTable(doc, {
                    startY: 30,
                    head: [finesColumns],
                    body: finesRows,
                    theme: 'striped',
                    headStyles: { fillColor: [52, 73, 94] },
                    styles: {
                        fontSize: 9,
                        font: 'helvetica',
                        cellPadding: 2
                    }
                });
            }
        }

        doc.addPage();
        doc.setFontSize(18);
        doc.text('Daily Breakdown', 14, 20);
        // Updated table columns to match UI - added Total Salary column
        const tableColumn = [
            'Date', 'Status', 'In Time', 'Out Time',
            'Delay Time', 'Delay Deduction', 'Total Salary'
        ];

        // Fix formatting for daily breakdown table
        // Format Delay Deduction and Total Salary with "Rs" instead of "₹" for PDF
        const tableRows = individualReportData.report.report.map(row => [
            row.date,
            row.status,
            row.inTime,
            row.outTime,
            row.delayTime,
            row.deductionAmount.replace('₹', 'Rs '), // Replace ₹ with Rs for Delay Deduction
            row.totalSalary.replace('₹', 'Rs ') // Replace ₹ with Rs for Total Salary
        ]);

        // Set font properties for daily breakdown table
        doc.setFont('helvetica');
        doc.setFontSize(8);

        autoTable(doc, {
            startY: 30,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [52, 73, 94] },
            styles: {
                fontSize: 8,
                font: 'helvetica',
                cellPadding: 1.5
            },
            columnStyles: {
                5: { cellWidth: 30 }, // Fixed width for delay deduction column
                6: { cellWidth: 30 }  // Fixed width for total salary column
            }
        });
        doc.save(`salary_report_${selectedIndividualWorker.name}.pdf`);
    };

    const columns = [
        {
            header: 'Name',
            accessor: 'name',
            align: 'text-left',
            headerAlign: 'text-left',
            render: (record) => (
                <div className="flex items-center">
                    <WorkerAvatar record={record} />
                    <span className="font-semibold text-slate-800">{record?.name || 'Unknown'}</span>
                </div>
            )
        },
        {
            header: 'Salary',
            accessor: 'salary',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (record) => (
                <span className="font-bold text-slate-700">
                    ₹{(record?.salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            )
        },
        {
            header: 'Salary (this month)',
            accessor: 'finalSalary',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (record) => (
                <span className="font-extrabold text-[#0d9488]">
                    ₹{(record?.finalSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            )
        },
        // ADD NEW COLUMN FOR FINE AMOUNT
        {
            header: 'Fine for this month',
            accessor: 'fineAmount',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (record) => {
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                const fineAmount = calculateMonthlyFines(record, currentMonth, currentYear);
                return fineAmount > 0 ? (
                    <span className="text-rose-600 font-bold">
                        ₹{fineAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                ) : (
                    <span className="text-slate-400">₹0.00</span>
                );
            }
        },
        {
            header: 'Employee ID',
            accessor: 'rfid',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (record) => (
                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100/80">
                    {record?.rfid || 'N/A'}
                </span>
            )
        },
        {
            header: 'Department',
            accessor: 'department',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (record) => {
                if (!record?.department) return <span className="text-slate-400">N/A</span>;
                const deptName = typeof record.department === 'object' ? record.department.name : record.department;
                return (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50/50 text-[#0d9488] border border-teal-100/30 tracking-wider">
                        {deptName}
                    </span>
                );
            }
        },
        {
            header: 'Actions',
            accessor: 'actions',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (worker) => (
                <div className="flex items-center justify-center gap-1">
                    <button
                        onClick={() => openEditModal(worker)}
                        className="p-2 rounded-lg text-[#0d9488] hover:text-[#0f766e] hover:bg-teal-50/50 transition-all duration-150 active:scale-95"
                        title="Give Bonus"
                    >
                        <Coins size={18} />
                    </button>
                    <button
                        onClick={() => handleViewReport(worker)}
                        className="p-2 rounded-lg text-[#0d9488] hover:text-[#0f766e] hover:bg-teal-50/50 transition-all duration-150 active:scale-95"
                        title="View Report"
                    >
                        <Eye size={18} />
                    </button>
                    <button
                        onClick={() => handleDownloadPDF(worker)}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all duration-150 active:scale-95"
                        title="Download PDF"
                    >
                        <FileDown size={18} />
                    </button>
                    <button
                        onClick={() => handleRemoveBonus(worker)}
                        className="p-2 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all duration-150 active:scale-95"
                        title="Remove Bonus"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            )
        }
    ];

    // New: Download individual PDF from bulk list
    const downloadBulkIndividualPDF = (workerId) => {
        const worker = workers.find(w => w._id === workerId);
        if (!worker) return;

        // Since we don't have the full report in bulkReportData currently, 
        // we might need to fetch it or modify generateBulkReport to store it.
        // For now, let's modify generateBulkReport first.
    };

    const downloadBulkSummaryPDF = () => {
        if (bulkReportData.length === 0) {
            toast.error("No report data available to download.");
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;

        // Header
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Consolidated Salary Statement', 14, 25);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth - 1];
        doc.text(`Period: ${monthName} ${selectedYear}`, 14, 33);

        // Summary Stats
        const totalPayout = bulkReportData.reduce((sum, r) => sum + Math.max(0, (r.payableSalary !== undefined ? r.payableSalary : r.totalFinalSalary) - (deductionView ? (r.taskPenalty || 0) : 0)), 0);

        doc.setTextColor(255, 255, 255);
        doc.text(`Total Employees: ${bulkReportData.length}`, pageWidth - 60, 25);
        doc.text(`Total Payout: Rs. ${totalPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, pageWidth - 60, 33);

        let tableColumn, tableRows;

        if (showDetailedBreakdown) {
            tableColumn = ['Employee', 'Attendance Salary', 'Payroll Adjustments', 'Payable Salary'];
            tableRows = bulkReportData.map(r => {
                const activeAdjs = r.payrollRecord?.adjustments?.filter(a => !a.isDeleted) || [];
                const adjsText = activeAdjs.map(a => `${a.type === 'addition' ? '+' : '-'}Rs. ${a.amount} (${a.reason})`).join('\n');
                return [
                    r.name,
                    `Rs. ${(r.attendanceSalary || r.totalFinalSalary).toFixed(2)}`,
                    adjsText || 'None',
                    `Rs. ${(r.payableSalary !== undefined ? r.payableSalary : r.totalFinalSalary).toFixed(2)}`
                ];
            });
        } else {
            tableColumn = ['Employee', 'Department', 'Working', 'Actual Worked', 'Absent', 'Project Adj', 'Net Salary'];
            tableRows = bulkReportData.map(r => [
                r.name,
                r.department,
                `${r.totalWorkingDays} Days`,
                `${r.actualWorkingDays} Days`,
                `${r.totalAbsentDays} Days`,
                r.projectAdjustment ? `${r.projectAdjustment > 0 ? '+' : ''}Rs. ${r.projectAdjustment.toFixed(2)}` : 'Rs. 0.00',
                `Rs. ${Math.max(0, (r.payableSalary !== undefined ? r.payableSalary : r.totalFinalSalary) - (deductionView ? (r.taskPenalty || 0) : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
            ]);
        }

        autoTable(doc, {
            startY: 50,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: showDetailedBreakdown ? {
                1: { halign: 'right' },
                2: { cellWidth: 70 },
                3: { halign: 'right', fontStyle: 'bold' }
            } : {
                5: { halign: 'right' },
                6: { halign: 'right', fontStyle: 'bold' }
            }
        });

        doc.save(`consolidated_salary_report_${monthName}_${selectedYear}.pdf`);
    };

    const downloadAllDetailedReportsPDF = async () => {
        if (bulkReportData.length === 0) {
            toast.error("No reports to download.");
            return;
        }

        const doc = new jsPDF();
        const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth - 1];

        toast.info(`Generating detailed PDF for ${bulkReportData.length} employees...`);

        for (let i = 0; i < bulkReportData.length; i++) {
            const data = bulkReportData[i];
            const reportData = data.fullReport;
            const worker = workers.find(w => w._id === data.workerId);

            if (i > 0) doc.addPage();

            // Reuse the core logic from downloadPDF but adapted for the loop
            const startY = 20;
            doc.setFontSize(18);
            doc.setTextColor(15, 23, 42);
            doc.text(`Salary Report: ${data.name}`, 14, startY);

            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`${monthName} ${selectedYear} | ${data.department}`, 14, startY + 7);

            const formatCurrency = (amt) => `Rs. ${Number(amt || 0).toFixed(2)}`;

            const summaryTable = [
                ['Employee ID', worker?.rfid || 'N/A'],
                ['Base Salary', formatCurrency(reportData.report.summary?.originalSalary)],
                ['Total Deductions', formatCurrency(reportData.report.totalSalaryDeduction)],
                ['Bonus Applied', formatCurrency(reportData.totalBonusAmount)],
                ['Fines Applied', formatCurrency(reportData.totalFinesAmount)],
                ['Task Penalty', formatCurrency(deductionView ? data.taskPenalty : 0)],
                ['Net Payout', formatCurrency(Math.max(0, data.totalFinalSalary - (deductionView ? data.taskPenalty : 0)))]
            ];

            autoTable(doc, {
                startY: startY + 15,
                body: summaryTable,
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
            });

            // Attendance Summary
            const attendanceStats = [
                ['Working Days', reportData.report.summary?.totalWorkingDaysInPeriod, 'Absent Days', reportData.report.summary?.totalAbsentDays],
                ['Leave Days', reportData.report.summary?.totalLeaveDays, 'Attendance Rate', `${reportData.report.summary?.attendanceRate?.toFixed(1)}%`]
            ];

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Attendance Summary', '', '', '']],
                body: attendanceStats,
                theme: 'grid',
                headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 9 },
                styles: { fontSize: 9 }
            });
        }

        doc.save(`detailed_reports_${monthName}_${selectedYear}.pdf`);
        toast.success("Detailed bulk report downloaded!");
    };

    const downloadAllIndividualPDFs = () => {
        if (bulkReportData.length === 0) {
            toast.error("No report data available to download.");
            return;
        }

        toast.info(`Downloading separate PDFs for ${bulkReportData.length} employees...`);
        bulkReportData.forEach((data, index) => {
            const worker = workers.find(w => w._id === data.workerId);
            if (worker && data.fullReport) {
                // Delay each download slightly to prevent browser queue blocking
                setTimeout(() => {
                    generatePDFReport(worker, data.fullReport, reportDateRange.fromDate);
                }, index * 300);
            }
        });
        toast.success("Separate PDF downloads triggered!");
    };

    // ── NEW: Merge all employees into a SINGLE PDF ──────────────────────────
    const downloadAllAsSinglePDF = () => {
        if (bulkReportData.length === 0) {
            toast.error("No report data available to download.");
            return;
        }

        const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May',
            'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = MONTH_NAMES[selectedMonth - 1];

        const formatCurrencyForPDF = (amount) => {
            if (typeof amount === 'string') {
                const numericValue = parseFloat(amount.replace(/[₹Rs,\s]/g, ''));
                return isNaN(numericValue) ? 'Rs. 0.00' : `Rs. ${numericValue.toFixed(2)}`;
            }
            return `Rs. ${Number(amount).toFixed(2)}`;
        };

        const doc = new jsPDF();
        let isFirstEmployee = true;

        const validReports = bulkReportData.filter(data => {
            const worker = workers.find(w => w._id === data.workerId);
            return worker && data.fullReport;
        });

        if (validReports.length === 0) {
            toast.error("No detailed report data found. Please regenerate the report.");
            return;
        }

        toast.info(`Building single PDF for ${validReports.length} employees...`);

        validReports.forEach((data, empIndex) => {
            const worker = workers.find(w => w._id === data.workerId);
            const reportObj = data.fullReport;

            // ── Page separator (except first employee) ──
            if (!isFirstEmployee) {
                doc.addPage();
            }
            isFirstEmployee = false;

            // ── Employee header ──
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.setFillColor(52, 73, 94);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(`${empIndex + 1}. Salary Report — ${worker.name}`, 14, 12);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`${monthName} ${selectedYear}  |  Dept: ${data.department || '—'}  |  ID: ${worker.rfid || '—'}`, 14, 16);
            doc.setTextColor(0, 0, 0);

            const startY = 25;

            // ── Summary table ──
            const summaryData = [
                ['Employee Name', worker?.name],
                ['Employee ID', worker?.rfid],
                ['Monthly Base Salary', formatCurrencyForPDF(reportObj.report.summary?.originalSalary || 0)],
                ['Base Salary (SaaS Only)', formatCurrencyForPDF(reportObj.report.summary?.expectedSaaSSalary || reportObj.report.summary?.originalSalary || 0)],
                ['Total Deductions', formatCurrencyForPDF(reportObj.report.totalSalaryDeduction || 0)],
                ['Net Base Salary', formatCurrencyForPDF(reportObj.report.summary?.netBaseSalary || 0)],
                ['Project Earnings', formatCurrencyForPDF(reportObj.report.summary?.totalProjectSalary || 0)],
                ...(reportObj.projectAdjustment && reportObj.projectAdjustment !== 0 ? [
                    ['Project Adjustment', `${reportObj.projectAdjustment > 0 ? '+' : ''}${formatCurrencyForPDF(reportObj.projectAdjustment)}`],
                    ['Final Project Pay', formatCurrencyForPDF(Math.max(0, (reportObj.report.summary?.totalProjectSalary || 0) + (reportObj.projectAdjustment || 0)))]
                ] : []),
                ...(reportObj.totalFinesAmount > 0 ? [['Total Fines', formatCurrencyForPDF(reportObj.totalFinesAmount)]] : []),
                ...(deductionView && reportObj.delayedTasks?.length > 0 ? (() => {
                    const reportYear = reportDateRange.fromDate ? new Date(reportDateRange.fromDate).getFullYear() : new Date().getFullYear();
                    const totalDeducted = calculateTaskDelayPenalty(reportObj, reportYear);
                    return [
                        ['Task Delay Deduction Applied', 'YES'],
                        ['Permanent Delay Penalty', formatCurrencyForPDF(totalDeducted)],
                        ['Total Final Salary', formatCurrencyForPDF((reportObj.finalSalaryWithFines || 0) - totalDeducted)]
                    ];
                })() : [['Total Final Salary', formatCurrencyForPDF(reportObj.finalSalaryWithFines || 0)]]),
                ['Total Days in Period', reportObj.report.summary?.totalDaysInPeriod || 0],
                ['Total Working Days', reportObj.report.summary?.totalWorkingDaysInPeriod || 0],
                ['Total Absent Days', reportObj.report.summary?.totalAbsentDays || 0],
                ['Total Leave Days', reportObj.report.summary?.totalLeaveDays || 0],
                ['Total Holidays', reportObj.report.summary?.totalHolidaysInPeriod || 0],
                ['Total Sundays', reportObj.report.summary?.totalSundaysInPeriod || 0],
                ['Actual Working Days', reportObj.report.summary?.actualWorkingDays || 0],
                ['Total Working Hours', `${Number(reportObj.report.totalWorkingHours || 0).toFixed(2)} hrs`],
                ['Total Permission Time', `${reportObj.report.totalPermissionTime || 0} mins`],
                ['Absent Deduction', formatCurrencyForPDF(reportObj.report.summary?.absentDeduction || 0)],
                ['Leave Deduction', formatCurrencyForPDF(reportObj.report.summary?.leaveDeduction || 0)],
                ['Permission Deduction', formatCurrencyForPDF(reportObj.report.summary?.permissionDeduction || 0)],
                ['Attendance Rate', `${Number(reportObj.report.summary?.attendanceRate || 0).toFixed(2)}%`],
                ['Per Minute Salary', `Rs. ${Number(reportObj.report.summary?.perMinuteSalary || 0).toFixed(4)}`],
            ];

            if (reportObj.totalBonusAmount > 0) {
                summaryData.push(['Bonus Amount Applied', formatCurrencyForPDF(reportObj.totalBonusAmount)]);
                (reportObj.bonuses || []).forEach((bonus, i) => {
                    summaryData.push([`Bonus Period ${i + 1}`, `${new Date(bonus.fromDate).toLocaleDateString()} to ${new Date(bonus.toDate).toLocaleDateString()}`]);
                });
            }

            autoTable(doc, {
                startY,
                head: [['Metric', 'Value']],
                body: summaryData,
                theme: 'striped',
                headStyles: { fillColor: [52, 73, 94] },
                styles: { fontSize: 8, font: 'helvetica', cellPadding: 2 },
                columnStyles: { 1: { cellWidth: 50 } }
            });

            // ── Fines table ──
            if (reportObj.worker?.fines && reportObj.worker.fines.length > 0) {
                const filteredFines = reportObj.worker.fines.filter(fine => {
                    const fineDate = new Date(fine.date);
                    const from = new Date(reportDateRange.fromDate);
                    const to = new Date(reportDateRange.toDate);
                    return fineDate >= from && fineDate <= to;
                });
                if (filteredFines.length > 0) {
                    doc.addPage();
                    doc.setFontSize(13);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Fines — ${worker.name}`, 14, 20);
                    autoTable(doc, {
                        startY: 28,
                        head: [['Date', 'Amount', 'Reason']],
                        body: filteredFines.map(f => [
                            new Date(f.date).toLocaleDateString(),
                            formatCurrencyForPDF(f.amount),
                            f.reason
                        ]),
                        theme: 'striped',
                        headStyles: { fillColor: [52, 73, 94] },
                        styles: { fontSize: 8, font: 'helvetica', cellPadding: 2 }
                    });
                }
            }

            // ── Daily breakdown ──
            doc.addPage();
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(`Daily Breakdown — ${worker.name}`, 14, 20);
            autoTable(doc, {
                startY: 28,
                head: [['Date', 'Status', 'In Time', 'Out Time', 'Delay Time', 'Delay Deduction', 'Total Salary']],
                body: (reportObj.report.report || []).map(row => [
                    row.date, row.status, row.inTime, row.outTime, row.delayTime,
                    row.deductionAmount.replace('₹', 'Rs '),
                    row.totalSalary.replace('₹', 'Rs ')
                ]),
                theme: 'striped',
                headStyles: { fillColor: [52, 73, 94] },
                styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.5 },
                columnStyles: { 5: { cellWidth: 28 }, 6: { cellWidth: 28 } }
            });
        });

        doc.save(`all_employees_salary_report_${monthName}_${selectedYear}.pdf`);
        toast.success(`✅ Single PDF downloaded with ${validReports.length} employees!`);
    };

    const downloadBankStatementXLSX = async () => {
        if (bulkReportData.length === 0) {
            toast.error('No report data available to export.');
            return;
        }

        const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = MONTH_NAMES[selectedMonth - 1];
        const monthShort = MONTH_SHORT[selectedMonth - 1];

        // PYMT_DATE as DD-MM-YYYY
        const today = new Date();
        const paymentDate = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear()
        ].join('-');

        // Exact NEFT upload header row
        const HEADERS = [
            'PYMT_PROD_TYPE_CODE', 'PYMT_MODE', 'DEBIT_ACC_NO', 'BNF_NAME',
            'BENE_ACC_NO', 'BENE_IFSC', 'AMOUNT', 'CREDIT_NARR',
            'PYMT_DATE', 'MOBILE_NUM', 'EMAIL_ID', 'REMARK', 'REF_NO'
        ];

        const COL_WIDTHS = [20, 10, 22, 28, 22, 14, 12, 18, 14, 14, 30, 14, 22];

        // Build data rows
        const dataRows = bulkReportData.map((report, index) => {
            const worker = workers.find(w => w._id === report.workerId);
            const finalSalary = Math.max(0, report.totalFinalSalary - (deductionView ? (report.taskPenalty || 0) : 0));
            const refNo = `SAL${selectedYear}${String(selectedMonth).padStart(2, '0')}${String(index + 1).padStart(4, '0')}`;
            return [
                'PAB_VENDOR',
                'NEFT',
                '612805036053',
                worker?.bankDetails?.accountHolderName || worker?.name || '',
                worker?.bankDetails?.accountNumber || '',
                worker?.bankDetails?.ifscCode || '',
                parseFloat(finalSalary.toFixed(2)),
                `${monthName} Salary`,
                paymentDate,
                worker?.phoneNumber || '',
                worker?.email || '',
                '',
                refNo
            ];
        });

        // Build workbook with ExcelJS for full styling support
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CipherGate Payroll';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(`${monthShort}_${selectedYear}`);

        // Set column widths
        sheet.columns = HEADERS.map((key, i) => ({ key, width: COL_WIDTHS[i] }));

        // Thin black border helper
        const thinBorder = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Header row — red bold centered text, thin borders, no fill
        const headerRow = sheet.addRow(HEADERS);
        headerRow.height = 20;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFF0000' }, size: 10, name: 'Calibri' };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder;
        });

        // Data rows — normal text, left aligned, thin borders
        dataRows.forEach(rowValues => {
            const row = sheet.addRow(rowValues);
            row.height = 18;
            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                cell.font = { size: 10, name: 'Calibri' };
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
                cell.border = thinBorder;
                // Keep AMOUNT column as numeric
                if (colNum === 7 && typeof cell.value === 'number') {
                    cell.numFmt = '#,##0.00';
                }
            });
        });

        // Hide unused columns (N to Z) to make it look clean
        for (let i = 14; i <= 26; i++) {
            const col = sheet.getColumn(i);
            if (col) col.hidden = true;
        }

        // Hide a few rows after the data to prevent showing empty rows in some viewers
        const startRow = dataRows.length + 2;
        for (let i = startRow; i <= startRow + 50; i++) {
            const row = sheet.getRow(i);
            if (row) row.hidden = true;
        }

        // Export
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Bank_Statement_NEFT_${monthName}_${selectedYear}.xlsx`);
        toast.success(`Bank Statement XLSX downloaded for ${monthName} ${selectedYear}!`);
    };

    const downloadGeneralXLSX = () => {
        if (bulkReportData.length === 0) {
            toast.error("No report data available to export.");
            return;
        }

        const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth - 1];

        let headers, rows;

        if (showDetailedBreakdown) {
            headers = ['Employee', 'Attendance Salary', 'Payroll Adjustments', 'Final Payable Salary'];
            rows = bulkReportData.map(report => {
                const activeAdjs = report.payrollRecord?.adjustments?.filter(a => !a.isDeleted) || [];
                const adjsText = activeAdjs.map(a => `${a.type === 'addition' ? '+' : '-'}Rs. ${a.amount} (${a.category} - ${a.reason})`).join('; ');
                return [
                    report.name,
                    (report.attendanceSalary || report.totalFinalSalary).toFixed(2),
                    adjsText || 'None',
                    (report.payableSalary !== undefined ? report.payableSalary : report.totalFinalSalary).toFixed(2)
                ];
            });
        } else {
            headers = [
                'Employee', 'Department', 'Working Days', 'Actual Worked', 'Absent Days', 'Project Adj', 'Final Salary',
                'Bank Status'
            ];

            rows = bulkReportData.map(report => {
                const worker = workers.find(w => w._id === report.workerId);
                const hasBankDetails = worker?.bankDetails?.accountNumber && worker?.bankDetails?.ifscCode;
                const finalSalary = Math.max(0, (report.payableSalary !== undefined ? report.payableSalary : report.totalFinalSalary) - (deductionView ? (report.taskPenalty || 0) : 0));

                return [
                    report.name,
                    report.department,
                    report.totalWorkingDays,
                    report.actualWorkingDays,
                    report.totalAbsentDays,
                    (report.projectAdjustment || 0).toFixed(2),
                    finalSalary.toFixed(2),
                    hasBankDetails ? 'Added' : 'Pending'
                ];
            });
        }

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');

        XLSX.writeFile(wb, `Salary_Report_${monthName}_${selectedYear}.xlsx`);
        toast.success("Salary report XLSX downloaded!");
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Payroll Overview</h1>
                    <p className="text-sm text-slate-500 mt-1">Manage employee base pay, bonuses, and fines</p>
                </div>

                {/* Header Actions */}
                <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2.5 w-full md:w-auto">
                    <button
                        className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold transition-all duration-150 active:scale-95 flex justify-center items-center gap-1.5 text-xs shadow-sm whitespace-nowrap"
                        onClick={openBulkReportModal}
                    >
                        <List size={14} className="text-slate-400" /> View Reports
                    </button>
                    <button
                        className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold transition-all duration-150 active:scale-95 flex justify-center items-center gap-1.5 text-xs shadow-sm whitespace-nowrap"
                        onClick={() => setIsFineModalOpen(true)}
                    >
                        <Coins size={14} className="text-slate-400" /> Fine
                    </button>
                    <button
                        className={`px-3 py-2 border rounded-xl font-bold transition-all duration-150 active:scale-95 flex justify-center items-center gap-1.5 text-xs shadow-sm whitespace-nowrap ${isFineFilterOpen ? 'border-teal-200 bg-teal-50 text-teal-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}
                        onClick={() => {
                            const nextState = !isFineFilterOpen;
                            setIsFineFilterOpen(nextState);
                            if (nextState) {
                                fetchFinesData();
                            }
                        }}
                    >
                        <Sliders size={14} className={isFineFilterOpen ? 'text-teal-600' : 'text-slate-400'} /> Fine History
                    </button>
                    <button
                        className="px-3 py-2 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100/50 rounded-xl font-bold transition-all duration-150 active:scale-95 flex justify-center items-center gap-1.5 text-xs shadow-sm whitespace-nowrap"
                        onClick={handleSalaryReset}
                    >
                        <RefreshCw size={14} className="text-rose-500" /> Reset Salary
                    </button>
                </div>
            </div>
            {/* FINE FILTER PANEL */}
            {isFineFilterOpen && (
                <Card className="mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-black text-slate-800 tracking-widest">Fine History & Filter</h3>
                        <button
                            onClick={() => setIsFineFilterOpen(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
                            title="Close Fine History"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                        <form onSubmit={handleFineFilterSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Month</label>
                                    <select
                                        value={selectedFineMonth}
                                        onChange={(e) => setSelectedFineMonth(e.target.value)}
                                        className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm w-full"
                                    >
                                        <option value="">All Months</option>
                                        <option value={1}>January</option>
                                        <option value={2}>February</option>
                                        <option value={3}>March</option>
                                        <option value={4}>April</option>
                                        <option value={5}>May</option>
                                        <option value={6}>June</option>
                                        <option value={7}>July</option>
                                        <option value={8}>August</option>
                                        <option value={9}>September</option>
                                        <option value={10}>October</option>
                                        <option value={11}>November</option>
                                        <option value={12}>December</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Year</label>
                                    <select
                                        value={selectedFineYear}
                                        onChange={(e) => setSelectedFineYear(e.target.value)}
                                        className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm w-full"
                                    >
                                        <option value="">All Years</option>
                                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="submit"
                                        className="btn btn-primary w-full text-xs py-2.5 rounded-xl font-bold tracking-wider active:scale-95 shadow-md shadow-teal-500/10"
                                        disabled={isLoadingFines}
                                    >
                                        {isLoadingFines ? 'Loading...' : 'Apply Filter'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {finesData.length > 0 && (
                            <div className="mt-6 border-t border-slate-100 pt-4">
                                <h4 className="text-[10px] font-black text-slate-400 tracking-widest mb-3">Fines Summary</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-0.5">Total Fines</p>
                                        <p className="text-xl font-black text-slate-700">{finesData.length}</p>
                                    </div>
                                    <div className="bg-rose-50/30 border border-rose-100/50 rounded-2xl p-4 shadow-sm">
                                        <p className="text-[10px] font-black text-rose-400 tracking-widest mb-0.5">Total Amount</p>
                                        <p className="text-xl font-black text-rose-600">
                                            ₹{finesData.reduce((sum, fine) => sum + fine.amount, 0).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-0.5">Unique Workers</p>
                                        <p className="text-xl font-black text-slate-700">
                                            {[...new Set(finesData.map(fine => fine.workerId))].length}
                                        </p>
                                    </div>
                                </div>

                                <h4 className="text-md font-medium mb-2">Recent Fines</h4>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">Employee</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">Amount</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">Reason</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {finesData.slice(0, 5).map((fine) => (
                                                <tr key={`${fine.workerId}-${fine._id}`}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            {fine.photo && (
                                                                <img
                                                                    src={fine.photo
                                                                        ? fine.photo
                                                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(fine.workerName)}`}
                                                                    alt="Employee"
                                                                    className="w-8 h-8 rounded-full mr-2"
                                                                />
                                                            )}
                                                            <div>
                                                                <div className="font-medium">{fine.workerName}</div>
                                                                <div className="text-sm text-gray-500">{fine.employeeId}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {new Date(fine.date).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-red-600 font-medium">
                                                        ₹{fine.amount.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {fine.reason}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button
                                                            onClick={() => handleDeleteFine(fine.workerId, fine._id)}
                                                            className="text-red-600 hover:text-red-900"
                                                            title="Delete Fine"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {finesData.length > 5 && (
                                    <p className="text-sm text-gray-500 mt-2">Showing first 5 of {finesData.length} fines</p>
                                )}
                            </div>
                        )}

                        {finesData.length === 0 && !isLoadingFines && (
                            <p className="text-gray-500 text-center py-4">No fines found for the selected criteria.</p>
                        )}
                    </div>
                </Card>
            )}
            <Card>
                <div className="flex flex-col gap-4 mb-4">
                    {/* Search & Toggle Row */}
                    <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="relative flex-1 w-full">
                            <input
                                type="text"
                                className="form-input pl-10 pr-10 py-2.5 w-full rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                                placeholder="Search by name, employee ID, or department..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto flex-none justify-end">
                            <button
                                type="button"
                                onClick={() => setIsSalaryFilterOpen(!isSalaryFilterOpen)}
                                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-xs transition-all duration-200 active:scale-95 w-full md:w-auto shadow-sm ${isSalaryFilterOpen ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}
                            >
                                <Sliders size={14} className="text-slate-500" />
                                <span>Filters</span>
                                {getActiveFilterCount() > 0 && (
                                    <span className="flex-none flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-black leading-none">
                                        {getActiveFilterCount()}
                                    </span>
                                )}
                                {isSalaryFilterOpen ? <ChevronUp size={14} className="ml-1 text-slate-500" /> : <ChevronDown size={14} className="ml-1 text-slate-500" />}
                            </button>

                            {getActiveFilterCount() > 0 && (
                                <button
                                    type="button"
                                    onClick={resetSalaryFilters}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-all font-bold text-xs active:scale-95 shadow-sm"
                                    title="Reset All Filters"
                                >
                                    <X size={14} />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Collapsible Advanced Filters Panel */}
                    <AnimatePresence>
                        {isSalaryFilterOpen && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="overflow-hidden bg-slate-50/50 border border-slate-100 rounded-2xl p-4 md:p-5"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {/* Department */}
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Department</label>
                                        <select
                                            value={filterDepartment}
                                            onChange={(e) => setFilterDepartment(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm"
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map(dept => (
                                                <option key={dept._id} value={dept._id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Fine Status */}
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Fine Status (This Month)</label>
                                        <select
                                            value={filterFineStatus}
                                            onChange={(e) => setFilterFineStatus(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm"
                                        >
                                            <option value="All">All Workers</option>
                                            <option value="Has Fines">Has Fines</option>
                                            <option value="No Fines">No Fines</option>
                                        </select>
                                    </div>

                                    {/* Bank Status */}
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Bank Details</label>
                                        <select
                                            value={filterBankStatus}
                                            onChange={(e) => setFilterBankStatus(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm"
                                        >
                                            <option value="All">All Workers</option>
                                            <option value="Added">Bank Details Added</option>
                                            <option value="Pending">Bank Details Pending</option>
                                        </select>
                                    </div>

                                    {/* Sort By */}
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Sort By</label>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold cursor-pointer shadow-sm"
                                        >
                                            <option value="">Default Order</option>
                                            <option value="name-asc">Name (A - Z)</option>
                                            <option value="name-desc">Name (Z - A)</option>
                                            <option value="salary-desc">Base Salary (High to Low)</option>
                                            <option value="salary-asc">Base Salary (Low to High)</option>
                                            <option value="final-desc">Net Salary (High to Low)</option>
                                            <option value="final-asc">Net Salary (Low to High)</option>
                                            <option value="fine-desc">Fines Amount (High to Low)</option>
                                        </select>
                                    </div>

                                    {/* Min Salary */}
                                    <div className="flex flex-col sm:col-span-2 md:col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Min Base Salary (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="Min Salary"
                                            value={filterMinSalary}
                                            onChange={(e) => setFilterMinSalary(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold shadow-sm"
                                        />
                                    </div>

                                    {/* Max Salary */}
                                    <div className="flex flex-col sm:col-span-2 md:col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Max Base Salary (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="Max Salary"
                                            value={filterMaxSalary}
                                            onChange={(e) => setFilterMaxSalary(e.target.value)}
                                            className="form-input bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700 font-bold shadow-sm"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <>
                        <Table
                            columns={columns}
                            data={reports}
                            noDataMessage="No employees found."
                        />
                        {isFetchingNextPage && (
                            <div className="flex justify-center py-4">
                                <Spinner size="sm" />
                                <span className="text-xs text-slate-500 font-medium ml-2">Loading more employees...</span>
                            </div>
                        )}
                        <div ref={sentinelRef} id="infinite-scroll-sentinel" className="h-4 w-full" />
                    </>
                )}
            </Card>
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={'Give Bonus Amount'}
            >
                <form onSubmit={handleEditWorker}>
                    <div className="form-group">
                        <label htmlFor="bonus" className="form-label">Bonus Amount</label>
                        <input
                            type="text"
                            id="bonus"
                            name="bonus"
                            className="form-input"
                            value={formData.bonus}
                            onChange={handleChange}
                            required
                            pattern="^\d*\.?\d*$"
                            title="Please enter a valid number (e.g., 100 or 50.50)"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="fromDate" className="form-label">From Date</label>
                        <input
                            type="date"
                            id="fromDate"
                            name="fromDate"
                            className="form-input"
                            value={formData.fromDate}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="toDate" className="form-label">To Date</label>
                        <input
                            type="date"
                            id="toDate"
                            name="toDate"
                            className="form-input"
                            value={formData.toDate}
                            onChange={handleChange}
                            required
                        />
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
                            Update Salary
                        </Button>
                    </div>
                </form>
            </Modal>
            {/* ADD FINE MODAL */}
            <AddFineModal
                isOpen={isFineModalOpen}
                onClose={() => setIsFineModalOpen(false)}
                preloadedWorkers={workers}
                onFineAdded={() => { loadData(); fetchReports(1, true); }}
            />

            {/* PAYROLL ADJUSTMENT MODAL */}
            <PayrollAdjustmentModal
                isOpen={isAdjustmentModalOpen}
                onClose={() => setIsAdjustmentModalOpen(false)}
                bulkReportData={bulkReportData}
                month={selectedMonth}
                year={selectedYear}
                subdomain={subdomain || ''}
                deductionView={deductionView}
                onAdjustmentSaved={() => {
                    // Re-fetch bulk report to pick up latest adjustments
                    if (bulkReportData && bulkReportData.length > 0) {
                        const formatLocal = (d) => {
                            let m = '' + (d.getMonth() + 1); let day = '' + d.getDate();
                            if (m.length < 2) m = '0' + m; if (day.length < 2) day = '0' + day;
                            return [d.getFullYear(), m, day].join('-');
                        };
                        const fromDate = formatLocal(new Date(selectedYear, selectedMonth - 1, 1));
                        const toDate = formatLocal(new Date(selectedYear, selectedMonth, 0));
                        const currentWorkerIds = bulkReportData.map(w => w.workerId);
                        setIsBulkReportLoading(true);
                        getBulkSalaryReport(subdomain, fromDate, toDate, { isExport: true, month: selectedMonth, year: selectedYear, _t: Date.now() })
                            .then(data => {
                                const filtered = (data.reports || []).filter(r => currentWorkerIds.includes(r.workerId));
                                setBulkReportData(filtered);
                                setIsBulkReportLoading(false);
                            })
                            .catch(() => setIsBulkReportLoading(false));
                    }
                }}
            />

            {/* BULK REPORT — FULL PAGE OVERLAY */}
            <AnimatePresence>
                {isBulkReportModalOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 30, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                        className="fixed inset-0 z-[999] bg-gradient-to-br from-slate-50 via-white to-slate-50 flex flex-col"
                        style={{ willChange: 'transform, opacity' }}
                    >
                        {/* ── Sticky Header ── */}
                        <div className="flex-none bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 md:px-8 py-4 flex items-center justify-between shadow-sm gap-4">
                            {/* Left: Back + Title */}
                            <div className="flex items-center gap-4 min-w-0">
                                <button
                                    onClick={() => { setIsBulkReportModalOpen(false); setBulkReportData([]); }}
                                    className="w-10 h-10 flex-none flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all active:scale-90"
                                >
                                    <ChevronLeft size={13} />
                                </button>
                                <div className="min-w-0">
                                    <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Bulk Salary Reports</h1>
                                    <p className="text-[10px] font-black text-slate-400 tracking-widest">Payroll Overview</p>
                                </div>
                            </div>

                            {/* Right: Month/Year + Generate */}
                            <div className="flex items-center gap-3 flex-none">
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl">
                                    <Calendar size={12} className="text-teal-500 flex-none" />
                                    <select
                                        value={selectedMonth}
                                        onChange={handleMonthChange}
                                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer"
                                    >
                                        <option value={1}>January</option>
                                        <option value={2}>February</option>
                                        <option value={3}>March</option>
                                        <option value={4}>April</option>
                                        <option value={5}>May</option>
                                        <option value={6}>June</option>
                                        <option value={7}>July</option>
                                        <option value={8}>August</option>
                                        <option value={9}>September</option>
                                        <option value={10}>October</option>
                                        <option value={11}>November</option>
                                        <option value={12}>December</option>
                                    </select>
                                    <select
                                        value={selectedYear}
                                        onChange={handleYearChange}
                                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer"
                                    >
                                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                <Button
                                    variant="primary"
                                    onClick={generateBulkReport}
                                    disabled={isBulkReportLoading || selectedWorkersForReport.length === 0}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl shadow-lg shadow-teal-500/20 text-sm"
                                >
                                    {isBulkReportLoading ? 'Generating...' : (
                                        <>
                                            <RefreshCw size={13} className={isBulkReportLoading ? 'animate-spin' : ''} />
                                            <span>Generate · {selectedWorkersForReport.length}</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* ── Body: Sidebar + Content ── */}
                        <div className="flex-1 flex overflow-hidden min-h-0">

                            {/* Left Sidebar — Employee Selection */}
                            <div className="w-64 md:w-72 flex-none border-r border-slate-100 flex flex-col bg-white/60 min-h-0">
                                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-none">
                                    <p className="text-[10px] font-black text-slate-400 tracking-widest">
                                        {selectedWorkersForReport.length > 0 ? `${selectedWorkersForReport.length} Selected` : 'Employees'}
                                    </p>
                                    <button
                                        onClick={toggleAllWorkersSelection}
                                        className="text-[10px] font-black text-teal-600 tracking-widest hover:text-teal-700 transition-colors"
                                    >
                                        {selectedWorkersForReport.length === bulkFilteredWorkers.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>

                                {/* Filters Section */}
                                <div className="p-3 border-b border-slate-100 space-y-2 flex-none">
                                    {/* Search */}
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search employee..."
                                            value={bulkSearchTerm}
                                            onChange={(e) => setBulkSearchTerm(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                        />
                                        <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    </div>

                                    {/* Department Filter */}
                                    <select
                                        value={bulkDepartmentFilter}
                                        onChange={(e) => setBulkDepartmentFilter(e.target.value)}
                                        className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-600"
                                    >
                                        <option value="All">All Departments</option>
                                        {departments.map(dept => (
                                            <option key={dept._id} value={dept._id}>{dept.name}</option>
                                        ))}
                                    </select>

                                    {/* Attendance Filter */}
                                    <select
                                        value={bulkAttendanceFilter}
                                        onChange={(e) => setBulkAttendanceFilter(e.target.value)}
                                        className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-600"
                                    >
                                        <option value="All">All Attendance</option>
                                        <option value="Present">Present Today</option>
                                        <option value="Absent">Absent Today</option>
                                    </select>
                                </div>

                                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar min-h-0">
                                    {bulkFilteredWorkers.map(worker => (
                                        <label
                                            key={worker._id}
                                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group ${selectedWorkersForReport.includes(worker._id) ? 'bg-teal-50 border-teal-200 shadow-sm' : 'bg-transparent border-slate-100 hover:border-slate-200 hover:bg-slate-50/60'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="relative flex-none">
                                                    <img
                                                        src={worker.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}&background=f1f5f9&color=64748b`}
                                                        alt=""
                                                        className="w-8 h-8 rounded-xl object-cover border border-slate-100"
                                                    />
                                                    {selectedWorkersForReport.includes(worker._id) && (
                                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full border-2 border-white" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{worker.name}</p>
                                                    <p className="text-[9px] font-bold text-slate-400 tracking-tight truncate">{worker.department?.name || worker.department}</p>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={selectedWorkersForReport.includes(worker._id)}
                                                onChange={() => toggleWorkerSelection(worker._id)}
                                            />
                                            <div className={`w-5 h-5 rounded-lg border-2 flex-none flex items-center justify-center transition-colors ${selectedWorkersForReport.includes(worker._id) ? 'bg-teal-500 border-teal-500' : 'border-slate-200 group-hover:border-teal-200'}`}>
                                                {selectedWorkersForReport.includes(worker._id) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Right Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">

                                {/* Empty state */}
                                {!bulkReportData.length && !isBulkReportLoading && (
                                    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-20">
                                        <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-5">
                                            <FileText size={32} className="text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-400 mb-1">No Report Generated Yet</h3>
                                        <p className="text-xs font-bold text-slate-300 tracking-widest">Select employees on the left, then click Generate</p>
                                    </div>
                                )}

                                {isBulkReportLoading && bulkReportData.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-slate-50/50 m-4 rounded-3xl border border-slate-100">
                                        <p className="mt-4 text-sm font-bold text-slate-500 tracking-wide">Loading bulk report...</p>
                                    </div>
                                ) : null}

                                {/* Report Data */}
                                <AnimatePresence>
                                    {bulkReportData.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.05 }}
                                            className="p-6 md:p-8 space-y-8"
                                        >
                                            {/* Stats Cards */}
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                                <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
                                                    <p className="text-[10px] font-black text-emerald-600 tracking-widest mb-1">Total Net Payout</p>
                                                    <p className="text-2xl font-black text-emerald-700">
                                                        ₹{bulkReportData.reduce((sum, r) => sum + Math.max(0, r.totalFinalSalary - (deductionView ? (r.taskPenalty || 0) : 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 shadow-sm">
                                                    <p className="text-[10px] font-black text-slate-500 tracking-widest mb-1">Total Workers</p>
                                                    <p className="text-2xl font-black text-slate-700">{bulkReportData.length}</p>
                                                </div>
                                                <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 shadow-sm">
                                                    <p className="text-[10px] font-black text-rose-500 tracking-widest mb-1">Avg Attendance</p>
                                                    <p className="text-2xl font-black text-rose-700">
                                                        {(bulkReportData.reduce((sum, r) => sum + (r.totalWorkingDays / (r.totalWorkingDays + r.totalAbsentDays || 1)), 0) / bulkReportData.length * 100).toFixed(1)}%
                                                    </p>
                                                </div>
                                                <div className="bg-violet-50 border border-violet-100 rounded-3xl p-6 shadow-sm">
                                                    <p className="text-[10px] font-black text-violet-600 tracking-widest mb-1">Avg Salary / Worker</p>
                                                    <p className="text-2xl font-black text-violet-700">
                                                        ₹{bulkReportData.length > 0 ? (bulkReportData.reduce((sum, r) => sum + Math.max(0, r.totalFinalSalary - (deductionView ? (r.taskPenalty || 0) : 0)), 0) / bulkReportData.length).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Report Summary Header */}
                                            <div className="flex items-center justify-between flex-wrap gap-3">
                                                <h4 className="text-sm font-black text-slate-900 tracking-widest">Report Summary</h4>

                                                <div className="flex items-center gap-2">
                                                    {bulkReportData && bulkReportData.length > 0 && (
                                                        <label className="flex items-center gap-2 cursor-pointer text-[10px] font-black tracking-widest text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm hover:bg-slate-50 transition-all select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={showDetailedBreakdown}
                                                                onChange={(e) => setShowDetailedBreakdown(e.target.checked)}
                                                                className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-gray-300"
                                                            />
                                                            <span>Salary Breakdown</span>
                                                        </label>
                                                    )}

                                                    {/* Payroll Adjustments Button */}
                                                    {bulkReportData && bulkReportData.length > 0 && (
                                                        <button
                                                            onClick={() => setIsAdjustmentModalOpen(true)}
                                                            className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all text-[10px] font-black tracking-widest shadow-lg shadow-indigo-200"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                                            <span>Payroll Adjustments</span>
                                                        </button>
                                                    )}

                                                    {/* Export Dropdown */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                                                            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 text-white hover:bg-teal-700 transition-all text-[10px] font-black tracking-widest shadow-lg shadow-teal-200"
                                                        >
                                                            <span>Export Reports</span>
                                                            <svg className={`w-3 h-3 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                                        </button>

                                                        {isExportDropdownOpen && (
                                                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 z-[1000] overflow-hidden">
                                                                <div className="py-2">
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadGeneralXLSX(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                                                        Export XLSX
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadBulkSummaryPDF(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                                                        Export Consolidated PDF
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadAllDetailedReportsPDF(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 012-2h10a2 2 0 012 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                                                        Consolidated Detailed PDF
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadAllIndividualPDFs(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                                                        Download Separate PDFs
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadAllAsSinglePDF(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                                                        All Employees — Single PDF
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setIsExportDropdownOpen(false); downloadBankStatementXLSX(); }}
                                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                                    >
                                                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                                                                        Bank Statement XLSX
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Table */}
                                            <div className="rounded-[2rem] border border-slate-100 overflow-hidden bg-white shadow-xl shadow-slate-200/40">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                                                        <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                                                            <tr>
                                                                {showDetailedBreakdown ? (
                                                                    ['Employee', 'Attendance Salary', 'Payroll Adjustments', 'Final Payable Salary', 'Actions'].map(h => (
                                                                        <th key={h} className="px-4 py-4 text-left font-black text-slate-400 tracking-widest border-b border-slate-100 text-[10px]">{h}</th>
                                                                    ))
                                                                ) : (
                                                                    ['Employee', 'Department', 'Working Days', 'Actual Worked', 'Absent Days', 'Final Salary', 'Bank Status', 'Actions'].map(h => (
                                                                        <th key={h} className="px-4 py-4 text-left font-black text-slate-400 tracking-widest border-b border-slate-100 text-[10px]">{h}</th>
                                                                    ))
                                                                )}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {bulkReportData.map((report, index) => {
                                                                const worker = workers.find(w => w._id === report.workerId);
                                                                const hasBankDetails = worker?.bankDetails?.accountNumber && worker?.bankDetails?.ifscCode;

                                                                return (
                                                                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                                                        {showDetailedBreakdown ? (
                                                                            <>
                                                                                <td className="px-4 py-4">
                                                                                    <p className="font-bold text-slate-700">{report.name}</p>
                                                                                </td>
                                                                                <td className="px-4 py-4 font-bold text-slate-600">
                                                                                    ₹{((report.attendanceSalary || report.totalFinalSalary) - (deductionView ? (report.taskPenalty || 0) : 0)).toFixed(2)}
                                                                                </td>
                                                                                <td className="px-4 py-4">
                                                                                    {(() => {
                                                                                        const adjs = report.payrollRecord?.adjustments?.filter(a => !a.isDeleted) || [];
                                                                                        const isExpanded = expandedAdjustments[report.workerId];
                                                                                        if (adjs.length === 0) return <span className="text-slate-400">None</span>;

                                                                                        const renderAdj = (a) => (
                                                                                            <div key={a._id} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border mt-0.5 mr-1 ${a.type === 'addition' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                                                                                <span className={`w-1 h-1 rounded-full ${a.type === 'addition' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                                                                <span>{a.type === 'addition' ? '+' : '-'}₹{a.amount} ({a.reason})</span>
                                                                                            </div>
                                                                                        );

                                                                                        if (adjs.length > 3 && !isExpanded) {
                                                                                            return (
                                                                                                <div className="flex flex-wrap gap-1 items-center max-w-sm">
                                                                                                    {adjs.slice(0, 2).map(renderAdj)}
                                                                                                    <button
                                                                                                        onClick={() => setExpandedAdjustments({ ...expandedAdjustments, [report.workerId]: true })}
                                                                                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold ml-1"
                                                                                                    >
                                                                                                        {adjs.length} Adjustments ▼
                                                                                                    </button>
                                                                                                </div>
                                                                                            );
                                                                                        }
                                                                                        return (
                                                                                            <div className="flex flex-wrap gap-1 items-center max-w-sm">
                                                                                                {adjs.map(renderAdj)}
                                                                                                {adjs.length > 3 && (
                                                                                                    <button
                                                                                                        onClick={() => setExpandedAdjustments({ ...expandedAdjustments, [report.workerId]: false })}
                                                                                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold ml-1"
                                                                                                    >
                                                                                                        Show Less ▲
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </td>
                                                                                <td className="px-4 py-4 font-black text-emerald-600 text-sm">
                                                                                    ₹{((report.payableSalary !== undefined ? report.payableSalary : report.totalFinalSalary) - (deductionView ? (report.taskPenalty || 0) : 0)).toFixed(2)}
                                                                                </td>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <td className="px-4 py-4">
                                                                                    <p className="font-bold text-slate-700">{report.name}</p>
                                                                                </td>
                                                                                <td className="px-4 py-4">
                                                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 font-bold text-[9px] tracking-wider">
                                                                                        {report.department}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-4 font-bold text-slate-600">
                                                                                    {report.totalWorkingDays} <span className="text-[9px] text-slate-400 font-medium">Days</span>
                                                                                </td>
                                                                                <td className="px-4 py-4 font-bold text-teal-600">
                                                                                    {report.actualWorkingDays} <span className="text-[9px] text-teal-500 font-medium">Days</span>
                                                                                </td>
                                                                                <td className="px-4 py-4 font-bold text-rose-500">
                                                                                    {report.totalAbsentDays} <span className="text-[9px] text-rose-400 font-medium">Days</span>
                                                                                </td>
                                                                                <td className="px-4 py-4">
                                                                                    <p className="font-black text-emerald-600 text-sm">₹{Math.max(0, report.totalFinalSalary - (deductionView ? (report.taskPenalty || 0) : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                                                    {report.projectAdjustment !== undefined && report.projectAdjustment !== 0 && (
                                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 mt-1 rounded text-[8px] font-black tracking-wider ${report.projectAdjustment < 0 ? 'bg-rose-50 text-rose-600 border border-rose-100/50' : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'}`}>
                                                                                            {report.projectAdjustment > 0 ? '+' : ''}₹{report.projectAdjustment.toFixed(2)} Adj
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-4">
                                                                                    <span className={`inline-flex items-center px-2 py-1 rounded-lg font-bold text-[9px] tracking-wider ${hasBankDetails ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                                                        {hasBankDetails ? 'Added' : 'Pending'}
                                                                                    </span>
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                        <td className="px-4 py-4">
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    onClick={() => openIndividualReport(report)}
                                                                                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-black text-[9px] tracking-widest"
                                                                                >
                                                                                    View
                                                                                </button>
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        try {
                                                                                            const year = selectedYear;
                                                                                            const month = selectedMonth;
                                                                                            const firstDay = new Date(year, month - 1, 1);
                                                                                            const lastDay = new Date(year, month, 0);
                                                                                            const formatDate = (date) => {
                                                                                                const d = new Date(date);
                                                                                                let m = '' + (d.getMonth() + 1);
                                                                                                let day = '' + d.getDate();
                                                                                                const yr = d.getFullYear();
                                                                                                if (m.length < 2) m = '0' + m;
                                                                                                if (day.length < 2) day = '0' + day;
                                                                                                return [yr, m, day].join('-');
                                                                                            };
                                                                                            const data = await getSalaryReport(report.workerId, formatDate(firstDay), formatDate(lastDay));
                                                                                            setSelectedWorker(workers.find(w => w._id === report.workerId));
                                                                                            setReportData(data);
                                                                                            setTimeout(() => downloadPDF(), 100);
                                                                                        } catch (e) {
                                                                                            toast.error('Failed to download PDF');
                                                                                        }
                                                                                    }}
                                                                                    className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
                                                                                    title="Download PDF"
                                                                                >
                                                                                    <FileDown size={12} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* INDIVIDUAL REPORT MODAL */}
            <Modal
                isOpen={isIndividualReportModalOpen}
                onClose={() => {
                    setIsIndividualReportModalOpen(false);
                    setIndividualReportData(null);
                    setSelectedIndividualWorker(null);
                }}
                title="Employee Salary Insights"
                size="xl"
            >
                <div className="space-y-8">
                    {/* Premium Header */}
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-slate-900/20">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-rose-500/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>

                        <div className="relative z-10">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner overflow-hidden">
                                        <img
                                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedIndividualWorker?.name || '')}&background=0f172a&color=fff&bold=true`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black tracking-tight">{selectedIndividualWorker?.name}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-black tracking-widest border border-teal-500/30">
                                                {selectedIndividualWorker?.department}
                                            </span>
                                            <span className="text-slate-400 text-xs font-bold">• {workers.find(w => w._id === selectedIndividualWorker?.workerId)?.rfid || 'ID: N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-3">
                                    <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                                        <div className={`w-2 h-2 rounded-full ${deductionView ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse' : 'bg-slate-500'}`}></div>
                                        <span className="text-[10px] font-black tracking-widest text-slate-300 mr-2">Deduction View</span>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={deductionView}
                                                onChange={() => setDeductionView(!deductionView)}
                                            />
                                            <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/5">
                                {[
                                    { label: 'Working Days', value: selectedIndividualWorker?.totalWorkingDays, sub: 'Total Scheduled', icon: <Calendar size={14} />, color: 'text-teal-400' },
                                    { label: 'Absent Days', value: selectedIndividualWorker?.totalAbsentDays, sub: 'Deductions Applied', icon: <Calendar size={14} />, color: 'text-rose-400' },
                                    { label: 'Base Earnings', value: `₹${individualReportData?.report?.summary?.netBaseSalary?.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`, sub: 'After Attendance', icon: <Coins size={14} />, color: 'text-white' },
                                    { label: 'Final Settlement', value: `₹${Math.max(0, (selectedIndividualWorker?.totalFinalSalary || 0) - (deductionView ? (calculateTaskDelayPenalty(individualReportData, selectedYear)) : 0))?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'Current Balance', icon: <Wallet size={14} />, color: 'text-teal-400' }
                                ].map((stat, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            {stat.icon}
                                            <p className="text-[10px] font-black tracking-widest">{stat.label}</p>
                                        </div>
                                        <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                                        <p className="text-[9px] font-bold text-slate-500 tracking-tight">{stat.sub}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {isIndividualReportLoading ? (
                        <div className="flex justify-center py-20">
                            <Spinner size="lg" />
                        </div>
                    ) : individualReportData && (
                        <div className="space-y-8">
                            {/* Financial Breakdown Card */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/50">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Financial Summary</h3>
                                        <p className="text-xs font-bold text-slate-400 mt-1 tracking-widest">Revenue & Deductions Breakdown</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowTaskDeductionBreakdown(!showTaskDeductionBreakdown)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${showTaskDeductionBreakdown ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                                        >
                                            <List size={10} />
                                            <span>Task Penalty Details</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-6">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 tracking-widest mb-3 px-1">Gross Earnings</p>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center bg-slate-50 p-3 px-4 rounded-2xl">
                                                    <span className="text-xs font-bold text-slate-600">Base Salary</span>
                                                    <span className="text-xs font-black text-slate-900">₹{individualReportData.report.summary.originalSalary?.toLocaleString()}</span>
                                                </div>
                                                <div className="bg-teal-50/50 p-3 px-4 rounded-2xl border border-teal-100/50 space-y-1.5">
                                                    <div className="flex justify-between items-center text-xs font-bold text-teal-700">
                                                        <span>Project Earnings (Gross)</span>
                                                        <span className="font-black">₹{(individualReportData.report.summary.grossProjectSalary !== undefined ? individualReportData.report.summary.grossProjectSalary : individualReportData.report.summary.totalProjectSalary)?.toLocaleString()}</span>
                                                    </div>
                                                    {individualReportData.report.summary.totalProjectDeductions > 0 && (
                                                        <div className="flex justify-between items-center text-[10px] text-rose-600 border-t border-teal-100/50 pt-1">
                                                            <span className="font-bold">Project Deductions</span>
                                                            <span className="font-black">- ₹{individualReportData.report.summary.totalProjectDeductions?.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center text-xs font-bold text-teal-800 border-t border-teal-100/50 pt-1">
                                                        <span>Net Project Earnings</span>
                                                        <span className="font-black">₹{individualReportData.report.summary.totalProjectSalary?.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                {individualReportData.projectAdjustment !== undefined && individualReportData.projectAdjustment !== 0 && (
                                                    <div className={`flex justify-between items-center p-3 px-4 rounded-2xl border ${individualReportData.projectAdjustment < 0 ? 'bg-rose-50/50 border-rose-100/50' : 'bg-emerald-50/50 border-emerald-100/50'}`}>
                                                        <span className={`text-xs font-bold ${individualReportData.projectAdjustment < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Project Adjustment</span>
                                                        <span className={`text-xs font-black ${individualReportData.projectAdjustment < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{individualReportData.projectAdjustment > 0 ? '+' : ''} ₹{individualReportData.projectAdjustment?.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {individualReportData.projectAdjustment !== undefined && individualReportData.projectAdjustment !== 0 && (
                                                    <div className="flex justify-between items-center bg-slate-100/50 p-3 px-4 rounded-2xl border border-slate-200/50">
                                                        <span className="text-xs font-bold text-slate-700">Final Project Pay</span>
                                                        <span className="text-xs font-black text-slate-900">₹{Math.max(0, (individualReportData.report.summary.totalProjectSalary || 0) + (individualReportData.projectAdjustment || 0)).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {individualReportData.totalBonusAmount > 0 && (
                                                    <div className="flex justify-between items-center bg-emerald-50/50 p-3 px-4 rounded-2xl border border-emerald-100/50">
                                                        <span className="text-xs font-bold text-emerald-700">Additional Bonus</span>
                                                        <span className="text-xs font-black text-emerald-600">+ ₹{individualReportData.totalBonusAmount.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <p className="text-[10px] font-black text-rose-400 tracking-widest mb-3 px-1">Active Deductions</p>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center bg-rose-50/50 p-3 px-4 rounded-2xl border border-rose-100/50">
                                                    <span className="text-xs font-bold text-rose-600">Attendance/Leaves</span>
                                                    <span className="text-xs font-black text-rose-600">- ₹{individualReportData.report.totalSalaryDeduction?.toLocaleString()}</span>
                                                </div>
                                                {individualReportData.totalFinesAmount > 0 && (
                                                    <div className="flex justify-between items-center bg-rose-50/50 p-3 px-4 rounded-2xl border border-rose-100/50">
                                                        <span className="text-xs font-bold text-rose-600">Disciplinary Fines</span>
                                                        <span className="text-xs font-black text-rose-600">- ₹{individualReportData.totalFinesAmount.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {deductionView && individualReportData.delayedTasks?.length > 0 && (
                                                    <div className="flex justify-between items-center bg-rose-600 p-3 px-4 rounded-2xl shadow-lg shadow-rose-200">
                                                        <span className="text-xs font-bold text-white">Task Delay Penalties</span>
                                                        <span className="text-xs font-black text-white">- ₹{(() => {
                                                            const parseSalary = (str) => { if (!str) return 0; const cleaned = str.replace(/[^0-9.]/g, ''); return parseFloat(cleaned) || 0; };
                                                            const reportYear = reportDateRange.fromDate ? new Date(reportDateRange.fromDate).getFullYear() : new Date().getFullYear();
                                                            const claimed = new Set();
                                                            let penalty = 0;
                                                            individualReportData.delayedTasks.forEach(task => {
                                                                const start = new Date(task.endDate); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
                                                                const end = task.doneDate ? new Date(task.doneDate) : new Date(); end.setHours(23, 59, 59, 999);
                                                                individualReportData.report.report.forEach(day => {
                                                                    const dDate = new Date(`${day.date}, ${reportYear}`);
                                                                    if (dDate >= start && dDate <= end && !claimed.has(day.date)) { claimed.add(day.date); penalty += parseSalary(day.totalSalary); }
                                                                });
                                                            });
                                                            return penalty.toLocaleString();
                                                        })()}</span>
                                                    </div>
                                                )}
                                                {individualReportData.totalUnauthorizedPenalty > 0 && (
                                                    <div className="flex justify-between items-center bg-orange-500 p-3 px-4 rounded-2xl shadow-lg shadow-orange-200">
                                                        <div>
                                                            <span className="text-xs font-bold text-white">⚠ Unauthorized Absence</span>
                                                            <p className="text-[9px] text-orange-100 mt-0.5">{individualReportData.unauthorizedAbsencePenalties?.length} day(s) × 5X</p>
                                                        </div>
                                                        <span className="text-xs font-black text-white">- ₹{individualReportData.totalUnauthorizedPenalty?.toFixed(2)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col justify-end">
                                        <div className="bg-slate-900 rounded-[2rem] p-6 text-right shadow-2xl shadow-slate-900/30">
                                            <p className="text-[10px] font-black text-slate-400 tracking-[0.2em] mb-2">Final Net Payout</p>
                                            <p className="text-3xl font-black text-teal-400 tracking-tighter">₹{(() => {
                                                const baseVal = individualReportData.finalSalaryWithFines || 0;
                                                if (deductionView && individualReportData.delayedTasks?.length > 0) {
                                                    const parseSalary = (str) => { if (!str) return 0; const cleaned = str.replace(/[^0-9.]/g, ''); return parseFloat(cleaned) || 0; };
                                                    const reportYear = reportDateRange.fromDate ? new Date(reportDateRange.fromDate).getFullYear() : new Date().getFullYear();
                                                    const claimed = new Set();
                                                    let penalty = 0;
                                                    individualReportData.delayedTasks.forEach(task => {
                                                        const start = new Date(task.endDate); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
                                                        const end = task.doneDate ? new Date(task.doneDate) : new Date(); end.setHours(23, 59, 59, 999);
                                                        individualReportData.report.report.forEach(day => {
                                                            const dDate = new Date(`${day.date}, ${reportYear}`);
                                                            if (dDate >= start && dDate <= end && !claimed.has(day.date)) { claimed.add(day.date); penalty += parseSalary(day.totalSalary); }
                                                        });
                                                    });
                                                    return Math.max(0, baseVal - penalty).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                                }
                                                return baseVal.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                            })()}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Task Deduction Breakdown (Collapsible) */}
                            <AnimatePresence>
                                {deductionView && individualReportData.delayedTasks?.length > 0 && showTaskDeductionBreakdown && (() => {
                                    const parseSalary = (str) => { if (!str) return 0; const cleaned = str.replace(/[^0-9.]/g, ''); return parseFloat(cleaned) || 0; };
                                    const reportYear = reportDateRange.fromDate ? new Date(reportDateRange.fromDate).getFullYear() : new Date().getFullYear();
                                    const claimedDays = new Set();
                                    const taskPenalties = individualReportData.delayedTasks.map(task => {
                                        const start = new Date(task.endDate); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
                                        const end = task.doneDate ? new Date(task.doneDate) : new Date(); end.setHours(23, 59, 59, 999);
                                        let taskDeduction = 0; const dailyList = [];
                                        individualReportData.report.report.forEach(day => {
                                            const dDate = new Date(`${day.date}, ${reportYear}`);
                                            if (dDate >= start && dDate <= end) {
                                                const amt = parseSalary(day.totalSalary);
                                                const alreadyDeducted = claimedDays.has(day.date);
                                                if (!alreadyDeducted) { taskDeduction += amt; claimedDays.add(day.date); }
                                                dailyList.push({ date: day.date, amount: amt, alreadyDeducted });
                                            }
                                        });
                                        return { ...task, taskDeduction, dailyList, period: `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → ${task.doneDate ? new Date(task.doneDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Ongoing'}` };
                                    });

                                    return (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden space-y-6"
                                        >
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-black text-rose-600 tracking-[0.2em]">Task Penalty Details</h4>
                                                <div className="h-px flex-1 bg-rose-100 mx-4"></div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {taskPenalties.map((tp, i) => (
                                                    <div key={i} className="bg-white rounded-3xl border border-rose-100 p-6 relative overflow-hidden group">
                                                        <div className="relative z-10 space-y-4">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Task Title</p>
                                                                    <h5 className="text-sm font-bold text-slate-800">{tp.title}</h5>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[10px] font-black text-rose-400 tracking-widest mb-1">Penalty</p>
                                                                    <p className="text-lg font-black text-rose-600">₹{tp.taskDeduction.toFixed(2)}</p>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 tracking-tight mb-0.5">Deadline</p>
                                                                    <p className="text-[11px] font-bold text-slate-600">{new Date(tp.endDate).toLocaleDateString()}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 tracking-tight mb-0.5">Deduction Period</p>
                                                                    <p className="text-[11px] font-bold text-slate-600">{tp.period}</p>
                                                                </div>
                                                            </div>
                                                            <div className="bg-slate-50/50 rounded-2xl p-3">
                                                                <p className="text-[9px] font-black text-slate-400 tracking-widest mb-2">Daily Breakdown</p>
                                                                <div className="space-y-1 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                                                                    {tp.dailyList.map((day, idx) => (
                                                                        <div key={idx} className="flex justify-between items-center text-[10px]">
                                                                            <span className="font-medium text-slate-500">{day.date}</span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                {day.alreadyDeducted && <span className="text-[7px] font-black text-slate-300">(Handled)</span>}
                                                                                <span className={`font-black ${day.amount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>₹{day.amount.toFixed(2)}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </AnimatePresence>

                            {/* Project Adjustment Breakdown */}
                            {individualReportData.projectAdjustmentDetails && individualReportData.projectAdjustmentDetails.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-black text-slate-900 tracking-widest">Project Adjustment Breakdown</h4>
                                        <div className="h-px flex-1 bg-slate-100 mx-4"></div>
                                    </div>
                                    <div className="bg-slate-50/50 rounded-[2rem] p-6 border border-slate-100 space-y-2">
                                        {individualReportData.projectAdjustmentDetails.map((detail, idx) => (
                                            <div key={idx} className="flex flex-wrap items-center justify-between bg-white rounded-xl p-3 px-4 border border-slate-100 gap-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-slate-700">{detail.projectName}</span>
                                                    <span className="text-[10px] font-medium text-slate-400">
                                                        {['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][detail.month]} {detail.year}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px]">
                                                    <span className="text-slate-400">Paid: ₹{detail.paidAmount?.toFixed(2)}</span>
                                                    <span className="text-slate-400">Entitled: ₹{detail.currentEntitlement?.toFixed(2)}</span>
                                                    <span className={`font-black ${detail.adjustment < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {detail.adjustment > 0 ? '+' : ''}₹{detail.adjustment?.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Detailed Stats Grid */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-900 tracking-widest">Efficiency Metrics</h4>
                                    <div className="h-px flex-1 bg-slate-100 mx-4"></div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100">
                                    {[
                                        { label: 'Total Days', value: individualReportData.report.summary.totalDaysInPeriod },
                                        { label: 'Working Days', value: individualReportData.report.summary.totalWorkingDaysInPeriod },
                                        { label: 'Absent Days', value: individualReportData.report.summary.totalAbsentDays, color: 'text-rose-500' },
                                        { label: 'Leave Days', value: individualReportData.report.summary.totalLeaveDays, color: 'text-amber-500' },
                                        { label: 'Actual Worked', value: individualReportData.report.summary.actualWorkingDays, color: 'text-teal-600' },
                                        { label: 'Work Hours', value: `${(individualReportData.report.totalWorkingHours || 0).toFixed(1)}h` },
                                        { label: 'Attendance', value: `${individualReportData.report.summary.attendanceRate?.toFixed(1)}%`, color: 'text-emerald-500' },
                                        { label: 'Deduction Total', value: `₹${individualReportData.report.totalSalaryDeduction?.toLocaleString()}`, color: 'text-rose-600' }
                                    ].map((item, idx) => (
                                        <div key={idx} className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 tracking-widest">{item.label}</p>
                                            <p className={`text-sm font-black ${item.color || 'text-slate-700'}`}>{item.value || 0}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Unauthorized Absence Penalty Breakdown in Individual Report */}
                            {individualReportData.unauthorizedAbsencePenalties?.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle size={16} className="text-orange-500 flex-none" />
                                            <h4 className="text-sm font-black text-orange-600 tracking-[0.15em]">Unauthorized Absence Penalties</h4>
                                        </div>
                                        <div className="h-px flex-1 bg-orange-100 mx-4"></div>
                                        <span className="flex-none text-xs font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border border-orange-200">
                                            Total: - ₹{individualReportData.totalUnauthorizedPenalty?.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="bg-orange-50/30 border border-orange-100 rounded-[2rem] overflow-hidden">
                                        <div className="px-6 py-3 bg-orange-50/60 border-b border-orange-100">
                                            <p className="text-[10px] font-black text-orange-500 tracking-widest">
                                                {individualReportData.unauthorizedAbsencePenalties.length} day(s) at 5× basic pay per day · Pending/Approved leaves are NOT penalized
                                            </p>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-orange-50 text-xs">
                                                <thead className="bg-orange-50/40">
                                                    <tr>
                                                        {['Date', 'Status', 'Leave Status', 'Factor', 'Deduction', 'Reason'].map(h => (
                                                            <th key={h} className="px-5 py-3 text-left font-black text-orange-400 tracking-widest text-[9px]">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-orange-50/50 bg-white/60">
                                                    {individualReportData.unauthorizedAbsencePenalties.map((p, idx) => (
                                                        <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                                            <td className="px-5 py-3 font-bold text-slate-700">{p.displayDate}</td>
                                                            <td className="px-5 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[9px] tracking-tighter bg-orange-100 text-orange-700 border border-orange-200">{p.status}</span></td>
                                                            <td className="px-5 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[9px] tracking-tighter border ${p.leaveStatus === 'Rejected' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{p.leaveStatus}</span></td>
                                                            <td className="px-5 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[10px] bg-rose-600 text-white border border-rose-700">5X</span></td>
                                                            <td className="px-5 py-3 font-black text-orange-600">- ₹{p.penaltyAmount.toFixed(2)}</td>
                                                            <td className="px-5 py-3 font-medium text-slate-500 text-[10px]">{p.reason}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Daily Table - Reusing premium table style */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-900 tracking-widest">Attendance Timeline</h4>
                                    <div className="h-px flex-1 bg-slate-100 mx-4"></div>
                                </div>
                                <div className="rounded-[2rem] border border-slate-100 overflow-hidden bg-white shadow-lg shadow-slate-100">
                                    <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                                            <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                                                <tr>
                                                    {['Date', 'Status', 'In/Out', 'Deduction', 'Salary'].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left font-black text-slate-400 tracking-widest">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {(individualReportData.report.report || []).map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-700">
                                                            {row.penaltyFactor > 1 ? (
                                                                <button
                                                                    onClick={() => setPenaltyExplanation({
                                                                        date: row.date,
                                                                        status: row.status,
                                                                        penaltyFactor: row.penaltyFactor,
                                                                        penaltyReason: row.penaltyReason
                                                                    })}
                                                                    className="flex items-center gap-1.5 hover:text-rose-600 transition-colors group text-left"
                                                                    title="Click to view 2X penalty details"
                                                                >
                                                                    <span>{row.date}</span>
                                                                    <span className="inline-flex items-center px-1 rounded bg-rose-50 text-rose-600 text-[8px] font-black tracking-tighter border border-rose-100 group-hover:bg-rose-100 transition-all cursor-pointer">
                                                                        {row.penaltyFactor}X Penalty
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                row.date
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[9px] tracking-tighter ${row.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : row.status === 'Absent' ? 'bg-rose-50 text-rose-500' : row.status === 'Sunday' ? 'bg-slate-50 text-slate-400' : 'bg-sky-50 text-sky-600'}`}>
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-[10px] font-bold text-slate-500">{row.inTime} → {row.outTime}</td>
                                                        <td className="px-6 py-4 text-rose-500 font-bold">{row.deductionAmount}</td>
                                                        <td className="px-6 py-4 text-emerald-600 font-black">{row.totalSalary}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title={
                    <div className="flex flex-col gap-0.5">
                        <span className="text-slate-900">Salary Report</span>
                        <span className="text-xs font-medium text-slate-500 tracking-wider">{selectedWorker?.name}</span>
                    </div>
                }
                size="xl"
            >
                <div className="p-1">
                    <div className="px-4 py-2 bg-slate-50/50 rounded-2xl border border-slate-100 mb-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={toggleDateSelection}
                                className="text-[11px] font-black tracking-widest text-slate-400 hover:text-blue-500 transition-colors"
                            >
                                {useMonthSelection ? 'Select Date Range' : 'Select Month'}
                            </button>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <span className="text-[11px] font-black tracking-widest text-slate-400 group-hover:text-rose-500 transition-colors">Deduction View</span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={deductionView}
                                        onChange={() => setDeductionView(!deductionView)}
                                    />
                                    <div className={`w-8 h-4 rounded-full transition-colors ${deductionView ? 'bg-rose-400' : 'bg-slate-200'}`}></div>
                                    <div className={`absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${deductionView ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {useMonthSelection ? (
                        <div className="flex flex-wrap items-end gap-4 mb-8 px-4">
                            <div className="flex-1 min-w-[150px]">
                                <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5 block">Month</label>
                                <select
                                    value={selectedMonth}
                                    onChange={handleMonthChange}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                >
                                    {[
                                        'January', 'February', 'March', 'April', 'May', 'June',
                                        'July', 'August', 'September', 'October', 'November', 'December'
                                    ].map((m, i) => (
                                        <option key={i + 1} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5 block">Year</label>
                                <select
                                    value={selectedYear}
                                    onChange={handleYearChange}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                >
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <Button
                                onClick={fetchReport}
                                disabled={isReportLoading}
                                variant="primary"
                                className="h-11 px-8 rounded-xl shadow-lg shadow-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isReportLoading ? 'Generating...' : 'Generate Report'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-end gap-4 mb-8 px-4">
                            <div className="flex-1 min-w-[150px]">
                                <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5 block">From Date</label>
                                <input
                                    type="date"
                                    name="fromDate"
                                    value={reportDateRange.fromDate}
                                    onChange={handleReportDateChange}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <label className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5 block">To Date</label>
                                <input
                                    type="date"
                                    name="toDate"
                                    value={reportDateRange.toDate}
                                    onChange={handleReportDateChange}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                            <Button
                                onClick={fetchReport}
                                disabled={isReportLoading}
                                variant="primary"
                                className="h-11 px-8 rounded-xl shadow-lg shadow-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isReportLoading ? 'Generating...' : 'Generate Report'}
                            </Button>
                        </div>
                    )}

                    {isReportLoading && !reportData && (
                        <div className="flex justify-center py-12">
                            <p className="text-slate-500 font-medium tracking-wide">Loading report data...</p>
                        </div>
                    )}
                    {reportData && (
                        <div className="space-y-6">
                            {/* Summary Section - Primary Focus */}
                            <div className="bg-slate-50/50 rounded-[2.5rem] p-3 border border-slate-200/60 shadow-inner flex flex-col gap-4">
                                {/* Top Metrics Row */}
                                <div className="p-4 bg-white/40 rounded-[2rem]">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {/* Monthly Base Salary */}
                                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                            <p className="text-[10px] font-black text-slate-400 tracking-[0.15em] mb-1 group-hover:text-blue-500 transition-colors relative z-10">Monthly Base Salary</p>
                                            <p className="text-xl font-bold text-slate-800 tracking-tight relative z-10">₹{reportData.report.summary.originalSalary?.toFixed(2) || '0.00'}</p>
                                        </div>
                                        
                                        {/* Base Salary (SaaS) */}
                                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                            <p className="text-[10px] font-black text-slate-400 tracking-[0.15em] mb-1 group-hover:text-indigo-500 transition-colors relative z-10">Base Salary (SaaS)</p>
                                            <p className="text-xl font-bold text-slate-800 tracking-tight relative z-10">₹{reportData.report.summary.expectedSaaSSalary?.toFixed(2) || reportData.report.summary.originalSalary?.toFixed(2) || '0.00'}</p>
                                        </div>

                                        {/* Total Deductions */}
                                        <div className="bg-rose-50/40 rounded-2xl p-4 border border-rose-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                            <p className="text-[10px] font-black text-rose-400/80 tracking-[0.15em] mb-1 group-hover:text-rose-500 transition-colors relative z-10">Total Deductions</p>
                                            <p className="text-xl font-bold text-rose-600 tracking-tight relative z-10">- ₹{reportData.report.totalSalaryDeduction?.toFixed(2) || '0.00'}</p>
                                        </div>

                                        {/* Net Base Salary */}
                                        <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                            <p className="text-[10px] font-black text-emerald-600/70 tracking-[0.15em] mb-1 group-hover:text-emerald-600 transition-colors relative z-10">Net Base Salary</p>
                                            <p className="text-xl font-bold text-emerald-700 tracking-tight relative z-10">₹{reportData.report.summary.netBaseSalary?.toFixed(2) || '0.00'}</p>
                                        </div>

                                        {(reportData.report.summary.grossProjectSalary > 0 || reportData.report.summary.totalProjectSalary > 0) && (
                                            <>
                                                <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-teal-50/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                    <p className="text-[10px] font-black text-slate-400 tracking-[0.15em] mb-1 group-hover:text-teal-600 transition-colors relative z-10">Gross Project Earnings</p>
                                                    <p className="text-xl font-bold text-teal-600 tracking-tight relative z-10">₹{(reportData.report.summary.grossProjectSalary !== undefined ? reportData.report.summary.grossProjectSalary : reportData.report.summary.totalProjectSalary)?.toFixed(2) || '0.00'}</p>
                                                </div>
                                                {reportData.report.summary.totalProjectDeductions > 0 && (
                                                    <div className="bg-rose-50/40 rounded-2xl p-4 border border-rose-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                        <p className="text-[10px] font-black text-rose-400/80 tracking-[0.15em] mb-1 group-hover:text-rose-500 transition-colors relative z-10">Project Deductions</p>
                                                        <p className="text-xl font-bold text-rose-600 tracking-tight relative z-10">- ₹{reportData.report.summary.totalProjectDeductions?.toFixed(2) || '0.00'}</p>
                                                    </div>
                                                )}
                                                <div className="bg-teal-50/40 rounded-2xl p-4 border border-teal-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-teal-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                    <p className="text-[10px] font-black text-teal-600/70 tracking-[0.15em] mb-1 group-hover:text-teal-700 transition-colors relative z-10">Net Project Earnings</p>
                                                    <p className="text-xl font-bold text-teal-700 tracking-tight relative z-10">₹{reportData.report.summary.totalProjectSalary?.toFixed(2) || '0.00'}</p>
                                                </div>
                                            </>
                                        )}
                                        {reportData.projectAdjustment !== undefined && reportData.projectAdjustment !== 0 && (
                                            <div className={`rounded-2xl p-4 border shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${reportData.projectAdjustment < 0 ? 'bg-rose-50/40 border-rose-100/60' : 'bg-emerald-50/40 border-emerald-100/60'}`}>
                                                <div className={`absolute top-0 right-0 w-16 h-16 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110 ${reportData.projectAdjustment < 0 ? 'bg-rose-100/50' : 'bg-emerald-100/50'}`}></div>
                                                <p className={`text-[10px] font-black tracking-[0.15em] mb-1 relative z-10 ${reportData.projectAdjustment < 0 ? 'text-rose-400/80 group-hover:text-rose-500' : 'text-emerald-500/80 group-hover:text-emerald-600'} transition-colors`}>Project Adjustment</p>
                                                <p className={`text-xl font-bold tracking-tight relative z-10 ${reportData.projectAdjustment < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{reportData.projectAdjustment > 0 ? '+' : ''} ₹{reportData.projectAdjustment?.toFixed(2)}</p>
                                            </div>
                                        )}
                                        {reportData.projectAdjustment !== undefined && reportData.projectAdjustment !== 0 && (
                                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                <p className="text-[10px] font-black text-slate-400 tracking-[0.15em] mb-1 group-hover:text-slate-600 transition-colors relative z-10">Final Project Pay</p>
                                                <p className="text-xl font-bold text-slate-800 tracking-tight relative z-10">₹{Math.max(0, (reportData.report.summary.totalProjectSalary || 0) + (reportData.projectAdjustment || 0)).toFixed(2)}</p>
                                            </div>
                                        )}
                                        {reportData.totalBonusAmount > 0 && (
                                            <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                <p className="text-[10px] font-black text-amber-500/80 tracking-[0.15em] mb-1 group-hover:text-amber-600 transition-colors relative z-10">Bonus Amount</p>
                                                <p className="text-xl font-bold text-amber-600 tracking-tight relative z-10">+ ₹{reportData.totalBonusAmount.toFixed(2)}</p>
                                            </div>
                                        )}
                                        {reportData.totalFinesAmount > 0 && (
                                            <div className="bg-rose-50/40 rounded-2xl p-4 border border-rose-100/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-100/50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                                <p className="text-[10px] font-black text-rose-400/80 tracking-[0.15em] mb-1 group-hover:text-rose-500 transition-colors relative z-10">Total Fines</p>
                                                <p className="text-xl font-bold text-rose-600 tracking-tight relative z-10">- ₹{reportData.totalFinesAmount.toFixed(2)}</p>
                                            </div>
                                        )}
                                        {reportData.totalUnauthorizedPenalty > 0 && (
                                            <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-200/60 shadow-sm hover:shadow-md transition-all group relative overflow-hidden col-span-2 md:col-span-2 lg:col-span-2">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-100/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <p className="text-[10px] font-black text-orange-500 tracking-[0.15em] mb-1 relative z-10">⚠ Unauthorized Absence Penalty</p>
                                                <p className="text-xl font-bold text-orange-600 tracking-tight relative z-10">- ₹{reportData.totalUnauthorizedPenalty.toFixed(2)}</p>
                                                <p className="text-[9px] font-bold text-orange-400 mt-1 relative z-10">{reportData.unauthorizedAbsencePenalties?.length || 0} day(s) × 5X</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Final Salary Emphasis Card (Bottom) */}
                                <div className="relative mt-2">
                                    <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-600 rounded-[2rem] blur-xl opacity-20"></div>
                                    <div className="w-full bg-gradient-to-r from-white to-teal-50/50 rounded-[2rem] p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white flex flex-col md:flex-row justify-between items-center relative overflow-hidden backdrop-blur-xl">
                                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-teal-400/10 rounded-full blur-3xl"></div>
                                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl"></div>
                                        
                                        <div className="relative z-10 flex flex-col items-center md:items-start mb-6 md:mb-0">
                                            <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-teal-100/50 shadow-sm mb-2 backdrop-blur-md">
                                                <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
                                                <p className="text-[10px] font-black text-teal-700 tracking-[0.25em] uppercase">Total Final Salary</p>
                                            </div>
                                            <p className="text-xs font-bold text-slate-500 tracking-wide text-center md:text-left max-w-xs">After all deductions & adjustments</p>
                                        </div>

                                        <div className="relative z-10 flex flex-col items-center md:items-end text-center md:text-right">
                                            <div className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-teal-700 to-emerald-600 tracking-tighter drop-shadow-sm">
                                                {(() => {
                                                    const parseSalary = (str) => {
                                                        if (!str) return 0;
                                                        const cleaned = str.replace(/[^0-9.]/g, '');
                                                        return parseFloat(cleaned) || 0;
                                                    };
                                                    const reportYear = reportDateRange.fromDate ? new Date(reportDateRange.fromDate).getFullYear() : new Date().getFullYear();

                                                    // SINGLE PASS CALCULATION for both Final Salary and Breakdown
                                                    const claimedDays = new Set();
                                                    let totalDeductionVal = 0;

                                                    const taskPenalties = (reportData.delayedTasks || []).map(task => {
                                                        const start = new Date(task.endDate);
                                                        start.setDate(start.getDate() + 1);
                                                        start.setHours(0, 0, 0, 0);

                                                        const end = task.doneDate ? new Date(task.doneDate) : new Date();
                                                        end.setHours(23, 59, 59, 999);

                                                        let taskDeduction = 0;
                                                        const dailyList = [];

                                                        reportData.report.report.forEach(day => {
                                                            const dDate = new Date(`${day.date}, ${reportYear}`);
                                                            if (dDate >= start && dDate <= end) {
                                                                const amt = parseSalary(day.totalSalary);
                                                                // To avoid double/triple deduction, only count day if not claimed
                                                                if (!claimedDays.has(day.date)) {
                                                                    claimedDays.add(day.date);
                                                                    totalDeductionVal += amt;
                                                                    taskDeduction += amt;
                                                                    dailyList.push({ date: day.date, amount: amt });
                                                                } else {
                                                                    // If already claimed by another task, show as ₹0 in this task's breakdown to avoid confusion
                                                                    dailyList.push({ date: day.date, amount: 0, alreadyDeducted: true });
                                                                }
                                                            }
                                                        });

                                                        return {
                                                            ...task,
                                                            taskDeduction,
                                                            dailyList,
                                                            overdueWorkingDays: dailyList.length,
                                                            period: `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → ${task.doneDate ? new Date(task.doneDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Ongoing'}`
                                                        };
                                                    });

                                                    // We attach this to the reportData object temporarily for the Breakdown Section to use
                                                    reportData._calculatedTaskPenalties = taskPenalties;
                                                    reportData._totalTaskPenalty = totalDeductionVal;
                                                    return null;
                                                })()}
                                                ₹{Math.max(0, (reportData.finalSalaryWithFines || 0) - (deductionView ? (reportData._totalTaskPenalty || 0) : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Record Payment & Adjustment Details */}
                            {reportData.report.summary.totalProjectSalary > 0 && (
                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                    {(() => {
                                        const fromD = new Date(reportDateRange.fromDate);
                                        const reportMonth = fromD.getMonth() + 1;
                                        const reportYear = fromD.getFullYear();
                                        const now = new Date();
                                        const currentYear = now.getFullYear();
                                        const currentMonth = now.getMonth() + 1;
                                        const isPastMonth = (reportYear < currentYear) || (reportYear === currentYear && reportMonth < currentMonth);
                                        return isPastMonth ? (
                                            <span className="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest bg-slate-100 text-slate-600 border border-slate-200/50 flex items-center gap-1.5">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                <span>Payment Frozen</span>
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1.5">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <span>Active (Dynamic)</span>
                                            </span>
                                        );
                                    })()}
                                    {reportData.projectAdjustment !== undefined && reportData.projectAdjustment !== 0 && (
                                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest ${reportData.projectAdjustment < 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                            Adjustment: {reportData.projectAdjustment > 0 ? '+' : ''}₹{reportData.projectAdjustment?.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Adjustment Details Breakdown */}
                            {reportData.projectAdjustmentDetails && reportData.projectAdjustmentDetails.length > 0 && (
                                <div className="bg-slate-50/50 rounded-[2rem] p-6 border border-slate-100 mt-2">
                                    <h4 className="text-[10px] font-black text-slate-400 tracking-widest mb-4">Project Adjustment Breakdown</h4>
                                    <div className="space-y-2">
                                        {reportData.projectAdjustmentDetails.map((detail, idx) => (
                                            <div key={idx} className="flex flex-wrap items-center justify-between bg-white rounded-xl p-3 px-4 border border-slate-100 gap-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-slate-700">{detail.projectName}</span>
                                                    <span className="text-[10px] font-medium text-slate-400">
                                                        {['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][detail.month]} {detail.year}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px]">
                                                    <span className="text-slate-400">Paid: ₹{detail.paidAmount?.toFixed(2)}</span>
                                                    <span className="text-slate-400">Entitled: ₹{detail.currentEntitlement?.toFixed(2)}</span>
                                                    <span className={`font-black ${detail.adjustment < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {detail.adjustment > 0 ? '+' : ''}₹{detail.adjustment?.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Unauthorized Absence Penalty Breakdown ── */}
                            {reportData.unauthorizedAbsencePenalties?.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle size={16} className="text-orange-500 flex-none" />
                                            <h4 className="text-sm font-black text-orange-600 tracking-[0.15em]">Unauthorized Absence Penalties</h4>
                                        </div>
                                        <div className="h-px flex-1 bg-orange-100 mx-4"></div>
                                        <span className="flex-none text-xs font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border border-orange-200">
                                            Total: - ₹{reportData.totalUnauthorizedPenalty.toFixed(2)}
                                        </span>
                                    </div>

                                    <div className="bg-orange-50/30 border border-orange-100 rounded-[2rem] overflow-hidden">
                                        <div className="px-6 py-3 bg-orange-50/60 border-b border-orange-100 flex items-center gap-2">
                                            <p className="text-[10px] font-black text-orange-500 tracking-widest">
                                                {reportData.unauthorizedAbsencePenalties.length} day(s) penalized at 5× basic pay per day
                                            </p>
                                            <span className="ml-auto text-[9px] font-black text-orange-400 tracking-widest">
                                                Pending/Approved leaves are NOT penalized
                                            </span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-orange-50 text-xs">
                                                <thead className="bg-orange-50/40">
                                                    <tr>
                                                        {['Date', 'Status', 'Leave Status', 'Penalty Factor', 'Deduction', 'Reason'].map(h => (
                                                            <th key={h} className="px-5 py-3 text-left font-black text-orange-400 tracking-widest text-[9px]">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-orange-50/50 bg-white/60">
                                                    {reportData.unauthorizedAbsencePenalties.map((p, idx) => (
                                                        <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                                            <td className="px-5 py-3 font-bold text-slate-700">{p.displayDate}</td>
                                                            <td className="px-5 py-3">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[9px] tracking-tighter bg-orange-100 text-orange-700 border border-orange-200">
                                                                    {p.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[9px] tracking-tighter border ${p.leaveStatus === 'Rejected' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                                    {p.leaveStatus}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[10px] bg-rose-600 text-white border border-rose-700 shadow-sm">
                                                                    5X
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3 font-black text-orange-600">- ₹{p.penaltyAmount.toFixed(2)}</td>
                                                            <td className="px-5 py-3 font-medium text-slate-500 text-[10px]">{p.reason}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="px-6 py-3 bg-orange-50/60 border-t border-orange-100 flex justify-between items-center">
                                            <p className="text-[10px] font-bold text-orange-400">
                                                {reportData.unauthorizedAbsencePenalties.some(p => p.status === 'Unauthorized Permission') ? (
                                                    `5X Penalty applied to unapproved permissions based on duration and per-minute salary`
                                                ) : (
                                                    `Per-day salary: ₹${reportData.unauthorizedAbsencePenalties[0]?.perDaySalary?.toFixed(2)} × 5 = ₹${(reportData.unauthorizedAbsencePenalties[0]?.perDaySalary * 5)?.toFixed(2)} per unauthorized day`
                                                )}
                                            </p>
                                            <p className="text-xs font-black text-orange-600">
                                                Total Penalty: - ₹{reportData.totalUnauthorizedPenalty.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Collapsible Task Deduction Breakdown Toggle */}
                            {deductionView && reportData.delayedTasks?.length > 0 && (
                                <div className="mt-4">
                                    <button
                                        onClick={() => setShowTaskDeductionBreakdown(!showTaskDeductionBreakdown)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all text-xs font-bold border border-rose-100/50"
                                    >
                                        <motion.span
                                            animate={{ rotate: showTaskDeductionBreakdown ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <List size={10} />
                                        </motion.span>
                                        {showTaskDeductionBreakdown ? 'Hide Task Deduction Breakdown' : 'Show Task Deduction Breakdown'}
                                    </button>
                                </div>
                            )}

                            {/* Task Deduction Breakdown Section */}
                            <AnimatePresence>
                                {deductionView && reportData.delayedTasks?.length > 0 && showTaskDeductionBreakdown && (() => {
                                    const taskPenalties = reportData._calculatedTaskPenalties || [];
                                    const totalPenaltyAmount = reportData._totalTaskPenalty || 0;
                                    const salaryBefore = reportData.finalSalaryWithFines || 0;
                                    const finalSalary = Math.max(0, salaryBefore - totalPenaltyAmount);

                                    return (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="overflow-hidden mt-6"
                                        >
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-black text-rose-600 tracking-[0.2em]">Task Deduction Breakdown</h4>
                                                    <div className="h-px flex-1 bg-rose-100 mx-4"></div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {taskPenalties.map((tp, i) => (
                                                        <div key={i} className="bg-white rounded-3xl border border-rose-100 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                                            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>

                                                            <div className="relative z-10 space-y-4">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Task</p>
                                                                    <h5 className="text-sm font-bold text-slate-800">{tp.title}</h5>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Deadline Date</p>
                                                                        <p className="text-xs font-bold text-slate-600">{new Date(tp.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Completed Date</p>
                                                                        <p className={`text-xs font-bold ${tp.doneDate ? 'text-teal-600' : 'text-rose-500'}`}>
                                                                            {tp.doneDate ? new Date(tp.doneDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Ongoing'}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex justify-between items-end border-t border-slate-50 pt-3">
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Deduction Period</p>
                                                                        <p className="text-xs font-bold text-slate-700">{tp.period}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Overdue Days</p>
                                                                        <p className="text-xs font-black text-rose-600">{tp.overdueWorkingDays} Days</p>
                                                                    </div>
                                                                </div>

                                                                <div className="bg-slate-50/50 rounded-2xl p-4">
                                                                    <div className="flex justify-between items-center mb-2">
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest">Daily Deduction</p>
                                                                        <p className="text-[8px] font-bold text-slate-300">Actual Earned Salary</p>
                                                                    </div>
                                                                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                                                        {tp.dailyList.map((day, idx) => (
                                                                            <div key={idx} className="flex justify-between items-center text-[11px]">
                                                                                <span className="font-medium text-slate-500">{day.date}</span>
                                                                                <div className="flex items-center gap-1.5">
                                                                                    {day.alreadyDeducted && <span className="text-[8px] font-black text-slate-300 tracking-tighter">(Handled)</span>}
                                                                                    <span className={`font-black ${day.amount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>₹{day.amount.toFixed(2)}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                        {tp.dailyList.length === 0 && <p className="text-[10px] text-slate-400 italic">No working days in this report period</p>}
                                                                    </div>
                                                                </div>

                                                                <div className="pt-2 flex justify-between items-end">
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-rose-400 tracking-[0.15em] mb-1">Status</p>
                                                                        <p className="text-[10px] font-black text-rose-600">Permanent Delay Penalty Applied</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-[10px] font-black text-slate-400 tracking-widest">Task Total</p>
                                                                        <p className="text-lg font-black text-rose-600">₹{tp.taskDeduction.toFixed(2)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Total Summary for Breakdown */}
                                                <div className="bg-rose-50/50 rounded-[2rem] p-8 border border-rose-100 flex flex-wrap justify-between items-center gap-6">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-2xl bg-white border border-rose-100 flex items-center justify-center text-rose-500 shadow-sm">
                                                                <Coins size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-0.5">Salary Before Deduction</p>
                                                                <p className="text-xl font-bold text-slate-700">₹{salaryBefore.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-2xl bg-white border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
                                                                <span className="font-black text-lg">-</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-rose-400 tracking-widest mb-0.5">Total Deducted Amount</p>
                                                                <p className="text-xl font-bold text-rose-600">₹{totalPenaltyAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white rounded-3xl p-6 px-10 border border-teal-100 shadow-lg shadow-teal-500/5 text-right">
                                                        <p className="text-[11px] font-black text-teal-600 tracking-[0.2em] mb-2">Final Salary After Deduction</p>
                                                        <p className="text-4xl font-black text-teal-600 tracking-tighter">₹{finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </AnimatePresence>

                            {/* Advanced Details Toggle */}
                            <div className="pt-2">
                                <button
                                    onClick={() => setShowDetailedBreakdown(!showDetailedBreakdown)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all text-xs font-bold"
                                >
                                    <motion.span
                                        animate={{ rotate: showDetailedBreakdown ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <List size={10} />
                                    </motion.span>
                                    {showDetailedBreakdown ? 'Hide Detailed Breakdown' : 'Show Detailed Breakdown'}
                                </button>

                                <AnimatePresence>
                                    {showDetailedBreakdown && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                        >
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 py-6 mt-2 border-t border-slate-100">
                                                {[
                                                    { label: 'Total Days', value: reportData.report.summary.totalDaysInPeriod },
                                                    { label: 'Working Days', value: reportData.report.summary.totalWorkingDaysInPeriod },
                                                    { label: 'Absent Days', value: reportData.report.summary.totalAbsentDays },
                                                    { label: 'Leave Days', value: reportData.report.summary.totalLeaveDays },
                                                    { label: 'Holidays', value: reportData.report.summary.totalHolidaysInPeriod },
                                                    { label: 'Sundays', value: reportData.report.summary.totalSundaysInPeriod },
                                                    { label: 'Actual Worked', value: reportData.report.summary.actualWorkingDays },
                                                    { label: 'Working Hours', value: `${(reportData.report.totalWorkingHours || 0).toFixed(2)}h` },
                                                    { label: 'Permission Time', value: `${reportData.report.totalPermissionTime || 0}m` },
                                                    { label: 'Absent Deduction', value: `₹${reportData.report.summary.absentDeduction?.toFixed(2)}`, color: 'text-rose-500' },
                                                    { label: 'Leave Deduction', value: `₹${reportData.report.summary.leaveDeduction?.toFixed(2)}`, color: 'text-rose-500' },
                                                    { label: 'Permission Ded.', value: `₹${reportData.report.summary.permissionDeduction?.toFixed(2)}`, color: 'text-rose-500' },
                                                    { label: 'Total Deductions', value: `₹${reportData.report.totalSalaryDeduction?.toFixed(2)}`, color: 'text-rose-500' },
                                                    { label: 'Attendance Rate', value: `${reportData.report.summary.attendanceRate?.toFixed(2)}%` },
                                                    { label: 'Per Min Salary', value: `₹${reportData.report.summary.perMinuteSalary?.toFixed(4)}` }
                                                ].map((item, idx) => (
                                                    <div key={idx}>
                                                        <p className="text-[10px] font-bold text-slate-400 tracking-wider mb-1">{item.label}</p>
                                                        <p className={`text-sm font-semibold ${item.color || 'text-slate-700'}`}>{item.value || 0}</p>
                                                    </div>
                                                ))}

                                                {/* Extra metrics like Penalized Days if any */}
                                                {reportData.report.summary.penalizedLeaveDays > 0 && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-rose-400 tracking-wider mb-1 text-rose-500">Extra Leaves (2X)</p>
                                                        <p className="text-sm font-bold text-rose-600">{reportData.report.summary.penalizedLeaveDays} Days (₹{reportData.report.summary.penalizedLeaveDeduction.toFixed(2)})</p>
                                                    </div>
                                                )}
                                                {reportData.report.summary.penalizedAbsentDays > 0 && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-rose-400 tracking-wider mb-1 text-rose-500">Extra Absences (2X)</p>
                                                        <p className="text-sm font-bold text-rose-600">{reportData.report.summary.penalizedAbsentDays} Days (₹{reportData.report.summary.penalizedAbsentDeduction.toFixed(2)})</p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Daily Breakdown Table */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-900 tracking-widest">Daily Breakdown</h4>
                                    <div className="h-px flex-1 bg-slate-100 mx-4"></div>
                                </div>
                                <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                                    <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                                            <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                                                <tr>
                                                    {['Date', 'Status', 'Work Type', 'In', 'Out', 'Delay', 'Deduction', 'Salary'].map(h => (
                                                        <th key={h} className="px-4 py-3 text-left font-black text-slate-400 tracking-widest">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 bg-white">
                                                {(reportData.report.report || []).map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                                        <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                                                            {row.penaltyFactor > 1 ? (
                                                                <button
                                                                    onClick={() => setPenaltyExplanation({
                                                                        date: row.date,
                                                                        status: row.status,
                                                                        penaltyFactor: row.penaltyFactor,
                                                                        penaltyReason: row.penaltyReason
                                                                    })}
                                                                    className="flex items-center gap-1.5 hover:text-rose-600 transition-colors group text-left"
                                                                    title="Click to view 2X penalty details"
                                                                >
                                                                    <span>{row.date}</span>
                                                                    <span className="inline-flex items-center px-1 rounded bg-rose-50 text-rose-600 text-[8px] font-black tracking-tighter border border-rose-100 group-hover:bg-rose-100 transition-all cursor-pointer">
                                                                        {row.penaltyFactor}X Penalty
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                row.date
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-bold text-[10px] tracking-tight ${row.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : row.status === 'Absent' ? 'bg-rose-50 text-rose-500' : row.status === 'Sunday' ? 'bg-slate-50 text-slate-400' : row.status === 'Holiday' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col">
                                                                <span className={`font-black text-[9px] tracking-widest ${row.workType === 'PROJECT' ? 'text-teal-600' : 'text-slate-400'}`}>
                                                                    {row.workType}
                                                                </span>
                                                                {row.projectName && <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{row.projectName}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-500 font-medium">{row.inTime}</td>
                                                        <td className="px-4 py-3 text-slate-500 font-medium">{row.outTime}</td>
                                                        <td className="px-4 py-3 text-slate-500 font-medium">{row.delayTime}</td>
                                                        <td className="px-4 py-3 text-rose-500 font-bold">{row.deductionAmount}</td>
                                                        <td className="px-4 py-3 text-emerald-600 font-black">{row.totalSalary}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={downloadPDF}
                                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition-all text-sm font-bold shadow-lg shadow-slate-200 active:scale-95"
                                >
                                    <FileDown size={16} />
                                    <span>Download PDF Report</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteConfirmOpen}
                onClose={cancelRemoveBonus}
                title="Confirm Removal"
                size="sm"
            >
                <div className="text-center py-4">
                    <p className="text-lg mb-6">
                        Are you sure you want to remove the bonus for this worker?
                    </p>
                    <div className="flex justify-center space-x-4">
                        <Button
                            variant="danger"
                            onClick={confirmRemoveBonus}
                        >
                            Yes, Remove
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={cancelRemoveBonus}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={!!penaltyExplanation}
                onClose={() => setPenaltyExplanation(null)}
                title={
                    <div className="flex items-center gap-2 text-rose-600">
                        <AlertTriangle size={18} />
                        <span className="font-black tracking-wider text-xs">Penalty Explanation</span>
                    </div>
                }
                size="sm"
            >
                {penaltyExplanation && (
                    <div className="space-y-4 p-1">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Date</p>
                            <p className="text-sm font-bold text-slate-800">{penaltyExplanation.date}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Status</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-bold text-[10px] tracking-tight ${penaltyExplanation.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : penaltyExplanation.status === 'Absent' ? 'bg-rose-50 text-rose-500' : penaltyExplanation.status === 'Sunday' ? 'bg-slate-50 text-slate-400' : penaltyExplanation.status === 'Holiday' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
                                    {penaltyExplanation.status}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">Deduction Penalty</p>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-black text-[10px] tracking-tight bg-rose-50 text-rose-600">
                                    {penaltyExplanation.penaltyFactor}X Applied
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5">Reason for Multiplier Penalty</p>
                            <div className="bg-rose-50/50 border border-rose-100/50 rounded-xl p-3">
                                <p className="text-xs font-semibold text-rose-700 leading-relaxed">
                                    {penaltyExplanation.penaltyReason || "Deduction policy rules applied."}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setPenaltyExplanation(null)}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-95 transition-all"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SalaryManagement;
