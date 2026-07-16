import React, { useState, useEffect } from 'react';
import { getLeaderboard } from '../../services/performanceService';
import { useAuth } from '../../hooks/useAuth';
import { Trophy, ChevronRight } from 'lucide-react';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

const MiniLeaderboard = ({ onViewFull }) => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const result = await getLeaderboard({ filter: 'all', limit: 3 });
                setData(result.leaderboard || []);
            } catch (e) {
                console.error('Failed to load mini leaderboard:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-9 bg-slate-50 rounded-xl border border-slate-100" />)}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-xs text-slate-400 text-center py-4">No rankings yet. Complete tasks to earn points!</p>
        );
    }

    const top3 = data.slice(0, 3);
    const myEntry = data.find(w => w._id === user?._id);
    const myRank = myEntry?.rank;
    const showMyEntry = myRank && myRank > 3;

    return (
        <div className="space-y-1.5">
            {/* Top 3 */}
            {top3.map((entry) => {
                const isMe = entry._id === user?._id;
                const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
                return (
                    <div
                        key={entry._id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all duration-200 ${isMe ? 'bg-teal-50/50 border-teal-200 shadow-sm shadow-teal-500/5' : 'bg-slate-50/40 hover:bg-slate-50 border-slate-100/70 hover:border-slate-200' }`}
                    >
                        <span className="text-xs w-4 text-center flex-shrink-0 font-bold text-slate-400">
                            {medals[entry.rank] || entry.rank}
                        </span>

                        <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-[10px] font-black text-slate-650 flex-shrink-0">
                            {entry.name?.charAt(0)?.toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <p className={`text-xs font-bold truncate ${isMe ? 'text-teal-900 font-extrabold' : 'text-slate-700'}`}>
                                    {isMe ? 'You' : entry.name}
                                </p>
                                {isMe && (
                                    <span className="text-[8px] bg-teal-600 text-white font-extrabold px-1.5 py-0.5 rounded tracking-wider scale-90">
                                        Me
                                    </span>
                                )}
                            </div>
                            {entry.currentStreak > 0 && (
                                <p className="text-[9px] text-orange-500 font-bold flex items-center gap-0.5 mt-0.5">
                                    🔥 {entry.currentStreak} day streak
                                </p>
                            )}
                        </div>

                        <span className={`text-xs font-extrabold flex-shrink-0 ${isMe ? 'text-teal-700' : 'text-slate-600'}`}>
                            {entry.totalPoints.toLocaleString()} pts
                        </span>
                    </div>
                );
            })}

            {/* Separator and my rank if not in top 3 */}
            {showMyEntry && (
                <>
                    <div className="flex items-center gap-2 py-0.5 px-3">
                        <div className="h-px flex-1 bg-slate-100 border-t" />
                        <span className="text-[9px] text-slate-350 font-bold tracking-widest">Your Position</span>
                        <div className="h-px flex-1 bg-slate-100 border-t" />
                    </div>

                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-teal-50/50 border border-teal-200/70 shadow-sm shadow-teal-500/5">
                        <span className="text-xs font-extrabold text-teal-600 w-4 text-center flex-shrink-0">
                            #{myRank}
                        </span>

                        <div className="w-6 h-6 rounded-full bg-teal-650 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0 shadow-sm">
                            {user?.name?.charAt(0)?.toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-extrabold text-teal-900">You</p>
                        </div>

                        <span className="text-xs font-extrabold text-teal-700 flex-shrink-0">
                            {myEntry.totalPoints.toLocaleString()} pts
                        </span>
                    </div>
                </>
            )}

            {/* View Full Button */}
            <button
                onClick={onViewFull}
                className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 text-[10px] font-bold tracking-wider text-teal-650 bg-teal-50/40 hover:bg-teal-50 border border-teal-200/50 rounded-xl transition-all duration-200 hover:shadow-sm"
            >
                <Trophy className="w-3 h-3 text-teal-600" />
                View Full Leaderboard
                <ChevronRight className="w-3 h-3 text-teal-600" />
            </button>
        </div>
    );
};

export default MiniLeaderboard;
