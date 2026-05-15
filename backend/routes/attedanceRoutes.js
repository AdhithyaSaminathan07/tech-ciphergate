const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  putAttendance,
  getAttendance,
  getPaginatedAttendance, // Add this new function
  getWorkerAttendance,
  putRfidAttendance,
  getWorkerLastAttendance,
  recognizeFaceAndMarkAttendance,
  getAttendanceSummary
} = require('../controllers/attendanceController');

const router = express.Router();

router.post('/summary', protect, getAttendanceSummary);
router.put('/', protect, putAttendance);
router.post('/', protect, getAttendance);
router.post('/paginated', protect, getPaginatedAttendance); // Add this new route
router.post('/rfid', protect, putRfidAttendance);
router.post('/worker', protect, getWorkerAttendance);
router.post('/worker-last', protect, getWorkerLastAttendance);
router.post('/face-recognition', protect, recognizeFaceAndMarkAttendance);

module.exports = router;
