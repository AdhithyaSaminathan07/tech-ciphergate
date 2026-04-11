import React, { useState } from 'react';
import Card from '../common/Card';
import { deleteInvoice } from '../../services/invoiceService';

const InvoiceHistory = ({ invoices, onEditInvoice, onDeleteInvoice }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [localInvoices, setLocalInvoices] = useState(invoices); // Add local state for invoices

  // Update local state when invoices prop changes
  React.useEffect(() => {
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

  return (
    <div className="max-w-6xl mx-auto p-4 bg-white font-sans">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Invoice History</h1>

      {localInvoices.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-gray-500">No invoices found. Create your first invoice to get started.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Invoice No</th>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Date</th>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Customer</th>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Type</th>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Amount</th>
                <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {localInvoices.map((invoice, index) => (
                <tr key={invoice._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b">{invoice.invoiceNo}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b">{invoice.invoiceDate || formatDate(invoice.createdAt)}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b">
                    {invoice.customerName || 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b">
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {invoice.invoiceType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b text-right">
                    ₹{calculateTotal(invoice).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 border-b text-center">
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => onEditInvoice(invoice)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClick(invoice._id)}
                        className="text-red-600 hover:text-red-900 font-medium text-sm"
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to delete this invoice? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceHistory;