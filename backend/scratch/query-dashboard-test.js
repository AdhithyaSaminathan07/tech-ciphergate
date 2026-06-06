const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Admin = require('../models/Admin');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

async function queryDashboardTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // Find Admin admin21 (subdomain: arun-tv)
        const admin21 = await Admin.findOne({ username: 'admin21' });
        // Find Admin admin (subdomain: admin)
        const adminDefault = await Admin.findOne({ username: 'admin' });

        const apiPort = process.env.PORT || 5002;
        const apiBaseUrl = `http://localhost:${apiPort}/api`;

        if (admin21) {
            console.log(`\nTesting with Admin: "${admin21.username}" (Subdomain: "${admin21.subdomain}")`);
            const token = generateToken(admin21._id, 'admin');
            try {
                const res = await axios.get(`${apiBaseUrl}/github/dashboard`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('Response Status:', res.status);
                console.log('showingCached:', res.data.showingCached);
                console.log('lastSuccessfulSync:', res.data.lastSuccessfulSync);
                console.log('Stats:', JSON.stringify(res.data.stats));
                console.log('Repositories count:', res.data.repositories?.length);
            } catch (err) {
                console.error('API Error for admin21:', err.response?.data || err.message);
            }
        }

        if (adminDefault) {
            console.log(`\nTesting with Admin: "${adminDefault.username}" (Subdomain: "${adminDefault.subdomain}")`);
            const token = generateToken(adminDefault._id, 'admin');
            try {
                const res = await axios.get(`${apiBaseUrl}/github/dashboard`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('Response Status:', res.status);
                console.log('showingCached:', res.data.showingCached);
                console.log('lastSuccessfulSync:', res.data.lastSuccessfulSync);
                console.log('Stats:', JSON.stringify(res.data.stats));
                console.log('Repositories count:', res.data.repositories?.length);
            } catch (err) {
                console.error('API Error for adminDefault:', err.response?.data || err.message);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

queryDashboardTest();
