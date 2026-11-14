import React, { Fragment, useRef, useState, useEffect, useContext, useCallback } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Webcam from "react-webcam";
import jsQR from "jsqr";
import appContext from '../../context/AppContext';
import SocketContext from '../../context/SocketContextNew';
import { toast } from 'react-toastify';
import { putAttendance, getAttendance, getPaginatedAttendance, getWorkerLastAttendance, getLunchAttendanceOverview } from '../../services/attendanceService';
import Table from '../common/Table';
import Spinner from '../common/Spinner';
import { Link } from 'react-router-dom';
import FaceAttendance from './FaceAttendance';
import api from '../../services/api';
import BottomSheet from '../common/BottomSheet';
import { Filter, Search, RotateCcw, Plus, Camera, Download, AlertTriangle, ChevronDown, Hash, Building2 } from 'lucide-react';
import { FiCoffee } from 'react-icons/fi';
import CustomDatePicker from '../common/CustomDatePicker';
import {
    formatRecordDateIST,
    getWorkerProfileId,
    getBreakPunchLabel,
    mergeAttendanceRecords,
    createRefreshCoordinator,
    processAttendanceByDay,
    filterLunchOverviewRows,
    buildAttendanceCsvContent
} from '../../utils/attendanceHelpers';

const DAILY_PAGE_SIZE = 2;
const SOCKET_CONNECTED_FALLBACK_POLL_MS = 30000;
const SOCKET_DISCONNECTED_POLL_MS = 15000;

const AttendanceManagement = () => {
    const { subdomain } = useContext(appContext);
    const socketContext = useContext(SocketContext) || {};
    const isSocketConnected = Boolean(socketContext.isConnected);
    const [worker, setWorker] = useState({ rfid: "" });
    const [qrText, setQrText] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFaceAttendanceOpen, setIsFaceAttendanceOpen] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    // Lunch Break Overview State
    const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'lunch'
    const [lunchDate, setLunchDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const [lunchOverviewData, setLunchOverviewData] = useState([]);
    const [isLunchLoading, setIsLunchLoading] = useState(false);
    const [lunchPage, setLunchPage] = useState(1);
    const [lunchPagination, setLunchPagination] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0, hasMore: false });

    const [isLoading, setIsLoading] = useState(true);
    const [isDailyRefreshing, setIsDailyRefreshing] = useState(false);
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

    const [confirmAction, setConfirmAction] = useState(null);
    const [accessControl, setAccessControl] = useState({ addAttendance: true, faceAttendance: true });

    const isMountedRef = useRef(true);
    const activeTabRef = useRef(activeTab);
    const currentPageRef = useRef(currentPage);
    const filterDateRef = useRef(filterDate);
    const lunchDateRef = useRef(lunchDate);
    const lunchPageRef = useRef(lunchPage);
    const dailyCoordinatorRef = useRef(null);
    const lunchCoordinatorRef = useRef(null);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        filterDateRef.current = filterDate;
    }, [filterDate]);

    useEffect(() => {
        lunchDateRef.current = lunchDate;
    }, [lunchDate]);

    useEffect(() => {
        lunchPageRef.current = lunchPage;
    }, [lunchPage]);

    const performLunchOverviewFetch = useCallback(async ({ dateToFetch, pageToFetch = 1, showSpinner = true } = {}) => {
        if (!subdomain || subdomain === 'main') return;
        if (showSpinner && isMountedRef.current) {
            setIsLunchLoading(true);
        }
        try {
            const effectiveDate = dateToFetch || lunchDateRef.current;
            const effectivePage = pageToFetch || lunchPageRef.current || 1;
            const data = await getLunchAttendanceOverview({
                subdomain,
                date: effectiveDate,
                page: effectivePage,
                limit: 25
            });
            if (isMountedRef.current && data.success) {
                setLunchOverviewData(data.overview || []);
                setLunchPage(data.pagination?.currentPage || effectivePage);
                setLunchPagination(data.pagination || { currentPage: 1, totalPages: 1, totalRecords: (data.overview || []).length, hasMore: false });
            }
        } catch (err) {
            console.error('Failed to fetch lunch overview:', err);
        } finally {
            if (showSpinner && isMountedRef.current) {
                setIsLunchLoading(false);
            }
        }
    }, [subdomain]);

    const fetchLunchOverview = useCallback((dateToFetch, pageToFetch = 1, { showSpinner = true, debounce = false, skipIfBusy = false } = {}) => {
        if (!subdomain || subdomain === 'main') return Promise.resolve();
        if (lunchCoordinatorRef.current) {
            return lunchCoordinatorRef.current.trigger({
                dateToFetch,
                pageToFetch,
                showSpinner,
                debounce,
                skipIfBusy
            });
        }
        return performLunchOverviewFetch({ dateToFetch, pageToFetch, showSpinner });
    }, [subdomain, performLunchOverviewFetch]);

    useEffect(() => {
        if (activeTab === 'lunch') {
            fetchLunchOverview(lunchDate, 1);
        }
    }, [activeTab, lunchDate, fetchLunchOverview]);

    const uniqueRfids = React.useMemo(() => {
        const rfids = attendanceData.map(record => record.rfid).filter(rfid => rfid && rfid.trim() !== '');
        console.log("All RFIDs:", rfids);
        const unique = [...new Set(rfids)];
        console.log("Unique RFIDs:", unique);
        return unique;
    }, [attendanceData]);

    const buildDailyQueryParams = useCallback((page, limit, selectedDate = filterDateRef.current) => {
        const params = { subdomain, page, limit };
        const trimmedDate = typeof selectedDate === 'string' ? selectedDate.trim() : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
            params.date = trimmedDate;
        }
        return params;
    }, [subdomain]);

    const fetchAttendanceData = useCallback(async (page = 1, append = false, selectedDate = filterDateRef.current) => {
        if (!subdomain || subdomain === 'main') return;

        try {
            if (append) {
                setIsFetchingMore(true);
            } else {
                setIsLoading(true);
            }

            const data = await getPaginatedAttendance(buildDailyQueryParams(page, DAILY_PAGE_SIZE, selectedDate));
            const rawData = Array.isArray(data.attendance) ? data.attendance : [];

            if (!isMountedRef.current) return;

            if (append) {
                setAttendanceData(prevData => mergeAttendanceRecords(prevData, rawData, { mode: 'append' }));
            } else {
                setAttendanceData(mergeAttendanceRecords([], rawData, { mode: 'replace' }));
            }

            setHasMore(Boolean(data.hasMore));
            setCurrentPage(page);
        } catch (error) {
            console.error(error);
            if (isMountedRef.current) {
                toast.error("Failed to fetch attendance data.");
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
                setIsFetchingMore(false);
            }
        }
    }, [subdomain, buildDailyQueryParams]);

    // Refresh all loaded Daily Attendance pages (plus active filterDate) while preserving filters & pagination
    const performDailyRefresh = useCallback(async ({ manual = false } = {}) => {
        if (!subdomain || subdomain === 'main') return;

        const pagesLoaded = Math.max(1, currentPageRef.current || 1);
        const limitForLoadedPages = DAILY_PAGE_SIZE * pagesLoaded;
        const data = await getPaginatedAttendance(
            buildDailyQueryParams(1, limitForLoadedPages, filterDateRef.current)
        );
        const rawData = Array.isArray(data.attendance) ? data.attendance : [];

        if (!isMountedRef.current) return;

        setAttendanceData(mergeAttendanceRecords([], rawData, { mode: 'replace' }));
        setHasMore(Boolean(data.hasMore));
    }, [subdomain, buildDailyQueryParams]);

    useEffect(() => {
        isMountedRef.current = true;
        dailyCoordinatorRef.current = createRefreshCoordinator(performDailyRefresh, {
            debounceMs: 150,
            onError: (err) => console.error("Failed to refresh latest attendance:", err)
        });
        lunchCoordinatorRef.current = createRefreshCoordinator(performLunchOverviewFetch, {
            debounceMs: 150,
            onError: (err) => console.error("Failed to refresh break overview:", err)
        });

        return () => {
            isMountedRef.current = false;
            dailyCoordinatorRef.current?.dispose();
            lunchCoordinatorRef.current?.dispose();
        };
    }, [performDailyRefresh, performLunchOverviewFetch]);

    // Function to load more data
    const loadMoreAttendance = () => {
        if (hasMore && !isFetchingMore && !isDailyRefreshing) {
            fetchAttendanceData(currentPage + 1, true);
        }
    };

    // Real-time / manual / fallback-polled refresh without overlapping requests or duplicate rows
    const refreshLatestAttendance = useCallback(async ({ manual = false, debounce = false, skipIfBusy = false } = {}) => {
        if (!subdomain || subdomain === 'main') return;
        if (manual && isMountedRef.current) {
            setIsDailyRefreshing(true);
        }
        try {
            if (dailyCoordinatorRef.current) {
                await dailyCoordinatorRef.current.trigger({ manual, debounce, skipIfBusy });
            } else {
                await performDailyRefresh({ manual });
            }
        } catch (error) {
            console.error("Failed to refresh latest attendance:", error);
            if (manual && isMountedRef.current) {
                toast.error("Failed to refresh attendance data.");
            }
        } finally {
            if (manual && isMountedRef.current) {
                setIsDailyRefreshing(false);
            }
        }
    }, [subdomain, performDailyRefresh]);

    // Load initial data
    useEffect(() => {
        if (subdomain && subdomain !== 'main') {
            fetchAttendanceData(1, false);

            // Fetch access control settings
            api.get(`/settings/${subdomain}`)
                .then(res => {
                    if (isMountedRef.current && res.data?.attendanceAccessControl?.admin) {
                        setAccessControl(res.data.attendanceAccessControl.admin);
                    }
                })
                .catch(err => console.error("Failed to fetch settings:", err));
        }
    }, [subdomain, fetchAttendanceData]);

    // When a specific YYYY-MM-DD filter date is chosen on Daily Attendance, ensure it is fetched cleanly
    useEffect(() => {
        if (!subdomain || subdomain === 'main' || activeTab !== 'daily') return;
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(filterDate || '').trim())) {
            refreshLatestAttendance({ debounce: true });
        }
    }, [filterDate, activeTab, subdomain, refreshLatestAttendance]);

    // Refresh Daily Attendance when switching back from Break Overview
    useEffect(() => {
        if (activeTab === 'daily' && subdomain && subdomain !== 'main') {
            refreshLatestAttendance({ skipIfBusy: true });
        }
    }, [activeTab, subdomain, refreshLatestAttendance]);

    // Real-time Socket.IO event listener + safe periodic fallback polling with unmount cleanup
    useEffect(() => {
        if (!subdomain || subdomain === 'main') return undefined;

        const handleRealtimeUpdate = () => {
            if (!isMountedRef.current) return;
            if (activeTabRef.current === 'lunch') {
                fetchLunchOverview(lunchDateRef.current, lunchPageRef.current || 1, {
                    showSpinner: false,
                    debounce: true
                });
            } else {
                refreshLatestAttendance({ debounce: true });
            }
        };

        const runPeriodicSync = () => {
            if (!isMountedRef.current || (typeof document !== 'undefined' && document.hidden)) {
                return;
            }
            if (activeTabRef.current === 'lunch') {
                fetchLunchOverview(lunchDateRef.current, lunchPageRef.current || 1, {
                    showSpinner: false,
                    skipIfBusy: true
                });
            } else {
                refreshLatestAttendance({ skipIfBusy: true });
            }
        };

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                runPeriodicSync();
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('attendance-update', handleRealtimeUpdate);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const pollIntervalMs = isSocketConnected
            ? SOCKET_CONNECTED_FALLBACK_POLL_MS
            : SOCKET_DISCONNECTED_POLL_MS;
        const pollTimer = setInterval(runPeriodicSync, pollIntervalMs);

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('attendance-update', handleRealtimeUpdate);
            }
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            clearInterval(pollTimer);
        };
    }, [subdomain, isSocketConnected, refreshLatestAttendance, fetchLunchOverview]);

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
        const matchesDate = !filterDate || formatRecordDateIST(record.date).startsWith(filterDate);
        const matchesRfid = !filterRfid || record?.rfid?.toLowerCase().includes(filterRfid.toLowerCase());
        return matchesName && matchesDepartment && matchesDate && matchesRfid;
    });

    const processedAttendance = processAttendanceByDay(filteredAttendance);

    const filteredLunchOverview = filterLunchOverviewRows(lunchOverviewData, {
        searchName,
        filterRfid,
        filterDepartment,
        filterDate,
        fallbackDate: lunchDate
    });

    // Function to download active-tab attendance data as CSV using active filters
    const downloadAttendanceCSV = () => {
        if (activeTab === 'lunch') {
            if (filteredLunchOverview.length === 0) {
                toast.warning("No break overview data to download");
                return;
            }
        } else if (processedAttendance.length === 0) {
            toast.warning("No attendance data to download");
            return;
        }

        const csvContent = buildAttendanceCsvContent({
            activeTab,
            processedAttendance,
            filteredLunchOverview,
            lunchDate
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        const formattedDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const prefix = activeTab === 'lunch' ? 'Break_Overview' : 'Attendance_Report';
        link.setAttribute('download', `${prefix}_${formattedDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("Attendance report downloaded successfully!");
    };

    const columns = [
        {
            header: 'Name',
            accessor: 'name',
            render: (record) => {
                const profileId = getWorkerProfileId(record);
                return (
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
                        {profileId ? (
                            <Link to={`/admin/attendance/${profileId}`} className="text-slate-800 font-semibold hover:text-teal-600 transition-colors">
                                {record?.name || 'Unknown'}
                            </Link>
                        ) : (
                            <span className="text-slate-800 font-semibold">{record?.name || 'Unknown'}</span>
                        )}
                    </div>
                );
            }
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
                        <div key={index} className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {inPunch.time}
                                {getBreakPunchLabel({ ...inPunch, presence: true }) === 'Break IN' && (
                                    <span className="text-[10px] font-bold text-teal-700 bg-white/80 px-1 rounded">
                                        Break IN
                                    </span>
                                )}
                                {inPunch.lunchLateMinutes > 0 && (
                                    <span className="text-[10px] font-bold text-rose-600">
                                        +{inPunch.lunchLateMinutes}m
                                    </span>
                                )}
                            </span>
                        </div>
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
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${outPunch.isMissed
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-rose-50 text-rose-700 border-rose-100'
                                    }`}>
                                    {outPunch.time}
                                    {getBreakPunchLabel({ ...outPunch, presence: false }) === 'Break OUT' && (
                                        <span className="text-[10px] font-bold text-purple-700 bg-white/80 px-1 rounded">
                                            Break OUT
                                        </span>
                                    )}
                                    {outPunch.isMissingLunchReturn && (
                                        <span className="text-[10px] font-bold text-rose-700">Missing Return</span>
                                    )}
                                    {outPunch.isMissed && !outPunch.isMissingLunchReturn && (
                                        <AlertTriangle size={12} className="ml-0.5 text-amber-500" title="Missed Out Punch or Incomplete Pair" />
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
                    <CustomDatePicker
                        className="w-full"
                        inputClassName="w-full h-10 text-sm border-slate-200 rounded-xl"
                        placeholder="Filter by date..."
                        value={filterDate}
                        onChange={(val) => {
                            setFilterDate(val);
                            if (activeTab === 'lunch' && /^\d{4}-\d{2}-\d{2}$/.test(String(val || ''))) {
                                setLunchDate(val);
                            }
                        }}
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
                        <CustomDatePicker
                            className="w-full"
                            inputClassName="w-full h-12"
                            value={filterDate}
                            onChange={(val) => setFilterDate(val)}
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

            {/* View Mode Toggle: Daily Attendance vs Automatic OUT Overview */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setActiveTab('daily')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#087F70] focus-visible:ring-offset-1 border border-transparent ${
                            activeTab === 'daily'
                                ? 'bg-[#DDF7F0] text-[#087F70] shadow-sm'
                                : 'bg-transparent text-[#475569] hover:bg-slate-200/60 hover:text-slate-900'
                        }`}
                    >
                        Daily Attendance
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('lunch')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#087F70] focus-visible:ring-offset-1 border border-transparent ${
                            activeTab === 'lunch'
                                ? 'bg-[#DDF7F0] text-[#087F70] shadow-sm'
                                : 'bg-transparent text-[#475569] hover:bg-slate-200/60 hover:text-slate-900'
                        }`}
                    >
                        <FiCoffee className="h-3.5 w-3.5" />
                        <span>Automatic OUT Overview</span>
                    </button>
                </div>

                {activeTab === 'lunch' ? (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600">Date:</label>
                        <input
                            type="date"
                            value={lunchDate}
                            onChange={(e) => setLunchDate(e.target.value)}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                        <button
                            type="button"
                            disabled={isLunchLoading}
                            onClick={() => fetchLunchOverview(lunchDate, lunchPage)}
                            aria-label="Refresh Automatic OUT overview"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-60"
                        >
                            <RotateCcw size={14} className={isLunchLoading ? 'animate-spin' : ''} />
                            <span>{isLunchLoading ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={isDailyRefreshing}
                            onClick={() => refreshLatestAttendance({ manual: true })}
                            aria-label="Refresh attendance"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-60"
                        >
                            <RotateCcw size={14} className={isDailyRefreshing ? 'animate-spin' : ''} />
                            <span>{isDailyRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                    </div>
                )}
            </div>

            {activeTab === 'lunch' ? (
                <div className="space-y-4">
                    {isLunchLoading ? (
                        <div className="flex justify-center py-12">
                            <Spinner size="md" variant="default" />
                        </div>
                    ) : filteredLunchOverview.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-500 text-xs font-medium">
                            No Automatic OUT activity recorded for {lunchDate}.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                            <th className="px-4 py-3">Employee</th>
                                            <th className="px-4 py-3 text-center">Date</th>
                                            <th className="px-4 py-3 text-center">OUT Time</th>
                                            <th className="px-4 py-3 text-center">IN Time</th>
                                            <th className="px-4 py-3 text-center">Late Return Status</th>
                                            <th className="px-4 py-3 text-center">Missing Return Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {filteredLunchOverview.map((row, idx) => {
                                            const profileId = getWorkerProfileId(row);
                                            const hasReturned = Boolean(row.actualReturnTime && row.actualReturnTime !== '-');
                                            const isMissing = Boolean(row.isMissingLunchReturn || row.status === 'Missing Return' || row.status === 'Missing Lunch Return');
                                            const displayStatus = isMissing
                                                ? 'Missing Return'
                                                : hasReturned
                                                    ? (row.lateMinutes > 0 ? 'Returned Late' : 'Returned On-Time')
                                                    : 'Currently OUT';
                                            return (
                                                <tr key={`${row.workerId || row.rfid}_${row.sessionId || idx}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-slate-800">
                                                        {profileId ? (
                                                            <Link to={`/admin/attendance/${profileId}`} className="hover:text-teal-600 transition-colors">
                                                                {row.name}
                                                            </Link>
                                                        ) : row.name}
                                                        <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                                                            {row.department || 'Unassigned'} • RFID: {row.rfid || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-medium text-slate-600">
                                                        {row.date || lunchDate}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-semibold text-slate-700">
                                                        {row.lunchOutTime || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-semibold text-slate-700">
                                                        {row.actualReturnTime || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold">
                                                        {row.lateMinutes > 0 ? (
                                                            <span className="text-rose-600">+{row.lateMinutes} mins late</span>
                                                        ) : (
                                                            <span className="text-emerald-600">On-Time</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                                            isMissing ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                            hasReturned ? (row.lateMinutes > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200') :
                                                            'bg-amber-50 text-amber-700 border-amber-200'
                                                        }`}>
                                                            {displayStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {lunchPagination.totalPages > 1 && (
                                <div className="flex items-center justify-between px-4 py-2 bg-white rounded-xl border border-slate-200/80 text-xs">
                                    <span className="text-slate-500">
                                        Page {lunchPagination.currentPage} of {lunchPagination.totalPages} ({lunchPagination.totalRecords} records)
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={lunchPage <= 1}
                                            onClick={() => fetchLunchOverview(lunchDate, lunchPage - 1)}
                                            className="px-3 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold disabled:opacity-40 hover:bg-slate-50"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!lunchPagination.hasMore}
                                            onClick={() => fetchLunchOverview(lunchDate, lunchPage + 1)}
                                            className="px-3 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold disabled:opacity-40 hover:bg-slate-50"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : isLoading ? (
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