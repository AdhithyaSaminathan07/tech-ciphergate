const asyncHandler = require('express-async-handler');
const RecurringTask = require('../models/RecurringTask');
const { computeInitialNextRunAt } = require('../schedulers/recurringTaskScheduler');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a new recurring task rule
// @route   POST /api/recurring-tasks
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.createRecurringTask = asyncHandler(async (req, res) => {
    const {
        title, description, priority, issueType,
        checklist, assignees, team, labels,
        frequency, interval, daysOfWeek, dayOfMonth,
        taskDurationDays, startDate, endDate,
        spawnedTickets, totalSpawned, lastRunAt
    } = req.body;

    const subdomain = req.user?.subdomain;
    const createdBy = req.user?._id;

    if (!title || !title.trim()) {
        res.status(400);
        throw new Error('Title is required');
    }
    if (!frequency) {
        res.status(400);
        throw new Error('Frequency is required');
    }
    if (!subdomain) {
        res.status(400);
        throw new Error('Subdomain context missing. Please log in again.');
    }

    // Validate: weekly requires at least one day
    if (frequency === 'weekly' && (!daysOfWeek || daysOfWeek.length === 0)) {
        res.status(400);
        throw new Error('Weekly frequency requires at least one day selection.');
    }

    const parsedStartDate = startDate ? new Date(startDate) : new Date();
    if (endDate && new Date(endDate) <= parsedStartDate) {
        res.status(400);
        throw new Error('End date must be after start date.');
    }

    const ruleData = {
        title: title.trim(),
        description: description || '',
        priority: priority || 'Medium',
        issueType: issueType || 'Task',
        checklist: (checklist || []).map(item => ({ text: item.text, completed: false })),
        assignees: assignees || [],
        team: team || '',
        labels: labels || [],
        subdomain,
        createdBy,
        frequency,
        interval: Number(interval) || 1,
        daysOfWeek: daysOfWeek || [],
        dayOfMonth: dayOfMonth || null,
        taskDurationDays: taskDurationDays ? Number(taskDurationDays) : null,
        startDate: parsedStartDate,
        endDate: endDate ? new Date(endDate) : null,
        status: 'active',
        spawnedTickets: spawnedTickets || [],
        totalSpawned: Number(totalSpawned) || 0,
        lastRunAt: lastRunAt ? new Date(lastRunAt) : null
    };

    // Compute initial nextRunAt before saving
    const nextRunAt = computeInitialNextRunAt(ruleData);
    if (!nextRunAt) {
        res.status(400);
        throw new Error('Could not compute a valid next run date. Check start/end dates and frequency.');
    }
    ruleData.nextRunAt = nextRunAt;

    const rule = await RecurringTask.create(ruleData);

    // If spawnedTickets are pre-seeded, update those tickets to link back to this rule
    if (rule.spawnedTickets && rule.spawnedTickets.length > 0) {
        const Ticket = require('../models/ticketModel');
        await Ticket.updateMany(
            { _id: { $in: rule.spawnedTickets } },
            { $set: { recurringTaskId: rule._id } }
        );
    }

    // Populate assignees for response
    await rule.populate('assignees', 'name username department');

    res.status(201).json({ success: true, data: rule });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all recurring task rules (admin)
// @route   GET /api/recurring-tasks
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.getRecurringTasks = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain;
    const { status, page = 1, limit = 50 } = req.query;

    const query = { subdomain, isDeleted: false };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [rules, total] = await Promise.all([
        RecurringTask.find(query)
            .populate('assignees', 'name username department')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        RecurringTask.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: rules,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / Number(limit))
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single recurring task rule
// @route   GET /api/recurring-tasks/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.getRecurringTaskById = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain;
    const rule = await RecurringTask.findOne({ _id: req.params.id, subdomain, isDeleted: false })
        .populate('assignees', 'name username department')
        .populate('createdBy', 'name');

    if (!rule) {
        res.status(404);
        throw new Error('Recurring task rule not found');
    }

    res.json({ success: true, data: rule });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update a recurring task rule (affects future instances only)
// @route   PUT /api/recurring-tasks/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRecurringTask = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain;
    const rule = await RecurringTask.findOne({ _id: req.params.id, subdomain, isDeleted: false });

    if (!rule) {
        res.status(404);
        throw new Error('Recurring task rule not found');
    }

    const allowedUpdates = [
        'title', 'description', 'priority', 'issueType',
        'checklist', 'assignees', 'team', 'labels',
        'frequency', 'interval', 'daysOfWeek', 'dayOfMonth',
        'taskDurationDays', 'endDate'
    ];

    allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
            rule[field] = req.body[field];
        }
    });

    // Recompute nextRunAt if recurrence rule fields changed
    const recurrenceFields = ['frequency', 'interval', 'daysOfWeek', 'dayOfMonth', 'endDate'];
    const recurrenceChanged = recurrenceFields.some(f => req.body[f] !== undefined);
    if (recurrenceChanged) {
        const { computeNextRunAt } = require('../schedulers/recurringTaskScheduler');
        const nextRunAt = computeNextRunAt(rule, rule.lastRunAt || new Date());
        if (!nextRunAt) {
            rule.status = 'completed';
        } else {
            rule.nextRunAt = nextRunAt;
        }
    }

    await rule.save();
    await rule.populate('assignees', 'name username department');

    res.json({ success: true, data: rule });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Change status of a recurring task (pause/resume/cancel)
// @route   PATCH /api/recurring-tasks/:id/status
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRecurringTaskStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const subdomain = req.user?.subdomain;

    const validTransitions = ['active', 'paused', 'cancelled'];
    if (!validTransitions.includes(status)) {
        res.status(400);
        throw new Error(`Status must be one of: ${validTransitions.join(', ')}`);
    }

    const rule = await RecurringTask.findOne({ _id: req.params.id, subdomain, isDeleted: false });
    if (!rule) {
        res.status(404);
        throw new Error('Recurring task rule not found');
    }

    // Prevent re-activating a completed rule without editing recurrence
    if (status === 'active' && rule.status === 'completed') {
        res.status(400);
        throw new Error('Cannot resume a completed rule. Please edit the recurrence end date first.');
    }

    rule.status = status;

    // If resuming a paused rule, recompute nextRunAt from now
    if (status === 'active' && rule.status === 'paused') {
        const { computeNextRunAt } = require('../schedulers/recurringTaskScheduler');
        const nextRunAt = computeNextRunAt(rule, new Date());
        rule.nextRunAt = nextRunAt || null;
        if (!nextRunAt) rule.status = 'completed';
    }

    await rule.save();

    res.json({ success: true, data: { _id: rule._id, status: rule.status, nextRunAt: rule.nextRunAt } });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Soft delete a recurring task rule
// @route   DELETE /api/recurring-tasks/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteRecurringTask = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain;
    const rule = await RecurringTask.findOne({ _id: req.params.id, subdomain });

    if (!rule) {
        res.status(404);
        throw new Error('Recurring task rule not found');
    }

    rule.isDeleted = true;
    rule.deletedAt = new Date();
    rule.status = 'cancelled';
    await rule.save();

    res.json({ success: true, message: 'Recurring task rule deleted.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    List all spawned ticket instances for a rule
// @route   GET /api/recurring-tasks/:id/instances
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.getRecurringTaskInstances = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain;
    const { page = 1, limit = 20 } = req.query;

    const rule = await RecurringTask.findOne({ _id: req.params.id, subdomain, isDeleted: false })
        .select('spawnedTickets totalSpawned title');

    if (!rule) {
        res.status(404);
        throw new Error('Recurring task rule not found');
    }

    const Ticket = require('../models/ticketModel');
    const skip = (Number(page) - 1) * Number(limit);

    const tickets = await Ticket.find({
        _id: { $in: rule.spawnedTickets },
        isDeleted: { $ne: true }
    })
        .populate('assignees', 'name username department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    res.json({
        success: true,
        ruleName: rule.title,
        totalSpawned: rule.totalSpawned,
        data: tickets,
        pagination: {
            page: Number(page),
            limit: Number(limit)
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Trigger scheduler manually (dev/test only)
// @route   POST /api/recurring-tasks/trigger-scheduler
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
exports.triggerSchedulerManually = asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.status(403);
        throw new Error('Manual trigger is not allowed in production.');
    }

    const { runRecurringTaskScheduler } = require('../schedulers/recurringTaskScheduler');
    // Run async — don't await to avoid request timeout on large datasets
    runRecurringTaskScheduler().catch(err => console.error('[ManualTrigger]', err));

    res.json({ success: true, message: 'Scheduler triggered. Check server logs for progress.' });
});
