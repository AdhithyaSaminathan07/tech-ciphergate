const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS fallback to public resolvers to resolve Node.js/c-ares DNS issues on Windows
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9']);
  console.log('📡 DNS servers configured for reliable resolution (1.1.1.1, 8.8.8.8, 9.9.9.9)');
} catch (dnsErr) {
  console.warn('⚠️ Failed to set DNS servers, using system default:', dnsErr.message);
}

/**
 * Strictly read-only startup audit for multi-session break attendance indexes.
 * Never drops, creates, or synchronizes production indexes.
 */
const auditAttendanceIndexes = async (db, logger = console) => {
  const result = {
    ok: true,
    collectionExists: false,
    legacyUniqueIndexes: [],
    hasMultiSessionIndex: false,
    warnings: []
  };

  if (!db || typeof db.listCollections !== 'function' || typeof db.collection !== 'function') {
    return result;
  }

  const attendanceCols = await db.listCollections({ name: 'attendances' }).toArray();
  if (!Array.isArray(attendanceCols) || attendanceCols.length === 0) {
    return result;
  }
  result.collectionExists = true;

  const attendancesColl = db.collection('attendances');
  const indexes = await attendancesColl.indexes();

  for (const idx of indexes) {
    if (!idx || !idx.unique || !idx.key || typeof idx.key !== 'object') continue;
    const keyFields = Object.keys(idx.key);
    const hasWorker = keyFields.includes('worker');
    const hasDate = keyFields.includes('date');
    const hasPunchType = keyFields.includes('punchType');
    const hasOutSessionId = keyFields.includes('outSessionId');
    const partialPunchType = idx.partialFilterExpression?.punchType;

    // Legacy incompatible unique index: enforces uniqueness per worker+date(+punchType) without outSessionId
    if (hasWorker && hasDate && !hasOutSessionId) {
      result.legacyUniqueIndexes.push({
        name: idx.name,
        key: idx.key,
        partialFilterExpression: idx.partialFilterExpression || null
      });
    }

    if (hasWorker && hasDate && hasPunchType && hasOutSessionId && partialPunchType === 'LUNCH_OUT') {
      result.hasMultiSessionIndex = true;
    }
  }

  if (result.legacyUniqueIndexes.length > 0 || !result.hasMultiSessionIndex) {
    result.ok = false;
    logger.warn('========================================================================');
    logger.warn('⚠️  ATTENDANCE MULTI-SESSION INDEX AUDIT WARNING (READ-ONLY)  ⚠️');
    logger.warn('------------------------------------------------------------------------');
    if (result.legacyUniqueIndexes.length > 0) {
      const legacyNames = result.legacyUniqueIndexes.map(i => `"${i.name}" (${JSON.stringify(i.key)})`).join(', ');
      const msg = `Incompatible legacy unique index(es) on "attendances" lacking "outSessionId": ${legacyNames}. Second/additional break LUNCH_OUT inserts will fail with E11000.`;
      result.warnings.push(msg);
      logger.warn(msg);
    }
    if (!result.hasMultiSessionIndex) {
      const msg = 'Required partial unique index { worker: 1, date: 1, punchType: 1, outSessionId: 1 } with partialFilterExpression { punchType: "LUNCH_OUT", outSessionId: { $type: "string" } } is missing on "attendances".';
      result.warnings.push(msg);
      logger.warn(msg);
    }
    logger.warn('DBA ACTION REQUIRED (manual maintenance; not auto-modified at startup):');
    for (const legacy of result.legacyUniqueIndexes) {
      logger.warn(`  db.attendances.dropIndex("${legacy.name}")`);
    }
    if (!result.hasMultiSessionIndex) {
      logger.warn('  db.attendances.createIndex({ worker: 1, date: 1, punchType: 1, outSessionId: 1 }, { unique: true, partialFilterExpression: { punchType: "LUNCH_OUT", outSessionId: { $type: "string" } } })');
    }
    logger.warn('========================================================================');
  }

  return result;
};

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
      autoIndex: process.env.NODE_ENV !== 'production', // Explicitly disable automatic index creation/synchronization in production
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      writeConcern: {
        w: 'majority'
      },
      maxPoolSize: 10
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Read-only index audits (never drop, create, or synchronize indexes automatically)
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

      await auditAttendanceIndexes(db);
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

connectDB.auditAttendanceIndexes = auditAttendanceIndexes;

module.exports = connectDB;