const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Settings = require('../models/Settings');

// Helper: Resolve lunch / break return details when punching in
const resolveLunchReturnDetails = async (rfid, subdomain, newPresence, currentDateFormatted, workerId) => {
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

        if (lastPunchToday && (lastPunchToday.punchType === 'LUNCH_OUT' || lastPunchToday.isLunchPunch) && !lastPunchToday.presence) {
            punchType = 'LUNCH_IN';
            isLunchPunch = true;
            outSessionId = lastPunchToday.outSessionId || null;
            outSessionName = lastPunchToday.outSessionName || null;

            if (lastPunchToday.isMissingLunchReturn) {
                lastPunchToday.isMissingLunchReturn = false;
                await lastPunchToday.save();
            }

            const settings = await Settings.findOne({ subdomain });
            const lunchConfig = settings?.lunchBreakManagement;

            if (lunchConfig && lunchConfig.enabled) {
                // Find matching session from sessions array or fallback to legacy top-level fields
                let matchedSession = null;
                const sessions = Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0
                    ? lunchConfig.sessions
                    : null;

                if (sessions && outSessionId) {
                    matchedSession = sessions.find(s => s.id === outSessionId);
                }

                if (!matchedSession && sessions && outSessionName) {
                    matchedSession = sessions.find(s => s.name === outSessionName);
                }

                if (!matchedSession && sessions && sessions.length > 0) {
                    matchedSession = sessions[0];
                }

                const returnDeadline = matchedSession?.returnDeadline || lunchConfig.returnDeadline || '14:30';
                const grace = matchedSession?.gracePeriodMinutes ?? lunchConfig.gracePeriodMinutes ?? 0;
                if (!outSessionName) {
                    outSessionName = matchedSession?.name || 'Lunch Break';
                }

                const timeFormatter24 = new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const current24 = timeFormatter24.format(new Date());
                const [currH, currM] = current24.split(':').map(Number);
                const currentMinutes = currH * 60 + currM;

                const [deadH, deadM] = returnDeadline.split(':').map(Number);
                const deadlineMinutes = deadH * 60 + deadM;
                const threshold = deadlineMinutes + grace;

                if (currentMinutes > threshold) {
                    lunchLateMinutes = currentMinutes - threshold;
                }
            }
        }
    }

    return { punchType, isLunchPunch, lunchLateMinutes, outSessionId, outSessionName };
};


// @desc    Update or create attendance record for a worker
// @route   PUT /api/attendance
// @access  Private
const putAttendance = async (req, res) => {
    try {
        const { rfid, subdomain, presence: providedPresence } = req.body;

        console.log('putAttendance called with:', { rfid, subdomain, providedPresence, providedPresenceType: typeof providedPresence });

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

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

        // Check if the worker has punched attendance within the last 1 minute
        const oneMinuteAgo = new Date(Date.now() - 60000); // 60000 ms = 1 minute
        const recentAttendance = await Attendance.findOne({
            rfid,
            subdomain,
            createdAt: { $gte: oneMinuteAgo }
        });

        if (recentAttendance) {
            // Return success: false with custom message instead of throwing error
            return res.status(200).json({
                success: false,
                message: "Try punch in or punch out after 1 minute."
            });
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

        const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const indiaTimezoneTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const currentDateFormatted = indiaTimezoneDate.format(new Date());
        const currentTimeFormatted = indiaTimezoneTime.format(new Date());

        let newPresence;
        if (typeof providedPresence === 'boolean') {
            // Use the presence state provided by the frontend
            newPresence = providedPresence;
            console.log('Using provided presence:', newPresence);
        } else {
            // Determine presence state based on last attendance (existing logic)
            console.log('No provided presence, calculating based on last attendance');
            const lastAttendance = await Attendance.findOne({ rfid, subdomain }).sort({ createdAt: -1 });

            if (!lastAttendance) {
                newPresence = true;
            } else {
                newPresence = !lastAttendance.presence;

                // Safely format the last attendance date
                let lastPunchDateFormatted;
                try {
                    // Handle different date formats
                    if (lastAttendance.date instanceof Date) {
                        lastPunchDateFormatted = indiaTimezoneDate.format(lastAttendance.date);
                    } else if (typeof lastAttendance.date === 'string') {
                        // Try to parse the string as a date
                        const parsedDate = new Date(lastAttendance.date);
                        if (!isNaN(parsedDate.getTime())) {
                            lastPunchDateFormatted = indiaTimezoneDate.format(parsedDate);
                        } else {
                            // If parsing fails, use the string as is
                            lastPunchDateFormatted = lastAttendance.date;
                        }
                    } else {
                        // For any other type, convert to string
                        lastPunchDateFormatted = String(lastAttendance.date);
                    }
                } catch (dateError) {
                    console.error('Error formatting last attendance date:', dateError);
                    // Fallback to current date if formatting fails
                    lastPunchDateFormatted = currentDateFormatted;
                }

                if (newPresence === true && lastAttendance.presence === true && lastPunchDateFormatted !== currentDateFormatted) {
                    // Use proper time format for auto-generated attendance
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
                        time: defaultEndOfDayTime, // Use proper time format
                        presence: false,
                        worker: worker._id,
                        isMissedOutPunch: true
                    });
                    console.log(`Auto-generated OUT for ${worker.name} on ${lastPunchDateFormatted} at ${defaultEndOfDayTime} due to missed punch.`);
                }
            }
        }

        console.log('Final presence value to be recorded:', newPresence);

        const lunchDetails = await resolveLunchReturnDetails(
            rfid,
            subdomain,
            newPresence,
            currentDateFormatted,
            worker._id
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
            punchType: lunchDetails.punchType,
            isLunchPunch: lunchDetails.isLunchPunch,
            lunchLateMinutes: lunchDetails.lunchLateMinutes,
            outSessionId: lunchDetails.outSessionId,
            outSessionName: lunchDetails.outSessionName,
            source: 'MANUAL'
        });

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
        const { rfid, presence: providedPresence, latitude, longitude } = req.body;

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

        // Check if the worker has punched attendance within the last 1 minute
        const oneMinuteAgo = new Date(Date.now() - 60000); // 60000 ms = 1 minute
        const recentAttendance = await Attendance.findOne({
            rfid,
            createdAt: { $gte: oneMinuteAgo }
        });

        if (recentAttendance) {
            // Return success: false with custom message instead of throwing error
            return res.status(200).json({
                success: false,
                message: "Try punch in or punch out after 1 minute."
            });
        }

        const worker = await Worker.findOne({ rfid });
        if (!worker) {
            res.status(404);
            throw new Error('Worker not found');
        }

        if (worker.status === 'Relieved') {
            res.status(403);
            throw new Error('This employee is relieved and cannot mark attendance');
        }

        const { subdomain } = worker;

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

        const indiaTimezoneDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const indiaTimezoneTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const currentDateFormatted = indiaTimezoneDate.format(new Date());
        const currentTimeFormatted = indiaTimezoneTime.format(new Date());

        let presence;
        if (typeof providedPresence === 'boolean') {
            // Use the presence state provided by the frontend
            presence = providedPresence;
        } else {
            // Determine presence state based on last attendance (existing logic)
            const allAttendances = await Attendance.find({ rfid, subdomain }).sort({ createdAt: -1 });

            if (allAttendances.length > 0) {
                const lastAttendance = allAttendances[0];
                presence = !lastAttendance.presence;
            } else {
                presence = true;
            }
        }

        const lunchDetails = await resolveLunchReturnDetails(
            rfid,
            subdomain,
            presence,
            currentDateFormatted,
            worker._id
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
            punchType: lunchDetails.punchType,
            isLunchPunch: lunchDetails.isLunchPunch,
            lunchLateMinutes: lunchDetails.lunchLateMinutes,
            outSessionId: lunchDetails.outSessionId,
            outSessionName: lunchDetails.outSessionName,
            source: 'MANUAL'
        });

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
        const { subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        const attendanceData = await Attendance.find({ subdomain }).populate('worker').populate('department');

        res.status(200).json({ message: 'Attendance data retrieved successfully', attendance: attendanceData });
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
        const { subdomain, page = 1, limit = 2 } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get all unique dates for the subdomain
        const allDates = await Attendance.distinct('date', { subdomain });

        // Sort dates manually (newest first)
        const sortedDates = allDates.sort((a, b) => new Date(b) - new Date(a));

        // Get the dates for the current page
        const datesForPage = sortedDates.slice(skip, skip + limit);

        // If no dates for this page, return empty result
        if (datesForPage.length === 0) {
            return res.status(200).json({
                message: 'Attendance data retrieved successfully',
                attendance: [],
                hasMore: false,
                currentPage: page,
                totalPages: Math.ceil(sortedDates.length / limit)
            });
        }

        // Get all attendance records for the dates on this page
        const attendanceData = await Attendance.find({
            subdomain,
            date: { $in: datesForPage }
        }).sort({ date: -1, createdAt: -1 });

        // Check if there are more records available
        const hasMore = skip + limit < sortedDates.length;

        res.status(200).json({
            message: 'Attendance data retrieved successfully',
            attendance: attendanceData,
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
        const { rfid, subdomain } = req.body;

        if (!subdomain || subdomain == 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid == '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        const workerAttendance = await Attendance.find({ rfid, subdomain });

        res.status(200).json({ message: 'Worker attendance data retrieved successfully', attendance: workerAttendance });
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
        const { rfid, subdomain } = req.body;

        console.log('getWorkerLastAttendance called with:', { rfid, subdomain });

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

        if (!rfid || rfid === '') {
            res.status(401);
            throw new Error('RFID is required');
        }

        // Find the last attendance record for this worker
        const lastAttendance = await Attendance.findOne({ rfid, subdomain }).sort({ createdAt: -1 });

        console.log('Last attendance record found:', lastAttendance);

        if (!lastAttendance) {
            // No previous attendance record, so this will be a Punch In
            console.log('No previous attendance record, next action will be Punch In');
            res.status(200).json({
                presence: true,
                message: 'No previous attendance record found. Next action will be Punch In.'
            });
        } else {
            // Determine next action based on last attendance
            const nextPresence = !lastAttendance.presence;
            console.log('Last presence was:', lastAttendance.presence, 'So next presence should be:', nextPresence);
            res.status(200).json({
                presence: nextPresence,
                lastAttendance: lastAttendance,
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
        const { faceDescriptor, subdomain } = req.body;

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

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
            const dayPunches = await Attendance.find({
                worker: worker._id,
                subdomain,
                date: targetDate
            }).sort({ createdAt: 1 });

            if (dayPunches.length === 0) continue;

            const sessionOutPunches = dayPunches.filter(p => p.punchType === 'LUNCH_OUT' || (p.isLunchPunch && !p.presence));

            for (const outPunch of sessionOutPunches) {
                const sessionInPunch = dayPunches.find(p =>                    p.createdAt > outPunch.createdAt && (p.punchType === 'LUNCH_IN' || (p.isLunchPunch && p.presence) || p.presence)
                );

                const sessionName = outPunch.outSessionName || 'Lunch Break';
                const sessionId = outPunch.outSessionId;

                // Match session configuration
                let matchedSession = null;
                if (Array.isArray(lunchConfig.sessions) && lunchConfig.sessions.length > 0) {
                    matchedSession = lunchConfig.sessions.find(s => s.id === sessionId) ||                                     lunchConfig.sessions.find(s => s.name === sessionName) ||
                                     lunchConfig.sessions[0];
                }

                const expectedReturn = matchedSession?.returnDeadline || lunchConfig.returnDeadline || '14:30';
                const sessionGrace = matchedSession?.gracePeriodMinutes ?? grace;

                const [deadH, deadM] = expectedReturn.split(':').map(Number);
                const deadlineMinutes = deadH * 60 + deadM;
                const sessionCutoff = deadlineMinutes + sessionGrace;

                let status = 'Regular Work';
                let lunchOutTime = outPunch.time;
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
                    if (currentMinutes > sessionCutoff || targetDate < indiaTimezoneDate.format(new Date())) {
                        status = 'Missing Lunch Return';
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
                    sessionId: sessionId || null,
                    sessionName: sessionName,
                    lunchOutTime,
                    lunchOutSource: outPunch.source || 'SYSTEM/AUTOMATIC',
                    expectedReturnTime: expectedReturn,
                    gracePeriodMinutes: sessionGrace,
                    actualReturnTime: returnTime,
                    lateMinutes,
                    status,
                    deductionStatus,
                    isMissingLunchReturn: status === 'Missing Lunch Return'
                });
            }
        }

        res.status(200).json({
            success: true,
            lunchConfig,
            overview
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
    getLunchAttendanceOverview
};