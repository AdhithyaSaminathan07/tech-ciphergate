import { useContext, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import ShatteredLogo from '../common/ShatteredLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { getFullFileUrl } from '../../utils/fileUtils';

const Sidebar = ({ links, logoText = 'Task Tracker', user, onLogout, mobileOpen, setMobileOpen, isAdmin = false }) => {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = mobileOpen !== undefined ? mobileOpen : isOpenInternal;
  const setIsOpen = setMobileOpen !== undefined ? setMobileOpen : setIsOpenInternal;
  
  const [expandedDropdowns, setExpandedDropdowns] = useState({});
  const [expandedSubHeaders, setExpandedSubHeaders] = useState({});
  const [avatarError, setAvatarError] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photo]);

  useEffect(() => {
    const newExpanded = {};
    links.forEach((link, index) => {
      if (link.isDropdown && link.children) {
        if (link.children.some(child => location.pathname === child.to)) {
          newExpanded[`dropdown-${index}`] = true;
        }
      }
    });
    setExpandedDropdowns(newExpanded);
  }, [location.pathname, links]);

  const toggleDropdown = key => {
    setExpandedDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      {/* Mobile Menu Toggle - Only show if not controlled externally */}
      {mobileOpen === undefined && !isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-[#064E3B] shadow-md border border-[#043B2C] text-white hover:bg-[#075A3B] transition-all"
        >
          <FiMenu size={20} />
        </button>
      )}

      {/* Backdrop for Mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[400] md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Reference-Inspired Forest Green Sidebar */}
      <aside
        onMouseLeave={() => setExpandedDropdowns({})}
        className={`group/sidebar z-[500] bg-[#064E3B] text-white shadow-[4px_0_24px_rgba(0,0,0,0.06)] border-r border-[#043B2C] transition-all duration-[300ms] ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col overflow-hidden md:overflow-visible flex-shrink-0 fixed inset-y-0 left-0 md:sticky md:top-0 md:h-screen ${
          isOpen ? 'translate-x-0 w-[270px] shadow-2xl' : '-translate-x-full md:translate-x-0 md:w-[72px] hover:md:w-[264px]'
        } md:flex`}
      >
        {/* Inner Wrapper */}
        <div className="w-full h-full flex flex-col pt-5">
          
          {/* Logo Section */}
          <div className="relative flex items-center px-4.5 flex-shrink-0 mb-6 pt-1">
            <Link 
              to={isAdmin ? "/admin" : "/worker"} 
              onClick={() => { if (window.innerWidth < 768) setIsOpen(false); }}
              className="flex items-center gap-3 w-full px-2"
            >
              <div className="w-[36px] h-[34px] flex-shrink-0 flex items-center justify-center rounded-lg bg-white/10 p-1 border border-white/15 shadow-sm">
                <ShatteredLogo
                  src="/logo.png"
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className={`flex flex-col justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap ${
                isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'
              }`}>
                <h1 className="text-white font-bold text-[14px] tracking-tight leading-none">
                  {logoText}
                </h1>
                <span className="text-emerald-300 text-[9px] font-bold tracking-[0.18em] mt-1 uppercase">
                  CipherGate
                </span>
              </div>
            </Link>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scroll space-y-1 px-3 pb-6">
            {links.map((link, index) => {
              if (link.isHeader) {
                return (
                  <div
                    key={`header-${index}`}
                    className={`pt-5 pb-1.5 px-3 transition-opacity duration-[200ms] whitespace-nowrap ${
                      isOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
                    }`}
                  >
                    <p className="text-[10px] font-bold text-emerald-300/60 uppercase tracking-[0.18em]">
                      {link.label}
                    </p>
                  </div>
                );
              }

              if (!link.isDropdown) {
                const isActive = location.pathname === link.to;
                return (
                  <div key={link.to} className="relative group/link">
                    <Link
                      to={link.to}
                      onClick={() => { if (window.innerWidth < 768) setIsOpen(false); }}
                      className={`relative flex items-center h-[42px] rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-[#C9F5D9] text-[#064E3B] font-bold shadow-sm'
                          : 'text-emerald-100/80 hover:text-white hover:bg-white/10 font-medium'
                      }`}
                    >
                      <div className="flex items-center w-full">
                        <div className="w-[48px] flex-shrink-0 flex items-center justify-center">
                          <span
                            className={`text-[17px] transition-colors duration-200 ${
                              isActive ? 'text-[#064E3B]' : 'text-emerald-300/80 group-hover/link:text-white'
                            }`}
                          >
                            {link.icon}
                          </span>
                        </div>

                        <div className={`flex-1 flex items-center justify-between transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pr-3 ${
                          isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'
                        }`}>
                          <span className="text-[13.5px] tracking-tight">
                            {link.label}
                          </span>
                          
                          {link.badge && (
                            <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 ${
                              isActive
                                ? 'bg-[#064E3B] text-white'
                                : 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50'
                            }`}>
                              {link.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Desktop Tooltip for collapsed state */}
                    <div className="hidden md:block absolute left-[64px] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-md opacity-0 pointer-events-none group-hover/link:opacity-100 group-hover/sidebar:!opacity-0 translate-x-[-8px] group-hover/link:translate-x-0 transition-all duration-200 whitespace-nowrap z-50 shadow-xl border border-slate-700">
                      {link.label}
                    </div>
                  </div>
                );
              }

              // Dropdown parent
              const key = `dropdown-${index}`;
              const isExpanded = !!expandedDropdowns[key];
              const isChildActive = children => children?.some(c => location.pathname === c.to);
              const hasActive = isChildActive(link.children);

              return (
                <div key={key} className="space-y-1 relative group/link">
                  <button
                    onClick={() => toggleDropdown(key)}
                    className={`relative flex items-center w-full h-[42px] rounded-lg transition-all duration-200 ${
                      hasActive
                        ? 'bg-white/15 text-white font-bold'
                        : isExpanded
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-emerald-100/80 hover:text-white hover:bg-white/10 font-medium'
                    }`}
                  >
                    <div className="flex items-center w-full">
                      <div className="w-[48px] flex-shrink-0 flex items-center justify-center">
                        <span
                          className={`text-[17px] transition-colors duration-200 ${
                            hasActive || isExpanded ? 'text-emerald-200' : 'text-emerald-300/80 group-hover/link:text-white'
                          }`}
                        >
                          {link.icon}
                        </span>
                      </div>

                      <div className={`flex-1 flex items-center justify-between transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pr-3 ${
                        isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'
                      }`}>
                        <span className="text-[13.5px] tracking-tight">
                          {link.label}
                        </span>
                        
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-emerald-300/80"
                        >
                          <FaChevronDown size={9} />
                        </motion.span>
                      </div>
                    </div>
                  </button>

                  {/* Desktop Tooltip for collapsed state */}
                  <div className="hidden md:block absolute left-[64px] top-2 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-md opacity-0 pointer-events-none group-hover/link:opacity-100 group-hover/sidebar:!opacity-0 translate-x-[-8px] group-hover/link:translate-x-0 transition-all duration-200 whitespace-nowrap z-50 shadow-xl border border-slate-700">
                    {link.label}
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-[24px] pl-2.5 border-l border-emerald-700/60 space-y-1 mt-1 mb-1.5">
                          {(() => {
                            const sections = [];
                            let currentSection = null;

                            link.children?.forEach(child => {
                              if (child.isSubHeader) {
                                currentSection = {
                                  header: child,
                                  items: []
                                };
                                sections.push(currentSection);
                              } else {
                                if (!currentSection) {
                                  currentSection = {
                                    header: null,
                                    items: []
                                  };
                                  sections.push(currentSection);
                                }
                                currentSection.items.push(child);
                              }
                            });

                            return sections.map((sec, secIdx) => {
                              const headerKey = `${link.label}-${sec.header?.label || 'default'}-${secIdx}`;
                              const hasActiveChild = sec.items.some(c => location.pathname === c.to);
                              const isSecExpanded = expandedSubHeaders[headerKey] !== undefined
                                ? expandedSubHeaders[headerKey]
                                : hasActiveChild;

                              const toggleSec = (e) => {
                                e.stopPropagation();
                                setExpandedSubHeaders(prev => ({
                                  ...prev,
                                  [headerKey]: !isSecExpanded
                                }));
                              };

                              return (
                                <div key={headerKey} className="space-y-1">
                                  {sec.header && (
                                    <button
                                      type="button"
                                      onClick={toggleSec}
                                      className="flex items-center justify-between w-full pt-2 pb-1 pl-2 pr-2 hover:bg-white/10 rounded-md text-left transition-colors select-none"
                                    >
                                      <span className="text-[9px] font-bold text-emerald-300/70 uppercase tracking-[0.12em]">
                                        {sec.header.label}
                                      </span>
                                      <span className="text-emerald-300/70">
                                        {isSecExpanded ? <FaChevronDown size={7} /> : <FaChevronRight size={7} />}
                                      </span>
                                    </button>
                                  )}
                                  <AnimatePresence initial={false}>
                                    {(!sec.header || isSecExpanded) && (
                                      <motion.div
                                        initial={sec.header ? { height: 0, opacity: 0 } : false}
                                        animate={sec.header ? { height: 'auto', opacity: 1 } : false}
                                        exit={sec.header ? { height: 0, opacity: 0 } : false}
                                        transition={{ duration: 0.15 }}
                                        className="space-y-1 overflow-hidden"
                                      >
                                        {sec.items.map((child) => {
                                          const active = location.pathname === child.to;
                                          return (
                                            <Link
                                              key={child.to}
                                              to={child.to}
                                              onClick={() => {
                                                if (window.innerWidth < 768) setIsOpen(false);
                                              }}
                                              className={`flex items-center justify-between w-full h-[34px] rounded-md transition-all duration-150 px-2.5 ${
                                                active
                                                  ? 'bg-[#C9F5D9] text-[#064E3B] font-bold shadow-sm'
                                                  : 'text-emerald-100/75 hover:text-white hover:bg-white/10 font-medium'
                                              }`}
                                            >
                                              <span className="text-[12.5px] tracking-tight">
                                                {child.label}
                                              </span>
                                            </Link>
                                          );
                                        })}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* User Profile Footer */}
          <div className="mt-auto px-3.5 pb-5 pt-3 border-t border-[#043B2C] bg-[#05442A]">
            {user && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-[30px] h-[30px] flex-shrink-0 rounded-lg overflow-hidden relative border border-emerald-400/40 bg-[#087443] flex items-center justify-center">
                    {user.photo && !avatarError ? (
                      <img
                        className="w-full h-full object-cover"
                        src={getFullFileUrl(user.photo)}
                        alt={user.name || 'User'}
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span className="text-white font-black text-xs uppercase select-none">
                        {(user.displayName || user.name || user.username || 'A').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className={`ml-2.5 flex-1 min-w-0 transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pt-0.5 ${
                    isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'
                  }`}>
                    <p className="text-[12.5px] font-bold text-white truncate tracking-tight">
                      {user.displayName || user.name || user.username}
                    </p>
                    <p className="text-[9px] text-emerald-300 font-bold tracking-wider mt-0.5 uppercase">
                      {user.role || 'Admin'}
                    </p>
                  </div>
                </div>
                
                <div className={`transition-all duration-[200ms] ${
                  isOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
                }`}>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onLogout();
                    }}
                    className="w-[30px] h-[30px] flex items-center justify-center rounded-lg hover:bg-rose-500/20 text-emerald-200 hover:text-rose-300 transition-all"
                    title="Logout"
                  >
                    <FiLogOut size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <style>{`
        .custom-sidebar-scroll::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
      `}</style>
    </>
  );
};

export default Sidebar;
