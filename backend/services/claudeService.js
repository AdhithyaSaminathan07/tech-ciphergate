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
 * Executes a text completion with DeepSeek.
 * Ensures strict isolation by subdomain and enforces daily/monthly API cost limits.
 *
 * @param {string} subdomain - Company subdomain context
 * @param {string} systemPrompt - Instructions for the AI behavior
 * @param {string} userPrompt - Context/query details
 * @returns {Promise<string>} AI response text
 */
const generateCompletion = async (subdomain, systemPrompt, userPrompt, options = {}) => {
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

  // 2. Select API Key & Endpoint. Prefer .env so the shared low-cost DeepSeek key is used by default.
  const key = process.env.DEEPSEEK_API_KEY || settings.aiConfig.deepseekApiKey;

  if (!key) {
    throw new Error('DeepSeek API key is not configured. Set DEEPSEEK_API_KEY in the backend .env or add it in AI settings.');
  }

  const payload = {
    model: options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    max_tokens: options.maxTokens || 2500,
    temperature: options.temperature ?? 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  if (options.responseFormat) {
    payload.response_format = options.responseFormat;
  }

  const callDeepSeek = async (requestPayload) => axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    requestPayload,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json'
      },
      timeout: options.timeoutMs || 30000
    }
  );

  console.log(`[AI Service] Invoking DeepSeek API (${payload.model})...`);
  try {
    let response;
    try {
      response = await callDeepSeek(payload);
    } catch (error) {
      if (!options.responseFormat || error.response?.status !== 400) {
        throw error;
      }

      const retryPayload = { ...payload };
      delete retryPayload.response_format;
      console.warn('[AI Service] DeepSeek JSON mode rejected; retrying without response_format.');
      response = await callDeepSeek(retryPayload);
    }

    const content = response.data?.choices?.[0]?.message?.content;
    if (content) {
      return content;
    }
    throw new Error('DeepSeek response format unexpected');
  } catch (error) {
    console.error('[AI Service] DeepSeek API error:', error.response?.data || error.message);
    const apiErrorMsg = error.response?.data?.error?.message || error.message;
    throw new Error(`DeepSeek API request failed: ${apiErrorMsg}`);
  }
};

module.exports = {
  generateCompletion
};
