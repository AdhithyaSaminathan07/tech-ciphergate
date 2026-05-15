import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { 
  Search, 
  Download, 
  Edit3, 
  CheckCircle2, 
  MessageCircle, 
  AlertTriangle, 
  Clock, 
  Calendar,
  Globe,
  Server,
  RefreshCcw,
  Check,
  Info,
  History,
  TrendingDown,
  Timer,
  Plus,
  ArrowUpDown,
  Filter,
  UserCheck,
  Building2,
  Table as TableIcon,
  LayoutGrid
} from 'lucide-react';
import { FaPlus, FaBuilding, FaLayerGroup, FaFilter, FaEdit, FaTrash } from 'react-icons/fa';
import renewalService from '../../services/renewalService';
import RenewalModal from './RenewalModal';
import Button from '../common/Button';
import Table from '../common/Table';
import Spinner from '../common/Spinner';

dayjs.extend(relativeTime);

const RenewalManagement = () => {
  const [renewals, setRenewals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingWAId, setSendingWAId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    expiringSoon: 0,
    expired: 0,
    renewedThisMonth: 0
  });

  const [filters, setFilters] = useState({
    search: '',
    type: 'All Types',
    status: 'All Status',
    startDate: '',
    endDate: ''
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRenewal, setEditingRenewal] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchRenewals();
  }, [filters]);

  const fetchRenewals = async () => {
    try {
      setLoading(true);
      const response = await renewalService.getRenewals(filters);
      if (response.success) {
        setRenewals(response.data);
        calculateStats(response.data);
      }
    } catch (err) {
      console.error('Error fetching renewals:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data) => {
    const total = data.length;
    let expiringSoon = 0;
    let expired = 0;
    let renewedThisMonth = 0;

    const now = dayjs();
    const currentMonth = now.month();
    const currentYear = now.year();

    data.forEach(r => {
      if (r.domain_status === 'EXPIRING_SOON' || r.server_status === 'EXPIRING_SOON') expiringSoon++;
      if (r.domain_status === 'EXPIRED' || r.server_status === 'EXPIRED') expired++;
      
      const domainUpdated = dayjs(r.updatedAt);
      if (r.domain_status === 'RENEWED' && domainUpdated.month() === currentMonth && domainUpdated.year() === currentYear) {
          renewedThisMonth++;
      } else if (r.server_status === 'RENEWED' && domainUpdated.month() === currentMonth && domainUpdated.year() === currentYear) {
          renewedThisMonth++;
      }
    });

    setStats({ total, expiringSoon, expired, renewedThisMonth });
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSendWA = async (id, type) => {
    if (sendingWAId) return;
    try {
      setSendingWAId(id);
      const response = await renewalService.sendWhatsAppManual(id, type);
      if (response.success) {
        toast.success(`WhatsApp notification sent for ${type}`);
        fetchRenewals();
      } else {
        toast.error(response.message || 'Failed to send WhatsApp');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to send WhatsApp');
    } finally {
      setSendingWAId(null);
    }
  };

  const handleRenew = async (renewal, type) => {
    const newExpiry = prompt(`Enter new expiry date for ${type} (YYYY-MM-DD):`);
    if (!newExpiry) return;

    try {
      setProcessingId(renewal._id + type);
      const response = await renewalService.markAsRenewed(renewal._id, type, newExpiry);
      if (response.success) {
        toast.success(`${type} marked as renewed`);
        fetchRenewals();
      }
    } catch (err) {
      toast.error('Failed to update renewal');
    } finally {
      setProcessingId(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Client Name', 'WA Number', 'Domain', 'Domain Expiry', 'Domain Status', 'Server', 'Server Expiry', 'Server Status', 'Created At'];
    const rows = renewals.map(r => [
      `"${r.client_name}"`,
      r.client_whatsapp,
      r.domain_name || '-',
      r.domain_expiry_date ? dayjs(r.domain_expiry_date).format('DD-MM-YYYY') : '-',
      r.domain_status,
      r.server_provider || '-',
      r.server_expiry_date ? dayjs(r.server_expiry_date).format('DD-MM-YYYY') : '-',
      r.server_status,
      dayjs(r.createdAt).format('DD-MM-YYYY HH:mm')
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `renewals_export_${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.info("Renewals exported with creation timeline");
  };

  const getDaysLeft = (date) => {
    if (!date) return null;
    const today = dayjs().startOf('day');
    const expiry = dayjs(date).startOf('day');
    return expiry.diff(today, 'day');
  };

  const renderStatusBadge = (status) => {
    const config = {
      ACTIVE: { 
        bg: 'bg-blue-50', 
        border: 'border-blue-100', 
        text: 'text-blue-700', 
        dot: 'bg-blue-500' 
      },
      EXPIRING_SOON: { 
        bg: 'bg-amber-50', 
        border: 'border-amber-100', 
        text: 'text-amber-700', 
        dot: 'bg-amber-500' 
      },
      EXPIRED: { 
        bg: 'bg-rose-50', 
        border: 'border-rose-100', 
        text: 'text-rose-700', 
        dot: 'bg-rose-500' 
      },
      RENEWED: { 
        bg: 'bg-emerald-50', 
        border: 'border-emerald-100', 
        text: 'text-emerald-700', 
        dot: 'bg-emerald-500' 
      }
    };
    
    const s = config[status] || { bg: 'bg-gray-50', border: 'border-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${s.bg} ${s.border} ${s.text} shadow-sm transition-all`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>
        {status.replace('_', ' ')}
      </span>
    );
  };

  // Table columns configuration matching WorkerManagement style
  const columns = [
    {
      header: 'Client & Subdomain',
      accessor: 'client_name',
      width: '300px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] flex items-center justify-center text-[#0d9488] font-bold text-xs uppercase shadow-sm">
            {record.client_name.substring(0, 2)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 tracking-tight">{record.client_name}</span>
            <span className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
              <Globe size={10} className="text-[#0d9488]" /> {record.subdomain || 'no-subdomain'}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Domain Details',
      accessor: 'domain_name',
      width: '250px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => record.domain_name ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{record.domain_name}</span>
            {renderStatusBadge(record.domain_status)}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded uppercase">{record.domain_registrar}</span>
            <span className="flex items-center gap-1"><Calendar size={10} /> {dayjs(record.domain_expiry_date).format('DD/MM/YY')}</span>
          </div>
        </div>
      ) : <span className="text-gray-300 italic text-xs">No domain</span>
    },
    {
      header: 'Server Details',
      accessor: 'server_provider',
      width: '220px',
      headerAlign: 'text-left',
      align: 'text-left',
      render: (record) => record.server_provider ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{record.server_provider}</span>
            {renderStatusBadge(record.server_status)}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded uppercase">{record.server_plan}</span>
            <span className="flex items-center gap-1"><Timer size={10} /> {getDaysLeft(record.server_expiry_date)}d</span>
          </div>
        </div>
      ) : <span className="text-gray-300 italic text-xs">No server</span>
    },
    {
      header: 'Days Left',
      accessor: 'domain_expiry_date',
      width: '120px',
      headerAlign: 'text-center',
      align: 'text-center',
      render: (record) => {
        const days = getDaysLeft(record.domain_expiry_date);
        const isCritical = days !== null && days <= 5;
        return days !== null ? (
          <div className="flex flex-col items-center">
            <span className={`text-lg font-bold tracking-tight ${isCritical ? 'text-red-500' : 'text-gray-900'}`}>{days}</span>
            <span className={`text-[9px] uppercase font-bold tracking-widest ${isCritical ? 'text-red-400' : 'text-gray-400'}`}>
              {isCritical ? 'CRITICAL' : 'DAYS'}
            </span>
          </div>
        ) : <span className="text-gray-300">-</span>;
      }
    },
    {
      header: 'Actions',
      accessor: 'actions',
      width: '180px',
      headerAlign: 'text-right',
      align: 'text-right',
      render: (record) => (
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={() => { setEditingRenewal(record); setIsModalOpen(true); }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Edit Details"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => handleRenew(record, record.domain_name ? 'DOMAIN' : 'SERVER')}
            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
            title="Quick Renewal"
            disabled={processingId === (record._id + (record.domain_name ? 'DOMAIN' : 'SERVER'))}
          >
            {processingId === (record._id + (record.domain_name ? 'DOMAIN' : 'SERVER')) ? (
              <Spinner size="xs" />
            ) : <CheckCircle2 size={16} />}
          </button>
          <button
            onClick={() => handleSendWA(record._id, record.domain_name ? 'DOMAIN' : 'SERVER')}
            className="p-2 text-[#25D366] hover:bg-green-50 rounded-full transition-colors"
            title="Send WhatsApp Alert"
            disabled={sendingWAId === record._id}
          >
            {sendingWAId === record._id ? (
              <Spinner size="xs" />
            ) : <MessageCircle size={16} />}
          </button>
        </div>
      ),
    },
  ];

  // Mobile Card Component
  const RenewalCard = ({ record }) => {
    const days = getDaysLeft(record.domain_expiry_date);
    const isCritical = days !== null && days <= 5;
    
    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-4"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#f0fdfa] border border-[#ccfbf1] flex items-center justify-center text-[#0d9488] font-bold text-lg uppercase shadow-sm">
              {record.client_name.substring(0, 2)}
            </div>
            <div>
              <h3 className="font-bold text-gray-900 leading-tight">{record.client_name}</h3>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <Globe size={10} /> {record.subdomain || 'no-subdomain'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className={`text-xl font-black ${isCritical ? 'text-red-500' : 'text-gray-900'}`}>{days || '-'}</span>
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-widest">Days Left</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Domain</p>
            <div className="text-xs font-bold text-gray-700 truncate">{record.domain_name || 'N/A'}</div>
            {record.domain_status && <div className="mt-1">{renderStatusBadge(record.domain_status)}</div>}
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Server</p>
            <div className="text-xs font-bold text-gray-700 truncate">{record.server_provider || 'N/A'}</div>
            {record.server_status && <div className="mt-1">{renderStatusBadge(record.server_status)}</div>}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-100 gap-3">
          <button 
            onClick={() => { setEditingRenewal(record); setIsModalOpen(true); }}
            className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
          >
            <Edit3 size={12} /> Edit Detail
          </button>
          <div className="flex gap-2">
            <button 
              onClick={() => handleRenew(record, record.domain_name ? 'DOMAIN' : 'SERVER')}
              className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <CheckCircle2 size={16} />
            </button>
            <button 
              onClick={() => handleSendWA(record._id, record.domain_name ? 'DOMAIN' : 'SERVER')}
              className="p-2 bg-[#25D366]/10 text-[#25D366] rounded-xl hover:bg-[#25D366]/20 transition-colors"
            >
              <MessageCircle size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Renewal Management</h1>
          <p className="text-gray-500 mt-1">Monitor and manage your service timelines efficiently.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={exportCSV} className="flex items-center shadow-sm">
            <Download className="mr-2" size={16} /> Export CSV
          </Button>
          <Button variant="primary" onClick={() => { setEditingRenewal(null); setIsModalOpen(true); }} className="flex items-center shadow-md !bg-[#0d9488] !border-[#0d9488]">
            <FaPlus className="mr-2" /> Add Renewal
          </Button>
        </div>
      </div>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Assets', value: stats.total, icon: Globe, iconColor: 'text-slate-400' },
          { label: 'Expiring Soon', value: stats.expiringSoon, icon: Clock, iconColor: 'text-amber-500' },
          { label: 'Expired', value: stats.expired, icon: AlertTriangle, iconColor: stats.expired > 0 ? 'text-rose-500' : 'text-slate-400', critical: stats.expired > 0 },
          { label: 'Renewed (MTD)', value: stats.renewedThisMonth, icon: RefreshCcw, iconColor: 'text-emerald-500' },
        ].map((stat, idx) => (
          <div 
            key={idx}
            className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-xl bg-slate-50 ${stat.iconColor}`}>
                <stat.icon size={22} />
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Advanced Control Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Box */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              name="search"
              placeholder="Search client, domain..."
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent transition-all"
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LayoutGrid className="h-4 w-4 text-gray-400" />
            </div>
            <select
              name="type"
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9488] transition-all appearance-none"
              value={filters.type}
              onChange={handleFilterChange}
            >
              <option>All Types</option>
              <option>Domain Only</option>
              <option>Server Only</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <FaFilter className="h-3 w-3 text-gray-400" />
            </div>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CheckCircle2 className="h-4 w-4 text-gray-400" />
            </div>
            <select
              name="status"
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9488] transition-all appearance-none"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Expiring Soon</option>
              <option>Expired</option>
              <option>Renewed</option>
            </select>
          </div>

          {/* Reset Action */}
          <div className="flex items-center">
            <button 
              onClick={() => setFilters({search: '', type: 'All Types', status: 'All Status', startDate: '', endDate: ''})} 
              className="w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold text-xs uppercase tracking-widest rounded-xl transition-all border border-gray-200"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-200 shadow-sm"
            >
              <Spinner size="xl" />
              <p className="mt-4 text-gray-500 animate-pulse font-medium">Fetching renewal records...</p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {isMobile ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renewals.map(record => (
                    <RenewalCard key={record._id} record={record} />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <Table
                    columns={columns}
                    data={renewals}
                    striped={false}
                    hover={true}
                  />
                </div>
              )}

              {/* Empty State */}
              {!loading && renewals.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-200 shadow-sm text-center px-4">
                  <div className="bg-gray-50 p-4 rounded-full mb-4">
                    <TableIcon className="h-10 w-10 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">No renewals found</h3>
                  <p className="text-gray-500 max-w-xs mt-1">We couldn't find any renewal records matching your search criteria.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isModalOpen && (
        <RenewalModal 
          isOpen={isModalOpen} 
          onClose={(success) => { setIsModalOpen(false); setEditingRenewal(null); if (success) fetchRenewals(); }}
          invoiceId={editingRenewal?.invoice_id?._id}
          displayInvoiceNo={editingRenewal?.invoice_id?.invoiceNo}
          clientName={editingRenewal?.client_name}
          initialRenewalData={editingRenewal}
        />
      )}
    </div>
  );
};

export default RenewalManagement;
