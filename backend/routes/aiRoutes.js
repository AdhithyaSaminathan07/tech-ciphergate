const express = require('express');
const router = express.Router();
const { 
  analyzeTask, 
  searchSecondBrain, 
  getBrainStats, 
  reindexData 
} = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

router.post('/analyze-task', protect, analyzeTask);
router.get('/search', protect, searchSecondBrain);
router.get('/stats', protect, getBrainStats);
router.post('/reindex', protect, reindexData);

module.exports = router;
