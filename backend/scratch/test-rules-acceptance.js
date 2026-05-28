const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Worker = require('../models/Worker');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const Rule = require('../models/Rule');
const RuleAcceptance = require('../models/RuleAcceptance');

async function runTests() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB successfully.');

        const subdomain = 'test-tenant';

        // Clean up any existing test data first
        await Worker.deleteMany({ username: 'test_rules_worker' });
        await Admin.deleteMany({ username: 'test_rules_admin' });
        await Settings.deleteOne({ subdomain });
        await Rule.deleteMany({ subdomain });
        await RuleAcceptance.deleteMany({ subdomain });

        console.log('\n--- 1. Set up Test Admin & Settings ---');
        const admin = await Admin.create({
            username: 'test_rules_admin',
            email: 'admin@test.com',
            password: 'password123',
            rfid: 'RFID_ADMIN_TEST',
            subdomain
        });
        console.log(`Created test admin: ${admin.username}`);

        let settings = await Settings.create({
            subdomain,
            rulesConfiguration: {
                forceAcceptance: true,
                scrollValidation: true,
                allowPdfDownload: true,
                requireCheckbox: true,
                autoNotify: false,
                gracePeriodDays: 0,
                currentVersion: '1.0'
            }
        });
        console.log(`Created settings for subdomain: ${subdomain}`);

        console.log('\n--- 2. Create Active Rule v1.0 ---');
        const rule1 = await Rule.create({
            title: 'Attendance Policy',
            category: 'General',
            content: '<p>You must check in by 9:00 AM.</p>',
            version: '1.0',
            status: 'active',
            severity: 'high',
            subdomain,
            createdBy: admin._id
        });
        console.log(`Created rule: "${rule1.title}" for version ${rule1.version}`);

        console.log('\n--- 3. Set up Test Worker ---');
        const worker = await Worker.create({
            name: 'Test Worker',
            username: 'test_rules_worker',
            password: 'password123',
            rfid: 'RFID_WORKER_TEST',
            subdomain,
            acceptedRulesVersion: '0'
        });
        console.log(`Created test worker: ${worker.username} with acceptedRulesVersion: "${worker.acceptedRulesVersion}"`);

        console.log('\n--- 4. Verify Worker Acceptance Check (Should be Required) ---');
        const checkStatus = (w, s) => {
            const currentV = s.rulesConfiguration.currentVersion;
            const acceptedV = w.acceptedRulesVersion;
            const force = s.rulesConfiguration.forceAcceptance;
            
            console.log(`Force Acceptance: ${force}`);
            console.log(`Current Version: "${currentV}"`);
            console.log(`Worker Accepted Version: "${acceptedV}"`);
            
            if (force && acceptedV !== currentV) {
                console.log('Result: ❌ RULES ACCEPTANCE REQUIRED!');
                return true;
            } else {
                console.log('Result: ✅ Worker is cleared to access dashboard.');
                return false;
            }
        };

        let requiresAcceptance = checkStatus(worker, settings);
        if (!requiresAcceptance) {
            throw new Error('Test failed: worker should require acceptance');
        }

        console.log('\n--- 5. Submit Worker Acceptance for v1.0 ---');
        const acceptanceLog = await RuleAcceptance.create({
            employeeId: worker._id,
            rulesVersion: settings.rulesConfiguration.currentVersion,
            accepted: true,
            ipAddress: '127.0.0.1',
            deviceInfo: 'Node.js Test Client',
            subdomain
        });
        console.log(`Created RuleAcceptance log for version: "${acceptanceLog.rulesVersion}"`);

        worker.acceptedRulesVersion = settings.rulesConfiguration.currentVersion;
        await worker.save();
        console.log(`Updated worker acceptedRulesVersion to: "${worker.acceptedRulesVersion}"`);

        console.log('\n--- 6. Verify Worker Acceptance Check (Should NOT be Required) ---');
        requiresAcceptance = checkStatus(worker, settings);
        if (requiresAcceptance) {
            throw new Error('Test failed: worker should NOT require acceptance now');
        }

        console.log('\n--- 7. Admin Publishes Major Rule Update (Bump to v2.0) ---');
        const oldVersion = settings.rulesConfiguration.currentVersion;
        const parts = oldVersion.split('.');
        const major = parseInt(parts[0], 10) || 1;
        const newVersion = `${major + 1}.0`;
        
        settings.rulesConfiguration.currentVersion = newVersion;
        settings.lastUpdated = Date.now();
        await settings.save();
        console.log(`Admin bumped settings currentVersion to: "${settings.rulesConfiguration.currentVersion}"`);

        const rule2 = await Rule.create({
            title: 'Attendance Policy Update',
            category: 'General',
            content: '<p>You must check in by 8:30 AM.</p>',
            version: newVersion,
            status: 'active',
            severity: 'critical',
            subdomain,
            createdBy: admin._id
        });
        console.log(`Created updated rule for version: "${rule2.version}"`);

        console.log('\n--- 8. Verify Worker Acceptance Check (Should be Required Again) ---');
        // Fetch updated worker
        const updatedWorker = await Worker.findById(worker._id);
        requiresAcceptance = checkStatus(updatedWorker, settings);
        if (!requiresAcceptance) {
            throw new Error('Test failed: worker should require acceptance after major update');
        }

        console.log('\n--- 9. Cleaning Up Mock Data ---');
        await Worker.deleteOne({ _id: worker._id });
        await Admin.deleteOne({ _id: admin._id });
        await Settings.deleteOne({ subdomain });
        await Rule.deleteMany({ subdomain });
        await RuleAcceptance.deleteMany({ subdomain });
        console.log('Cleanup completed successfully.');
        console.log('\n🎉 ALL BACKEND RULES VALIDATION TESTS PASSED!');

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Database disconnected.');
    }
}

runTests();
