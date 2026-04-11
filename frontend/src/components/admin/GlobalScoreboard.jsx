// Test Management - Global Scoreboard Component
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Button from '../common/Button';
import Table from '../common/Table';
import { FaTrophy, FaUser, FaUsers, FaDownload, FaMedal, FaAward, FaCalendarAlt, FaFilter } from 'react-icons/fa';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const GlobalScoreboard = () => {
    const [scores, setScores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFilter, setDateFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [showExportDropdown, setShowExportDropdown] = useState(false);

    useEffect(() => {
        fetchScores();
    }, [dateFilter]);

    const fetchScores = async () => {
        try {
            setLoading(true);
            const endpoint = '/test/global-scores'; // Always use global-scores endpoint
            
            // Add date parameter if filter is set
            const params = new URLSearchParams();
            if (dateFilter) {
                params.append('date', dateFilter);
            }
            
            const response = await api.get(`${endpoint}${params.toString() ? `?${params.toString()}` : ''}`);
            setScores(response.data || []);
        } catch (error) {
            console.error('Error fetching scores:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportScoresToCSV = () => {
        const csvContent = [
            ['Rank', 'Name', 'Department', 'Points', 'Total Questions', 'Percentage', 'Tests'].join(','),
            ...scores.map((score, index) => [
                index + 1,
                score.name || 'Unknown User',
                score.department || '',
                score.totalScore || 0,
                score.totalPossibleScore || 0,
                score.totalPossibleScore > 0 ? Math.round((score.totalScore / score.totalPossibleScore) * 100) : 0,
                score.testCount || 0
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `global_scoreboard_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Close dropdown
        setShowExportDropdown(false);
    };

    const exportScoresToPDF = () => {
        const doc = new jsPDF();
        
        // Add title
        doc.setFontSize(18);
        doc.text('Overall Scoreboard Report', 14, 20);
        
        // Add date if filtered
        if (dateFilter) {
            doc.setFontSize(12);
            doc.text(`Date: ${new Date(dateFilter).toLocaleDateString()}`, 14, 30);
        }
        
        // Add generation date
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, dateFilter ? 37 : 30);
        
        // Prepare table data - removed TYPE column
        const tableColumn = ['Rank', 'Name', 'Department', 'Points', 'Total Questions', 'Percentage', 'Tests'];
        const tableRows = scores.map((score, index) => [
            index + 1,
            score.name || 'Unknown User',
            score.department || '',
            score.totalScore || 0,
            score.totalPossibleScore || 0,
            score.totalPossibleScore > 0 ? Math.round((score.totalScore / score.totalPossibleScore) * 100) + '%' : '0%',
            score.testCount || 0
        ]);
        
        // Add table using the correct autotable function
        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: dateFilter ? 45 : 40,
            styles: { fontSize: 8, halign: 'center' },
            headStyles: { fillColor: [66, 153, 225], halign: 'center' }, // Blue header
            alternateRowStyles: { fillColor: [245, 245, 245] }, // Light gray for alternate rows
            columnStyles: {
                0: { halign: 'center' }, // Rank
                1: { halign: 'center' }, // Name - changed to center alignment
                2: { halign: 'center' }, // Department - changed to center alignment
                3: { halign: 'center' }, // Points
                4: { halign: 'center' }, // Total Questions
                5: { halign: 'center' }, // Percentage
                6: { halign: 'center' }  // Tests
            }
        });
        
        // Save the PDF
        doc.save(`global_scoreboard_${new Date().getTime()}.pdf`);
        
        // Close dropdown
        setShowExportDropdown(false);
    };

    const clearFilters = () => {
        setDateFilter('');
    };

    const getRankIcon = (rank) => {
        switch (rank) {
            case 1:
                return <FaTrophy className="text-yellow-500" size={20} />;
            case 2:
                return <FaMedal className="text-gray-400" size={20} />;
            case 3:
                return <FaAward className="text-orange-600" size={20} />;
            default:
                return <span className="text-gray-500 font-bold">#{rank}</span>;
        }
    };

    const getTypeIcon = (type) => {
        return type === 'worker' ? 
            <FaUser className="text-blue-500" /> : 
            <FaUsers className="text-green-500" />;
    };

    const getTypeLabel = (type) => {
        return type === 'worker' ? 'Employee' : 'Guest';
    };

    const columns = [
        {
            key: 'rank',
            header: 'Rank',
            description: 'Position',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (score, index) => (
                <div className="flex items-center justify-center">
                    {getRankIcon(index + 1)}
                </div>
            )
        },
        {
            key: 'name',
            header: 'Name',
            description: 'Employee',
            align: 'text-left',
            headerAlign: 'text-left',
            render: (score) => (
                <div className="flex items-center">
                    {getTypeIcon(score.type)}
                    <div className="ml-3">
                        <div className="font-medium text-gray-800">
                            {score.name || 'Unknown User'}
                        </div>
                        <div className="text-sm text-gray-500">
                            {score.department || 'N/A'} • {getTypeLabel(score.type)}
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: 'totalScore',
            header: 'Points',
            description: 'Total Score',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (score) => (
                <div className="text-center">
                    <div className="text-xl font-bold text-purple-600">
                        {score.totalScore || 0}
                    </div>
                    <div className="text-sm text-gray-500">
                        points
                    </div>
                </div>
            )
        },
        {
            key: 'testCount',
            header: 'Tests',
            description: 'Completed',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (score) => (
                <div className="text-center">
                    <div className="text-lg font-semibold text-blue-600">
                        {score.testCount || 0}
                    </div>
                </div>
            )
        },
        {
            key: 'percentage',
            header: 'Percentage',
            description: 'Accuracy',
            align: 'text-center',
            headerAlign: 'text-center',
            render: (score) => {
                const percentage = score.totalPossibleScore > 0 
                    ? Math.round((score.totalScore / score.totalPossibleScore) * 100) 
                    : 0;
                const getPercentageColor = (percent) => {
                    if (percent >= 80) return 'text-green-600';
                    if (percent >= 60) return 'text-yellow-600';
                    return 'text-red-600';
                };
                return (
                    <div className="text-center">
                        <div className={`text-lg font-semibold ${getPercentageColor(percentage)}`}>
                            {percentage}%
                        </div>
                        <div className="text-sm text-gray-500">
                            {score.totalScore}/{score.totalPossibleScore || 0}
                        </div>
                    </div>
                );
            }
        },
    ];

    const topPerformers = scores.slice(0, 3);
    const totalParticipants = scores.length;
    const totalTests = scores.reduce((sum, score) => sum + (score.testCount || 0), 0);
    const totalPoints = scores.reduce((sum, score) => sum + (score.totalScore || 0), 0);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Global Scoreboard</h2>
                    <div className="flex space-x-2">
                        <Button
                            onClick={() => setShowFilters(!showFilters)}
                            variant="outline"
                        >
                            <FaFilter className="mr-2" />
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                        <div className="relative">
                            <Button
                                onClick={() => setShowExportDropdown(!showExportDropdown)}
                                disabled={!scores.length}
                                variant="outline"
                                className="flex items-center"
                            >
                                <FaDownload className="mr-2" />
                                Export
                            </Button>
                            {showExportDropdown && (
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-10">
                                    <button
                                        onClick={exportScoresToCSV}
                                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        Export as CSV
                                    </button>
                                    <button
                                        onClick={exportScoresToPDF}
                                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        Export as PDF
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filters */}
                {showFilters && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <FaCalendarAlt className="inline mr-2" />
                                    Date Filter
                                </label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
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
                    </div>
                )}

                {/* Top Performers */}
                {topPerformers.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">🏆 Top Performers</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {topPerformers.map((performer, index) => (
                                <div
                                    key={performer._id || index}
                                    className={`p-4 rounded-lg border-2 ${
                                        index === 0 
                                            ? 'border-yellow-400 bg-yellow-50' 
                                            : index === 1 
                                                ? 'border-gray-400 bg-gray-50' 
                                                : 'border-orange-400 bg-orange-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        {getRankIcon(index + 1)}
                                        {getTypeIcon(performer.type)}
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-gray-800">{performer.name}</div>
                                        <div className="text-2xl font-bold text-purple-600 my-2">
                                            {performer.totalPossibleScore > 0 
                                                ? Math.round((performer.totalScore / performer.totalPossibleScore) * 100)
                                                : 0}%
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {performer.totalScore || 0}/{performer.totalPossibleScore || 0} • {performer.testCount || 0} tests
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-blue-600">{totalParticipants}</div>
                            <div className="text-sm text-gray-600">Total Participants</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">{totalTests}</div>
                            <div className="text-sm text-gray-600">Tests Completed</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-purple-600">{totalPoints}</div>
                            <div className="text-sm text-gray-600">Total Points</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-orange-600">
                                {scores.length > 0 
                                    ? Math.round(scores.reduce((sum, score) => {
                                        const percentage = score.totalPossibleScore > 0 
                                            ? (score.totalScore / score.totalPossibleScore) * 100 
                                            : 0;
                                        return sum + percentage;
                                    }, 0) / scores.length)
                                    : 0}%
                            </div>
                            <div className="text-sm text-gray-600">Avg Percentage</div>
                        </div>
                    </div>
                </div>

                {/* Full Scoreboard Table */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
                    </div>
                ) : (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Complete Rankings</h3>
                        <Table
                            columns={columns}
                            data={scores}
                            emptyMessage="No scores found. Complete some tests to see rankings."
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default GlobalScoreboard;