import React, { Fragment, useState, useEffect, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getWorkerAttendance } from '../../services/attendanceService';
import Table from '../common/Table';
import Spinner from '../common/Spinner';
import { toast } from 'react-toastify';
import appContext from '../../context/AppContext';
import { FaDownload } from 'react-icons/fa';
import Button from '../common/Button';

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
              (!filterDate      || record.date.startsWith(filterDate)) &&
              (!filterName      || record.name.toLowerCase().includes(filterName.toLowerCase())) &&
              (!filterRFID      || record.rfid.includes(filterRFID)) &&
              (!filterDepartment|| record.department.toLowerCase().includes(filterDepartment.toLowerCase()))
            );
        
            const processedAttendance = processAttendanceByDay(filteredAttendance);
    
    // helper to turn “HH:mm:ss” → seconds
    function parseTime(t) {
        if (!t) return 0;
        const [h, m, s] = t.split(':').map(Number);
        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    }
  
  // helper to format seconds → “HH:mm:ss”
  function formatSecs(sec) {
    if (isNaN(sec) || sec < 0) {
        return '00:00:00';
    }
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
}
  

function processAttendanceByDay(attendanceData) {
    // Helper to parse time string with AM/PM (e.g., "10:51:40 AM") to seconds from midnight
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

    // Helper to parse a duration string "HH:mm:ss" into total seconds
    function parseDurationToSeconds(durationStr) {
        if (typeof durationStr !== 'string') return 0;
        const [hours, minutes, seconds] = durationStr.split(':').map(Number);
        return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
    }

    // Helper to format total seconds into a "HH:mm:ss" duration string
    function formatSecondsToDuration(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
    }

    // Step 1: Create a map to hold all display data, grouped by employee and date.
    const displayGroups = {};
    attendanceData.forEach(record => {
        const dateKey = record.date ? new Date(record.date).toISOString().split('T')[0] : 'Unknown';
        const employeeKey = `${record.rfid || 'Unknown'}_${dateKey}`;
        if (!displayGroups[employeeKey]) {
            displayGroups[employeeKey] = {
                ...record,
                date: dateKey,
                inTimes: [],
                outTimes: [],
                duration: '00:00:00', // Initialize duration
                latestTimestamp: 0,
            };
        }
        // Track the latest activity for sorting the final list
        displayGroups[employeeKey].latestTimestamp = Math.max(
            displayGroups[employeeKey].latestTimestamp,
            new Date(record.createdAt).getTime()
        );
        // Populate in/out times for display
        if (record.presence) {
            displayGroups[employeeKey].inTimes.push(record.time);
        } else {
            displayGroups[employeeKey].outTimes.push(record.time);
        }
    });

    // Step 2: Group all punches by employee to process them chronologically
    const punchesByRfid = attendanceData.reduce((acc, record) => {
        const rfid = record.rfid || 'Unknown';
        if (!acc[rfid]) acc[rfid] = [];
        acc[rfid].push(record);
        return acc;
    }, {});

    // Step 3: Process each employee's punches to calculate valid daily durations
    for (const rfid in punchesByRfid) {
        // Sort this employee's punches by time to ensure correct pairing order
        const records = punchesByRfid[rfid].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        const inPunchesStack = []; // Use a stack to pair the most recent IN with an OUT
        
        for (const record of records) {
            if (record.presence) { // This is an IN punch
                inPunchesStack.push(record);
            } else { // This is an OUT punch
                if (inPunchesStack.length > 0) {
                    const lastIn = inPunchesStack.pop(); // Pair with the most recent IN
                    
                    const inDate = new Date(lastIn.date).toISOString().split('T')[0];
                    const outDate = new Date(record.date).toISOString().split('T')[0];

                    // Rule: Only calculate duration if it's a same-day pair
                    if (inDate === outDate) {
                        const inSeconds = parseTime12hToSeconds(lastIn.time);
                        const outSeconds = parseTime12hToSeconds(record.time);
                        
                        if (outSeconds > inSeconds) {
                            const duration = outSeconds - inSeconds;
                            const summaryKey = `${rfid}_${inDate}`;
                            
                            // Add the calculated duration to the correct display group
                            if (displayGroups[summaryKey]) {
                                const currentDurationSeconds = parseDurationToSeconds(displayGroups[summaryKey].duration);
                                displayGroups[summaryKey].duration = formatSecondsToDuration(currentDurationSeconds + duration);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort the in/out times within each group for clean display
    for (const key in displayGroups) {
       displayGroups[key].inTimes.sort((a,b) => parseTime12hToSeconds(a) - parseTime12hToSeconds(b));
       displayGroups[key].outTimes.sort((a,b) => parseTime12hToSeconds(a) - parseTime12hToSeconds(b));
    }

    // Return the processed display groups, sorted to show the most recent activity first
    return Object.values(displayGroups).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

    // Function to download attendance data as CSV
    const downloadAttendanceCSV = () => {
        if (processedAttendance.length === 0) {
            toast.warning("No attendance data to download");
            return;
        }
    
        const headers = [
            'Name',
            'Employee ID',
            'Date',
            'In Times',
            'Out Times',
            'Duration'
        ];
    
        const csvRows = processedAttendance.map(record => [
            record?.name || 'Unknown',
            record?.rfid || 'Unknown',
            record.date || 'Unknown',
            record.inTimes.join(' | '),
            record.outTimes.join(' | '),
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
        const employeeName = user?.name ? user.name.replace(/\s+/g, '_') : 'Employee';
        const dateInfo = filterDate ? `_${filterDate}` : `_${formattedDate}`;
        link.setAttribute('download', `${employeeName}_Attendance_Report${dateInfo}.csv`);
    
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
                <div className="flex items-center min-w-0">
                    {record?.photo && (
                        <img
                            src={record.photo ? record.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}`}
                            alt="Employee"
                            className="w-8 h-8 rounded-full mr-2 flex-shrink-0"
                        />
                    )}
                    <span className="truncate">{record?.name || 'Unknown'}</span>
                </div>
            )
        },
        {
            header: 'Employee ID',
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
                <div className="min-w-0">
                    {record.inTimes.map((time, index) => (
                        <div key={index} className="text-green-600 truncate">{time}</div>
                    ))}
                </div>
            )
        },
        {
            header: 'Out Time',
            accessor: 'outTimes',
            render: (record) => (
                <div className="min-w-0">
                    {record.outTimes.map((time, index) => (
                        <div key={index} className="text-red-600 truncate">{time}</div>
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
            <h1 className='text-2xl font-bold'>Attendance Report</h1>
            <div className='bg-white border rounded-lg p-4 w-full overflow-x-hidden'>
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
              <input
                type="date"
                className="form-input w-full"
                placeholder="Filter by date..."
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end mb-6">
              <Button variant="primary" onClick={downloadAttendanceCSV} className="w-full sm:w-auto">
                <FaDownload className="mr-2" /> Download
              </Button>
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