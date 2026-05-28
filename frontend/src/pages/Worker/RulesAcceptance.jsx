import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import {
    FiCheckCircle, FiBookOpen, FiShield, FiAlertCircle,
    FiLogOut, FiDownload, FiArrowRight, FiCheck, FiChevronRight,
    FiLock, FiUnlock, FiFileText, FiChevronDown, FiChevronUp, FiList
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const RulesAcceptance = () => {
    const { logout, updateUser } = useAuth();
    const navigate = useNavigate();

    const [rules, setRules] = useState([]);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scrollPercentage, setScrollPercentage] = useState(0);
    const [isAccepted, setIsAccepted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [selectedRuleIndex, setSelectedRuleIndex] = useState(0);
    const [isOutlineOpen, setIsOutlineOpen] = useState(false);
    // Track which rule indexes have been fully scrolled/read
    const [readRules, setReadRules] = useState(new Set());

    const containerRef = useRef(null);

    useEffect(() => {
        const fetchActiveRules = async () => {
            try {
                const { data } = await api.get('/rules/active');
                if (data.success) {
                    setRules(data.rules || []);
                    setConfig(data.rulesConfig || null);

                    if (!data.rules || data.rules.length === 0) {
                        toast.info('No active rules found. Redirecting...');
                        navigate('/worker');
                    }

                    if (data.rulesConfig && (!data.rulesConfig.forceAcceptance || !data.rulesConfig.scrollValidation)) {
                        // No scroll validation required — mark all rules as read immediately
                        const allIndexes = new Set((data.rules || []).map((_, i) => i));
                        setReadRules(allIndexes);
                    }
                }
            } catch (err) {
                console.error('Error fetching rules:', err);
                toast.error('Failed to load rules and regulations.');
            } finally {
                setLoading(false);
            }
        };

        fetchActiveRules();
    }, [navigate]);

    // Automatically check scroll position and non-scrollable content height
    useEffect(() => {
        if (rules.length === 0) return;

        const checkReadStatus = () => {
            const el = containerRef.current;
            if (!el) return;

            const isScrollable = el.scrollHeight > el.clientHeight + 15;
            const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 25;

            // If it fits or is already scrolled to bottom
            if (!isScrollable || isAtBottom) {
                setReadRules(prev => {
                    if (prev.has(selectedRuleIndex)) return prev;
                    const next = new Set(prev);
                    next.add(selectedRuleIndex);
                    return next;
                });
            }

            if (isScrollable) {
                const totalScrollable = el.scrollHeight - el.clientHeight;
                const percentage = Math.min(100, Math.ceil((el.scrollTop / totalScrollable) * 100));
                setScrollPercentage(percentage);
            } else {
                setScrollPercentage(100);
            }
        };

        checkReadStatus();
        const t1 = setTimeout(checkReadStatus, 100);
        const t2 = setTimeout(checkReadStatus, 400);

        window.addEventListener('resize', checkReadStatus);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            window.removeEventListener('resize', checkReadStatus);
        };
    }, [selectedRuleIndex, rules, rules[selectedRuleIndex]?.content]);

    const handleScroll = (e) => {
        if (!config?.scrollValidation) return;

        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const totalScrollable = scrollHeight - clientHeight;

        if (totalScrollable <= 0) {
            setScrollPercentage(100);
            setReadRules(prev => {
                const next = new Set(prev);
                next.add(selectedRuleIndex);
                return next;
            });
            return;
        }

        const percentage = Math.min(100, Math.ceil((scrollTop / totalScrollable) * 100));
        setScrollPercentage(percentage);

        if (scrollHeight - scrollTop <= clientHeight + 25) {
            setReadRules(prev => {
                const next = new Set(prev);
                next.add(selectedRuleIndex);
                return next;
            });
        }
    };

    const handleSelectRule = (idx) => {
        setSelectedRuleIndex(idx);
        setScrollPercentage(0);
        setIsOutlineOpen(false); // Close dropdown on mobile selection
        setTimeout(() => {
            const el = containerRef.current;
            if (el) {
                el.scrollTo({ top: 0 });
            }
        }, 50);
    };

    const handleAcceptSubmit = async (e) => {
        e.preventDefault();

        if (config?.scrollValidation && !allRulesRead) {
            toast.warning(`Please scroll through all ${rules.length} policy sections before accepting. (${readRules.size}/${rules.length} read)`);
            return;
        }

        if (config?.requireCheckbox && !isAccepted) {
            toast.warning('Please check the agreement box to proceed.');
            return;
        }

        setSubmitting(true);
        try {
            const { data } = await api.post('/rules/accept');
            if (data.success) {
                toast.success('Rules accepted successfully!');
                if (config?.currentVersion) {
                    updateUser({ acceptedRulesVersion: config.currentVersion });
                }
                navigate('/worker');
            }
        } catch (err) {
            console.error('Error accepting rules:', err);
            toast.error(err.response?.data?.message || 'Failed to submit agreement.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/worker/login');
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '48px', height: '48px',
                        border: '4px solid #e2e8f0',
                        borderTopColor: '#0d9488',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }} />
                    <p style={{ color: '#64748b', fontWeight: '500', fontSize: '15px' }}>Loading rules & regulations...</p>
                </div>
            </div>
        );
    }

    const activeRule = rules[selectedRuleIndex];
    const allRulesRead = rules.length > 0 && readRules.size >= rules.length;
    const overallProgress = rules.length > 0 ? Math.round((readRules.size / rules.length) * 100) : 0;
    const canAccept = !submitting &&
        !(config?.scrollValidation && !allRulesRead) &&
        !(config?.requireCheckbox && !isAccepted);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#F8FAFC',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            display: 'flex',
            flexDirection: 'column'
        }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .rules-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
                .rules-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
                .rules-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .rules-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                
                .rule-nav-btn { transition: all 0.18s ease; }
                .rule-nav-btn:hover { transform: translateX(2px); }
                .rule-nav-btn.active { 
                    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
                    box-shadow: 0 4px 15px rgba(13, 148, 136, 0.25);
                }
                
                .accept-btn { transition: all 0.2s ease; cursor: pointer; }
                .accept-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 25px rgba(13, 148, 136, 0.35) !important;
                }
                .accept-btn:active:not(:disabled) { transform: translateY(0); }
                .accept-btn:disabled { opacity: 0.55; cursor: not-allowed; }
                
                .card-shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }
                .progress-bar-fill { transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
                
                .prose-rules h1, .prose-rules h2, .prose-rules h3, .prose-rules h4 {
                    color: #1e293b; font-weight: 700; margin: 0.8em 0 0.4em;
                }
                .prose-rules p { color: #475569; line-height: 1.6; margin: 0.6em 0; font-size: 13.5px; }
                .prose-rules ul, .prose-rules ol { color: #475569; padding-left: 1.3em; line-height: 1.6; font-size: 13.5px; }
                .prose-rules li { margin: 0.25em 0; }
                .prose-rules strong { color: #1e293b; font-weight: 600; }
                .prose-rules em { font-style: italic; }
                
                .fade-in { animation: fadeInUp 0.3s ease both; }

                /* Mobile Responsive styles */
                .responsive-header {
                    padding: 0 12px;
                    height: auto;
                    min-height: 60px;
                    flex-direction: column;
                    gap: 8px;
                    align-items: stretch;
                    padding-top: 10px;
                    padding-bottom: 10px;
                }
                .responsive-header-logo-container {
                    justify-content: space-between;
                    width: 100%;
                }
                .responsive-header-actions {
                    justify-content: space-between;
                    width: 100%;
                }
                .responsive-main {
                    grid-template-columns: 1fr;
                    padding: 10px;
                    gap: 12px;
                }
                .responsive-doc-header {
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    padding: 12px 16px !important;
                }
                .responsive-doc-header-nav {
                    width: auto;
                    justify-content: flex-end;
                }
                .responsive-viewer-container {
                    max-height: 50vh !important;
                    padding: 16px 20px !important;
                }
                .responsive-footer-actions {
                    flex-direction: column;
                    align-items: stretch !important;
                    width: 100%;
                    padding: 12px 16px !important;
                    gap: 10px !important;
                }
                .responsive-form-container {
                    flex-direction: column;
                    align-items: stretch !important;
                    width: 100%;
                    gap: 10px !important;
                }
                .responsive-checkbox-label {
                    margin-bottom: 4px;
                }

                .desktop-outline-panel {
                    display: none;
                }
                .mobile-outline-toggle {
                    display: block;
                }

                @media (min-width: 768px) {
                    .desktop-outline-panel {
                        display: block;
                    }
                    .mobile-outline-toggle {
                        display: none;
                    }
                    .responsive-header {
                        padding: 0 24px;
                        height: 64px;
                        flex-direction: row;
                        gap: 0;
                        align-items: center;
                        padding-top: 0;
                        padding-bottom: 0;
                    }
                    .responsive-header-logo-container {
                        width: auto;
                        justify-content: flex-start;
                    }
                    .responsive-header-actions {
                        width: auto;
                        justify-content: flex-end;
                    }
                    .responsive-main {
                        grid-template-columns: 260px 1fr;
                        padding: 20px;
                        gap: 16px;
                    }
                    .responsive-doc-header {
                        padding: 16px 24px !important;
                    }
                    .responsive-viewer-container {
                        max-height: 58vh !important;
                        padding: 24px 28px !important;
                    }
                    .responsive-footer-actions {
                        flex-direction: row;
                        align-items: center !important;
                        padding: 16px 24px !important;
                        gap: 14px !important;
                    }
                    .responsive-form-container {
                        flex-direction: row;
                        align-items: center !important;
                        width: auto;
                        gap: 14px !important;
                    }
                    .responsive-checkbox-label {
                        margin-bottom: 0;
                    }
                }

                @media (min-width: 1024px) {
                    .responsive-main {
                        grid-template-columns: 310px 1fr;
                        padding: 28px 40px;
                        gap: 20px;
                    }
                    .responsive-viewer-container {
                        max-height: 62vh !important;
                        padding: 28px 36px !important;
                    }
                }
            `}</style>

            {/* ── TOP HEADER ── */}
            <header className="responsive-header" style={{
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                position: 'sticky',
                top: 0,
                zIndex: 50,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                {/* Logo + Title */}
                <div className="responsive-header-logo-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px', height: '34px',
                            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                            borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 10px rgba(13,148,136,0.2)',
                            flexShrink: 0
                        }}>
                            <FiShield size={18} color="#ffffff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.3px' }}>
                                    CipherGate
                                </span>
                                <span style={{ color: '#cbd5e1', fontSize: '12px' }}>|</span>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0d9488' }}>
                                    Rules Acceptance
                                </span>
                            </div>
                            <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px', fontWeight: '500' }}>
                                Policy Document — Version {config?.currentVersion || '1.0'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Progress badge + Sign out */}
                <div className="responsive-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {config?.scrollValidation && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            background: allRulesRead ? '#f0fdf4' : '#fffbeb',
                            border: `1px solid ${allRulesRead ? '#bbf7d0' : '#fde68a'}`,
                            borderRadius: '6px', padding: '4px 10px'
                        }}>
                            {allRulesRead
                                ? <FiCheckCircle size={12} color="#16a34a" />
                                : <FiAlertCircle size={12} color="#d97706" />
                            }
                            <span style={{
                                fontSize: '11px', fontWeight: '600',
                                color: allRulesRead ? '#16a34a' : '#d97706',
                                whiteSpace: 'nowrap'
                            }}>
                                {allRulesRead ? 'All Read' : `${readRules.size}/${rules.length} Read`}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#64748b',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px', fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = '#fef2f2';
                            e.currentTarget.style.borderColor = '#fca5a5';
                            e.currentTarget.style.color = '#dc2626';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.color = '#64748b';
                        }}
                    >
                        <FiLogOut size={13} />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* ── MAIN CONTENT ── */}
            <main className="responsive-main" style={{
                flex: 1,
                maxWidth: '1400px',
                margin: '0 auto',
                width: '100%',
                display: 'grid',
                alignItems: 'start'
            }}>

                {/* ── LEFT/TOP: Outline Navigation Toggle (Mobile Only) ── */}
                <div className="mobile-outline-toggle" style={{ width: '100%' }}>
                    <button
                        onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#1e293b',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiList size={16} color="#0d9488" />
                            <span>Document Outline ({readRules.size}/{rules.length} Read)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: allRulesRead ? '#d1fae5' : '#fef3c7',
                                color: allRulesRead ? '#065f46' : '#92400e'
                            }}>
                                {allRulesRead ? 'Ready' : 'Progress'}
                            </span>
                            {isOutlineOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                        </div>
                    </button>

                    {/* Expandable Menu */}
                    {isOutlineOpen && (
                        <div className="card-shadow fade-in" style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            marginTop: '8px',
                            maxHeight: '280px',
                            overflowY: 'auto',
                            padding: '8px',
                            position: 'absolute',
                            left: '10px',
                            right: '10px',
                            zIndex: 40
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {rules.map((rule, idx) => {
                                    const isActive = selectedRuleIndex === idx;
                                    const isRead = readRules.has(idx);
                                    return (
                                        <button
                                            key={rule._id}
                                            onClick={() => handleSelectRule(idx)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                border: isActive ? 'none' : isRead ? '1px solid #99f6e4' : '1px solid #f1f5f9',
                                                background: isActive ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' : isRead ? '#f0fdfa' : '#fafafa',
                                                color: isActive ? '#ffffff' : '#1e293b',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                <div style={{
                                                    minWidth: '20px', height: '20px',
                                                    borderRadius: '5px',
                                                    background: isActive ? 'rgba(255,255,255,0.25)' : isRead ? '#0d9488' : '#e2e8f0',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '9px', fontWeight: '750',
                                                    color: isActive ? '#fff' : isRead ? '#fff' : '#64748b',
                                                    flexShrink: 0
                                                }}>
                                                    {isRead && !isActive ? <FiCheck size={10} strokeWidth={3} /> : idx + 1}
                                                </div>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <span style={{ fontSize: '8px', display: 'block', textTransform: 'uppercase', color: isActive ? 'rgba(255,255,255,0.8)' : '#0d9488', fontWeight: '700' }}>
                                                        {rule.category}
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: '600', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {rule.title}
                                                    </span>
                                                </div>
                                            </div>
                                            <FiChevronRight size={12} color={isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8'} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── LEFT: Navigation Panel (Desktop Only) ── */}
                <div className="desktop-outline-panel" style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    overflow: 'hidden'
                }} className="card-shadow desktop-outline-panel">

                    {/* Panel Header */}
                    <div style={{
                        padding: '18px 20px',
                        borderBottom: '1px solid #f1f5f9',
                        background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <FiBookOpen size={16} color="#0d9488" />
                            <span style={{ fontSize: '12px', fontWeight: '750', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Document Outline
                            </span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                            Select each section to review. Read all policies to enable acceptance.
                        </p>
                    </div>

                    {/* Rule Navigation Items */}
                    <div style={{ padding: '12px', maxHeight: '38vh', overflowY: 'auto' }} className="rules-scroll">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {rules.map((rule, idx) => {
                                const isActive = selectedRuleIndex === idx;
                                const isRead = readRules.has(idx);
                                return (
                                    <button
                                        key={rule._id}
                                        onClick={() => handleSelectRule(idx)}
                                        className={`rule-nav-btn ${isActive ? 'active' : ''}`}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: isActive ? 'none' : isRead ? '1px solid #99f6e4' : '1px solid #f1f5f9',
                                            background: isActive ? undefined : isRead ? '#f0fdfa' : '#fafafa',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}
                                    >
                                        {/* Index Number */}
                                        <div style={{
                                            minWidth: '22px', height: '22px',
                                            borderRadius: '6px',
                                            background: isActive ? 'rgba(255,255,255,0.2)' : isRead ? '#0d9488' : '#e2e8f0',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '10px', fontWeight: '700',
                                            color: isActive ? '#fff' : isRead ? '#fff' : '#64748b',
                                            flexShrink: 0
                                        }}>
                                            {isRead && !isActive ? <FiCheck size={11} strokeWidth={3} /> : idx + 1}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '9px',
                                                fontWeight: '700',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.6px',
                                                marginBottom: '2px',
                                                color: isActive ? 'rgba(255,255,255,0.75)' : '#0d9488'
                                            }}>
                                                {rule.category}
                                            </div>
                                            <div style={{
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                color: isActive ? '#ffffff' : '#1e293b',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {rule.title}
                                            </div>
                                        </div>
                                        <FiChevronRight
                                            size={13}
                                            color={isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8'}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reading Progress */}
                    <div style={{
                        padding: '14px 20px',
                        borderTop: '1px solid #f1f5f9',
                        background: '#fafafa'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Overall Progress
                            </span>
                            <span style={{
                                fontSize: '12px',
                                fontWeight: '700',
                                color: allRulesRead ? '#0d9488' : '#f59e0b'
                            }}>
                                {allRulesRead ? '✓ All Read' : `${readRules.size} / ${rules.length}`}
                            </span>
                        </div>
                        <div style={{
                            height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden'
                        }}>
                            <div
                                className="progress-bar-fill"
                                style={{
                                    height: '100%',
                                    width: `${overallProgress}%`,
                                    background: allRulesRead
                                        ? 'linear-gradient(90deg, #0d9488, #10b981)'
                                        : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                                    borderRadius: '999px',
                                    boxShadow: allRulesRead ? '0 0 8px rgba(13,148,136,0.4)' : 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Document Viewer ── */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }} className="card-shadow">

                    {/* Document Header */}
                    <div className="responsive-doc-header" style={{
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)'
                    }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <span style={{
                                    fontSize: '9px',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    color: '#0d9488',
                                    background: '#f0fdfa',
                                    border: '1px solid #99f6e4',
                                    padding: '2px 8px',
                                    borderRadius: '999px'
                                }}>
                                    {activeRule?.category}
                                </span>
                                {activeRule?.severity && (
                                    <span style={{
                                        fontSize: '9px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        ...(activeRule.severity === 'critical'
                                            ? { color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca' }
                                            : activeRule.severity === 'high'
                                            ? { color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a' }
                                            : { color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0' })
                                    }}>
                                        {activeRule.severity}
                                    </span>
                                )}
                            </div>
                            <h2 style={{
                                fontSize: '15px',
                                fontWeight: '750',
                                color: '#0f172a',
                                letterSpacing: '-0.3px',
                                margin: 0,
                                wordBreak: 'break-word'
                            }}>
                                {activeRule?.title}
                            </h2>
                        </div>

                        <div className="responsive-doc-header-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                color: '#64748b', fontSize: '11px', fontWeight: '500'
                            }}>
                                <FiFileText size={12} />
                                <span>{selectedRuleIndex + 1}/{rules.length}</span>
                            </div>
                            {/* Next button */}
                            {selectedRuleIndex < rules.length - 1 && (
                                <button
                                    onClick={() => handleSelectRule(selectedRuleIndex + 1)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '3px',
                                        background: '#f0fdfa', border: '1px solid #99f6e4',
                                        color: '#0d9488', padding: '4px 10px',
                                        borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Next <FiChevronRight size={11} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Policy Content Scroll Area */}
                    <div
                        ref={containerRef}
                        onScroll={handleScroll}
                        className="rules-scroll fade-in responsive-viewer-container"
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            lineHeight: '1.6',
                            outline: 'none'
                        }}
                    >
                        {activeRule ? (
                            <div className="prose-rules">
                                <div dangerouslySetInnerHTML={{ __html: activeRule.content }} />

                                {/* Attachments */}
                                {activeRule.attachments && activeRule.attachments.length > 0 && (
                                    <div style={{
                                        marginTop: '20px',
                                        paddingTop: '16px',
                                        borderTop: '1px solid #f1f5f9'
                                    }}>
                                        <h4 style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FiDownload size={12} color="#0d9488" />
                                            Policy Attachments
                                        </h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {activeRule.attachments.map((fileUrl, index) => {
                                                const fileName = fileUrl.split('/').pop() || 'Attachment';
                                                return (
                                                    <a
                                                        key={index}
                                                        href={`${import.meta.env.VITE_API_URL}${fileUrl}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                            color: '#0d9488', background: '#f0fdfa',
                                                            border: '1px solid #99f6e4',
                                                            padding: '5px 10px', borderRadius: '6px',
                                                            fontSize: '12px', fontWeight: '600',
                                                            textDecoration: 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <FiDownload size={11} />
                                                        {fileName}
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                height: '160px', color: '#94a3b8'
                            }}>
                                <FiBookOpen size={36} style={{ marginBottom: '10px', opacity: 0.4 }} />
                                <p style={{ fontSize: '13px' }}>Select a document category to begin reading.</p>
                            </div>
                        )}
                    </div>

                    {/* ── FOOTER: Scroll hint + Agreement Form ── */}
                    <div className="responsive-footer-actions" style={{
                        borderTop: '1px solid #e2e8f0',
                        background: '#fafafa',
                        display: 'flex',
                        justifyContent: 'space-between'
                    }}>
                        {/* Left: Status indicator */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {config?.scrollValidation && !allRulesRead ? (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    color: '#d97706',
                                    background: '#fffbeb',
                                    border: '1px solid #fde68a',
                                    padding: '6px 12px', borderRadius: '8px',
                                    fontSize: '12px', fontWeight: '500',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                }}>
                                    <FiLock size={13} style={{ flexShrink: 0 }} />
                                    <span>
                                        {readRules.size === 0
                                            ? 'Scroll/review all policies to continue'
                                            : `${rules.length - readRules.size} section${rules.length - readRules.size !== 1 ? 's' : ''} remaining`
                                        }
                                    </span>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    color: '#0d9488',
                                    background: '#f0fdfa',
                                    border: '1px solid #99f6e4',
                                    padding: '6px 12px', borderRadius: '8px',
                                    fontSize: '12px', fontWeight: '600',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                }}>
                                    <FiUnlock size={13} style={{ flexShrink: 0 }} />
                                    <span>All {rules.length} sections reviewed ✓</span>
                                </div>
                            )}
                        </div>

                        {/* Right: Checkbox + Submit Button */}
                        <form onSubmit={handleAcceptSubmit} className="responsive-form-container" style={{ display: 'flex' }}>
                            {config?.requireCheckbox && (
                                <label className="responsive-checkbox-label" style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    cursor: (config.scrollValidation && !allRulesRead) ? 'not-allowed' : 'pointer',
                                    opacity: (config.scrollValidation && !allRulesRead) ? 0.5 : 1,
                                    userSelect: 'none'
                                }}>
                                    <div
                                        onClick={() => {
                                            if (!(config.scrollValidation && !allRulesRead)) {
                                                setIsAccepted(!isAccepted);
                                            }
                                        }}
                                        style={{
                                            width: '18px', height: '18px',
                                            borderRadius: '5px',
                                            border: isAccepted ? '2px solid #0d9488' : '2px solid #cbd5e1',
                                            background: isAccepted
                                                ? 'linear-gradient(135deg, #0d9488, #0f766e)'
                                                : '#ffffff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s ease',
                                            flexShrink: 0,
                                            boxShadow: isAccepted ? '0 2px 6px rgba(13,148,136,0.2)' : 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isAccepted && <FiCheck size={11} color="#ffffff" strokeWidth={3} />}
                                    </div>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                                        I accept all rules & conditions
                                    </span>
                                </label>
                            )}

                            <button
                                type="submit"
                                disabled={!canAccept}
                                className="accept-btn"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    background: canAccept
                                        ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
                                        : '#e2e8f0',
                                    color: canAccept ? '#ffffff' : '#94a3b8',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    fontSize: '13px', fontWeight: '700',
                                    letterSpacing: '-0.1px',
                                    boxShadow: canAccept ? '0 4px 12px rgba(13,148,136,0.25)' : 'none',
                                    width: '100%'
                                }}
                            >
                                {submitting ? (
                                    <>
                                        <div style={{
                                            width: '13px', height: '13px',
                                            border: '2px solid rgba(255,255,255,0.4)',
                                            borderTopColor: '#ffffff',
                                            borderRadius: '50%',
                                            animation: 'spin 0.7s linear infinite'
                                        }} />
                                        <span>Accepting...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Accept & Continue</span>
                                        <FiArrowRight size={14} strokeWidth={2.5} />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </main>

            {/* ── FOOTER ── */}
            <footer style={{
                background: '#ffffff',
                borderTop: '1px solid #f1f5f9',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '6px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '18px', height: '18px',
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        borderRadius: '4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FiShield size={10} color="#fff" />
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
                        CipherGate · All Rights Reserved © {new Date().getFullYear()}
                    </span>
                </div>
                <span style={{ fontSize: '10px', color: '#cbd5e1' }}>
                    v{config?.currentVersion || '1.0'}
                </span>
            </footer>
        </div>
    );
};

export default RulesAcceptance;
