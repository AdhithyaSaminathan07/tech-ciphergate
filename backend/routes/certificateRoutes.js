const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');

// Create a new certificate
router.post('/', certificateController.createCertificate);

// Get certificates by type
router.get('/:type', certificateController.getCertificatesByType);

// Update a certificate
router.put('/:id', certificateController.updateCertificate);

// Delete a certificate
router.delete('/:id', certificateController.deleteCertificate);

module.exports = router;
