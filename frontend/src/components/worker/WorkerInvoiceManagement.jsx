import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Card from '../common/Card';
import AdvancedInvoice from '../admin/AdvancedInvoice';
import WorkerInvoiceHistory from './WorkerInvoiceHistory';
import WorkerDeleteHistory from './WorkerDeleteHistory'; // Add this import
import { useAuth } from '../../hooks/useAuth';
import { getInvoices, createInvoice, updateInvoice } from '../../services/invoiceService';

const WorkerInvoiceManagement = () => {
  const [activeTab, setActiveTab] = useState('advanced-invoice');
  const [invoices, setInvoices] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth(); // Get user info from context

  // Load invoices from backend on component mount
  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const response = await getInvoices();
      if (response.success) {
        setInvoices(response.data);
      } else {
        setError(response.message || 'Failed to fetch invoices');
        toast.error(response.message || 'Failed to fetch invoices');
      }
    } catch (err) {
      setError('Error fetching invoices: ' + (err.message || 'Unknown error'));
      toast.error('Error fetching invoices: ' + (err.message || 'Unknown error'));
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceSave = async (invoiceData) => {
    try {
      // Add worker information to the invoice
      const invoiceWithWorkerInfo = {
        ...invoiceData,
        source: 'worker',
        workerInfo: {
          workerName: user?.name || user?.username || 'Unknown Worker',
          workerDepartment: user?.department?.name || user?.department || 'Unknown Department'
        },
        createdAt: invoiceData.createdAt || new Date().toISOString()
      };
      
      let response;
      
      // Check if invoice already exists (by invoiceNo)
      const existingInvoice = invoices.find(inv => inv.invoiceNo === invoiceWithWorkerInfo.invoiceNo);
      
      if (existingInvoice) {
        // Update existing invoice
        response = await updateInvoice(existingInvoice._id, invoiceWithWorkerInfo);
      } else {
        // Create new invoice
        response = await createInvoice(invoiceWithWorkerInfo);
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

  // Create a wrapper function that includes worker information
  const handleInvoiceSaveWithWorkerInfo = (invoiceData) => {
    handleInvoiceSave(invoiceData);
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
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'advanced-invoice'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Advanced Invoice
          </button>
          <button
            onClick={() => setActiveTab('invoice-history')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invoice-history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invoice History
          </button>
          <button
            onClick={() => setActiveTab('delete-history')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'delete-history'
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
            onInvoiceSave={handleInvoiceSaveWithWorkerInfo} 
            initialData={editingInvoice}
          />
        )}
        {activeTab === 'invoice-history' && (
          <WorkerInvoiceHistory 
            invoices={invoices} 
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice} // Pass the callback
          />
        )}
        {activeTab === 'delete-history' && (
          <WorkerDeleteHistory />
        )}
      </div>
    </div>
  );
};

export default WorkerInvoiceManagement;