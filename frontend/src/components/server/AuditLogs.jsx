import React, { useState, useEffect, useCallback } from 'react';
import { FiSearch, FiFilter, FiShield, FiUser, FiDatabase, FiZap, FiCheckCircle, FiXCircle, FiRefreshCw } from 'react-icons/fi';

const fetchAuditLogs = async (params = {}) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.get('/server/audit-logs', {
    headers: { Authorization: `Bearer ${token}` },
    params
  });
  return response.data;
};

const ACTION_COLORS = {
  account_created:        { bg: 'bg-teal-50',   text: 'text-teal-700',   icon: FiDatabase },
  account_deleted:        { bg: 'bg-rose-50',    text: 'text-rose-700',   icon: FiXCircle },
  sync_triggered:         { bg: 'bg-indigo-50',  text: 'text-indigo-700', icon: FiRefreshCw },
  recommendation_approved:{ bg: 'bg-emerald-50', text: 'text-emerald-700',icon: FiCheckCircle },
  recommendation_rejected:{ bg: 'bg-amber-50',   text: 'text-amber-700',  icon: FiXCircle },
  anomaly_resolved:       { bg: 'bg-sky-50',     text: 'text-sky-700',    icon: FiShield },
  ai_chat_used:           { bg: 'bg-purple-50',  text: 'text-purple-700', icon: FiZap },
};

const getActionConfig = (action) =>
  ACTION_COLORS[action] || { bg: 'bg-slate-50', text: 'text-slate-600', icon: FiShield };

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = { page, limit: 25 };
      if (search.trim()) params.action = search.trim();
      const result = await fetchAuditLogs(params);
      setLogs(result.logs || []);
      setPagination(result.pagination || {});
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Audit Logs</h1>
          <p className="text-slate-500 text-sm mt-1">
            Immutable compliance trail — every administrator action recorded with full context.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
          <FiShield className="text-amber-600" size={14} />
          <span className="font-semibold text-amber-700">SOC2 / ISO 27001 Compliant Audit Trail</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Records', value: pagination.total || 0, color: 'text-indigo-700' },
          { label: 'Account Events', value: logs.filter(l => l.action?.includes('account')).length, color: 'text-teal-700' },
          { label: 'Approvals', value: logs.filter(l => l.action?.includes('approved')).length, color: 'text-emerald-700' },
          { label: 'Rejections', value: logs.filter(l => l.action?.includes('rejected')).length, color: 'text-rose-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
            <p className={`text-2xl font-black font-mono ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-400 font-bold tracking-wide mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Log table */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Search bar */}
          <div className="px-5 py-4 border-b border-slate-100">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by action (e.g. account, approved)…"
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50 transition"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
              >
                Search
              </button>
            </form>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FiDatabase className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500">No audit log records found</p>
              <p className="text-[10px] text-slate-400 mt-1">Actions will appear here as administrators use the platform.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 tracking-wider">
                      <th className="px-5 py-3">Action</th>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Resource</th>
                      <th className="px-5 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-50">
                    {logs.map((log, idx) => {
                      const cfg = getActionConfig(log.action);
                      const IconComp = cfg.icon;
                      return (
                        <tr
                          key={log._id || idx}
                          onClick={() => setSelectedLog(log)}
                          className={`hover:bg-slate-50/70 cursor-pointer transition ${selectedLog?._id === log._id ? 'bg-indigo-50/40' : ''}`}
                        >
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
                              <IconComp size={10} />
                              {log.action?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-700 font-semibold">
                            {log.userId?.name || log.userId?.email || 'System'}
                          </td>
                          <td className="px-5 py-3 text-slate-500 max-w-[150px] truncate font-mono text-[10px]">
                            {log.targetId || '—'}
                          </td>
                          <td className="px-5 py-3 text-slate-400 text-[10px]">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-5 py-4 border-t border-slate-100 flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-semibold">
                  Page {pagination.page} of {pagination.pages} ({pagination.total} records)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-[10px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="px-3 py-1.5 text-[10px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm min-h-[300px]">
          {selectedLog ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {(() => {
                  const cfg = getActionConfig(selectedLog.action);
                  const IconComp = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
                      <IconComp size={10} />
                      {selectedLog.action?.replace(/_/g, ' ')}
                    </span>
                  );
                })()}
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Log ID', value: selectedLog._id },
                  { label: 'User', value: selectedLog.userId?.name || selectedLog.userId?.email || 'System' },
                  { label: 'Email', value: selectedLog.userId?.email || '—' },
                  { label: 'Resource ID', value: selectedLog.targetId || '—' },
                  { label: 'Target Type', value: selectedLog.targetType || '—' },
                  { label: 'IP Address', value: selectedLog.ipAddress || '—' },
                  { label: 'Timestamp', value: new Date(selectedLog.createdAt).toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1.5 border-b border-slate-50 gap-2">
                    <span className="text-slate-400 font-semibold flex-shrink-0">{label}</span>
                    <span className="font-mono text-slate-700 text-right break-all text-[10px]">{value}</span>
                  </div>
                ))}
                {(selectedLog.newState || selectedLog.previousState) && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-slate-400 tracking-wider mb-1.5">State Changes</p>
                    <pre className="bg-slate-50 p-3 rounded-lg text-[9px] font-mono text-slate-700 max-h-40 overflow-auto whitespace-pre-wrap border border-slate-100">
                      {JSON.stringify({ previous: selectedLog.previousState, next: selectedLog.newState }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <FiShield className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500">Select a log entry to inspect</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
