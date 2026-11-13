/**
 * Shared IST date formatting, worker link normalization, daily attendance grouping,
 * lunch overview filtering, and CSV serialization helpers for /admin/attendance pages.
 */

export const formatRecordDateIST = (rawDate) => {
    if (!rawDate) return 'Unknown';
    if (typeof rawDate === 'string') {
        const trimmed = rawDate.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        }
        return trimmed.split('T')[0] || 'Unknown';
    }
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        return rawDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
    return String(rawDate);
};

export const getWorkerProfileId = (record) => {
    if (!record) return null;
    if (record.worker && typeof record.worker === 'object') {
        return record.worker._id ? String(record.worker._id) : null;
    }
    if (record.worker) {
        return String(record.worker);
    }
    if (record.workerId && typeof record.workerId === 'object') {
        return record.workerId._id ? String(record.workerId._id) : null;
    }
    if (record.workerId) {
        return String(record.workerId);
    }
    return null;
};

export const getBreakPunchLabel = (punch) => {
    if (!punch) return 'Regular';
    if (punch.punchType === 'LUNCH_OUT' || (punch.isLunchPunch && punch.presence === false)) {
        return 'Break OUT';
    }
    if (punch.punchType === 'LUNCH_IN' || (punch.isLunchPunch && punch.presence === true)) {
        return 'Break IN';
    }
    return 'Regular';
};

export const sanitizeClientAttendanceRecord = (record) => {
    if (!record || typeof record !== 'object') return record;
    const safeRecord = { ...record };
    delete safeRecord.outSessionName;
    delete safeRecord.outSessionId;
    return safeRecord;
};

const getAttendanceRecordIdentityKey = (record) => {
    if (!record || typeof record !== 'object') return 'invalid';
    if (record._id !== undefined && record._id !== null && String(record._id).trim() !== '') {
        return `id:${String(record._id)}`;
    }
    const workerKey = getWorkerProfileId(record) || record.rfid || 'unknown';
    const dateKey = formatRecordDateIST(record.date);
    return `comp:${workerKey}_${dateKey}_${record.time || ''}_${record.punchType || 'REGULAR'}_${Boolean(record.presence)}`;
};

export const mergeAttendanceRecords = (existingRecords = [], incomingRecords = [], { mode = 'replace' } = {}) => {
    const incoming = Array.isArray(incomingRecords) ? incomingRecords : [];
    const base = mode === 'append' && Array.isArray(existingRecords) ? existingRecords : [];
    const deduped = [];
    const keyToIndex = new Map();

    for (const raw of [...base, ...incoming]) {
        if (!raw || typeof raw !== 'object') continue;
        const safeRecord = sanitizeClientAttendanceRecord(raw);
        const key = getAttendanceRecordIdentityKey(safeRecord);
        if (keyToIndex.has(key)) {
            deduped[keyToIndex.get(key)] = safeRecord;
        } else {
            keyToIndex.set(key, deduped.length);
            deduped.push(safeRecord);
        }
    }

    return deduped;
};

export const createRefreshCoordinator = (runFn, { debounceMs = 150, onError } = {}) => {
    let inFlightPromise = null;
    let queued = false;
    let queuedArgs = null;
    let debounceTimer = null;
    let pendingDebounceResolvers = [];
    let disposed = false;

    const flushDebounceResolvers = (targetPromise = Promise.resolve()) => {
        const resolvers = pendingDebounceResolvers;
        pendingDebounceResolvers = [];
        for (const resolve of resolvers) {
            Promise.resolve(targetPromise).then(resolve, resolve);
        }
    };

    const executeLoop = async (initialArgs) => {
        let nextArgs = initialArgs;
        while (!disposed) {
            try {
                await runFn(nextArgs);
            } catch (err) {
                if (typeof onError === 'function' && !disposed) {
                    onError(err);
                }
            }
            if (!queued || disposed) {
                break;
            }
            queued = false;
            nextArgs = queuedArgs;
            queuedArgs = null;
        }
    };

    const startNow = async (args) => {
        if (disposed) return;
        if (inFlightPromise) {
            if (args?.skipIfBusy) {
                return;
            }
            queued = true;
            queuedArgs = args;
            return inFlightPromise;
        }
        inFlightPromise = executeLoop(args).finally(() => {
            inFlightPromise = null;
        });
        return inFlightPromise;
    };

    const trigger = (args = {}) => {
        if (disposed) return Promise.resolve();
        const shouldDebounce = Boolean(args.debounce) && debounceMs > 0;
        if (!shouldDebounce) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            const runPromise = startNow(args);
            flushDebounceResolvers(runPromise);
            return runPromise;
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        return new Promise((resolve) => {
            pendingDebounceResolvers.push(resolve);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                if (disposed) {
                    flushDebounceResolvers();
                    return;
                }
                const runPromise = startNow(args);
                flushDebounceResolvers(runPromise);
            }, debounceMs);
        });
    };

    const dispose = () => {
        disposed = true;
        queued = false;
        queuedArgs = null;
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        flushDebounceResolvers();
    };

    return {
        trigger,
        dispose,
        isInFlight: () => Boolean(inFlightPromise),
        isDisposed: () => disposed
    };
};

export const processAttendanceByDay = (attendanceData = []) => {
    function parseTime12hToSeconds(timeStr) {
        if (typeof timeStr !== 'string') return 0;
        const [time, modifier] = timeStr.trim().split(' ');
        if (!time) return 0;
        let [hours, minutes, seconds] = time.split(':').map(Number);
        hours = hours || 0;
        minutes = minutes || 0;
        seconds = seconds || 0;
        if (modifier && modifier.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        else if (modifier && modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
        return hours * 3600 + minutes * 60 + seconds;
    }

    function formatSecondsToDuration(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
    }

    const punchesGroupedByDay = {};
    attendanceData.forEach(record => {
        const dateKey = formatRecordDateIST(record.date);
        const employeeDateKey = `${record.rfid || 'Unknown'}_${dateKey}`;
        const safeRecord = sanitizeClientAttendanceRecord(record);
        if (!punchesGroupedByDay[employeeDateKey]) {
            punchesGroupedByDay[employeeDateKey] = {
                ...safeRecord,
                date: dateKey,
                rawPunches: [],
                inTimes: [],
                outTimes: [],
                duration: '00:00:00',
                latestTimestamp: new Date(record.createdAt || Date.now()).getTime()
            };
        }
        punchesGroupedByDay[employeeDateKey].rawPunches.push(safeRecord);
        punchesGroupedByDay[employeeDateKey].latestTimestamp = Math.max(
            punchesGroupedByDay[employeeDateKey].latestTimestamp,
            new Date(record.createdAt || Date.now()).getTime()
        );
    });

    const processedDays = [];

    for (const key in punchesGroupedByDay) {
        const dayData = punchesGroupedByDay[key];
        const sortedPunches = dayData.rawPunches.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

        let totalDurationSeconds = 0;
        let lastInTimeSeconds = null;

        dayData.inTimes = [];
        dayData.outTimes = [];

        for (let i = 0; i < sortedPunches.length; i++) {
            const punch = sortedPunches[i];
            const punchTimeSeconds = parseTime12hToSeconds(punch.time);

            if (punch.presence) {
                lastInTimeSeconds = punchTimeSeconds;
                dayData.inTimes.push({
                    time: punch.time,
                    isMissed: false,
                    punchType: punch.punchType || 'REGULAR',
                    isLunchPunch: Boolean(punch.isLunchPunch),
                    lunchLateMinutes: punch.lunchLateMinutes || 0
                });
            } else {
                let isProblematicOut = false;
                if (lastInTimeSeconds !== null) {
                    if (punchTimeSeconds > lastInTimeSeconds) {
                        totalDurationSeconds += (punchTimeSeconds - lastInTimeSeconds);
                        lastInTimeSeconds = null;
                    } else {
                        isProblematicOut = true;
                    }
                } else {
                    isProblematicOut = true;
                }

                dayData.outTimes.push({
                    time: punch.time,
                    isMissed: Boolean(punch.isMissedOutPunch || punch.isMissingLunchReturn || isProblematicOut),
                    isMissingLunchReturn: Boolean(punch.isMissingLunchReturn),
                    punchType: punch.punchType || 'REGULAR',
                    isLunchPunch: Boolean(punch.isLunchPunch)
                });
            }
        }

        if (lastInTimeSeconds !== null) {
            dayData.outTimes.push({
                time: '-',
                isMissed: true,
                punchType: 'REGULAR'
            });
        }

        dayData.duration = formatSecondsToDuration(totalDurationSeconds);
        processedDays.push(dayData);
    }

    return processedDays.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
};

export const filterLunchOverviewRows = (rows = [], { searchName = '', filterRfid = '', filterDepartment = '', filterDate = '', fallbackDate = '' } = {}) => {
    const nameQ = String(searchName || '').trim().toLowerCase();
    const rfidQ = String(filterRfid || '').trim().toLowerCase();
    const deptQ = String(filterDepartment || '').trim().toLowerCase();
    const dateQ = String(filterDate || '').trim();

    return rows.filter((row) => {
        const matchesName = !nameQ || String(row?.name || '').toLowerCase().includes(nameQ);
        const matchesRfid = !rfidQ || String(row?.rfid || '').toLowerCase().includes(rfidQ);
        const matchesDept = !deptQ || String(row?.department || '').toLowerCase().includes(deptQ);
        const rowDate = formatRecordDateIST(row?.date || fallbackDate);
        const matchesDate = !dateQ || rowDate.startsWith(dateQ);
        return matchesName && matchesRfid && matchesDept && matchesDate;
    });
};

const escapeCsvCell = (cell) => {
    if (cell === null || cell === undefined) return '';
    const cellString = String(cell);
    if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
        return `"${cellString.replace(/"/g, '""')}"`;
    }
    return cellString;
};

export const buildAttendanceCsvContent = ({ activeTab = 'daily', processedAttendance = [], filteredLunchOverview = [], lunchDate = '' }) => {
    if (activeTab === 'lunch') {
        const headers = [
            'Name',
            'Employee ID (RFID)',
            'Department',
            'Date',
            'Break OUT',
            'Actual OUT Time',
            'Break IN',
            'Actual IN Time',
            'Late Minutes',
            'Missing Return Status',
            'Deduction Status'
        ];
        const rows = filteredLunchOverview.map((row) => {
            const hasReturned = Boolean(row?.actualReturnTime && row.actualReturnTime !== '-');
            const missingStatus = (row?.isMissingLunchReturn || row?.status === 'Missing Return' || row?.status === 'Missing Lunch Return')
                ? 'Missing Return'
                : (row?.status || '-');
            return [
                row?.name || 'Unknown',
                row?.rfid || 'Unknown',
                row?.department || 'Unassigned',
                formatRecordDateIST(row?.date || lunchDate),
                'Break OUT',
                row?.lunchOutTime || '-',
                hasReturned ? 'Break IN' : '-',
                row?.actualReturnTime || '-',
                row?.lateMinutes ?? 0,
                missingStatus,
                row?.deductionStatus || '-'
            ];
        });
        return [headers, ...rows].map(r => r.map(escapeCsvCell).join(',')).join('\n') + '\n';
    }

    const headers = [
        'Name',
        'Employee ID (RFID)',
        'Department',
        'Date',
        'In Times',
        'Out Times',
        'Duration'
    ];
    const rows = processedAttendance.map((record) => [
        record?.name || 'Unknown',
        record?.rfid || 'Unknown',
        record?.departmentName || 'N/A',
        record?.date || 'Unknown',
        (record?.inTimes || []).map((t) => {
            const label = getBreakPunchLabel({ ...t, presence: true });
            const meta = [label === 'Break IN' ? 'Break IN' : null, t.lunchLateMinutes > 0 ? `+${t.lunchLateMinutes}m late` : null].filter(Boolean).join(', ');
            return meta ? `${t.time} (${meta})` : t.time;
        }).join(' | '),
        (record?.outTimes || []).map((t) => {
            const label = getBreakPunchLabel({ ...t, presence: false });
            const meta = [label === 'Break OUT' ? 'Break OUT' : null, t.isMissingLunchReturn ? 'Missing Return' : null].filter(Boolean).join(', ');
            return meta ? `${t.time} (${meta})` : t.time;
        }).join(' | '),
        record?.duration || '00:00:00'
    ]);
    return [headers, ...rows].map(r => r.map(escapeCsvCell).join(',')).join('\n') + '\n';
};

