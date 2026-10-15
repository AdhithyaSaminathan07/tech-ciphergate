import React, { useState, useEffect } from 'react';
import { UserMinus, FileText, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import CustomDatePicker from '../../common/CustomDatePicker';
import { processRelieve } from '../../../services/exitManagementService';

const REASON_OPTIONS = [
  'Personal Reasons',
  'Career Growth / Better Opportunity',
  'Higher Education',
  'Relocation',
  'Health / Medical Reasons',
  'Project / Contract Completed',
  'Mutual Agreement',
  'Other'
];

const DirectRelieveModal = ({ 
  isOpen, 
  onClose, 
  worker, 
  onComplete,
  onSwitchToDocumentRelieve 
}) => {
  const [relievingDate, setRelievingDate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [reasonCategory, setReasonCategory] = useState('Personal Reasons');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && worker) {
      const today = new Date().toISOString().split('T')[0];
      setRelievingDate(today);
      setLastWorkingDay(today);
      setReasonCategory('Personal Reasons');
      setCustomReason('');
      setNotes('');
      setIsLoading(false);
    }
  }, [isOpen, worker]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!worker?._id) return;

    const finalReason = reasonCategory === 'Other' 
      ? (customReason.trim() || 'Other') 
      : reasonCategory;

    setIsLoading(true);
    try {
      const payload = {
        workerId: worker._id,
        relievingDate: relievingDate || new Date().toISOString().split('T')[0],
        lastWorkingDay: lastWorkingDay || relievingDate || new Date().toISOString().split('T')[0],
        reason: notes.trim() ? `${finalReason} - ${notes.trim()}` : finalReason,
        selectedDocuments: [],
        deliveryOptions: {
          email: false,
          whatsapp: false,
          download: false
        },
        documentFiles: [],
        email: '',
        phoneNumber: ''
      };

      const response = await processRelieve(payload);

      toast.success(response?.message || `${worker.name} directly relieved successfully!`);
      if (onComplete) onComplete();
      onClose();
    } catch (error) {
      console.error('Direct relieve error:', error);
      toast.error(error.message || 'Failed to relieve developer');
    } finally {
      setIsLoading(false);
    }
  };

  if (!worker) return null;

  const departmentName = typeof worker.department === 'object' 
    ? worker.department?.name 
    : (worker.department || 'General');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Direct Relieve Developer"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Notice Banner */}
        <div className="flex items-start gap-3 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-950">
          <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-amber-900 block">⚡ Quick Direct Mode</span>
            <span className="text-slate-600 mt-0.5 block">
              Immediately marks <strong>{worker.name}</strong> as Relieved and archives their profile without generating PDF document packages or sending emails.
            </span>
          </div>
        </div>

        {/* Worker Summary Card matching Project UI */}
        <div className="flex items-center gap-3.5 p-3.5 bg-[#F6F9F7] border border-[#E2ECE5] rounded-xl">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#087443] to-emerald-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-sm">
            {worker.name?.charAt(0)?.toUpperCase() || 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-800 truncate">{worker.name}</h4>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#E2ECE5] text-[11px] text-slate-700 font-semibold">
                {worker.rfid || worker.username}
              </span>
              <span>•</span>
              <span className="font-medium text-slate-600">{worker.designation || 'Developer'}</span>
              {departmentName && (
                <>
                  <span>•</span>
                  <span className="text-slate-600">{departmentName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* React Calendar CustomDatePicker matching project UI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group !mb-0">
            <label className="form-label">
              Relieving Date *
            </label>
            <CustomDatePicker
              id="relievingDate"
              name="relievingDate"
              className="w-full"
              inputClassName="w-full form-input"
              value={relievingDate}
              onChange={(val) => {
                setRelievingDate(val);
                if (!lastWorkingDay) setLastWorkingDay(val);
              }}
              required
            />
          </div>

          <div className="form-group !mb-0">
            <label className="form-label">
              Last Working Day *
            </label>
            <CustomDatePicker
              id="lastWorkingDay"
              name="lastWorkingDay"
              className="w-full"
              inputClassName="w-full form-input"
              value={lastWorkingDay}
              onChange={(val) => setLastWorkingDay(val)}
              required
            />
          </div>
        </div>

        {/* Reason for Leaving */}
        <div className="form-group !mb-0">
          <label className="form-label">
            Reason for Relieving
          </label>
          <select
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value)}
            className="form-input"
          >
            {REASON_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {reasonCategory === 'Other' && (
          <div className="form-group !mb-0">
            <input
              type="text"
              placeholder="Specify custom reason..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="form-input"
              required
            />
          </div>
        )}

        {/* Optional Notes */}
        <div className="form-group !mb-0">
          <label className="form-label">
            Optional Notes / Handover Remarks
          </label>
          <textarea
            rows="2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any internal handover or clearance notes..."
            className="form-input resize-none"
          />
        </div>

        {/* Switch to Full Document Generator Option */}
        {onSwitchToDocumentRelieve && (
          <div className="pt-3 border-t border-[#E2ECE5] flex items-center justify-between text-xs text-slate-500">
            <span>Need official letters & payslips?</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onSwitchToDocumentRelieve(worker);
              }}
              className="text-[#087443] hover:text-[#065F37] font-bold flex items-center gap-1 hover:underline transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Use Document Generator Wizard →
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end items-center gap-2 pt-3 border-t border-[#E2ECE5]">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            className="!bg-amber-600 hover:!bg-amber-700 !text-white"
            disabled={isLoading}
          >
            <UserMinus className="w-4 h-4 mr-1" />
            {isLoading ? 'Relieving...' : 'Confirm Direct Relieve'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DirectRelieveModal;
