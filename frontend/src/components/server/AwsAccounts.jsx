import React, { useState, useEffect } from 'react';
import { getAccounts, createAccount, verifyAccount, deleteAccount } from '../../services/serverService';
import { FiPlus, FiTrash2, FiCheckCircle, FiXCircle, FiRefreshCw, FiCopy, FiInfo, FiKey } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const AwsAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formName, setFormName] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [roleArns, setRoleArns] = useState({});
  const [activeAccountForSetup, setActiveAccountForSetup] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchAccountsList = async () => {
    setIsLoading(true);
    try {
      const data = await getAccounts();
      setAccounts(data);
      // Initialize role ARNs inputs
      const arns = {};
      data.forEach(acc => {
        arns[acc._id] = acc.iamRoleArn || '';
      });
      setRoleArns(arns);
    } catch (error) {
      showMsg(error.message || 'Failed to retrieve accounts list', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountsList();
  }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formAccountId.trim()) {
      showMsg('Please fill out all fields', 'error');
      return;
    }
    if (!/^\d{12}$/.test(formAccountId)) {
      showMsg('AWS Account ID must be exactly 12 digits', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const newAcc = await createAccount(formName, formAccountId);
      showMsg('AWS Account registered successfully! Proceed with IAM setup.');
      setFormName('');
      setFormAccountId('');
      setActiveAccountForSetup(newAcc);
      fetchAccountsList();
    } catch (error) {
      showMsg(error.message || 'Failed to create account registration', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyRole = async (id) => {
    const arn = roleArns[id];
    if (!arn || !arn.trim()) {
      showMsg('Please provide the IAM Role ARN to verify', 'error');
      return;
    }
    if (!arn.startsWith('arn:aws:iam::')) {
      showMsg('Invalid IAM Role ARN format. Must begin with "arn:aws:iam::"', 'error');
      return;
    }

    setVerifyingId(id);
    try {
      const res = await verifyAccount(id, arn);
      if (res.success) {
        showMsg('AWS Role connection established and verified successfully!');
        if (activeAccountForSetup && activeAccountForSetup._id === id) {
          setActiveAccountForSetup(null);
        }
        fetchAccountsList();
      }
    } catch (error) {
      showMsg(error.message || 'Validation failed. Please verify trust policies.', 'error');
      fetchAccountsList();
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Are you sure you want to delete this AWS account registry? This will clean all associated analytics.')) {
      return;
    }

    try {
      await deleteAccount(id);
      showMsg('AWS Account removed successfully');
      if (activeAccountForSetup && activeAccountForSetup._id === id) {
        setActiveAccountForSetup(null);
      }
      fetchAccountsList();
    } catch (error) {
      showMsg(error.message || 'Failed to delete account configuration', 'error');
    }
  };

  const handleCopyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Policy template is now retrieved dynamically from the backend

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">AWS Accounts Setup</h1>
          <p className="text-slate-500 text-sm mt-1">Connect your AWS Accounts securely via IAM cross-account role assumption.</p>
        </div>
        
        {/* Info Banner */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200/50 text-teal-800 text-xs font-semibold">
          <FiInfo className="text-teal-600" />
          <span>Security Notice: Write permissions are not requested. CipherGate acts strictly read-only.</span>
        </div>
      </div>

      {/* Toast alert box */}
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
        
        {/* Left Side Setup Form */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <FiPlus className="text-teal-600" />
              <span>Register AWS Account</span>
            </h2>
            
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
                <input
                  id="display-name-input"
                  type="text"
                  placeholder="e.g. CipherGate-Production"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">12-Digit Account ID</label>
                <input
                  type="text"
                  placeholder="e.g. 123456789012"
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
                  maxLength={12}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-sm"
              >
                {submitting ? 'Creating...' : 'Initialize Connection'}
              </button>
            </form>
          </div>

          {/* Setup Instructions Drawer Trigger */}
          {activeAccountForSetup && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-xl space-y-4 border border-slate-800"
            >
              <h3 className="text-sm font-bold flex items-center gap-2 text-teal-400">
                <FiKey />
                <span>IAM Trust Setup for {activeAccountForSetup.name}</span>
              </h3>
              
              <p className="text-xs text-slate-400 leading-relaxed">
                Configure your target AWS account trust policy. Create an IAM Role matching these settings:
              </p>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs bg-slate-800 p-2 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">CipherGate Role ARN:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-200">{activeAccountForSetup.principalArn || 'Loading...'}</span>
                    <button 
                      onClick={() => handleCopyToClipboard(activeAccountForSetup.principalArn || '', 'arn')}
                      className="text-slate-400 hover:text-teal-400 transition"
                      disabled={!activeAccountForSetup.principalArn}
                    >
                      <FiCopy size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs bg-slate-800 p-2 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">STS External ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-200">{activeAccountForSetup.externalId}</span>
                    <button 
                      onClick={() => handleCopyToClipboard(activeAccountForSetup.externalId, 'extid')}
                      className="text-slate-400 hover:text-teal-400 transition"
                    >
                      <FiCopy size={13} />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Trust Relationship Document</span>
                <pre className="text-[10px] bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-300 border border-slate-900 font-mono leading-normal max-h-36">
                  {activeAccountForSetup.policyDocument || 'Loading trust policy...'}
                </pre>
                {activeAccountForSetup.policyDocument && (
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(activeAccountForSetup.policyDocument, 'policy')}
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
                    placeholder="arn:aws:iam::123456789012:role/CipherGateFinOps"
                    value={roleArns[activeAccountForSetup._id] || ''}
                    onChange={(e) => setRoleArns({ ...roleArns, [activeAccountForSetup._id]: e.target.value })}
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                  />
                  <button
                    onClick={() => handleVerifyRole(activeAccountForSetup._id)}
                    disabled={verifyingId !== null}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Side Accounts List */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-bold text-slate-900">Connected AWS Accounts</h2>
              <button 
                onClick={fetchAccountsList} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-all"
                title="Refresh accounts"
              >
                <FiRefreshCw size={15} />
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FiKey className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-slate-700 font-bold text-sm">No AWS Accounts Connected</h3>
                <p className="text-slate-400 text-xs mt-1 mb-4 max-w-xs">Initialize your configuration by filling out the AWS credentials registry on the left.</p>
                <button
                  onClick={() => {
                    const input = document.getElementById('display-name-input');
                    if (input) {
                      input.focus();
                      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition shadow-sm active:scale-95"
                >
                  Connect AWS Account
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(acc => {
                  const isSetupActive = activeAccountForSetup && activeAccountForSetup._id === acc._id;
                  return (
                    <div 
                      key={acc._id}
                      className={`p-5 rounded-2xl border transition-all ${
                        isSetupActive 
                          ? 'bg-teal-50/20 border-teal-500/40 ring-1 ring-teal-500/10' 
                          : 'bg-white hover:bg-slate-50/50 border-slate-100 shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">{acc.name}</h3>
                          <p className="text-slate-500 font-mono text-[11px] mt-0.5">ID: {acc.awsAccountId}</p>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5">
                          {acc.connectionStatus === 'Connected' ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              <FiCheckCircle /> Connected
                            </span>
                          ) : acc.connectionStatus === 'Failed' ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                              <FiXCircle /> Failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="text-[11px] text-slate-600 space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                          <div className="truncate"><strong>Role ARN:</strong> <span className="font-mono text-slate-500" title={acc.iamRoleArn}>{acc.iamRoleArn || 'Pending Config'}</span></div>
                          <div><strong>External ID:</strong> <span className="font-mono text-slate-500">{acc.externalId}</span></div>
                          <div><strong>Last Verified:</strong> <span className="text-slate-500">{acc.lastVerifiedAt ? new Date(acc.lastVerifiedAt).toLocaleString() : 'Never'}</span></div>
                          <div><strong>Last Sync:</strong> <span className="text-slate-500">{acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleString() : 'Never'}</span></div>
                        </div>

                        {/* Input Role Verification in card */}
                        <div className="flex gap-2 pt-2 border-t border-slate-100/50">
                          <input
                            type="text"
                            placeholder="IAM Role ARN"
                            value={roleArns[acc._id] || ''}
                            onChange={(e) => setRoleArns({ ...roleArns, [acc._id]: e.target.value })}
                            className="flex-1 px-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500/20 focus:border-teal-500 font-mono"
                          />
                          <button
                            onClick={() => handleVerifyRole(acc._id)}
                            disabled={verifyingId === acc._id}
                            className="px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition active:scale-[0.97]"
                          >
                            {verifyingId === acc._id ? 'Validating...' : 'Verify'}
                          </button>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <button
                            onClick={() => setActiveAccountForSetup(acc)}
                            className="text-xs font-bold text-teal-600 hover:text-teal-700 transition"
                          >
                            IAM Instructions
                          </button>

                          <button
                            onClick={() => handleDeleteAccount(acc._id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete connection"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {acc.errorMessage && (
                        <div className="mt-3 p-2 bg-rose-50/50 rounded-lg text-[10px] text-rose-800 border border-rose-100/30 leading-relaxed font-mono">
                          {acc.errorMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AwsAccounts;
