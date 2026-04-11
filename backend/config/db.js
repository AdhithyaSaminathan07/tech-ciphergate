const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Ensure the URI is properly formatted
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    
    console.log('Attempting to connect to MongoDB...');
    
    // Log URI for debugging (without credentials in production)
    if (process.env.NODE_ENV !== 'production') {
      const maskedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
      console.log('MongoDB URI (masked):', maskedUri);
    }
    
    const conn = await mongoose.connect(mongoUri, {
      // Remove deprecated options
      // Add modern connection options
      serverSelectionTimeoutMS: 10000, // Increase timeout
      socketTimeoutMS: 45000,
      retryWrites: true,
      writeConcern: {
        w: 'majority'
      },
      // Add connection pool options
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    // Log additional error details for debugging
    console.error('Error name:', error.name);
    console.error('Full error details:', error);
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('This usually indicates network issues or incorrect cluster URL');
    } else if (error.name === 'MongoServerError' && error.message.includes('bad auth')) {
      console.error('Authentication failed. Please check your username and password.');
      console.error('Make sure your IP is whitelisted in MongoDB Atlas.');
      console.error('If your password contains special characters, they need to be URL encoded.');
    }
    
    // Don't exit the process here, let the application decide what to do
    throw error;
  }
};

module.exports = connectDB;