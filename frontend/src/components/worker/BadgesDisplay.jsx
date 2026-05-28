import React from 'react';

const BADGE_META = {
    speed_demon: { emoji: '🚀', name: 'Speed Demon', color: 'from-blue-500 to-cyan-400', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    elite_performer: { emoji: '🏆', name: 'Elite Performer', color: 'from-amber-500 to-yellow-400', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    consistency_king: { emoji: '🔥', name: 'Consistency King', color: 'from-orange-500 to-red-400', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    reliable_performer: { emoji: '🛡', name: 'Reliable Performer', color: 'from-teal-500 to-emerald-400', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
    bug_hunter: { emoji: '⚡', name: 'Bug Hunter', color: 'from-purple-500 to-violet-400', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' }
};

const BadgesDisplay = ({ badges = [], size = 'md', showLabel = true }) => {
    if (!badges || badges.length === 0) return null;

    const sizeClasses = {
        sm: 'w-7 h-7 text-sm',
        md: 'w-9 h-9 text-base',
        lg: 'w-12 h-12 text-xl'
    };

    return (
        <div className="flex flex-wrap gap-2">
            {badges.map((badge, idx) => {
                const meta = BADGE_META[badge.badgeType] || BADGE_META.speed_demon;
                return (
                    <div
                        key={idx}
                        title={badge.badgeDescription || meta.name}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${meta.bg} ${meta.border} border ${meta.text} text-[10px] font-bold transition-all hover:scale-105 cursor-default`}
                    >
                        <span className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-gradient-to-br ${meta.color} text-white shadow-sm`}>
                            {badge.badgeEmoji || meta.emoji}
                        </span>
                        {showLabel && (
                            <span className="hidden sm:inline">{badge.badgeName || meta.name}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default BadgesDisplay;
export { BADGE_META };
