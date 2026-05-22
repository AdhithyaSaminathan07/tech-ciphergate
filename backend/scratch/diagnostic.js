const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://sudhardeveloper2124:cwBAjGEV1ty4NlG8@ac-sh7uacu-shard-00-00.lmh25dh.mongodb.net:27017,ac-sh7uacu-shard-00-01.lmh25dh.mongodb.net:27017,ac-sh7uacu-shard-00-02.lmh25dh.mongodb.net:27017/?ssl=true&replicaSet=atlas-l7ykv1-shard-0&authSource=admin&retryWrites=true&w=majority";

async function main() {
  const client = new MongoClient(uri);
  try {
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("Connected successfully!");

    // List all databases
    const adminDb = client.db().admin();
    const dbsList = await adminDb.listDatabases();
    console.log("\nDatabases on this cluster:");
    dbsList.databases.forEach(db => {
      console.log(` - ${db.name} (size: ${db.sizeOnDisk} bytes)`);
    });

    // For each database (except admin, local, config), check the collections and count documents
    for (const dbInfo of dbsList.databases) {
      const dbName = dbInfo.name;
      if (['admin', 'local', 'config'].includes(dbName)) continue;

      console.log(`\nAnalyzing Database: ${dbName}`);
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      
      for (const col of collections) {
        const collectionName = col.name;
        const count = await db.collection(collectionName).countDocuments();
        console.log(`  - Collection: ${collectionName} -> ${count} documents`);

        if (collectionName.toLowerCase() === 'admins') {
          const admins = await db.collection(collectionName).find({}).toArray();
          console.log(`    Admins list:`, admins.map(a => ({
            username: a.username,
            subdomain: a.subdomain,
            email: a.email,
            _id: a._id
          })));
        }

        if (collectionName.toLowerCase() === 'workers' || collectionName.toLowerCase() === 'employees') {
          const workers = await db.collection(collectionName).find({}).toArray();
          console.log(`    Workers (first 5 details or count by status/subdomain):`);
          const summary = {};
          workers.forEach(w => {
            const key = `Subdomain: ${w.subdomain}, Status: ${w.status || 'Active'}`;
            summary[key] = (summary[key] || 0) + 1;
          });
          console.log(summary);
        }
      }
    }

  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    await client.close();
    console.log("\nConnection closed.");
  }
}

main();
