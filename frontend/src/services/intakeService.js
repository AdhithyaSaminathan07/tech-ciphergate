import api from './api';

/**
 * Sanitizes and maps raw invoice/order data into the exact OrderIntakeSchema required by POST /api/intake/orders.
 * Strips UI-only fields (such as `id`, `_id`, `isTotalOverridden`) from line items to satisfy backend .strict() validation.
 */
export const sanitizeOrderIntakePayload = ({
  orderId,
  subdomain,
  customer = {},
  jobDetails = {},
  items = [],
  payment = {}
}) => {
  if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(orderId.trim())) {
    throw new Error('Valid orderId is required (alphanumeric characters, underscores, or hyphens only).');
  }

  // 1. Sanitize items: LineItemSchema.strict() requires description, hsn, gst, qty, rate, total
  const cleanItems = (Array.isArray(items) ? items : []).map(item => {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const rate = Math.max(0, parseFloat(item.rate) || 0);
    const total = (item.total !== undefined && item.total !== null && !isNaN(parseFloat(item.total)))
      ? Math.round(parseFloat(item.total) * 100) / 100
      : Math.round(qty * rate * 100) / 100;

    return {
      description: String(item.description || '').trim() || 'Service Item',
      hsn: String(item.hsn || '').trim().slice(0, 20),
      gst: (typeof item.gst === 'number' && !isNaN(item.gst)) ? Math.min(28, Math.max(0, item.gst)) : 18,
      qty,
      rate: Math.round(rate * 100) / 100,
      total
    };
  });

  const validItems = cleanItems.length > 0 ? cleanItems : [{
    description: 'General Technical Services',
    hsn: '',
    gst: 18,
    qty: 1,
    rate: 0,
    total: 0
  }];

  // Calculate sum of item totals to satisfy commercial validation: Math.abs(sum - amount) <= 1.0
  const itemsSum = Math.round(validItems.reduce((acc, curr) => acc + curr.total, 0) * 100) / 100;

  // 2. Sanitize customer
  const rawPhone = String(customer.phone || customer.customerContact || '').replace(/[^0-9+]/g, '');
  const cleanCustomer = {
    name: String(customer.name || customer.customerName || '').trim().slice(0, 100) || 'Client Customer',
    phone: rawPhone.length >= 10 ? rawPhone.slice(0, 15) : '9999999999',
    email: (customer.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email).trim()))
      ? String(customer.email).trim().slice(0, 100)
      : '',
    address: String(customer.address || customer.customerAddress || '').trim().slice(0, 300),
    gstin: String(customer.gstin || customer.customerGst || '').trim().toUpperCase()
  };

  // If GSTIN does not match exact Indian GSTIN format, leave as empty string
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (cleanCustomer.gstin && !gstinRegex.test(cleanCustomer.gstin)) {
    cleanCustomer.gstin = '';
  }

  // 3. Sanitize jobDetails
  const primaryTitle = String(
    jobDetails.title ||
    (validItems[0]?.description ? `Order: ${validItems[0].description}` : `Job Order #${orderId}`)
  ).trim().slice(0, 200);

  const cleanJobDetails = {
    title: primaryTitle.length >= 3 ? primaryTitle : `Order #${orderId}`,
    description: String(jobDetails.description || '').trim().slice(0, 5000),
    serviceCategory: String(jobDetails.serviceCategory || 'General').trim().slice(0, 50),
    team: String(jobDetails.team || 'DEV').trim().slice(0, 50),
    priority: ['Low', 'Medium', 'High', 'Critical'].includes(jobDetails.priority) ? jobDetails.priority : 'High',
    deliverables: Array.isArray(jobDetails.deliverables)
      ? jobDetails.deliverables.map(d => String(d).trim().slice(0, 200)).filter(Boolean).slice(0, 30)
      : [],
    referenceFiles: Array.isArray(jobDetails.referenceFiles) ? jobDetails.referenceFiles.slice(0, 10) : [],
    dueDate: jobDetails.dueDate || null
  };

  // 4. Sanitize payment object (strictly manual verification for System 1)
  const cleanPayment = {
    gateway: 'manual',
    currency: 'INR',
    transactionRef: String(payment.transactionRef || orderId).trim().slice(0, 100),
    paymentStatus: 'PENDING',
    manualVerification: true
  };
  if (itemsSum > 0) {
    cleanPayment.amount = itemsSum;
  }

  // 5. Sanitize subdomain
  const cleanSubdomain = String(subdomain || 'tech-vaseegrah')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64) || 'tech-vaseegrah';

  return {
    orderId: String(orderId).trim(),
    subdomain: cleanSubdomain,
    customer: cleanCustomer,
    jobDetails: cleanJobDetails,
    items: validItems,
    payment: cleanPayment
  };
};

/**
 * Submits an accepted order intake to System 1.
 * Uses authenticated session cookies via `api` instance (no secret exposure).
 */
export const createOrderIntake = async (intakeInput) => {
  try {
    const payload = sanitizeOrderIntakePayload(intakeInput);
    const response = await api.post('/intake/orders', payload);
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    if (errorData) {
      const err = new Error(errorData.message || 'Failed to submit order intake');
      err.errors = errorData.errors;
      err.status = error.response.status;
      err.isDuplicate = !!errorData.isDuplicate;
      throw err;
    }
    throw new Error(error.message || 'Network error occurred while submitting order intake');
  }
};
