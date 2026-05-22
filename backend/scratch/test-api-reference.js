const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const testApi = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false, collection: 'admins' }));
        const Worker = mongoose.model('Worker', new mongoose.Schema({}, { strict: false, collection: 'workers' }));

        const admin = await Admin.findOne({ username: 'admin21' });
        if (!admin) {
            console.error('admin21 not found!');
            process.exit(1);
        }

        const worker = await Worker.findOne({ subdomain: admin.subdomain });
        if (!worker) {
            console.error('No workers found for subdomain:', admin.subdomain);
            process.exit(1);
        }

        console.log('Generating token for admin:', admin.username);
        const token = jwt.sign(
            { id: admin._id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log('Worker ID to use:', worker._id);
        const ticketId = '664be872b2a67e1a3c6d0e8f'; // Mock but valid ObjectId format
        const subTaskId = '0'; // A string index

        // Create a dummy file to upload
        const testFilePath = path.join(__dirname, 'test-img.png');
        fs.writeFileSync(testFilePath, 'dummy image content');

        const form = new FormData();
        form.append('ticketId', ticketId);
        form.append('subTaskId', subTaskId);
        form.append('workerId', worker._id.toString());
        form.append('references', fs.createReadStream(testFilePath));

        console.log('Sending API request to http://localhost:5002/api/tickets/completions/reference...');
        const response = await axios.post(
            'http://localhost:5002/api/tickets/completions/reference',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        console.log('API Response status:', response.status);
        console.log('API Response data:', response.data);

        // Clean up test file
        fs.unlinkSync(testFilePath);
        process.exit(0);
    } catch (error) {
        console.error('API Request failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
};

testApi();
