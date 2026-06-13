import React, { useState, useEffect } from 'react';
import { FiTrendingUp, FiCalendar, FiArrowUp, FiArrowDown, FiInfo } from 'react-icons/fi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, ComposedChart, Line
} from 'recharts';

const getForecasts = async () => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.get('/server/forecasts', { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
};

const getCostsTrend = async () => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.get('/server/costs/trend', { headers: { Authorization: `Bearer ${token}` }, params: { range: '90d' } });
  return response.data;
};

const Forecasting = () => {
  const [forecasts, setForecasts] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [f, t] = await Promise.all([getForecasts(), getCostsTrend()]);
      setForecasts(f);
      setTrendData(t);
    } catch (err) {
      console.error('Failed to load forecasting data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getForecast = (type) => forecasts.find(f => f.forecastType === type);
  const monthEnd = getForecast('month_end');
  const quarterly = getForecast('quarterly');
  const annual = getForecast('annual');

  // Extend trendData with projected points
  const buildProjectionData = () => {
    if (!trendData.length || !monthEnd) return trendData;
    const historical = trendData.map(d => ({ date: d.date, actual: d.total }));
    // Add forecast data points
    const today = new Date();
    const projections = [];
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dailyForecast = monthEnd.predictedSpend / 30;
      const low = monthEnd.confidenceLow / 30;
      const high = monthEnd.confidenceHigh / 30;
      projections.push({ date: dateStr, forecast: Number(dailyForecast.toFixed(2)), confidenceLow: Number(low.toFixed(2)), confidenceHigh: Number(high.toFixed(2)) });
    }
    return [...historical, ...projections];
  };

  const chartData = buildProjectionData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 font-sans">Spending Forecasts</h1>
        <p className="text-slate-500 text-sm mt-1">Linear regression projections over historical cost trends for month-end, quarterly, and annual horizons.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Month-End Forecast', data: monthEnd, color: 'indigo' },
          { label: 'Quarterly Forecast', data: quarterly, color: 'teal' },
          { label: 'Annual Forecast', data: annual, color: 'violet' },
        ].map(({ label, data, color }) => (
          <div key={label} className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FiCalendar className={`text-${color}-500`} size={16} />
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</h3>
            </div>
            {isLoading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
              </div>
            ) : data ? (
              <>
                <p className="text-2xl font-black text-slate-900 font-mono">${data.predictedSpend?.toLocaleString()}</p>
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                  <span>Low: ${data.confidenceLow?.toLocaleString()}</span>
                  <span>High: ${data.confidenceHigh?.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {data.predictedSpend > data.baselineSpend ? (
                    <FiArrowUp className="text-rose-500" size={12} />
                  ) : (
                    <FiArrowDown className="text-emerald-500" size={12} />
                  )}
                  <p className="text-[10px] text-slate-500 leading-relaxed">{data.trendAnalysis}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 py-4">No forecast available. Run a sync first.</p>
            )}
          </div>
        ))}
      </div>

      {/* Projection chart */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-bold text-slate-900">90-Day Historical + 30-Day Projected Trend</h2>
          <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-500 rounded inline-block" /> Actual</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-teal-400 rounded inline-block border-dashed" /> Forecast</span>
          </div>
        </div>
        {chartData.length > 0 ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px' }} />
                {/* Dividing line: today */}
                <ReferenceLine x={new Date().toISOString().split('T')[0]} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: 'Today', fill: '#94a3b8', fontSize: 9 }} />
                <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#actualGrad)" dot={false} />
                <Area type="monotone" dataKey="forecast" stroke="#0d9488" strokeWidth={2} strokeDasharray="4 2" fillOpacity={1} fill="url(#forecastGrad)" dot={false} />
                <Line type="monotone" dataKey="confidenceHigh" stroke="#0d9488" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
                <Line type="monotone" dataKey="confidenceLow" stroke="#0d9488" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex flex-col items-center justify-center text-slate-400">
            <FiInfo className="w-8 h-8 mb-2" />
            <p className="text-xs">No cost trend data. Trigger a sync to generate forecasts.</p>
          </div>
        )}
      </div>

      {/* Forecast table */}
      {forecasts.length > 0 && (
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Forecast Details</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Type</th>
                  <th className="pb-3 text-right">Predicted Spend</th>
                  <th className="pb-3 text-right">Baseline</th>
                  <th className="pb-3 text-right">Confidence Range</th>
                  <th className="pb-3">Trend</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-50">
                {forecasts.map(f => (
                  <tr key={f._id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 font-semibold text-slate-800 capitalize">{f.forecastType.replace('_', ' ')}</td>
                    <td className="py-3 text-right font-mono font-bold text-indigo-700">${f.predictedSpend?.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono text-slate-500">${f.baselineSpend?.toLocaleString()}</td>
                    <td className="py-3 text-right text-slate-500">${f.confidenceLow?.toLocaleString()} – ${f.confidenceHigh?.toLocaleString()}</td>
                    <td className="py-3 text-slate-500 max-w-xs truncate">{f.trendAnalysis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Forecasting;
