import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Card from '../common/Card';
import AdvancedInvoice from './AdvancedInvoice';
import InvoiceHistory from './InvoiceHistory';
import UnifiedInvoiceHistory from './UnifiedInvoiceHistory';
import AdminDeleteHistory from './AdminDeleteHistory'; // Add this import
import { getInvoices, getAllInvoices, createInvoice, updateInvoice, deleteInvoice, updateAdminLastViewed } from '../../services/invoiceService';
import { useAuth } from '../../hooks/useAuth';

const InvoiceManagement = () => {
  const [activeTab, setActiveTab] = useState('advanced-invoice');
  const [invoices, setInvoices] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Load invoices from backend on component mount
  useEffect(() => {
    fetchInvoices();

    // Update admin last viewed timestamp to reset notification count
    updateAdminLastViewed();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const response = await getAllInvoices();
      if (response.success) {
        setInvoices(response.data);
      } else {
        setError(response.message || 'Failed to fetch invoices');
      }
    } catch (err) {
      setError('Error fetching invoices: ' + (err.message || 'Unknown error'));
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceSave = async (invoiceData) => {
    try {
      let response;

      // Check if invoice already exists (by invoiceNo)
      const existingInvoice = invoices.find(inv => inv.invoiceNo === invoiceData.invoiceNo);

      if (existingInvoice) {
        // Update existing invoice
        response = await updateInvoice(existingInvoice._id, invoiceData);
      } else {
        // Create new invoice
        response = await createInvoice(invoiceData);
      }

      if (response.success) {
        // Refresh invoices list
        await fetchInvoices();
        toast.success('Invoice saved successfully!');
      } else {
        toast.error('Failed to save invoice: ' + response.message);
      }
    } catch (err) {
      console.error('Error saving invoice:', err);
      toast.error('Error saving invoice: ' + (err.message || 'Unknown error'));
    }
  };

  const handleEditInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setActiveTab('advanced-invoice');
  };

  // Handle delete invoice callback
  const handleDeleteInvoice = async (invoiceId) => {
    // Refresh invoices list after deletion
    await fetchInvoices();
    toast.success('Invoice deleted successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Invoice Management</h1>
        <button
          onClick={() => {
            setEditingInvoice(null);
            setActiveTab('advanced-invoice');
          }}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create New Invoice
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="text-center py-4">
          <p>Loading invoices...</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {/* Tabs for different invoice types */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('advanced-invoice')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'advanced-invoice'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Advanced Invoice
          </button>
          <button
            onClick={() => setActiveTab('invoice-history')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'invoice-history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Invoice History
          </button>
          <button
            onClick={() => setActiveTab('unified-history')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'unified-history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            All Invoices
          </button>
          <button
            onClick={() => setActiveTab('delete-history')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'delete-history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Delete History
          </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      <div className="mt-6">
        {activeTab === 'advanced-invoice' && (
          <AdvancedInvoice
            onInvoiceSave={handleInvoiceSave}
            initialData={editingInvoice}
          />
        )}
        {activeTab === 'invoice-history' && (
          <InvoiceHistory
            invoices={invoices}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice} // Pass the callback
          />
        )}
        {activeTab === 'unified-history' && (
          <UnifiedInvoiceHistory
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice} // Pass the callback
          />
        )}
        {activeTab === 'delete-history' && (
          <AdminDeleteHistory />
        )}
      </div>
    </div>
  );
};

export default InvoiceManagement;