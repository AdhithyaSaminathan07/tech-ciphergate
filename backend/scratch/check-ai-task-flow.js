/**
 * Check if specific tasks are in the DB, indexed in Second Brain,
 * and whether developer expertise reflects completion history.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false, collection: 'tickets' }));
    const SecondBrainItem = mongoose.model('SecondBrainItem', new mongoose.Schema({}, { strict: false, collection: 'secondbrainitems' }));
    const Worker = mongoose.model('Worker', new mongoose.Schema({}, { strict: false, collection: 'workers' }));
    const AiAuditLog = mongoose.model('AiAuditLog', new mongoose.Schema({}, { strict: false, collection: 'aiauditlogs' }));
    const AiOutcome = mongoose.model('AiOutcome', new mongoose.Schema({}, { strict: false, collection: 'airecommendationoutcomes' }));

    // 1. Find these specific tasks by searching title keywords
    const keywords = ['second brain', 'claude', 'api', 'task allocation', 'andrew'];
    console.log('\n=== Searching for Tasks Related to Second Brain / Claude / AI ===');
    const tickets = await Ticket.find({
        $or: keywords.map(k => ({ title: { $regex: k, $options: 'i' } }))
    }).select('title status assignee assignees subdomain createdAt updatedAt');
    console.log(`Found ${tickets.length} matching ticket(s):`);
    tickets.forEach(t => {
        console.log(`  [${t.status}] "${t.title}" | subdomain: ${t.subdomain} | assignee: ${t.assignee || 'none'}`);
    });

    // 2. Check Second Brain for ticket-type entries
    console.log('\n=== Second Brain Indexed Tickets (type: ticket) ===');
    const brainTickets = await SecondBrainItem.find({ type: 'ticket' }).select('title subdomain tags');
    console.log(`Total indexed tickets in Second Brain: ${brainTickets.length}`);
    brainTickets.forEach(b => {
        console.log(`  "${b.title}" | subdomain: ${b.subdomain}`);
    });

    // 3. Check worker expertise profiles
    console.log('\n=== Active Worker Expertise Profiles (arun-tv) ===');
    const workers = await Worker.find({ subdomain: 'arun-tv', status: 'Active' })
        .select('name username completedTasksCount activeTasksCount expertiseProfile');
    workers.forEach(w => {
        const exp = w.expertiseProfile || {};
        console.log(`  [${w.name}] tasks:${w.completedTasksCount || 0} | score:${exp.weightedExpertiseScore || 0} | commits:${exp.gitCommitsCount || 0} | PRs:${exp.gitPRsCount || 0}`);
    });

    // 4. Check AI audit logs
    console.log('\n=== AI Audit Logs (all) ===');
    const auditLogs = await AiAuditLog.find({}).select('taskTitle subdomain actionTaken createdAt').sort({ createdAt: -1 }).limit(10);
    console.log(`Total AI audit logs: ${auditLogs.length}`);
    auditLogs.forEach(a => {
        console.log(`  "${a.taskTitle}" | action: ${a.actionTaken} | subdomain: ${a.subdomain}`);
    });

    // 5. Check AI recommendation outcomes
    console.log('\n=== AI Recommendation Outcomes ===');
    const outcomes = await AiOutcome.find({}).select('taskTitle success recommendationAccepted subdomain');
    console.log(`Total outcomes tracked: ${outcomes.length}`);
    outcomes.forEach(o => {
        console.log(`  "${o.taskTitle}" | success:${o.success} | accepted:${o.recommendationAccepted}`);
    });

    // 6. Count Second Brain items by type
    console.log('\n=== Second Brain Item Counts By Type (arun-tv) ===');
    const brainStats = await SecondBrainItem.aggregate([
        { $match: { subdomain: 'arun-tv' } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    brainStats.forEach(s => console.log(`  type: "${s._id}" | count: ${s.count}`));

    await mongoose.connection.close();
}

run().catch(err => { console.error(err); process.exit(1); });
