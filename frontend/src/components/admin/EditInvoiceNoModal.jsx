import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { updateInvoice, getNextInvoiceNo } from '../../services/invoiceService';

const EditInvoiceNoModal = ({ isOpen, onClose, invoice, onSuccess }) => {
  const [newInvoiceNo, setNewInvoiceNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingNext, setFetchingNext] = useState(false);

  useEffect(() => {
    if (isOpen && invoice) {
      setNewInvoiceNo(invoice.invoiceNo || '');
    }
  }, [isOpen, invoice]);

  const handleFetchNext = async () => {
    const currentNo = (newInvoiceNo || '').trim();
    const match = currentNo.match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numDigits = match[2].length;
      const nextVal = parseInt(match[2], 10) + 1;
      setNewInvoiceNo(`${prefix}${String(nextVal).padStart(numDigits, '0')}`);
    } else {
      try {
        setFetchingNext(true);
        const res = await getNextInvoiceNo();
        if (res.success && res.data?.nextInvoiceNo) {
          setNewInvoiceNo(res.data.nextInvoiceNo);
        }
      } catch (err) {
        console.error('Failed to get next invoice number:', err);
      } finally {
        setFetchingNext(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanNo = newInvoiceNo.trim().toUpperCase();
    if (!cleanNo) {
      toast.warn('Please enter a valid invoice number');
      return;
    }

    if (cleanNo === invoice.invoiceNo) {
      onClose();
      return;
    }

    try {
      setLoading(true);
      const res = await updateInvoice(invoice._id, { invoiceNo: cleanNo });
      if (res.success) {
        toast.success(`Invoice number updated to ${cleanNo}`);
        if (onSuccess) {
          await onSuccess();
        }
        onClose();
      } else {
        toast.error(res.message || 'Failed to update invoice number');
      }
    } catch (err) {
      console.error('Error updating invoice number:', err);
      toast.error(err.message || 'Error updating invoice number');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0d9488] text-white flex items-center justify-center font-bold">
              ✏️
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Change Invoice Number</h3>
              <p className="text-xs text-gray-500">{invoice.customerName || 'Customer'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Current Invoice Number</label>
            <div className="px-3 py-2 bg-gray-100 rounded-xl text-sm font-mono text-gray-600 font-semibold">
              {invoice.invoiceNo}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700">New Invoice Number</label>
              <button
                type="button"
                onClick={handleFetchNext}
                disabled={fetchingNext}
                className="text-[11px] font-bold text-[#0d9488] hover:text-[#0f766e] flex items-center gap-1 hover:underline"
              >
                ⚡ {fetchingNext ? 'Fetching...' : 'Suggest Next #'}
              </button>
            </div>
            <input
              type="text"
              value={newInvoiceNo}
              onChange={(e) => setNewInvoiceNo(e.target.value.toUpperCase())}
              placeholder="e.g. TV000340"
              required
              className="w-full px-3.5 py-2.5 text-sm font-mono font-bold text-gray-900 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !newInvoiceNo.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-xl shadow-md shadow-teal-600/20 transition-all disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditInvoiceNoModal;
