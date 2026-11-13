import React, { Fragment, useState, useEffect, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getWorkerAttendance } from '../../services/attendanceService';
import Table from '../common/Table';
import Spinner from '../common/Spinner';
import { toast } from 'react-toastify';
import appContext from '../../context/AppContext';
import { FaDownload } from 'react-icons/fa';
import Button from '../common/Button';
import CustomDatePicker from '../common/CustomDatePicker';
import {
    formatRecordDateIST,
    processAttendanceByDay,
    buildAttendanceCsvContent,
    getBreakPunchLabel
} from '../../utils/attendanceHelpers';

const AttendanceReport = () => {
    const { user } = useAuth();
    const { subdomain } = useContext(appContext);
    const [attendanceData, setAttendanceData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState('');
    const [filterName, setFilterName] = useState('');
    const [filterRFID, setFilterRFID] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('');

    useEffect(() => {
        if (!user?.rfid || !subdomain || subdomain === 'main') {
            toast.error("Invalid RFID or subdomain.");
            return;
        }

        const fetchAttendance = async () => {
            setIsLoading(true);
            try {
                const data = await getWorkerAttendance({ rfid: user.rfid, subdomain });
                setAttendanceData(Array.isArray(data.attendance) ? data.attendance : []);
            } catch (error) {
                console.error(error);
                toast.error("Failed to fetch attendance data.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAttendance();
    }, [user?.rfid, subdomain]);

    const filteredAttendance = attendanceData.filter(record =>
              (!filterDate      || formatRecordDateIST(record.date).startsWith(filterDate)) &&
              (!filterName      || String(record.name || '').toLowerCase().includes(filterName.toLowerCase())) &&
              (!filterRFID      || String(record.rfid || '').includes(filterRFID)) &&
              (!filterDepartment|| String(record.department || '').toLowerCase().includes(filterDepartment.toLowerCase()))
            );
        
    const processedAttendance = processAttendanceByDay(filteredAttendance);

    // Function to download attendance data as CSV (generic Break OUT/Break IN labels, zero session names)
    const downloadAttendanceCSV = () => {
        if (processedAttendance.length === 0) {
            toast.warning("No attendance data to download");
            return;
        }

        const csvContent = buildAttendanceCsvContent({
            activeTab: 'daily',
            processedAttendance
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        const formattedDate = formatRecordDateIST(new Date());
        const employeeName = user?.name ? user.name.replace(/\s+/g, '_') : 'Developer';
        const dateInfo = filterDate ? `_${filterDate}` : `_${formattedDate}`;
        link.setAttribute('download', `${employeeName}_Attendance_Report${dateInfo}.csv`);

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
            render: (record) => (
                <div className="flex items-center min-w-0">
                    {record?.photo && (
                        <img
                            src={record.photo ? record.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}`}
                            alt="Developer"
                            className="w-8 h-8 rounded-full mr-2 flex-shrink-0"
                        />
                    )}
                    <span className="truncate">{record?.name || 'Unknown'}</span>
                </div>
            )
        },
        {
            header: 'Developer ID',
            accessor: 'rfid',
            render: (record) => <span className="truncate">{record.rfid || 'Unknown'}</span>
        },
        
            {
                header: 'Department',
                accessor: 'departmentName',
                render: (record) => <span className="truncate">{record.departmentName || record.department || 'Unknown'}</span>
            },
        {
            header: 'Date',
            accessor: 'date',
            render: (record) => <span className="truncate">{record.date || 'Unknown'}</span>
        },
        {
            header: 'In Time',
            accessor: 'inTimes',
            render: (record) => (
                <div className="flex flex-wrap gap-1 min-w-0">
                    {record.inTimes.map((inPunch, index) => (
                        <div key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <span>{inPunch.time}</span>
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
                        </div>
                    ))}
                </div>
            )
        },
        {
            header: 'Out Time',
            accessor: 'outTimes',
            render: (record) => (
                <div className="flex flex-wrap gap-1 min-w-0">
                    {record.outTimes.map((outPunch, index) => (
                        <div key={index} className="inline-flex items-center gap-1">
                            {outPunch.time !== '-' ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${outPunch.isMissed
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-rose-50 text-rose-700 border-rose-100'
                                }`}>
                                    <span>{outPunch.time}</span>
                                    {getBreakPunchLabel({ ...outPunch, presence: false }) === 'Break OUT' && (
                                        <span className="text-[10px] font-bold text-purple-700 bg-white/80 px-1 rounded">
                                            Break OUT
                                        </span>
                                    )}
                                    {outPunch.isMissingLunchReturn && (
                                        <span className="text-[10px] font-bold text-rose-700">Missing Return</span>
                                    )}
                                </span>
                            ) : (
                                <span className="text-slate-300">—</span>
                            )}
                        </div>
                    ))}
                </div>
            )
        },
        {
            header: 'Duration',
            accessor: 'duration',
            render: (record) => <span className="truncate">{record.duration || '00:00:00'}</span>
        }
    ];
    

    return (
        // Added w-full overflow-x-hidden to prevent horizontal scrolling
        <Fragment>      
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className='text-2xl font-black text-slate-900 tracking-tight'>Attendance Report</h1>
                    <p className="text-xs text-slate-500 font-medium mt-1">Track your daily working hours and logs</p>
                </div>
                <Button 
                    variant="primary" 
                    onClick={downloadAttendanceCSV} 
                    className="w-full sm:w-auto bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-lg shadow-teal-100 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all active:scale-95"
                >
                    <FaDownload size={14} /> 
                    <span className="font-bold tracking-tight">Export Data</span>
                </Button>
            </div>
            <div className='bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm w-full overflow-x-hidden'>
            {/* Improved responsive grid for filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <input
                type="text"
                className="form-input w-full"
                placeholder="Search by name..."
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
              />
              <input
                type="text"
                className="form-input w-full"
                placeholder="Filter by RFID..."
                value={filterRFID}
                onChange={e => setFilterRFID(e.target.value)}
              />
              <input
                type="text"
                className="form-input w-full"
                placeholder="Filter by department..."
                value={filterDepartment}
                onChange={e => setFilterDepartment(e.target.value)}
              />
              <CustomDatePicker
                className="w-full"
                inputClassName="w-full py-2"
                placeholder="Filter by date..."
                value={filterDate}
                onChange={val => setFilterDate(val)}
              />
            </div>

                


                {isLoading ? (
                    <Spinner size="md" variant="default" />
                ) : (
                    // Added responsive wrapper for table
                    <div className="overflow-x-auto w-full">
                        <Table
                                      columns={columns}
                                      data={processedAttendance}
                                      noDataMessage="No attendance records found."
                                    />
                    </div>
                )}
            </div>
        </Fragment>
    );
};

export default AttendanceReport;