import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Switch } from '../ui/switch';
import SafeHTML from '../common/SafeHTML';
import { 
    FiBookOpen, FiActivity, FiUsers, FiSettings, FiPlus, 
    FiEdit2, FiArchive, FiCheck, FiSearch, FiMail, 
    FiDownload, FiArrowRight, FiFileText, FiChevronDown, 
    FiChevronUp, FiX, FiCheckCircle, FiAlertCircle 
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const CATEGORIES = [
    'General Info',
    'Attendance & Timings',
    'Leave Policy',
    'Confidentiality & Security',
    'Ethics & Code of Conduct',
    'AI & Technology Usage',
    'Health & Safety'
];

const AdminRulesDashboard = () => {
    // Tabs state
    const [activeTab, setActiveTab] = useState('rules'); // 'rules', 'monitoring', 'config'
    
    // Core data state
    const [rules, setRules] = useState([]);
    const [stats, setStats] = useState({
        totalRules: 0,
        activeRulesCount: 0,
        totalWorkers: 0,
        acceptedWorkersCount: 0,
        pendingWorkersCount: 0,
        acceptanceRate: 0,
        currentVersion: '1.0',
        lastUpdated: new Date()
    });
    const [acceptances, setAcceptances] = useState([]);
    const [config, setConfig] = useState({
        forceAcceptance: true,
        scrollValidation: true,
        allowPdfDownload: true,
        requireCheckbox: true,
        autoNotify: true,
        gracePeriodDays: 0,
        mobileAcceptance: true
    });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search and Filter states
    const [rulesSearch, setRulesSearch] = useState('');
    const [rulesCategoryFilter, setRulesCategoryFilter] = useState('');
    const [monitorSearch, setMonitorSearch] = useState('');
    const [monitorStatusFilter, setMonitorStatusFilter] = useState('');
    const [monitorDeptFilter, setMonitorDeptFilter] = useState('');
    const [departments, setDepartments] = useState([]);

    // Modal / Form states
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [isSavingRule, setIsSavingRule] = useState(false);
    
    // Create/Edit rule form states
    const [ruleForm, setRuleForm] = useState({
        title: '',
        category: CATEGORIES[0],
        content: '',
        severity: 'medium',
        changeLog: '',
        isMajor: false,
        attachments: []
    });
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [previewHtml, setPreviewHtml] = useState(false);

    // Initial Fetch
    useEffect(() => {
        fetchDashboardData();
        fetchDepartments();
    }, []);

    const fetchDashboardData = async () => {
        setRefreshing(true);
        try {
            // 1. Fetch Stats
            const statsRes = await api.get('/rules/admin/dashboard');
            if (statsRes.data.success) {
                setStats(statsRes.data.stats);
            }

            // 2. Fetch Rules (History contains all rules)
            const rulesRes = await api.get('/rules/history');
            if (rulesRes.data.success) {
                setRules(rulesRes.data.data || []);
            }

            // 3. Fetch Acceptances Monitoring List
            const acceptRes = await api.get('/rules/acceptances');
            if (acceptRes.data.success) {
                setAcceptances(acceptRes.data.acceptances || []);
            }

            // 4. Fetch Active Rules config
            const activeRes = await api.get('/rules/active');
            if (activeRes.data.success) {
                setConfig(activeRes.data.rulesConfig || {
                    forceAcceptance: true,
                    scrollValidation: true,
                    allowPdfDownload: true,
                    requireCheckbox: true,
                    autoNotify: true,
                    gracePeriodDays: 0,
                    mobileAcceptance: true
                });
            }
        } catch (err) {
            console.error('Error fetching admin rules data:', err);
            toast.error('Failed to load rules management details.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get('/departments');
            // Assuming data is an array of departments or has a departments key
            setDepartments(data.departments || data || []);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

    // Save Rule Configuration
    const handleSaveConfig = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.put('/rules/admin/config', config);
            if (data.success) {
                toast.success('Configuration updated successfully!');
                fetchDashboardData();
            }
        } catch (err) {
            console.error('Error updating rules configuration:', err);
            toast.error('Failed to save configuration settings.');
        }
    };

    // Initialize create/edit modal
    const openRuleModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setRuleForm({
                title: rule.title,
                category: rule.category,
                content: rule.content,
                severity: rule.severity || 'medium',
                changeLog: rule.changeLog || '',
                isMajor: false,
                attachments: rule.attachments || []
            });
        } else {
            setEditingRule(null);
            setRuleForm({
                title: '',
                category: CATEGORIES[0],
                content: '',
                severity: 'medium',
                changeLog: '',
                isMajor: false,
                attachments: []
            });
        }
        setSelectedFiles([]);
        setPreviewHtml(false);
        setShowRuleModal(true);
    };

    const handleFileChange = (e) => {
        setSelectedFiles(Array.from(e.target.files));
    };

    // HTML tag inserter helper
    const insertHtmlTag = (tag) => {
        const textarea = document.getElementById('rule-content-textarea');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = ruleForm.content;
        const selected = text.substring(start, end);
        
        let replacement = '';
        if (tag === 'p') replacement = `<p>${selected}</p>`;
        else if (tag === 'b') replacement = `<strong>${selected}</strong>`;
        else if (tag === 'i') replacement = `<em>${selected}</em>`;
        else if (tag === 'ul') replacement = `<ul>\n  <li>${selected || 'Item 1'}</li>\n  <li>Item 2</li>\n</ul>`;
        else if (tag === 'li') replacement = `<li>${selected}</li>`;
        else if (tag === 'h4') replacement = `<h4>${selected || 'Subheading'}</h4>`;
        
        const newContent = text.substring(0, start) + replacement + text.substring(end);
        setRuleForm({ ...ruleForm, content: newContent });
        
        // Refocus textarea
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length + 2, start + tag.length + 2 + selected.length);
        }, 50);
    };

    // Save rule submission
    const handleSaveRule = async (e) => {
        e.preventDefault();
        if (!ruleForm.title.trim() || !ruleForm.content.trim()) {
            toast.error('Title and Content are required.');
            return;
        }

        setIsSavingRule(true);
        try {
            const formData = new FormData();
            formData.append('title', ruleForm.title.trim());
            formData.append('category', ruleForm.category);
            formData.append('content', ruleForm.content.trim());
            formData.append('severity', ruleForm.severity);
            formData.append('changeLog', ruleForm.changeLog.trim());
            formData.append('isMajor', ruleForm.isMajor);
            
            selectedFiles.forEach(file => {
                formData.append('attachments', file);
            });

            let res;
            if (editingRule) {
                res = await api.put(`/rules/${editingRule._id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                res = await api.post('/rules', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            if (res.data.success) {
                toast.success(editingRule ? 'Rule updated successfully!' : 'Rule created successfully!');
                setShowRuleModal(false);
                fetchDashboardData();
            }
        } catch (err) {
            console.error('Error saving rule:', err);
            toast.error(err.response?.data?.message || 'Failed to save policy rule.');
        } finally {
            setIsSavingRule(false);
        }
    };

    // Archive / delete rule
    const handleArchiveRule = async (ruleId) => {
        if (!window.confirm('Are you sure you want to archive this rule? It will no longer display as an active policy.')) return;
        
        try {
            const res = await api.delete(`/rules/${ruleId}`);
            if (res.data.success) {
                toast.success('Rule archived successfully!');
                fetchDashboardData();
            }
        } catch (err) {
            console.error('Error archiving rule:', err);
            toast.error('Failed to archive rule.');
        }
    };

    // Trigger Notification reminders
    const handleSendReminder = async (employeeId = null) => {
        try {
            const res = await api.post('/rules/remind', { employeeId });
            if (res.data.success) {
                toast.success(res.data.message);
                fetchDashboardData();
            }
        } catch (err) {
            console.error('Error sending reminder:', err);
            toast.error('Failed to dispatch notifications.');
        }
    };

    // CSV Exporter
    const handleExportCSV = () => {
        const headers = ['Developer Name', 'Username', 'Email', 'Department', 'Status', 'Accepted Version', 'Accepted At', 'IP Address', 'Device Info'];
        const rows = filteredAcceptances.map(a => [
            a.name,
            a.username,
            a.email,
            a.department,
            a.acceptedStatus,
            a.acceptedRulesVersion === '0' ? 'None' : `v${a.acceptedRulesVersion}`,
            a.acceptedAt ? new Date(a.acceptedAt).toLocaleString() : 'N/A',
            a.ipAddress,
            a.deviceInfo.replace(/,/g, ';') // Avoid commas in device details
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Rules_Acceptance_v${stats.currentVersion}_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filters for Rules Book
    const filteredRules = rules.filter(r => {
        const matchesCategory = !rulesCategoryFilter || r.category === rulesCategoryFilter;
        const matchesSearch = !rulesSearch || 
            r.title.toLowerCase().includes(rulesSearch.toLowerCase()) ||
            r.content.toLowerCase().includes(rulesSearch.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Filters for Monitoring
    const filteredAcceptances = acceptances.filter(a => {
        const matchesSearch = !monitorSearch || 
            a.name.toLowerCase().includes(monitorSearch.toLowerCase()) ||
            a.username.toLowerCase().includes(monitorSearch.toLowerCase());
        const matchesStatus = !monitorStatusFilter || a.acceptedStatus === monitorStatusFilter;
        
        let matchesDept = true;
        if (monitorDeptFilter) {
            matchesDept = a.department && a.department.toLowerCase() === monitorDeptFilter.toLowerCase();
        }
        return matchesSearch && matchesStatus && matchesDept;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
                    <p className="mt-3 text-slate-500 font-medium">Loading rules console...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            
            {/* Header section with Stats summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rules & Regulations Management</h1>
                    <p className="text-sm text-slate-500">Configure corporate policy handbooks, enforce agreements, and monitor compliance logs</p>
                </div>
                
                <button
                    onClick={() => openRuleModal()}
                    className="flex items-center justify-center gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                >
                    <FiPlus size={18} />
                    <span>Create Policy Rule</span>
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500 tracking-wider">Active Rules Book</span>
                        <div className="text-2xl font-bold text-slate-800">{stats.activeRulesCount} <span className="text-xs text-slate-400 font-normal">/ {stats.totalRules} total</span></div>
                        <p className="text-[10px] text-slate-450">Active on version v{stats.currentVersion}</p>
                    </div>
                    <div className="bg-teal-500/10 p-3 rounded-xl border border-teal-500/15 text-teal-600">
                        <FiBookOpen size={24} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500 tracking-wider">Enforcement Version</span>
                        <div className="text-2xl font-bold text-slate-800">v{stats.currentVersion}</div>
                        <p className="text-[10px] text-slate-450">Last updated: {new Date(stats.lastUpdated).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/15 text-blue-600">
                        <FiActivity size={24} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500 tracking-wider">Acceptance Rate</span>
                        <div className="text-2xl font-bold text-slate-800">{stats.acceptanceRate}%</div>
                        <p className="text-[10px] text-emerald-600 font-semibold">{stats.acceptedWorkersCount} of {stats.totalWorkers} developers</p>
                    </div>
                    <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/15 text-emerald-600">
                        <FiCheckCircle size={24} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500 tracking-wider">Pending Reminders</span>
                        <div className="text-2xl font-bold text-slate-800">{stats.pendingWorkersCount}</div>
                        <p className="text-[10px] text-rose-500 font-semibold">Action required</p>
                    </div>
                    <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/15 text-rose-600">
                        <FiUsers size={24} />
                    </div>
                </div>
            </div>

            {/* Inner Dashboard Navigation Tabs */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-2 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setActiveTab('rules')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${ activeTab === 'rules' ? 'border-[#0d9488] text-[#0d9488]' : 'border-transparent text-slate-505 hover:text-slate-800' }`}
                        >
                            <FiBookOpen size={16} />
                            <span>Rules Manager</span>
                        </button>
                        
                        <button
                            onClick={() => setActiveTab('monitoring')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${ activeTab === 'monitoring' ? 'border-[#0d9488] text-[#0d9488]' : 'border-transparent text-slate-505 hover:text-slate-800' }`}
                        >
                            <FiUsers size={16} />
                            <span>Acceptance Monitoring</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('config')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${ activeTab === 'config' ? 'border-[#0d9488] text-[#0d9488]' : 'border-transparent text-slate-505 hover:text-slate-800' }`}
                        >
                            <FiSettings size={16} />
                            <span>Config Settings</span>
                        </button>
                    </div>

                    <button 
                        onClick={fetchDashboardData}
                        disabled={refreshing}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-all"
                    >
                        {refreshing ? 'Refreshing...' : 'Sync Logs'}
                    </button>
                </div>

                <div className="p-6">
                    {/* TAB 1: RULES MANAGER */}
                    {activeTab === 'rules' && (
                        <div className="space-y-6">
                            {/* Filter Section */}
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="relative flex-1">
                                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search policy database by title or content..."
                                        value={rulesSearch}
                                        onChange={(e) => setRulesSearch(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-inner"
                                    />
                                </div>
                                <select
                                    value={rulesCategoryFilter}
                                    onChange={(e) => setRulesCategoryFilter(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                                >
                                    <option value="">All Categories</option>
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Rules Table */}
                            <div className="border border-slate-150 rounded-xl overflow-hidden shadow-inner">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-150">
                                            <th className="px-6 py-4">Title & Details</th>
                                            <th className="px-6 py-4">Category</th>
                                            <th className="px-6 py-4">Version</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Priority</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {filteredRules.length > 0 ? (
                                            filteredRules.map(rule => (
                                                <tr key={rule._id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="space-y-0.5">
                                                            <div className="font-bold text-slate-800 leading-snug">{rule.title}</div>
                                                            {rule.changeLog && (
                                                                <div className="text-[10px] text-slate-450 flex items-center gap-1">
                                                                    <span className="font-bold text-amber-600">v{rule.version} update:</span>
                                                                    <span className="truncate max-w-[250px]">{rule.changeLog}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-505 font-medium">{rule.category}</td>
                                                    <td className="px-6 py-4"><span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">v{rule.version}</span></td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${ rule.status === 'active' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-450' }`}>
                                                            {rule.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border ${ rule.severity === 'critical' ? 'bg-rose-50 border-rose-150 text-rose-600' : rule.severity === 'high' ? 'bg-amber-50 border-amber-150 text-amber-600' : 'bg-emerald-50 border-emerald-150 text-emerald-600' }`}>
                                                            {rule.severity || 'medium'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => openRuleModal(rule)}
                                                                className="p-1.5 hover:bg-slate-100 text-slate-505 hover:text-slate-800 rounded-lg transition-colors"
                                                                title="Edit policy details"
                                                            >
                                                                <FiEdit2 size={15} />
                                                            </button>
                                                            {rule.status === 'active' && (
                                                                <button
                                                                    onClick={() => handleArchiveRule(rule._id)}
                                                                    className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors"
                                                                    title="Archive policy"
                                                                >
                                                                    <FiArchive size={15} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="6" className="text-center py-10 text-slate-400">
                                                    No corporate policies found matching filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: ACCEPTANCE MONITORING */}
                    {activeTab === 'monitoring' && (
                        <div className="space-y-6">
                            {/* Filter Section */}
                            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                                <div className="relative flex-1">
                                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search developers by name or username..."
                                        value={monitorSearch}
                                        onChange={(e) => setMonitorSearch(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-inner"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={monitorStatusFilter}
                                        onChange={(e) => setMonitorStatusFilter(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                                    >
                                        <option value="">All Statuses</option>
                                        <option value="Accepted">Accepted</option>
                                        <option value="Pending">Pending</option>
                                    </select>
                                    <select
                                        value={monitorDeptFilter}
                                        onChange={(e) => setMonitorDeptFilter(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                                    >
                                        <option value="">All Departments</option>
                                        {departments.map(d => (
                                            <option key={d._id} value={d.name}>{d.name}</option>
                                        ))}
                                    </select>
                                    
                                    <button
                                        onClick={handleExportCSV}
                                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-650 hover:text-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm"
                                        title="Export listed developers to CSV"
                                    >
                                        <FiDownload size={16} />
                                        <span>Export CSV</span>
                                    </button>
                                    
                                    <button
                                        onClick={() => handleSendReminder()}
                                        className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm"
                                        title="Send reminders to all pending workers"
                                    >
                                        <FiMail size={16} />
                                        <span>Remind All Pending</span>
                                    </button>
                                </div>
                            </div>

                            {/* Monitoring List */}
                            <div className="border border-slate-150 rounded-xl overflow-hidden shadow-inner">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-150">
                                            <th className="px-6 py-4">Developer</th>
                                            <th className="px-6 py-4">Department</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Version</th>
                                            <th className="px-6 py-4">Signed Date</th>
                                            <th className="px-6 py-4">IP & Device Audit</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {filteredAcceptances.length > 0 ? (
                                            filteredAcceptances.map(row => (
                                                <tr key={row._id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="space-y-0.5">
                                                            <div className="font-bold text-slate-800">{row.name}</div>
                                                            <div className="text-[10px] text-slate-400">@{row.username} &bull; {row.email}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-505 font-medium">{row.department}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${ row.acceptedStatus === 'Accepted' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700' }`}>
                                                            {row.acceptedStatus}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-150 px-2 py-0.5 rounded">
                                                            {row.acceptedRulesVersion === '0' ? 'None' : `v${row.acceptedRulesVersion}`}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-505">
                                                        {row.acceptedAt ? (
                                                            <div className="space-y-0.5">
                                                                <div className="font-semibold">{new Date(row.acceptedAt).toLocaleDateString()}</div>
                                                                <div className="text-[10px] text-slate-400">{new Date(row.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                            </div>
                                                        ) : 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-505 max-w-[220px] truncate">
                                                        <div className="space-y-0.5">
                                                            <div className="text-xs font-semibold">IP: {row.ipAddress}</div>
                                                            <div className="text-[10px] text-slate-400 truncate" title={row.deviceInfo}>OS: {row.deviceInfo}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {row.acceptedStatus === 'Pending' && (
                                                            <button
                                                                onClick={() => handleSendReminder(row._id)}
                                                                className="bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                                                title="Send push reminder to worker"
                                                            >
                                                                Remind
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="7" className="text-center py-10 text-slate-400">
                                                    No developers match selected filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: CONFIGURATION SETTINGS */}
                    {activeTab === 'config' && (
                        <form onSubmit={handleSaveConfig} className="max-w-2xl space-y-6">
                            <h3 className="text-lg font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
                                <FiSettings className="text-[#0d9488]" />
                                <span>Policy Rules Enforcement Config</span>
                            </h3>

                            {/* Force Acceptance Check */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="forceAcceptance"
                                        checked={config.forceAcceptance}
                                        onChange={(e) => setConfig({ ...config, forceAcceptance: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="forceAcceptance" className="font-bold text-slate-800 text-sm cursor-pointer">Enforce Rules Acceptance Gate</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        If active, developers with outdated rule versions are locked out of dashboard modules and redirected to rules acceptance onboarding screen.
                                    </p>
                                </div>
                            </div>

                            {/* Scroll Validation Check */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="scrollValidation"
                                        checked={config.scrollValidation}
                                        onChange={(e) => setConfig({ ...config, scrollValidation: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="scrollValidation" className="font-bold text-slate-800 text-sm cursor-pointer">Require Scroll-to-End Validation</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        Detects developer scroll height. Acceptance agreement check box will remain locked until they scroll completely to the bottom of policy outlines.
                                    </p>
                                </div>
                            </div>

                            {/* Require checkbox */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="requireCheckbox"
                                        checked={config.requireCheckbox}
                                        onChange={(e) => setConfig({ ...config, requireCheckbox: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="requireCheckbox" className="font-bold text-slate-800 text-sm cursor-pointer">Require Terms Agreement Checkbox</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        Forces developers to explicitly select the agreement checkbox before clicking "Accept & Continue".
                                    </p>
                                </div>
                            </div>

                            {/* Allow PDF Download */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="allowPdfDownload"
                                        checked={config.allowPdfDownload}
                                        onChange={(e) => setConfig({ ...config, allowPdfDownload: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="allowPdfDownload" className="font-bold text-slate-800 text-sm cursor-pointer">Enable PDF Download & Printing</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        Allows employees to view a printer-friendly version of the rules and print or save it as a local PDF document.
                                    </p>
                                </div>
                            </div>

                            {/* Auto Notify */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="autoNotify"
                                        checked={config.autoNotify}
                                        onChange={(e) => setConfig({ ...config, autoNotify: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="autoNotify" className="font-bold text-slate-800 text-sm cursor-pointer">Auto Dispatch Push Notifications & Emails</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        Sends automated system alerts and web push reminders to workers when major rule versions are launched.
                                    </p>
                                </div>
                            </div>

                            {/* Mobile Acceptance */}
                            <div className="flex items-start gap-4">
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="mobileAcceptance"
                                        checked={config.mobileAcceptance}
                                        onChange={(e) => setConfig({ ...config, mobileAcceptance: e.target.checked })}
                                        className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-0.5">
                                    <label htmlFor="mobileAcceptance" className="font-bold text-slate-800 text-sm cursor-pointer">Enforce Verification on Mobile Devices</label>
                                    <p className="text-xs text-slate-450 leading-relaxed">
                                        Applies the onboarding rules block to mobile browser environments. Disabling it clears rules acceptance constraints for mobile screens.
                                    </p>
                                </div>
                            </div>

                            {/* Grace Period slider */}
                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between items-center text-sm">
                                    <label htmlFor="gracePeriodDays" className="font-bold text-slate-800">Major Version Grace Period (Days)</label>
                                    <span className="font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">{config.gracePeriodDays} days</span>
                                </div>
                                <input
                                    type="range"
                                    id="gracePeriodDays"
                                    min="0"
                                    max="30"
                                    value={config.gracePeriodDays}
                                    onChange={(e) => setConfig({ ...config, gracePeriodDays: parseInt(e.target.value) })}
                                    className="w-full accent-teal-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <p className="text-[11px] text-slate-400">
                                    Amount of days workers are allowed to access dashboard modules after a major rules version updates before being forced to accept. Set to 0 for instant enforcement.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <button
                                    type="submit"
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
                                >
                                    Save Configuration
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            {/* RULE EDITING / CREATING MODAL */}
            {showRuleModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
                        {/* Modal Header */}
                        <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editingRule ? `Edit Policy Rule: ${editingRule.title}` : 'Add Corporate Policy Rule'}
                            </h2>
                            <button
                                onClick={() => setShowRuleModal(false)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        {/* Modal Body Form */}
                        <form onSubmit={handleSaveRule} className="flex-1 overflow-y-auto p-6 space-y-6">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Rule Title</label>
                                    <input
                                        type="text"
                                        value={ruleForm.title}
                                        onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                                        placeholder="e.g. Weekly Work Hours & Check-ins"
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-555 shadow-inner"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Category</label>
                                    <select
                                        value={ruleForm.category}
                                        onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-555 cursor-pointer"
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Rule Severity</label>
                                    <select
                                        value={ruleForm.severity}
                                        onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-555 cursor-pointer"
                                    >
                                        <option value="low">Low Priority</option>
                                        <option value="medium">Medium Priority</option>
                                        <option value="high">High Priority</option>
                                        <option value="critical">Critical (Mandatory Alert)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Attachments (PDF, Doc)</label>
                                    <input
                                        type="file"
                                        multiple
                                        onChange={handleFileChange}
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-2 text-sm text-slate-650 focus:ring-2 focus:ring-teal-555 cursor-pointer file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-500/10 file:text-teal-700 hover:file:bg-teal-500/20"
                                    />
                                    {ruleForm.attachments.length > 0 && (
                                        <div className="text-[10px] text-slate-450 italic mt-1">
                                            Currently has {ruleForm.attachments.length} attachments saved.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Content Editor area */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Policy Content (HTML Format)</label>
                                    <div className="flex items-center gap-1.5 print:hidden">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewHtml(!previewHtml)}
                                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded border border-slate-200 transition-all"
                                        >
                                            {previewHtml ? 'Edit Source' : 'Preview Layout'}
                                        </button>
                                    </div>
                                </div>

                                {/* Text Formatter Buttons (HTML Helpers) */}
                                {!previewHtml && (
                                    <div className="flex flex-wrap gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-lg text-xs">
                                        <button type="button" onClick={() => insertHtmlTag('p')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold">Paragraph</button>
                                        <button type="button" onClick={() => insertHtmlTag('b')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold">Bold</button>
                                        <button type="button" onClick={() => insertHtmlTag('i')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded italic font-bold">Italic</button>
                                        <button type="button" onClick={() => insertHtmlTag('ul')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold">Bulleted List</button>
                                        <button type="button" onClick={() => insertHtmlTag('li')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold">List Item</button>
                                        <button type="button" onClick={() => insertHtmlTag('h4')} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold">Subheading</button>
                                    </div>
                                )}

                                {/* Editor textarea / Preview Pane */}
                                {previewHtml ? (
                                    <div className="border border-slate-250 rounded-xl p-4 bg-slate-50 min-h-[160px] max-h-[300px] overflow-y-auto text-sm text-slate-700 leading-relaxed prose prose-emerald max-w-none">
                                        {ruleForm.content ? (
                                            <SafeHTML html={ruleForm.content} />
                                        ) : (
                                            <p className="text-slate-400 italic">No content written yet.</p>
                                        )}
                                    </div>
                                ) : (
                                    <textarea
                                        id="rule-content-textarea"
                                        rows={7}
                                        value={ruleForm.content}
                                        onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })}
                                        placeholder="<p>Provide details of the policy, including lists, criteria, guidelines, etc.</p>"
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl p-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-555 font-mono shadow-inner resize-y"
                                        required
                                    />
                                )}
                            </div>

                            {/* Version Controls Section */}
                            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                                <h3 className="text-sm font-bold text-slate-800">Versioning & Updates</h3>
                                
                                <div className="flex items-start gap-4">
                                    <div className="pt-0.5">
                                        <input
                                            type="checkbox"
                                            id="isMajor"
                                            checked={ruleForm.isMajor}
                                            onChange={(e) => setRuleForm({ ...ruleForm, isMajor: e.target.checked })}
                                            className="w-4 h-4 text-[#0d9488] border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-0.5">
                                        <label htmlFor="isMajor" className="font-bold text-slate-850 text-sm cursor-pointer">Publish as a Major Version Bump</label>
                                        <p className="text-[11px] text-slate-450 leading-relaxed">
                                            If checked, this will increment the company rules version (e.g. v1.1 &rarr; v2.0). All employees will be forced to re-accept the new handbook on login.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-650 tracking-wider">Update Changelog (Optional)</label>
                                    <input
                                        type="text"
                                        value={ruleForm.changeLog}
                                        onChange={(e) => setRuleForm({ ...ruleForm, changeLog: e.target.value })}
                                        placeholder="e.g. Added section regarding AI coding helpers and copyright safety."
                                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-2.5 text-sm text-slate-750 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-555 shadow-inner"
                                    />
                                    <p className="text-[10px] text-slate-400 italic">
                                        Brief summary of amendments to display on employee dashboards.
                                    </p>
                                </div>
                            </div>

                            {/* Modal Footer Controls */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowRuleModal(false)}
                                    className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-750 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingRule}
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow flex items-center gap-2"
                                >
                                    {isSavingRule ? (
                                        <>
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <span>Publish Policy</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRulesDashboard;
