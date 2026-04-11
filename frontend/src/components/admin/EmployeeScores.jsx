// Test Management - Employee Scores Component
import React, { useState, useEffect, useContext } from 'react';
import api from '../../services/api';
import { getWorkers } from '../../services/workerService';
import appContext from '../../context/AppContext';
import Button from '../common/Button';
import Table from '../common/Table';
import { FaTrophy, FaUser, FaCalendarAlt, FaDownload, FaBuilding, FaCheckCircle, FaTimesCircle, FaPercent } from 'react-icons/fa';

const EmployeeScores = () => {
    const { subdomain } = useContext(appContext);
    const [scores, setScores] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState('');
    const [selectedDate, setSelectedDate] = useState('');

    useEffect(() => {
        fetchWorkers();
        fetchScores();
    }, []);

    useEffect(() => {
        fetchScores();
    }, [selectedWorker, selectedDate]);

    const fetchWorkers = async () => {
        try {
            const workersData = await getWorkers({ subdomain });
            setWorkers(workersData || []);
        } catch (error) {
            console.error('Error fetching workers:', error);
        }
    };

    const fetchScores = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedWorker) params.append('workerId', selectedWorker);
            if (selectedDate) params.append('date', selectedDate);

            const response = await api.get(`/test/scores?${params.toString()}`);
            setScores(response.data || []);
        } catch (error) {
            console.error('Error fetching scores:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setSelectedWorker('');
        setSelectedDate('');
    };

    const exportScores = () => {
        const csvContent = [
            ['Worker Name', 'Department', 'Topic', 'Score', 'Total Questions', 'Percentage', 'Date'].join(','),
            ...scores.map(score => {
                const percentage = score.totalQuestions > 0 
                    ? Math.round((score.score / score.totalQuestions) * 100) 
                    : 0;
                    
                return [
                    score.worker?.name || 'Unknown Worker',
                    score.worker?.department || '',
                    score.topic || 'General Topic',
                    score.score || 0,
                    score.totalQuestions || 0,
                    percentage + '%',
                    score.createdAt ? new Date(score.createdAt).toLocaleDateString() : ''
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `employee_scores_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getScoreLabel = (percentage) => {
        if (percentage >= 80) return 'Excellent';
        if (percentage >= 60) return 'Good';
        if (percentage >= 40) return 'Average';
        return '';
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (error) {
            return '';
        }
    };

    const columns = [
        {
            key: 'worker.name',
            title: 'Employee',
            render: (score) => (
                <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <FaUser className="text-blue-600" />
                    </div>
                    <div>
                        <div className="font-medium text-gray-800">
                            {score.worker?.name || 'Unknown Employee'}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                            <FaBuilding className="mr-1 text-gray-400" size={12} />
                            {score.worker?.department || ''}
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: 'topic',
            title: 'Topic',
            render: (score) => (
                <div className="font-medium text-gray-800">
                    {score.topic || 'General Topic'}
                </div>
            )
        },
        {
            key: 'score',
            title: 'Score',
            render: (score) => {
                const percentage = score.totalQuestions > 0 
                    ? Math.round((score.score / score.totalQuestions) * 100) 
                    : 0;
                
                // Progress bar background class based on score
                let progressClass = 'bg-red-500';
                if (percentage >= 80) progressClass = 'bg-green-500';
                else if (percentage >= 60) progressClass = 'bg-blue-500';
                else if (percentage >= 40) progressClass = 'bg-yellow-500';
                
                return (
                    <div className="w-full">
                        <div className="flex justify-between items-center mb-1">
                            <div className="font-medium">
                                {score.score || 0}/{score.totalQuestions || 0} points
                            </div>
                            <div className="text-sm font-bold">
                                {percentage}%
                            </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                                className={`h-2.5 rounded-full ${progressClass}`} 
                                style={{ width: `${percentage || 0}%` }}
                            ></div>
                        </div>
                        {getScoreLabel(percentage) && (
                            <div className="text-xs mt-1 font-medium">
                                {getScoreLabel(percentage)}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            key: 'createdAt',
            title: 'Test Date',
            render: (score) => (
                <div className="text-sm">
                    <div className="font-medium text-gray-700">
                        {formatDate(score.createdAt)}
                    </div>
                    {score.createdAt && !isNaN(new Date(score.createdAt).getTime()) && (
                        <div className="text-xs text-gray-500">
                            {new Date(score.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Employee Scores</h2>
                    <Button
                        onClick={exportScores}
                        disabled={!scores.length}
                        variant="outline"
                        className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                    >
                        <FaDownload className="mr-2" />
                        Export CSV
                    </Button>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <FaUser className="mr-2 text-gray-500" size={14} />
                            Worker
                        </label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedWorker}
                            onChange={(e) => setSelectedWorker(e.target.value)}
                        >
                            <option value="">All Workers</option>
                            {workers.map(worker => (
                                <option key={worker._id} value={worker._id}>
                                    {worker.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <FaCalendarAlt className="mr-2 text-gray-500" size={14} />
                            Date
                        </label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            onClick={clearFilters}
                            variant="outline"
                            className="w-full"
                        >
                            Clear Filters
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-blue-600">{scores.length}</div>
                                <div className="bg-blue-100 p-2 rounded-lg">
                                    <FaCheckCircle className="text-blue-600" />
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">Total Tests</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-green-600">
                                    {new Set(scores.map(s => s.worker?._id)).size}
                                </div>
                                <div className="bg-green-100 p-2 rounded-lg">
                                    <FaUser className="text-green-600" />
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">Unique Employees</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-purple-600">
                                    {scores.reduce((sum, s) => sum + (s.score || 0), 0)}
                                </div>
                                <div className="bg-purple-100 p-2 rounded-lg">
                                    <FaTrophy className="text-purple-600" />
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">Total Points</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-orange-600">
                                    {scores.length > 0 
                                        ? Math.round(scores.reduce((sum, s) => {
                                            const percentage = s.totalQuestions > 0 ? (s.score / s.totalQuestions) * 100 : 0;
                                            return sum + percentage;
                                        }, 0) / scores.length)
                                        : 0}%
                                </div>
                                <div className="bg-orange-100 p-2 rounded-lg">
                                    <FaPercent className="text-orange-600" />
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">Avg Percentage</div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
                    </div>
                ) : scores.length > 0 ? (
                    <Table
                        columns={columns}
                        data={scores}
                        emptyMessage="No scores found. Employees need to complete tests first."
                    />
                ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
                        <FaTimesCircle size={48} className="mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Test Scores Found</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Employees need to complete tests first. Once tests are completed, their scores will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmployeeScores;