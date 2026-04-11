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

    const app = express();

    const corsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:3000',
          'https://tvtasks.netlify.app',
          'https://techvaseegrah.ciphergate.in',
          'https://tech.ciphergate.in',
          'http://tech.ciphergate.in',
        ];
        const regex = /^http:\/\/.*\.localhost:3000$/; // Allow subdomains of localhost:3000

        if (!origin || allowedOrigins.includes(origin) || regex.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    };

    // Apply CORS middleware
    app.use(cors(corsOptions));

    // Handle preflight requests globally
    app.options('*', cors(corsOptions));

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Serve static files from uploads directory
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    const githubRoutes = require('./routes/githubRoutes');

    // Test App routes
    const testQuestionRoutes = require('./routes/testQuestionRoutes');
    const testRoutes = require('./routes/testRoutes');
    const learningTopicRoutes = require('./routes/learningTopicRoutes');
    const dailyTopicRoutes = require('./routes/dailyTopicRoutes');

    // Job routes
    const jobRoutes = require('./routes/jobRoutes');

    // Mount routes
    app.use('/api/gowhats', require('./routes/gowhatsRoutes'));
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
    app.use('/api/settings', settingsRoutes);
    app.use('/api/holidays', holidayRoutes);
    app.use('/api/fines', fineRoutes);
    app.use('/api/invoices', invoiceRoutes);
    app.use('/api/community-fund', communityFundRoutes); // ADD THIS
    app.use('/api/certificates', require('./routes/certificateRoutes'));
    app.use('/api/github', githubRoutes);


    // Test App routes
    app.use('/api/test/questions', testQuestionRoutes);
    app.use('/api/test/topics', learningTopicRoutes);
    app.use('/api/test', testRoutes);
    app.use('/api/daily-topics', dailyTopicRoutes);

    // Job routes
    app.use('/api/jobs', jobRoutes);

    // Route for checking API status
    app.get('/', (req, res) => {
      res.json({ message: 'Task Tracker API is running' });
    });

    // Initialize schedulers and cron jobs
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULERS === 'true') {
      console.log('🚀 Starting production schedulers...');

      // Initialize food request schedulers
      const { initializeFoodRequestSchedulers } = require('./schedulers/foodRequestScheduler');
      initializeFoodRequestSchedulers();

      // Initialize other cron jobs if they exist
      const { startCronJobs } = require('./services/cronJobs');
      startCronJobs();
    } else {
      console.log('⚠️ Schedulers disabled. Set NODE_ENV=production or ENABLE_SCHEDULERS=true to enable');
    }

    // Error handler (should be last)
    app.use(errorHandler);

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🌟 Server running on port ${PORT}`);
      console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
      console.log(`🗄️ Database: Connected successfully`);
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

// Trigger restart final
