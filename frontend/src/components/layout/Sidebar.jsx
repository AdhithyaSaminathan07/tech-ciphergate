import { useContext, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaChevronDown, FaRegQuestionCircle } from 'react-icons/fa';
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import appContext from '../../context/AppContext';
import ShatteredLogo from '../common/ShatteredLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { getFullFileUrl } from '../../utils/fileUtils';

const Sidebar = ({ links, logoText = 'Task Tracker', user, onLogout, mobileOpen, setMobileOpen, isAdmin = false }) => {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = mobileOpen !== undefined ? mobileOpen : isOpenInternal;
  const setIsOpen = setMobileOpen !== undefined ? setMobileOpen : setIsOpenInternal;
  
  const [expandedDropdowns, setExpandedDropdowns] = useState({});
  const location = useLocation();

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

  const isChildActive = children => children?.some(c => location.pathname === c.to);

  return (
    <>
      {/* Mobile Menu Toggle - Only show if not controlled externally */}
      {mobileOpen === undefined && !isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 text-slate-700 hover:text-slate-900 transition-all"
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
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[400] md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Premium White Layout-Attached Sidebar */}
      <aside
        onMouseLeave={() => setExpandedDropdowns({})}
        className={`
          group/sidebar z-[500]
          bg-white text-slate-900
          shadow-[4px_0_24px_rgba(0,0,0,0.02)] border-r border-slate-100
          transition-all duration-[300ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          flex flex-col overflow-hidden md:overflow-visible flex-shrink-0
          fixed inset-y-0 left-0 md:sticky md:top-0 md:h-screen
          ${isOpen ? 'translate-x-0 w-[280px] shadow-2xl' : '-translate-x-full md:translate-x-0 md:w-[72px] hover:md:w-[240px]'}
          md:flex
        `}
      >
        {/* Inner Wrapper maintains 240px so text doesn't wrap during width transition */}
        <div className="w-full h-full flex flex-col pt-6">
          
          <div className="relative flex items-center px-5 flex-shrink-0 mb-8 pt-2">
            <Link 
              to={isAdmin ? "/admin" : "/worker"} 
              onClick={() => { if (window.innerWidth < 768) setIsOpen(false); }}
              className="flex items-center gap-3 w-full"
            >
              <div className="w-[36px] h-[32px] flex-shrink-0 flex items-center justify-center  rounded-lg">
                <ShatteredLogo
                  src="/logo.png"
                  alt="Logo"
                  className="w-[90px] h-[85px] object-contain"
                />
              </div>
              <div className={`flex flex-col justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'}`}>
                <h1 className="text-slate-900 font-bold text-[14px] tracking-tight leading-none uppercase">
                  {logoText}
                </h1>
                <span className="text-teal-600 text-[8px] font-black tracking-[0.2em] uppercase mt-1">Enterprise</span>
              </div>
            </Link>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scroll space-y-1 px-3 pb-6">
            {links.map((link, index) => {
              if (link.isHeader) {
                return (
                  <div key={`header-${index}`} className={`pt-6 pb-2 px-4 transition-opacity duration-[200ms] whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{link.label}</p>
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
                      className={`relative flex items-center h-[46px] rounded-lg transition-all duration-200 ${isActive ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'}`}
                    >
                      <div className="flex items-center w-full">
                        <div className="w-[48px] flex-shrink-0 flex items-center justify-center">
                          <span className={`text-[18px] transition-colors duration-200 ${isActive ? 'text-emerald-700' : 'text-slate-400 group-hover/link:text-slate-900'}`}>
                            {link.icon}
                          </span>
                        </div>

                        <div className={`flex-1 flex items-center justify-between transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pr-4 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'}`}>
                          <span className={`text-[14.5px] tracking-tight ${isActive ? 'font-bold' : 'font-semibold'}`}>
                            {link.label}
                          </span>
                          
                          {link.badge && (
                            <div className="flex items-center gap-1.5">
                              {link.label === 'Schedules' && (
                                <span className="w-[18px] h-[18px] flex items-center justify-center rounded-full border border-slate-200 text-slate-400 text-[12px] font-bold bg-white shadow-sm">+</span>
                              )}
                              <span className={`text-[11px] font-bold rounded-md px-2 py-0.5 ${link.label === 'Posts' ? 'bg-emerald-100 text-emerald-800' : link.label === 'Schedules' ? 'bg-orange-100 text-orange-800' : 'bg-slate-200 text-slate-700'}`}>
                                {link.badge}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Desktop Tooltip */}
                    <div className="hidden md:block absolute left-[64px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-lg opacity-0 pointer-events-none group-hover/link:opacity-100 group-hover/sidebar:!opacity-0 translate-x-[-10px] group-hover/link:translate-x-0 transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                      {link.label}
                    </div>
                  </div>
                );
              }

              // Dropdown
              const key = `dropdown-${index}`;
              const isExpanded = !!expandedDropdowns[key];
              const isChildActive = children => children?.some(c => location.pathname === c.to);
              const hasActive = isChildActive(link.children);

              return (
                <div key={key} className="space-y-1 relative group/link">
                  <button
                    onClick={() => toggleDropdown(key)}
                    className={`relative flex items-center w-full h-[46px] rounded-lg transition-all duration-200 ${isExpanded || hasActive ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'}`}
                  >
                    <div className="flex items-center w-full">
                      <div className="w-[48px] flex-shrink-0 flex items-center justify-center">
                        <span className={`text-[18px] transition-colors duration-200 ${isExpanded || hasActive ? 'text-emerald-700' : 'text-slate-400 group-hover/link:text-slate-900'}`}>
                          {link.icon}
                        </span>
                      </div>

                      <div className={`flex-1 flex items-center justify-between transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pr-4 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'}`}>
                        <span className={`text-[14.5px] tracking-tight ${hasActive || isExpanded ? 'font-bold' : 'font-semibold'}`}>
                          {link.label}
                        </span>
                        
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className={`${isExpanded || hasActive ? 'text-emerald-700' : 'text-slate-400'}`}
                        >
                          <FaChevronDown size={10} />
                        </motion.span>
                      </div>
                    </div>
                  </button>

                  {/* Desktop Tooltip */}
                  <div className="hidden md:block absolute left-[64px] top-2 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-lg opacity-0 pointer-events-none group-hover/link:opacity-100 group-hover/sidebar:!opacity-0 translate-x-[-10px] group-hover/link:translate-x-0 transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
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
                        <div className="ml-[28px] pl-4 border-l border-slate-200 space-y-1 mt-1 mb-2">
                          {link.children?.map((child, idx) => {
                            if (child.isSubHeader) {
                              return (
                                <div key={`subheader-${idx}`} className="pt-3 pb-1 pl-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">{child.label}</span>
                                </div>
                              );
                            }

                            const active = location.pathname === child.to;
                            return (
                              <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => {
                                  if (window.innerWidth < 768) setIsOpen(false);
                                }}
                                className={`flex items-center justify-between w-full h-[40px] rounded-lg transition-all duration-200 px-3 ${active ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'}`}
                              >
                                <span className={`text-[13px] tracking-tight ${active ? 'font-bold' : 'font-medium'}`}>
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
          </nav>

          {/* User Profile Footer */}
          <div className="mt-auto px-4 pb-6 pt-4 border-t border-slate-100">
            {user && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-[32px] h-[32px] flex-shrink-0 rounded-lg overflow-hidden relative border border-slate-100">
                    <img
                      className="w-full h-full object-cover"
                      src={user.photo ? getFullFileUrl(user.photo) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username)}&background=0D9488&color=ffffff&bold=true`}
                      alt="User"
                    />
                  </div>
                  
                  <div className={`ml-3 flex-1 min-w-0 transition-all duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)] whitespace-nowrap pt-0.5 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'}`}>
                    <p className="text-[13px] font-bold text-slate-900 truncate tracking-tight">
                      {user.displayName || user.name || user.username}
                    </p>
                    <p className="text-[9px] text-teal-600 font-black uppercase tracking-widest mt-0.5">
                      {user.role || 'Admin'}
                    </p>
                  </div>
                </div>
                
                <div className={`transition-all duration-[200ms] ${isOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onLogout();
                    }}
                    className="w-[32px] h-[32px] flex items-center justify-center rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"
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
