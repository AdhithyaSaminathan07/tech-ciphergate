const InvoiceSequence = require('../models/InvoiceSequence');
const Invoice = require('../models/Invoice');

const SEQUENCE_ID = 'invoice_TV';
const PREFIX = 'TV';
const PADDING = 6;

// In-process memoizer to prevent redundant concurrent seeding
let initPromise = null;

/**
 * Extracts numeric sequence from invoice number like TV000123
 */
const extractNumber = (invNo) => {
  if (!invNo || typeof invNo !== 'string') return 0;
  const match = invNo.trim().match(/^TV(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10) || 0;
    if (num < 1000000) return num;
  }
  return 0;
};

/**
 * Atomically seeds the sequence counter across concurrent application instances.
 * Guarantees that the counter is never initialized below the highest existing invoice number,
 * and will never decrease an existing higher sequence counter.
 */
const seedSequenceIfNeeded = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Scan existing invoices to identify current maximum TV* sequence
    const existingInvoices = await Invoice.find({}, 'invoiceNo').lean();
    let maxNum = 0;
    for (const inv of existingInvoices) {
      const num = extractNumber(inv.invoiceNo);
      if (num > maxNum) maxNum = num;
    }

    // Step 1: Safe insert-or-ignore to guarantee document exists without duplicate _id crashes
    try {
      await InvoiceSequence.create({ _id: SEQUENCE_ID, seq: maxNum });
      return maxNum;
    } catch (createErr) {
      // E11000 duplicate key error means another concurrent worker or previous boot already initialized it
      const isDuplicateKey = createErr.code === 11000 || (createErr.message && createErr.message.includes('E11000'));
      if (!isDuplicateKey) {
        throw createErr;
      }
    }

    // Step 2: Document definitely exists. Atomically elevate seq to maxNum ONLY if current seq < maxNum.
    // Notice: NO upsert: true! This guarantees it will NEVER attempt to insert a duplicate _id.
    const elevated = await InvoiceSequence.findOneAndUpdate(
      { _id: SEQUENCE_ID, seq: { $lt: maxNum } },
      { $set: { seq: maxNum } },
      { new: true }
    );

    if (elevated) return elevated.seq;

    // If current seq was already >= maxNum, fetch current value
    const current = await InvoiceSequence.findById(SEQUENCE_ID);
    return current ? current.seq : maxNum;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
};

/**
 * Concurrency-safe atomic invoice number generator.
 * Atomically increments the counter in MongoDB without blindly upserting from 1,
 * and verifies that the candidate number does not collide with historical invoices.
 * 
 * @param {Object} options
 * @param {import('mongoose').ClientSession} [options.session]
 * @returns {Promise<string>} Next invoice number (e.g. TV000045)
 */
const getNextSequentialInvoiceNo = async (options = {}) => {
  const { session } = options;

  let candidateNo = '';
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 15;

  while (!isUnique && attempts < maxAttempts) {
    attempts++;

    // Atomic increment without upserting unseeded counter
    const updateQuery = InvoiceSequence.findOneAndUpdate(
      { _id: SEQUENCE_ID },
      { $inc: { seq: 1 } },
      { new: true }
    );
    if (session) updateQuery.session(session);

    let seqDoc = await updateQuery;

    // If counter was not yet initialized in the database, seed it and retry
    if (!seqDoc) {
      await seedSequenceIfNeeded();
      const retryQuery = InvoiceSequence.findOneAndUpdate(
        { _id: SEQUENCE_ID },
        { $inc: { seq: 1 } },
        { new: true }
      );
      if (session) retryQuery.session(session);
      seqDoc = await retryQuery;
    }

    if (!seqDoc) {
      throw new Error('Failed to acquire atomic invoice sequence document.');
    }

    const padded = String(seqDoc.seq).padStart(PADDING, '0');
    candidateNo = `${PREFIX}${padded}`;

    // Verify non-collision in invoices collection (handles out-of-order historical numbers)
    const checkQuery = Invoice.findOne({ invoiceNo: candidateNo }).lean();
    if (session) checkQuery.session(session);
    const existing = await checkQuery;

    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    throw new Error(`Failed to generate a unique invoice number after ${maxAttempts} attempts.`);
  }

  return candidateNo;
};

module.exports = {
  getNextSequentialInvoiceNo,
  seedSequenceIfNeeded,
  extractNumber,
  SEQUENCE_ID,
  PREFIX,
  PADDING
};
