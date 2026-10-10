import React, { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { renumberInvoices } from '../../services/invoiceService';

// Helper to normalize DD/MM/YYYY date for sorting
const parseDate = (dateStr, actualDate, createdAt) => {
  if (actualDate) return new Date(actualDate).getTime();
  if (dateStr) {
    const str = String(dateStr).trim();
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)).getTime();
    }
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymd) {
      return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10)).getTime();
    }
    const parsed = new Date(dateStr).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return createdAt ? new Date(createdAt).getTime() : 0;
};

const SequentialRenumberModal = ({ isOpen, onClose, invoices = [], onSuccess }) => {
  const [prefix, setPrefix] = useState('TV');
  const [startNumber, setStartNumber] = useState(1);
  const [padding, setPadding] = useState(6);
  const [sortBy, setSortBy] = useState('invoiceDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');

  // Calculate live preview of sorted invoices and their prospective new numbers
  const previewList = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];

    const copy = [...invoices];
    copy.sort((a, b) => {
      let timeA, timeB;
      if (sortBy === 'invoiceDate') {
        timeA = parseDate(a.invoiceDate, a.actualDate, a.createdAt);
        timeB = parseDate(b.invoiceDate, b.actualDate, b.createdAt);
      } else {
        timeA = new Date(a.createdAt || 0).getTime();
        timeB = new Date(b.createdAt || 0).getTime();
      }
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    const padLen = Math.max(1, Math.min(10, parseInt(padding, 10) || 6));
    const startNum = parseInt(startNumber, 10) || 1;
    const cleanPrefix = (prefix || 'TV').trim().toUpperCase();

    return copy.map((inv, idx) => {
      const numStr = String(startNum + idx).padStart(padLen, '0');
      const newInvoiceNo = `${cleanPrefix}${numStr}`;
      return {
        ...inv,
        newInvoiceNo,
        isChanged: inv.invoiceNo !== newInvoiceNo
      };
    });
  }, [invoices, prefix, startNumber, padding, sortBy, sortOrder]);

  const displayedPreview = useMemo(() => {
    if (!filterSearch) return previewList;
    const q = filterSearch.toLowerCase();
    return previewList.filter(
      item =>
        item.invoiceNo?.toLowerCase().includes(q) ||
        item.newInvoiceNo?.toLowerCase().includes(q) ||
        item.customerName?.toLowerCase().includes(q)
    );
  }, [previewList, filterSearch]);

  const changedCount = useMemo(() => {
    return previewList.filter(item => item.isChanged).length;
  }, [previewList]);

  const handleApply = async () => {
    if (previewList.length === 0) return;

    const confirmMsg = `Are you sure you want to renumber ${previewList.length} invoices sequentially?\n\nStarting from: ${previewList[0]?.newInvoiceNo} to ${previewList[previewList.length - 1]?.newInvoiceNo}`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      const res = await renumberInvoices({
        prefix,
        startNumber: parseInt(startNumber, 10) || 1,
        padding: parseInt(padding, 10) || 6,
        sortBy,
        sortOrder
      });

      if (res.success) {
        toast.success(res.message || 'Invoices renumbered successfully!');
        if (onSuccess) {
          await onSuccess();
        }
        onClose();
      } else {
        toast.error(res.message || 'Failed to renumber invoices');
      }
    } catch (err) {
      console.error('Renumber error:', err);
      toast.error(err.message || 'Error occurred while renumbering invoices');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50/80 to-emerald-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0d9488] text-white flex items-center justify-center shadow-md shadow-teal-700/20 font-bold text-lg">
              🔢
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">Sequential Invoice Numbering</h3>
              <p className="text-xs text-gray-500">Re-sequence and organize invoice numbers in chronologically sequential order</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
            {/* Prefix */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Prefix</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="e.g. TV"
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              />
            </div>

            {/* Starting Number */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Starting #</label>
              <input
                type="number"
                min="1"
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              />
            </div>

            {/* Digit Padding */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Digits (Padding)</label>
              <select
                value={padding}
                onChange={(e) => setPadding(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              >
                <option value={3}>3 digits (e.g. TV001)</option>
                <option value={4}>4 digits (e.g. TV0001)</option>
                <option value={5}>5 digits (e.g. TV00001)</option>
                <option value={6}>6 digits (e.g. TV000001)</option>
              </select>
            </div>

            {/* Sort Field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              >
                <option value="invoiceDate">Invoice Date</option>
                <option value="createdAt">Created Date</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              >
                <option value="asc">Oldest to Newest (1, 2, 3...)</option>
                <option value="desc">Newest to Oldest</option>
              </select>
            </div>
          </div>

          {/* Quick Info Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-gray-500 border-t border-gray-200/60">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Total Invoices: {previewList.length}</span>
              <span>•</span>
              <span className="text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                Range: {previewList[0]?.newInvoiceNo || 'N/A'} → {previewList[previewList.length - 1]?.newInvoiceNo || 'N/A'}
              </span>
              <span>•</span>
              <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                {changedCount} will be updated
              </span>
            </div>

            {/* Search filter for preview */}
            <div className="w-full sm:w-48">
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Filter preview list..."
                className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Live Preview Table */}
        <div className="flex-1 overflow-y-auto max-h-[380px] p-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100/80 text-gray-600 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="py-2.5 px-3 rounded-l-lg">#</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Customer Name</th>
                <th className="py-2.5 px-3">Current Invoice #</th>
                <th className="py-2.5 px-3 text-center">→</th>
                <th className="py-2.5 px-3 rounded-r-lg">New Sequential #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {displayedPreview.map((item, idx) => (
                <tr key={item._id || idx} className="hover:bg-teal-50/30 transition-colors">
                  <td className="py-2 px-3 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{item.invoiceDate || 'N/A'}</td>
                  <td className="py-2 px-3 text-gray-900 font-semibold truncate max-w-[180px]">{item.customerName || 'N/A'}</td>
                  <td className="py-2 px-3 font-mono text-gray-600">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">{item.invoiceNo}</span>
                  </td>
                  <td className="py-2 px-3 text-center text-teal-600 font-bold">→</td>
                  <td className="py-2 px-3 font-mono">
                    <span className={`px-2 py-0.5 rounded font-bold ${item.isChanged ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-gray-50 text-gray-500'}`}>
                      {item.newInvoiceNo}
                    </span>
                  </td>
                </tr>
              ))}
              {displayedPreview.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No invoices match your preview filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            ⚠️ Note: This safely preserves all customer information, items, receipts, and stage proofs.
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={loading || previewList.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-xl shadow-md shadow-teal-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Applying Sequence...</span>
                </>
              ) : (
                <span>Confirm & Renumber ({previewList.length})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SequentialRenumberModal;
