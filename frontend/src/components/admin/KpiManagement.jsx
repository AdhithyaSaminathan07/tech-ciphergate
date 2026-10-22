import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, LineChart, Line, AreaChart, Area,
    PieChart, Pie, Cell, ComposedChart
} from 'recharts';
import {
    TrendingUp, CheckCircle, Clock, AlertTriangle,
    Flag, Filter, Search, Calendar, Users,
    Activity, ArrowUpRight, ArrowDownRight, Layers,
    PieChart as PieIcon, BarChart2, Briefcase, ChevronRight,
    ShieldCheck, Award, Timer, Info, HelpCircle, Check, X,
    ChevronDown, ChevronUp, RefreshCw, Download
} from 'lucide-react';
import appContext from '../../context/AppContext';
import { getTickets } from '../../services/ticketService';
import { getWorkers } from '../../services/workerService';
import { getKpiSummary } from '../../services/kpiService';
import Spinner from '../common/Spinner';
import CustomDatePicker from '../common/CustomDatePicker';

const COLORS = {
    Todo: '#94a3b8',
    InProgress: '#0ea5e9',
    Review: '#8b5cf6',
    Done: '#10b981',
    Story: '#14b8a6',
    Bug: '#ef4444',
    Task: '#4f46e5',
    Epic: '#a855f7',
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#10b981'
};

/**
 * Safely extracts all unique assignee IDs from a ticket supporting both
 * ticket.assignee (single) and ticket.assignees (array).
 * Deduplicates to prevent double-counting a developer assigned to both fields.
 */
const getTicketAssigneeIds = (ticket) => {
    if (!ticket) return [];
    const ids = new Set();
    if (ticket.assignee) {
        const id = ticket.assignee._id ? String(ticket.assignee._id) : String(ticket.assignee);
        if (id && id !== 'undefined' && id !== 'null') ids.add(id);
    }
    if (Array.isArray(ticket.assignees)) {
        ticket.assignees.forEach(a => {
            if (a) {
                const id = a._id ? String(a._id) : String(a);
                if (id && id !== 'undefined' && id !== 'null') ids.add(id);
            }
        });
    }
    return Array.from(ids);
};

/**
 * Determines the resolution timestamp for a ticket.
 * For reopened tickets, checks statusHistory in reverse to select the latest valid
 * transition to 'Done' rather than the first.
 * Safely falls back to updatedAt or createdAt if valid, and handles invalid dates gracefully.
 * Never mutates the original statusHistory array.
 */
const getTicketResolutionDate = (ticket) => {
    if (!ticket) return null;
    if (Array.isArray(ticket.statusHistory) && ticket.statusHistory.length > 0) {
        for (let i = ticket.statusHistory.length - 1; i >= 0; i--) {
            const entry = ticket.statusHistory[i];
            if (entry && entry.status === 'Done' && entry.changedAt) {
                const d = new Date(entry.changedAt);
                if (!isNaN(d.getTime())) {
                    return d;
                }
            }
        }
    }
    if (ticket.updatedAt) {
        const d = new Date(ticket.updatedAt);
        if (!isNaN(d.getTime())) return d;
    }
    if (ticket.createdAt) {
        const d = new Date(ticket.createdAt);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
};

/**
 * Tech Ciphergate — Center-Originated Water Ripple Effect
 * Triggers one smooth, center-originated ripple sequence when the cursor enters an individual card.
 * Does not repeat while the cursor remains stationary over the card.
 * Leaving and re-entering triggers a fresh ripple.
 */
const triggerWaterRipple = (e) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (e && e.stopPropagation) e.stopPropagation();

    const surface = e.currentTarget;
    if (!surface) return;

    surface._tcHovered = true;

    let layer = surface.querySelector(':scope > .water-ripple-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'water-ripple-layer';
        layer.setAttribute('aria-hidden', 'true');
        surface.prepend(layer);
    } else {
        // Clear any previous rings to start a clean, fresh ripple sequence on re-entry
        layer.innerHTML = '';
    }

    const rect = surface.getBoundingClientRect();
    // Maximum distance from the center of the card to any of its four corners
    const maxRadius = Math.hypot(rect.width / 2, rect.height / 2);
    const diameter = Math.ceil(maxRadius * 2);

    // 1. Primary center ripple ring (2px, teal 65% opacity, ~950ms)
    const ring1 = document.createElement('span');
    ring1.className = 'water-ripple-ring';
    ring1.style.width = `${diameter}px`;
    ring1.style.height = `${diameter}px`;

    // 2. Secondary concentric ring (1.5px, teal 50% opacity, ~1080ms)
    const ring2 = document.createElement('span');
    ring2.className = 'water-ripple-ring-secondary';
    ring2.style.width = `${Math.ceil(diameter * 0.88)}px`;
    ring2.style.height = `${Math.ceil(diameter * 0.88)}px`;

    // 3. Tertiary outer ring (1px, teal 35% opacity, ~1200ms)
    const ring3 = document.createElement('span');
    ring3.className = 'water-ripple-ring-tertiary';
    ring3.style.width = `${Math.ceil(diameter * 0.76)}px`;
    ring3.style.height = `${Math.ceil(diameter * 0.76)}px`;

    layer.appendChild(ring1);
    layer.appendChild(ring2);
    layer.appendChild(ring3);

    // Clean up rings after animation finishes (1250ms)
    setTimeout(() => {
        if (ring1.parentNode === layer) ring1.remove();
        if (ring2.parentNode === layer) ring2.remove();
        if (ring3.parentNode === layer) ring3.remove();
        if (layer.children.length === 0 && !surface._tcHovered && layer.parentNode === surface) {
            surface.removeChild(layer);
        }
    }, 1250);
};

const finishWaterRipple = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const surface = e?.currentTarget;
    if (!surface) return;

    surface._tcHovered = false;
};

const KpiManagement = () => {
    const [tickets, setTickets] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTeam, setSelectedTeam] = useState('');
    const { subdomain } = useContext(appContext);

    // System 3 KPI State
    const [kpiData, setKpiData] = useState(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpiError, setKpiError] = useState(null);
    const [expandedWorkerId, setExpandedWorkerId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchData();
    }, [subdomain]);

    useEffect(() => {
        fetchKpiData();
    }, [subdomain, dateRange.start, dateRange.end, selectedTeam]);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const [ticketsData, workersData] = await Promise.all([
                getTickets({ subdomain }),
                getWorkers({ subdomain })
            ]);
            setTickets(ticketsData || []);
            setWorkers(workersData || []);
        } catch (error) {
            console.error('Error fetching Board KPI data:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchData(false),
            fetchKpiData()
        ]);
        setRefreshing(false);
    };

    const fetchKpiData = async () => {
        setKpiLoading(true);
        setKpiError(null);
        try {
            const res = await getKpiSummary({
                startDate: dateRange.start,
                endDate: dateRange.end,
                department: selectedTeam,
                subdomain
            });
            if (res && res.success) {
                setKpiData(res.data);
            }
        } catch (error) {
            console.error('Error fetching System 3 KPI data:', error);
            setKpiError(error?.response?.data?.message || error.message || 'Failed to load System 3 KPI summary');
        } finally {
            setKpiLoading(false);
        }
    };

    // Derived Data for Work Allocation Insights (Scrum/Board)
    const processedData = useMemo(() => {
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);

        // Filter tickets by team/assignee if needed (supports single and multiple assignees)
        let workingTickets = [...tickets];
        if (selectedTeam) {
            const teamWorkerIds = new Set(workers.filter(w => w.department === selectedTeam).map(w => String(w._id)));
            workingTickets = workingTickets.filter(t => {
                const assigneeIds = getTicketAssigneeIds(t);
                return assigneeIds.some(id => teamWorkerIds.has(id));
            });
        }
        if (searchTerm) {
            workingTickets = workingTickets.filter(t => t.title && t.title.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        // 1. Stats Summary
        const createdInRange = workingTickets.filter(t => {
            const d = new Date(t.createdAt);
            return !isNaN(d.getTime()) && d >= start && d <= end;
        });

        const resolvedInRange = workingTickets.filter(t => {
            if (t.status !== 'Done') return false;
            const resDate = getTicketResolutionDate(t);
            return resDate && resDate >= start && resDate <= end;
        });

        const totalStoryPoints = resolvedInRange.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
        let validTurnaroundCount = 0;
        const totalTurnaroundDays = resolvedInRange.reduce((sum, t) => {
            const resDate = getTicketResolutionDate(t);
            if (!resDate || !t.createdAt) return sum;
            const startD = new Date(t.createdAt);
            if (isNaN(startD.getTime())) return sum;
            validTurnaroundCount++;
            return sum + Math.max(0, (resDate.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
        }, 0);
        const avgTurnaround = validTurnaroundCount > 0
            ? totalTurnaroundDays / validTurnaroundCount
            : 0;

        // 2. Velocity Data (By Developer) using ID to avoid name collisions
        const workerStats = {};
        workers.forEach(w => {
            if (!selectedTeam || w.department === selectedTeam) {
                workerStats[String(w._id)] = {
                    id: w._id,
                    name: w.name,
                    completed: 0,
                    points: 0,
                    performancePoints: w.performancePoints || 0,
                    dept: w.department
                };
            }
        });

        // Attribute completed issues and points to all unique assignees on the ticket without double-counting
        resolvedInRange.forEach(t => {
            const assigneeIds = getTicketAssigneeIds(t);
            assigneeIds.forEach(workerId => {
                if (workerStats[workerId]) {
                    workerStats[workerId].completed += 1;
                    workerStats[workerId].points += (t.storyPoints || 0);
                }
            });
        });

        // Deterministic sorting: 1. Points (desc), 2. Completed issues (desc), 3. Name (asc)
        const velocityData = Object.values(workerStats)
            .filter(s => s.completed > 0 || s.points > 0)
            .sort((a, b) => {
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                if (b.completed !== a.completed) {
                    return b.completed - a.completed;
                }
                return (a.name || '').localeCompare(b.name || '');
            });
        const topPerformers = velocityData.slice(0, 5);

        // 3. Distribution Data
        const typeDist = {};
        const priorityDist = {};
        workingTickets.forEach(t => {
            typeDist[t.issueType || 'Task'] = (typeDist[t.issueType || 'Task'] || 0) + 1;
            priorityDist[t.priority || 'Medium'] = (priorityDist[t.priority || 'Medium'] || 0) + 1;
        });
        const typeData = Object.entries(typeDist).map(([name, value]) => ({ name, value }));
        const priorityData = Object.entries(priorityDist).map(([name, value]) => ({ name, value }));

        // 4. Created vs Resolved Timeline
        const timeMap = {};
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        for (let i = 0; i < days; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().split('T')[0];
            timeMap[key] = { date: key, created: 0, resolved: 0, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
        }

        createdInRange.forEach(t => {
            const key = new Date(t.createdAt).toISOString().split('T')[0];
            if (timeMap[key]) timeMap[key].created += 1;
        });
        resolvedInRange.forEach(t => {
            const resDate = getTicketResolutionDate(t);
            if (resDate) {
                const key = resDate.toISOString().split('T')[0];
                if (timeMap[key]) timeMap[key].resolved += 1;
            }
        });
        const timelineData = Object.values(timeMap);

        // 5. Cumulative Flow Diagram (CFD)
        const cfdData = timelineData.map(day => {
            const dayDate = new Date(day.date);
            dayDate.setHours(23, 59, 59, 999);

            const counts = { 'To Do': 0, 'In Progress': 0, 'Review': 0, 'Done': 0 };
            workingTickets.forEach(t => {
                const createdDate = new Date(t.createdAt);
                if (isNaN(createdDate.getTime()) || createdDate > dayDate) return;

                let currentStatus = 'To Do';
                const history = [...(t.statusHistory || [])]
                    .filter(entry => entry && entry.changedAt && !isNaN(new Date(entry.changedAt).getTime()))
                    .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

                for (const entry of history) {
                    if (new Date(entry.changedAt) <= dayDate) {
                        currentStatus = entry.status;
                    } else {
                        break;
                    }
                }
                if (counts[currentStatus] !== undefined) {
                    counts[currentStatus]++;
                }
            });
            return { ...day, ...counts };
        });

        return {
            stats: {
                created: createdInRange.length,
                resolved: resolvedInRange.length,
                points: totalStoryPoints,
                turnaround: avgTurnaround.toFixed(1),
                efficiency: createdInRange.length > 0 ? ((resolvedInRange.length / createdInRange.length) * 100).toFixed(0) : 0
            },
            velocityData,
            topPerformers,
            typeData,
            priorityData,
            timelineData,
            cfdData
        };
    }, [tickets, workers, dateRange, selectedTeam, searchTerm]);

    // Flatten all employee KPI results across departments for the System 3 table
    const allWorkerKpis = useMemo(() => {
        if (!kpiData || !Array.isArray(kpiData.departments)) return [];
        const list = [];
        kpiData.departments.forEach(dept => {
            if (Array.isArray(dept.members)) {
                dept.members.forEach(m => {
                    list.push({
                        ...m,
                        departmentName: dept.department?.name || 'General'
                    });
                });
            }
        });

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return list.filter(m =>
                (m.worker?.name && m.worker.name.toLowerCase().includes(term)) ||
                (m.worker?.username && m.worker.username.toLowerCase().includes(term))
            );
        }
        return list;
    }, [kpiData, searchTerm]);

    const exportAnalyticsCSV = () => {
        if (!velocityData || velocityData.length === 0) {
            alert("No data available to export");
            return;
        }

        // 1. Performance Summary
        let csvContent = "PERFORMANCE SUMMARY\n";
        csvContent += `Period,${dateRange.start} to ${dateRange.end}\n`;
        csvContent += `Organization,${subdomain || 'Main'}\n`;
        csvContent += `Issues Created,${stats.created}\n`;
        csvContent += `Issues Resolved,${stats.resolved}\n`;
        csvContent += `Story Points Delivered,${stats.points}\n`;
        csvContent += `Avg Cycle Time,${stats.turnaround} days\n`;
        csvContent += `Resolution Rate,${stats.efficiency}%\n\n`;

        // 2. Developer Velocity
        csvContent += "DEVELOPER VELOCITY\n";
        csvContent += "Developer Name,Department,Issues Completed,Story Points\n";
        velocityData.forEach(v => {
            csvContent += `"${v.name}","${v.dept || 'N/A'}",${v.completed},${v.points}\n`;
        });
        csvContent += "\n";

        // 3. Issue Type Breakdown
        csvContent += "ISSUE TYPE BREAKDOWN\n";
        csvContent += "Type,Count\n";
        typeData.forEach(t => {
            csvContent += `"${t.name}",${t.value}\n`;
        });
        csvContent += "\n";

        // 4. Priority Breakdown
        csvContent += "PRIORITY BREAKDOWN\n";
        csvContent += "Priority,Count\n";
        priorityData.forEach(p => {
            csvContent += `"${p.name}",${p.value}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `CipherGate_Analytics_${subdomain || 'Main'}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <Spinner />;

    const { stats, velocityData, topPerformers, typeData, priorityData, timelineData, cfdData } = processedData;

    return (
        <div className="w-full min-w-0 max-w-full space-y-4 font-sans overflow-x-hidden">
            {/* Unified Page Header & Global Filter Toolbar */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-3 px-4 rounded-lg border border-slate-200/90 shadow-sm w-full min-w-0">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="bg-teal-600 p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-slate-800 tracking-tight">KPI Management</h1>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-teal-50 text-teal-700 border border-teal-200">
                                    System 3 Active
                                </span>
                            </div>
                            <p className="text-slate-500 text-[11px] flex items-center gap-1.5 mt-0.5">
                                Organization: <span className="font-bold text-teal-600">{subdomain || 'Main Organization'}</span>
                                <span className="text-slate-300">•</span>
                                <span>Continuous Performance, Quality & Throughput Tracking</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filter and Action Toolbar */}
                <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 w-full xl:w-auto min-w-0 justify-start xl:justify-end">
                    {/* Search */}
                    <div className="relative group flex-1 sm:flex-none min-w-[130px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Filter by title / name..."
                            className="pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition-all w-full sm:w-36 lg:w-40"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Department Filter */}
                    <select
                        className="bg-slate-50 border border-slate-200 py-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition-all cursor-pointer flex-shrink-0 max-w-[145px] truncate"
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                    >
                        <option value="">All Departments</option>
                        {[...new Set(workers.map(w => w.department).filter(Boolean))].map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>

                    {/* Date Range Pickers */}
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 gap-1 flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 mr-0.5 flex-shrink-0" />
                        <CustomDatePicker
                            value={dateRange.start}
                            onChange={val => setDateRange(prev => ({ ...prev, start: val }))}
                            className="w-[88px]"
                            showIcon={false}
                            inputClassName="py-1 px-0.5 text-xs font-semibold border-0 bg-transparent text-slate-700"
                            placeholder="Start date"
                        />
                        <span className="text-slate-400 text-xs font-bold">~</span>
                        <CustomDatePicker
                            value={dateRange.end}
                            onChange={val => setDateRange(prev => ({ ...prev, end: val }))}
                            className="w-[88px]"
                            showIcon={false}
                            inputClassName="py-1 px-0.5 text-xs font-semibold border-0 bg-transparent text-slate-700"
                            placeholder="End date"
                        />
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing || kpiLoading}
                        title="Refresh metrics & board data"
                        className="p-1.5 bg-slate-50 border border-slate-200 text-slate-600 hover:text-teal-600 hover:border-teal-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing || kpiLoading ? 'animate-spin text-teal-600' : ''}`} />
                    </button>

                    {/* Export Button */}
                    <button
                        onClick={exportAnalyticsCSV}
                        title="Export analytics CSV"
                        className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm shadow-teal-200"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Error Banner if System 3 API Call Fails */}
            {kpiError && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>System 3 API Notice: <strong>{kpiError}</strong>. Displaying neutral and unpenalized fallbacks.</span>
                    </div>
                    <button
                        onClick={fetchKpiData}
                        className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-bold text-[11px] hover:bg-amber-700 transition-colors flex items-center gap-1 flex-shrink-0"
                    >
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 2: PRIMARY OPERATIONAL KPI SUMMARY                               */}
            {/* ========================================================================= */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-teal-600" />
                            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                                Primary Operational KPI Summary
                            </h2>
                            {kpiLoading && (
                                <RefreshCw className="w-3 h-3 text-teal-500 animate-spin" />
                            )}
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                            Verifiable task execution durations, completion against deadlines, first-time approval rates, and assignment eligibility.
                        </p>
                    </div>

                    {/* Data Coverage Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">Data Coverage:</span>
                        <div
                            className="px-2 py-0.5 bg-white border border-slate-200/80 rounded-lg text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
                            title="Percentage of tickets with configured deadline endDates"
                        >
                            <Calendar className="w-3 h-3 text-teal-500" />
                            <span>Deadlines: </span>
                            <span className="font-black text-teal-600">
                                {kpiData?.dataCoverage?.deadlineCoveragePct ?? 0}%
                            </span>
                        </div>
                        <div
                            className="px-2 py-0.5 bg-white border border-slate-200/80 rounded-lg text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
                            title="Percentage of tickets with formal review cycle records"
                        >
                            <ShieldCheck className="w-3 h-3 text-purple-500" />
                            <span>Reviews: </span>
                            <span className="font-black text-purple-600">
                                {kpiData?.dataCoverage?.reviewCoveragePct ?? 0}%
                            </span>
                        </div>
                        <div
                            className="px-2 py-0.5 bg-white border border-slate-200/80 rounded-lg text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
                            title="Percentage of completed tickets with verifiable 'In Progress' statusHistory start timestamps"
                        >
                            <Timer className="w-3 h-3 text-amber-500" />
                            <span>Execution: </span>
                            <span className="font-black text-amber-600">
                                {kpiData?.dataCoverage?.executionCoveragePct ?? 0}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* 5 Primary System 3 Metric Cards - Single Row on Wide Screens */}
                <div className="kpi-grid-5">
                    {/* 1. On-Time Completion Rate (OTCR) */}
                    <MetricCard
                        title="On-Time Completion (OTCR)"
                        value={kpiData?.overallOtcr !== null && kpiData?.overallOtcr !== undefined ? `${kpiData.overallOtcr}%` : 'Unavailable'}
                        icon={<CheckCircle className="w-3.5 h-3.5" />}
                        color="teal"
                        subtitle={
                            kpiData?.overallDelayedCompletedRate !== null && kpiData?.overallDelayedCompletedRate !== undefined
                                ? `${kpiData.overallDelayedCompletedRate}% completed delayed`
                                : 'No deadline tracking on completed tasks'
                        }
                        isAvailable={kpiData?.overallOtcr !== null && kpiData?.overallOtcr !== undefined}
                        unavailableReason="Requires tickets with valid deadline endDates"
                        enableRipple={true}
                    />

                    {/* 2. First-Time Approval Rate (FTAR) */}
                    <MetricCard
                        title="First-Time Approval (FTAR)"
                        value={kpiData?.overallFtar !== null && kpiData?.overallFtar !== undefined ? `${kpiData.overallFtar}%` : 'Unavailable'}
                        icon={<ShieldCheck className="w-3.5 h-3.5" />}
                        color="purple"
                        subtitle="Approved on 1st review without rework"
                        isAvailable={kpiData?.overallFtar !== null && kpiData?.overallFtar !== undefined}
                        unavailableReason="Pending formal review cycle logs"
                        enableRipple={true}
                    />

                    {/* 3. Average Actual Execution Duration */}
                    <MetricCard
                        title="Avg Actual Execution"
                        value={
                            kpiData?.avgExecutionHours !== null && kpiData?.avgExecutionHours !== undefined
                                ? `${kpiData.avgExecutionHours}h`
                                : 'Unavailable'
                        }
                        unit={kpiData?.avgExecutionDays ? `(${kpiData.avgExecutionDays}d)` : ''}
                        icon={<Timer className="w-3.5 h-3.5" />}
                        color="amber"
                        subtitle="First 'In Progress' to Done (audited history)"
                        isAvailable={kpiData?.avgExecutionHours !== null && kpiData?.avgExecutionHours !== undefined}
                        unavailableReason="No 'In Progress' transition timestamps in statusHistory"
                        enableRipple={true}
                    />

                    {/* 4. Active Overdue Tasks */}
                    <MetricCard
                        title="Active Overdue Tasks"
                        value={
                            kpiData?.overallActiveOverdueRate !== null && kpiData?.overallActiveOverdueRate !== undefined
                                ? `${kpiData.overallActiveOverdueRate}%`
                                : (kpiData?.activeTicketsCount > 0 ? '0%' : 'None Active')
                        }
                        icon={<AlertTriangle className="w-3.5 h-3.5" />}
                        color={kpiData?.activeOverdueCount > 0 ? 'rose' : 'teal'}
                        subtitle={`${kpiData?.activeOverdueCount || 0} overdue of ${kpiData?.activeWithDeadlineCount || 0} tracked`}
                        isAvailable={true}
                        enableRipple={true}
                    />

                    {/* 5. Active Workload & Available Capacity */}
                    <MetricCard
                        title="Workload & Capacity"
                        value={`${kpiData?.activeTicketsCount || 0} / ${kpiData?.totalCapacity || 0}`}
                        unit="Tasks"
                        icon={<Layers className="w-3.5 h-3.5" />}
                        color="blue"
                        subtitle={`${kpiData?.availableCapacity || 0} slots available (${kpiData?.capacityUtilizationPct || 0}% used)`}
                        isAvailable={true}
                        enableRipple={true}
                    />
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 3: BOARD THROUGHPUT & WORK ALLOCATION SUMMARY                     */}
            {/* ========================================================================= */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-slate-700" />
                        <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                            Work Allocation & Board Throughput Summary
                        </h2>
                    </div>
                    <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">
                        Board execution velocity & resolution throughput
                    </span>
                </div>

                {/* 5 Board Summary Cards - Single Row on Wide Screens */}
                <div className="kpi-grid-5">
                    <MetricCard
                        title="Issues Created"
                        value={stats.created}
                        icon={<Layers className="w-3.5 h-3.5" />}
                        color="blue"
                        subtitle="Total work logged in period"
                        enableRipple={true}
                    />
                    <MetricCard
                        title="Issues Resolved"
                        value={stats.resolved}
                        icon={<CheckCircle className="w-3.5 h-3.5" />}
                        color="teal"
                        trend={stats.efficiency}
                        trendLabel="% resolution rate"
                        subtitle="Completed tickets in period"
                        enableRipple={true}
                    />
                    <MetricCard
                        title="Velocity (Points)"
                        value={stats.points}
                        unit="SP"
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        color="purple"
                        subtitle={stats.points === 0 ? "0 SP (Scrum story points unestimated)" : "Story points delivered"}
                        enableRipple={true}
                    />
                    <MetricCard
                        title="Avg Cycle Time"
                        value={stats.turnaround}
                        unit="days"
                        icon={<Clock className="w-3.5 h-3.5" />}
                        color="amber"
                        subtitle="From creation to resolution"
                        enableRipple={true}
                    />
                    <MetricCard
                        title="Delivery Index"
                        value={stats.efficiency}
                        unit="%"
                        icon={<Activity className="w-3.5 h-3.5" />}
                        color="indigo"
                        subtitle="Resolved / Created throughput ratio"
                        enableRipple={true}
                    />
                </div>
            </div>

            {/* =={/* ========================================================================= */}
            {/* SECTION 4: DEPARTMENT PERFORMANCE & CAPACITY ROLLUP                      */}
            {/* ========================================================================= */}
            {kpiData?.departments && kpiData.departments.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                                Department Performance & Capacity Rollup
                            </h2>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">
                            {kpiData.departments.length} Department{kpiData.departments.length > 1 ? 's' : ''} Scoped
                        </span>
                    </div>

                    <div className="kpi-dept-grid">
                        {kpiData.departments.map(dept => {
                            const s = dept.summary || {};
                            return (
                                <div key={dept.department?.name} className="p-3.5 rounded-lg border border-slate-200/90 bg-white shadow-xs flex flex-col justify-between min-w-0 w-full h-full">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-black text-slate-800 text-xs tracking-tight">{dept.department?.name}</h4>
                                                <p className="text-[10px] text-slate-400 font-semibold">{dept.department?.memberCount || 0} Active Members</p>
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${s.teamUtilizationPct > 80 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                {s.teamUtilizationPct}% Loaded
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5 text-xs mb-2">
                                            <div className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                                                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">OTCR</span>
                                                <span className="font-black text-slate-800 text-xs">
                                                    {s.teamOnTimeCompletionRate !== null ? `${s.teamOnTimeCompletionRate}%` : 'Unavailable'}
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                                                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">FTAR</span>
                                                <span className="font-black text-slate-800 text-xs">
                                                    {s.teamFirstTimeApprovalRate !== null ? `${s.teamFirstTimeApprovalRate}%` : 'Unavailable'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Capacity Progress Bar */}
                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>Active: {s.totalActiveTasks || 0} / {s.totalCapacity || 0}</span>
                                            <span className="text-slate-400">{s.availableCapacity || 0} Free</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={`h-1.5 rounded-full transition-all duration-500 ${s.teamUtilizationPct > 80 ? 'bg-rose-500' : s.teamUtilizationPct > 50 ? 'bg-amber-500' : 'bg-teal-500'}`}
                                                style={{ width: `${Math.min(100, s.teamUtilizationPct || 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 5: DETAILED ANALYTICS & THROUGHPUT FLOW                         */}
            {/* ========================================================================= */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-teal-600" />
                        <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                            Detailed Analytics & Throughput Flow
                        </h2>
                    </div>
                    <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">
                        Continuous status progression, velocity & allocation profiles
                    </span>
                </div>

                {/* Visualizations: Wide Panels (Flux & CFD) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
                    {/* Work Allocation Flux */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200/80">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <h3 className="font-black text-slate-800 flex items-center gap-1.5 text-xs">
                                    <BarChart2 className="w-3.5 h-3.5 text-teal-600" />
                                    Work Allocation Flux
                                </h3>
                                <p className="text-[10px] text-slate-400">Throughput of Work Allocation board over time</p>
                            </div>
                        </div>
                        <div className="h-56 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={timelineData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="created" name="Created" fill="#94a3b8" stroke="#cbd5e1" fillOpacity={0.1} />
                                    <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 1.5, fill: '#fff' }} activeDot={{ r: 5 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Cumulative Flow Diagram (CFD) */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200/80">
                        <div className="mb-3">
                            <h3 className="font-black text-slate-800 flex items-center gap-1.5 text-xs">
                                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                                Cumulative Flow Diagram
                            </h3>
                            <p className="text-[10px] text-slate-400">Status trends across entire board history</p>
                        </div>
                        <div className="h-56 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={cfdData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="Done" stackId="1" stroke={COLORS.Done} fill={COLORS.Done} fillOpacity={0.8} />
                                    <Area type="monotone" dataKey="Review" stackId="1" stroke={COLORS.Review} fill={COLORS.Review} fillOpacity={0.8} />
                                    <Area type="monotone" dataKey="In Progress" stackId="1" stroke={COLORS.InProgress} fill={COLORS.InProgress} fillOpacity={0.8} />
                                    <Area type="monotone" dataKey="To Do" stackId="1" stroke={COLORS.Todo} fill={COLORS.Todo} fillOpacity={0.8} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Visualizations: Balanced Two-Column Analytics Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full min-w-0">
                    {/* Left Column (7 cols): Resource Velocity + (Issue Type & Priority side-by-side) */}
                    <div className="lg:col-span-7 flex flex-col gap-4 w-full min-w-0">
                        {/* Resource Velocity Comparison */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200/80">
                            <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                                    <div>
                                        <h3 className="font-black text-slate-800 text-xs">Resource Velocity Comparison</h3>
                                        <p className="text-[10px] text-slate-400">Allocation efficiency per individual developer</p>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full self-start sm:self-auto">
                                    Issues & Performance Points
                                </span>
                            </div>
                            <div className="h-52 w-full min-w-0">
                                {velocityData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={velocityData} margin={{ top: 5, right: 10, left: -20, bottom: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                                            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '10px' }} />
                                            <Bar dataKey="points" name="Story Points (SP)" fill="#0d9488" radius={[3, 3, 0, 0]} barSize={28} />
                                            <Bar dataKey="completed" name="Issues Completed" fill="#2dd4bf" radius={[3, 3, 0, 0]} barSize={28} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-lg">
                                        No allocation data found in this period.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Issue Type & Priority Profile Side-by-Side */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0">
                            {/* Issue Type Split */}
                            <div className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200/80">
                                <h3 className="font-black text-slate-800 mb-2 flex items-center gap-1.5 text-xs tracking-tight">
                                    <PieIcon className="w-3.5 h-3.5 text-purple-600" />
                                    Issue Type Split
                                </h3>
                                <div className="h-40 w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={typeData} cx="50%" cy="50%" innerRadius={38} outerRadius={54} paddingAngle={4} dataKey="value" stroke="none">
                                                {typeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS.Task} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '4px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Priority Profile */}
                            <div className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200/80">
                                <h3 className="font-black text-slate-800 mb-2 flex items-center gap-1.5 text-xs tracking-tight">
                                    <Flag className="w-3.5 h-3.5 text-rose-500" />
                                    Priority Profile
                                </h3>
                                <div className="h-40 w-full min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={priorityData} cx="50%" cy="50%" innerRadius={38} outerRadius={54} paddingAngle={4} dataKey="value" stroke="none">
                                                {priorityData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS.Medium} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '4px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (5 cols): Top Contributors + Performance Insights */}
                    <div className="lg:col-span-5 flex flex-col gap-4 w-full min-w-0">
                        {/* Top Board Contributors */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200/80 flex-1 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-black text-slate-800 flex items-center gap-1.5 text-xs tracking-tight">
                                        <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                                        Top Board Contributors
                                    </h3>
                                    <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full" title="Tasks track Performance Points; Scrum Story Points are unestimated (0 SP)">
                                        Scrum SP: 0
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {topPerformers.length > 0 ? topPerformers.map((worker, i) => (
                                        <div key={worker.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-bold text-[10px] shadow-sm border border-teal-100">
                                                    {i + 1}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800 leading-tight">{worker.name}</p>
                                                    <p className="text-[9px] text-slate-400 font-semibold">{worker.dept}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-teal-600">
                                                    {worker.points} <span className="text-[9px] text-slate-400 font-bold">SP</span>
                                                </p>
                                                <p className="text-[9px] text-slate-400 font-bold">
                                                    {worker.completed} Issues ({worker.performancePoints || 0} pts)
                                                </p>
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-xs text-center text-slate-400 py-3 italic">No resolved work yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Performance Insights Intelligence Card */}
                        <div className="bg-slate-900 rounded-lg p-4 text-white shadow-lg relative overflow-hidden group">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                                    <h4 className="text-teal-400 text-[10px] font-black tracking-widest uppercase">Performance Insights</h4>
                                </div>
                                {stats.resolved > 0 ? (
                                    <div className="space-y-3">
                                        <p className="text-xs font-medium leading-relaxed opacity-90">
                                            Delivery for <span className="font-bold text-white">{subdomain || 'Main'}</span> is currently operating at <span className="text-teal-400 font-black">{stats.efficiency}%</span> efficiency.
                                        </p>
                                        <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 shadow-inner">
                                            <p className="text-[9px] text-slate-400 font-bold mb-0.5 tracking-wider uppercase">Bottleneck Analysis</p>
                                            <p className="text-xs font-bold text-white">
                                                {cfdData[cfdData.length - 1]?.Review > 5 ? "Review column is piling up. Action required." : "Status distribution is currently healthy."}
                                            </p>
                                        </div>
                                        <button
                                            onClick={exportAnalyticsCSV}
                                            className="w-full flex items-center justify-between text-[10px] font-black tracking-wider text-teal-400 hover:text-white transition-colors pt-0.5"
                                        >
                                            <span>Export Analytics CSV</span> <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-xs opacity-60 italic">Waiting for more allocation data from the board...</p>
                                )}
                            </div>
                            <Activity className="absolute -right-4 -bottom-4 w-20 h-20 text-teal-500/10 group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 6: EMPLOYEE PERFORMANCE & SYSTEM 2 ASSIGNMENT KPI BREAKDOWN       */}
            {/* ========================================================================= */}
            <div className="bg-white rounded-lg border border-slate-200/90 shadow-sm overflow-hidden w-full min-w-0">
                <div className="p-3.5 px-4 bg-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-teal-600" />
                            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                                Employee Performance & System 2 Assignment KPI Breakdown
                            </h2>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Deterministic formula: <span className="font-semibold text-slate-700">Total Score (0–50) = Performance Points Tier (0–30) + OTCR (0–15) + FTAR Quality (0–5)</span>
                        </p>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                        {allWorkerKpis.length} Employee{allWorkerKpis.length > 1 ? 's' : ''} Listed
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50/80 text-[9px] uppercase font-black tracking-wider text-slate-400 border-b border-slate-200/80">
                            <tr>
                                <th className="py-2.5 px-3">Employee</th>
                                <th className="py-2.5 px-3">Department</th>
                                <th className="py-2.5 px-3 text-center">System 2 KPI Score</th>
                                <th className="py-2.5 px-3 text-center">Score Contribution Breakdown</th>
                                <th className="py-2.5 px-3 text-center">OTCR</th>
                                <th className="py-2.5 px-3 text-center">FTAR</th>
                                <th className="py-2.5 px-3 text-center">Actual Avg Execution</th>
                                <th className="py-2.5 px-3 text-center">Active Workload</th>
                                <th className="py-2.5 px-3 text-center">Data Coverage</th>
                                <th className="py-2.5 px-3 text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {allWorkerKpis.length > 0 ? (
                                allWorkerKpis.map(item => {
                                    const w = item.worker || {};
                                    const m = item.metrics || {};
                                    const sys2 = item.system2Assignment || { breakdown: {} };
                                    const cov = item.dataCoverage || {};
                                    const isExpanded = expandedWorkerId === String(w._id);

                                    return (
                                        <React.Fragment key={w._id}>
                                            <tr className="hover:bg-slate-50/70 transition-colors">
                                                {/* Employee */}
                                                <td className="py-2 px-3 font-bold">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-black text-[10px] border border-teal-100">
                                                            {w.name ? w.name.charAt(0) : 'E'}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-800 text-xs leading-tight">{w.name}</p>
                                                            <p className="text-[9px] text-slate-400">@{w.username || 'user'}</p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Department */}
                                                <td className="py-2 px-3 font-semibold text-slate-600 text-xs">
                                                    {item.departmentName}
                                                </td>

                                                {/* System 2 Assignment Score */}
                                                <td className="py-2 px-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black border ${sys2.kpiScore >= 35 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sys2.kpiScore >= 20 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                                        {sys2.kpiScore} <span className="text-[9px] opacity-60 ml-0.5">/ 50</span>
                                                    </span>
                                                </td>

                                                {/* Score Contribution Breakdown */}
                                                <td className="py-2 px-3">
                                                    <div className="flex items-center justify-center gap-1 text-[9px] font-bold">
                                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded" title="Points Score (Max 30)">
                                                            Pts: {sys2.breakdown?.pointsScore ?? 0}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded" title="OTCR Score (Max 15)">
                                                            OTCR: {sys2.breakdown?.otcrScore ?? 8}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded" title="Quality FTAR Score (Max 5)">
                                                            FTAR: {sys2.breakdown?.ftarScore ?? 3}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* OTCR */}
                                                <td className="py-2 px-3 text-center font-black">
                                                    {m.onTimeCompletionRate !== null ? (
                                                        <span className="text-teal-700 font-black">{m.onTimeCompletionRate}%</span>
                                                    ) : (
                                                        <span className="text-slate-400 font-semibold text-[10px]" title="Neutral baseline (8/15 pts awarded)">
                                                            N/A (Neutral)
                                                        </span>
                                                    )}
                                                </td>

                                                {/* FTAR */}
                                                <td className="py-2 px-3 text-center font-black">
                                                    {m.firstTimeApprovalRate !== null ? (
                                                        <span className="text-purple-700 font-black">{m.firstTimeApprovalRate}%</span>
                                                    ) : (
                                                        <span className="text-slate-400 font-semibold text-[10px]" title="Neutral baseline (3/5 pts awarded)">
                                                            N/A (Neutral)
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Actual Avg Execution Duration */}
                                                <td className="py-2 px-3 text-center">
                                                    {m.avgExecutionHours !== null ? (
                                                        <span className="font-bold text-slate-800">{m.avgExecutionHours}h</span>
                                                    ) : (
                                                        <span className="text-[10px] font-semibold text-slate-400 italic" title="No tickets with statusHistory 'In Progress' transitions">
                                                            Unavailable
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Active Workload */}
                                                <td className="py-2 px-3 text-center">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[11px] font-black ${m.activeTasksCount >= 4 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700'}`}>
                                                        {m.activeTasksCount || 0} / 5
                                                    </span>
                                                    {m.activeOverdueCount > 0 && (
                                                        <span className="block text-[9px] font-black text-rose-600 mt-0.5">
                                                            {m.activeOverdueCount} Overdue
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Data Coverage Indicators */}
                                                <td className="py-2 px-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <span className={`w-2 h-2 rounded-full ${cov.deadlineTrackingPercentage > 0 ? 'bg-teal-500' : 'bg-slate-300'}`} title={`Deadline tracking: ${cov.deadlineTrackingPercentage}%`} />
                                                        <span className={`w-2 h-2 rounded-full ${cov.reviewTrackingPercentage > 0 ? 'bg-purple-500' : 'bg-slate-300'}`} title={`Review tracking: ${cov.reviewTrackingPercentage}%`} />
                                                        <span className={`w-2 h-2 rounded-full ${cov.executionTimeTrackingPercentage > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} title={`Execution time tracking: ${cov.executionTimeTrackingPercentage}%`} />
                                                    </div>
                                                </td>

                                                {/* Details Toggle */}
                                                <td className="py-2 px-3 text-right">
                                                    <button
                                                        onClick={() => setExpandedWorkerId(isExpanded ? null : String(w._id))}
                                                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                                        title="Toggle calculation details"
                                                    >
                                                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Expanded Calculation Details Drawer */}
                                            {isExpanded && (
                                                <tr className="bg-slate-50/80">
                                                    <td colSpan="10" className="p-3 border-t border-slate-100">
                                                        <div className="space-y-1.5 text-xs">
                                                            <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                                                <Info className="w-3.5 h-3.5 text-teal-600" />
                                                                System 2 Assignment Rationale:
                                                            </p>
                                                            <p className="text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/80 font-mono text-[10px] leading-relaxed shadow-sm">
                                                                {sys2.explanation || 'No explanation generated.'}
                                                            </p>
                                                            <div className="flex flex-wrap gap-3 pt-0.5 text-[10px] text-slate-500 font-semibold">
                                                                <span>Completed Tasks: <b className="text-slate-800">{m.completedTicketsCount || 0}</b></span>
                                                                <span>Delayed Completed: <b className="text-slate-800">{m.delayedTicketsCount || 0}</b></span>
                                                                <span>Review Rejections: <b className="text-slate-800">{m.totalReviewRejections || 0}</b></span>
                                                                <span>Available Capacity: <b className="text-slate-800">{m.availableCapacity || 0} slots</b></span>
                                                                <span>Performance Points: <b className="text-slate-800">{w.performancePoints || 0} pts</b></span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="10" className="py-6 text-center text-slate-400 italic">
                                        No employee KPI data available for this selection.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

const MetricCard = ({
    title,
    value,
    unit = '',
    icon,
    color = 'teal',
    subtitle,
    trend,
    trendLabel,
    badge,
    isAvailable = true,
    unavailableReason,
    className = '',
    enableRipple = false
}) => {
    const borderTopColors = {
        teal: 'border-t-teal-500',
        purple: 'border-t-purple-500',
        amber: 'border-t-amber-500',
        rose: 'border-t-rose-500',
        blue: 'border-t-blue-500',
        indigo: 'border-t-indigo-500',
    }[color] || 'border-t-teal-500';

    const iconColors = {
        teal: 'text-teal-600 bg-teal-50 border-teal-100',
        purple: 'text-purple-600 bg-purple-50 border-purple-100',
        amber: 'text-amber-600 bg-amber-50 border-amber-100',
        rose: 'text-rose-600 bg-rose-50 border-rose-100',
        blue: 'text-blue-600 bg-blue-50 border-blue-100',
        indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    }[color] || 'text-teal-600 bg-teal-50 border-teal-100';

    return (
        <div
            onMouseEnter={enableRipple ? triggerWaterRipple : undefined}
            onMouseLeave={enableRipple ? finishWaterRipple : undefined}
            className={`${enableRipple ? 'water-ripple-surface ' : ''}bg-white p-3.5 rounded-lg border border-slate-200/90 border-t-4 ${borderTopColors} shadow-sm flex flex-col justify-between group min-w-0 w-full h-full ${className}`}
        >

            <div>
                <div className="flex justify-between items-start mb-1.5 gap-1.5 min-w-0">
                    <div className="min-h-[28px] flex items-center min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight line-clamp-2" title={title}>
                            {title}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {badge}
                            </span>
                        )}
                        {!isAvailable && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                No History
                            </span>
                        )}
                        {trend !== undefined && (
                            <div className={`flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                parseInt(trend) >= 60 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                                {parseInt(trend) >= 60 ? <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> : <Activity className="w-2.5 h-2.5 mr-0.5" />}
                                {trend}%
                            </div>
                        )}
                        <div className={`p-1.5 rounded border ${iconColors} shadow-2xs`}>
                            {icon}
                        </div>
                    </div>
                </div>
                <div className="flex items-baseline gap-1 my-1 min-w-0">
                    <span className={`text-2xl font-black tracking-tight truncate ${isAvailable ? 'text-slate-900' : 'text-slate-400 text-lg'}`}>
                        {value}
                    </span>
                    {unit && isAvailable && (
                        <span className="text-xs font-semibold text-slate-400 flex-shrink-0">{unit}</span>
                    )}
                </div>
            </div>
            {(subtitle || (!isAvailable && unavailableReason) || trendLabel) && (
                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] leading-tight min-h-[22px] gap-1.5">
                    {subtitle && (
                        <span className="text-slate-500 font-medium truncate flex-1 min-w-0" title={subtitle}>
                            {subtitle}
                        </span>
                    )}
                    {trendLabel && (
                        <span className="text-slate-400 font-semibold text-[9px] flex-shrink-0">
                            {trendLabel}
                        </span>
                    )}
                    {!isAvailable && unavailableReason && (
                        <span className="text-amber-600 font-medium truncate flex-1 min-w-0" title={unavailableReason}>
                            {unavailableReason}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-lg shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 min-w-[150px]">
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-3 border-b border-slate-100 pb-2">{label}</p>
                <div className="space-y-2.5">
                    {payload.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: p.color || p.fill }}></div>
                                <span className="text-[11px] font-bold text-slate-600">{p.name || p.dataKey}</span>
                            </div>
                            <span className="text-[11px] font-black text-slate-900">{p.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export default KpiManagement;
