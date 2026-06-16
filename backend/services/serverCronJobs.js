const cron = require('node-cron');
const AwsAccount = require('../models/AwsAccount');
const awsService = require('./awsService');
const anomalyService = require('./anomalyService');
const forecastService = require('./forecastService');

/**
 * Initializes all recurring background synchronization jobs
 * for the AWS FinOps Server Module.
 */
const initializeServerCronJobs = () => {
  console.log('🔄 Initializing AWS FinOps Server Module Schedulers...');

  // ──────────────────────────────────────────────────────────
  // JOB 1: Daily Cost & Usage Sync — runs at 1:00 AM
  // Pulls fresh billing data for all connected accounts
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] ▶ Starting daily AWS billing sync...');
    try {
      const accounts = await AwsAccount.find({ connectionStatus: 'Connected' });
      if (accounts.length === 0) {
        console.log('[Cron] No connected accounts found. Skipping billing sync.');
        return;
      }

      for (const account of accounts) {
        try {
          console.log(`[Cron] Syncing billing for account: ${account.awsAccountId}`);
          await awsService.simulateBillingSync(account.subdomain, account.awsAccountId);
          account.lastSyncedAt = new Date();
          await account.save();
          console.log(`[Cron] ✅ Billing sync complete for account ${account.awsAccountId}`);
        } catch (accountError) {
          // Isolate per-account failures so one bad account doesn't halt all others
          console.error(`[Cron] ❌ Billing sync failed for account ${account.awsAccountId}:`, accountError.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Daily billing sync job error:', error.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // JOB 2: Anomaly Detection — runs daily at 2:00 AM
  // Evaluates fresh billing data for cost spikes
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] ▶ Starting daily anomaly detection scan...');
    try {
      const accounts = await AwsAccount.find({ connectionStatus: 'Connected' });
      for (const account of accounts) {
        try {
          await anomalyService.evaluateAnomalies(account.subdomain, account.awsAccountId);
          console.log(`[Cron] ✅ Anomaly scan complete for account ${account.awsAccountId}`);
        } catch (accountError) {
          console.error(`[Cron] ❌ Anomaly scan failed for account ${account.awsAccountId}:`, accountError.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Anomaly detection job error:', error.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // JOB 3: Forecast Recalculation — runs daily at 2:30 AM
  // Recalculates month-end, quarterly, and annual forecasts
  // ──────────────────────────────────────────────────────────
  cron.schedule('30 2 * * *', async () => {
    console.log('[Cron] ▶ Recalculating spend forecasts...');
    try {
      const accounts = await AwsAccount.find({ connectionStatus: 'Connected' });
      for (const account of accounts) {
        try {
          await forecastService.generateForecasts(account.subdomain, account.awsAccountId);
          console.log(`[Cron] ✅ Forecasts updated for account ${account.awsAccountId}`);
        } catch (accountError) {
          console.error(`[Cron] ❌ Forecast generation failed for account ${account.awsAccountId}:`, accountError.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Forecast recalculation job error:', error.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // JOB 4: Resource Inventory Refresh — runs every 6 hours
  // Re-scans and indexes all active cloud resources
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] ▶ Refreshing cloud resource inventory...');
    try {
      const accounts = await AwsAccount.find({ connectionStatus: 'Connected' });
      for (const account of accounts) {
        try {
          await awsService.discoverActiveResources(account.subdomain, account.awsAccountId);
          console.log(`[Cron] ✅ Resource inventory refreshed for account ${account.awsAccountId}`);
        } catch (accountError) {
          console.error(`[Cron] ❌ Resource discovery failed for account ${account.awsAccountId}:`, accountError.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Resource inventory refresh error:', error.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // JOB 5: Optimization Recommendations — runs every Sunday at 3:00 AM
  // Regenerates rightsizing, idle, and savings plan recommendations
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Cron] ▶ Regenerating weekly optimization recommendations...');
    try {
      const accounts = await AwsAccount.find({ connectionStatus: 'Connected' });
      for (const account of accounts) {
        try {
          await awsService.generateRecommendations(account.subdomain, account.awsAccountId);
          console.log(`[Cron] ✅ Recommendations refreshed for account ${account.awsAccountId}`);
        } catch (accountError) {
          console.error(`[Cron] ❌ Recommendations failed for account ${account.awsAccountId}:`, accountError.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Weekly recommendations job error:', error.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // JOB 6: Connection Integrity Validation — runs every 6 hours
  // Verifies STS AssumeRole access and Organization listing permissions
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] ▶ Running connection integrity validations (STS & Organizations)...');
    try {
      const accounts = await AwsAccount.find({});
      if (accounts.length === 0) return;

      const AwsAuditLog = require('../models/AwsAuditLog');

      for (const account of accounts) {
        // Skip validation if account has never been verified (still in Pending state)
        if (account.connectionStatus === 'Pending') continue;

        try {
          // 1. Verify STS AssumeRole credentials
          const verification = await awsService.verifyCredentials(
            account.iamRoleArn,
            account.externalId,
            account.awsAccountId
          );

          // 2. Verify Organization access (if it has orgId)
          if (account.orgId) {
            await awsService.discoverOrganizationAccounts(
              account.awsAccountId,
              account.iamRoleArn,
              account.externalId
            );
          }

          // If validation succeeded:
          account.connectionStatus = 'Connected';
          account.errorMessage = null;
          account.lastVerifiedAt = new Date();
          await account.save();

        } catch (validationError) {
          // Set status to Failed but DO NOT disconnect or delete the settings
          account.connectionStatus = 'Failed';
          account.errorMessage = validationError.message;
          await account.save();

          // Log Audit Failure Log
          const audit = new AwsAuditLog({
            subdomain: account.subdomain,
            action: 'connection_validation_failed',
            targetType: 'AwsAccount',
            targetId: account._id.toString(),
            newState: account.toObject()
          });
          await audit.save();
          console.error(`[Cron] ❌ Validation failed for account ${account.awsAccountId}: ${validationError.message}`);
        }
      }
    } catch (error) {
      console.error('[Cron] Connection validation background process error:', error.message);
    }
  });

  console.log('✅ AWS FinOps Cron Jobs Initialized:');
  console.log('   • 01:00 AM daily  → Billing cost sync');
  console.log('   • 02:00 AM daily  → Anomaly detection');
  console.log('   • 02:30 AM daily  → Forecast recalculation');
  console.log('   • Every 6 hours   → Resource inventory refresh');
  console.log('   • Sunday 03:00 AM → Optimization recommendations');
  console.log('   • Every 6 hours   → Connection integrity validation');
};

module.exports = {
  initializeServerCronJobs
};
