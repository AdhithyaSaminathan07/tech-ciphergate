import React, { useState, useEffect } from 'react';
import { FiRefreshCw, FiDatabase, FiCloud, FiServer, FiCheckCircle, FiAlertCircle, FiSettings, FiActivity, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getCostLakeStatus, triggerSync } from '../../services/serverService';

const CostLake = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchStatus = async () => {
    try {
      const data = await getCostLakeStatus();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching Cost Lake status:', error);
      showMsg(error.message || 'Failed to fetch Cost Lake infrastructure status', 'error');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchStatus();
      setLoading(false);
    };
    init();
  }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 6000);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    showMsg('Initiating AWS FinOps synchronization pipeline. Please wait, this connects to Athena and Glue simulation layers...', 'info');
    try {
      const res = await triggerSync();
      showMsg(res.message || 'Sync completed successfully! AWS billing records and resources are updated.');
      await fetchStatus();
    } catch (error) {
      showMsg(error.message || 'Failed to sync cloud costs. Ensure AWS accounts are connected and verified.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (statusName) => {
    const successStates = ['Configured', 'Active', 'Cataloged', 'Ready'];
    const pendingStates = ['Idle', 'Ready', 'Waiting', 'Pending'];
    const neutralStates = ['Not Configured'];

    if (successStates.includes(statusName)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
          <FiCheckCircle size={10} /> {statusName}
        </span>
      );
    } else if (pendingStates.includes(statusName)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
          <FiActivity size={10} /> {statusName}
        </span>
      );
    } else if (neutralStates.includes(statusName)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          <FiInfo size={10} /> {statusName}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
          <FiAlertCircle size={10} /> {statusName || 'Unconfigured'}
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <FiRefreshCw size={36} className="text-teal-600 animate-spin" />
        <p className="text-slate-500 font-medium text-sm">Loading Cost Lake infrastructure status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">S3 Cost Lake Explorer</h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor billing pipelines, AWS Organizations CUR delivery, Glue Schema catalogs, and Athena queries.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={syncing ? 'animate-spin' : ''} /> Refresh Status
        </button>
      </div>

      {/* Message Notifications */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl text-sm font-medium border flex items-start gap-3 ${ message.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-800' : message.type === 'info' ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-teal-50 border-teal-100 text-teal-800' }`}
          >
            {message.type === 'error' ? (
              <FiAlertCircle className="mt-0.5 shrink-0 text-rose-600" size={18} />
            ) : (
              <FiCheckCircle className="mt-0.5 shrink-0 text-teal-600" size={18} />
            )}
            <div className="flex-1">
              <p>{message.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Status Cards or Cost Lake Not Configured State */}
      {status?.sync?.totalRecords === 0 ? (
        <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-slate-100 shadow-sm max-w-4xl mx-auto space-y-6">
          <div className="text-center py-6 space-y-3">
            <FiDatabase className="w-12 h-12 text-rose-500 mx-auto animate-bounce" />
            <h2 className="text-xl font-bold text-slate-900">Cost Lake Not Configured</h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Your AWS Cost Lake is empty. Connect your AWS credentials and configure billing report delivery to begin.
            </p>
          </div>

          {status?.cur?.accountCount > 0 && (
            <div className="p-4 bg-teal-50/50 border border-teal-200/50 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-teal-900">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-teal-800">
                  <FiCheckCircle className="text-teal-600" />
                  <span>AWS Account Connected</span>
                </div>
                <p className="text-slate-500 mt-1">
                  Organizations: <span className="font-semibold text-slate-700">Not Configured (Optional)</span>
                </p>
              </div>
              <span className="px-2.5 py-1 bg-teal-600 text-white font-bold rounded-lg text-[10px]">
                Healthy Connection
              </span>
            </div>
          )}

          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 tracking-wider">
              {status?.cur?.accountCount > 0 ? "Next Steps to Complete Setup" : "Setup Instructions"}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {status?.cur?.accountCount > 0 ? (
                <>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">1</span>
                      <h4 className="text-xs font-bold text-slate-800">Configure CUR</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Enable Parquet-based Cost & Usage Reports in your AWS console.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">2</span>
                      <h4 className="text-xs font-bold text-slate-800">Configure S3 Cost Lake</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Set up the target S3 bucket for delivery of Parquet CUR logs.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">3</span>
                      <h4 className="text-xs font-bold text-slate-800">Configure Glue</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Create AWS Glue database catalog partitions to index the billing bucket logs.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">4</span>
                      <h4 className="text-xs font-bold text-slate-800">Configure Athena & Sync</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Query cost details via Athena and trigger manual billing data sync.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">1</span>
                      <h4 className="text-xs font-bold text-slate-800">Connect AWS Account</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Add and verify your AWS account using cross-account Role assumption.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">2</span>
                      <h4 className="text-xs font-bold text-slate-800">Setup CUR Delivery</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Configure AWS billing to deliver Parquet Cost & Usage Reports to your S3 bucket.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">3</span>
                      <h4 className="text-xs font-bold text-slate-800">Glue Catalog Database</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Run a crawler to catalog the Parquet tables as <code>cur_billing_catalog</code> database.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">4</span>
                      <h4 className="text-xs font-bold text-slate-800">Ingest Billing Data</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal pl-7">
                      Sync cost data to fetch the Athena records and build billing summaries.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-center gap-3">
            {status?.cur?.accountCount === 0 ? (
              <p className="text-xs font-semibold text-rose-500 text-center bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl">
                ⚠️ Connect an AWS Account first to begin configuring the Cost Lake.
              </p>
            ) : (
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 disabled:opacity-50"
              >
                {syncing ? 'Synchronizing AWS Data...' : 'Sync Cloud Billing Data Now'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CUR Configuration */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-full min-h-[140px] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                  <FiServer size={18} />
                </div>
                {getStatusBadge(status?.cur?.status)}
              </div>
              <div className="mt-4">
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">AWS CUR Configuration</h3>
                <p className="text-xs text-slate-600 mt-1 font-medium line-clamp-2">{status?.cur?.description}</p>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1.5 font-mono">Resource IDs: Enabled</span>
              </div>
            </div>

            {/* S3 Cost Lake Bucket */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-full min-h-[140px] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <FiCloud size={18} />
                </div>
                {getStatusBadge(status?.s3?.status)}
              </div>
              <div className="mt-4">
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">S3 Lake Storage</h3>
                <p className="text-xs text-slate-600 mt-1 font-medium truncate">{status?.s3?.bucket}</p>
                <span className="text-[10px] text-teal-600 font-bold block mt-1.5">
                  {(status?.s3?.totalRecords || 0).toLocaleString()} records stored
                </span>
              </div>
            </div>

            {/* Glue Catalog Database */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-full min-h-[140px] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <FiDatabase size={18} />
                </div>
                {getStatusBadge(status?.glue?.status)}
              </div>
              <div className="mt-4">
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">Glue Catalog Database</h3>
                <p className="text-xs text-slate-600 mt-1 font-medium truncate">{status?.glue?.database || 'Not Cataloged'}</p>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1.5 line-clamp-1">{status?.glue?.description}</span>
              </div>
            </div>

            {/* Athena Query Engine */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-full min-h-[140px] hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                  <FiSettings size={18} />
                </div>
                {getStatusBadge(status?.athena?.status)}
              </div>
              <div className="mt-4">
                <h3 className="text-slate-400 text-[10px] font-bold tracking-wider">Athena Query Engine</h3>
                <p className="text-xs text-slate-600 mt-1 font-medium truncate">WG: {status?.athena?.workgroup || 'Unconfigured'}</p>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1.5 line-clamp-1">{status?.athena?.description}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Sync Controls */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4">Pipeline Control Panel</h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-xs border-b border-slate-200/50 pb-2">
                    <span className="text-slate-400 font-medium">Last Sync Date:</span>
                    <span className="font-semibold text-slate-700">{status?.sync?.lastSyncFormatted || 'Never'}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-200/50 pb-2">
                    <span className="text-slate-400 font-medium">Cost History Records:</span>
                    <span className="font-semibold text-slate-700 font-mono">{(status?.s3?.costHistoryRecords || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-200/50 pb-2">
                    <span className="text-slate-400 font-medium">Resource Level Cost Records:</span>
                    <span className="font-semibold text-slate-700 font-mono">{(status?.s3?.resourceCostRecords || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-slate-500 font-bold">Total Imported Records:</span>
                    <span className="font-bold text-teal-600 font-mono">{(status?.sync?.totalRecords || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p>📌 Daily scheduler is configured to scan Cost Lake partitions hourly.</p>
                  <p>📌 Resource scraping runs automatically every 6 hours.</p>
                </div>

                <button
                  onClick={handleSyncNow}
                  disabled={syncing || status?.cur?.accountCount === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-sm shadow-teal-600/10 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiRefreshCw className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Synchronizing AWS Data...' : 'Sync Cloud Billing Data Now'}
                </button>
                
                {status?.cur?.accountCount === 0 && (
                  <p className="text-[10px] text-center text-rose-500 font-bold">
                    ⚠️ Connect and verify at least one AWS Account to enable synchronization.
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Architecture Info */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-2">AWS FinOps Pipeline Architecture</h2>
                <p className="text-slate-500 text-xs leading-relaxed mb-4">
                  CipherGate automates ingestion of AWS Cost & Usage Reports using S3, Glue, and Athena. 
                  The diagrams below represent the standard enterprise setup.
                </p>

                <div className="space-y-3.5">
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600 mt-0.5 shrink-0">
                      1
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">AWS Organizations</h4>
                      <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                        Connects Master and Linked AWS accounts. STS Roles are assumed by CipherGate.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600 mt-0.5 shrink-0">
                      2
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Cost & Usage Reports (CUR)</h4>
                      <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                        AWS automatically dumps detailed transaction logs containing Resource IDs into your encrypted S3 Cost Lake.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600 mt-0.5 shrink-0">
                      3
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">AWS Glue Catalog</h4>
                      <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                        Crawlers scan Parquet structures daily, partition the files dynamically, and update schema definitions.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600 mt-0.5 shrink-0">
                      4
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Athena FinOps Engine</h4>
                      <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                        CipherGate queries Glue Catalog databases directly using SQL to calculate billing summaries, right-sizing targets, and daily run rates.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-4 text-[10px] text-slate-400 flex items-center gap-2">
                <FiServer size={12} className="text-teal-600" />
                <span>Infrastructure deployment conforms to AWS Well-Architected FinOps principles.</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CostLake;


