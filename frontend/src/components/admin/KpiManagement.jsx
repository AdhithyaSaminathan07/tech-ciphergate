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
    PieChart as PieIcon, BarChart2, Briefcase, ChevronRight
} from 'lucide-react';
import appContext from '../../context/AppContext';
import { getTickets } from '../../services/ticketService';
import { getWorkers } from '../../services/workerService';
import Spinner from '../common/Spinner';

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

const KpiManagement = () => {
    const [tickets, setTickets] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTeam, setSelectedTeam] = useState('');
    const { subdomain } = useContext(appContext);

    // Filters
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchData();
    }, [subdomain]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [ticketsData, workersData] = await Promise.all([
                getTickets({ subdomain }),
                getWorkers({ subdomain })
            ]);
            setTickets(ticketsData || []);
            setWorkers(workersData || []);
        } catch (error) {
            console.error('Error fetching KPI data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Derived Data with useMemo for performance
    const processedData = useMemo(() => {
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);

        // Filter tickets by team/assignee if needed
        let workingTickets = [...tickets];
        if (selectedTeam) {
            const teamWorkers = workers.filter(w => w.department === selectedTeam).map(w => w._id);
            workingTickets = workingTickets.filter(t => t.assignee && (teamWorkers.includes(t.assignee._id || t.assignee)));
        }
        if (searchTerm) {
            workingTickets = workingTickets.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        // 1. Stats Summary
        const createdInRange = workingTickets.filter(t => {
            const d = new Date(t.createdAt);
            return d >= start && d <= end;
        });

        const resolvedInRange = workingTickets.filter(t => {
            if (t.status !== 'Done') return false;
            const doneHistory = t.statusHistory?.find(h => h.status === 'Done');
            const d = doneHistory ? new Date(doneHistory.changedAt) : new Date(t.updatedAt);
            return d >= start && d <= end;
        });

        const totalStoryPoints = resolvedInRange.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
        const avgTurnaround = resolvedInRange.length > 0
            ? resolvedInRange.reduce((sum, t) => {
                const startD = new Date(t.createdAt);
                const doneH = t.statusHistory?.find(h => h.status === 'Done');
                const endD = doneH ? new Date(doneH.changedAt) : new Date(t.updatedAt);
                return sum + (endD - startD) / (1000 * 60 * 60 * 24);
            }, 0) / resolvedInRange.length
            : 0;

        // 2. Velocity Data (By Developer) using ID to avoid name collisions
        const workerStats = {};
        workers.forEach(w => {
            if (!selectedTeam || w.department === selectedTeam) {
                workerStats[w._id] = { id: w._id, name: w.name, completed: 0, points: 0, dept: w.department };
            }
        });

        resolvedInRange.forEach(t => {
            const workerId = (t.assignee?._id || t.assignee);
            if (workerId && workerStats[workerId]) {
                workerStats[workerId].completed += 1;
                workerStats[workerId].points += (t.storyPoints || 0);
            }
        });
        const velocityData = Object.values(workerStats).filter(s => s.completed > 0 || s.points > 0).sort((a, b) => b.points - a.points);
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
            const doneH = t.statusHistory?.find(h => h.status === 'Done');
            const key = (doneH ? new Date(doneH.changedAt) : new Date(t.updatedAt)).toISOString().split('T')[0];
            if (timeMap[key]) timeMap[key].resolved += 1;
        });
        const timelineData = Object.values(timeMap);

        // 5. Cumulative Flow Diagram (CFD)
        const cfdData = timelineData.map(day => {
            const dayDate = new Date(day.date);
            dayDate.setHours(23, 59, 59, 999);

            const counts = { 'To Do': 0, 'In Progress': 0, 'Review': 0, 'Done': 0 };
            workingTickets.forEach(t => {
                if (new Date(t.createdAt) > dayDate) return;

                let currentStatus = 'To Do';
                const history = [...(t.statusHistory || [])].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

                for (const entry of history) {
                    if (new Date(entry.changedAt) <= dayDate) {
                        currentStatus = entry.status;
                    } else {
                        break;
                    }
                }
                counts[currentStatus]++;
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
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
            {/* Header section with Jira aesthetics */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="bg-teal-600 p-2 rounded-lg text-white shadow-lg shadow-teal-100">
                            <Activity className="w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Work Allocation Insights</h1>
                    </div>
                    <p className="text-slate-500 text-sm flex items-center gap-2 ml-1">
                        Analyzing metrics for <span className="font-bold text-teal-600">{subdomain || 'Main Organization'}</span>
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative group flex-1 md:flex-none">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Filter by title..."
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition-all w-full shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        className="bg-white border border-slate-200 py-2 px-4 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition-all cursor-pointer font-bold"
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                    >
                        <option value="">All Teams</option>
                        {[...new Set(workers.map(w => w.department).filter(Boolean))].map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>

                    <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-1 gap-1">
                        <div className="p-1.5 text-slate-400 border-r border-slate-100 px-2">
                            <Calendar className="w-4 h-4" />
                        </div>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                            className="bg-transparent border-none text-xs font-black py-1 focus:ring-0 text-slate-700 outline-none"
                        />
                        <span className="text-slate-300 mx-1 text-xs font-black">~</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                            className="bg-transparent border-none text-xs font-black py-1 focus:ring-0 text-slate-700 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Main KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <KPICard title="Issues Created" value={stats.created} icon={<Layers className="w-4 h-4" />} color="blue" subtitle="Total work logged" />
                <KPICard title="Issues Resolved" value={stats.resolved} icon={<CheckCircle className="w-4 h-4" />} color="teal" trend={stats.efficiency} trendLabel="% resolution rate" />
                <KPICard title="Velocity (Points)" value={stats.points} icon={<TrendingUp className="w-4 h-4" />} color="purple" subtitle="Story points delivered" />
                <KPICard title="Avg Cycle time" value={stats.turnaround} unit="days" icon={<Clock className="w-4 h-4" />} color="amber" subtitle="From To-Do to Done" />
                <KPICard title="Delivery Index" value={stats.efficiency} unit="%" icon={<Activity className="w-4 h-4" />} color="indigo" subtitle="Active throughput filter" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column - Main Analytics */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Created vs Resolved */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="font-black text-slate-800 flex items-center gap-2">
                                    <BarChart2 className="w-5 h-5 text-teal-600" />
                                    Work Allocation Flux
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">Throughput of Work Allocation board over time</p>
                            </div>
                        </div>
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={timelineData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="created" name="Created" fill="#94a3b8" stroke="#cbd5e1" fillOpacity={0.1} />
                                    <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#14b8a6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* CFD Map */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="mb-8">
                            <h3 className="font-black text-slate-800 flex items-center gap-2">
                                <ArrowUpRight className="w-5 h-5 text-indigo-600" />
                                Cumulative Flow Diagram
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">Status trends across entire board history</p>
                        </div>
                        <div className="h-72 w-full">
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
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Developer Velocity */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="mb-8 flex items-center gap-2">
                            <Users className="w-5 h-5 text-emerald-600" />
                            <div>
                                <h3 className="font-black text-slate-800">Resource Velocity Comparison</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Allocation efficiency per individual developer</p>
                            </div>
                        </div>
                        <div className="h-80 w-full">
                            {velocityData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={velocityData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '20px' }} />
                                        <Bar dataKey="points" name="Story Points" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={35} />
                                        <Bar dataKey="completed" name="Issues" fill="#2dd4bf" radius={[4, 4, 0, 0]} barSize={35} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-xl">
                                    No allocation data found in this period.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - Top Performers & Breakdown */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Top Contributors */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                            <Briefcase className="w-4 h-4 text-amber-500" />
                            Top Board Contributors
                        </h3>
                        <div className="space-y-4">
                            {topPerformers.length > 0 ? topPerformers.map((worker, i) => (
                                <div key={worker.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-bold text-xs shadow-sm">
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-800">{worker.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{worker.dept}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-teal-600">{worker.points} <span className="text-[10px] text-slate-400 font-bold">SP</span></p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{worker.completed} Issues</p>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-xs text-center text-slate-400 py-4 italic">No resolved work yet.</p>
                            )}
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                            <PieIcon className="w-4 h-4 text-purple-600" />
                            Issue Type Split
                        </h3>
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                                        {typeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS.Task} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Priority Profile */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                            <Flag className="w-4 h-4 text-rose-500" />
                            Priority Profile
                        </h3>
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={priorityData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                                        {priorityData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS.Medium} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Intelligence Summary */}
                    <div className="bg-slate-900 rounded-3xl p-7 text-white shadow-2xl relative overflow-hidden group">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp className="w-4 h-4 text-teal-400" />
                                <h4 className="text-teal-400 text-xs font-black uppercase tracking-widest">Performance Insights</h4>
                            </div>
                            {stats.resolved > 0 ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-medium leading-relaxed opacity-90">
                                        Delivery for <span className="font-bold text-white uppercase">{subdomain || 'Main'}</span> is currently operating at <span className="text-teal-400 font-black">{stats.efficiency}%</span> efficiency.
                                    </p>
                                    <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 shadow-inner">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-tighter">Bottleneck Analysis</p>
                                        <p className="text-xs font-bold text-white">
                                            {cfdData[cfdData.length - 1]?.Review > 5 ? "Review column is piling up. Action required." : "Status distribution is currently healthy."}
                                        </p>
                                    </div>
                                    <button
                                        onClick={exportAnalyticsCSV}
                                        className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-teal-400 hover:text-white transition-colors"
                                    >
                                        Export Analytics <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs opacity-60 italic">Waiting for more allocation data from the board...</p>
                            )}
                        </div>
                        <Activity className="absolute -right-8 -bottom-8 w-32 h-32 text-teal-500/10 group-hover:scale-110 transition-transform duration-700" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const KPICard = ({ title, value, unit = "", icon, color, trend, trendLabel, subtitle }) => {
    const colorClasses = {
        blue: "text-blue-600 bg-blue-50 border-blue-100",
        teal: "text-teal-600 bg-teal-50 border-teal-100",
        purple: "text-purple-600 bg-purple-50 border-purple-100",
        amber: "text-amber-600 bg-amber-50 border-amber-100",
        indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    }[color];

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group hover:-translate-y-0.5">
            <div className="flex justify-between items-start mb-5">
                <div className={`p-2.5 rounded-xl border ${colorClasses} shadow-sm group-hover:scale-110 transition-transform`}>{icon}</div>
                {trend !== undefined && (
                    <div className={`flex items-center text-[10px] font-black px-2 py-0.5 rounded-full ${parseInt(trend) > 60 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                        {parseInt(trend) > 60 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <Activity className="w-3 h-3 mr-0.5" />}
                        {trend}%
                    </div>
                )}
            </div>
            <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{title}</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">{value}</span>
                    {unit && <span className="text-xs font-bold text-slate-400 uppercase opacity-70">{unit}</span>}
                </div>
                {subtitle && <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter opacity-80">{subtitle}</p>}
                {trendLabel && <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">{trendLabel}</p>}
            </div>
        </div>
    );
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 min-w-[150px]">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">{label}</p>
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
