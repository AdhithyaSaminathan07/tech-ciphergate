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
  res.json(accounts);
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

  res.status(201).json(account);
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

    res.json({
      success: true,
      message: 'AWS connection established and verified successfully',
      account
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

    res.status(400).json({
      success: false,
      message: err.message,
      account
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

// @desc    Scan and register linked accounts from AWS Organizations
// @route   POST /api/server/organizations/scan
// @access  Private (Admin Only)
const scanOrganization = asyncHandler(async (req, res) => {
  const { masterAccountId, masterRoleArn } = req.body;
  const subdomain = req.user.subdomain;

  if (!masterAccountId || !masterRoleArn) {
    res.status(400);
    throw new Error('Master Account ID and Master Role ARN are required');
  }

  // Retrieve or generate externalId for organizations setup
  let masterAccount = await AwsAccount.findOne({ subdomain, awsAccountId: masterAccountId });

  if (!masterAccount) {
    const externalId = awsService.generateExternalId();
    masterAccount = new AwsAccount({
      subdomain,
      awsAccountId: masterAccountId,
      name: 'Org Billing Master',
      externalId,
      orgId: 'Pending-Sync'
    });
    await masterAccount.save();
  }

  try {
    // Verify master role access first
    const verification = await awsService.verifyCredentials(
      masterRoleArn,
      masterAccount.externalId,
      masterAccountId
    );

    masterAccount.iamRoleArn = masterRoleArn;
    masterAccount.connectionStatus = 'Connected';
    masterAccount.regions = verification.detectedRegions;
    masterAccount.lastSyncedAt = new Date();
    masterAccount.errorMessage = null;

    // Discover child accounts under this organization
    const discovered = await awsService.discoverOrganizationAccounts(
      masterAccountId,
      masterRoleArn,
      masterAccount.externalId
    );

    const results = [];
    for (const child of discovered) {
      // Set org ID on master account doc
      if (child.isMaster) {
        masterAccount.orgId = child.orgId;
        await masterAccount.save();
        results.push(masterAccount);
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
      results.push(childDoc);
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
    masterAccount.connectionStatus = 'Failed';
    masterAccount.errorMessage = err.message;
    await masterAccount.save();

    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

// @desc    Get Cost Lake infrastructure status (CUR, S3, Glue, Athena, records)
// @route   GET /api/server/status
// @access  Private (Admin Only)
const getCostLakeStatus = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const CostHistory = require('../models/CostHistory');
  const ResourceCost = require('../models/ResourceCost');

  // Real data counts
  const costHistoryCount = await CostHistory.countDocuments({ subdomain });
  const resourceCostCount = await ResourceCost.countDocuments({ subdomain });
  const totalRecords = costHistoryCount + resourceCostCount;

  // Determine last sync from most recent CostHistory entry
  const latestEntry = await CostHistory.findOne({ subdomain }).sort({ createdAt: -1 });
  const lastSync = latestEntry?.createdAt || null;

  // Connected accounts (Athena/Glue only "active" if data exists)
  const connectedAccounts = await AwsAccount.find({ subdomain, connectionStatus: 'Connected' });
  const accountCount = connectedAccounts.length;

  const hasCostData = totalRecords > 0;

  res.json({
    cur: {
      status: accountCount > 0 ? 'Configured' : 'Not Configured',
      description: accountCount > 0
        ? `${accountCount} account(s) delivering Cost & Usage Reports`
        : 'No accounts connected. Add and verify an AWS account first.',
      accountCount,
    },
    s3: {
      status: hasCostData ? 'Active' : (accountCount > 0 ? 'Ready' : 'Not Configured'),
      bucket: subdomain ? `cg-finops-cost-lake-${subdomain}` : 'Not configured',
      totalRecords,
      costHistoryRecords: costHistoryCount,
      resourceCostRecords: resourceCostCount,
      description: hasCostData
        ? `${totalRecords.toLocaleString()} billing records stored`
        : 'No billing data yet. Trigger a sync to populate the Cost Lake.',
    },
    glue: {
      status: hasCostData ? 'Cataloged' : (accountCount > 0 ? 'Idle' : 'Unconfigured'),
      database: 'cur_billing_catalog',
      description: hasCostData
        ? 'Billing schema cataloged and queryable via Athena'
        : 'Catalog will populate after first sync.',
    },
    athena: {
      status: hasCostData ? 'Ready' : (accountCount > 0 ? 'Waiting' : 'Unconfigured'),
      workgroup: 'ciphergate-finops-wg',
      description: hasCostData
        ? 'Cost Lake is queryable. Run sync to refresh Athena partitions.'
        : 'Athena will be ready after the Cost Lake is populated.',
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
      { $match: { subdomain, date: { $gte: startOfCurrentMonth } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Last Month spend
    CostHistory.aggregate([
      { $match: { subdomain, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Daily cost (last 30 days)
    CostHistory.aggregate([
      { $match: { subdomain, date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]),
    // Real total savings opportunity from active recommendations
    AwsRecommendation.aggregate([
      { $match: { subdomain, status: 'Active' } },
      { $group: { _id: null, totalSavings: { $sum: '$monthlySavings' }, count: { $sum: 1 } } }
    ]),
    // Count active anomalies
    AwsAnomaly.countDocuments({ subdomain, status: 'Active' })
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

  const now = new Date();
  let startDate = new Date();
  if (range === '7d') startDate.setDate(now.getDate() - 7);
  else if (range === '90d') startDate.setDate(now.getDate() - 90);
  else startDate.setDate(now.getDate() - 30); // Default 30d

  startDate.setHours(0, 0, 0, 0);

  const data = await CostHistory.aggregate([
    { $match: { subdomain, date: { $gte: startDate } } },
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

  const query = { subdomain };
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

  const relations = await ResourceRelationship.find({ subdomain });
  res.json(relations);
});

// @desc    Get cost attributions grouped by dimensions
// @route   GET /api/server/costs/attribution
// @access  Private (Admin Only)
const getCostsAttribution = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const { groupBy = 'Project' } = req.query;

  const CostHistory = require('../models/CostHistory');
  const ResourceCost = require('../models/ResourceCost');

  let results = [];

  if (groupBy.toLowerCase() === 'namespace') {
    results = await ResourceCost.aggregate([
      { $match: { subdomain, containerNamespace: { $ne: null } } },
      { $group: { _id: '$containerNamespace', total: { $sum: '$cost' } } },
      { $sort: { total: -1 } }
    ]);
  } else if (groupBy.toLowerCase() === 'pod') {
    results = await ResourceCost.aggregate([
      { $match: { subdomain, containerPodName: { $ne: null } } },
      { $group: { _id: '$containerPodName', total: { $sum: '$cost' } } },
      { $sort: { total: -1 } }
    ]);
  } else {
    const tagKey = `tags.${groupBy}`;
    results = await CostHistory.aggregate([
      { $match: { subdomain, [tagKey]: { $exists: true, $ne: null } } },
      { $group: { _id: `$${tagKey}`, total: { $sum: '$cost' } } },
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

// @desc    Get top 20 most expensive resources
// @route   GET /api/server/costs/top-resources
// @access  Private (Admin Only)
const getTopResources = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const ResourceCost = require('../models/ResourceCost');
  const AwsResource = require('../models/AwsResource');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const topCosts = await ResourceCost.aggregate([
    {
      $match: {
        subdomain,
        date: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: '$resourceId',
        totalCost: { $sum: '$cost' },
        service: { $first: '$service' },
        awsAccountId: { $first: '$awsAccountId' }
      }
    },
    { $sort: { totalCost: -1 } },
    { $limit: 20 }
  ]);

  const resourceIds = topCosts.map(c => c._id);
  const resources = await AwsResource.find({
    subdomain,
    resourceId: { $in: resourceIds }
  });

  const resourceMap = {};
  resources.forEach(r => {
    resourceMap[r.resourceId] = r;
  });

  const formatted = topCosts.map(item => {
    const meta = resourceMap[item._id];
    return {
      resourceId: item._id,
      totalCost: Number(item.totalCost.toFixed(2)),
      service: item.service,
      awsAccountId: item.awsAccountId,
      name: meta?.name || 'unnamed',
      type: meta?.type || item.service.toLowerCase().replace('amazon', ''),
      region: meta?.region || 'us-east-1',
      status: meta?.status || 'unknown',
      tags: meta?.tags instanceof Map ? Object.fromEntries(meta.tags) : (meta?.tags || {})
    };
  });

  res.json(formatted);
});

// @desc    Get compliance metadata coverage scores
// @route   GET /api/server/costs/tag-compliance
// @access  Private (Admin Only)
const getTagCompliance = asyncHandler(async (req, res) => {
  const subdomain = req.user.subdomain;
  const AwsResource = require('../models/AwsResource');

  const requiredTags = ['Project', 'Environment', 'Team', 'Owner', 'Application', 'CostCenter'];
  const resources = await AwsResource.find({ subdomain });

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

  const query = { subdomain };
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

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain });
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

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain });
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

  const recommendation = await AwsRecommendation.findOne({ _id: req.params.id, subdomain });
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

  const query = { subdomain };
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

  const anomaly = await AwsAnomaly.findOne({ _id: req.params.id, subdomain });
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

  const forecasts = await AwsForecast.find({ subdomain }).sort({ targetDate: 1 });
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

module.exports = {
  getAccounts,
  createAccount,
  verifyAccount,
  deleteAccount,
  scanOrganization,
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
  getCostLakeStatus
};
