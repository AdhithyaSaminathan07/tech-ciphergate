import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaTrash, FaHistory, FaSearch, FaFileInvoiceDollar, FaEye } from 'react-icons/fa';
import Modal from '../common/Modal';
import AdvancedInvoice from './AdvancedInvoice';

const AdminDeleteHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchDeleteHistory();
  }, []);

  const fetchDeleteHistory = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const response = await axios.get(`${API_URL}/invoices/delete-history/admin`, config);

      if (response.data.success) {
        setHistory(response.data.data);
      } else {
        setError('Failed to fetch delete history');
      }
    } catch (err) {
      console.error('Error fetching delete history:', err);
      setError(err.response?.data?.message || 'Error fetching delete history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // If it's already a formatted string like 'DD-MM-YYYY', return it
    if (dateString.includes('-') && dateString.length === 10) return dateString;

    // Otherwise try to parse it as a date object
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  const handleView = (invoice) => {
    setSelectedInvoice(invoice.originalInvoiceData);
    setShowPreviewModal(true);
  };

  const filteredHistory = history.filter(item =>
    item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.deletedByName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FaHistory className="text-red-600" /> Deleted Invoice History
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            View logs of all deleted invoices from Admin and Employees
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg">
            <FaTrash size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Deleted</p>
            <h3 className="text-2xl font-bold text-gray-800">{history.length}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <FaFileInvoiceDollar size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Value Deleted</p>
            <h3 className="text-2xl font-bold text-gray-800">
              {formatCurrency(history.reduce((sum, item) => sum + (item.totalAmount || 0), 0))}
            </h3>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Invoice No, Customer, or User..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Loading history...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500 bg-red-50">
            <p>{error}</p>
            <button
              onClick={fetchDeleteHistory}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center">
            <FaHistory size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">No deleted invoices found</p>
            <p className="text-sm">Invoices deleted by you or your employees will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Invoice No</th>
                  <th className="px-6 py-4">Status & Date</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Deleted By</th>
                  <th className="px-6 py-4">Deleted On</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-800">#{item.invoiceNo}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded w-fit mb-1">
                          DELETED
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(item.invoiceDate)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <spn className="font-medium text-gray-700">{item.customerName || 'N/A'}</spn>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-gray-800">{formatCurrency(item.totalAmount)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">{item.deletedByName}</span>
                        <span className="text-xs text-gray-500 capitalize">{item.deletedByRole}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {new Date(item.deletedAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleView(item)}
                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-2 rounded transition-colors"
                        title="View Invoice Preview"
                      >
                        <FaEye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Preview Modal */}
      {showPreviewModal && selectedInvoice && (
        <Modal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          title={`Preview Deleted Invoice #${selectedInvoice.invoiceNo}`}
          size="xl"
          footer={
            <button
              onClick={() => setShowPreviewModal(false)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded transition"
            >
              Close
            </button>
          }
        >
          <div className="overflow-y-auto max-h-[70vh]">
            <AdvancedInvoice
              initialData={selectedInvoice}
              isPreviewMode={true}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminDeleteHistory;