// Test Management - Question History Component
import React, { useState, useEffect, useContext } from 'react';
import api from '../../services/api';
import { getWorkers } from '../../services/workerService';
import appContext from '../../context/AppContext';
import Button from '../common/Button';
import Table from '../common/Table';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import { FaSearch, FaCalendarAlt, FaUser, FaDownload, FaEye, FaFilter, FaChevronDown, FaChevronUp } from 'react-icons/fa';
// Update the import for PDF generation
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const QuestionHistory = () => {
    const { subdomain } = useContext(appContext);
    const [questions, setQuestions] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        workerId: '',
        topic: '',
        date: ''
    });
    const [expandedQuestions, setExpandedQuestions] = useState(new Set());
    const [showFilters, setShowFilters] = useState(true);

    useEffect(() => {
        fetchWorkers();

    }, []);

    useEffect(() => {
        // Only fetch questions if at least one filter is applied
        if (filters.workerId || filters.topic || filters.date) {
            fetchQuestions();
        } else {
            // If no filters, clear questions
            setQuestions([]);
        }
    }, [filters]);

    const fetchWorkers = async () => {
        try {
            const workersData = await getWorkers({ subdomain });
            setWorkers(workersData || []);
        } catch (error) {
            console.error('Error fetching workers:', error);
        }
    };

    const fetchQuestions = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filters.workerId) params.append('workerId', filters.workerId);
            if (filters.topic) params.append('topic', filters.topic);
            if (filters.date) params.append('date', filters.date);

            const response = await api.get(`/test/questions?${params.toString()}`);
            setQuestions(response.data.questions || []);
        } catch (error) {
            console.error('Error fetching questions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const clearFilters = () => {
        setFilters({
            workerId: '',
            topic: '',
            date: ''
        });
    };

    const exportQuestions = () => {
        const csvContent = [
            ['Worker Name', 'Topic', 'Question Text', 'Difficulty', 'Created Date'].join(','),
            ...questions.map(q => [
                q.worker?.name || 'Unknown Worker',
                q.topic,
                `"${q.questionText.replace(/"/g, '""')}"`,
                q.difficulty,
                new Date(q.createdAt).toLocaleDateString()
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `questions_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('p', 'mm', 'a4'); // Use A4 paper size for better standardization
        
        // Set document properties
        doc.setProperties({
            title: 'Question History Report',
            subject: 'Generated Questions Report',
            author: 'Admin Dashboard',
            keywords: 'questions, history, report, admin',
            creator: 'Task Tracker System'
        });
        
        // Add header with clean styling
        doc.setFillColor(59, 130, 246); // Blue background
        doc.rect(0, 0, 210, 30, 'F'); // Header rectangle (full width)
        
        // Add title - Center aligned
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255); // White text
        doc.setFont(undefined, 'bold');
        doc.text('Question History Report', 105, 18, null, null, 'center');
        
        // Add subtitle - Center aligned
        doc.setFontSize(12);
        doc.setTextColor(230, 230, 230); // Light gray text
        doc.setFont(undefined, 'normal');
        doc.text('Detailed report of all generated questions', 105, 25, null, null, 'center');
        
        // Add report info section
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0); // Black text
        
        // Left side - Report generation info
        const generationDate = new Date().toLocaleDateString();
        const generationTime = new Date().toLocaleTimeString();
        doc.text(`Generated on: ${generationDate}`, 15, 40);
        doc.text(`Time: ${generationTime}`, 15, 47);
        
        // Right side - Summary statistics
        const uniqueWorkers = new Set(questions.map(q => q.worker?._id)).size;
        const uniqueTopics = new Set(questions.map(q => q.topic)).size;
        doc.text(`Total Questions: ${questions.length}`, 150, 40);
        doc.text(`Workers: ${uniqueWorkers}`, 150, 47);
        doc.text(`Topics: ${uniqueTopics}`, 150, 54);
        
        // Add horizontal line separator
        doc.setDrawColor(200, 200, 200);
        doc.line(10, 60, 200, 60);
        
        // Prepare table data with improved formatting
        const tableColumn = [
            'Worker', 
            'Topic', 
            'Question', 
            'Choices', 
            'Correct Answer', 
            'Difficulty', 
            'Format', 
            'Time', 
            'Date'
        ];
        
        const tableRows = [];
        
        questions.forEach((question, index) => {
            // Format choices with proper numbering
            let choicesText = '';
            if (question.options && Array.isArray(question.options)) {
                choicesText = question.options.map((option, i) => 
                    `${String.fromCharCode(65 + i)}. ${option}`
                ).join('\n');
            }
            
            // Get correct answer with proper formatting
            let correctAnswer = 'N/A';
            if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
                if (typeof question.correctAnswer === 'number' && question.options) {
                    // If correctAnswer is an index
                    correctAnswer = `${String.fromCharCode(65 + question.correctAnswer)}`;
                } else if (typeof question.correctAnswer === 'string') {
                    // If correctAnswer is a string
                    correctAnswer = question.correctAnswer;
                } else {
                    // Default case
                    correctAnswer = String(question.correctAnswer);
                }
            }
            
            const questionData = [
                question.worker?.name ? question.worker.name.substring(0, 15) : 'Unknown',
                question.topic ? question.topic.substring(0, 12) : 'N/A',
                question.questionText ? question.questionText.substring(0, 30) + (question.questionText.length > 30 ? '...' : '') : 'No question',
                choicesText ? choicesText.substring(0, 50) + (choicesText.length > 50 ? '...' : '') : 'No choices',
                correctAnswer,
                question.difficulty || 'N/A',
                question.questionFormat === 'upsc' ? 'UPSC' : 'MCQ',
                question.timeDuration ? `${question.timeDuration}s` : '15s',
                question.createdAt ? new Date(question.createdAt).toLocaleDateString() : 'N/A'
            ];
            tableRows.push(questionData);
        });
        
        // Add table to PDF with clean alignment
        try {
            if (typeof doc.autoTable === 'function') {
                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    startY: 65,
                    styles: {
                        fontSize: 8,
                        cellPadding: 2.5,
                        overflow: 'linebreak',
                        cellWidth: 'wrap',
                        valign: 'middle'
                    },
                    headStyles: {
                        fillColor: [59, 130, 246], // Blue header
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'center'
                    },
                    bodyStyles: {
                        textColor: [0, 0, 0],
                        fontSize: 7,
                        halign: 'left',
                        valign: 'top'
                    },
                    alternateRowStyles: {
                        fillColor: [248, 249, 250] // Very light gray for alternate rows
                    },
                    columnStyles: {
                        0: { cellWidth: 22, halign: 'left' },   // Worker
                        1: { cellWidth: 18, halign: 'left' },   // Topic
                        2: { cellWidth: 35, halign: 'left' },   // Question
                        3: { cellWidth: 42, halign: 'left' },   // Choices
                        4: { cellWidth: 18, halign: 'center' }, // Correct Answer
                        5: { cellWidth: 15, halign: 'center' }, // Difficulty
                        6: { cellWidth: 15, halign: 'center' }, // Format
                        7: { cellWidth: 12, halign: 'center' }, // Time
                        8: { cellWidth: 18, halign: 'center' }  // Date
                    },
                    margin: { top: 65, left: 10, right: 10, bottom: 20 },
                    theme: 'grid',
                    tableLineColor: [220, 220, 220],
                    tableLineWidth: 0.1,
                    didDrawPage: function(data) {
                        // Add page number - Center aligned at bottom
                        const pageCount = doc.internal.getNumberOfPages();
                        doc.setFontSize(9);
                        doc.setTextColor(150);
                        doc.text(`Page ${pageCount}`, 105, 290, null, null, 'center');
                    }
                });
            } else {
                throw new Error('autoTable function not available');
            }
        } catch (error) {
            console.error('Error with autoTable, using fallback:', error);
            
            // Clean text-based fallback with proper formatting
            let yPos = 75;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(59, 130, 246); // Blue text
            doc.text('Question Details', 105, yPos, null, null, 'center');
            yPos += 10;
            
            doc.setFont(undefined, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0); // Black text
            
            questions.forEach((question, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                    // Add header to new page
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(59, 130, 246);
                    doc.text(`Question Details (continued)`, 105, yPos, null, null, 'center');
                    yPos += 10;
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(0, 0, 0);
                }
                
                // Format choices
                let choicesText = '';
                if (question.options && Array.isArray(question.options)) {
                    choicesText = question.options.map((option, i) => 
                        `${String.fromCharCode(65 + i)}. ${option}`
                    ).join('\n');
                }
                
                // Get correct answer
                let correctAnswer = question.correctAnswer || 'N/A';
                if (typeof question.correctAnswer === 'number' && question.options) {
                    correctAnswer = `${String.fromCharCode(65 + question.correctAnswer)} (${question.options[question.correctAnswer]})`;
                }
                
                // Create structured content without special characters
                const content = [
                    `Question #${index + 1}`,
                    `----------------------------------------`,
                    `Question: ${question.questionText || 'No question text'}`,
                    ``,
                    `Worker: ${question.worker?.name || 'Unknown Worker'} | Topic: ${question.topic || 'N/A'}`,
                    `Difficulty: ${question.difficulty || 'N/A'} | Format: ${question.questionFormat === 'upsc' ? 'UPSC/GK' : 'MCQ'} | Time: ${question.timeDuration || 15}s`,
                    ``,
                    `Choices:`,
                    `${choicesText || 'No choices available'}`,
                    ``,
                    `Correct Answer: ${correctAnswer}`,
                    `Created: ${question.createdAt ? new Date(question.createdAt).toLocaleDateString() : 'N/A'}`,
                    ``,
                    ``  // Extra spacing
                ].join('\n');
                
                const lines = doc.splitTextToSize(content, 190);
                doc.text(lines, 10, yPos);
                yPos += lines.length * 4;
            });
        }
        
        // Add footer to all pages
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text('Generated by Task Tracker System', 105, 295, null, null, 'center');
        }
        
        // Save the PDF
        doc.save(`question_history_${new Date().getTime()}.pdf`);
    };

    const toggleQuestionExpansion = (questionId) => {
        const newExpanded = new Set(expandedQuestions);
        if (newExpanded.has(questionId)) {
            newExpanded.delete(questionId);
        } else {
            newExpanded.add(questionId);
        }
        setExpandedQuestions(newExpanded);
    };

    const columns = [
        {
            key: 'worker.name',
            title: 'Worker',
            render: (question) => (
                <div className="text-left">
                    <div className="font-medium text-gray-800">
                        {question.worker?.name || 'Unknown Worker'}
                    </div>
                    {question.worker?.departmentName ? (
                        <div className="text-sm text-gray-500">
                            {question.worker.departmentName}
                        </div>
                    ) : (
                        question.worker?.department ? (
                            <div className="text-sm text-gray-500">
                                {question.worker.department}
                            </div>
                        ) : null
                    )}
                </div>
            )
        },
        {
            key: 'topic',
            title: 'Topic',
            render: (question) => (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {question.topic}
                </span>
            )
        },
        {
            key: 'questionText',
            title: 'Question',
            render: (question) => {
                const isExpanded = expandedQuestions.has(question._id);
                const isUPSCFormat = question.questionFormat === 'upsc';
                
                return (
                    <div className="text-left">
                        {isUPSCFormat ? (
                            // UPSC/GK Style Question Format
                            <div>
                                <div className={`font-medium mb-2 ${isExpanded ? 'whitespace-pre-line' : 'truncate'} max-w-md`}>
                                    {question.questionText}
                                </div>
                                {isExpanded && (
                                    <div className="text-sm text-gray-600 space-y-1 mt-2">
                                        {question.options?.map((option, index) => (
                                            <div key={index} className="bg-gray-100 p-2 rounded">
                                                <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                                                {option}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Standard MCQ Format
                            <div>
                                <div className={`font-medium ${isExpanded ? '' : 'truncate'} max-w-md`}>
                                    {question.questionText}
                                </div>
                                {isExpanded && (
                                    <div className="text-sm text-gray-600 mt-2">
                                        {question.options?.map((option, index) => (
                                            <div key={index} className="bg-gray-100 p-2 rounded mb-1">
                                                <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                                                {option}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="mt-2 flex items-center space-x-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {question.questionFormat === 'upsc' ? 'UPSC/GK Style' : 'MCQ'}
                            </span>
                            <button 
                                onClick={() => toggleQuestionExpansion(question._id)}
                                className="text-blue-500 hover:text-blue-700 text-sm flex items-center"
                            >
                                {isExpanded ? (
                                    <>
                                        <span>Show Less</span>
                                        <FaChevronUp className="ml-1 text-xs" />
                                    </>
                                ) : (
                                    <>
                                        <span>Show Options</span>
                                        <FaChevronDown className="ml-1 text-xs" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                );
            }
        },
        {
            key: 'difficulty',
            title: 'Difficulty',
            render: (question) => {
                const colors = {
                    Easy: 'bg-green-100 text-green-800',
                    Medium: 'bg-yellow-100 text-yellow-800',
                    Hard: 'bg-red-100 text-red-800'
                };
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[question.difficulty] || 'bg-gray-100 text-gray-800'}`}>
                        {question.difficulty}
                    </span>
                );
            }
        },
        {
            key: 'questionFormat',
            title: 'Format',
            render: (question) => {
                const formatLabels = {
                    mcq: 'MCQ',
                    upsc: 'UPSC/GK'
                };
                const formatColors = {
                    mcq: 'bg-blue-100 text-blue-800',
                    upsc: 'bg-purple-100 text-purple-800'
                };
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${formatColors[question.questionFormat] || 'bg-gray-100 text-gray-800'}`}>
                        {formatLabels[question.questionFormat] || question.questionFormat}
                    </span>
                );
            }
        },
        {
            key: 'timeDuration',
            title: 'Time (sec)',
            render: (question) => (
                <span className="text-gray-600">
                    {question.timeDuration || 15}s
                </span>
            )
        },
        {
            key: 'createdAt',
            title: 'Created',
            render: (question) => (
                <div className="text-sm text-gray-600">
                    {new Date(question.createdAt).toLocaleDateString()}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">Question History</h2>
                            <p className="text-gray-600 mt-1">View and manage all generated questions</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                onClick={() => setShowFilters(!showFilters)}
                                variant="outline"
                                className="flex items-center justify-center"
                            >
                                <FaFilter className="mr-2" />
                                {showFilters ? 'Hide Filters' : 'Show Filters'}
                            </Button>
                            <Button
                                onClick={exportQuestions}
                                disabled={!questions.length}
                                variant="outline"
                                className="flex items-center justify-center"
                            >
                                <FaDownload className="mr-2" />
                                Export CSV
                            </Button>
                            {/* Add PDF Export Button */}
                            <Button
                                onClick={exportToPDF}
                                disabled={!questions.length}
                                variant="outline"
                                className="flex items-center justify-center"
                            >
                                <FaDownload className="mr-2" />
                                Export PDF
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Collapsible Filters - Show by default */}
                {showFilters && (
                    <div className="p-6 border-b border-gray-200 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Worker
                                </label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={filters.workerId}
                                    onChange={(e) => handleFilterChange('workerId', e.target.value)}
                                >
                                    <option value="">Select Worker</option>
                                    {workers.map(worker => (
                                        <option key={worker._id} value={worker._id}>
                                            {worker.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Topic
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Search by topic..."
                                    value={filters.topic}
                                    onChange={(e) => handleFilterChange('topic', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Date
                                </label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={filters.date}
                                    onChange={(e) => handleFilterChange('date', e.target.value)}
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

                {/* Stats - Only show if there are questions */}
                {questions.length > 0 && (
                    <div className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-blue-600">{questions.length}</div>
                                <div className="text-sm text-gray-600">Total Questions</div>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">
                                    {new Set(questions.map(q => q.worker?._id)).size}
                                </div>
                                <div className="text-sm text-gray-600">Unique Workers</div>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-purple-600">
                                    {new Set(questions.map(q => q.topic)).size}
                                </div>
                                <div className="text-sm text-gray-600">Unique Topics</div>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-orange-600">
                                    {questions.filter(q => 
                                        new Date(q.createdAt).toDateString() === new Date().toDateString()
                                    ).length}
                                </div>
                                <div className="text-sm text-gray-600">Today's Questions</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Spinner />
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-lg border border-gray-200">
                            <Table
                                columns={columns}
                                data={questions}
                                emptyMessage="Select a worker to view their question history."
                                striped={true}
                                hover={true}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuestionHistory;