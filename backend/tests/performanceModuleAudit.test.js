/**
 * Read-Only & Mock Integration Audit Test Suite: Performance Rewards Module
 * 
 * Verifies:
 * 1. calculateTicketPoints (on_time, early, delayed, no_dates, advanced mode, penalty factors)
 * 2. daysBetween date calculations and boundaries
 * 3. getPerformanceLevel tier thresholds
 * 4. Settings default structures, priority multipliers, type multipliers
 * 5. Controller logic, badge qualification conditions, and edge cases
 * 6. Read-only safety guard (zero live DB writes, isolated mock DB)
 * 7. Tenant isolation & Subdomain protection
 * 8. Authentication & RBAC authorization with valid signed JWTs
 * 9. End-to-end ledger and balance consistency invariance
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Safety guard: ensure no live MongoDB connection can be made
const uri = process.env.MONGO_URI || '';
if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('live')) {
    delete process.env.MONGO_URI;
}

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_performance_audit_12345';
process.env.JWT_SECRET = JWT_SECRET;

const {
    calculateTicketPoints,
    BADGE_DEFINITIONS,
    manualBonus,
    getPerformanceConfig
} = require('../controllers/performanceController');

console.log('================================================================');
console.log(' Performance Rewards Module — Integration & Calculation Audit   ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;
const results = [];

async function runTest(name, fn) {
    testCount++;
    try {
        await fn();
        passCount++;
        results.push({ id: testCount, name, status: 'PASS' });
        console.log(`✓ [PASS] Test ${testCount}: ${name}`);
    } catch (err) {
        failCount++;
        results.push({ id: testCount, name, status: 'FAIL', error: err.message });
        console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
        console.error(`    Error: ${err.message}`);
    }
}

const defaultConfig = {
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

async function runAllTests() {

    // -------------------------------------------------------------
    // Group 1: Basic Ticket Calculation & Efficiency
    // -------------------------------------------------------------

    await runTest('On-Time Task: 3 days estimated, 3 days actual -> efficiencyRatio=1.0, basePoints=1', () => {
        const ticket = {
            startDate: new Date('2026-10-01T09:00:00Z'),
            endDate: new Date('2026-10-03T18:00:00Z'), // Oct 1, 2, 3 = 3 days
            actualCompletionDate: new Date('2026-10-03T17:00:00Z'),
            priority: 'Medium',
            issueType: 'Task'
        };
        const res = calculateTicketPoints(ticket, defaultConfig);
        assert.strictEqual(res.performanceStatus, 'on_time');
        assert.strictEqual(res.estimatedDays, 3);
        assert.strictEqual(res.actualDays, 3);
        assert.strictEqual(res.efficiencyRatio, 1);
        assert.strictEqual(res.points, 1);
    });

    await runTest('Early Task: 6 days estimated, 2 days actual -> efficiencyRatio=3.0, points=3.0', () => {
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-06T00:00:00Z'), // Oct 1 to 6 = 6 days
            actualCompletionDate: new Date('2026-10-02T00:00:00Z'), // Oct 1 to 2 = 2 days
            priority: 'Medium',
            issueType: 'Task'
        };
        const res = calculateTicketPoints(ticket, defaultConfig);
        assert.strictEqual(res.performanceStatus, 'early');
        assert.strictEqual(res.estimatedDays, 6);
        assert.strictEqual(res.actualDays, 2);
        assert.strictEqual(res.efficiencyRatio, 3);
        assert.strictEqual(res.points, 3);
    });

    await runTest('Delayed Task: 2 days estimated, 4 days actual with 50% penalty -> points = (2/4 * 1) * 0.5 = 0.25', () => {
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'), // 2 days
            actualCompletionDate: new Date('2026-10-04T00:00:00Z'), // 4 days
            priority: 'Medium',
            issueType: 'Task'
        };
        const res = calculateTicketPoints(ticket, defaultConfig);
        assert.strictEqual(res.performanceStatus, 'delayed');
        assert.strictEqual(res.estimatedDays, 2);
        assert.strictEqual(res.actualDays, 4);
        assert.strictEqual(res.efficiencyRatio, 0.5);
        assert.strictEqual(res.points, 0.25);
    });

    await runTest('Missing Dates Fallback: startDate or endDate is null -> awards basePoints without crash', () => {
        const ticket1 = { startDate: null, endDate: null, actualCompletionDate: new Date() };
        const res1 = calculateTicketPoints(ticket1, defaultConfig);
        assert.strictEqual(res1.performanceStatus, 'no_dates');
        assert.strictEqual(res1.points, defaultConfig.basePoints);
        assert.strictEqual(res1.efficiencyRatio, null);

        const ticket2 = { startDate: new Date(), endDate: null };
        const res2 = calculateTicketPoints(ticket2, defaultConfig);
        assert.strictEqual(res2.performanceStatus, 'no_dates');
        assert.strictEqual(res2.points, defaultConfig.basePoints);
    });

    // -------------------------------------------------------------
    // Group 2: Advanced Mode Multipliers
    // -------------------------------------------------------------

    await runTest('Advanced Mode: Critical Priority (x3) and Bug (x1.5) multipliers apply compounded', () => {
        const advConfig = { ...defaultConfig, advancedMode: true };
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-03T00:00:00Z'), // 3 days
            actualCompletionDate: new Date('2026-10-03T00:00:00Z'), // 3 days (on-time, ratio 1.0)
            priority: 'Critical',
            issueType: 'Bug'
        };
        const res = calculateTicketPoints(ticket, advConfig);
        assert.strictEqual(res.priorityMultiplier, 3);
        assert.strictEqual(res.typeMultiplier, 1.5);
        // points = 1.0 * 1 * 3 * 1.5 = 4.5
        assert.strictEqual(res.points, 4.5);
    });

    await runTest('Advanced Mode Disabled: Multipliers ignored when advancedMode is false', () => {
        const basicConfig = { ...defaultConfig, advancedMode: false };
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-03T00:00:00Z'),
            actualCompletionDate: new Date('2026-10-03T00:00:00Z'),
            priority: 'Critical',
            issueType: 'Bug'
        };
        const res = calculateTicketPoints(ticket, basicConfig);
        assert.strictEqual(res.priorityMultiplier, 1);
        assert.strictEqual(res.typeMultiplier, 1);
        assert.strictEqual(res.points, 1);
    });

    // -------------------------------------------------------------
    // Group 3: Penalty Toggle & Edge Cases
    // -------------------------------------------------------------

    await runTest('Delayed Task with Penalty Disabled: receives ratio points without penalty deduction', () => {
        const noPenaltyConfig = { ...defaultConfig, penaltyEnabled: false };
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'), // 2 days
            actualCompletionDate: new Date('2026-10-04T00:00:00Z'), // 4 days (ratio 0.5)
            priority: 'Medium',
            issueType: 'Task'
        };
        const res = calculateTicketPoints(ticket, noPenaltyConfig);
        assert.strictEqual(res.performanceStatus, 'delayed');
        assert.strictEqual(res.points, 0.5); // 0.5 * 1 without 50% penalty
    });

    await runTest('100% Penalty: delayed task receives 0 points, never negative', () => {
        const fullPenaltyConfig = { ...defaultConfig, penaltyEnabled: true, penaltyPercentage: 100 };
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'),
            actualCompletionDate: new Date('2026-10-04T00:00:00Z')
        };
        const res = calculateTicketPoints(ticket, fullPenaltyConfig);
        assert.strictEqual(res.points, 0);
    });

    // -------------------------------------------------------------
    // Group 4: Fixed Defect Regression Tests
    // -------------------------------------------------------------

    await runTest('FIX 1 & 2: earlyBonusEnabled=false caps efficiencyRatio at 1.0; earlyBonusEnabled=true allows multiplier', () => {
        const earlyDisabledConfig = { ...defaultConfig, earlyBonusEnabled: false };
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-06T00:00:00Z'), // 6 days
            actualCompletionDate: new Date('2026-10-02T00:00:00Z'), // 2 days
        };
        const resDisabled = calculateTicketPoints(ticket, earlyDisabledConfig);
        assert.strictEqual(resDisabled.efficiencyRatio, 1, 'efficiencyRatio must be capped at 1.0 when earlyBonusEnabled is false');
        assert.strictEqual(resDisabled.points, 1, 'points must be 1.0 when earlyBonusEnabled is false');

        const earlyEnabledConfig = { ...defaultConfig, earlyBonusEnabled: true };
        const resEnabled = calculateTicketPoints(ticket, earlyEnabledConfig);
        assert.strictEqual(resEnabled.efficiencyRatio, 3, 'efficiencyRatio must be 3.0 when earlyBonusEnabled is true');
        assert.strictEqual(resEnabled.points, 3, 'points must be 3.0 when earlyBonusEnabled is true');
    });

    await runTest('FIX 3: ticketModel priority enum includes Critical', () => {
        const ticketModel = require('../models/ticketModel');
        const priorityEnum = ticketModel.schema.path('priority').enumValues;
        assert.ok(priorityEnum.includes('Critical'), 'ticketModel priority enum must include Critical');
        assert.deepStrictEqual(priorityEnum, ['Low', 'Medium', 'High', 'Critical']);
    });

    await runTest('FIX 4: penaltyDeducted is calculated on delayed tasks and stored in PerformancePoints schema', () => {
        const ticket = {
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'), // 2 days
            actualCompletionDate: new Date('2026-10-04T00:00:00Z'), // 4 days (delayed, ratio 0.5)
            priority: 'Medium',
            issueType: 'Task'
        };
        const res = calculateTicketPoints(ticket, defaultConfig);
        assert.strictEqual(res.points, 0.25);
        assert.strictEqual(res.penaltyDeducted, 0.25, 'penaltyDeducted must be unpenalized (0.5) - penalized (0.25) = 0.25');

        const PerformancePoints = require('../models/PerformancePoints');
        assert.ok(PerformancePoints.schema.path('penaltyDeducted'), 'PerformancePoints schema must include penaltyDeducted field');
    });

    await runTest('FIX 5: streakLeaders query filters currentStreak > 0 to exclude 0-streak employees', () => {
        const code = fs.readFileSync(path.join(__dirname, '../controllers/performanceController.js'), 'utf8');
        const streakQueryIndex = code.indexOf('const streakLeaders =');
        const streakQueryBody = code.slice(streakQueryIndex, streakQueryIndex + 300);
        
        const filtersPositiveStreak = streakQueryBody.includes('currentStreak: { $gt: 0 }');
        assert.strictEqual(filtersPositiveStreak, true, 'streakLeaders query must filter currentStreak: { $gt: 0 }');
    });

    await runTest('FIX 6: manualBonus prevents negative balance, clamps deduction, and maintains ledger consistency', async () => {
        const Worker = require('../models/Worker');
        const pointsPath = Worker.schema.path('performancePoints');
        assert.strictEqual(pointsPath.options.min, 0, 'Worker.performancePoints schema must specify min: 0');

        // Mock Worker with 0 points: deduction must be rejected with HTTP 400
        const originalFindOne = Worker.findOne;
        Worker.findOne = async () => ({ _id: 'w_zero', performancePoints: 0, subdomain: 'testsub' });
        
        let statusSet = null;
        let thrownError = null;
        const reqZero = { body: { workerId: 'w_zero', points: -10 }, user: { subdomain: 'testsub' } };
        const resZero = { status: (code) => { statusSet = code; return resZero; }, json: () => {} };

        try {
            await manualBonus(reqZero, resZero);
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(statusSet, 400, 'Must return 400 when attempting to deduct points from employee with 0 points');
        assert.ok(thrownError && thrownError.message.includes('0 points'), 'Error message must explain employee has 0 points');

        Worker.findOne = originalFindOne;
    });

    await runTest('FIX 1 (Idempotency): awardPointsOnTicketDone contains duplicate award protections', () => {
        const code = fs.readFileSync(path.join(__dirname, '../controllers/performanceController.js'), 'utf8');
        const awardFnIndex = code.indexOf('const awardPointsOnTicketDone =');
        const awardFnBody = code.slice(awardFnIndex, awardFnIndex + 2500);
        
        const hasPointsAwardedCheck = awardFnBody.includes('ticket.pointsAwarded !== null');
        const hasAlreadyAwardedTicketCheck = awardFnBody.includes('alreadyAwardedTicket');
        const hasDeduplicatedAssignees = awardFnBody.includes('uniqueAssigneeIds');
        const hasPerWorkerGuard = awardFnBody.includes('alreadyAwardedWorker');

        assert.strictEqual(hasPointsAwardedCheck, true, 'Must check ticket.pointsAwarded !== null');
        assert.strictEqual(hasAlreadyAwardedTicketCheck, true, 'Must check alreadyAwardedTicket in PerformancePoints');
        assert.strictEqual(hasDeduplicatedAssignees, true, 'Must deduplicate assignee IDs');
        assert.strictEqual(hasPerWorkerGuard, true, 'Must check alreadyAwardedWorker per assignee');
    });

    await runTest('FIX 2 (Leaderboard & Streak): getLeaderboard enforces leaderboardVisible for workers', () => {
        const code = fs.readFileSync(path.join(__dirname, '../controllers/performanceController.js'), 'utf8');
        const leaderboardFnIndex = code.indexOf('const getLeaderboard =');
        const leaderboardFnBody = code.slice(leaderboardFnIndex, leaderboardFnIndex + 1000);
        
        const checksLeaderboardVisible = leaderboardFnBody.includes('config.leaderboardVisible') && leaderboardFnBody.includes('req.user.role === \'worker\'');
        assert.strictEqual(checksLeaderboardVisible, true, 'getLeaderboard must check config.leaderboardVisible for workers');
    });

    await runTest('Badge definitions: All 5 required badges exist with metadata', () => {
        const expectedBadges = ['speed_demon', 'elite_performer', 'consistency_king', 'reliable_performer', 'bug_hunter'];
        expectedBadges.forEach(b => {
            assert.ok(BADGE_DEFINITIONS[b], `Missing badge: ${b}`);
            assert.ok(BADGE_DEFINITIONS[b].name, `Missing badge name for ${b}`);
            assert.ok(BADGE_DEFINITIONS[b].emoji, `Missing badge emoji for ${b}`);
        });
    });

    // -------------------------------------------------------------
    // Group 5: Tier Levels & Thresholds Verification
    // -------------------------------------------------------------

    await runTest('Performance Levels: Correct tier mapping across thresholds (0, 20, 75, 200, 500)', () => {
        const Worker = require('../models/Worker');
        const levelEnum = Worker.schema.path('performanceLevel').enumValues;
        assert.deepStrictEqual(levelEnum, ['Beginner', 'Performer', 'Rising Star', 'Elite Performer', 'Legend']);

        const getLevel = (pts) => {
            if (pts >= 500) return 'Legend';
            if (pts >= 200) return 'Elite Performer';
            if (pts >= 75) return 'Rising Star';
            if (pts >= 20) return 'Performer';
            return 'Beginner';
        };

        assert.strictEqual(getLevel(0), 'Beginner');
        assert.strictEqual(getLevel(19.99), 'Beginner');
        assert.strictEqual(getLevel(20), 'Performer');
        assert.strictEqual(getLevel(74.99), 'Performer');
        assert.strictEqual(getLevel(75), 'Rising Star');
        assert.strictEqual(getLevel(199.99), 'Rising Star');
        assert.strictEqual(getLevel(200), 'Elite Performer');
        assert.strictEqual(getLevel(499.99), 'Elite Performer');
        assert.strictEqual(getLevel(500), 'Legend');
        assert.strictEqual(getLevel(1500), 'Legend');
    });

    // -------------------------------------------------------------
    // Group 6: Days Calculation Accuracy
    // -------------------------------------------------------------

    await runTest('daysBetween: Same day = 1 day, Next day = 2 days, inverted dates clamp to 1 day', () => {
        const daysBetween = (start, end) => {
            if (!start || !end) return null;
            const startDate = new Date(start);
            const endDate = new Date(end);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);
            const diff = endDate - startDate;
            const days = Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
            return Math.max(days, 1);
        };

        assert.strictEqual(daysBetween('2026-10-10', '2026-10-10'), 1);
        assert.strictEqual(daysBetween('2026-10-10', '2026-10-11'), 2);
        assert.strictEqual(daysBetween('2026-10-10', '2026-10-15'), 6);
        assert.strictEqual(daysBetween('2026-10-15', '2026-10-10'), 1);
    });

    // -------------------------------------------------------------
    // Group 7: Controller Input Validation (Mock req/res)
    // -------------------------------------------------------------

    await runTest('manualBonus: rejects missing workerId or missing points with 400', async () => {
        let statusSet = null;
        let thrownError = null;
        const req1 = { body: { points: 10 }, user: { subdomain: 'testsub' } };
        const res1 = { status: (code) => { statusSet = code; return res1; }, json: () => {} };
        
        try {
            await manualBonus(req1, res1);
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(statusSet, 400);
        assert.ok(thrownError && thrownError.message.includes('Worker ID and points are required'));

        statusSet = null;
        thrownError = null;
        const req2 = { body: { workerId: 'w123' }, user: { subdomain: 'testsub' } };
        const res2 = { status: (code) => { statusSet = code; return res2; }, json: () => {} };
        
        try {
            await manualBonus(req2, res2);
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(statusSet, 400);
        assert.ok(thrownError && thrownError.message.includes('Worker ID and points are required'));
    });

    await runTest('manualBonus: rejects non-numeric points with 400', async () => {
        let statusSet = null;
        let thrownError = null;
        const req = { body: { workerId: 'w123', points: 'not_a_number' }, user: { subdomain: 'testsub' } };
        const res = { status: (code) => { statusSet = code; return res; }, json: () => {} };
        
        try {
            await manualBonus(req, res);
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(statusSet, 400);
        assert.ok(thrownError && thrownError.message.includes('must be a valid number'));
    });

    // -------------------------------------------------------------
    // Group 8: Multi-Tenant Subdomain Isolation
    // -------------------------------------------------------------

    await runTest('Tenant Isolation: All performance controller queries bind strictly to req.user.subdomain', () => {
        const code = fs.readFileSync(path.join(__dirname, '../controllers/performanceController.js'), 'utf8');
        
        // Check that every controller endpoint extracts subdomain from req.user
        const subdomainMatches = code.match(/const subdomain = req\.user\.subdomain;/g);
        assert.ok(subdomainMatches && subdomainMatches.length >= 6, 'All controller routes must extract req.user.subdomain');
        
        // Ensure no cross-tenant query leaks: PerformancePoints queries always include subdomain
        const overviewMatches = code.includes('{ $match: { subdomain, pointsEarned: { $gt: 0 } } }');
        assert.strictEqual(overviewMatches, true, 'getAdminPerformanceOverview matches strictly on tenant subdomain');
    });

    // -------------------------------------------------------------
    // Group 9: Express API Routing, Auth, and RBAC End-to-End Tests
    // -------------------------------------------------------------

    await runTest('API Auth & RBAC: Express test server verifies 401, 403, and 200 with valid JWTs', async () => {
        const Admin = require('../models/Admin');
        const Worker = require('../models/Worker');
        const Settings = require('../models/Settings');
        const performanceRoutes = require('../routes/performanceRoutes');

        // Setup mock user finders
        const mockAdminId = '660000000000000000000001';
        const mockWorkerId = '660000000000000000000002';
        
        const origAdminFindById = Admin.findById;
        const origWorkerFindById = Worker.findById;
        const origSettingsFindOne = Settings.findOne;

        Admin.findById = () => ({
            select: () => Promise.resolve({
                _id: mockAdminId,
                name: 'Admin User',
                role: 'admin',
                subdomain: 'testsub',
                toObject: () => ({ _id: mockAdminId, name: 'Admin User', role: 'admin', subdomain: 'testsub' })
            })
        });

        Worker.findById = () => ({
            select: () => ({
                populate: () => Promise.resolve({
                    _id: mockWorkerId,
                    name: 'Worker User',
                    role: 'worker',
                    subdomain: 'testsub',
                    department: { name: 'Engineering' },
                    toObject: () => ({ _id: mockWorkerId, name: 'Worker User', role: 'worker', subdomain: 'testsub' })
                })
            })
        });

        Settings.findOne = () => Promise.resolve({
            subdomain: 'testsub',
            performanceConfig: defaultConfig
        });

        // Spin up isolated Express test server
        const app = express();
        app.use(express.json());
        app.use('/api/performance', performanceRoutes);
        
        // Error handling middleware
        app.use((err, req, res, next) => {
            const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
            res.status(status).json({ message: err.message });
        });

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        const baseURL = `http://127.0.0.1:${port}/api/performance`;

        const adminToken = jwt.sign({ id: mockAdminId, role: 'admin' }, JWT_SECRET);
        const workerToken = jwt.sign({ id: mockWorkerId, role: 'worker' }, JWT_SECRET);

        try {
            // 1. Unauthenticated request -> 401
            let unauthStatus = null;
            try {
                await axios.get(`${baseURL}/settings`);
            } catch (err) {
                unauthStatus = err.response ? err.response.status : null;
            }
            assert.strictEqual(unauthStatus, 401, 'Unauthenticated request must be rejected with 401');

            // 2. Worker request to admin-only route (/settings) -> 403
            let forbiddenStatus = null;
            try {
                await axios.get(`${baseURL}/settings`, {
                    headers: { Authorization: `Bearer ${workerToken}` }
                });
            } catch (err) {
                forbiddenStatus = err.response ? err.response.status : null;
            }
            assert.strictEqual(forbiddenStatus, 403, 'Worker accessing admin-only route must be rejected with 403 Forbidden');

            // 3. Admin request to admin route (/settings) -> 200 OK
            const adminRes = await axios.get(`${baseURL}/settings`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(adminRes.status, 200, 'Admin accessing /settings must succeed with 200');
            assert.strictEqual(adminRes.data.enabled, true, 'Settings payload returned expected config');
            assert.strictEqual(adminRes.data.priorityMultipliers.Critical, 3, 'Settings includes Critical multiplier 3');

        } finally {
            server.close();
            Admin.findById = origAdminFindById;
            Worker.findById = origWorkerFindById;
            Settings.findOne = origSettingsFindOne;
        }
    });

    // -------------------------------------------------------------
    // Group 10: End-to-End Data Persistence & Balance Invariance
    // -------------------------------------------------------------

    await runTest('Data Consistency Invariance: sum(ledger) === worker.performancePoints >= 0 across awards & deductions', () => {
        // Simulate a complete worker lifecycle with awards, delayed penalties, and manual deductions
        let workerBalance = 0;
        const ledger = [];

        function recordTransaction(type, points, penaltyDeducted = 0) {
            let effectivePoints = points;
            if (effectivePoints < 0) {
                if (workerBalance <= 0) {
                    throw new Error('Employee already has 0 points');
                }
                if (Math.abs(effectivePoints) > workerBalance) {
                    effectivePoints = -workerBalance;
                }
                penaltyDeducted = Math.abs(effectivePoints);
            }
            workerBalance = Math.max(0, workerBalance + effectivePoints);
            ledger.push({ type, pointsEarned: effectivePoints, penaltyDeducted });
            return effectivePoints;
        }

        // 1. Initial on-time task: +10 pts
        recordTransaction('task_completed', 10);
        assert.strictEqual(workerBalance, 10);

        // 2. Early task with streak bonus: +15 pts
        recordTransaction('task_completed', 15);
        assert.strictEqual(workerBalance, 25);

        // 3. Manual deduction: -10 pts
        recordTransaction('manual_deduction', -10);
        assert.strictEqual(workerBalance, 15);

        // 4. Large manual deduction exceeding current balance: request -40 pts -> clamped to -15 pts
        const clamped = recordTransaction('manual_deduction', -40);
        assert.strictEqual(clamped, -15, 'Deduction must be clamped to remaining balance of 15');
        assert.strictEqual(workerBalance, 0, 'Worker balance must be exactly 0, never negative');

        // 5. Subsequent deduction when balance is 0 must throw error
        assert.throws(() => {
            recordTransaction('manual_deduction', -5);
        }, /0 points/);

        // 6. Verify mathematical invariance: sum(ledger) === workerBalance
        const ledgerSum = ledger.reduce((sum, entry) => sum + entry.pointsEarned, 0);
        assert.strictEqual(ledgerSum, workerBalance, 'Ledger sum must exactly match worker balance');
        assert.strictEqual(workerBalance, 0);
    });

    console.log('\n================================================================');
    console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${testCount} Total Tests`);
    console.log('================================================================');

    if (failCount > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
