// routes/webhookRoutes.js

const express = require('express');
const router = express.Router();
const { handleWhatsAppWebhook, verifyWebhook } = require('../controllers/webhookController');

/**
 * @swagger
 * tags:
 *   name: Webhook
 *   description: Webhook endpoints for third-party integrations
 */

/**
 * @swagger
 * /api/webhook/whatsapp:
 *   get:
 *     summary: Verify WhatsApp Webhook
 *     tags: [Webhook]
 *     description: Endpoint for Meta to verify the webhook URL.
 *     responses:
 *       200:
 *         description: Successfully verified.
 *       403:
 *         description: Verification failed.
 *   post:
 *     summary: Handle WhatsApp Webhook Events
 *     tags: [Webhook]
 *     description: Receives event notifications from the WhatsApp Business API.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Webhook payload from Meta.
 *     responses:
 *       200:
 *         description: Event received successfully.
 */
router.route('/whatsapp')
  .get(verifyWebhook)
  .post(handleWhatsAppWebhook);

module.exports = router;