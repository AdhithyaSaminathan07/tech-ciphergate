// backend/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getSettings,
  getSettingsPublic,
  updateMealSettings,
  updateSettings
} = require('../controllers/settingsController');
const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware');

// Admin routes
router.put('/:subdomain/:mealType', protect, adminOnly, updateMealSettings);
router.put('/:subdomain', protect, adminOnly, updateSettings);
router.get('/:subdomain', protect, adminOrWorker, getSettings);

// Public route for getting settings (for location validation)
router.get('/public/:subdomain', getSettingsPublic);

module.exports = router;