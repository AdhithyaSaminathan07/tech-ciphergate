import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
    FiBookOpen, FiSearch, FiFileText, FiDownload, 
    FiInfo, FiCalendar, FiClock, FiCheckCircle 
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const EmployeeRulesView = () => {
    const [rules, setRules] = useState([]);
    const [history, setHistory] = useState([]);
    const [acceptances, setAcceptances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedVersion, setSelectedVersion] = useState('');
    const [versionsList, setVersionsList] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState({});

    useEffect(() => {
        const fetchRulesData = async () => {
            try {
                // Fetch active rules first
                const activeRes = await api.get('/rules/active');
                if (activeRes.data.success) {
                    setRules(activeRes.data.rules || []);
                    const currentV = activeRes.data.rulesConfig?.currentVersion || '1.0';
                    setSelectedVersion(currentV);
                }

                // Fetch rules history
                const historyRes = await api.get('/rules/history');
                if (historyRes.data.success) {
                    const allRules = historyRes.data.data || [];
                    setHistory(allRules);
                    
                    // Deduplicate version numbers
                    const versions = [...new Set(allRules.map(r => r.version))].sort((a, b) => b.localeCompare(a));
                    setVersionsList(versions);
                }

                // Fetch employee acceptance logs
                const acceptanceRes = await api.get('/rules/my-acceptances');
                if (acceptanceRes.data.success) {
                    setAcceptances(acceptanceRes.data.data || []);
                }
            } catch (err) {
                console.error('Error fetching employee rules data:', err);
                toast.error('Failed to load rules and regulations.');
            } finally {
                setLoading(false);
            }
        };

        fetchRulesData();
    }, []);

    // Filter rules based on search and selected version
    const displayedRules = history.filter(rule => {
        const matchesVersion = rule.version === selectedVersion && rule.status === 'active';
        const matchesSearch = searchQuery === '' || 
            rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rule.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rule.category.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesVersion && matchesSearch;
    });

    // Group displayed rules by category
    const groupedRules = displayedRules.reduce((acc, rule) => {
        if (!acc[rule.category]) {
            acc[rule.category] = [];
        }
        acc[rule.category].push(rule);
        return acc;
    }, {});

    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    };

    // Get current version details (for changelog display)
    const latestVersionRules = history.filter(r => r.version === selectedVersion);
    const changelogText = latestVersionRules.find(r => r.changeLog)?.changeLog || '';

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                    <p className="mt-3 text-slate-500 font-medium">Loading Rules Book...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 p-1 sm:p-2 select-none print:p-0 print:bg-white print:text-black">
            {/* Header section (Hidden on print) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md border border-slate-200/60 p-6 rounded-2xl shadow-sm print:hidden">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-500/10 p-3.5 rounded-xl border border-blue-500/15 text-blue-600">
                        <FiBookOpen size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Company Rules & Regulations</h1>
                        <p className="text-sm text-slate-500">View and print current or historical organization policies</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 self-stretch md:self-auto">
                    {/* Version Selector */}
                    <div className="flex items-center gap-2 flex-1 md:flex-initial">
                        <label className="text-xs font-semibold text-slate-500 whitespace-nowrap uppercase tracking-wider">Version:</label>
                        <select
                            value={selectedVersion}
                            onChange={(e) => setSelectedVersion(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            {versionsList.map(v => (
                                <option key={v} value={v}>v{v}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handlePrint}
                        className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                    >
                        <FiDownload size={16} />
                        <span>Print PDF</span>
                    </button>
                </div>
            </div>

            {/* Print Header (Only visible on print) */}
            <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">CipherGate Company Rules & Regulations</h1>
                <div className="flex justify-between items-center text-sm text-slate-500 mt-2">
                    <span>Document Version: <strong>v{selectedVersion}</strong></span>
                    <span>Printed on: {new Date().toLocaleDateString()}</span>
                </div>
            </div>

            {/* Grid Layout: Main Rules content & Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left Side: Category Accordion Viewer */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Search bar (Hidden on print) */}
                    <div className="relative print:hidden">
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search policies by keyword or category..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm transition-all"
                        />
                    </div>

                    {/* Rules List grouped by Category */}
                    {Object.keys(groupedRules).length > 0 ? (
                        Object.entries(groupedRules).map(([category, items]) => {
                            const isCollapsed = expandedCategories[category];
                            return (
                                <div 
                                    key={category} 
                                    className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 print:shadow-none print:border-none print:bg-transparent"
                                >
                                    {/* Category Header */}
                                    <button
                                        onClick={() => toggleCategory(category)}
                                        className="w-full px-6 py-4.5 bg-slate-50/50 hover:bg-slate-50 border-b border-slate-100 flex items-center justify-between text-left transition-colors print:pointer-events-none print:bg-transparent print:border-b-2 print:border-slate-300 print:px-0"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-1.5 h-6 bg-blue-500 rounded-full print:hidden"></span>
                                            <h3 className="text-md font-bold text-slate-800 uppercase tracking-wide print:text-lg print:text-black">
                                                {category}
                                            </h3>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-450 bg-slate-200/50 px-2.5 py-1 rounded-full print:hidden">
                                            {items.length} {items.length === 1 ? 'policy' : 'policies'}
                                        </span>
                                    </button>

                                    {/* Category Items */}
                                    {!isCollapsed && (
                                        <div className="divide-y divide-slate-100 p-6 space-y-8 print:p-0 print:divide-y-0 print:space-y-8">
                                            {items.map((rule, index) => (
                                                <div 
                                                    key={rule._id} 
                                                    className={`pt-1 first:pt-0 ${index > 0 ? 'print:page-break-before-auto print:mt-6' : ''}`}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <h4 className="text-md font-bold text-slate-900 print:text-black">
                                                            {rule.title}
                                                        </h4>
                                                        {rule.severity && (
                                                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border print:hidden ${
                                                                rule.severity === 'critical'
                                                                    ? 'bg-rose-50 border-rose-150 text-rose-600'
                                                                    : rule.severity === 'high'
                                                                    ? 'bg-amber-50 border-amber-150 text-amber-600'
                                                                    : 'bg-emerald-50 border-emerald-150 text-emerald-600'
                                                            }`}>
                                                                {rule.severity}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="mt-3.5 text-slate-650 leading-relaxed font-normal print:text-slate-800">
                                                        <div dangerouslySetInnerHTML={{ __html: rule.content }} />
                                                    </div>

                                                    {rule.attachments && rule.attachments.length > 0 && (
                                                        <div className="mt-4 pt-3 flex flex-wrap gap-2 print:hidden">
                                                            {rule.attachments.map((fileUrl, fileIdx) => {
                                                                const fileName = fileUrl.split('/').pop() || 'Attachment';
                                                                return (
                                                                    <a
                                                                        key={fileIdx}
                                                                        href={`${import.meta.env.VITE_API_URL}${fileUrl}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 hover:bg-slate-100 text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                                                    >
                                                                        <FiFileText size={12} />
                                                                        <span>{fileName}</span>
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="bg-white border border-slate-250 p-12 text-center rounded-2xl flex flex-col items-center justify-center">
                            <FiBookOpen size={48} className="text-slate-300 mb-3" />
                            <h3 className="font-bold text-slate-800">No policies found</h3>
                            <p className="text-sm text-slate-500 mt-1">There are no policies corresponding to version {selectedVersion} matching your search.</p>
                        </div>
                    )}
                </div>

                {/* Right Side: Version Amendments Changelog & Audit Logs (Hidden on print) */}
                <div className="lg:col-span-4 space-y-6 print:hidden">
                    
                    {/* Highlights / Changelog Box */}
                    {changelogText && (
                        <div className="bg-amber-50/50 border border-amber-250 p-6 rounded-2xl space-y-3">
                            <div className="flex items-center gap-2 text-amber-800">
                                <FiInfo size={20} className="fill-amber-100 stroke-[2.5]" />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Amendments in v{selectedVersion}</h3>
                            </div>
                            <p className="text-sm text-amber-700 leading-relaxed font-medium">
                                {changelogText}
                            </p>
                        </div>
                    )}

                    {/* Agreement Audit Log Card */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-850 flex items-center gap-2.5">
                            <FiClock className="text-blue-500" />
                            <span>My Acceptance History</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                            A list of rules and regulations you have formally reviewed and agreed to since joining.
                        </p>

                        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                            {acceptances.length > 0 ? (
                                acceptances.map(log => (
                                    <div 
                                        key={log._id}
                                        className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-start gap-3"
                                    >
                                        <div className="text-emerald-500 mt-0.5">
                                            <FiCheckCircle size={16} className="fill-emerald-50" />
                                        </div>
                                        <div className="flex-1 space-y-0.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-slate-800">Version {log.rulesVersion}</span>
                                                <span className="text-[10px] font-semibold text-slate-450 bg-slate-200/50 px-2 py-0.5 rounded">
                                                    AGREED
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                                <FiCalendar size={10} />
                                                <span>{new Date(log.acceptedAt).toLocaleDateString()}</span>
                                                <span>&bull;</span>
                                                <span>{new Date(log.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                                IP: {log.ipAddress}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-slate-400 text-xs">
                                    No acceptance logs found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Custom Print Style injection */}
            <style>{`
                @media print {
                    body {
                        background: white !important;
                        color: black !important;
                    }
                    .custom-main-scroll {
                        overflow: visible !important;
                        height: auto !important;
                    }
                    main {
                        padding: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default EmployeeRulesView;
