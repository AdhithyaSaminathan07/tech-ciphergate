import React, { useState, useEffect } from 'react';
import { scanOrganization, getAccounts, initializeOrganization, verifyAccount, deleteAccount } from '../../services/serverService';
import { FiSearch, FiLayers, FiAlertTriangle, FiCheckCircle, FiInfo, FiKey, FiCopy, FiRefreshCw } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const AwsOrganizations = () => {
  const [masterAccount, setMasterAccount] = useState(null);
  const [masterDisplayName, setMasterDisplayName] = useState('');
  const [masterAccountId, setMasterAccountId] = useState('');
  const [masterRoleArn, setMasterRoleArn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [discoveredAccounts, setDiscoveredAccounts] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });

  const loadExistingOrgAccounts = async () => {
    try {
      const data = await getAccounts();
      // Filter out accounts that have an orgId
      const orgAccounts = data.filter(acc => acc.orgId);
      setDiscoveredAccounts(orgAccounts);

      // Auto-populate form/state if master is found
      const master = data.find(acc => acc.isOrgMaster);
      if (master) {
        setMasterAccount(master);
        setMasterAccountId(master.awsAccountId);
        setMasterRoleArn(master.iamRoleArn || '');
        setMasterDisplayName(master.name || '');
      } else {
        setMasterAccount(null);
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

  const handleInitializeOrg = async (e) => {
    e.preventDefault();
    if (!masterDisplayName.trim() || !masterAccountId.trim()) {
      showMsg('Please fill out all fields', 'error');
      return;
    }
    if (!/^\d{12}$/.test(masterAccountId)) {
      showMsg('Master Account ID must be exactly 12 digits', 'error');
      return;
    }

    setIsScanning(true);
    try {
      const res = await initializeOrganization(masterDisplayName, masterAccountId);
      setMasterAccount(res);
      showMsg('AWS Organization Master registered successfully. Please configure your AWS IAM Trust Policy now.');
      await loadExistingOrgAccounts();
    } catch (error) {
      showMsg(error.message || 'Initialization failed', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleVerifyMasterRole = async () => {
    if (!masterRoleArn.trim()) {
      showMsg('IAM Role ARN is required for verification', 'error');
      return;
    }
    if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@\-\/]+$/.test(masterRoleArn.trim())) {
      showMsg('Master IAM Role ARN must be a valid IAM Role ARN format (e.g. arn:aws:iam::123456789012:role/RoleName)', 'error');
      return;
    }

    setVerifyingId(masterAccount._id);
    try {
      const res = await verifyAccount(masterAccount._id, masterRoleArn.trim());
      if (res.success) {
        showMsg('AWS Organization Master connection established and verified successfully');
        setMasterAccount(res.account);
        await loadExistingOrgAccounts();
      }
    } catch (error) {
      showMsg(error.message || 'Verification failed. Check your IAM trust policy.', 'error');
      await loadExistingOrgAccounts();
    } finally {
      setVerifyingId(null);
    }
  };

  const handleScanOrg = async () => {
    if (!masterAccount || masterAccount.connectionStatus !== 'Connected') {
      showMsg('Master account connection must be verified first', 'error');
      return;
    }

    setIsScanning(true);
    try {
      const res = await scanOrganization(masterAccount.awsAccountId);
      if (res.success) {
        showMsg(res.message);
        setDiscoveredAccounts(res.accounts);
      }
    } catch (error) {
      showMsg(error.message || 'Failed to scan organization accounts', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleCopyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDisconnectOrg = async () => {
    if (!masterAccount) return;
    if (!window.confirm('Are you sure you want to disconnect this Master AWS Account and delete all associated linked organization accounts?')) {
      return;
    }

    try {
      await deleteAccount(masterAccount._id);
      showMsg('AWS Organization disconnected successfully');
      setMasterAccount(null);
      setMasterDisplayName('');
      setMasterAccountId('');
      setMasterRoleArn('');
      setDiscoveredAccounts([]);
      await loadExistingOrgAccounts();
    } catch (error) {
      showMsg(error.message || 'Failed to disconnect organization', 'error');
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
            className={`p-4 rounded-xl border text-sm flex items-center justify-between shadow-sm ${ message.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800' }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage({ text: '', type: '' })} className="font-bold ml-4 hover:opacity-75">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Form setup for master org */}
        <div className="xl:col-span-1 space-y-6">
          {!masterAccount ? (
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                <FiLayers className="text-teal-600" />
                <span>Connect Master Account</span>
              </h2>

              <form onSubmit={handleInitializeOrg} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wider mb-2">Display Name</label>
                  <input
                    id="master-display-name-input"
                    type="text"
                    placeholder="e.g. My Organization Billing"
                    value={masterDisplayName}
                    onChange={(e) => setMasterDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wider mb-2">Master Account ID</label>
                  <input
                    id="master-account-input"
                    type="text"
                    placeholder="e.g. 123456789012"
                    value={masterAccountId}
                    onChange={(e) => setMasterAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
                    maxLength={12}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isScanning}
                  className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-sm"
                >
                  Initialize Master Connection
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Master Account Registry Info */}
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{masterAccount.name}</h3>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">Master ID: {masterAccount.awsAccountId}</p>
                  </div>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${ masterAccount.connectionStatus === 'Connected' ? 'bg-teal-50 text-teal-700 border-teal-100' : 'bg-rose-50 text-rose-700 border-rose-100' }`}>
                    {masterAccount.connectionStatus}
                  </span>
                </div>

                {masterAccount.errorMessage && (
                  <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-800 font-mono leading-relaxed">
                    Error: {masterAccount.errorMessage}
                  </div>
                )}

                <button
                  onClick={handleDisconnectOrg}
                  className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 transition"
                >
                  Disconnect Master Account
                </button>
              </div>

              {/* IAM Trust policy setup details */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-xl space-y-4 border border-slate-800"
              >
                <h3 className="text-sm font-bold flex items-center gap-2 text-teal-400">
                  <FiKey />
                  <span>IAM Trust Setup for Organization</span>
                </h3>
                
                <p className="text-xs text-slate-400 leading-relaxed">
                  Create an IAM Role in your AWS Organization Master account with the following configurations:
                </p>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs bg-slate-800 p-2 rounded-lg border border-slate-700">
                    <span className="text-slate-400 font-medium">CipherGate Role ARN:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-200">{masterAccount.principalArn || 'Loading...'}</span>
                      <button 
                        onClick={() => handleCopyToClipboard(masterAccount.principalArn || '', 'arn')}
                        className="text-slate-400 hover:text-teal-400 transition"
                        disabled={!masterAccount.principalArn}
                      >
                        {copiedId === 'arn' ? 'Copied' : <FiCopy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs bg-slate-800 p-2 rounded-lg border border-slate-700">
                    <span className="text-slate-400 font-medium">STS External ID:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-200">{masterAccount.externalId}</span>
                      <button 
                        onClick={() => handleCopyToClipboard(masterAccount.externalId, 'extid')}
                        className="text-slate-400 hover:text-teal-400 transition"
                      >
                        {copiedId === 'extid' ? 'Copied' : <FiCopy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-400 mb-2 tracking-wide">Trust Relationship Document</span>
                  <pre className="text-[10px] bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-300 border border-slate-900 font-mono leading-normal max-h-36">
                    {masterAccount.policyDocument || 'Loading trust policy...'}
                  </pre>
                  {masterAccount.policyDocument && (
                    <button
                      type="button"
                      onClick={() => handleCopyToClipboard(masterAccount.policyDocument, 'policy')}
                      className="mt-2 text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1.5 transition"
                    >
                      <FiCopy size={11} />
                      <span>Copy Document</span>
                    </button>
                  )}
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-400 mb-2">IAM Role ARN created on AWS</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="arn:aws:iam::123456789012:role/CipherGateOrgMasterRole"
                      value={masterRoleArn}
                      onChange={(e) => setMasterRoleArn(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                    />
                    <button
                      onClick={handleVerifyMasterRole}
                      disabled={verifyingId !== null}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition"
                    >
                      {verifyingId ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Scan & Discover Action Card */}
              {masterAccount.connectionStatus === 'Connected' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4"
                >
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FiSearch className="text-teal-600" />
                    <span>Discover Organization Structure</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Now that the Master account IAM role is verified, you can scan the organization to automatically register/sync all linked member accounts.
                  </p>
                  <button
                    onClick={handleScanOrg}
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
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Discovered child accounts display */}
        <div className="xl:col-span-2">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
            <h2 className="text-base font-bold text-slate-900 mb-6">Discovered Organization Structure</h2>

            {discoveredAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FiLayers className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-slate-700 font-bold text-sm">No AWS Organization Connected</h3>
                <p className="text-slate-400 text-xs mt-1 mb-4 max-w-xs">Run a discovery scan on your Master account to automatically map AWS Organization accounts.</p>
                <button
                  onClick={() => {
                    const input = document.getElementById('master-display-name-input') || document.getElementById('master-account-input');
                    if (input) {
                      input.focus();
                      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition shadow-sm active:scale-95"
                >
                  Connect Organization
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Org header statistics */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700 mb-4">
                  <div className="space-y-1.5">
                    <div><strong>Organization ID:</strong> <span className="font-mono font-semibold text-slate-900">{discoveredAccounts[0]?.orgId || 'Pending Scan'}</span></div>
                    <div><strong>Organization Name:</strong> <span className="font-semibold text-slate-900">AWS Consolidated Org</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <div><strong>Master Account ID:</strong> <span className="font-mono font-semibold text-slate-900">{masterAccountId || 'Not Connected'}</span></div>
                    <div><strong>Linked Accounts:</strong> <span className="font-semibold text-teal-600">{discoveredAccounts.length}</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <div><strong>Last Sync:</strong> <span className="font-semibold text-slate-900">{discoveredAccounts[0]?.lastSyncedAt ? new Date(discoveredAccounts[0].lastSyncedAt).toLocaleString() : 'Never'}</span></div>
                    <div>
                      <strong>Status:</strong>{' '}
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${ discoveredAccounts[0]?.connectionStatus === 'Connected' ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-rose-50 text-rose-700 border border-rose-100' }`}>
                        {discoveredAccounts[0]?.connectionStatus || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {discoveredAccounts.map(acc => {
                    const isMaster = acc.name.toLowerCase().includes('master') || acc.name.toLowerCase().includes('root') || acc.isOrgMaster;
                    return (
                      <div key={acc._id} className="p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/50 shadow-sm transition flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{acc.name}</h3>
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">ID: {acc.awsAccountId}</p>
                          </div>
                          
                          {isMaster ? (
                            <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Master</span>
                          ) : (
                            <span className="text-[9px] font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">Linked</span>
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
