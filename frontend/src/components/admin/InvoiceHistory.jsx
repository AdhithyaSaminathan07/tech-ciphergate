import React, { useState, useEffect } from 'react';
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

const InvoiceHistory = ({ invoices = [], onEditInvoice, onDeleteInvoice, onStatusUpdate }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [localInvoices, setLocalInvoices] = useState(invoices);

  // Stage proof modal state
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [selectedInvoiceForStage, setSelectedInvoiceForStage] = useState(null);
  const [targetStage, setTargetStage] = useState(null);

  // Image Preview Modal - supports gallery with multiple proofs
  const [previewGallery, setPreviewGallery] = useState(null); // { images: [...], currentIndex: 0, title: '' }

  // Helper: get all proofs from a stage detail field (handles both old single proof and new proofs array)
  const getProofs = (details) => {
    if (!details) return [];
    if (details.proofs && details.proofs.length > 0) return details.proofs;
    if (details.proof) return [{ date: details.date, url: details.proof }];
    return [];
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

  // Calculate total amount for an invoice
  const calculateTotal = (invoice) => {
    const subtotal = invoice.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);

    const gstTotal = (invoice.gstEnabled) ?
      invoice.items.reduce((sum, item) =>
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;

    return subtotal + gstTotal;
  };

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
      } else {
        alert('Failed to delete invoice: ' + response.message);
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Error deleting invoice: ' + (error.message || 'Unknown error'));
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

  // Handle status update
  const handleStatusUpdate = async (invoiceId, newStatus) => {
    // These stages require proof upload
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

        // Notify parent to maintain persistence
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
    
    // Map stage to its respective detail field
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

    const updateData = {
      status: newStatus,
      [stageFieldMap[targetStage]]: newStageData
    };

    const success = await performStatusUpdate(selectedInvoiceForStage._id, updateData);

    if (success) {
      setIsStageModalOpen(false);
      setSelectedInvoiceForStage(null);
      setTargetStage(null);
    }
  };

  const getStatusIndex = (status) => {
    const index = STAGES.indexOf(status);
    return index === -1 ? 0 : index;
  };

  return (
    <div className="w-full bg-white font-sans">
      {localInvoices.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-gray-200">
           <div className="flex flex-col items-center">
            <div className="bg-gray-100 p-4 rounded-full mb-4">
                <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No invoices found</h3>
            <p className="text-gray-500">Create your first invoice to see it here, or adjust your filters.</p>
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
              {localInvoices.map((invoice) => (
                <tr key={invoice._id} className="hover:bg-teal-50/20 transition-colors">
                  <td className="py-3.5 px-4 text-sm font-semibold text-gray-900 truncate">{invoice.invoiceNo}</td>
                  <td className="py-3.5 px-4 text-sm text-gray-500">{normalizeInvoiceDate(invoice.invoiceDate) || formatDate(invoice.createdAt)}</td>
                  <td className="py-3.5 px-4 text-sm">
                    <div className="font-medium text-gray-800 truncate">{invoice.customerName || 'N/A'}</div>
                    {invoice.customerContact && <div className="text-xs text-gray-400 truncate">{invoice.customerContact}</div>}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${ invoice.invoiceType === 'TAX INVOICE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-teal-50 text-[#0d9488] border border-teal-100' }`}>
                      {invoice.invoiceType}
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
                    <div className="flex flex-col gap-1.5">
                      {/* Stage dots row */}
                      <div className="flex items-center gap-0">
                        {STAGES.map((stage, index) => {
                          const currentIdx = getStatusIndex(invoice.status || 'Invoice');
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
                          {invoice.status || 'Invoice'}
                        </span>
                        <div className="flex items-center gap-1">
                          {(() => {
                            const paymentProofs = getProofs(invoice.paymentDetails);
                            const workProofs = getProofs(invoice.workDetails);
                            const closureProofs = getProofs(invoice.closureDetails);
                            return (
                              <>
                                 {paymentProofs.length > 0 && (
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

export default InvoiceHistory;