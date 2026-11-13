const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const { getNormalizedSessions, getISTDateTime, timeToMinutes } = require('../schedulers/lunchBreakScheduler');
const {
  validateLunchBreakManagementConfig,
  hasMixedScopeWindowOverlap
} = require('../utils/breakSessionValidation');

const normalizeLunchBreakManagement = (lunchConfig) => {
  if (!lunchConfig || typeof lunchConfig !== 'object') return lunchConfig;
  const normalizedObj = lunchConfig.toObject ? lunchConfig.toObject() : { ...lunchConfig };
  const hasExplicitSessions = Array.isArray(normalizedObj.sessions) && normalizedObj.sessions.length > 0;
  const sessions = hasExplicitSessions ? getNormalizedSessions(normalizedObj) : [];
  const primarySession = sessions.find(s => s.enabled !== false) || sessions[0];

  return {
    ...normalizedObj,
    enabled: Boolean(normalizedObj.enabled),
    sessions,
    lunchOutTime: primarySession?.outTime || normalizedObj.lunchOutTime || '13:30',
    returnDeadline: primarySession?.returnDeadline || normalizedObj.returnDeadline || '14:30',
    gracePeriodMinutes: primarySession?.gracePeriodMinutes ?? normalizedObj.gracePeriodMinutes ?? 0
  };
};

const validateLunchBreakManagement = (lunchConfig, options = {}) => {
  return validateLunchBreakManagementConfig(lunchConfig, options);
};

const resolveAuthenticatedSubdomain = (req, res) => {
  const rawAuthSubdomain = req.user?.subdomain || req.apiKey?.subdomain;
  const authSubdomain = rawAuthSubdomain ? String(rawAuthSubdomain).trim().toLowerCase() : '';

  if (!authSubdomain || authSubdomain === 'undefined' || authSubdomain === 'null' || authSubdomain === 'main') {
    res.status(401).json({ message: 'Not authorized, organization context missing' });
    return null;
  }

  const rawParam = req.params?.subdomain;
  if (rawParam !== undefined && rawParam !== null) {
    const paramSubdomain = String(rawParam).trim().toLowerCase();
    if (paramSubdomain && paramSubdomain !== 'undefined' && paramSubdomain !== 'null' && paramSubdomain !== 'main') {
      if (paramSubdomain !== authSubdomain) {
        res.status(403).json({ message: 'Access denied. Cannot access another organization settings.' });
        return null;
      }
    }
  }

  return authSubdomain;
};

// @desc    Get settings
// @route   GET /api/settings/:subdomain
// @access  Private/AdminOrWorker
const getSettings = async (req, res) => {
  try {
    const subdomain = resolveAuthenticatedSubdomain(req, res);
    if (!subdomain) return;

    let settings = await Settings.findOne({ subdomain });

    // If settings don't exist for this authenticated tenant, create default settings
    if (!settings) {
      const settingsData = {
        subdomain
      };

      // Only add updatedBy if req.user exists and has an _id
      if (req.user && req.user._id) {
        settingsData.updatedBy = req.user._id;
      }

      settings = await Settings.create(settingsData);
      console.log(`Created default settings for subdomain: ${subdomain}`);
    }

    const settingsObj = settings.toObject ? settings.toObject() : { ...settings };
    if (settingsObj.lunchBreakManagement) {
      settingsObj.lunchBreakManagement = normalizeLunchBreakManagement(settingsObj.lunchBreakManagement);
    }
    if (settingsObj.aiConfig && settingsObj.aiConfig.deepseekApiKey) {
      const key = settingsObj.aiConfig.deepseekApiKey;
      settingsObj.aiConfig.deepseekApiKey = key.length > 8        ? `${key.substring(0, 4)}****${key.substring(key.length - 4)}`        : '****';
    }

    res.json(settingsObj);
  } catch (error) {

    console.error('Error in getSettings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get settings for public access (location validation)
// @route   GET /api/settings/public/:subdomain
// @access  Public
const getSettingsPublic = async (req, res) => {
  try {
    const rawParam = req.params?.subdomain;
    const subdomain = rawParam ? String(rawParam).trim().toLowerCase() : '';
    if (!subdomain || subdomain === 'undefined' || subdomain === 'null' || subdomain === 'main') {
      return res.status(400).json({ message: 'Company subdomain is required' });
    }

    const settings = await Settings.findOne({ subdomain });
    if (!settings) {
      return res.status(404).json({ message: 'Company settings not found' });
    }

    const normalizedLunchPublic = settings.lunchBreakManagement
      ? normalizeLunchBreakManagement(settings.lunchBreakManagement)
      : settings.lunchBreakManagement;

    const sanitizedLunchPublic = normalizedLunchPublic
      ? {
          enabled: Boolean(normalizedLunchPublic.enabled),
          lunchOutTime: normalizedLunchPublic.lunchOutTime,
          returnDeadline: normalizedLunchPublic.returnDeadline,
          gracePeriodMinutes: normalizedLunchPublic.gracePeriodMinutes ?? 0,
          appliesTo: normalizedLunchPublic.appliesTo || 'all',
          sessions: Array.isArray(normalizedLunchPublic.sessions)
            ? normalizedLunchPublic.sessions.map(({ enabled, outTime, returnDeadline, gracePeriodMinutes }) => ({
                enabled: enabled !== false,
                outTime,
                returnDeadline,
                gracePeriodMinutes: gracePeriodMinutes ?? 0
              }))
            : []
        }
      : normalizedLunchPublic;

    // Only return non-sensitive public access configuration (no paymentDetails, no AI keys)
    const publicSettings = {
      attendanceLocation: settings.attendanceLocation,
      attendanceAccessControl: settings.attendanceAccessControl,
      lunchBreakManagement: sanitizedLunchPublic,
      faceRecognition: settings.faceRecognition,
      bugBountyConfig: settings.bugBountyConfig || {
        enabled: true,
        bugReportUrl: 'https://techvaseegrah.com/bug-bounty',
        disclosureMessage: 'Visit to check the bug bounty to earn for each bug 1000',
        popupFrequency: 'every_day'
      }
    };

    res.json(publicSettings);
  } catch (error) {
    console.error('Error in getSettingsPublic:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update meal settings
// @route   PUT /api/settings/:subdomain/:mealType
// @access  Private/Admin
const updateMealSettings = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only admins can modify settings.' });
    }

    const subdomain = resolveAuthenticatedSubdomain(req, res);
    if (!subdomain) return;

    const { mealType } = req.params;
    const updateData = req.body;

    let settings = await Settings.findOne({ subdomain });

    // If settings don't exist, create them
    if (!settings) {
      // Use req.user._id if available, otherwise create without it
      const settingsData = {
        subdomain
      };

      // Only add updatedBy if req.user exists and has an _id
      if (req.user && req.user._id) {
        settingsData.updatedBy = req.user._id;
      }

      settings = await Settings.create(settingsData);
      console.log(`Created settings for subdomain: ${subdomain}`);
    }

    // Update the specific meal settings
    settings[mealType] = {
      ...settings[mealType],
      ...updateData
    };

    const updatedSettings = await settings.save();
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error in updateMealSettings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update general settings
// @route   PUT /api/settings/:subdomain
// @access  Private/Admin
const updateSettings = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only admins can modify settings.' });
    }

    const subdomain = resolveAuthenticatedSubdomain(req, res);
    if (!subdomain) return;

    const updateData = req.body;
    console.log(`[Settings] Updating settings for subdomain: ${subdomain}. Payload:`, JSON.stringify(updateData, null, 2));

    let settings = await Settings.findOne({ subdomain });

    // If settings don't exist, create them
    if (!settings) {
      const settingsData = {
        subdomain: subdomain
      };

      // Only add updatedBy if req.user exists and has an _id
      if (req.user && req.user._id) {
        settingsData.updatedBy = req.user._id;
      }

      settings = await Settings.create(settingsData);
      console.log(`Created settings for subdomain: ${subdomain}`);
    }

    // Validate location settings if provided
    if (updateData.attendanceLocation) {
      const { latitude, longitude, radius } = updateData.attendanceLocation;

      // Validate latitude
      if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
        return res.status(400).json({
          message: 'Latitude must be between -90 and 90 degrees'
        });
      }

      // Validate longitude
      if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
        return res.status(400).json({
          message: 'Longitude must be between -180 and 180 degrees'
        });
      }

      // Validate radius
      if (radius !== undefined && (radius < 10 || radius > 1000)) {
        return res.status(400).json({
          message: 'Radius must be between 10 and 1000 meters'
        });
      }
    }

    // Remove the locking logic to allow changes anytime
    // Simply allow all location updates without restrictions

    // Use findOneAndUpdate to properly handle nested objects
    // Prepare update object
    const updateObject = { ...updateData };

    if (updateObject.lunchBreakManagement) {
      let lunchValidationError = validateLunchBreakManagement(updateObject.lunchBreakManagement);
      if (!lunchValidationError && hasMixedScopeWindowOverlap(updateObject.lunchBreakManagement)) {
        try {
          const workerQuery = Worker.find({ subdomain, status: 'Active' });
          const activeWorkers = typeof workerQuery?.select === 'function'
            ? await workerQuery.select('_id department batch shift').lean()
            : await workerQuery;
          if (Array.isArray(activeWorkers) && activeWorkers.length > 0) {
            lunchValidationError = validateLunchBreakManagement(updateObject.lunchBreakManagement, {
              workers: activeWorkers
            });
          }
        } catch {
          // Ignore worker lookup failure in isolated environments without Worker collection
        }
      }
      if (lunchValidationError) {
        return res.status(400).json({ message: lunchValidationError });
      }
      updateObject.lunchBreakManagement = normalizeLunchBreakManagement(updateObject.lunchBreakManagement);
    }

    // Strip transient request-only reschedule flags before persisting Settings document
    const explicitRescheduleSessionIds = Array.isArray(updateObject.explicitRescheduleSessionIds)
      ? [...new Set(updateObject.explicitRescheduleSessionIds.map(id => String(id || '').trim()).filter(Boolean))]
      : [];
    delete updateObject.explicitRescheduleSessionIds;

    // Remove protected fields
    delete updateObject.subdomain;
    delete updateObject._id;

    // Add metadata
    updateObject.lastUpdated = Date.now();
    if (req.user && req.user._id) {
      updateObject.updatedBy = req.user._id;
    }

    const updatedSettings = await Settings.findOneAndUpdate(
      { subdomain },
      { $set: updateObject },
      { new: true, upsert: true, runValidators: true }
    );

    // Explicit audited same-day rescheduling:
    // Ordinary time edits preserve session IDs and NEVER silently clear same-day locks.
    // Only when an admin explicitly approves reprocessing for specific session IDs:
    //   1) Emit an audit log (without PII)
    //   2) Pull today's lock ONLY for workers who do NOT already have a LUNCH_OUT record for that session
    //      (guaranteeing duplicate LUNCH_OUT records can never be created).
    let rescheduleAudit = null;
    if (explicitRescheduleSessionIds.length > 0 && updateObject.lunchBreakManagement) {
      const { dateStr: todayIST } = getISTDateTime(new Date());
      const activeWorkers = await Worker.find({ subdomain, status: 'Active' });
      let unlockedCount = 0;
      let preservedCount = 0;

      for (const sessionId of explicitRescheduleSessionIds) {
        const lockKey = `${todayIST}_${sessionId}`;
        for (const w of activeWorkers) {
          const hasLock = Array.isArray(w.processedOutSessions) && w.processedOutSessions.includes(lockKey);
          if (!hasLock) continue;

          const existingOut = await Attendance.findOne({
            worker: w._id,
            subdomain,
            date: todayIST,
            punchType: 'LUNCH_OUT',
            outSessionId: sessionId
          });

          if (existingOut) {
            preservedCount++;
          } else {
            await Worker.updateOne(
              { _id: w._id },
              { $pull: { processedOutSessions: lockKey } }
            );
            unlockedCount++;
          }
        }
      }

      rescheduleAudit = {
        subdomain,
        date: todayIST,
        adminId: req.user?._id ? String(req.user._id) : 'system',
        sessionIds: explicitRescheduleSessionIds,
        unlockedOrphanLocks: unlockedCount,
        preservedExecutedRecords: preservedCount
      };
      console.log('[Settings] ExplicitSessionRescheduleAudit', JSON.stringify(rescheduleAudit));
    }

    const responseObj = updatedSettings?.toObject ? updatedSettings.toObject() : updatedSettings;
    if (responseObj?.lunchBreakManagement) {
      responseObj.lunchBreakManagement = normalizeLunchBreakManagement(responseObj.lunchBreakManagement);
    }
    if (rescheduleAudit) {
      responseObj.rescheduleAudit = rescheduleAudit;
    }

    res.json(responseObj);
  } catch (error) {
    console.error('Error in updateSettings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getSettings,
  getSettingsPublic,
  updateMealSettings,
  updateSettings,
  normalizeLunchBreakManagement,
  validateLunchBreakManagement
};