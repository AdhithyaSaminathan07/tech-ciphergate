import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronDown, LogOut, User, Settings, LayoutGrid } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getFullFileUrl } from '../../utils/fileUtils';

const AdminMobileMenu = ({ isOpen, onClose, links, user, onLogout }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);
  const location = useLocation();

  // Close menu when location changes
  useEffect(() => {
    if (isOpen) onClose();
  }, [location.pathname]);

  const filteredLinks = useMemo(() => {
    if (!searchTerm) return links;

    return links.map(link => {
      if (link.label.toLowerCase().includes(searchTerm.toLowerCase())) {
        return link;
      }
      if (link.isDropdown && link.children) {
        const filteredChildren = link.children.filter(child =>
          !child.isSubHeader && child.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredChildren.length > 0) {
          return { ...link, children: filteredChildren };
        }
      }
      return null;
    }).filter(Boolean);
  }, [links, searchTerm]);

  const toggleSection = (label) => {
    setExpandedSection(expandedSection === label ? null : label);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[200] md:hidden"
          />

          {/* Full Height Sidebar Panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 left-0 w-[85%] max-w-[340px] bg-white z-[201] shadow-2xl flex flex-col md:hidden"
          >
            {/* Sidebar Header: Logo & Close */}
            <div className="p-5 flex items-center justify-between border-b border-[#E2ECE5] bg-[#064E3B] text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-sm">
                  <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-none">CipherGate</h2>
                  <p className="text-[10px] font-bold text-emerald-300 tracking-widest mt-1 uppercase">Admin Panel</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* User Profile Summary */}
            {user && (
              <div className="px-5 py-3.5 bg-[#F6F9F7] border-b border-[#E2ECE5]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#087443] border border-[#E2ECE5] flex items-center justify-center text-white font-black text-sm shadow-sm overflow-hidden shrink-0">
                    {user.photo ? (
                      <img
                        src={getFullFileUrl(user.photo)}
                        alt={user.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <span>{(user.name || user.username || 'A').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0F241D] truncate">{user.displayName || user.name || user.username}</p>
                    <p className="text-[11px] font-medium text-[#526A5E] truncate">{user.email || user.role || 'Administrator'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Search Module */}
            <div className="p-3.5 px-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F6F9F7] border border-[#E2ECE5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#087443]/20 focus:border-[#087443] transition-all font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Sidebar Body: Scrollable Modules */}
            <div className="flex-1 overflow-y-auto py-1.5 custom-scrollbar no-scrollbar">
              {filteredLinks.map((link, idx) => {
                if (link.isHeader) {
                  return (
                    <div key={idx} className="px-6 py-2.5 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#526A5E]">
                        {link.label}
                      </span>
                    </div>
                  );
                }

                if (!link.isDropdown) {
                  const isActive = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to || idx}
                      to={link.to}
                      className={`flex items-center gap-3 px-6 py-3 transition-all relative group ${isActive ? 'bg-[#F0FAF4] text-[#087443] font-bold' : 'text-slate-700 hover:bg-[#F6F9F7]'}`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#087443] rounded-r-full" />
                      )}
                      <span className={`text-lg transition-colors ${isActive ? 'text-[#087443]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                        {link.icon}
                      </span>
                      <span className="text-sm">
                        {link.label}
                      </span>
                    </Link>
                  );
                }

                // Accordion Dropdown Section
                const isExpanded = expandedSection === link.label || (searchTerm && link.children?.length > 0);
                const hasActiveChild = link.children?.some(c => location.pathname === c.to);

                return (
                  <div key={link.label || idx} className="mb-0.5">
                    <button
                      onClick={() => toggleSection(link.label)}
                      className={`w-full flex items-center justify-between px-6 py-3 transition-all group ${hasActiveChild || isExpanded ? 'bg-[#F6F9F7] text-[#0F241D] font-bold' : 'text-slate-700 hover:bg-[#F6F9F7]/60'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg transition-colors ${hasActiveChild || isExpanded ? 'text-[#087443]' : 'text-slate-400'}`}>
                          {link.icon}
                        </span>
                        <span className="text-sm">
                          {link.label}
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={16} className={isExpanded ? 'text-[#087443]' : 'text-slate-400'} />
                      </motion.div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-[#F6F9F7]/50"
                        >
                          <div className="py-1">
                            {link.children?.map((child, cIdx) => {
                              if (child.isSubHeader) {
                                return (
                                  <div key={cIdx} className="px-12 py-1.5 mt-1">
                                    <span className="text-[9px] font-bold tracking-wider uppercase text-[#526A5E]">
                                      {child.label}
                                    </span>
                                  </div>
                                );
                              }

                              const isChildActive = location.pathname === child.to;
                              return (
                                <Link
                                  key={child.to || cIdx}
                                  to={child.to}
                                  className={`flex items-center gap-2.5 pl-12 pr-6 py-2.5 transition-all relative ${isChildActive ? 'bg-[#F0FAF4] text-[#087443] font-bold' : 'text-slate-600 hover:text-[#0F241D]'}`}
                                >
                                  {isChildActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#087443] rounded-r-full" />
                                  )}
                                  <span className="text-xs">
                                    {child.label}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Logout Footer */}
            <div className="p-4 border-t border-[#E2ECE5] bg-[#F6F9F7]">
              <button
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-[#E2ECE5] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-700 rounded-xl font-semibold text-xs transition-all shadow-sm"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AdminMobileMenu;
