import { useContext, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { FiLogOut } from "react-icons/fi";
import appContext from '../../context/AppContext';
import ShatteredLogo from '../common/ShatteredLogo';
import { motion } from 'framer-motion';

const Sidebar = ({
  links,
  logoText = 'Task Tracker',
  user,
  onLogout
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedDropdowns, setExpandedDropdowns] = useState({});
  const [showFullLogo, setShowFullLogo] = useState(false);
  const [triggerLogoAnimation, setTriggerLogoAnimation] = useState(false);
  const [clickedItem, setClickedItem] = useState(null); // Track clicked item
  const location = useLocation();

  const { subdomain } = useContext(appContext);

  // Theme Colors
  const themeColor = "bg-[#0d9488]"; // Teal color from image
  const activeBg = "bg-[#f3f4f6]"; // Light gray background for active item
  const activeText = "text-[#0d9488]"; // Teal text for active item

  // Get icon class based on state
  const getIconClass = (isActive, isClicked) => {
    if (isClicked) {
      return "sidebar-icon-gradient clicked mr-3 text-lg";
    }
    if (isActive) {
      return "sidebar-icon-gradient active mr-3 text-lg";
    }
    return "sidebar-icon-gradient inactive mr-3 text-lg";
  };

  // Trigger logo animation when component mounts
  useEffect(() => {
    // Show shattered logo for 2 seconds
    const logoTimer = setTimeout(() => {
      setShowFullLogo(true);
    }, 2000);

    return () => clearTimeout(logoTimer);
  }, []);

  // Trigger logo animation when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setTriggerLogoAnimation(prev => !prev);
      setShowFullLogo(false);

      // Reset showFullLogo after animation completes
      const resetTimer = setTimeout(() => {
        setShowFullLogo(true);
      }, 2000);

      return () => clearTimeout(resetTimer);
    }
  }, [isOpen]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  const handleItemClick = (to) => {
    setClickedItem(to);
    // Reset clicked item after animation duration
    setTimeout(() => {
      setClickedItem(null);
    }, 1000);
    closeSidebar();
  };

  const toggleDropdown = (key) => {
    setExpandedDropdowns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isAnyChildActive = (children) => {
    return children.some(child => location.pathname === child.to);
  };

  return (
    <>
      {/* External toggle button */}
      {!isOpen && (
        <button
          type="button"
          className="md:hidden fixed top-1/2 left-0 z-20 p-2 rounded-r-full text-white bg-[#0d9488] shadow-lg hover:bg-[#0f766e] focus:outline-none transform -translate-y-1/2"
          onClick={toggleSidebar}
        >
          <span className="sr-only">Open sidebar</span>
          <FaChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-20 md:hidden"
          onClick={closeSidebar}
        ></div>
      )}

      {/* Close toggle button */}
      {isOpen && (
        <button
          type="button"
          className="fixed top-1/2 right-0 z-40 p-2 rounded-l-full text-[#0d9488] bg-white shadow-lg focus:outline-none transform -translate-y-1/2"
          onClick={toggleSidebar}
        >
          <span className="sr-only">Close sidebar</span>
          <FaChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar Container - Teal Background */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 ${themeColor} transform overflow-y-auto sidebar-container ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        style={{ borderTopRightRadius: '30px', borderBottomRightRadius: '30px' }}
      >
        {/* Logo section */}
        <div className="flex items-center justify-center h-16 px-4">
          <div className="flex items-center justify-center w-full">
            <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-xl p-1 flex-shrink-0">
              <ShatteredLogo
                triggerAnimation={triggerLogoAnimation}
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onComplete={() => console.log('Shattering animation complete')}
              />
            </div>

            <div
              className={`ml-3 overflow-hidden ${showFullLogo ? 'opacity-100' : 'opacity-0'} w-full`}
            >
              <h1
                className="text-lg font-bold text-white truncate"
              >
                {logoText}
              </h1>
            </div>
          </div>
        </div>

        {/* User profile */}
        {user && (
          <div className="px-4 py-3 mb-2 mx-3 bg-white/10 rounded-xl backdrop-blur-sm">
            <div className="flex items-center justify-between w-full">
              <div className='flex items-center min-w-0 w-full'>
                <div className="flex-shrink-0">
                  <img
                    className="h-8 w-8 rounded-full object-cover border-2 border-white/30"
                    src={user.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username)}`}
                    alt={user.name || user.username}
                  />
                </div>
                <div className="ml-2 min-w-0 w-full">
                  <p className="text-xs font-semibold text-white truncate">{user.displayName || user.name || user.username}</p>
                  <p className="text-xs text-teal-100 truncate">{user.username}</p>
                </div>
              </div>
              <div className="ml-1 flex-shrink-0">
                {onLogout && <button
                  className="text-white p-1 hover:text-red-200 text-sm"
                  onClick={onLogout}
                >
                  <FiLogOut />
                </button>}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="mt-6 px-0 pb-10 space-y-2">
          {links.map((link, index) => {
            // Define variables at the top to avoid scope issues
            const isActive = location.pathname === link.to;
            const isClicked = clickedItem === link.to;

            // Handle header items
            if (link.isHeader) {
              return (
                <div key={`header-${index}`} className="pt-4 pb-2 px-6">
                  <h3 className="text-xs font-bold text-teal-200 uppercase tracking-wider">
                    {link.label}
                  </h3>
                </div>
              );
            }

            // Handle dropdown items
            if (link.isDropdown) {
              const dropdownKey = `dropdown-${index}`;
              const isExpanded = expandedDropdowns[dropdownKey];
              const hasActiveChild = isAnyChildActive(link.children || []);

              return (
                <div key={dropdownKey} className="px-4">
                  <button
                    onClick={() => toggleDropdown(dropdownKey)}
                    className={`
                      group flex items-center w-full px-4 py-3 text-sm font-medium rounded-xl
                      ${hasActiveChild
                        ? 'bg-white text-[#0d9488] shadow-md'
                        : 'text-white hover:bg-white/10'
                      }
                    `}
                  >
                    {link.icon && (
                      <span className={getIconClass(hasActiveChild, false)}>
                        {link.icon}
                      </span>
                    )}
                    <span className="flex-1 text-left truncate">{link.label}</span>
                    {link.badge && (
                      <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5 flex-shrink-0">
                        {link.badge}
                      </span>
                    )}
                    <span className={`ml-2 ${isExpanded ? 'rotate-180' : ''}`}>
                      <FaChevronDown className="h-3 w-3" />
                    </span>
                  </button>

                  {/* Dropdown children */}
                  <div className={`${isExpanded ? 'block' : 'hidden'}`}>
                    <div className="pl-4 space-y-1 mt-1">
                      {link.children?.map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          className={`
                            group flex items-center px-4 py-2 text-sm font-medium rounded-xl mx-2
                            ${location.pathname === child.to
                              ? 'bg-white/20 text-white'
                              : 'text-teal-100 hover:text-white hover:bg-white/10'
                            }
                          `}
                          onClick={() => handleItemClick(child.to)}
                        >
                          <span className={getIconClass(location.pathname === child.to, clickedItem === child.to)}>
                            {child.icon}
                          </span>
                          <span className="flex-1 text-left truncate">{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            // Handle regular navigation items
            // Variables are already defined at the top

            return (
              <div key={link.to} className={`relative ${isActive ? 'px-0 pl-0' : 'px-4'}`}>
                {isActive && (
                  <>
                    {/* CSS trick to create the curve effect above and below active item */}
                    <div className="absolute right-0 top-[-20px] w-5 h-5 bg-transparent rounded-br-3xl shadow-[5px_5px_0_0_#f3f4f6] z-10 pointer-events-none md:block hidden"></div>
                    <div className="absolute right-0 bottom-[-20px] w-5 h-5 bg-transparent rounded-tr-3xl shadow-[5px_-5px_0_0_#f3f4f6] z-10 pointer-events-none md:block hidden"></div>
                  </>
                )}
                <Link
                  to={link.to}
                  className={`
                  group flex items-center px-6 py-3.5 text-sm font-medium
                  relative
                  ${isActive
                      ? `${activeBg} ${activeText} rounded-l-full ml-4 shadow-sm z-0 md:rounded-r-none md:rounded-l-full`
                      : 'text-white hover:bg-white/10 rounded-xl'
                    }
                  md:${isActive ? 'rounded-l-full ml-4' : 'rounded-xl'}
                  ${isActive ? 'mobile-active-item' : ''}
                `}
                  onClick={() => handleItemClick(link.to)}
                >
                  {link.icon && (
                    <span className={getIconClass(isActive, isClicked)}>
                      {link.icon}
                    </span>
                  )}
                  <span className="flex-1 text-left truncate">{link.label}</span>
                  {link.badge && (
                    <span className={`ml-2 text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${isActive ? 'bg-[#0d9488] text-white' : 'bg-white text-[#0d9488]'}`}>
                      {link.badge}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Mobile specific styles for active item - converted to standard style tag */}
      <style>{`
        @media (max-width: 767px) {
          .mobile-active-item {
            border-top-right-radius: 2rem !important;
            border-bottom-right-radius: 2rem !important;
            border-top-left-radius: 0.5rem !important;
            border-bottom-left-radius: 0.5rem !important;
            margin-left: 1rem !important;
            margin-right: 1rem !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
          
          .sidebar-container {
            border-top-right-radius: 30px !important;
            border-bottom-right-radius: 30px !important;
          }
        }
      `}</style>
    </>
  );
};

export default Sidebar;
