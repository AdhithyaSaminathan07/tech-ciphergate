import React from 'react';
import { Link } from 'react-router-dom';
import { FaCrown, FaTrophy, FaMedal, FaCalendarAlt, FaCheckCircle, FaArrowRight } from 'react-icons/fa';

const WelcomeBanner = ({ userName, pendingReviews = 0, totalTasks = 0, completionRate = 0, topTeams = [] }) => {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#F4FBF7] via-white to-[#EEF9F2] rounded-2xl p-5 md:p-6 border border-emerald-100/80 shadow-[0_4px_24px_rgba(16,185,129,0.06)]">
      {/* Subtle ambient gradient highlights */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-60 h-60 bg-green-100/30 rounded-full blur-2xl pointer-events-none" />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Section: Greeting & Quick Review Metrics (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-start text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs font-semibold mb-3">
            <FaCalendarAlt className="text-emerald-600 text-[11px]" />
            <span>{today}</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Hi, <span className="text-emerald-600">{userName || 'Administrator'}</span>
          </h1>

          <div className="space-y-2 max-w-xl">
            <p className="text-sm md:text-base text-slate-600 leading-relaxed">
              You have{' '}
              <Link
                to="/admin/work-allocation"
                className="font-bold text-emerald-600 hover:text-emerald-700 underline decoration-emerald-300 decoration-2 underline-offset-2 transition-colors inline-flex items-center gap-1"
              >
                <span>{pendingReviews}</span> tasks pending to review today
                <FaArrowRight className="text-[10px]" />
              </Link>
            </p>

            <div className="pt-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5 max-w-md">
                <span>Task Completion Progress</span>
                <span className="font-bold text-slate-800">{completionRate}% completed</span>
              </div>
              <div className="w-full max-w-md h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(Math.max(completionRate, 0), 100)}%` }}
                />
              </div>
            </div>

            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/70 text-emerald-800 border border-emerald-200/60 shadow-sm">
                <FaCheckCircle className="text-emerald-600 text-[11px]" />
                Keep up the great work!
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Top Teams - Last Month Earnings (5 cols) */}
        <div className="lg:col-span-5 bg-white/90 backdrop-blur-sm rounded-xl p-4 md:p-5 border border-emerald-100/80 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-500">
                <FaCrown size={14} />
              </div>
              <h2 className="text-xs md:text-sm font-bold text-slate-800 tracking-tight">
                Top Teams <span className="font-normal text-slate-400">· Last Month</span>
              </h2>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
              Top 3 List
            </span>
          </div>

          <div className="space-y-2">
            {topTeams && topTeams.length > 0 ? (
              topTeams.slice(0, 3).map((team, index) => {
                const isGold = index === 0;
                const isSilver = index === 1;
                const isBronze = index === 2;

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-slate-50/70 hover:bg-emerald-50/40 p-2.5 rounded-lg border border-slate-100 hover:border-emerald-200/80 transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 ${
                          isGold
                            ? 'bg-amber-100 text-amber-700 border border-amber-300/60'
                            : isSilver
                            ? 'bg-slate-200 text-slate-700 border border-slate-300'
                            : 'bg-orange-100 text-orange-700 border border-orange-300/60'
                        }`}
                      >
                        {isGold ? <FaTrophy size={10} /> : isSilver ? <FaMedal size={10} /> : index + 1}
                      </div>
                      <span className="font-semibold text-slate-700 text-xs md:text-sm truncate group-hover:text-emerald-700 transition-colors">
                        {team.name}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs md:text-sm font-bold text-emerald-600 font-mono">
                        ₹{Number(team.amount || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs font-medium text-slate-400 tracking-wider">No earning data available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBanner;
