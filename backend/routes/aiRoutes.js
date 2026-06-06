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

// AI Audit History logs routes
const { logAiDecision, getAiAuditLogs } = require('../controllers/aiController');
router.post('/audit-log', protect, logAiDecision);
router.get('/audit-logs', protect, getAiAuditLogs);

module.exports = router;
