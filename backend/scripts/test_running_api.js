const axios = require('axios');

const testApi = async () => {
    try {
        const response = await axios.get('http://localhost:5002/api/settings/public/arun-tv');
        console.log('Public Settings API response on port 5002:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching settings from running API:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
    }
};

testApi();
