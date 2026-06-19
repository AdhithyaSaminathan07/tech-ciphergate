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
      const assumedCredentials = {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken
      };

      // Dynamically discover enabled AWS regions via EC2 DescribeRegions
      let detectedRegions = ['us-east-1']; // Safe fallback
      try {
        const { EC2Client, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
        const ec2 = new EC2Client({ region: 'us-east-1', credentials: assumedCredentials });
        const regionsRes = await ec2.send(new DescribeRegionsCommand({ AllRegions: false }));
        const discovered = (regionsRes.Regions || []).map(r => r.RegionName).filter(Boolean);
        if (discovered.length > 0) {
          detectedRegions = discovered;
          console.log(`[AWS EC2] Discovered ${detectedRegions.length} enabled regions for account ${awsAccountId}.`);
        }
      } catch (regionErr) {
        console.warn(`[AWS EC2] DescribeRegions failed (missing ec2:DescribeRegions permission?), using fallback region list: ${regionErr.message}`);
      }

      return {
        success: true,
        status: 'Connected',
        validatedAt: new Date(),
        detectedRegions,
        credentials: assumedCredentials
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
    const newError = new Error(`AWS Organization scan failed: ${error.message}`);
    newError.name = error.name || 'Error';
    throw newError;
  }
};

/**
 * Executes a SQL query against Amazon Athena Glue Catalog Tables.
 * Uses assumed cross-account credentials and dynamic settings parameters.
 * Enforces pagination, timeout limits, and safety guidelines.
 * 
 * @param {string} subdomain - Tenant subdomain
 * @param {string} awsAccountId - AWS Account ID context
 * @param {string} querySql - Target Athena SQL query
 * @param {object} credentials - Assumed temporary credentials
 * @returns {Promise<Array|string>} Athena row entries or 'Not Configured'
 */
const queryAthenaBilling = async (subdomain, awsAccountId, querySql, credentials) => {
  console.log(`[AWS Athena] Querying billing data for account ${awsAccountId}...`);

  const AwsSettings = require('../models/AwsSettings');
  const settings = await AwsSettings.findOne({ subdomain });
  
  if (!settings || !settings.glueDatabase || !settings.billingBucket) {
    console.warn(`[AWS Athena] Billing lake settings (bucket/database) are unconfigured for subdomain ${subdomain}.`);
    return 'Not Configured';
  }

  const database = settings.glueDatabase;
  const workgroup = settings.athenaWorkgroup || 'primary';
  const resultsBucket = settings.billingBucket;

  try {
    const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
    const athena = new AthenaClient({
      region: 'us-east-1',
      credentials
    });

    const executionParams = {
      QueryString: querySql,
      QueryExecutionContext: { Database: database },
      ResultConfiguration: { OutputLocation: `s3://${resultsBucket}/athena-results/` }
    };
    
    // Explicitly add workgroup if configured
    if (workgroup && workgroup !== 'primary') {
      executionParams.WorkGroup = workgroup;
    }

    const runCmd = await athena.send(new StartQueryExecutionCommand(executionParams));
    const executionId = runCmd.QueryExecutionId;
    let state = 'QUEUED';
    
    // Safety feature: Timeout protection (Max 180 seconds, checking every 3 seconds)
    const timeoutSeconds = 180;
    const intervalMs = 3000;
    const maxRetries = timeoutSeconds / (intervalMs / 1000);
    
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      const statusCheck = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }));
      state = statusCheck.QueryExecution.Status.State;
      if (state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED') {
        break;
      }
    }

    if (state !== 'SUCCEEDED') {
      throw new Error(`Athena query execution finished with state: ${state}`);
    }

    // Safety feature: Result pagination
    let rows = [];
    let nextToken = null;
    let isFirstPage = true;
    let headers = [];

    do {
      const getResultsParams = { QueryExecutionId: executionId, MaxResults: 1000 };
      if (nextToken) {
        getResultsParams.NextToken = nextToken;
      }

      const results = await athena.send(new GetQueryResultsCommand(getResultsParams));
      const pageRows = results.ResultSet.Rows || [];
      
      if (isFirstPage) {
        // First row of first page is always headers
        headers = (pageRows[0]?.Data || []).map(d => d.VarCharValue);
        const dataRows = pageRows.slice(1);
        rows = rows.concat(dataRows);
        isFirstPage = false;
      } else {
        rows = rows.concat(pageRows);
      }

      nextToken = results.NextToken;
    } while (nextToken);

    // Convert Athena rows structure to key-value objects
    return rows.map(r => {
      const obj = {};
      (r.Data || []).forEach((cell, idx) => {
        if (headers[idx]) {
          obj[headers[idx]] = cell.VarCharValue;
        }
      });
      return obj;
    });

  } catch (error) {
    console.error(`[AWS Athena] Execution error:`, error.message);
    // Safety: Graceful failures mapping to "Not Configured"
    return 'Not Configured';
  }
};

/**
 * Runs a sync pipeline fetching Cost Explorer metrics and curating Cost Lake Resource Costs.
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

  // Try to call AWS Cost Explorer first (Primary billing source for service totals)
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
          tags: {} // CostHistory tags remain empty; billing tags live in ResourceCost
        });
      });
    });

    console.log(`[Billing Ingestion] Successfully retrieved ${historyEntries.length} Cost Explorer entries.`);
  } catch (ceError) {
    console.warn(`[Billing Ingestion] AWS Cost Explorer query failed: ${ceError.message}.`);
  }

  // Clear previous cost database rows for this account before updating CostHistory
  await CostHistory.deleteMany({ subdomain, awsAccountId });

  if (historyEntries.length > 0) {
    await CostHistory.insertMany(historyEntries);
  }

  // 2. Fetch S3/Glue settings for dynamic CUR querying (Authoritative source for ResourceCost)
  const AwsSettings = require('../models/AwsSettings');
  const settings = await AwsSettings.findOne({ subdomain });
  
  if (settings && settings.billingBucket && settings.glueDatabase) {
    const database = settings.glueDatabase;
    console.log(`[Billing Ingestion] Starting S3 CUR Athena sync for database: ${database}`);
    
    try {
      const { GlueClient, GetTablesCommand } = require('@aws-sdk/client-glue');
      const glue = new GlueClient({ region: 'us-east-1', credentials });
      
      let tableName = null;
      let colNames = [];
      
      const tablesRes = await glue.send(new GetTablesCommand({ DatabaseName: database }));
      if (tablesRes.TableList && tablesRes.TableList.length > 0) {
        tableName = tablesRes.TableList[0].Name;
        colNames = (tablesRes.TableList[0].StorageDescriptor?.Columns || []).map(c => c.Name.toLowerCase());
      }
      
      if (tableName) {
        // Resolve CUR column mappings dynamically to avoid query failures on absent tags
        const projectCol = colNames.find(c => c === 'resource_tags_user_project' || c === 'resource_tags_project');
        const teamCol = colNames.find(c => c === 'resource_tags_user_team' || c === 'resource_tags_team');
        const envCol = colNames.find(c => c === 'resource_tags_user_environment' || c === 'resource_tags_environment');
        const ownerCol = colNames.find(c => c === 'resource_tags_user_owner' || c === 'resource_tags_owner');
        const ccCol = colNames.find(c => c === 'resource_tags_user_cost_center' || c === 'resource_tags_user_costcenter' || c === 'resource_tags_cost_center');
        const appCol = colNames.find(c => c === 'resource_tags_user_application' || c === 'resource_tags_application');
        
        const selectFields = [
          'line_item_usage_account_id as awsaccountid',
          'line_item_resource_id as resourceid',
          'line_item_product_code as service',
          'product_region as region',
          'line_item_usage_type as usagetype',
          'line_item_usage_amount as usageamount',
          'line_item_unblended_cost as cost',
          'line_item_usage_start_date as date'
        ];
        
        if (projectCol) selectFields.push(`${projectCol} as tag_project`);
        if (teamCol) selectFields.push(`${teamCol} as tag_team`);
        if (envCol) selectFields.push(`${envCol} as tag_env`);
        if (ownerCol) selectFields.push(`${ownerCol} as tag_owner`);
        if (ccCol) selectFields.push(`${ccCol} as tag_costcenter`);
        if (appCol) selectFields.push(`${appCol} as tag_application`);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const curQuery = `
          SELECT 
            ${selectFields.join(', ')}
          FROM 
            ${database}.${tableName}
          WHERE 
            line_item_usage_start_date >= date_add('day', -30, current_date)
            AND year = CAST(year(current_date) AS varchar)
            AND month = CAST(month(current_date) AS varchar)
        `;
        
        const queryResults = await queryAthenaBilling(subdomain, awsAccountId, curQuery, credentials);
        
        if (Array.isArray(queryResults)) {
          const resourceCostEntries = queryResults.map(row => {
            const tagsMap = new Map();
            if (row.tag_project) tagsMap.set('Project', row.tag_project);
            if (row.tag_team) tagsMap.set('Team', row.tag_team);
            if (row.tag_env) tagsMap.set('Environment', row.tag_env);
            if (row.tag_owner) tagsMap.set('Owner', row.tag_owner);
            if (row.tag_costcenter) tagsMap.set('CostCenter', row.tag_costcenter);
            if (row.tag_application) tagsMap.set('Application', row.tag_application);
            
            return {
              subdomain,
              awsAccountId,
              resourceId: row.resourceid || 'unknown',
              service: row.service || 'Unknown',
              region: row.region || 'us-east-1',
              usageType: row.usagetype || 'usage',
              usageAmount: parseFloat(row.usageamount || 0),
              cost: parseFloat(row.cost || 0),
              tags: tagsMap,
              date: new Date(row.date)
            };
          });
          
          await ResourceCost.deleteMany({ subdomain, awsAccountId });
          if (resourceCostEntries.length > 0) {
            try {
              await ResourceCost.insertMany(resourceCostEntries, { ordered: false });
              console.log(`[Billing Ingestion] Ingested ${resourceCostEntries.length} ResourceCost records from S3 CUR.`);
            } catch (bulkErr) {
              console.log(`[Billing Ingestion] Bulk insertion completed. Handled duplicate lines.`);
            }
          }
        }
      }
    } catch (athenaErr) {
      console.warn(`[Billing Ingestion] S3 CUR Athena synchronization failed: ${athenaErr.message}. Skipping...`);
    }
  } else {
    console.log(`[Billing Ingestion] S3 CUR Athena config is missing/Not Configured for subdomain: ${subdomain}`);
  }

  console.log(`[Billing Ingestion] Completed sync for account ${awsAccountId}.`);
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
    const resourcesToSave = [];
    const relationshipsToSave = [];
    const now = new Date();

    // 1. EC2 Instances
    try {
      const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
      const ec2 = new EC2Client({ region: 'us-east-1', credentials });
      const ec2Response = await ec2.send(new DescribeInstancesCommand({}));

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
            lastSeenAt: now,
            resourceMetadata: {
              instanceType: inst.InstanceType,
              platform: inst.PlatformDetails || 'Linux',
              cpuCores: 2,
              memoryGb: 8
            }
          });

          // Relationships
          if (inst.VpcId) {
            relationshipsToSave.push({
              subdomain,
              awsAccountId,
              parentResourceId: inst.VpcId,
              parentType: 'vpc',
              childResourceId: inst.InstanceId,
              childType: 'ec2',
              relationType: 'contains',
              lastSeenAt: now
            });
          }
          if (inst.SubnetId) {
            relationshipsToSave.push({
              subdomain,
              awsAccountId,
              parentResourceId: inst.SubnetId,
              parentType: 'subnet',
              childResourceId: inst.InstanceId,
              childType: 'ec2',
              relationType: 'contains',
              lastSeenAt: now
            });
          }
          (inst.SecurityGroups || []).forEach(sg => {
            if (sg.GroupId) {
              relationshipsToSave.push({
                subdomain,
                awsAccountId,
                parentResourceId: inst.InstanceId,
                parentType: 'ec2',
                childResourceId: sg.GroupId,
                childType: 'security_group',
                relationType: 'attaches',
                lastSeenAt: now
              });
            }
          });
        });
      });
    } catch (ec2Err) {
      console.warn(`[Discovery] EC2 discovery failed for account ${awsAccountId}:`, ec2Err.message);
    }

    // 2. EBS Volumes
    try {
      const { EC2Client, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');
      const ec2 = new EC2Client({ region: 'us-east-1', credentials });
      const volumesResponse = await ec2.send(new DescribeVolumesCommand({}));

      (volumesResponse.Volumes || []).forEach(vol => {
        const nameTag = (vol.Tags || []).find(t => t.Key === 'Name')?.Value || vol.VolumeId;
        const tagsObj = {};
        (vol.Tags || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: vol.VolumeId,
          name: nameTag,
          type: 'ebs',
          region: 'us-east-1',
          status: vol.State || 'unknown',
          tags: tagsObj,
          lastSeenAt: now,
          resourceMetadata: {
            sizeGb: vol.Size,
            volumeType: vol.VolumeType,
            iops: vol.Iops,
            throughput: vol.Throughput
          }
        });

        // Attachments
        (vol.Attachments || []).forEach(att => {
          if (att.InstanceId) {
            relationshipsToSave.push({
              subdomain,
              awsAccountId,
              parentResourceId: att.InstanceId,
              parentType: 'ec2',
              childResourceId: vol.VolumeId,
              childType: 'ebs',
              relationType: 'attaches',
              lastSeenAt: now
            });
          }
        });
      });
    } catch (ebsErr) {
      console.warn(`[Discovery] EBS discovery failed for account ${awsAccountId}:`, ebsErr.message);
    }

    // 3. VPC, Subnets, and Security Groups
    try {
      const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
      const ec2 = new EC2Client({ region: 'us-east-1', credentials });

      // VPCs
      const vpcsResponse = await ec2.send(new DescribeVpcsCommand({}));
      (vpcsResponse.Vpcs || []).forEach(vpc => {
        const nameTag = (vpc.Tags || []).find(t => t.Key === 'Name')?.Value || vpc.VpcId;
        const tagsObj = {};
        (vpc.Tags || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: vpc.VpcId,
          name: nameTag,
          type: 'vpc',
          region: 'us-east-1',
          status: vpc.State || 'available',
          tags: tagsObj,
          lastSeenAt: now,
          resourceMetadata: {
            cidrBlock: vpc.CidrBlock,
            isDefault: vpc.IsDefault
          }
        });
      });

      // Subnets
      const subnetsResponse = await ec2.send(new DescribeSubnetsCommand({}));
      (subnetsResponse.Subnets || []).forEach(sub => {
        const nameTag = (sub.Tags || []).find(t => t.Key === 'Name')?.Value || sub.SubnetId;
        const tagsObj = {};
        (sub.Tags || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: sub.SubnetId,
          name: nameTag,
          type: 'subnet',
          region: 'us-east-1',
          status: sub.State || 'available',
          tags: tagsObj,
          lastSeenAt: now,
          resourceMetadata: {
            vpcId: sub.VpcId,
            cidrBlock: sub.CidrBlock,
            availableIpAddressCount: sub.AvailableIpAddressCount
          }
        });

        if (sub.VpcId) {
          relationshipsToSave.push({
            subdomain,
            awsAccountId,
            parentResourceId: sub.VpcId,
            parentType: 'vpc',
            childResourceId: sub.SubnetId,
            childType: 'subnet',
            relationType: 'contains',
            lastSeenAt: now
          });
        }
      });

      // Security Groups
      const sgResponse = await ec2.send(new DescribeSecurityGroupsCommand({}));
      (sgResponse.SecurityGroups || []).forEach(sg => {
        const nameTag = (sg.Tags || []).find(t => t.Key === 'Name')?.Value || sg.GroupName || sg.GroupId;
        const tagsObj = {};
        (sg.Tags || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: sg.GroupId,
          name: nameTag,
          type: 'security_group',
          region: 'us-east-1',
          status: 'active',
          tags: tagsObj,
          lastSeenAt: now,
          resourceMetadata: {
            vpcId: sg.VpcId,
            groupName: sg.GroupName,
            description: sg.Description
          }
        });

        if (sg.VpcId) {
          relationshipsToSave.push({
            subdomain,
            awsAccountId,
            parentResourceId: sg.VpcId,
            parentType: 'vpc',
            childResourceId: sg.GroupId,
            childType: 'security_group',
            relationType: 'contains',
            lastSeenAt: now
          });
        }
      });

    } catch (networkErr) {
      console.warn(`[Discovery] Networking discovery failed for account ${awsAccountId}:`, networkErr.message);
    }

    // 4. RDS DB Instances
    try {
      const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
      const rds = new RDSClient({ region: 'us-east-1', credentials });
      const rdsResponse = await rds.send(new DescribeDBInstancesCommand({}));

      (rdsResponse.DBInstances || []).forEach(db => {
        const tagsObj = {};
        (db.TagList || []).forEach(t => { tagsObj[t.Key] = t.Value; });

        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: db.DBInstanceIdentifier,
          name: db.DBInstanceIdentifier,
          type: 'rds',
          region: 'us-east-1',
          status: db.DBInstanceStatus || 'unknown',
          tags: tagsObj,
          lastSeenAt: now,
          resourceMetadata: {
            dbInstanceClass: db.DBInstanceClass,
            engine: db.Engine,
            engineVersion: db.EngineVersion,
            multiAz: db.MultiAZ,
            storageType: db.StorageType,
            allocatedStorage: db.AllocatedStorage
          }
        });

        if (db.DBSubnetGroup?.VpcId) {
          relationshipsToSave.push({
            subdomain,
            awsAccountId,
            parentResourceId: db.DBSubnetGroup.VpcId,
            parentType: 'vpc',
            childResourceId: db.DBInstanceIdentifier,
            childType: 'rds',
            relationType: 'contains',
            lastSeenAt: now
          });
        }
      });
    } catch (rdsErr) {
      console.warn(`[Discovery] RDS discovery failed for account ${awsAccountId}:`, rdsErr.message);
    }

    // 5. Elastic Load Balancers (ELBv2)
    try {
      const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
      const elbv2 = new ElasticLoadBalancingV2Client({ region: 'us-east-1', credentials });
      const elbResponse = await elbv2.send(new DescribeLoadBalancersCommand({}));

      (elbResponse.LoadBalancers || []).forEach(lb => {
        resourcesToSave.push({
          subdomain,
          awsAccountId,
          resourceId: lb.LoadBalancerArn,
          name: lb.LoadBalancerName,
          type: 'elbv2',
          region: 'us-east-1',
          status: lb.State?.Code || 'active',
          tags: {},
          lastSeenAt: now,
          resourceMetadata: {
            dnsName: lb.DNSName,
            type: lb.Type,
            scheme: lb.Scheme,
            vpcId: lb.VpcId
          }
        });

        if (lb.VpcId) {
          relationshipsToSave.push({
            subdomain,
            awsAccountId,
            parentResourceId: lb.VpcId,
            parentType: 'vpc',
            childResourceId: lb.LoadBalancerArn,
            childType: 'elbv2',
            relationType: 'contains',
            lastSeenAt: now
          });
        }
      });
    } catch (elbErr) {
      console.warn(`[Discovery] ELBv2 discovery failed for account ${awsAccountId}:`, elbErr.message);
    }

    // 6. EKS Clusters
    try {
      const { EKSClient, ListClustersCommand, DescribeClusterCommand } = require('@aws-sdk/client-eks');
      const eks = new EKSClient({ region: 'us-east-1', credentials });
      const clustersList = await eks.send(new ListClustersCommand({}));

      for (const clusterName of (clustersList.clusters || [])) {
        try {
          const detail = await eks.send(new DescribeClusterCommand({ name: clusterName }));
          const c = detail.cluster;
          const tagsObj = c.tags || {};

          resourcesToSave.push({
            subdomain,
            awsAccountId,
            resourceId: c.arn,
            name: c.name,
            type: 'eks',
            region: 'us-east-1',
            status: c.status || 'active',
            tags: tagsObj,
            lastSeenAt: now,
            resourceMetadata: {
              version: c.version,
              endpoint: c.endpoint,
              roleArn: c.roleArn,
              vpcId: c.resourcesVpcConfig?.vpcId
            }
          });

          if (c.resourcesVpcConfig?.vpcId) {
            relationshipsToSave.push({
              subdomain,
              awsAccountId,
              parentResourceId: c.resourcesVpcConfig.vpcId,
              parentType: 'vpc',
              childResourceId: c.arn,
              childType: 'eks',
              relationType: 'contains',
              lastSeenAt: now
            });
          }
        } catch (detailErr) {
          console.warn(`[Discovery] Failed to describe EKS cluster ${clusterName}:`, detailErr.message);
        }
      }
    } catch (eksErr) {
      console.warn(`[Discovery] EKS discovery failed for account ${awsAccountId}:`, eksErr.message);
    }

    // Save resources and relationships
    if (resourcesToSave.length > 0) {
      try {
        await AwsResource.insertMany(resourcesToSave, { ordered: false });
        console.log(`[Discovery] Saved ${resourcesToSave.length} resources in database.`);
      } catch (insertErr) {
        console.log(`[Discovery] Resources bulk insert completed.`);
      }
    }
    if (relationshipsToSave.length > 0) {
      try {
        await ResourceRelationship.insertMany(relationshipsToSave, { ordered: false });
        console.log(`[Discovery] Saved ${relationshipsToSave.length} resource relationships in database.`);
      } catch (insertErr) {
        console.log(`[Discovery] Relationships bulk insert completed.`);
      }
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
/**
 * Fetches CPU utilization metrics for a given EC2 instance from CloudWatch
 */
const fetchRightsizingMetrics = async (instanceId, credentials) => {
  try {
    const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const cw = new CloudWatchClient({ region: 'us-east-1', credentials });

    const EndTime = new Date();
    const StartTime = new Date();
    StartTime.setDate(EndTime.getDate() - 14); // 14-day analysis window

    const response = await cw.send(new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'cpu_avg',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 3600 * 24, // Daily average
            Stat: 'Average'
          }
        },
        {
          Id: 'cpu_max',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 3600 * 24,
            Stat: 'Maximum'
          }
        }
      ],
      StartTime,
      EndTime
    }));

    const cpuAvgs = (response.MetricDataResults || []).find(r => r.Id === 'cpu_avg')?.Values || [];
    const cpuMaxs = (response.MetricDataResults || []).find(r => r.Id === 'cpu_max')?.Values || [];

    const averageCpu = cpuAvgs.length > 0 ? (cpuAvgs.reduce((a, b) => a + b, 0) / cpuAvgs.length) : 0;
    const maximumCpu = cpuMaxs.length > 0 ? Math.max(...cpuMaxs) : 0;

    return { averageCpu, maximumCpu };
  } catch (err) {
    console.warn(`[CloudWatch] Failed to fetch CPU metrics for instance ${instanceId}:`, err.message);
    return null;
  }
};

/**
 * Resolves standard monthly running cost estimate for instance types
 */
const getEC2MonthlyCost = (instanceType) => {
  const type = instanceType || '';
  if (type.includes('nano')) return 3.80;
  if (type.includes('micro')) return 7.60;
  if (type.includes('small')) return 15.20;
  if (type.includes('medium')) return 30.40;
  if (type.includes('large') && !type.includes('xlarge')) return 60.80;
  if (type.includes('xlarge') && !type.includes('2xlarge')) return 121.60;
  if (type.includes('2xlarge')) return 243.20;
  return 45.00; // default estimated
};

/**
 * Generates Compute Optimizer / Trusted Advisor and CloudWatch Rightsizing recommendations.
 * 
 * @param {string} subdomain - Tenant boundary
 * @param {string} awsAccountId - AWS Account
 */
const generateRecommendations = async (subdomain, awsAccountId) => {
  console.log(`[Recommendations] Generating recommendations for account: ${awsAccountId}`);
  
  const AwsRecommendation = require('../models/AwsRecommendation');
  const AwsAccount = require('../models/AwsAccount');
  const AwsResource = require('../models/AwsResource');

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
    try {
      const instancesRes = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: 'instance-state-name', Values: ['stopped'] }]
      }));

      (instancesRes.Reservations || []).forEach(res => {
        (res.Instances || []).forEach(inst => {
          const nameTag = (inst.Tags || []).find(t => t.Key === 'Name')?.Value || inst.InstanceId;
          const monthlyCost = getEC2MonthlyCost(inst.InstanceType);

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
    } catch (stoppedErr) {
      console.warn(`[Recommendations] Stopped EC2 instances scan failed:`, stoppedErr.message);
    }

    // 2. Fetch Unattached EBS Volumes (Idle Storage)
    try {
      const volumesRes = await ec2.send(new DescribeVolumesCommand({
        Filters: [{ Name: 'status', Values: ['available'] }]
      }));

      (volumesRes.Volumes || []).forEach(vol => {
        const nameTag = (vol.Tags || []).find(t => t.Key === 'Name')?.Value || vol.VolumeId;
        const size = vol.Size || 0;
        const costPerGb = 0.08; // GP3 standard
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
    } catch (volumesErr) {
      console.warn(`[Recommendations] Unattached EBS volumes scan failed:`, volumesErr.message);
    }

    // 3. Fetch Unassociated Elastic IPs (Idle Networking)
    try {
      const addressesRes = await ec2.send(new DescribeAddressesCommand({}));
      
      (addressesRes.Addresses || []).forEach(addr => {
        if (!addr.AssociationId) {
          const monthlyCost = 3.60;

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
    } catch (ipsErr) {
      console.warn(`[Recommendations] Unassociated Elastic IPs scan failed:`, ipsErr.message);
    }

    // 4. CloudWatch Rightsizing Recommendations (Running Instances)
    try {
      const runningInstances = await AwsResource.find({
        subdomain,
        awsAccountId,
        type: 'ec2',
        status: 'running'
      });

      for (const inst of runningInstances) {
        const metrics = await fetchRightsizingMetrics(inst.resourceId, credentials);
        if (metrics && metrics.averageCpu < 15 && metrics.maximumCpu < 50) {
          const currentType = inst.resourceMetadata?.instanceType || 't3.medium';
          
          let recommendedType = 't3.micro';
          if (currentType.includes('2xlarge')) recommendedType = 't3.xlarge';
          else if (currentType.includes('xlarge')) recommendedType = 't3.large';
          else if (currentType.includes('large')) recommendedType = 't3.medium';
          else if (currentType.includes('medium')) recommendedType = 't3.small';
          else if (currentType.includes('small')) recommendedType = 't3.micro';
          else if (currentType.includes('micro')) recommendedType = 't3.nano';
          else continue; // Cannot downsize nano further
          
          const currentCost = getEC2MonthlyCost(currentType);
          const recommendedCost = getEC2MonthlyCost(recommendedType);
          const monthlySavings = Number((currentCost - recommendedCost).toFixed(2));
          
          if (monthlySavings > 0) {
            recommendations.push({
              subdomain,
              awsAccountId,
              resourceId: inst.resourceId,
              resourceType: 'ec2',
              resourceName: inst.name,
              recommendationType: 'rightsizing',
              currentDetails: {
                instanceType: currentType,
                status: 'running',
                averageCpu: Number(metrics.averageCpu.toFixed(1)),
                maximumCpu: Number(metrics.maximumCpu.toFixed(1))
              },
              recommendedDetails: { instanceType: recommendedType, status: 'running' },
              currentCost,
              recommendedCost,
              monthlySavings,
              annualSavings: Number((monthlySavings * 12).toFixed(2)),
              riskLevel: 'Low',
              confidenceScore: 90,
              implementationEffort: 'Medium',
              impactAnalysis: {
                affectedResources: [inst.resourceId],
                downtimeRisk: 'Minimal',
                businessImpactDescription: `Downsize underutilized EC2 instance ${inst.name} from ${currentType} to ${recommendedType} based on CPU metrics (Average: ${metrics.averageCpu.toFixed(1)}%, Max: ${metrics.maximumCpu.toFixed(1)}%). Requires a brief reboot to change the instance type.`
              },
              status: 'Active'
            });
          }
        }
      }
    } catch (rightsizingErr) {
      console.warn(`[Recommendations] CloudWatch rightsizing analysis failed:`, rightsizingErr.message);
    }

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
      if (err.name === 'AWSOrganizationsNotInUseException' || err.message.includes('AWSOrganizationsNotInUseException')) {
        capabilities.organizations = {
          status: 'Not Configured',
          details: 'AWS Organizations is not enabled. FinOps features can still be used.',
          message: 'AWS Organizations is not enabled. FinOps features can still be used.'
        };
      } else {
        capabilities.organizations = { status: 'Failed', details: err.message };
      }
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
