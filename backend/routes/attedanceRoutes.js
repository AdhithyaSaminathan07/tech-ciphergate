const express = require('express');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  putAttendance,
  getAttendance,
  getPaginatedAttendance, // Add this new function
  getWorkerAttendance,
  putRfidAttendance,
  getWorkerLastAttendance,
  recognizeFaceAndMarkAttendance,
  getAttendanceSummary,
  getLunchAttendanceOverview
} = require('../controllers/attendanceController');

const router = express.Router();

router.post('/summary', protect, adminOnly, getAttendanceSummary);
router.post('/lunch-overview', protect, adminOnly, getLunchAttendanceOverview);
router.put('/', protect, putAttendance);
router.post('/', protect, adminOnly, getAttendance);
router.post('/paginated', protect, adminOnly, getPaginatedAttendance); // Add this new route
router.post('/rfid', protect, putRfidAttendance);
router.post('/worker', protect, getWorkerAttendance);
router.post('/worker-last', protect, getWorkerLastAttendance);
router.post('/face-recognition', protect, recognizeFaceAndMarkAttendance);

module.exports = router;
