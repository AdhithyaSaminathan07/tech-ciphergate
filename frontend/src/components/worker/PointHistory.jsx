import React, { useState, useEffect } from 'react';
import { getMyPointHistory } from '../../services/performanceService';

const REASON_META = {
    task_completed: { label: 'Task Completed', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    overdue_penalty: { label: 'Overdue Penalty', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
    manual_bonus: { label: 'Bonus', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    manual_deduction: { label: 'Deduction', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
    streak_bonus: { label: 'Streak Bonus', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    early_completion_bonus: { label: 'Early Bonus', color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' }
};

const STATUS_ICONS = {
    early: '⚡',
    on_time: '✅',
    delayed: '⚠️',
    no_dates: '📋',
    manual: '🔧'
};

const PointHistory = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await getMyPointHistory({ limit: 20 });
                setHistory(data.history || []);
            } catch (e) {
                console.error('Failed to load point history:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const displayed = showAll ? history : history.slice(0, 5);

    if (loading) {
        return (
            <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-slate-100 rounded-lg" />
                ))}
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="text-center py-6">
                <p className="text-sm text-slate-400">No performance points yet.</p>
                <p className="text-xs text-slate-300 mt-1">Complete tasks in Work Allocation to earn points.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {displayed.map((record, idx) => {
                const meta = REASON_META[record.reason] || REASON_META.task_completed;
                const isPositive = record.pointsEarned >= 0;
                const statusIcon = STATUS_ICONS[record.performanceStatus] || '📋';

                return (
                    <div
                        key={record._id || idx}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:shadow-sm ${meta.bg} ${meta.border}`}
                    >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="text-base flex-shrink-0">{statusIcon}</div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                    {record.ticketTitle || record.note || 'Performance Update'}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
                                        {meta.label}
                                    </span>
                                    {record.efficiencyRatio && (
                                        <span className="text-[10px] text-slate-400">
                                            {record.estimatedDays}d est / {record.actualDays}d actual
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-400">
                                        {new Date(record.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className={`text-sm font-black flex-shrink-0 ml-2 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isPositive ? '+' : ''}{record.pointsEarned}
                            <span className="text-[9px] font-bold ml-0.5">pts</span>
                        </div>
                    </div>
                );
            })}

            {history.length > 5 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full text-xs font-semibold text-slate-400 hover:text-teal-600 transition-colors py-2 rounded-lg hover:bg-slate-50"
                >
                    {showAll ? 'Show Less' : `View All ${history.length} Records`}
                </button>
            )}
        </div>
    );
};

export default PointHistory;
