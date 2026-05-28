import React, { useState, useEffect } from 'react';
import { getMyPerformance, getMyPointHistory, getLeaderboard } from '../../services/performanceService';
import { useAuth } from '../../hooks/useAuth';
import BadgesDisplay from './BadgesDisplay';
import LeaderboardModal from './LeaderboardModal';
import PointHistory from './PointHistory';
import { Trophy, Flame, Star, TrendingUp, CheckCircle, AlertTriangle, Award } from 'lucide-react';

const LEVEL_COLORS = {
    'Beginner': { from: '#64748b', to: '#94a3b8', progress: 20 },
    'Performer': { from: '#3b82f6', to: '#60a5fa', progress: 40 },
    'Rising Star': { from: '#f59e0b', to: '#fbbf24', progress: 60 },
    'Elite Performer': { from: '#10b981', to: '#34d399', progress: 80 },
    'Legend': { from: '#8b5cf6', to: '#a78bfa', progress: 100 }
};

const rankMedals = { 1: '🥇', 2: '🥈', 3: '🥉' };

const WorkerPerformancePage = () => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const result = await getMyPerformance();
                setData(result);
            } catch (e) {
                console.error('Failed to load performance:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Trophy className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-slate-400">Could not load performance data.</p>
            </div>
        );
    }

    const level = data.performanceLevel || 'Beginner';
    const levelMeta = LEVEL_COLORS[level] || LEVEL_COLORS['Beginner'];
    const rankDisplay = rankMedals[data.rank] || `#${data.rank}`;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                    <Trophy className="w-7 h-7 text-amber-500" />
                    My Performance
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">Track your points, streaks, and achievements</p>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Points</p>
                    <div className="flex items-end gap-1">
                        <span className="text-yellow-400 text-xl">⭐</span>
                        <span className="text-3xl font-black text-slate-900">{(data.totalPoints || 0).toLocaleString()}</span>
                    </div>
                    {data.weeklyPoints > 0 && (
                        <p className="text-xs text-emerald-600 font-bold mt-1">+{data.weeklyPoints} this week</p>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Rank</p>
                    <p className="text-3xl font-black text-slate-900">{rankDisplay}</p>
                    <p className="text-xs text-slate-400 mt-1">Company-wide</p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Streak 🔥</p>
                    <p className="text-3xl font-black text-orange-600">{data.currentStreak || 0}</p>
                    <p className="text-xs text-slate-400 mt-1">Best: {data.longestStreak || 0}</p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Success Rate</p>
                    <p className="text-3xl font-black text-teal-600">{data.taskSuccessRate}%</p>
                    <p className="text-xs text-slate-400 mt-1">{data.totalCompletedTickets} tasks done</p>
                </div>
            </div>

            {/* Level Progress */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-sm font-black" style={{ color: levelMeta.from }}>{level}</p>
                        <p className="text-xs text-slate-400">Performance Level</p>
                    </div>
                    <button
                        onClick={() => setShowLeaderboard(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 rounded-xl px-3 py-1.5 hover:bg-teal-100 transition-all"
                    >
                        <Trophy className="w-3.5 h-3.5" />
                        View Leaderboard
                    </button>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                            width: `${levelMeta.progress}%`,
                            background: `linear-gradient(90deg, ${levelMeta.from}, ${levelMeta.to})`
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                    <span>Beginner</span>
                    <span>Performer</span>
                    <span>Rising Star</span>
                    <span>Elite</span>
                    <span>Legend</span>
                </div>
            </div>

            {/* Task Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        Task Performance
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-sm text-slate-600">Completed Tasks</span>
                            <span className="text-sm font-black text-emerald-600">{data.totalCompletedTickets}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-sm text-slate-600">Delayed Tasks</span>
                            <span className={`text-sm font-black ${data.totalDelayedTickets > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{data.totalDelayedTickets}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-600">Monthly Points</span>
                            <span className="text-sm font-black text-blue-600">{data.monthlyPoints || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Badges */}
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" />
                        Badges & Achievements
                    </h3>
                    {data.badges && data.badges.length > 0 ? (
                        <BadgesDisplay badges={data.badges} size="md" showLabel={true} />
                    ) : (
                        <div className="flex flex-col items-center py-6 text-center">
                            <Award className="w-10 h-10 text-slate-200 mb-2" />
                            <p className="text-sm text-slate-400">No badges yet</p>
                            <p className="text-xs text-slate-300 mt-1">Complete tasks to unlock badges</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Point History */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    Performance Activity Log
                </h3>
                <PointHistory />
            </div>

            {/* Leaderboard Modal */}
            <LeaderboardModal isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
        </div>
    );
};

export default WorkerPerformancePage;
