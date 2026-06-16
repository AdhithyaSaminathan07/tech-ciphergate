require('dotenv').config();
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { GlueClient, GetDatabasesCommand } = require('@aws-sdk/client-glue');
const { AthenaClient, ListWorkGroupsCommand } = require('@aws-sdk/client-athena');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

async function main() {
  console.log('AWS CONFIG:', {
    ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID ? 'LOADED' : 'MISSING',
    SECRET_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'LOADED' : 'MISSING',
    REGION: process.env.AWS_REGION || 'us-east-1'
  });

  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    const sts = new STSClient({ region, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log('STS Identity:', identity);
  } catch (err) {
    console.error('STS identity check failed:', err.message);
  }

  try {
    const s3 = new S3Client({ region, credentials });
    const buckets = await s3.send(new ListBucketsCommand({}));
    console.log('S3 Buckets:', buckets.Buckets.map(b => b.Name));
  } catch (err) {
    console.error('S3 query failed:', err.message);
  }

  try {
    const glue = new GlueClient({ region, credentials });
    const dbs = await glue.send(new GetDatabasesCommand({}));
    console.log('Glue Databases:', dbs.DatabaseList.map(d => d.Name));
  } catch (err) {
    console.error('Glue query failed:', err.message);
  }

  try {
    const athena = new AthenaClient({ region, credentials });
    const wgs = await athena.send(new ListWorkGroupsCommand({}));
    console.log('Athena Workgroups:', wgs.WorkGroups.map(w => w.Name));
  } catch (err) {
    console.error('Athena query failed:', err.message);
  }
}

main().catch(console.error);
