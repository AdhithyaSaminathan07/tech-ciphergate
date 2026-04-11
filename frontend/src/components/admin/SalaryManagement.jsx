// attendance _31/client/src/components/admin/SalaryManagement.jsx
import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaDonate, FaFileInvoiceDollar, FaFilePdf, FaTrash, FaCalendarAlt, FaList } from 'react-icons/fa';
import { FiRefreshCcw } from "react-icons/fi";
import { getWorkers } from '../../services/workerService';
import { getDepartments } from '../../services/departmentService';
import Card from '../common/Card';
import Button from '../common/Button';
import Table from '../common/Table';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { giveBonusAmount, removeBonusAmount, resetSalaryAmount, getSalaryReport } from '../../services/salaryService';
import { deleteFine, getAllFines } from '../../services/fineService';
import { getAllHolidays } from '../../services/holidayService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AddFineModal from './modals/AddFineModal';

const SalaryManagement = () => {
    const [workers, setWorkers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
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

    const { subdomain } = useContext(appContext);

    const loadData = async () => {
        setIsLoading(true);
        setIsLoadingDepartments(true);

        try {
            const [workersData, departmentsData] = await Promise.all([
                getWorkers({ subdomain }),
                getDepartments({ subdomain })
            ]);
            const safeWorkersData = Array.isArray(workersData) ? workersData : [];
            const safeDepartmentsData = Array.isArray(departmentsData) ? departmentsData : [];
            setWorkers(safeWorkersData);
            setDepartments(safeDepartmentsData);
        } catch (error) {
            toast.error('Failed to load data');
            console.error(error);
            setWorkers([]);
            setDepartments([]);
        } finally {
            setIsLoading(false);
            setIsLoadingDepartments(false);
        }
    };

    useEffect(() => {
        loadData();
        // Set initial date range to current month
        setMonthDateRange();
    }, []);

    const filteredWorkers = Array.isArray(workers)
        ? workers.filter(
            worker =>
                worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (worker.department && worker.department.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        : [];

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

    const openEditModal = (worker) => {
        const departmentId = typeof worker.department === 'object'
            ? worker.department._id
            : (departments.find(dept => dept.name === worker.department)?._id || worker.department);
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
    };

    const fetchReport = async () => {
        // If using month selection, set the date range first
        if (useMonthSelection) {
            setMonthDateRange();
        }

        if (!reportDateRange.fromDate || !reportDateRange.toDate) {
            toast.error('Please select a date range.');
            return;
        }
        setIsReportLoading(true);
        try {
            const data = await getSalaryReport(selectedWorker._id, reportDateRange.fromDate, reportDateRange.toDate);
            setReportData(data);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch report');
            setReportData(null);
        } finally {
            setIsReportLoading(false);
        }
    };

    const downloadPDF = () => {
        if (!reportData || !selectedWorker) {
            toast.error("No report data available to download.");
            return;
        }
        const doc = new jsPDF();
        const startY = 20;
        doc.setFontSize(18);
        doc.text(`Salary Report for ${selectedWorker.name}`, 14, startY);
        doc.setFontSize(12);
        doc.text('Summary', 14, startY + 15);

        // Prepare summary data including bonus and fine information
        // Fix currency formatting to ensure clean, professional appearance
        // Updated to use "Rs." instead of "₹" symbol as per requirements
        const formatCurrencyForPDF = (amount) => {
            // Handle different input types
            if (typeof amount === 'string') {
                // If it's already a formatted string, extract the numeric value and reformat it properly
                const numericValue = parseFloat(amount.replace(/[₹Rs.,\s]/g, ''));
                if (isNaN(numericValue)) {
                    return 'Rs. 0.00';
                }
                return `Rs. ${numericValue.toFixed(2)}`;
            }
            // If it's a number, format it properly
            return `Rs. ${Number(amount).toFixed(2)}`;
        };

        const summaryData = [
            ['Employee Name', selectedWorker?.name], // Added Employee Name to match UI
            ['Employee ID', selectedWorker?.rfid],
            ['Original Salary', formatCurrencyForPDF(reportData.report.summary?.originalSalary || 0)],
            ['Actual Earned Salary', formatCurrencyForPDF(reportData.report.summary?.finalSalary || 0)],
            // ADD FINE INFORMATION TO THE SUMMARY
            ...(reportData.totalFinesAmount > 0 ? [
                ['Total Fines', formatCurrencyForPDF(reportData.totalFinesAmount)]
            ] : []),
            ['Total Final Salary', formatCurrencyForPDF(reportData.finalSalaryWithFines || 0)],
            ['Total Days in Period', reportData.report.summary?.totalDaysInPeriod || 0],
            ['Total Working Days', reportData.report.summary?.totalWorkingDaysInPeriod || 0],
            ['Total Absent Days', reportData.report.summary?.totalAbsentDays || 0],
            ['Total Leave Days', reportData.report.summary?.totalLeaveDays || 0],
            ['Total Holidays', reportData.report.summary?.totalHolidaysInPeriod || 0],
            ['Total Sundays', reportData.report.summary?.totalSundaysInPeriod || 0],
            ['Actual Working Days', reportData.report.summary?.actualWorkingDays || 0],
            ['Total Working Hours', `${Number(reportData.report.totalWorkingHours || 0).toFixed(2)} hrs`],
            ['Total Permission Time', `${reportData.report.totalPermissionTime || 0} mins`],
            ['Absent Deduction', formatCurrencyForPDF(reportData.report.summary?.absentDeduction || 0)],
            ['Leave Deduction', formatCurrencyForPDF(reportData.report.summary?.leaveDeduction || 0)],
            ['Permission Deduction', formatCurrencyForPDF(reportData.report.summary?.permissionDeduction || 0)],
            ['Total Deductions', formatCurrencyForPDF(reportData.report.totalSalaryDeduction || 0)],
            ['Attendance Rate', `${Number(reportData.report.summary?.attendanceRate || 0).toFixed(2)}%`],
            ['Per Minute Salary', `Rs. ${Number(reportData.report.summary?.perMinuteSalary || 0).toFixed(4)}`],
        ];

        // Add bonus information if available
        if (reportData.totalBonusAmount > 0) {
            summaryData.push(['Bonus Amount Applied', formatCurrencyForPDF(reportData.totalBonusAmount)]);

            // Add details of each bonus
            reportData.bonuses.forEach((bonus, index) => {
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
        if (reportData.totalBonusAmount > 0 && reportData.bonuses && reportData.bonuses.length > 0) {
            doc.addPage();
            doc.setFontSize(18);
            doc.text('Bonus Details', 14, 20);

            const bonusColumns = ['Period', 'From Date', 'To Date', 'Amount'];
            const bonusRows = reportData.bonuses.map((bonus, index) => [
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
        if (reportData.worker?.fines && reportData.worker.fines.length > 0) {
            const filteredFines = reportData.worker.fines.filter(fine => {
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
        const tableRows = reportData.report.report.map(row => [
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
        doc.save(`salary_report_${selectedWorker.name}.pdf`);
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
        if (selectedWorkersForReport.length === filteredWorkers.length) {
            setSelectedWorkersForReport([]);
        } else {
            setSelectedWorkersForReport(filteredWorkers.map(w => w._id));
        }
    };

    const generateBulkReport = async () => {
        if (selectedWorkersForReport.length === 0) {
            toast.error('Please select at least one worker.');
            return;
        }

        setIsBulkReportLoading(true);
        try {
            const reportPromises = selectedWorkersForReport.map(async (workerId) => {
                const worker = workers.find(w => w._id === workerId);
                if (!worker) return null;

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

                try {
                    const report = await getSalaryReport(workerId, fromDate, toDate);
                    return {
                        workerId: worker._id,
                        name: worker.name,
                        department: worker.department?.name || worker.department || 'N/A',
                        totalWorkingDays: report.report.summary?.totalWorkingDaysInPeriod || 0,
                        totalAbsentDays: report.report.summary?.totalAbsentDays || 0,
                        totalLeaveDays: report.report.summary?.totalLeaveDays || 0,
                        totalFinalSalary: report.finalSalaryWithFines || 0
                    };
                } catch (error) {
                    console.error(`Failed to fetch report for worker ${workerId}:`, error);
                    return {
                        workerId: worker._id,
                        name: worker.name,
                        department: worker.department?.name || worker.department || 'N/A',
                        totalWorkingDays: 0,
                        totalAbsentDays: 0,
                        totalFinalSalary: 0
                    };
                }
            });

            const reports = await Promise.all(reportPromises);
            const validReports = reports.filter(r => r !== null);
            setBulkReportData(validReports);
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
                // If it's already a formatted string, extract the numeric value and reformat it properly
                const numericValue = parseFloat(amount.replace(/[₹Rs.,\s]/g, ''));
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
            ['Original Salary', formatCurrencyForPDF(individualReportData.report.summary?.originalSalary || 0)],
            ['Actual Earned Salary', formatCurrencyForPDF(individualReportData.report.summary?.finalSalary || 0)],
            // ADD FINE INFORMATION TO THE SUMMARY
            ...(individualReportData.totalFinesAmount > 0 ? [
                ['Total Fines', formatCurrencyForPDF(individualReportData.totalFinesAmount)]
            ] : []),
            ['Total Final Salary', formatCurrencyForPDF(individualReportData.finalSalaryWithFines || 0)],
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
            ['Total Deductions', formatCurrencyForPDF(individualReportData.report.totalSalaryDeduction || 0)],
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
            header: 'Salary',
            accessor: 'salary',
            render: (record) => record?.salary?.toFixed(2)
        },
        {
            header: 'Salary (this month)',
            accessor: 'finalSalary',
            render: (record) => record?.finalSalary?.toFixed(2)
        },
        // ADD NEW COLUMN FOR FINE AMOUNT
        {
            header: 'Fine for this month',
            accessor: 'fineAmount',
            render: (record) => {
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                const fineAmount = calculateMonthlyFines(record, currentMonth, currentYear);
                return fineAmount > 0 ? (
                    <span className="text-red-600 font-medium">₹{fineAmount.toFixed(2)}</span>
                ) : (
                    <span className="text-gray-400">₹0.00</span>
                );
            }
        },
        {
            header: 'Employee ID',
            accessor: 'rfid'
        },
        {
            header: 'Department',
            accessor: 'department'
        },
        {
            header: 'Actions',
            accessor: 'actions',
            render: (worker) => (
                <div className="flex space-x-2">
                    <button
                        onClick={() => openEditModal(worker)}
                        className="p-1 text-blue-600 hover:text-blue-800"
                        title="Give Bonus"
                    >
                        <FaDonate className='text-xl' />
                    </button>
                    <button
                        onClick={() => handleViewReport(worker)}
                        className="p-1 text-green-600 hover:text-green-800"
                        title="View Report"
                    >
                        <FaFileInvoiceDollar className='text-xl' />
                    </button>
                    <button
                        onClick={() => handleRemoveBonus(worker)}
                        className="p-1 text-red-600 hover:text-red-800"
                        title="Remove Bonus"
                    >
                        <FaTrash className='text-xl' />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div>
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold">Salary Management</h1>
                {/* MOBILE BUTTONS: Show only on mobile */}
                <div className="md:hidden flex flex-col space-y-2">
                    <Button
                        variant="secondary"
                        className='flex items-center justify-center'
                        onClick={openBulkReportModal}
                    >
                        <FaList className="mr-2" /> View All Reports
                    </Button>
                    <Button
                        variant="secondary"
                        className='flex items-center justify-center'
                        onClick={() => setIsFineModalOpen(true)}
                    >
                        Fine
                    </Button>
                    <Button
                        variant="primary"
                        className='flex items-center justify-center'
                        onClick={handleSalaryReset}
                    >
                        <FiRefreshCcw className="mr-2" /> Reset Salary
                    </Button>
                </div>
            </div>

            {/* DESKTOP BUTTONS: Show only on desktop */}
            <div className="hidden md:flex justify-end items-center mb-6 space-x-2">
                <Button
                    variant="secondary"
                    className='flex items-center'
                    onClick={openBulkReportModal}
                >
                    <FaList className="mr-2" /> View All Reports
                </Button>
                <Button
                    variant="secondary"
                    className='flex items-center'
                    onClick={() => setIsFineModalOpen(true)}
                >
                    Fine
                </Button>
                <Button
                    variant="primary"
                    className='flex items-center'
                    onClick={handleSalaryReset}
                >
                    <FiRefreshCcw className="mr-2" /> Reset Salary
                </Button>
            </div>
            {/* FINE FILTER PANEL */}
            <Card className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Fine Filter</h3>
                    <button
                        onClick={toggleFineFilterPanel}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                        {isFineFilterOpen ? 'Hide Fine Filter' : 'Show Fine Filter'}
                    </button>
                </div>

                {isFineFilterOpen && (
                    <div className="mt-4">
                        <form onSubmit={handleFineFilterSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                    <select
                                        value={selectedFineMonth}
                                        onChange={(e) => setSelectedFineMonth(e.target.value)}
                                        className="form-input"
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                    <select
                                        value={selectedFineYear}
                                        onChange={(e) => setSelectedFineYear(e.target.value)}
                                        className="form-input"
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
                                        className="btn btn-primary w-full"
                                        disabled={isLoadingFines}
                                    >
                                        {isLoadingFines ? 'Loading...' : 'Apply Filter'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {finesData.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-md font-medium mb-2">Fines Summary</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div className="bg-blue-50 p-3 rounded">
                                        <p className="text-sm text-gray-600">Total Fines</p>
                                        <p className="text-xl font-bold text-blue-700">{finesData.length}</p>
                                    </div>
                                    <div className="bg-red-50 p-3 rounded">
                                        <p className="text-sm text-gray-600">Total Amount</p>
                                        <p className="text-xl font-bold text-red-700">
                                            ₹{finesData.reduce((sum, fine) => sum + fine.amount, 0).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-yellow-50 p-3 rounded">
                                        <p className="text-sm text-gray-600">Unique Workers</p>
                                        <p className="text-xl font-bold text-yellow-700">
                                            {[...new Set(finesData.map(fine => fine.workerId))].length}
                                        </p>
                                    </div>
                                </div>

                                <h4 className="text-md font-medium mb-2">Recent Fines</h4>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                                                            <FaTrash />
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
                )}
            </Card>
            <Card>
                <div className="mb-4">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search by name or department..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
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
                onFineAdded={loadData}
            />

            {/* BULK REPORT MODAL */}
            <Modal
                isOpen={isBulkReportModalOpen}
                onClose={() => setIsBulkReportModalOpen(false)}
                title="View All Employees Salary Report"
                size="xl"
            >
                <div>
                    <div className="flex space-x-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                            <select
                                value={selectedMonth}
                                onChange={handleMonthChange}
                                className="form-input"
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
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                            <select
                                value={selectedYear}
                                onChange={handleYearChange}
                                className="form-input"
                            >
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-medium">Select Employees</h3>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleAllWorkersSelection}
                            >
                                {selectedWorkersForReport.length === filteredWorkers.length ? 'Deselect All' : 'Select All'}
                            </Button>
                        </div>
                        <div className="max-h-96 overflow-y-auto border rounded-lg">
                            {filteredWorkers.map(worker => (
                                <div
                                    key={worker._id}
                                    className={`p-3 border-b flex items-center ${selectedWorkersForReport.includes(worker._id) ? 'bg-blue-50' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedWorkersForReport.includes(worker._id)}
                                        onChange={() => toggleWorkerSelection(worker._id)}
                                        className="mr-3"
                                    />
                                    <div className="flex items-center">
                                        {worker?.photo && (
                                            <img
                                                src={worker.photo
                                                    ? worker.photo
                                                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`}
                                                alt="Employee"
                                                className="w-8 h-8 rounded-full mr-2"
                                            />
                                        )}
                                        <div>
                                            <div className="font-medium">{worker.name}</div>
                                            <div className="text-sm text-gray-500">{worker.department?.name || worker.department}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            onClick={generateBulkReport}
                            disabled={isBulkReportLoading}
                        >
                            {isBulkReportLoading ? <Spinner size="sm" /> : 'View Reports'}
                        </Button>
                    </div>

                    {bulkReportData.length > 0 && (
                        <div className="mt-6">
                            <h3 className="text-lg font-medium mb-4">Selected Employees Report</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Working Days</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Absent Days</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Salary</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {bulkReportData.map((report, index) => (
                                            <tr key={index}>
                                                <td className="px-6 py-4 whitespace-nowrap">{report.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">{report.department}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">{report.totalWorkingDays}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">{report.totalAbsentDays}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">₹{report.totalFinalSalary.toFixed(2)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => openIndividualReport(report)}
                                                    >
                                                        View Report
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* INDIVIDUAL REPORT MODAL */}
            <Modal
                isOpen={isIndividualReportModalOpen}
                onClose={() => {
                    setIsIndividualReportModalOpen(false);
                    setIndividualReportData(null);
                    setSelectedIndividualWorker(null);
                }}
                title={`Salary Report for ${selectedIndividualWorker?.name || ''}`}
                size="xl"
            >
                {isIndividualReportLoading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="lg" />
                    </div>
                ) : individualReportData ? (
                    <div>
                        <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                            <div>
                                <p><strong>Name:</strong> {selectedIndividualWorker.name}</p>
                                <p><strong>Department:</strong> {selectedIndividualWorker.department}</p>
                            </div>
                            <div>
                                <p><strong>Working Days:</strong> {selectedIndividualWorker.totalWorkingDays}</p>
                                <p><strong>Absent Days:</strong> {selectedIndividualWorker.totalAbsentDays}</p>
                                <p><strong>Final Salary:</strong> ₹{selectedIndividualWorker.totalFinalSalary.toFixed(2)}</p>
                            </div>
                        </div>

                        <Card className="mb-6">
                            <h3 className="text-xl font-semibold mb-4">Summary</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p><strong>Employee Name:</strong> {selectedIndividualWorker?.name}</p>
                                    <p><strong>Employee ID:</strong> {workers.find(w => w._id === selectedIndividualWorker.workerId)?.rfid || 'N/A'}</p>
                                </div>
                                <div>
                                    <p><strong>Original Salary:</strong> ₹{individualReportData.report.summary.originalSalary?.toFixed(2) || '0.00'}</p>
                                    <p><strong>Actual Earned Salary:</strong> ₹{individualReportData.report.summary.finalSalary?.toFixed(2) || '0.00'}</p>
                                    {/* ADD FINE INFORMATION TO THE SUMMARY */}
                                    {individualReportData.totalFinesAmount > 0 && (
                                        <p><strong>Total Fines:</strong> <span className="text-red-600">₹{individualReportData.totalFinesAmount.toFixed(2)}</span></p>
                                    )}
                                    {individualReportData.totalBonusAmount > 0 && (
                                        <p><strong>Bonus Amount Applied:</strong> <span className="text-green-600">₹{individualReportData.totalBonusAmount.toFixed(2)}</span></p>
                                    )}
                                    <p><strong>Total Final Salary:</strong> <span className="font-bold">₹{individualReportData.finalSalaryWithFines?.toFixed(2) || '0.00'}</span></p>
                                </div>
                            </div>
                            <hr className="my-4" />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p><strong>Total Days in Period:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalDaysInPeriod || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Working Days:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalWorkingDaysInPeriod || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Absent Days:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalAbsentDays || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Leave Days:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalLeaveDays || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Holidays:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalHolidaysInPeriod || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Sundays:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.totalSundaysInPeriod || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Actual Working Days:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.actualWorkingDays || 0}</span>
                                </div>
                                <div>
                                    <p><strong>Total Working Hours:</strong></p>
                                    <span className="font-bold">{(individualReportData.report.totalWorkingHours || 0).toFixed(2)} hrs</span>
                                </div>
                                <div>
                                    <p><strong>Total Permission Time:</strong></p>
                                    <span className="font-bold">{individualReportData.report.totalPermissionTime || 0} mins</span>
                                </div>
                                <div>
                                    <p><strong>Absent Deduction:</strong></p>
                                    <span className="font-bold">₹{individualReportData.report.summary.absentDeduction?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div>
                                    <p><strong>Leave Deduction:</strong></p>
                                    <span className="font-bold">₹{individualReportData.report.summary.leaveDeduction?.toFixed(2) || '0.00'}</span>
                                </div>
                                {individualReportData.report.summary.penalizedLeaveDays > 0 && (
                                    <div className="bg-red-50 p-1 rounded border border-red-100">
                                        <p className="text-red-600 text-[10px] uppercase font-bold tracking-wider">Extra Leaves (2X)</p>
                                        <span className="font-bold text-red-700">{individualReportData.report.summary.penalizedLeaveDays} Days (₹{individualReportData.report.summary.penalizedLeaveDeduction.toFixed(2)})</span>
                                    </div>
                                )}
                                {individualReportData.report.summary.penalizedAbsentDays > 0 && (
                                    <div className="bg-red-50 p-1 rounded border border-red-100">
                                        <p className="text-red-600 text-[10px] uppercase font-bold tracking-wider">Extra Absences (2X)</p>
                                        <span className="font-bold text-red-700">{individualReportData.report.summary.penalizedAbsentDays} Days (₹{individualReportData.report.summary.penalizedAbsentDeduction.toFixed(2)})</span>
                                    </div>
                                )}
                                <div>
                                    <p><strong>Permission Deduction:</strong></p>
                                    <span className="font-bold">₹{individualReportData.report.summary.permissionDeduction?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div>
                                    <p><strong>Total Deductions:</strong></p>
                                    <span className="font-bold">₹{individualReportData.report.totalSalaryDeduction?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div>
                                    <p><strong>Attendance Rate:</strong></p>
                                    <span className="font-bold">{individualReportData.report.summary.attendanceRate?.toFixed(2) || '0.00'}%</span>
                                </div>
                                <div>
                                    <p><strong>Per Minute Salary:</strong></p>
                                    <span className="font-bold">₹{individualReportData.report.summary.perMinuteSalary?.toFixed(4) || '0.0000'}</span>
                                </div>
                                {/* Display bonus information */}
                                {individualReportData.totalBonusAmount > 0 && (
                                    <>
                                        <div>
                                            <p><strong>Bonus Amount Applied:</strong></p>
                                            <span className="font-bold text-green-600">₹{individualReportData.totalBonusAmount.toFixed(2)}</span>
                                        </div>
                                        {individualReportData.bonuses.map((bonus, index) => (
                                            <div key={index}>
                                                <p><strong>Bonus Period {index + 1}:</strong></p>
                                                <span className="font-bold">{new Date(bonus.fromDate).toLocaleDateString()} to {new Date(bonus.toDate).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {/* Display fine information */}
                                {individualReportData.totalFinesAmount > 0 && (
                                    <div>
                                        <p><strong>Total Fines:</strong></p>
                                        <span className="font-bold text-red-600">₹{individualReportData.totalFinesAmount.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </Card>
                        {/* ADD FINES DISPLAY SECTION */}
                        {individualReportData.worker?.fines && individualReportData.worker.fines.length > 0 && (
                            <Card className="mb-6">
                                <h3 className="text-xl font-semibold mb-4">Fines</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {individualReportData.worker.fines
                                                .filter(fine => {
                                                    const fineDate = new Date(fine.date);
                                                    const fromDate = new Date(reportDateRange.fromDate);
                                                    const toDate = new Date(reportDateRange.toDate);
                                                    return fineDate >= fromDate && fineDate <= toDate;
                                                })
                                                .map((fine) => (
                                                    <tr key={fine._id}>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {new Date(fine.date).toLocaleDateString()}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className="text-red-600 font-medium">₹{fine.amount.toFixed(2)}</span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {fine.reason}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <button
                                                                onClick={() => handleDeleteFine(selectedIndividualWorker.workerId, fine._id)}
                                                                className="text-red-600 hover:text-red-900"
                                                                title="Delete Fine"
                                                            >
                                                                <FaTrash />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}
                        <Card>
                            <h3 className="text-xl font-semibold mb-4">Daily Breakdown</h3>
                            <Table
                                columns={[
                                    { header: 'Date', accessor: 'date' },
                                    { header: 'Status', accessor: 'status' },
                                    { header: 'In Time', accessor: 'inTime' },
                                    { header: 'Out Time', accessor: 'outTime' },
                                    { header: 'Delay Time', accessor: 'delayTime' },
                                    { header: 'Delay Deduction', accessor: 'deductionAmount' },
                                    { header: 'Total Salary', accessor: 'totalSalary' }
                                ]}
                                data={individualReportData.report.report}
                                noDataMessage="No daily records found for this period."
                            />
                        </Card>
                        <div className="flex justify-end mt-4">
                            <Button onClick={downloadIndividualPDF} variant="outline" className="flex items-center">
                                <FaFilePdf className="mr-2" /> Download PDF
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p>No report data available.</p>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title={`Salary Report for ${selectedWorker?.name}`}
                size="xl"
            >
                <div>
                    <div className="flex items-center mb-4">
                        <button
                            onClick={toggleDateSelection}
                            className="px-3 py-1 bg-blue-500 text-white rounded mr-2"
                        >
                            {useMonthSelection ? 'Switch to Date Range' : 'Switch to Month Selection'}
                        </button>
                    </div>

                    {useMonthSelection ? (
                        <div className="flex space-x-4 mb-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                <select
                                    value={selectedMonth}
                                    onChange={handleMonthChange}
                                    className="form-input"
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
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                <select
                                    value={selectedYear}
                                    onChange={handleYearChange}
                                    className="form-input"
                                >
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <Button onClick={() => {
                                setMonthDateRange();
                                fetchReport();
                            }} variant="primary">
                                {isReportLoading ? <Spinner /> : 'Generate Report'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex space-x-4 mb-4">
                            <input
                                type="date"
                                name="fromDate"
                                value={reportDateRange.fromDate}
                                onChange={handleReportDateChange}
                                className="form-input"
                            />
                            <input
                                type="date"
                                name="toDate"
                                value={reportDateRange.toDate}
                                onChange={handleReportDateChange}
                                className="form-input"
                            />
                            <Button onClick={fetchReport} variant="primary">
                                {isReportLoading ? <Spinner /> : 'Generate Report'}
                            </Button>
                        </div>
                    )}

                    {isReportLoading && !reportData && (
                        <div className="flex justify-center py-8">
                            <Spinner size="lg" />
                        </div>
                    )}
                    {reportData && (
                        <div>
                            <Card className="mb-6">
                                <h3 className="text-xl font-semibold mb-4">Summary</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p><strong>Employee Name:</strong> {selectedWorker?.name}</p>
                                        <p><strong>Employee ID:</strong> {selectedWorker?.rfid}</p>
                                    </div>
                                    <div>
                                        <p><strong>Original Salary:</strong> ₹{reportData.report.summary.originalSalary?.toFixed(2) || '0.00'}</p>
                                        <p><strong>Actual Earned Salary:</strong> ₹{reportData.report.summary.finalSalary?.toFixed(2) || '0.00'}</p>
                                        {/* ADD FINE INFORMATION TO THE SUMMARY */}
                                        {reportData.totalFinesAmount > 0 && (
                                            <p><strong>Total Fines:</strong> <span className="text-red-600">₹{reportData.totalFinesAmount.toFixed(2)}</span></p>
                                        )}
                                        {reportData.totalBonusAmount > 0 && (
                                            <p><strong>Bonus Amount Applied:</strong> <span className="text-green-600">₹{reportData.totalBonusAmount.toFixed(2)}</span></p>
                                        )}
                                        <p><strong>Total Final Salary:</strong> <span className="font-bold">₹{reportData.finalSalaryWithFines?.toFixed(2) || '0.00'}</span></p>
                                    </div>
                                </div>
                                <hr className="my-4" />
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p><strong>Total Days in Period:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalDaysInPeriod || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Working Days:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalWorkingDaysInPeriod || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Absent Days:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalAbsentDays || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Leave Days:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalLeaveDays || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Holidays:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalHolidaysInPeriod || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Sundays:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.totalSundaysInPeriod || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Actual Working Days:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.actualWorkingDays || 0}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Working Hours:</strong></p>
                                        <span className="font-bold">{(reportData.report.totalWorkingHours || 0).toFixed(2)} hrs</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Permission Time:</strong></p>
                                        <span className="font-bold">{reportData.report.totalPermissionTime || 0} mins</span>
                                    </div>
                                    <div>
                                        <p><strong>Absent Deduction:</strong></p>
                                        <span className="font-bold">₹{reportData.report.summary.absentDeduction?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div>
                                        <p><strong>Leave Deduction:</strong></p>
                                        <span className="font-bold">₹{reportData.report.summary.leaveDeduction?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    {reportData.report.summary.penalizedLeaveDays > 0 && (
                                        <div className="bg-red-50 p-1 rounded border border-red-100">
                                            <p className="text-red-600 text-[10px] uppercase font-bold tracking-wider">Extra Leaves (2X)</p>
                                            <span className="font-bold text-red-700">{reportData.report.summary.penalizedLeaveDays} Days (₹{reportData.report.summary.penalizedLeaveDeduction.toFixed(2)})</span>
                                        </div>
                                    )}
                                    {reportData.report.summary.penalizedAbsentDays > 0 && (
                                        <div className="bg-red-50 p-1 rounded border border-red-100">
                                            <p className="text-red-600 text-[10px] uppercase font-bold tracking-wider">Extra Absences (2X)</p>
                                            <span className="font-bold text-red-700">{reportData.report.summary.penalizedAbsentDays} Days (₹{reportData.report.summary.penalizedAbsentDeduction.toFixed(2)})</span>
                                        </div>
                                    )}
                                    <div>
                                        <p><strong>Permission Deduction:</strong></p>
                                        <span className="font-bold">₹{reportData.report.summary.permissionDeduction?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div>
                                        <p><strong>Total Deductions:</strong></p>
                                        <span className="font-bold">₹{reportData.report.totalSalaryDeduction?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div>
                                        <p><strong>Attendance Rate:</strong></p>
                                        <span className="font-bold">{reportData.report.summary.attendanceRate?.toFixed(2) || '0.00'}%</span>
                                    </div>
                                    <div>
                                        <p><strong>Per Minute Salary:</strong></p>
                                        <span className="font-bold">₹{reportData.report.summary.perMinuteSalary?.toFixed(4) || '0.0000'}</span>
                                    </div>
                                    {/* Display bonus information */}
                                    {reportData.totalBonusAmount > 0 && (
                                        <>
                                            <div>
                                                <p><strong>Bonus Amount Applied:</strong></p>
                                                <span className="font-bold text-green-600">₹{reportData.totalBonusAmount.toFixed(2)}</span>
                                            </div>
                                            {reportData.bonuses.map((bonus, index) => (
                                                <div key={index}>
                                                    <p><strong>Bonus Period {index + 1}:</strong></p>
                                                    <span className="font-bold">{new Date(bonus.fromDate).toLocaleDateString()} to {new Date(bonus.toDate).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {/* Display fine information */}
                                    {reportData.totalFinesAmount > 0 && (
                                        <div>
                                            <p><strong>Total Fines:</strong></p>
                                            <span className="font-bold text-red-600">₹{reportData.totalFinesAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            </Card>
                            {/* ADD FINES DISPLAY SECTION */}
                            {reportData.worker?.fines && reportData.worker.fines.length > 0 && (
                                <Card className="mb-6">
                                    <h3 className="text-xl font-semibold mb-4">Fines</h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {reportData.worker.fines
                                                    .filter(fine => {
                                                        const fineDate = new Date(fine.date);
                                                        const fromDate = new Date(reportDateRange.fromDate);
                                                        const toDate = new Date(reportDateRange.toDate);
                                                        return fineDate >= fromDate && fineDate <= toDate;
                                                    })
                                                    .map((fine) => (
                                                        <tr key={fine._id}>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {new Date(fine.date).toLocaleDateString()}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className="text-red-600 font-medium">₹{fine.amount.toFixed(2)}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {fine.reason}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <button
                                                                    onClick={() => handleDeleteFine(selectedWorker._id, fine._id)}
                                                                    className="text-red-600 hover:text-red-900"
                                                                    title="Delete Fine"
                                                                >
                                                                    <FaTrash />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}
                            <Card>
                                <h3 className="text-xl font-semibold mb-4">Daily Breakdown</h3>
                                <Table
                                    columns={[
                                        { header: 'Date', accessor: 'date' },
                                        { header: 'Status', accessor: 'status' },
                                        { header: 'In Time', accessor: 'inTime' },
                                        { header: 'Out Time', accessor: 'outTime' },
                                        { header: 'Delay Time', accessor: 'delayTime' },
                                        { header: 'Delay Deduction', accessor: 'deductionAmount' },
                                        { header: 'Total Salary', accessor: 'totalSalary' }
                                    ]}
                                    data={reportData.report.report}
                                    noDataMessage="No daily records found for this period."
                                />
                            </Card>
                            <div className="flex justify-end mt-4">
                                <Button onClick={downloadPDF} variant="outline" className="flex items-center">
                                    <FaFilePdf className="mr-2" /> Download PDF
                                </Button>
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
        </div>
    );
};

export default SalaryManagement;
