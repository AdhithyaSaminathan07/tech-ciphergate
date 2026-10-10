import React, { useState, useEffect, useMemo } from 'react';
import Card from '../common/Card';
import { deleteInvoice, updateInvoice } from '../../services/invoiceService';
import { toast } from 'react-toastify';
import StageProofModal from './StageProofModal';

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

// Helper to determine if an invoice has been edited
const isInvoiceEdited = (invoice) => {
  if (!invoice) return false;
  if (invoice.isEdited) return true;
  if (!invoice.createdAt || !invoice.updatedAt) return false;
  const created = new Date(invoice.createdAt).getTime();
  const updated = new Date(invoice.updatedAt).getTime();
  return updated - created > 2000;
};

const UnifiedInvoiceHistory = ({ invoices = [], onEditInvoice, onViewInvoice, onDeleteInvoice, onStatusUpdate, loading, error }) => {
  const [localInvoices, setLocalInvoices] = useState(invoices);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Stage proof modal state
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [selectedInvoiceForStage, setSelectedInvoiceForStage] = useState(null);
  const [targetStage, setTargetStage] = useState(null);

  // Image Preview Modal
  const [previewGallery, setPreviewGallery] = useState(null);

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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const calculateTotal = (invoice) => {
    const subtotal = invoice.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);

    const gstTotal = (invoice.gstEnabled) ?
      invoice.items.reduce((sum, item) =>
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;

    return subtotal + gstTotal;
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return localInvoices.filter(invoice => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesInvoiceNo = invoice.invoiceNo?.toLowerCase().includes(query);
        const matchesCustomer = invoice.customerName?.toLowerCase().includes(query);
        if (!matchesInvoiceNo && !matchesCustomer) return false;
      }

      if (customerFilter && invoice.customerName !== customerFilter) {
        return false;
      }

      const total = calculateTotal(invoice);
      if (minPrice !== '' && total < parseFloat(minPrice)) return false;
      if (maxPrice !== '' && total > parseFloat(maxPrice)) return false;

      return true;
    });
  }, [localInvoices, searchQuery, customerFilter, minPrice, maxPrice]);

  const handleDeleteClick = (invoiceId) => {
    setInvoiceToDelete(invoiceId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      const response = await deleteInvoice(invoiceToDelete);
      if (response.success) {
        setLocalInvoices(prevInvoices =>
          prevInvoices.filter(invoice => invoice._id !== invoiceToDelete)
        );

        if (onDeleteInvoice) {
          onDeleteInvoice(invoiceToDelete);
        }
      } else {
        alert('Failed to delete invoice: ' + response.message);
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Error deleting invoice: ' + (error.message || 'Unknown error'));
    } finally {
      setShowDeleteModal(false);
      setInvoiceToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setInvoiceToDelete(null);
  };

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
        
        toast.success(`Status updated successfully`);
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

  const clearFilters = () => {
    setSearchQuery('');
    setMinPrice('');
    setMaxPrice('');
    setCustomerFilter('');
  };

  const hasActiveFilters = searchQuery || minPrice || maxPrice || customerFilter;

  // Stage progress component
  const StageProgress = ({ invoice }) => {
    const effectiveStatus = getEffectiveStatus(invoice);
    const currentIdx = getStatusIndex(effectiveStatus);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-0">
          {STAGES.map((stage, index) => {
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#0d9488] tracking-wider leading-none">
            {effectiveStatus}
          </span>
          <ProofIcons invoice={invoice} />
        </div>
      </div>
    );
  };

  // Proof icons component
  const ProofIcons = ({ invoice }) => {
    const paymentProofs = getProofs(invoice.paymentDetails);
    const workProofs = getProofs(invoice.workDetails);
    const closureProofs = getProofs(invoice.closureDetails);

    return (
      <div className="flex items-center gap-1">
        {paymentProofs.length > 0 && (
          <button onClick={() => openGallery(paymentProofs, 'Payment Proof')} className="relative inline-flex items-center justify-center w-5 h-5 bg-teal-50 hover:bg-teal-100 rounded transition-colors" title={`Payment Proof${paymentProofs.length > 1 ? `s (${paymentProofs.length})` : ''}`}>
            <svg className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {paymentProofs.length > 1 && <span className="absolute -top-1 -right-1 bg-[#0d9488] text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{paymentProofs.length}</span>}
          </button>
        )}
        {workProofs.length > 0 && (
          <button onClick={() => openGallery(workProofs, 'Work Completion Proof')} className="relative inline-flex items-center justify-center w-5 h-5 bg-green-50 hover:bg-green-100 rounded transition-colors" title={`Work Proof${workProofs.length > 1 ? `s (${workProofs.length})` : ''}`}>
            <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {workProofs.length > 1 && <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{workProofs.length}</span>}
          </button>
        )}
        {closureProofs.length > 0 && (
          <button onClick={() => openGallery(closureProofs, 'Closure Proof')} className="relative inline-flex items-center justify-center w-5 h-5 bg-purple-50 hover:bg-purple-100 rounded transition-colors" title={`Closure Proof${closureProofs.length > 1 ? `s (${closureProofs.length})` : ''}`}>
            <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {closureProofs.length > 1 && <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{closureProofs.length}</span>}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full bg-white font-sans">
      {/* Search & Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice number or customer name..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-gray-50/50"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
              showFilters || hasActiveFilters ? 'bg-teal-50 text-[#0d9488] border-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            Filters
            {hasActiveFilters && <span className="w-2 h-2 bg-[#0d9488] rounded-full"></span>}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-3 p-4 bg-gray-50/80 rounded-xl border border-gray-100 animate-in slide-in-from-top-2 duration-200">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Customer</label>
              <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white">
                <option value="">All Customers</option>
                {uniqueCustomers.map(name => (<option key={name} value={name}>{name}</option>))}
              </select>
            </div>
            <div className="flex gap-2 items-end min-w-0">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Min Price (₹)</label>
                <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white" />
              </div>
              <span className="text-gray-400 text-xs pb-2.5">to</span>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Max Price (₹)</label>
                <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="∞" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white" />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="px-4 py-2 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap">Clear All</button>
              </div>
            )}
          </div>
        )}

        {hasActiveFilters && (
          <div className="text-xs text-gray-500 font-medium">
            Showing {filteredInvoices.length} of {localInvoices.length} invoices
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0d9488] mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading invoices...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">Error: {error}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && filteredInvoices.length === 0 ? (
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
              {hasActiveFilters ? 'Try adjusting your search or filter criteria.' : 'Try adjusting your filters to see more results.'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-sm text-[#0d9488] font-semibold hover:underline">Clear all filters</button>
            )}
          </div>
        </Card>
      ) : (
        !loading && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block w-full rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '18%' }} />
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
                      <td className="py-3.5 px-4 text-sm font-semibold text-gray-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{invoice.invoiceNo}</span>
                          {isInvoiceEdited(invoice) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm" title={`Edited on ${invoice.updatedAt ? new Date(invoice.updatedAt).toLocaleString('en-IN') : 'Unknown'}`}>
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edited
                            </span>
                          )}
                        </div>
                      </td>
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
                        <div className="flex items-center justify-end gap-2">
                          {invoice.isPaid && (
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Paid"></div>
                          )}
                          <span>₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StageProgress invoice={invoice} />
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {onViewInvoice && (
                            <>
                              <button
                                onClick={() => onViewInvoice(invoice)}
                                className="text-blue-500 hover:text-blue-700 text-sm font-semibold transition-colors"
                                title="View invoice without editing"
                              >
                                View
                              </button>
                              <span className="text-gray-200">|</span>
                            </>
                          )}
                          <button
                            onClick={() => onEditInvoice(invoice)}
                            className="text-amber-600 hover:text-amber-700 text-sm font-semibold transition-colors"
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

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredInvoices.map((invoice) => (
                <div key={invoice._id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 border-b border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{invoice.invoiceNo}</span>
                      {isInvoiceEdited(invoice) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Edited
                        </span>
                      )}
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        getEffectiveInvoiceType(invoice) === 'TAX INVOICE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-sky-50 text-sky-700'
                      }`}>
                        {getEffectiveInvoiceType(invoice) === 'TAX INVOICE' ? 'TAX' : 'PROFORMA'}
                      </span>
                      {invoice.isPaid && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-50 text-green-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          Paid
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">{normalizeInvoiceDate(invoice.invoiceDate) || formatDate(invoice.createdAt)}</span>
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-gray-400 font-medium">Customer</div>
                        <div className="text-sm font-semibold text-gray-800">{invoice.customerName || 'N/A'}</div>
                        {invoice.customerContact && <div className="text-xs text-gray-400">{invoice.customerContact}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400 font-medium">Amount</div>
                        <div className="text-lg font-bold text-gray-900">₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="pt-1">
                      <StageProgress invoice={invoice} />
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                    {onViewInvoice && (
                      <button onClick={() => onViewInvoice(invoice)} className="flex-1 py-2.5 text-sm font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        View
                      </button>
                    )}
                    <button onClick={() => onEditInvoice(invoice)} className="flex-1 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      Edit
                    </button>
                    <button onClick={() => handleDeleteClick(invoice._id)} className="flex-1 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
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

      {/* Image Gallery Preview Modal */}
      {previewGallery && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200" onClick={() => setPreviewGallery(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-gray-900">{previewGallery.title}</h3>
              <div className="flex items-center gap-3">
                {previewGallery.images.length > 1 && (
                  <span className="text-xs font-bold text-gray-500">{previewGallery.currentIndex + 1} of {previewGallery.images.length}</span>
                )}
                <button onClick={() => setPreviewGallery(null)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="relative p-2 flex items-center justify-center">
              {previewGallery.images.length > 1 && (
                <button onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1 }))} className="absolute left-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
              <img src={previewGallery.images[previewGallery.currentIndex]?.url || previewGallery.images[previewGallery.currentIndex]?.proof} alt="Proof" className="w-full h-auto max-h-[80vh] object-contain" />
              {previewGallery.images.length > 1 && (
                <button onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0 }))} className="absolute right-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 mx-4">
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
              <button onClick={cancelDelete} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200">Delete Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedInvoiceHistory;