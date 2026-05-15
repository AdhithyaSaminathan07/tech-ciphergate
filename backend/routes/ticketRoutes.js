const express = require('express');
const router = express.Router();
const {
    getTickets,
    createTicket,
    updateTicket,
    deleteTicket
} = require('../controllers/ticketController');
const {
    upsertCompletion,
    getTicketCompletions,
    deleteProofFile,
    reviewCompletion,
    uploadReference,
    deleteReferenceFile
} = require('../controllers/subTaskCompletionController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

router.route('/')
    .get(protect, getTickets)
    .post(protect, createTicket);

router.route('/:id')
    .put(protect, updateTicket)
    .delete(protect, deleteTicket);

// Sub-task completion routes
router.get('/:ticketId/completions', protect, getTicketCompletions);
router.post('/completions/upload', protect, upload.array('proofs', 10), upsertCompletion);
router.post('/completions/reference', protect, upload.array('references', 10), uploadReference);
router.delete('/completions/:completionId/proof/:fileId', protect, deleteProofFile);
router.delete('/completions/:completionId/reference/:fileId', protect, deleteReferenceFile);
router.put('/completions/:completionId/review', protect, reviewCompletion);

module.exports = router;
