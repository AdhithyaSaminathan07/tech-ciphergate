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

  // Handle status update from invoice history
  const handleStatusUpdate = (invoiceId, updatedData) => {
    setInvoices(prev => prev.map(inv =>
      inv._id === invoiceId ? { ...inv, ...updatedData } : inv
    ));
  };

  // Create a wrapper function that includes worker information
  const handleInvoiceSaveWithWorkerInfo = (invoiceData) => {
    handleInvoiceSave(invoiceData);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-0 mb-4">
        {/* Tabs for different invoice types */}
        <nav className="-mb-px flex space-x-6 md:space-x-8 overflow-x-auto scrollbar-none">
          {[
            { id: 'advanced-invoice', label: 'Advanced Invoice' },
            { id: 'invoice-history', label: 'Invoice History' },
            { id: 'delete-history', label: 'Delete History' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-[#0d9488] text-[#0d9488]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Action buttons on the right */}
        <div className="flex gap-3 flex-shrink-0 mb-2 md:mb-0">
          <button
            onClick={() => {
              setEditingInvoice(null);
              setActiveTab('advanced-invoice');
            }}
            className="flex items-center gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-teal-600/10 hover:shadow-lg hover:shadow-teal-600/15 hover:scale-[1.02] active:scale-[0.98] text-sm animate-in fade-in"
          >
            <span className="text-xl font-normal">+</span> Create New Invoice
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d9488] mx-auto"></div>
          <p className="mt-2 text-gray-500 font-medium">Loading invoices...</p>
        </div>
      )}

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
            onDeleteInvoice={handleDeleteInvoice}
            onStatusUpdate={handleStatusUpdate}
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