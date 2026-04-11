const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { addFine, removeFine, deleteFine, updateFine, getWorkerFines, getMyFines, getAllFines } = require('../controllers/fineController');
const router = express.Router();

router.route('/add-fine/:id').post(protect, addFine);
router.route('/remove-fine/:id/:fineId').post(protect, removeFine);
router.route('/delete-fine/:id/:fineId').delete(protect, deleteFine);
router.route('/update-fine/:id/:fineId').put(protect, updateFine);
router.route('/worker-fines/:id').get(protect, getWorkerFines);
router.route('/my-fines').get(protect, getMyFines);
router.route('/all-fines').get(protect, getAllFines);

module.exports = router;