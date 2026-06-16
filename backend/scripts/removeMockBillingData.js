require('dotenv').config();
const mongoose = require('mongoose');
const CostHistory = require('../models/CostHistory');
const ResourceCost = require('../models/ResourceCost');

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('Database connected!');

  const mockAccountId = '123456789012';

  console.log(`Starting purge of mock data for account ${mockAccountId}...`);

  const deletedCostHistory = await CostHistory.deleteMany({ awsAccountId: mockAccountId });
  console.log(`Deleted ${deletedCostHistory.deletedCount} CostHistory documents.`);

  const deletedResourceCost = await ResourceCost.deleteMany({ awsAccountId: mockAccountId });
  console.log(`Deleted ${deletedResourceCost.deletedCount} ResourceCost documents.`);

  console.log('Migration script complete.');
  await mongoose.connection.close();
}

main().catch(console.error);
