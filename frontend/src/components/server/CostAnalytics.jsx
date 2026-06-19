import React, { useState, useEffect } from 'react';
import { getCostsSummary, getCostsTrend } from '../../services/serverService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiTrendingUp, FiActivity, FiDollarSign, FiInfo } from 'react-icons/fi';

const CostAnalytics = () => {
  const [summary, setSummary] = useState({ mtdSpend: 0, runRate: 0, lastMonthSpend: 0, momPercentage: 0, savingsOpportunities: 0 });
  const [trendData, setTrendData] = useState([]);
  const [range, setRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(true);

  const fetchCostAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const sum = await getCostsSummary();
      setSummary(sum);
      const trend = await getCostsTrend(range);
      setTrendData(trend);
    } catch (error) {
      console.error('Failed to load cost analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCostAnalyticsData();
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Cost Explorer</h1>
          <p className="text-slate-500 text-sm mt-1">Deep analytics querying historical cost trends and computing average daily runs.</p>
        </div>

        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* KPI summaries row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* MTD Spend Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <FiDollarSign size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Month-to-Date Spend</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-xl font-bold text-slate-900">${(summary.mtdSpend || 0).toLocaleString()}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ summary.momPercentage > 0 ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800' }`}>
                {summary.momPercentage > 0 ? '+' : ''}{summary.momPercentage}% MoM
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">Previous Month: ${(summary.lastMonthSpend || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Projected Cost Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <FiTrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Projected Run Rate</h3>
            <p className="text-xl font-bold text-slate-900 mt-1">${(summary.runRate || 0).toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 font-semibold">30-day forecast billing projection</span>
          </div>
        </div>

        {/* Saved Opportunities Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <FiActivity size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Identified Savings Target</h3>
            <p className="text-xl font-bold text-slate-900 mt-1">${(summary.savingsOpportunities || 0).toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 font-semibold">Potential monthly savings available</span>
          </div>
        </div>

      </div>

      {/* Stacked Cost Area Chart */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
        <h2 className="text-base font-bold text-slate-900 mb-6">Service Spending Trends</h2>

        {isLoading ? (
          <div className="flex justify-center items-center h-72">
            <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
          </div>
        ) : trendData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 text-center">
            <FiInfo className="w-10 h-10 text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-sm">No historical trends available</h3>
            <p className="text-slate-400 text-xs mt-1">Synchronization records will chart time-series graphs once accounts sync.</p>
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorEC2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRDS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '600' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="AmazonEC2" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorEC2)" />
                <Area type="monotone" dataKey="AmazonRDS" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRDS)" />
                <Area type="monotone" dataKey="AmazonS3" stroke="#6366f1" strokeWidth={2} fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CostAnalytics;
