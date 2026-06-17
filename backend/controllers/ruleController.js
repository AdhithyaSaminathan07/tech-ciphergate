const asyncHandler = require('express-async-handler');
const Rule = require('../models/Rule');
const RuleAcceptance = require('../models/RuleAcceptance');
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');
const Admin = require('../models/Admin');
const { sendNotification } = require('../utils/sendNotification');

// ─── DEFAULT COMPANY RULES ─────────────────────────────────────────────────────
// Auto-seeded for any subdomain that has no rules yet.
// Admin can freely edit, add, or delete these from the Admin > Rules panel.
const DEFAULT_RULES = [
    {
        title: 'Attendance & Office Hours',
        category: 'Attendance & Timings',
        severity: 'high',
        content: `<p><strong>Rule 1 — Office Hours Punctuality</strong></p>
<p>Be punctual during office hours from <strong>9:00 AM to 7:00 PM</strong> (Full-time) / <strong>3:00 PM – 7:00 PM</strong> (Part-time batch).</p>
<p><strong>Rule 5 — Daily Punch In / Punch Out</strong></p>
<p>Properly <strong>Punch In and Punch Out every day</strong> without exception.</p>
<p><strong>Rule 6 — Incorrect Punch-Out Time</strong></p>
<p>Failure to Punch Out with the correct time will be officially noted and may result in attendance discrepancies.</p>`
    },
    {
        title: 'Study Hours Policy',
        category: 'Attendance & Timings',
        severity: 'high',
        content: `<p><strong>Rule 2 — Mandatory Study Hours</strong></p>
<ul><li><strong>Full-time:</strong> 9:00 AM – 11:00 AM</li><li><strong>Part-time:</strong> 3:00 PM – 4:00 PM</li></ul>
<p><strong>Rule 4 — Silence During Study & Work Hours</strong></p>
<p>Maintain silence during both study hours and working hours. Distractions are strictly prohibited.</p>`
    },
    {
        title: 'Leave & Permission Policy',
        category: 'Leave Policy',
        severity: 'critical',
        content: `<p><strong>Rule 3 — Multi-Tiered Attendance Leave Policy</strong></p>
<p>A <strong>2X leave deduction</strong> applies if any of these conditions are met:</p>
<ul><li>Company-wide attendance below <strong>80%</strong></li><li>Departmental attendance below <strong>80%</strong></li><li>Individual cumulative attendance below <strong>90%</strong></li></ul>
<p><strong>Rule 7 — Unauthorized Absence</strong></p>
<p>Taking leave without submitting a proper request through Ciphergate is <strong>strictly prohibited</strong>.</p>`
    },
    {
        title: 'Workplace Hygiene & Cleanliness',
        category: 'General Info',
        severity: 'medium',
        content: `<p><strong>Rule 8</strong> — Do not eat during office hours.</p>
<p><strong>Rule 9</strong> — Dispose of all waste in the dustbin only. Keep surroundings clean.</p>
<p><strong>Rule 10</strong> — Keep your workspace neat and clean at all times.</p>
<p><strong>Rule 11</strong> — Clean your area during the 5-minute cleaning session from <strong>4:55 PM to 5:00 PM</strong> every day without fail.</p>
<p><strong>Rule 15</strong> — Use the washroom neatly. Switch off lights and taps properly after use.</p>`
    },
    {
        title: 'End-of-Day Responsibilities',
        category: 'General Info',
        severity: 'medium',
        content: `<p><strong>Rule 12 — Power-Off Protocol</strong></p>
<p>Before leaving, switch off: PC, Lights, Fan, and Air Conditioning (AC).</p>
<p><strong>Rule 17 — Before Leaving Checklist</strong></p>
<ul><li>Rearrange your chair properly</li><li>Ensure your workspace is tidy and organized</li></ul>`
    },
    {
        title: 'Tech Mobile & Equipment Rules',
        category: 'General Info',
        severity: 'medium',
        content: `<p><strong>Rule 13</strong> — Attend the <strong>Tech Mobile immediately</strong> when it rings.</p>
<p><strong>Rule 16</strong> — The Tech Mobile must be <strong>charged regularly</strong>. The first person to arrive ensures it is charged.</p>`
    },
    {
        title: 'Communication & Reporting',
        category: 'General Info',
        severity: 'medium',
        content: `<p><strong>Rule 14</strong> — Post <strong>daily tasks completed</strong> in the dedicated WhatsApp group before end of shift.</p>
<p><strong>Rule 18</strong> — Post daily updates in your respective groups in the <strong>Tech Vaseegrah WhatsApp Community</strong>.</p>`
    },
    {
        title: 'Employment Growth Policy',
        category: 'General Info',
        severity: 'high',
        content: `<p><strong>Rule 19 — Mandatory Career Progression Path</strong></p>
<ol><li><strong>Intern</strong> — Entry level</li><li><strong>Employee</strong> — Full accountability</li><li><strong>Developer</strong> — Advanced technical leadership</li></ol>
<p>This structured growth process is <strong>mandatory</strong>. There are no shortcuts or exceptions.</p>`
    },
    {
        title: 'Resignation & Transition Policy',
        category: 'Leave Policy',
        severity: 'critical',
        content: `<p><strong>Rule 20 — Formal Notice Period & Knowledge Transfer</strong></p>
<p>A <strong>one-month formal notice period is mandatory</strong> for all departures with full knowledge transfer.</p>
<p>Failure to comply results in: forfeiture of Employee Wallet balance, withholding of Experience Certificate & Relieving Letter, and disqualification from profit-sharing payouts.</p>`
    },
    {
        title: 'Meeting Rules & Approval Policy',
        category: 'Ethics & Code of Conduct',
        severity: 'high',
        content: `<p><strong>Rule 21</strong> — No meeting is permitted <strong>without prior formal approval from the Directors</strong>.</p>
<ul><li>Must be conducted in the <strong>designated meeting space</strong></li><li>Not at the workplace (currently the Community Garden)</li></ul>
<p>Unauthorized meetings result in <strong>disciplinary action against organiser and all participants</strong>.</p>`
    },
    {
        title: 'Non-Compliance Penalties & Enforcement',
        category: 'Ethics & Code of Conduct',
        severity: 'critical',
        content: `<p><strong>General Penalty</strong> — Non-adherence to any rule results in a fine of <strong>₹500</strong> or <strong>job termination</strong>.</p>
<p><strong>Implementation Accountability</strong> — Failure to enforce assigned rules results in a fine of <strong>₹2,000</strong> or <strong>job termination</strong>.</p>`
    },
    {
        title: 'Entertainment Restriction Regulation',
        category: 'Workplace Conduct',
        severity: 'critical',
        content: `<ul>
<li>Listening to music or audio entertainment content without authorization is prohibited.</li>
<li>Watching movies, television programs, online videos, streaming content, or entertainment media unrelated to work is prohibited.</li>
<li>Playing video games, electronic games, mobile games, or interactive entertainment software is prohibited.</li>
<li>Company activities may be monitored for compliance purposes.</li>
<li>Violations may result in disciplinary action, fines, suspension of privileges, or termination.</li>
</ul>`
    },
    {
        title: 'Headphone Usage Policy',
        category: 'Workplace Conduct',
        severity: 'high',
        content: `<ul>
<li>Bluetooth headphones and personal wireless audio devices are prohibited inside office premises unless authorized.</li>
<li>Developers who have not received company-provided headphones must report to management.</li>
<li>Employees must remain focused on assigned duties during working hours.</li>
<li>Personal creative activities and non-work-related content creation must be performed outside official work hours unless approved.</li>
</ul>`
    },
    {
        title: 'Leave & Permission Approval Policy',
        category: 'Leave Policy',
        severity: 'critical',
        content: `<ul>
<li>All leave requests and permissions must be approved through the official CipherGate approval process.</li>
<li>Any leave or permission taken without approval shall be considered unauthorized.</li>
<li>Unapproved leave or permission may result in disciplinary action and salary deductions according to company policy.</li>
</ul>`
    },
    {
        title: 'Workplace Monitoring & Compliance Policy',
        category: 'Security & Compliance',
        severity: 'critical',
        content: `<ul>
<li>CCTV monitoring may be used.</li>
<li>Internal compliance monitoring may be used.</li>
<li>Team intelligence reporting may be used.</li>
<li>Cyber activity monitoring may be used.</li>
<li>Company asset monitoring may be used.</li>
<li>Monitoring information may be used for investigations, compliance verification and disciplinary proceedings.</li>
</ul>`
    },
    {
        title: 'Meeting & Discussion Control Policy',
        category: 'Workplace Conduct',
        severity: 'critical',
        content: `<ul>
<li>All meetings must be conducted only in designated meeting spaces.</li>
<li>Group discussions involving three or more employees require approval.</li>
<li>Cross-team discussions during working hours are prohibited unless approved.</li>
<li>Meetings must follow company approval procedures.</li>
<li>Violations may result in disciplinary action and fines.</li>
</ul>`
    },
    {
        title: 'Gaming & Unrelated Content Policy',
        category: 'Workplace Conduct',
        severity: 'critical',
        content: `<ul>
<li>Playing games on company premises is prohibited.</li>
<li>Watching unrelated entertainment videos during working hours is prohibited.</li>
<li>Mobile games, PC games, browser games and entertainment streaming are prohibited.</li>
<li>Violations may result in fines, suspension or termination.</li>
</ul>`
    },
    {
        title: 'Daily Report Compliance Policy',
        category: 'Reporting & Communication',
        severity: 'high',
        content: `<ul>
<li>All employees must submit daily work reports in the designated reporting channel.</li>
<li>Failure to submit daily reports may result in disciplinary action or fines according to company policy.</li>
</ul>`
    },
    {
        title: 'Profit Sharing Eligibility Policy',
        category: 'Compensation & Benefits',
        severity: 'critical',
        content: `<p><strong>Rule 29 – Profit Sharing Eligibility Criteria</strong></p>
<p>To qualify for the Company's Profit Sharing Scheme, an employee must satisfy ALL of the following conditions:</p>
<ol>
<li><strong>Attendance Requirement</strong>
<ul><li>Maintain a minimum attendance rate of 90% during the evaluation period.</li></ul>
</li>
<li><strong>Disciplinary Record Requirement</strong>
<ul><li>Have no fines, warnings, disciplinary actions, or penalties issued within the preceding three (3) months.</li></ul>
</li>
<li><strong>Project Performance Requirement</strong>
<ul><li>Achieve a minimum 90% project completion rate based on assigned tasks, deliverables, and deadlines.</li></ul>
</li>
<li><strong>Assessment Requirement</strong>
<ul><li>Obtain a minimum score of 90% in company assessments, evaluations, competency tests, examinations, or scorecards.</li></ul>
</li>
</ol>
<p>Employees who fail to satisfy any of the above requirements may become ineligible for profit-sharing benefits for the applicable evaluation period.</p>
<p>Eligibility determination remains subject to Management review and approval.</p>`
    },
    {
        title: 'Revenue & Profitability Performance Policy',
        category: 'Compensation & Benefits',
        severity: 'critical',
        content: `<p><strong>Rule 30 – Revenue and Profitability Performance Policy</strong></p>
<p><strong>1. Minimum Profitability Requirement</strong></p>
<p>Employees are expected to contribute business value that generates a minimum net profit equivalent to 30% of their monthly basic salary within a rolling sixty (60) day period.</p>
<p>Failure to achieve the required profitability target may result in:</p>
<ul>
<li>Performance review by Management;</li>
<li>Placement under a Performance Improvement Plan (PIP);</li>
<li>Reassignment of responsibilities where appropriate;</li>
<li>Additional performance monitoring; or</li>
<li>Termination of employment in accordance with company policies.</li>
</ul>
<p>The Company reserves the sole right to determine the methodology used to calculate profit contribution and business value generation.</p>
<p><strong>2. Profit Sharing Reserve Fund</strong></p>
<p>The Company shall retain 10% of each employee's profit-sharing entitlement within a Profit Sharing Reserve Fund.</p>
<p>The reserve fund may be utilized for:</p>
<ul>
<li>Business continuity support during low revenue periods;</li>
<li>Approved employee emergency medical assistance;</li>
<li>Approved employee marriage-related financial assistance; and</li>
<li>Other management-approved emergency requirements.</li>
</ul>
<p>Subject to settlement of all outstanding obligations, the accumulated reserve balance may be released upon successful completion of the employee's notice period, exit clearance process, and final management approval.</p>
<p><strong>3. Basic Salary Support During Low-Revenue Periods</strong></p>
<p>Where an employee is temporarily unable to generate sufficient revenue or profit contribution, the Company may, at its sole discretion, provide a Basic Salary Support Payment.</p>
<p>Such support payments:</p>
<ul>
<li>Shall be treated as an advance, recoverable support amount, or company loan;</li>
<li>Shall be recorded against the employee account;</li>
<li>May be recovered from future incentives, commissions, profit-sharing distributions, or other amounts payable;</li>
<li>Shall not be treated as additional salary, bonus, or permanent compensation.</li>
</ul>
<p>Management shall determine the repayment schedule and recovery method.</p>
<p><strong>4. Management Discretion</strong></p>
<p>All profit calculations, reserve fund administration, salary support payments, loan approvals, profitability assessments, and profit-sharing distributions shall remain subject to final Management review, interpretation, and approval.</p>
<p>The Company's decision regarding profitability calculations and profit-sharing administration shall be final.</p>`
    }
];

/**
 * Auto-initializes default rules for a subdomain if none exist yet.
 * Runs silently on first access — admin can edit all rules afterwards from Admin > Rules panel.
 * Also upgrades existing tenants to rules version 2.0 and appends the new rules if their current rules version is less than 2.0.
 */
const initializeDefaultRules = async (subdomain) => {
    try {
        const VERSION = '2.0';
        const admin = await Admin.findOne({ subdomain });
        if (!admin) return; // Need an admin to assign as creator

        const existingCount = await Rule.countDocuments({ subdomain });
        if (existingCount === 0) {
            // Future tenant: Seed all DEFAULT_RULES as version 2.0
            const ruleDocs = DEFAULT_RULES.map(r => ({
                ...r,
                version: VERSION,
                status: 'active',
                changeLog: 'Default company rulebook — auto-initialized',
                attachments: [],
                subdomain,
                createdBy: admin._id
            }));
            await Rule.insertMany(ruleDocs);

            // Ensure Settings has rulesConfiguration
            let settings = await Settings.findOne({ subdomain });
            if (!settings) settings = new Settings({ subdomain });
            settings.rulesConfiguration = {
                forceAcceptance: true,
                scrollValidation: true,
                allowPdfDownload: true,
                requireCheckbox: true,
                autoNotify: true,
                gracePeriodDays: 0,
                mobileAcceptance: true,
                currentVersion: VERSION
            };
            settings.lastUpdated = Date.now();
            await settings.save();
            console.log(`✅ [Rules] Auto-seeded ${ruleDocs.length} default rules (v2.0) for: ${subdomain}`);
        } else {
            // Existing tenant: Check if version needs to be bumped to 2.0
            let settings = await Settings.findOne({ subdomain });
            if (!settings) settings = new Settings({ subdomain });

            const newRuleTitles = [
                'Entertainment Restriction Regulation',
                'Headphone Usage Policy',
                'Leave & Permission Approval Policy',
                'Workplace Monitoring & Compliance Policy',
                'Meeting & Discussion Control Policy',
                'Gaming & Unrelated Content Policy',
                'Daily Report Compliance Policy',
                'Profit Sharing Eligibility Policy',
                'Revenue & Profitability Performance Policy'
            ];

            const rulesToInsert = [];
            for (const r of DEFAULT_RULES) {
                if (newRuleTitles.includes(r.title)) {
                    // Check if it already exists to prevent duplicate insertion
                    const exists = await Rule.findOne({ subdomain, title: r.title });
                    if (!exists) {
                        rulesToInsert.push({
                            ...r,
                            version: VERSION,
                            status: 'active',
                            changeLog: 'Appended new rule during v2.0 upgrade',
                            attachments: [],
                            subdomain,
                            createdBy: admin._id
                        });
                    }
                }
            }

            const currentVersion = settings.rulesConfiguration?.currentVersion || '1.0';

            // If we inserted new rules or if settings version is not 2.0, we apply updates
            if (rulesToInsert.length > 0 || currentVersion !== VERSION) {
                if (rulesToInsert.length > 0) {
                    await Rule.insertMany(rulesToInsert);
                    console.log(`✅ [Rules] Appended ${rulesToInsert.length} new rules to subdomain: ${subdomain}`);
                }

                // Bump settings version to 2.0
                if (!settings.rulesConfiguration) {
                    settings.rulesConfiguration = {
                        forceAcceptance: true,
                        scrollValidation: true,
                        allowPdfDownload: true,
                        requireCheckbox: true,
                        autoNotify: true,
                        gracePeriodDays: 0,
                        mobileAcceptance: true,
                        currentVersion: VERSION
                    };
                } else {
                    settings.rulesConfiguration.currentVersion = VERSION;
                }
                settings.lastUpdated = Date.now();
                await settings.save();

                // Force re-acceptance for all workers who might have accepted version 2.0 already.
                // Resetting their accepted version back to '1.0' ensures everyone gets the rules acceptance prompt.
                const resetResult = await Worker.updateMany(
                    { subdomain, acceptedRulesVersion: VERSION },
                    { acceptedRulesVersion: '1.0' }
                );
                if (resetResult.modifiedCount > 0) {
                    console.log(`🔄 [Rules] Reset acceptedRulesVersion for ${resetResult.modifiedCount} workers on ${subdomain} to trigger re-acceptance of v2.0`);
                }
            }
        }
    } catch (err) {
        console.error(`⚠️ [Rules] initializeDefaultRules error for ${subdomain}:`, err.message);
    }
};

// @desc    Get all active rules and current config
// @route   GET /api/rules/active
// @access  Private (Worker & Admin)
const getActiveRules = asyncHandler(async (req, res) => {
    const subdomain = req.user?.subdomain || req.query.subdomain;
    if (!subdomain) {
        res.status(400);
        throw new Error('Subdomain is required');
    }

    // Auto-seed default rules on first access if none exist
    await initializeDefaultRules(subdomain);

    const rules = await Rule.find({ subdomain, status: 'active' }).sort({ category: 1, title: 1 });
    const settings = await Settings.findOne({ subdomain });
    const rulesConfig = settings ? settings.rulesConfiguration : { currentVersion: '2.0' };

    res.json({ success: true, rules, rulesConfig });
});

// @desc    Get rules history (all rules including archived)
// @route   GET /api/rules/history
// @access  Private (Worker & Admin)
const getRulesHistory = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const rules = await Rule.find({ subdomain }).sort({ version: -1, category: 1, title: 1 });
    res.json({ success: true, data: rules });
});

// @desc    Get current worker's acceptance logs
// @route   GET /api/rules/my-acceptances
// @access  Private (Worker only)
const getMyAcceptances = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const employeeId = req.user._id;
    const acceptances = await RuleAcceptance.find({ employeeId, subdomain }).sort({ acceptedAt: -1 });
    res.json({ success: true, data: acceptances });
});

// @desc    Submit rules agreement
// @route   POST /api/rules/accept
// @access  Private (Worker only)
const submitAcceptance = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const employeeId = req.user._id;

    const settings = await Settings.findOne({ subdomain });
    const currentVersion = settings?.rulesConfiguration?.currentVersion || '1.0';

    // Verify worker hasn't already accepted this version
    let acceptance = await RuleAcceptance.findOne({
        employeeId,
        rulesVersion: currentVersion,
        subdomain
    });

    if (!acceptance) {
        // Parse IP and User-Agent
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'N/A';
        const deviceInfo = req.headers['user-agent'] || 'N/A';

        acceptance = await RuleAcceptance.create({
            employeeId,
            rulesVersion: currentVersion,
            accepted: true,
            acceptedAt: new Date(),
            ipAddress,
            deviceInfo,
            subdomain
        });
    }

    // Update worker status with new version
    await Worker.findByIdAndUpdate(employeeId, { acceptedRulesVersion: currentVersion });

    res.status(200).json({ success: true, message: 'Rules accepted successfully', data: acceptance });
});

// @desc    Get admin rules statistics
// @route   GET /api/rules/admin/dashboard
// @access  Private (Admin only)
const getAdminDashboardStats = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    const settings = await Settings.findOne({ subdomain });
    const currentVersion = settings?.rulesConfiguration?.currentVersion || '1.0';
    const lastUpdated = settings?.lastUpdated || settings?.updatedAt || new Date();

    const totalRules = await Rule.countDocuments({ subdomain });
    const activeRulesCount = await Rule.countDocuments({ subdomain, status: 'active' });

    // Count active workers
    const totalWorkers = await Worker.countDocuments({ subdomain, status: 'Active' });

    // Count who has accepted the current version
    const acceptedWorkersCount = await Worker.countDocuments({
        subdomain,
        status: 'Active',
        acceptedRulesVersion: currentVersion
    });

    const pendingWorkersCount = Math.max(0, totalWorkers - acceptedWorkersCount);
    const acceptanceRate = totalWorkers > 0 ? (acceptedWorkersCount / totalWorkers) * 100 : 0;

    res.json({
        success: true,
        stats: {
            totalRules,
            activeRulesCount,
            totalWorkers,
            acceptedWorkersCount,
            pendingWorkersCount,
            acceptanceRate: parseFloat(acceptanceRate.toFixed(2)),
            currentVersion,
            lastUpdated
        }
    });
});

// @desc    Get rules acceptance list (for monitoring)
// @route   GET /api/rules/acceptances
// @access  Private (Admin only)
const getAcceptanceMonitoringList = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    const settings = await Settings.findOne({ subdomain });
    const currentVersion = settings?.rulesConfiguration?.currentVersion || '1.0';

    const workers = await Worker.find({ subdomain, status: 'Active' })
        .populate('department', 'name')
        .select('name username email phoneNumber department acceptedRulesVersion');

    const acceptances = await RuleAcceptance.find({ subdomain, rulesVersion: currentVersion });

    // Map of workerId -> acceptance record
    const acceptanceMap = new Map(acceptances.map(a => [a.employeeId.toString(), a]));

    const reports = workers.map(w => {
        const hasAccepted = w.acceptedRulesVersion === currentVersion;
        const record = acceptanceMap.get(w._id.toString());
        return {
            _id: w._id,
            name: w.name,
            username: w.username,
            email: w.email || 'N/A',
            phoneNumber: w.phoneNumber || 'N/A',
            department: w.department ? w.department.name : 'Unassigned',
            acceptedStatus: hasAccepted ? 'Accepted' : 'Pending',
            acceptedRulesVersion: w.acceptedRulesVersion,
            acceptedAt: record ? record.acceptedAt : null,
            ipAddress: record ? record.ipAddress : 'N/A',
            deviceInfo: record ? record.deviceInfo : 'N/A'
        };
    });

    res.json({ success: true, currentVersion, acceptances: reports });
});

// @desc    Send reminder (Notification + Web Push) to pending employee(s)
// @route   POST /api/rules/remind
// @access  Private (Admin only)
const sendReminder = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;
    const { employeeId } = req.body;

    const settings = await Settings.findOne({ subdomain });
    const currentVersion = settings?.rulesConfiguration?.currentVersion || '1.0';

    if (employeeId) {
        // Send single reminder
        const worker = await Worker.findOne({ _id: employeeId, subdomain, status: 'Active' });
        if (!worker) {
            res.status(404);
            throw new Error('Active worker not found');
        }

        if (worker.acceptedRulesVersion === currentVersion) {
            res.status(400);
            throw new Error('Worker has already accepted the current version of rules');
        }

        await sendNotification({
            userId: worker._id,
            userModel: 'Worker',
            subdomain,
            title: '⚠️ Action Required: Accept Rules',
            message: `Please review and accept the updated company rules and regulations (v${currentVersion}).`,
            type: 'rules',
            link: '/rules'
        });

        res.json({ success: true, message: `Reminder sent to ${worker.name}` });
    } else {
        // Send to all pending employees
        const workers = await Worker.find({
            subdomain,
            status: 'Active',
            acceptedRulesVersion: { $ne: currentVersion }
        });

        let count = 0;
        for (const worker of workers) {
            await sendNotification({
                userId: worker._id,
                userModel: 'Worker',
                subdomain,
                title: '⚠️ Action Required: Accept Rules',
                message: `Please review and accept the updated company rules and regulations (v${currentVersion}).`,
                type: 'rules',
                link: '/rules'
            });
            count++;
        }

        res.json({ success: true, message: `Reminders sent to ${count} pending employees` });
    }
});

// @desc    Create a new rule
// @route   POST /api/rules
// @access  Private (Admin only)
const createRule = asyncHandler(async (req, res) => {
    const { title, category, content, severity, changeLog, isMajor } = req.body;
    const subdomain = req.user.subdomain;

    if (!title || !category || !content) {
        res.status(400);
        throw new Error('Title, category, and content are required');
    }

    let settings = await Settings.findOne({ subdomain });
    if (!settings) {
        settings = await Settings.create({ subdomain });
    }

    let oldVersion = settings.rulesConfiguration?.currentVersion || '1.0';
    let newVersion = oldVersion;

    if (isMajor === 'true' || isMajor === true) {
        const parts = oldVersion.split('.');
        const major = parseInt(parts[0], 10) || 1;
        newVersion = `${major + 1}.0`;

        settings.rulesConfiguration.currentVersion = newVersion;
        settings.lastUpdated = Date.now();
        await settings.save();
    }

    const attachments = [];
    if (req.files) {
        req.files.forEach(file => {
            attachments.push(`/uploads/rules/${file.filename}`);
        });
    } else if (req.file) {
        attachments.push(`/uploads/rules/${req.file.filename}`);
    }

    const rule = await Rule.create({
        title,
        category,
        content,
        severity: severity || 'medium',
        version: newVersion,
        status: 'active',
        changeLog: changeLog || '',
        attachments,
        subdomain,
        createdBy: req.user._id
    });

    // Notify employees if autoNotify is true
    if (settings.rulesConfiguration.autoNotify) {
        const workers = await Worker.find({ subdomain, status: 'Active' });
        for (const worker of workers) {
            await sendNotification({
                userId: worker._id,
                userModel: 'Worker',
                subdomain,
                title: isMajor === 'true' || isMajor === true ? '⚠️ Major Rules Update' : '📘 New Rules Added',
                message: `Company Rules & Regulations have been updated (v${newVersion}).`,
                type: 'rules',
                link: '/rules'
            });
        }
    }

    res.status(201).json({ success: true, data: rule, version: newVersion });
});

// @desc    Update a rule
// @route   PUT /api/rules/:id
// @access  Private (Admin only)
const updateRule = asyncHandler(async (req, res) => {
    const { title, category, content, severity, changeLog, isMajor } = req.body;
    const subdomain = req.user.subdomain;

    let rule = await Rule.findById(req.params.id);
    if (!rule) {
        res.status(404);
        throw new Error('Rule not found');
    }

    if (rule.subdomain !== subdomain) {
        res.status(403);
        throw new Error('Not authorized to access this rule');
    }

    let settings = await Settings.findOne({ subdomain });
    if (!settings) {
        settings = await Settings.create({ subdomain });
    }

    let oldVersion = settings.rulesConfiguration?.currentVersion || '1.0';
    let newVersion = oldVersion;

    if (isMajor === 'true' || isMajor === true) {
        const parts = oldVersion.split('.');
        const major = parseInt(parts[0], 10) || 1;
        newVersion = `${major + 1}.0`;

        settings.rulesConfiguration.currentVersion = newVersion;
        settings.lastUpdated = Date.now();
        await settings.save();
    }

    rule.title = title !== undefined ? title : rule.title;
    rule.category = category !== undefined ? category : rule.category;
    rule.content = content !== undefined ? content : rule.content;
    rule.severity = severity !== undefined ? severity : rule.severity;
    rule.changeLog = changeLog !== undefined ? changeLog : rule.changeLog;
    rule.version = newVersion;
    rule.updatedBy = req.user._id;

    if (req.files) {
        req.files.forEach(file => {
            rule.attachments.push(`/uploads/rules/${file.filename}`);
        });
    } else if (req.file) {
        rule.attachments.push(`/uploads/rules/${req.file.filename}`);
    }

    await rule.save();

    // Notify employees if version was bumped and autoNotify is true
    if ((isMajor === 'true' || isMajor === true) && settings.rulesConfiguration.autoNotify) {
        const workers = await Worker.find({ subdomain, status: 'Active' });
        for (const worker of workers) {
            await sendNotification({
                userId: worker._id,
                userModel: 'Worker',
                subdomain,
                title: '⚠️ Major Rules Update',
                message: `Company Rules & Regulations have been updated (v${newVersion}).`,
                type: 'rules',
                link: '/rules'
            });
        }
    }

    res.json({ success: true, data: rule, version: newVersion });
});

// @desc    Archive a rule (changes status to archived)
// @route   DELETE /api/rules/:id
// @access  Private (Admin only)
const deleteRule = asyncHandler(async (req, res) => {
    const rule = await Rule.findById(req.params.id);
    if (!rule) {
        res.status(404);
        throw new Error('Rule not found');
    }

    if (rule.subdomain !== req.user.subdomain) {
        res.status(403);
        throw new Error('Not authorized to access this rule');
    }

    rule.status = 'archived';
    await rule.save();

    res.json({ success: true, message: 'Rule archived successfully' });
});

// @desc    Update Rules Configuration
// @route   PUT /api/rules/admin/config
// @access  Private (Admin only)
const updateRulesConfig = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    let settings = await Settings.findOne({ subdomain });
    if (!settings) {
        settings = await Settings.create({ subdomain });
    }

    const {
        forceAcceptance,
        scrollValidation,
        allowPdfDownload,
        requireCheckbox,
        autoNotify,
        gracePeriodDays,
        mobileAcceptance
    } = req.body;

    if (forceAcceptance !== undefined) settings.rulesConfiguration.forceAcceptance = forceAcceptance;
    if (scrollValidation !== undefined) settings.rulesConfiguration.scrollValidation = scrollValidation;
    if (allowPdfDownload !== undefined) settings.rulesConfiguration.allowPdfDownload = allowPdfDownload;
    if (requireCheckbox !== undefined) settings.rulesConfiguration.requireCheckbox = requireCheckbox;
    if (autoNotify !== undefined) settings.rulesConfiguration.autoNotify = autoNotify;
    if (gracePeriodDays !== undefined) settings.rulesConfiguration.gracePeriodDays = gracePeriodDays;
    if (mobileAcceptance !== undefined) settings.rulesConfiguration.mobileAcceptance = mobileAcceptance;

    settings.lastUpdated = Date.now();
    await settings.save();

    res.json({ success: true, data: settings.rulesConfiguration });
});

// @desc    Quick rules handshake status endpoint
// @route   GET /api/rules/status
// @access  Private (Worker & Admin)
const getRulesStatus = asyncHandler(async (req, res) => {
    const subdomain = req.user.subdomain;

    // Only check rules for workers
    if (req.user.role !== 'worker') {
        return res.json({ rulesAcceptanceRequired: false });
    }

    // Auto-seed default rules if none exist yet (handles live server first-login)
    await initializeDefaultRules(subdomain);

    const settings = await Settings.findOne({ subdomain });
    if (!settings || !settings.rulesConfiguration || !settings.rulesConfiguration.forceAcceptance) {
        return res.json({ rulesAcceptanceRequired: false });
    }

    // If there are no active rules in the database, don't require acceptance
    const activeRulesCount = await Rule.countDocuments({ subdomain, status: 'active' });
    if (activeRulesCount === 0) {
        return res.json({ rulesAcceptanceRequired: false });
    }

    const currentVersion = settings.rulesConfiguration.currentVersion || '1.0';
    const acceptedVersion = req.user.acceptedRulesVersion || '0';

    if (acceptedVersion === currentVersion) {
        return res.json({ rulesAcceptanceRequired: false });
    }

    // Check grace period
    const gracePeriodDays = settings.rulesConfiguration.gracePeriodDays || 0;
    if (gracePeriodDays > 0 && settings.lastUpdated) {
        const timeDiff = Date.now() - new Date(settings.lastUpdated).getTime();
        const daysDiff = timeDiff / (1000 * 3600 * 24);
        if (daysDiff <= gracePeriodDays) {
            return res.json({ rulesAcceptanceRequired: false, gracePeriodActive: true, daysRemaining: Math.ceil(gracePeriodDays - daysDiff) });
        }
    }

    res.json({ rulesAcceptanceRequired: true, currentVersion });
});

module.exports = {
    getActiveRules,
    getRulesHistory,
    getMyAcceptances,
    submitAcceptance,
    getAdminDashboardStats,
    getAcceptanceMonitoringList,
    sendReminder,
    createRule,
    updateRule,
    deleteRule,
    updateRulesConfig,
    getRulesStatus
};
