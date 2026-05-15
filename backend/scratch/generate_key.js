const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ApiKey = require('../models/ApiKey');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const generateInitialKey = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB...');

        const clientName = 'Master Admin';
        const subdomain = 'techvaseegrah'; // Based on your project name
        const key = `cg_${uuidv4().replace(/-/g, '')}`;

        const apiKey = await ApiKey.create({
            key,
            clientName,
            subdomain,
            permissions: ['admin', 'read', 'write'],
            isActive: true
        });

        console.log('\n==================================================');
        console.log('🚀 YOUR NEW API KEY HAS BEEN GENERATED!');
        console.log('==================================================');
        console.log(`CLIENT: ${clientName}`);
        console.log(`SUBDOMAIN: ${subdomain}`);
        console.log(`API KEY: ${key}`);
        console.log('==================================================');
        console.log('Save this key safely. You can use it in your "x-api-key" header.');
        
        process.exit(0);
    } catch (error) {
        console.error('Error generating key:', error);
        process.exit(1);
    }
};

generateInitialKey();
