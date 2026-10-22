const crypto = require('crypto');
const mongoose = require('mongoose');
const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const Department = require('../models/Department');
const Worker = require('../models/Worker');
const { getNextSequentialInvoiceNo } = require('./invoiceSequenceService');
const { sanitizeIntakePayload } = require('./paymentVerificationService');
const {
  autoAssignJobTicket,
  classifyInvoiceJob,
  analyzeScopeDepartments,
  isWebsiteDepartment,
  isSoftwareDepartment,
  isWebsiteScopeText,
  isSoftwareScopeText
} = require('./jobAssignmentService');

const LEASE_DURATION_MS = 30000; // 30-second atomic processing lease

/**
 * Formats a Date object to standard DD/MM/YYYY string.
 */
const formatDateDMY = (dateObj = new Date()) => {
  const d = new Date(dateObj);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Generates developer-facing project scope description from invoice line items and requirements.
 * Excludes customer PII (name, phone, email, address, GSTIN), invoice numbers, commercial currency rates,
 * payment details, and classification metadata.
 */
function buildDeveloperProjectDescription({ items = [], notes = '', deliverables = [] }) {
  const sections = [];

  // 1. Customer-provided project requirements or overview from invoice notes
  const cleanNotes = String(notes || '').trim();
  const isGenericAutoNote = /created automatically/i.test(cleanNotes) || /payment received/i.test(cleanNotes);
  if (cleanNotes && !isGenericAutoNote) {
    sections.push(`### Project Overview\n${cleanNotes}`);
  }

  // 2. Deliverables / Line item scopes
  const rawItems = (items && items.length > 0) ? items : deliverables;
  const itemDescriptions = (rawItems || [])
    .map(it => {
      const desc = typeof it === 'string' ? it : (it.description || '');
      return String(desc || '').trim();
    })
    .filter(desc => desc.length > 0 && !/^general technical services$/i.test(desc));

  if (itemDescriptions.length > 0) {
    const list = itemDescriptions.map(d => `- ${d}`).join('\n');
    sections.push(`### Scope of Work\n${list}`);
  } else if (rawItems && rawItems.length > 0) {
    const fallbackList = rawItems
      .map(it => typeof it === 'string' ? it.trim() : String(it.description || '').trim())
      .filter(Boolean);
    if (fallbackList.length > 0) {
      sections.push(`### Scope of Work\n${fallbackList.map(d => `- ${d}`).join('\n')}`);
    }
  }

  if (sections.length === 0) {
    return 'Detailed project requirements have not been provided yet.';
  }

  return sections.join('\n\n');
}

/**
 * Core Job Intake Orchestrator.
 * Implements atomic idempotency, compare-and-set lease ownership, and deterministic crash recovery.
 * 
 * @param {Object} params
 * @param {Object} params.intakeData - Validated intake payload
 * @param {string} params.subdomain - Tenant subdomain
 * @param {Object} [params.adminUser] - Resolving Admin document
 * @param {import('mongoose').ClientSession} [params.session] - Optional Mongoose transaction session
 */
const processJobIntake = async ({ intakeData, subdomain, adminUser, session }) => {
  const { orderId, customer, jobDetails, payment, items, rawPayload } = intakeData;

  // 1. Resolve Admin if not provided
  let admin = adminUser;
  if (!admin) {
    admin = await Admin.findOne({ subdomain }).lean();
    if (!admin) {
      throw new Error(`Tenant admin not found for subdomain: ${subdomain}`);
    }
  }

  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const sanitizedRaw = sanitizeIntakePayload(rawPayload);

  // 2. Check existing intake state first
  const existingRecord = await JobIntake.findOne({ subdomain, orderId });

  if (existingRecord) {
    // Case A: Order already fully completed (Idempotent 200)
    if (existingRecord.intakeStatus === 'COMPLETED') {
      return {
        success: true,
        isDuplicate: true,
        intakeId: existingRecord._id,
        orderId: existingRecord.orderId,
        invoiceNo: existingRecord.invoiceNo,
        invoiceId: existingRecord.invoiceId,
        ticketId: existingRecord.ticketId,
        status: existingRecord.intakeStatus
      };
    }

    // Case B: Active unexpired processing lease held by another worker
    const hasActiveLease = existingRecord.intakeStatus === 'PROCESSING' &&
      existingRecord.leaseExpiresAt &&
      existingRecord.leaseExpiresAt > now;

    if (hasActiveLease) {
      const err = new Error(`Order ${orderId} is currently being processed by another worker.`);
      err.statusCode = 409;
      err.isProcessing = true;
      throw err;
    }
  }

  // 3. Atomic Lease Acquisition (Compare-and-Set)
  let intake;
  if (existingRecord) {
    // Acquire lease on existing document whose lease expired or is in FAILED state
    intake = await JobIntake.findOneAndUpdate(
      {
        _id: existingRecord._id,
        $or: [
          { intakeStatus: { $in: ['RECEIVED', 'FAILED', 'INVOICE_CREATED', 'TICKET_CREATED'] } },
          { intakeStatus: 'PROCESSING', leaseExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          intakeStatus: 'PROCESSING',
          processingStartedAt: now,
          leaseExpiresAt: leaseExpiresAt,
          processingLeaseOwner: leaseToken
        },
        $inc: { retryCount: 1 }
      },
      { new: true, session }
    );

    if (!intake) {
      // Lease was acquired by another concurrent worker in the race window
      const err = new Error(`Order ${orderId} lease acquisition conflict.`);
      err.statusCode = 409;
      err.isProcessing = true;
      throw err;
    }
  } else {
    // Insert new intake with active lease token
    try {
      intake = new JobIntake({
        orderId,
        gatewayPaymentId: payment.transactionRef || undefined,
        subdomain,
        customer,
        jobDetails,
        payment,
        items,
        intakeStatus: 'PROCESSING',
        processingStartedAt: now,
        leaseExpiresAt: leaseExpiresAt,
        processingLeaseOwner: leaseToken,
        rawPayload: sanitizedRaw
      });
      await intake.save({ session });
    } catch (insertErr) {
      // Catch concurrent insert collision on compound unique index { subdomain, orderId }
      if (insertErr.code === 11000) {
        const err = new Error(`Order ${orderId} was concurrently registered.`);
        err.statusCode = 409;
        err.isProcessing = true;
        throw err;
      }
      throw insertErr;
    }
  }

  try {
    // 4. Payment Verification Guard: Fail-closed on explicit payment failures
    if (payment.paymentStatus === 'FAILED') {
      await JobIntake.findOneAndUpdate(
        { _id: intake._id, processingLeaseOwner: leaseToken },
        {
          $set: {
            intakeStatus: 'FAILED',
            failureReason: 'Payment status is failed. Failed payments cannot be processed.',
            processingStartedAt: null,
            leaseExpiresAt: null,
            processingLeaseOwner: null
          }
        }
      );
      const err = new Error('Payment status is failed. Failed payments cannot be processed.');
      err.statusCode = 402;
      throw err;
    }

    // Determine authoritative verification:
    // For System 1, payment verification is manual by default.
    // Invoices are only marked as paid/tax invoices if authoritative verification explicitly confirmed it
    // and manual verification was not requested.
    const isVerified = payment.paymentStatus === 'VERIFIED' &&
      !payment.manualVerification &&
      payment.gateway !== 'manual';

    // 5. Deterministic Invoice Lookup & Safe Creation
    let invoiceInstance = null;
    if (intake.invoiceId) {
      invoiceInstance = await Invoice.findById(intake.invoiceId);
    }

    // Deterministic crash recovery: check if invoice was already created before saving reference
    if (!invoiceInstance && intake.orderId) {
      invoiceInstance = await Invoice.findOne({ externalOrderId: orderId, createdBy: admin._id });
      if (!invoiceInstance) {
        invoiceInstance = await Invoice.findOne({ externalOrderId: orderId });
      }
    }

    if (invoiceInstance) {
      // Re-link existing invoice without generating a new sequential number
      intake.invoiceId = invoiceInstance._id;
      intake.invoiceNo = invoiceInstance.invoiceNo;
    } else {
      // Atomic database lease verification & extension immediately prior to invoice generation
      const preInvoiceTouch = await JobIntake.findOneAndUpdate(
        {
          _id: intake._id,
          processingLeaseOwner: leaseToken,
          leaseExpiresAt: { $gt: new Date() }
        },
        {
          $set: {
            leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS)
          }
        },
        { new: true, session }
      );

      if (!preInvoiceTouch) {
        throw new Error(`Processing lease for order ${orderId} was lost or expired before invoice creation.`);
      }

      // Atomically generate concurrency-safe invoice number
      const nextInvoiceNo = await getNextSequentialInvoiceNo({ session });
      const invoiceDateStr = formatDateDMY(now);
      const proofUrl = payment.transactionRef || payment.gateway || 'ONLINE_CHECKOUT_VERIFIED';

      const invoiceData = {
        invoiceNo: nextInvoiceNo,
        invoiceDate: invoiceDateStr,
        actualDate: now,
        customerName: customer.name,
        customerContact: customer.phone,
        salesPerson: isVerified ? 'Online Checkout' : (admin.name || 'Job Intake'),
        terms: isVerified
          ? 'Payment received in full via online checkout'
          : 'Payment pending manual verification. Please transfer to the bank/UPI details provided.',
        items: items,
        gstEnabled: true,
        saleType: 'Intrastate',
        customerGst: customer.gstin || '',
        invoiceType: isVerified ? 'TAX INVOICE' : 'PROFORMA INVOICE',
        status: isVerified ? 'Payment Received' : 'Invoice',
        isPaid: isVerified,
        createdBy: admin._id,
        createdByModel: 'Admin',
        source: 'intake',
        externalOrderId: orderId
      };

      if (isVerified) {
        invoiceData.paymentDetails = {
          date: payment.verifiedAt || now,
          proof: proofUrl,
          proofs: [{
            date: payment.verifiedAt || now,
            url: proofUrl
          }]
        };
        invoiceData.paymentRecords = [{
          amount: payment.amount,
          dateReceived: invoiceDateStr,
          transactionId: payment.transactionRef || orderId
        }];
      } else {
        invoiceData.paymentRecords = [];
      }

      invoiceInstance = new Invoice(invoiceData);

      try {
        await invoiceInstance.save({ session });
        intake.invoiceId = invoiceInstance._id;
        intake.invoiceNo = invoiceInstance.invoiceNo;
      } catch (saveErr) {
        const isDuplicateKey = saveErr.code === 11000 || (saveErr.message && saveErr.message.includes('E11000'));
        if (isDuplicateKey) {
          // If concurrent insert collision occurred, deterministically recover the invoice
          const existing = await Invoice.findOne({ externalOrderId: orderId, createdBy: admin._id }) ||
            await Invoice.findOne({ externalOrderId: orderId });
          if (existing) {
            invoiceInstance = existing;
            intake.invoiceId = existing._id;
            intake.invoiceNo = existing.invoiceNo;
          } else {
            throw saveErr;
          }
        } else {
          throw saveErr;
        }
      }
    }

    // Compare-and-Set state transition: INVOICE_CREATED
    const postInvoiceIntake = await JobIntake.findOneAndUpdate(
      { _id: intake._id, processingLeaseOwner: leaseToken },
      {
        $set: {
          invoiceId: intake.invoiceId,
          invoiceNo: intake.invoiceNo,
          intakeStatus: 'INVOICE_CREATED',
          leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS) // Heartbeat lease extension
        }
      },
      { new: true, session }
    );

    if (!postInvoiceIntake) {
      throw new Error(`Processing lease for order ${orderId} was lost before invoice reference update.`);
    }

    // 6. Deterministic Ticket Lookup & Safe Creation
    let ticketInstance = null;
    if (intake.ticketId) {
      ticketInstance = await Ticket.findById(intake.ticketId);
    }

    // Deterministic crash recovery: check if ticket was already created before saving reference
    if (!ticketInstance) {
      ticketInstance = await Ticket.findOne({
        subdomain,
        labels: `order:${orderId}`,
        isDeleted: { $ne: true }
      });
    }

    if (ticketInstance) {
      // Re-link existing ticket
      intake.ticketId = ticketInstance._id;
    } else {
      // Atomic database lease verification & extension immediately prior to ticket generation
      const preTicketTouch = await JobIntake.findOneAndUpdate(
        {
          _id: intake._id,
          processingLeaseOwner: leaseToken,
          leaseExpiresAt: { $gt: new Date() }
        },
        {
          $set: {
            leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS)
          }
        },
        { new: true, session }
      );

      if (!preTicketTouch) {
        throw new Error(`Processing lease for order ${orderId} was lost or expired before ticket creation.`);
      }
      const ticketTitle = `[Order #${orderId}] ${customer.name} - ${jobDetails.title}`;
      const developerDescription = buildDeveloperProjectDescription({
        items: (jobDetails.deliverables || []).map(d => ({ description: d })),
        notes: jobDetails.description || '',
        deliverables: jobDetails.deliverables || []
      });

      const checklistItems = (jobDetails.deliverables || []).map(text => ({
        text,
        completed: false,
        completedAt: null
      }));

      const referenceFiles = (jobDetails.referenceFiles || []).map(file => ({
        url: file.url,
        name: file.name || 'Specification Asset',
        size: file.size || 0,
        type: file.fileType || 'application/octet-stream',
        uploadedAt: now
      }));

      // Resolve team dynamically if not provided
      let detectedTeam = (jobDetails.team && String(jobDetails.team).trim()) ? String(jobDetails.team).trim() : null;
      if (!detectedTeam) {
        const tenantDepts = await Department.find({ subdomain }).lean();
        const tenantWorkers = await Worker.find({ subdomain, status: 'Active' }).lean();
        const scopeRes = analyzeScopeDepartments({
          items: jobDetails.deliverables || [],
          title: jobDetails.title || '',
          description: jobDetails.description || '',
          departments: tenantDepts,
          workers: tenantWorkers
        });
        if (scopeRes.primaryDept && !scopeRes.isAmbiguous) {
          detectedTeam = scopeRes.primaryDept.name;
        }
      }

      ticketInstance = new Ticket({
        title: ticketTitle,
        description: developerDescription,
        subdomain,
        team: detectedTeam || null,
        priority: jobDetails.priority || 'High',
        status: 'To Do',
        issueType: 'Task',
        assignedBy: admin._id,
        assignedByModel: 'Admin',
        startDate: now,
        endDate: jobDetails.dueDate || null,
        checklist: checklistItems,
        referenceFiles: referenceFiles,
        labels: ['online-intake', payment.gateway, `order:${orderId}`]
      });

      try {
        await ticketInstance.save({ session });
        intake.ticketId = ticketInstance._id;
      } catch (ticketSaveErr) {
        // Deterministic recovery if ticket was concurrently saved or collision occurred
        const existingTicket = await Ticket.findOne({
          subdomain,
          labels: `order:${orderId}`,
          isDeleted: { $ne: true }
        });
        if (existingTicket) {
          ticketInstance = existingTicket;
          intake.ticketId = existingTicket._id;
        } else {
          throw ticketSaveErr;
        }
      }
    }

    // Compare-and-Set state transition: COMPLETED & Lease Release
    const completedIntake = await JobIntake.findOneAndUpdate(
      { _id: intake._id, processingLeaseOwner: leaseToken },
      {
        $set: {
          ticketId: intake.ticketId,
          intakeStatus: 'COMPLETED',
          processingStartedAt: null,
          leaseExpiresAt: null,
          processingLeaseOwner: null,
          failureReason: null
        }
      },
      { new: true, session }
    );

    if (!completedIntake) {
      throw new Error(`Processing lease for order ${orderId} was lost before completion transition.`);
    }

    // 7. System 2: Automatic Job Assignment (for verified orders)
    if (isVerified) {
      try {
        const { autoAssignJobTicket } = require('./jobAssignmentService');
        await autoAssignJobTicket({
          ticket: ticketInstance,
          subdomain,
          session
        });
      } catch (assignErr) {
        console.error('[System 2 Auto-Assignment in processJobIntake]:', assignErr.message);
      }
    }

    // 8. Non-blocking Real-time Socket Notification
    try {
      const { getIO } = require('../utils/socket');
      const io = getIO();
      if (io) {
        io.to(subdomain).emit('intake:new_order', {
          orderId,
          invoiceNo: intake.invoiceNo,
          ticketId: intake.ticketId,
          client: customer.name,
          amount: payment.amount
        });
        io.to(subdomain).emit('ticket:created', ticketInstance);
      }
    } catch (socketErr) {
      console.warn('[JobIntake] Socket emission skipped:', socketErr.message);
    }

    return {
      success: true,
      intakeId: intake._id,
      orderId: intake.orderId,
      invoiceNo: intake.invoiceNo,
      invoiceId: intake.invoiceId,
      ticketId: intake.ticketId,
      status: 'COMPLETED'
    };

  } catch (executionError) {
    // Record failure diagnostics and release lease so retry can safely re-acquire
    await JobIntake.findOneAndUpdate(
      { _id: intake._id, processingLeaseOwner: leaseToken },
      {
        $set: {
          intakeStatus: 'FAILED',
          failureReason: executionError.message,
          processingStartedAt: null,
          leaseExpiresAt: null,
          processingLeaseOwner: null
        }
      }
    ).catch(saveErr => console.error('[JobIntake] Error updating failed intake:', saveErr));

    throw executionError;
  }
};

/**
 * Retries a previously failed intake by its ID.
 */
const retryJobIntake = async (intakeId, adminUser) => {
  const intake = await JobIntake.findById(intakeId);
  if (!intake) {
    throw new Error(`JobIntake record not found for ID: ${intakeId}`);
  }

  if (intake.intakeStatus === 'COMPLETED') {
    return {
      success: true,
      message: 'Intake is already completed.',
      invoiceNo: intake.invoiceNo,
      ticketId: intake.ticketId
    };
  }

  const reconstructedData = {
    orderId: intake.orderId,
    customer: intake.customer,
    jobDetails: intake.jobDetails,
    payment: intake.payment,
    items: intake.items,
    rawPayload: intake.rawPayload
  };

  return processJobIntake({
    intakeData: reconstructedData,
    subdomain: intake.subdomain,
    adminUser
  });
};

/**
 * Creates or recovers the authoritative Work Allocation ticket and any department-specific subtasks.
 * Supports multi-department scope analysis with clear deliverable dependencies.
 */
const createVerifiedInvoiceTicketAndSubtasks = async ({
  invoice,
  orderId,
  admin,
  subdomain,
  now = new Date(),
  session,
  effectiveJobType: paramJobType,
  classification: paramClassification
}) => {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const totalAmount = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);

  // 1. Resolve departments and active workers in tenant
  const departments = await Department.find({ subdomain }).lean();
  const activeWorkers = await Worker.find({ subdomain, status: 'Active' }).lean();

  // 2. Perform authoritative classification
  const classification = paramClassification || classifyInvoiceJob({
    invoice,
    departments,
    workers: activeWorkers
  });

  const effectiveJobType = paramJobType || classification.jobType;
  const classificationReason = classification.reason;
  const isMultiDept = (effectiveJobType === 'Multi-Department');

  // Multi-department subtask breakdown analysis
  const scopeAnalysis = analyzeScopeDepartments({
    items,
    title: invoice.notes || '',
    description: items.map(i => i.description || '').join(' '),
    departments,
    workers: activeWorkers
  });

  const webDept = departments.find(d => isWebsiteDepartment(d));
  const primaryTeamName = (effectiveJobType === 'Website Development' && webDept) ? webDept.name : null;

  // 3. Build Developer-Facing Project Description (Scope & Requirements Only)
  const developerDescription = buildDeveloperProjectDescription({
    items,
    notes: invoice.notes || invoice.terms,
    deliverables: items.map(it => it.description)
  });

  // 4. Formulate checklist with clear dependencies if multi-department
  let checklistItems = [];
  if (isMultiDept && scopeAnalysis.departmentBreakdown.length > 0) {
    scopeAnalysis.departmentBreakdown.forEach((group, idx) => {
      const depName = group.dept.name;
      const depNote = idx === 0
        ? 'Phase 1: Initial Deliverable - Dependency: Client Brief'
        : `Phase ${idx + 1}: Implementation - Dependency: Phase ${idx} (${scopeAnalysis.departmentBreakdown[idx - 1].dept.name}) completion`;

      group.items.forEach(it => {
        const itemDesc = typeof it === 'string' ? it : (it.description || 'Deliverable item');
        checklistItems.push({
          text: `[${depName}] ${itemDesc} (${depNote})`,
          completed: false,
          completedAt: null
        });
      });
    });
  } else {
    checklistItems = items.map(it => ({
      text: it.description || 'Deliverable item',
      completed: false,
      completedAt: null
    }));
  }

  // 5. Instantiate Main Ticket
  const ticketTitle = `[Invoice #${invoice.invoiceNo}] ${invoice.customerName || 'Customer'} - Project Execution`;
  const mainTicketLabels = ['invoice-intake', 'payment-verified', `order:${orderId}`, `invoice:${invoice.invoiceNo}`];
  if (isMultiDept) {
    mainTicketLabels.push('multi-department', 'parent-task');
  }
  if (effectiveJobType === 'Website Development') mainTicketLabels.push('job-type:website');
  else if (effectiveJobType === 'Software Development') mainTicketLabels.push('job-type:software');
  else if (effectiveJobType === 'Multi-Department') mainTicketLabels.push('job-type:multi-department');
  else mainTicketLabels.push('job-type:needs-admin-review');

  const unassignedReasonInitial = (effectiveJobType === 'Software Development')
    ? 'Software Development job detected — please select the appropriate existing team and assignees.'
    : (effectiveJobType === 'Needs Admin Review')
      ? (classificationReason || 'Needs Admin Review: unable to determine target department/team from job scope. Left unassigned for admin review.')
      : null;

  const newTicket = new Ticket({
    title: ticketTitle,
    description: developerDescription,
    subdomain,
    team: primaryTeamName || null,
    priority: 'High',
    status: 'To Do',
    issueType: 'Task',
    assignedBy: (admin && admin._id) || invoice.createdBy,
    assignedByModel: 'Admin',
    startDate: now,
    checklist: checklistItems,
    labels: mainTicketLabels,
    assignmentMode: isMultiDept ? 'Both' : 'Individual',
    assignmentSource: 'automatic',
    unassignedReason: unassignedReasonInitial
  });

  if (effectiveJobType === 'Needs Admin Review' || effectiveJobType === 'Software Development') {
    newTicket.assignmentHistory.push({
      previousAssignee: null,
      newAssignee: null,
      assignedAt: now,
      assignedBy: null,
      assignedByModel: 'System',
      source: 'automatic',
      reason: unassignedReasonInitial
    });
  }

  // Pre-check to prevent concurrent duplicate ticket creation
  const existingPreCheck = await Ticket.findOne({
    subdomain,
    labels: `order:${orderId}`,
    isDeleted: { $ne: true }
  });
  if (existingPreCheck) {
    return { mainTicket: existingPreCheck, subtasks: [] };
  }

  let savedMainTicket = null;
  try {
    await newTicket.save({ session });
    savedMainTicket = newTicket;
  } catch (ticketErr) {
    const existingTicket = await Ticket.findOne({
      subdomain,
      labels: `order:${orderId}`,
      isDeleted: { $ne: true }
    });
    if (existingTicket) {
      savedMainTicket = existingTicket;
    } else {
      throw ticketErr;
    }
  }

  // 6. Multi-Department Subtasks Creation:
  // For each matching department, create a child ticket linked via parentTicket with dependencies
  if (isMultiDept && scopeAnalysis.departmentBreakdown.length > 0) {
    for (let i = 0; i < scopeAnalysis.departmentBreakdown.length; i++) {
      const group = scopeAnalysis.departmentBreakdown[i];
      const deptName = group.dept.name;
      const isSubtaskWeb = isWebsiteDepartment(group.dept);
      const isSubtaskSoftware = isSoftwareDepartment(group.dept);

      const subtaskItems = group.items.map(it => ({
        text: typeof it === 'string' ? it : (it.description || 'Deliverable'),
        completed: false,
        completedAt: null
      }));

      const dependencyNote = i === 0
        ? 'Initial Phase (Ready to start)'
        : `Blocked by Phase ${i} (${scopeAnalysis.departmentBreakdown[i - 1].dept.name}) completion`;

      let subtaskReason = null;
      if (isSubtaskSoftware) {
        subtaskReason = 'Software Development job detected — please select the appropriate existing team and assignees.';
      } else if (!isSubtaskWeb) {
        subtaskReason = `General auto-assignment is disabled for '${deptName}'. Please select assignees in Work Allocation.`;
      }

      const subtaskTicket = new Ticket({
        title: `[Invoice #${invoice.invoiceNo}][${deptName}] Subtask Execution`,
        description: `Department-specific execution item for ${deptName}.\nPhase: ${i + 1}\nDependency: ${dependencyNote}\nDeliverables:\n` +
          group.items.map(it => `- ${typeof it === 'string' ? it : (it.description || '')}`).join('\n'),
        subdomain,
        team: isSubtaskSoftware ? null : deptName,
        parentTicket: savedMainTicket._id,
        priority: 'High',
        status: 'To Do',
        issueType: 'Task',
        assignedBy: (admin && admin._id) || invoice.createdBy,
        assignedByModel: 'Admin',
        startDate: now,
        checklist: subtaskItems,
        assignmentMode: 'Individual',
        unassignedReason: subtaskReason,
        labels: ['invoice-intake', 'subtask', `order:${orderId}`, `invoice:${invoice.invoiceNo}`, `dept:${deptName}`]
      });

      try {
        await subtaskTicket.save({ session });
        // Only Website Development subtasks are auto-assigned!
        if (isSubtaskWeb) {
          await autoAssignJobTicket({
            ticket: subtaskTicket,
            subdomain,
            session,
            requestedTeam: deptName
          });
        }
      } catch (subtaskErr) {
        console.error(`[Multi-Dept Subtask Creation/Assignment Error for ${deptName}]:`, subtaskErr.message);
      }
    }
  }

  // 7. Auto-assign Main Ticket based on authoritative effectiveJobType
  if (effectiveJobType === 'Multi-Department') {
    const multiNotice = 'Multi-department project detected — parent task requires admin coordination and review.';
    await Ticket.findByIdAndUpdate(savedMainTicket._id, {
      $set: {
        team: null,
        assignee: null,
        assignees: [],
        status: 'To Do',
        assignmentSource: 'automatic',
        assignmentMode: 'Both',
        unassignedReason: multiNotice
      },
      $push: {
        assignmentHistory: {
          previousAssignee: null,
          newAssignee: null,
          assignedAt: now,
          assignedBy: null,
          assignedByModel: 'System',
          source: 'automatic',
          reason: multiNotice
        }
      }
    }, { session });
  } else if (effectiveJobType === 'Website Development') {
    // Pure website development job: auto-assign 1 eligible employee from existing Web Development team
    if (webDept) {
      try {
        await autoAssignJobTicket({
          ticket: savedMainTicket,
          subdomain,
          session,
          requestedTeam: webDept.name,
          jobType: 'Website Development'
        });
        const reloaded = await Ticket.findById(savedMainTicket._id);
        if (reloaded) savedMainTicket = reloaded;
      } catch (assignErr) {
        console.error('[System 2 Website Auto-Assignment Error]:', assignErr.message);
      }
    } else {
      const noDeptNotice = 'Web Development department not found in configured organization departments. Left unassigned for admin review.';
      await Ticket.findByIdAndUpdate(savedMainTicket._id, {
        $set: {
          team: null,
          assignee: null,
          assignees: [],
          status: 'To Do',
          assignmentSource: 'automatic',
          unassignedReason: noDeptNotice
        }
      }, { session });
    }
  } else if (effectiveJobType === 'Software Development') {
    // Software job detected: Leave unassigned in To Do for manual admin team & employee selection
    const softwareNotice = 'Software Development job detected — please select the appropriate existing team and assignees.';
    await Ticket.findByIdAndUpdate(savedMainTicket._id, {
      $set: {
        team: null,
        assignee: null,
        assignees: [],
        status: 'To Do',
        assignmentSource: 'automatic',
        assignmentMode: 'Individual',
        unassignedReason: softwareNotice
      },
      $push: {
        assignmentHistory: {
          previousAssignee: null,
          newAssignee: null,
          assignedAt: now,
          assignedBy: null,
          assignedByModel: 'System',
          source: 'automatic',
          reason: softwareNotice
        }
      }
    }, { session });
  } else {
    // Needs Admin Review
    const adminReviewNotice = classificationReason || 'Needs Admin Review: unable to determine target department/team from job scope. Left unassigned for admin review.';
    await Ticket.findByIdAndUpdate(savedMainTicket._id, {
      $set: {
        team: null,
        assignee: null,
        assignees: [],
        status: 'To Do',
        assignmentSource: 'automatic',
        assignmentMode: 'Individual',
        unassignedReason: adminReviewNotice
      },
      $push: {
        assignmentHistory: {
          previousAssignee: null,
          newAssignee: null,
          assignedAt: now,
          assignedBy: null,
          assignedByModel: 'System',
          source: 'automatic',
          reason: adminReviewNotice
        }
      }
    }, { session });
  }

  return { mainTicket: savedMainTicket, scopeAnalysis, classification, effectiveJobType };
};

/**
 * Synchronizes ticket classification labels and applies authoritative assignment rules.
 * Preserves manual employee assignments while ensuring Website jobs are assigned 1 eligible Web Dev employee,
 * Software jobs prompt for Work Allocation, and ambiguous/insufficient cases are left unassigned for admin review.
 */
const applyJobTypeAssignmentToTicket = async ({
  ticket,
  effectiveJobType,
  classificationReason,
  departments,
  subdomain,
  session,
  explicitAssignment
}) => {
  if (!ticket || !ticket._id) return ticket;

  // Change Request: Explicit Department and Member Assignment
  if (explicitAssignment && explicitAssignment.department) {
    const { department, mode, assignee, assignees, adminUser } = explicitAssignment;
    const prevAssignee = ticket.assignee;

    ticket.team = department.name;
    ticket.assignee = assignee;
    ticket.assignees = assignees;
    ticket.assignmentMode = mode || 'Individual';
    ticket.assignmentSource = 'manual';
    ticket.unassignedReason = null;

    // Synchronize labels
    const existingLabels = Array.isArray(ticket.labels) ? ticket.labels : [];
    const cleanLabels = existingLabels.filter(l => !l.startsWith('job-type:') && !l.startsWith('dept:'));
    cleanLabels.push(`dept:${department.name.toLowerCase().replace(/\s+/g, '-')}`);
    cleanLabels.push(`job-type:department-assigned`);
    ticket.labels = cleanLabels;

    ticket.assignmentHistory = ticket.assignmentHistory || [];
    ticket.assignmentHistory.push({
      previousAssignee: prevAssignee || null,
      newAssignee: assignee || null,
      assignedAt: new Date(),
      assignedBy: adminUser?._id || null,
      assignedByModel: 'Admin',
      source: 'manual',
      reason: `Job Intake assignment: Department '${department.name}', Mode '${mode || 'Individual'}'`
    });

    if (typeof ticket.save === 'function') {
      await ticket.save({ session });
    }
    return ticket;
  }

  // 1. Synchronize classification labels
  const existingLabels = Array.isArray(ticket.labels) ? ticket.labels : [];
  const cleanLabels = existingLabels.filter(l => !l.startsWith('job-type:'));
  if (effectiveJobType === 'Website Development') cleanLabels.push('job-type:website');
  else if (effectiveJobType === 'Software Development') cleanLabels.push('job-type:software');
  else if (effectiveJobType === 'Multi-Department') cleanLabels.push('job-type:multi-department');
  else cleanLabels.push('job-type:needs-admin-review');
  ticket.labels = cleanLabels;
  if (ticket._id && Ticket.findByIdAndUpdate) {
    await Ticket.findByIdAndUpdate(ticket._id, { $set: { labels: cleanLabels } }, { session });
  }

  // 2. Preserve manual assignments made by an admin
  const isManuallyAssigned = ticket.assignee && ticket.assignmentSource === 'manual';
  if (isManuallyAssigned) {
    if (typeof ticket.save === 'function') {
      await ticket.save({ session });
    }
    return ticket;
  }

  // 3. Resolve existing Website Development department for tenant
  const webDept = departments.find(d => isWebsiteDepartment(d));

  if (effectiveJobType === 'Website Development') {
    if (webDept) {
      try {
        await autoAssignJobTicket({
          ticket,
          subdomain,
          session,
          requestedTeam: webDept.name,
          jobType: 'Website Development',
          mode: 'Individual'
        });
        const reloaded = (ticket._id && Ticket.findById) ? await Ticket.findById(ticket._id) : null;
        return reloaded || ticket;
      } catch (assignErr) {
        console.error('[applyJobTypeAssignmentToTicket Website Error]:', assignErr.message);
        return ticket;
      }
    } else {
      const noDeptNotice = 'Web Development department not found in configured organization departments. Left unassigned for admin review.';
      ticket.team = null;
      ticket.assignee = undefined;
      ticket.assignees = [];
      ticket.status = 'To Do';
      ticket.assignmentSource = 'automatic';
      ticket.assignmentMode = 'Individual';
      ticket.unassignedReason = noDeptNotice;
      if (typeof ticket.save === 'function') {
        await ticket.save({ session });
      }
      return ticket;
    }
  }

  if (effectiveJobType === 'Software Development') {
    const softwareNotice = 'Software Development job detected — please select the appropriate existing team and assignees.';
    ticket.team = null;
    ticket.assignee = undefined;
    ticket.assignees = [];
    ticket.status = 'To Do';
    ticket.assignmentSource = 'automatic';
    ticket.assignmentMode = 'Individual';
    ticket.unassignedReason = softwareNotice;
    if (typeof ticket.save === 'function') {
      await ticket.save({ session });
    }
    return ticket;
  }

  if (effectiveJobType === 'Multi-Department') {
    const multiNotice = 'Multi-Department job detected — coordinator task in To Do. Please review linked subtasks.';
    ticket.unassignedReason = multiNotice;
    ticket.assignmentMode = 'Both';
    if (typeof ticket.save === 'function') {
      await ticket.save({ session });
    }
    return ticket;
  }

  // Needs Admin Review
  const adminReviewNotice = classificationReason || 'Needs Admin Review: unable to determine target department/team from job scope. Left unassigned for admin review.';
  ticket.team = null;
  ticket.assignee = undefined;
  ticket.assignees = [];
  ticket.status = 'To Do';
  ticket.assignmentSource = 'automatic';
  ticket.assignmentMode = 'Individual';
  ticket.unassignedReason = adminReviewNotice;
  if (typeof ticket.save === 'function') {
    await ticket.save({ session });
  }
  return ticket;
};

/**
 * Automatically creates JobIntake and unassigned "To Do" Ticket when payment is verified on an existing Invoice.
 * Reuses the existing invoice document, invoice number, customer details, and items.
 * Strictly idempotent: prevents duplicate tickets, intakes, or invoices across retries or repeated approvals.
 * 
 * @param {Object} params
 * @param {Object} params.invoice - The existing verified Invoice document
 * @param {Object} [params.adminUser] - Authenticated user performing the update
 * @param {import('mongoose').ClientSession} [params.session] - Optional Mongoose transaction session
 */
const processJobIntakeFromVerifiedInvoice = async ({
  invoice,
  adminUser,
  session,
  selectedJobType,
  departmentId,
  departmentName,
  assignmentMode,
  teamSize,
  requiredMembersCount,
  selectedMemberId,
  selectedMemberIds
}) => {
  if (!invoice || !invoice._id) {
    throw new Error('Valid invoice instance is required for verified job intake.');
  }

  // 1. Resolve Admin & Tenant Subdomain
  let admin = null;
  if (adminUser && adminUser.role === 'admin' && adminUser.subdomain) {
    admin = adminUser;
  } else if (invoice.createdBy) {
    admin = await Admin.findById(invoice.createdBy).lean();
  }

  let subdomain = (admin && admin.subdomain) || (adminUser && adminUser.subdomain) || invoice.subdomain;
  if (!subdomain && admin) {
    subdomain = admin.subdomain;
  }
  if (!subdomain) {
    const defaultAdmin = await Admin.findOne().lean();
    if (defaultAdmin) {
      subdomain = defaultAdmin.subdomain;
      if (!admin) admin = defaultAdmin;
    }
  }

  if (!subdomain) {
    throw new Error(`Unable to determine tenant subdomain for invoice ${invoice.invoiceNo || invoice._id}`);
  }

  // Tenant isolation check: if user has a subdomain, it must match the invoice tenant
  if (adminUser && adminUser.subdomain && adminUser.subdomain !== subdomain) {
    const err = new Error(`Tenant mismatch: user is in '${adminUser.subdomain}', but invoice belongs to '${subdomain}'`);
    err.statusCode = 403;
    throw err;
  }

  // Change Request: Explicit Department & Member Selection with System 3 KPI Ranking
  let explicitAssignment = null;
  if (departmentId || departmentName) {
    let deptDoc = null;
    if (departmentId) {
      deptDoc = await Department.findById(departmentId);
    } else if (departmentName) {
      deptDoc = await Department.findOne({
        subdomain,
        name: { $regex: new RegExp(`^${departmentName.trim()}$`, 'i') }
      });
    }

    if (!deptDoc) {
      const err = new Error('Department not found.');
      err.statusCode = 400;
      throw err;
    }

    // Tenant check on department
    if (deptDoc.subdomain && deptDoc.subdomain.toLowerCase() !== subdomain.toLowerCase()) {
      const err = new Error('Access denied: Department belongs to another organization.');
      err.statusCode = 403;
      throw err;
    }

    // 1. Fetch active workers for this department and tenant
    const activeDeptWorkers = await Worker.find({
      subdomain,
      status: 'Active',
      $or: [
        { department: deptDoc._id },
        { _id: { $in: deptDoc.assignedDevelopers || [] } }
      ]
    }).lean();

    if (activeDeptWorkers.length === 0) {
      const err = new Error(`Selected department '${deptDoc.name}' has no active eligible members in this organization.`);
      err.statusCode = 400;
      throw err;
    }

    // 2. Exclude employees on approved leave today
    const Leave = require('../models/Leave');
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const activeLeaves = await Leave.find({
      subdomain,
      worker: { $in: activeDeptWorkers.map(w => w._id) },
      status: 'Approved',
      startDate: { $lte: todayEnd },
      endDate: { $gte: todayStart }
    }).select('worker').lean();
    const onLeaveWorkerIds = new Set(activeLeaves.map(l => String(l.worker)));

    // 3. Exclude overloaded employees (>= 5 active tasks)
    const activeTickets = await Ticket.find({
      subdomain,
      isDeleted: { $ne: true },
      status: { $in: ['To Do', 'In Progress', 'Review'] },
      $or: [
        { assignee: { $in: activeDeptWorkers.map(w => w._id) } },
        { assignees: { $in: activeDeptWorkers.map(w => w._id) } }
      ]
    }).select('assignee assignees').lean();

    const workloadMap = new Map();
    activeDeptWorkers.forEach(w => workloadMap.set(String(w._id), 0));
    activeTickets.forEach(t => {
      const aid = t.assignee ? String(t.assignee) : null;
      if (aid && workloadMap.has(aid)) workloadMap.set(aid, workloadMap.get(aid) + 1);
      if (Array.isArray(t.assignees)) {
        t.assignees.forEach(a => {
          const id = String(a);
          if (id && id !== aid && workloadMap.has(id)) workloadMap.set(id, workloadMap.get(id) + 1);
        });
      }
    });

    const eligibleCandidates = activeDeptWorkers.filter(w => {
      const idStr = String(w._id);
      return !onLeaveWorkerIds.has(idStr) && (workloadMap.get(idStr) || 0) < 5;
    });

    if (eligibleCandidates.length === 0) {
      const allOnLeave = activeDeptWorkers.every(w => onLeaveWorkerIds.has(String(w._id)));
      const allOverloaded = activeDeptWorkers.every(w => (workloadMap.get(String(w._id)) || 0) >= 5);
      let reasonMsg = `Selected department '${deptDoc.name}' has no eligible members available.`;
      if (allOnLeave) {
        reasonMsg = `All eligible employees in department '${deptDoc.name}' are currently on approved leave.`;
      } else if (allOverloaded) {
        reasonMsg = `All available employees in department '${deptDoc.name}' are at maximum capacity (>= 5 active tasks).`;
      }
      const err = new Error(reasonMsg);
      err.statusCode = 400;
      throw err;
    }

    // 4. Authoritative System 3 KPI Profile enrichment & candidate ranking
    const { computeWorkerKpi } = require('./kpiComputationService');
    const { scoreAndRankCandidates } = require('./jobAssignmentService');

    const ticketContext = {
      title: invoice.customerName ? `Job for ${invoice.customerName}` : 'Invoice Job Ticket',
      description: (invoice.items || []).map(i => i.description).join(' '),
      labels: [`dept:${deptDoc.name.toLowerCase().replace(/\s+/g, '-')}`],
      checklist: []
    };

    const enrichedCandidates = await Promise.all(
      eligibleCandidates.map(async (candidate) => {
        try {
          const kpiProfile = await computeWorkerKpi(candidate, subdomain);
          if (kpiProfile && kpiProfile.system2Assignment) {
            return {
              ...candidate,
              kpiScore: kpiProfile.system2Assignment.kpiScore,
              kpiBreakdown: kpiProfile.system2Assignment.breakdown,
              otcr: kpiProfile.metrics.onTimeCompletionRate,
              ftar: kpiProfile.metrics.firstTimeApprovalRate,
              kpiExplanation: kpiProfile.system2Assignment.explanation
            };
          }
        } catch (kpiErr) {
          // Safe neutral fallback
        }
        return candidate;
      })
    );

    const rankedCandidates = scoreAndRankCandidates(enrichedCandidates, ticketContext, workloadMap);

    const mode = ['Individual', 'Team', 'Both'].includes(assignmentMode) ? assignmentMode : 'Individual';
    let targetAssignee = null;
    let targetAssignees = [];

    if (mode === 'Individual') {
      const memberId = selectedMemberId || (Array.isArray(selectedMemberIds) && selectedMemberIds[0]);
      if (memberId) {
        const belongs = activeDeptWorkers.some(w => String(w._id) === String(memberId));
        if (!belongs) {
          const err = new Error('Selected member is invalid, inactive, or does not belong to the selected department.');
          err.statusCode = 400;
          throw err;
        }
        if (onLeaveWorkerIds.has(String(memberId))) {
          const err = new Error('Selected employee is currently on approved leave.');
          err.statusCode = 400;
          throw err;
        }
        if ((workloadMap.get(String(memberId)) || 0) >= 5) {
          const err = new Error('Selected employee is at maximum capacity (>= 5 active tasks).');
          err.statusCode = 400;
          throw err;
        }
        targetAssignee = memberId;
        targetAssignees = [memberId];
      } else {
        targetAssignee = rankedCandidates[0].worker._id;
        targetAssignees = [targetAssignee];
      }

    } else if (mode === 'Team') {
      let requestedSize = null;
      if (teamSize !== undefined && teamSize !== null && teamSize !== '') {
        requestedSize = Number(teamSize);
      } else if (requiredMembersCount !== undefined && requiredMembersCount !== null && requiredMembersCount !== '') {
        requestedSize = Number(requiredMembersCount);
      } else if (Array.isArray(selectedMemberIds) && selectedMemberIds.length > 0) {
        requestedSize = selectedMemberIds.length;
      }

      if (requestedSize === null) {
        const err = new Error('Please specify the Number of Team Members. At least one active member must be selected for Team assignment mode.');
        err.statusCode = 400;
        throw err;
      }

      if (!Number.isInteger(requestedSize) || requestedSize <= 0) {
        const err = new Error('Requested team size must be a positive integer.');
        err.statusCode = 400;
        throw err;
      }

      if (requestedSize > eligibleCandidates.length) {
        const err = new Error(`Requested team size (${requestedSize}) exceeds the number of eligible employees (${eligibleCandidates.length}) in department '${deptDoc.name}'.`);
        err.statusCode = 400;
        err.eligibleCount = eligibleCandidates.length;
        throw err;
      }

      // If manual member IDs were passed matching the requested size, validate each member's eligibility:
      if (Array.isArray(selectedMemberIds) && selectedMemberIds.length === requestedSize && (!teamSize || Number(teamSize) === selectedMemberIds.length)) {
        for (const mid of selectedMemberIds) {
          const idStr = String(mid);
          const isDeptMember = activeDeptWorkers.some(w => String(w._id) === idStr);
          if (!isDeptMember) {
            const err = new Error('One or more selected members are invalid, inactive, or do not belong to the selected department.');
            err.statusCode = 400;
            throw err;
          }
          if (onLeaveWorkerIds.has(idStr)) {
            const err = new Error('One or more selected members are currently on approved leave.');
            err.statusCode = 400;
            throw err;
          }
          if ((workloadMap.get(idStr) || 0) >= 5) {
            const err = new Error('One or more selected members are at maximum capacity (>= 5 active tasks).');
            err.statusCode = 400;
            throw err;
          }
        }
        targetAssignees = [...new Set(selectedMemberIds.map(String))];
        targetAssignee = (selectedMemberId && targetAssignees.includes(String(selectedMemberId)))
          ? selectedMemberId
          : targetAssignees[0];
      } else {
        // System 3 KPI ranking selects exactly the requested number of top-ranked candidates
        const chosen = rankedCandidates.slice(0, requestedSize);
        targetAssignees = chosen.map(c => c.worker._id);
        targetAssignee = chosen[0].worker._id;
      }

    } else if (mode === 'Both') {
      const leadId = selectedMemberId || (Array.isArray(selectedMemberIds) && selectedMemberIds[0]);
      if (!leadId) {
        const err = new Error('Please designate a primary lead member for Both assignment mode.');
        err.statusCode = 400;
        throw err;
      }

      const leadIdStr = String(leadId);
      const isDeptMember = activeDeptWorkers.some(w => String(w._id) === leadIdStr);
      if (!isDeptMember) {
        const err = new Error(`Designated lead employee does not belong to department '${deptDoc.name}'.`);
        err.statusCode = 400;
        throw err;
      }
      if (onLeaveWorkerIds.has(leadIdStr)) {
        const err = new Error('Designated lead employee is currently on approved leave and cannot be assigned.');
        err.statusCode = 400;
        throw err;
      }
      if ((workloadMap.get(leadIdStr) || 0) >= 5) {
        const err = new Error('Designated lead employee is at maximum capacity (>= 5 active tasks).');
        err.statusCode = 400;
        throw err;
      }

      const leadWorker = activeDeptWorkers.find(w => String(w._id) === leadIdStr);

      let requestedSize = null;
      if (teamSize !== undefined && teamSize !== null && teamSize !== '') {
        requestedSize = Number(teamSize);
      } else if (requiredMembersCount !== undefined && requiredMembersCount !== null && requiredMembersCount !== '') {
        requestedSize = Number(requiredMembersCount);
      } else if (Array.isArray(selectedMemberIds) && selectedMemberIds.length > 0) {
        requestedSize = selectedMemberIds.length;
      } else {
        requestedSize = 2;
      }

      if (!Number.isInteger(requestedSize) || requestedSize < 2) {
        const err = new Error('Both assignment mode requires at least 2 team members.');
        err.statusCode = 400;
        throw err;
      }

      if (requestedSize > eligibleCandidates.length) {
        const err = new Error(`Requested team size (${requestedSize}) exceeds the number of eligible employees (${eligibleCandidates.length}) in department '${deptDoc.name}'.`);
        err.statusCode = 400;
        err.eligibleCount = eligibleCandidates.length;
        throw err;
      }

      targetAssignee = leadWorker._id;
      const remainingRanked = rankedCandidates.filter(c => String(c.worker._id) !== leadIdStr);
      const topRemaining = remainingRanked.slice(0, requestedSize - 1);
      targetAssignees = [leadWorker._id, ...topRemaining.map(c => c.worker._id)];
    }

    targetAssignees = [...new Set(targetAssignees.map(String))];

    const chosenMembersSummary = targetAssignees.map(id => {
      const ranked = rankedCandidates.find(c => String(c.worker._id) === String(id));
      if (ranked) {
        return {
          _id: ranked.worker._id,
          name: ranked.worker.name,
          designation: ranked.worker.designation || 'Developer',
          kpiScore: ranked.worker.kpiScore ?? null,
          totalScore: ranked.totalScore,
          activeTasks: ranked.activeTasks,
          otcr: ranked.worker.otcr ?? null,
          ftar: ranked.worker.ftar ?? null,
          explanation: ranked.worker.kpiExplanation || `Score: ${ranked.totalScore} pts (Workload: ${5 - ranked.activeTasks}/5)`
        };
      }
      const worker = activeDeptWorkers.find(w => String(w._id) === String(id));
      return {
        _id: id,
        name: worker?.name || 'Team Member',
        designation: worker?.designation || 'Developer',
        kpiScore: null,
        totalScore: 0,
        activeTasks: 0,
        explanation: 'Designated lead employee'
      };
    });

    explicitAssignment = {
      department: deptDoc,
      mode,
      assignee: targetAssignee,
      assignees: targetAssignees,
      teamSize: targetAssignees.length,
      selectedMembers: chosenMembersSummary,
      adminUser
    };
  }

  // 2. Authoritative Job Classification
  const departments = await Department.find({ subdomain }).lean();
  const activeWorkers = await Worker.find({ subdomain, status: 'Active' }).lean();

  const classification = classifyInvoiceJob({
    invoice,
    departments,
    workers: activeWorkers
  });

  const effectiveJobType = explicitAssignment ? explicitAssignment.department.name : (selectedJobType || classification.jobType);
  const classificationReason = explicitAssignment
    ? `Admin selected department '${explicitAssignment.department.name}' (${explicitAssignment.mode} mode)`
    : classification.reason;

  // 3. Derive unique orderId from externalOrderId or deterministic invoice reference
  const orderId = (invoice.externalOrderId && String(invoice.externalOrderId).trim())
    ? String(invoice.externalOrderId).trim()
    : `INV-${invoice.invoiceNo || invoice._id}`;

  const now = new Date();

  // 4. Idempotency Check: return existing completed intake without creating duplicates
  const isValidObjectId = mongoose.Types.ObjectId.isValid(invoice._id);
  const queryOr = [{ orderId }];
  if (isValidObjectId) {
    queryOr.push({ invoiceId: invoice._id });
  }

  const existingIntake = await JobIntake.findOne({
    subdomain,
    $or: queryOr
  });

  if (existingIntake && existingIntake.intakeStatus === 'COMPLETED') {
    let ticket = null;
    if (existingIntake.ticketId) {
      ticket = await Ticket.findById(existingIntake.ticketId);
    }
    if (!ticket) {
      ticket = await Ticket.findOne({
        subdomain,
        labels: `order:${orderId}`
      });
    }

    // Case 1: Active ticket exists — return existing references without creating duplicates
    if (ticket && !ticket.isDeleted) {
      if (existingIntake.jobDetails && (selectedJobType || !existingIntake.jobDetails.serviceCategory || existingIntake.jobDetails.serviceCategory === 'General')) {
        existingIntake.jobDetails.serviceCategory = effectiveJobType;
        await existingIntake.save({ session });
      }

      // Synchronize classification & assignment to existing ticket
      ticket = await applyJobTypeAssignmentToTicket({
        ticket,
        effectiveJobType,
        classificationReason,
        departments,
        subdomain,
        session,
        explicitAssignment
      });

      return {
        success: true,
        isDuplicate: true,
        isRecovered: false,
        intakeId: existingIntake._id,
        orderId: existingIntake.orderId,
        invoiceNo: existingIntake.invoiceNo || invoice.invoiceNo,
        invoiceId: invoice._id,
        ticketId: ticket._id,
        status: 'COMPLETED',
        department: explicitAssignment ? explicitAssignment.department.name : null,
        assignmentMode: explicitAssignment ? explicitAssignment.mode : ticket.assignmentMode,
        assignedMembersCount: explicitAssignment ? explicitAssignment.assignees.length : (ticket.assignees?.length || (ticket.assignee ? 1 : 0)),
        assignees: explicitAssignment ? explicitAssignment.assignees : (ticket.assignees || []),
        assignee: explicitAssignment ? explicitAssignment.assignee : ticket.assignee,
        selectedMembers: explicitAssignment?.selectedMembers || [],
        jobType: existingIntake.jobDetails?.serviceCategory || effectiveJobType,
        reason: classificationReason
      };
    }

    // Case 2: Ticket was soft-deleted — inspect and safely restore
    if (ticket && ticket.isDeleted) {
      // Tenant isolation guard
      if (ticket.subdomain && ticket.subdomain.toLowerCase() !== subdomain.toLowerCase()) {
        const err = new Error('Cross-tenant ticket reference detected.');
        err.statusCode = 403;
        throw err;
      }

      // Check if deletion was ambiguous or intentional (e.g. explicitly rejected)
      if (ticket.approvalStatus === 'Rejected') {
        const err = new Error('The job ticket associated with this invoice was explicitly marked as Rejected prior to deletion. Please review Work Allocation or contact an administrator before restoring.');
        err.statusCode = 409;
        throw err;
      }

      // Check if another active ticket exists for this order
      const anotherActiveTicket = await Ticket.findOne({
        subdomain,
        labels: `order:${orderId}`,
        isDeleted: { $ne: true },
        _id: { $ne: ticket._id }
      });

      let finalTicket = ticket;
      if (anotherActiveTicket) {
        finalTicket = anotherActiveTicket;
      } else {
        finalTicket = await Ticket.findOneAndUpdate(
          { _id: ticket._id, subdomain },
          {
            $set: {
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              status: (!ticket.status || ticket.status === 'Done') ? 'To Do' : ticket.status
            }
          },
          { new: true, session }
        );
      }

      existingIntake.ticketId = finalTicket._id;
      existingIntake.invoiceId = invoice._id;
      existingIntake.invoiceNo = invoice.invoiceNo;
      existingIntake.intakeStatus = 'COMPLETED';
      if (existingIntake.jobDetails) {
        existingIntake.jobDetails.serviceCategory = effectiveJobType;
      }
      await existingIntake.save({ session });

      if (!invoice.externalOrderId || invoice.externalOrderId !== orderId) {
        await Invoice.findByIdAndUpdate(invoice._id, {
          externalOrderId: orderId,
          source: invoice.source || 'intake'
        });
      }

      // Apply confirmed classification and assignment to restored ticket
      finalTicket = await applyJobTypeAssignmentToTicket({
        ticket: finalTicket,
        effectiveJobType,
        classificationReason,
        departments,
        subdomain,
        session,
        explicitAssignment
      });

      return {
        success: true,
        isDuplicate: false,
        isRecovered: true,
        recoveredAction: 'restored',
        intakeId: existingIntake._id,
        orderId: existingIntake.orderId,
        invoiceNo: existingIntake.invoiceNo || invoice.invoiceNo,
        invoiceId: invoice._id,
        ticketId: finalTicket._id,
        status: 'COMPLETED',
        department: explicitAssignment ? explicitAssignment.department.name : null,
        assignmentMode: explicitAssignment ? explicitAssignment.mode : finalTicket.assignmentMode,
        assignedMembersCount: explicitAssignment ? explicitAssignment.assignees.length : (finalTicket.assignees?.length || (finalTicket.assignee ? 1 : 0)),
        jobType: effectiveJobType,
        reason: classificationReason
      };
    }

    // Case 3: Ticket is missing / permanently deleted — recreate exactly one ticket and relink
    let activeTicket = await Ticket.findOne({
      subdomain,
      labels: `order:${orderId}`,
      isDeleted: { $ne: true }
    });

    if (!activeTicket) {
      const created = await createVerifiedInvoiceTicketAndSubtasks({
        invoice,
        orderId,
        admin,
        subdomain,
        now,
        session,
        effectiveJobType,
        classification
      });
      activeTicket = created.mainTicket;
    }

    existingIntake.ticketId = activeTicket._id;
    existingIntake.invoiceId = invoice._id;
    existingIntake.invoiceNo = invoice.invoiceNo;
    existingIntake.intakeStatus = 'COMPLETED';
    if (existingIntake.jobDetails) {
      existingIntake.jobDetails.serviceCategory = effectiveJobType;
    }
    await existingIntake.save({ session });

    if (!invoice.externalOrderId || invoice.externalOrderId !== orderId) {
      await Invoice.findByIdAndUpdate(invoice._id, {
        externalOrderId: orderId,
        source: invoice.source || 'intake'
      });
    }

    activeTicket = await applyJobTypeAssignmentToTicket({
      ticket: activeTicket,
      effectiveJobType,
      classificationReason,
      departments,
      subdomain,
      session,
      explicitAssignment
    });

    return {
      success: true,
      isDuplicate: false,
      isRecovered: true,
      recoveredAction: 'recreated',
      intakeId: existingIntake._id,
      orderId: existingIntake.orderId,
      invoiceNo: existingIntake.invoiceNo || invoice.invoiceNo,
      invoiceId: invoice._id,
      ticketId: activeTicket._id,
      status: 'COMPLETED',
      department: explicitAssignment ? explicitAssignment.department.name : null,
      assignmentMode: explicitAssignment ? explicitAssignment.mode : activeTicket.assignmentMode,
      assignedMembersCount: explicitAssignment ? explicitAssignment.assignees.length : (activeTicket.assignees?.length || (activeTicket.assignee ? 1 : 0)),
      jobType: effectiveJobType,
      reason: classificationReason
    };
  }

  // 4. Ticket Lookup & Idempotent Creation (strictly unassigned 'To Do')
  let ticketInstance = null;
  if (existingIntake && existingIntake.ticketId) {
    ticketInstance = await Ticket.findById(existingIntake.ticketId);
  }
  if (!ticketInstance) {
    ticketInstance = await Ticket.findOne({
      subdomain,
      labels: `order:${orderId}`
    });
  }

  if (ticketInstance && ticketInstance.isDeleted) {
    ticketInstance = await Ticket.findOneAndUpdate(
      { _id: ticketInstance._id, subdomain },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          status: 'To Do'
        }
      },
      { new: true, session }
    );
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const totalAmount = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);

  if (!ticketInstance) {
    const created = await createVerifiedInvoiceTicketAndSubtasks({
      invoice,
      orderId,
      admin,
      subdomain,
      now,
      session,
      effectiveJobType,
      classification
    });
    ticketInstance = created.mainTicket;
  }

  // 5. JobIntake Record Creation / Linkage
  const cleanPhone = String(invoice.customerContact || '').replace(/[^0-9+]/g, '');
  const cleanCustomer = {
    name: String(invoice.customerName || 'Customer').trim().slice(0, 100) || 'Valued Customer',
    phone: cleanPhone.length >= 10 ? cleanPhone.slice(0, 15) : '9999999999',
    email: '',
    address: String(invoice.customerAddress || '').trim().slice(0, 300),
    gstin: String(invoice.customerGst || '').trim().toUpperCase()
  };

  const cleanItems = items.map(it => ({
    description: String(it.description || 'Service Item').trim(),
    hsn: String(it.hsn || '').trim(),
    gst: typeof it.gst === 'number' ? it.gst : 18,
    qty: Math.max(1, parseInt(it.qty, 10) || 1),
    rate: Math.max(0, parseFloat(it.rate) || 0),
    total: Math.max(0, parseFloat(it.total) || 0)
  }));

  const intakeData = {
    orderId,
    subdomain,
    customer: cleanCustomer,
    jobDetails: {
      title: `Job for Invoice #${invoice.invoiceNo}`,
      description: invoice.notes || classificationReason || 'Created automatically upon payment verification',
      serviceCategory: effectiveJobType,
      team: ticketInstance.team || null,
      priority: 'High',
      deliverables: cleanItems.map(it => it.description)
    },
    items: cleanItems.length > 0 ? cleanItems : [{
      description: 'General Technical Services',
      hsn: '',
      gst: 18,
      qty: 1,
      rate: totalAmount,
      total: totalAmount
    }],
    payment: {
      gateway: 'manual',
      amount: totalAmount,
      currency: 'INR',
      paymentStatus: 'VERIFIED',
      verifiedAt: now,
      transactionRef: invoice.invoiceNo,
      manualVerification: true
    },
    invoiceId: isValidObjectId ? invoice._id : undefined,
    invoiceNo: invoice.invoiceNo,
    ticketId: ticketInstance._id,
    intakeStatus: 'COMPLETED'
  };

  let isConcurrentCollision = false;
  let intake = existingIntake;
  if (!intake) {
    intake = new JobIntake(intakeData);
    try {
      await intake.save({ session });
    } catch (intakeErr) {
      if (intakeErr.code === 11000) {
        isConcurrentCollision = true;
        intake = await JobIntake.findOne({ subdomain, orderId });
        if (intake) {
          if (intake.ticketId && String(intake.ticketId) !== String(ticketInstance._id)) {
            // Winning concurrent thread already created and linked its ticket!
            // Delete the duplicate ticket created by this concurrent thread
            if (ticketInstance._id && Ticket.findByIdAndDelete) {
              await Ticket.findByIdAndDelete(ticketInstance._id);
            }
            const winnerTicket = await Ticket.findById(intake.ticketId);
            if (winnerTicket) {
              ticketInstance = winnerTicket;
            }
          } else {
            intake.ticketId = ticketInstance._id;
            intake.invoiceId = invoice._id;
            intake.invoiceNo = invoice.invoiceNo;
            intake.intakeStatus = 'COMPLETED';
            if (intake.jobDetails) {
              intake.jobDetails.serviceCategory = effectiveJobType;
            }
            await intake.save({ session });
          }
        } else {
          throw intakeErr;
        }
      } else {
        throw intakeErr;
      }
    }
  } else {
    intake.ticketId = ticketInstance._id;
    intake.invoiceId = invoice._id;
    intake.invoiceNo = invoice.invoiceNo;
    intake.intakeStatus = 'COMPLETED';
    if (intake.jobDetails) {
      intake.jobDetails.serviceCategory = effectiveJobType;
    }
    await intake.save({ session });
  }

  // 6. Ensure invoice references orderId without altering invoice sequence
  if (!invoice.externalOrderId || invoice.externalOrderId !== orderId) {
    await Invoice.findByIdAndUpdate(invoice._id, {
      externalOrderId: orderId,
      source: invoice.source || 'intake'
    });
  }

  // 7. System 2: Automatic Job Assignment based on authoritative effectiveJobType
  ticketInstance = await applyJobTypeAssignmentToTicket({
    ticket: ticketInstance,
    effectiveJobType,
    classificationReason,
    departments,
    subdomain,
    session,
    explicitAssignment
  });

  return {
    success: true,
    isDuplicate: isConcurrentCollision,
    intakeId: intake._id,
    orderId,
    invoiceNo: invoice.invoiceNo,
    invoiceId: invoice._id,
    ticketId: ticketInstance._id,
    status: 'COMPLETED',
    department: explicitAssignment ? explicitAssignment.department.name : null,
    assignmentMode: explicitAssignment ? explicitAssignment.mode : ticketInstance.assignmentMode,
    assignedMembersCount: explicitAssignment ? explicitAssignment.assignees.length : (ticketInstance.assignees?.length || (ticketInstance.assignee ? 1 : 0)),
    assignees: explicitAssignment ? explicitAssignment.assignees : (ticketInstance.assignees || []),
    assignee: explicitAssignment ? explicitAssignment.assignee : ticketInstance.assignee,
    selectedMembers: explicitAssignment?.selectedMembers || [],
    jobType: effectiveJobType,
    reason: classificationReason
  };
};

module.exports = {
  processJobIntake,
  processJobIntakeFromVerifiedInvoice,
  retryJobIntake,
  formatDateDMY,
  LEASE_DURATION_MS
};

