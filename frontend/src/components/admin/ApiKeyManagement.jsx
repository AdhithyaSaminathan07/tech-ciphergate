import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiShield,
    FiCalendar, FiActivity, FiToggleLeft, FiToggleRight,
    FiAlertTriangle, FiChevronDown, FiTerminal, FiCode, FiGlobe, FiInfo
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const AVAILABLE_MODULES = [
    { id: 'attendance', name: 'Attendance', actions: ['read', 'write'] },
    { id: 'invoices', name: 'Invoices', actions: ['read', 'write'] },
    { id: 'work_allocation', name: 'Work Allocation', actions: ['read', 'write'] },
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
    const [activeDropdownId, setActiveDropdownId] = useState(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [generatedKeyData, setGeneratedKeyData] = useState(null);
    const [selectedEndpoint, setSelectedEndpoint] = useState('attendance');

    const getBaseUrl = () => {
        let url = import.meta.env.VITE_API_URL || window.location.origin;
        if (url.endsWith('/api')) {
            url = url.substring(0, url.length - 4);
        }
        if (!url.startsWith('http')) {
            url = window.location.origin;
        }
        return url;
    };

    const copyCurlCommand = (key) => {
        const baseUrl = getBaseUrl();
        const curl = `curl -H "x-api-key: ${key}" "${baseUrl}/api/external/${selectedEndpoint}"`;
        navigator.clipboard.writeText(curl);
        toast.info('Copied curl command to clipboard!');
    };

    const copyAxiosRequest = (key) => {
        const baseUrl = getBaseUrl();
        const snippet = `const axios = require('axios');\n\naxios.get('${baseUrl}/api/external/${selectedEndpoint}', {\n  headers: { 'x-api-key': '${key}' }\n});`;
        navigator.clipboard.writeText(snippet);
        toast.info('Copied Axios snippet to clipboard!');
    };

    const copyFetchRequest = (key) => {
        const baseUrl = getBaseUrl();
        const snippet = `fetch('${baseUrl}/api/external/${selectedEndpoint}', {\n  headers: {\n    'x-api-key': '${key}'\n  }\n});`;
        navigator.clipboard.writeText(snippet);
        toast.info('Copied Fetch snippet to clipboard!');
    };

    const copyEndpointUrl = () => {
        const baseUrl = getBaseUrl();
        const url = `${baseUrl}/api/external/${selectedEndpoint}`;
        navigator.clipboard.writeText(url);
        toast.info('Copied Endpoint URL to clipboard!');
    };

    // Form state
    const [formData, setFormData] = useState({
        clientName: '',
        subdomain: localStorage.getItem('tasktracker-subdomain') || 'ciphergate',
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
            setGeneratedKeyData(res.data.data);
            setShowSuccessModal(true);
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
                        onClick={() => {
                            setFormData(prev => ({
                                ...prev,
                                subdomain: prev.subdomain || localStorage.getItem('tasktracker-subdomain') || 'ciphergate'
                            }));
                            setShowCreateModal(true);
                        }}
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
                                        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200 group w-fit relative">
                                            <code className="text-xs font-mono text-blue-700">
                                                {apiKey.key ? `${apiKey.key.substring(0, 8)}...${apiKey.key.substring(apiKey.key.length - 4)}` : 'N/A'}
                                            </code>
                                            {apiKey.key && (
                                                <div className="relative flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(apiKey.key)}
                                                        className="text-gray-400 hover:text-blue-600 transition-colors mr-1"
                                                        title="Copy API Key Only"
                                                    >
                                                        {copiedKey === apiKey.key ? <FiCheck className="text-green-500" /> : <FiCopy size={14} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveDropdownId(activeDropdownId === apiKey._id ? null : apiKey._id)}
                                                        className="text-gray-400 hover:text-slate-700 transition-colors p-0.5 border-l border-gray-300"
                                                        title="Copy options (endpoints, code snippets)"
                                                    >
                                                        <FiChevronDown size={14} className={`transition-transform duration-200 ${activeDropdownId === apiKey._id ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {activeDropdownId === apiKey._id && (
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-40"
                                                                onClick={() => setActiveDropdownId(null)}
                                                            />
                                                            <div className="absolute right-0 mt-8 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-2 text-left animate-in fade-in slide-in-from-top-2 duration-150">
                                                                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                                                                    <label className="block text-[10px] font-bold text-slate-400 tracking-wider mb-1">Target Endpoint</label>
                                                                    <select
                                                                        value={selectedEndpoint}
                                                                        onChange={(e) => setSelectedEndpoint(e.target.value)}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
                                                                    >
                                                                        <option value="attendance">Attendance (/attendance)</option>
                                                                        <option value="report">Attendance Summary (/report)</option>
                                                                        <option value="invoices">Invoices (/invoices)</option>
                                                                        <option value="work_allocation">Work Allocation (/work-allocation)</option>
                                                                        <option value="workers">Workers List (/workers)</option>
                                                                        <option value="tasks">Tasks (/tasks)</option>
                                                                        <option value="leaves">Leaves (/leaves)</option>
                                                                        <option value="fines">Fines (/fines)</option>
                                                                        <option value="departments">Departments (/departments)</option>
                                                                        <option value="holidays">Holidays (/holidays)</option>
                                                                        <option value="tickets">Helpdesk Tickets (/tickets)</option>
                                                                        <option value="settings">Settings (/settings)</option>
                                                                    </select>
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            copyToClipboard(apiKey.key);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                                                                    >
                                                                        <FiCopy size={13} className="text-slate-400" />
                                                                        Copy Key Only (Without Endpoint)
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            copyCurlCommand(apiKey.key);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                                                                    >
                                                                        <FiTerminal size={13} className="text-slate-400" />
                                                                        Copy curl Command
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            copyEndpointUrl();
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                                                                    >
                                                                        <FiGlobe size={13} className="text-slate-400" />
                                                                        Copy Endpoint URL Only
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            copyAxiosRequest(apiKey.key);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                                                                    >
                                                                        <FiCode size={13} className="text-slate-400" />
                                                                        Copy Axios Snippet
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            copyFetchRequest(apiKey.key);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                                                                    >
                                                                        <FiCode size={13} className="text-slate-400" />
                                                                        Copy Fetch Snippet
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                                            {formatPermissions(apiKey.permissions).map(p => (
                                                <span key={p} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">
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
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[9999] animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between p-6 sm:p-7 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shrink-0 border-b border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500/15 rounded-2xl text-blue-400 border border-blue-400/20 shadow-inner shrink-0">
                                    <FiKey size={22} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-extrabold text-white tracking-tight !mb-0">
                                        Generate API Key
                                    </h3>
                                    <p className="text-slate-300 text-xs sm:text-sm mt-0.5 font-normal leading-relaxed">
                                        Issue a secure credential key for external integrations to authenticate programmatically.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-xl shrink-0 -mr-2 -mt-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Scrollable Modal Form Body */}
                        <form onSubmit={handleCreateKey} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 tracking-wider uppercase mb-1.5">Client / App Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Mobile App Team, Billing Integration"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal"
                                    value={formData.clientName}
                                    onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 tracking-wider uppercase mb-1.5">Tenant Subdomain</label>
                                <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 text-sm font-mono font-medium select-none">
                                    <FiGlobe className="text-slate-400 shrink-0" size={16} />
                                    <span>{formData.subdomain}</span>
                                    <span className="text-xs text-slate-400 font-sans font-normal ml-auto bg-slate-200/60 px-2.5 py-0.5 rounded-md">Default</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 tracking-wider uppercase mb-1.5">Key Lifespan</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-700 font-medium cursor-pointer"
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
                                    <label className="block text-xs font-bold text-slate-600 tracking-wider uppercase mb-1.5">Permission Profile</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-700 font-medium cursor-pointer"
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
                                <div className="space-y-3 mt-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 max-h-72 overflow-y-auto">
                                    <label className="block text-[10px] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Select Scopes</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {AVAILABLE_MODULES.map(module => (
                                            <div key={module.id} className="flex items-center justify-between p-3 bg-white border border-slate-200/60 rounded-xl hover:border-blue-300 transition-all shadow-2xs">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-800">{module.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">{module.id}</span>
                                                </div>
                                                <div className="flex gap-3">
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

                            {/* Form Action Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-6 py-2.5 text-slate-600 hover:text-slate-800 font-semibold hover:bg-slate-100 border border-slate-200 rounded-xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-7 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all text-sm"
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
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden p-7 animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
                                <FiAlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight !mb-2">Revoke API Key</h3>
                            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                                Are you sure you want to revoke this credentials key? This action is permanent and cannot be reversed.
                            </p>

                            {/* Hashed/Target details for security */}
                            {(() => {
                                const targetKey = keys.find(k => k._id === keyToDelete);
                                if (!targetKey) return null;
                                return (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-8 -mt-8 pointer-events-none" />
                                        <span className="block text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-1.5">Key to be revoked</span>
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
                                    className="flex-1 px-5 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteKey}
                                    className="flex-1 px-5 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/10 hover:shadow-red-500/25 transition-all text-sm"
                                >
                                    Yes, Revoke
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal (Generated Key) */}
            {showSuccessModal && generatedKeyData && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[9999] animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Success Header */}
                        <div className="flex items-start justify-between p-6 sm:p-7 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 text-white shrink-0 border-b border-emerald-500/30">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/15 rounded-2xl text-emerald-200 border border-white/20 shadow-inner shrink-0">
                                    <FiCheck size={22} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-extrabold text-white tracking-tight !mb-0">
                                        Key Generated Successfully!
                                    </h3>
                                    <p className="text-emerald-100 text-xs sm:text-sm mt-0.5 font-normal leading-relaxed">
                                        Your API key for <strong className="text-white font-semibold">{generatedKeyData.clientName}</strong> is ready.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSuccessModal(false)}
                                className="text-emerald-100 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-xl shrink-0 -mr-2 -mt-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                            {/* Key display field */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Your Secret API Key</label>
                                <div className="flex items-center justify-between gap-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 sm:p-5 font-mono text-sm sm:text-base text-slate-800 break-all select-all font-semibold relative group">
                                    <span className="text-blue-700">{generatedKeyData.key}</span>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(generatedKeyData.key)}
                                        className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shrink-0"
                                        title="Copy API Key"
                                    >
                                        {copiedKey === generatedKeyData.key ? <FiCheck className="text-green-500" size={18} /> : <FiCopy size={18} />}
                                    </button>
                                </div>
                                <p className="text-xs text-amber-700 font-medium flex items-center gap-2 mt-2.5 bg-amber-50 border border-amber-200/80 px-3.5 py-2.5 rounded-xl">
                                    <FiInfo size={16} className="shrink-0 text-amber-500" />
                                    Make sure to copy this key now. You will not be able to see the full key here again for security.
                                </p>
                            </div>

                            {/* Options to Copy with/without Endpoint */}
                            <div className="bg-slate-50/50 p-5 sm:p-6 rounded-2xl border border-slate-200/80 space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                                    <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">Quick Integration Snippets</span>
                                    <select
                                        value={selectedEndpoint}
                                        onChange={(e) => setSelectedEndpoint(e.target.value)}
                                        className="bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium shadow-2xs"
                                    >
                                        <option value="attendance">Attendance (/attendance)</option>
                                        <option value="report">Attendance Summary (/report)</option>
                                        <option value="invoices">Invoices (/invoices)</option>
                                        <option value="work_allocation">Work Allocation (/work-allocation)</option>
                                        <option value="workers">Workers List (/workers)</option>
                                        <option value="tasks">Tasks (/tasks)</option>
                                        <option value="leaves">Leaves (/leaves)</option>
                                        <option value="fines">Fines (/fines)</option>
                                        <option value="departments">Departments (/departments)</option>
                                        <option value="holidays">Holidays (/holidays)</option>
                                        <option value="tickets">Helpdesk Tickets (/tickets)</option>
                                        <option value="settings">Settings (/settings)</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => copyCurlCommand(generatedKeyData.key)}
                                        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-md rounded-xl text-left transition-all group"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                <FiTerminal size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">Copy curl Command</p>
                                                <p className="text-[11px] text-slate-400 font-medium">For terminal testing and command-line usage</p>
                                            </div>
                                        </div>
                                        <FiCopy size={15} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => copyEndpointUrl()}
                                        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-md rounded-xl text-left transition-all group"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                <FiGlobe size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">Copy Endpoint URL Only</p>
                                                <p className="text-[11px] text-slate-400 font-medium">Get the raw REST API target url</p>
                                            </div>
                                        </div>
                                        <FiCopy size={15} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => copyAxiosRequest(generatedKeyData.key)}
                                        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-md rounded-xl text-left transition-all group"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                <FiCode size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">Copy Axios Code Snippet</p>
                                                <p className="text-[11px] text-slate-400 font-medium">Ready-to-use JavaScript Axios request snippet</p>
                                            </div>
                                        </div>
                                        <FiCopy size={15} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowSuccessModal(false)}
                                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl shadow-md transition-all text-sm"
                            >
                                Done, I have saved the key
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiKeyManagement;
