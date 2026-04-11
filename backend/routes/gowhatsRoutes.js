const express = require('express');
const router = express.Router();
const { getConfig, saveConfig } = require('../controllers/gowhatsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect, adminOnly);

// This creates the '/config' endpoint relative to the base path
router.route('/config')
  .get(getConfig)
  .post(saveConfig);

module.exports = router;