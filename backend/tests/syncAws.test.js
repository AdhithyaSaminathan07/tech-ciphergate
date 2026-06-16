require('dotenv').config();
const connectDB = require('../config/db');
const AwsAccount = require('../models/AwsAccount');
const CostHistory = require('../models/CostHistory');
const ResourceCost = require('../models/ResourceCost');
const AwsRecommendation = require('../models/AwsRecommendation');
const AwsAnomaly = require('../models/AwsAnomaly');
const AwsForecast = require('../models/AwsForecast');
const AwsResource = require('../models/AwsResource');
const awsService = require('../services/awsService');
const anomalyService = require('../services/anomalyService');
const forecastService = require('../services/forecastService');

const runSyncTest = async () => {
  console.log('=== Starting live AWS Integration & Sync Test ===');
  
  try {
    // Connect to database
    await connectDB();
    console.log('[PASS] Database connected successfully.');

    const subdomain = 'arun-tv';

    // Find connected accounts
    const accounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
    console.log(`Found ${accounts.length} connected account(s) for subdomain ${subdomain}:`);
    for (const acc of accounts) {
      console.log(` - Account ID: ${acc.awsAccountId}, Name: ${acc.name}, Status: ${acc.connectionStatus}`);
    }

    if (accounts.length === 0) {
      console.log('[WARN] No connected accounts found for subdomain arun-tv. Let\'s check if there are any accounts at all...');
      const allAccounts = await AwsAccount.find({});
      console.log(`Total accounts in DB: ${allAccounts.length}`);
      for (const acc of allAccounts) {
        console.log(` - Account ID: ${acc.awsAccountId}, Name: ${acc.name}, Status: ${acc.connectionStatus}, Subdomain: ${acc.subdomain}`);
      }
      console.log('Exiting sync test because no active connected account is present.');
      process.exit(0);
    }

    const targetAccount = accounts[0];
    const awsAccountId = targetAccount.awsAccountId;

    console.log(`\nTriggering live billing sync pipeline for account: ${awsAccountId}`);

    // Clean up previous records for a clean test
    await CostHistory.deleteMany({ subdomain, awsAccountId });
    await ResourceCost.deleteMany({ subdomain, awsAccountId });
    await AwsRecommendation.deleteMany({ subdomain, awsAccountId });
    await AwsAnomaly.deleteMany({ subdomain, awsAccountId });
    await AwsForecast.deleteMany({ subdomain, awsAccountId });
    await AwsResource.deleteMany({ subdomain, awsAccountId });

    console.log('Cleared database records for this account for clean sync testing.');

    // 1. Ingest billing data (AWS Cost Explorer / Athena fallback)
    await awsService.simulateBillingSync(subdomain, awsAccountId);
    
    // 2. Discover resources
    await awsService.discoverActiveResources(subdomain, awsAccountId);
    
    // 3. Generate recommendations
    await awsService.generateRecommendations(subdomain, awsAccountId);
    
    // 4. Evaluate anomalies
    await anomalyService.evaluateAnomalies(subdomain, awsAccountId);
    
    // 5. Generate forecasts
    await forecastService.generateForecasts(subdomain, awsAccountId);

    console.log('\n=== Verification and Database Count ===');
    const costHistoryCount = await CostHistory.countDocuments({ subdomain, awsAccountId });
    const resourceCostCount = await ResourceCost.countDocuments({ subdomain, awsAccountId });
    const recommendationsCount = await AwsRecommendation.countDocuments({ subdomain, awsAccountId });
    const anomaliesCount = await AwsAnomaly.countDocuments({ subdomain, awsAccountId });
    const forecastsCount = await AwsForecast.countDocuments({ subdomain, awsAccountId });
    const resourcesCount = await AwsResource.countDocuments({ subdomain, awsAccountId });

    console.log(`CostHistory count        : ${costHistoryCount}`);
    console.log(`ResourceCost count       : ${resourceCostCount} (Expect 0 since CE doesn't query resource-level details)`);
    console.log(`AwsRecommendation count  : ${recommendationsCount}`);
    console.log(`AwsAnomaly count         : ${anomaliesCount}`);
    console.log(`AwsForecast count        : ${forecastsCount}`);
    console.log(`AwsResource count        : ${resourcesCount}`);

    if (costHistoryCount > 0) {
      console.log('\n[PASS] Sync succeeded. Cost history has been successfully populated with live data!');
      const sample = await CostHistory.findOne({ subdomain, awsAccountId });
      console.log('Sample record:', sample);
    } else {
      console.log('\n[FAIL] Sync completed but no CostHistory records were created.');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n[FAIL] Sync process threw an error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
};

runSyncTest();
