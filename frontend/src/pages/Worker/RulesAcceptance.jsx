import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import {
    FiCheckCircle, FiBookOpen, FiShield, FiAlertCircle,
    FiLogOut, FiDownload, FiArrowRight, FiCheck, FiChevronRight,
    FiLock, FiUnlock, FiFileText
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

    const handleScroll = (e) => {
        if (!config?.scrollValidation) return;

        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const totalScrollable = scrollHeight - clientHeight;

        if (totalScrollable <= 0) {
            setScrollPercentage(100);
            // Mark current rule as read
            setReadRules(prev => {
                const next = new Set(prev);
                next.add(selectedRuleIndex);
                return next;
            });
            return;
        }

        const percentage = Math.min(100, Math.ceil((scrollTop / totalScrollable) * 100));
        setScrollPercentage(percentage);

        if (scrollHeight - scrollTop <= clientHeight + 15) {
            // Mark current rule as read
            setReadRules(prev => {
                const next = new Set(prev);
                next.add(selectedRuleIndex);
                return next;
            });
        }
    };

    // When switching rules, reset scroll progress for the new rule
    const handleSelectRule = (idx) => {
        setSelectedRuleIndex(idx);
        setScrollPercentage(0);
        // If content is short (no scroll needed), mark as read immediately
        // We'll do this via a small timeout after render
        setTimeout(() => {
            const el = containerRef.current;
            if (el && el.scrollHeight <= el.clientHeight + 15) {
                setReadRules(prev => {
                    const next = new Set(prev);
                    next.add(idx);
                    return next;
                });
            }
            el && el.scrollTo({ top: 0 });
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

    // All rules read = readRules contains all indexes
    const allRulesRead = rules.length > 0 && readRules.size >= rules.length;
    // Overall reading progress percentage
    const overallProgress = rules.length > 0 ? Math.round((readRules.size / rules.length) * 100) : 0;

    // Accept button enabled when: all rules read (or no scroll validation) AND checkbox checked (if required)
    const canAccept = !submitting &&
        !(config?.scrollValidation && !allRulesRead) &&
        !(config?.requireCheckbox && !isAccepted);

    // scrolledToEnd now means current rule reached bottom — but we use allRulesRead for the gate
    const currentRuleRead = readRules.has(selectedRuleIndex);

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
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .rules-scroll::-webkit-scrollbar { width: 5px; }
                .rules-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
                .rules-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .rules-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                .rule-nav-btn { transition: all 0.18s ease; }
                .rule-nav-btn:hover { transform: translateX(2px); }
                .rule-nav-btn.active { 
                    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
                    box-shadow: 0 4px 15px rgba(13, 148, 136, 0.25);
                }
                .accept-btn {
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                .accept-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 25px rgba(13, 148, 136, 0.35) !important;
                }
                .accept-btn:active:not(:disabled) { transform: translateY(0); }
                .accept-btn:disabled { opacity: 0.55; cursor: not-allowed; }
                .card-shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }
                .progress-bar-fill {
                    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .prose-rules h1, .prose-rules h2, .prose-rules h3, .prose-rules h4 {
                    color: #1e293b; font-weight: 700; margin: 1em 0 0.5em;
                }
                .prose-rules p { color: #475569; line-height: 1.75; margin: 0.75em 0; }
                .prose-rules ul, .prose-rules ol { color: #475569; padding-left: 1.5em; line-height: 1.75; }
                .prose-rules li { margin: 0.35em 0; }
                .prose-rules strong { color: #1e293b; font-weight: 600; }
                .prose-rules em { font-style: italic; }
                .fade-in { animation: fadeInUp 0.3s ease both; }
            `}</style>

            {/* ── TOP HEADER ── */}
            <header style={{
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 32px',
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 50,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                {/* Logo + Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '38px', height: '38px',
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        borderRadius: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(13,148,136,0.25)'
                    }}>
                        <FiShield size={20} color="#ffffff" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '17px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.3px' }}>
                                CipherGate
                            </span>
                            <span style={{ color: '#cbd5e1', fontSize: '16px' }}>|</span>
                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#0d9488' }}>
                                Rules & Regulations
                            </span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px', fontWeight: '500' }}>
                            Policy Document — Version {config?.currentVersion || '1.0'}
                        </p>
                    </div>
                </div>

                {/* Progress badge + Sign out */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {config?.scrollValidation && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: allRulesRead ? '#f0fdf4' : '#fffbeb',
                            border: `1px solid ${allRulesRead ? '#bbf7d0' : '#fde68a'}`,
                            borderRadius: '8px', padding: '5px 12px'
                        }}>
                            {allRulesRead
                                ? <FiCheckCircle size={13} color="#16a34a" />
                                : <FiAlertCircle size={13} color="#d97706" />
                            }
                            <span style={{
                                fontSize: '12px', fontWeight: '600',
                                color: allRulesRead ? '#16a34a' : '#d97706'
                            }}>
                                {allRulesRead ? 'All Policies Read' : `${readRules.size}/${rules.length} Sections Read`}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#64748b',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '13px', fontWeight: '600',
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
                        <FiLogOut size={14} />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* ── MAIN CONTENT ── */}
            <main style={{
                flex: 1,
                maxWidth: '1400px',
                margin: '0 auto',
                width: '100%',
                padding: '32px 48px 48px 48px',
                display: 'grid',
                gridTemplateColumns: '300px 1fr',
                gap: '24px',
                alignItems: 'start'
            }}>

                {/* ── LEFT: Navigation Panel ── */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '88px'
                }} className="card-shadow">

                    {/* Panel Header */}
                    <div style={{
                        padding: '18px 20px',
                        borderBottom: '1px solid #f1f5f9',
                        background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <FiBookOpen size={16} color="#0d9488" />
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Document Outline
                            </span>
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5', marginLeft: '24px' }}>
                            Select each section to review. Read all policies to enable acceptance.
                        </p>
                    </div>

                    {/* Rule Navigation Items */}
                    <div style={{ padding: '12px', maxHeight: '62vh', overflowY: 'auto' }} className="rules-scroll">
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
                                            padding: '11px 14px',
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
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.6px',
                                                marginBottom: '2px',
                                                color: isActive ? 'rgba(255,255,255,0.75)' : '#0d9488'
                                            }}>
                                                {rule.category}
                                            </div>
                                            <div style={{
                                                fontSize: '12.5px',
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
                        {!allRulesRead && (
                            <p style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '6px', fontStyle: 'italic' }}>
                                Scroll through each section to unlock acceptance
                            </p>
                        )}
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
                    <div style={{
                        padding: '20px 28px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    color: '#0d9488',
                                    background: '#f0fdfa',
                                    border: '1px solid #99f6e4',
                                    padding: '3px 10px',
                                    borderRadius: '999px'
                                }}>
                                    {activeRule?.category}
                                </span>
                                {activeRule?.severity && (
                                    <span style={{
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        padding: '3px 10px',
                                        borderRadius: '999px',
                                        ...(activeRule.severity === 'critical'
                                            ? { color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca' }
                                            : activeRule.severity === 'high'
                                            ? { color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a' }
                                            : { color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0' })
                                    }}>
                                        {activeRule.severity} Priority
                                    </span>
                                )}
                            </div>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: '700',
                                color: '#0f172a',
                                letterSpacing: '-0.3px',
                                margin: 0
                            }}>
                                {activeRule?.title}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                color: '#64748b', fontSize: '12px', fontWeight: '500'
                            }}>
                                <FiFileText size={14} />
                                <span>{selectedRuleIndex + 1} of {rules.length}</span>
                            </div>
                            {/* Next/Prev buttons */}
                            {selectedRuleIndex < rules.length - 1 && (
                                <button
                                    onClick={() => handleSelectRule(selectedRuleIndex + 1)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        background: '#f0fdfa', border: '1px solid #99f6e4',
                                        color: '#0d9488', padding: '4px 10px',
                                        borderRadius: '7px', fontSize: '12px', fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Next <FiChevronRight size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Policy Content Scroll Area */}
                    <div
                        ref={containerRef}
                        onScroll={handleScroll}
                        className="rules-scroll fade-in"
                        style={{
                            flex: 1,
                            padding: '28px 36px',
                            overflowY: 'auto',
                            maxHeight: '62vh',
                            lineHeight: '1.75'
                        }}
                    >
                        {activeRule ? (
                            <div className="prose-rules">
                                <div dangerouslySetInnerHTML={{ __html: activeRule.content }} />

                                {/* Attachments */}
                                {activeRule.attachments && activeRule.attachments.length > 0 && (
                                    <div style={{
                                        marginTop: '28px',
                                        paddingTop: '20px',
                                        borderTop: '1px solid #f1f5f9'
                                    }}>
                                        <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FiDownload size={13} color="#0d9488" />
                                            Policy Attachments
                                        </h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {activeRule.attachments.map((fileUrl, index) => {
                                                const fileName = fileUrl.split('/').pop() || 'Attachment';
                                                return (
                                                    <a
                                                        key={index}
                                                        href={`${import.meta.env.VITE_API_URL}${fileUrl}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '7px',
                                                            color: '#0d9488', background: '#f0fdfa',
                                                            border: '1px solid #99f6e4',
                                                            padding: '7px 14px', borderRadius: '8px',
                                                            fontSize: '13px', fontWeight: '600',
                                                            textDecoration: 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <FiDownload size={13} />
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
                                height: '200px', color: '#94a3b8'
                            }}>
                                <FiBookOpen size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                <p style={{ fontSize: '14px' }}>Select a document category to begin reading.</p>
                            </div>
                        )}
                    </div>

                    {/* ── FOOTER: Scroll hint + Agreement Form ── */}
                    <div style={{
                        borderTop: '1px solid #e2e8f0',
                        padding: '18px 28px',
                        background: '#fafafa',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '14px'
                    }}>
                        {/* Left: Status indicator */}
                        <div>
                            {config?.scrollValidation && !allRulesRead ? (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    color: '#d97706',
                                    background: '#fffbeb',
                                    border: '1px solid #fde68a',
                                    padding: '8px 14px', borderRadius: '10px',
                                    fontSize: '13px', fontWeight: '500'
                                }}>
                                    <FiLock size={14} />
                                    <span>
                                        {readRules.size === 0
                                            ? 'Scroll through each policy section to proceed'
                                            : `${rules.length - readRules.size} section${rules.length - readRules.size !== 1 ? 's' : ''} remaining`
                                        }
                                    </span>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    color: '#0d9488',
                                    background: '#f0fdfa',
                                    border: '1px solid #99f6e4',
                                    padding: '8px 14px', borderRadius: '10px',
                                    fontSize: '13px', fontWeight: '600'
                                }}>
                                    <FiUnlock size={14} />
                                    <span>All {rules.length} policy sections read & reviewed ✓</span>
                                </div>
                            )}
                        </div>

                        {/* Right: Checkbox + Submit Button */}
                        <form onSubmit={handleAcceptSubmit} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            {config?.requireCheckbox && (
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
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
                                            width: '20px', height: '20px',
                                            borderRadius: '6px',
                                            border: isAccepted ? '2px solid #0d9488' : '2px solid #cbd5e1',
                                            background: isAccepted
                                                ? 'linear-gradient(135deg, #0d9488, #0f766e)'
                                                : '#ffffff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s ease',
                                            flexShrink: 0,
                                            boxShadow: isAccepted ? '0 2px 8px rgba(13,148,136,0.3)' : 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isAccepted && <FiCheck size={12} color="#ffffff" strokeWidth={3} />}
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                                        I accept the terms and conditions
                                    </span>
                                </label>
                            )}

                            <button
                                type="submit"
                                disabled={!canAccept}
                                className="accept-btn"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: canAccept
                                        ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
                                        : '#e2e8f0',
                                    color: canAccept ? '#ffffff' : '#94a3b8',
                                    border: 'none',
                                    padding: '11px 24px',
                                    borderRadius: '10px',
                                    fontSize: '14px', fontWeight: '700',
                                    letterSpacing: '-0.1px',
                                    boxShadow: canAccept ? '0 4px 15px rgba(13,148,136,0.3)' : 'none'
                                }}
                            >
                                {submitting ? (
                                    <>
                                        <div style={{
                                            width: '15px', height: '15px',
                                            border: '2px solid rgba(255,255,255,0.4)',
                                            borderTopColor: '#ffffff',
                                            borderRadius: '50%',
                                            animation: 'spin 0.7s linear infinite'
                                        }} />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Accept & Continue</span>
                                        <FiArrowRight size={15} strokeWidth={2.5} />
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
                padding: '14px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '20px', height: '20px',
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        borderRadius: '5px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FiShield size={11} color="#fff" />
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>
                        CipherGate Suite · All Rights Reserved © {new Date().getFullYear()}
                    </span>
                </div>
                <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                    Policy Version {config?.currentVersion || '1.0'}
                </span>
            </footer>
        </div>
    );
};

export default RulesAcceptance;
