const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI;

async function check() {
  try {
    await mongoose.connect(uri);
    const workerSchema = new mongoose.Schema({}, { strict: false, collection: 'workers' });
    const Worker = mongoose.models.Worker || mongoose.model('WorkerCheckSubdomain', workerSchema);

    // Group workers by subdomain and count
    const stats = await Worker.aggregate([
      {
        $group: {
          _id: "$subdomain",
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] }
          },
          relievedCount: {
            $sum: { $cond: [{ $eq: ["$status", "Relieved"] }, 1, 0] }
          },
          deletedCount: {
            $sum: { $cond: [{ $eq: ["$status", "Deleted"] }, 1, 0] }
          }
        }
      }
    ]);

    console.log("\n--- Worker Counts by Subdomain ---");
    stats.forEach(stat => {
      console.log(`Subdomain: '${stat._id}' | Total: ${stat.count} | Active: ${stat.activeCount} | Relieved: ${stat.relievedCount} | Deleted: ${stat.deletedCount}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
