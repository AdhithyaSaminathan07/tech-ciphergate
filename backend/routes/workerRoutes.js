const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Multer config: save to backend/uploads/workers/ ─────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/workers');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
                allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
  },
});
// ─────────────────────────────────────────────────────────────────────────────

const { 
  getWorkers, 
  createWorker, 
  getWorkerById, 
  updateWorker, 
  deleteWorker,
  getWorkerActivities,
  resetWorkerActivities,
  getPublicWorkers,
  generateId,
  getWorkerByRfid,
  getEmployeeHistory
} = require('../controllers/workerController');
const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware');

router.route('/').post(protect, adminOnly, createWorker);
router.route('/all').post(protect, adminOrWorker, getWorkers);
router.route('/generate-id').get(protect, generateId);
router.route('/get-worker-by-rfid').post(getWorkerByRfid);
router.route('/history').get(protect, adminOnly, getEmployeeHistory);

router.post('/public', getPublicWorkers);

// ─── Photo upload — replaces Supabase ───────────────────────────────────────
// POST /api/workers/upload-photo  (multipart/form-data, field: "photo")
// Returns: { url: "/uploads/workers/filename.jpg" }
// Served by Express /uploads static + Nginx proxy
router.post('/upload-photo', protect, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const publicUrl = `/uploads/workers/${req.file.filename}`;
  res.status(200).json({ url: publicUrl });
});
// ─────────────────────────────────────────────────────────────────────────────

router.route('/:id')
  .get(protect, getWorkerById)
  .put(protect, updateWorker)
  .delete(protect, adminOnly, deleteWorker);

router.route('/:id/activities')
  .get(protect, getWorkerActivities)
  .delete(protect, adminOnly, resetWorkerActivities);

module.exports = router;