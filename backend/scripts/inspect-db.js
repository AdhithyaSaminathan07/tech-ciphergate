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

  const costHistoryCount = await CostHistory.countDocuments();
  const resourceCostCount = await ResourceCost.countDocuments();

  console.log('CostHistory Total Count:', costHistoryCount);
  console.log('ResourceCost Total Count:', resourceCostCount);

  const newestCostHistory = await CostHistory.findOne().sort({ date: -1 });
  const newestResourceCost = await ResourceCost.findOne().sort({ date: -1 });

  console.log('Newest CostHistory Document:', newestCostHistory ? {
    id: newestCostHistory._id,
    date: newestCostHistory.date,
    service: newestCostHistory.service,
    cost: newestCostHistory.cost,
    subdomain: newestCostHistory.subdomain,
    awsAccountId: newestCostHistory.awsAccountId
  } : 'None');

  console.log('Newest ResourceCost Document:', newestResourceCost ? {
    id: newestResourceCost._id,
    date: newestResourceCost.date,
    service: newestResourceCost.service,
    cost: newestResourceCost.cost,
    subdomain: newestResourceCost.subdomain,
    resourceId: newestResourceCost.resourceId,
    awsAccountId: newestResourceCost.awsAccountId
  } : 'None');

  const sampleCostHistory = await CostHistory.find().limit(5);
  console.log('\nCostHistory 5 Sample Records:');
  console.log(JSON.stringify(sampleCostHistory, null, 2));

  const sampleResourceCost = await ResourceCost.find().limit(5);
  console.log('\nResourceCost 5 Sample Records:');
  console.log(JSON.stringify(sampleResourceCost, null, 2));

  await mongoose.connection.close();
}

main().catch(console.error);
