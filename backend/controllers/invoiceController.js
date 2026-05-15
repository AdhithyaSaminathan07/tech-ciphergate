const Invoice = require('../models/Invoice');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const DeleteHistory = require('../models/DeleteHistory'); // Add this line
const mongoose = require('mongoose');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, format } = require('date-fns');

// Helper to parse DD-MM-YYYY to Date object
const parseInvoiceDate = (dateStr) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    // Expects DD-MM-YYYY
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateStr);
};

// Create a new invoice
const createInvoice = async (req, res) => {
  try {
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
      gstEnabled: gstEnabled || false,
      saleType: saleType || 'Intrastate',
      customerGst: customerGst || '',
      invoiceType: invoiceType || 'INVOICE',
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
    const { id } = req.params;
    const updateData = req.body;


    // Remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.__v;
    delete updateData.createdBy;
    delete updateData.createdByModel;

    // Add updatedAt timestamp
    updateData.updatedAt = new Date();

    if (updateData.invoiceDate) {
      updateData.actualDate = parseInvoiceDate(updateData.invoiceDate);
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

    // Check if user has permission to update this invoice
    // Workers can update their own invoices, admins can update any invoice
    const isInvoiceOwner = invoice.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own invoices.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: invoice
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
    // Workers can only see their own invoices, admins can see all
    const query = req.user.role === 'worker'
      ? { createdBy: req.user._id }
      : {};

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
    const { filterType, startDate, endDate, gstFilter } = req.query;
    let query = {};

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
      .populate([
        {
          path: 'createdBy',
          select: 'name email',
          model: 'Admin'
        },
        {
          path: 'createdBy',
          select: 'name department',
          model: 'Worker',
          populate: {
            path: 'department',
            select: 'name',
            model: 'Department'
          }
        }
      ])
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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID'
      });
    }

    const invoice = await Invoice.findById(id)
      .populate([
        {
          path: 'createdBy',
          select: 'name email',
          model: 'Admin'
        },
        {
          path: 'createdBy',
          select: 'name department',
          model: 'Worker',
          populate: {
            path: 'department',
            select: 'name',
            model: 'Department'
          }
        }
      ]);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user has permission to access this invoice
    // Workers can access their own invoices, admins can access any invoice
    const isInvoiceOwner = invoice.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own invoices.'
      });
    }

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
    // Workers can delete their own invoices, admins can delete any invoice
    const isInvoiceOwner = invoice.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInvoiceOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own invoices.'
      });
    }

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
    // Update all invoices to set adminLastViewed to current time
    const result = await Invoice.updateMany(
      {}, // Update all invoices
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
    // Find the latest adminLastViewed timestamp
    const latestViewed = await Invoice.findOne(
      { adminLastViewed: { $ne: null } },
      { adminLastViewed: 1 }
    ).sort({ adminLastViewed: -1 });

    let newInvoiceCount = 0;

    if (latestViewed) {
      // Count invoices created after the last viewed time
      newInvoiceCount = await Invoice.countDocuments({
        createdAt: { $gt: latestViewed.adminLastViewed },
        source: 'worker' // Only count worker-created invoices
      });
    } else {
      // If no invoices have been viewed yet, count all worker-created invoices
      newInvoiceCount = await Invoice.countDocuments({
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
// Get delete history for admin (all deleted invoices)
const getDeleteHistoryForAdmin = async (req, res) => {
  try {
    // Only admins can access this
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admins can view delete history.'
      });
    }

    const deleteHistory = await DeleteHistory.find()
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
    // Workers can access their own delete history, admins can access any delete history
    const isRecordOwner = deleteHistoryRecord.deletedById.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isRecordOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own delete history.'
      });
    }

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
  getDeletedInvoiceById
};