 import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import appContext from '../../context/AppContext';
import { useSocket } from '../../context/SocketContextNew';
import { getTickets, createTicket, updateTicket, deleteTicket, getTicketCompletions, uploadReference } from '../../services/ticketService';
import { getWorkers } from '../../services/workerService';
import Spinner from '../common/Spinner';
import {
    Search, Plus, Trash2, CheckSquare,
    AlertCircle, Bookmark, Zap, ArrowUp, ArrowDown,
    Minus, X, User, AlignLeft, LayoutDashboard, Flag, List, ListOrdered,
    Calendar, Clock, Check, ChevronDown, BarChart2, Users, Info, Eye, Paperclip, CheckCircle2, History, Tag, MessageSquare, Download, Maximize2, FileText, HelpCircle, ImagePlus
} from 'lucide-react';
import { getFullFileUrl } from '../../utils/fileUtils';
import { toast } from 'react-toastify';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// 🔹 Optimized Title Input to prevent lag/cursor jump
const TitleInput = ({ initialValue, onUpdate }) => {
    const [localValue, setLocalValue] = useState(initialValue || '');
    const timerRef = useRef(null);

    useEffect(() => {
        setLocalValue(initialValue || '');
    }, [initialValue]);

    const handleChange = (e) => {
        const val = e.target.value;
        setLocalValue(val);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onUpdate(val);
        }, 800);
    };

    return (
        <input
            type="text"
            autoFocus
            value={localValue}
            onChange={handleChange}
            className="w-full text-xl font-bold text-gray-800 border-none bg-transparent rounded-xl p-0 focus:outline-none transition-all leading-tight placeholder-gray-200 overflow-hidden text-ellipsis whitespace-nowrap"
            placeholder="Untitled Workspace..."
            title={localValue}
        />
    );
};

// 🔹 Auto-growing Textarea for compact feedback
const AutoGrowingTextarea = ({ value, onChange, placeholder, className }) => {
    const textareaRef = useRef(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${className} resize-none overflow-hidden min-h-[40px]`}
            rows={1}
        />
    );
};


const IssueIcon = ({ type }) => {
    switch (type) {
        case 'Bug': return <AlertCircle className="w-5 h-5 text-red-500" title="Bug" />;
        case 'Story': return <Bookmark className="w-5 h-5 text-teal-500" title="Story" />;
        case 'Epic': return <Zap className="w-5 h-5 text-purple-500" title="Epic" />;
        case 'Task':
        default: return <CheckSquare className="w-5 h-5 text-blue-500" title="Task" />;
    }
};

const PriorityIcon = ({ priority }) => {
    switch (priority) {
        case 'High': return <ArrowUp className="w-4 h-4 text-red-500" title="High Priority" />;
        case 'Medium': return <Minus className="w-4 h-4 text-orange-500" title="Medium Priority" />;
        case 'Low': return <ArrowDown className="w-4 h-4 text-blue-500" title="Low Priority" />;
        default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
};

const TagInput = ({ tags, onChange, placeholder }) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = inputValue.trim().replace(/,/g, '');
            if (tag && !tags.includes(tag)) {
                onChange([...tags, tag]);
                setInputValue('');
            }
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            onChange(tags.slice(0, -1));
        }
    };

    const removeTag = (tagToRemove) => {
        onChange(tags.filter(tag => tag !== tagToRemove));
    };

    return (
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all min-h-[42px] w-full shadow-sm">
            {tags.map((tag, index) => (
                <span key={index} className="flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-xs font-bold rounded-md border border-teal-100 animate-in zoom-in-95 duration-200">
                    {tag}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                        className="hover:text-teal-900 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </span>
            ))}
            <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm p-1 outline-none placeholder-gray-400 min-w-[80px]"
            />
        </div>
    );
};

const getTicketKey = (id) => id ? `CG-${id.substring(id.length - 4).toUpperCase()}` : '';

const isOverdue = (endDate, status) => {
    if (!endDate || status === 'Done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return end < today;
};

const MultiSelect = ({ options, selected, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (id) => {
        if (selected.includes(id)) {
            onChange(selected.filter(item => item !== id));
        } else {
            onChange([...selected, id]);
        }
    };

    const selectedOptions = options.filter(opt => selected.includes(opt.id));

    return (
        <div className="relative" ref={containerRef}>
            <div
                className="flex flex-wrap items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl min-h-[48px] cursor-pointer hover:border-teal-500 transition-all shadow-sm group"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 w-[calc(100%-24px)]">
                        {selectedOptions.map(opt => (
                            <span key={opt.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-lg border border-teal-100 shadow-sm animate-in zoom-in-90">
                                {opt.name}
                                <X className="w-3 h-3 hover:text-red-500 transition-colors" onClick={(e) => { e.stopPropagation(); toggleOption(opt.id); }} />
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-gray-400 text-sm font-medium">{placeholder}</span>
                )}
                <ChevronDown className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''} group-hover:text-teal-500`} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-[300] max-h-60 overflow-y-auto animate-in zoom-in-95 duration-200">
                    <div className="p-2 space-y-1">
                        {options.filter(opt => opt.status !== 'Relieved').map(opt => (
                            <div
                                key={opt.id}
                                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${selected.includes(opt.id) ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                onClick={() => toggleOption(opt.id)}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">{opt.name}</span>
                                </div>
                                {selected.includes(opt.id) && <Check className="w-4 h-4" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const AssignmentSection = ({ selectedTicket, updateSelectedTicket, workers }) => {
    const [assignmentType, setAssignmentType] = useState('Individual'); // Team, Individual, Both

    useEffect(() => {
        if (selectedTicket.team && selectedTicket.assignees?.length > 0) {
            // Check if all team members are in assignees
            const teamMembers = workers.filter(w => w.status !== 'Relieved' && w.department === selectedTicket.team).map(w => w._id);
            const hasExtra = selectedTicket.assignees.some(id => !teamMembers.includes(typeof id === 'object' ? id._id : id));
            if (hasExtra) setAssignmentType('Both');
            else setAssignmentType('Team');
        } else if (selectedTicket.team) {
            setAssignmentType('Team');
        } else {
            setAssignmentType('Individual');
        }
    }, [selectedTicket._id]);

    const handleTypeChange = (type) => {
        setAssignmentType(type);
        if (type === 'Individual') {
            updateSelectedTicket({ team: '' });
        }
    };

    const handleTeamChange = (team) => {
        updateSelectedTicket({ team });
        if (assignmentType === 'Team') {
            const teamMembers = workers.filter(w => w.status !== 'Relieved' && w.department === team).map(w => w._id);
            updateSelectedTicket({ assignees: teamMembers });
        } else if (assignmentType === 'Both') {
            const teamMembers = workers.filter(w => w.status !== 'Relieved' && w.department === team).map(w => w._id);
            const currentAssignees = (selectedTicket.assignees || []).map(a => typeof a === 'object' ? a._id : a);
            const merged = [...new Set([...teamMembers, ...currentAssignees])];
            updateSelectedTicket({ assignees: merged });
        }
    };

    const handleEmployeeChange = (employeeIds) => {
        let finalIds = [...employeeIds];
        if (assignmentType === 'Team' || assignmentType === 'Both') {
            if (selectedTicket.team) {
                const teamMembers = workers.filter(w => w.status !== 'Relieved' && w.department === selectedTicket.team).map(w => w._id);
                finalIds = [...new Set([...teamMembers, ...finalIds])];
            }
        }
        updateSelectedTicket({ assignees: finalIds });
    };

    const currentAssigneeIds = (selectedTicket.assignees || []).map(a => typeof a === 'object' ? a._id : a);
    const teamMembersCount = selectedTicket.team ? workers.filter(w => w.status !== 'Relieved' && w.department === selectedTicket.team).length : 0;
    const finalCount = currentAssigneeIds.length;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-2">
                <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Assign To</span>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
                    {['Team', 'Individual', 'Both'].map(type => (
                        <button
                            key={type}
                            onClick={() => handleTypeChange(type)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${assignmentType === type ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {(assignmentType === 'Team' || assignmentType === 'Both') && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Select Team</span>
                    <Select value={selectedTicket.team || undefined} onValueChange={handleTeamChange}>
                        <SelectTrigger className="w-full bg-white border-gray-300 h-11 text-sm shadow-sm rounded-lg">
                            <SelectValue placeholder="Select a team..." />
                        </SelectTrigger>
                        <SelectContent className="z-[700]">
                            {[...new Set(workers.filter(w => w.status !== 'Relieved').map(w => w.department).filter(d => d && d.trim() !== '' && d.trim().toUpperCase() !== 'N/A'))].length > 0 ? (
                                [...new Set(workers.filter(w => w.status !== 'Relieved').map(w => w.department).filter(d => d && d.trim() !== '' && d.trim().toUpperCase() !== 'N/A'))].map(team => (
                                    <SelectItem key={team} value={team}>{team}</SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled>No teams available</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    {selectedTicket.team && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 text-[11px] font-bold mt-1">
                            <Users className="w-3.5 h-3.5" />
                            Team: {selectedTicket.team} ({teamMembersCount} members)
                        </div>
                    )}
                </div>
            )}

            {(assignmentType === 'Individual' || assignmentType === 'Both') && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Select Employees</span>
                    <MultiSelect
                        options={workers.map(w => ({ id: w._id, name: w.name, status: w.status }))}
                        selected={currentAssigneeIds}
                        onChange={handleEmployeeChange}
                        placeholder="Add employees..."
                    />
                </div>
            )}
        </div>
    );
};

const WorkAllocation = () => {
    const [tickets, setTickets] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAssignee, setFilterAssignee] = useState('');
    const [filterTeam, setFilterTeam] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [modalFilterTeam, setModalFilterTeam] = useState('');
    const { subdomain } = useContext(appContext);
    const { socket } = useSocket();
    const saveTimeoutRef = useRef(null);

    // Modal state
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [tempTicketId, setTempTicketId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refManager, setRefManager] = useState({ isOpen: false, ticketId: '', subTaskId: '', workerId: '', files: [] });
    const [isDraggingRef, setIsDraggingRef] = useState(false);

    // Inline creation state
    const [inlineCreateStatus, setInlineCreateStatus] = useState(null);
    const [inlineTitle, setInlineTitle] = useState('');

    const [dragOverCol, setDragOverCol] = useState(null);
    const [touchDraggedTicket, setTouchDraggedTicket] = useState(null);

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, ticket: null });
    const [rejectConfirm, setRejectConfirm] = useState({ isOpen: false, ticket: null, reason: '' });
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isDeletedModalOpen, setIsDeletedModalOpen] = useState(false);
    const [deletedTickets, setDeletedTickets] = useState([]);
    const [loadingDeleted, setLoadingDeleted] = useState(false);

    // Completion states for breakdown
    const [ticketCompletions, setTicketCompletions] = useState([]);
    const [isFetchingCompletions, setIsFetchingCompletions] = useState(false);
    const [proofViewer, setProofViewer] = useState({ isOpen: false, files: [], userName: '', subTaskText: '' });
    const [zoomedImage, setZoomedImage] = useState(null);
    const [uploadingRef, setUploadingRef] = useState({ ticketId: null, subTaskId: null, workerId: null });
    const refFileInputRef = useRef(null);

    const columns = ['To Do', 'In Progress', 'Review', 'Done'];

    useEffect(() => { fetchData(); }, [subdomain]);

    useEffect(() => {
        if (selectedTicket && selectedTicket._id !== 'new') {
            fetchCompletions(selectedTicket._id);
        } else {
            setTicketCompletions([]);
        }
    }, [selectedTicket?._id]);

    // Socket listeners for real-time updates
    useEffect(() => {
        if (!socket) return;

        socket.on('ticket:created', (newTicket) => {
            setTickets(prev => {
                if (prev.find(t => t._id === newTicket._id)) return prev;
                return [newTicket, ...prev];
            });
        });

        socket.on('ticket:updated', (updatedTicket) => {
            setTickets(prev => prev.map(t => t._id === updatedTicket._id ? updatedTicket : t));
            // Also update selected ticket if it's the one open, ensuring dates are formatted for the UI
            setSelectedTicket(prev => {
                if (prev && prev._id === updatedTicket._id) {
                    return {
                        ...updatedTicket,
                        startDate: updatedTicket.startDate ? new Date(updatedTicket.startDate).toISOString().split('T')[0] : '',
                        endDate: updatedTicket.endDate ? new Date(updatedTicket.endDate).toISOString().split('T')[0] : ''
                    };
                }
                return prev;
            });
        });

        socket.on('ticket:deleted', ({ id }) => {
            setTickets(prev => prev.filter(t => t._id !== id));
            if (selectedTicket?._id === id) {
                setIsModalOpen(false);
                setSelectedTicket(null);
            }
        });

        socket.on('subtask:completion_updated', ({ ticketId, subTaskId, workerId, completion }) => {
            if (selectedTicket && selectedTicket._id === ticketId) {
                setTicketCompletions(prev => {
                    const exists = prev.findIndex(c => c._id === completion._id);
                    if (exists !== -1) {
                        const updated = [...prev];
                        updated[exists] = completion;
                        return updated;
                    }
                    return [...prev, completion];
                });
            }
        });

        return () => {
            socket.off('ticket:created');
            socket.off('ticket:updated');
            socket.off('ticket:deleted');
            socket.off('subtask:completion_updated');
        };
    }, [socket, selectedTicket]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [ticketsData, workersData] = await Promise.all([
                getTickets({ subdomain }),
                getWorkers({ subdomain })
            ]);
            setTickets(ticketsData);
            setWorkers(workersData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCompletions = async (ticketId) => {
        setIsFetchingCompletions(true);
        try {
            const data = await getTicketCompletions(ticketId);
            setTicketCompletions(data);
        } catch (error) {
            console.error('Error fetching completions:', error);
        } finally {
            setIsFetchingCompletions(false);
        }
    };

    const uploadRefFiles = async (files, ticketId, subTaskId, workerId) => {
        if (!files || files.length === 0) return;

        const formData = new FormData();
        formData.append('ticketId', ticketId);
        formData.append('subTaskId', subTaskId);
        formData.append('workerId', workerId);
        for (let i = 0; i < files.length; i++) {
            formData.append('references', files[i]);
        }

        try {
            const data = await uploadReference(formData);
            if (data.success) {
                setTicketCompletions(prev => {
                    const index = prev.findIndex(c => c._id === data.completion._id);
                    if (index !== -1) {
                        const newCompletions = [...prev];
                        newCompletions[index] = data.completion;
                        return newCompletions;
                    } else {
                        return [...prev, data.completion];
                    }
                });
                setRefManager(prev => ({ ...prev, files: data.completion.referenceFiles }));
                toast.success('Reference uploaded successfully!', {
                    icon: <CheckCircle2 className="w-5 h-5 text-teal-500" />,
                    className: 'bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-h-0 text-gray-800 text-sm font-bold flex items-center gap-3',
                    progressClassName: 'bg-teal-500',
                });
            } else {
                toast.error('Failed to upload reference: ' + data.message, {
                    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
                    className: 'bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-h-0 text-gray-800 text-sm font-bold flex items-center gap-3',
                    progressClassName: 'bg-red-500',
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Error uploading reference', {
                icon: <AlertCircle className="w-5 h-5 text-red-500" />,
                className: 'bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-h-0 text-gray-800 text-sm font-bold flex items-center gap-3',
                progressClassName: 'bg-red-500',
            });
        }
    };

    const handleRefFileChange = async (e) => {
        const files = e.target.files;
        await uploadRefFiles(files, uploadingRef.ticketId, uploadingRef.subTaskId, uploadingRef.workerId);
        if (refFileInputRef.current) refFileInputRef.current.value = '';
    };

    const handleDeleteReference = async (ticketId, subTaskId, workerId, fileId) => {
        try {
            const comp = ticketCompletions.find(c => 
                String(c.ticketId) === String(ticketId) && 
                String(c.subTaskId) === String(subTaskId) && 
                String(c.workerId?._id || c.workerId) === String(workerId)
            );
            if (!comp) return;

            const res = await fetch(`${process.env.VITE_API_URL || '/api'}/tickets/completions/${comp._id}/reference/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Reference deleted successfully', {
                    icon: <CheckCircle2 className="w-5 h-5 text-teal-500" />,
                    className: 'bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-h-0 text-gray-800 text-sm font-bold flex items-center gap-3',
                    progressClassName: 'bg-teal-500',
                });
                // Update local state
                setTicketCompletions(prev => prev.map(c => {
                    if (c._id === comp._id) {
                        return { ...c, referenceFiles: c.referenceFiles.filter(f => f._id !== fileId) };
                    }
                    return c;
                }));
                // Update refManager state
                setRefManager(prev => ({ ...prev, files: prev.files.filter(f => f._id !== fileId) }));
            } else {
                toast.error('Failed to delete reference: ' + data.message);
            }
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Error deleting reference');
        }
    };

    const triggerReferenceUpload = (ticketId, subTaskId, workerId) => {
        const comp = ticketCompletions.find(c => 
            String(c.ticketId) === String(ticketId) && 
            String(c.subTaskId) === String(subTaskId) && 
            String(c.workerId?._id || c.workerId) === String(workerId)
        );
        setRefManager({ 
            isOpen: true, 
            ticketId, 
            subTaskId, 
            workerId, 
            files: comp?.referenceFiles || [] 
        });
    };

    const fetchDeletedTickets = async () => {
        setLoadingDeleted(true);
        try {
            const data = await getTickets({ subdomain, isDeleted: true });
            setDeletedTickets(data);
        } catch (error) {
            console.error('Error fetching deleted tickets:', error);
        } finally {
            setLoadingDeleted(false);
        }
    };

    const handleDragStart = (e, ticketId) => {
        e.dataTransfer.setData('ticketId', ticketId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            const el = document.getElementById(ticketId);
            if (el) el.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnd = (e, ticketId) => {
        setDragOverCol(null);
        const el = document.getElementById(ticketId);
        if (el) el.style.opacity = '1';
    };

    const handleDragOver = (e, status) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== status) setDragOverCol(status);
    };

    const handleDragLeave = (e, status) => {
        e.preventDefault();
        if (dragOverCol === status) setDragOverCol(null);
    };

    // Touch Support for Mobile DND
    const handleTouchStart = (e, ticketId) => {
        setTouchDraggedTicket(ticketId);
        const el = document.getElementById(ticketId);
        if (el) el.style.opacity = '0.5';
    };

    const handleTouchMove = (e) => {
        if (!touchDraggedTicket) return;
        const touch = e.touches[0];
        // We need to temporarily disable pointer events on the dragged element
        // so that elementFromPoint can see what's underneath it.
        const draggedEl = document.getElementById(touchDraggedTicket);
        if (draggedEl) draggedEl.style.pointerEvents = 'none';

        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const column = target?.closest('[data-status]');

        if (draggedEl) draggedEl.style.pointerEvents = 'auto';

        if (column) {
            const status = column.getAttribute('data-status');
            if (dragOverCol !== status) setDragOverCol(status);
        } else {
            if (dragOverCol) setDragOverCol(null);
        }

        // Prevent page scroll while dragging
        if (e.cancelable) e.preventDefault();
    };

    const handleTouchEnd = async (e) => {
        if (!touchDraggedTicket) return;
        const ticketId = touchDraggedTicket;
        const targetStatus = dragOverCol;

        const el = document.getElementById(ticketId);
        if (el) el.style.opacity = '1';

        if (targetStatus) {
            const ticket = tickets.find(t => t._id === ticketId);
            if (ticket && ticket.status !== targetStatus) {
                updateStatus(ticketId, targetStatus);
            }
        }

        setTouchDraggedTicket(null);
        setDragOverCol(null);
    };

    const updateStatus = async (ticketId, targetStatus) => {
        const ticket = tickets.find(t => t._id === ticketId);
        if (!ticket || ticket.status === targetStatus) return;

        const updatedTickets = tickets.map(t =>
            t._id === ticketId ? { ...t, status: targetStatus } : t
        );
        setTickets(updatedTickets);

        try {
            await updateTicket(ticketId, { status: targetStatus, subdomain });
        } catch (error) {
            console.error('Error upgrading ticket:', error);
            fetchData();
        }
    };

    const handleDrop = async (e, targetStatus) => {
        e.preventDefault();
        setDragOverCol(null);
        const ticketId = e.dataTransfer.getData('ticketId');
        if (!ticketId) return;
        updateStatus(ticketId, targetStatus);
    };

    const saveInlineTicket = async (status) => {
        if (!inlineTitle.trim()) {
            setInlineCreateStatus(null);
            return;
        }
        try {
            const newTicket = await createTicket({
                title: inlineTitle,
                status,
                subdomain,
                issueType: 'Task',
                priority: 'Medium'
            });
            setTickets([newTicket, ...tickets]);
        } catch (e) {
            console.error(e);
        }
        setInlineTitle('');
        setInlineCreateStatus(null);
    };

    const updateSelectedTicket = async (updates, debounce = false) => {
        // Resolve full worker objects for local UI state if assignees change
        if (updates.hasOwnProperty('assignee') && typeof updates.assignee === 'string' && updates.assignee !== 'all') {
            const worker = workers.find(w => w._id === updates.assignee);
            updates.assignee = worker || null;
        }

        if (updates.hasOwnProperty('assignees') && Array.isArray(updates.assignees)) {
            updates.assignees = updates.assignees.map(id => {
                if (typeof id === 'string') {
                    return workers.find(w => w._id === id) || id;
                }
                return id;
            });
        }

        // Functional update for selectedTicket to ensure we never use stale state
        setSelectedTicket(prev => {
            const current = prev || {};
            const mergedUpdates = { ...updates };

            // Date Validation Logic
            if (mergedUpdates.hasOwnProperty('startDate') || mergedUpdates.hasOwnProperty('endDate')) {
                const startVal = mergedUpdates.startDate !== undefined ? mergedUpdates.startDate : current.startDate;
                const endVal = mergedUpdates.endDate !== undefined ? mergedUpdates.endDate : current.endDate;

                if (startVal && endVal) {
                    const start = new Date(startVal);
                    const end = new Date(endVal);
                    if (end < start) {
                        mergedUpdates.endDate = startVal;
                    }
                }
            }

            const updated = { ...current, ...mergedUpdates };

            // Sync with main tickets list
            if (updated._id && updated._id !== 'new') {
                setTickets(prevTickets => prevTickets.map(t => t._id === updated._id ? updated : t));

                const performUpdate = async () => {
                    if (updates.assignee === 'all') return;
                    try {
                        const apiUpdates = { ...mergedUpdates };
                        // Ensure assignees are sent as IDs to the backend
                        if (apiUpdates.assignee && typeof apiUpdates.assignee === 'object') {
                            apiUpdates.assignee = apiUpdates.assignee._id;
                        }
                        if (apiUpdates.assignees && Array.isArray(apiUpdates.assignees)) {
                            apiUpdates.assignees = apiUpdates.assignees.map(a => typeof a === 'object' ? a._id : a);
                        }
                        await updateTicket(updated._id, { ...apiUpdates, subdomain });
                    } catch (error) {
                        console.error('Update failed', error);
                        fetchData(); // Refresh on error
                    }
                };

                if (debounce) {
                    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = setTimeout(performUpdate, 1000);
                } else {
                    performUpdate();
                }
            }

            return updated;
        });
    };

    const updateChecklistItemText = (index, newText) => {
        const updatedChecklist = [...(selectedTicket.checklist || [])];
        if (updatedChecklist[index]) {
            updatedChecklist[index].text = newText;
            // Use debounce for text updates
            updateSelectedTicket({ checklist: updatedChecklist }, true);
        }
    };

    const addChecklistItem = (index) => {
        const updatedChecklist = [...(selectedTicket.checklist || [])];
        const newItem = { text: '', completed: false };
        if (typeof index === 'number') {
            updatedChecklist.splice(index + 1, 0, newItem);
        } else {
            updatedChecklist.push(newItem);
        }
        updateSelectedTicket({ checklist: updatedChecklist }, true);
    };

    const removeChecklistItem = (index) => {
        const updatedChecklist = [...(selectedTicket.checklist || [])];
        if (updatedChecklist.length <= 1) {
            updatedChecklist[0] = { text: '', completed: false };
        } else {
            updatedChecklist.splice(index, 1);
        }
        updateSelectedTicket({ checklist: updatedChecklist }, false);
    };

    const toggleChecklistItem = async (index) => {
        const updatedChecklist = [...(selectedTicket.checklist || [])];
        updatedChecklist[index].completed = !updatedChecklist[index].completed;
        updatedChecklist[index].completedAt = updatedChecklist[index].completed ? new Date() : null;

        // Auto move to Review if all items are completed
        const allCompleted = updatedChecklist.every(item => item.completed);
        let updatedStatus = selectedTicket.status;
        if (allCompleted && updatedChecklist.length > 0) {
            if (updatedStatus !== 'Done' && updatedStatus !== 'Review') {
                updatedStatus = 'Review';
            }
        }

        const updatedTicket = { ...selectedTicket, checklist: updatedChecklist, status: updatedStatus };
        setSelectedTicket(updatedTicket);

        if (updatedTicket._id !== 'new') {
            setTickets(tickets.map(t => t._id === updatedTicket._id ? updatedTicket : t));
            try {
                await updateTicket(updatedTicket._id, {
                    checklist: updatedChecklist,
                    status: updatedStatus,
                    subdomain
                });
            } catch (error) {
                console.error('Update failed', error);
                fetchData();
            }
        }
    };

    const handleDeleteTicket = (ticketToDelete = selectedTicket) => {
        if (!ticketToDelete || ticketToDelete._id === 'new') return;
        setDeleteConfirm({ isOpen: true, ticket: ticketToDelete });
    };

    const executeDelete = async () => {
        const ticketToDelete = deleteConfirm.ticket;
        if (!ticketToDelete) return;

        try {
            await deleteTicket(ticketToDelete._id);
            setTickets(tickets.filter(t => t._id !== ticketToDelete._id));
            if (isModalOpen && selectedTicket?._id === ticketToDelete._id) {
                setIsModalOpen(false);
                setSelectedTicket(null);
            }
            setDeleteConfirm({ isOpen: false, ticket: null });
        } catch (e) {
            console.error(e);
        }
    };

    const handleRejectSubmit = async () => {
        const { ticket, reason } = rejectConfirm;
        if (!ticket) return;

        try {
            await updateTicket(ticket._id, { status: 'In Progress', feedback: reason, subdomain });
            setTickets(tickets.map(t => t._id === ticket._id ? { ...t, status: 'In Progress', feedback: reason } : t));
            setRejectConfirm({ isOpen: false, ticket: null, reason: '' });
        } catch (err) {
            console.error(err);
        }
    };

    const filteredTickets = tickets.filter(t => {
        const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase());

        // Handle assignee filter (check both single assignee and assignees array)
        let matchesAssignee = true;
        if (filterAssignee === 'unassigned') {
            matchesAssignee = !t.assignee && (!t.assignees || t.assignees.length === 0);
        } else if (filterAssignee) {
            const assigneeId = t.assignee?._id || t.assignee;
            const inAssignees = t.assignees?.some(a => (typeof a === 'object' ? a._id === filterAssignee : a === filterAssignee));
            matchesAssignee = assigneeId === filterAssignee || inAssignees;
        }

        const matchesPriority = filterPriority ? t.priority === filterPriority : true;

        let matchesTeam = true;
        if (filterTeam) {
            if (filterTeam === 'unassigned') {
                matchesTeam = !t.team;
            } else {
                if (t.team) {
                    matchesTeam = t.team === filterTeam;
                } else {
                    // Fallback to checking assignee's team if task has no team set
                    const assigneeWorker = workers.find(w => w._id === (t.assignee?._id || t.assignee));
                    let teamMatched = assigneeWorker && assigneeWorker.department === filterTeam;

                    // Also check assignees array if fallback didn't match
                    if (!teamMatched && t.assignees?.length > 0) {
                        teamMatched = t.assignees.some(a => {
                            const wId = typeof a === 'object' ? a._id : a;
                            const w = workers.find(worker => worker._id === wId);
                            return w && w.department === filterTeam;
                        });
                    }
                    matchesTeam = teamMatched;
                }
            }
        }

        return matchesSearch && matchesAssignee && matchesPriority && matchesTeam;
    });

    if (loading) return <Spinner />;

    return (
        <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
            {/* Sticky Header Area - Handles Page-level context */}
            <div className="sticky top-0 z-[100] bg-white border-b border-slate-200/60 shadow-sm backdrop-blur-xl bg-white/95">
                <div className="px-6 md:px-10 py-5">
                    <div className="flex flex-col md:flex-row justify-between md:justify-end items-center gap-6 mb-4">
                        <div className="md:hidden">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Work Allocation</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Manage and assign tasks efficiently seamlessly.</p>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={() => setIsStatsModalOpen(true)}
                                className="flex-1 md:flex-none bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center text-xs transition-all border border-slate-200"
                            >
                                <BarChart2 className="w-4 h-4 mr-2 text-slate-400" />
                                <span>Dashboard</span>
                            </button>
                            <button
                                onClick={() => {
                                    setInlineCreateStatus(null);
                                    setSelectedTicket({
                                        _id: 'new', title: '', description: '', priority: 'Medium', status: 'To Do', issueType: 'Task', storyPoints: 0, labels: [], assignee: null, assignees: [], team: '', startDate: '', endDate: '', checklist: [{ text: '', completed: false }]
                                    });
                                    const tempId = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                                    setTempTicketId(tempId);
                                    setModalFilterTeam('');
                                    setIsModalOpen(true);
                                }}
                                className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl flex items-center justify-center text-xs transition-all shadow-lg shadow-blue-100 active:scale-95"
                            >
                                <Plus className="w-4 h-4 mr-2" /> New Task
                            </button>
                            <button
                                onClick={() => {
                                    fetchDeletedTickets();
                                    setIsDeletedModalOpen(true);
                                }}
                                className="flex-1 md:flex-none bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center text-xs transition-all border border-slate-200"
                            >
                                <History className="w-4 h-4 mr-2 text-slate-400" />
                                <span>Deleted Tasks</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                        <div className="relative w-full md:w-64 border border-slate-200 rounded-lg bg-white shadow-sm focus-within:border-teal-500 transition-all">
                            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search tasks..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-3 py-2 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex-1 md:flex-none">
                                <Select value={filterAssignee} onValueChange={(val) => setFilterAssignee(val === "all_assignees" ? "" : val)}>
                                    <SelectTrigger className="w-full md:w-[160px] bg-white border-slate-200 rounded-lg shadow-sm h-9 text-xs font-medium text-slate-600">
                                        <SelectValue placeholder="All Employees" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[200]">
                                        <SelectItem value="all_assignees">All Employees</SelectItem>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {workers.filter(w => w.status !== 'Relieved').map(w => (
                                            <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex-1 md:flex-none">
                                <Select value={filterTeam} onValueChange={(val) => setFilterTeam(val === "all_teams" ? "" : val)}>
                                    <SelectTrigger className="w-full md:w-[140px] bg-white border-slate-200 rounded-lg shadow-sm h-9 text-xs font-medium text-slate-600">
                                        <SelectValue placeholder="All Teams" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[200]">
                                        <SelectItem value="all_teams">All Teams</SelectItem>
                                        {[...new Set(workers.filter(w => w.status !== 'Relieved').map(w => w.department).filter(Boolean))].map(team => (
                                            <SelectItem key={team} value={team}>{team}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex-1 md:flex-none">
                                <Select value={filterPriority} onValueChange={(val) => setFilterPriority(val === "all_priorities" ? "" : val)}>
                                    <SelectTrigger className="w-full md:w-[120px] bg-white border-slate-200 rounded-lg shadow-sm h-9 text-xs font-medium text-slate-600">
                                        <SelectValue placeholder="Priority" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[200]">
                                        <SelectItem value="all_priorities">Priority</SelectItem>
                                        <SelectItem value="High">High</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="Low">Low</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {(filterAssignee || filterTeam || filterPriority || searchTerm) && (
                                <button
                                    onClick={() => {
                                        setFilterAssignee('');
                                        setFilterTeam('');
                                        setFilterPriority('');
                                        setSearchTerm('');
                                    }}
                                    className="text-[10px] text-rose-500 hover:text-rose-600 font-bold uppercase tracking-wider px-2"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Kanban Board Area - Horizontal Scroll container for columns */}
            <div className="flex-1 overflow-x-auto p-6 lg:p-8 pt-8 scroll-smooth">
                <div className="flex gap-6 items-start h-full min-h-[calc(100vh-280px)] pb-12">
                    {columns.map(status => (
                        <div
                            key={status}
                            data-status={status}
                            className={`flex flex-col w-[320px] max-h-full bg-[#f1f5f9]/80 rounded-2xl border border-slate-200/50 transition-all duration-300 group/column ${dragOverCol === status ? 'bg-slate-200/50 ring-2 ring-teal-500/20' : ''}`}
                            onDragOver={(e) => handleDragOver(e, status)}
                            onDragLeave={(e) => handleDragLeave(e, status)}
                            onDrop={(e) => handleDrop(e, status)}
                        >
                            {/* Column Header - Premium SaaS Style */}
                            <div className="flex-shrink-0 px-4 py-5 flex justify-between items-center sticky top-0 z-30">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-2 h-2 rounded-full ${status === 'To Do' ? 'bg-slate-400' : status === 'In Progress' ? 'bg-blue-500' : status === 'Review' ? 'bg-purple-500' : 'bg-emerald-500'}`}></div>
                                    <h2 className="text-[13px] font-bold text-slate-700 tracking-tight">{status}</h2>
                                    <span className="text-[10px] font-bold bg-slate-200 text-slate-500 px-2 py-0.5 rounded-md border border-slate-300/30">
                                        {filteredTickets.filter(t => t.status === status).length}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setInlineCreateStatus(status)}
                                    className="p-1 hover:bg-slate-200 rounded-md text-slate-400 transition-colors opacity-0 group-hover/column:opacity-100"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Column Content - Scrollable area for cards */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar min-h-0">
                                {filteredTickets.filter(t => t.status === status).map(ticket => (
                                    <div
                                        key={ticket._id}
                                        id={ticket._id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, ticket._id)}
                                        onDragEnd={(e) => handleDragEnd(e, ticket._id)}
                                        onTouchStart={(e) => handleTouchStart(e, ticket._id)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onClick={() => {
                                            setSelectedTicket({
                                                ...ticket,
                                                startDate: ticket.startDate ? new Date(ticket.startDate).toISOString().split('T')[0] : '',
                                                endDate: ticket.endDate ? new Date(ticket.endDate).toISOString().split('T')[0] : ''
                                            });
                                            setModalFilterTeam(ticket.team || '');
                                            setIsModalOpen(true);
                                        }}
                                        className={`p-4 rounded-xl border border-slate-200/60 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group active:scale-[0.98] bg-white relative
                                            ${isOverdue(ticket.endDate, ticket.status) ? 'border-rose-200 shadow-rose-50' : 'shadow-[0_2px_8px_rgba(0,0,0,0.04)]'} 
                                            ${status === 'To Do' ? 'border-l-4 border-l-slate-400' : status === 'In Progress' ? 'border-l-4 border-l-blue-500' : status === 'Review' ? 'border-l-4 border-l-purple-500' : 'border-l-4 border-l-emerald-500'}`}
                                    >
                                        <div className="flex justify-between items-start mb-3.5">
                                            {(ticket.startDate || ticket.endDate) && (
                                                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border 
                                                    ${isOverdue(ticket.endDate, ticket.status) ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-200/50'}`}>
                                                    <Clock className="w-3 h-3" />
                                                    {ticket.endDate ? new Date(ticket.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'}
                                                </div>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTicket(ticket);
                                                }}
                                                className="p-1 hover:bg-rose-50 rounded-md text-rose-300 hover:text-rose-500 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <div className="mb-4">
                                            <div className="text-[14px] font-bold text-slate-800 leading-snug group-hover:text-blue-600 transition-colors">
                                                {ticket.title}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            {/* Resolution Feedback (Match Image Orange Note Style) */}
                                            {ticket.feedback && (
                                                <div className="px-3 py-2.5 bg-[#fff7ed] border border-[#ffedd5] rounded-lg text-[10px] text-[#9a3412] font-semibold leading-relaxed shadow-sm">
                                                    <span className="text-[#c2410c] block mb-0.5 uppercase tracking-wider text-[9px]">Review Feedback:</span>
                                                    {ticket.feedback}
                                                </div>
                                            )}

                                            {/* Progress Section - Match Image */}
                                            {ticket.checklist && ticket.checklist.length > 0 && (
                                                <div>
                                                    <div className="flex justify-between items-center mb-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                                        <span>PROGRESS</span>
                                                        <span className="text-slate-400">
                                                            {ticket.status === 'Done' ? 100 : Math.round((ticket.checklist.filter(i => i.completed).length / ticket.checklist.length) * 100)}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                                        <div
                                                            className="bg-[#0d9488] h-1 rounded-full transition-all duration-700"
                                                            style={{ width: `${ticket.status === 'Done' ? 100 : (ticket.checklist.filter(i => i.completed).length / ticket.checklist.length) * 100}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-2 pt-2">
                                                <div className="flex gap-2">
                                                    {status === 'Review' ? (
                                                        <>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    updateStatus(ticket._id, 'Done');
                                                                }}
                                                                className="flex-1 py-1.5 bg-[#f0fdfa] text-[#0d9488] text-[9px] font-bold uppercase rounded-lg border border-[#ccfbf1] hover:bg-[#0d9488] hover:text-white transition-all tracking-wider shadow-sm"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    setRejectConfirm({ isOpen: true, ticket, reason: '' });
                                                                }}
                                                                className="px-2.5 py-1.5 bg-rose-50 text-rose-600 text-[9px] font-bold uppercase rounded-lg border border-rose-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {status !== 'To Do' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const prevStatus = columns[columns.indexOf(status) - 1];
                                                                        updateStatus(ticket._id, prevStatus);
                                                                    }}
                                                                    className="flex-1 py-1.5 bg-white text-slate-500 text-[10px] font-bold uppercase rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-all tracking-wider shadow-sm"
                                                                >
                                                                    Move Back
                                                                </button>
                                                            )}
                                                            {status !== 'Done' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const nextStatus = columns[columns.indexOf(status) + 1];
                                                                        updateStatus(ticket._id, nextStatus);
                                                                    }}
                                                                    className="flex-1 py-1.5 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-lg border border-blue-700 hover:bg-blue-700 transition-all tracking-wider shadow-md shadow-blue-100"
                                                                >
                                                                    Move Next
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between mt-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 text-slate-400">
                                                            <div className="w-3.5 h-3.5 rounded border border-slate-300 flex items-center justify-center">
                                                                <Check className="w-2 h-2" />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Task</span>
                                                        </div>
                                                        <div className="w-3 h-[1px] bg-slate-200"></div>
                                                        <span className="text-[10px] font-bold text-slate-400 tracking-tighter">#{getTicketKey(ticket._id).split('-')[1]}</span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 bg-[#f0fdfa] px-2.5 py-1 rounded-full border border-[#ccfbf1]">
                                                        <Users className="w-2.5 h-2.5 text-[#0d9488]" />
                                                        <span className="text-[9px] font-bold text-[#0d9488] whitespace-nowrap">
                                                            {ticket.assignees && ticket.assignees.length > 0
                                                                ? `${ticket.assignees[0].name}${ticket.assignees.length > 1 ? ` +${ticket.assignees.length - 1}` : ''}`
                                                                : ticket.assignee?.name || 'Unassigned'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Inline Create UI */}
                                {inlineCreateStatus === status ? (
                                    <div className="bg-white p-3 rounded-xl shadow-xl border border-teal-400 animate-in zoom-in-95 duration-200">
                                        <div className="relative">
                                            <textarea
                                                autoFocus
                                                placeholder="What needs to be done?"
                                                value={inlineTitle}
                                                onChange={(e) => setInlineTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        saveInlineTicket(status);
                                                    }
                                                }}
                                                className="w-full text-sm text-slate-800 focus:outline-none bg-transparent placeholder-slate-400 resize-none min-h-[60px] leading-tight font-medium"
                                                rows={2}
                                            />
                                        </div>
                                        <div className="flex items-center justify-end gap-2 mt-2">
                                            <button onClick={() => setInlineCreateStatus(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => saveInlineTicket(status)} className="bg-teal-600 text-white text-[10px] px-3 py-1.5 rounded-lg font-black uppercase tracking-wider hover:bg-teal-700 transition-colors shadow-lg shadow-teal-100">
                                                Add Task
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setInlineCreateStatus(status)}
                                        className="w-full py-2.5 rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50/50 flex items-center justify-center gap-2 transition-all duration-300 group/btn mt-1"
                                    >
                                        <Plus className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Add Task</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Full-Screen Workspace Task Modal */}
            {isModalOpen && selectedTicket && (
                <div className="fixed inset-0 bg-black/60 z-[600] flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-300 p-4">
                    <div className="bg-white rounded-2xl lg:rounded-3xl shadow-2xl w-full max-w-[1400px] h-[95vh] lg:h-[92vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20">

                        {/* Header */}
                        <div className="px-6 py-4 lg:px-8 lg:py-5 flex justify-between items-center text-gray-600 shrink-0 border-b border-gray-100 bg-gray-50/30">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center space-x-2 text-xs font-bold bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-200 uppercase tracking-widest text-teal-600">
                                    <IssueIcon type={selectedTicket.issueType} />
                                    <span>{selectedTicket._id === 'new' ? 'New Workspace' : `Task: ${selectedTicket._id.substring(selectedTicket._id.length - 6).toUpperCase()}`}</span>
                                </div>
                                {selectedTicket.team && (
                                    <div className="bg-teal-50 text-teal-700 px-3 py-2 rounded-xl text-[10px] font-bold uppercase border border-teal-100 flex items-center gap-1.5 shadow-sm">
                                        <Users className="w-3.5 h-3.5" /> Team: {selectedTicket.team}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center space-x-3">
                                {selectedTicket._id === 'new' && (
                                    <button
                                        disabled={!selectedTicket.title}
                                        onClick={async () => {
                                            setLoading(true);
                                            try {
                                                const taskToSave = { ...selectedTicket };

                                                // Remove UI-only fields
                                                delete taskToSave._id;
                                                taskToSave.subdomain = subdomain;

                                                // Ensure assignee and assignees are sent as IDs
                                                if (taskToSave.assignee && typeof taskToSave.assignee === 'object') {
                                                    taskToSave.assignee = taskToSave.assignee._id;
                                                }

                                                if (taskToSave.assignees && Array.isArray(taskToSave.assignees)) {
                                                    taskToSave.assignees = taskToSave.assignees.map(a =>
                                                        (a && typeof a === 'object') ? a._id : a
                                                    ).filter(Boolean);
                                                }

                                                // Clean up dates
                                                if (taskToSave.startDate === '') taskToSave.startDate = undefined;
                                                if (taskToSave.endDate === '') taskToSave.endDate = undefined;

                                                if (selectedTicket._id === 'new') {
                                                    taskToSave.tempId = tempTicketId;
                                                }
                                                const newT = await createTicket(taskToSave);
                                                setTickets([newT, ...tickets]);
                                                setIsModalOpen(false);
                                            } catch (e) {
                                                console.error('Save failed', e);
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        className="bg-teal-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-teal-700 transition-all shadow-md active:scale-[0.98] flex items-center gap-2 group disabled:opacity-50"
                                    >
                                        <Check className="w-4 h-4" /> Create Workspace
                                    </button>
                                )}
                                <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-red-50 hover:text-red-500 rounded-xl text-gray-400 transition-all bg-gray-100 border border-gray-200">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body - Responsive Layout */}
                        <div className="flex-1 overflow-y-auto lg:overflow-hidden bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[30%_25%_45%] lg:h-full divide-y md:divide-y-0 lg:divide-x divide-gray-100">

                                {/* 🔹 COLUMN 1: Task Input & Checklist (LEFT) */}
                                <div className="lg:h-full flex flex-col px-4 py-4 lg:px-6 lg:py-6 lg:overflow-hidden">
                                    <div className="shrink-0 mb-3 lg:mb-4">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <AlignLeft className="w-3.5 h-3.5 text-teal-600" />
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Workspace Definition</span>
                                        </div>
                                        <TitleInput
                                            initialValue={selectedTicket.title}
                                            onUpdate={(newTitle) => updateSelectedTicket({ title: newTitle }, true)}
                                        />

                                        {selectedTicket._id !== 'new' && selectedTicket.createdAt && (
                                            <div className="flex items-center gap-4 mt-2 text-[9px] font-bold text-gray-400">
                                                <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>Created: {new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                                                    <History className="w-3 h-3" />
                                                    <span>Mod: {new Date(selectedTicket.updatedAt).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col min-h-[200px] lg:min-h-0 bg-gray-50/30 rounded-2xl p-3 lg:p-4 border border-gray-100/50">
                                        <div className="flex justify-between items-center mb-2 shrink-0">
                                            <label className="text-xs font-bold text-gray-700 flex items-center">
                                                <List className="w-4 h-4 mr-2 text-teal-600" /> Task Checklist
                                            </label>
                                            <span className="text-[9px] font-extrabold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                                                {selectedTicket.checklist?.length || 0} SUB-TASKS
                                            </span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 pb-2">
                                            {(selectedTicket.checklist && selectedTicket.checklist.length > 0 ? selectedTicket.checklist : [{ text: '', completed: false }]).map((item, idx) => (
                                                <div key={idx} className="flex items-center gap-3 group py-2 px-3 bg-white hover:bg-teal-50/20 rounded-xl transition-all border border-gray-100 hover:border-teal-100 shadow-sm min-h-[56px] relative overflow-hidden">
                                                    <div className="flex items-center shrink-0">
                                                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${item.completed ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200'}`}>
                                                            {item.completed && <Check className="w-3.5 h-3.5" />}
                                                        </div>
                                                    </div>
                                                    <div className="relative flex-1 h-[40px] overflow-hidden group/textarea">
                                                        <textarea
                                                            autoFocus={idx > 0 && item.text === ''}
                                                            value={item.text}
                                                            onChange={(e) => updateChecklistItemText(idx, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(idx); }
                                                                else if (e.key === 'Backspace' && item.text === '' && (selectedTicket.checklist || []).length > 1) { e.preventDefault(); removeChecklistItem(idx); }
                                                            }}
                                                            className={`w-full bg-transparent border-none focus:ring-0 text-sm font-semibold text-gray-700 placeholder-gray-300 outline-none resize-none overflow-y-auto scrollbar-hidden h-full leading-tight py-0.5 ${item.completed ? 'text-gray-400 line-through italic' : ''}`}
                                                            placeholder="Next sub-task..."
                                                            rows={2}
                                                            title={item.text}
                                                        />
                                                        {/* Subtle bottom fade to indicate scrollability */}
                                                        <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-white to-transparent pointer-events-none group-hover:from-teal-50/40 transition-colors"></div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeChecklistItem(idx)}
                                                        className="p-1.5 text-orange-400 hover:text-red-600 hover:bg-red-50 transition-all rounded-lg bg-orange-50/50 hover:bg-red-100/50"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => addChecklistItem()}
                                            className="mt-2 flex items-center justify-center gap-2 text-teal-600 hover:bg-teal-600 hover:text-white text-[10px] font-extrabold uppercase tracking-widest transition-all p-2.5 bg-white border border-dashed border-teal-200 rounded-xl group shadow-sm active:scale-95"
                                        >
                                            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" /> Add Next Point
                                        </button>
                                    </div>

                                    {/* REFINED FIXED Planning Section at Bottom */}
                                    <div className="shrink-0 mt-2 pt-2 border-t border-gray-100 px-1 pb-1">
                                        <div className="bg-white border border-gray-200 rounded-[1.25rem] shadow-sm overflow-hidden">
                                            <div className="bg-gray-50/50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <LayoutDashboard className="w-4 h-4 text-teal-600" />
                                                    <h3 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">Resource Timeline & Tags</h3>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${isOverdue(selectedTicket.endDate, selectedTicket.status) ? 'bg-red-500 animate-pulse' : 'bg-teal-500'}`}></span>
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">{isOverdue(selectedTicket.endDate, selectedTicket.status) ? 'Overdue' : 'Active'}</span>
                                                </div>
                                            </div>

                                            <div className="p-2 lg:p-3 space-y-2 lg:space-y-3">
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight flex items-center gap-1.5">
                                                        <Calendar className="w-3 h-3 text-teal-600" /> Timeline Period
                                                    </label>
                                                    <div className="flex items-center gap-2 bg-gray-50/80 p-1 rounded-xl border border-gray-100">
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="date"
                                                                value={selectedTicket.startDate || ''}
                                                                onChange={(e) => updateSelectedTicket({ startDate: e.target.value })}
                                                                onClick={(e) => e.target.showPicker?.()}
                                                                className="w-full bg-white border border-gray-100 rounded-lg p-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-teal-500 shadow-sm cursor-pointer"
                                                            />
                                                            <span className="absolute -top-4 left-1 text-[8px] font-bold text-teal-600/50 uppercase">Start</span>
                                                        </div>
                                                        <div className="text-gray-300 font-bold">→</div>
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="date"
                                                                value={selectedTicket.endDate || ''}
                                                                onChange={(e) => updateSelectedTicket({ endDate: e.target.value })}
                                                                onClick={(e) => e.target.showPicker?.()}
                                                                className={`w-full border-none rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 shadow-sm cursor-pointer ${isOverdue(selectedTicket.endDate, selectedTicket.status) ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white text-gray-700 border border-gray-100'}`}
                                                            />
                                                            <span className="absolute -top-4 left-1 text-[8px] font-bold text-teal-600/50 uppercase">End</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="h-0.5 bg-gray-50 mx-1"></div>

                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight flex items-center gap-1.5">
                                                        <Zap className="w-3 h-3 text-orange-500" /> Priority Matrix
                                                    </label>
                                                    <div className="flex gap-2">
                                                        {['Low', 'Medium', 'High'].map(p => (
                                                            <button
                                                                key={p}
                                                                onClick={() => updateSelectedTicket({ priority: p })}
                                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase transition-all flex-1 border-2 ${selectedTicket.priority === p
                                                                    ? (p === 'High' ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-100' : p === 'Medium' ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-100' : 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-100')
                                                                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:bg-gray-50'}`}
                                                            >
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 🔹 COLUMN 2: Phase Status & Controls (CENTER) */}
                                <div className="lg:h-full flex flex-col p-4 lg:p-5 overflow-y-auto custom-scrollbar bg-gray-50/10 lg:border-r border-gray-100">
                                    <div className="space-y-4">
                                        {/* Status Control */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <History className="w-3.5 h-3.5 text-teal-600" />
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Phase Status</span>
                                            </div>
                                            <Select value={selectedTicket.status} onValueChange={(val) => updateSelectedTicket({ status: val })}>
                                                <SelectTrigger className="w-full bg-white border-gray-200 h-11 text-xs font-bold shadow-sm rounded-xl">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[250]">
                                                    {columns.map(col => (
                                                        <SelectItem key={col} value={col}>{col.toUpperCase()}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Assignment Center */}
                                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-white">
                                            <AssignmentSection
                                                selectedTicket={selectedTicket}
                                                updateSelectedTicket={updateSelectedTicket}
                                                workers={workers}
                                            />

                                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Flag className="w-3 h-3 text-teal-600" />
                                                        <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Work Type</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {['Task', 'Bug', 'Story', 'Epic'].map(type => (
                                                            <button
                                                                key={type}
                                                                onClick={() => updateSelectedTicket({ issueType: type })}
                                                                className={`px-3 py-2 rounded-xl text-[10px] font-extrabold uppercase transition-all flex items-center justify-center gap-1.5 border-2 ${selectedTicket.issueType === type
                                                                    ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm'
                                                                    : 'bg-gray-50 border-transparent text-gray-400 hover:border-gray-200'}`}
                                                            >
                                                                <IssueIcon type={type} />
                                                                {type}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Employee Query Display */}
                                                {selectedTicket.workerQuery && (
                                                    <div className="flex flex-col gap-2 pt-1 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <HelpCircle className="w-3 h-3 text-teal-600" />
                                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Employee Query</span>
                                                        </div>
                                                        <div className="w-full bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs font-medium text-teal-800">
                                                            {selectedTicket.workerQuery}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex flex-col gap-2 pt-1">
                                                    <div className="flex items-center gap-2">
                                                        <MessageSquare className="w-3 h-3 text-orange-500" />
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Resolution Feedback</span>
                                                    </div>
                                                    <AutoGrowingTextarea
                                                        value={selectedTicket.feedback || ''}
                                                        onChange={(newVal) => updateSelectedTicket({ feedback: newVal }, true)}
                                                        className="w-full bg-orange-50/50 border-none rounded-xl p-3 text-xs font-medium text-orange-800 placeholder-orange-300 focus:ring-2 focus:ring-orange-200 transition-all"
                                                        placeholder="Add review notes..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {selectedTicket._id !== 'new' && (
                                            <button
                                                onClick={() => handleDeleteTicket(selectedTicket)}
                                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-100 bg-red-50/30 text-red-600 hover:bg-red-500 hover:text-white transition-all font-bold text-[9px] uppercase tracking-widest group shadow-sm active:scale-95"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> Permanently Delete
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* 🔹 COLUMN 3: Execution & Analytics (RIGHT - MOVED FROM CENTER) */}
                                <div className="lg:h-full flex flex-col px-4 py-4 lg:px-6 lg:py-6 lg:overflow-hidden bg-gray-50/20">
                                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                                        {/* Progress Card */}
                                        {selectedTicket._id !== 'new' && (
                                            <div className="bg-white border border-teal-100/50 rounded-2xl p-4 shadow-sm mb-6 shrink-0 relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-teal-500"></div>
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                                        <BarChart2 className="w-3.5 h-3.5 text-teal-500" />
                                                        Overall Completion
                                                    </span>
                                                    <span className="text-[11px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full border border-teal-100">
                                                        {Math.round((selectedTicket.checklist?.filter(i => i.completed).length / selectedTicket.checklist?.length) * 100) || 0}% DONE
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden shadow-inner flex">
                                                    <div
                                                        className="bg-teal-500 h-2 transition-all duration-1000 ease-out"
                                                        style={{ width: `${(selectedTicket.checklist?.filter(i => i.completed).length / (selectedTicket.checklist?.length || 1)) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Execution Breakdown Area (SCROLLABLE) */}
                                        <div className="flex-1 flex flex-col min-h-0">
                                            <div className="flex items-center gap-2 mb-4 shrink-0">
                                                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                                                    <Users className="w-4 h-4 text-teal-600" />
                                                </div>
                                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Resource Execution Graph</h3>
                                            </div>

                                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-4 pb-6">
                                                {isFetchingCompletions ? (
                                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                                        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                                        <p className="text-xs font-bold uppercase tracking-widest">Loading Analytics...</p>
                                                    </div>
                                                ) : selectedTicket.assignees?.length > 0 ? (
                                                    selectedTicket.checklist?.map((item, idx) => {
                                                        const itemCompletions = ticketCompletions.filter(c => String(c.subTaskId) === String(item._id) || String(c.subTaskId) === String(idx));
                                                        return (
                                                            <div key={item._id || idx} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                                                <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span className="text-[9px] font-black bg-teal-100 text-teal-700 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                                                                            ST-{String(idx + 1).padStart(2, '0')}
                                                                        </span>
                                                                        <span className="text-xs font-bold text-gray-800 truncate" title={item.text || `Point ${idx + 1}`}>
                                                                            {item.text || `Point ${idx + 1}`}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex -space-x-1.5">
                                                                        {selectedTicket.assignees.slice(0, 5).map(w => (
                                                                            <div key={w._id || w} className={`w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-extrabold shadow-sm ${itemCompletions.some(c => String(c.workerId?._id || c.workerId) === String(w._id || w)) ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                                                {(w.name || 'W').charAt(0)}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <div className="p-3 space-y-3">
                                                                    {selectedTicket.assignees.map(worker => {
                                                                        const workerId = worker._id || worker;
                                                                        const comp = itemCompletions.find(c => String(c.workerId?._id || c.workerId) === String(workerId));
                                                                        const isDone = comp && comp.isCompleted;
                                                                        const hasProof = comp?.proofFiles?.length > 0;

                                                                        return (
                                                                            <div key={workerId} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 border border-gray-100 hover:bg-white hover:border-teal-200 hover:shadow-sm transition-all group">
                                                                                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                                                                                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-black text-teal-600 shadow-sm shrink-0">
                                                                                        {(worker.name || 'W').charAt(0).toUpperCase()}
                                                                                    </div>
                                                                                    <span className="text-sm font-bold text-gray-700 truncate" title={worker.name || 'Worker'}>
                                                                                        {worker.name || 'Worker'}
                                                                                    </span>
                                                                                </div>

                                                                                <div className="flex items-center gap-3 shrink-0 ml-auto">
                                                                                    {/* Status Badge */}
                                                                                    {isDone ? (
                                                                                        <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-green-100 shadow-sm">
                                                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Done
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-orange-100 shadow-sm">
                                                                                            <Clock className="w-3.5 h-3.5" /> Pending
                                                                                        </span>
                                                                                    )}

                                                                                    {/* Proof Status Button */}
                                                                                    <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-orange-100 hover:bg-orange-100 transition-all shadow-sm cursor-pointer" onClick={() => triggerReferenceUpload(selectedTicket._id === 'new' ? tempTicketId : selectedTicket._id, item._id || idx, workerId)}>
                                                                                        <Paperclip className="w-3.5 h-3.5" /> {comp?.referenceFiles?.length > 0 ? 'REF ✓' : 'REF'}
                                                                                    </span>

                                                                                    {/* View Action */}
                                                                                    {hasProof && (
                                                                                        <button
                                                                                            onClick={() => setProofViewer({ isOpen: true, files: comp.proofFiles, userName: worker.name, subTaskText: item.text })}
                                                                                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-teal-700 transition-all shadow-md shadow-teal-100 active:scale-95 ml-2 group"
                                                                                        >
                                                                                            <Eye className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> View
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                                        <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No Execution Data</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Scrollbar Styles appended for webkit */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: #94a3b8;
                }
                .scrollbar-hidden::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hidden {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}} />
            {/* Delete Confirmation Modal */}
            {
                deleteConfirm.isOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform animate-in zoom-in-95 duration-200">
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                                    <AlertCircle className="w-8 h-8 text-red-500" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Delete this task?</h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                                    Are you sure you want to delete this specific task? This action is permanent and cannot be undone.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setDeleteConfirm({ isOpen: false, ticket: null })}
                                        className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={executeDelete}
                                        className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md shadow-red-200 active:scale-95"
                                    >
                                        Delete Task
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Rejection Modal */}
            {
                rejectConfirm.isOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200 border border-white/20">
                            <div className="p-8">
                                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 border border-red-100 rotate-3">
                                    <MessageSquare className="w-8 h-8 text-red-500" />
                                </div>

                                <h3 className="text-2xl font-bold text-gray-900 mb-2">Reject Task</h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-6 font-medium">
                                    Please provide a reason for rejecting this task. This feedback will be shared with the team members.
                                </p>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <textarea
                                            autoFocus
                                            placeholder="Type your feedback here..."
                                            value={rejectConfirm.reason}
                                            onChange={(e) => setRejectConfirm({ ...rejectConfirm, reason: e.target.value })}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-medium text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none min-h-[120px] resize-none"
                                        />
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setRejectConfirm({ isOpen: false, ticket: null, reason: '' })}
                                            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleRejectSubmit}
                                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-200 active:scale-95"
                                        >
                                            Confirm Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Proof Viewer Modal */}
            {proofViewer.isOpen && (
                <div className="fixed inset-0 bg-black/80 z-[750] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Proof Viewer</h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    {proofViewer.userName}'s work on: {proofViewer.subTaskText}
                                </p>
                            </div>
                            <button onClick={() => setProofViewer({ ...proofViewer, isOpen: false })} className="p-2 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[85vh] custom-scrollbar bg-gray-50/30">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {proofViewer.files.map((file, idx) => {
                                    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|jfif)$/i.test(file.url);
                                    const isPDF = file.type === 'application/pdf' || /\.pdf$/i.test(file.url);
                                    const fileUrl = getFullFileUrl(file.url);

                                    return (
                                        <div key={file._id || idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                                            {isImage ? (
                                                <div
                                                    className="aspect-video bg-gray-100 relative overflow-hidden flex items-center justify-center cursor-zoom-in"
                                                    onClick={() => setZoomedImage({ url: fileUrl, name: file.name })}
                                                >
                                                    <img src={fileUrl} alt={file.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                        <div className="bg-white text-gray-800 p-2.5 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center gap-2">
                                                            <Eye className="w-5 h-5" />
                                                            <span className="text-[10px] font-bold uppercase pr-1">Preview</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : isPDF ? (
                                                <div
                                                    className="aspect-video bg-blue-50 flex flex-col items-center justify-center p-6 text-center border-b border-gray-100 cursor-pointer hover:bg-blue-100 transition-colors"
                                                    onClick={() => window.open(fileUrl, '_blank')}
                                                >
                                                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-red-500 mb-3">
                                                        <FileText className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PDF DOCUMENT</p>
                                                    <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Click to Preview</p>
                                                </div>
                                            ) : (
                                                <div className="aspect-video bg-gray-50 flex flex-col items-center justify-center p-6 text-center border-b border-gray-100">
                                                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-teal-600 mb-3">
                                                        <Paperclip className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{file.type?.split('/')[1] || 'FILE'}</p>
                                                </div>
                                            )}
                                            <div className="p-3 flex justify-between items-center bg-white mt-auto">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-700 truncate">{file.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-medium">Uploaded at {new Date(file.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {isImage && (
                                                        <button
                                                            onClick={() => setZoomedImage({ url: fileUrl, name: file.name })}
                                                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                            title="Preview"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <a
                                                        href={fileUrl}
                                                        download={file.name}
                                                        className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                        title="Download File"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox Style Image Preview */}
            {zoomedImage && (
                <div className="fixed inset-0 bg-black/90 z-[800] flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
                    <div className="absolute top-4 right-4 flex gap-3">
                        <a
                            href={zoomedImage.url}
                            download={zoomedImage.name}
                            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            title="Download"
                        >
                            <Download className="w-6 h-6" />
                        </a>
                        <button
                            onClick={() => setZoomedImage(null)}
                            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="w-full h-full flex flex-col items-center justify-center">
                        <img
                            src={zoomedImage.url}
                            alt={zoomedImage.name}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                        />
                        <p className="text-white text-sm font-bold mt-6 bg-black/50 px-6 py-2 rounded-full backdrop-blur-sm border border-white/10">
                            {zoomedImage.name}
                        </p>
                    </div>
                </div>
            )}

            {/* Hidden File Input for Reference Upload */}
            <input
                type="file"
                ref={refFileInputRef}
                onChange={handleRefFileChange}
                className="hidden"
                multiple
                accept="image/*"
            />

            {/* Stats Breakdown Modal */}
            <StatsBreakdownModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                tickets={tickets}
                workers={workers}
                columns={columns}
            />

            {/* Deleted Tasks Modal */}
            <DeletedTicketsModal
                isOpen={isDeletedModalOpen}
                onClose={() => setIsDeletedModalOpen(false)}
                tickets={deletedTickets}
                loading={loadingDeleted}
            />

            {/* Reference Manager Modal */}
            {refManager.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[700] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden transform animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-base font-bold text-gray-800">Reference Images</h3>
                                <p className="text-xs text-gray-500 font-medium">Manage reference images for this task</p>
                            </div>
                            <button 
                                onClick={() => setRefManager({ isOpen: false, ticketId: '', subTaskId: '', workerId: '', files: [] })}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors bg-white shadow-sm"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 bg-white">
                            {refManager.files && refManager.files.length > 0 ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {refManager.files.map((file, fIdx) => (
                                        <div key={file._id || fIdx} className="group relative border border-gray-100 rounded-xl overflow-hidden bg-gray-50/50 hover:shadow-md transition-all">
                                            <div className="aspect-square flex items-center justify-center bg-gray-100">
                                                {file.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || file.url.includes('blob:') ? (
                                                    <img 
                                                        src={getFullFileUrl(file.url)} 
                                                        alt={file.name} 
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <FileText className="w-12 h-12 text-teal-600" />
                                                )}
                                            </div>
                                            <div className="p-3 bg-white border-t border-gray-50">
                                                <p className="text-xs font-bold text-gray-700 truncate" title={file.name}>{file.name}</p>
                                                <div className="flex justify-between items-center mt-2">
                                                    <a 
                                                        href={getFullFileUrl(file.url)} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] font-bold text-teal-600 hover:text-teal-700 uppercase"
                                                    >
                                                        Full View
                                                    </a>
                                                    <button 
                                                        onClick={() => handleDeleteReference(refManager.ticketId, refManager.subTaskId, refManager.workerId, file._id)}
                                                        className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div 
                                    onClick={() => {
                                        setUploadingRef({ ticketId: refManager.ticketId, subTaskId: refManager.subTaskId, workerId: refManager.workerId });
                                        if (refFileInputRef.current) refFileInputRef.current.click();
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDraggingRef(true);
                                    }}
                                    onDragEnter={(e) => {
                                        e.preventDefault();
                                        setIsDraggingRef(true);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        setIsDraggingRef(false);
                                    }}
                                    onDrop={async (e) => {
                                        e.preventDefault();
                                        setIsDraggingRef(false);
                                        const files = e.dataTransfer.files;
                                        await uploadRefFiles(files, refManager.ticketId, refManager.subTaskId, refManager.workerId);
                                    }}
                                    className={`text-center py-12 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                                        isDraggingRef 
                                            ? 'border-teal-500 bg-teal-50/50' 
                                            : 'border-gray-200 hover:border-teal-400 hover:bg-gray-50/50'
                                    }`}
                                >
                                    <ImagePlus className={`w-12 h-12 mx-auto mb-3 transition-colors ${isDraggingRef ? 'text-teal-500' : 'text-gray-300'}`} />
                                    <p className="text-sm font-bold text-gray-600 mb-1">
                                        {isDraggingRef ? 'Drop images here!' : 'No reference images yet'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {isDraggingRef ? 'Release to upload' : 'Click to upload or drag and drop here.'}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <span className="text-xs text-gray-500 font-medium">
                                {refManager.files?.length || 0} file(s)
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setUploadingRef({ ticketId: refManager.ticketId, subTaskId: refManager.subTaskId, workerId: refManager.workerId });
                                        if (refFileInputRef.current) refFileInputRef.current.click();
                                    }}
                                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add New
                                </button>
                                <button
                                    onClick={() => setRefManager({ isOpen: false, ticketId: '', subTaskId: '', workerId: '', files: [] })}
                                    className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

const StatsBreakdownModal = ({ isOpen, onClose, tickets, workers, columns }) => {
    if (!isOpen) return null;

    // Calculate team-wise stats
    const teams = [...new Set(workers.map(w => w.department || 'Unassigned').filter(Boolean))];
    const teamStats = teams.map(team => {
        const teamWorkers = workers.filter(w => (w.department || 'Unassigned') === team).map(w => w._id);
        const teamTickets = tickets.filter(t =>
            (t.assignee && teamWorkers.includes(t.assignee._id || t.assignee)) ||
            (t.assignees && t.assignees.some(a => teamWorkers.includes(a._id || a)))
        );

        const stats = {};
        columns.forEach(col => {
            stats[col] = teamTickets.filter(t => t.status === col).length;
        });
        return { team, stats, total: teamTickets.length };
    });

    // Calculate person-wise stats
    const personStats = workers.map(worker => {
        const workerTickets = tickets.filter(t =>
            (t.assignee?._id || t.assignee) === worker._id ||
            (t.assignees && t.assignees.some(a => (a._id || a) === worker._id))
        );
        const stats = {};
        columns.forEach(col => {
            stats[col] = workerTickets.filter(t => t.status === col).length;
        });
        return { name: worker.name, team: worker.department || 'Unassigned', stats, total: workerTickets.length };
    });

    return (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col transform animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 flex justify-between items-center text-gray-800 shrink-0 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center space-x-2">
                        <BarChart2 className="w-5 h-5 text-teal-600" />
                        <h2 className="text-lg font-bold">Allocation Status Overview</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-10 custom-scrollbar bg-white">
                    {/* Team Summary Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-teal-500 pl-3">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Team-wise Performance</h3>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/80">
                                    <tr>
                                        <th className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100">Department / Team</th>
                                        {columns.map(col => (
                                            <th key={col} className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">{col}</th>
                                        ))}
                                        <th className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100 bg-teal-50/50 text-teal-600">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {teamStats.map(ts => (
                                        <tr key={ts.team} className="hover:bg-teal-50/30 transition-colors group">
                                            <td className="py-4 px-4">
                                                <div className="text-sm font-bold text-gray-700 group-hover:text-teal-700 transition-colors">{ts.team}</div>
                                            </td>
                                            {columns.map(col => (
                                                <td key={col} className="py-4 px-4 text-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold ${ts.stats[col] > 0 ? (col === 'Done' ? 'bg-green-100 text-green-700' : 'bg-teal-50 text-teal-700') : 'bg-gray-50 text-gray-300'}`}>
                                                        {ts.stats[col]}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="py-4 px-4 text-center bg-teal-50/20">
                                                <span className="text-sm font-extrabold text-gray-900">
                                                    {ts.total}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {teamStats.length === 0 && (
                                        <tr>
                                            <td colSpan={columns.length + 2} className="py-10 text-center text-gray-400 text-sm italic">No team data available</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Individual Summary Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-blue-500 pl-3">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Employee Task Breakdown</h3>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/80">
                                    <tr>
                                        <th className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee Name</th>
                                        <th className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100">Team</th>
                                        {columns.map(col => (
                                            <th key={col} className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">{col}</th>
                                        ))}
                                        <th className="py-3.5 px-4 text-[11px] font-extrabold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100 bg-blue-50/50 text-blue-600">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {personStats.map(ps => (
                                        <tr key={ps.name} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="py-4 px-4">
                                                <div className="text-sm font-bold text-gray-700 group-hover:text-blue-700 transition-colors">{ps.name}</div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-gray-100 text-gray-500 uppercase tracking-tight">
                                                    {ps.team}
                                                </span>
                                            </td>
                                            {columns.map(col => (
                                                <td key={col} className="py-4 px-4 text-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold ${ps.stats[col] > 0 ? (col === 'Done' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700') : 'bg-gray-50 text-gray-300'}`}>
                                                        {ps.stats[col]}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="py-4 px-4 text-center bg-blue-50/20">
                                                <span className="text-sm font-extrabold text-gray-900">
                                                    {ps.total}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {personStats.length === 0 && (
                                        <tr>
                                            <td colSpan={columns.length + 3} className="py-10 text-center text-gray-400 text-sm italic">No employee data available</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95"
                    >
                        Close Overview
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeletedTicketsModal = ({ isOpen, onClose, tickets, loading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 flex justify-between items-center text-gray-800 shrink-0 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center space-x-2">
                        <span className="text-rose-600">🗑️</span>
                        <h2 className="text-lg font-bold">Deleted Tasks History</h2>
                        <span className="text-xs font-bold bg-rose-100 text-rose-600 px-2.5 py-0.5 rounded-full border border-rose-200 ml-2">
                            {tickets.length} Tasks
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors bg-gray-100">
                        <span>✕</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar bg-white">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm italic py-10">No deleted tasks found.</div>
                    ) : (
                        <div className="space-y-4">
                            {tickets.map(ticket => (
                                <div key={ticket._id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="text-sm font-bold text-gray-800">{ticket.title}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Deleted: {ticket.deletedAt ? new Date(ticket.deletedAt).toLocaleString('en-GB') : 'N/A'}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{ticket.description || 'No description'}</p>
                                    <div className="flex flex-wrap gap-2 items-center text-[10px] font-bold text-gray-500">
                                        <span className={`px-2 py-0.5 rounded-md ${ticket.priority === 'High' ? 'bg-red-50 text-red-600' : ticket.priority === 'Medium' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {ticket.priority}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                            {ticket.status}
                                        </span>
                                        {ticket.assignee && (
                                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-600">
                                                Assigned: {ticket.assignee.name || ticket.assignee}
                                            </span>
                                        )}
                                        {ticket.team && (
                                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-600">
                                                Team: {ticket.team}
                                            </span>
                                        )}
                                    </div>

                                    {/* Checklist */}
                                    {ticket.checklist && ticket.checklist.length > 0 && (
                                        <div className="mt-3 pl-3 border-l-2 border-slate-200 space-y-1">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Checklist</div>
                                            {ticket.checklist.map((item, idx) => (
                                                <div key={idx} className="text-xs text-slate-600 flex items-center gap-1.5">
                                                    <span className={item.completed ? 'text-teal-500' : 'text-slate-300'}>
                                                        {item.completed ? '✓' : '○'}
                                                    </span>
                                                    <span className={item.completed ? 'line-through text-slate-400' : ''}>{item.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkAllocation;
