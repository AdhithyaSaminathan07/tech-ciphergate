require('dotenv').config();
const { IAMClient, CreateRoleCommand, DeleteRoleCommand } = require('@aws-sdk/client-iam');
const awsService = require('../services/awsService');
const { v4: uuidv4 } = require('uuid');

const runTest = async () => {
  console.log('=== Starting AWS Trust Policy & IAM Role Verification Test ===');
  
  // 1. Resolve and Validate configured Principal Account ID
  let principalAccountId;
  try {
    principalAccountId = await awsService.getPrincipalAccountId();
    console.log(`[PASS] Configured AWS Principal Account ID resolved & validated: ${principalAccountId}`);
  } catch (err) {
    console.error(`[FAIL] Configured AWS Principal Account ID resolution failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Generate Trust Policy Document
  const mockExternalId = uuidv4();
  let policyData;
  try {
    policyData = await awsService.generateTrustPolicy(mockExternalId);
    console.log('[PASS] Dynamically generated Trust Policy successfully:');
    console.log(policyData.policyDocument);
  } catch (err) {
    console.error(`[FAIL] Trust Policy generation failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Attempt to create a temporary IAM role in AWS using the generated policy document
  const tempRoleName = `CipherGate-TrustPolicyTest-${Math.floor(Math.random() * 100000)}`;
  console.log(`\nAttempting to create temporary IAM Role "${tempRoleName}" in AWS to test trust policy validity...`);
  
  const iamClient = new IAMClient({ region: 'us-east-1' });
  
  try {
    const createCommand = new CreateRoleCommand({
      RoleName: tempRoleName,
      AssumeRolePolicyDocument: policyData.policyDocument,
      Description: 'Temporary role created by CipherGate integration test to verify trust policy format.'
    });

    const createResponse = await iamClient.send(createCommand);
    const createdRoleArn = createResponse.Role.Arn;
    console.log(`[PASS] Successfully created IAM Role: ${createdRoleArn}`);
    
    // Clean up: delete the temporary role
    console.log(`Cleaning up: Deleting temporary IAM Role "${tempRoleName}"...`);
    const deleteCommand = new DeleteRoleCommand({
      RoleName: tempRoleName
    });
    await iamClient.send(deleteCommand);
    console.log('[PASS] Successfully cleaned up temporary role.');
    console.log('\n=== AWS TRUST POLICY INTEGRATION TEST PASSED ===');
    process.exit(0);
  } catch (err) {
    console.error(`\n[FAIL] IAM Role creation failed: ${err.message}`);
    console.error('This indicates that the generated Trust Policy document was invalid or rejected by AWS.');
    console.error('Please ensure your environment has valid AWS CLI / SDK credentials and permissions to create/delete IAM Roles.');
    process.exit(1);
  }
};

runTest();
