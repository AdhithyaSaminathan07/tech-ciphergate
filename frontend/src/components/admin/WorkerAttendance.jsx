import React, { Fragment, useContext, useEffect, useState } from 'react'
import { FaChevronLeft, FaClock, FaMoneyBillWave, FaUserClock, FaCalculator } from 'react-icons/fa';
import { Link, useParams } from 'react-router-dom'
import Button from '../common/Button';
import appContext from '../../context/AppContext';
import { toast } from 'react-toastify';
import { getWorkerAttendance } from '../../services/attendanceService'; // Changed import
import Table from '../common/Table';
import TaskSpinner from '../common/Spinner';
import { GrPowerReset } from "react-icons/gr";
import api from '../../hooks/useAxios';
import { getAuthToken } from '../../utils/authUtils';

const WorkerAttendance = () => {
    const { id } = useParams();
    const [attendanceData, setAttendanceData] = useState([]);
    const { subdomain } = useContext(appContext);
    const [isLoading, setIsLoading] = useState(true);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [fiteredBatch, setFilteredBatch] = useState('');
    const [filteredByDateData, setFilteredByDateData] = useState([]);
    const [worker, setWorker] = useState(null); // Added state for worker data

    const fetchAttendanceData = async () => {
        setIsLoading(true);
        try {
            // First get the worker data to get their RFID
            const token = getAuthToken();
            const workerResponse = await api.get(`/workers/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWorker(workerResponse.data);
            
            // Then get attendance data using RFID
            const data = await getWorkerAttendance({ rfid: workerResponse.data.rfid, subdomain });
            const attendanceArray = data?.attendance || [];
            setAttendanceData(Array.isArray(attendanceArray) ? attendanceArray : []);
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch attendance data.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (subdomain && subdomain !== 'main' && id) {
            fetchAttendanceData();
        }
    }, [subdomain, id]);

    // Replace the productivity calculation section in your useEffect:
    useEffect(() => {
        let filtered = attendanceData;

        // Filter by date range
        if (fromDate || toDate) {
            filtered = filtered.filter(item => {
                if (!item.date) return false;
                const itemDate = item.date.split('T')[0];
                if (fromDate && toDate) return itemDate >= fromDate && itemDate <= toDate;
                else if (fromDate) return itemDate >= fromDate;
                else if (toDate) return itemDate <= toDate;
                return true;
            });
        }

        setFilteredByDateData(filtered);
    }, [fromDate, toDate, attendanceData]);

    const handleReset = () => {
        setFilteredByDateData(attendanceData);
        setFromDate('');
        setToDate('');
        setFilteredBatch('');
    };

    // Validation to ensure from date is not greater than to date
    const handleFromDateChange = (e) => {
        const newFromDate = e.target.value;
        if (toDate && newFromDate > toDate) {
            toast.error("From date cannot be greater than To date");
            return;
        }
        setFromDate(newFromDate);
    };

    const handleToDateChange = (e) => {
        const newToDate = e.target.value;
        if (fromDate && newToDate < fromDate) {
            toast.error("To date cannot be less than From date");
            return;
        }
        setToDate(newToDate);
    };

    const handleBatchChange = (e) => {
        setFilteredBatch(e.target.value);
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
                                : `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name || worker?.name || 'Unknown')}`}

                            alt="Employee"
                            className="w-8 h-8 rounded-full mr-2"
                        />
                    )}
                    {record?.name || worker?.name || 'Unknown'}
                </div>
            )
        },
        {
            header: 'Employee ID',
            accessor: 'rfid',
            render: (record) => record?.rfid || worker?.rfid || 'Unknown'
        },
        {
            header: 'Department',
            accessor: 'departmentName',
            render: (record) => record?.departmentName || worker?.department || 'Unknown'
        },
        {
            header: 'Date',
            accessor: 'date',
            render: (record) => record.date ? record.date.split('T')[0] : 'Unknown'
        },
        {
            header: 'Time',
            accessor: 'time',
            render: (record) => record.time || 'Unknown'
        },
        {
            header: 'Presence',
            accessor: 'presence',
            render: (record) => record.presence ? <p className="text-green-600">IN</p> : <p className="text-red-600">OUT</p>
        }
    ];

    return (
        <Fragment>
            <div className="flex justify-between items-center mb-6 mt-4">
                <h1 className="text-2xl font-bold">Attendance Report</h1>
                <div className="flex justify-end space-x-4 items-center mb-6">
                    <Link to={'/admin/attendance'}>
                        <Button
                            variant="primary"
                            className="flex items-center"
                        >
                            <FaChevronLeft className="mr-2" />Back
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="flex justify-end space-x-4 items-center mb-6">
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">From:</label>
                    <input
                        type="date"
                        className="form-input w-40"
                        placeholder="From date..."
                        value={fromDate}
                        onChange={handleFromDateChange}
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">To:</label>
                    <input
                        type="date"
                        className="form-input w-40"
                        placeholder="To date..."
                        value={toDate}
                        onChange={handleToDateChange}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <TaskSpinner />
                </div>
            ) : (
                <Table
                    columns={columns}
                    data={filteredByDateData}
                    noDataMessage="No attendance records found."
                />
            )}

            <div className="flex justify-center mt-6">
                <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={handleReset}
                >
                    <GrPowerReset className="mr-2" /> Reset Filters
                </Button>
            </div>
        </Fragment>
    );
};

export default WorkerAttendance
