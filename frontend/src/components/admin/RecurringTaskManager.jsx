import React, { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw, X, Play, Pause, Trash2, Edit3, ChevronRight,
    Calendar, Clock, Users, AlertCircle, CheckCircle2, Repeat,
    Eye, Loader2, Plus, XCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
    getRecurringTasks,
    toggleRecurringTaskStatus,
    deleteRecurringTask,
    getRecurringInstances,
    updateRecurringTask
} from '../../services/recurringTaskService';
import RecurringTaskPanel, { defaultRecurringConfig } from './RecurringTaskPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
    active:    { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Active' },
    paused:    { bg: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   label: 'Paused' },
    completed: { bg: 'bg-slate-50 text-slate-500 border-slate-200',       dot: 'bg-slate-400',   label: 'Completed' },
    cancelled: { bg: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500',    label: 'Cancelled' }
};

const FREQ_ICONS = { daily: '🔁', weekly: '📅', monthly: '🗓️', custom: '⚙️' };

function formatNextRun(date) {
    if (!date) return '—';
    const d = new Date(date);
    const now = new Date();
    const diffMs = d - now;
    const diffH = Math.round(diffMs / 3600000);
    if (diffH < 0) return `Overdue`;
    if (diffH < 1) return 'In < 1h';
    if (diffH < 24) return `In ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return diffD === 1 ? 'Tomorrow' : `In ${diffD} days`;
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[900] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{message}</p>
            </div>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={onConfirm} className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-md shadow-rose-100">Delete</button>
            </div>
        </div>
    </div>
);

// ── Rule Row ──────────────────────────────────────────────────────────────────
const RuleRow = ({ rule, onStatusChange, onDelete, onViewInstances, onEdit }) => {
    const [toggling, setToggling] = useState(false);
    const style = STATUS_STYLES[rule.status] || STATUS_STYLES.active;

    const handleToggle = async () => {
        if (rule.status === 'completed' || rule.status === 'cancelled') return;
        setToggling(true);
        const newStatus = rule.status === 'active' ? 'paused' : 'active';
        try {
            await onStatusChange(rule._id, newStatus);
        } finally {
            setToggling(false);
        }
    };

    return (
        <div className="group flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-xl hover:border-teal-200 hover:shadow-md transition-all duration-200">
            {/* Icon + Info */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0 text-lg">
                    {FREQ_ICONS[rule.frequency] || '🔁'}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-800 truncate">{rule.title}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${style.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {style.label}
                        </span>
                        {/* Frequency */}
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md capitalize">
                            {rule.frequency}{rule.interval > 1 ? ` ×${rule.interval}` : ''}
                        </span>
                        {/* Assignees count */}
                        {rule.assignees?.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                <Users className="w-3 h-3" />
                                {rule.assignees.length}
                            </span>
                        )}
                        {/* Spawned count */}
                        <span className="text-[10px] font-semibold text-teal-600">
                            {rule.totalSpawned || 0} spawned
                        </span>
                    </div>
                    {/* Next run */}
                    {rule.nextRunAt && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            Next: {new Date(rule.nextRunAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ({formatNextRun(rule.nextRunAt)})
                        </div>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                {/* Instances */}
                <button
                    onClick={() => onViewInstances(rule)}
                    title="View spawned instances"
                    className="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
                >
                    <Eye className="w-3.5 h-3.5" />
                </button>
                {/* Edit */}
                <button
                    onClick={() => onEdit(rule)}
                    title="Edit rule"
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                    <Edit3 className="w-3.5 h-3.5" />
                </button>
                {/* Pause / Resume */}
                {(rule.status === 'active' || rule.status === 'paused') && (
                    <button
                        onClick={handleToggle}
                        disabled={toggling}
                        title={rule.status === 'active' ? 'Pause' : 'Resume'}
                        className={`p-2 rounded-lg transition-all ${
                            rule.status === 'active'
                                ? 'text-amber-500 hover:bg-amber-50'
                                : 'text-emerald-500 hover:bg-emerald-50'
                        }`}
                    >
                        {toggling
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : rule.status === 'active'
                                ? <Pause className="w-3.5 h-3.5" />
                                : <Play className="w-3.5 h-3.5" />
                        }
                    </button>
                )}
                {/* Delete */}
                <button
                    onClick={() => onDelete(rule)}
                    title="Delete rule"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

// ── Instances Modal ───────────────────────────────────────────────────────────
const InstancesModal = ({ rule, onClose }) => {
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await getRecurringInstances(rule._id, { page, limit: 10 });
                setInstances(prev => page === 1 ? (res.data || []) : [...prev, ...(res.data || [])]);
                setHasMore((res.data || []).length === 10);
            } catch {
                toast.error('Failed to load instances');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [rule._id, page]);

    const STATUS_COLOR = { 'To Do': 'text-slate-500', 'In Progress': 'text-blue-500', 'Review': 'text-purple-500', 'Done': 'text-emerald-500' };

    return (
        <div className="fixed inset-0 z-[800] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <div className="font-bold text-slate-800 text-sm">{rule.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{rule.totalSpawned || 0} auto-generated tickets</div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {loading && page === 1 ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>
                    ) : instances.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm font-medium">No instances spawned yet</div>
                    ) : (
                        <>
                            {instances.map(ticket => (
                                <div key={ticket._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold text-slate-700 truncate">{ticket.title}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            {new Date(ticket.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-black ${STATUS_COLOR[ticket.status] || 'text-slate-500'}`}>
                                        {ticket.status}
                                    </span>
                                </div>
                            ))}
                            {hasMore && (
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={loading}
                                    className="w-full py-2 text-xs font-bold text-teal-600 hover:bg-teal-50 rounded-xl border border-teal-100 transition-colors"
                                >
                                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Load more'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// RecurringTaskManager — full management panel modal
// Props: isOpen, onClose
// ─────────────────────────────────────────────────────────────────────────────
const RecurringTaskManager = ({ isOpen, onClose }) => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [instancesRule, setInstancesRule] = useState(null);
    const [editRule, setEditRule] = useState(null);
    const [editConfig, setEditConfig] = useState({});
    const [saving, setSaving] = useState(false);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getRecurringTasks({ status: filterStatus || undefined, limit: 100 });
            setRules(res.data || []);
        } catch (err) {
            toast.error('Failed to load recurring tasks');
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => {
        if (isOpen) fetchRules();
    }, [isOpen, fetchRules]);

    const handleStatusChange = async (id, status) => {
        try {
            const res = await toggleRecurringTaskStatus(id, status);
            setRules(prev => prev.map(r => r._id === id ? { ...r, ...res.data } : r));
            toast.success(`Rule ${status === 'active' ? 'resumed' : 'paused'}`);
        } catch (err) {
            toast.error(err?.toString() || 'Failed to update status');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteRecurringTask(deleteTarget._id);
            setRules(prev => prev.filter(r => r._id !== deleteTarget._id));
            toast.success('Recurring rule deleted');
        } catch (err) {
            toast.error('Failed to delete');
        } finally {
            setDeleteTarget(null);
        }
    };

    const handleSaveEdit = async () => {
        if (!editRule) return;
        setSaving(true);
        try {
            // Build the update payload from editConfig
            const payload = {
                frequency: editConfig.frequency,
                interval: editConfig.interval,
                daysOfWeek: editConfig.daysOfWeek,
                dayOfMonth: editConfig.dayOfMonth,
                taskDurationDays: editConfig.taskDurationDays,
                endDate: editConfig.noEndDate ? null : editConfig.endDate
            };
            const res = await updateRecurringTask(editRule._id, payload);
            setRules(prev => prev.map(r => r._id === editRule._id ? { ...r, ...res.data } : r));
            toast.success('Recurring rule updated! Future instances will use new schedule.');
            setEditRule(null);
        } catch (err) {
            toast.error(err?.toString() || 'Failed to update rule');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const statusFilters = ['', 'active', 'paused', 'completed', 'cancelled'];

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[700] bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="fixed inset-y-0 right-0 z-[750] w-full max-w-xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-teal-500 to-teal-600">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                            <Repeat className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-sm tracking-tight">Recurring Tasks</h2>
                            <p className="text-teal-100 text-[10px] font-semibold">{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Status Filters */}
                <div className="px-4 py-3 border-b border-slate-100 flex gap-1.5 flex-wrap shrink-0">
                    {statusFilters.map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                filterStatus === s
                                    ? 'bg-teal-500 text-white border-teal-500 shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300'
                            }`}
                        >
                            {s || 'All'}
                        </button>
                    ))}
                </div>

                {/* Rules List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                            <p className="text-sm text-slate-400 font-medium">Loading rules...</p>
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                <Repeat className="w-7 h-7 text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-400">No recurring tasks found</p>
                            <p className="text-xs text-slate-300 max-w-[200px]">Create a recurring task from the Work Allocation modal.</p>
                        </div>
                    ) : (
                        rules.map(rule => (
                            <RuleRow
                                key={rule._id}
                                rule={rule}
                                onStatusChange={handleStatusChange}
                                onDelete={setDeleteTarget}
                                onViewInstances={setInstancesRule}
                                onEdit={(r) => {
                                    setEditRule(r);
                                    setEditConfig({
                                        ...defaultRecurringConfig,
                                        enabled: true,
                                        frequency: r.frequency,
                                        interval: r.interval,
                                        daysOfWeek: r.daysOfWeek,
                                        dayOfMonth: r.dayOfMonth,
                                        taskDurationDays: r.taskDurationDays,
                                        startDate: r.startDate ? r.startDate.split('T')[0] : '',
                                        endDate: r.endDate ? r.endDate.split('T')[0] : '',
                                        noEndDate: !r.endDate
                                    });
                                }}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Delete Confirmation */}
            {deleteTarget && (
                <ConfirmDialog
                    message={`Delete recurring rule "${deleteTarget.title}"? Past tickets remain unaffected.`}
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {/* Instances Modal */}
            {instancesRule && (
                <InstancesModal rule={instancesRule} onClose={() => setInstancesRule(null)} />
            )}

            {/* Edit Modal */}
            {editRule && (
                <div className="fixed inset-0 z-[850] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditRule(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Edit Recurrence</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Changes apply to future instances only</p>
                            </div>
                            <button onClick={() => setEditRule(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4">
                            <RecurringTaskPanel config={editConfig} onChange={setEditConfig} />
                        </div>
                        <div className="px-4 pb-4 flex gap-2">
                            <button onClick={() => setEditRule(null)} className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-md shadow-teal-100 flex items-center justify-center gap-1.5"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RecurringTaskManager;
