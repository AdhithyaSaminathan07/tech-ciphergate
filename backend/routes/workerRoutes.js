const express = require('express');
const router = express.Router();
const { uploadImage, verifyMagicBytes } = require('../utils/uploadConfig');

// ─── Multer config: save to backend/uploads/workers/ ─────────────────────────
const upload = uploadImage('uploads/workers');
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
const { validateRequest } = require('../middleware/validateMiddleware');
const { createWorkerSchema, updateWorkerSchema } = require('../validations/workerSchemas');

router.route('/').post(protect, adminOnly, validateRequest(createWorkerSchema), createWorker);
router.route('/all').post(protect, adminOrWorker, getWorkers);
router.route('/generate-id').get(protect, generateId);
router.route('/get-worker-by-rfid').post(getWorkerByRfid);
router.route('/history').get(protect, adminOnly, getEmployeeHistory);

router.post('/public', getPublicWorkers);

// ─── Photo upload — replaces Supabase ───────────────────────────────────────
// POST /api/workers/upload-photo  (multipart/form-data, field: "photo")
// Returns: { url: "/uploads/workers/filename.jpg" }
// Served by Express /uploads static + Nginx proxy
router.post('/upload-photo', protect, upload.single('photo'), verifyMagicBytes, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const publicUrl = `/uploads/workers/${req.file.filename}`;
  res.status(200).json({ url: publicUrl });
});
// ─────────────────────────────────────────────────────────────────────────────

router.route('/:id')
  .get(protect, getWorkerById)
  .put(protect, validateRequest(updateWorkerSchema), updateWorker)
  .delete(protect, adminOnly, deleteWorker);

router.route('/:id/activities')
  .get(protect, getWorkerActivities)
  .delete(protect, adminOnly, resetWorkerActivities);

module.exports = router;