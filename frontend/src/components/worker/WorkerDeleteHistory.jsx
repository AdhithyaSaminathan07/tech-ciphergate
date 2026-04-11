import React, { useState, useEffect } from 'react';
import { getWorkerDeleteHistory, getDeletedInvoiceById } from '../../services/invoiceService';
import Card from '../common/Card';

const WorkerDeleteHistory = () => {
  const [deletedInvoices, setDeletedInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Load delete history from backend on component mount
  useEffect(() => {
    fetchDeleteHistory();
  }, []);

  const fetchDeleteHistory = async () => {
    try {
      setLoading(true);
      const response = await getWorkerDeleteHistory();
      if (response.success) {
        setDeletedInvoices(response.data);
      } else {
        setError(response.message || 'Failed to fetch delete history');
      }
    } catch (err) {
      setError('Error fetching delete history: ' + (err.message || 'Unknown error'));
      console.error('Error fetching delete history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // View invoice details
  const viewInvoiceDetails = async (deleteHistoryRecord) => {
    try {
      setSelectedInvoice(deleteHistoryRecord.originalInvoiceData);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Error fetching invoice details:', err);
      alert('Error fetching invoice details: ' + (err.message || 'Unknown error'));
    }
  };

  // Close detail modal
  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedInvoice(null);
  };

  // Calculate total amount for an invoice
  const calculateTotal = (invoice) => {
    if (!invoice || !invoice.items) return 0;
    
    const subtotal = invoice.items.reduce((sum, item) => 
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);
    
    const gstTotal = (invoice.gstEnabled) ? 
      invoice.items.reduce((sum, item) => 
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;
    
    return subtotal + gstTotal;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 bg-white font-sans">
      <h1 className="text-xl font-bold text-gray-800 mb-6">My Delete History</h1>
      
      {loading && (
        <div className="text-center py-4">
          <p>Loading delete history...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && !error && deletedInvoices.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-gray-500">No deleted invoices found.</p>
        </Card>
      ) : (
        !loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Invoice No</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Date</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Customer</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Amount</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 border-b">Deleted At</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deletedInvoices.map((record, index) => (
                  <tr key={record._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b">{record.invoiceNo}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b">{record.invoiceDate}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b">
                      {record.customerName || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b text-right">
                      ₹{record.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b">
                      {formatDate(record.deletedAt)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 border-b text-center">
                      <button
                        onClick={() => viewInvoiceDetails(record)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Invoice Details</h3>
              <button
                onClick={closeDetailModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="border-t border-gray-200 pt-4">
              {/* Invoice Header Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <h4 className="font-medium text-gray-700">Invoice No:</h4>
                  <p>{selectedInvoice.invoiceNo}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Invoice Date:</h4>
                  <p>{selectedInvoice.invoiceDate}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Customer Name:</h4>
                  <p>{selectedInvoice.customerName || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Customer Contact:</h4>
                  <p>{selectedInvoice.customerContact || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Sales Person:</h4>
                  <p>{selectedInvoice.salesPerson || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Terms:</h4>
                  <p>{selectedInvoice.terms || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Due Date:</h4>
                  <p>{selectedInvoice.dueDate || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Invoice Type:</h4>
                  <p>{selectedInvoice.invoiceType || 'N/A'}</p>
                </div>
                {selectedInvoice.gstEnabled && (
                  <>
                    <div>
                      <h4 className="font-medium text-gray-700">Sale Type:</h4>
                      <p>{selectedInvoice.saleType || 'N/A'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-700">Customer GST:</h4>
                      <p>{selectedInvoice.customerGst || 'N/A'}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Items Table */}
              <h4 className="font-medium text-gray-700 mb-2">Items:</h4>
              <div className="overflow-x-auto mb-6">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">Description</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">HSN</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">GST %</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">Qty</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">Rate</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 border-b">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items && selectedInvoice.items.map((item, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b">{item.description}</td>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b">{item.hsn || 'N/A'}</td>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b">{item.gst}%</td>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b">{item.qty}</td>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b">₹{item.rate.toFixed(2)}</td>
                        <td className="py-2 px-3 text-sm text-gray-700 border-b text-right">
                          ₹{item.isTotalOverridden ? item.total.toFixed(2) : (item.qty * item.rate).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <h4 className="font-medium text-gray-700">Bank Name:</h4>
                  <p>{selectedInvoice.bankName || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Account Number:</h4>
                  <p>{selectedInvoice.accountNumber || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">IFSC Code:</h4>
                  <p>{selectedInvoice.ifscCode || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">UPI ID:</h4>
                  <p>{selectedInvoice.upiId || 'N/A'}</p>
                </div>
              </div>

              {/* Totals Section */}
              <div className="flex justify-end">
                <div className="w-full md:w-1/2">
                  <div className="flex justify-between py-2">
                    <span className="font-medium">Subtotal:</span>
                    <span>₹{calculateTotal(selectedInvoice).toFixed(2)}</span>
                  </div>
                  {selectedInvoice.gstEnabled && (
                    <>
                      <div className="flex justify-between py-2">
                        <span className="font-medium">GST ({selectedInvoice.saleType}):</span>
                        <span>₹{(calculateTotal(selectedInvoice) * (selectedInvoice.saleType === 'Interstate' ? 0.18 : 0.09)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t border-gray-300 font-bold">
                        <span>Total:</span>
                        <span>₹{(
                          calculateTotal(selectedInvoice) + 
                          (calculateTotal(selectedInvoice) * (selectedInvoice.saleType === 'Interstate' ? 0.18 : 0.09))
                        ).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {!selectedInvoice.gstEnabled && (
                    <div className="flex justify-between py-2 border-t border-gray-300 font-bold">
                      <span>Total:</span>
                      <span>₹{calculateTotal(selectedInvoice).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={closeDetailModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerDeleteHistory;