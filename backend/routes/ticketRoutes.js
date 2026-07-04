const express = require('express');
const router = express.Router();
const {
    getTickets,
    createTicket,
    updateTicket,
    deleteTicket,
    uploadTicketReference,
    deleteTicketReference
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
const { uploadDocument, verifyMagicBytes } = require('../utils/uploadConfig');

const upload = uploadDocument('uploads/tickets', 50); // Using 50MB limit as was previously defined

router.route('/')
    .get(protect, getTickets)
    .post(protect, createTicket);

// Sub-task completion routes
router.get('/:ticketId/completions', protect, getTicketCompletions);
router.post('/completions/upload', protect, upload.array('proofs', 10), verifyMagicBytes, upsertCompletion);
router.post('/completions/reference', protect, upload.array('references', 10), verifyMagicBytes, uploadReference);
router.delete('/completions/:completionId/proof/:fileId', protect, deleteProofFile);
router.delete('/completions/:completionId/reference/:fileId', protect, deleteReferenceFile);
router.put('/completions/:completionId/review', protect, reviewCompletion);

router.route('/:id')
    .put(protect, updateTicket)
    .delete(protect, deleteTicket);

router.post('/:id/reference', protect, upload.array('references', 10), verifyMagicBytes, uploadTicketReference);
router.delete('/:id/reference/:fileId', protect, deleteTicketReference);

module.exports = router;
