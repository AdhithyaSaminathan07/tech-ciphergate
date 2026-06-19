import React, { useState, useEffect } from 'react';
import { FiCloud, FiServer, FiDatabase, FiSettings, FiCheckCircle, FiAlertCircle, FiClock, FiLayers, FiRefreshCw } from 'react-icons/fi';
import { getAccounts, getCostLakeStatus } from '../../services/serverService';

const TechnicalDashboard = () => {
  const [accounts, setAccounts] = useState([]);
  const [lakeStatus, setLakeStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadDashboardData = async () => {
    try {
      const [accountsData, statusData] = await Promise.all([
        getAccounts(),
        getCostLakeStatus()
      ]);
      setAccounts(accountsData);
      setLakeStatus(statusData);
      setError(null);
    } catch (err) {
      console.error('Error loading technical dashboard:', err);
      setError(err.message || 'Failed to load telemetry dashboard data.');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadDashboardData();
      setLoading(false);
    };
    init();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getStatusBadge = (statusVal) => {
    const activeStates = ['Connected', 'Configured', 'Active', 'Cataloged', 'Ready'];
    const pendingStates = ['Pending', 'Idle', 'Ready', 'Waiting'];

    if (activeStates.includes(statusVal)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
          <FiCheckCircle size={10} /> {statusVal}
        </span>
      );
    } else if (pendingStates.includes(statusVal)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
          <FiClock size={10} /> {statusVal}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
          <FiAlertCircle size={10} /> {statusVal || 'Failed'}
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <FiRefreshCw size={36} className="text-teal-600 animate-spin" />
        <p className="text-slate-500 font-medium text-sm">Loading technical telemetry dashboard...</p>
      </div>
    );
  }

  const connectedCount = accounts.filter(a => a.connectionStatus === 'Connected').length;
  const pendingCount = accounts.filter(a => a.connectionStatus === 'Pending').length;
  const failedCount = accounts.filter(a => a.connectionStatus === 'Failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Technical Telemetry Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time pipeline metrics, credential trust statuses, S3 ingestion logs, and Athena connectivity.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-sm font-medium flex items-center gap-3">
          <FiAlertCircle className="text-rose-600" size={18} />
          <p>{error}</p>
        </div>
      )}

      {/* Conditional Dashboard Body */}
      {!(accounts.length > 0 && lakeStatus && lakeStatus.sync?.totalRecords > 0) ? (
        <div className="p-12 text-center bg-white/80 border border-slate-100 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 max-w-2xl mx-auto mt-8">
          <FiServer className="w-12 h-12 text-slate-300 animate-pulse" />
          <h2 className="text-base font-bold text-slate-800">No AWS Telemetry Data</h2>
          <p className="text-slate-500 text-xs max-w-md">
            The technical telemetry dashboard requires at least one connected AWS account with Cost Lake synchronization completed to render resource metrics.
          </p>
          <a
            href="#/server/accounts"
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95"
          >
            Configure AWS Connection
          </a>
        </div>
      ) : (
        <>
          {/* KPI Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Connected Accounts */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                <FiCloud size={20} />
              </div>
              <div>
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">AWS Org Accounts</h3>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{accounts.length}</p>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {connectedCount} Connected · {pendingCount + failedCount} Inactive
                </span>
              </div>
            </div>

            {/* Data Lake Ingestion Volume */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <FiLayers size={20} />
              </div>
              <div>
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">Total Ingested Rows</h3>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {(lakeStatus?.sync?.totalRecords || 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-400 font-semibold">
                  Across Cost Lake Parquet tables
                </span>
              </div>
            </div>

            {/* Catalog Schema Database */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <FiDatabase size={20} />
              </div>
              <div>
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">Glue Schema State</h3>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {lakeStatus?.glue?.status === 'Cataloged' ? 'Cataloged' : 'Unconfigured'}
                </p>
                <span className="text-[10px] text-slate-400 font-semibold">
                  DB: {lakeStatus?.glue?.database || 'None'}
                </span>
              </div>
            </div>

            {/* Pipeline Last Sync */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <FiServer size={20} />
              </div>
              <div>
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">Sync Connection</h3>
                <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                  {lakeStatus?.sync?.lastSyncFormatted || 'Never'}
                </p>
                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                  Status: {lakeStatus?.cur?.status || 'Offline'}
                </span>
              </div>
            </div>

          </div>

          {/* Main Breakdown Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Accounts Connection Health */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">AWS Account Trust & Telemetry</h2>
                  <p className="text-slate-400 text-xs mt-0.5 font-medium">Verify STS Trust role configurations and sync logs.</p>
                </div>
              </div>

              {accounts.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  No AWS Accounts connected. Go to AWS Accounts to add one.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider">
                        <th className="pb-3">Account Name</th>
                        <th className="pb-3">AWS Account ID</th>
                        <th className="pb-3">Connection</th>
                        <th className="pb-3">Monitored Regions</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-50">
                      {accounts.map((acc) => (
                        <tr key={acc._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 font-semibold text-slate-900">{acc.name}</td>
                          <td className="py-3 font-mono text-slate-600">{acc.awsAccountId}</td>
                          <td className="py-3">{getStatusBadge(acc.connectionStatus)}</td>
                          <td className="py-3 text-slate-500 font-mono text-[10px]">
                            {acc.regions && acc.regions.length > 0 ? acc.regions.join(', ') : 'None'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Column: Infrastructure Pipeline Details */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Athena & Ingestion Infrastructure</h2>
                <p className="text-slate-400 text-xs mt-0.5 font-medium">Telemetry stats of Glue databases, workgroups, and queries.</p>
              </div>

              <div className="space-y-4">
                
                {/* S3 Ingest detail */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                  <FiCloud className="text-teal-600 mt-0.5 shrink-0" size={16} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">S3 Storage Lake Location</h4>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[280px]">
                      s3://{lakeStatus?.s3?.bucket || 'cg-finops-cost-lake'}
                    </p>
                    <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                      <span>Cost History: {lakeStatus?.s3?.costHistoryRecords || 0} rows</span>
                      <span>·</span>
                      <span>Resource Costs: {lakeStatus?.s3?.resourceCostRecords || 0} rows</span>
                    </div>
                  </div>
                </div>

                {/* Glue Catalog detail */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                  <FiDatabase className="text-indigo-600 mt-0.5 shrink-0" size={16} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Glue Crawler Telemetry</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Database: <strong className="text-slate-700 font-semibold">{lakeStatus?.glue?.database || 'None'}</strong>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{lakeStatus?.glue?.description}</p>
                  </div>
                </div>

                {/* Athena workgroup detail */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                  <FiSettings className="text-purple-600 mt-0.5 shrink-0" size={16} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Athena Engine Workgroup</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Workgroup: <strong className="text-slate-700 font-semibold">{lakeStatus?.athena?.workgroup || 'None'}</strong>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{lakeStatus?.athena?.description}</p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default TechnicalDashboard;

