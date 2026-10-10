import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import { deleteInvoice, updateInvoice } from '../../services/invoiceService';
import { toast } from 'react-toastify';
import StageProofModal from '../admin/StageProofModal';

// Helper to normalize any date string to DD/MM/YYYY
const normalizeInvoiceDate = (dateStr) => {
  if (!dateStr) return '';
  dateStr = dateStr.trim();

  // Case 1: YYYY-MM-DD
  const ymdRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
  let match = dateStr.match(ymdRegex);
  if (match) {
    const [_, yyyy, mm, dd] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Case 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyRegex = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
  match = dateStr.match(dmyRegex);
  if (match) {
    const [_, dd, mm, yyyy] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Fallback: parse as standard date
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = parsedDate.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return dateStr;
};

const STAGES = ['Invoice', 'Payment Received', 'Work completion', 'Closure agreement'];

const WorkerInvoiceHistory = ({ invoices, onEditInvoice, onDeleteInvoice, onStatusUpdate }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Stage proof modal state
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [selectedInvoiceForStage, setSelectedInvoiceForStage] = useState(null);
  const [targetStage, setTargetStage] = useState(null);

  // Image Preview Modal - supports gallery with multiple proofs
  const [previewGallery, setPreviewGallery] = useState(null); // { images: [...], currentIndex: 0, title: '' }

  // Helper: get all proofs from a stage detail field (handles both old single proof and new proofs array)
  const getProofs = (details) => {
    if (!details) return [];
    if (details.proofs && details.proofs.length > 0) return details.proofs.filter(p => (p.url || p.proof || (typeof p === 'string' && p.trim() !== '')));
    if (details.proof && String(details.proof).trim().length > 0) return [{ date: details.date, url: details.proof }];
    return [];
  };

  const getEffectiveInvoiceType = (invoice) => {
    if (!invoice) return 'PROFORMA INVOICE';
    const paymentProofs = getProofs(invoice.paymentDetails);
    if (paymentProofs.length > 0 || invoice.invoiceType === 'TAX INVOICE' || invoice.isPaid) {
      return 'TAX INVOICE';
    }
    return invoice.invoiceType || 'PROFORMA INVOICE';
  };

  const openGallery = (images, title) => {
    if (images.length > 0) {
      setPreviewGallery({ images, currentIndex: 0, title });
    }
  };

  // Update local state when invoices prop changes
  useEffect(() => {
    setLocalInvoices(invoices);
  }, [invoices]);

  // Get unique customer names for filter dropdown
  const uniqueCustomers = useMemo(() => {
    const names = localInvoices
      .map(inv => inv.customerName)
      .filter(name => name && name.trim() !== '')
      .filter((name, index, self) => self.indexOf(name) === index)
      .sort();
    return names;
  }, [localInvoices]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Helper to parse invoice date to a comparable Date object
  const getInvoiceDateObj = (invoice) => {
    if (invoice.actualDate) return new Date(invoice.actualDate);
    if (invoice.invoiceDate) {
      const str = String(invoice.invoiceDate).trim();
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) {
        return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
      }
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymd) {
        return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (invoice.createdAt) return new Date(invoice.createdAt);
    return new Date();
  };

  // Calculate total amount for an invoice
  const calculateTotal = (invoice) => {
    const subtotal = invoice.items.reduce((sum, item) => 
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);
    
    const gstTotal = (invoice.gstEnabled) ? 
      invoice.items.reduce((sum, item) => 
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;
    
    return subtotal + gstTotal;
  };

  // Filtered invoices based on search, date, customer, price, and status
  const filteredInvoices = useMemo(() => {
    return localInvoices.filter(invoice => {
      // Search query filter (invoice number, customer name, customer contact)
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const matchesInvoiceNo = invoice.invoiceNo?.toLowerCase().includes(query);
        const matchesCustomer = invoice.customerName?.toLowerCase().includes(query);
        const matchesContact = invoice.customerContact?.toLowerCase().includes(query);
        if (!matchesInvoiceNo && !matchesCustomer && !matchesContact) return false;
      }

      // Customer filter
      if (customerFilter && invoice.customerName !== customerFilter) {
        return false;
      }

      // Status filter
      if (statusFilter && getEffectiveStatus(invoice) !== statusFilter) {
        return false;
      }

      // Date range filter
      if (startDateFilter || endDateFilter) {
        const invDate = getInvoiceDateObj(invoice);
        if (startDateFilter) {
          const start = new Date(startDateFilter);
          start.setHours(0, 0, 0, 0);
          if (invDate < start) return false;
        }
        if (endDateFilter) {
          const end = new Date(endDateFilter);
          end.setHours(23, 59, 59, 999);
          if (invDate > end) return false;
        }
      }

      // Price range filter
      const total = calculateTotal(invoice);
      if (minPrice !== '' && total < parseFloat(minPrice)) return false;
      if (maxPrice !== '' && total > parseFloat(maxPrice)) return false;

      return true;
    });
  }, [localInvoices, searchQuery, customerFilter, statusFilter, startDateFilter, endDateFilter, minPrice, maxPrice]);

  const clearFilters = () => {
    setSearchQuery('');
    setMinPrice('');
    setMaxPrice('');
    setCustomerFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setStatusFilter('');
  };

  const applyQuickDate = (preset) => {
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDateFilter(d);
      setEndDateFilter(d);
    } else if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      setStartDateFilter(start.toISOString().split('T')[0]);
      setEndDateFilter(end.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDateFilter(start.toISOString().split('T')[0]);
      setEndDateFilter(end.toISOString().split('T')[0]);
    } else {
      setStartDateFilter('');
      setEndDateFilter('');
    }
  };

  const hasActiveFilters = searchQuery || minPrice || maxPrice || customerFilter || startDateFilter || endDateFilter || statusFilter;

  // Handle delete invoice - show confirmation modal
  const handleDeleteClick = (invoiceId) => {
    setInvoiceToDelete(invoiceId);
    setShowDeleteModal(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!invoiceToDelete) return;
    
    try {
      const response = await deleteInvoice(invoiceToDelete);
      if (response.success) {
        // Update local state to immediately remove the deleted invoice
        setLocalInvoices(prevInvoices => 
          prevInvoices.filter(invoice => invoice._id !== invoiceToDelete)
        );
        
        // Call the onDeleteInvoice callback if provided
        if (onDeleteInvoice) {
          onDeleteInvoice(invoiceToDelete);
        }
        toast.success('Invoice deleted successfully!');
      } else {
        toast.error('Failed to delete invoice: ' + response.message);
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      // More descriptive error messages
      if (error.response && error.response.status === 404) {
        toast.error('Invoice not found. It may have already been deleted.');
      } else if (error.response && error.response.status === 403) {
        toast.error('Access denied. You do not have permission to delete this invoice.');
      } else {
        toast.error('Error deleting invoice: ' + (error.message || 'Unknown error'));
      }
    } finally {
      // Close modal and reset state
      setShowDeleteModal(false);
      setInvoiceToDelete(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteModal(false);
    setInvoiceToDelete(null);
  };

  // Handle status update with stage proof
  const handleStatusUpdate = async (invoiceId, newStatus) => {
    const proofStages = ['Payment Received', 'Work completion', 'Closure agreement'];
    
    if (proofStages.includes(newStatus)) {
      const invoice = localInvoices.find(inv => inv._id === invoiceId);
      setSelectedInvoiceForStage(invoice);
      setTargetStage(newStatus);
      setIsStageModalOpen(true);
      return;
    }

    await performStatusUpdate(invoiceId, { status: newStatus });
  };

  const performStatusUpdate = async (invoiceId, updateData) => {
    try {
      const response = await updateInvoice(invoiceId, updateData);
      if (response.success) {
        setLocalInvoices(prev => prev.map(inv => 
          inv._id === invoiceId ? { ...inv, ...updateData } : inv
        ));
        
        if (onStatusUpdate) {
          onStatusUpdate(invoiceId, updateData);
        }
        
        toast.success('Status updated successfully');
        return true;
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      return false;
    }
  };

  const handleStageConfirm = async (stageData) => {
    if (!selectedInvoiceForStage || !targetStage) return;
    
    const stageFieldMap = {
      'Payment Received': 'paymentDetails',
      'Work completion': 'workDetails',
      'Closure agreement': 'closureDetails'
    };

    let newStatus = targetStage;
    let newStageData = stageData;

    // Revert status if all proofs were deleted
    if (!stageData || (!stageData.proof && (!stageData.proofs || stageData.proofs.length === 0))) {
      newStageData = null;
      if (targetStage === 'Payment Received') {
        newStatus = 'Invoice';
      } else if (targetStage === 'Work completion') {
        newStatus = 'Payment Received';
      } else if (targetStage === 'Closure agreement') {
        newStatus = 'Work completion';
      }
    }

    const paymentInfo = targetStage === 'Payment Received' ? newStageData : selectedInvoiceForStage.paymentDetails;
    const hasPaymentProof = !!(paymentInfo && ((Array.isArray(paymentInfo.proofs) && paymentInfo.proofs.length > 0) || paymentInfo.proof));

    // New proof replaces old one entirely
    const updateData = {
      status: newStatus,
      [stageFieldMap[targetStage]]: newStageData,
      invoiceType: hasPaymentProof ? 'TAX INVOICE' : (selectedInvoiceForStage.invoiceType || 'PROFORMA INVOICE')
    };

    const success = await performStatusUpdate(selectedInvoiceForStage._id, updateData);

    if (success) {
      setIsStageModalOpen(false);
      setSelectedInvoiceForStage(null);
      setTargetStage(null);
    }
  };

  const getEffectiveStatus = (invoice) => {
    if (!invoice) return 'Invoice';
    const status = invoice.status || 'Invoice';
    const explicitIdx = STAGES.indexOf(status);

    const hasClosure = !!(invoice.closureDetails && (getProofs(invoice.closureDetails).length > 0 || invoice.closureDetails.proof));
    if (hasClosure || explicitIdx >= 3) return 'Closure agreement';

    const hasWork = !!(invoice.workDetails && (getProofs(invoice.workDetails).length > 0 || invoice.workDetails.proof));
    if (hasWork || explicitIdx >= 2) return 'Work completion';

    // Payment proof or legacy paid/TAX INVOICE status for old records
    const paymentProofs = getProofs(invoice.paymentDetails);
    const hasPayment = paymentProofs.length > 0;
    const isLegacyPaid = invoice.invoiceType === 'TAX INVOICE' || invoice.status === 'Payment Received' || invoice.isPaid || explicitIdx >= 1;
    if (hasPayment || isLegacyPaid) return 'Payment Received';

    return 'Invoice';
  };

  const getStatusIndex = (statusOrInvoice) => {
    if (typeof statusOrInvoice === 'object' && statusOrInvoice !== null) {
      const effectiveStatus = getEffectiveStatus(statusOrInvoice);
      return STAGES.indexOf(effectiveStatus);
    }
    const index = STAGES.indexOf(statusOrInvoice);
    return index === -1 ? 0 : index;
  };

  return (
    <div className="w-full bg-white font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Invoice History</h1>
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-4 space-y-3">
        {/* Search row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice number, customer name, or contact..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-gray-50/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
              showFilters || hasActiveFilters
                ? 'bg-teal-50 text-[#0d9488] border-teal-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-[#0d9488] rounded-full"></span>
            )}
          </button>
        </div>

        {/* Expandable filter drawer */}
        {showFilters && (
          <div className="p-4 bg-gray-50/90 rounded-2xl border border-gray-200/80 shadow-inner space-y-3.5 animate-in slide-in-from-top-2 duration-200">
            {/* Quick date presets */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200/60">
              <span className="text-xs font-bold text-gray-500 mr-1">Quick Date:</span>
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyQuickDate(preset.id)}
                  className="px-3 py-1 bg-white hover:bg-teal-50 hover:text-teal-700 text-xs font-semibold text-gray-600 rounded-lg border border-gray-200 transition-colors shadow-xs"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Date range */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Date Range</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                </div>
              </div>

              {/* Customer filter */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Customer</label>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="">All Customers ({uniqueCustomers.length})</option>
                  {uniqueCustomers.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Price range */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Price Range (₹)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min ₹"
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max ₹"
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                </div>
              </div>

              {/* Status / Stage Filter */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Stage / Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="">All Stages</option>
                  {STAGES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear filters row */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                <div className="flex flex-wrap gap-1.5 items-center text-xs">
                  <span className="text-gray-400 font-medium mr-1">Active:</span>
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-teal-200">
                      Query: "{searchQuery}"
                      <button onClick={() => setSearchQuery('')} className="hover:text-teal-900 ml-0.5">×</button>
                    </span>
                  )}
                  {customerFilter && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-blue-200">
                      Customer: {customerFilter}
                      <button onClick={() => setCustomerFilter('')} className="hover:text-blue-900 ml-0.5">×</button>
                    </span>
                  )}
                  {(startDateFilter || endDateFilter) && (
                    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-purple-200">
                      Date: {startDateFilter || '...'} to {endDateFilter || '...'}
                      <button onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }} className="hover:text-purple-900 ml-0.5">×</button>
                    </span>
                  )}
                  {(minPrice || maxPrice) && (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-amber-200">
                      Price: ₹{minPrice || '0'} - ₹{maxPrice || '∞'}
                      <button onClick={() => { setMinPrice(''); setMaxPrice(''); }} className="hover:text-amber-900 ml-0.5">×</button>
                    </span>
                  )}
                  {statusFilter && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-emerald-200">
                      Stage: {statusFilter}
                      <button onClick={() => setStatusFilter('')} className="hover:text-emerald-900 ml-0.5">×</button>
                    </span>
                  )}
                </div>
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold text-red-600 hover:text-red-800 hover:underline transition-colors flex items-center gap-1 flex-shrink-0 ml-auto"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results count */}
        {hasActiveFilters && (
          <div className="text-xs text-gray-500 font-medium">
            Showing {filteredInvoices.length} of {localInvoices.length} invoices
          </div>
        )}
      </div>
      
      {filteredInvoices.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-gray-200">
          <div className="flex flex-col items-center">
            <div className="bg-gray-100 p-4 rounded-full mb-4">
              <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {hasActiveFilters ? 'No invoices match your filters' : 'No invoices found'}
            </h3>
            <p className="text-gray-500">
              {hasActiveFilters ? 'Try adjusting your search or filter criteria.' : 'Create your first invoice to see it here.'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-sm text-[#0d9488] font-semibold hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="w-full rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Invoice No</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Date</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Customer</th>
                <th className="py-3.5 px-4 text-center text-xs font-bold text-gray-500 tracking-wider">Type</th>
                <th className="py-3.5 px-4 text-right text-xs font-bold text-gray-500 tracking-wider">Amount</th>
                <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Stage Progress</th>
                <th className="py-3.5 px-4 text-center text-xs font-bold text-gray-500 tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice._id} className="hover:bg-teal-50/20 transition-colors">
                  <td className="py-3.5 px-4 text-sm font-semibold text-gray-900 truncate">{invoice.invoiceNo}</td>
                  <td className="py-3.5 px-4 text-sm text-gray-500">{normalizeInvoiceDate(invoice.invoiceDate) || formatDate(invoice.createdAt)}</td>
                  <td className="py-3.5 px-4 text-sm">
                    <div className="font-medium text-gray-800 truncate">{invoice.customerName || 'N/A'}</div>
                    {invoice.customerContact && <div className="text-xs text-gray-400 truncate">{invoice.customerContact}</div>}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      getEffectiveInvoiceType(invoice) === 'TAX INVOICE'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-sky-50 text-sky-700 border border-sky-200'
                    }`}>
                      {getEffectiveInvoiceType(invoice)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-sm font-bold text-gray-900 text-right whitespace-nowrap">
                    ₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-1.5">
                      {/* Stage dots row */}
                      <div className="flex items-center gap-0">
                        {STAGES.map((stage, index) => {
                          const effectiveStatus = getEffectiveStatus(invoice);
                          const currentIdx = getStatusIndex(effectiveStatus);
                          const isCompleted = index < currentIdx;
                          const isCurrent = index === currentIdx;
                          
                          return (
                            <div key={stage} className="flex items-center">
                              <button
                                onClick={() => handleStatusUpdate(invoice._id, stage)}
                                title={stage}
                                className={`rounded-full transition-all duration-200 flex-shrink-0 ${ isCurrent ? 'w-4 h-4 bg-[#0d9488] ring-[3px] ring-teal-100 shadow-sm' : isCompleted ? 'w-3 h-3 bg-teal-500' : 'w-3 h-3 bg-gray-200 hover:bg-gray-300' }`}
                              />
                              {index < STAGES.length - 1 && (
                                <div className={`w-5 h-[2px] flex-shrink-0 ${ index < currentIdx ? 'bg-teal-500' : 'bg-gray-200' }`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Stage label + proof icons row */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#0d9488] tracking-wider leading-none">
                          {getEffectiveStatus(invoice)}
                        </span>
                        {/* Stage Proof Preview Icons */}
                        <div className="flex items-center gap-1">
                          {(() => {
                            const paymentProofs = getProofs(invoice.paymentDetails);
                            const workProofs = getProofs(invoice.workDetails);
                            const closureProofs = getProofs(invoice.closureDetails);
                            return (
                              <>                                 {paymentProofs.length > 0 && (
                                  <button
                                    onClick={() => openGallery(paymentProofs, 'Payment Proof')}
                                    className="relative inline-flex items-center justify-center w-5 h-5 bg-teal-50 hover:bg-teal-100 rounded transition-colors"
                                    title={`Payment Proof${paymentProofs.length > 1 ? `s (${paymentProofs.length})` : ''}`}
                                  >
                                    <svg className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {paymentProofs.length > 1 && (
                                      <span className="absolute -top-1 -right-1 bg-[#0d9488] text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{paymentProofs.length}</span>
                                    )}
                                  </button>
                                )}
                                {workProofs.length > 0 && (
                                  <button
                                    onClick={() => openGallery(workProofs, 'Work Completion Proof')}
                                    className="relative inline-flex items-center justify-center w-5 h-5 bg-green-50 hover:bg-green-100 rounded transition-colors"
                                    title={`Work Proof${workProofs.length > 1 ? `s (${workProofs.length})` : ''}`}
                                  >
                                    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {workProofs.length > 1 && (
                                      <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{workProofs.length}</span>
                                    )}
                                  </button>
                                )}
                                {closureProofs.length > 0 && (
                                  <button
                                    onClick={() => openGallery(closureProofs, 'Closure Proof')}
                                    className="relative inline-flex items-center justify-center w-5 h-5 bg-purple-50 hover:bg-purple-100 rounded transition-colors"
                                    title={`Closure Proof${closureProofs.length > 1 ? `s (${closureProofs.length})` : ''}`}
                                  >
                                    <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {closureProofs.length > 1 && (
                                      <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{closureProofs.length}</span>
                                    )}
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex justify-center items-center gap-3">
                      <button
                        onClick={() => onEditInvoice(invoice)}
                        className="text-[#0d9488] hover:text-[#0f766e] text-sm font-semibold transition-colors"
                      >
                        Edit
                      </button>
                      <span className="text-gray-200">|</span>
                      <button
                        onClick={() => handleDeleteClick(invoice._id)}
                        className="text-red-500 hover:text-red-700 text-sm font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage Proof Modal */}
      <StageProofModal
        isOpen={isStageModalOpen}
        onClose={() => setIsStageModalOpen(false)}
        onConfirm={handleStageConfirm}
        invoiceNo={selectedInvoiceForStage?.invoiceNo}
        stage={targetStage}
        existingDetails={selectedInvoiceForStage ? selectedInvoiceForStage[
          targetStage === 'Payment Received' ? 'paymentDetails' :
          targetStage === 'Work completion' ? 'workDetails' : 'closureDetails'
        ] : null}
      />

      {/* Image Gallery Preview Modal - supports multiple proofs */}
      {previewGallery && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200" onClick={() => setPreviewGallery(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-gray-900">{previewGallery.title}</h3>
              <div className="flex items-center gap-3">
                {previewGallery.images.length > 1 && (
                  <span className="text-xs font-bold text-gray-500">
                    {previewGallery.currentIndex + 1} of {previewGallery.images.length}
                  </span>
                )}
                <button onClick={() => setPreviewGallery(null)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative p-2 flex items-center justify-center">
              {previewGallery.images.length > 1 && (
                <button
                  onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1 }))}
                  className="absolute left-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <img 
                src={previewGallery.images[previewGallery.currentIndex]?.url || previewGallery.images[previewGallery.currentIndex]?.proof} 
                alt="Proof" 
                className="w-full h-auto max-h-[80vh] object-contain" 
              />
              {previewGallery.images.length > 1 && (
                <button
                  onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0 }))}
                  className="absolute right-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
            {previewGallery.images[previewGallery.currentIndex]?.date && (
              <div className="text-center pb-3 text-xs text-gray-500 font-medium">
                {new Date(previewGallery.images[previewGallery.currentIndex].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mb-6">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Deletion</h3>
            <p className="text-gray-500 mb-8">
              Are you sure you want to delete this invoice? This action is permanent and cannot be reversed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerInvoiceHistory;