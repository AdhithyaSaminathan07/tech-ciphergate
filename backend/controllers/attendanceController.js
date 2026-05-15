const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Settings = require('../models/Settings');

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
            worker: worker._id
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
            worker: worker._id
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
            for (const embedding of worker.faceEmbeddings) {
                // Calculate Euclidean distance between face descriptors
                const distance = calculateEuclideanDistance(faceDescriptor, embedding);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = worker;
                }
            }
        }

        // Set a threshold for face recognition (adjust as needed)
        const threshold = 0.4;

        if (!bestMatch || minDistance > threshold) {
            res.status(404);
            throw new Error('No matching worker found');
        }

        if (bestMatch.status === 'Relieved') {
            res.status(403);
            throw new Error('This employee is relieved and cannot mark attendance');
        }

        // Get the worker's department
        const department = await Department.findById(bestMatch.department);
        if (!department) {
            res.status(404);
            throw new Error('Department not found');
        }

        // Get the current date and time in 'Asia/Kolkata' timezone
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

        // Determine presence based on last attendance
        const lastAttendance = await Attendance.findOne({ rfid: bestMatch.rfid, subdomain }).sort({ createdAt: -1 });
        const presence = lastAttendance ? !lastAttendance.presence : true;

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
            worker: bestMatch._id
        });

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
        const { subdomain } = req.body;

        if (!subdomain || subdomain === 'main') {
            res.status(401);
            throw new Error('Company name is missing, login again');
        }

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

module.exports = {
    putAttendance,
    putRfidAttendance,
    getAttendance,
    getPaginatedAttendance, // Add this new function
    getWorkerAttendance,
    getWorkerLastAttendance,
    recognizeFaceAndMarkAttendance,
    getAttendanceSummary
};