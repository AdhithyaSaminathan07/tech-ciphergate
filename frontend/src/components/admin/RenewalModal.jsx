import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { 
  X, 
  Globe, 
  Server, 
  User, 
  Phone, 
  Calendar, 
  IndianRupee, 
  FileText, 
  Save, 
  ArrowRight,
  ShieldCheck,
  Hash,
  Info,
  ChevronRight,
  History,
  Activity,
  Zap
} from 'lucide-react';
import renewalService from '../../services/renewalService';

dayjs.extend(relativeTime);

const RenewalModal = ({ 
  isOpen, 
  onClose, 
  invoiceId, 
  clientName, 
  displayInvoiceNo, 
  clientWhatsappInitial = '', 
  initialRenewalData = null 
}) => {
  const [formData, setFormData] = useState({
    invoice_id: invoiceId,
    client_name: clientName,
    client_whatsapp: clientWhatsappInitial,
    subdomain: '',
    domain_name: '',
    domain_registrar: 'GoDaddy',
    domain_expiry_date: '',
    domain_cost: '',
    server_provider: 'Hostinger',
    server_plan: '',
    server_expiry_date: '',
    server_cost: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialRenewalData) {
      setFormData({
        ...initialRenewalData,
        domain_expiry_date: initialRenewalData.domain_expiry_date ? new Date(initialRenewalData.domain_expiry_date).toISOString().split('T')[0] : '',
        server_expiry_date: initialRenewalData.server_expiry_date ? new Date(initialRenewalData.server_expiry_date).toISOString().split('T')[0] : '',
      });
    } else {
      setFormData(prev => ({
        ...prev,
        invoice_id: invoiceId,
        client_name: clientName,
        client_whatsapp: clientWhatsappInitial || prev.client_whatsapp
      }));
    }
  }, [isOpen, invoiceId, clientName, clientWhatsappInitial, initialRenewalData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Auto-format WhatsApp number (only allow digits, max 10)
    if (name === 'client_whatsapp') {
      const cleaned = value.replace(/\D/g, '').slice(0, 10);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isFormValid = useMemo(() => {
    return formData.client_whatsapp?.length === 10 && formData.subdomain?.trim().length > 0;
  }, [formData.client_whatsapp, formData.subdomain]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (formData.domain_expiry_date && new Date(formData.domain_expiry_date) < today) {
      toast.error('Domain expiry date cannot be in the past');
      return;
    }
    if (formData.server_expiry_date && new Date(formData.server_expiry_date) < today) {
      toast.error('Server expiry date cannot be in the past');
      return;
    }

    try {
      setLoading(true);
      let response;
      if (initialRenewalData) {
        response = await renewalService.updateRenewal(initialRenewalData._id, formData);
      } else {
        response = await renewalService.createRenewal(formData);
      }
      
      if (response.success) {
        toast.success(initialRenewalData ? 'Renewal record updated successfully' : 'Renewal record created successfully');
        onClose(true);
      } else {
        toast.error(response.message || 'Failed to save renewal record');
      }
    } catch (error) {
      console.error('Error saving renewal:', error);
      toast.error('An unexpected error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const sectionClasses = "p-6 rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300";
  const labelClasses = "block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5";
  const inputClasses = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:bg-white focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 focus:outline-none transition-all duration-200";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200"
        >
          {/* Header */}
          <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10 bg-white/80 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-emerald-600 shadow-sm">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                    {initialRenewalData ? 'Edit Renewal' : 'Record Renewal'}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight border ${initialRenewalData ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                    {initialRenewalData ? 'Update' : 'New Entry'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 font-medium mt-0.5">
                  <span className="flex items-center gap-1"><Hash size={12} /> {displayInvoiceNo || 'N/A'}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                  <span className="flex items-center gap-1"><User size={12} /> {clientName}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => onClose(false)}
              className="w-10 h-10 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form id="renewal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
            
            {/* Timeline Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <History size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Date Created</span>
                </div>
                <div className="text-sm font-semibold text-slate-700">
                  {initialRenewalData ? dayjs(initialRenewalData.createdAt).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY')}
                </div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">
                  {initialRenewalData ? dayjs(initialRenewalData.createdAt).fromNow() : 'Today'}
                </div>
              </div>
              <div className="bg-emerald-50/30 border border-emerald-100/50 p-5 rounded-2xl relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2 text-emerald-600">
                  <Activity size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Current Status</span>
                </div>
                <div className="text-sm font-semibold text-emerald-700">
                  {dayjs().format('DD MMM YYYY')}
                </div>
                <div className="text-[11px] text-emerald-600/60 font-medium mt-1 uppercase tracking-tighter">
                  System Context Active
                </div>
              </div>
              <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <Calendar size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Projected Expiry</span>
                </div>
                <div className="text-sm font-semibold text-slate-700">
                  {formData.domain_expiry_date ? dayjs(formData.domain_expiry_date).format('DD MMM YYYY') : '—'}
                </div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">
                  {formData.domain_expiry_date ? `Scheduled ${dayjs(formData.domain_expiry_date).fromNow()}` : 'No date set'}
                </div>
              </div>
            </div>

            {/* 1. Client Identity */}
            <div className={sectionClasses}>
              <div className="flex items-center gap-2 mb-6 text-slate-400">
                <User size={16} />
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Customer Identity</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className={labelClasses}>
                    WhatsApp Contact <span className="text-rose-400 ml-1 font-black">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-xs tracking-tighter">IN +91</span>
                    <input
                      type="text"
                      name="client_whatsapp"
                      value={formData.client_whatsapp}
                      onChange={handleChange}
                      className={`${inputClasses} pl-16`}
                      placeholder="9876543210"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelClasses}>
                    Domain Access Point <span className="text-rose-400 ml-1 font-black">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="subdomain"
                      value={formData.subdomain}
                      onChange={handleChange}
                      className={`${inputClasses} pr-32`}
                      placeholder="clientname"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">.ciphergate.in</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Domain Asset */}
            <div className={sectionClasses}>
              <div className="flex items-center gap-2 mb-6 text-slate-400">
                <Globe size={16} />
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Primary Domain Asset</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1.5">
                  <label className={labelClasses}>Fully Qualified Domain</label>
                  <input
                    type="text"
                    name="domain_name"
                    value={formData.domain_name}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Asset Registrar</label>
                  <div className="relative">
                    <select
                      name="domain_registrar"
                      value={formData.domain_registrar}
                      onChange={handleChange}
                      className={`${inputClasses} appearance-none cursor-pointer`}
                    >
                      <option value="GoDaddy">GoDaddy</option>
                      <option value="Namecheap">Namecheap</option>
                      <option value="BigRock">BigRock</option>
                      <option value="Hostinger">Hostinger</option>
                      <option value="Other">Other</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Registry Expiry</label>
                  <input
                    type="date"
                    name="domain_expiry_date"
                    value={formData.domain_expiry_date}
                    onChange={handleChange}
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Estimated Renewal (₹)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                    <input
                      type="number"
                      name="domain_cost"
                      value={formData.domain_cost}
                      onChange={handleChange}
                      className={`${inputClasses} pl-8`}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Server / Infrastructure */}
            <div className={sectionClasses}>
              <div className="flex items-center gap-2 mb-6 text-slate-400">
                <Server size={16} />
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Infrastructure Hub</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1.5">
                  <label className={labelClasses}>Cloud Provider</label>
                  <div className="relative">
                    <select
                      name="server_provider"
                      value={formData.server_provider}
                      onChange={handleChange}
                      className={`${inputClasses} appearance-none cursor-pointer`}
                    >
                      <option value="Hostinger">Hostinger</option>
                      <option value="AWS">AWS Cloud</option>
                      <option value="DigitalOcean">DigitalOcean</option>
                      <option value="Google Cloud">Google Cloud</option>
                      <option value="Other">Other</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Deployment Plan</label>
                  <input
                    type="text"
                    name="server_plan"
                    value={formData.server_plan}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="e.g. Premium Shared"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Instance Expiry</label>
                  <input
                    type="date"
                    name="server_expiry_date"
                    value={formData.server_expiry_date}
                    onChange={handleChange}
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClasses}>Renewal Quote (₹)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                    <input
                      type="number"
                      name="server_cost"
                      value={formData.server_cost}
                      onChange={handleChange}
                      className={`${inputClasses} pl-8`}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Administrative Notes */}
            <div className={sectionClasses}>
              <div className="flex items-center gap-2 mb-4 text-slate-400">
                <FileText size={16} />
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Executive Summary / Notes</h3>
              </div>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="4"
                className={`${inputClasses} resize-none min-h-[120px]`}
                placeholder="Include any specific operational details or constraints for this renewal cycle..."
              ></textarea>
            </div>
            
            {/* Context Notification */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <Info size={18} />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Standard operational procedure: Automated notifications are dispatched at regular intervals (15d, 7d, 1d) prior to asset expiration. System date: {dayjs().format('DD MMMM YYYY')}.
              </p>
            </div>

          </form>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center sticky bottom-0 z-10">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="text-sm font-semibold text-slate-400 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-4">
              <button
                form="renewal-form"
                type="submit"
                disabled={loading || !isFormValid}
                className={`
                  flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-300
                  ${isFormValid 
                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 hover:-translate-y-0.5 active:translate-y-0' 
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
                `}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save size={16} />
                    {initialRenewalData ? 'Update Record' : 'Save Details'}
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </AnimatePresence>
  );
};

export default RenewalModal;
