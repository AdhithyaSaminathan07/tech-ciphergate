const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getLiveLeaderboard } = require('../controllers/githubController');
const Admin = require('../models/Admin');

async function test() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const admin21 = await Admin.findOne({ username: 'admin21' });

        if (admin21) {
            const req = { user: admin21.toObject() };
            req.user.role = 'admin';
            let responseData = null;
            const res = {
                json: (data) => { responseData = data; return res; },
                status: (code) => { return res; }
            };
            await getLiveLeaderboard(req, res);
            console.log('\n--- Direct Leaderboard Response for admin21 (arun-tv) ---');
            console.log('showingCached:', responseData?.showingCached);
            console.log('Contributors count:', responseData?.contributors?.length);
            console.log('Commits count:', responseData?.commits?.length);
            console.log('Pull Requests count:', responseData?.pullRequests?.length);
            if (responseData?.commits) {
                console.log('Commits is array:', Array.isArray(responseData.commits));
            }
        } else {
            console.log('admin21 not found.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

test().catch(console.error);
