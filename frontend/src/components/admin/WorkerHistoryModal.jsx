import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, Calendar, User, Clock, 
  ArrowRight, History, UserPlus, UserMinus, 
  UserX, RefreshCcw, FileText, CheckCircle2, 
  AlertCircle, X, ChevronRight, RotateCcw
} from 'lucide-react';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import api from '../../services/api';

const WorkerHistoryModal = ({ isOpen, onClose, onRestore }) => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let url = '/workers/history';
      const res = await api.get(url);
      setHistory(res.data);
    } catch (error) {
      toast.error('Failed to load employee history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const handleRestore = async (historyRecord) => {
    try {
      await api.put(`/workers/${historyRecord.employee._id}`, { status: 'Active' });
      const actionText = historyRecord.employee.status === 'Deleted' ? 'restored' : 'retrieved';
      toast.success(`Employee ${actionText} successfully`);
      fetchHistory();
      if (onRestore) onRestore();
    } catch (error) {
      const actionText = historyRecord.employee?.status === 'Deleted' ? 'restore' : 'retrieve';
      toast.error(`Failed to ${actionText} employee`);
    }
  };

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const actionMatch = filterAction === 'all' || item.actionType === filterAction;
      const searchLower = searchQuery.toLowerCase();
      const employeeName = item.employee?.name?.toLowerCase() || '';
      const performerName = item.performedBy?.name?.toLowerCase() || '';
      const performerEmail = item.performedBy?.email?.toLowerCase() || '';
      
      const searchMatch = !searchQuery || 
        employeeName.includes(searchLower) || 
        performerName.includes(searchLower) || 
        performerEmail.includes(searchLower);

      return actionMatch && searchMatch;
    });
  }, [history, filterAction, searchQuery]);

  const getActionIcon = (type) => {
    switch (type) {
      case 'Created': return <UserPlus className="text-emerald-500" size={18} />;
      case 'Updated': return <FileText className="text-blue-500" size={18} />;
      case 'Deleted': return <UserX className="text-rose-500" size={18} />;
      case 'Restored': return <RefreshCcw className="text-purple-500" size={18} />;
      case 'Relieved': return <UserMinus className="text-orange-500" size={18} />;
      default: return <Clock className="text-slate-400" size={18} />;
    }
  };

  const getActionColor = (type) => {
    switch (type) {
      case 'Created': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Updated': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Deleted': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'Restored': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Relieved': return 'bg-orange-50 text-orange-700 border-orange-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All Activity', icon: <History size={14} /> },
    { id: 'Created', label: 'Additions', icon: <UserPlus size={14} /> },
    { id: 'Updated', label: 'Updates', icon: <FileText size={14} /> },
    { id: 'Deleted', label: 'Deletions', icon: <UserX size={14} /> },
    { id: 'Relieved', label: 'Relieved', icon: <UserMinus size={14} /> },
  ];

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Audit Trail & Employee History" 
      size="2xl"
      className="!p-0 overflow-hidden"
    >
      <div className="flex flex-col h-[85vh] max-h-[800px] bg-slate-50/30">
        {/* Search and Filters Header */}
        <div className="p-6 bg-white border-b border-slate-100 shadow-sm z-10">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search by employee name or administrator..."
                className="w-full pl-11 pr-4 py-3 bg-slate-100/50 border border-transparent focus:border-teal-500/30 focus:bg-white rounded-2xl text-sm font-medium transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {filterTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterAction(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    filterAction === tab.id 
                      ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/20' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-200 hover:text-teal-600'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Spinner size="lg" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sequencing history data...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                <History className="text-slate-300" size={32} />
              </div>
              <h3 className="text-slate-900 font-black text-lg">No records found</h3>
              <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((item, idx) => {
                const isCurrentState = item.actionType === item.employee?.status;
                const showRestore = item.employee && isCurrentState && (item.employee.status === 'Deleted' || item.employee.status === 'Relieved');
                
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    key={item._id}
                    className="group bg-white p-4 rounded-2xl border border-slate-100 hover:border-teal-100 hover:shadow-xl hover:shadow-teal-900/[0.02] transition-all relative overflow-hidden"
                  >
                    {/* Background accent */}
                    <div className={`absolute top-0 left-0 w-1 h-full ${
                      item.actionType === 'Deleted' ? 'bg-rose-500' : 
                      item.actionType === 'Created' ? 'bg-emerald-500' : 
                      item.actionType === 'Relieved' ? 'bg-orange-500' : 'bg-blue-500'
                    } opacity-0 group-hover:opacity-100 transition-opacity`} />

                    <div className="flex items-start gap-4">
                      {/* Left: Action Icon */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${getActionColor(item.actionType)}`}>
                        {getActionIcon(item.actionType)}
                      </div>

                      {/* Middle: Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-black text-slate-900 truncate">
                              {item.employee ? item.employee.name : 'Unknown Employee'}
                            </span>
                            {item.employee?.status === 'Deleted' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-wider border border-rose-100">Deleted</span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg">
                            <Clock size={10} />
                            {new Date(item.createdAt).toLocaleDateString()} • {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest ${getActionColor(item.actionType)}`}>
                            {item.actionType}
                          </span>
                          <span className="text-slate-300">•</span>
                          <div className="flex items-center gap-1.5 truncate">
                            <User size={12} className="text-slate-400" />
                            <span>Action by: <span className="text-slate-700 font-bold">{item.performedBy ? item.performedBy.name || item.performedBy.email : 'System'}</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Action Button */}
                      {showRestore && (
                        <div className="flex flex-col gap-2 justify-center">
                          <button
                            onClick={() => handleRestore(item)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-black shadow-lg shadow-teal-600/20 active:scale-95 transition-all group/btn"
                          >
                            <RotateCcw size={14} className="group-hover/btn:rotate-[-45deg] transition-transform" />
                            {item.employee.status === 'Deleted' ? 'Restore Account' : 'Reactive Member'}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center px-8">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Secure Audit Trail v2.0</p>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Real-time Activity Sync</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default WorkerHistoryModal;
