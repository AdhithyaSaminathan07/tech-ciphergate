const awsService = require('../services/awsService');
const { OrganizationsClient, ListAccountsCommand } = require('@aws-sdk/client-organizations');

// Mock the send method of OrganizationsClient to throw AWSOrganizationsNotInUseException
const originalSend = OrganizationsClient.prototype.send;
OrganizationsClient.prototype.send = async function(command) {
  if (command instanceof ListAccountsCommand) {
    const err = new Error("This AWS account is not enrolled in AWS Organizations.");
    err.name = 'AWSOrganizationsNotInUseException';
    throw err;
  }
  return originalSend.call(this, command);
};

const runTest = async () => {
  console.log("=== Testing AWSOrganizationsNotInUseException Handling ===");
  
  // Dummy credentials
  const credentials = {
    accessKeyId: 'mockAccessKey',
    secretAccessKey: 'mockSecretKey',
    sessionToken: 'mockSessionToken'
  };

  try {
    const capabilities = await awsService.discoverBillingCapability(credentials);
    
    console.log("Mocked Capabilities Response:\n", JSON.stringify(capabilities, null, 2));

    if (capabilities.organizations.status === 'Not Configured' && 
        capabilities.organizations.details === 'AWS Organizations is not enabled. FinOps features can still be used.') {
      console.log("\n[PASS] Successfully handled AWSOrganizationsNotInUseException and returned Not Configured status!");
      process.exit(0);
    } else {
      console.error("\n[FAIL] Handling failed. Received:", capabilities.organizations);
      process.exit(1);
    }
  } catch (err) {
    console.error("\n[FAIL] Test threw unexpected error:", err);
    process.exit(1);
  }
};

runTest();
