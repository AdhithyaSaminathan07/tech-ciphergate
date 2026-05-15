import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import Card from '../common/Card';
import AdvancedInvoice from './AdvancedInvoice';
import InvoiceHistory from './InvoiceHistory';
import UnifiedInvoiceHistory from './UnifiedInvoiceHistory';
import AdminDeleteHistory from './AdminDeleteHistory'; // Add this import
import RenewalModal from './RenewalModal';
import { getInvoices, getAllInvoices, createInvoice, updateInvoice, deleteInvoice, updateAdminLastViewed } from '../../services/invoiceService';
import { useAuth } from '../../hooks/useAuth';

const InvoiceManagement = () => {
  const [activeTab, setActiveTab] = useState('advanced-invoice');
  const [invoices, setInvoices] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Filter states
  const [filterType, setFilterType] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gstFilter, setGstFilter] = useState('all');

  // Renewal Modal State
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [renewalInvoiceData, setRenewalInvoiceData] = useState(null);

  // Load invoices from backend on component mount
  useEffect(() => {
    fetchInvoices('monthly', '', '', 'all');

    // Update admin last viewed timestamp to reset notification count
    updateAdminLastViewed();
  }, []);

  const fetchInvoices = async (type = filterType, start = startDate, end = endDate, gst = gstFilter) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        filterType: type,
        gstFilter: gst
      };

      if (type === 'custom' && start && end) {
        params.startDate = start;
        params.endDate = end;
      }

      const response = await getAllInvoices(params);
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

  const handleFilterChange = (type) => {
    setFilterType(type);
    if (type !== 'custom') {
      fetchInvoices(type, startDate, endDate, gstFilter);
    }
  };

  const handleGstFilterChange = (gst) => {
    setGstFilter(gst);
    fetchInvoices(filterType, startDate, endDate, gst);
  };

  const applyCustomFilter = () => {
    if (!startDate || !endDate) {
      toast.warn('Please select both start and end dates');
      return;
    }
    fetchInvoices('custom', startDate, endDate, gstFilter);
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

        // Automatically trigger renewal modal after save
        setRenewalInvoiceData({
          id: response.data.invoiceNo,
          mongoId: response.data._id,
          customerName: invoiceData.customerName,
          customerContact: invoiceData.customerContact
        });
        setIsRenewalModalOpen(true);
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

  const handleStatusUpdate = (invoiceId, updatedData) => {
    setInvoices(prev => prev.map(inv =>
      inv._id === invoiceId ? { ...inv, ...updatedData } : inv
    ));
  };

  const downloadSalesReport = () => {
    if (invoices.length === 0) {
      toast.warn("No invoices to export for the current filters");
      return;
    }

    const monthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();

    // Create a temporary table element to use table_to_sheet for better alignment/merging support
    const table = document.createElement('table');

    // Row 1: Title
    const tr1 = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.setAttribute('colspan', '11');
    td1.style.textAlign = 'center';
    td1.style.fontWeight = 'bold';
    td1.style.fontSize = '14pt';
    td1.innerText = `TECH VASEEGRAH INVOICE ${monthYear}`;
    tr1.appendChild(td1);
    table.appendChild(tr1);

    // Row 2: GSTIN
    const tr2 = document.createElement('tr');
    const td2 = document.createElement('td');
    td2.setAttribute('colspan', '11');
    td2.style.textAlign = 'center';
    td2.style.fontWeight = 'bold';
    td2.innerText = "GSTIN/UIN : 33KYGPS1983E1Z1";
    tr2.appendChild(td2);
    table.appendChild(tr2);

    // Row 3: Headers
    const tr3 = document.createElement('tr');
    const headers = ["S.NO", "SELLER'S NAME", "SELLER'S GST NO", "INVOICE NO", "INVOICE DT", "TAX VALUE", "RATE", "Total Tax", "CGST", "SGST", "TOTAL INVOICE VALUE"];
    headers.forEach(h => {
      const th = document.createElement('th');
      th.style.border = '1px solid black';
      th.style.backgroundColor = '#ffffff'; // White background as per image
      th.style.fontWeight = 'bold';
      th.style.textAlign = 'center';
      th.innerText = h;
      tr3.appendChild(th);
    });
    table.appendChild(tr3);

    let totalTaxValue = 0;
    let totalTaxAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalInvoiceValue = 0;

    invoices.forEach((invoice, index) => {
      const taxableValue = invoice.items.reduce((sum, item) => sum + (item.qty * item.rate), 0);
      const totalTax = invoice.items.reduce((sum, item) => sum + (item.qty * item.rate * (item.gst / 100)), 0);
      const invoiceTotal = taxableValue + totalTax;

      const cgst = invoice.saleType === 'Intrastate' ? totalTax / 2 : 0;
      const sgst = invoice.saleType === 'Intrastate' ? totalTax / 2 : 0;
      const rate = invoice.items.length > 0 ? `${invoice.items[0].gst}%` : '18%';

      const tr = document.createElement('tr');
      [
        index + 1,
        invoice.customerName || 'N/A',
        invoice.customerGst || 'N/A',
        invoice.invoiceNo,
        invoice.invoiceDate,
        taxableValue.toFixed(2),
        rate,
        totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        `₹${invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ].forEach((val, i) => {
        const td = document.createElement('td');
        td.style.border = '1px solid black';
        td.style.textAlign = 'center'; // Center everything as per user request
        td.innerText = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);

      totalTaxValue += taxableValue;
      totalTaxAmount += totalTax;
      totalCgst += cgst;
      totalSgst += sgst;
      totalInvoiceValue += invoiceTotal;
    });

    // Empty spacers if needed - in the image there's an empty row
    const trEmpty = document.createElement('tr');
    for (let i = 0; i < 11; i++) {
      const td = document.createElement('td');
      td.style.border = '1px solid black';
      trEmpty.appendChild(td);
    }
    table.appendChild(trEmpty);

    // Totals Row
    const trTotal = document.createElement('tr');
    trTotal.style.fontWeight = 'bold';
    [
      "", "", "", "", "",
      totalTaxValue.toFixed(2),
      "",
      totalTaxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      `₹${totalInvoiceValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    ].forEach((val, i) => {
      const td = document.createElement('td');
      td.style.border = '1px solid black';
      td.style.textAlign = 'center';
      td.innerText = val;
      trTotal.appendChild(td);
    });
    table.appendChild(trTotal);

    // Convert table to worksheet
    const ws = XLSX.utils.table_to_sheet(table);

    // Set column widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 35 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `TECH_VASEEGRAH_REPORT_${monthYear.replace(' ', '_')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between md:justify-end gap-4 mb-2">
        <h1 className="text-2xl font-bold text-gray-800 md:hidden">Invoice Management</h1>
        <div className="flex gap-3">
          {(activeTab === 'invoice-history' || activeTab === 'unified-history') && (
            <button
              onClick={downloadSalesReport}
              className="flex items-center gap-2 bg-green-50 text-green-700 hover:bg-green-100 font-bold py-2 px-4 rounded-xl border border-green-200 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Sales Report
            </button>
          )}
          <button
            onClick={() => {
              setEditingInvoice(null);
              setActiveTab('advanced-invoice');
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
          >
            <span className="text-xl">+</span> Create New Invoice
          </button>
        </div>
      </div>

      {/* Global Filter UI - Only show for history tabs */}
      {(activeTab === 'invoice-history' || activeTab === 'unified-history') && (
        <div className="flex flex-wrap items-center justify-end gap-4 animate-in fade-in slide-in-from-top-4">
          {/* GST Filter Dropdown */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-bold text-gray-400 ml-2 uppercase">Filter:</span>
            <select
              value={gstFilter}
              onChange={(e) => handleGstFilterChange(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-blue-600 focus:ring-0 cursor-pointer pr-8"
            >
              <option value="all">All Invoices</option>
              <option value="gst">GST Only</option>
              <option value="non-gst">Non-GST</option>
              <option value="igst">IGST (Interstate)</option>
              <option value="cgst-sgst">CGST/SGST (Intrastate)</option>
            </select>
          </div>

          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            {[
              { id: 'today', label: 'Today' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom' }
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => handleFilterChange(option.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${filterType === option.id
                    ? 'bg-blue-50 text-blue-600 shadow-inner'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {filterType === 'custom' && (
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm animate-in zoom-in-95">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-sm focus:ring-0 px-2 py-1 cursor-pointer"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-sm focus:ring-0 px-2 py-1 cursor-pointer"
              />
              <button
                onClick={applyCustomFilter}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-md"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error indicator */}
      {error && !loading && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-xl">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-500 font-medium">Fetching your invoices...</p>
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
        {activeTab === 'invoice-history' && !loading && (
          <InvoiceHistory
            invoices={invoices}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onStatusUpdate={handleStatusUpdate}
          />
        )}
        {activeTab === 'unified-history' && !loading && (
          <UnifiedInvoiceHistory
            invoices={invoices}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onStatusUpdate={handleStatusUpdate}
          />
        )}
        {activeTab === 'delete-history' && (
          <AdminDeleteHistory />
        )}
      </div>

      {renewalInvoiceData && (
        <RenewalModal
          isOpen={isRenewalModalOpen}
          onClose={() => setIsRenewalModalOpen(false)}
          invoiceId={renewalInvoiceData.mongoId}
          displayInvoiceNo={renewalInvoiceData.id}
          clientName={renewalInvoiceData.customerName}
          clientWhatsappInitial={(() => {
            const contact = renewalInvoiceData.customerContact || '';
            const match = contact.match(/\d{10}/);
            return match ? match[0] : '';
          })()}
        />
      )}
    </div>
  );
};

export default InvoiceManagement;