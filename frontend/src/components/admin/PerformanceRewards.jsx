import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
    getAdminPerformanceOverview,
    getAdminEmployeeAnalytics,
    awardManualBonus,
    getPerformanceSettings,
    updatePerformanceSettings
} from '../../services/performanceService';
import BadgesDisplay from '../worker/BadgesDisplay';
import {
    Trophy, TrendingUp, Users, Zap, Settings, Search,
    Plus, Minus, Save, RefreshCw, BarChart2, Star, Flame,
    CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Award
} from 'lucide-react';

const LEVEL_COLORS = {
    'Beginner': 'text-slate-500 bg-slate-100 border-slate-200/60',
    'Performer': 'text-blue-600 bg-blue-50 border-blue-100/70',
    'Rising Star': 'text-amber-600 bg-amber-50 border-amber-100/70',
    'Elite Performer': 'text-emerald-600 bg-emerald-50 border-emerald-100/70',
    'Legend': 'text-purple-600 bg-purple-50 border-purple-100/70'
};

const StatCard = ({ icon, label, value, sub, color = 'teal' }) => {
    const colors = {
        teal: {
            bg: 'bg-gradient-to-br from-teal-50/60 to-emerald-50/20',
            border: 'border-teal-100/80',
            iconBg: 'bg-teal-100/50 text-teal-600',
            value: 'text-teal-900',
            glow: 'hover:shadow-teal-100/40'
        },
        emerald: {
            bg: 'bg-gradient-to-br from-emerald-50/60 to-teal-50/20',
            border: 'border-emerald-100/80',
            iconBg: 'bg-emerald-100/50 text-emerald-600',
            value: 'text-emerald-900',
            glow: 'hover:shadow-emerald-100/40'
        },
        blue: {
            bg: 'bg-gradient-to-br from-blue-50/60 to-indigo-50/20',
            border: 'border-blue-100/80',
            iconBg: 'bg-blue-100/50 text-blue-600',
            value: 'text-blue-900',
            glow: 'hover:shadow-blue-100/40'
        },
        rose: {
            bg: 'bg-gradient-to-br from-rose-50/60 to-pink-50/20',
            border: 'border-rose-100/80',
            iconBg: 'bg-rose-100/50 text-rose-600',
            value: 'text-rose-900',
            glow: 'hover:shadow-rose-100/40'
        },
        amber: {
            bg: 'bg-gradient-to-br from-amber-50/60 to-yellow-50/20',
            border: 'border-amber-100/80',
            iconBg: 'bg-amber-100/50 text-amber-600',
            value: 'text-amber-900',
            glow: 'hover:shadow-amber-100/40'
        },
        purple: {
            bg: 'bg-gradient-to-br from-purple-50/60 to-fuchsia-50/20',
            border: 'border-purple-100/80',
            iconBg: 'bg-purple-100/50 text-purple-600',
            value: 'text-purple-900',
            glow: 'hover:shadow-purple-100/40'
        }
    };
    const c = colors[color] || colors.teal;
    return (
        <div className={`group relative overflow-hidden ${c.bg} border ${c.border} rounded-2xl p-5 flex items-start gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${c.glow}`}>
            {/* Background decorative subtle gradient bubble */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/20 blur-xl group-hover:scale-150 transition-all duration-500 pointer-events-none" />

            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.iconBg} shadow-sm flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                {icon}
            </div>
            <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
                <p className={`text-2xl font-extrabold ${c.value} leading-none tracking-tight`}>{value}</p>
                {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
            </div>
        </div>
    );
};

const PerformanceRewards = () => {
    const [overview, setOverview] = useState(null);
    const [analytics, setAnalytics] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState('totalPoints');
    const [sortDir, setSortDir] = useState('desc');
    const [bonusForm, setBonusForm] = useState({ workerId: '', points: '', reason: '', note: '' });
    const [submittingBonus, setSubmittingBonus] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [localSettings, setLocalSettings] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, an, cfg] = await Promise.all([
                getAdminPerformanceOverview(),
                getAdminEmployeeAnalytics(),
                getPerformanceSettings()
            ]);
            setOverview(ov);
            setAnalytics(an.analytics || []);
            setSettings(cfg);
            setLocalSettings({ ...cfg });
        } catch (e) {
            console.error('Load error:', e);
            toast.error('Failed to load performance data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const sortedAnalytics = [...analytics]
        .filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.department.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            const av = a[sortField] ?? 0;
            const bv = b[sortField] ?? 0;
            return sortDir === 'asc' ? av - bv : bv - av;
        });

    const handleBonusSubmit = async (e) => {
        e.preventDefault();
        if (!bonusForm.workerId || !bonusForm.points) {
            toast.error('Select an employee and enter points');
            return;
        }
        setSubmittingBonus(true);
        try {
            await awardManualBonus({
                workerId: bonusForm.workerId,
                points: parseFloat(bonusForm.points),
                reason: bonusForm.reason,
                note: bonusForm.note
            });
            toast.success('Points awarded successfully!');
            setBonusForm({ workerId: '', points: '', reason: '', note: '' });
            loadData();
        } catch (e) {
            toast.error('Failed to award points');
        } finally {
            setSubmittingBonus(false);
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await updatePerformanceSettings(localSettings);
            setSettings(localSettings);
            toast.success('Settings saved successfully!');
        } catch (e) {
            toast.error('Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    const SortIcon = ({ field }) => (
        sortField === field
            ? (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-teal-600" /> : <ChevronDown className="w-3.5 h-3.5 text-teal-600" />)
            : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
    );

    const TABS = [
        { key: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" /> },
        { key: 'analytics', label: 'Employee Analytics', icon: <Users className="w-4 h-4" /> },
        { key: 'bonus', label: 'Bonus & Deductions', icon: <Zap className="w-4 h-4" /> },
        { key: 'settings', label: 'Configuration', icon: <Settings className="w-4 h-4" /> }
    ];

    return (
        <div className="space-y-6">
            {/* Page Header */}
            {/* Tabs & Actions Row */}
            <div className="flex items-center justify-between flex-wrap gap-4 pb-2">
                <div className="flex gap-1.5 p-1 bg-slate-100/70 backdrop-blur-sm border border-slate-200/50 rounded-2xl w-fit overflow-x-auto shadow-sm">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap ${isActive
                                        ? 'bg-white text-slate-900 shadow-md shadow-slate-200/60 border border-slate-100/80 scale-[1.02]'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                                    }`}
                            >
                                <span className={`transition-colors duration-300 ${isActive ? 'text-teal-600' : 'text-slate-400'}`}>
                                    {tab.icon}
                                </span>
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-600 hover:border-teal-400 hover:text-teal-600 transition-all duration-300 shadow-sm hover:shadow active:scale-95"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh Page
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />)}
                </div>
            ) : (
                <div className="transition-all duration-300">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && overview && (
                        <div className="space-y-6">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                                <StatCard icon={<Trophy className="w-5 h-5" />} label="Total Points Distributed" value={overview.totalPointsDistributed?.toLocaleString() || '0'} color="amber" />
                                <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Total Penalties" value={overview.totalPenalties?.toLocaleString() || '0'} sub="Points deducted" color="rose" />
                                <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Efficiency" value={`${overview.avgEfficiency}x`} sub="Estimated / Actual" color="teal" />
                            </div>
                            

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Top Performers */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:shadow-md">
                                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-50">
                                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                                            <Star className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800">Top Performers</h3>
                                            <p className="text-[10px] text-slate-400 font-medium">Top active leaders by total points</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2.5">
                                        {(overview.topPerformers || []).map((w, idx) => {
                                            const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                                            return (
                                                <div key={w._id} className="flex items-center gap-3 p-3 bg-slate-50/50 hover:bg-slate-50 rounded-xl transition-all border border-slate-100/50 hover:border-slate-200/50">
                                                    <div className="w-6 text-center text-xs font-extrabold text-slate-400">
                                                        {rankEmoji || `#${idx + 1}`}
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-700 shadow-inner flex-shrink-0">
                                                        {w.name?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">{w.department?.name || 'N/A'}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-extrabold text-emerald-600">{(w.performancePoints || 0).toLocaleString()}</span>
                                                        <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-wider">pts</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(!overview.topPerformers || overview.topPerformers.length === 0) && (
                                            <p className="text-xs text-slate-400 text-center py-6 font-medium">No performance data yet</p>
                                        )}
                                    </div>
                                </div>

                                {/* Streak Leaders */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:shadow-md">
                                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-50">
                                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                                            <Flame className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800">Streak Leaders</h3>
                                            <p className="text-[10px] text-slate-400 font-medium">Consecutive on-time completions</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2.5">
                                        {(overview.streakLeaders || []).map((w) => (
                                            <div key={w._id} className="flex items-center gap-3 p-3 bg-slate-50/50 hover:bg-slate-50 rounded-xl transition-all border border-slate-100/50 hover:border-slate-200/50">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-xs font-bold text-orange-700 shadow-inner flex-shrink-0">
                                                    {w.name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{w.department?.name || 'N/A'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-extrabold text-orange-600 flex items-center justify-end gap-0.5">
                                                        <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                                                        {w.currentStreak}
                                                    </span>
                                                    <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-wider">streak</p>
                                                </div>
                                            </div>
                                        ))}
                                        {(!overview.streakLeaders || overview.streakLeaders.length === 0) && (
                                            <p className="text-xs text-slate-400 text-center py-6 font-medium">No active streaks yet</p>
                                        )}
                                    </div>
                                </div>

                                {/* Lowest Performers */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:shadow-md">
                                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-50">
                                        <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                                            <AlertTriangle className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800">Needs Attention</h3>
                                            <p className="text-[10px] text-slate-400 font-medium">Lowest scoring in performance points</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2.5">
                                        {(overview.lowestPerformers || []).map((w) => (
                                            <div key={w._id} className="flex items-center gap-3 p-3 bg-rose-50/20 hover:bg-rose-50/40 rounded-xl transition-all border border-rose-100/20 hover:border-rose-200/30">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-xs font-bold text-rose-700 shadow-inner flex-shrink-0">
                                                    {w.name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{w.department?.name || 'N/A'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-extrabold text-rose-600">{w.performancePoints || 0}</span>
                                                    <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-wider">pts</p>
                                                </div>
                                            </div>
                                        ))}
                                        {(!overview.lowestPerformers || overview.lowestPerformers.length === 0) && (
                                            <p className="text-xs text-slate-400 text-center py-6 font-medium">All employees on track</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ANALYTICS TAB */}
                    {activeTab === 'analytics' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-200/50">
                                <div className="relative flex-1 max-w-xs">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search employees by name or dept..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all shadow-sm"
                                    />
                                </div>
                                <span className="text-xs text-slate-500 font-semibold px-3 py-1 bg-white border border-slate-100 rounded-lg shadow-sm">
                                    {sortedAnalytics.length} employees
                                </span>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="text-center px-4 py-3.5 w-12">Rank</th>
                                                <th className="text-left px-4 py-3.5">Employee</th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('totalPoints')}>
                                                    <div className="flex items-center justify-end gap-1.5">Points <SortIcon field="totalPoints" /></div>
                                                </th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('weeklyPoints')}>
                                                    <div className="flex items-center justify-end gap-1.5">Weekly <SortIcon field="weeklyPoints" /></div>
                                                </th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('currentStreak')}>
                                                    <div className="flex items-center justify-end gap-1.5">Streak <SortIcon field="currentStreak" /></div>
                                                </th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('totalCompletedTickets')}>
                                                    <div className="flex items-center justify-end gap-1.5">Tasks <SortIcon field="totalCompletedTickets" /></div>
                                                </th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('totalDelayedTickets')}>
                                                    <div className="flex items-center justify-end gap-1.5">Delays <SortIcon field="totalDelayedTickets" /></div>
                                                </th>
                                                <th className="text-right px-4 py-3.5 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => handleSort('avgEfficiency')}>
                                                    <div className="flex items-center justify-end gap-1.5">Efficiency <SortIcon field="avgEfficiency" /></div>
                                                </th>
                                                <th className="px-4 py-3.5 text-center">Badges</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {sortedAnalytics.map((worker) => {
                                                const levelClass = LEVEL_COLORS[worker.performanceLevel] || LEVEL_COLORS['Beginner'];
                                                const rankClass = worker.rank === 1
                                                    ? 'bg-amber-50 text-amber-600 border-amber-100/80 shadow-sm'
                                                    : worker.rank === 2
                                                        ? 'bg-slate-100 text-slate-600 border-slate-200/80'
                                                        : worker.rank === 3
                                                            ? 'bg-amber-100/60 text-amber-700 border-amber-200/50'
                                                            : 'bg-slate-50 text-slate-400 border-slate-100';

                                                return (
                                                    <tr key={worker._id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-4 py-3.5 text-center">
                                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-extrabold border ${rankClass}`}>
                                                                {worker.rank}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 border border-white flex items-center justify-center text-xs font-black text-slate-700 flex-shrink-0 shadow-sm">
                                                                    {worker.name?.charAt(0)?.toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-slate-800">{worker.name}</p>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-[10px] text-slate-400 font-medium">{worker.department}</span>
                                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${levelClass}`}>
                                                                            {worker.performanceLevel}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-black text-emerald-600 text-sm">{(worker.totalPoints || 0).toLocaleString()}</td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span className={`text-xs font-bold ${worker.weeklyPoints > 0 ? 'text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
                                                                {worker.weeklyPoints > 0 ? `+${worker.weeklyPoints}` : '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-bold text-orange-600">
                                                            {worker.currentStreak > 0 ? (
                                                                <span className="inline-flex items-center gap-0.5 text-xs">🔥{worker.currentStreak}</span>
                                                            ) : <span className="text-slate-300">-</span>}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right text-xs font-bold text-slate-700">{worker.totalCompletedTickets}</td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span className={`text-xs font-bold ${worker.totalDelayedTickets > 0 ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded' : 'text-slate-300'}`}>
                                                                {worker.totalDelayedTickets || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span className={`text-xs font-bold ${worker.avgEfficiency >= 1 ? 'text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded' : 'text-slate-500'}`}>
                                                                {worker.avgEfficiency ? `${worker.avgEfficiency}x` : '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex justify-center">
                                                                {worker.badges && worker.badges.length > 0
                                                                    ? <BadgesDisplay badges={worker.badges.slice(0, 2)} size="sm" showLabel={false} />
                                                                    : <span className="text-[10px] text-slate-300 font-medium">No badges</span>
                                                                }
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {sortedAnalytics.length === 0 && (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm font-medium">No employees found</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* BONUS TAB */}
                    {activeTab === 'bonus' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Bonus Form */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-teal-600" />
                                    Award / Deduct Points
                                </h3>
                                <form onSubmit={handleBonusSubmit} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Employee</label>
                                        <select
                                            value={bonusForm.workerId}
                                            onChange={e => setBonusForm(p => ({ ...p, workerId: e.target.value }))}
                                            className="w-full border border-slate-200/80 rounded-xl px-3.5 py-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all bg-slate-50/50"
                                            required
                                        >
                                            <option value="">Select employee...</option>
                                            {analytics.map(w => (
                                                <option key={w._id} value={w._id}>{w.name} ({w.department})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                            Points <span className="text-slate-400 font-normal lowercase">(use negative value to deduct points)</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={bonusForm.points}
                                            onChange={e => setBonusForm(p => ({ ...p, points: e.target.value }))}
                                            placeholder="e.g. 10 or -5"
                                            className="w-full border border-slate-200/80 rounded-xl px-3.5 py-3 text-xs font-semibold placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all bg-slate-50/50"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Note / Reason</label>
                                        <textarea
                                            value={bonusForm.note}
                                            onChange={e => setBonusForm(p => ({ ...p, note: e.target.value }))}
                                            placeholder="Reason for bonus or deduction..."
                                            rows={3}
                                            className="w-full border border-slate-200/80 rounded-xl px-3.5 py-3 text-xs font-semibold placeholder-slate-400 resize-none focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all bg-slate-50/50"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submittingBonus}
                                        className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl text-xs hover:from-teal-700 hover:to-emerald-700 transition-all duration-300 shadow-md shadow-teal-500/15 disabled:opacity-60 hover:shadow-lg active:scale-[0.98]"
                                    >
                                        {submittingBonus ? 'Processing...' : 'Award Points'}
                                    </button>
                                </form>
                            </div>

                            {/* Quick Reference */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50">Point Formula Reference</h3>
                                <div className="space-y-4">
                                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Basic Formula</p>
                                        <code className="text-xs text-teal-700 font-extrabold">
                                            Points = (Est.Days / Act.Days) × Base
                                        </code>
                                    </div>
                                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Example scenario</p>
                                        <p className="text-xs text-slate-600 font-medium">Estimated: 6 days, Actual: 2 days</p>
                                        <p className="text-xs text-slate-700 font-semibold mt-1">Calculation: (6 / 2) × 1 = <span className="text-emerald-600 font-bold">3.0 Points</span></p>
                                    </div>
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center gap-2.5 text-xs font-semibold">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                            <span className="text-slate-600"><strong>Early:</strong> ratio &gt; 1 &rarr; more points awarded</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold">
                                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                            <span className="text-slate-600"><strong>On Time:</strong> ratio = 1 &rarr; base points awarded</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold">
                                            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                                            <span className="text-slate-600"><strong>Delayed:</strong> ratio &lt; 1 &rarr; penalty deduction applied</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SETTINGS TAB */}
                    {activeTab === 'settings' && localSettings && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Core Settings */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                                <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-teal-600" />
                                    Core System Settings
                                </h3>

                                <div className="space-y-4">
                                    {[
                                        { key: 'enabled', label: 'Performance System Enabled', desc: 'Master toggle for the entire system' },
                                        { key: 'advancedMode', label: 'Advanced Mode', desc: 'Enable priority & type multipliers' },
                                        { key: 'penaltyEnabled', label: 'Penalty System', desc: 'Reduce points for overdue tasks' },
                                        { key: 'earlyBonusEnabled', label: 'Early Completion Bonus', desc: 'Extra points for finishing ahead of time' },
                                        { key: 'streakBonusEnabled', label: 'Streak Bonuses', desc: 'Reward consecutive on-time completions' },
                                        { key: 'badgeSystemEnabled', label: 'Badge System', desc: 'Automatically award achievement badges' },
                                        { key: 'leaderboardVisible', label: 'Leaderboard Visible to Workers', desc: 'Workers can see the full leaderboard' }
                                    ].map(({ key, label, desc }) => (
                                        <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">{label}</p>
                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{desc}</p>
                                            </div>
                                            <button
                                                onClick={() => setLocalSettings(p => ({ ...p, [key]: !p[key] }))}
                                                className={`relative w-10 h-5.5 rounded-full transition-all duration-300 flex-shrink-0 ${localSettings[key] ? 'bg-teal-500 shadow-inner' : 'bg-slate-200'}`}
                                            >
                                                <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-all duration-300 ${localSettings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-2 space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Base Points (per task)</label>
                                        <input
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            value={localSettings.basePoints}
                                            onChange={e => setLocalSettings(p => ({ ...p, basePoints: parseFloat(e.target.value) }))}
                                            className="w-full border border-slate-200/80 rounded-xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all bg-slate-50/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Penalty Percentage (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={localSettings.penaltyPercentage}
                                            onChange={e => setLocalSettings(p => ({ ...p, penaltyPercentage: parseFloat(e.target.value) }))}
                                            className="w-full border border-slate-200/80 rounded-xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all bg-slate-50/50"
                                        />
                                        <p className="text-[10px] text-slate-400 font-medium mt-1.5">% reduction applied to overdue task points</p>
                                    </div>
                                </div>
                            </div>

                            {/* Multiplier Settings */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                                <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50 flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    Advanced Multipliers
                                    {!localSettings.advancedMode && (
                                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200/40">Enable Advanced Mode first</span>
                                    )}
                                </h3>

                                <div className={localSettings.advancedMode ? 'space-y-5' : 'space-y-5 opacity-40 pointer-events-none'}>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Priority Multipliers</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['Low', 'Medium', 'High', 'Critical'].map(p => (
                                                <div key={p}>
                                                    <label className="text-xs text-slate-500 font-semibold block mb-1">{p}</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={localSettings.priorityMultipliers?.[p] ?? 1}
                                                        onChange={e => setLocalSettings(prev => ({
                                                            ...prev,
                                                            priorityMultipliers: { ...prev.priorityMultipliers, [p]: parseFloat(e.target.value) }
                                                        }))}
                                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Type Multipliers</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['Task', 'Bug', 'Story', 'Epic'].map(t => (
                                                <div key={t}>
                                                    <label className="text-xs text-slate-500 font-semibold block mb-1">{t}</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={localSettings.typeMultipliers?.[t] ?? 1}
                                                        onChange={e => setLocalSettings(prev => ({
                                                            ...prev,
                                                            typeMultipliers: { ...prev.typeMultipliers, [t]: parseFloat(e.target.value) }
                                                        }))}
                                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={savingSettings}
                                    className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl text-xs hover:from-teal-700 hover:to-emerald-700 transition-all duration-300 shadow-md shadow-teal-500/15 flex items-center justify-center gap-2 disabled:opacity-60 hover:shadow-lg active:scale-[0.98]"
                                >
                                    <Save className="w-4 h-4" />
                                    {savingSettings ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PerformanceRewards;
