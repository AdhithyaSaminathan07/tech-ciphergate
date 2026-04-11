// attendance _31/server/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const {
  createNotification,
  readNotification,
  updateNotification,
  deleteNotification
} = require('../controllers/notificationController');


const { protect, adminOnly, adminOrWorker } = require('../middleware/authMiddleware'); 


router.get('/:subdomain', protect, adminOrWorker, readNotification); 


router.post('/', protect, createNotification);        
router.put('/:id', protect, updateNotification); 
router.delete('/:id', protect, deleteNotification); 

module.exports = router;