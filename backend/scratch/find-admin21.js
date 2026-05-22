const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI;

async function search() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB.");

    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();

    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (['admin', 'local', 'config'].includes(dbName)) continue;

      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();

      for (const col of collections) {
        const colName = col.name;
        
        // Search by username
        try {
          const docByUsername = await db.collection(colName).findOne({ username: 'admin21' });
          if (docByUsername) {
            console.log(`[FOUND BY USERNAME] DB: ${dbName}, Collection: ${colName}`);
            console.log(docByUsername);
          }
        } catch (e) {}

        // Search by subdomain
        try {
          const docsBySubdomain = await db.collection(colName).find({ subdomain: 'arun-tv' }).limit(3).toArray();
          if (docsBySubdomain.length > 0) {
            console.log(`[FOUND BY SUBDOMAIN] DB: ${dbName}, Collection: ${colName} (${docsBySubdomain.length} sample docs matching)`);
            console.log(docsBySubdomain);
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

search();
