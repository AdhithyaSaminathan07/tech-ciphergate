import React, { useState, useEffect, useCallback } from 'react';

// Global event bus for triggering point animations
let animationListeners = [];
export const triggerPointAnimation = (points, label = '') => {
    animationListeners.forEach(fn => fn({ points, label, id: Date.now() + Math.random() }));
};

const PointAnimation = () => {
    const [animations, setAnimations] = useState([]);

    useEffect(() => {
        const handler = (anim) => {
            setAnimations(prev => [...prev, anim]);
            setTimeout(() => {
                setAnimations(prev => prev.filter(a => a.id !== anim.id));
            }, 2800);
        };
        animationListeners.push(handler);
        return () => {
            animationListeners = animationListeners.filter(f => f !== handler);
        };
    }, []);

    if (animations.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[9999]" aria-hidden="true">
            {animations.map((anim) => (
                <div
                    key={anim.id}
                    className="absolute right-6 bottom-24 flex flex-col items-center animate-point-float"
                    style={{
                        animation: 'pointFloat 2.8s ease-out forwards',
                        right: `${Math.random() * 60 + 20}px`,
                        bottom: `${Math.random() * 40 + 80}px`
                    }}
                >
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-lg px-5 py-2 rounded-full shadow-2xl shadow-emerald-500/40 border-2 border-white/30 backdrop-blur-sm flex items-center gap-2">
                        <span className="text-yellow-300">⭐</span>
                        <span>+{anim.points} pts</span>
                    </div>
                    {anim.label && (
                        <div className="mt-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full shadow">
                            {anim.label}
                        </div>
                    )}
                </div>
            ))}

            <style>{`
                @keyframes pointFloat {
                    0% { opacity: 0; transform: translateY(0) scale(0.5); }
                    15% { opacity: 1; transform: translateY(-10px) scale(1.15); }
                    60% { opacity: 1; transform: translateY(-60px) scale(1); }
                    100% { opacity: 0; transform: translateY(-120px) scale(0.8); }
                }
            `}</style>
        </div>
    );
};

export default PointAnimation;
