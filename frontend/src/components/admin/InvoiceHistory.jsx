import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import { deleteInvoice, updateInvoice } from '../../services/invoiceService';
import { toast } from 'react-toastify';
import StageProofModal from './StageProofModal';

const STAGES = ['Invoice', 'Payment Received', 'Work completion', 'Closure agreement'];

const InvoiceHistory = ({ invoices = [], onEditInvoice, onDeleteInvoice, onStatusUpdate }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [localInvoices, setLocalInvoices] = useState(invoices);

  // Stage proof modal state
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [selectedInvoiceForStage, setSelectedInvoiceForStage] = useState(null);
  const [targetStage, setTargetStage] = useState(null);

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState(null);

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

    const updateData = {
      status: targetStage,
      [stageFieldMap[targetStage]]: stageData
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
    <div className="max-w-6xl mx-auto p-4 bg-white font-sans">
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice No</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {localInvoices.map((invoice) => (
                <tr key={invoice._id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6 text-sm font-semibold text-gray-900">{invoice.invoiceNo}</td>
                  <td className="py-4 px-6 text-sm text-gray-600">{invoice.invoiceDate || formatDate(invoice.createdAt)}</td>
                  <td className="py-4 px-6 text-sm text-gray-600 font-medium">
                    {invoice.customerName || 'N/A'}
                  </td>
                  <td className="py-4 px-6 text-sm">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">
                      {invoice.invoiceType}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-gray-900 text-right">
                    ₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-4 px-6 text-sm">
                    <div className="flex items-center gap-1">
                      {STAGES.map((stage, index) => {
                        const currentIdx = getStatusIndex(invoice.status || 'Invoice');
                        const isCompleted = index <= currentIdx;
                        const isCurrent = index === currentIdx;
                        
                        return (
                          <div key={stage} className="flex items-center">
                            <button
                              onClick={() => handleStatusUpdate(invoice._id, stage)}
                              title={stage}
                              className={`w-3 h-3 rounded-full transition-all duration-200 ${
                                isCompleted 
                                  ? 'bg-blue-600 shadow-sm' 
                                  : 'bg-gray-200 hover:bg-gray-300'
                              } ${isCurrent ? 'ring-2 ring-blue-300 ring-offset-1 scale-125' : ''}`}
                            />
                            {index < STAGES.length - 1 && (
                              <div className={`w-4 h-0.5 ${
                                index < currentIdx ? 'bg-blue-600' : 'bg-gray-200'
                              }`} />
                            )}
                          </div>
                        );
                      })}
                      <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                        {invoice.status || 'Invoice'}
                      </span>
                      
                      {/* Stage Proof Previews */}
                      <div className="flex gap-1 ml-2">
                        {invoice.paymentDetails?.proof && (
                          <button
                            onClick={() => setPreviewImage(invoice.paymentDetails.proof)}
                            className="bg-blue-50 p-1 rounded hover:bg-blue-100 transition-colors"
                            title="View Payment Proof"
                          >
                            <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {invoice.workDetails?.proof && (
                          <button
                            onClick={() => setPreviewImage(invoice.workDetails.proof)}
                            className="bg-green-50 p-1 rounded hover:bg-green-100 transition-colors"
                            title="View Work Proof"
                          >
                            <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {invoice.closureDetails?.proof && (
                          <button
                            onClick={() => setPreviewImage(invoice.closureDetails.proof)}
                            className="bg-purple-50 p-1 rounded hover:bg-purple-100 transition-colors"
                            title="View Closure Proof"
                          >
                            <svg className="w-3 h-3 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 20c4.083 0 7.774-2.147 9.856-5.338a1 1 0 00-.573-1.466C17.585 12.33 14.837 12 12 12c-2.837 0-5.585.33-9.283 1.196a1 1 0 00-.573 1.466A10.003 10.003 0 006.315 20l.054.09A10.003 10.003 0 0012 20c4.083 0 7.774-2.147 9.856-5.338a1 1 0 00-.573-1.466C17.585 12.33 14.837 12 12 12c-2.837 0-5.585.33-9.283 1.196a1 1 0 00-.573 1.466A10.003 10.003 0 006.315 20l.054.09A10.003 10.003 0 0012 20" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-center">
                    <div className="flex justify-center items-center gap-4">
                      <button
                        onClick={() => onEditInvoice(invoice)}
                        className="text-blue-600 hover:text-blue-800 font-bold transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClick(invoice._id)}
                        className="text-red-500 hover:text-red-700 font-bold transition-colors"
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
      />

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-gray-900">Payment Proof</h3>
              <button onClick={() => setPreviewImage(null)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-2">
              <img src={previewImage} alt="Payment Proof" className="w-full h-auto max-h-[80vh] object-contain" />
            </div>
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