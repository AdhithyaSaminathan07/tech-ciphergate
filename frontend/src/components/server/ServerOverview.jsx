import React, { useState, useEffect, useRef } from 'react';
import {
  FiDollarSign, FiTrendingUp, FiShield, FiAlertTriangle,
  FiCheckCircle, FiActivity, FiZap, FiArrowUp, FiArrowDown,
  FiLayers, FiCpu, FiDatabase, FiCloud, FiServer, FiSend,
  FiUser, FiRefreshCw, FiInfo, FiSliders, FiClock
} from 'react-icons/fi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const fetchSummary = async () => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();

  const [summary, trend, anomalies, forecasts, tagCompliance, recommendations, topResources] = await Promise.all([
    api.get('/server/costs/summary', { headers: { Authorization: `Bearer ${token}` } }),
    api.get('/server/costs/trend', { headers: { Authorization: `Bearer ${token}` }, params: { range: '30d' } }),
    api.get('/server/anomalies', { headers: { Authorization: `Bearer ${token}` } }),
    api.get('/server/forecasts', { headers: { Authorization: `Bearer ${token}` } }),
    api.get('/server/costs/tag-compliance', { headers: { Authorization: `Bearer ${token}` } }),
    api.get('/server/recommendations', { headers: { Authorization: `Bearer ${token}` }, params: { status: 'Active' } }),
    api.get('/server/costs/top-resources', { headers: { Authorization: `Bearer ${token}` } }),
  ]);

  return {
    summary: summary.data,
    trend: trend.data,
    anomalies: anomalies.data,
    forecasts: forecasts.data,
    tagCompliance: tagCompliance.data,
    recommendations: recommendations.data,
    topResources: topResources.data,
  };
};

const triggerSync = async () => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.post('/server/sync', {}, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
};

const resolveAnomaly = async (id, reason) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.post(`/server/anomalies/${id}/resolve`, { reason }, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
};

const chatWithAgent = async (message, history) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.post('/server/chat', { message, conversationHistory: history }, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
};

// Colors for Service Donut Chart
const COLORS = ['#0d9488', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#64748b'];

const KPICard = ({ icon: Icon, label, value, sub, color, trend: trendDir }) => (
  <div className="bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${color}`}>
      <Icon size={20} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-0.5">
        <p className="text-xl font-black text-slate-800 font-mono truncate">{value}</p>
        {trendDir !== undefined && (
          <span className={`text-[10px] font-extrabold flex items-center gap-0.5 ${trendDir > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {trendDir > 0 ? <FiArrowUp size={10} /> : <FiArrowDown size={10} />}
            {Math.abs(trendDir)}%
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

// Simple markdown renderer for chat
const renderMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-slate-800 mt-2 mb-1 text-xs">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-slate-900 mt-3 mb-1 text-sm">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-slate-600 text-[11px]">$1</li>')
    .replace(/\n\n/g, '<br/>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">$1</code>');
};

const ServerOverview = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Anomaly states
  const [resolvingAnomalyId, setResolvingAnomalyId] = useState(null);
  const [anomalyReason, setAnomalyReason] = useState('');

  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: `👋 **Hello! I'm your AI FinOps Advisor.** Ask me anything about cloud spend, recommendations, or anomalies!`
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  const loadDashboard = async () => {
    try {
      const result = await fetchSummary();
      setData(result);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-semibold">Gathering FinOps analytics database records...</p>
        </div>
      </div>
    );
  }

  const { summary, trend, anomalies, forecasts, tagCompliance, recommendations, topResources } = data || {};
  const monthEndForecast = forecasts?.find(f => f.forecastType === 'month_end');
  const totalSavings = recommendations?.reduce((s, r) => s + (r.monthlySavings || 0), 0) || 0;
  const activeAnomalies = anomalies?.filter(a => a.status === 'Active') || [];
  const criticalAnomaliesCount = activeAnomalies.filter(a => a.severity === 'Critical' || a.severity === 'High').length;

  // Calculate Service Donut breakdown from trend records
  const serviceTotals = {};
  trend?.forEach(day => {
    Object.keys(day).forEach(key => {
      if (key !== 'date' && key !== 'total') {
        serviceTotals[key] = (serviceTotals[key] || 0) + day[key];
      }
    });
  });
  const pieData = Object.entries(serviceTotals).map(([name, value]) => ({
    name: name.replace('Amazon', ''),
    value: Number(value.toFixed(2))
  })).sort((a, b) => b.value - a.value);

  // Sync handler
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncMessage('Starting simulator cost sync pipeline...');
    try {
      const res = await triggerSync();
      setSyncMessage(res.message || 'Sync completed successfully!');
      await loadDashboard();
      setTimeout(() => setSyncMessage(''), 4000);
    } catch (err) {
      setSyncMessage(`Error: ${err.message}`);
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Anomaly Resolution handler
  const handleResolveAnomaly = async (id) => {
    if (!anomalyReason.trim()) return;
    try {
      await resolveAnomaly(id, anomalyReason);
      setAnomalyReason('');
      setResolvingAnomalyId(null);
      await loadDashboard();
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
    }
  };

  // AI Chat handler
  const handleSendChatMessage = async (e) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || isChatLoading) return;

    setChatInput('');
    const userMsg = { role: 'user', content: text };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    try {
      const history = updatedMessages
        .slice(-8)
        .map(m => ({ role: m.role, content: m.content }));
      
      const res = await chatWithAgent(text, history);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: res.response,
        toolCalls: res.toolCalls || []
      }]);
    } catch (err) {
      const errorMsg = err.message || 'Failed to communicate with agent.';
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ **Error**: ${errorMsg}. Please ensure Claude keys are verified in system configurations.`
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const getServiceIcon = (type) => {
    const cleanType = type.toLowerCase();
    if (cleanType.includes('ec2')) return <FiCpu className="text-teal-600" />;
    if (cleanType.includes('rds')) return <FiDatabase className="text-blue-600" />;
    if (cleanType.includes('s3')) return <FiCloud className="text-indigo-600" />;
    if (cleanType.includes('lambda')) return <FiActivity className="text-pink-600" />;
    return <FiServer className="text-slate-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Cockpit Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/40 p-4 rounded-3xl border border-slate-100 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">FinOps Executive Control Cockpit</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Continuous cost allocation analytics, baseline variance anomaly checks, and active optimization recommendation boards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {syncMessage && (
            <span className="text-[10px] bg-indigo-50 border border-indigo-100 font-bold px-3 py-1.5 rounded-xl text-indigo-700 animate-pulse">
              {syncMessage}
            </span>
          )}
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all disabled:opacity-50 active:scale-95"
          >
            <FiRefreshCw className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing Cloud Lake...' : 'Sync Cost Lake'}
          </button>
        </div>
      </div>

      {/* Critical Anomaly Flash Banner */}
      {criticalAnomaliesCount > 0 && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-4 text-rose-800 shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="text-rose-600 shrink-0" size={20} />
            <div>
              <p className="font-bold text-sm">{criticalAnomaliesCount} Critical/High Severity Cost Spikes Active</p>
              <p className="text-[11px] text-rose-600/90 font-medium">Unusual cloud spend patterns detected matching RDS/EC2 anomalies. Resolving actions required.</p>
            </div>
          </div>
        </div>
      )}

      {/* Conditional Dashboard Body */}
      {!(summary && (summary.mtdSpend > 0 || summary.runRate > 0 || (trend && trend.length > 0))) ? (
        <div className="p-12 text-center bg-white/80 border border-slate-100 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 max-w-2xl mx-auto mt-8">
          <FiAlertTriangle className="w-12 h-12 text-amber-500 animate-pulse" />
          <h2 className="text-base font-bold text-slate-800">Connect AWS and configure Cost Lake to view analytics.</h2>
          <p className="text-slate-500 text-xs max-w-md">
            No real AWS cost telemetry detected. Please connect an AWS account and execute the initial Cost Lake sync to build billing pipelines.
          </p>
          <a
            href="#/server/accounts"
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95"
          >
            Configure AWS Credentials
          </a>
        </div>
      ) : (
        <>
          {/* Critical Anomaly Flash Banner */}
          {criticalAnomaliesCount > 0 && (
            <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-4 text-rose-800 shadow-sm animate-pulse">
              <div className="flex items-center gap-3">
                <FiAlertTriangle className="text-rose-600 shrink-0" size={20} />
                <div>
                  <p className="font-bold text-sm">{criticalAnomaliesCount} Critical/High Severity Cost Spikes Active</p>
                  <p className="text-[11px] text-rose-600/90 font-medium">Unusual cloud spend patterns detected matching RDS/EC2 anomalies. Resolving actions required.</p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={FiDollarSign}
              label="Month-to-Date Spend"
              value={`$${(summary?.mtdSpend || 0).toLocaleString()}`}
              sub={`Last Month: $${(summary?.lastMonthSpend || 0).toLocaleString()}`}
              color="bg-teal-50 text-teal-600 border border-teal-100/50"
              trend={summary?.momPercentage}
            />
            <KPICard
              icon={FiTrendingUp}
              label="Month-End Forecast"
              value={monthEndForecast ? `$${monthEndForecast.predictedSpend?.toLocaleString()}` : 'N/A'}
              sub={monthEndForecast ? `Range: $${monthEndForecast.confidenceLow?.toLocaleString()} - $${monthEndForecast.confidenceHigh?.toLocaleString()}` : 'Waiting on sync'}
              color="bg-indigo-50 text-indigo-600 border border-indigo-100/50"
            />
            <KPICard
              icon={FiShield}
              label="Savings Opportunities"
              value={`$${totalSavings.toLocaleString()}/mo`}
              sub={`${recommendations?.length || 0} active optimizations`}
              color="bg-emerald-50 text-emerald-600 border border-emerald-100/50"
            />
            <KPICard
              icon={activeAnomalies.length > 0 ? FiAlertTriangle : FiCheckCircle}
              label="Active Anomalies"
              value={activeAnomalies.length}
              sub={criticalAnomaliesCount > 0 ? `${criticalAnomaliesCount} critical/high warnings` : 'All operations within threshold'}
              color={activeAnomalies.length > 0 ? 'bg-rose-50 text-rose-600 border border-rose-100/50' : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'}
            />
          </div>

          {/* Spending Analytics & Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cost trends area chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">30-Day Cost Baseline Trend</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Aggregated daily spend vs standard daily variance</p>
                </div>
              </div>
              {trend?.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="dashboardAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} />
                      <Area type="monotone" dataKey="total" stroke="#0d9488" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardAreaGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  No trend records cataloged. Sync the Cost Lake.
                </div>
              )}
            </div>

            {/* Cost by service donut chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Cost by AWS Service</h3>
                <p className="text-[11px] text-slate-400 font-medium">Month-to-date cost share distribution</p>
              </div>
              {pieData.length > 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => `$${val.toLocaleString()}`} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full grid grid-cols-2 gap-2 mt-2">
                    {pieData.map((d, index) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                        <span className="font-semibold truncate">{d.name}:</span>
                        <span className="font-bold font-mono text-slate-800 ml-auto">${d.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  No service records found.
                </div>
              )}
            </div>
          </div>

          {/* Top 20 Resources & AI Chat Board */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 20 Resources Board */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between min-h-[480px]">
              <div>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Top Cost Driving Resources</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Most expensive active cloud assets over last 30 days</p>
                  </div>
                  <span className="text-[9px] bg-teal-50 text-teal-700 border border-teal-100/50 font-extrabold px-2 py-0.5 rounded uppercase">
                    Last 30 Days
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[360px] custom-main-scroll pr-1 mt-2">
                {!topResources || topResources.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16">
                    <FiLayers className="w-8 h-8 mb-2" />
                    <p>No expensive resource records found. Run sync.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10">
                        <th className="pb-2">Resource</th>
                        <th className="pb-2">Service</th>
                        <th className="pb-2">Region</th>
                        <th className="pb-2 text-right">30d Cost</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-slate-700 divide-y divide-slate-50">
                      {topResources.map((res, idx) => (
                        <tr key={res.resourceId || idx} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-2.5 max-w-[240px] truncate">
                            <div className="flex flex-col truncate">
                              <span className="font-semibold text-slate-800 truncate">{res.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono truncate">{res.resourceId}</span>
                            </div>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                              {getServiceIcon(res.service)}
                              <span>{res.service.replace('Amazon', '')}</span>
                            </div>
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-slate-500">{res.region}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-slate-900">${res.totalCost?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Integrated Natural Language Chat UI */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[480px]">
              <div>
                <h3 className="text-sm font-bold text-slate-800">AI FinOps Assistant</h3>
                <p className="text-[11px] text-slate-400 font-medium">Natural language cloud cost query engine</p>
              </div>

              {/* Message Area */}
              <div className="flex-1 overflow-y-auto max-h-[300px] my-3 pr-1 space-y-3 custom-main-scroll">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white ${msg.role === 'user' ? 'bg-slate-800' : 'bg-gradient-to-br from-teal-500 to-indigo-600'}`}>
                      {msg.role === 'user' ? <FiUser size={12} /> : <FiCpu size={12} />}
                    </div>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-none' : 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-none'}`}>
                      {msg.role === 'user' ? (
                        <p>{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm max-w-none text-[11px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-teal-500 to-indigo-600 text-white">
                      <FiCpu className="animate-pulse" size={12} />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl rounded-tl-none px-3 py-2 text-[10px] text-slate-400 font-semibold animate-pulse">
                      Querying database via MCP dispatcher...
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Quick inputs */}
              {chatMessages.length === 1 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {['Show MTD spend', 'RDS cost spike details', 'Savings opportunities'].map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        setChatInput(p);
                      }}
                      className="text-[9px] bg-slate-50 border border-slate-200 text-slate-500 px-2 py-1 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Input bar */}
              <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Why did RDS spend spike?"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="w-8 h-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shrink-0 disabled:opacity-50 transition active:scale-95"
                >
                  <FiSend size={12} />
                </button>
              </form>
            </div>
          </div>

          {/* Anomaly Alert Board & Compliance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Anomaly Alert Board */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between min-h-[380px]">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Anomaly Alert Board</h3>
                <p className="text-[11px] text-slate-400 font-medium">Verify detected cost spikes against historical 30d baselines</p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[280px] pr-1 mt-2 custom-main-scroll">
                {anomalies?.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16">
                    <FiCheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                    <p>All cloud services running within normal variance.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomalies.map((anom) => (
                      <div key={anom._id} className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 flex flex-col gap-2.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              anom.severity === 'Critical' ? 'bg-rose-100 text-rose-700' :
                              anom.severity === 'High' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {anom.severity}
                            </span>
                            <h4 className="text-xs font-bold text-slate-800 mt-1">{anom.service}</h4>
                            <p className="text-[9px] text-slate-400 font-medium">Detected: {new Date(anom.date).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono font-black text-rose-600">+${(anom.detectedCost - anom.baselineCost).toFixed(2)}/day</p>
                            <p className="text-[9px] text-slate-400 font-medium">Spike: +{anom.increasePercentage}%</p>
                          </div>
                        </div>

                        {anom.status === 'Active' ? (
                          <div className="pt-2 border-t border-slate-200/50 flex flex-col gap-2">
                            {resolvingAnomalyId === anom._id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={anomalyReason}
                                  onChange={e => setAnomalyReason(e.target.value)}
                                  placeholder="Describe resolution action or root cause..."
                                  className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white focus:outline-none resize-none h-12"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => setResolvingAnomalyId(null)}
                                    className="px-2.5 py-1 text-[10px] font-bold text-slate-500 rounded-lg hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleResolveAnomaly(anom._id)}
                                    disabled={!anomalyReason.trim()}
                                    className="px-3 py-1 text-[10px] font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
                                  >
                                    Save Resolution
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setResolvingAnomalyId(anom._id)}
                                className="w-full py-1.5 bg-slate-200/50 hover:bg-slate-200/80 text-slate-800 text-[10px] font-bold rounded-xl transition"
                              >
                                Explain & Resolve Cost Spike
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] text-emerald-800 font-medium">
                            <strong>✓ Resolved:</strong> {anom.reason || 'Variance reviewed and accepted.'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tag Compliance Coverage Summary */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between min-h-[380px]">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Metadata Tag Compliance</h3>
                <p className="text-[11px] text-slate-400 font-medium">Required billing allocation keys metadata coverage score</p>
              </div>

              <div className="flex-1 flex flex-col justify-center space-y-4">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full border-4 border-slate-100 flex items-center justify-center relative">
                    <span className={`text-sm font-black ${(tagCompliance?.overallScore || 0) >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {tagCompliance?.overallScore || 0}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700">Billing Coverage Rating</p>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          (tagCompliance?.overallScore || 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${tagCompliance?.overallScore || 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{tagCompliance?.nonCompliantCount || 0} resources missing essential billing tags</p>
                  </div>
                </div>

                {/* Tag breakdown */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2">
                  {tagCompliance?.tags && Object.entries(tagCompliance.tags).map(([tag, score]) => (
                    <div key={tag} className="p-2 rounded-xl bg-slate-50 border border-slate-100/50">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{tag}</p>
                      <p className="text-xs font-mono font-black text-slate-800 mt-0.5">{score}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ServerOverview;
