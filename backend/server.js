const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars first
dotenv.config();

// Enhanced error handling for database connection
const startServer = async () => {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully');

    // Run AWS SDK credentials startup check
    const awsService = require('./services/awsService');
    await awsService.checkAwsHealth();

    // Clean up mock AWS accounts on boot to enforce clean state
    const AwsAccount = require('./models/AwsAccount');
    await AwsAccount.deleteMany({
      $or: [
        { awsAccountId: { $regex: '^1111' } },
        { awsAccountId: { $regex: '^1234' } },
        { name: { $regex: 'CipherGate', $options: 'i' } }
      ]
    });
    console.log('🧹 Purged seeded/mock AWS accounts from database.');

    const app = express();

    const corsOptions = {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      credentials: true
    };

    // Apply CORS middleware
    app.use(cors(corsOptions));

    // Handle preflight requests globally
    app.options('*', cors(corsOptions));

    // Middleware
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Serve static files from uploads directory with proper headers
    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
      setHeaders: (res, path) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Cache-Control', 'public, max-age=31536000');
      }
    }));

    // Routes
    const gowhatsRoutes = require('./routes/gowhatsRoutes');
    const authRoutes = require('./routes/authRoutes');
    const attendanceRoutes = require('./routes/attedanceRoutes');
    const workerRoutes = require('./routes/workerRoutes');
    const adminRoutes = require('./routes/adminRoutes');
    const taskRoutes = require('./routes/taskRoutes');
    const topicRoutes = require('./routes/topicRoutes');
    const commentRoutes = require('./routes/commentRoutes');
    const leaveRoutes = require('./routes/leaveRoutes');
    const columnRoutes = require('./routes/columnRoutes');
    const departmentRoutes = require('./routes/departmentRoutes');
    const foodRequestRoutes = require('./routes/foodRequestRoutes');
    const notificationRoutes = require('./routes/notificationRoutes');
    const salaryRoutes = require('./routes/salaryRoutes');
    const settingsRoutes = require('./routes/settingsRoutes');
    const holidayRoutes = require('./routes/holidayRoutes');
    const fineRoutes = require('./routes/fineRoutes');
    const invoiceRoutes = require('./routes/invoiceRoutes');
    const communityFundRoutes = require('./routes/communityFundRoutes'); // ADD THIS
    const ticketRoutes = require('./routes/ticketRoutes');
    const githubRoutes = require('./routes/githubRoutes');
    const repoChatRoutes = require('./routes/repoChatRoutes');
    const exitManagementRoutes = require('./routes/exitManagementRoutes');
    const salesVelocityRoutes = require('./routes/salesVelocityRoutes');
    const instaxbotRoutes = require('./routes/instaxbotRoutes');
    const documentRoutes = require('./routes/documentRoutes');
    const aiRoutes = require('./routes/aiRoutes');
    const serverRoutes = require('./routes/serverRoutes');
    const webhookRoutes = require('./routes/webhookRoutes');

    // Test App routes
    const testQuestionRoutes = require('./routes/testQuestionRoutes');
    const testRoutes = require('./routes/testRoutes');
    const learningTopicRoutes = require('./routes/learningTopicRoutes');
    const dailyTopicRoutes = require('./routes/dailyTopicRoutes');

    // Job routes
    const jobRoutes = require('./routes/jobRoutes');

    // API Key routes
    const apiKeyRoutes = require('./routes/apiKeyRoutes');
    const apiRoutes = require('./routes/apiRoutes');

    // Mount routes
    app.use('/api/gowhats', gowhatsRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/attendance', attendanceRoutes);
    app.use('/api/workers', workerRoutes);
    app.use('/api/salary', salaryRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/tasks', taskRoutes);
    app.use('/api/topics', topicRoutes);
    app.use('/api/comments', commentRoutes);
    app.use('/api/leaves', leaveRoutes);
    app.use('/api/columns', columnRoutes);
    app.use('/api/departments', departmentRoutes);
    app.use('/api/food-requests', foodRequestRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/user-notifications', require('./routes/userNotificationRoutes'));
    app.use('/api/settings', settingsRoutes);
    app.use('/api/holidays', holidayRoutes);
    app.use('/api/fines', fineRoutes);
    app.use('/api/invoices', invoiceRoutes);
    app.use('/api/renewals', require('./routes/renewalRoutes')); // ADD THIS
    app.use('/api/community-fund', communityFundRoutes);
    app.use('/api/tickets', ticketRoutes);
    app.use('/api/certificates', require('./routes/certificateRoutes'));
    app.use('/api/github', githubRoutes);
    app.use('/api/github/repo-chat', repoChatRoutes);
    app.use('/api/exit-management', exitManagementRoutes);
    app.use('/api/sales-velocity', salesVelocityRoutes);
    app.use('/api/instaxbot', instaxbotRoutes);
    app.use('/api/rules', require('./routes/ruleRoutes'));
    app.use('/api/performance', require('./routes/performanceRoutes'));
    app.use('/api/documents', documentRoutes);
    app.use('/api/ai', aiRoutes);
    app.use('/api/server', serverRoutes);
    app.use('/api/webhook', webhookRoutes);


    // Test App routes
    app.use('/api/test/questions', testQuestionRoutes);
    app.use('/api/test/topics', learningTopicRoutes);
    app.use('/api/test', testRoutes);
    app.use('/api/daily-topics', dailyTopicRoutes);

    // Job routes
    app.use('/api/jobs', jobRoutes);

    // External API routes
    app.use('/api/admin/keys', apiKeyRoutes);
    app.use('/api/external', apiRoutes);

    // Route for checking API status
    app.get('/', (req, res) => {
      res.json({ message: 'Task Tracker API is running' });
    });

if (
  process.env.NODE_ENV === 'production' ||
  process.env.ENABLE_SCHEDULERS === 'true'
) {
  console.log('🚀 Starting production schedulers...');

  // Food scheduler
  const {
    initializeFoodRequestSchedulers,
  } = require('./schedulers/foodRequestScheduler');

  initializeFoodRequestSchedulers();

  // Existing cron jobs
  const { startCronJobs } = require('./services/cronJobs');
  startCronJobs();

  // Server cron jobs (Developer 2)
  const {
    initializeServerCronJobs,
  } = require('./services/serverCronJobs');

  initializeServerCronJobs();

} else {
  console.log(
    '⚠️ Schedulers disabled. Set NODE_ENV=production or ENABLE_SCHEDULERS=true to enable'
  );
}webhookRoutes.js

    // Error handler (should be last)
    app.use(errorHandler);

    const http = require('http');
    const server = http.createServer(app);
    const { init: initSocket } = require('./utils/socket');
    initSocket(server);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🌟 Server running on port ${PORT}`);
      console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
      console.log(`🗄️ Database: Connected successfully`);
      console.log(`🔌 Socket.io: Initialized`);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to database connection error:', error.message);
    console.error('🔧 Troubleshooting steps:');
    console.error('1. Verify your MongoDB Atlas credentials in the .env file');
    console.error('2. Check if your IP is whitelisted in MongoDB Atlas Network Access');
    console.error('3. Ensure your MongoDB user has proper permissions');
    console.error('4. If using special characters in password, URL encode them');
    console.error('5. Try creating a new database user with a simple password');
    console.error('6. Refer to MONGODB_TROUBLESHOOTING.md for detailed instructions');

    // Exit the process as we can't start the server without a database connection
    process.exit(1);
  }
};

// Start the server
startServer();

// Trigger restart final - Connection string updated
