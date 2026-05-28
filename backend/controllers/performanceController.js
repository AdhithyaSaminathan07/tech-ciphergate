const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const PerformancePoints = require('../models/PerformancePoints');
const Badge = require('../models/Badge');
const Settings = require('../models/Settings');
const Ticket = require('../models/ticketModel');

// ─── Badge Definitions ───────────────────────────────────────────────────────
const BADGE_DEFINITIONS = {
    speed_demon: {
        name: 'Speed Demon',
        emoji: '🚀',
        description: 'Completed tasks in less than half the estimated time'
    },
    elite_performer: {
        name: 'Elite Performer',
        emoji: '🏆',
        description: 'Ranked in the Top 5 on the performance leaderboard'
    },
    consistency_king: {
        name: 'Consistency King',
        emoji: '🔥',
        description: 'Maintained a streak of 7+ consecutive on-time completions'
    },
    reliable_performer: {
        name: 'Reliable Performer',
        emoji: '🛡',
        description: 'Completed 10+ tasks with zero delays'
    },
    bug_hunter: {
        name: 'Bug Hunter',
        emoji: '⚡',
        description: 'Resolved 5+ Bug-type tickets'
    }
};

// ─── Get Performance Config ───────────────────────────────────────────────────
const getPerformanceConfig = async (subdomain) => {
    const settings = await Settings.findOne({ subdomain });
    const defaults = {
        enabled: true,
        basePoints: 1,
        advancedMode: false,
        penaltyEnabled: true,
        penaltyPercentage: 50,
        earlyBonusEnabled: true,
        streakBonusEnabled: true,
        badgeSystemEnabled: true,
        leaderboardVisible: true,
        priorityMultipliers: { Low: 1, Medium: 1.5, High: 2, Critical: 3 },
        typeMultipliers: { Task: 1, Bug: 1.5, Story: 2, Epic: 3 }
    };
    if (!settings || !settings.performanceConfig) return defaults;
    const cfg = settings.performanceConfig.toObject ? settings.performanceConfig.toObject() : settings.performanceConfig;
    // Deep merge multipliers
    return {
        ...defaults,
        ...cfg,
        priorityMultipliers: { ...defaults.priorityMultipliers, ...(cfg.priorityMultipliers || {}) },
        typeMultipliers: { ...defaults.typeMultipliers, ...(cfg.typeMultipliers || {}) }
    };
};

// ─── Calculate Days Between Two Dates ────────────────────────────────────────
const daysBetween = (start, end) => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Reset hours to start of day for accurate full calendar days difference
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const diff = endDate - startDate;
    const days = Math.round(diff / (1000 * 60 * 60 * 24)) + 1; // +1 to make it inclusive of start day
    return Math.max(days, 1); // min 1 day
};

// ─── Calculate Points for a Ticket ───────────────────────────────────────────
const calculateTicketPoints = (ticket, config) => {
    const { basePoints, advancedMode, penaltyEnabled, penaltyPercentage,
        priorityMultipliers, typeMultipliers } = config;

    const estimatedDays = daysBetween(ticket.startDate, ticket.endDate);
    const actualDays = daysBetween(ticket.startDate, ticket.actualCompletionDate || new Date());

    // No dates = base points only
    if (!estimatedDays || !actualDays) {
        return {
            points: basePoints,
            estimatedDays: null,
            actualDays: null,
            efficiencyRatio: null,
            performanceStatus: 'no_dates',
            priorityMultiplier: 1,
            typeMultiplier: 1
        };
    }

    const efficiencyRatio = estimatedDays / actualDays;
    let points = efficiencyRatio * basePoints;

    // Determine performance status
    let performanceStatus = 'on_time';
    if (actualDays < estimatedDays) performanceStatus = 'early';
    if (actualDays > estimatedDays) performanceStatus = 'delayed';

    // Apply advanced multipliers if enabled
    let priorityMultiplier = 1;
    let typeMultiplier = 1;
    if (advancedMode) {
        priorityMultiplier = priorityMultipliers[ticket.priority] || 1;
        typeMultiplier = typeMultipliers[ticket.issueType] || 1;
        points = points * priorityMultiplier * typeMultiplier;
    }

    // Apply penalty for delayed tasks
    if (performanceStatus === 'delayed' && penaltyEnabled) {
        const penaltyFactor = 1 - (penaltyPercentage / 100);
        points = Math.max(points * penaltyFactor, 0);
    }

    // Ensure minimum 0 points, round to 2 decimals
    points = Math.max(Math.round(points * 100) / 100, 0);

    return {
        points,
        estimatedDays,
        actualDays,
        efficiencyRatio: Math.round(efficiencyRatio * 100) / 100,
        performanceStatus,
        priorityMultiplier,
        typeMultiplier
    };
};

// ─── Determine Performance Level ─────────────────────────────────────────────
const getPerformanceLevel = (totalPoints) => {
    if (totalPoints >= 500) return 'Legend';
    if (totalPoints >= 200) return 'Elite Performer';
    if (totalPoints >= 75) return 'Rising Star';
    if (totalPoints >= 20) return 'Performer';
    return 'Beginner';
};

// ─── Check & Award Badges ─────────────────────────────────────────────────────
const checkAndAwardBadges = async (worker, subdomain, config) => {
    if (!config.badgeSystemEnabled) return [];
    const newBadges = [];

    try {
        // Check Speed Demon: efficiency ratio >= 2 on any task
        const speedRecord = await PerformancePoints.findOne({
            worker: worker._id, subdomain,
            efficiencyRatio: { $gte: 2 },
            reason: 'task_completed'
        });
        if (speedRecord) {
            const exists = await Badge.findOne({ worker: worker._id, subdomain, badgeType: 'speed_demon' });
            if (!exists) {
                await Badge.create({
                    worker: worker._id,
                    subdomain,
                    badgeType: 'speed_demon',
                    badgeName: BADGE_DEFINITIONS.speed_demon.name,
                    badgeEmoji: BADGE_DEFINITIONS.speed_demon.emoji,
                    badgeDescription: BADGE_DEFINITIONS.speed_demon.description
                });
                newBadges.push('speed_demon');
            }
        }

        // Check Consistency King: streak >= 7
        if (worker.currentStreak >= 7) {
            const exists = await Badge.findOne({ worker: worker._id, subdomain, badgeType: 'consistency_king' });
            if (!exists) {
                await Badge.create({
                    worker: worker._id,
                    subdomain,
                    badgeType: 'consistency_king',
                    badgeName: BADGE_DEFINITIONS.consistency_king.name,
                    badgeEmoji: BADGE_DEFINITIONS.consistency_king.emoji,
                    badgeDescription: BADGE_DEFINITIONS.consistency_king.description
                });
                newBadges.push('consistency_king');
            }
        }

        // Check Reliable Performer: 10+ tasks with 0 delays (streak >= 10)
        if (worker.longestStreak >= 10 || worker.currentStreak >= 10) {
            const exists = await Badge.findOne({ worker: worker._id, subdomain, badgeType: 'reliable_performer' });
            if (!exists) {
                await Badge.create({
                    worker: worker._id,
                    subdomain,
                    badgeType: 'reliable_performer',
                    badgeName: BADGE_DEFINITIONS.reliable_performer.name,
                    badgeEmoji: BADGE_DEFINITIONS.reliable_performer.emoji,
                    badgeDescription: BADGE_DEFINITIONS.reliable_performer.description
                });
                newBadges.push('reliable_performer');
            }
        }

        // Check Bug Hunter: 5+ Bug tickets completed
        const bugCount = await PerformancePoints.countDocuments({
            worker: worker._id, subdomain,
            reason: 'task_completed'
        });
        if (bugCount >= 5) {
            // Check if these are from bug tickets
            const bugPoints = await PerformancePoints.find({
                worker: worker._id, subdomain, reason: 'task_completed', ticket: { $ne: null }
            }).populate({ path: 'ticket', select: 'issueType' });
            const bugTickets = bugPoints.filter(p => p.ticket && p.ticket.issueType === 'Bug');
            if (bugTickets.length >= 5) {
                const exists = await Badge.findOne({ worker: worker._id, subdomain, badgeType: 'bug_hunter' });
                if (!exists) {
                    await Badge.create({
                        worker: worker._id,
                        subdomain,
                        badgeType: 'bug_hunter',
                        badgeName: BADGE_DEFINITIONS.bug_hunter.name,
                        badgeEmoji: BADGE_DEFINITIONS.bug_hunter.emoji,
                        badgeDescription: BADGE_DEFINITIONS.bug_hunter.description
                    });
                    newBadges.push('bug_hunter');
                }
            }
        }
    } catch (err) {
        console.error('Badge check error:', err.message);
    }

    return newBadges;
};

// ─── Check Elite Performer Badge (Top 5 in leaderboard) ──────────────────────
const checkElitePerformerBadge = async (subdomain) => {
    try {
        const workers = await Worker.find({ subdomain, status: 'Active' })
            .select('_id performancePoints')
            .sort({ performancePoints: -1 })
            .limit(5);

        for (const worker of workers) {
            const exists = await Badge.findOne({ worker: worker._id, subdomain, badgeType: 'elite_performer' });
            if (!exists) {
                await Badge.create({
                    worker: worker._id,
                    subdomain,
                    badgeType: 'elite_performer',
                    badgeName: BADGE_DEFINITIONS.elite_performer.name,
                    badgeEmoji: BADGE_DEFINITIONS.elite_performer.emoji,
                    badgeDescription: BADGE_DEFINITIONS.elite_performer.description
                });
            }
        }
    } catch (err) {
        console.error('Elite badge check error:', err.message);
    }
};

// ─── Send Performance Notification ───────────────────────────────────────────
const sendPerformanceNotification = async ({ workerId, subdomain, title, message, type = 'task_approved' }) => {
    try {
        const { sendNotification } = require('../utils/sendNotification');
        await sendNotification({
            userId: workerId,
            userModel: 'Worker',
            subdomain,
            title,
            message,
            type,
            link: '/worker'
        });
    } catch (err) {
        console.error('Performance notification error:', err.message);
    }
};

// ─── MAIN: Award Points When Ticket → Done ────────────────────────────────────
const awardPointsOnTicketDone = async (ticket, subdomain) => {
    try {
        if (!ticket || ticket.isDeleted) return;

        const config = await getPerformanceConfig(subdomain);
        if (!config.enabled) return;

        // Get all assignees
        const assigneeIds = [];
        if (ticket.assignees && ticket.assignees.length > 0) {
            ticket.assignees.forEach(a => assigneeIds.push(typeof a === 'object' ? a._id : a));
        }
        if (ticket.assignee && !assigneeIds.find(id => id.toString() === (typeof ticket.assignee === 'object' ? ticket.assignee._id : ticket.assignee).toString())) {
            assigneeIds.push(typeof ticket.assignee === 'object' ? ticket.assignee._id : ticket.assignee);
        }

        if (assigneeIds.length === 0) return;

        // Calculate points
        const completionDate = ticket.actualCompletionDate || new Date();
        const ticketForCalc = { ...ticket.toObject ? ticket.toObject() : ticket, actualCompletionDate: completionDate };
        const result = calculateTicketPoints(ticketForCalc, config);

        // Update ticket with performance data
        await Ticket.findByIdAndUpdate(ticket._id, {
            pointsAwarded: result.points,
            actualCompletionDate: completionDate,
            estimatedDays: result.estimatedDays,
            efficiencyRatio: result.efficiencyRatio,
            performanceStatus: result.performanceStatus
        });

        // Award points to each assignee
        for (const workerId of assigneeIds) {
            const worker = await Worker.findById(workerId);
            if (!worker) continue;

            // Create point record
            await PerformancePoints.create({
                worker: workerId,
                ticket: ticket._id,
                subdomain,
                pointsEarned: result.points,
                reason: 'task_completed',
                ticketTitle: ticket.title,
                estimatedDays: result.estimatedDays,
                actualDays: result.actualDays,
                efficiencyRatio: result.efficiencyRatio,
                priorityMultiplier: result.priorityMultiplier,
                typeMultiplier: result.typeMultiplier,
                basePoints: config.basePoints,
                performanceStatus: result.performanceStatus
            });

            // Update worker performance data
            const newTotal = (worker.performancePoints || 0) + result.points;
            const isDelayed = result.performanceStatus === 'delayed';
            const newStreak = isDelayed ? 0 : (worker.currentStreak || 0) + 1;
            const longestStreak = Math.max(worker.longestStreak || 0, newStreak);

            await Worker.findByIdAndUpdate(workerId, {
                $inc: {
                    performancePoints: result.points,
                    totalCompletedTickets: 1,
                    totalDelayedTickets: isDelayed ? 1 : 0
                },
                currentStreak: newStreak,
                longestStreak,
                performanceLevel: getPerformanceLevel(newTotal)
            });

            const updatedWorker = await Worker.findById(workerId);

            // Check and award badges
            const newBadges = await checkAndAwardBadges(updatedWorker, subdomain, config);

            // Build notification message
            let notifMsg = '';
            if (result.performanceStatus === 'early') {
                notifMsg = `✅ You earned +${result.points} pts for completing "${ticket.title}" early! (${result.estimatedDays} days estimated, ${result.actualDays} actual)`;
            } else if (result.performanceStatus === 'delayed') {
                notifMsg = `⚠️ You earned ${result.points} pts for "${ticket.title}" (delayed delivery — penalty applied)`;
            } else if (result.performanceStatus === 'no_dates') {
                notifMsg = `✅ You earned +${result.points} pts for completing "${ticket.title}"`;
            } else {
                notifMsg = `✅ You earned +${result.points} pts for completing "${ticket.title}" on time!`;
            }

            await sendPerformanceNotification({
                workerId,
                subdomain,
                title: `+${result.points} Points Earned`,
                message: notifMsg,
                type: 'task_approved'
            });

            // Badge notifications
            for (const badge of newBadges) {
                const def = BADGE_DEFINITIONS[badge];
                await sendPerformanceNotification({
                    workerId,
                    subdomain,
                    title: `🏅 New Badge: ${def.name}`,
                    message: `${def.emoji} You unlocked the "${def.name}" badge! ${def.description}`,
                    type: 'task_approved'
                });
            }
        }

        // Check elite performer badge after updating all workers
        await checkElitePerformerBadge(subdomain);

    } catch (err) {
        console.error('Error awarding performance points:', err.message);
    }
};

// ─── API: Get My Performance ──────────────────────────────────────────────────
const getMyPerformance = asyncHandler(async (req, res) => {
    const workerId = req.user._id;
    const subdomain = req.user.subdomain;

    const worker = await Worker.findById(workerId).select(
        'name username department performancePoints currentStreak longestStreak performanceLevel totalCompletedTickets totalDelayedTickets photo'
    ).populate('department', 'name');

    if (!worker) {
        res.status(404);
        throw new Error('Worker not found');
    }

    // Get weekly points (last 7 days)
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weeklyAgg = await PerformancePoints.aggregate([
        { $match: { worker: worker._id, subdomain, createdAt: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
    ]);
    const weeklyPoints = weeklyAgg[0]?.total || 0;

    // Get monthly points (last 30 days)
    const monthStart = new Date();
    monthStart.setDate(monthStart.getDate() - 30);
    const monthlyAgg = await PerformancePoints.aggregate([
        { $match: { worker: worker._id, subdomain, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
    ]);
    const monthlyPoints = monthlyAgg[0]?.total || 0;

    // Get rank
    const rankResult = await Worker.countDocuments({
        subdomain, status: 'Active',
        performancePoints: { $gt: worker.performancePoints }
    });
    const rank = rankResult + 1;

    // Get badges
    const badges = await Badge.find({ worker: workerId, subdomain }).sort({ earnedAt: -1 });

    // Compute task success rate
    const successRate = worker.totalCompletedTickets > 0
        ? Math.round(((worker.totalCompletedTickets - worker.totalDelayedTickets) / worker.totalCompletedTickets) * 100)
        : 100;

    res.json({
        worker: {
            _id: worker._id,
            name: worker.name,
            photo: worker.photo,
            department: worker.department?.name || 'N/A'
        },
        totalPoints: worker.performancePoints || 0,
        weeklyPoints,
        monthlyPoints,
        rank,
        currentStreak: worker.currentStreak || 0,
        longestStreak: worker.longestStreak || 0,
        performanceLevel: worker.performanceLevel || 'Beginner',
        totalCompletedTickets: worker.totalCompletedTickets || 0,
        totalDelayedTickets: worker.totalDelayedTickets || 0,
        taskSuccessRate: successRate,
        badges
    });
});

// ─── API: Get Point History ────────────────────────────────────────────────────
const getMyPointHistory = asyncHandler(async (req, res) => {
    const workerId = req.user._id;
    const subdomain = req.user.subdomain;
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;

    const history = await PerformancePoints.find({ worker: workerId, subdomain })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    const total = await PerformancePoints.countDocuments({ worker: workerId, subdomain });

    res.json({ history, total, page, pages: Math.ceil(total / limit) });
});

// ─── API: Get Leaderboard ─────────────────────────────────────────────────────
const getLeaderboard = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const filter = req.query.filter || 'all'; // all | weekly | monthly | department
    const department = req.query.department;

    let workers;
    const baseQuery = { subdomain, status: 'Active' };
    if (department) baseQuery.department = department;

    if (filter === 'all') {
        workers = await Worker.find(baseQuery)
            .select('name username photo performancePoints currentStreak longestStreak performanceLevel department totalCompletedTickets totalDelayedTickets')
            .populate('department', 'name')
            .sort({ performancePoints: -1 })
            .lean();
    } else {
        // For weekly/monthly, aggregate from PerformancePoints
        const dateFilter = new Date();
        if (filter === 'weekly') dateFilter.setDate(dateFilter.getDate() - 7);
        else if (filter === 'monthly') dateFilter.setDate(dateFilter.getDate() - 30);

        const matchStage = { subdomain, createdAt: { $gte: dateFilter } };

        const agg = await PerformancePoints.aggregate([
            { $match: matchStage },
            { $group: { _id: '$worker', filteredPoints: { $sum: '$pointsEarned' } } },
            { $sort: { filteredPoints: -1 } }
        ]);

        const workerIds = agg.map(a => a._id);
        const workerData = await Worker.find({ _id: { $in: workerIds }, ...baseQuery })
            .select('name username photo performancePoints currentStreak longestStreak performanceLevel department totalCompletedTickets totalDelayedTickets')
            .populate('department', 'name')
            .lean();

        workers = agg.map(a => {
            const w = workerData.find(w => w._id.toString() === a._id.toString());
            return w ? { ...w, filteredPoints: a.filteredPoints } : null;
        }).filter(Boolean);
    }

    // Attach badges and rank
    const leaderboard = await Promise.all(workers.map(async (w, idx) => {
        const badges = await Badge.find({ worker: w._id, subdomain }).select('badgeType badgeName badgeEmoji').lean();
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekAgg = await PerformancePoints.aggregate([
            { $match: { worker: w._id, subdomain, createdAt: { $gte: weekStart } } },
            { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
        ]);
        return {
            rank: idx + 1,
            _id: w._id,
            name: w.name,
            photo: w.photo,
            department: typeof w.department === 'object' ? (w.department?.name || 'N/A') : w.department,
            totalPoints: w.performancePoints || 0,
            filteredPoints: w.filteredPoints !== undefined ? w.filteredPoints : w.performancePoints || 0,
            weeklyGain: weekAgg[0]?.total || 0,
            currentStreak: w.currentStreak || 0,
            longestStreak: w.longestStreak || 0,
            performanceLevel: w.performanceLevel || 'Beginner',
            totalCompletedTickets: w.totalCompletedTickets || 0,
            totalDelayedTickets: w.totalDelayedTickets || 0,
            badges
        };
    }));

    res.json({ leaderboard, filter, total: leaderboard.length });
});

// ─── API: Admin Overview ──────────────────────────────────────────────────────
const getAdminPerformanceOverview = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    const totalPointsAgg = await PerformancePoints.aggregate([
        { $match: { subdomain } },
        { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
    ]);
    const totalPointsDistributed = totalPointsAgg[0]?.total || 0;

    const totalPenaltiesAgg = await PerformancePoints.aggregate([
        { $match: { subdomain, pointsEarned: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
    ]);
    const totalPenalties = Math.abs(totalPenaltiesAgg[0]?.total || 0);

    const topPerformers = await Worker.find({ subdomain, status: 'Active' })
        .select('name username photo performancePoints performanceLevel currentStreak department')
        .populate('department', 'name')
        .sort({ performancePoints: -1 })
        .limit(5)
        .lean();

    const lowestPerformers = await Worker.find({ subdomain, status: 'Active' })
        .select('name username photo performancePoints performanceLevel currentStreak department')
        .populate('department', 'name')
        .sort({ performancePoints: 1 })
        .limit(5)
        .lean();

    const streakLeaders = await Worker.find({ subdomain, status: 'Active' })
        .select('name username photo currentStreak longestStreak performancePoints department')
        .populate('department', 'name')
        .sort({ currentStreak: -1 })
        .limit(5)
        .lean();

    // Average completion efficiency
    const efficiencyAgg = await PerformancePoints.aggregate([
        { $match: { subdomain, efficiencyRatio: { $ne: null } } },
        { $group: { _id: null, avgEfficiency: { $avg: '$efficiencyRatio' } } }
    ]);
    const avgEfficiency = Math.round((efficiencyAgg[0]?.avgEfficiency || 1) * 100) / 100;

    res.json({
        totalPointsDistributed,
        totalPenalties,
        topPerformers,
        lowestPerformers,
        streakLeaders,
        avgEfficiency
    });
});

// ─── API: Admin Employee Analytics ───────────────────────────────────────────
const getAdminEmployeeAnalytics = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    const workers = await Worker.find({ subdomain, status: { $in: ['Active', 'Relieved'] } })
        .select('name username photo performancePoints currentStreak longestStreak performanceLevel totalCompletedTickets totalDelayedTickets department status')
        .populate('department', 'name')
        .sort({ performancePoints: -1 })
        .lean();

    const analytics = await Promise.all(workers.map(async (w, idx) => {
        const avgEfficiencyAgg = await PerformancePoints.aggregate([
            { $match: { worker: w._id, subdomain, efficiencyRatio: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$efficiencyRatio' } } }
        ]);
        const avgEfficiency = Math.round((avgEfficiencyAgg[0]?.avg || 0) * 100) / 100;

        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekAgg = await PerformancePoints.aggregate([
            { $match: { worker: w._id, subdomain, createdAt: { $gte: weekStart } } },
            { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
        ]);
        const weeklyPoints = weekAgg[0]?.total || 0;

        const badges = await Badge.find({ worker: w._id, subdomain }).select('badgeType badgeName badgeEmoji').lean();

        return {
            rank: idx + 1,
            _id: w._id,
            name: w.name,
            photo: w.photo,
            department: w.department?.name || 'N/A',
            status: w.status,
            totalPoints: w.performancePoints || 0,
            weeklyPoints,
            currentStreak: w.currentStreak || 0,
            longestStreak: w.longestStreak || 0,
            performanceLevel: w.performanceLevel || 'Beginner',
            totalCompletedTickets: w.totalCompletedTickets || 0,
            totalDelayedTickets: w.totalDelayedTickets || 0,
            avgEfficiency,
            badges
        };
    }));

    res.json({ analytics });
});

// ─── API: Manual Bonus / Deduction ───────────────────────────────────────────
const manualBonus = asyncHandler(async (req, res) => {
    const { workerId, points, reason, note } = req.body;
    const subdomain = req.user.subdomain;

    if (!workerId || points === undefined || points === null) {
        res.status(400);
        throw new Error('Worker ID and points are required');
    }

    const worker = await Worker.findOne({ _id: workerId, subdomain });
    if (!worker) {
        res.status(404);
        throw new Error('Worker not found');
    }

    const pointsNum = parseFloat(points);
    const recordReason = pointsNum >= 0 ? 'manual_bonus' : 'manual_deduction';

    await PerformancePoints.create({
        worker: workerId,
        subdomain,
        pointsEarned: pointsNum,
        reason: recordReason,
        performanceStatus: 'manual',
        note: note || reason || 'Manual adjustment by admin'
    });

    const newTotal = (worker.performancePoints || 0) + pointsNum;
    await Worker.findByIdAndUpdate(workerId, {
        $inc: { performancePoints: pointsNum },
        performanceLevel: getPerformanceLevel(newTotal)
    });

    // Notify worker
    await sendPerformanceNotification({
        workerId,
        subdomain,
        title: pointsNum >= 0 ? `+${pointsNum} Bonus Points!` : `${pointsNum} Points Deducted`,
        message: note || reason || `Admin ${pointsNum >= 0 ? 'awarded' : 'deducted'} ${Math.abs(pointsNum)} points`,
        type: 'task_approved'
    });

    res.json({ success: true, message: 'Points updated', newTotal });
});

// ─── API: Get Performance Settings ───────────────────────────────────────────
const getPerformanceSettings = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const config = await getPerformanceConfig(subdomain);
    res.json(config);
});

// ─── API: Update Performance Settings ────────────────────────────────────────
const updatePerformanceSettings = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const updates = req.body;

    let settings = await Settings.findOne({ subdomain });
    if (!settings) {
        settings = new Settings({ subdomain });
    }

    if (!settings.performanceConfig) {
        settings.performanceConfig = {};
    }

    // Merge updates
    Object.assign(settings.performanceConfig, updates);
    settings.markModified('performanceConfig');
    await settings.save();

    const config = await getPerformanceConfig(subdomain);
    res.json({ success: true, config });
});

module.exports = {
    awardPointsOnTicketDone,
    calculateTicketPoints,
    getMyPerformance,
    getMyPointHistory,
    getLeaderboard,
    getAdminPerformanceOverview,
    getAdminEmployeeAnalytics,
    manualBonus,
    getPerformanceSettings,
    updatePerformanceSettings,
    getPerformanceConfig,
    BADGE_DEFINITIONS
};
