import React, { useState } from 'react';
import { triggerSync } from '../../services/serverService';
import { FiSliders, FiClock, FiCloud, FiAlertCircle, FiCheck } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const Settings = () => {
  const [anomalyThreshold, setAnomalyThreshold] = useState(30);
  const [syncSchedule, setSyncSchedule] = useState('daily');
  const [bucketName, setBucketName] = useState('ciphergate-cost-lake-prod');
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await triggerSync();
      if (res.success) {
        showMsg('Synchronized billing database! Historical cost metrics are loaded.');
      }
    } catch (error) {
      showMsg(error.message || 'Synchronization failed. Ensure accounts are connected first.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    showMsg('Configuration settings saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 font-sans">Server Module Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure AWS sync parameters, billing targets, and anomaly alert thresholds.</p>
      </div>

      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-xl border text-sm flex items-center justify-between shadow-sm ${ message.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800' }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage({ text: '', type: '' })} className="font-bold ml-4 hover:opacity-75">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Side: Parameters forms */}
        <div className="xl:col-span-2">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
              <FiSliders className="text-teal-600" />
              <span>FinOps Parameter Configuration</span>
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Anomaly threshold slider */}
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider mb-2">
                  Anomaly Cost Spike Threshold: {anomalyThreshold}%
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={10}
                    value={anomalyThreshold}
                    onChange={(e) => setAnomalyThreshold(e.target.value)}
                    className="flex-1 accent-teal-600 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-teal-600 font-mono w-12 text-right">{anomalyThreshold}%</span>
                </div>
                <span className="block text-[10px] text-slate-400 mt-1">Alert is triggered when daily cost increases beyond this percentage compared to baseline metrics.</span>
              </div>

              {/* Bucket configuration input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider mb-2">S3 Cost Lake Bucket Path</label>
                <input
                  type="text"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all font-mono"
                  required
                />
                <span className="block text-[10px] text-slate-400 mt-1">Athena Glue schema will scan files contained in this folder path.</span>
              </div>

              {/* Sync scheduler choice */}
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider mb-3">Billing Schedulers Interval</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {['6h', '12h', 'daily'].map((option) => (
                    <label 
                      key={option}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between cursor-pointer transition ${ syncSchedule === option ? 'border-teal-500/40 bg-teal-50/20 ring-1 ring-teal-500/10' : 'border-slate-200 bg-slate-50/25 hover:bg-slate-50' }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-xs font-bold text-slate-900 capitalize">
                          {option === '6h' ? 'Every 6 Hours' : option === '12h' ? 'Every 12 Hours' : 'Daily Rollup'}
                        </span>
                        <input
                          type="radio"
                          name="syncSchedule"
                          value={option}
                          checked={syncSchedule === option}
                          onChange={(e) => setSyncSchedule(e.target.value)}
                          className="accent-teal-600 w-3.5 h-3.5"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                        {option === '6h' ? 'Ideal for heavy auto-scaling resource groups.' : option === '12h' ? 'Balance between AWS request limits and runrate updates.' : 'Standard recommended billing cycle.'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center gap-2"
                >
                  <FiCheck />
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Manual Sync trigger panel */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FiClock className="text-teal-600" />
              <span>Data Synch Engine</span>
            </h2>

            <p className="text-xs text-slate-500 leading-relaxed">
              Synchronize billing records manually. This forces Glue Catalogs to rebuild partitions and runs the anomaly/forecasting algorithms.
            </p>

            <div className="p-3.5 bg-sky-50 border border-sky-100 text-sky-800 rounded-xl flex gap-2.5 items-start">
              <FiAlertCircle className="text-sky-600 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] leading-relaxed font-semibold">
                Running sync in mock mode will immediately generate 90 days of historical unblended RDS/EC2 resources logs inside your database.
              </span>
            </div>

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-sm"
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Syncing Billing Data...</span>
                </>
              ) : (
                <>
                  <FiCloud />
                  <span>Sync Cloud Cost Lake</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
