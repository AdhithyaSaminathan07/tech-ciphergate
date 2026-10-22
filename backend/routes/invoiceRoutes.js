const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Routes for creating and getting invoices (allow both admin and worker)
router.route('/')
  .post(adminOrWorker, invoiceController.createInvoice)
  .get(adminOrWorker, invoiceController.getInvoicesByAdminOrWorker);

// Super admin route to get all invoices
router.route('/all')
  .get(adminOnly, invoiceController.getAllInvoices);

// Route to update admin last viewed timestamp
router.route('/admin-viewed')
  .put(adminOnly, invoiceController.updateAdminLastViewed);

// Route to get new invoice count
router.route('/new-count')
  .get(adminOnly, invoiceController.getNewInvoiceCount);

// Routes for delete history
router.route('/delete-history/admin')
  .get(adminOnly, invoiceController.getDeleteHistoryForAdmin);

router.route('/delete-history/worker')
  .get(adminOrWorker, invoiceController.getDeleteHistoryForWorker);

router.route('/delete-history/:id')
  .get(adminOrWorker, invoiceController.getDeletedInvoiceById);

// Route to get next auto-incremented invoice number
router.route('/next-number')
  .get(adminOrWorker, invoiceController.getNextInvoiceNo);

// Route to renumber invoices sequentially (admin only)
router.route('/renumber')
  .post(adminOnly, invoiceController.renumberInvoices);

// Send invoice via WhatsApp
router.route('/:id/send-whatsapp')
  .post(adminOrWorker, invoiceController.sendInvoiceWhatsApp);

// Preview Job Intake classification for an eligible, verified invoice
router.route('/:id/job-intake-preview')
  .get(adminOrWorker, invoiceController.previewJobIntakeForInvoice);

// Trigger Job Intake for an eligible, verified invoice
router.route('/:id/job-intake')
  .post(adminOrWorker, invoiceController.triggerJobIntakeForInvoice);

// Individual invoice routes (allow both admin and worker for their own invoices)
router.route('/:id')
  .get(adminOrWorker, invoiceController.getInvoiceById)
  .put(adminOrWorker, invoiceController.updateInvoice)
  .delete(adminOrWorker, invoiceController.deleteInvoice);

module.exports = router;