const express = require('express');
const router = express.Router();
const {
    createRecurringTask,
    getRecurringTasks,
    getRecurringTaskById,
    updateRecurringTask,
    updateRecurringTaskStatus,
    deleteRecurringTask,
    getRecurringTaskInstances,
    triggerSchedulerManually
} = require('../controllers/recurringTaskController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All routes require authentication + admin role
router.use(protect, adminOnly);

router.route('/')
    .get(getRecurringTasks)
    .post(createRecurringTask);

// Dev-only manual scheduler trigger (guard is inside the controller)
router.post('/trigger-scheduler', triggerSchedulerManually);

router.route('/:id')
    .get(getRecurringTaskById)
    .put(updateRecurringTask)
    .delete(deleteRecurringTask);

router.patch('/:id/status', updateRecurringTaskStatus);
router.get('/:id/instances', getRecurringTaskInstances);

module.exports = router;
