const Settings = require('../models/Settings');

// @desc    Get settings
// @route   GET /api/settings/:subdomain
// @access  Private/Admin
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne({ subdomain: req.params.subdomain });

    // If settings don't exist, create default settings
    if (!settings) {
      // Use req.user._id if available, otherwise create without it
      const settingsData = {
        subdomain: req.params.subdomain
      };

      // Only add updatedBy if req.user exists and has an _id
      if (req.user && req.user._id) {
        settingsData.updatedBy = req.user._id;
      }

      settings = await Settings.create(settingsData);
      console.log(`Created default settings for subdomain: ${req.params.subdomain}`);
    }

    res.json(settings);
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
    let settings = await Settings.findOne({ subdomain: req.params.subdomain });

    // If settings don't exist, create default settings
    if (!settings) {
      settings = await Settings.create({
        subdomain: req.params.subdomain
      });
      console.log(`Created default public settings for subdomain: ${req.params.subdomain}`);
    }

    // Only return location settings for public access
    const publicSettings = {
      attendanceLocation: settings.attendanceLocation,
      attendanceAccessControl: settings.attendanceAccessControl
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
    const { subdomain, mealType } = req.params;
    const updateData = req.body;

    let settings = await Settings.findOne({ subdomain });

    // If settings don't exist, create them
    if (!settings) {
      // Use req.user._id if available, otherwise create without it
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
    const { subdomain } = req.params;
    const updateData = req.body;

    let settings = await Settings.findOne({ subdomain });

    // If settings don't exist, create them
    if (!settings) {
      // Use req.user._id if available, otherwise create without it
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
      { new: true, runValidators: true }
    );

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error in updateSettings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getSettings,
  getSettingsPublic,
  updateMealSettings,
  updateSettings
};