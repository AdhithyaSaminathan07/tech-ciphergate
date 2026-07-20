import React, { Fragment, useRef, useState, useEffect, useContext, useCallback } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Webcam from "react-webcam";
import jsQR from "jsqr";
import appContext from '../../context/AppContext';
import { toast } from 'react-toastify';
import { putAttendance, getAttendance, getPaginatedAttendance, getWorkerLastAttendance } from '../../services/attendanceService';
import Table from '../common/Table';
import Spinner from '../common/Spinner';
import { Link } from 'react-router-dom';
import FaceAttendance from './FaceAttendance';
import api from '../../services/api';
import BottomSheet from '../common/BottomSheet';
import { Filter, Search, RotateCcw, Plus, Camera, Download, AlertTriangle, ChevronDown, Hash, Building2 } from 'lucide-react';

const AttendanceManagement = () => {
    const [worker, setWorker] = useState({ rfid: "" });
    const [qrText, setQrText] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFaceAttendanceOpen, setIsFaceAttendanceOpen] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchName, setSearchName] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterRfid, setFilterRfid] = useState('');
    const webcamRef = useRef(null);
    const inputRef = useRef(null);
    const [isPunching, setIsPunching] = useState(false);
    const [isDetectingAction, setIsDetectingAction] = useState(false); // guard double-click on Submit
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    // New state variables for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    const { subdomain } = useContext(appContext);
    const [confirmAction, setConfirmAction] = useState(null);
    const [accessControl, setAccessControl] = useState({ addAttendance: true, faceAttendance: true });

    const uniqueRfids = React.useMemo(() => {
        const rfids = attendanceData.map(record => record.rfid).filter(rfid => rfid && rfid.trim() !== '');
        console.log("All RFIDs:", rfids);
        const unique = [...new Set(rfids)];
        console.log("Unique RFIDs:", unique);
        return unique;
    }, [attendanceData]);

    const fetchAttendanceData = async (page = 1, append = false) => {
        if (!subdomain || subdomain === 'main') return;

        try {
            if (append) {
                setIsFetchingMore(true);
            } else {
                setIsLoading(true);
            }

            const data = await getPaginatedAttendance({ subdomain, page, limit: 2 });
            const rawData = Array.isArray(data.attendance) ? data.attendance : [];

            if (append) {
                // Append new data to existing data
                setAttendanceData(prevData => [...prevData, ...rawData]);
            } else {
                // Replace existing data
                setAttendanceData(rawData);
            }

            setHasMore(data.hasMore);
            setCurrentPage(page);
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch attendance data.");
        } finally {
            setIsLoading(false);
            setIsFetchingMore(false);
        }
    };

    // Load initial data
    useEffect(() => {
        if (subdomain && subdomain !== 'main') {
            fetchAttendanceData(1, false);

            // Fetch access control settings
            api.get(`/settings/${subdomain}`)
                .then(res => {
                    if (res.data?.attendanceAccessControl?.admin) {
                        setAccessControl(res.data.attendanceAccessControl.admin);
                    }
                })
                .catch(err => console.error("Failed to fetch settings:", err));
        }
    }, [subdomain]);

    // Function to load more data
    const loadMoreAttendance = () => {
        if (hasMore && !isFetchingMore) {
            fetchAttendanceData(currentPage + 1, true);
        }
    };

    // Function to refresh the latest attendance records (for real-time updates)
    const refreshLatestAttendance = useCallback(async () => {
        if (!subdomain || subdomain === 'main') return;

        try {
            const data = await getPaginatedAttendance({ subdomain, page: 1, limit: 2 });
            const rawData = Array.isArray(data.attendance) ? data.attendance : [];

            // Update only the first page of data to show latest records at the top
            setAttendanceData(prevData => {
                // Get existing data that's not part of the first page
                const existingOtherPages = prevData.filter(record => {
                    // This is a simplified approach - in a real implementation, you might want to track
                    // which records belong to which date groups
                    return !rawData.some(newRecord => newRecord._id === record._id);
                });

                // Combine new first page with existing other pages
                return [...rawData, ...existingOtherPages];
            });
        } catch (error) {
            console.error("Failed to refresh latest attendance:", error);
        }
    }, [subdomain]);

    const handleSubmit = async e => {
        e.preventDefault();
        if (isDetectingAction) return; // prevent double-click

        if (!subdomain || subdomain === 'main') {
            toast.error('Subdomain not found, check the URL.');
            return;
        }
        if (!worker.rfid.trim()) {
            toast.error('Enter the RFID');
            return;
        }

        setIsDetectingAction(true);
        try {
            // ✅ Always fetch the latest record live — never rely on stale paginated state
            const todayIST = new Date().toLocaleDateString('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            let next = 'Punch In'; // safe default

            try {
                const liveData = await getWorkerLastAttendance(worker.rfid.trim(), subdomain);
                const lastRecord = liveData.lastAttendance;

                if (!lastRecord) {
                    // No attendance ever → first punch is IN
                    next = 'Punch In';
                } else if (lastRecord.date !== todayIST) {
                    // Last punch was on a PREVIOUS day → today starts fresh with IN
                    next = 'Punch In';
                } else {
                    // Last punch was TODAY:
                    // presence=true  (IN)  → next must be OUT
                    // presence=false (OUT) → next must be IN
                    next = lastRecord.presence ? 'Punch Out' : 'Punch In';
                }

                console.log('[Attendance] Last record date:', lastRecord?.date, 'Today:', todayIST, '→ next action:', next);
            } catch (fetchErr) {
                // Fallback: use count parity from local data if live fetch fails
                console.warn('[Attendance] Live fetch failed, falling back to local count:', fetchErr);
                const recs = attendanceData.filter(r => r.rfid === worker.rfid.trim());
                const todayRecs = recs.filter(r => r.date === todayIST);
                next = (todayRecs.length % 2 === 0) ? 'Punch In' : 'Punch Out';
            }

            setConfirmAction(next);
        } finally {
            setIsDetectingAction(false);
        }
    };

    const handleCancel = () => setConfirmAction(null);

    const handleConfirm = () => {
        if (isPunching) return; // guard double-click
        setIsPunching(true);
        const trimmedRfid = worker.rfid.trim();
        console.log('[Attendance] Confirming:', confirmAction, 'RFID:', trimmedRfid);

        putAttendance({ rfid: trimmedRfid, subdomain })
            .then(res => {
                console.log('[Attendance] Response:', res);
                toast.success(res.message || 'Attendance marked successfully!');
                // Refresh table so the new record appears and next button state is correct
                setTimeout(() => {
                    refreshLatestAttendance();
                }, 300);
            })
            .catch(err => {
                console.error('[Attendance] Error:', err);
                toast.error(err.message || 'Failed to mark attendance.');
            })
            .finally(() => {
                setIsPunching(false);
                setConfirmAction(null);
                setWorker({ rfid: '' });
            });
    };

    useEffect(() => {
        const interval = setInterval(() => {
            scanQRCode();
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isModalOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isModalOpen]);

    useEffect(() => {

        if (isModalOpen && !confirmAction && inputRef.current) {
            inputRef.current.focus();
        }
    }, [confirmAction, isModalOpen]);

    const scanQRCode = () => {
        if (webcamRef.current) {
            const video = webcamRef.current.video;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext("2d");

                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);

                if (code) {
                    setQrText(code.data);
                    console.log("QR Code Data:", code.data);
                    setWorker({ ...worker, rfid: code.data });
                }
            }
        }
    };

    // Replace the existing filteredAttendance variable with:
    const filteredAttendance = attendanceData.filter(record => {
        const matchesName = !searchName || record?.name?.toLowerCase().includes(searchName.toLowerCase());
        const matchesDepartment = !filterDepartment || record?.departmentName?.toLowerCase().includes(filterDepartment.toLowerCase());
        const matchesDate = !filterDate || (record.date && record.date.startsWith(filterDate));
        const matchesRfid = !filterRfid || record?.rfid?.toLowerCase().includes(filterRfid.toLowerCase());
        return matchesName && matchesDepartment && matchesDate && matchesRfid;
    });

    const processedAttendance = processAttendanceByDay(filteredAttendance);

    function processAttendanceByDay(attendanceData) {
        // Helper to parse "10:51:40 AM" to seconds from midnight
        function parseTime12hToSeconds(timeStr) {
            if (typeof timeStr !== 'string') return 0;
            const [time, modifier] = timeStr.trim().split(' ');
            if (!time) return 0;
            let [hours, minutes, seconds] = time.split(':').map(Number);
            hours = hours || 0;
            minutes = minutes || 0;
            seconds = seconds || 0;
            if (modifier && modifier.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            else if (modifier && modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
            return hours * 3600 + minutes * 60 + seconds;
        }

        // Helper to parse "HH:mm:ss" duration to seconds
        function parseDurationToSeconds(durationStr) {
            if (typeof durationStr !== 'string') return 0;
            const [hours, minutes, seconds] = durationStr.split(':').map(Number);
            return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
        }

        // Helper to format seconds to "HH:mm:ss"
        function formatSecondsToDuration(totalSeconds) {
            if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
        }

        // Step 1: Group all raw punches by employee and date, maintaining order
        const punchesGroupedByDay = {};
        attendanceData.forEach(record => {
            const dateKey = new Date(record.date).toISOString().split('T')[0];
            const employeeDateKey = `${record.rfid || 'Unknown'}_${dateKey}`;
            if (!punchesGroupedByDay[employeeDateKey]) {
                punchesGroupedByDay[employeeDateKey] = {
                    ...record, // Copy some basic info
                    date: dateKey,
                    rawPunches: [], // Store all punches for this day/worker
                    inTimes: [], // For display: list of in times
                    outTimes: [], // For display: list of out times
                    duration: '00:00:00',
                    latestTimestamp: new Date(record.createdAt).getTime() // Keep track for sorting final list
                };
            }
            punchesGroupedByDay[employeeDateKey].rawPunches.push(record);
            punchesGroupedByDay[employeeDateKey].latestTimestamp = Math.max(
                punchesGroupedByDay[employeeDateKey].latestTimestamp,
                new Date(record.createdAt).getTime()
            );
        });

        const processedDays = [];

        for (const key in punchesGroupedByDay) {
            const dayData = punchesGroupedByDay[key];
            // Sort punches chronologically for the day
            const sortedPunches = dayData.rawPunches.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            let totalDurationSeconds = 0;
            let lastInTimeSeconds = null; // To track the last "in" punch for pairing

            dayData.inTimes = []; // Reset for accurate population below
            dayData.outTimes = []; // Reset for accurate population below

            for (let i = 0; i < sortedPunches.length; i++) {
                const punch = sortedPunches[i];
                const punchTimeSeconds = parseTime12hToSeconds(punch.time);

                if (punch.presence) { // This is an IN punch
                    lastInTimeSeconds = punchTimeSeconds;
                    dayData.inTimes.push({ time: punch.time, isMissed: false }); // Always normal IN for display
                } else { // This is an OUT punch
                    let isProblematicOut = false;
                    if (lastInTimeSeconds !== null) {
                        // There was a preceding IN punch on this day
                        if (punchTimeSeconds > lastInTimeSeconds) {
                            totalDurationSeconds += (punchTimeSeconds - lastInTimeSeconds);
                            lastInTimeSeconds = null; // Reset after a successful pair
                        } else {
                            // Out time is before or same as last in time on the same day (problematic)
                            isProblematicOut = true;
                        }
                    } else {
                        // Out punch without a preceding IN punch on this day (problematic)
                        isProblematicOut = true;
                    }

                    // Prioritize backend flag if available, otherwise use heuristic
                    dayData.outTimes.push({
                        time: punch.time,
                        isMissed: punch.isMissedOutPunch || isProblematicOut // Use backend flag or heuristic
                    });
                }
            }

            // If an IN punch was the last punch of the day, mark it as missed OUT (for display)
            // This handles cases where an IN is followed by no OUT on the same day.
            if (lastInTimeSeconds !== null) {
                // Assume end of day for missed out punch visual.
                // This is purely for display and doesn't create a new record in DB here.
                dayData.outTimes.push({
                    time: '-', // MODIFIED LINE: Changed 'FORGOTTEN OUT' to '-' or '' for empty default.
                    isMissed: true // Mark as missed for display
                });
                // Also add the duration till a standard end of day for this specific visual placeholder
                // You might need to refine totalDurationSeconds if you want to reflect this in the duration column
                // For now, duration calculation below is only for matched pairs.
            }

            dayData.duration = formatSecondsToDuration(totalDurationSeconds);
            processedDays.push(dayData);
        }

        // Sort the final list of processed days by latest activity
        return processedDays.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    }

    // Function to download attendance data as CSV
    const downloadAttendanceCSV = () => {
        if (processedAttendance.length === 0) {
            toast.warning("No attendance data to download");
            return;
        }

        const headers = [
            'Name',
            'Employee ID (RFID)',
            'Department',
            'Date',
            'In Times',
            'Out Times',
            'Duration'
        ];

        const csvRows = processedAttendance.map(record => [
            record?.name || 'Unknown',
            record?.rfid || 'Unknown',
            record?.departmentName || 'N/A',
            record.date || 'Unknown',
            record.inTimes.map(inTime => inTime.time).join(' | '), // Extract time values
            record.outTimes.map(outTime => outTime.time).join(' | '), // Extract time values
            record.duration || '00:00:00'
        ]);

        let csvContent = headers.join(',') + '\n';
        csvRows.forEach(row => {
            const formattedRow = row.map(cell => {
                if (cell === null || cell === undefined) return '';
                const cellString = String(cell);
                if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
                    return `"${cellString.replace(/"/g, '""')}"`;
                }
                return cellString;
            });
            csvContent += formattedRow.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        link.setAttribute('download', `Attendance_Report_${formattedDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success("Attendance report downloaded successfully!");
    };

    const columns = [
        {
            header: 'Name',
            accessor: 'name',
            render: (record) => (
                <div className="flex items-center">
                    <img
                        src={record?.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(record?.name || 'U')}&background=0d9488&color=fff`}
                        alt="Employee"
                        className="w-8 h-8 rounded-full object-cover mr-2.5 shadow-sm border border-slate-150"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(record?.name || 'U')}&background=0d9488&color=fff`;
                        }}
                    />
                    <Link to={`/admin/attendance/${record.worker?._id}`} className="text-slate-800 font-semibold hover:text-teal-600 transition-colors">
                        {record?.name || 'Unknown'}
                    </Link>
                </div>
            )
        },
        {
            header: 'Employee ID',
            accessor: 'rfid',
            render: (record) => (
                <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200/60 px-2 py-1 rounded-md">
                    {record?.rfid || 'Unknown'}
                </span>
            )
        },
        {
            header: 'Department',
            accessor: 'departmentName',
            render: (record) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                    {record?.departmentName || 'N/A'}
                </span>
            )
        },
        {
            header: 'Date',
            accessor: 'date',
            render: (record) => (
                <span className="text-sm text-slate-600 font-medium">
                    {record.date || 'Unknown'}
                </span>
            )
        },
        {
            header: 'In Time',
            accessor: 'inTimes',
            render: (record) => (
                <div className="flex flex-wrap justify-center gap-1">
                    {record.inTimes.map((inPunch, index) => (
                        <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {inPunch.time}
                        </span>
                    ))}
                </div>
            )
        },
        {
            header: 'Out Time',
            accessor: 'outTimes',
            render: (record) => (
                <div className="flex flex-wrap justify-center gap-1">
                    {record.outTimes.map((outPunch, index) => (
                        <div key={index} className="inline-flex items-center justify-center">
                            {outPunch.time !== '-' ? (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${outPunch.isMissed
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-rose-50 text-rose-700 border-rose-100'
                                    }`}>
                                    {outPunch.time}
                                    {outPunch.isMissed && (
                                        <AlertTriangle size={12} className="ml-1 text-amber-500" title="Missed Out Punch or Incomplete Pair" />
                                    )}
                                </span>
                            ) : (
                                <span className="text-slate-300 font-light">—</span>
                            )}
                        </div>
                    ))}
                </div>
            )
        },
        {
            header: 'Duration',
            accessor: 'duration',
            render: (record) => (
                <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                    {record.duration || '00:00:00'}
                </span>
            )
        }
    ];

    return (
        <Fragment>
            <div className="flex justify-between md:justify-end items-center mb-4 md:mb-6">
                <h1 className="text-2xl font-bold admin-mobile-title md:hidden">Attendance Management</h1>
                {/* Desktop buttons - hidden on mobile */}
                <div className='hidden md:flex space-x-4 justify-center items-center'>
                    {accessControl.addAttendance && (
                        <Button
                            variant="primary"
                            className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white border-0 shadow-sm transition-all duration-200"
                            onClick={() => setIsModalOpen(true)}
                        >
                            <Plus size={16} />
                            <span>Attendance</span>
                        </Button>
                    )}
                    {accessControl.faceAttendance && (
                        <Button
                            variant="primary"
                            className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white border-0 shadow-sm transition-all duration-200"
                            onClick={() => setIsFaceAttendanceOpen(true)}
                        >
                            <Camera size={16} />
                            <span>Face Attendance</span>
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        className="flex items-center gap-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white border-0 shadow-sm transition-all duration-200"
                        onClick={downloadAttendanceCSV}
                    >
                        <Download size={16} />
                        <span>Download</span>
                    </Button>
                </div>
            </div>

            {/* Mobile view buttons - visible only on mobile */}
            <div className="md:hidden mb-6">
                <div className="grid grid-cols-3 gap-2">
                    {accessControl.addAttendance && (
                        <Button
                            variant="primary"
                            className="flex flex-col items-center justify-center py-3 bg-gradient-to-b from-teal-500 to-teal-600 text-white border-0 shadow-sm rounded-2xl"
                            onClick={() => setIsModalOpen(true)}
                        >
                            <Plus size={20} className="mb-1" />
                            <span className="text-xs font-semibold">Attendance</span>
                        </Button>
                    )}
                    {accessControl.faceAttendance && (
                        <Button
                            variant="primary"
                            className="flex flex-col items-center justify-center py-3 bg-gradient-to-b from-cyan-500 to-cyan-600 text-white border-0 shadow-sm rounded-2xl"
                            onClick={() => setIsFaceAttendanceOpen(true)}
                        >
                            <Camera size={20} className="mb-1" />
                            <span className="text-xs font-semibold">Face</span>
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        className="flex flex-col items-center justify-center py-3 bg-gradient-to-b from-slate-600 to-slate-700 text-white border-0 shadow-sm rounded-2xl"
                        onClick={downloadAttendanceCSV}
                    >
                        <Download size={20} className="mb-1" />
                        <span className="text-xs font-semibold">Download</span>
                    </Button>
                </div>
            </div>

            {/* Filter Section */}
            <div className='bg-white border border-slate-100 rounded-[24px] p-4 shadow-sm mb-6'>
                {/* Desktop Filters */}
                <div className="hidden md:grid grid-cols-4 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            className="form-input pl-10 h-10 text-sm border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="Search by name..."
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            className="form-input pl-10 h-10 text-sm border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="Filter by RFID..."
                            value={filterRfid}
                            onChange={(e) => setFilterRfid(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            className="form-input pl-10 h-10 text-sm border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="Filter by department..."
                            value={filterDepartment}
                            onChange={(e) => setFilterDepartment(e.target.value)}
                        />
                    </div>
                    <input
                        type="date"
                        className="form-input h-10 text-sm border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Filter by date..."
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    />
                </div>

                {/* Mobile Filter Bar */}
                <div className="md:hidden flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            className="form-input pl-10 h-12 text-sm"
                            placeholder="Search name..."
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setIsFilterSheetOpen(true)}
                        className={`px-4 h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all ${filterRfid || filterDepartment || filterDate ? 'bg-teal-50 text-teal-600 border border-teal-100' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}
                    >
                        <Filter size={18} />
                        <span>Filter</span>
                    </button>
                </div>
            </div>

            {/* Mobile Filter Bottom Sheet */}
            <BottomSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                title="Filters"
            >
                <div className="space-y-6">
                    <div>
                        <label className="admin-mobile-label block mb-2">RFID</label>
                        <input
                            type="text"
                            className="form-input h-12"
                            placeholder="Filter by RFID..."
                            value={filterRfid}
                            onChange={(e) => setFilterRfid(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="admin-mobile-label block mb-2">Department</label>
                        <input
                            type="text"
                            className="form-input h-12"
                            placeholder="Filter by department..."
                            value={filterDepartment}
                            onChange={(e) => setFilterDepartment(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="admin-mobile-label block mb-2">Date</label>
                        <input
                            type="date"
                            className="form-input h-12"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-4">
                        <button
                            onClick={() => {
                                setFilterRfid('');
                                setFilterDepartment('');
                                setFilterDate('');
                                setIsFilterSheetOpen(false);
                            }}
                            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-slate-50 text-slate-600 font-bold text-sm active:bg-slate-100 transition-all"
                        >
                            <RotateCcw size={16} />
                            <span>Reset</span>
                        </button>
                        <button
                            onClick={() => setIsFilterSheetOpen(false)}
                            className="flex items-center justify-center h-12 rounded-xl bg-[#0d9488] text-white font-bold text-sm active:scale-[0.98] transition-all"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            </BottomSheet>

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner size="md" variant="default" />
                </div>
            ) : (
                <>
                    <Table
                        columns={columns}
                        data={processedAttendance}
                        noDataMessage="No attendance records found."
                    />

                    {/* Load More Button */}
                    {hasMore && (
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={loadMoreAttendance}
                                disabled={isFetchingMore}
                                className="flex items-center px-5 py-2 bg-[#0d9488] text-white rounded-xl shadow-md hover:bg-[#0f766e] transition-colors disabled:opacity-50"
                            >
                                {isFetchingMore ? (
                                    <>
                                        <Spinner size="sm" variant="light" className="mr-2" />
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        Load More
                                        <ChevronDown className="ml-2" size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </>
            )}

            <Modal
                isOpen={isModalOpen}
                title="RFID Input & QR Scanner"
                size="md"
                onClose={() => {
                    setIsModalOpen(false);
                    setWorker({ rfid: '' });
                    setConfirmAction(null);
                }}
            >
                {confirmAction ? (
                    <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
                        <h2 className="text-xl font-semibold mb-4">
                            Do you want to{' '}
                            <span
                                className={
                                    confirmAction === 'Punch In'
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                }
                            >
                                {confirmAction}
                            </span>
                            ?
                        </h2>
                        <div className="flex justify-center space-x-4">
                            <Button variant="secondary" onClick={handleCancel} disabled={isPunching}>
                                cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleConfirm}
                                disabled={isPunching}
                                className="flex items-center justify-center"
                            >
                                {isPunching ? <Spinner size="sm" /> : confirmAction}
                            </Button>
                        </div>
                    </div>

                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={worker.rfid}
                                onChange={e => setWorker({ rfid: e.target.value })}
                                placeholder="Enter RFID number..."
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-slate-700 transition-all placeholder:text-slate-450"
                                list="rfid-suggestions"
                            />
                        </div>
                        <datalist id="rfid-suggestions">
                            {uniqueRfids.map((rfid, index) => (
                                <option key={index} value={rfid} />
                            ))}
                        </datalist>
                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full flex items-center justify-center bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white border-0 shadow-sm py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                            disabled={isDetectingAction}
                        >
                            {isDetectingAction ? (
                                <><Spinner size="sm" className="mr-2" /> Checking...</>
                            ) : (
                                'Submit'
                            )}
                        </Button>
                    </form>
                )}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-md max-w-[400px] mx-auto my-5 bg-slate-900">
                    <Webcam
                        ref={webcamRef}
                        className="w-full h-auto object-cover aspect-video"
                        videoConstraints={{ facingMode: 'environment' }}
                    />
                </div>
                {qrText && (
                    <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-center shadow-sm">
                        <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider block mb-1">Detected RFID</span>
                        <span className="font-mono text-base font-bold text-slate-800">{qrText}</span>
                    </div>
                )}
            </Modal>

            {/* Face Attendance Modal */}
            <FaceAttendance
                subdomain={subdomain}
                isOpen={isFaceAttendanceOpen}
                onClose={() => {
                    setIsFaceAttendanceOpen(false);
                }}
                onAttendanceMarked={refreshLatestAttendance}
            />
        </Fragment>
    );
};

export default AttendanceManagement;

// Add the helper function for time conversion (same as backend)
function convertTo24Hour(time12h) {
    console.log("Converting time:", time12h);

    if (!time12h) {
        console.log("Time is null/undefined, returning 00:00:00");
        return '00:00:00';
    }

    // Handle different time formats
    if (typeof time12h === 'string' && time12h.includes(' ')) {
        const [time, modifier] = time12h.split(' ');
        console.log("Splitting time and modifier:", time, modifier);

        if (!time || !modifier) {
            console.log("Invalid time format, returning as is:", time12h);
            return time12h;
        }

        let [hours, minutes, seconds] = time.split(':');
        console.log("Split components:", hours, minutes, seconds);

        // Convert to numbers
        let hoursNum = parseInt(hours, 10);
        let minutesNum = parseInt(minutes, 10) || 0;
        let secondsNum = parseInt(seconds, 10) || 0;

        if (modifier === 'PM' && hoursNum !== 12) {
            hoursNum += 12;
        }
        if (modifier === 'AM' && hoursNum === 12) {
            hoursNum = 0;
        }

        const result = `${hoursNum.toString().padStart(2, '0')}:${minutesNum.toString().padStart(2, '0')}:${secondsNum.toString().padStart(2, '0')}`;
        console.log("Converted to 24-hour format:", result);
        return result;
    }

    // If it's already in 24-hour format or unrecognized format, return as is
    console.log("Time already in 24-hour format or unrecognized, returning as is:", time12h);
    return time12h;
}