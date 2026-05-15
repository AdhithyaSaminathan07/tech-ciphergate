const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  createRenewal,
  getRenewals,
  getRenewalById,
  updateRenewal,
  deleteRenewal,
  sendWhatsAppManual,
  markAsRenewed
} = require('../controllers/renewalController');

// All renewal routes base: /api/renewals
router.use(protect, adminOnly);

router.route('/')
  .post(createRenewal)
  .get(getRenewals);

router.route('/:id')
  .get(getRenewalById)
  .put(updateRenewal)
  .delete(deleteRenewal);

router.post('/:id/send-wa', sendWhatsAppManual);
router.put('/:id/mark-renewed', markAsRenewed);

module.exports = router;
