// task-tracker-backend/services/gowhatsValidationService.js

const axios = require('axios');

/**
 * Verifies GoWhats credentials by making a test API call to the Facebook Graph API.
 * @param {object} credentials - { apiKey, phoneNumberId }
 * @throws {Error} if credentials are invalid or the API is unreachable.
 */
const verifyGowhatsCredentials = async ({ apiKey, phoneNumberId }) => {
  try {
    // The Graph API version can be updated as new versions are released.
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}`;
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    // This is a simple, read-only API call. It fetches details about the phone number.
    // If it succeeds, it proves the API Key is valid and has access to the Phone Number ID.
    await axios.get(url, { headers });

    // If the request does not throw an error, authentication is successful.
    return true;

  } catch (error) {
    if (error.response) {
      // The API responded with an error status (4xx or 5xx).
      console.error('GoWhats credential validation failed:', error.response.data.error.message);
      throw new Error('Invalid GoWhats credentials. Please check your API Key and Phone Number ID.');
    } else {
      // A network error occurred or something else prevented the request.
      console.error('Error verifying GoWhats credentials:', error.message);
      throw new Error('Could not connect to GoWhats to verify credentials. Please try again.');
    }
  }
};

module.exports = { verifyGowhatsCredentials };