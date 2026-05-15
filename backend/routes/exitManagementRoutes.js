const express = require('express');
const router = express.Router();
const { processRelieve, getExitHistory } = require('../controllers/exitManagementController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect, adminOnly);

router.post('/relieve', processRelieve);
router.get('/history', getExitHistory);

module.exports = router;
