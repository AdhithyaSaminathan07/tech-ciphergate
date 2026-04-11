// backend/routes/foodRequestRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getTodayRequests, 
  submitFoodRequest, 
  submitRequestForWorker,
  toggleFoodRequests,
  getSettings,
  updateMealSettings,
  getMealsSummary,
  toggleEmailReports
} = require('../controllers/foodRequestController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Worker routes
router.post('/', protect, submitFoodRequest);

// Admin routes
router.post('/admin/request', protect, adminOnly, submitRequestForWorker);
router.get('/:subdomain', protect, adminOnly, getTodayRequests); 
router.get('/:subdomain/summary', protect, adminOnly, getMealsSummary);
router.put('/toggle/:subdomain', protect, adminOnly, toggleFoodRequests);
router.put('/settings/:subdomain/:mealType', protect, adminOnly, updateMealSettings);
router.get('/settings/:subdomain', protect, getSettings);
router.put('/email-reports/:subdomain', protect, adminOnly, toggleEmailReports);

module.exports = router;