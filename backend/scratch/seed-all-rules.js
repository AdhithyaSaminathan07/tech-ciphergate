/**
 * CIPHERGATE — Full Company Rules Seed Script
 * Seeds all 21 official company rules for the arun-tv subdomain.
 * Run with: node backend/scratch/seed-all-rules.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Rule = require('../models/Rule');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

// ─── ALL 21 RULES ────────────────────────────────────────────────────────────
const RULES_DATA = [
    {
        title: 'Attendance & Office Hours',
        category: 'Attendance & Timings',
        severity: 'high',
        content: `
<p><strong>Rule 1 — Office Hours Punctuality</strong></p>
<p>Be punctual during office hours from <strong>9:00 AM to 7:00 PM</strong> (Full-time) / <strong>3:00 PM – 7:00 PM</strong> (Part-time batch).</p>
<p>Consistent punctuality is a fundamental requirement and directly impacts team productivity and project delivery timelines.</p>

<p><strong>Rule 5 — Daily Punch In / Punch Out</strong></p>
<p>Properly <strong>Punch In and Punch Out every day</strong> without exception. Your attendance record is linked to your salary computation and performance metrics.</p>

<p><strong>Rule 6 — Incorrect Punch-Out Time</strong></p>
<p>Failure to Punch Out with the correct time will be officially noted and may result in attendance discrepancies and salary adjustments.</p>
        `
    },
    {
        title: 'Study Hours Policy',
        category: 'Attendance & Timings',
        severity: 'high',
        content: `
<p><strong>Rule 2 — Mandatory Study Hours</strong></p>
<p>Attend and focus during study hours:</p>
<ul>
  <li><strong>Full-time batch:</strong> 9:00 AM – 11:00 AM</li>
  <li><strong>Part-time batch:</strong> 3:00 PM – 4:00 PM</li>
</ul>
<p>Participation in study hours is <strong>non-negotiable</strong>. This time is dedicated to skill development and is a core component of your growth path at Tech Vaseegrah.</p>

<p><strong>Rule 4 — Silence During Study & Work Hours</strong></p>
<p>Maintain silence during both study hours and working hours. Unnecessary conversations, loud discussions, or distractions are strictly prohibited during these periods to ensure a focused and productive environment.</p>
        `
    },
    {
        title: 'Leave & Permission Policy',
        category: 'Leave Policy',
        severity: 'critical',
        content: `
<p><strong>Rule 3 — Multi-Tiered Attendance Leave Policy</strong></p>
<p>To maintain operational efficiency, all leave and permission requests submitted via the <strong>Ciphergate application</strong> are subject to a multi-tiered attendance verification process.</p>

<p>A <strong>2X leave deduction</strong> will be automatically applied if your request coincides with <em>any one</em> of the following conditions:</p>
<ul>
  <li>Company-wide attendance rate falls <strong>below 80%</strong></li>
  <li>Departmental attendance rate falls <strong>below 80%</strong></li>
  <li>Your individual cumulative attendance record falls <strong>below 90%</strong></li>
</ul>

<p>Employees are advised to consult their <strong>real-time attendance dashboard</strong> within the application before submitting any requests. The fulfillment of any of these three conditions will automatically trigger the double-deduction penalty to ensure essential staffing levels are preserved.</p>

<p><strong>Rule 7 — Unauthorized Absence</strong></p>
<p>Taking leave without informing or without submitting a proper leave request through the Ciphergate application is <strong>strictly prohibited</strong> and will result in disciplinary action.</p>
        `
    },
    {
        title: 'Workplace Hygiene & Cleanliness',
        category: 'General Info',
        severity: 'medium',
        content: `
<p><strong>Rule 8 — No Eating During Office Hours</strong></p>
<p>Do not eat during office hours. Food consumption must be restricted to designated break times and areas only.</p>

<p><strong>Rule 9 — Waste Disposal</strong></p>
<p>After eating, dispose of <strong>all waste in the dustbin only</strong>. Littering or leaving food waste at your workstation is not acceptable. Keep your surroundings clean at all times.</p>

<p><strong>Rule 10 — Workspace Neatness</strong></p>
<p>Keep your workspace <strong>neat and clean at all times</strong>. A tidy workspace reflects professional discipline and creates a positive environment for the entire team.</p>

<p><strong>Rule 11 — Daily 5-Minute Cleaning (4:55 PM – 5:00 PM)</strong></p>
<p>Clean your area during the mandatory <strong>5-minute cleaning session from 4:55 PM to 5:00 PM every day without fail</strong>. This is a team responsibility and must not be skipped.</p>

<p><strong>Rule 15 — Washroom Etiquette</strong></p>
<p>Use the washroom neatly. Always <strong>switch off lights and taps properly</strong> after use. Maintaining hygiene in shared spaces is a collective responsibility.</p>
        `
    },
    {
        title: 'End-of-Day Responsibilities',
        category: 'General Info',
        severity: 'medium',
        content: `
<p><strong>Rule 12 — Power-Off Protocol</strong></p>
<p>After working hours, ensure all equipment is properly shut down. Before leaving, switch off the following:</p>
<ul>
  <li>Personal Computer (PC)</li>
  <li>Lights</li>
  <li>Fan</li>
  <li>Air Conditioning (AC)</li>
</ul>
<p>This is both a safety requirement and an energy conservation practice.</p>

<p><strong>Rule 17 — Before Leaving Checklist</strong></p>
<p>Before leaving the office every day:</p>
<ul>
  <li>Rearrange your chair properly</li>
  <li>Ensure your workspace is tidy and organized</li>
  <li>Verify all your items are stored safely</li>
</ul>
<p>The office space is a shared professional environment that reflects our team culture.</p>
        `
    },
    {
        title: 'Tech Mobile & Equipment Rules',
        category: 'General Info',
        severity: 'medium',
        content: `
<p><strong>Rule 13 — Tech Mobile Response</strong></p>
<p>Attend the <strong>Tech Mobile immediately</strong> when it rings. Missing calls on the official company mobile is unacceptable. Every call may carry urgent client or team communications.</p>

<p><strong>Rule 16 — Tech Mobile Charging Responsibility</strong></p>
<p>The Tech Mobile must be <strong>charged regularly</strong>. Whoever arrives first to the office each day is responsible for ensuring the device is connected to charge. A dead phone means missed opportunities.</p>
        `
    },
    {
        title: 'Communication & Reporting',
        category: 'General Info',
        severity: 'medium',
        content: `
<p><strong>Rule 14 — Daily Task Updates (WhatsApp Group)</strong></p>
<p>Post the <strong>daily tasks completed</strong> in the dedicated WhatsApp group every day before end of shift. This keeps the entire team aligned on project progress and individual accountability.</p>

<p><strong>Rule 18 — Community Group Updates</strong></p>
<p>Post daily updates in your respective groups in the <strong>Tech Vaseegrah WhatsApp Community</strong>. Each team member is responsible for their group's daily status update. Consistency and clarity in updates is expected.</p>
        `
    },
    {
        title: 'Employment Growth Policy',
        category: 'General Info',
        severity: 'high',
        content: `
<p><strong>Rule 19 — Mandatory Career Progression Path</strong></p>
<p>Every individual joining Tech Vaseegrah must follow the <strong>mandatory career progression path</strong>:</p>
<ol>
  <li><strong>Intern</strong> — Entry level with structured learning objectives</li>
  <li><strong>Employee</strong> — Full accountability and project ownership</li>
  <li><strong>Developer</strong> — Advanced technical and leadership responsibilities</li>
</ol>
<p>Progression through each stage is achieved through <strong>consistent performance and proven skills</strong>. This structured growth process is mandatory and forms the foundation of career advancement at Tech Vaseegrah. There are no shortcuts or exceptions to this framework.</p>
        `
    },
    {
        title: 'Resignation & Transition Policy',
        category: 'Leave Policy',
        severity: 'critical',
        content: `
<p><strong>Rule 20 — Formal Notice Period & Knowledge Transfer</strong></p>
<p>To ensure Tech Vaseegrah's innovation remains uninterrupted, a <strong>one-month formal notice period is mandatory</strong> for all departures.</p>

<p>During this notice month, the departing employee must:</p>
<ul>
  <li>Complete a <strong>full knowledge transfer</strong> to their team</li>
  <li>Document all ongoing projects and handover responsibilities</li>
  <li>Ensure project continuity for their replacements</li>
</ul>

<p>Full compliance with this transition period is a <strong>prerequisite for a formal exit</strong>. Failure to provide the required notice or to successfully complete the knowledge transfer will result in:</p>
<ol>
  <li>The <strong>forfeiture</strong> of any accumulated balances within the 10% Employee Wallet</li>
  <li>The <strong>withholding</strong> of the Experience Certificate and formal Relieving Letter</li>
  <li><strong>Disqualification</strong> from any pending profit-sharing payouts or final settlements</li>
</ol>
        `
    },
    {
        title: 'Meeting Rules & Approval Policy',
        category: 'Ethics & Code of Conduct',
        severity: 'high',
        content: `
<p><strong>Rule 21 — Formal Meeting Approval Process</strong></p>
<p>No meeting is permitted <strong>without prior formal approval from the Directors</strong>. All meeting requests must be submitted and approved before scheduling.</p>

<p><strong>Approved Meeting Guidelines:</strong></p>
<ul>
  <li>All approved meetings must be conducted in the <strong>designated meeting space</strong></li>
  <li>Meetings must <strong>not</strong> be held at the workplace (currently the Community Garden)</li>
  <li>Attendees must follow the agreed agenda and time duration</li>
</ul>

<p><strong>Consequences for Unauthorized Meetings:</strong></p>
<p>Any meeting conducted without formal Director approval will result in <strong>disciplinary action against both the organiser and all participants</strong>, regardless of the nature or purpose of the meeting.</p>
        `
    },
    {
        title: 'Non-Compliance Penalties & Enforcement',
        category: 'Ethics & Code of Conduct',
        severity: 'critical',
        content: `
<p><strong>General Non-Compliance Penalty</strong></p>
<p>All team members must strictly follow the rules outlined in this handbook. Non-adherence to any of the above rules will result in:</p>
<ul>
  <li>A fine of <strong>₹500</strong>, or</li>
  <li><strong>Job termination</strong>, depending on the severity and frequency of the violation</li>
</ul>

<p><strong>Rules Implementation Accountability</strong></p>
<p>If a person or a team is assigned to <strong>implement or enforce</strong> any of the above rules and they fail to execute this responsibility — whatsoever be the reason — it will result in:</p>
<ul>
  <li>A fine of <strong>₹2,000</strong>, or</li>
  <li><strong>Job termination</strong></li>
</ul>

<p>Accountability is not optional. Every team member is expected to uphold and enforce these standards with full professionalism and diligence.</p>
        `
    }
];

// ─── SEED FUNCTION ────────────────────────────────────────────────────────────
async function seedRules() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const subdomain = 'arun-tv';
        const VERSION = '1.0';

        // 1. Find admin
        let admin = await Admin.findOne({ subdomain });
        if (!admin) {
            console.error('❌ No admin found for subdomain:', subdomain);
            console.error('Please create an admin account first by logging into the admin panel.');
            process.exit(1);
        }
        console.log(`✅ Found admin: ${admin.username}`);

        // 2. Clear old rules for this subdomain
        const deleted = await Rule.deleteMany({ subdomain });
        console.log(`🗑️  Cleared ${deleted.deletedCount} existing rules`);

        // 3. Insert all rules
        const ruleDocs = RULES_DATA.map(r => ({
            ...r,
            version: VERSION,
            status: 'active',
            changeLog: 'Initial official company rulebook — Tech Vaseegrah',
            attachments: [],
            subdomain,
            createdBy: admin._id
        }));

        const inserted = await Rule.insertMany(ruleDocs);
        console.log(`✅ Inserted ${inserted.length} rules successfully`);

        // Log each rule inserted
        inserted.forEach((r, i) => {
            console.log(`   ${i + 1}. [${r.category}] ${r.title} (${r.severity})`);
        });

        // 4. Update Settings for the subdomain
        let settings = await Settings.findOne({ subdomain });
        if (!settings) {
            settings = new Settings({ subdomain });
        }
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
        console.log(`✅ Settings updated for ${subdomain} — version ${VERSION}, forceAcceptance: ON`);

        // 5. Reset ALL workers in subdomain so they must re-accept
        const workerUpdate = await Worker.updateMany(
            { subdomain },
            { $set: { acceptedRulesVersion: '0' } }
        );
        console.log(`✅ Reset ${workerUpdate.modifiedCount} workers to require rule acceptance`);

        console.log('\n🎉 SEED COMPLETE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Subdomain  : ${subdomain}`);
        console.log(`   Version    : ${VERSION}`);
        console.log(`   Rules      : ${inserted.length} active rules`);
        console.log(`   Workers    : ${workerUpdate.modifiedCount} reset for acceptance`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nNext: Log in as a worker — the Rules Acceptance screen will appear.');

    } catch (err) {
        console.error('❌ Seed error:', err.message);
        console.error(err.stack);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

seedRules();
