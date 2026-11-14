/**
 * Pure break-session time, interval, scope intersection, and validation helpers.
 * Shared semantics with frontend/src/utils/breakSessionValidation.js.
 */

const MINUTES_PER_DAY = 1440;

/**
 * Parse a 24-hour ("HH:mm", "HH:mm:ss") or 12-hour ("h:mm AM/PM") time string
 * into minutes since midnight [0, 1439]. Returns null for empty or invalid inputs.
 */
const parseBreakTimeToMinutes = (timeInput) => {
  if (typeof timeInput !== 'string') return null;
  const trimmed = timeInput.trim();
  if (!trimmed) return null;

  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const seconds = amPmMatch[3] !== undefined ? Number(amPmMatch[3]) : 0;
    const period = amPmMatch[4].toUpperCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return null;
    }
    if (period === 'AM') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
    return hours * 60 + minutes;
  }

  const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (h24Match) {
    const hours = Number(h24Match[1]);
    const minutes = Number(h24Match[2]);
    const seconds = h24Match[3] !== undefined ? Number(h24Match[3]) : 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  return null;
};

/**
 * Expand a break session window [outTime .. returnDeadline + gracePeriodMinutes]
 * into normalized [start, end] minute segments within [0, 1439].
 * When allowCrossMidnight is true, windows wrapping past 23:59 split into two
 * same-day segments so interval comparison stays exact across midnight.
 */
const expandBreakInterval = (session = {}, options = {}) => {
  const { allowCrossMidnight = true } = options;
  const outMinutes = typeof session.outMinutes === 'number'
    ? session.outMinutes
    : parseBreakTimeToMinutes(session.outTime);
  const deadlineMinutes = typeof session.deadlineMinutes === 'number'
    ? session.deadlineMinutes
    : parseBreakTimeToMinutes(session.returnDeadline);

  const rawGrace = session.gracePeriodMinutes ?? 0;
  const graceMinutes = Number(rawGrace);

  if (
    outMinutes === null ||
    deadlineMinutes === null ||
    !Number.isFinite(graceMinutes) ||
    graceMinutes < 0
  ) {
    return { valid: false, reason: 'INVALID_TIME', segments: [], outMinutes, deadlineMinutes, cutoffMinutes: null };
  }

  if (deadlineMinutes === outMinutes) {
    return { valid: false, reason: 'SAME_START_AND_END', segments: [], outMinutes, deadlineMinutes, cutoffMinutes: null };
  }

  const crossesDeadline = deadlineMinutes < outMinutes;
  const effectiveDeadline = crossesDeadline ? deadlineMinutes + MINUTES_PER_DAY : deadlineMinutes;
  const cutoffMinutes = effectiveDeadline + graceMinutes;

  if (!allowCrossMidnight && (crossesDeadline || cutoffMinutes >= MINUTES_PER_DAY)) {
    return {
      valid: false,
      reason: crossesDeadline ? 'CROSS_MIDNIGHT_DEADLINE' : 'CROSS_MIDNIGHT_GRACE',
      segments: [],
      outMinutes,
      deadlineMinutes,
      cutoffMinutes
    };
  }

  if (cutoffMinutes - outMinutes >= MINUTES_PER_DAY) {
    return {
      valid: true,
      crossesMidnight: true,
      outMinutes,
      deadlineMinutes,
      cutoffMinutes,
      segments: [{ start: 0, end: MINUTES_PER_DAY - 1 }]
    };
  }

  if (cutoffMinutes < MINUTES_PER_DAY) {
    return {
      valid: true,
      crossesMidnight: false,
      outMinutes,
      deadlineMinutes,
      cutoffMinutes,
      segments: [{ start: outMinutes, end: cutoffMinutes }]
    };
  }

  const wrappedEnd = cutoffMinutes % MINUTES_PER_DAY;
  return {
    valid: true,
    crossesMidnight: true,
    outMinutes,
    deadlineMinutes,
    cutoffMinutes,
    segments: [
      { start: outMinutes, end: MINUTES_PER_DAY - 1 },
      { start: 0, end: wrappedEnd }
    ]
  };
};

/**
 * Determine whether two break session processing windows overlap on any minute.
 * Inclusive endpoint comparison matches the scheduler's inclusive minute tick
 * [outMinutes .. returnDeadline + gracePeriodMinutes].
 */
const doBreakIntervalsOverlap = (sessionA, sessionB, options = {}) => {
  const intervalA = expandBreakInterval(sessionA, { allowCrossMidnight: true, ...options });
  const intervalB = expandBreakInterval(sessionB, { allowCrossMidnight: true, ...options });

  if (!intervalA.valid || !intervalB.valid) return false;

  for (const segA of intervalA.segments) {
    for (const segB of intervalB.segments) {
      if (segA.start <= segB.end && segB.start <= segA.end) {
        return true;
      }
    }
  }
  return false;
};

const toIdStrings = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (item && typeof item === 'object') {
        return String(item._id || item.id || '').trim();
      }
      return String(item ?? '').trim();
    })
    .filter(Boolean);
};

const extractScopeSourceLists = (source = {}) => {
  const departments = toIdStrings(source.applicableDepartments ?? source.scope?.departments ?? source.departments);
  const shifts = toIdStrings(
    source.applicableShifts ?? source.scope?.shifts ?? source.scope?.batches ?? source.shifts ?? source.batches
  );
  const employees = toIdStrings(source.applicableEmployees ?? source.scope?.employees ?? source.employees);
  return { departments, shifts, employees };
};

const inferScopeMode = (source = {}) => {
  const explicitMode = source.appliesTo || source.scope?.mode || source.scopeMode;
  if (explicitMode && explicitMode !== 'inherit') return explicitMode;
  const lists = extractScopeSourceLists(source);
  if (lists.employees.length > 0) return 'employees';
  if (lists.shifts.length > 0) return 'shifts';
  if (lists.departments.length > 0) return 'departments';
  return 'all';
};

/**
 * Resolve a session's effective employee scope (`all`, `departments`, `shifts`, `employees`),
 * supporting both schema fields (`appliesTo`, `applicable*`) and `scope.*`, plus `inherit`.
 */
const resolveSessionScope = (session = {}, lunchConfig = {}) => {
  const sessionMode = session.appliesTo || session.scope?.mode || session.scopeMode;
  const useSessionScope = Boolean(sessionMode && sessionMode !== 'inherit');

  if (!useSessionScope) {
    const fallbackContainer = lunchConfig.scope || lunchConfig;
    const globalMode = inferScopeMode(fallbackContainer);
    const lists = extractScopeSourceLists(fallbackContainer);
    return {
      mode: globalMode,
      ...lists
    };
  }

  return {
    mode: sessionMode || 'all',
    ...extractScopeSourceLists(session)
  };
};

const listsIntersect = (listA = [], listB = []) => {
  if (!listA.length || !listB.length) return false;
  const setB = new Set(listB);
  return listA.some((item) => setB.has(item));
};

const workerMatchesScope = (worker = {}, scope = { mode: 'all' }) => {
  if (!scope || scope.mode === 'all') return true;
  const workerId = String(worker._id || worker.id || '').trim();
  const deptId = String(worker.department?._id || worker.department || '').trim();
  const deptName = String(worker.department?.name || '').trim();
  const batch = String(worker.batch || worker.shift || '').trim();

  if (scope.mode === 'departments') {
    return (Boolean(deptId) && scope.departments.includes(deptId)) ||
      (Boolean(deptName) && scope.departments.includes(deptName));
  }
  if (scope.mode === 'shifts') {
    return Boolean(batch) && scope.shifts.includes(batch);
  }
  if (scope.mode === 'employees') {
    return Boolean(workerId) && scope.employees.includes(workerId);
  }
  return false;
};

/**
 * Check whether two resolved session scopes can apply to at least one common employee.
 * When distinct non-'all' scope modes are compared (e.g. departments vs employees) and
 * an active workers array is supplied, membership is evaluated directly on those workers.
 */
const scopesMayOverlap = (scopeA = { mode: 'all' }, scopeB = { mode: 'all' }, workers = []) => {
  const aMode = scopeA?.mode || 'all';
  const bMode = scopeB?.mode || 'all';

  if (aMode === 'all' || bMode === 'all') return true;

  if (aMode === bMode) {
    if (aMode === 'departments') return listsIntersect(scopeA.departments, scopeB.departments);
    if (aMode === 'shifts') return listsIntersect(scopeA.shifts, scopeB.shifts);
    if (aMode === 'employees') return listsIntersect(scopeA.employees, scopeB.employees);
  }

  if (Array.isArray(workers) && workers.length > 0) {
    return workers.some((w) => workerMatchesScope(w, scopeA) && workerMatchesScope(w, scopeB));
  }

  return false;
};

/**
 * Extract raw sessions for validation without copying module-level legacy
 * `lunchOutTime`/`returnDeadline` over explicit sessions whose times were cleared.
 */
const extractRawValidationSessions = (lunchConfig = {}) => {
  const hasExplicitSessions = Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0;
  if (hasExplicitSessions) {
    return lunchConfig.sessions;
  }
  if (Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length === 0) {
    if (!lunchConfig.lunchOutTime && !lunchConfig.returnDeadline) {
      return [];
    }
  }
  return [{
    id: 'default_lunch',
    name: 'Lunch Break',
    enabled: lunchConfig.enabled !== false,
    outTime: typeof lunchConfig.lunchOutTime === 'string' ? lunchConfig.lunchOutTime : '',
    returnDeadline: typeof lunchConfig.returnDeadline === 'string' ? lunchConfig.returnDeadline : '',
    gracePeriodMinutes: lunchConfig.gracePeriodMinutes ?? 0,
    appliesTo: lunchConfig.appliesTo || 'all',
    applicableDepartments: lunchConfig.applicableDepartments || [],
    applicableShifts: lunchConfig.applicableShifts || [],
    applicableEmployees: lunchConfig.applicableEmployees || []
  }];
};

/**
 * Validate lunchBreakManagement configuration (missing times, cross-midnight windows,
 * scope completeness, and overlapping processing intervals for intersecting employee scopes).
 * Never derives scheduling or overlap behavior from configured session names.
 */
const validateLunchBreakManagementConfig = (lunchConfig, options = {}) => {
  if (!lunchConfig || typeof lunchConfig !== 'object') return null;
  if (lunchConfig.enabled === false) return null;

  const { workers = [] } = options;
  const rawSessions = extractRawValidationSessions(lunchConfig);
  if (rawSessions.length === 0) {
    return 'Please configure at least one automatic OUT session when Automatic OUT is enabled.';
  }

  const enabledWindows = [];

  for (let idx = 0; idx < rawSessions.length; idx += 1) {
    const s = rawSessions[idx];
    if (!s || typeof s !== 'object') continue;

    const sessionEnabled = s.enabled !== false;
    const displayName = (typeof s.name === 'string' && s.name.trim()) ? s.name.trim() : '';
    if (!displayName) {
      return `Session #${idx + 1} requires a valid session name.`;
    }

    const outTimeStr = typeof s.outTime === 'string' ? s.outTime.trim() : '';
    const deadlineStr = typeof s.returnDeadline === 'string' ? s.returnDeadline.trim() : '';

    if (!outTimeStr) {
      if (sessionEnabled) {
        return `Session "${displayName}" requires an automatic OUT time.`;
      }
      continue;
    }
    if (!deadlineStr) {
      if (sessionEnabled) {
        return `Session "${displayName}" requires a return deadline.`;
      }
      continue;
    }

    const outMinutes = parseBreakTimeToMinutes(outTimeStr);
    const deadlineMinutes = parseBreakTimeToMinutes(deadlineStr);
    if (outMinutes === null || deadlineMinutes === null) {
      if (sessionEnabled) {
        return `Session "${displayName}" requires valid HH:MM times.`;
      }
      continue;
    }

    const grace = Number(s.gracePeriodMinutes ?? 0);
    if (!Number.isFinite(grace) || grace < 0) {
      return `Session "${displayName}" grace period cannot be negative.`;
    }

    const interval = expandBreakInterval(
      { outMinutes, deadlineMinutes, gracePeriodMinutes: grace },
      { allowCrossMidnight: false }
    );

    if (!interval.valid) {
      if (interval.reason === 'SAME_START_AND_END') {
        return `Session "${displayName}" return deadline must be after its automatic OUT time.`;
      }
      if (interval.reason === 'CROSS_MIDNIGHT_DEADLINE') {
        return `Cross-midnight sessions are not supported: Session "${displayName}" return deadline (${deadlineStr}) must be on the same day after its automatic OUT time (${outTimeStr}).`;
      }
      return `Cross-midnight sessions are not supported: Session "${displayName}" return deadline plus grace period must finish before 00:00 on the same day.`;
    }

    if (sessionEnabled) {
      const explicitScope = s.appliesTo || s.scope?.mode || 'inherit';
      const lists = extractScopeSourceLists(s);
      if (explicitScope === 'departments' && lists.departments.length === 0) {
        return `Session "${displayName}" requires at least one department when scoped to specific departments.`;
      }
      if (explicitScope === 'shifts' && lists.shifts.length === 0) {
        return `Session "${displayName}" requires at least one shift when scoped to specific shifts.`;
      }
      if (explicitScope === 'employees' && lists.employees.length === 0) {
        return `Session "${displayName}" requires at least one employee when scoped to specific employees.`;
      }

      enabledWindows.push({
        displayName,
        outMinutes,
        deadlineMinutes,
        gracePeriodMinutes: grace,
        scope: resolveSessionScope(s, lunchConfig)
      });
    }
  }

  for (let i = 0; i < enabledWindows.length; i += 1) {
    for (let j = i + 1; j < enabledWindows.length; j += 1) {
      const a = enabledWindows[i];
      const b = enabledWindows[j];
      if (!doBreakIntervalsOverlap(a, b, { allowCrossMidnight: false })) continue;
      if (scopesMayOverlap(a.scope, b.scope, workers)) {
        return `Sessions ${a.displayName} and ${b.displayName} overlap for the same employee scope.`;
      }
    }
  }

  return null;
};

/**
 * Check whether any enabled session pair has overlapping time windows across different
 * non-'all' scope modes (e.g. departments vs employees), indicating active worker lookup helps.
 */
const hasMixedScopeWindowOverlap = (lunchConfig) => {
  if (!lunchConfig || typeof lunchConfig !== 'object' || lunchConfig.enabled === false) return false;
  const enabledSessions = extractRawValidationSessions(lunchConfig).filter((s) => s && s.enabled !== false);
  const parsed = enabledSessions.map((s) => ({
    outTime: s.outTime,
    returnDeadline: s.returnDeadline,
    gracePeriodMinutes: s.gracePeriodMinutes ?? 0,
    scope: resolveSessionScope(s, lunchConfig)
  }));

  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const a = parsed[i];
      const b = parsed[j];
      if (
        a.scope.mode !== 'all' &&
        b.scope.mode !== 'all' &&
        a.scope.mode !== b.scope.mode &&
        doBreakIntervalsOverlap(a, b, { allowCrossMidnight: false })
      ) {
        return true;
      }
    }
  }
  return false;
};

module.exports = {
  MINUTES_PER_DAY,
  parseBreakTimeToMinutes,
  expandBreakInterval,
  doBreakIntervalsOverlap,
  resolveSessionScope,
  scopesMayOverlap,
  extractRawValidationSessions,
  validateLunchBreakManagementConfig,
  hasMixedScopeWindowOverlap
};
