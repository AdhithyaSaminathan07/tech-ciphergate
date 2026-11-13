const Invoice = require('../models/Invoice');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const JobIntake = require('../models/JobIntake');
const DeleteHistory = require('../models/DeleteHistory');
const mongoose = require('mongoose');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, format } = require('date-fns');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');
const { classifyInvoiceJob } = require('../services/jobAssignmentService');

// Helper to parse DD-MM-YYYY, YYYY-MM-DD or DD/MM/YYYY to Date object
const parseInvoiceDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).trim();
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    return new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
  }
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
};

// Safely execute Mongoose queries or plain mock promises with optional .select() / .lean()
const execSelectLean = async (queryOrPromise, selectFields) => {
  let q = queryOrPromise;
  if (q && typeof q.select === 'function' && selectFields) {
    q = q.select(selectFields);
  }
  if (q && typeof q.lean === 'function') {
    q = q.lean();
  }
  return q;
};

const normalizeSubdomain = (value) => (value ? String(value).trim().toLowerCase() : '');

// Resolve and require authenticated tenant subdomain from JWT user or API key context
const resolveAuthTenant = (req, res) => {
  const raw = req.user?.subdomain || req.apiKey?.subdomain;
  const trimmed = raw ? String(raw).trim() : '';
  const normalized = normalizeSubdomain(trimmed);
  if (!normalized || normalized === 'main') {
    res.status(401).json({
      success: false,
      message: 'Company name is missing, login again'
    });
    return null;
  }
  return trimmed;
};

// Collect all Admin and Worker IDs belonging to the authenticated tenant
const getTenantUserIds = async (subdomain) => {
  const [admins, workers] = await Promise.all([
    execSelectLean(Admin.find({ subdomain }), '_id'),
    execSelectLean(Worker.find({ subdomain }), '_id')
  ]);
  const ids = [];
  for (const admin of admins || []) {
    if (admin && admin._id) ids.push(admin._id);
  }
  for (const worker of workers || []) {
    if (worker && worker._id) ids.push(worker._id);
  }
  return ids;
};

// Resolve owning tenant subdomain from creator record (Admin/Worker)
const resolveCreatorSubdomain = async (createdBy, createdByModel) => {
  const creatorId = createdBy?._id || createdBy;
  if (!creatorId) return null;
  if (createdByModel === 'Admin') {
    const creator = await execSelectLean(Admin.findById(creatorId), 'subdomain');
    return creator?.subdomain || null;
  }
  if (createdByModel === 'Worker') {
    const creator = await execSelectLean(Worker.findById(creatorId), 'subdomain');
    return creator?.subdomain || null;
  }
  return null;
};

// Fail-closed tenant verification for an invoice document
const assertInvoiceTenantAccess = async (res, invoice, authSubdomain) => {
  let invoiceSubdomain = await resolveCreatorSubdomain(invoice.createdBy, invoice.createdByModel);
  if (!invoiceSubdomain && invoice.subdomain) {
    invoiceSubdomain = invoice.subdomain;
  }
  if (!invoiceSubdomain || normalizeSubdomain(invoiceSubdomain) !== normalizeSubdomain(authSubdomain)) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Invoice belongs to another organization.'
    });
    return null;
  }
  return invoiceSubdomain;
};

// Fail-closed tenant verification for a DeleteHistory document
const assertDeleteHistoryTenantAccess = async (res, record, authSubdomain) => {
  let recordSubdomain = await resolveCreatorSubdomain(record.deletedById, record.deletedByRole);
  if (!recordSubdomain && record.originalInvoiceData) {
    recordSubdomain = await resolveCreatorSubdomain(
      record.originalInvoiceData.createdBy,
      record.originalInvoiceData.createdByModel
    );
  }
  if (!recordSubdomain && record.originalInvoiceData?.subdomain) {
    recordSubdomain = record.originalInvoiceData.subdomain;
  }
  if (!recordSubdomain || normalizeSubdomain(recordSubdomain) !== normalizeSubdomain(authSubdomain)) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Delete history belongs to another organization.'
    });
    return null;
  }
  return recordSubdomain;
};

// Create a new invoice
const createInvoice = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const {
      invoiceNo,
      invoiceDate,
      customerName,
      customerContact,
      salesPerson,
      terms,
      dueDate,
      items,
      bankName,
      accountNumber,
      ifscCode,
      upiId,
      upiNumber,
      gstEnabled,
      saleType,
      customerGst,
      invoiceType,
      workerInfo,
      source
    } = req.body;

    // Validate required fields
    if (!invoiceNo || !invoiceDate || !items || !items.length) {
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing'
      });
    }

    // Check if invoice already exists
    const existingInvoice = await Invoice.findOne({ invoiceNo });
    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: 'Invoice with this number already exists'
      });
    }

    // Determine the creator model based on user role
    const createdByModel = req.user.role === 'admin' ? 'Admin' : 'Worker';

    // Determine initial invoice type: TAX INVOICE if payment proof exists, otherwise PROFORMA INVOICE
    const hasCreatePaymentProof = !!(req.body.paymentDetails && ((Array.isArray(req.body.paymentDetails.proofs) && req.body.paymentDetails.proofs.length > 0) || (req.body.paymentDetails.proof && String(req.body.paymentDetails.proof).trim().length > 0)));
    const initialInvoiceType = hasCreatePaymentProof ? 'TAX INVOICE' : (invoiceType || 'PROFORMA INVOICE');

    // Determine initial status: Payment Received if payment proof exists or TAX INVOICE, otherwise default
    const initialStatus = (hasCreatePaymentProof || initialInvoiceType === 'TAX INVOICE' || req.body.isPaid)
      ? 'Payment Received'
      : (req.body.status || 'Invoice');

    // Create new invoice
    const invoice = new Invoice({
      invoiceNo,
      invoiceDate,
      customerName: customerName || '',
      customerContact: customerContact || '',
      salesPerson: salesPerson || '',
      terms: terms || '',
      dueDate: dueDate || '',
      items,
      bankName: bankName || '',
      accountNumber: accountNumber || '',
      ifscCode: ifscCode || '',
      upiId: upiId || '',
      upiNumber: upiNumber || '',
      gstEnabled: true,
      saleType: saleType || 'Intrastate',
      customerGst: customerGst || '',
      invoiceType: initialInvoiceType,
      status: initialStatus,
      isPaid: req.body.isPaid || false,
      paymentRecords: req.body.paymentRecords || [],
      paymentDetails: req.body.paymentDetails || undefined,
      externalOrderId: req.body.externalOrderId || undefined,
      createdBy: req.user._id,
      createdByModel,
      workerInfo: workerInfo || {},
      source: source || (req.user.role === 'admin' ? 'admin' : 'worker'),
      actualDate: parseInvoiceDate(invoiceDate)
    });

    const savedInvoice = await invoice.save();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: savedInvoice
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating invoice',
      error: error.message
    });
  }
};

// Update an existing invoice
const updateInvoice = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const { id } = req.params;
    const updateData = req.body;


    // Remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.__v;
    delete updateData.createdBy;
    delete updateData.createdByModel;

    // Add updatedAt timestamp and mark as edited
    updateData.updatedAt = new Date();
    updateData.isEdited = true;

    if (updateData.invoiceDate) {
      updateData.actualDate = parseInvoiceDate(updateData.invoiceDate);
    }

    // Handle multi-proof appending for stage details
    const stageFields = ['paymentDetails', 'workDetails', 'closureDetails'];
    let existingInvoice = await Invoice.findById(id);

    if (!existingInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user has permission to update this invoice
    // Workers can update their own invoices, admins can update any invoice in their tenant
    const isInvoiceOwner = Boolean(
      existingInvoice.createdBy &&
      req.user?._id &&
      existingInvoice.createdBy.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own invoices.'
      });
    }

    // Fail-closed tenant isolation check
    const invoiceTenant = await assertInvoiceTenantAccess(res, existingInvoice, authSubdomain);
    if (!invoiceTenant) return;

    // Check if new invoiceNo is already used by another invoice
    if (updateData.invoiceNo && updateData.invoiceNo !== existingInvoice.invoiceNo) {
      const duplicate = await Invoice.findOne({ invoiceNo: updateData.invoiceNo, _id: { $ne: id } });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Invoice number "${updateData.invoiceNo}" is already in use by another invoice.`
        });
      }
    }

    for (const field of stageFields) {
      if (updateData[field]) {
        if (Array.isArray(updateData[field].proofs)) {
          // Frontend provided the proofs array directly - save as is without duplicating
          const proofsArr = updateData[field].proofs;
          updateData[field].proof = updateData[field].proof || (proofsArr.length > 0 ? (proofsArr[0]?.url || proofsArr[0]?.proof || proofsArr[0]) : null);
        } else if (updateData[field].proof) {
          // Legacy single proof string from old clients
          const existingProofs = (existingInvoice[field] && Array.isArray(existingInvoice[field].proofs))
            ? [...existingInvoice[field].proofs]
            : [];

          if (existingProofs.length === 0 && existingInvoice[field] && existingInvoice[field].proof) {
            existingProofs.push({ date: existingInvoice[field].date || existingInvoice.createdAt, url: existingInvoice[field].proof });
          }

          existingProofs.push({ date: updateData[field].date || new Date(), url: updateData[field].proof });

          updateData[field] = {
            date: updateData[field].date || new Date(),
            proof: updateData[field].proof,
            proofs: existingProofs
          };
        }
      }
    }

    const finalPayment = updateData.paymentDetails !== undefined ? updateData.paymentDetails : existingInvoice.paymentDetails;
    const hasPaymentProof = !!(finalPayment && ((Array.isArray(finalPayment.proofs) && finalPayment.proofs.length > 0) || (finalPayment.proof && String(finalPayment.proof).trim().length > 0)));

    if (hasPaymentProof) {
      updateData.invoiceType = 'TAX INVOICE';
      if (!updateData.status || updateData.status === 'Invoice') {
        if (!existingInvoice.status || existingInvoice.status === 'Invoice') {
          updateData.status = 'Payment Received';
        }
      }
    } else if (!updateData.invoiceType) {
      updateData.invoiceType = existingInvoice.invoiceType || 'PROFORMA INVOICE';
    }

    const invoice = await Invoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Trigger Job Intake only at the successful, authorized payment-verification transition
    // Condition: valid payment proof is present AND status is verified ('Payment Received', 'Work completion', 'Closure agreement', or isPaid)
    let intakeResult = null;
    const isPaymentVerified = hasPaymentProof && (
      invoice.status === 'Payment Received' ||
      invoice.status === 'Work completion' ||
      invoice.status === 'Closure agreement' ||
      invoice.isPaid
    );

    if (isPaymentVerified) {
      try {
        intakeResult = await processJobIntakeFromVerifiedInvoice({
          invoice,
          adminUser: req.user
        });
      } catch (intakeErr) {
        console.error('[InvoiceController] Failed to process job intake for verified invoice:', intakeErr);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: invoice,
      ...(intakeResult ? { intake: intakeResult } : {})
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating invoice',
      error: error.message
    });
  }
};

// Get all invoices for an admin or worker
const getInvoicesByAdminOrWorker = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    // Workers can only see their own invoices; admins can see all invoices in their tenant
    let query;
    if (req.user.role === 'worker') {
      query = { createdBy: req.user._id };
    } else {
      const tenantUserIds = await getTenantUserIds(authSubdomain);
      query = { createdBy: { $in: tenantUserIds } };
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      data: invoices
    });
  } catch (error) {
    console.error('Error retrieving invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving invoices',
      error: error.message
    });
  }
};

// Get all invoices for an admin (maintained for backward compatibility)
const getInvoicesByAdmin = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const invoices = await Invoice.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      data: invoices
    });
  } catch (error) {
    console.error('Error retrieving invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving invoices',
      error: error.message
    });
  }
};

// Get all invoices (admin only)
const getAllInvoices = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can view all organization invoices.'
      });
    }

    const tenantUserIds = await getTenantUserIds(authSubdomain);
    const { filterType, startDate, endDate, gstFilter } = req.query;
    let query = { createdBy: { $in: tenantUserIds } };

    const now = new Date();

    if (filterType === 'today') {
      query.actualDate = {
        $gte: startOfDay(now),
        $lte: endOfDay(now)
      };
    } else if (filterType === 'weekly') {
      query.actualDate = {
        $gte: startOfWeek(now, { weekStartsOn: 1 }), // Start from Monday
        $lte: endOfWeek(now, { weekStartsOn: 1 })
      };
    } else if (filterType === 'monthly') {
      query.actualDate = {
        $gte: startOfMonth(now),
        $lte: endOfMonth(now)
      };
    } else if (filterType === 'custom' && startDate && endDate) {
      query.actualDate = {
        $gte: startOfDay(new Date(startDate)),
        $lte: endOfDay(new Date(endDate))
      };
    }

    // Apply GST filter
    if (gstFilter === 'gst') {
      query.gstEnabled = true;
    } else if (gstFilter === 'non-gst') {
      query.gstEnabled = false;
    } else if (gstFilter === 'igst') {
      query.gstEnabled = true;
      query.saleType = 'Interstate';
    } else if (gstFilter === 'cgst-sgst') {
      query.gstEnabled = true;
      query.saleType = 'Intrastate';
    }
    // If filterType is 'all' or missing, query remains {} which fetches everything.

    const invoices = await Invoice.find(query)
      .populate({
        path: 'createdBy',
        select: 'name email department',
        options: { strictPopulate: false },
        populate: {
          path: 'department',
          select: 'name',
          model: 'Department',
          options: { strictPopulate: false }
        }
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'All invoices retrieved successfully',
      data: invoices
    });
  } catch (error) {
    console.error('Error retrieving all invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving all invoices',
      error: error.message
    });
  }
};

// Get a single invoice by ID
const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID'
      });
    }

    const invoice = await Invoice.findById(id)
      .populate({
        path: 'createdBy',
        select: 'name email department',
        options: { strictPopulate: false },
        populate: {
          path: 'department',
          select: 'name',
          model: 'Department',
          options: { strictPopulate: false }
        }
      });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user has permission to access this invoice
    // Workers can access their own invoices, admins can access any invoice in their tenant
    const creatorId = invoice.createdBy?._id || invoice.createdBy;
    const isInvoiceOwner = Boolean(creatorId && req.user?._id && creatorId.toString() === req.user._id.toString());
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own invoices.'
      });
    }

    const invoiceTenant = await assertInvoiceTenantAccess(res, invoice, authSubdomain);
    if (!invoiceTenant) return;

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      data: invoice
    });
  } catch (error) {
    console.error('Error retrieving invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving invoice',
      error: error.message
    });
  }
};

// Delete an invoice
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID'
      });
    }

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user has permission to delete this invoice
    // Workers can delete their own invoices, admins can delete any invoice in their tenant
    const isInvoiceOwner = Boolean(
      invoice.createdBy &&
      req.user?._id &&
      invoice.createdBy.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own invoices.'
      });
    }

    const invoiceTenant = await assertInvoiceTenantAccess(res, invoice, authSubdomain);
    if (!invoiceTenant) return;

    // Calculate total amount for storing in delete history
    const subtotal = invoice.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);

    const gstTotal = (invoice.gstEnabled) ?
      invoice.items.reduce((sum, item) =>
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;

    const totalAmount = subtotal + gstTotal;

    // Get user information for delete history
    let deletedByName = 'Unknown User';
    let deletedById = req.user._id;
    let deletedByRole = req.user.role === 'admin' ? 'Admin' : 'Worker';

    try {
      if (req.user.role === 'admin') {
        const admin = await Admin.findById(req.user._id);
        deletedByName = (admin && admin.name) ? admin.name : `Admin (${req.user.email || 'No Email'})`;
      } else {
        const worker = await Worker.findById(req.user._id);
        deletedByName = (worker && worker.name) ? worker.name : `Worker (${req.user.email || 'No Email'})`;
      }
    } catch (userLookupError) {
      console.error('Error looking up user for delete history:', userLookupError);
      // Use fallback values
      deletedByName = req.user.role === 'admin' ? 'Unknown Admin' : 'Unknown Worker';
    }

    // Create delete history record
    const deleteHistory = new DeleteHistory({
      invoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      customerName: invoice.customerName || '',
      totalAmount: totalAmount,
      deletedByRole: deletedByRole,
      deletedByName: deletedByName,
      deletedById: deletedById,
      originalInvoiceData: invoice // Store the entire invoice data for viewing details
    });

    await deleteHistory.save();

    // Remove the invoice from the main collection
    await Invoice.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully and moved to delete history'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting invoice',
      error: error.message
    });
  }
};

// Update admin last viewed timestamp
const updateAdminLastViewed = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can update admin view state.'
      });
    }

    const tenantUserIds = await getTenantUserIds(authSubdomain);

    // Update tenant invoices to set adminLastViewed to current time
    const result = await Invoice.updateMany(
      { createdBy: { $in: tenantUserIds } },
      { adminLastViewed: new Date() }
    );

    res.status(200).json({
      success: true,
      message: 'Admin last viewed timestamp updated successfully',
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error updating admin last viewed timestamp:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating admin last viewed timestamp',
      error: error.message
    });
  }
};

// Get count of new invoices since admin last viewed
const getNewInvoiceCount = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can view new invoice counts.'
      });
    }

    const tenantUserIds = await getTenantUserIds(authSubdomain);

    // Find the latest adminLastViewed timestamp within the authenticated tenant
    const latestViewed = await Invoice.findOne(
      { createdBy: { $in: tenantUserIds }, adminLastViewed: { $ne: null } },
      { adminLastViewed: 1 }
    ).sort({ adminLastViewed: -1 });

    let newInvoiceCount = 0;

    if (latestViewed) {
      // Count tenant worker-created invoices created after the last viewed time
      newInvoiceCount = await Invoice.countDocuments({
        createdBy: { $in: tenantUserIds },
        createdAt: { $gt: latestViewed.adminLastViewed },
        source: 'worker'
      });
    } else {
      // If no tenant invoices have been viewed yet, count all tenant worker-created invoices
      newInvoiceCount = await Invoice.countDocuments({
        createdBy: { $in: tenantUserIds },
        source: 'worker'
      });
    }

    res.status(200).json({
      success: true,
      message: 'New invoice count retrieved successfully',
      data: { count: newInvoiceCount }
    });
  } catch (error) {
    console.error('Error retrieving new invoice count:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving new invoice count',
      error: error.message
    });
  }
};

// Add new controller functions for delete history
// Get delete history for admin (all deleted invoices within tenant)
const getDeleteHistoryForAdmin = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    // Only admins can access this
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can view delete history.'
      });
    }

    const tenantUserIds = await getTenantUserIds(authSubdomain);
    const deleteHistory = await DeleteHistory.find({ deletedById: { $in: tenantUserIds } })
      .sort({ deletedAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Delete history retrieved successfully',
      data: deleteHistory
    });
  } catch (error) {
    console.error('Error retrieving delete history:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving delete history',
      error: error.message
    });
  }
};

// Get delete history for worker (only their deleted invoices)
const getDeleteHistoryForWorker = async (req, res) => {
  try {
    // Workers can only see their own delete history
    const deleteHistory = await DeleteHistory.find({ deletedById: req.user._id })
      .sort({ deletedAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Delete history retrieved successfully',
      data: deleteHistory
    });
  } catch (error) {
    console.error('Error retrieving delete history:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving delete history',
      error: error.message
    });
  }
};

// Get a specific deleted invoice by ID
const getDeletedInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delete history ID'
      });
    }

    const deleteHistoryRecord = await DeleteHistory.findById(id);

    if (!deleteHistoryRecord) {
      return res.status(404).json({
        success: false,
        message: 'Deleted invoice not found'
      });
    }

    // Check if user has permission to access this delete history record
    // Workers can access their own delete history, admins can access any delete history in their tenant
    const isRecordOwner = Boolean(
      deleteHistoryRecord.deletedById &&
      req.user?._id &&
      deleteHistoryRecord.deletedById.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isRecordOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own delete history.'
      });
    }

    const recordTenant = await assertDeleteHistoryTenantAccess(res, deleteHistoryRecord, authSubdomain);
    if (!recordTenant) return;

    res.status(200).json({
      success: true,
      message: 'Deleted invoice retrieved successfully',
      data: deleteHistoryRecord
    });
  } catch (error) {
    console.error('Error retrieving deleted invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving deleted invoice',
      error: error.message
    });
  }
};

// Get the next available invoice number (auto-increment from highest TV* number)
const getNextInvoiceNo = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const existingInvoices = await Invoice.find({}, 'invoiceNo').lean();

    let maxNum = 0;

    const extractNumber = (invNo) => {
      if (!invNo || typeof invNo !== 'string') return 0;
      const tvMatch = invNo.trim().match(/^TV(\d+)$/i);
      if (tvMatch) {
        const num = parseInt(tvMatch[1], 10) || 0;
        if (num < 50000) return num;
      }
      return 0;
    };

    for (const inv of existingInvoices) {
      const num = extractNumber(inv.invoiceNo);
      if (num > maxNum) maxNum = num;
    }

    let nextNumber = maxNum + 1;
    let padded = String(nextNumber).padStart(6, '0');
    let nextInvoiceNo = `TV${padded}`;

    const existingSet = new Set(existingInvoices.map(i => (i.invoiceNo ? i.invoiceNo.trim().toUpperCase() : '')));
    while (existingSet.has(nextInvoiceNo.toUpperCase())) {
      nextNumber++;
      padded = String(nextNumber).padStart(6, '0');
      nextInvoiceNo = `TV${padded}`;
    }

    res.status(200).json({
      success: true,
      data: { nextInvoiceNo }
    });
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating next invoice number',
      error: error.message
    });
  }
};

// Send Invoice PDF & Summary via WhatsApp API
const sendInvoiceWhatsApp = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const { id } = req.params;
    const { pdfBase64, recipientPhone } = req.body;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const isInvoiceOwner = Boolean(
      invoice.createdBy &&
      req.user?._id &&
      invoice.createdBy.toString() === req.user._id.toString()
    );
    const isAdmin = req.user?.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only send your own invoices.'
      });
    }

    const invoiceTenant = await assertInvoiceTenantAccess(res, invoice, authSubdomain);
    if (!invoiceTenant) return;

    // Determine target phone number
    let phone = recipientPhone || invoice.customerContact || '';
    // Extract phone numbers from contact text (digits only)
    const phoneMatches = phone.match(/\d{10,12}/g);
    if (phoneMatches && phoneMatches.length > 0) {
      phone = phoneMatches[0];
    } else {
      phone = phone.replace(/\D/g, '');
    }

    if (!phone || phone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Valid customer WhatsApp phone number is required'
      });
    }

    // Ensure phone has country code if 10 digits
    if (phone.length === 10) {
      phone = '91' + phone;
    }

    let pdfUrl = '';
    let filePath = '';

    if (pdfBase64) {
      const fs = require('fs');
      const path = require('path');

      const uploadsDir = path.join(__dirname, '../uploads/invoices');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `invoice-${invoice.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      filePath = path.join(uploadsDir, filename);

      // Clean base64 string properly (strips any data URI header prefix)
      const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      const baseUrl = process.env.BACKEND_URL || process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
      pdfUrl = `${baseUrl}/uploads/invoices/${filename}`;
    }

    // Calculate Grand Total
    const subtotal = (invoice.items || []).reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);
    const gstTotal = (invoice.items || []).reduce((sum, item) =>
      sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0);
    const grandTotal = subtotal + gstTotal;

    const whatsappService = require('../services/whatsappService');
    const templateName = 'tech_invoice_send';

    let whatsappResult = {};

    const correlationId = req.headers?.['x-correlation-id'] || req.body?.correlationId || ('wa_' + Date.now());
    const tBackendStart = Date.now();

    if (templateName) {
      // Send via Meta Approved WhatsApp Template (Required for 24h business-initiated messaging window)
      console.log(`[Invoice WhatsApp] [${correlationId}] Sending template '${templateName}' to customer phone...`);
      const templateRes = await whatsappService.sendWhatsApp(authSubdomain, phone, {
        type: 'template',
        templateName: templateName,
        languageCode: 'en',
        filePath: filePath,
        filename: `Invoice_${invoice.invoiceNo}.pdf`,
        correlationId,
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  link: pdfUrl,
                  filename: `Invoice_${invoice.invoiceNo}.pdf`
                }
              }
            ]
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: invoice.customerName || 'Valued Customer' },
              { type: 'text', text: invoice.invoiceNo },
              { type: 'text', text: invoice.invoiceDate },
              { type: 'text', text: grandTotal.toFixed(2) }
            ]
          }
        ]
      });
      whatsappResult = { templateRes, textRes: templateRes };
    }

    const backendDuration = Date.now() - tBackendStart;
    console.log(`[Invoice WhatsApp] [${correlationId}] Total backend WhatsApp processing: ${backendDuration}ms`);

    const isWhatsAppSent = whatsappResult?.templateRes?.success || whatsappResult?.textRes?.success;

    res.status(200).json({
      success: true,
      whatsappSuccess: !!isWhatsAppSent,
      message: isWhatsAppSent
        ? 'Invoice saved and sent via WhatsApp successfully'
        : (whatsappResult?.templateRes?.error || 'Invoice saved successfully'),
      pdfUrl,
      whatsappResult,
      backendDurationMs: backendDuration
    });
  } catch (error) {
    console.error('Error sending invoice via WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending invoice via WhatsApp',
      error: error.message
    });
  }
};

// Renumber invoices sequentially based on sorting
const renumberInvoices = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can renumber invoices.'
      });
    }

    const tenantUserIds = await getTenantUserIds(authSubdomain);
    const tenantUserIdStrings = new Set(tenantUserIds.map((uid) => uid.toString()));

    const { prefix = 'TV', startNumber = 1, padding = 6, sortBy = 'invoiceDate', sortOrder = 'asc', invoiceIds } = req.body;

    let invoices;
    if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
      invoices = await Invoice.find({ _id: { $in: invoiceIds } });
      const hasForeignInvoice = (invoices || []).some((inv) => {
        if (!inv.createdBy || !tenantUserIdStrings.has(inv.createdBy.toString())) {
          return normalizeSubdomain(inv.subdomain) !== normalizeSubdomain(authSubdomain);
        }
        return false;
      });
      if (hasForeignInvoice) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. One or more invoices belong to another organization.'
        });
      }
    } else {
      invoices = await Invoice.find({ createdBy: { $in: tenantUserIds } });
    }

    if (!invoices || invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No invoices found to renumber'
      });
    }

    // Sort invoices
    invoices.sort((a, b) => {
      let dateA, dateB;
      if (sortBy === 'invoiceDate') {
        dateA = a.actualDate ? new Date(a.actualDate).getTime() : parseInvoiceDate(a.invoiceDate).getTime();
        dateB = b.actualDate ? new Date(b.actualDate).getTime() : parseInvoiceDate(b.invoiceDate).getTime();
      } else {
        dateA = new Date(a.createdAt).getTime();
        dateB = new Date(b.createdAt).getTime();
      }
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    const padLen = Math.max(1, Math.min(10, parseInt(padding, 10) || 6));
    const startNum = parseInt(startNumber, 10) || 1;
    const cleanPrefix = (prefix || 'TV').trim().toUpperCase();

    const updates = [];
    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      const paddedNum = String(startNum + i).padStart(padLen, '0');
      const newInvoiceNo = `${cleanPrefix}${paddedNum}`;
      updates.push({
        id: inv._id,
        oldInvoiceNo: inv.invoiceNo,
        newInvoiceNo
      });
    }

    // Step 1: assign temporary unique values to avoid unique index conflict
    for (const u of updates) {
      await Invoice.findByIdAndUpdate(u.id, { invoiceNo: `TEMP_RENUM_${Date.now()}_${u.id}` });
    }

    // Step 2: assign final sequential invoice numbers
    for (const u of updates) {
      await Invoice.findByIdAndUpdate(u.id, { invoiceNo: u.newInvoiceNo });
    }

    res.status(200).json({
      success: true,
      message: `Successfully renumbered ${updates.length} invoices sequentially.`,
      data: updates
    });
  } catch (error) {
    console.error('Error renumbering invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renumber invoices',
      error: error.message
    });
  }
};

// Preview Job Intake classification for an eligible, verified invoice
const previewJobIntakeForInvoice = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const isInvoiceOwner = Boolean(
      invoice.createdBy &&
      req.user?._id &&
      invoice.createdBy.toString() === req.user._id.toString()
    );
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only preview job intake for your own invoices.'
      });
    }

    const subdomain = await assertInvoiceTenantAccess(res, invoice, authSubdomain);
    if (!subdomain) return;

    const departments = await Department.find({ subdomain }).lean();
    const workers = await Worker.find({ subdomain, status: 'Active' }).lean();

    const orderId = (invoice.externalOrderId && String(invoice.externalOrderId).trim())
      ? String(invoice.externalOrderId).trim()
      : `INV-${invoice.invoiceNo || invoice._id}`;

    const existingIntake = await JobIntake.findOne({
      subdomain,
      $or: [{ orderId }, { invoiceId: invoice._id }]
    }).lean();

    const classification = classifyInvoiceJob({
      invoice,
      linkedOrder: existingIntake,
      departments,
      workers
    });

    const webDept = departments.find(d => {
      const name = (d.name || '').toLowerCase();
      return name.includes('website') || name.includes('web development');
    });

    // Resolve leaves and workloads to determine accurate employee eligibility
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const Leave = require('../models/Leave');
    const activeLeaves = await Leave.find({
      subdomain,
      worker: { $in: workers.map(w => w._id) },
      status: 'Approved',
      startDate: { $lte: todayEnd },
      endDate: { $gte: todayStart }
    }).select('worker').lean();
    const onLeaveWorkerIds = new Set(activeLeaves.map(l => String(l.worker)));

    const Ticket = require('../models/ticketModel');
    const activeTickets = await Ticket.find({
      subdomain,
      isDeleted: { $ne: true },
      status: { $in: ['To Do', 'In Progress', 'Review'] },
      $or: [
        { assignee: { $in: workers.map(w => w._id) } },
        { assignees: { $in: workers.map(w => w._id) } }
      ]
    }).select('assignee assignees').lean();

    const workloadMap = new Map();
    workers.forEach(w => workloadMap.set(String(w._id), 0));
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

    // Populate existing departments and their active members for this tenant
    const departmentsWithMembers = departments.map(d => {
      const dWorkers = workers.filter(w => {
        const wDept = w.department ? w.department.toString() : '';
        const isAssigned = Array.isArray(d.assignedDevelopers) && d.assignedDevelopers.some(id => id && id.toString() === w._id.toString());
        return wDept === d._id.toString() || isAssigned;
      }).map(w => {
        const idStr = String(w._id);
        const isOnLeave = onLeaveWorkerIds.has(idStr);
        const activeTasks = workloadMap.get(idStr) || 0;
        const isOverloaded = activeTasks >= 5;
        const isEligible = !isOnLeave && !isOverloaded;
        let ineligibilityReason = null;
        if (isOnLeave) ineligibilityReason = 'On Approved Leave';
        else if (isOverloaded) ineligibilityReason = `At Capacity (${activeTasks}/5 active tasks)`;

        return {
          _id: w._id,
          name: w.name,
          username: w.username,
          photo: w.photo || '',
          designation: w.designation || 'Developer',
          role: w.role || 'developer',
          isOnLeave,
          activeTasks,
          isOverloaded,
          isEligible,
          ineligibilityReason
        };
      });

      const eligibleMemberCount = dWorkers.filter(w => w.isEligible).length;

      return {
        _id: d._id,
        name: d.name,
        departmentType: d.departmentType || 'Project',
        description: d.description || '',
        activeMemberCount: dWorkers.length,
        eligibleMemberCount,
        members: dWorkers
      };
    });

    let suggestedDepartmentId = null;
    if (webDept) {
      suggestedDepartmentId = webDept._id;
    } else if (departmentsWithMembers.length > 0) {
      suggestedDepartmentId = departmentsWithMembers[0]._id;
    }

    res.status(200).json({
      success: true,
      data: {
        jobType: classification.jobType,
        reason: classification.reason,
        priorityMatched: classification.priorityMatched,
        hasExistingIntake: Boolean(existingIntake),
        storedJobType: existingIntake?.jobDetails?.serviceCategory || null,
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.customerName,
        customerContact: invoice.customerContact,
        totalAmount: (invoice.items || []).reduce((sum, it) => sum + (Number(it.total) || 0), 0),
        webDeptAvailable: Boolean(webDept),
        subdomain,
        departments: departmentsWithMembers,
        suggestedDepartmentId
      }
    });
  } catch (error) {
    console.error('Error previewing job intake classification:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error previewing job intake classification'
    });
  }
};

// Trigger Job Intake manually from Invoice History for an eligible verified invoice
const triggerJobIntakeForInvoice = async (req, res) => {
  try {
    const authSubdomain = resolveAuthTenant(req, res);
    if (!authSubdomain) return;

    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Permission check: workers can only trigger for their own invoices, admins for any invoice in their tenant
    const isInvoiceOwner = invoice.createdBy && req.user && req.user._id && invoice.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only trigger job intake for your own invoices.'
      });
    }

    // Fail-closed tenant isolation check
    const invoiceTenant = await assertInvoiceTenantAccess(res, invoice, authSubdomain);
    if (!invoiceTenant) return;

    // Eligibility check: Allow Job Intake only for invoices that have completed the existing authorized payment-verification process
    const hasPaymentProof = !!(
      invoice.paymentDetails && (
        (Array.isArray(invoice.paymentDetails.proofs) && invoice.paymentDetails.proofs.length > 0) ||
        (invoice.paymentDetails.proof && String(invoice.paymentDetails.proof).trim().length > 0)
      )
    );

    const isVerifiedStatus = (
      invoice.status === 'Payment Received' ||
      invoice.status === 'Work completion' ||
      invoice.status === 'Closure agreement' ||
      invoice.isPaid ||
      invoice.invoiceType === 'TAX INVOICE'
    );

    if (!hasPaymentProof || !isVerifiedStatus) {
      return res.status(400).json({
        success: false,
        message: 'Invoice has not completed authorized payment verification. Please upload and verify payment proof first.'
      });
    }

    // Process job intake idempotently via shared service
    const result = await processJobIntakeFromVerifiedInvoice({
      invoice,
      adminUser: req.user,
      selectedJobType: req.body?.selectedJobType,
      departmentId: req.body?.departmentId,
      departmentName: req.body?.departmentName,
      assignmentMode: req.body?.assignmentMode,
      teamSize: req.body?.teamSize,
      requiredMembersCount: req.body?.teamSize || req.body?.requiredMembersCount,
      selectedMemberId: req.body?.selectedMemberId,
      selectedMemberIds: req.body?.selectedMemberIds
    });

    let message = 'Job intake processed and ticket created successfully.';
    if (result.isRecovered) {
      message = result.recoveredAction === 'restored'
        ? 'Job ticket was successfully restored for this invoice.'
        : 'Job ticket was successfully recreated for this invoice.';
    } else if (result.isDuplicate) {
      message = 'Job intake already exists for this invoice.';
    }

    res.status(200).json({
      success: true,
      message,
      data: result
    });
  } catch (error) {
    console.error('Error triggering job intake for invoice:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error triggering job intake for invoice'
    });
  }
};

module.exports = {
  createInvoice,
  updateInvoice,
  getInvoicesByAdminOrWorker,
  getInvoicesByAdmin,
  getAllInvoices,
  getInvoiceById,
  deleteInvoice,
  updateAdminLastViewed,
  getNewInvoiceCount,
  // Add the new export functions
  getDeleteHistoryForAdmin,
  getDeleteHistoryForWorker,
  getDeletedInvoiceById,
  getNextInvoiceNo,
  sendInvoiceWhatsApp,
  renumberInvoices,
  triggerJobIntakeForInvoice,
  previewJobIntakeForInvoice
};