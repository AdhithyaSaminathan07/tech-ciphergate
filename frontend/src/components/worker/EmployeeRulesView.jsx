import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
    FiBookOpen, FiSearch, FiFileText, FiDownload, 
    FiInfo, FiCalendar, FiClock, FiCheckCircle,
    FiChevronDown, FiChevronUp
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import SafeHTML from '../common/SafeHTML';

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
                const activeRes = await api.get('/rules/active');
                if (activeRes.data.success) {
                    setRules(activeRes.data.rules || []);
                    const currentV = activeRes.data.rulesConfig?.currentVersion || '1.0';
                    setSelectedVersion(currentV);
                }

                const historyRes = await api.get('/rules/history');
                if (historyRes.data.success) {
                    const allRules = historyRes.data.data || [];
                    setHistory(allRules);
                    const versions = [...new Set(allRules.map(r => r.version))].sort((a, b) => b.localeCompare(a));
                    setVersionsList(versions);
                }

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

    const displayedRules = history.filter(rule => {
        const matchesVersion = rule.version === selectedVersion && rule.status === 'active';
        const matchesSearch = searchQuery === '' || 
            rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rule.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rule.category.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesVersion && matchesSearch;
    });

    const groupedRules = displayedRules.reduce((acc, rule) => {
        if (!acc[rule.category]) acc[rule.category] = [];
        acc[rule.category].push(rule);
        return acc;
    }, {});

    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    };

    const latestVersionRules = history.filter(r => r.version === selectedVersion);
    const changelogText = latestVersionRules.find(r => r.changeLog)?.changeLog || '';

    const handlePrint = () => window.print();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                    <p className="text-slate-500 font-medium text-sm">Loading Rules Book...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6 px-0 select-none print:p-0 print:bg-white print:text-black">

            {/* ── Header ── */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-sm p-4 sm:p-6 print:hidden">
                {/* Top row: icon + title */}
                <div className="flex items-start gap-3 sm:gap-4 mb-4">
                    <div className="bg-blue-500/10 p-2.5 sm:p-3.5 rounded-xl border border-blue-500/15 text-blue-600 flex-shrink-0">
                        <FiBookOpen size={22} className="sm:hidden" />
                        <FiBookOpen size={28} className="hidden sm:block" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                            Company Rules &amp; Regulations
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                            View and print current or historical organization policies
                        </p>
                    </div>
                </div>

                {/* Bottom row: version + print — stacks on mobile */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                        <label className="text-[10px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap tracking-wider flex-shrink-0">
                            Version:
                        </label>
                        <select
                            value={selectedVersion}
                            onChange={(e) => setSelectedVersion(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 sm:px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            {versionsList.map(v => (
                                <option key={v} value={v}>v{v}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handlePrint}
                        className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 flex-shrink-0"
                    >
                        <FiDownload size={14} />
                        <span className="hidden xs:inline">Print PDF</span>
                        <span className="xs:hidden">Print</span>
                    </button>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">CipherGate Company Rules &amp; Regulations</h1>
                <div className="flex justify-between items-center text-sm text-slate-500 mt-2">
                    <span>Document Version: <strong>v{selectedVersion}</strong></span>
                    <span>Printed on: {new Date().toLocaleDateString()}</span>
                </div>
            </div>

            {/* ── Search bar ── */}
            <div className="relative print:hidden">
                <FiSearch className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                    type="text"
                    placeholder="Search policies by keyword or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm transition-all"
                />
            </div>

            {/* ── Main Grid: Rules left + Sidebar right ── */}
            {/* On mobile: single column (sidebar stacks below). On lg: 12-col grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-start">

                {/* ── Left: Rules Accordion ── */}
                <div className="lg:col-span-8 space-y-3 sm:space-y-4">
                    {Object.keys(groupedRules).length > 0 ? (
                        Object.entries(groupedRules).map(([category, items]) => {
                            const isCollapsed = expandedCategories[category];
                            return (
                                <div
                                    key={category}
                                    className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 print:shadow-none print:border-none print:bg-transparent"
                                >
                                    {/* Category Header — full-width tap target */}
                                    <button
                                        onClick={() => toggleCategory(category)}
                                        className="w-full px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/50 hover:bg-slate-50 active:bg-slate-100 border-b border-slate-100 flex items-center justify-between text-left transition-colors print:pointer-events-none print:bg-transparent print:border-b-2 print:border-slate-300 print:px-0"
                                    >
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                            <span className="w-1 sm:w-1.5 h-5 sm:h-6 bg-blue-500 rounded-full print:hidden flex-shrink-0" />
                                            <h3 className="text-sm sm:text-md font-bold text-slate-800 tracking-wide truncate print:text-lg print:text-black">
                                                {category}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                            <span className="text-[10px] sm:text-xs font-semibold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-full print:hidden">
                                                {items.length} {items.length === 1 ? 'policy' : 'policies'}
                                            </span>
                                            <span className="text-slate-400 print:hidden">
                                                {isCollapsed ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                                            </span>
                                        </div>
                                    </button>

                                    {/* Category Items */}
                                    {!isCollapsed && (
                                        <div className="divide-y divide-slate-100 px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-8 print:p-0 print:divide-y-0">
                                            {items.map((rule, index) => (
                                                <div
                                                    key={rule._id}
                                                    className={`pt-1 first:pt-0 ${index > 0 ? 'print:page-break-before-auto print:mt-6' : ''}`}
                                                >
                                                    {/* Title + severity badge */}
                                                    <div className="flex items-start justify-between gap-2 sm:gap-4 flex-wrap">
                                                        <h4 className="text-sm sm:text-md font-bold text-slate-900 print:text-black flex-1">
                                                            {rule.title}
                                                        </h4>
                                                        {rule.severity && (
                                                            <span className={`text-[9px] sm:text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border print:hidden flex-shrink-0 ${ rule.severity === 'critical' ? 'bg-rose-50 border-rose-200 text-rose-600' : rule.severity === 'high' ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600' }`}>
                                                                {rule.severity}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Rule content */}
                                                    <div className="mt-2.5 sm:mt-3.5 text-xs sm:text-sm text-slate-650 leading-relaxed font-normal print:text-slate-800 overflow-x-auto">
                                                        <SafeHTML html={rule.content} />
                                                    </div>

                                                    {/* Attachments */}
                                                    {rule.attachments && rule.attachments.length > 0 && (
                                                        <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 flex flex-wrap gap-2 print:hidden">
                                                            {rule.attachments.map((fileUrl, fileIdx) => {
                                                                const fileName = fileUrl.split('/').pop() || 'Attachment';
                                                                return (
                                                                    <a
                                                                        key={fileIdx}
                                                                        href={`${import.meta.env.VITE_API_URL}${fileUrl}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                                                    >
                                                                        <FiFileText size={11} />
                                                                        <span className="truncate max-w-[140px] sm:max-w-none">{fileName}</span>
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
                        <div className="bg-white border border-slate-200 p-8 sm:p-12 text-center rounded-2xl flex flex-col items-center justify-center">
                            <FiBookOpen size={40} className="text-slate-300 mb-3" />
                            <h3 className="font-bold text-slate-800 text-sm sm:text-base">No policies found</h3>
                            <p className="text-xs sm:text-sm text-slate-500 mt-1">
                                No policies match version {selectedVersion} or your search term.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Right Sidebar ── (shows below on mobile, beside on lg) */}
                <div className="lg:col-span-4 space-y-4 sm:space-y-6 print:hidden">

                    {/* Changelog box */}
                    {changelogText && (
                        <div className="bg-amber-50/50 border border-amber-200 p-4 sm:p-6 rounded-2xl space-y-2 sm:space-y-3">
                            <div className="flex items-center gap-2 text-amber-800">
                                <FiInfo size={18} className="fill-amber-100 stroke-[2.5] flex-shrink-0" />
                                <h3 className="font-bold text-xs sm:text-sm tracking-wider">
                                    Amendments in v{selectedVersion}
                                </h3>
                            </div>
                            <p className="text-xs sm:text-sm text-amber-700 leading-relaxed font-medium">
                                {changelogText}
                            </p>
                        </div>
                    )}

                    {/* Acceptance history */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3 sm:space-y-4">
                        <h3 className="font-bold text-slate-850 flex items-center gap-2 text-sm sm:text-base">
                            <FiClock className="text-blue-500 flex-shrink-0" />
                            <span>My Acceptance History</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                            Rules and regulations you have formally reviewed and agreed to since joining.
                        </p>

                        <div className="space-y-2 sm:space-y-3 max-h-[35vh] sm:max-h-[40vh] overflow-y-auto pr-1 -mr-1">
                            {acceptances.length > 0 ? (
                                acceptances.map(log => (
                                    <div
                                        key={log._id}
                                        className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-start gap-2.5 sm:gap-3"
                                    >
                                        <div className="text-emerald-500 mt-0.5 flex-shrink-0">
                                            <FiCheckCircle size={15} className="fill-emerald-50" />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-0.5">
                                            <div className="flex justify-between items-center gap-2">
                                                <span className="text-xs font-bold text-slate-800">Version {log.rulesVersion}</span>
                                                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-450 bg-slate-200/50 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">
                                                    AGREED
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                                                <FiCalendar size={9} className="flex-shrink-0" />
                                                <span>{new Date(log.acceptedAt).toLocaleDateString()}</span>
                                                <span>&bull;</span>
                                                <span>{new Date(log.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate">
                                                IP: {log.ipAddress}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-5 sm:py-6 text-slate-400 text-xs">
                                    No acceptance logs found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Print styles */}
            <style>{`
                @media print {
                    body { background: white !important; color: black !important; }
                    .custom-main-scroll { overflow: visible !important; height: auto !important; }
                    main { padding: 0 !important; }
                }
                @media (max-width: 480px) {
                    .xs\\:hidden { display: none; }
                    .xs\\:inline { display: inline; }
                }
            `}</style>
        </div>
    );
};

export default EmployeeRulesView;
