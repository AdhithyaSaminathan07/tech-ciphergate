import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FaHome, 
  FaTasks, 
  FaCalendarAlt, 
  FaClipboardList, 
  FaGraduationCap 
} from 'react-icons/fa';
import { motion } from 'framer-motion';

const BottomNavigation = ({ navItems = [], badges = {} }) => {
  // Default items if none provided
  const defaultItems = [
    { to: '/admin', icon: <FaHome />, label: 'Home' },
    { to: '/admin/work-allocation', icon: <FaTasks />, label: 'Work' },
    { to: '/admin/leaves', icon: <FaCalendarAlt />, label: 'Leave', badgeKey: 'leaves' },
    { to: '/admin/attendance', icon: <FaClipboardList />, label: 'Reports' },
    { to: '/admin/test/generate-questions', icon: <FaGraduationCap />, label: 'Training' },
  ];

  const items = navItems.length > 0 ? navItems : defaultItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 rounded-t-[24px] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-[1000] pb-safe">
      <div className="flex justify-around items-center h-[68px] px-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin' || item.to === '/worker'}
            className={({ isActive }) => 
              `flex flex-col items-center justify-center w-full h-full relative transition-all duration-300 ${
                isActive ? 'text-[#0d9488]' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`text-[20px] transition-all duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tight mt-1 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                  {item.label}
                </span>
                
                {((item.badge > 0) || (item.badgeKey && badges[item.badgeKey] > 0)) && (
                  <span className="absolute top-2.5 right-[20%] bg-rose-500 text-white text-[9px] font-black rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 border-2 border-white shadow-sm">
                    {item.badgeKey ? (badges[item.badgeKey] > 9 ? '9+' : badges[item.badgeKey]) : (item.badge > 9 ? '9+' : item.badge)}
                  </span>
                )}
                
                {isActive && (
                  <motion.div 
                    layoutId="bottomNavActive"
                    className="absolute bottom-1.5 w-1 h-1 bg-[#0d9488] rounded-full" 
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNavigation;
