require('dotenv').config();
const mongoose = require('mongoose');

const CostHistory = require('../models/CostHistory');
const ResourceCost = require('../models/ResourceCost');
const AwsRecommendation = require('../models/AwsRecommendation');
const AwsForecast = require('../models/AwsForecast');
const AwsAnomaly = require('../models/AwsAnomaly');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('Database connected!');

  const collections = [
    { name: 'CostHistory', model: CostHistory, dateField: 'date' },
    { name: 'ResourceCost', model: ResourceCost, dateField: 'date' },
    { name: 'AwsRecommendation', model: AwsRecommendation, dateField: 'createdAt' },
    { name: 'AwsForecast', model: AwsForecast, dateField: 'createdAt' },
    { name: 'AwsAnomaly', model: AwsAnomaly, dateField: 'date' }
  ];

  for (const col of collections) {
    const count = await col.model.countDocuments({});
    const distinctAccounts = await col.model.distinct('awsAccountId');
    const oldest = await col.model.findOne({}).sort({ [col.dateField]: 1 });
    const newest = await col.model.findOne({}).sort({ [col.dateField]: -1 });
    const matchTargetAccount = await col.model.countDocuments({ awsAccountId: '211125490289' });

    console.log(`=========================================`);
    console.log(`Collection: ${col.name}`);
    console.log(`Total Count: ${count}`);
    console.log(`Distinct Account IDs:`, distinctAccounts);
    console.log(`Oldest Record Date:`, oldest ? oldest[col.dateField] : 'N/A');
    console.log(`Newest Record Date:`, newest ? newest[col.dateField] : 'N/A');
    console.log(`Records belonging to 211125490289: ${matchTargetAccount}`);
    console.log(`Seeded or Live: ${distinctAccounts.includes('123456789012') ? 'SEEDED (contains 123456789012)' : 'LIVE'}`);
  }

  await mongoose.connection.close();
}

main().catch(console.error);
