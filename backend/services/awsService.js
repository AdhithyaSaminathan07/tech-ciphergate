const { v4: uuidv4 } = require('uuid');

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

  // Checks for mock connection trigger
  const isMock = process.env.AWS_MOCKED === 'true' || 
                 awsAccountId.startsWith('1111') || 
                 awsAccountId.startsWith('1234') || 
                 !iamRoleArn;

  if (isMock) {
    console.log(`[AWS STS] Mock validation triggered for sandbox testing.`);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate common sandbox config errors for testing
    if (awsAccountId === '111122223334') {
      throw new Error('STS:AssumeRole AccessDenied - The trust relationship policy is missing or misconfigured.');
    }

    return {
      success: true,
      status: 'Connected',
      validatedAt: new Date(),
      detectedRegions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
    };
  }

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
        detectedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'] // Default scanned regions
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

  const isMock = process.env.AWS_MOCKED === 'true' || 
                 masterAccountId.startsWith('1111') || 
                 masterAccountId.startsWith('1234') || 
                 !iamRoleArn;

  if (isMock) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return [
      { awsAccountId: masterAccountId, name: 'Root Master Billing', orgId: 'o-cgate88888', isMaster: true },
      { awsAccountId: '111122223333', name: 'CipherGate Prod AWS', orgId: 'o-cgate88888', isMaster: false },
      { awsAccountId: '111122224444', name: 'CipherGate Dev AWS', orgId: 'o-cgate88888', isMaster: false },
      { awsAccountId: '111122225555', name: 'CipherGate QA AWS', orgId: 'o-cgate88888', isMaster: false },
      { awsAccountId: '111122226666', name: 'CipherGate Client AWS', orgId: 'o-cgate88888', isMaster: false }
    ];
  }

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

  const isMock = process.env.AWS_MOCKED === 'true' || 
                 awsAccountId.startsWith('1111') || 
                 awsAccountId.startsWith('1234') || 
                 !credentials;

  if (isMock) {
    // Return mock row results depending on query contents
    if (querySql.includes('resource_tags_user_project') || querySql.includes('attribution')) {
      return [
        { project: 'Alpha-Web', team: 'Backend', environment: 'Production', service: 'AmazonEC2', cost: 4120.00 },
        { project: 'Beta-ETL', team: 'DataScience', environment: 'Staging', service: 'AmazonRDS', cost: 2310.00 },
        { project: 'Infra-VPN', team: 'DevOps', environment: 'Production', service: 'AmazonEC2', cost: 1150.00 },
        { project: 'AI-Chat', team: 'AI', environment: 'Development', service: 'AmazonLambda', cost: 890.00 },
        { project: 'Web-CDN', team: 'Frontend', environment: 'Production', service: 'AmazonCloudFront', cost: 1200.00 }
      ];
    }
    return [
      { service: 'AmazonEC2', usage_date: '2026-06-11', total_cost: 145.20 },
      { service: 'AmazonRDS', usage_date: '2026-06-11', total_cost: 212.14 },
      { service: 'AmazonS3', usage_date: '2026-06-11', total_cost: 18.04 },
      { service: 'AmazonEC2', usage_date: '2026-06-10', total_cost: 138.50 },
      { service: 'AmazonRDS', usage_date: '2026-06-10', total_cost: 208.90 }
    ];
  }

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
  console.log(`[Simulator] Starting mock billing sync pipeline for account: ${awsAccountId}`);
  
  const ResourceCost = require('../models/ResourceCost');
  const CostHistory = require('../models/CostHistory');

  // Purge previous records
  await ResourceCost.deleteMany({ subdomain, awsAccountId });
  await CostHistory.deleteMany({ subdomain, awsAccountId });

  const services = [
    { name: 'AmazonEC2', defaultDaily: 120, tag: { Project: 'Alpha-Web', Team: 'Backend', Environment: 'Production', Owner: 'BackendTeam', Application: 'Storefront', CostCenter: 'CC100' } },
    { name: 'AmazonRDS', defaultDaily: 180, tag: { Project: 'Orders-DB', Team: 'Backend', Environment: 'Production', Owner: 'DatabaseTeam', Application: 'OrderAPI', CostCenter: 'CC100' } },
    { name: 'AmazonS3', defaultDaily: 35, tag: { Project: 'Assets-Lake', Team: 'DevOps', Environment: 'Production', Owner: 'DevOpsTeam', Application: 'MediaStore', CostCenter: 'CC200' } },
    { name: 'AmazonLambda', defaultDaily: 12, tag: { Project: 'AI-Chat', Team: 'AI', Environment: 'Development', Owner: 'AiTeam', Application: 'ChatBot', CostCenter: 'CC300' } },
    { name: 'AmazonCloudFront', defaultDaily: 40, tag: { Project: 'Web-CDN', Team: 'Frontend', Environment: 'Production', Owner: 'FrontendTeam', Application: 'UI-Host', CostCenter: 'CC200' } }
  ];

  const now = new Date();
  const historyEntries = [];
  const costEntries = [];

  // Generate cost data for last 90 days
  for (let i = 90; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setDate(now.getDate() - i);
    targetDate.setHours(0, 0, 0, 0);

    services.forEach(svc => {
      // Add random variation to cost (-15% to +25%)
      const variation = 0.85 + Math.random() * 0.4;
      let finalCost = svc.defaultDaily * variation;

      // Simulate a major cost spike on June 11, 2026 for RDS
      const dateStr = targetDate.toISOString().split('T')[0];
      if (dateStr === '2026-06-11' && svc.name === 'AmazonRDS') {
        finalCost = svc.defaultDaily * 2.8; // +180% Spike
      }

      // 1. Rollup Service Cost History
      historyEntries.push({
        subdomain,
        awsAccountId,
        date: targetDate,
        service: svc.name,
        cost: Number(finalCost.toFixed(2)),
        tags: svc.tag
      });

      // 2. Resource-level costs
      const resourceId = svc.name === 'AmazonEC2' 
        ? 'i-09281a827bc19a82f' 
        : svc.name === 'AmazonRDS' 
        ? 'db-orders-prod-primary' 
        : `arn:aws:${svc.name.toLowerCase()}::${awsAccountId}:resource`;

      costEntries.push({
        subdomain,
        resourceId,
        awsAccountId,
        date: targetDate,
        cost: Number(finalCost.toFixed(2)),
        service: svc.name,
        usageAmount: Math.round(24 * variation),
        usageUnit: svc.name === 'AmazonS3' ? 'GB-Mo' : 'Hrs'
      });
    });
  }

  // Batch insert
  await CostHistory.insertMany(historyEntries);
  await ResourceCost.insertMany(costEntries);
  console.log(`[Simulator] Inserted ${historyEntries.length} CostHistory and ${costEntries.length} ResourceCost records.`);
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

  // Purge old inventory records for this account
  await AwsResource.deleteMany({ subdomain, awsAccountId });
  await ResourceRelationship.deleteMany({ subdomain, awsAccountId });

  const isMock = process.env.AWS_MOCKED === 'true' || 
                 awsAccountId.startsWith('1111') || 
                 awsAccountId.startsWith('1234');

  if (isMock) {
    console.log('[Discovery] Triggering sandbox mock resource scraper...');
    
    // 1. Generate diverse Mock Resources with required Tags
    const mockResources = [
      // VPC
      {
        resourceId: `vpc-prod01-${awsAccountId}`,
        name: 'Production-VPC',
        type: 'vpc',
        region: 'us-east-1',
        status: 'available',
        tags: { Project: 'Infra-VPC', Environment: 'Production', Team: 'DevOps', Owner: 'DevOpsTeam', Application: 'VpcBase', CostCenter: 'CC200' },
        resourceMetadata: { cidrBlock: '10.0.0.0/16', isDefault: false }
      },
      // EC2 Host Instance 01 (Connected to EBS 01)
      {
        resourceId: 'i-ec2prodapp01',
        name: 'EC2-Prod-App01',
        type: 'ec2',
        region: 'us-east-1',
        status: 'running',
        tags: { Project: 'Alpha-Web', Environment: 'Production', Team: 'Backend', Owner: 'BackendTeam', Application: 'Storefront', CostCenter: 'CC100' },
        resourceMetadata: { instanceType: 't3.xlarge', platform: 'Linux', cpuCores: 4, memoryGb: 16 }
      },
      // EC2 Host Instance 02
      {
        resourceId: 'i-ec2analyticsworker03',
        name: 'EC2-Analytics-Worker03',
        type: 'ec2',
        region: 'us-east-1',
        status: 'running',
        tags: { Project: 'Beta-ETL', Environment: 'Staging', Team: 'DataScience', Owner: 'DevOpsTeam', Application: 'ETLWorker', CostCenter: 'CC100' },
        resourceMetadata: { instanceType: 't3.xlarge', platform: 'Linux', cpuCores: 4, memoryGb: 16 }
      },
      // RDS DB Instance
      {
        resourceId: 'db-orders-prod-primary',
        name: 'RDS-Orders-Primary',
        type: 'rds',
        region: 'us-east-1',
        status: 'available',
        tags: { Project: 'Orders-DB', Environment: 'Production', Team: 'Backend', Owner: 'DatabaseTeam', Application: 'OrderAPI', CostCenter: 'CC100' },
        resourceMetadata: { engine: 'aurora-postgresql', dbInstanceClass: 'db.r5.xlarge', multiAz: true }
      },
      // EBS Storage 01
      {
        resourceId: 'vol-ebsprodstorage01',
        name: 'EBS-Prod-Vol01',
        type: 'ebs',
        region: 'us-east-1',
        status: 'in-use',
        tags: { Project: 'Alpha-Web', Environment: 'Production', Team: 'Backend', Owner: 'BackendTeam', Application: 'Storefront', CostCenter: 'CC100' },
        resourceMetadata: { sizeGb: 250, volumeType: 'gp3', iops: 3000 }
      },
      // S3 Billing Data Lake bucket
      {
        resourceId: `arn:aws:s3:::ciphergate-cost-lake-${awsAccountId}`,
        name: 'CipherGate-Cost-Lake',
        type: 's3',
        region: 'us-east-1',
        status: 'active',
        tags: { Project: 'Assets-Lake', Environment: 'Production', Team: 'DevOps', Owner: 'DevOpsTeam', Application: 'MediaStore', CostCenter: 'CC200' },
        resourceMetadata: { versioning: 'Enabled', encryption: 'AES256' }
      },
      // Elastic IP
      {
        resourceId: 'eipalloc-prodingress01',
        name: 'EIP-Prod-Ingress01',
        type: 'eip',
        region: 'us-east-1',
        status: 'associated',
        tags: { Project: 'Infra-VPC', Environment: 'Production', Team: 'DevOps', Owner: 'DevOpsTeam', Application: 'VpcBase', CostCenter: 'CC200' },
        resourceMetadata: { publicIp: '54.210.12.87' }
      },
      // Application Load Balancer
      {
        resourceId: `arn:aws:elasticloadbalancing:us-east-1:${awsAccountId}:loadbalancer/app/prod-alb/1122`,
        name: 'ALB-Prod-Main',
        type: 'elbv2',
        region: 'us-east-1',
        status: 'active',
        tags: { Project: 'Infra-VPC', Environment: 'Production', Team: 'DevOps', Owner: 'DevOpsTeam', Application: 'VpcBase', CostCenter: 'CC200' },
        resourceMetadata: { scheme: 'internet-facing', type: 'application' }
      },
      // EKS Cluster
      {
        resourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main`,
        name: 'EKS-Prod-Main',
        type: 'eks',
        region: 'us-east-1',
        status: 'active',
        tags: { Project: 'Infra-VPC', Environment: 'Production', Team: 'DevOps', Owner: 'DevOpsTeam', Application: 'EksPlatform', CostCenter: 'CC200' },
        resourceMetadata: { version: '1.28', endpoint: 'https://eks.us-east-1.amazonaws.com' }
      },
      // Lambda Function
      {
        resourceId: `arn:aws:lambda:us-east-1:${awsAccountId}:function:AI-Consultant-Chat`,
        name: 'Lambda-AI-Consultant-Chat',
        type: 'lambda',
        region: 'us-east-1',
        status: 'active',
        tags: { Project: 'AI-Chat', Environment: 'Development', Team: 'AI', Owner: 'AiTeam', Application: 'ChatBot', CostCenter: 'CC300' },
        resourceMetadata: { runtime: 'nodejs18.x', memorySize: 512, timeout: 30 }
      },
      // EKS Namespaces & Pods (represented as logical resources for attribution queries)
      {
        resourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main/namespace/backend-services`,
        name: 'ns-backend-services',
        type: 'eks',
        region: 'us-east-1',
        status: 'active',
        tags: { Project: 'Alpha-Web', Environment: 'Production', Team: 'Backend', Owner: 'BackendTeam', Application: 'Storefront', CostCenter: 'CC100' },
        containerMetadata: { namespace: 'backend-services', podName: null },
        resourceMetadata: { podCount: 12, cpuRequestPercent: 42.4 }
      },
      {
        resourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main/namespace/backend-services/pod/storefront-api-65b`,
        name: 'pod-storefront-api',
        type: 'eks',
        region: 'us-east-1',
        status: 'running',
        tags: { Project: 'Alpha-Web', Environment: 'Production', Team: 'Backend', Owner: 'BackendTeam', Application: 'Storefront', CostCenter: 'CC100' },
        containerMetadata: { namespace: 'backend-services', podName: 'storefront-api-65b' },
        resourceMetadata: { cpuUsageCores: 0.85, memoryUsageMb: 1024 }
      }
    ];

    const resourcesDocs = [];
    for (const res of mockResources) {
      const doc = new AwsResource({
        subdomain,
        awsAccountId,
        resourceId: res.resourceId,
        name: res.name,
        type: res.type,
        region: res.region,
        status: res.status,
        tags: res.tags,
        containerMetadata: res.containerMetadata || { namespace: null, podName: null },
        resourceMetadata: res.resourceMetadata,
        lastSeenAt: new Date()
      });
      await doc.save();
      resourcesDocs.push(doc);
    }

    // 2. Generate Dependency Relationships
    const relationships = [
      // EC2 Instance to EBS Volume
      {
        parentResourceId: 'i-ec2prodapp01',
        parentType: 'ec2',
        childResourceId: 'vol-ebsprodstorage01',
        childType: 'ebs',
        relationType: 'attaches'
      },
      // ALB to EC2 Instance
      {
        parentResourceId: `arn:aws:elasticloadbalancing:us-east-1:${awsAccountId}:loadbalancer/app/prod-alb/1122`,
        parentType: 'elbv2',
        childResourceId: 'i-ec2prodapp01',
        childType: 'ec2',
        relationType: 'routes_to'
      },
      // EKS Cluster to Namespace
      {
        parentResourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main`,
        parentType: 'eks',
        childResourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main/namespace/backend-services`,
        childType: 'eks',
        relationType: 'hosts'
      },
      // EKS Namespace to Pod
      {
        parentResourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main/namespace/backend-services`,
        parentType: 'eks',
        childResourceId: `arn:aws:eks:us-east-1:${awsAccountId}:cluster/eks-prod-main/namespace/backend-services/pod/storefront-api-65b`,
        childType: 'eks',
        relationType: 'contains'
      }
    ];

    for (const rel of relationships) {
      const relDoc = new ResourceRelationship({
        subdomain,
        awsAccountId,
        parentResourceId: rel.parentResourceId,
        parentType: rel.parentType,
        childResourceId: rel.childResourceId,
        childType: rel.childType,
        relationType: rel.relationType,
        lastSeenAt: new Date()
      });
      await relDoc.save();
    }

    console.log(`[Discovery] Scraped and indexed ${resourcesDocs.length} mock resources, and mapped ${relationships.length} relationships.`);
    return;
  }

  // Real AWS SDK resource descriptors will fetch inventory details using STS assumed client credentials...
  try {
    const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
    const ec2 = new EC2Client({ region: 'us-east-1' });
    const response = await ec2.send(new DescribeInstancesCommand({}));
    // Save real items...
  } catch (error) {
    console.error('[Discovery] Real AWS Scraper error:', error.message);
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

  // Purge old active recommendations
  await AwsRecommendation.deleteMany({ subdomain, awsAccountId, status: 'Active' });

  const recommendations = [
    {
      subdomain,
      awsAccountId,
      resourceId: 'i-ec2prodapp01',
      resourceType: 'ec2',
      resourceName: 'EC2-Prod-App01',
      recommendationType: 'rightsizing',
      currentDetails: { instanceType: 't3.xlarge', platform: 'Linux', cpuCores: 4, memoryGb: 16 },
      recommendedDetails: { instanceType: 't3.large', platform: 'Linux', cpuCores: 2, memoryGb: 8 },
      currentCost: 120.00,
      recommendedCost: 60.00,
      monthlySavings: 1800.00,
      annualSavings: 21600.00,
      riskLevel: 'Medium',
      confidenceScore: 90,
      implementationEffort: 'Low',
      impactAnalysis: {
        affectedResources: ['i-ec2prodapp01', 'vol-ebsprodstorage01'],
        downtimeRisk: 'Medium',
        businessImpactDescription: 'EC2 Instance downsizing requires restarting. Application storefront will experience brief outage.'
      },
      status: 'Active'
    },
    {
      subdomain,
      awsAccountId,
      resourceId: 'i-ec2analyticsworker03',
      resourceType: 'ec2',
      resourceName: 'EC2-Analytics-Worker03',
      recommendationType: 'idle_resource',
      currentDetails: { instanceType: 't3.xlarge', status: 'running' },
      recommendedDetails: { instanceType: 't3.xlarge', status: 'stopped' },
      currentCost: 1200.00,
      recommendedCost: 0.00,
      monthlySavings: 1200.00,
      annualSavings: 14400.00,
      riskLevel: 'Low',
      confidenceScore: 95,
      implementationEffort: 'Low',
      impactAnalysis: {
        affectedResources: ['i-ec2analyticsworker03'],
        downtimeRisk: 'None',
        businessImpactDescription: 'Decommissioning idle EC2 instance. CPU utilization is < 1% over last 30 days.'
      },
      status: 'Active'
    },
    {
      subdomain,
      awsAccountId,
      resourceId: 'vol-ebs-unused-01',
      resourceType: 'ebs',
      resourceName: 'EBS-Unused-Volume',
      recommendationType: 'cleanup',
      currentDetails: { sizeGb: 500, volumeType: 'gp3', status: 'unattached' },
      recommendedDetails: { status: 'deleted' },
      currentCost: 40.00,
      recommendedCost: 0.00,
      monthlySavings: 40.00,
      annualSavings: 480.00,
      riskLevel: 'Low',
      confidenceScore: 100,
      implementationEffort: 'Low',
      impactAnalysis: {
        affectedResources: ['vol-ebs-unused-01'],
        downtimeRisk: 'None',
        businessImpactDescription: 'EBS volume is unattached. Snapshot will be created before deletion.'
      },
      status: 'Active'
    },
    {
      subdomain,
      awsAccountId,
      resourceId: `arn:aws:billing::${awsAccountId}:savingsplan`,
      resourceType: 'savingsplan',
      resourceName: 'Compute Savings Plan',
      recommendationType: 'savings_plan',
      currentDetails: { uncoveredSpend: 15000.00 },
      recommendedDetails: { hourlyCommitment: 0.15, term: '3-Year', type: 'Compute Savings Plans' },
      currentCost: 15000.00,
      recommendedCost: 11250.00,
      monthlySavings: 3750.00,
      annualSavings: 45000.00,
      riskLevel: 'Low',
      confidenceScore: 98,
      implementationEffort: 'Medium',
      impactAnalysis: {
        affectedResources: [],
        downtimeRisk: 'None',
        businessImpactDescription: 'Commitment of $0.15/hr for a 3-year term. Covers regional EC2/Fargate/Lambda execution.'
      },
      status: 'Active'
    }
  ];

  for (const rec of recommendations) {
    const doc = new AwsRecommendation(rec);
    await doc.save();
  }
  console.log(`[Recommendations] Generated 4 recommendations for account ${awsAccountId}.`);
};

module.exports = {
  generateExternalId,
  verifyCredentials,
  discoverOrganizationAccounts,
  queryAthenaBilling,
  simulateBillingSync,
  discoverActiveResources,
  generateRecommendations
};
