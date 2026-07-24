import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Calendar, ChevronDown, ChevronUp, X, Clock, Repeat } from 'lucide-react';

// ── Day labels ────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

// ── Human-readable summary ────────────────────────────────────────────────────
function buildSummary(cfg) {
    if (!cfg.enabled) return '';
    const { frequency, interval, daysOfWeek, dayOfMonth, startDate, endDate, noEndDate } = cfg;

    let freqStr = '';
    switch (frequency) {
        case 'daily':
            freqStr = interval === 1 ? 'Every day' : `Every ${interval} days`;
            break;
        case 'weekly': {
            const names = (daysOfWeek || []).map(d => DAY_LABELS_FULL[d]).join(', ');
            freqStr = interval === 1
                ? `Every week on ${names || '...'}`
                : `Every ${interval} weeks on ${names || '...'}`;
            break;
        }
        case 'monthly':
            freqStr = interval === 1
                ? `Monthly on day ${dayOfMonth || '?'}`
                : `Every ${interval} months on day ${dayOfMonth || '?'}`;
            break;
        case 'custom':
            freqStr = `Every ${interval} days`;
            break;
        default:
            freqStr = '';
    }

    const fromStr = startDate
        ? `, from ${new Date(startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';
    const toStr = noEndDate ? ' (no end)' : endDate
        ? ` until ${new Date(endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';

    return freqStr + fromStr + toStr;
}

// ── Default config ────────────────────────────────────────────────────────────
export const defaultRecurringConfig = {
    enabled: false,
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [1], // Monday default
    dayOfMonth: 1,
    taskDurationDays: 1,
    startDate: todayISO(),
    endDate: '',
    noEndDate: true
};

// ─────────────────────────────────────────────────────────────────────────────
// RecurringTaskPanel — inline panel embedded inside the WorkAllocation modal
// Props:
//   config     : recurringConfig state object
//   onChange   : (updatedConfig) => void
// ─────────────────────────────────────────────────────────────────────────────
const RecurringTaskPanel = ({ config = defaultRecurringConfig, onChange }) => {
    const [localCfg, setLocalCfg] = useState({ ...defaultRecurringConfig, ...config });
    // Track the last config we synced FROM the parent so we can detect external changes
    const lastExternalConfigRef = useRef(config);

    // Sync localCfg when the parent config prop changes externally (e.g. after async DB fetch)
    // Use a stable identity check to avoid re-syncing our own onChange-triggered updates
    useEffect(() => {
        const prev = lastExternalConfigRef.current;
        // Only re-sync if the incoming config is meaningfully different (enabled, frequency, or startDate changed)
        if (
            config.enabled !== prev.enabled ||
            config.frequency !== prev.frequency ||
            config.startDate !== prev.startDate ||
            config.interval !== prev.interval
        ) {
            lastExternalConfigRef.current = config;
            setLocalCfg({ ...defaultRecurringConfig, ...config });
        }
    }, [config]); // eslint-disable-line

    // Keep parent in sync whenever localCfg changes
    useEffect(() => {
        onChange(localCfg);
    }, [localCfg]); // eslint-disable-line

    const update = useCallback((fields) => {
        setLocalCfg(prev => ({ ...prev, ...fields }));
    }, []);

    const toggleDay = useCallback((dayIdx) => {
        setLocalCfg(prev => {
            const days = prev.daysOfWeek || [];
            const next = days.includes(dayIdx)
                ? days.filter(d => d !== dayIdx)
                : [...days, dayIdx].sort();
            return { ...prev, daysOfWeek: next };
        });
    }, []);

    const summary = buildSummary(localCfg);

    return (
        <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            {/* ── Toggle Header ──────────────────────────────────────────────── */}
            <button
                type="button"
                onClick={() => update({ enabled: !localCfg.enabled })}
                className={`w-full flex items-center justify-between px-4 py-3 transition-all duration-200 ${
                    localCfg.enabled
                        ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
            >
                <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        localCfg.enabled ? 'bg-white/20' : 'bg-teal-50'
                    }`}>
                        <Repeat className={`w-3.5 h-3.5 ${localCfg.enabled ? 'text-white' : 'text-teal-600'}`} />
                    </div>
                    <div className="text-left">
                        <div className={`text-[11px] font-black uppercase tracking-widest ${
                            localCfg.enabled ? 'text-white' : 'text-slate-500'
                        }`}>Recurring Task</div>
                        {localCfg.enabled && summary && (
                            <div className="text-[9px] text-teal-100 font-semibold mt-0.5 truncate max-w-[200px]">{summary}</div>
                        )}
                    </div>
                </div>
                {/* Toggle pill */}
                <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                    localCfg.enabled ? 'bg-white/30' : 'bg-slate-200'
                }`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full shadow transition-all duration-200 ${
                        localCfg.enabled ? 'left-6 bg-white' : 'left-1 bg-slate-400'
                    }`} />
                </div>
            </button>

            {/* ── Expanded Config Panel ──────────────────────────────────────── */}
            {localCfg.enabled && (
                <div className="px-4 py-4 space-y-4 border-t border-teal-100 animate-in slide-in-from-top-2 duration-200">

                    {/* Frequency Tabs */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Frequency</label>
                        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                            {['daily', 'weekly', 'monthly', 'custom'].map(f => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => update({ frequency: f })}
                                    className={`py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all ${
                                        localCfg.frequency === f
                                            ? 'bg-white text-teal-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Interval (shown for daily / weekly / monthly / custom) */}
                    {localCfg.frequency !== 'daily' && (
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                {localCfg.frequency === 'weekly' ? 'Repeat Every (weeks)' :
                                 localCfg.frequency === 'monthly' ? 'Repeat Every (months)' : 'Repeat Every (days)'}
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => update({ interval: Math.max(1, localCfg.interval - 1) })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                                >−</button>
                                <span className="w-10 text-center text-sm font-black text-slate-700">{localCfg.interval}</span>
                                <button
                                    type="button"
                                    onClick={() => update({ interval: Math.min(52, localCfg.interval + 1) })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                                >+</button>
                            </div>
                        </div>
                    )}

                    {/* Day of Week picker — Weekly + Custom */}
                    {(localCfg.frequency === 'weekly' || localCfg.frequency === 'custom') && (
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Repeat On</label>
                            <div className="flex gap-1 flex-wrap">
                                {DAY_LABELS.map((label, idx) => {
                                    const isActive = (localCfg.daysOfWeek || []).includes(idx);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => toggleDay(idx)}
                                            className={`w-9 h-9 rounded-lg text-[10px] font-black transition-all border ${
                                                isActive
                                                    ? 'bg-teal-500 text-white border-teal-500 shadow-md shadow-teal-100'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-600'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Day of Month picker — Monthly */}
                    {localCfg.frequency === 'monthly' && (
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Day of Month</label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => update({ dayOfMonth: Math.max(1, (localCfg.dayOfMonth || 1) - 1) })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                                >−</button>
                                <span className="w-10 text-center text-sm font-black text-slate-700">{localCfg.dayOfMonth || 1}</span>
                                <button
                                    type="button"
                                    onClick={() => update({ dayOfMonth: Math.min(31, (localCfg.dayOfMonth || 1) + 1) })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                                >+</button>
                                <span className="text-[10px] text-slate-400 ml-1">of each month</span>
                            </div>
                        </div>
                    )}

                    {/* Task Duration */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Task Duration (days) <span className="normal-case font-normal text-slate-300">— sets due date on each spawn</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => update({ taskDurationDays: Math.max(0, (localCfg.taskDurationDays || 1) - 1) })}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                            >−</button>
                            <span className="w-10 text-center text-sm font-black text-slate-700">
                                {localCfg.taskDurationDays === 0 ? '∞' : (localCfg.taskDurationDays || 1)}
                            </span>
                            <button
                                type="button"
                                onClick={() => update({ taskDurationDays: Math.min(365, (localCfg.taskDurationDays || 1) + 1) })}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors"
                            >+</button>
                            {localCfg.taskDurationDays === 0 && (
                                <span className="text-[10px] text-slate-400">no due date</span>
                            )}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Date Range</label>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                <span className="text-[10px] font-bold text-slate-500 w-12 shrink-0">Start</span>
                                <input
                                    type="date"
                                    value={localCfg.startDate || ''}
                                    onChange={e => update({ startDate: e.target.value })}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 cursor-pointer"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-[10px] font-bold text-slate-500 w-12 shrink-0">End</span>
                                {localCfg.noEndDate ? (
                                    <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                                        <span className="text-xs font-semibold text-slate-400 italic">No end date</span>
                                    </div>
                                ) : (
                                    <input
                                        type="date"
                                        value={localCfg.endDate || ''}
                                        min={localCfg.startDate || todayISO()}
                                        onChange={e => update({ endDate: e.target.value })}
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 cursor-pointer"
                                    />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={localCfg.noEndDate}
                                        onChange={e => update({ noEndDate: e.target.checked, endDate: '' })}
                                        className="w-3 h-3 accent-teal-500"
                                    />
                                    <span className="text-[9px] font-bold text-slate-500">No End</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Summary Preview */}
                    {summary && (
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-teal-50 border border-teal-100 rounded-xl">
                            <RefreshCw className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0 animate-spin-slow" />
                            <p className="text-[11px] font-semibold text-teal-700 leading-snug">{summary}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RecurringTaskPanel;
