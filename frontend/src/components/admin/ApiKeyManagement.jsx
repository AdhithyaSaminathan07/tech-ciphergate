import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiShield, 
    FiCalendar, FiActivity, FiToggleLeft, FiToggleRight 
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const ApiKeyManagement = () => {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [copiedKey, setCopiedKey] = useState('');
    
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
            const res = await axios.post('/api/admin/keys', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('API Key generated successfully!');
            setKeys([res.data.data, ...keys]);
            setShowCreateModal(false);
            setFormData({ ...formData, clientName: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate key');
        }
    };

    const handleDeleteKey = async (id) => {
        if (!window.confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/admin/keys/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setKeys(keys.filter(k => k._id !== id));
            toast.success('Key revoked');
        } catch (error) {
            toast.error('Failed to revoke key');
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
            <div className="max-w-6xl mx-auto">
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
                                        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200 group">
                                            <code className="text-xs font-mono text-blue-700">
                                                {apiKey.key.substring(0, 8)}...{apiKey.key.substring(apiKey.key.length - 4)}
                                            </code>
                                            <button 
                                                onClick={() => copyToClipboard(apiKey.key)}
                                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                            >
                                                {copiedKey === apiKey.key ? <FiCheck className="text-green-500" /> : <FiCopy size={14} />}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-1">
                                            {apiKey.permissions.map(p => (
                                                <span key={p} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
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
                                            onClick={() => handleDeleteKey(apiKey._id)}
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
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-blue-600 p-6 text-white">
                            <h2 className="text-xl font-bold flex items-center gap-2"><FiKey /> Generate API Key</h2>
                            <p className="text-blue-100 text-sm mt-1">Create a new secret key for external access.</p>
                        </div>
                        <form onSubmit={handleCreateKey} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Client/App Name</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="e.g. Mobile App Team"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={formData.clientName}
                                    onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Subdomain</label>
                                <input 
                                    type="text"
                                    required
                                    disabled
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500"
                                    value={formData.subdomain}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Expiry (Days)</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none"
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
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Permissions</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none"
                                        value={formData.permissions[0]}
                                        onChange={e => setFormData({ ...formData, permissions: [e.target.value] })}
                                    >
                                        <option value="read">Read Only</option>
                                        <option value="write">Read & Write</option>
                                        <option value="admin">Full Admin</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                                <button 
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md shadow-blue-200 transition-all"
                                >
                                    Generate
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiKeyManagement;
