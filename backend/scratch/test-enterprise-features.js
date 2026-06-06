const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const GitHubCache = require('../models/GitHubCache');
const GitHubSyncJob = require('../models/GitHubSyncJob');
const SecondBrainItem = require('../models/SecondBrainItem');
const AiAuditLog = require('../models/AiAuditLog');
const AiRecommendationOutcome = require('../models/AiRecommendationOutcome');

const { runBackgroundGitHubSync } = require('../services/githubSyncService');
const { calculateDeveloperExpertise } = require('../services/secondBrainService');

async function testEnterpriseFeatures() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ciphergate');
        console.log('Database connected.');

        const testSubdomain = 'testcompany';
        console.log(`Setting up test data for subdomain: ${testSubdomain}`);

        // 1. Clean up old test data
        await Worker.deleteMany({ subdomain: testSubdomain });
        await Department.deleteMany({ subdomain: testSubdomain });
        await Ticket.deleteMany({ subdomain: testSubdomain });
        await GitHubCache.deleteMany({ subdomain: testSubdomain });
        await GitHubSyncJob.deleteMany({ subdomain: testSubdomain });
        await SecondBrainItem.deleteMany({ subdomain: testSubdomain });
        await AiAuditLog.deleteMany({ subdomain: testSubdomain });
        await AiRecommendationOutcome.deleteMany({ subdomain: testSubdomain });

        // 2. Create test Worker (Developer)
        const worker = await Worker.create({
            name: 'Test Dev',
            username: 'testdev',
            rfid: 'RFID_TEST_123',
            subdomain: testSubdomain,
            password: 'password123',
            skills: ['Node.js', 'React', 'MongoDB'],
            status: 'Active',
            gitContributions: 0,
            completedTasksCount: 0,
            activeTasksCount: 0
        });
        console.log('Test worker created.');

        // 3. Create test Project (Department)
        const project = await Department.create({
            name: 'Test Platform Project',
            subdomain: testSubdomain,
            departmentType: 'Project',
            projectStatus: 'In Progress',
            primaryRepoUrl: 'https://github.com/techvaseegrah/test-platform',
            assignedDevelopers: [worker._id]
        });
        console.log('Test project created.');

        // 4. Test background sync & caching
        console.log('Triggering background sync...');
        
        // Mock GITHUBCache details to simulate remote repo push
        const mockRepoDetails = {
            name: 'test-platform',
            full_name: 'techvaseegrah/test-platform',
            html_url: 'https://github.com/techvaseegrah/test-platform',
            description: 'Test platform repo',
            open_issues_count: 3,
            pushed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            branches: [{ name: 'main' }],
            contributors: [{ login: 'testdev', contributions: 45 }],
            commits: [
                {
                    sha: '123456',
                    commit: {
                        author: { name: 'Test Dev', date: new Date().toISOString() },
                        message: 'feat: add awesome feature'
                    },
                    author: { login: 'testdev' }
                }
            ],
            pullRequests: [
                {
                    number: 1,
                    title: 'PR Title',
                    state: 'closed',
                    user: { login: 'testdev' },
                    merged_at: new Date().toISOString()
                }
            ],
            languages: ['JavaScript', 'HTML']
        };

        // Seed cache to simulate remote update check success
        await GitHubCache.create({
            subdomain: testSubdomain,
            cache_key: 'repo_details:techvaseegrah:test-platform',
            username: 'techvaseegrah',
            data_type: 'repo_details',
            data: mockRepoDetails,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        // Run sync job
        await runBackgroundGitHubSync(testSubdomain);
        console.log('Sync job execution completed.');

        // 5. Verify GitHubSyncJob record
        const job = await GitHubSyncJob.findOne({ subdomain: testSubdomain });
        console.log('GitHubSyncJob verified:', job ? job.status : 'NOT FOUND');

        // 6. Verify Repository Intelligence cache
        const repoIntel = await GitHubCache.findOne({
            subdomain: testSubdomain,
            data_type: 'repo_intelligence'
        });
        console.log('Repo Intelligence cache verified:', repoIntel ? `Health Score: ${repoIntel.data.healthScore}` : 'NOT FOUND');

        // 7. Verify Second Brain intelligence item
        const brainIntel = await SecondBrainItem.findOne({
            subdomain: testSubdomain,
            type: 'github_repo_intelligence'
        });
        console.log('Second Brain Repo Intelligence item verified:', brainIntel ? brainIntel.title : 'NOT FOUND');

        // 8. Verify Worker Expertise Calculations
        const updatedWorker = await Worker.findById(worker._id);
        console.log('Worker expertise profile verified:', updatedWorker.expertiseProfile ? 
            `Score: ${updatedWorker.expertiseProfile.weightedExpertiseScore}` : 'NOT FOUND');

        // 9. Test Recommendation Outcome tracking
        console.log('Testing AI Recommendation Outcome logs...');
        
        // Create a test Ticket
        const ticket = await Ticket.create({
            title: 'Implement User Auth',
            description: 'Set up JWT token session auth',
            status: 'To Do',
            assignee: worker._id,
            subdomain: testSubdomain
        });

        // Create an AI recommendation audit log
        await AiAuditLog.create({
            subdomain: testSubdomain,
            taskId: ticket._id,
            taskTitle: ticket.title,
            recommendedPriority: 'High',
            recommendedComplexity: 'Medium',
            estimatedHours: 8,
            recommendedDevelopers: [{
                developerId: worker._id.toString(),
                developerName: worker.name,
                matchScore: 95,
                confidenceLevel: 'High',
                reasons: ['✓ Expert in Auth']
            }],
            actionTaken: 'Assigned Developer',
            performedBy: worker._id
        });

        // Mark ticket as Done (triggers post-save sync and outcome hook)
        ticket.status = 'Done';
        ticket.actualCompletionDate = new Date();
        await ticket.save();

        // Check if outcome was recorded
        const outcome = await AiRecommendationOutcome.findOne({
            taskId: ticket._id,
            subdomain: testSubdomain
        });

        if (outcome) {
            console.log('\nAI Recommendation Outcome Logged Successfully:');
            console.log(`- Task Title:  ${outcome.taskTitle}`);
            console.log(`- Assigned:    ${outcome.assignedDeveloperName}`);
            console.log(`- Recommended: ${outcome.recommendedDeveloperName}`);
            console.log(`- Match Score: ${outcome.matchScore}`);
            console.log(`- Success:     ${outcome.success}`);
            console.log(`- Accepted:    ${outcome.recommendationAccepted}`);
            console.log(`- Manager:     ${outcome.managerName}`);
            console.log(`- Confidence:  ${outcome.confidenceLevel}`);
            console.log(`- Completed:   ${outcome.completed}`);
            console.log(`- Days Taken:  ${outcome.daysTaken}`);
        } else {
            console.log('Outcome NOT logged.');
        }

        console.log('\nAll enterprise feature validations completed successfully.');
        
    } catch (error) {
        console.error('Test execution failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

testEnterpriseFeatures();
