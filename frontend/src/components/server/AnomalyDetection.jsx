import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiFilter, FiInfo, FiZap, FiActivity } from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const getAnomalies = async (params = {}) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.get('/server/anomalies', { headers: { Authorization: `Bearer ${token}` }, params });
  return response.data;
};

const resolveAnomaly = async (id, reason) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.post(`/server/anomalies/${id}/resolve`, { reason }, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
};

const getCostsTrend = async (range) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.get('/server/costs/trend', { headers: { Authorization: `Bearer ${token}` }, params: { range } });
  return response.data;
};

const SEVERITY_CONFIG = {
  Critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  High:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  Medium:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  Low:      { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-400' },
};

const AnomalyDetection = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [resolveReason, setResolveReason] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [resolving, setResolving] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = filterSeverity !== 'All' ? { severity: filterSeverity } : {};
      const [anom, trend] = await Promise.all([getAnomalies(params), getCostsTrend('30d')]);
      setAnomalies(anom);
      setTrendData(trend);
    } catch (err) {
      console.error('Failed to load anomaly data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterSeverity]);

  const handleResolve = async () => {
    if (!selectedAnomaly || !resolveReason.trim()) return;
    setResolving(true);
    try {
      await resolveAnomaly(selectedAnomaly._id, resolveReason);
      setAnomalies(prev => prev.map(a => a._id === selectedAnomaly._id ? { ...a, status: 'Resolved', reason: resolveReason } : a));
      setSelectedAnomaly(prev => ({ ...prev, status: 'Resolved', reason: resolveReason }));
      setResolveReason('');
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
    } finally {
      setResolving(false);
    }
  };

  const criticalCount = anomalies.filter(a => a.severity === 'Critical').length;
  const highCount = anomalies.filter(a => a.severity === 'High').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Anomaly Detection</h1>
          <p className="text-slate-500 text-sm mt-1">Cost spike detection comparing daily service spend against 7d, 30d, and 90d baselines.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Anomalies', value: anomalies.length, icon: FiActivity, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Critical', value: criticalCount, icon: FiAlertTriangle, color: 'text-rose-600 bg-rose-50' },
          { label: 'High', value: highCount, icon: FiZap, color: 'text-orange-600 bg-orange-50' },
          { label: 'Resolved', value: anomalies.filter(a => a.status === 'Resolved').length, icon: FiCheckCircle, color: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold tracking-wide">{label}</p>
              <p className="text-xl font-bold text-slate-900 font-mono">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Cost trend chart with spike indicators */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">30-Day Cost Trend with Spike Markers</h2>
          {trendData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="anomalyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px' }} />
                  {/* Mark active anomaly dates dynamically */}
                  {anomalies.filter(a => a.status === 'Active').map(anom => {
                    const dateStr = new Date(anom.date).toISOString().split('T')[0];
                    if (trendData.some(d => d.date === dateStr)) {
                      return (
                        <ReferenceLine
                          key={anom._id}
                          x={dateStr}
                          stroke="#ef4444"
                          strokeDasharray="4 2"
                          label={{ value: '⚡ Spike', fill: '#ef4444', fontSize: 10, position: 'top' }}
                        />
                      );
                    }
                    return null;
                  })}
                  <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#anomalyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-60 text-slate-400">
              <FiInfo className="w-8 h-8 mb-2" />
              <p className="text-xs">Trigger a sync to generate cost trend data.</p>
            </div>
          )}
        </div>

        {/* Selected anomaly detail panel */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm min-h-[320px]">
          {selectedAnomaly ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${SEVERITY_CONFIG[selectedAnomaly.severity]?.bg} ${SEVERITY_CONFIG[selectedAnomaly.severity]?.text}`}>
                  {selectedAnomaly.severity}
                </span>
                <span className="text-xs text-slate-500 font-semibold">{new Date(selectedAnomaly.date).toLocaleDateString()}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{selectedAnomaly.service}</h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 font-semibold">Detected Cost</span>
                  <span className="font-bold text-rose-600 font-mono">${selectedAnomaly.detectedCost?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 font-semibold">Baseline Cost (30d avg)</span>
                  <span className="font-bold text-slate-700 font-mono">${selectedAnomaly.baselineCost?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 font-semibold">Spike Percentage</span>
                  <span className="font-bold text-rose-600">+{selectedAnomaly.increasePercentage}%</span>
                </div>
                {selectedAnomaly.cloudWatchCorrelation?.metricName && (
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 space-y-1">
                    <p className="text-[10px] font-bold text-indigo-700 tracking-wide">CloudWatch Correlation</p>
                    <p className="text-indigo-800 text-xs font-semibold">{selectedAnomaly.cloudWatchCorrelation.metricName}</p>
                    <p className="text-indigo-600 text-xs">{selectedAnomaly.cloudWatchCorrelation.description}</p>
                  </div>
                )}
              </div>

              {selectedAnomaly.status === 'Active' && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 tracking-wide">Resolve Anomaly</p>
                  <textarea
                    value={resolveReason}
                    onChange={e => setResolveReason(e.target.value)}
                    placeholder="Enter root cause or resolution notes..."
                    className="w-full h-16 p-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                  />
                  <button
                    onClick={handleResolve}
                    disabled={resolving || !resolveReason.trim()}
                    className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                  >
                    {resolving ? 'Resolving...' : 'Mark as Resolved'}
                  </button>
                </div>
              )}
              {selectedAnomaly.status === 'Resolved' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <p className="text-[10px] font-bold text-emerald-700 mb-1">✓ Resolved</p>
                  <p className="text-xs text-emerald-600">{selectedAnomaly.reason}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <FiAlertTriangle className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500">Select an anomaly to inspect details</p>
            </div>
          )}
        </div>
      </div>

      {/* Anomaly log table */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">Anomaly Log ({anomalies.length})</h2>
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
          </div>
        ) : anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FiCheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
            <p className="text-xs font-bold text-slate-600">No anomalies detected</p>
            <p className="text-slate-400 text-[10px] mt-1">All services are running within baseline cost thresholds.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider">
                  <th className="pb-3">Severity</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3 text-right">Detected</th>
                  <th className="pb-3 text-right">Baseline</th>
                  <th className="pb-3 text-right">Spike</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs text-slate-700 divide-y divide-slate-50">
                {anomalies.map((a, idx) => {
                  const cfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.Low;
                  return (
                    <tr
                      key={a._id || idx}
                      onClick={() => setSelectedAnomaly(a)}
                      className={`hover:bg-slate-50/70 cursor-pointer transition ${selectedAnomaly?._id === a._id ? 'bg-indigo-50/40' : ''}`}
                    >
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${cfg.bg} ${cfg.text}`}>{a.severity}</span>
                      </td>
                      <td className="py-3 font-semibold text-slate-800">{a.service}</td>
                      <td className="py-3 text-slate-500">{new Date(a.date).toLocaleDateString()}</td>
                      <td className="py-3 text-right font-mono font-semibold text-rose-600">${a.detectedCost?.toFixed(2)}</td>
                      <td className="py-3 text-right font-mono text-slate-500">${a.baselineCost?.toFixed(2)}</td>
                      <td className="py-3 text-right font-bold text-rose-600">+{a.increasePercentage}%</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${a.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnomalyDetection;
