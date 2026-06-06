/**
 * Check all tickets in DB — their status, subdomain, and Second Brain indexing state
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false, collection: 'tickets' }));
    const SecondBrainItem = mongoose.model('SecondBrainItem', new mongoose.Schema({}, { strict: false, collection: 'secondbrainitems' }));

    // All tickets in the DB grouped by subdomain + status
    console.log('\n=== All Tickets Grouped By Subdomain & Status ===');
    const ticketStats = await Ticket.aggregate([
        { $group: { _id: { subdomain: '$subdomain', status: '$status' }, count: { $sum: 1 } } },
        { $sort: { '_id.subdomain': 1 } }
    ]);
    ticketStats.forEach(t => {
        console.log(`  subdomain: "${t._id.subdomain}" | status: "${t._id.status}" | count: ${t.count}`);
    });

    // All "Done" tickets in arun-tv
    console.log('\n=== Done Tickets in arun-tv ===');
    const doneTickets = await Ticket.find({ subdomain: 'arun-tv', status: 'Done', isDeleted: { $ne: true } })
        .select('title status assignee team createdAt');
    console.log(`Total Done tickets: ${doneTickets.length}`);
    doneTickets.forEach(t => console.log(`  "${t.title}" | team: ${t.team || 'none'} | assignee: ${t.assignee || 'none'}`));

    // Are Done tickets indexed in Second Brain?
    console.log('\n=== Second Brain Items (type: ticket) across all subdomains ===');
    const brainTickets = await SecondBrainItem.find({ type: 'ticket' }).select('title subdomain');
    console.log(`Total: ${brainTickets.length}`);
    brainTickets.forEach(b => console.log(`  "${b.title}" | ${b.subdomain}`));

    await mongoose.connection.close();
}

run().catch(err => { console.error(err); process.exit(1); });
