import React, { useState, useEffect, useRef } from 'react';
import { getLeaderboard } from '../../services/performanceService';
import { useAuth } from '../../hooks/useAuth';
import BadgesDisplay from './BadgesDisplay';
import { X, Trophy, Flame, TrendingUp, Users } from 'lucide-react';

const FILTERS = [
    { key: 'all', label: 'All Time' },
    { key: 'weekly', label: 'This Week' },
    { key: 'monthly', label: 'This Month' }
];

const LEVEL_COLORS = {
    'Beginner': 'text-slate-500 bg-slate-50',
    'Performer': 'text-blue-600 bg-blue-50',
    'Rising Star': 'text-amber-600 bg-amber-50',
    'Elite Performer': 'text-emerald-600 bg-emerald-50',
    'Legend': 'text-purple-600 bg-purple-50'
};

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

const LeaderboardModal = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [filter, setFilter] = useState('all');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const modalRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setLoading(true);
            try {
                const result = await getLeaderboard({ filter });
                setData(result.leaderboard || []);
            } catch (e) {
                console.error('Failed to load leaderboard:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [isOpen, filter]);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    if (!isOpen) return null;

    const myEntry = data.find(w => w._id === user?._id);
    const top3 = data.slice(0, 3);
    const rest = data.slice(3);

    return (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                ref={modalRef}
                className="relative bg-white w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="relative overflow-hidden px-6 py-5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-shrink-0">
                    <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 40%)'
                    }} />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
                                <Trophy className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black tracking-tight">Leaderboard</h2>
                                <p className="text-xs text-slate-400">{data.length} performers ranked</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Filter Tabs */}
                    <div className="relative flex gap-1 mt-4 p-1 bg-white/10 rounded-xl">
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === f.key ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Trophy className="w-12 h-12 text-slate-200 mb-3" />
                            <p className="text-slate-400 font-medium">No data yet</p>
                            <p className="text-xs text-slate-300 mt-1">Complete tasks to appear on the leaderboard</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-2">
                            {/* Top 3 Podium */}
                            {top3.length > 0 && (
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {top3.map((entry, idx) => (
                                        <div
                                            key={entry._id}
                                            className={`relative flex flex-col items-center p-3 rounded-xl border transition-all hover:shadow-md ${idx === 0 ? 'bg-amber-50 border-amber-200 order-2' : idx === 1 ? 'bg-slate-50 border-slate-200 order-1' : 'bg-orange-50 border-orange-200 order-3'}`}
                                        >
                                            {entry._id === user?._id && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-teal-500 border-2 border-white" />
                                            )}
                                            <div className="text-2xl mb-1">{MEDAL[idx + 1]}</div>
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-sm font-black text-white shadow-sm">
                                                {entry.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <p className="text-xs font-bold text-slate-800 mt-1 text-center leading-tight truncate w-full">
                                                {entry._id === user?._id ? 'You' : entry.name}
                                            </p>
                                            <p className="text-xs font-black text-emerald-600 mt-0.5">
                                                {(filter === 'all' ? entry.totalPoints : entry.filteredPoints).toLocaleString()} pts
                                            </p>
                                            {entry.currentStreak > 0 && (
                                                <div className="flex items-center gap-0.5 mt-1">
                                                    <Flame className="w-2.5 h-2.5 text-orange-500" />
                                                    <span className="text-[9px] font-bold text-orange-500">{entry.currentStreak}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rest of list */}
                            {rest.map((entry) => {
                                const isMe = entry._id === user?._id;
                                const levelClass = LEVEL_COLORS[entry.performanceLevel] || LEVEL_COLORS['Beginner'];
                                return (
                                    <div
                                        key={entry._id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm ${isMe ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-300' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                    >
                                        {/* Rank */}
                                        <div className="w-7 text-center text-xs font-black text-slate-400 flex-shrink-0">
                                            #{entry.rank}
                                        </div>

                                        {/* Avatar */}
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-sm ${isMe ? 'bg-gradient-to-br from-teal-500 to-emerald-500' : 'bg-gradient-to-br from-slate-300 to-slate-400'}`}>
                                            {entry.name?.charAt(0)?.toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-sm font-bold text-slate-800 truncate">
                                                    {isMe ? 'You' : entry.name}
                                                </p>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${levelClass}`}>
                                                    {entry.performanceLevel}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-[10px] text-slate-400">{entry.department}</span>
                                                {entry.currentStreak > 0 && (
                                                    <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5">
                                                        🔥{entry.currentStreak}
                                                    </span>
                                                )}
                                                {entry.totalCompletedTickets > 0 && (
                                                    <span className="text-[10px] text-slate-400">{entry.totalCompletedTickets} tasks</span>
                                                )}
                                            </div>
                                            {entry.badges && entry.badges.length > 0 && (
                                                <div className="mt-1">
                                                    <BadgesDisplay badges={entry.badges.slice(0, 2)} size="sm" showLabel={false} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Points */}
                                        <div className="text-right flex-shrink-0">
                                            <p className={`text-sm font-black ${isMe ? 'text-teal-700' : 'text-slate-800'}`}>
                                                {(filter === 'all' ? entry.totalPoints : entry.filteredPoints).toLocaleString()}
                                            </p>
                                            {entry.weeklyGain > 0 && (
                                                <p className="text-[10px] text-emerald-500 font-bold flex items-center justify-end gap-0.5">
                                                    <TrendingUp className="w-2.5 h-2.5" />
                                                    +{entry.weeklyGain}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* My rank if not in view */}
                            {myEntry && myEntry.rank > data.length && (
                                <div className="mt-2 p-3 rounded-xl bg-teal-50 border border-teal-200 ring-1 ring-teal-300 flex items-center gap-3">
                                    <div className="text-xs font-black text-teal-600">#{myEntry.rank}</div>
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-xs font-black text-white">
                                        {user?.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-teal-800">You</p>
                                        <p className="text-[10px] text-teal-600">{myEntry.performanceLevel}</p>
                                    </div>
                                    <p className="text-sm font-black text-teal-700">
                                        {(filter === 'all' ? myEntry.totalPoints : myEntry.filteredPoints).toLocaleString()} pts
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeaderboardModal;
