require('dotenv').config();
const mongoose = require('mongoose');
const AwsAccount = require('../models/AwsAccount');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  const accounts = await AwsAccount.find();
  console.log('Registered AWS Accounts in DB:');
  console.log(JSON.stringify(accounts, null, 2));
  await mongoose.connection.close();
}

main().catch(console.error);
