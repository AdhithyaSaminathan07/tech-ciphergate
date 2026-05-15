const express = require('express');
const router = express.Router();
const { 
    generateApiKey, 
    getApiKeys, 
    revokeApiKey, 
    toggleApiKey 
} = require('../controllers/apiKeyController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All these routes are protected for admins only
router.use(protect);
router.use(adminOnly);

router.route('/')
    .get(getApiKeys)
    .post(generateApiKey);

router.route('/:id')
    .delete(revokeApiKey);

router.route('/:id/toggle')
    .patch(toggleApiKey);

module.exports = router;
