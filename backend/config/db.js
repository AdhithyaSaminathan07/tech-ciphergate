const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS fallback to public resolvers to resolve Node.js/c-ares DNS issues on Windows
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9']);
  console.log('📡 DNS servers configured for reliable resolution (1.1.1.1, 8.8.8.8, 9.9.9.9)');
} catch (dnsErr) {
  console.warn('⚠️ Failed to set DNS servers, using system default:', dnsErr.message);
}

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
    
    // Audit index cache_key_1 to check for uniqueness mismatch
    try {
      const db = conn.connection.db;
      const collections = await db.listCollections({ name: 'githubcaches' }).toArray();
      if (collections.length > 0) {
        const githubCachesColl = db.collection('githubcaches');
        const indexes = await githubCachesColl.indexes();
        const hasCacheKeyIndex = indexes.find(idx => idx.name === 'cache_key_1');
        
        if (hasCacheKeyIndex && hasCacheKeyIndex.unique) {
          console.warn('========================================================================');
          console.warn('⚠️  CRITICAL DATABASE INDEX MISMATCH WARNING  ⚠️');
          console.warn('------------------------------------------------------------------------');
          console.warn('The legacy unique index "cache_key_1" was detected on "githubcaches".');
          console.warn('This index restricts cache keys globally and will cause duplicate key');
          console.warn('errors (E11000) when multiple subdomains attempt synchronization.');
          console.warn('RECOMMENDED ACTION: Run the index remediation script to drop it:');
          console.warn('  node scripts/remediate_github_cache_indexes.js');
          console.warn('========================================================================');
        }
      }
    } catch (idxErr) {
      console.error('❌ Failed to run startup index audit:', idxErr.message);
    }

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