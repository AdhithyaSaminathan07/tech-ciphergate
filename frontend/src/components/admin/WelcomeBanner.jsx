import React from 'react';
import { Link } from 'react-router-dom';
import { FaCrown, FaTrophy, FaMedal } from 'react-icons/fa';
import teamIllustration from '../../assets/3d-team-working.png';

const WelcomeBanner = ({ userName, pendingReviews, totalTasks, completionRate, topTeams = [] }) => {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#F2FFF5] via-[#E9FFEF] to-[#C4FFE4] rounded-3xl p-4 md:p-6 border border-green-200/40 shadow-[0_10px_30px_rgba(213,255,237,0.2)]">
      {/* Decorative blobs */}
      <div className="absolute top-[-20%] right-[-5%] w-[200px] h-[200px] bg-green-200/30 rounded-full blur-[60px]"></div>
      <div className="absolute bottom-[-20%] left-[-5%] w-[150px] h-[150px] bg-green-300/20 rounded-full blur-[60px]"></div>

      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8 items-center">

        {/* Left Side: Team Pic + Welcome Message */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-2">
          <h1 className="text-xl md:text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">
            Hi, <span className="text-green-600">{userName || 'Administrator'}</span>
          </h1>
          <div className="space-y-0.5 md:space-y-1">
            <p className="text-[13px] md:text-lg text-slate-600 leading-tight">
              You have <Link to="/admin/work-allocation" className="font-bold text-green-600 hover:underline text-[14px] md:text-lg">{pendingReviews || 0}</Link> tasks pending to review today.
            </p>
            <p className="text-[11px] md:text-base text-slate-500 font-medium">
              Your team has already completed <span className="font-bold text-green-600">{completionRate || 0}%</span> of total tasks.
            </p>
            <div className="mt-2 md:mt-3">
              <p className="text-green-700 font-bold bg-green-200/60 inline-block px-3 py-0.5 md:px-4 md:py-1 rounded-full text-[10px] md:text-sm shadow-sm border border-green-300/30">
                Keep up the great work!
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Top Teams Earnings */}
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50 shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
              <FaCrown className="text-amber-400 drop-shadow-sm" />
              Top Teams - Live Monthly Earnings
            </h2>
            <span className="text-[10px] font-bold text-white bg-green-500/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Top 3 List
            </span>
          </div>

          <div className="space-y-2">
            {topTeams && topTeams.length > 0 ? (
              <>
                {topTeams.slice(0, 3).map((team, index) => (
                  <div key={index} className="flex items-center justify-between bg-white p-2 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'bg-yellow-100 text-yellow-600' :
                          index === 1 ? 'bg-slate-200 text-slate-600' :
                            'bg-green-100 text-green-600'
                        }`}>
                        {index === 0 ? <FaTrophy size={12} /> : index === 1 ? <FaMedal size={12} /> : index + 1}
                      </div>
                      <span className="font-bold text-slate-700 text-xs md:text-sm group-hover:text-green-600 transition-colors">
                        {team.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs md:text-sm font-extrabold text-amber-500">
                        ₹{team.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No earning data available</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default WelcomeBanner;
