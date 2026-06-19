const AwsAccount = require('../models/AwsAccount');
const AwsAuditLog = require('../models/AwsAuditLog');
const awsService = require('../services/awsService');
const asyncHandler = require('express-async-handler');

// @desc    Get all connected AWS accounts
// @route   GET /api/server/accounts
// @access  Private (Admin Only)
const getAccounts = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const accounts = await AwsAccount.find({ subdomain }).sort({ createdAt: -1 });

  const accountsWithPolicies = await Promise.all(accounts.map(async (acc) => {
    const docObj = acc.toObject();
    try {
      const policyData = await awsService.generateTrustPolicy(acc.externalId);
      docObj.principalArn = policyData.principalArn;
      docObj.policyDocument = policyData.policyDocument;
    } catch (err) {
      console.warn(`[getAccounts] Failed to generate trust policy for account ${acc.awsAccountId}:`, err.message);
    }
    return docObj;
  }));

  res.json(accountsWithPolicies);
});

// @desc    Register a new AWS account (generates ExternalID)
// @route   POST /api/server/accounts
// @access  Private (Admin Only)
const createAccount = asyncHandler(async (req, res) => {
  const { name, awsAccountId } = req.body;
  const subdomain = req.user.subdomain;

  if (!name || !awsAccountId) {
    res.status(400);
    throw new Error('Please provide account name and a 12-digit AWS Account ID');
  }

  // Check if account is already registered under this subdomain
  const existingAccount = await AwsAccount.findOne({ subdomain, awsAccountId });
  if (existingAccount) {
    res.status(400);
    throw new Error('This AWS Account ID is already registered under your tenant');
  }

  // Generate secure external ID
  const externalId = awsService.generateExternalId();

  const account = new AwsAccount({
    subdomain,
    awsAccountId,
    name,
    externalId,
    connectionStatus: 'Pending'
  });

  await account.save();

  // Create Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'create_aws_account',
    targetType: 'AwsAccount',
    targetId: account._id.toString(),
    newState: account.toObject()
  });
  await audit.save();

  const docObj = account.toObject();
  try {
    const policyData = await awsService.generateTrustPolicy(account.externalId);
    docObj.principalArn = policyData.principalArn;
    docObj.policyDocument = policyData.policyDocument;
  } catch (err) {
    console.warn(`[createAccount] Failed to generate trust policy for new account:`, err.message);
  }

  res.status(201).json(docObj);
});

// @desc    Verify and establish assume-role connection via STS
// @route   POST /api/server/accounts/:id/verify
// @access  Private (Admin Only)
const verifyAccount = asyncHandler(async (req, res) => {
  const { iamRoleArn } = req.body;
  const subdomain = req.user.subdomain;
  const accountId = req.params.id;

  if (!iamRoleArn) {
    res.status(400);
    throw new Error('IAM Role ARN is required for assumption');
  }

  const account = await AwsAccount.findOne({ _id: accountId, subdomain });
  if (!account) {
    res.status(404);
    throw new Error('AWS Account not found');
  }

  const previousState = account.toObject();

  try {
    const verification = await awsService.verifyCredentials(
      iamRoleArn,
      account.externalId,
      account.awsAccountId
    );

    account.iamRoleArn = iamRoleArn;
    account.connectionStatus = 'Connected';
    account.regions = verification.detectedRegions;
    account.lastSyncedAt = new Date();
    account.lastVerifiedAt = new Date();
    account.errorMessage = null;

    await account.save();

    // Audit Log
    const audit = new AwsAuditLog({
      subdomain,
      userId: req.user._id,
      action: 'verify_aws_account_success',
      targetType: 'AwsAccount',
      targetId: account._id.toString(),
      previousState,
      newState: account.toObject()
    });
    await audit.save();

    const docObj = account.toObject();
    try {
      const policyData = await awsService.generateTrustPolicy(account.externalId);
      docObj.principalArn = policyData.principalArn;
      docObj.policyDocument = policyData.policyDocument;
    } catch (e) {}

    res.json({
      success: true,
      message: 'AWS connection established and verified successfully',
      account: docObj
    });
  } catch (err) {
    account.iamRoleArn = iamRoleArn;
    account.connectionStatus = 'Failed';
    account.errorMessage = err.message;
    await account.save();

    // Audit Log
    const audit = new AwsAuditLog({
      subdomain,
      userId: req.user._id,
      action: 'verify_aws_account_failed',
      targetType: 'AwsAccount',
      targetId: account._id.toString(),
      previousState,
      newState: account.toObject()
    });
    await audit.save();

    const docObj = account.toObject();
    try {
      const policyData = await awsService.generateTrustPolicy(account.externalId);
      docObj.principalArn = policyData.principalArn;
      docObj.policyDocument = policyData.policyDocument;
    } catch (e) {}

    res.status(400).json({
      success: false,
      message: err.message,
      account: docObj
    });
  }
});

// @desc    Delete a connected account and clean records
// @route   DELETE /api/server/accounts/:id
// @access  Private (Admin Only)
const deleteAccount = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const accountId = req.params.id;

  const account = await AwsAccount.findOne({ _id: accountId, subdomain });
  if (!account) {
    res.status(404);
    throw new Error('AWS Account not found');
  }

  const previousState = account.toObject();
  await AwsAccount.deleteOne({ _id: accountId, subdomain });

  // Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'delete_aws_account',
    targetType: 'AwsAccount',
    targetId: accountId,
    previousState
  });
  await audit.save();

  res.json({ success: true, message: 'AWS account registry deleted successfully' });
});

// @desc    Register and initialize a new AWS Organization Master account (generates ExternalID)
// @route   POST /api/server/organizations/initialize
// @access  Private (Admin Only)
const initializeOrganization = asyncHandler(async (req, res) => {
  const { name, awsAccountId } = req.body;
  const subdomain = req.user.subdomain;

  if (!name || !awsAccountId) {
    res.status(400);
    throw new Error('Please provide display name and a 12-digit AWS Master Account ID');
  }

  if (!/^\d{12}$/.test(awsAccountId)) {
    res.status(400);
    throw new Error('AWS Account ID must be exactly 12 digits');
  }

  // Check if account is already registered under this subdomain
  let masterAccount = await AwsAccount.findOne({ subdomain, awsAccountId });

  if (masterAccount) {
    // If it exists but is not marked as Org Master, we update it
    masterAccount.name = name;
    masterAccount.isOrgMaster = true;
    masterAccount.orgId = masterAccount.orgId || 'Pending-Sync';
    await masterAccount.save();
  } else {
    // Generate secure external ID
    const externalId = awsService.generateExternalId();

    masterAccount = new AwsAccount({
      subdomain,
      awsAccountId,
      name,
      externalId,
      isOrgMaster: true,
      orgId: 'Pending-Sync',
      connectionStatus: 'Pending'
    });

    await masterAccount.save();
  }

  // Create Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'initialize_aws_organization',
    targetType: 'AwsAccount',
    targetId: masterAccount._id.toString(),
    newState: masterAccount.toObject()
  });
  await audit.save();

  // Return the account with dynamically calculated trust policy
  const docObj = masterAccount.toObject();
  try {
    const policyData = await awsService.generateTrustPolicy(masterAccount.externalId);
    docObj.principalArn = policyData.principalArn;
    docObj.policyDocument = policyData.policyDocument;
  } catch (err) {
    console.warn(`[initializeOrganization] Failed to generate trust policy:`, err.message);
  }

  res.status(201).json(docObj);
});

// @desc    Scan and register linked accounts from AWS Organizations
// @route   POST /api/server/organizations/scan
// @access  Private (Admin Only)
const scanOrganization = asyncHandler(async (req, res) => {
  const { masterAccountId } = req.body;
  const subdomain = req.user.subdomain;

  if (!masterAccountId) {
    res.status(400);
    throw new Error('Master Account ID is required');
  }

  // Retrieve Master Account record
  let masterAccount = await AwsAccount.findOne({ subdomain, awsAccountId: masterAccountId, isOrgMaster: true });
  if (!masterAccount) {
    res.status(404);
    throw new Error('Master AWS Account connection not found or not initialized');
  }

  if (masterAccount.connectionStatus !== 'Connected' || !masterAccount.iamRoleArn) {
    res.status(400);
    throw new Error('Master account connection must be verified and connected first');
  }

  try {
    // Discover child accounts under this organization
    const discovered = await awsService.discoverOrganizationAccounts(
      masterAccountId,
      masterAccount.iamRoleArn,
      masterAccount.externalId
    );

    const results = [];
    for (const child of discovered) {
      // Set org ID on master account doc
      if (child.isMaster) {
        masterAccount.orgId = child.orgId;
        await masterAccount.save();
        
        // Append policy document dynamic details
        const docObj = masterAccount.toObject();
        try {
          const policyData = await awsService.generateTrustPolicy(masterAccount.externalId);
          docObj.principalArn = policyData.principalArn;
          docObj.policyDocument = policyData.policyDocument;
        } catch (e) {}
        
        results.push(docObj);
        continue;
      }

      // Check if child already exists
      let childDoc = await AwsAccount.findOne({ subdomain, awsAccountId: child.awsAccountId });
      if (!childDoc) {
        childDoc = new AwsAccount({
          subdomain,
          awsAccountId: child.awsAccountId,
          name: child.name,
          externalId: awsService.generateExternalId(),
          orgId: child.orgId,
          connectionStatus: 'Pending'
        });
        await childDoc.save();
      } else {
        childDoc.orgId = child.orgId;
        await childDoc.save();
      }
      
      const childObj = childDoc.toObject();
      try {
        const policyData = await awsService.generateTrustPolicy(childDoc.externalId);
        childObj.principalArn = policyData.principalArn;
        childObj.policyDocument = policyData.policyDocument;
      } catch (e) {}
      
      results.push(childObj);
    }

    // Audit Log
    const audit = new AwsAuditLog({
      subdomain,
      userId: req.user._id,
      action: 'scan_aws_organization',
      targetType: 'AwsAccount',
      targetId: masterAccount._id.toString(),
      newState: { scannedCount: discovered.length }
    });
    await audit.save();

    res.json({
      success: true,
      message: `Scanned AWS Organization. Registered/Updated ${results.length} accounts.`,
      accounts: results
    });
  } catch (err) {
    const isOrgNotInUse = err.name === 'AWSOrganizationsNotInUseException' || 
                          err.message.includes('AWSOrganizationsNotInUseException') ||
                          err.message.includes('is not enrolled in AWS Organizations') ||
                          err.message.includes('not enabled');
    
    if (isOrgNotInUse) {
      masterAccount.connectionStatus = 'Connected';
      masterAccount.errorMessage = "AWS Organizations is not enabled for this AWS account. Account connection is healthy. FinOps and Cost Lake can still be used. Enable AWS Organizations only if you need multi-account consolidated billing.";
      masterAccount.orgId = null;
      masterAccount.isOrgMaster = true; // Keep true so it remains visible on Organizations page
      await masterAccount.save();

      const docObj = masterAccount.toObject();
      try {
        const policyData = await awsService.generateTrustPolicy(masterAccount.externalId);
        docObj.principalArn = policyData.principalArn;
        docObj.policyDocument = policyData.policyDocument;
      } catch (e) {}

      return res.json({
        success: true,
        message: "AWS Organizations is not enabled for this AWS account. Account connection is healthy. FinOps and Cost Lake can still be used. Enable AWS Organizations only if you need multi-account consolidated billing.",
        accounts: [docObj]
      });
    } else {
      // Keep it connected because STS AssumeRole succeeded, but log the error message
      masterAccount.connectionStatus = 'Connected';
      masterAccount.errorMessage = err.message;
      await masterAccount.save();

      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
});

// @desc    Get Cost Lake infrastructure status (CUR, S3, Glue, Athena, records)
// @route   GET /api/server/status
// @access  Private (Admin Only)
const getCostLakeStatus = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const CostHistory = require('../models/CostHistory');
  const ResourceCost = require('../models/ResourceCost');

  // Connected accounts
  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);
  const accountCount = connectedAccounts.length;

  // Real data counts
  const costHistoryCount = await CostHistory.countDocuments({ subdomain, awsAccountId: { $in: activeAccountIds } });
  const resourceCostCount = await ResourceCost.countDocuments({ subdomain, awsAccountId: { $in: activeAccountIds } });
  const totalRecords = costHistoryCount + resourceCostCount;

  // Determine last sync from most recent CostHistory entry
  const latestEntry = await CostHistory.findOne({ subdomain, awsAccountId: { $in: activeAccountIds } }).sort({ createdAt: -1 });
  const lastSync = latestEntry?.createdAt || null;

  const hasCostData = totalRecords > 0;

  // Set default discovered capabilities
  const discovered = {
    organizations: {
      status: accountCount > 0 ? 'Configured' : 'Not Configured',
      description: accountCount > 0
        ? `${accountCount} account(s) delivering Cost & Usage Reports`
        : 'No accounts connected. Add and verify an AWS account first.'
    },
    s3: {
      status: hasCostData ? 'Active' : (accountCount > 0 ? 'Ready' : 'Not Configured'),
      bucket: 'Not Configured',
      details: hasCostData
        ? `${totalRecords.toLocaleString()} billing records stored`
        : 'No billing data yet. Trigger a sync to populate the Cost Lake.'
    },
    glue: {
      status: hasCostData ? 'Cataloged' : (accountCount > 0 ? 'Idle' : 'Not Configured'),
      database: 'Not Configured',
      details: hasCostData
        ? 'Billing schema cataloged and queryable via Athena'
        : 'Catalog will populate after first sync.'
    },
    athena: {
      status: hasCostData ? 'Ready' : (accountCount > 0 ? 'Waiting' : 'Not Configured'),
      workgroup: 'Not Configured',
      details: hasCostData
        ? 'Cost Lake is queryable. Run sync to refresh Athena partitions.'
        : 'Athena will be ready after the Cost Lake is populated.'
    }
  };

  // Perform live AWS resources capability check if we have a connected account
  if (accountCount > 0) {
    try {
      const primaryAccount = connectedAccounts[0];
      const verification = await awsService.verifyCredentials(
        primaryAccount.iamRoleArn,
        primaryAccount.externalId,
        primaryAccount.awsAccountId
      );
      if (verification.success && verification.credentials) {
        const caps = await awsService.discoverBillingCapability(verification.credentials);
        
        discovered.organizations = {
          status: caps.organizations.status === 'Active' ? 'Configured' : caps.organizations.status,
          details: caps.organizations.details
        };
        discovered.s3 = {
          status: caps.s3.status === 'Active' ? (hasCostData ? 'Active' : 'Ready') : caps.s3.status,
          bucket: (caps.s3.bucket && caps.s3.bucket !== 'None') ? caps.s3.bucket : 'Not Configured',
          details: caps.s3.details
        };
        discovered.glue = {
          status: caps.glue.status,
          database: (caps.glue.database && caps.glue.database !== 'None') ? caps.glue.database : 'Not Configured',
          details: caps.glue.details
        };
        discovered.athena = {
          status: caps.athena.status,
          workgroup: (caps.athena.workgroup && caps.athena.workgroup !== 'None') ? caps.athena.workgroup : 'Not Configured',
          details: caps.athena.details
        };
      }
    } catch (err) {
      console.warn(`[getCostLakeStatus] Live discovery failed, using standard fallback status: ${err.message}`);
    }
  }

  res.json({
    cur: {
      status: discovered.organizations.status,
      description: discovered.organizations.description || discovered.organizations.details,
      accountCount,
    },
    s3: {
      status: discovered.s3.status,
      bucket: discovered.s3.bucket,
      totalRecords,
      costHistoryRecords: costHistoryCount,
      resourceCostRecords: resourceCostCount,
      description: discovered.s3.description || discovered.s3.details,
    },
    glue: {
      status: discovered.glue.status,
      database: discovered.glue.database,
      description: discovered.glue.description || discovered.glue.details,
    },
    athena: {
      status: discovered.athena.status,
      workgroup: discovered.athena.workgroup,
      description: discovered.athena.description || discovered.athena.details,
    },
    sync: {
      lastSync,
      lastSyncFormatted: lastSync ? new Date(lastSync).toLocaleString() : 'Never',
      totalRecords,
    },
  });
});

// @desc    Get month-to-date run rates and savings summaries
// @route   GET /api/server/costs/summary
// @access  Private (Admin Only)
const getCostsSummary = asyncHandler(async (req, res) => {

  const subdomain = req.user.subdomain;
  const CostHistory = require('../models/CostHistory');
  const AwsRecommendation = require('../models/AwsRecommendation');
  const AwsAnomaly = require('../models/AwsAnomaly');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  // Run all aggregations in parallel for speed
  const [mtdAgg, lmAgg, dailyAgg, savingsAgg, activeAnomalies] = await Promise.all([
    // MTD spend
    CostHistory.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startOfCurrentMonth } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Last Month spend
    CostHistory.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Daily cost (last 30 days)
    CostHistory.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Real total savings opportunity from active recommendations
    AwsRecommendation.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, status: 'Active' } },
      { $group: { _id: null, totalSavings: { $sum: '$monthlySavings' }, count: { $sum: 1 } } }
    ]),
    // Count active anomalies
    AwsAnomaly.countDocuments({ subdomain, awsAccountId: { $in: activeAccountIds }, status: 'Active' })
  ]);

  const mtdSpend = mtdAgg[0]?.total || 0;
  const lastMonthSpend = lmAgg[0]?.total || 0;
  const totalLast30Days = dailyAgg[0]?.total || 0;
  const runRate = totalLast30Days; // 30-day total = monthly run rate
  const savingsOpportunities = savingsAgg[0]?.totalSavings || 0;
  const savingsCount = savingsAgg[0]?.count || 0;

  res.json({
    mtdSpend: Number(mtdSpend.toFixed(2)),
    lastMonthSpend: Number(lastMonthSpend.toFixed(2)),
    runRate: Number(runRate.toFixed(2)),
    savingsOpportunities: Number(savingsOpportunities.toFixed(2)),
    savingsCount,
    activeAnomalies,
    momPercentage: lastMonthSpend > 0 ? Number((((mtdSpend - lastMonthSpend) / lastMonthSpend) * 100).toFixed(1)) : 0
  });
});

// @desc    Get service-level billing trends over ranges (7d, 30d, 90d)
// @route   GET /api/server/costs/trend
// @access  Private (Admin Only)
const getCostsTrend = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { range } = req.query;
  const CostHistory = require('../models/CostHistory');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const now = new Date();
  let startDate = new Date();
  if (range === '7d') startDate.setDate(now.getDate() - 7);
  else if (range === '90d') startDate.setDate(now.getDate() - 90);
  else startDate.setDate(now.getDate() - 30); // Default 30d

  startDate.setHours(0, 0, 0, 0);

  const data = await CostHistory.aggregate([
    { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startDate } } },
    {
      $group: {
        _id: { date: '$date', service: '$service' },
        cost: { $sum: '$cost' }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);

  const formattedMap = {};
  data.forEach(item => {
    const dateStr = item._id.date.toISOString().split('T')[0];
    if (!formattedMap[dateStr]) {
      formattedMap[dateStr] = { date: dateStr, total: 0 };
    }
    formattedMap[dateStr][item._id.service] = item.cost;
    formattedMap[dateStr].total = Number((formattedMap[dateStr].total + item.cost).toFixed(2));
  });

  const trend = Object.values(formattedMap).sort((a, b) => a.date.localeCompare(b.date));
  res.json(trend);
});

// @desc    Trigger manual data lake cost sync process
// @route   POST /api/server/sync
// @access  Private (Admin Only)
const triggerSyncJob = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const accounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });

  if (accounts.length === 0) {
    res.status(400);
    throw new Error('No verified AWS Accounts found. Please connect and verify an account first.');
  }

  const anomalyService = require('../services/anomalyService');
  const forecastService = require('../services/forecastService');

  // Mark all accounts as syncing
  await AwsAccount.updateMany(
    { subdomain, connectionStatus: 'Connected' },
    { $set: { syncStatus: 'Syncing' } }
  );

  // Run all account syncs in parallel using Promise.allSettled
  // This ensures one failing account does NOT block the others
  const syncResults = await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        await awsService.simulateBillingSync(subdomain, account.awsAccountId);
        await awsService.discoverActiveResources(subdomain, account.awsAccountId);
        await awsService.generateRecommendations(subdomain, account.awsAccountId);
        await anomalyService.evaluateAnomalies(subdomain, account.awsAccountId);
        await anomalyService.evaluateBudgetsAndAlerts(subdomain, account.awsAccountId);
        await forecastService.generateForecasts(subdomain, account.awsAccountId);

        account.lastSyncedAt = new Date();
        account.syncStatus = 'Idle';
        account.errorMessage = null;
        await account.save();

        return { accountId: account.awsAccountId, name: account.name, status: 'success' };
      } catch (err) {
        account.syncStatus = 'Error';
        account.errorMessage = err.message;
        await account.save();
        return { accountId: account.awsAccountId, name: account.name, status: 'error', error: err.message };
      }
    })
  );

  const results = syncResults.map(r => r.value || r.reason);
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  // Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'trigger_manual_sync',
    targetType: 'AwsAccount',
    targetId: 'all',
    newState: { succeeded, failed, results }
  });
  await audit.save();

  res.json({
    success: true,
    message: `Sync completed: ${succeeded} account(s) succeeded, ${failed} failed.`,
    results
  });
});

// @desc    Get discovered cloud resources list
// @route   GET /api/server/inventory
// @access  Private (Admin Only)
const getInventory = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsResource = require('../models/AwsResource');
  const { type, accountId, region, search, page = 1, limit = 20 } = req.query;

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const query = { subdomain, awsAccountId: { $in: activeAccountIds } };
  if (type) query.type = type;
  if (accountId) query.awsAccountId = accountId;
  if (region) query.region = region;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { resourceId: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await AwsResource.countDocuments(query);
  const items = await AwsResource.find(query).skip(skip).limit(Number(limit)).sort({ lastSeenAt: -1 });

  res.json({
    items,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    }
  });
});

// @desc    Get cloud resources dependency mapping links
// @route   GET /api/server/relationships
// @access  Private (Admin Only)
const getRelationships = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const ResourceRelationship = require('../models/ResourceRelationship');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const relations = await ResourceRelationship.find({ subdomain, awsAccountId: { $in: activeAccountIds } });
  res.json(relations);
});

// @desc    Get cost attributions grouped by dimensions
// @route   GET /api/server/costs/attribution
// @access  Private (Admin Only)
const getCostsAttribution = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { groupBy = 'Project' } = req.query;

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const ResourceCost = require('../models/ResourceCost');

  let results = [];

  if (groupBy.toLowerCase() === 'namespace') {
    results = await ResourceCost.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds } } },
      {
        $group: {
          _id: {
            $cond: {
              if: { $or: [
                { $eq: [{ $ifNull: ['$containerNamespace', ''] }, ''] },
                { $eq: [{ $trim: { input: '$containerNamespace' } }, ''] }
              ]},
              then: 'Unallocated',
              else: '$containerNamespace'
            }
          },
          total: { $sum: '$cost' }
        }
      },
      { $sort: { total: -1 } }
    ]);
  } else if (groupBy.toLowerCase() === 'pod') {
    results = await ResourceCost.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds } } },
      {
        $group: {
          _id: {
            $cond: {
              if: { $or: [
                { $eq: [{ $ifNull: ['$containerPodName', ''] }, ''] },
                { $eq: [{ $trim: { input: '$containerPodName' } }, ''] }
              ]},
              then: 'Unallocated',
              else: '$containerPodName'
            }
          },
          total: { $sum: '$cost' }
        }
      },
      { $sort: { total: -1 } }
    ]);
  } else {
    const tagKey = `tags.${groupBy}`;
    results = await ResourceCost.aggregate([
      { $match: { subdomain, awsAccountId: { $in: activeAccountIds } } },
      {
        $group: {
          _id: {
            $cond: {
              if: { $or: [
                { $eq: [{ $ifNull: [`$${tagKey}`, ''] }, ''] },
                { $eq: [{ $trim: { input: { $ifNull: [`$${tagKey}`, ''] } } }, ''] }
              ]},
              then: 'Unallocated',
              else: `$${tagKey}`
            }
          },
          total: { $sum: '$cost' }
        }
      },
      { $sort: { total: -1 } }
    ]);
  }

  const totalSpend = results.reduce((sum, item) => sum + item.total, 0);
  const formatted = results.map(item => ({
    group: item._id || 'Unallocated',
    cost: Number(item.total.toFixed(2)),
    percentage: totalSpend > 0 ? Number(((item.total / totalSpend) * 100).toFixed(1)) : 0
  }));

  res.json(formatted);
});

// @desc    Get top-spending AWS services (Phase 1: from CostHistory via Cost Explorer)
//          NOTE: ResourceCost (resource-level granularity) requires CUR S3 ingestion.
//          ResourceCost is deferred to Phase 2. For Phase 1, we surface top AWS services
//          aggregated from CostHistory which is populated by Cost Explorer.
// @route   GET /api/server/costs/top-resources
// @access  Private (Admin Only)
const getTopResources = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const CostHistory = require('../models/CostHistory');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Phase 1: Aggregate top-spending services from CostHistory (Cost Explorer source)
  // Phase 2 will replace this with ResourceCost (resource-level, from CUR/S3)
  const topServices = await CostHistory.aggregate([
    {
      $match: {
        subdomain,
        awsAccountId: { $in: activeAccountIds },
        date: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: '$service',
        totalCost: { $sum: '$cost' },
        awsAccountId: { $first: '$awsAccountId' },
        lastDate: { $max: '$date' }
      }
    },
    { $sort: { totalCost: -1 } },
    { $limit: 10 }
  ]);

  const formatted = topServices.map(item => ({
    resourceId: item._id, // service name acts as identifier in Phase 1
    name: item._id,
    service: item._id,
    totalCost: Number(item.totalCost.toFixed(2)),
    awsAccountId: item.awsAccountId,
    type: 'service',
    region: 'multi-region',
    status: 'active',
    tags: {}
  }));

  res.json(formatted);
});


// @desc    Get compliance metadata coverage scores
// @route   GET /api/server/costs/tag-compliance
// @access  Private (Admin Only)
const getTagCompliance = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsResource = require('../models/AwsResource');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const requiredTags = ['Project', 'Environment', 'Team', 'Owner', 'Application', 'CostCenter'];
  const resources = await AwsResource.find({ subdomain, awsAccountId: { $in: activeAccountIds } });

  if (resources.length === 0) {
    return res.json({
      overallScore: 0,
      tags: requiredTags.reduce((acc, tag) => ({ ...acc, [tag]: 0 }), {}),
      nonCompliantCount: 0,
      nonCompliant: []
    });
  }

  const totals = requiredTags.reduce((acc, tag) => ({ ...acc, [tag]: 0 }), {});
  const nonCompliant = [];

  resources.forEach(res => {
    let compliantCount = 0;
    const missing = [];

    requiredTags.forEach(tag => {
      // Handle Mongoose Map tags or raw JSON key/values
      const hasTag = (res.tags instanceof Map) ? res.tags.get(tag) : res.tags[tag];
      if (hasTag) {
        totals[tag]++;
        compliantCount++;
      } else {
        missing.push(tag);
      }
    });

    if (compliantCount < requiredTags.length) {
      nonCompliant.push({
        resourceId: res.resourceId,
        name: res.name,
        type: res.type,
        missingTags: missing
      });
    }
  });

  const scores = {};
  let scoreSum = 0;
  requiredTags.forEach(tag => {
    const score = Math.round((totals[tag] / resources.length) * 100);
    scores[tag] = score;
    scoreSum += score;
  });

  const overallScore = Math.round(scoreSum / requiredTags.length);

  res.json({
    overallScore,
    tags: scores,
    nonCompliantCount: nonCompliant.length,
    nonCompliant
  });
});

// @desc    Get recommendations
// @route   GET /api/server/recommendations
// @access  Private (Admin Only)
const getRecommendations = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsRecommendation = require('../models/AwsRecommendation');
  const { type, status } = req.query;

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const query = { subdomain, awsAccountId: { $in: activeAccountIds } };
  if (type) query.recommendationType = type;
  if (status) query.status = status;

  const recommendations = await AwsRecommendation.find(query).sort({ monthlySavings: -1 });
  res.json(recommendations);
});

// @desc    Get recommendation by ID with workflow details
// @route   GET /api/server/recommendations/:id
// @access  Private (Admin Only)
const getRecommendationById = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsRecommendation = require('../models/AwsRecommendation');
  const ApprovalWorkflow = require('../models/ApprovalWorkflow');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain, awsAccountId: { $in: activeAccountIds } });
  if (!recommendation) {
    res.status(404);
    throw new Error('Recommendation not found');
  }

  const workflow = await ApprovalWorkflow.findOne({ recommendationId: recommendation._id, subdomain });

  res.json({
    recommendation,
    workflow
  });
});

// @desc    Approve recommendation & generate IaC remediation plans
// @route   POST /api/server/recommendations/:id/approve
// @access  Private (Admin Only)
const approveRecommendation = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { notes = '' } = req.body;
  const AwsRecommendation = require('../models/AwsRecommendation');
  const ApprovalWorkflow = require('../models/ApprovalWorkflow');
  const iacService = require('../services/iacService');
  const AwsAuditLog = require('../models/AwsAuditLog');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain, awsAccountId: { $in: activeAccountIds } });
  if (!recommendation) {
    res.status(404);
    throw new Error('Recommendation not found');
  }

  const previousState = recommendation.toObject();

  recommendation.status = 'Approved';
  await recommendation.save();

  // Generate IaC plans
  const terraformPlan = iacService.generateTerraformPlan(recommendation);
  const cloudFormationTemplate = iacService.generateCloudFormationTemplate(recommendation);

  // Find or create workflow documentation
  let workflow = await ApprovalWorkflow.findOne({ recommendationId: recommendation._id, subdomain });
  if (!workflow) {
    workflow = new ApprovalWorkflow({
      subdomain,
      recommendationId: recommendation._id,
      approvedBy: req.user.name || req.user.email || 'Admin',
      status: 'Approved',
      notes,
      terraformPlan,
      cloudFormationTemplate,
      actionedAt: new Date()
    });
  } else {
    workflow.approvedBy = req.user.name || req.user.email || 'Admin';
    workflow.status = 'Approved';
    workflow.notes = notes;
    workflow.terraformPlan = terraformPlan;
    workflow.cloudFormationTemplate = cloudFormationTemplate;
    workflow.actionedAt = new Date();
  }
  await workflow.save();

  // Create Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'approve_recommendation',
    targetType: 'AwsRecommendation',
    targetId: recommendation._id.toString(),
    previousState,
    newState: recommendation.toObject()
  });
  await audit.save();

  res.json({
    success: true,
    message: 'Recommendation approved and IaC remediation code generated.',
    recommendation,
    workflow
  });
});

// @desc    Reject recommendation
// @route   POST /api/server/recommendations/:id/reject
// @access  Private (Admin Only)
const rejectRecommendation = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { notes = '' } = req.body;
  const AwsRecommendation = require('../models/AwsRecommendation');
  const ApprovalWorkflow = require('../models/ApprovalWorkflow');
  const AwsAuditLog = require('../models/AwsAuditLog');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain, awsAccountId: { $in: activeAccountIds } });
  if (!recommendation) {
    res.status(404);
    throw new Error('Recommendation not found');
  }

  const previousState = recommendation.toObject();

  recommendation.status = 'Rejected';
  await recommendation.save();

  // Record workflow reject documentation
  let workflow = await ApprovalWorkflow.findOne({ recommendationId: recommendation._id, subdomain });
  if (!workflow) {
    workflow = new ApprovalWorkflow({
      subdomain,
      recommendationId: recommendation._id,
      approvedBy: req.user.name || req.user.email || 'Admin',
      status: 'Review',
      notes,
      actionedAt: new Date()
    });
  } else {
    workflow.status = 'Review';
    workflow.notes = notes;
    workflow.actionedAt = new Date();
  }
  await workflow.save();

  // Create Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'reject_recommendation',
    targetType: 'AwsRecommendation',
    targetId: recommendation._id.toString(),
    previousState,
    newState: recommendation.toObject()
  });
  await audit.save();

  res.json({
    success: true,
    message: 'Recommendation marked as rejected.',
    recommendation,
    workflow
  });
});

// @desc    Get detected cost anomalies
// @route   GET /api/server/anomalies
// @access  Private (Admin Only)
const getAnomalies = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsAnomaly = require('../models/AwsAnomaly');
  const { status, severity } = req.query;

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const query = { subdomain, awsAccountId: { $in: activeAccountIds } };
  if (status) query.status = status;
  if (severity) query.severity = severity;

  const anomalies = await AwsAnomaly.find(query).sort({ date: -1 });
  res.json(anomalies);
});

// @desc    Resolve detected cost anomaly
// @route   POST /api/server/anomalies/:id/resolve
// @access  Private (Admin Only)
const resolveAnomaly = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { reason } = req.body;
  const AwsAnomaly = require('../models/AwsAnomaly');
  const AwsAuditLog = require('../models/AwsAuditLog');

  if (!reason) {
    res.status(400);
    throw new Error('Please provide a reason/explanation for resolving the anomaly.');
  }

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const anomaly = await AwsAnomaly.findOne({ _id: req.params.id, subdomain, awsAccountId: { $in: activeAccountIds } });
  if (!anomaly) {
    res.status(404);
    throw new Error('Anomaly not found');
  }

  const previousState = anomaly.toObject();

  anomaly.status = 'Resolved';
  anomaly.reason = reason;
  await anomaly.save();

  // Create Audit Log
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'resolve_cost_anomaly',
    targetType: 'AwsAnomaly',
    targetId: anomaly._id.toString(),
    previousState,
    newState: anomaly.toObject()
  });
  await audit.save();

  res.json({
    success: true,
    message: 'Anomaly marked as resolved.',
    anomaly
  });
});

// @desc    Get spend forecasts
// @route   GET /api/server/forecasts
// @access  Private (Admin Only)
const getForecasts = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsForecast = require('../models/AwsForecast');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const forecasts = await AwsForecast.find({ subdomain, awsAccountId: { $in: activeAccountIds } }).sort({ targetDate: 1 });
  res.json(forecasts);
});

// @desc    Get admin audit logs
// @route   GET /api/server/audit-logs
// @access  Private (Admin Only)
const getAuditLogs = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsAuditLog = require('../models/AwsAuditLog');
  const { action, page = 1, limit = 30 } = req.query;

  const query = { subdomain };
  if (action) query.action = { $regex: action, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const total = await AwsAuditLog.countDocuments(query);
  const logs = await AwsAuditLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate('userId', 'name email');

  res.json({
    logs,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
  });
});

// @desc    Chat with the AI FinOps Expert Agent
// @route   POST /api/server/chat
// @access  Private (Admin Only)
const chatWithAgent = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { message, conversationHistory = [] } = req.body;

  if (!message || !message.trim()) {
    res.status(400);
    throw new Error('Message is required');
  }

  const claudeService = require('../services/claudeService');
  const { TOOL_DEFINITIONS, executeTool } = require('../services/mcpDispatcher');

  // System prompt — strictly forces tool use before answering
  const SYSTEM_PROMPT = `You are the CipherGate Senior AWS FinOps Architect.
Your role is to advise users on cloud cost optimization, budget management, and architectural reliability.

CRITICAL POLICY RULE:
You must NEVER answer AWS cost, billing, resource metrics, or optimization questions from memory. You are STRICTLY FORCED to call the appropriate MCP tool(s) first to query the database, and only then generate your answer based on the returned tool results. If no tools are available or the database returns empty results, state that you do not have cost records connected.

Available MCP Tools (you must call these as JSON blocks):
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

To call a tool, output EXACTLY:
[TOOL_CALL: {"tool": "tool_name", "params": {...}}]

Core Guidelines:
1. Focus strictly on cost reduction without compromising application reliability.
2. Structure all responses in clean, structured Markdown. Use bold headers, bullet lists, and comparison tables.
3. Every recommendation MUST include: Current Cost, Projected Cost, Monthly Savings, Annual Savings, Risk Level, Confidence Score, Implementation Effort.
4. If the user asks for remediations, describe Terraform/CloudFormation steps with a clear warning that auto-execution is disabled.
5. Be concise, professional, and evidence-driven.`;

  // Parse any tool calls in a prior AI response
  const parseToolCalls = (text) => {
    const regex = /\[TOOL_CALL:\s*({[^}]+})\]/g;
    const calls = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        calls.push(JSON.parse(match[1]));
      } catch (e) { /* ignore malformed */ }
    }
    return calls;
  };

  try {
    // Build context from conversation history
    const historyContext = conversationHistory.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const fullUserPrompt = historyContext ? `${historyContext}\nUser: ${message}` : message;

    // Step 1: Ask Claude what tools to call
    const toolSelectionResponse = await claudeService.generateCompletion(
      subdomain,
      SYSTEM_PROMPT,
      `The user asked: "${message}"\n\nBefore answering, identify which MCP tools you need to call to gather accurate data. Output the tool calls using [TOOL_CALL: {...}] syntax.`
    );

    const toolCalls = parseToolCalls(toolSelectionResponse);
    const toolResults = [];

    // Step 2: Execute each tool call
    for (const call of toolCalls) {
      try {
        const result = await executeTool(call.tool, call.params || {}, subdomain);
        toolResults.push({ tool: call.tool, params: call.params || {}, result });
      } catch (err) {
        toolResults.push({ tool: call.tool, error: err.message });
      }
    }

    // Step 3: Generate final answer with tool data
    const toolResultsContext = toolResults.length > 0
      ? `\n\nMCP Tool Results:\n${JSON.stringify(toolResults, null, 2)}\n\nNow answer the user's question using ONLY the above data.`
      : '\n\nNo tool data was retrieved. State that you cannot answer without real cost data.';

    const finalResponse = await claudeService.generateCompletion(
      subdomain,
      SYSTEM_PROMPT,
      `${fullUserPrompt}${toolResultsContext}`
    );

    res.json({
      response: finalResponse,
      toolCalls: toolResults
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// @desc    Get AWS Settings for tenant subdomain
// @route   GET /api/server/settings
// @access  Private (Admin Only)
const getSettings = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsSettings = require('../models/AwsSettings');
  
  let settings = await AwsSettings.findOne({ subdomain });
  if (!settings) {
    settings = new AwsSettings({ subdomain });
    await settings.save();
  }
  
  res.json({ success: true, settings });
});

// @desc    Update AWS Settings for tenant subdomain
// @route   POST /api/server/settings
// @access  Private (Admin Only)
const updateSettings = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsSettings = require('../models/AwsSettings');
  const {
    anomalyThreshold,
    syncSchedule,
    alertsEnabled,
    slackWebhookUrl,
    alertEmails,
    billingBucket,
    glueDatabase,
    athenaWorkgroup
  } = req.body;

  let settings = await AwsSettings.findOne({ subdomain });
  if (!settings) {
    settings = new AwsSettings({ subdomain });
  }

  if (anomalyThreshold !== undefined) settings.anomalyThreshold = Number(anomalyThreshold);
  if (syncSchedule !== undefined) settings.syncSchedule = syncSchedule;
  if (alertsEnabled !== undefined) settings.alertsEnabled = Boolean(alertsEnabled);
  if (slackWebhookUrl !== undefined) settings.slackWebhookUrl = slackWebhookUrl;
  if (alertEmails !== undefined) settings.alertEmails = alertEmails;
  if (billingBucket !== undefined) settings.billingBucket = billingBucket;
  if (glueDatabase !== undefined) settings.glueDatabase = glueDatabase;
  if (athenaWorkgroup !== undefined) settings.athenaWorkgroup = athenaWorkgroup;

  await settings.save();

  // Create Audit Log
  const AwsAuditLog = require('../models/AwsAuditLog');
  const audit = new AwsAuditLog({
    subdomain,
    userId: req.user._id,
    action: 'update_aws_settings',
    targetType: 'AwsSettings',
    targetId: settings._id.toString(),
    newState: settings.toObject()
  });
  await audit.save();

  res.json({ success: true, message: 'Settings updated successfully', settings });
});

// @desc    Get commitment coverage telemetry curves
// @route   GET /api/server/costs/commitment-coverage
// @access  Private (Admin Only)
const getCommitmentCoverage = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const CostHistory = require('../models/CostHistory');
  const AwsAccount = require('../models/AwsAccount');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  if (activeAccountIds.length === 0) {
    return res.json({ coverageScore: 0, hourlyCommitment: 0, coverageData: [] });
  }

  // 1. Try to fetch real metrics from AWS Cost Explorer if credentials are active
  let realCoverage = null;
  const primaryAccount = connectedAccounts[0];
  if (primaryAccount && primaryAccount.iamRoleArn) {
    try {
      const verification = await awsService.verifyCredentials(primaryAccount.iamRoleArn, primaryAccount.externalId, primaryAccount.awsAccountId);
      if (verification.success && verification.credentials) {
        const { CostExplorerClient, GetSavingsPlansCoverageCommand } = require('@aws-sdk/client-cost-explorer');
        const ce = new CostExplorerClient({ region: 'us-east-1', credentials: verification.credentials });
        
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const Start = thirtyDaysAgo.toISOString().split('T')[0];
        const End = today.toISOString().split('T')[0];

        try {
          const response = await ce.send(new GetSavingsPlansCoverageCommand({
            TimePeriod: { Start, End },
            Granularity: 'DAILY'
          }));
          realCoverage = response.SavingsPlansCoverages;
        } catch (e) {
          console.warn('[SavingsPlans] GetSavingsPlansCoverage failed, falling back to modeled curve:', e.message);
        }
      }
    } catch (err) {
      console.warn('[SavingsPlans] Failed to query live Cost Explorer coverage:', err.message);
    }
  }

  // 2. Fetch actual CostHistory to build the curve
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailySpend = await CostHistory.aggregate([
    { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, cost: { $sum: '$cost' } } },
    { $sort: { _id: 1 } }
  ]);

  let coverageScore = 45; // default fallback
  let hourlyCommitment = 1.25;

  const coverageData = dailySpend.map(day => {
    const totalCost = day.cost;
    const coveredCost = totalCost * (coverageScore / 100);
    const onDemandCost = totalCost - coveredCost;
    return {
      date: day._id,
      "Savings Plan Coverage": Number(coveredCost.toFixed(2)),
      "On-Demand Spend": Number(onDemandCost.toFixed(2)),
      total: totalCost
    };
  });

  res.json({
    coverageScore,
    hourlyCommitment,
    coverageData
  });
});

// @desc    Get budgets and actual spend tracking metrics
// @route   GET /api/server/budgets
// @access  Private (Admin Only)
const getBudgets = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsBudget = require('../models/AwsBudget');
  const CostHistory = require('../models/CostHistory');
  const AwsAccount = require('../models/AwsAccount');

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  const budgets = await AwsBudget.find({ subdomain, awsAccountId: { $in: activeAccountIds } }).sort({ createdAt: -1 });

  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const budgetMetrics = await Promise.all(budgets.map(async (b) => {
    const spendAgg = await CostHistory.aggregate([
      { 
        $match: { 
          subdomain, 
          awsAccountId: b.awsAccountId, 
          date: { $gte: startOfCurrentMonth } 
        } 
      },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]);
    const actualSpend = spendAgg[0]?.total || 0;
    
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const forecastSpend = currentDay > 0 ? (actualSpend / currentDay) * daysInMonth : actualSpend;

    const utilization = b.monthlyBudget > 0 ? Number(((actualSpend / b.monthlyBudget) * 100).toFixed(1)) : 0;
    const burnRate = currentDay > 0 ? Number(((actualSpend / (b.monthlyBudget * (currentDay / daysInMonth))) * 100).toFixed(1)) : 0;

    return {
      _id: b._id,
      awsAccountId: b.awsAccountId,
      budgetName: b.budgetName,
      monthlyBudget: b.monthlyBudget,
      thresholdPercent: b.thresholdPercent,
      alertEnabled: b.alertEnabled,
      actualSpend: Number(actualSpend.toFixed(2)),
      forecastSpend: Number(forecastSpend.toFixed(2)),
      utilization,
      burnRate
    };
  }));

  res.json(budgetMetrics);
});

// @desc    Create or update budget limits
// @route   POST /api/server/budgets
// @access  Private (Admin Only)
const createOrUpdateBudget = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { awsAccountId, budgetName, monthlyBudget, thresholdPercent, alertEnabled } = req.body;

  if (!awsAccountId || !budgetName || monthlyBudget === undefined) {
    res.status(400);
    throw new Error('Account ID, Budget Name, and Monthly Budget amount are required.');
  }

  const AwsBudget = require('../models/AwsBudget');
  let budget = await AwsBudget.findOne({ subdomain, awsAccountId, budgetName });

  if (budget) {
    budget.monthlyBudget = Number(monthlyBudget);
    if (thresholdPercent !== undefined) budget.thresholdPercent = Number(thresholdPercent);
    if (alertEnabled !== undefined) budget.alertEnabled = Boolean(alertEnabled);
    await budget.save();
  } else {
    budget = new AwsBudget({
      subdomain,
      awsAccountId,
      budgetName,
      monthlyBudget: Number(monthlyBudget),
      thresholdPercent: Number(thresholdPercent || 80),
      alertEnabled: alertEnabled !== undefined ? Boolean(alertEnabled) : true
    });
    await budget.save();
  }

  res.status(201).json({ success: true, budget });
});

// @desc    Delete a budget record
// @route   DELETE /api/server/budgets/:id
// @access  Private (Admin Only)
const deleteBudget = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsBudget = require('../models/AwsBudget');

  const budget = await AwsBudget.findOne({ _id: req.params.id, subdomain });
  if (!budget) {
    res.status(404);
    throw new Error('Budget not found');
  }

  await AwsBudget.deleteOne({ _id: req.params.id, subdomain });
  res.json({ success: true, message: 'Budget deleted successfully.' });
});

// @desc    Export billing and optimization reports as PDF or CSV
// @route   GET /api/server/reports/export
// @access  Private (Admin Only)
const exportReport = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { type, format, start, end } = req.query;

  if (!type || !format) {
    res.status(400);
    throw new Error('Report type and format (PDF/CSV) are required.');
  }

  const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = end ? new Date(end) : new Date();

  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const activeAccountIds = connectedAccounts.map(acc => acc.awsAccountId);

  if (activeAccountIds.length === 0) {
    res.status(400);
    throw new Error('No active connected AWS accounts found.');
  }

  // Generate Report Data
  let data = {};
  if (type === 'executive_summary') {
    const CostHistory = require('../models/CostHistory');
    const AwsRecommendation = require('../models/AwsRecommendation');
    const AwsAnomaly = require('../models/AwsAnomaly');
    const [costAgg, recAgg, anomalyCount] = await Promise.all([
      CostHistory.aggregate([
        { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$service', total: { $sum: '$cost' } } },
        { $sort: { total: -1 } }
      ]),
      AwsRecommendation.aggregate([
        { $match: { subdomain, awsAccountId: { $in: activeAccountIds }, status: 'Active' } },
        { $group: { _id: null, totalSavings: { $sum: '$monthlySavings' } } }
      ]),
      AwsAnomaly.countDocuments({ subdomain, awsAccountId: { $in: activeAccountIds }, status: 'Active', date: { $gte: startDate, $lte: endDate } })
    ]);
    data = { costAgg, totalSavings: recAgg[0]?.totalSavings || 0, anomalyCount };
  } else if (type === 'detailed_billing') {
    const ResourceCost = require('../models/ResourceCost');
    data = await ResourceCost.find({ subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startDate, $lte: endDate } }).limit(5000).sort({ date: -1 });
  } else if (type === 'optimization_report') {
    const AwsRecommendation = require('../models/AwsRecommendation');
    data = await AwsRecommendation.find({ subdomain, awsAccountId: { $in: activeAccountIds }, status: 'Active' }).sort({ monthlySavings: -1 });
  } else if (type === 'anomaly_report') {
    const AwsAnomaly = require('../models/AwsAnomaly');
    data = await AwsAnomaly.find({ subdomain, awsAccountId: { $in: activeAccountIds }, date: { $gte: startDate, $lte: endDate } }).sort({ date: -1 });
  } else if (type === 'tag_compliance') {
    const AwsResource = require('../models/AwsResource');
    data = await AwsResource.find({ subdomain, awsAccountId: { $in: activeAccountIds } }).sort({ lastSeenAt: -1 });
  } else if (type === 'forecast_report') {
    const AwsForecast = require('../models/AwsForecast');
    data = await AwsForecast.find({ subdomain, awsAccountId: { $in: activeAccountIds } }).sort({ targetDate: 1 });
  }

  // Compile CSV
  if (format.toUpperCase() === 'CSV') {
    let csvString = '';
    if (type === 'detailed_billing') {
      csvString = 'Date,Service,Resource ID,Cost (USD),Region,Usage Type,Usage Amount\n';
      data.forEach(item => {
        csvString += `"${item.date.toISOString().split('T')[0]}","${item.service}","${item.resourceId}",${item.cost},"${item.region}","${item.usageType}",${item.usageAmount}\n`;
      });
    } else if (type === 'optimization_report') {
      csvString = 'Resource ID,Resource Name,Type,Recommendation,Current Cost/mo,Projected Cost/mo,Monthly Savings,Risk Level\n';
      data.forEach(item => {
        csvString += `"${item.resourceId}","${item.resourceName}","${item.resourceType}","${item.recommendationType}",${item.currentCost},${item.recommendedCost},${item.monthlySavings},"${item.riskLevel}"\n`;
      });
    } else if (type === 'tag_compliance') {
      csvString = 'Resource ID,Resource Name,Type,Region,Status,Tags\n';
      data.forEach(item => {
        const tagsStr = item.tags ? Array.from(item.tags.entries()).map(([k, v]) => `${k}=${v}`).join(';') : '';
        csvString += `"${item.resourceId}","${item.name}","${item.type}","${item.region}","${item.status}","${tagsStr}"\n`;
      });
    } else {
      csvString = 'Report Type,Generated At\n';
      csvString += `"${type}","${new Date().toISOString()}"\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ciphergate_${type}_${Date.now()}.csv`);
    return res.send(csvString);
  }

  // Compile PDF
  if (format.toUpperCase() === 'PDF') {
    const { jsPDF } = require('jspdf');
    const doc = new jsPDF();

    doc.setFont("helvetica");
    doc.setFontSize(22);
    doc.setTextColor(13, 148, 136); // Teal theme color
    doc.text("CipherGate FinOps Report", 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(71, 85, 105);
    doc.text(`${type.replace(/_/g, ' ').toUpperCase()}`, 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated At: ${new Date().toLocaleString()} | Tenant: ${subdomain}`, 14, 38);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 42, 196, 42);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);

    let yOffset = 52;
    if (type === 'executive_summary') {
      doc.setFont("helvetica", "bold");
      doc.text("1. Executive Summary Metrics", 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`Total Active Anomalies Detected: ${data.anomalyCount}`, 20, yOffset);
      yOffset += 6;
      doc.text(`Total Monthly Savings Opportunity: $${data.totalSavings.toLocaleString()}`, 20, yOffset);
      yOffset += 12;

      doc.setFont("helvetica", "bold");
      doc.text("2. Service Spend Breakdown", 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.costAgg.slice(0, 15).forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.text(`${item._id}: $${item.total.toLocaleString()}`, 20, yOffset);
        yOffset += 6;
      });
    } else if (type === 'detailed_billing') {
      doc.setFont("helvetica", "bold");
      doc.text("Line-Item Detail (Top 30)", 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.slice(0, 30).forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.text(`${item.date.toISOString().split('T')[0]} | ${item.service} | ${item.resourceId} | $${item.cost}`, 14, yOffset);
        yOffset += 6;
      });
    } else if (type === 'optimization_report') {
      doc.setFont("helvetica", "bold");
      doc.text(`Active Recommendations List (${data.length} found)`, 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.text(`[${item.riskLevel} Risk] ${item.resourceName} (${item.resourceType}): Save $${item.monthlySavings}/mo`, 14, yOffset);
        yOffset += 6;
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Rec: ${item.impactAnalysis?.businessImpactDescription || 'Cleanup'}`, 18, yOffset);
        yOffset += 8;
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
      });
    } else if (type === 'anomaly_report') {
      doc.setFont("helvetica", "bold");
      doc.text(`Cost Anomalies Log (${data.length} found)`, 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.text(`${item.date.toISOString().split('T')[0]} | ${item.service} | Spike: $${item.detectedCost} (Baseline: $${item.baselineCost})`, 14, yOffset);
        yOffset += 6;
      });
    } else if (type === 'tag_compliance') {
      doc.setFont("helvetica", "bold");
      doc.text("Resource Tag Compliance Audit", 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.slice(0, 35).forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        const tagsCount = item.tags ? Array.from(item.tags.keys()).length : 0;
        doc.text(`${item.resourceId} (${item.type}) | Region: ${item.region} | Tags Found: ${tagsCount}`, 14, yOffset);
        yOffset += 6;
      });
    } else if (type === 'forecast_report') {
      doc.setFont("helvetica", "bold");
      doc.text("Extrapolated Spending Forecasts", 14, yOffset);
      yOffset += 8;
      doc.setFont("helvetica", "normal");
      data.forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.text(`${item.targetDate.toISOString().split('T')[0]} | Forecasted Cost: $${item.forecastedCost.toFixed(2)}`, 14, yOffset);
        yOffset += 6;
      });
    }

    const pdfBuffer = doc.output('arraybuffer');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ciphergate_${type}_${Date.now()}.pdf`);
    return res.send(Buffer.from(pdfBuffer));
  }

  res.status(400);
  throw new Error('Unsupported format. Choose PDF or CSV.');
});

module.exports = {
  getAccounts,
  createAccount,
  verifyAccount,
  deleteAccount,
  scanOrganization,
  initializeOrganization,
  getCostsSummary,
  getCostsTrend,
  triggerSyncJob,
  getInventory,
  getRelationships,
  getCostsAttribution,
  getTopResources,
  getTagCompliance,
  getRecommendations,
  getRecommendationById,
  approveRecommendation,
  rejectRecommendation,
  getAnomalies,
  resolveAnomaly,
  getForecasts,
  getAuditLogs,
  chatWithAgent,
  getCostLakeStatus,
  getSettings,
  updateSettings,
  getCommitmentCoverage,
  getBudgets,
  createOrUpdateBudget,
  deleteBudget,
  exportReport
};

