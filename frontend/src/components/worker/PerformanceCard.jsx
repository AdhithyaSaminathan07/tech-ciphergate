import React, { useState, useEffect, useRef } from 'react';
import { getMyPerformance } from '../../services/performanceService';
import BadgesDisplay from './BadgesDisplay';

const LEVEL_COLORS = {
    'Beginner': { from: '#64748b', to: '#94a3b8', label: '#64748b', progress: 20 },
    'Performer': { from: '#3b82f6', to: '#60a5fa', label: '#3b82f6', progress: 40 },
    'Rising Star': { from: '#f59e0b', to: '#fbbf24', label: '#f59e0b', progress: 60 },
    'Elite Performer': { from: '#10b981', to: '#34d399', label: '#10b981', progress: 80 },
    'Legend': { from: '#8b5cf6', to: '#a78bfa', label: '#8b5cf6', progress: 100 }
};

const AnimatedCounter = ({ value, duration = 1200 }) => {
    const [display, setDisplay] = useState(0);
    const ref = useRef(null);

    useEffect(() => {
        const start = display;
        const end = value;
        if (start === end) return;
        const range = end - start;
        const step = Math.ceil(Math.abs(range) / (duration / 16));
        let current = start;

        const timer = setInterval(() => {
            current += range > 0 ? step : -step;
            if ((range > 0 && current >= end) || (range < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }
            setDisplay(Math.round(current));
        }, 16);

        return () => clearInterval(timer);
    }, [value]);

    return <span>{display.toLocaleString()}</span>;
};

const PerformanceCard = ({ onLeaderboardClick }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const result = await getMyPerformance();
                setData(result);
            } catch (e) {
                console.error('Failed to load performance data:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-100 shadow-sm animate-pulse">
                <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
                <div className="h-10 w-24 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-full bg-slate-100 rounded" />
            </div>
        );
    }

    if (!data) return null;

    const level = data.performanceLevel || 'Beginner';
    const levelMeta = LEVEL_COLORS[level] || LEVEL_COLORS['Beginner'];
    const rankMedals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const rankDisplay = rankMedals[data.rank] || `#${data.rank}`;

    return (
        <div
            className="relative bg-white rounded-3xl border border-slate-100/80 shadow-sm overflow-hidden flex flex-col transition-all duration-300 hover:shadow-md hover:border-slate-200/80 cursor-pointer group"
            onClick={onLeaderboardClick}
            title="Click to view full leaderboard"
        >
            {/* Gradient top bar */}
            <div
                className="h-1 w-full"
                style={{ background: `linear-gradient(90deg, ${levelMeta.from}, ${levelMeta.to})` }}
            />
            <div className="p-4 md:p-5 flex flex-col justify-between h-full gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-400 tracking-widest">Performance Score</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-slate-500">
                        Rank {rankDisplay}
                    </span>
                </div>

                {/* Main Points */}
                <div className="flex items-baseline justify-between mt-1">
                    <div>
                        <h3 className="text-3xl font-black text-slate-900 leading-none tracking-tight">
                            <AnimatedCounter value={data.totalPoints} />
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-1">Total Points</p>
                    </div>
                    {data.weeklyPoints > 0 && (
                        <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50/60 border border-emerald-100/50 rounded-full px-2 py-0.5">
                            <span className="text-[10px] font-bold">+{data.weeklyPoints} this week</span>
                        </div>
                    )}
                </div>

                {/* Stats Row - Clean Typography, No Emojis */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                    <div className="flex flex-col bg-slate-50/50 border border-slate-100/60 rounded-xl p-2 text-center">
                        <span className="text-xs font-bold text-slate-400 tracking-wider mb-0.5">Streak</span>
                        <span className="text-base font-black text-slate-800">{data.currentStreak}d</span>
                    </div>
                    <div className="flex flex-col bg-slate-50/50 border border-slate-100/60 rounded-xl p-2 text-center">
                        <span className="text-xs font-bold text-slate-400 tracking-wider mb-0.5">Success</span>
                        <span className="text-base font-black text-slate-800">{data.taskSuccessRate}%</span>
                    </div>
                    <div className="flex flex-col bg-slate-50/50 border border-slate-100/60 rounded-xl p-2 text-center">
                        <span className="text-xs font-bold text-slate-400 tracking-wider mb-0.5">Done</span>
                        <span className="text-base font-black text-slate-800">{data.totalCompletedTickets}</span>
                    </div>
                </div>

                {/* Performance Level */}
                <div className="space-y-1 mt-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: levelMeta.label }}>
                            {level}
                        </span>
                        <span className="text-[10px] text-slate-450 font-bold">{levelMeta.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                                width: `${levelMeta.progress}%`,
                                background: `linear-gradient(90deg, ${levelMeta.from}, ${levelMeta.to})`
                            }}
                        />
                    </div>
                </div>

                {/* Badges */}
                {data.badges && data.badges.length > 0 && (
                    <div className="pt-0.5 border-t border-slate-100/70">
                        <BadgesDisplay badges={data.badges.slice(0, 3)} size="sm" showLabel={false} />
                    </div>
                )}

                {/* Click hint */}
                <p className="text-[9px] font-bold tracking-wider text-slate-350 text-center group-hover:text-teal-600 transition-colors mt-2">
                    View full leaderboard
                </p>
            </div>
        </div>
    );
};

export default PerformanceCard;
