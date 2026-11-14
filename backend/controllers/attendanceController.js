const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Settings = require('../models/Settings');
const {
    getNormalizedSessions,
    timeToMinutes,
    parsePunchTimeToMinutes,
    matchSessionForOutPunch,
    findSessionReturnPunch
} = require('../schedulers/lunchBreakScheduler');

// Resolve authenticated tenant subdomain from JWT user or API key, rejecting cross-tenant overrides
const resolveAttendanceTenant = (req, res, requestedSubdomain) => {
    const rawAuthSubdomain = req.user?.subdomain || req.apiKey?.subdomain;
    const authSubdomain = rawAuthSubdomain ? String(rawAuthSubdomain).trim() : '';
    const normalizedAuth = authSubdomain.toLowerCase();

    if (!normalizedAuth || normalizedAuth === 'main') {
        res.status(401);
        throw new Error('Company name is missing, login again');
    }

    if (
        requestedSubdomain !== undefined &&
        requestedSubdomain !== null &&
        String(requestedSubdomain).trim() !== ''
    ) {
        if (String(requestedSubdomain).trim().toLowerCase() !== normalizedAuth) {
            res.status(403);
            throw new Error('Access denied. Cannot access another company\'s attendance data.');
        }
    }

    return authSubdomain;
};

// Defense-in-depth admin role check for company-wide attendance endpoints (allows external API-key callers)
const requireAdminUnlessApiKey = (req, res) => {
    if (req.user && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Access denied. Admin role required.');
    }
};

// Helper: Resolve lunch / break return details when punching in
const resolveLunchReturnDetails = async (rfid, subdomain, newPresence, currentDateFormatted, workerId, nowDate = new Date()) => {
    let punchType = 'REGULAR';
    let isLunchPunch = false;
    let lunchLateMinutes = 0;
    let outSessionId = null;
    let outSessionName = null;

    if (newPresence === true) {
        const query = workerId
            ? { worker: workerId, subdomain, date: currentDateFormatted }
            : { rfid, subdomain, date: currentDateFormatted };

        const lastPunchToday = await Attendance.findOne(query).sort({ createdAt: -1 });
        let openLunchOut = (lastPunchToday && (lastPunchToday.punchType === 'LUNCH_OUT' || lastPunchToday.isLunchPunch) && !lastPunchToday.presence)
            ? lastPunchToday
            : null;

        if (!openLunchOut && lastPunchToday && !lastPunchToday.presence) {
            const lastInToday = await Attendance.findOne({ ...query, presence: true }).sort({ createdAt: -1 });
            openLunchOut = await Attendance.findOne({
                ...query,
                presence: false,
                $or: [{ punchType: 'LUNCH_OUT' }, { isLunchPunch: true }],
                ...(lastInToday ? { createdAt: { $gt: lastInToday.createdAt } } : {})
            }).sort({ createdAt: -1 });
        }

        if (openLunchOut) {
            punchType = 'LUNCH_IN';
            isLunchPunch = true;
            outSessionId = openLunchOut.outSessionId || null;

            if (openLunchOut.isMissingLunchReturn) {
                openLunchOut.isMissingLunchReturn = false;
                if (typeof openLunchOut.save === 'function') {
                    await openLunchOut.save();
                } else {
                    await Attendance.updateOne({ _id: openLunchOut._id }, { $set: { isMissingLunchReturn: false } });
                }
            }

            const settings = await Settings.findOne({ subdomain });
            const lunchConfig = settings?.lunchBreakManagement;

            if (lunchConfig && lunchConfig.enabled) {
                const sessions = getNormalizedSessions(lunchConfig);
                const matchedSession = matchSessionForOutPunch(openLunchOut, lunchConfig, sessions);

                if (!outSessionId && matchedSession?.id) {
                    outSessionId = matchedSession.id;
                }

                const hasConfiguredSessions = Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0;
                const allowLegacyDeadlineFallback = !hasConfiguredSessions
                    || (sessions.length <= 1 && !openLunchOut.outSessionId)
                    || openLunchOut.outSessionId === 'legacy_lunch_session';
                const returnDeadline = matchedSession?.returnDeadline
                    || (allowLegacyDeadlineFallback ? (lunchConfig.returnDeadline || '14:30') : null);
                const grace = matchedSession
                    ? (matchedSession.gracePeriodMinutes ?? lunchConfig.gracePeriodMinutes ?? 0)
                    : (lunchConfig.gracePeriodMinutes ?? 0);

                if (returnDeadline) {
                    const timeFormatter24 = new Intl.DateTimeFormat('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    const current24 = timeFormatter24.format(nowDate);
                    const currentMinutes = timeToMinutes(current24);
                    const deadlineMinutes = timeToMinutes(returnDeadline);
                    const threshold = deadlineMinutes + grace;

                    if (currentMinutes > threshold) {
                        lunchLateMinutes = currentMinutes - threshold;
                    }
                }
            }
        }
    }

    return { punchType, isLunchPunch, lunchLateMinutes, outSessionId, outSessionName };
};

const getIndiaTimezoneFormatters = () => ({
    indiaTimezoneDate: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }),
    indiaTimezoneTime: new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    })
});

const sanitizeAttendanceRecordForDisplay = (record) => {
    if (!record || typeof record !== 'object') return record;
    const obj = typeof record.toObject === 'function' ? record.toObject() : { ...record };
    delete obj.outSessionName;
    delete obj.outSessionId;
    if (obj.punchType === 'LUNCH_OUT' || (obj.isLunchPunch && obj.presence === false)) {
        obj.breakLabel = 'Break OUT';
    } else if (obj.punchType === 'LUNCH_IN' || (obj.isLunchPunch && obj.presence === true)) {
        obj.breakLabel = 'Break IN';
    } else {
        obj.breakLabel = 'Regular';
    }
    return obj;
};

const emitAttendanceUpdateEvent = ({ subdomain, workerId, attendance }) => {
    if (!subdomain || !attendance) return;
    try {
        const { getIO } = require('../utils/socket');
        const io = getIO();
        if (!io) return;
        const punchType = attendance.punchType || 'REGULAR';
        const breakLabel = punchType === 'LUNCH_OUT'
            ? 'Break OUT'
            : (punchType === 'LUNCH_IN' ? 'Break IN' : 'Regular');
        io.to(String(subdomain).toLowerCase()).emit('attendance-update', {
            workerId: workerId || attendance.worker,
            punchType,
            breakLabel,
            presence: Boolean(attendance.presence),
            date: attendance.date,
            time: attendance.time
        });
    } catch (socketError) {
        // Non-blocking if Socket.IO is uninitialized or unavailable
    }
};

const formatAttendanceDateIST = (rawDate, indiaTimezoneDate, fallbackDateFormatted) => {
    try {
        if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
            return rawDate.trim();
        }
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
            return indiaTimezoneDate.format(rawDate);
        }
        if (typeof rawDate === 'string') {
            const parsedDate = new Date(rawDate);
            if (!isNaN(parsedDate.getTime())) {
                return indiaTimezoneDate.format(parsedDate);
            }
            return rawDate;
        }
        return String(rawDate);
    } catch (dateError) {
        console.error('Error formatting last attendance date:', dateError);
        return fallbackDateFormatted;
    }
};

// Security guard: Only trusted test environments may supply simulated dates;
// in production environments, wall-clock time is strictly enforced.
const isSimulatedRequest = (req) => {
    return process.env.NODE_ENV === 'test' && Boolean(req && (req.simulatedDate || req.body?.simulatedDate));
};

const resolveRequestTimestamp = (req) => {
    if (isSimulatedRequest(req)) {
        return new Date(req.simulatedDate || req.body.simulatedDate);
    }
    return new Date();
};

// Cooldown guard: allows immediate valid return IN right after an automatic/break LUNCH_OUT,
// while keeping the standard 60-second cooldown for unrelated manual/RFID/face punches.
const checkPunchCooldown = async ({ rfid, subdomain, intendedPresence, nowDate = new Date() }) => {
    const oneMinuteAgo = new Date(nowDate.getTime() - 60000);
    const recentAttendance = await Attendance.findOne({
        rfid,
        subdomain,
        isMissedOutPunch: { $ne: true },
        createdAt: { $gte: oneMinuteAgo }
    }).sort({ createdAt: -1 });

    if (!recentAttendance || recentAttendance.isMissedOutPunch) {
        return { blocked: false };
    }

    const isOpenAutoBreakOut = !recentAttendance.presence
        && (recentAttendance.punchType === 'LUNCH_OUT' || recentAttendance.isLunchPunch === true);

    if (isOpenAutoBreakOut && intendedPresence === true) {
        return { blocked: false };
    }

    return {
        blocked: true,
        message: 'Try punch in or punch out after 1 minute.'
    };
};

// Shared presence & yesterday open-IN rollover logic across manual, RFID, and face endpoints.
const resolveNextPresenceWithDayRollover = async ({
    rfid,
    subdomain,
    worker,
    department,
    providedPresence,
    currentDateFormatted,
    indiaTimezoneDate
}) => {
    const lastAttendance = await Attendance.findOne({ rfid, subdomain }).sort({ createdAt: -1 });

    if (!lastAttendance) {
        return typeof providedPresence === 'boolean' ? providedPresence : true;
    }

    const lastPunchDateFormatted = formatAttendanceDateIST(
        lastAttendance.date,
        indiaTimezoneDate,
        currentDateFormatted
    );

    // If yesterday ended with an unclosed IN punch, close yesterday at 07:00:00 PM
    // and guarantee today's first punch is IN (true).
    if (lastAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted) {
        const defaultEndOfDayTime = '07:00:00 PM';
        await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: lastPunchDateFormatted,
            time: defaultEndOfDayTime,
            presence: false,
            worker: worker._id,
            punchType: 'REGULAR',
            isMissedOutPunch: true
        });
        console.log(`Auto-generated OUT for ${worker.name} on ${lastPunchDateFormatted} at ${defaultEndOfDayTime} due to missed punch.`);
        return true;
    }

    if (typeof providedPresence === 'boolean') {
        return providedPresence;
    }

    return !lastAttendance.presence;
};


// @desc    Update or create attendance record for a worker
// @route   PUT /api/attendance
// @access  Private
const putAttendance = async (req, res) => {
    try {
        const { rfid, subdomain: requestedSubdomain, presence: providedPresence } = req.body;

        console.log('putAttendance called with:', { rfid, subdomain: requestedSubdomain, providedPresence, providedPresenceType: typeof providedPresence });

        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        // Check if the RFID belongs to the currently logged-in worker
        // This ensures workers can only mark attendance with their own RFID (and face)
        if (req.user && req.user.role === 'worker') {
            if (req.user.rfid !== rfid) {
                res.status(403);
                throw new Error('You can only mark attendance with your own face');
            }
        }

        const worker = await Worker.findOne({ subdomain, rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        if (worker.status === 'Relieved') {
            res.status(403);
            throw new Error('This employee is relieved and cannot mark attendance');
        }

        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        const { indiaTimezoneDate, indiaTimezoneTime } = getIndiaTimezoneFormatters();
        const requestDate = resolveRequestTimestamp(req);
        const currentDateFormatted = indiaTimezoneDate.format(requestDate);
        const currentTimeFormatted = indiaTimezoneTime.format(requestDate);

        const newPresence = await resolveNextPresenceWithDayRollover({
            rfid,
            subdomain,
            worker,
            department,
            providedPresence,
            currentDateFormatted,
            indiaTimezoneDate
        });

        const cooldown = await checkPunchCooldown({
            rfid,
            subdomain,
            intendedPresence: newPresence,
            nowDate: requestDate
        });
        if (cooldown.blocked) {
            return res.status(200).json({
                success: false,
                message: cooldown.message
            });
        }

        console.log('Final presence value to be recorded:', newPresence);

        const lunchDetails = await resolveLunchReturnDetails(
            rfid,
            subdomain,
            newPresence,
            currentDateFormatted,
            worker._id,
            requestDate
        );

        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDateFormatted,
            time: currentTimeFormatted,
            presence: newPresence,
            worker: worker._id,
            ...(isSimulatedRequest(req) ? { createdAt: requestDate } : {}),
            punchType: lunchDetails.punchType,
            isLunchPunch: lunchDetails.isLunchPunch,
            lunchLateMinutes: lunchDetails.lunchLateMinutes,
            outSessionId: lunchDetails.outSessionId,
            outSessionName: lunchDetails.outSessionName,
            source: 'MANUAL'
        });

        emitAttendanceUpdateEvent({ subdomain, workerId: worker._id, attendance: newAttendance });

        res.status(201).json({
            message: newPresence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc   Update or create attendance record for a worker using RFID
// @route   PUT /api/attendance/rfid
// @access  Private
const putRfidAttendance = async (req, res) => {
    try {
        const { rfid, subdomain: requestedSubdomain, presence: providedPresence, latitude, longitude } = req.body;
        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        // Check if the RFID belongs to the currently logged-in worker
        // This ensures workers can only mark attendance with their own RFID
        if (req.user && req.user.role === 'worker') {
            if (req.user.rfid !== rfid) {
                res.status(403);
                throw new Error('You can only mark attendance with your own RFID');
            }
        }

        const worker = await Worker.findOne({ rfid, subdomain });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        if (worker.status === 'Relieved') {
            res.status(403);
            throw new Error('This employee is relieved and cannot mark attendance');
        }

        // Check location settings if subdomain exists
        if (subdomain && subdomain !== 'main') {
            // Get location settings
            const settings = await Settings.findOne({ subdomain });

            // If location restriction is enabled, validate location
            if (settings && settings.attendanceLocation && settings.attendanceLocation.enabled) {
                // If location data is not provided with RFID scan, deny attendance
                if (!latitude || !longitude) {
                    return res.status(403).json({
                        message: 'Location validation required for attendance but not provided with RFID scan'
                    });
                }

                // Calculate distance between worker's location and allowed location
                const { calculateDistance } = require('../utils/locationUtils');
                const allowedLat = settings.attendanceLocation.latitude;
                const allowedLon = settings.attendanceLocation.longitude;
                const radius = settings.attendanceLocation.radius;

                const distance = calculateDistance(allowedLat, allowedLon, latitude, longitude);

                // Check if worker is within the allowed radius
                if (distance > radius) {
                    return res.status(403).json({
                        message: `Worker is ${Math.round(distance)} meters away from allowed location (max: ${radius} meters)`
                    });
                }
            }
        }

        const department = await Department.findById(worker.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        const { indiaTimezoneDate, indiaTimezoneTime } = getIndiaTimezoneFormatters();
        const requestDate = resolveRequestTimestamp(req);
        const currentDateFormatted = indiaTimezoneDate.format(requestDate);
        const currentTimeFormatted = indiaTimezoneTime.format(requestDate);

        const presence = await resolveNextPresenceWithDayRollover({
            rfid,
            subdomain,
            worker,
            department,
            providedPresence,
            currentDateFormatted,
            indiaTimezoneDate
        });

        const cooldown = await checkPunchCooldown({
            rfid,
            subdomain,
            intendedPresence: presence,
            nowDate: requestDate
        });
        if (cooldown.blocked) {
            return res.status(200).json({
                success: false,
                message: cooldown.message
            });
        }

        const lunchDetails = await resolveLunchReturnDetails(
            rfid,
            subdomain,
            presence,
            currentDateFormatted,
            worker._id,
            requestDate
        );

        const newAttendance = await Attendance.create({
            name: worker.name,
            username: worker.username,
            rfid,
            subdomain: subdomain, // Fixed: explicitly use subdomain variable
            department: department._id,
            departmentName: department.name,
            photo: worker.photo,
            date: currentDateFormatted, // Use formatted date string for consistency
            time: currentTimeFormatted,
            presence,
            worker: worker._id,
            ...(isSimulatedRequest(req) ? { createdAt: requestDate } : {}),
            punchType: lunchDetails.punchType,
            isLunchPunch: lunchDetails.isLunchPunch,
            lunchLateMinutes: lunchDetails.lunchLateMinutes,
            outSessionId: lunchDetails.outSessionId,
            outSessionName: lunchDetails.outSessionName,
            source: 'MANUAL'
        });

        emitAttendanceUpdateEvent({ subdomain, workerId: worker._id, attendance: newAttendance });

        res.status(201).json({
            message: presence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance
        });
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Retrieve all attendance records for a specific subdomain
// @route   POST /api/attendance
// @access  Private
const getAttendance = async (req, res) => {
    try {
        requireAdminUnlessApiKey(req, res);
        const subdomain = resolveAttendanceTenant(req, res, req.body?.subdomain);

        const attendanceData = await Attendance.find({ subdomain }).populate('worker').populate('department');

        res.status(200).json({
            message: 'Attendance data retrieved successfully',
            attendance: attendanceData.map(sanitizeAttendanceRecordForDisplay)
        });
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Retrieve attendance records for a specific subdomain with pagination
// @route   POST /api/attendance/paginated
// @access  Private
const getPaginatedAttendance = async (req, res) => {
    try {
        requireAdminUnlessApiKey(req, res);
        const { subdomain: requestedSubdomain, page = 1, limit = 2 } = req.body;
        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get all unique dates for the subdomain
        const allDates = await Attendance.distinct('date', { subdomain });

        // Sort dates manually (newest first)
        const sortedDates = allDates.sort((a, b) => new Date(b) - new Date(a));

        // Get the dates for the current page
        const datesForPage = sortedDates.slice(skip, skip + limit);
        const requestedDate = typeof req.body.date === 'string' ? req.body.date.trim() : '';
        const queryDates = [...datesForPage];
        if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && allDates.includes(requestedDate) && !queryDates.includes(requestedDate)) {
            queryDates.push(requestedDate);
        }

        // If no dates for this page, return empty result
        if (queryDates.length === 0) {
            return res.status(200).json({
                message: 'Attendance data retrieved successfully',
                attendance: [],
                hasMore: false,
                currentPage: page,
                totalPages: Math.ceil(sortedDates.length / limit)
            });
        }

        // Get all attendance records for the dates on this page, populating worker/department references
        const attendanceData = await Attendance.find({
            subdomain,
            date: { $in: queryDates }
        })
            .populate('worker', '_id name rfid')
            .populate('department', '_id name')
            .sort({ date: -1, createdAt: -1 });

        // Check if there are more records available
        const hasMore = skip + limit < sortedDates.length;

        res.status(200).json({
            message: 'Attendance data retrieved successfully',
            attendance: attendanceData.map(sanitizeAttendanceRecordForDisplay),
            hasMore: hasMore,
            currentPage: page,
            totalPages: Math.ceil(sortedDates.length / limit)
        });
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Retrieve attendance records for a specific worker by RFID and subdomain
// @route   POST /api/attendance/worker
// @access  Private
const getWorkerAttendance = async (req, res) => {
    try {
        const { rfid, subdomain: requestedSubdomain } = req.body;
        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        if (!rfid || rfid == '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        if (req.user && req.user.role === 'worker') {
            if (!req.user.rfid || req.user.rfid !== rfid) {
                res.status(403);
                throw new Error('Access denied. You can only view your own attendance records.');
            }
        }

        const workerAttendance = await Attendance.find({ rfid, subdomain });

        res.status(200).json({
            message: 'Worker attendance data retrieved successfully',
            attendance: workerAttendance.map(sanitizeAttendanceRecordForDisplay)
        });
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Get worker's last attendance record
// @route   POST /api/attendance/worker-last
// @access  Private
const getWorkerLastAttendance = async (req, res) => {
    try {
        const { rfid, subdomain: requestedSubdomain } = req.body;

        console.log('getWorkerLastAttendance called with:', { rfid, subdomain: requestedSubdomain });

        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        if (req.user && req.user.role === 'worker') {
            if (!req.user.rfid || req.user.rfid !== rfid) {
                res.status(403);
                throw new Error('Access denied. You can only view your own attendance records.');
            }
        }

        // Find the last attendance record for this worker
        const lastAttendance = await Attendance.findOne({ rfid, subdomain }).sort({ createdAt: -1 });

        console.log('Last attendance record found:', lastAttendance);

        if (!lastAttendance) {
            // No previous attendance record, so this will be a Punch In
            console.log('No previous attendance record, next action will be Punch In');
            res.status(200).json({
                presence: true,
                isOnLunchBreak: false,
                lunchConfig: null,
                message: 'No previous attendance record found. Next action will be Punch In.'
            });
        } else {
            const { indiaTimezoneDate } = getIndiaTimezoneFormatters();
            const currentDateFormatted = indiaTimezoneDate.format(new Date());
            const lastPunchDateFormatted = formatAttendanceDateIST(
                lastAttendance.date,
                indiaTimezoneDate,
                currentDateFormatted
            );
            const hasUnclosedPriorIn = lastAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted;
            const nextPresence = hasUnclosedPriorIn ? true : !lastAttendance.presence;
            const isOpenBreakOutToday = lastPunchDateFormatted === currentDateFormatted
                && !lastAttendance.presence
                && (lastAttendance.punchType === 'LUNCH_OUT' || Boolean(lastAttendance.isLunchPunch));

            let activeBreakConfig = null;
            if (isOpenBreakOutToday) {
                const settings = await Settings.findOne({ subdomain });
                const lunchSettings = settings?.lunchBreakManagement;
                const matchedSession = lunchSettings
                    ? matchSessionForOutPunch(lastAttendance, lunchSettings)
                    : null;
                if (matchedSession) {
                    activeBreakConfig = {
                        returnDeadline: matchedSession.returnDeadline,
                        gracePeriodMinutes: matchedSession.gracePeriodMinutes ?? 0
                    };
                } else if (lunchSettings?.returnDeadline) {
                    activeBreakConfig = {
                        returnDeadline: lunchSettings.returnDeadline,
                        gracePeriodMinutes: lunchSettings.gracePeriodMinutes ?? 0
                    };
                }
            }

            console.log('Last presence was:', lastAttendance.presence, 'So next presence should be:', nextPresence);
            res.status(200).json({
                presence: nextPresence,
                isOnLunchBreak: isOpenBreakOutToday,
                lunchConfig: activeBreakConfig,
                lastAttendance: sanitizeAttendanceRecordForDisplay(lastAttendance),
                message: nextPresence ? 'Next action will be Punch In' : 'Next action will be Punch Out'
            });
        }
    } catch (error) {
        console.error(error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Recognize face and mark attendance
// @route   POST /api/attendance/face-recognition
// @access  Private
const recognizeFaceAndMarkAttendance = async (req, res) => {
    try {
        const { faceDescriptor, subdomain: requestedSubdomain } = req.body;
        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        if (!faceDescriptor || !Array.isArray(faceDescriptor)) {
            res.status(400);
            throw new Error('Face descriptor is required');
        }

        // Find all workers with face embeddings
        const workers = await Worker.find({
            subdomain,
            faceEmbeddings: { $exists: true, $ne: [] }
        });

        if (!workers.length) {
            res.status(404);
            throw new Error('No workers with face data found');
        }

        // Find the best matching worker
        let bestMatch = null;
        let minDistance = Infinity;

        // Compare the provided face descriptor with all stored face embeddings
        for (const worker of workers) {
            for (const embedding of worker.faceEmbeddings) {
                // Calculate Euclidean distance between face descriptors
                const distance = calculateEuclideanDistance(faceDescriptor, embedding);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = worker;
                }
            }
        }

        // Retrieve dynamic face recognition settings from database
        const settings = await Settings.findOne({ subdomain });
        const threshold = settings?.faceRecognition?.matchingThreshold ?? 0.50;

        if (!bestMatch || minDistance > threshold) {
            res.status(404);
            throw new Error('No matching worker found');
        }

        if (bestMatch.status === 'Relieved') {
            res.status(403);
            throw new Error('This employee is relieved and cannot mark attendance');
        }

        if (req.user && req.user.role === 'worker' && req.user.rfid !== bestMatch.rfid) {
            res.status(403);
            throw new Error('You can only mark attendance with your own face');
        }

        // Get the worker's department
        const department = await Department.findById(bestMatch.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        // Get the current date and time in 'Asia/Kolkata' timezone
        const { indiaTimezoneDate, indiaTimezoneTime } = getIndiaTimezoneFormatters();
        const requestDate = resolveRequestTimestamp(req);
        const currentDateFormatted = indiaTimezoneDate.format(requestDate);
        const currentTimeFormatted = indiaTimezoneTime.format(requestDate);

        // Determine presence cleanly with cross-day open-IN rollover
        const presence = await resolveNextPresenceWithDayRollover({
            rfid: bestMatch.rfid,
            subdomain,
            worker: bestMatch,
            department,
            providedPresence: undefined,
            currentDateFormatted,
            indiaTimezoneDate
        });

        const lunchDetails = await resolveLunchReturnDetails(
            bestMatch.rfid,
            subdomain,
            presence,
            currentDateFormatted,
            bestMatch._id,
            requestDate
        );

        // Create attendance record
        const newAttendance = await Attendance.create({
            name: bestMatch.name,
            username: bestMatch.username,
            rfid: bestMatch.rfid,
            subdomain,
            department: department._id,
            departmentName: department.name,
            photo: bestMatch.photo,
            date: currentDateFormatted,
            time: currentTimeFormatted,
            presence,
            worker: bestMatch._id,
            ...(isSimulatedRequest(req) ? { createdAt: requestDate } : {}),
            punchType: lunchDetails.punchType,
            isLunchPunch: lunchDetails.isLunchPunch,
            lunchLateMinutes: lunchDetails.lunchLateMinutes,
            outSessionId: lunchDetails.outSessionId,
            outSessionName: lunchDetails.outSessionName,
            source: 'FACE_RECOGNITION'
        });

        emitAttendanceUpdateEvent({ subdomain, workerId: bestMatch._id, attendance: newAttendance });

        res.status(201).json({
            message: presence ? 'Attendance marked as in' : 'Attendance marked as out',
            attendance: newAttendance,
            worker: {
                _id: bestMatch._id,
                name: bestMatch.name,
                rfid: bestMatch.rfid,
                photo: bestMatch.photo
            }
        });
    } catch (error) {
        console.error('Face recognition error:', error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// Helper function to calculate Euclidean distance between two face descriptors
function calculateEuclideanDistance(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
        return Infinity;
    }

    let sum = 0;
    for (let i = 0; i < descriptor1.length; i++) {
        const diff = descriptor1[i] - descriptor2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

// @desc    Get attendance summary (percentage)
// @route   POST /api/attendance/summary
// @access  Private
const getAttendanceSummary = async (req, res) => {
    try {
        requireAdminUnlessApiKey(req, res);
        const subdomain = resolveAttendanceTenant(req, res, req.body?.subdomain);

        // 1. Get total number of active workers
        const totalWorkers = await Worker.countDocuments({
            subdomain,
            status: { $ne: 'Relieved' }
        });

        if (totalWorkers === 0) {
            return res.status(200).json({
                percentage: 0,
                totalWorkers: 0,
                presentWorkers: 0
            });
        }

        // 2. Get today's date in India Timezone
        const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const currentDateFormatted = indiaTimezoneDate.format(new Date());

        // 3. Count unique workers who have marked attendance today
        // distinct returns an array of unique values (in this case, worker IDs)
        const presentWorkerIds = await Attendance.distinct('worker', {
            subdomain,
            date: currentDateFormatted,
            presence: true // Only count those who have punched IN at least once
        });

        const presentWorkersCount = presentWorkerIds.length;

        // 4. Calculate percentage
        const percentage = Math.round((presentWorkersCount / totalWorkers) * 100);

        res.status(200).json({
            percentage,
            totalWorkers,
            presentWorkers: presentWorkersCount
        });

    } catch (error) {
        console.error('Error fetching attendance summary:', error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: statusCode === 500 ? 'Server error' : error.message, error: error.message });
    }
};

// @desc    Get lunch break overview for a specific date
// @route   POST /api/attendance/lunch-overview
// @access  Private
const getLunchAttendanceOverview = async (req, res) => {
    try {
        requireAdminUnlessApiKey(req, res);
        const {
            subdomain: requestedSubdomain,
            date,
            searchName = '',
            rfid = '',
            department = '',
            page,
            limit
        } = req.body;

        const subdomain = resolveAttendanceTenant(req, res, requestedSubdomain);

        const { indiaTimezoneDate } = getIndiaTimezoneFormatters();
        const targetDate = date || indiaTimezoneDate.format(new Date());

        const settings = await Settings.findOne({ subdomain });
        const lunchConfig = settings?.lunchBreakManagement || {
            enabled: false,
            lunchOutTime: '13:30',
            returnDeadline: '14:30',
            gracePeriodMinutes: 0,
            sessions: []
        };
        const normalizedSessions = getNormalizedSessions(lunchConfig);
        const grace = lunchConfig.gracePeriodMinutes ?? 0;

        const timeFormatter24 = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const [currH, currM] = timeFormatter24.format(new Date()).split(':').map(Number);
        const currentMinutes = currH * 60 + currM;
        const todayStr = indiaTimezoneDate.format(new Date());

        const workers = await Worker.find({
            subdomain,
            status: { $ne: 'Relieved' }
        }).populate('department', 'name');

        const nameFilter = String(searchName || '').trim().toLowerCase();
        const rfidFilter = String(rfid || '').trim().toLowerCase();
        const deptFilter = String(department || '').trim().toLowerCase();

        const filteredWorkers = workers.filter((w) => {
            const deptName = (w.department && typeof w.department === 'object' ? w.department.name : w.departmentName) || 'Unassigned';
            if (nameFilter && !String(w.name || '').toLowerCase().includes(nameFilter)) return false;
            if (rfidFilter && !String(w.rfid || '').toLowerCase().includes(rfidFilter)) return false;
            if (deptFilter && !String(deptName).toLowerCase().includes(deptFilter)) return false;
            return true;
        });

        // Batch fetch all attendance punches for targetDate in a single query (eliminates N+1 worker queries)
        const workerIds = filteredWorkers.map(w => w._id);
        const allDayPunches = workerIds.length > 0
            ? await Attendance.find({
                subdomain,
                date: targetDate,
                worker: { $in: workerIds }
            }).sort({ createdAt: 1 })
            : [];

        const punchesByWorkerId = new Map();
        for (const punch of allDayPunches) {
            const key = punch?.worker && typeof punch.worker === 'object'
                ? String(punch.worker._id || punch.worker)
                : String(punch?.worker || '');
            if (!key) continue;
            if (!punchesByWorkerId.has(key)) {
                punchesByWorkerId.set(key, []);
            }
            punchesByWorkerId.get(key).push(punch);
        }

        const overview = [];
        const hasConfiguredSessions = Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0;

        for (const worker of filteredWorkers) {
            const dayPunches = punchesByWorkerId.get(String(worker._id)) || [];
            if (dayPunches.length === 0) continue;

            for (let idx = 0; idx < dayPunches.length; idx++) {
                const outPunch = dayPunches[idx];
                const isBreakOut = outPunch.punchType === 'LUNCH_OUT' || (outPunch.isLunchPunch && !outPunch.presence);
                if (!isBreakOut) continue;

                const matchedSession = matchSessionForOutPunch(outPunch, lunchConfig, normalizedSessions);
                const sessionId = outPunch.outSessionId || matchedSession?.id || null;

                // Pair only with a return IN punch belonging to this session before any subsequent LUNCH_OUT
                const sessionInPunch = findSessionReturnPunch(dayPunches, idx, sessionId);

                const allowLegacyDeadlineFallback = !hasConfiguredSessions
                    || (normalizedSessions.length <= 1 && !outPunch.outSessionId)
                    || outPunch.outSessionId === 'legacy_lunch_session';
                const expectedReturn = matchedSession?.returnDeadline
                    || (allowLegacyDeadlineFallback ? (lunchConfig.returnDeadline || '14:30') : null);
                const sessionGrace = matchedSession
                    ? (matchedSession.gracePeriodMinutes ?? grace)
                    : grace;

                const sessionCutoff = expectedReturn
                    ? timeToMinutes(expectedReturn) + sessionGrace
                    : null;

                let status = 'Regular Work';
                const lunchOutTime = outPunch.time;
                let returnTime = '-';
                let lateMinutes = 0;
                let deductionStatus = 'No Deduction';

                if (sessionInPunch) {
                    returnTime = sessionInPunch.time;
                    lateMinutes = sessionInPunch.lunchLateMinutes || 0;
                    if (lateMinutes > 0) {
                        status = 'Late Return';
                        deductionStatus = `${lateMinutes} mins late-coming deduction`;
                    } else {
                        status = 'Returned On-Time';
                        deductionStatus = 'Within Allowed Limit';
                    }
                } else {
                    const pastCutoff = targetDate === todayStr && sessionCutoff !== null && currentMinutes > sessionCutoff;
                    if (outPunch.isMissingLunchReturn || targetDate < todayStr || pastCutoff) {
                        status = 'Missing Return';
                        deductionStatus = 'Unworked Session Review';
                    } else {
                        status = 'On Break';
                        deductionStatus = 'In Progress';
                    }
                }

                overview.push({
                    workerId: worker._id,
                    name: worker.name,
                    username: worker.username,
                    rfid: worker.rfid,
                    department: worker.department ? worker.department.name : 'Unassigned',
                    date: targetDate,
                    punchType: outPunch.punchType || 'LUNCH_OUT',
                    returnPunchType: sessionInPunch ? (sessionInPunch.punchType || 'LUNCH_IN') : null,
                    breakOutLabel: 'Break OUT',
                    breakInLabel: sessionInPunch ? 'Break IN' : null,
                    sessionId,
                    lunchOutTime,
                    lunchOutSource: outPunch.source || 'SYSTEM/AUTOMATIC',
                    expectedReturnTime: expectedReturn || '-',
                    gracePeriodMinutes: sessionGrace,
                    actualReturnTime: returnTime,
                    lateMinutes,
                    status,
                    deductionStatus,
                    isMissingLunchReturn: status === 'Missing Return'
                });
            }
        }

        const totalRecords = overview.length;
        const hasPaginationParams = page !== undefined && limit !== undefined && Number(limit) > 0;
        const safeLimit = hasPaginationParams ? Math.max(1, Number(limit)) : Math.max(1, totalRecords);
        const totalPages = hasPaginationParams ? Math.max(1, Math.ceil(totalRecords / safeLimit)) : 1;
        const safePage = hasPaginationParams ? Math.min(Math.max(1, Number(page) || 1), totalPages) : 1;
        const paginatedOverview = hasPaginationParams
            ? overview.slice((safePage - 1) * safeLimit, safePage * safeLimit)
            : overview;

        const lunchConfigObj = lunchConfig?.toObject ? lunchConfig.toObject() : { ...lunchConfig };
        res.status(200).json({
            success: true,
            lunchConfig: {
                ...lunchConfigObj,
                sessions: normalizedSessions.map(({ id, enabled, outTime, returnDeadline, gracePeriodMinutes }) => ({
                    id,
                    enabled,
                    outTime,
                    returnDeadline,
                    gracePeriodMinutes
                }))
            },
            overview: paginatedOverview,
            pagination: {
                currentPage: safePage,
                limit: safeLimit,
                totalRecords,
                totalPages,
                hasMore: safePage < totalPages
            }
        });
    } catch (error) {
        console.error('Error fetching lunch attendance overview:', error);
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ message: error.message });
    }
};

module.exports = {
    putAttendance,
    putRfidAttendance,
    getAttendance,
    getPaginatedAttendance, // Add this new function
    getWorkerAttendance,
    getWorkerLastAttendance,
    recognizeFaceAndMarkAttendance,
    getAttendanceSummary,
    getLunchAttendanceOverview,
    resolveLunchReturnDetails,
    resolveRequestTimestamp
};