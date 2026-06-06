const axios = require('axios');
const Settings = require('../models/Settings');

/**
 * Resets or updates the rate limit counters in Settings if needed.
 * @param {object} settings - Mongoose settings document
 */
const checkAndResetAiCounters = (settings) => {
  if (!settings.aiConfig) {
    settings.aiConfig = {};
  }
  
  const now = new Date();
  const lastReset = settings.aiConfig.aiLastResetDate || now;
  
  const nowDayStr = now.toDateString();
  const lastResetDayStr = lastReset.toDateString();
  
  const nowMonth = now.getMonth();
  const lastResetMonth = lastReset.getMonth();
  const nowYear = now.getFullYear();
  const lastResetYear = lastReset.getFullYear();
  
  let modified = false;
  
  if (nowDayStr !== lastResetDayStr) {
    settings.aiConfig.aiDailyRequestCount = 0;
    modified = true;
  }
  
  if (nowMonth !== lastResetMonth || nowYear !== lastResetYear) {
    settings.aiConfig.aiMonthlyRequestCount = 0;
    modified = true;
  }
  
  if (modified) {
    settings.aiConfig.aiLastResetDate = now;
  }
  
  return modified;
};

/**
 * Executes a text completion with Claude, falling back to DeepSeek if needed.
 * Ensures strict isolation by subdomain and enforces daily/monthly API cost limits.
 * 
 * @param {string} subdomain - Company subdomain context
 * @param {string} systemPrompt - Instructions for the AI behavior
 * @param {string} userPrompt - Context/query details
 * @returns {Promise<string>} AI response text
 */
const generateCompletion = async (subdomain, systemPrompt, userPrompt) => {
  if (!subdomain || subdomain === 'main') {
    throw new Error('Invalid subdomain context');
  }

  // 1. Fetch settings and check limits
  let settings = await Settings.findOne({ subdomain });
  if (!settings) {
    settings = new Settings({ subdomain });
    await settings.save();
  }

  const aiConfig = settings.aiConfig || {};
  if (aiConfig.aiFeaturesEnabled === false) {
    throw new Error('AI features are disabled by the administrator');
  }

  // Check resets
  const counterUpdated = checkAndResetAiCounters(settings);
  
  // Verify daily limit
  if (settings.aiConfig.aiDailyRequestCount >= settings.aiConfig.aiMaxDailyRequests) {
    if (counterUpdated) {
      await settings.save();
    }
    throw new Error(`Daily AI usage limit reached (${settings.aiConfig.aiMaxDailyRequests} requests).`);
  }

  // Verify monthly limit
  if (settings.aiConfig.aiMonthlyRequestCount >= settings.aiConfig.aiMaxMonthlyRequests) {
    if (counterUpdated) {
      await settings.save();
    }
    throw new Error(`Monthly AI usage limit reached (${settings.aiConfig.aiMaxMonthlyRequests} requests).`);
  }

  // Increment counters and save
  settings.aiConfig.aiDailyRequestCount = (settings.aiConfig.aiDailyRequestCount || 0) + 1;
  settings.aiConfig.aiMonthlyRequestCount = (settings.aiConfig.aiMonthlyRequestCount || 0) + 1;
  
  // Mark modified explicitly since sub-documents in Mixed types aren't always auto-detected
  settings.markModified('aiConfig');
  await settings.save();

  // 2. Select API Key & Endpoint
  const settingsClaudeKey = settings.aiConfig.claudeApiKey;
  const envClaudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const key = settingsClaudeKey || envClaudeKey;

  if (!key) {
    throw new Error('Claude API key is not configured in the settings or environment.');
  }

  console.log(`[AI Service] Invoking Claude API...`);
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 45000
      }
    );

    const content = response.data?.content;
    if (Array.isArray(content) && content.length > 0) {
      return content[0].text;
    }
    throw new Error('Claude response format unexpected');
  } catch (error) {
    console.error('[AI Service] Claude API error:', error.response?.data || error.message);
    const apiErrorMsg = error.response?.data?.error?.message || error.message;
    throw new Error(`Claude API request failed: ${apiErrorMsg}`);
  }
};

module.exports = {
  generateCompletion
};
