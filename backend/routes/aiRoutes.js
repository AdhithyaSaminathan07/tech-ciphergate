const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  analyzeTask, 
  searchSecondBrain, 
  getBrainStats, 
  reindexData,
  uploadPersonalBrainFiles,
  getPersonalBrainFiles,
  deletePersonalBrainFile,
  getPersonalBrainManifest,
  syncPersonalBrainFiles,
  finalizePersonalBrainSync
} = require('../controllers/aiController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Multer config: memory storage, 50MB per file limit, up to 20 files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /\.(txt|md|pdf|json)$/i;
    if (allowedExts.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt, .md, .pdf, .json files are allowed'), false);
    }
  }
});

// ─── Existing AI Routes ───────────────────────────────────────────────────────
router.post('/analyze-task', protect, analyzeTask);
router.get('/search', protect, searchSecondBrain);
router.get('/stats', protect, getBrainStats);
router.post('/reindex', protect, reindexData);

// AI Audit History logs routes
const { logAiDecision, getAiAuditLogs } = require('../controllers/aiController');
router.post('/audit-log', protect, logAiDecision);
router.get('/audit-logs', protect, getAiAuditLogs);

// ─── Personal Brain Routes (Admin Only) ──────────────────────────────────────
router.post('/personal-brain/upload', protect, adminOnly, upload.array('files', 20), uploadPersonalBrainFiles);
router.get('/personal-brain', protect, adminOnly, getPersonalBrainFiles);
router.get('/personal-brain/folder-manifest', protect, adminOnly, getPersonalBrainManifest);
router.post('/personal-brain/folder-sync', protect, adminOnly, upload.array('files', 20), syncPersonalBrainFiles);
router.post('/personal-brain/folder-sync/finalize', protect, adminOnly, finalizePersonalBrainSync);
router.delete('/personal-brain/:id', protect, adminOnly, deletePersonalBrainFile);

module.exports = router;
