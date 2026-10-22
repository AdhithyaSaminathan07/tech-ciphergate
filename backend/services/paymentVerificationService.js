const crypto = require('crypto');

/**
 * Timing-safe string/buffer comparison to prevent timing attacks.
 */
const safeCompare = (left = '', right = '') => {
  const leftBuf = Buffer.from(String(left));
  const rightBuf = Buffer.from(String(right));
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

/**
 * Verifies gateway webhook signatures from raw payload buffer.
 * Implements official gateway specifications for Razorpay, Stripe, and Cashfree.
 * 
 * @param {Object} params
 * @param {string} params.gateway - 'razorpay' | 'stripe' | 'cashfree'
 * @param {Buffer|string} params.rawBody - Raw unparsed request body buffer or string
 * @param {string} params.signature - Signature header from gateway
 * @param {string} params.secret - Gateway webhook secret
 * @param {Object} [params.headers] - Additional request headers (required for Cashfree/Stripe timestamps)
 * @returns {{ verified: boolean, error?: string }}
 */
const verifyGatewayWebhookSignature = ({ gateway, rawBody, signature, secret, headers = {} }) => {
  if (!rawBody || !signature || !secret) {
    return { verified: false, error: 'Missing rawBody, signature, or secret for webhook verification.' };
  }

  const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

  try {
    switch (gateway.toLowerCase()) {
      case 'razorpay': {
        // Razorpay Spec: HMAC-SHA256 hex digest of raw body
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(rawString)
          .digest('hex');
        const match = safeCompare(signature, expectedSignature);
        return match
          ? { verified: true }
          : { verified: false, error: 'Razorpay webhook signature mismatch.' };
      }

      case 'stripe': {
        // Stripe Spec: Stripe-Signature header format: t=timestamp,v1=signature
        const parts = signature.split(',').reduce((acc, part) => {
          const [k, v] = part.split('=');
          if (k && v) acc[k.trim()] = v.trim();
          return acc;
        }, {});

        const timestamp = parts.t;
        const v1Sig = parts.v1;

        if (!timestamp || !v1Sig) {
          return { verified: false, error: 'Malformed Stripe signature header.' };
        }

        // Enforce 5-minute replay-attack tolerance
        const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
        if (ageSeconds > 300 || ageSeconds < -60) {
          return { verified: false, error: 'Stripe webhook signature timestamp expired or outside tolerance.' };
        }

        const signedPayload = `${timestamp}.${rawString}`;
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(signedPayload)
          .digest('hex');

        const match = safeCompare(v1Sig, expectedSignature);
        return match
          ? { verified: true }
          : { verified: false, error: 'Stripe webhook signature mismatch.' };
      }

      case 'cashfree': {
        // Cashfree PG v3 Spec: HMAC-SHA256 of `${timestamp}${rawBody}` encoded in base64
        const timestamp = headers['x-webhook-timestamp'] || headers['x-cf-timestamp'];
        if (!timestamp) {
          return { verified: false, error: 'Missing x-webhook-timestamp header for Cashfree.' };
        }

        // Enforce 5-minute replay-attack tolerance
        const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
        if (ageSeconds > 300 || ageSeconds < -60) {
          return { verified: false, error: 'Cashfree webhook timestamp expired or outside tolerance.' };
        }

        const signedPayload = `${timestamp}${rawString}`;
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(signedPayload)
          .digest('base64');

        const match = safeCompare(signature, expectedSignature);
        return match
          ? { verified: true }
          : { verified: false, error: 'Cashfree webhook signature mismatch.' };
      }

      default:
        return { verified: false, error: `Unsupported gateway for webhook verification: ${gateway}` };
    }
  } catch (err) {
    return { verified: false, error: `Signature verification exception: ${err.message}` };
  }
};

/**
 * Verifies server-to-server payment authenticity using authoritative gateway confirmation.
 * Never trusts caller-supplied payment status or an HMAC alone as proof of payment.
 * 
 * @param {Object} params
 * @param {string} params.gateway - 'razorpay' | 'stripe' | 'cashfree'
 * @param {string} params.gatewayPaymentId - Authoritative payment ID from the gateway
 * @param {string} [params.gatewayOrderId] - Expected gateway order ID
 * @param {number} params.expectedAmount - Expected commercial total in major currency units (e.g. 75000 INR)
 * @param {string} params.expectedCurrency - Expected 3-letter currency code (e.g. 'INR')
 * @param {Function} params.gatewayApiClient - Authoritative gateway verification client function
 * @returns {Promise<{ verified: boolean, error?: string, verifiedAmount?: number, gatewayDetails?: object }>}
 */
const verifyServerToServerPayment = async ({
  gateway,
  gatewayPaymentId,
  gatewayOrderId,
  expectedAmount,
  expectedCurrency,
  gatewayApiClient
}) => {
  if (!gatewayPaymentId || typeof gatewayPaymentId !== 'string') {
    return { verified: false, error: 'gatewayPaymentId is required for authoritative payment verification.' };
  }

  if (!gateway || typeof gateway !== 'string') {
    return { verified: false, error: 'gateway identity is required.' };
  }

  // Authoritative gateway confirmation is strictly required
  if (typeof gatewayApiClient !== 'function') {
    return {
      verified: false,
      error: 'Authoritative gateway verification client is required. Caller-supplied status or signatures alone are not accepted.'
    };
  }

  try {
    const paymentRecord = await gatewayApiClient({
      gateway,
      paymentId: gatewayPaymentId,
      orderId: gatewayOrderId
    });

    if (!paymentRecord || typeof paymentRecord !== 'object') {
      return { verified: false, error: 'Gateway returned empty or invalid response for payment lookup.' };
    }

    // 1. Validate gateway identity
    if (paymentRecord.gateway && paymentRecord.gateway.toLowerCase() !== gateway.toLowerCase()) {
      return { verified: false, error: `Gateway identity mismatch: claimed ${gateway}, record has ${paymentRecord.gateway}.` };
    }

    // 2. Validate authoritative capture status
    const status = String(paymentRecord.status || '').toLowerCase();
    const capturedStatuses = ['captured', 'succeeded', 'paid', 'success'];
    if (!capturedStatuses.includes(status)) {
      return {
        verified: false,
        error: `Payment is not confirmed captured on gateway. Authoritative status: ${status || 'unknown'}`
      };
    }

    // 3. Validate order linkage if order ID was provided
    if (gatewayOrderId && paymentRecord.orderId) {
      if (String(paymentRecord.orderId).trim() !== String(gatewayOrderId).trim()) {
        return {
          verified: false,
          error: `Order linkage mismatch: expected ${gatewayOrderId}, gateway recorded ${paymentRecord.orderId}.`
        };
      }
    }

    // 4. Validate amount (accounting for gateways that store in minor units like paise or cents)
    let recordedAmount = Number(paymentRecord.amount);
    if (paymentRecord.isMinorUnit) {
      recordedAmount = recordedAmount / 100;
    }

    if (Math.abs(recordedAmount - expectedAmount) > 0.01) {
      return {
        verified: false,
        error: `Amount mismatch: expected ${expectedAmount}, gateway recorded ${recordedAmount}.`
      };
    }

    // 5. Validate currency
    const recordedCurrency = String(paymentRecord.currency || 'INR').toUpperCase();
    if (recordedCurrency !== String(expectedCurrency || 'INR').toUpperCase()) {
      return {
        verified: false,
        error: `Currency mismatch: expected ${expectedCurrency}, gateway recorded ${recordedCurrency}.`
      };
    }

    return {
      verified: true,
      verifiedAmount: recordedAmount,
      gatewayDetails: paymentRecord
    };

  } catch (apiErr) {
    return { verified: false, error: `Authoritative gateway verification exception: ${apiErr.message}` };
  }
};

/**
 * Sanitizes arbitrary raw payloads to strictly prevent storing authorization secrets,
 * API keys, passwords, or cardholder security data (PAN, CVV).
 * 
 * @param {Object} payload
 * @returns {Object|null} Sanitized payload
 */
const sanitizeIntakePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const CREDENTIAL_REGEX = /^(authorization|password|token|secret|bearer|cookie|auth_token|api_key)$/i;
  const SENSITIVE_FIELD_REGEX = /password|token|secret|authorization|bearer|cvv|cvc|pan|expiry|auth|cookie|key/i;

  const sanitizeValue = (val, keyName = '') => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      if (SENSITIVE_FIELD_REGEX.test(keyName)) {
        return '[REDACTED]';
      }
      if (val.length > 500) return val.substring(0, 500) + '...[truncated]';
      return val;
    }
    if (Array.isArray(val)) {
      return val.slice(0, 20).map(item => sanitizeValue(item, keyName));
    }
    if (typeof val === 'object') {
      const sanitizedObj = {};
      for (const [k, v] of Object.entries(val)) {
        if (CREDENTIAL_REGEX.test(k) || SENSITIVE_FIELD_REGEX.test(k)) {
          sanitizedObj[k] = '[REDACTED]';
        } else {
          sanitizedObj[k] = sanitizeValue(v, k);
        }
      }
      return sanitizedObj;
    }
    return String(val);
  };

  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (CREDENTIAL_REGEX.test(key)) {
      continue; // Exclude top-level credentials completely
    }
    clean[key] = sanitizeValue(value, key);
  }

  return clean;
};

module.exports = {
  verifyGatewayWebhookSignature,
  verifyServerToServerPayment,
  sanitizeIntakePayload,
  safeCompare
};
