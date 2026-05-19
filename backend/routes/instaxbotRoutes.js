// backend/routes/instaxbotRoutes.js
const express   = require('express');
const router    = express.Router();
const WebSocket = require('ws');
const { receiveMessage, getMessages } = require('../controllers/instaxbotController');

router.post('/messages', receiveMessage);
router.get('/messages',  getMessages);

module.exports = router;
