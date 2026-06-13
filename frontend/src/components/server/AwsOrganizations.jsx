import React, { useState, useEffect } from 'react';
import { scanOrganization, getAccounts } from '../../services/serverService';
import { FiSearch, FiLayers, FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const AwsOrganizations = () => {
  const [masterAccountId, setMasterAccountId] = useState('');
  const [masterRoleArn, setMasterRoleArn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredAccounts, setDiscoveredAccounts] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });

  const loadExistingOrgAccounts = async () => {
    try {
      const data = await getAccounts();
      // Filter out accounts that have an orgId
      const orgAccounts = data.filter(acc => acc.orgId);
      setDiscoveredAccounts(orgAccounts);
      // Auto-populate form if master is found
      const master = data.find(acc => acc.orgId && acc.iamRoleArn && acc.name.includes('Master'));
      if (master) {
        setMasterAccountId(master.awsAccountId);
        setMasterRoleArn(master.iamRoleArn);
      }
    } catch (error) {
      console.error('Failed to load accounts for organizations view:', error);
    }
  };

  useEffect(() => {
    loadExistingOrgAccounts();
  }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!masterAccountId.trim() || !masterRoleArn.trim()) {
      showMsg('Please fill out all fields', 'error');
      return;
    }
    if (!/^\d{12}$/.test(masterAccountId)) {
      showMsg('Master Account ID must be exactly 12 digits', 'error');
      return;
    }

    setIsScanning(true);
    try {
      const res = await scanOrganization(masterAccountId, masterRoleArn);
      if (res.success) {
        showMsg(res.message);
        setDiscoveredAccounts(res.accounts);
      }
    } catch (error) {
      showMsg(error.message || 'Organization scan failed. Ensure STS credentials trust policies allow master-role access.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">AWS Organizations</h1>
          <p className="text-slate-500 text-sm mt-1">Connect your billing Master Account to discover and import linked AWS accounts automatically.</p>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200/50 text-teal-800 text-xs font-semibold">
          <FiInfo className="text-teal-600" />
          <span>Consolidated billing discovery automates tenant onboarding.</span>
        </div>
      </div>

      {/* Message alerts */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-xl border text-sm flex items-center justify-between shadow-sm ${
              message.type === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage({ text: '', type: '' })} className="font-bold ml-4 hover:opacity-75">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form setup for master org */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <FiLayers className="text-teal-600" />
              <span>Connect Master Account</span>
            </h2>

            <form onSubmit={handleScan} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Master Account ID</label>
                <input
                  type="text"
                  placeholder="e.g. 123456789012"
                  value={masterAccountId}
                  onChange={(e) => setMasterAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
                  maxLength={12}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Master IAM Role ARN</label>
                <input
                  type="text"
                  placeholder="arn:aws:iam::123456789012:role/CipherGateOrgMasterRole"
                  value={masterRoleArn}
                  onChange={(e) => setMasterRoleArn(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all font-mono text-xs"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/50 flex gap-2.5 items-start">
                <FiAlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" />
                <span className="text-[11px] text-amber-800 leading-relaxed font-semibold">
                  Note: The IAM role in the Organization Master account must have permissions to execute <code>organizations:ListAccounts</code>.
                </span>
              </div>

              <button
                type="submit"
                disabled={isScanning}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-sm"
              >
                {isScanning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span>Scanning Organization...</span>
                  </>
                ) : (
                  <>
                    <FiSearch />
                    <span>Scan & Discover Accounts</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Discovered child accounts display */}
        <div className="xl:col-span-2">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
            <h2 className="text-base font-bold text-slate-900 mb-6">Discovered Organization Structure</h2>

            {discoveredAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FiLayers className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-slate-700 font-bold text-sm">No linked organization accounts</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">Run a discovery scan on your Master account to automatically map AWS Organization accounts.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Org header statistics */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>Organization ID: <strong className="text-slate-900 font-mono">{discoveredAccounts[0]?.orgId || 'o-cgate88888'}</strong></span>
                  <span>Total Child Accounts: <strong className="text-teal-600">{discoveredAccounts.length}</strong></span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {discoveredAccounts.map(acc => {
                    const isMaster = acc.name.toLowerCase().includes('master') || acc.name.toLowerCase().includes('root');
                    return (
                      <div key={acc._id} className="p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/50 shadow-sm transition flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{acc.name}</h3>
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">ID: {acc.awsAccountId}</p>
                          </div>
                          
                          {isMaster ? (
                            <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 uppercase">Master</span>
                          ) : (
                            <span className="text-[9px] font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 uppercase">Linked</span>
                          )}
                        </div>

                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100/30 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            {acc.connectionStatus === 'Connected' ? (
                              <><FiCheckCircle className="text-emerald-500" /> Active Sync</>
                            ) : (
                              <><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Unconfigured Role</>
                            )}
                          </span>
                          <span>Last checked: {acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleDateString() : 'Never'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AwsOrganizations;
