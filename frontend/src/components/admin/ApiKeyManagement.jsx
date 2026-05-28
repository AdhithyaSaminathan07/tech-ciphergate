import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiShield, 
    FiCalendar, FiActivity, FiToggleLeft, FiToggleRight,
    FiAlertTriangle
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const AVAILABLE_MODULES = [
    { id: 'attendance', name: 'Attendance', actions: ['read', 'write'] },
    { id: 'invoices', name: 'Invoices', actions: ['read', 'write'] },
    { id: 'workers', name: 'Workers', actions: ['read'] },
    { id: 'tasks', name: 'Tasks', actions: ['read'] },
    { id: 'salary', name: 'Salary Report', actions: ['read'] },
    { id: 'leaves', name: 'Leaves', actions: ['read'] },
    { id: 'fines', name: 'Fines', actions: ['read'] },
    { id: 'departments', name: 'Departments', actions: ['read'] },
    { id: 'holidays', name: 'Holidays', actions: ['read'] },
    { id: 'tickets', name: 'Tickets/Helpdesk', actions: ['read'] },
    { id: 'settings', name: 'Settings', actions: ['read'] }
];

const formatPermissions = (permissions) => {
    if (!permissions || permissions.length === 0) return ['None'];
    if (permissions.includes('admin')) return ['Full Admin'];
    if (permissions.includes('write')) return ['Global Read & Write'];
    if (permissions.includes('read')) return ['Global Read Only'];
    
    // Group by module
    const groups = {};
    permissions.forEach(p => {
        const parts = p.split(':');
        if (parts.length === 2) {
            const [mod, act] = parts;
            if (!groups[mod]) groups[mod] = [];
            groups[mod].push(act);
        } else {
            if (!groups[p]) groups[p] = [];
            groups[p].push(p);
        }
    });

    return Object.entries(groups).map(([mod, acts]) => {
        return `${mod} (${acts.join(', ')})`;
    });
};

const ApiKeyManagement = () => {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [copiedKey, setCopiedKey] = useState('');
    const [permissionType, setPermissionType] = useState('read'); // 'read', 'write', 'admin', 'custom'
    const [customPermissions, setCustomPermissions] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [keyToDelete, setKeyToDelete] = useState(null);
    
    // Form state
    const [formData, setFormData] = useState({
        clientName: '',
        subdomain: localStorage.getItem('tasktracker-subdomain') || '',
        permissions: ['read'],
        expiryDays: 30
    });

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/admin/keys', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setKeys(res.data.data);
            setLoading(false);
        } catch (error) {
            toast.error('Failed to fetch API keys');
            setLoading(false);
        }
    };

    const handleCreateKey = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const payload = {
                ...formData,
                permissions: permissionType === 'custom' ? customPermissions : [permissionType]
            };

            if (permissionType === 'custom' && customPermissions.length === 0) {
                toast.error('Please select at least one permission');
                return;
            }

            const res = await axios.post('/api/admin/keys', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('API Key generated successfully!');
            setKeys([res.data.data, ...keys]);
            setShowCreateModal(false);
            setFormData({ ...formData, clientName: '' });
            setCustomPermissions([]);
            setPermissionType('read');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate key');
        }
    };

    const initiateDelete = (id) => {
        setKeyToDelete(id);
        setShowDeleteConfirm(true);
    };

    const confirmDeleteKey = async () => {
        if (!keyToDelete) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/admin/keys/${keyToDelete}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setKeys(keys.filter(k => k._id !== keyToDelete));
            toast.success('Key revoked successfully');
            setShowDeleteConfirm(false);
            setKeyToDelete(null);
        } catch (error) {
            toast.error('Failed to revoke key');
            setShowDeleteConfirm(false);
            setKeyToDelete(null);
        }
    };

    const handleToggleStatus = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.patch(`/api/admin/keys/${id}/toggle`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setKeys(keys.map(k => k._id === id ? res.data.data : k));
            toast.success('Status updated');
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const copyToClipboard = (key) => {
        navigator.clipboard.writeText(key);
        setCopiedKey(key);
        toast.info('Copied to clipboard!');
        setTimeout(() => setCopiedKey(''), 2000);
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <FiKey className="text-blue-600" /> API Key Management
                        </h1>
                        <p className="text-gray-500">Manage external access keys for your team and applications.</p>
                    </div>
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md"
                    >
                        <FiPlus /> Generate New Key
                    </button>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                <FiKey size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Active Keys</p>
                                <p className="text-2xl font-bold text-gray-800">{keys.filter(k => k.isActive).length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                                <FiActivity size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Usage</p>
                                <p className="text-2xl font-bold text-gray-800">
                                    {keys.reduce((acc, k) => acc + (k.usageCount || 0), 0)}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                                <FiShield size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Security Status</p>
                                <p className="text-lg font-bold text-green-600">Secure</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Keys Table */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Client / Application</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">API Key</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Permissions</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Usage</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-10 text-gray-500">Loading keys...</td></tr>
                            ) : keys.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-10 text-gray-500">No API keys found. Generate one to get started.</td></tr>
                            ) : keys.map(apiKey => (
                                <tr key={apiKey._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-gray-800">{apiKey.clientName}</p>
                                        <p className="text-xs text-gray-500">{apiKey.subdomain}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200 group w-fit">
                                            <code className="text-xs font-mono text-blue-700">
                                                {apiKey.key ? `${apiKey.key.substring(0, 8)}...${apiKey.key.substring(apiKey.key.length - 4)}` : 'N/A'}
                                            </code>
                                            {apiKey.key && (
                                                <button 
                                                    onClick={() => copyToClipboard(apiKey.key)}
                                                    className="text-gray-400 hover:text-blue-600 transition-colors"
                                                >
                                                    {copiedKey === apiKey.key ? <FiCheck className="text-green-500" /> : <FiCopy size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                                            {formatPermissions(apiKey.permissions).map(p => (
                                                <span key={p} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-1">
                                            <FiActivity size={12} className="text-gray-400" /> {apiKey.usageCount || 0}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => handleToggleStatus(apiKey._id)}
                                            className={`flex items-center gap-1 text-sm font-medium ${apiKey.isActive ? 'text-green-600' : 'text-red-500'}`}
                                        >
                                            {apiKey.isActive ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                                            {apiKey.isActive ? 'Active' : 'Disabled'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => initiateDelete(apiKey._id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Revoke Key"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Documentation Help */}
                <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-100">
                    <h3 className="text-blue-800 font-bold mb-2">How to use your API Keys</h3>
                    <p className="text-blue-700 text-sm mb-4">
                        Send the API key in the header of your requests to access company data programmatically.
                    </p>
                    <div className="bg-gray-900 p-4 rounded-lg text-gray-300 font-mono text-xs overflow-x-auto shadow-inner">
                        <p className="text-gray-500 mb-2">// Example request header</p>
                        <p>headers: &#123;</p>
                        <p className="pl-4">"Content-Type": "application/json",</p>
                        <p className="pl-4 text-green-400">"x-api-key": "YOUR_SECRET_KEY"</p>
                        <p>&#125;</p>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-white relative">
                            <button 
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-xl"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <h2 className="text-xl font-extrabold flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-xl text-blue-400 border border-white/10 shadow-inner">
                                    <FiKey size={18} />
                                </div>
                                Generate API Key
                            </h2>
                            <p className="text-slate-300 text-xs mt-2 font-normal leading-relaxed">
                                Issue a secure credential key for external integrations to authenticate programmatically.
                            </p>
                        </div>
                        <form onSubmit={handleCreateKey} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Client / App Name</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="e.g. Mobile App Team, Billing Integration"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-slate-800"
                                    value={formData.clientName}
                                    onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tenant Subdomain</label>
                                <input 
                                    type="text"
                                    required
                                    disabled
                                    className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-400 text-sm cursor-not-allowed font-medium"
                                    value={formData.subdomain}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Key Lifespan</label>
                                    <select 
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-700 cursor-pointer"
                                        value={formData.expiryDays}
                                        onChange={e => setFormData({ ...formData, expiryDays: parseInt(e.target.value) })}
                                    >
                                        <option value={30}>30 Days</option>
                                        <option value={90}>90 Days</option>
                                        <option value={365}>1 Year</option>
                                        <option value={0}>Never Expire</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Permission Profile</label>
                                    <select 
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-700 cursor-pointer"
                                        value={permissionType}
                                        onChange={e => setPermissionType(e.target.value)}
                                    >
                                        <option value="read">Global Read Only</option>
                                        <option value="write">Global Read & Write</option>
                                        <option value="admin">Full Admin Access</option>
                                        <option value="custom">Custom Permissions...</option>
                                    </select>
                                </div>
                            </div>

                            {permissionType === 'custom' && (
                                <div className="space-y-3 mt-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-150 max-h-64 overflow-y-auto">
                                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">Select Scopes</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {AVAILABLE_MODULES.map(module => (
                                            <div key={module.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200/80 transition-all shadow-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-800">{module.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">{module.id}</span>
                                                </div>
                                                <div className="flex gap-4">
                                                    {module.actions.includes('read') && (
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer select-none font-medium transition-colors">
                                                            <input 
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 focus:ring-offset-0 transition-all h-4 w-4 cursor-pointer"
                                                                checked={customPermissions.includes(`${module.id}:read`)}
                                                                onChange={(e) => {
                                                                    const val = `${module.id}:read`;
                                                                    if (e.target.checked) {
                                                                        setCustomPermissions([...customPermissions, val]);
                                                                    } else {
                                                                        setCustomPermissions(customPermissions.filter(p => p !== val && p !== `${module.id}:write`));
                                                                    }
                                                                }}
                                                            />
                                                            Read
                                                        </label>
                                                    )}
                                                    {module.actions.includes('write') && (
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer select-none font-medium transition-colors">
                                                            <input 
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 focus:ring-offset-0 transition-all h-4 w-4 cursor-pointer"
                                                                checked={customPermissions.includes(`${module.id}:write`)}
                                                                onChange={(e) => {
                                                                    const val = `${module.id}:write`;
                                                                    if (e.target.checked) {
                                                                        const readVal = `${module.id}:read`;
                                                                        const newPerms = customPermissions.includes(readVal) 
                                                                            ? [...customPermissions, val] 
                                                                            : [...customPermissions, readVal, val];
                                                                        setCustomPermissions(newPerms);
                                                                    } else {
                                                                        setCustomPermissions(customPermissions.filter(p => p !== val));
                                                                    }
                                                                }}
                                                            />
                                                            Write
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-2.5 text-slate-600 hover:text-slate-800 font-semibold hover:bg-slate-50 border border-slate-200 rounded-xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/25 transition-all text-sm"
                                >
                                    Generate Key
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-100 w-full max-w-md overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-center">
                            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
                                <FiAlertTriangle size={28} />
                            </div>
                            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2">Revoke API Key</h2>
                            <p className="text-slate-500 text-sm mb-5 leading-relaxed">
                                Are you sure you want to revoke this credentials key? This action is permanent and cannot be reversed.
                            </p>

                            {/* Hashed/Target details for security */}
                            {(() => {
                                const targetKey = keys.find(k => k._id === keyToDelete);
                                if (!targetKey) return null;
                                return (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-8 -mt-8 pointer-events-none" />
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Key to be revoked</span>
                                        <span className="block text-sm font-bold text-slate-800 truncate mb-1">{targetKey.clientName}</span>
                                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500 bg-white border border-slate-200/60 rounded-lg px-2.5 py-1.5 w-fit mt-2">
                                            <FiKey size={12} className="text-slate-400" />
                                            <span>{targetKey.key ? `${targetKey.key.substring(0, 8)}...${targetKey.key.substring(targetKey.key.length - 4)}` : 'N/A'}</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex gap-3">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setKeyToDelete(null);
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="button"
                                    onClick={confirmDeleteKey}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/10 hover:shadow-red-500/25 transition-all text-sm"
                                >
                                    Yes, Revoke
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiKeyManagement;
