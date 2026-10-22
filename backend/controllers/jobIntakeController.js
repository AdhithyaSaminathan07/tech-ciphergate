const { z } = require('zod');
const asyncHandler = require('express-async-handler');
const jobIntakeService = require('../services/jobIntakeService');
const paymentVerificationService = require('../services/paymentVerificationService');
const JobIntake = require('../models/JobIntake');
const Admin = require('../models/Admin');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Zod Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

const CustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(100),
  phone: z.string().trim().min(10, 'Phone must be at least 10 characters').max(15).regex(/^[+0-9\s-]+$/, 'Invalid phone number format'),
  email: z.string().trim().email('Invalid email address').max(100).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().default(''),
  gstin: z.string().trim().max(15).regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i, 'Invalid GSTIN format').optional().or(z.literal(''))
}).strict();

const LineItemSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required').max(250),
  hsn: z.string().trim().max(20).optional().default(''),
  gst: z.number().min(0, 'GST cannot be negative').max(28, 'GST cannot exceed 28%').default(18),
  qty: z.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1').max(10000).default(1),
  rate: z.number().min(0, 'Rate cannot be negative').max(100000000),
  total: z.number().min(0, 'Total cannot be negative').max(100000000)
}).strict();

const ReferenceFileSchema = z.object({
  url: z.string().url('Invalid reference file URL').max(1000),
  name: z.string().trim().min(1, 'File name is required').max(255),
  size: z.number().min(0).max(104857600).default(0), // 100MB max
  fileType: z.string().trim().max(100).default('application/octet-stream')
}).strict();

const JobDetailsSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().max(5000).optional().default(''),
  serviceCategory: z.string().trim().max(50).optional().default('General'),
  team: z.string().trim().max(50).optional().default('DEV'),
  departmentId: z.string().trim().optional(),
  teamSize: z.number().int().positive().optional(),
  requiredMembersCount: z.number().int().positive().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('High'),
  deliverables: z.array(z.string().trim().max(200)).max(30).optional().default([]),
  referenceFiles: z.array(ReferenceFileSchema).max(10).optional().default([]),
  dueDate: z.union([z.string().datetime(), z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}/)]).optional().nullable()
}).strict();

const S2SPaymentInputSchema = z.object({
  gateway: z.enum(['razorpay', 'stripe', 'cashfree', 'website_direct']),
  amount: z.number().positive('Payment amount must be greater than zero').max(100000000),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
  transactionRef: z.string().trim().min(1, 'Transaction reference is required').max(100),
  gatewayOrderId: z.string().trim().max(100).optional()
}).strict();

const CheckoutIntakeSchema = z.object({
  orderId: z.string().trim().min(1, 'Order ID is required').max(64).regex(/^[A-Za-z0-9_-]+$/, 'Order ID contains invalid characters'),
  subdomain: z.string().trim().min(2, 'Subdomain is required').max(64).regex(/^[a-z0-9-]+$/, 'Subdomain contains invalid characters'),
  customer: CustomerSchema,
  jobDetails: JobDetailsSchema,
  items: z.array(LineItemSchema).min(1, 'At least one line item is required').max(50),
  payment: S2SPaymentInputSchema
}).strict();

const OrderPaymentSchema = z.object({
  gateway: z.enum(['manual', 'website_direct', 'razorpay', 'stripe', 'cashfree']).default('manual'),
  amount: z.number().positive('Payment amount must be greater than zero').max(100000000).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
  transactionRef: z.string().trim().max(100).optional().default(''),
  paymentStatus: z.enum(['PENDING', 'VERIFIED', 'FAILED']).default('PENDING'),
  manualVerification: z.boolean().optional().default(true)
}).strict();

const OrderIntakeSchema = z.object({
  orderId: z.string().trim().min(1, 'Order ID is required').max(64).regex(/^[A-Za-z0-9_-]+$/, 'Order ID contains invalid characters'),
  subdomain: z.string().trim().min(2, 'Subdomain is required').max(64).regex(/^[a-z0-9-]+$/, 'Subdomain contains invalid characters'),
  customer: CustomerSchema,
  jobDetails: JobDetailsSchema,
  items: z.array(LineItemSchema).min(1, 'At least one line item is required').max(50),
  payment: OrderPaymentSchema.optional().default({ gateway: 'manual', currency: 'INR', paymentStatus: 'PENDING' }),
  rawPayload: z.any().optional()
}).strict();

// ─────────────────────────────────────────────────────────────────────────────
// 2. Gateway Webhook Configuration Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_GATEWAYS = ['razorpay', 'stripe', 'cashfree'];

const getWebhookSecretForGateway = (gateway) => {
  switch (gateway.toLowerCase()) {
    case 'razorpay':
      return process.env.RAZORPAY_WEBHOOK_SECRET;
    case 'stripe':
      return process.env.STRIPE_WEBHOOK_SECRET;
    case 'cashfree':
      return process.env.CASHFREE_WEBHOOK_SECRET;
    default:
      return null;
  }
};

/**
 * Normalizes gateway webhook event into standard JobIntake structure.
 */
const normalizeWebhookPayload = (gateway, body, query = {}) => {
  const g = gateway.toLowerCase();

  if (g === 'razorpay') {
    const paymentEntity = body.payload?.payment?.entity;
    if (!paymentEntity) return null;

    const notes = paymentEntity.notes || {};
    const orderId = notes.orderId || body.orderId || paymentEntity.order_id || paymentEntity.id;
    const subdomain = notes.subdomain || query.subdomain || 'tech-vaseegrah';
    const amount = Number(paymentEntity.amount) / 100; // Minor units to major

    return {
      orderId,
      subdomain,
      customer: {
        name: notes.customerName || paymentEntity.name || 'Online Customer',
        email: paymentEntity.email || notes.customerEmail || '',
        phone: notes.contact || paymentEntity.contact || '0000000000',
        address: notes.address || '',
        gstin: notes.gstin || ''
      },
      jobDetails: {
        title: notes.jobTitle || `Web Order ${orderId}`,
        description: notes.jobDescription || 'Online checkout job order',
        team: notes.team || 'DEV',
        priority: notes.priority || 'High',
        deliverables: notes.deliverables ? String(notes.deliverables).split(',') : []
      },
      items: notes.items ? JSON.parse(notes.items) : [{
        description: notes.jobTitle || `Online Service - Order #${orderId}`,
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: amount,
        total: amount
      }],
      payment: {
        gateway: 'razorpay',
        amount,
        currency: (paymentEntity.currency || 'INR').toUpperCase(),
        transactionRef: paymentEntity.id,
        gatewayOrderId: paymentEntity.order_id || undefined,
        verifiedAt: new Date(paymentEntity.created_at ? paymentEntity.created_at * 1000 : Date.now()),
        paymentStatus: 'VERIFIED'
      },
      rawPayload: body
    };
  }

  if (g === 'stripe') {
    const obj = body.data?.object;
    if (!obj) return null;

    const metadata = obj.metadata || {};
    const orderId = metadata.orderId || obj.client_reference_id || obj.id;
    const subdomain = metadata.subdomain || query.subdomain || 'tech-vaseegrah';
    const rawAmt = obj.amount_total != null ? obj.amount_total : (obj.amount != null ? obj.amount : 0);
    const amount = Number(rawAmt) / 100;

    const customerDetails = obj.customer_details || {};

    return {
      orderId,
      subdomain,
      customer: {
        name: customerDetails.name || metadata.customerName || 'Online Customer',
        email: customerDetails.email || metadata.customerEmail || '',
        phone: customerDetails.phone || metadata.customerPhone || '0000000000',
        address: customerDetails.address?.line1 || metadata.address || '',
        gstin: metadata.gstin || ''
      },
      jobDetails: {
        title: metadata.jobTitle || `Web Order ${orderId}`,
        description: metadata.jobDescription || 'Online checkout job order',
        team: metadata.team || 'DEV',
        priority: metadata.priority || 'High',
        deliverables: metadata.deliverables ? String(metadata.deliverables).split(',') : []
      },
      items: metadata.items ? JSON.parse(metadata.items) : [{
        description: metadata.jobTitle || `Online Service - Order #${orderId}`,
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: amount,
        total: amount
      }],
      payment: {
        gateway: 'stripe',
        amount,
        currency: (obj.currency || 'INR').toUpperCase(),
        transactionRef: obj.payment_intent || obj.id,
        gatewayOrderId: obj.id,
        verifiedAt: new Date(obj.created ? obj.created * 1000 : Date.now()),
        paymentStatus: 'VERIFIED'
      },
      rawPayload: body
    };
  }

  if (g === 'cashfree') {
    const data = body.data || {};
    const order = data.order || {};
    const payment = data.payment || {};

    const orderId = order.order_id || data.order_id;
    const orderTags = order.order_tags || {};
    const subdomain = orderTags.subdomain || query.subdomain || 'tech-vaseegrah';
    const amount = Number(payment.payment_amount || order.order_amount || 0);

    const customerDetails = data.customer_details || {};

    return {
      orderId,
      subdomain,
      customer: {
        name: customerDetails.customer_name || orderTags.customerName || 'Online Customer',
        email: customerDetails.customer_email || orderTags.customerEmail || '',
        phone: customerDetails.customer_phone || orderTags.customerPhone || '0000000000',
        address: orderTags.address || '',
        gstin: orderTags.gstin || ''
      },
      jobDetails: {
        title: orderTags.jobTitle || `Web Order ${orderId}`,
        description: orderTags.jobDescription || 'Online checkout job order',
        team: orderTags.team || 'DEV',
        priority: orderTags.priority || 'High',
        deliverables: orderTags.deliverables ? String(orderTags.deliverables).split(',') : []
      },
      items: orderTags.items ? JSON.parse(orderTags.items) : [{
        description: orderTags.jobTitle || `Online Service - Order #${orderId}`,
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: amount,
        total: amount
      }],
      payment: {
        gateway: 'cashfree',
        amount,
        currency: (payment.payment_currency || order.order_currency || 'INR').toUpperCase(),
        transactionRef: String(payment.cf_payment_id || payment.payment_id || orderId),
        gatewayOrderId: orderId,
        verifiedAt: new Date(payment.payment_time ? payment.payment_time : Date.now()),
        paymentStatus: 'VERIFIED'
      },
      rawPayload: body
    };
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Controller Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles authenticated server-to-server checkout intake.
 * Requires API Key with 'intake:write' or 'admin' permission.
 * Strictly verifies payment with authoritative gateway confirmation.
 * 
 * @route POST /api/intake/checkout
 */
const handleCheckoutIntake = asyncHandler(async (req, res) => {
  // 1. Zod Validation
  const parseResult = CheckoutIntakeSchema.safeParse(req.body);
  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }));
    return res.status(400).json({
      success: false,
      message: 'Invalid intake payload structure.',
      errors: formattedErrors
    });
  }

  const intakeData = parseResult.data;

  // 2. Tenant isolation check against API key
  if (req.apiKey && req.apiKey.permissions && !req.apiKey.permissions.includes('admin')) {
    if (req.apiKey.subdomain && req.apiKey.subdomain !== intakeData.subdomain) {
      return res.status(403).json({
        success: false,
        message: `API key is scoped to subdomain '${req.apiKey.subdomain}', but payload specified '${intakeData.subdomain}'.`
      });
    }
  }

  // 3. Line items sum check
  const itemsSum = intakeData.items.reduce((sum, item) => sum + item.total, 0);
  if (Math.abs(itemsSum - intakeData.payment.amount) > 1.0) {
    return res.status(400).json({
      success: false,
      message: `Commercial amount mismatch: items sum (${itemsSum}) does not match payment amount (${intakeData.payment.amount}).`
    });
  }

  // 4. Authoritative Server-to-Server Payment Verification
  // NEVER accept caller-supplied paymentStatus. Authoritative confirmation is strictly required.
  const gatewayClient = req.gatewayApiClient || (req.app && req.app.get('gatewayApiClient'));

  if (!gatewayClient || typeof gatewayClient !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'Payment verification service is not configured for authoritative verification.'
    });
  }

  const verification = await paymentVerificationService.verifyServerToServerPayment({
    gateway: intakeData.payment.gateway,
    gatewayPaymentId: intakeData.payment.transactionRef,
    gatewayOrderId: intakeData.payment.gatewayOrderId,
    expectedAmount: intakeData.payment.amount,
    expectedCurrency: intakeData.payment.currency,
    gatewayApiClient: gatewayClient
  });

  if (!verification || !verification.verified) {
    return res.status(402).json({
      success: false,
      message: `Payment verification failed: ${(verification && verification.error) || 'Payment not confirmed captured.'}`
    });
  }

  // Strict Authoritative Result Validation (Fail-Closed)
  const details = verification.gatewayDetails || {};
  const verifiedAmount = verification.verifiedAmount;

  // 1. Reject verification results unless verifiedAmount is present, finite, positive, and matches expected amount
  const isValidAmount =
    typeof verifiedAmount === 'number' &&
    Number.isFinite(verifiedAmount) &&
    verifiedAmount > 0 &&
    Math.abs(verifiedAmount - intakeData.payment.amount) <= 0.01;

  if (!isValidAmount) {
    return res.status(402).json({
      success: false,
      message: 'Payment verification failed: verifiedAmount is missing, invalid, or does not match expected amount.'
    });
  }

  // 2. Require authoritative gateway identity and reject missing or mismatched gateway
  const verifiedGateway = details.gateway ? String(details.gateway).toLowerCase().trim() : '';
  if (!verifiedGateway || verifiedGateway !== intakeData.payment.gateway.toLowerCase().trim()) {
    return res.status(402).json({
      success: false,
      message: `Payment verification failed: Gateway identity is missing or mismatched (expected '${intakeData.payment.gateway}', gateway recorded '${details.gateway || 'missing'}').`
    });
  }

  // 3. Require authoritative captured / succeeded status
  const verifiedStatus = details.status ? String(details.status).toLowerCase().trim() : '';
  const validCapturedStatuses = ['captured', 'succeeded', 'paid', 'success'];
  if (!verifiedStatus || !validCapturedStatuses.includes(verifiedStatus)) {
    return res.status(402).json({
      success: false,
      message: `Payment verification failed: Authoritative status '${details.status || 'missing'}' is not captured.`
    });
  }

  // 4. Require authoritative currency and reject missing or mismatched currency
  const verifiedCurrency = details.currency ? String(details.currency).toUpperCase().trim() : '';
  if (!verifiedCurrency || verifiedCurrency !== intakeData.payment.currency.toUpperCase().trim()) {
    return res.status(402).json({
      success: false,
      message: `Payment verification failed: Currency is missing or mismatched (expected '${intakeData.payment.currency}', gateway recorded '${details.currency || 'missing'}').`
    });
  }

  // 5. Require authoritative payment ID and reject missing or mismatched ID
  const recordedPaymentId = details.paymentId || details.id;
  if (!recordedPaymentId || String(recordedPaymentId).trim() !== String(intakeData.payment.transactionRef).trim()) {
    return res.status(402).json({
      success: false,
      message: `Payment verification failed: Payment ID is missing or mismatched (expected '${intakeData.payment.transactionRef}', gateway recorded '${recordedPaymentId || 'missing'}').`
    });
  }

  // 6. If gatewayOrderId was expected, require authoritative orderId and reject missing or mismatched order linkage
  if (intakeData.payment.gatewayOrderId) {
    const recordedOrderId = details.orderId ? String(details.orderId).trim() : '';
    if (!recordedOrderId || recordedOrderId !== String(intakeData.payment.gatewayOrderId).trim()) {
      return res.status(402).json({
        success: false,
        message: `Payment verification failed: Order linkage is missing or mismatched (expected '${intakeData.payment.gatewayOrderId}', gateway recorded '${details.orderId || 'missing'}').`
      });
    }
  }

  // Set trusted verification attributes internally ONLY using verifiedAmount from authoritative verification
  const trustedIntakeData = {
    ...intakeData,
    payment: {
      ...intakeData.payment,
      amount: verifiedAmount, // Strictly verifiedAmount, NO fallback!
      currency: verifiedCurrency,
      paymentStatus: 'VERIFIED',
      verifiedAt: new Date()
    },
    rawPayload: req.body
  };

  try {
    const result = await jobIntakeService.processJobIntake({
      intakeData: trustedIntakeData,
      subdomain: intakeData.subdomain
    });

    const statusCode = result.isDuplicate ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      isDuplicate: !!result.isDuplicate,
      orderId: result.orderId,
      invoiceNo: result.invoiceNo,
      invoiceId: result.invoiceId,
      ticketId: result.ticketId,
      status: result.status
    });

  } catch (error) {
    if (error.statusCode === 409 || error.isProcessing) {
      return res.status(409).json({
        success: false,
        message: error.message || 'Order is currently being processed by another worker.'
      });
    }

    if (error.statusCode === 402) {
      return res.status(402).json({
        success: false,
        message: error.message
      });
    }

    console.error('[JobIntakeController] Unexpected execution error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred while orchestrating job intake.'
    });
  }
});

/**
 * Handles incoming public gateway webhooks (Razorpay, Stripe, Cashfree).
 * Verifies HMAC signature using raw request body buffer.
 * 
 * @route POST /api/intake/webhook/:gateway
 */
const handleGatewayWebhook = asyncHandler(async (req, res) => {
  const gateway = String(req.params.gateway || '').toLowerCase();

  // 1. Gateway validation
  if (!SUPPORTED_GATEWAYS.includes(gateway)) {
    return res.status(400).json({
      success: false,
      message: `Unsupported gateway '${gateway}'. Supported gateways: ${SUPPORTED_GATEWAYS.join(', ')}`
    });
  }

  // 2. Secret check
  const secret = req.webhookSecret || getWebhookSecretForGateway(gateway);
  if (!secret) {
    console.error(`[JobIntake Webhook] Missing webhook secret for gateway: ${gateway}`);
    return res.status(500).json({
      success: false,
      message: 'Webhook verification secret not configured.'
    });
  }

  // 3. Extract signature header
  let signature = '';
  if (gateway === 'razorpay') {
    signature = req.header('x-razorpay-signature') || '';
  } else if (gateway === 'stripe') {
    signature = req.header('stripe-signature') || '';
  } else if (gateway === 'cashfree') {
    signature = req.header('x-webhook-signature') || req.header('x-cf-signature') || '';
  }

  if (!signature) {
    return res.status(401).json({
      success: false,
      message: `Missing signature header for ${gateway} webhook.`
    });
  }

  // 4. Verify HMAC signature using raw request body
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const verifyResult = paymentVerificationService.verifyGatewayWebhookSignature({
    gateway,
    rawBody,
    signature,
    secret,
    headers: req.headers
  });

  if (!verifyResult.verified) {
    return res.status(401).json({
      success: false,
      message: verifyResult.error || 'Invalid webhook signature.'
    });
  }

  // 5. Filter for captured/successful payment events
  const body = req.body || {};
  let isPaymentSuccess = false;

  if (gateway === 'razorpay') {
    isPaymentSuccess = body.event === 'payment.captured' || body.event === 'order.paid';
  } else if (gateway === 'stripe') {
    isPaymentSuccess = body.type === 'checkout.session.completed' || body.type === 'payment_intent.succeeded';
  } else if (gateway === 'cashfree') {
    isPaymentSuccess = body.type === 'PAYMENT_SUCCESS_WEBHOOK' ||
      body.data?.payment?.payment_status === 'SUCCESS' ||
      body.data?.order?.order_status === 'PAID';
  }

  if (!isPaymentSuccess) {
    // Non-captured event acknowledged without processing
    return res.status(200).json({
      success: true,
      ignored: true,
      message: `Event '${body.event || body.type}' ignored (non-capture event).`
    });
  }

  // 6. Normalize payload
  const normalized = normalizeWebhookPayload(gateway, body, req.query);
  if (!normalized || !normalized.orderId || !normalized.subdomain) {
    return res.status(400).json({
      success: false,
      message: 'Unable to extract order and tenant references from webhook payload.'
    });
  }

  try {
    const result = await jobIntakeService.processJobIntake({
      intakeData: normalized,
      subdomain: normalized.subdomain
    });

    return res.status(200).json({
      success: true,
      isDuplicate: !!result.isDuplicate,
      orderId: result.orderId,
      invoiceNo: result.invoiceNo,
      ticketId: result.ticketId,
      status: result.status
    });

  } catch (error) {
    if (error.statusCode === 409 || error.isProcessing) {
      // Return 200 to gateway so it stops hammering, but indicate processing conflict
      return res.status(200).json({
        success: true,
        isProcessing: true,
        message: 'Order is currently being processed by another worker.'
      });
    }

    console.error('[JobIntake Webhook] Processing error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process webhook event.'
    });
  }
});

/**
 * Handles administrative retry of a failed or stuck intake.
 * Requires Admin authentication.
 * 
 * @route POST /api/intake/:id/retry
 */
const handleRetryIntake = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId format
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JobIntake ID format.'
    });
  }

  const intake = await JobIntake.findById(id);
  if (!intake) {
    return res.status(404).json({
      success: false,
      message: `JobIntake record not found for ID: ${id}`
    });
  }

  // Tenant authorization: admin must match intake subdomain (unless global admin)
  if (req.user && req.user.role === 'admin' && req.user.subdomain) {
    if (intake.subdomain !== req.user.subdomain) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You cannot retry intakes belonging to another organization.'
      });
    }
  }

  try {
    const result = await jobIntakeService.retryJobIntake(id, req.user);

    return res.status(200).json({
      success: true,
      orderId: result.orderId || intake.orderId,
      invoiceNo: result.invoiceNo,
      ticketId: result.ticketId,
      status: result.status || 'COMPLETED'
    });
  } catch (err) {
    if (err.statusCode === 409 || err.isProcessing) {
      return res.status(409).json({
        success: false,
        message: err.message || 'Intake is currently locked by an active worker lease.'
      });
    }

    console.error('[JobIntake Retry] Error retrying intake:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to retry job intake.'
    });
  }
});

/**
 * Handles creation of an accepted order intake with manual payment verification.
 * 
 * @route POST /api/intake/orders
 * @access Private (Admin, Worker, or API key with 'intake:write' scope)
 */
const handleOrderIntake = asyncHandler(async (req, res) => {
  const parseResult = OrderIntakeSchema.safeParse(req.body);
  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }));
    return res.status(400).json({
      success: false,
      message: 'Invalid order intake payload structure.',
      errors: formattedErrors
    });
  }

  const intakeData = parseResult.data;

  // Tenant isolation check against caller
  const callerSubdomain = (req.user && req.user.subdomain) || (req.apiKey && req.apiKey.subdomain);
  if (callerSubdomain && callerSubdomain !== intakeData.subdomain) {
    return res.status(403).json({
      success: false,
      message: `Caller is scoped to subdomain '${callerSubdomain}', but payload specified '${intakeData.subdomain}'.`
    });
  }

  // Calculate items sum
  const itemsSum = intakeData.items.reduce((sum, item) => sum + item.total, 0);
  const paymentAmount = (intakeData.payment && intakeData.payment.amount) ? intakeData.payment.amount : itemsSum;

  if (intakeData.payment && intakeData.payment.amount && Math.abs(itemsSum - intakeData.payment.amount) > 1.0) {
    return res.status(400).json({
      success: false,
      message: `Commercial amount mismatch: items sum (${itemsSum}) does not match payment amount (${intakeData.payment.amount}).`
    });
  }

  const finalPayment = {
    ...intakeData.payment,
    amount: paymentAmount,
    currency: (intakeData.payment && intakeData.payment.currency) || 'INR',
    gateway: (intakeData.payment && intakeData.payment.gateway) || 'manual',
    paymentStatus: (intakeData.payment && intakeData.payment.paymentStatus === 'FAILED') ? 'FAILED' : 'PENDING',
    manualVerification: true
  };

  const trustedIntakeData = {
    ...intakeData,
    payment: finalPayment,
    rawPayload: req.body
  };

  try {
    const result = await jobIntakeService.processJobIntake({
      intakeData: trustedIntakeData,
      subdomain: intakeData.subdomain,
      adminUser: req.user
    });

    const statusCode = result.isDuplicate ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      isDuplicate: !!result.isDuplicate,
      orderId: result.orderId,
      invoiceNo: result.invoiceNo,
      invoiceId: result.invoiceId,
      ticketId: result.ticketId,
      status: result.status
    });
  } catch (error) {
    if (error.statusCode === 409 || error.isProcessing) {
      return res.status(409).json({
        success: false,
        message: error.message || 'Order is currently being processed by another worker.'
      });
    }

    if (error.statusCode === 402) {
      return res.status(402).json({
        success: false,
        message: error.message
      });
    }

    console.error('[JobIntake Order] Error processing intake:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process order intake.'
    });
  }
});

module.exports = {
  handleCheckoutIntake,
  handleGatewayWebhook,
  handleRetryIntake,
  handleOrderIntake,
  CheckoutIntakeSchema,
  OrderIntakeSchema,
  normalizeWebhookPayload,
  SUPPORTED_GATEWAYS
};
