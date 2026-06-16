const { v4: uuidv4 } = require('uuid');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

let awsHealthStatus = {
  success: false,
  credentialsLoaded: false,
  accountId: null,
  region: null,
  error: 'Not checked yet'
};

const checkAwsHealth = async () => {
  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    const stsClient = new STSClient({ region });
    const response = await stsClient.send(new GetCallerIdentityCommand({}));
    
    awsHealthStatus = {
      success: true,
      credentialsLoaded: true,
      accountId: response.Account,
      region: region,
      error: null
    };
  } catch (err) {
    awsHealthStatus = {
      success: false,
      credentialsLoaded: false,
      accountId: 'Failed to resolve via STS',
      region: region,
      error: err.message
    };
  }

  console.log('\n=========================================');
  console.log('      AWS CREDENTIALS STARTUP CHECK      ');
  console.log('=========================================');
  console.log(`AWS Credentials Loaded : ${awsHealthStatus.credentialsLoaded ? 'Yes ✅' : 'No ❌'}`);
  console.log(`AWS Account ID         : ${awsHealthStatus.accountId}`);
  console.log(`AWS Region             : ${awsHealthStatus.region}`);
  
  if (!awsHealthStatus.success) {
    console.log('-----------------------------------------');
    console.log(`❌ AWS CONFIGURATION ERROR: ${awsHealthStatus.error}`);
    console.log('Please ensure one of the following AWS auth mechanisms is configured:');
    console.log('  1. Environment variables (AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY in .env)');
    console.log('  2. IAM Instance Profile role attached to the server hosting CipherGate');
    console.log('  3. Shared credentials file configured on your machine (~/.aws/credentials)');
  }
  console.log('=========================================\n');

  return awsHealthStatus;
};

const getAwsHealthStatus = () => {
  return awsHealthStatus;
};

/**
 * Generates a cryptographically secure ExternalID UUID
 * @returns {string} UUID
 */
const generateExternalId = () => {
  return uuidv4();
};

/**
 * Verifies the Cross-Account IAM Role connection using STS AssumeRole API
 * Falls back to mock validation if credentials indicate sandbox testing
 * 
 * @param {string} iamRoleArn - Role ARN to assume
 * @param {string} externalId - External ID trust check
 * @param {string} awsAccountId - Target 12-digit AWS Account ID
 * @returns {Promise<object>} Validation status result
 */
const verifyCredentials = async (iamRoleArn, externalId, awsAccountId) => {
  console.log(`[AWS STS] Verifying assume-role access for Account: ${awsAccountId}, Role: ${iamRoleArn}`);

  // Real AWS SDK AssumeRole logic
  try {
    // Dynamically require to avoid missing module errors in dev
    const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
    
    const client = new STSClient({ region: 'us-east-1' });
    const command = new AssumeRoleCommand({
      RoleArn: iamRoleArn,
      RoleSessionName: 'CipherGateFinOpsVerification',
      ExternalId: externalId,
      DurationSeconds: 900
    });

    const response = await client.send(command);
    if (response.Credentials) {
      return {
        success: true,
        status: 'Connected',
        validatedAt: new Date(),
        detectedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'], // Default scanned regions
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId,
          secretAccessKey: response.Credentials.SecretAccessKey,
          sessionToken: response.Credentials.SessionToken
        }
      };
    }
    throw new Error('Assumed role credentials missing in response');
  } catch (error) {
    console.error(`[AWS STS] Assume role connection failed for account ${awsAccountId}:`, error.message);
    throw new Error(`AWS Connection Failed: ${error.message}`);
  }
};

/**
 * Discovers linked accounts under the master organization
 * 
 * @param {string} masterAccountId - The root billing organization account
 * @param {string} iamRoleArn - Root assume role ARN
 * @param {string} externalId - Root external ID
 * @returns {Promise<Array>} List of child organization accounts
 */
const discoverOrganizationAccounts = async (masterAccountId, iamRoleArn, externalId) => {
  console.log(`[AWS Org] Scanning linked accounts under Org Master: ${masterAccountId}`);

  try {
    const { OrganizationsClient, ListAccountsCommand } = require('@aws-sdk/client-organizations');
    // Using credentials from assumed master role
    const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
    
    const stsClient = new STSClient({ region: 'us-east-1' });
    const stsResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: iamRoleArn,
      RoleSessionName: 'CipherGateOrgDiscovery',
      ExternalId: externalId
    }));

    const orgClient = new OrganizationsClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: stsResponse.Credentials.AccessKeyId,
        secretAccessKey: stsResponse.Credentials.SecretAccessKey,
        sessionToken: stsResponse.Credentials.SessionToken
      }
    });

    const response = await orgClient.send(new ListAccountsCommand({}));
    return (response.Accounts || []).map(acc => ({
      awsAccountId: acc.Id,
      name: acc.Name,
      orgId: acc.Arn.split('/')[1] || 'o-organization',
      isMaster: acc.Id === masterAccountId
    }));
  } catch (error) {
    console.error(`[AWS Org] Failed to retrieve accounts for org ${masterAccountId}:`, error.message);
    throw new Error(`AWS Organization scan failed: ${error.message}`);
  }
};

/**
 * Executes a SQL query against Amazon Athena Glue Catalog Tables.
 * Uses assumed cross-account credentials.
 * Falls back to mock telemetry simulation in Sandbox.
 * 
 * @param {string} awsAccountId - Account context
 * @param {string} querySql - Target Athena SQL query
 * @param {object} credentials - Assumed temporary credentials
 * @returns {Promise<Array>} Athena row entries
 */
const queryAthenaBilling = async (awsAccountId, querySql, credentials) => {
  console.log(`[AWS Athena] Querying billing data for account ${awsAccountId}...`);

  try {
    const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
    const athena = new AthenaClient({
      region: 'us-east-1',
      credentials
    });

    const runCmd = await athena.send(new StartQueryExecutionCommand({
      QueryString: querySql,
      QueryExecutionContext: { Database: 'cur_billing_catalog' },
      ResultConfiguration: { OutputLocation: `s3://ciphergate-athena-results-${awsAccountId}/` }
    }));

    const executionId = runCmd.QueryExecutionId;
    let state = 'QUEUED';
    
    // Simple poll logic for Athena execution status
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const statusCheck = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }));
      state = statusCheck.QueryExecution.Status.State;
      if (state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED') {
        break;
      }
    }

    if (state !== 'SUCCEEDED') {
      throw new Error(`Athena query execution finished with state: ${state}`);
    }

    const results = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: executionId }));
    const rows = results.ResultSet.Rows || [];
    // Convert Athena rows structure to key-value objects
    const headers = (rows[0]?.Data || []).map(d => d.VarCharValue);
    return rows.slice(1).map(r => {
      const obj = {};
      (r.Data || []).forEach((cell, idx) => {
        obj[headers[idx]] = cell.VarCharValue;
      });
      return obj;
    });
  } catch (error) {
    console.error(`[AWS Athena] Execution error:`, error.message);
    throw error;
  }
};

/**
 * Runs a simulation pipeline generating 90 days of historical billing data.
 * Writes records to ResourceCost and CostHistory tables.
 * 
 * @param {string} subdomain - Tenant boundary
 * @param {string} awsAccountId - Target account
 */
const simulateBillingSync = async (subdomain, awsAccountId) => {
  console.log(`[Billing Ingestion] Starting dynamic billing sync pipeline for account: ${awsAccountId}`);
  
  const ResourceCost = require('../models/ResourceCost');
  const CostHistory = require('../models/CostHistory');
  const AwsAccount = require('../models/AwsAccount');

  const account = await AwsAccount.findOne({ subdomain, awsAccountId });
  if (!account || !account.iamRoleArn) {
    throw new Error('Account credentials or IAM Role ARN is missing. Verification required.');
  }

  // 1. Assume IAM Role to get credentials
  const verification = await verifyCredentials(account.iamRoleArn, account.externalId, awsAccountId);
  if (!verification.success) {
    throw new Error('STS verification failed. Update role permissions.');
  }

  const credentials = verification.credentials;
  let historyEntries = [];

  // Try to call AWS Cost Explorer first (Primary billing source)
  try {
    console.log(`[Billing Ingestion] Querying AWS Cost Explorer live for account: ${awsAccountId}`);
    const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
    const ce = new CostExplorerClient({ region: 'us-east-1', credentials });

    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);

    const startStr = ninetyDaysAgo.toISOString().split('T')[0];
    const endStr = today.toISOString().split('T')[0];

    const ceResponse = await ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: startStr, End: endStr },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' }
      ]
    }));

    (ceResponse.ResultsByTime || []).forEach(dayResult => {
      const usageDate = dayResult.TimePeriod.Start;
      (dayResult.Groups || []).forEach(group => {
        const service = group.Keys[0] || 'Unknown';
        const cost = parseFloat(group.Metrics.UnblendedCost.Amount || 0);
        
        historyEntries.push({
          subdomain,
          awsAccountId,
          date: new Date(usageDate),
          service,
          cost: Number(cost.toFixed(2)),
          tags: {}
        });
      });
    });

    console.log(`[Billing Ingestion] Successfully retrieved ${historyEntries.length} Cost Explorer entries.`);
  } catch (ceError) {
    console.warn(`[Billing Ingestion] AWS Cost Explorer query failed: ${ceError.message}. Falling back to Athena query...`);
    
    // Fallback: Query Athena if Glue DB & Athena are configured
    try {
      // 2. Query Athena for service-level daily cost totals
      const serviceQuery = `
        SELECT 
          line_item_product_code as service,
          DATE(line_item_usage_start_date) as usage_date,
          SUM(line_item_unblended_cost) as total_cost
        FROM 
          cur_billing_catalog
        WHERE 
          line_item_usage_start_date >= date_add('day', -90, current_date)
        GROUP BY 
          line_item_product_code, DATE(line_item_usage_start_date)
        ORDER BY 
          usage_date ASC
      `;

      const serviceResults = await queryAthenaBilling(awsAccountId, serviceQuery, credentials);
      historyEntries = serviceResults.map(row => ({
        subdomain,
        awsAccountId,
        date: new Date(row.usage_date),
        service: row.service,
        cost: Number(parseFloat(row.total_cost || 0).toFixed(2)),
        tags: {}
      }));
    } catch (athenaError) {
      console.error(`[Billing Ingestion] Athena billing fallback failed: ${athenaError.message}`);
      throw new Error(`Sync Failed: Both Cost Explorer and Athena queries were rejected by AWS. Verify IAM Role permissions. CE Error: ${ceError.message}. Athena Error: ${athenaError.message}`);
    }
  }

  // Clear previous cost database rows for this account before updating
  await CostHistory.deleteMany({ subdomain, awsAccountId });
  await ResourceCost.deleteMany({ subdomain, awsAccountId });

  if (historyEntries.length > 0) {
    await CostHistory.insertMany(historyEntries);
  }

  console.log(`[Billing Ingestion] Completed real sync: ${historyEntries.length} CostHistory records saved for account ${awsAccountId}.`);
};

/**
 * Scrapes and indexes AWS Resources and builds parent-child dependency trees.
 * Falls back to mock discovery in Sandbox mode.
 * 
 * @param {string} subdomain - Client subdomain
 * @param {string} awsAccountId - Target AWS Account
 */
const discoverActiveResources = async (subdomain, awsAccountId) => {
  console.log(`[Discovery] Scoping active resources for account: ${awsAccountId}`);

  const AwsResource = require('../models/AwsResource');
  const ResourceRelationship = require('../models/ResourceRelationship');
  const AwsAccount = require('../models/AwsAccount');

  // Purge old inventory records for this account
  await AwsResource.deleteMany({ subdomain, awsAccountId });
  await ResourceRelationship.deleteMany({ subdomain, awsAccountId });

  const account = await AwsAccount.findOne({ subdomain, awsAccountId });
  if (!account || !account.iamRoleArn) return;

  try {
    const verification = await verifyCredentials(account.iamRoleArn, account.externalId, awsAccountId);
    if (!verification.success || !verification.credentials) return;

    const credentials = verification.credentials;

    // Describe EC2 Instances
    const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: 'us-east-1', credentials });
    const ec2Response = await ec2.send(new DescribeInstancesCommand({}));

    const resourcesToSave = [];
    
    (ec2Response.Reservations || []).forEach(res => {
      (res.Instances || []).forEach(inst => {
        const nameTag = (inst.Tags || []).find(t => t.Key === 'Name')?.Value || inst.InstanceId;
        const tagsObj = {};
        (inst.Tags || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: inst.InstanceId,
          name: nameTag,
          type: 'ec2',
          region: 'us-east-1',
          status: inst.State?.Name || 'unknown',
          tags: tagsObj,
          lastSeenAt: new Date(),
          resourceMetadata: {
            instanceType: inst.InstanceType,
            platform: inst.PlatformDetails || 'Linux',
            cpuCores: 2,
            memoryGb: 8
          }
        });
      });
    });

    if (resourcesToSave.length > 0) {
      await AwsResource.insertMany(resourcesToSave);
      console.log(`[Discovery] Found and indexed ${resourcesToSave.length} active EC2 instances.`);
    }

  } catch (error) {
    console.error(`[Discovery] Failed real-time resource discovery check:`, error.message);
  }
};

/**
 * Generates mock Compute Optimizer / Trusted Advisor recommendations.
 * 
 * @param {string} subdomain - Tenant boundary
 * @param {string} awsAccountId - AWS Account
 */
const generateRecommendations = async (subdomain, awsAccountId) => {
  console.log(`[Recommendations] Generating recommendations for account: ${awsAccountId}`);
  
  const AwsRecommendation = require('../models/AwsRecommendation');
  const AwsAccount = require('../models/AwsAccount');

  // Purge old active recommendations
  await AwsRecommendation.deleteMany({ subdomain, awsAccountId, status: 'Active' });

  const account = await AwsAccount.findOne({ subdomain, awsAccountId });
  if (!account || !account.iamRoleArn) return;

  try {
    const verification = await verifyCredentials(account.iamRoleArn, account.externalId, awsAccountId);
    if (!verification.success || !verification.credentials) return;

    const credentials = verification.credentials;
    const { EC2Client, DescribeInstancesCommand, DescribeVolumesCommand, DescribeAddressesCommand } = require('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: 'us-east-1', credentials });

    const recommendations = [];

    // 1. Fetch Stopped Instances (Idle Compute)
    const instancesRes = await ec2.send(new DescribeInstancesCommand({
      Filters: [{ Name: 'instance-state-name', Values: ['stopped'] }]
    }));

    (instancesRes.Reservations || []).forEach(res => {
      (res.Instances || []).forEach(inst => {
        const nameTag = (inst.Tags || []).find(t => t.Key === 'Name')?.Value || inst.InstanceId;
        
        // Estimate cost based on instance type
        let hourlyCost = 0.0464; // default t3.medium
        if (inst.InstanceType?.includes('large')) hourlyCost = 0.0928;
        if (inst.InstanceType?.includes('xlarge')) hourlyCost = 0.1856;
        if (inst.InstanceType?.includes('nano') || inst.InstanceType?.includes('micro')) hourlyCost = 0.0104;
        
        const monthlyCost = Number((hourlyCost * 730).toFixed(2));

        recommendations.push({
          subdomain,
          awsAccountId,
          resourceId: inst.InstanceId,
          resourceType: 'ec2',
          resourceName: nameTag,
          recommendationType: 'idle_resource',
          currentDetails: { instanceType: inst.InstanceType, status: 'stopped', platform: inst.PlatformDetails || 'Linux' },
          recommendedDetails: { instanceType: inst.InstanceType, status: 'terminated' },
          currentCost: monthlyCost,
          recommendedCost: 0.00,
          monthlySavings: monthlyCost,
          annualSavings: Number((monthlyCost * 12).toFixed(2)),
          riskLevel: 'Low',
          confidenceScore: 95,
          implementationEffort: 'Low',
          impactAnalysis: {
            affectedResources: [inst.InstanceId],
            downtimeRisk: 'None',
            businessImpactDescription: `Decommissioning stopped EC2 instance ${nameTag}. It has been inactive and can be safely terminated.`
          },
          status: 'Active'
        });
      });
    });

    // 2. Fetch Unattached EBS Volumes (Idle Storage)
    const volumesRes = await ec2.send(new DescribeVolumesCommand({
      Filters: [{ Name: 'status', Values: ['available'] }]
    }));

    (volumesRes.Volumes || []).forEach(vol => {
      const nameTag = (vol.Tags || []).find(t => t.Key === 'Name')?.Value || vol.VolumeId;
      const size = vol.Size || 0;
      // Standard GP3 is $0.08 per GB-month
      const costPerGb = 0.08;
      const monthlyCost = Number((size * costPerGb).toFixed(2));

      recommendations.push({
        subdomain,
        awsAccountId,
        resourceId: vol.VolumeId,
        resourceType: 'ebs',
        resourceName: nameTag,
        recommendationType: 'cleanup',
        currentDetails: { sizeGb: size, volumeType: vol.VolumeType || 'gp3', status: 'unattached' },
        recommendedDetails: { status: 'deleted' },
        currentCost: monthlyCost,
        recommendedCost: 0.00,
        monthlySavings: monthlyCost,
        annualSavings: Number((monthlyCost * 12).toFixed(2)),
        riskLevel: 'Low',
        confidenceScore: 100,
        implementationEffort: 'Low',
        impactAnalysis: {
          affectedResources: [vol.VolumeId],
          downtimeRisk: 'None',
          businessImpactDescription: `EBS volume ${vol.VolumeId} (${size} GB) is unattached and idle. Delete the volume after creating a backup snapshot to avoid ongoing costs.`
        },
        status: 'Active'
      });
    });

    // 3. Fetch Unassociated Elastic IPs (Idle Networking)
    const addressesRes = await ec2.send(new DescribeAddressesCommand({}));
    
    (addressesRes.Addresses || []).forEach(addr => {
      // Unassociated EIPs do not have an AssociationId
      if (!addr.AssociationId) {
        const monthlyCost = 3.60; // ~$0.005/hour standard unassociated charge

        recommendations.push({
          subdomain,
          awsAccountId,
          resourceId: addr.AllocationId || addr.PublicIp,
          resourceType: 'eip',
          resourceName: addr.PublicIp,
          recommendationType: 'cleanup',
          currentDetails: { publicIp: addr.PublicIp, status: 'unassociated' },
          recommendedDetails: { status: 'released' },
          currentCost: monthlyCost,
          recommendedCost: 0.00,
          monthlySavings: monthlyCost,
          annualSavings: Number((monthlyCost * 12).toFixed(2)),
          riskLevel: 'Low',
          confidenceScore: 100,
          implementationEffort: 'Low',
          impactAnalysis: {
            affectedResources: [addr.AllocationId || addr.PublicIp],
            downtimeRisk: 'None',
            businessImpactDescription: `Elastic IP ${addr.PublicIp} is currently unassociated. Release this Elastic IP back to AWS to avoid hourly charges.`
          },
          status: 'Active'
        });
      }
    });

    for (const rec of recommendations) {
      const doc = new AwsRecommendation(rec);
      await doc.save();
    }
    console.log(`[Recommendations] Generated ${recommendations.length} recommendations for account ${awsAccountId}.`);

  } catch (error) {
    console.error(`[Recommendations] Failed real-time recommendations scan for account ${awsAccountId}:`, error.message);
  }
};

/**
 * Validates AWS Account ID format and checks if it's not a placeholder
 * @param {string} accountId 
 * @returns {boolean}
 */
const validatePrincipalAccountId = (accountId) => {
  if (!accountId || typeof accountId !== 'string') return false;
  const trimmed = accountId.trim();
  if (!/^\d{12}$/.test(trimmed)) return false;
  
  const blacklisted = [
    '888888888888',
    '123456789012',
    '000000000000',
    '111122223333',
    '999999999999'
  ];
  if (blacklisted.includes(trimmed)) return false;
  
  return true;
};

/**
 * Resolves the principal account ID of CipherGate from Env or STS fallback
 * @returns {Promise<string>}
 */
const getPrincipalAccountId = async () => {
  let accountId = process.env.CIPHERGATE_AWS_PRINCIPAL_ACCOUNT_ID;
  if (!accountId) {
    console.log('[AWS STS] CIPHERGATE_AWS_PRINCIPAL_ACCOUNT_ID env var not found. Attempting to resolve dynamically via GetCallerIdentity...');
    try {
      const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
      const stsClient = new STSClient({ region: 'us-east-1' });
      const response = await stsClient.send(new GetCallerIdentityCommand({}));
      accountId = response.Account;
      console.log(`[AWS STS] Resolved account ID dynamically: ${accountId}`);
    } catch (error) {
      console.error('[AWS STS] Failed to dynamically retrieve principal account ID via STS:', error.message);
      throw new Error('Principal AWS Account ID is not configured and could not be retrieved dynamically via STS.');
    }
  }
  
  if (!validatePrincipalAccountId(accountId)) {
    throw new Error(`Invalid or blacklisted AWS Principal Account ID: ${accountId}`);
  }
  
  return accountId;
};

/**
 * Generates the cross-account trust policy document dynamically
 * @param {string} externalId 
 * @returns {Promise<object>}
 */
const generateTrustPolicy = async (externalId) => {
  if (!externalId) {
    throw new Error('External ID is required to generate trust policy');
  }
  const principalAccountId = await getPrincipalAccountId();
  const principalArn = `arn:aws:iam::${principalAccountId}:root`;
  
  // Validate generated Principal ARN structure
  if (!/^arn:aws:iam::\d{12}:root$/.test(principalArn)) {
    throw new Error(`Generated Principal ARN has invalid format: ${principalArn}`);
  }
  
  const policyObject = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: {
        AWS: principalArn
      },
      Action: "sts:AssumeRole",
      Condition: {
        StringEquals: {
          "sts:ExternalId": externalId
        }
      }
    }]
  };
  
  return {
    principalArn,
    policyDocument: JSON.stringify(policyObject, null, 2),
    policyObject
  };
};

/**
 * Checks capabilities of assumed role credentials (Cost Explorer, Organizations, S3, Glue, Athena)
 * @param {object} credentials - Assumed cross-account role credentials
 * @returns {Promise<object>} Capabilities list
 */
const discoverBillingCapability = async (credentials) => {
  const capabilities = {
    costExplorer: { status: 'Unconfigured', details: 'Cost Explorer access not verified.' },
    organizations: { status: 'Unconfigured', details: 'Organizations access not verified.' },
    s3: { status: 'Unconfigured', details: 'No S3 buckets discovered.', bucket: 'None' },
    glue: { status: 'Unconfigured', details: 'No Glue database discovered.', database: 'None' },
    athena: { status: 'Unconfigured', details: 'No Athena workgroups discovered.', workgroup: 'None' }
  };

  try {
    // 1. Cost Explorer Check
    const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
    const ce = new CostExplorerClient({ region: 'us-east-1', credentials });
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const startStr = yesterday.toISOString().split('T')[0];
    const endStr = today.toISOString().split('T')[0];
    try {
      await ce.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: startStr, End: endStr },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost']
      }));
      capabilities.costExplorer = { status: 'Active', details: 'AWS Cost Explorer query successful.' };
    } catch (err) {
      capabilities.costExplorer = { status: 'Failed', details: err.message };
    }

    // 2. Organizations Check
    const { OrganizationsClient, ListAccountsCommand } = require('@aws-sdk/client-organizations');
    const org = new OrganizationsClient({ region: 'us-east-1', credentials });
    try {
      await org.send(new ListAccountsCommand({ MaxResults: 1 }));
      capabilities.organizations = { status: 'Active', details: 'AWS Organizations integration verified.' };
    } catch (err) {
      capabilities.organizations = { status: 'Failed', details: err.message };
    }

    // 3. S3 Check
    const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'us-east-1', credentials });
    try {
      const s3Res = await s3.send(new ListBucketsCommand({}));
      const buckets = s3Res.Buckets || [];
      const billingBucket = buckets.find(b => 
        b.Name.toLowerCase().includes('cost-lake') || 
        b.Name.toLowerCase().includes('billing') || 
        b.Name.toLowerCase().includes('finops') || 
        b.Name.toLowerCase().includes('cur')
      );
      capabilities.s3 = {
        status: buckets.length > 0 ? 'Active' : 'Unconfigured',
        details: buckets.length > 0 ? `${buckets.length} S3 bucket(s) discovered.` : 'No S3 buckets in this account.',
        bucket: billingBucket ? billingBucket.Name : (buckets[0] ? buckets[0].Name : 'None'),
        buckets: buckets.map(b => b.Name)
      };
    } catch (err) {
      capabilities.s3 = { status: 'Failed', details: err.message, bucket: 'None' };
    }

    // 4. Glue Check
    const { GlueClient, GetDatabasesCommand } = require('@aws-sdk/client-glue');
    const glue = new GlueClient({ region: 'us-east-1', credentials });
    try {
      const glueRes = await glue.send(new GetDatabasesCommand({}));
      const dbs = glueRes.DatabaseList || [];
      const billingDb = dbs.find(d => 
        d.Name.toLowerCase().includes('billing') || 
        d.Name.toLowerCase().includes('cur') || 
        d.Name.toLowerCase().includes('catalog')
      );
      capabilities.glue = {
        status: dbs.length > 0 ? 'Cataloged' : 'Unconfigured',
        details: dbs.length > 0 ? `${dbs.length} Glue database(s) discovered.` : 'No Glue databases in this account.',
        database: billingDb ? billingDb.Name : (dbs[0] ? dbs[0].Name : 'None'),
        databases: dbs.map(d => d.Name)
      };
    } catch (err) {
      capabilities.glue = { status: 'Failed', details: err.message, database: 'None' };
    }

    // 5. Athena Check
    const { AthenaClient, ListWorkGroupsCommand } = require('@aws-sdk/client-athena');
    const athena = new AthenaClient({ region: 'us-east-1', credentials });
    try {
      const athenaRes = await athena.send(new ListWorkGroupsCommand({}));
      const wgs = athenaRes.WorkGroups || [];
      const billingWg = wgs.find(w => w.Name.toLowerCase().includes('ciphergate') || w.Name.toLowerCase().includes('finops'));
      capabilities.athena = {
        status: wgs.length > 0 ? 'Ready' : 'Unconfigured',
        details: wgs.length > 0 ? `${wgs.length} Athena workgroup(s) discovered.` : 'No Athena workgroups in this account.',
        workgroup: billingWg ? billingWg.Name : (wgs[0] ? wgs[0].Name : 'None'),
        workgroups: wgs.map(w => w.Name)
      };
    } catch (err) {
      capabilities.athena = { status: 'Failed', details: err.message, workgroup: 'None' };
    }

  } catch (err) {
    console.error('Failed to query dynamic capabilities:', err.message);
  }

  return capabilities;
};

module.exports = {
  generateExternalId,
  verifyCredentials,
  discoverOrganizationAccounts,
  queryAthenaBilling,
  simulateBillingSync,
  discoverActiveResources,
  generateRecommendations,
  validatePrincipalAccountId,
  getPrincipalAccountId,
  generateTrustPolicy,
  checkAwsHealth,
  getAwsHealthStatus,
  discoverBillingCapability
};
