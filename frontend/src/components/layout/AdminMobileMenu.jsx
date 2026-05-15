import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronDown, LogOut, User, Settings, LayoutGrid } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

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
            <div className="p-6 flex items-center justify-between border-b border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex items-center justify-center shadow-lg shadow-teal-100">
                  <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain brightness-0 invert" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 leading-none">CipherGate</h2>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mt-1">Admin Panel</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 active:scale-95 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* User Profile Summary (Optional but Professional) */}
            {user && (
              <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-teal-600 font-black text-sm shadow-sm overflow-hidden">
                    {user.photo ? (
                      <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{user.name?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{user.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Search Module */}
            <div className="p-4 px-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-xl text-sm focus:ring-2 focus:ring-teal-500 transition-all font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Sidebar Body: Scrollable Modules */}
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar no-scrollbar">
              {filteredLinks.map((link, idx) => {
                if (link.isHeader) {
                  return (
                    <div key={idx} className="px-8 py-3 mt-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400/80">
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
                      className={`flex items-center gap-3 px-8 py-3.5 transition-all relative group ${isActive ? 'text-[#0d9488]' : 'text-slate-600 active:bg-slate-50'
                        }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute left-0 top-0 bottom-0 w-1 bg-[#0d9488] rounded-r-full"
                        />
                      )}
                      <span className={`text-xl transition-colors ${isActive ? 'text-[#0d9488]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                        {link.icon}
                      </span>
                      <span className={`text-[15px] transition-all ${isActive ? 'font-bold translate-x-1' : 'font-semibold'}`}>
                        {link.label}
                      </span>
                    </Link>
                  );
                }

                // Accordion Dropdown Section
                const isExpanded = expandedSection === link.label || (searchTerm && link.children?.length > 0);
                const hasActiveChild = link.children?.some(c => location.pathname === c.to);

                return (
                  <div key={link.label || idx} className="mb-1">
                    <button
                      onClick={() => toggleSection(link.label)}
                      className={`w-full flex items-center justify-between px-8 py-3.5 transition-all group ${hasActiveChild || isExpanded ? 'text-slate-900' : 'text-slate-600 hover:bg-slate-50/50'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xl transition-colors ${hasActiveChild || isExpanded ? 'text-[#0d9488]' : 'text-slate-400'}`}>
                          {link.icon}
                        </span>
                        <span className={`text-[15px] ${hasActiveChild || isExpanded ? 'font-bold' : 'font-semibold'}`}>
                          {link.label}
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={16} className={isExpanded ? 'text-[#0d9488]' : 'text-slate-300'} />
                      </motion.div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-slate-50/30"
                        >
                          <div className="py-1">
                            {link.children?.map((child, cIdx) => {
                              if (child.isSubHeader) {
                                return (
                                  <div key={cIdx} className="px-16 py-2 mt-2 opacity-40">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
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
                                  className={`flex items-center gap-3 pl-16 pr-8 py-3 transition-all relative ${isChildActive ? 'text-[#0d9488]' : 'text-slate-500 hover:text-slate-800 active:text-[#0d9488]'
                                    }`}
                                >
                                  {isChildActive && (
                                    <div className="absolute left-[34px] top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[#0d9488]" />
                                  )}
                                  <span className={`text-[14px] ${isChildActive ? 'font-bold' : 'font-medium'}`}>
                                    {child.label}
                                  </span>
                                  {child.badge && (
                                    <span className="ml-auto bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                                      {child.badge}
                                    </span>
                                  )}
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

            {/* Sidebar Footer: Logout */}
            <div className="p-6 border-t border-slate-50 bg-white">
              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-rose-50 text-rose-600 font-black text-sm hover:bg-rose-100 active:scale-[0.98] transition-all shadow-sm"
              >
                <LogOut size={18} />
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
