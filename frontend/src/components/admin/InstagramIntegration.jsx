import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  getInstagramAccounts, 
  connectInstagramAccount, 
  activateInstagramAccount, 
  deleteInstagramAccount 
} from '../../services/instagramService';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { 
  Instagram, 
  Key, 
  User, 
  Shield, 
  Trash2, 
  CheckCircle, 
  Zap, 
  Settings, 
  Plus, 
  AlertTriangle 
} from 'lucide-react';

const InstagramIntegration = () => {
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchAccounts = async () => {
    try {
      const data = await getInstagramAccounts();
      setAccounts(data || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load Instagram accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      toast.error('Please fill in both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await connectInstagramAccount(formData);
      toast.success(`Account ${response.username} connected successfully!`);
      setFormData({ username: '', password: '' });
      await fetchAccounts();
    } catch (error) {
      toast.error(error.error || 'Failed to connect Instagram account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (id, username) => {
    setActionLoadingId(id);
    try {
      const response = await activateInstagramAccount(id);
      toast.success(response.message || `Switched active account to ${username}`);
      await fetchAccounts();
    } catch (error) {
      toast.error(error.error || 'Failed to switch account.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Are you sure you want to disconnect ${username}?`)) {
      return;
    }
    setActionLoadingId(id);
    try {
      const response = await deleteInstagramAccount(id);
      toast.success(response.message || 'Account disconnected successfully.');
      await fetchAccounts();
    } catch (error) {
      toast.error(error.error || 'Failed to disconnect account.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-3">
          <Spinner className="w-8 h-8 text-pink-500" />
          <p className="text-slate-600 text-sm font-medium">Loading Instagram configuration...</p>
        </div>
      </div>
    );
  }

  const activeAccount = accounts.find(acc => acc.isActive);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
      {/* Header Section */}
      <div className="mb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 rounded-xl shadow-lg flex items-center justify-center">
                <Instagram className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Instagram Account Hub
              </h1>
              <p className="text-slate-500 text-xs md:text-sm font-medium">Centralized Session and Integration Center</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-pink-50 px-3 py-2 rounded-lg border border-pink-200 self-start sm:self-auto">
            <Shield className="w-4 h-4 text-pink-600" />
            <span className="text-pink-700 text-xs font-semibold">SECURE SSO SESSION</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Connection Form Column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-pink-400" />
                <h2 className="text-sm md:text-base font-semibold text-white">Connect New Account</h2>
              </div>
            </div>

            <form onSubmit={handleConnect} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="flex items-center text-xs md:text-sm font-semibold text-slate-700 mb-2">
                  <User className="w-3.5 h-3.5 text-slate-400 mr-2" />
                  Instagram Username
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  name="username"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition-all text-sm bg-slate-50"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. arun_tv"
                  required
                />
              </div>

              <div>
                <label className="flex items-center text-xs md:text-sm font-semibold text-slate-700 mb-2">
                  <Key className="w-3.5 h-3.5 text-slate-400 mr-2" />
                  Instagram Password
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="password"
                  name="password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition-all text-sm bg-slate-50"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-pink-600 hover:from-pink-600 hover:via-purple-600 hover:to-pink-700 text-white rounded-lg shadow font-semibold text-sm py-2 px-4 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner className="w-4 h-4 text-white" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect Account'
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Quick Informational Box */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100 space-y-3">
            <h3 className="text-xs md:text-sm font-bold text-indigo-900 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-600" />
              Centralized SSO System
            </h3>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Once connected, the active Instagram account session is cached server-side. Employee users do not require credentials and will automatically access the active account comments and chats.
            </p>
          </div>
        </div>

        {/* Saved Accounts Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4 text-pink-400" />
                <h2 className="text-sm md:text-base font-semibold text-white">Connected Accounts</h2>
              </div>
              {activeAccount && (
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span className="text-white text-xs font-semibold tracking-wide">
                    ACTIVE: {activeAccount.username}
                  </span>
                </div>
              )}
            </div>

            {accounts.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-slate-50">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Instagram className="w-8 h-8" />
                </div>
                <h3 className="text-slate-700 font-semibold">No Accounts Connected</h3>
                <p className="text-slate-400 text-xs max-w-sm">
                  Please connect an Instagram account using the form on the left. The first connected account will automatically be activated.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-3.5 text-xs font-bold text-slate-500 tracking-wider">Instagram Account</th>
                      <th className="px-6 py-3.5 text-xs font-bold text-slate-500 tracking-wider">Connection Date</th>
                      <th className="px-6 py-3.5 text-xs font-bold text-slate-500 tracking-wider">Status</th>
                      <th className="px-6 py-3.5 text-xs font-bold text-slate-500 tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accounts.map((account) => (
                      <tr key={account._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 bg-pink-100 text-pink-600 rounded-lg flex items-center justify-center">
                              <Instagram className="w-4 h-4" />
                            </div>
                            <span className="text-slate-800 font-semibold text-sm">
                              {account.username}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(account.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          {account.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              Active System
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!account.isActive && (
                              <Button
                                size="sm"
                                disabled={actionLoadingId !== null}
                                onClick={() => handleActivate(account._id, account.username)}
                                className="bg-slate-100 hover:bg-pink-500 hover:text-white text-slate-700 font-semibold border border-slate-200 hover:border-pink-500 rounded-lg text-xs transition-all px-3 py-1.5"
                              >
                                {actionLoadingId === account._id ? (
                                  <Spinner className="w-3.5 h-3.5" />
                                ) : (
                                  'Switch Account'
                                )}
                              </Button>
                            )}
                            <button
                              disabled={actionLoadingId !== null}
                              onClick={() => handleDelete(account._id, account.username)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                              title="Disconnect Account"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Account Warning Banner */}
          {!activeAccount && accounts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-amber-900 font-semibold text-sm">No Active Account Selected</h4>
                <p className="text-amber-700 text-xs leading-relaxed mt-1">
                  Although accounts are connected, none is marked active. The system requires one active account to load comments and chats. Please click <strong>Switch Account</strong> above.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstagramIntegration;
