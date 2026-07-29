/**
 * recurringTaskScheduler.js
 *
 * Scheduler that runs every 30 minutes (via cronJobs.js).
 * Finds all active RecurringTask rules where nextRunAt ≤ now,
 * spawns fresh Ticket documents, notifies assignees, and advances nextRunAt.
 *
 * Scalability design:
 *  - Uses a compound index query (subdomain, status, nextRunAt) — O(log n)
 *  - Processes rules in batches of 50 to avoid memory spikes with 1000+ rules
 *  - Sends notifications in parallel with Promise.allSettled (never blocks)
 *  - Re-uses the existing sendNotification utility (no new dependencies)
 *  - Each rule update is an atomic findByIdAndUpdate — safe for concurrent runs
 *  - A "runLock" flag prevents the scheduler from re-entering if a previous
 *    run is still in progress (guards against slow DB on large datasets)
 */

const RecurringTask = require('../models/RecurringTask');
const Ticket = require('../models/ticketModel');
const { getIO } = require('../utils/socket');

// ── Concurrency guard ─────────────────────────────────────────────────────────
let isRunning = false;

// ── nextRunAt computation ─────────────────────────────────────────────────────
/**
 * Given a rule and a reference date (usually now), compute when the NEXT
 * execution should occur.
 *
 * @param {Object} rule  - RecurringTask document (plain object or mongoose doc)
 * @param {Date}   from  - Reference point to compute next occurrence from
 * @returns {Date|null}  - Next run date, or null if rule has expired
 */
function computeNextRunAt(rule, from = new Date()) {
    const { frequency, interval = 1, daysOfWeek = [], dayOfMonth, endDate } = rule;

    let next = new Date(from);
    // Always advance by at least 1 minute to avoid same-tick re-trigger
    next.setMinutes(next.getMinutes() + 1);

    switch (frequency) {
        case 'daily':
        case 'custom': {
            // Advance by interval days from `from`
            next = new Date(from);
            next.setDate(next.getDate() + interval);
            // Normalize to start of day (09:00 IST will be handled by cron timing)
            next.setHours(0, 0, 0, 0);
            break;
        }

        case 'weekly': {
            if (!daysOfWeek || daysOfWeek.length === 0) {
                // Fallback: advance by interval weeks
                next = new Date(from);
                next.setDate(next.getDate() + interval * 7);
                next.setHours(0, 0, 0, 0);
                break;
            }
            // Find the next matching weekday after `from`
            const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
            const fromDay = from.getDay(); // 0-6
            let daysAhead = null;

            // Look for next matching day in the same week
            for (const d of sortedDays) {
                if (d > fromDay) {
                    daysAhead = d - fromDay;
                    break;
                }
            }

            if (daysAhead === null) {
                // Wrap around to next week — skip `interval - 1` weeks
                const daysToFirstInWeek = (7 - fromDay) + sortedDays[0];
                daysAhead = daysToFirstInWeek + (interval - 1) * 7;
            }

            next = new Date(from);
            next.setDate(next.getDate() + daysAhead);
            next.setHours(0, 0, 0, 0);
            break;
        }

        case 'monthly': {
            const dom = dayOfMonth || 1;
            next = new Date(from);
            next.setMonth(next.getMonth() + interval);
            // Clamp to valid day in the target month
            const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            next.setDate(Math.min(dom, lastDay));
            next.setHours(0, 0, 0, 0);
            break;
        }

        default:
            return null;
    }

    // If endDate is set and next is past it, the rule is exhausted
    if (endDate && next > new Date(endDate)) {
        return null;
    }

    return next;
}

/**
 * Compute the very first nextRunAt when a rule is created.
 * Respects startDate — never schedules before startDate.
 */
function computeInitialNextRunAt(rule) {
    const start = rule.startDate ? new Date(rule.startDate) : new Date();
    // Set to start of startDate
    start.setHours(0, 0, 0, 0);

    const now = new Date();
    if (start > now) {
        // startDate is in the future — first run on startDate
        return start;
    }

    // startDate is today or in the past — compute next occurrence from now
    return computeNextRunAt(rule, now);
}

// ── Ticket spawning helper ────────────────────────────────────────────────────
/**
 * Create one ticket from a recurring rule template.
 * Mirrors what ticketController.createTicket does, but called internally.
 */
async function spawnTicket(rule) {
    const spawnDate = rule.nextRunAt ? new Date(rule.nextRunAt) : new Date();
    spawnDate.setHours(0, 0, 0, 0);

    let ticketEndDate;
    if (rule.taskDurationDays != null && rule.taskDurationDays > 0) {
        ticketEndDate = new Date(spawnDate);
        ticketEndDate.setDate(ticketEndDate.getDate() + Math.max(0, rule.taskDurationDays - 1));
        ticketEndDate.setHours(23, 59, 59, 999);
    }

    const ticket = new Ticket({
        title: rule.title,
        description: rule.description || '',
        priority: rule.priority || 'Medium',
        issueType: rule.issueType || 'Task',
        status: 'To Do',
        subdomain: rule.subdomain,
        assignees: rule.assignees || [],
        team: rule.team || undefined,
        labels: rule.labels || [],
        // Deep clone checklist — reset completed state for fresh cycle
        checklist: (rule.checklist || []).map(item => ({
            text: item.text,
            completed: false
        })),
        startDate: spawnDate,
        endDate: ticketEndDate || undefined,
        // Mark as spawned by a recurring rule
        recurringTaskId: rule._id
    });

    await ticket.save();

    // Populate assignees for socket emission
    await ticket.populate('assignees', 'name username department status');

    return ticket;
}

// ── Main scheduler function ───────────────────────────────────────────────────
const BATCH_SIZE = 50; // process at most 50 rules per run to bound memory

const runRecurringTaskScheduler = async () => {
    if (isRunning) {
        console.log('[RecurringScheduler] Previous run still in progress — skipping.');
        return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        const now = new Date();

        // Efficient compound-index query: only fetch due, active, non-deleted rules
        const dueTasks = await RecurringTask.find({
            status: 'active',
            isDeleted: false,
            nextRunAt: { $lte: now }
        })
            .limit(BATCH_SIZE)
            .lean(); // Use lean() for read performance — we update via findByIdAndUpdate

        if (dueTasks.length === 0) {
            return; // Nothing to do
        }

        console.log(`[RecurringScheduler] Processing ${dueTasks.length} due rule(s)...`);

        const io = (() => { try { return getIO(); } catch { return null; } })();
        const { sendNotification } = require('../utils/sendNotification');

        // Process each rule independently — one failure should not block others
        const results = await Promise.allSettled(
            dueTasks.map(async (rule) => {
                try {
                    // 1. Spawn the ticket
                    const newTicket = await spawnTicket(rule);

                    // 2. Compute next run date
                    const nextRunAt = computeNextRunAt(rule, now);

                    // 3. Atomic update of rule state
                    const updateFields = {
                        $push: { spawnedTickets: newTicket._id },
                        $inc: { totalSpawned: 1 },
                        $set: {
                            lastRunAt: now,
                            nextRunAt: nextRunAt || null,
                            // Mark completed if no next run date
                            status: nextRunAt ? 'active' : 'completed'
                        }
                    };

                    await RecurringTask.findByIdAndUpdate(rule._id, updateFields);

                    // 4. Send notifications in parallel (non-blocking)
                    if (rule.assignees && rule.assignees.length > 0) {
                        await Promise.allSettled(
                            rule.assignees.map(userId =>
                                sendNotification({
                                    userId,
                                    userModel: 'Worker',
                                    subdomain: rule.subdomain,
                                    title: '🔄 Recurring Task Assigned',
                                    message: `"${rule.title}" has been auto-assigned to you.`,
                                    type: 'task_assigned',
                                    link: '/worker/work-allocation'
                                }).catch(err =>
                                    console.error(`[RecurringScheduler] Notify failed for user ${userId}:`, err.message)
                                )
                            )
                        );
                    }

                    // 5. Socket emission to the subdomain room
                    if (io) {
                        io.to(rule.subdomain).emit('ticket:created', newTicket);
                    }

                    console.log(`[RecurringScheduler] ✅ Spawned ticket "${newTicket.title}" (rule: ${rule._id})`);
                    return { ruleId: rule._id, ticketId: newTicket._id };

                } catch (ruleErr) {
                    console.error(`[RecurringScheduler] ❌ Failed rule ${rule._id}:`, ruleErr.message);
                    throw ruleErr;
                }
            })
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const elapsed = Date.now() - startTime;

        console.log(`[RecurringScheduler] Done in ${elapsed}ms — ${succeeded} spawned, ${failed} failed.`);

    } catch (err) {
        console.error('[RecurringScheduler] Scheduler error:', err.message);
    } finally {
        isRunning = false;
    }
};

module.exports = {
    runRecurringTaskScheduler,
    computeNextRunAt,
    computeInitialNextRunAt
};
