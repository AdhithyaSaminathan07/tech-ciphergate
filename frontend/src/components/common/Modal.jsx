import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './Button';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  size = 'md',
  footer,
  showCloseButton = true
}) => {
  const modalRef = useRef(null);
  
  // Close modal on ESC key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);
  
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  // Close if clicked outside the modal
  const handleOutsideClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };
  
  // Modal size classes
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
    '2xl': 'max-w-7xl',
    full: 'max-w-[95vw] md:max-w-full mx-4'
  };
  
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center py-8 px-4 sm:px-6 overflow-y-auto overflow-x-hidden">
          {/* Backdrop with enhanced blur and darkness */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={onClose}
          />
          
          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            ref={modalRef}
            className={`relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] w-full ${sizeClasses[size]} border border-white/20 flex flex-col max-h-[90vh]`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white/50">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
              {showCloseButton && (
                <button
                  type="button"
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-90"
                  onClick={onClose}
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Modal Body */}
            <div className="px-6 py-6 overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar">
              {children}
            </div>
            
            {/* Modal Footer */}
            {footer && (
              <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
          
          <style dangerouslySetInnerHTML={{ __html: `
            .custom-scrollbar::-webkit-scrollbar {
              width: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: #e2e8f0;
              border-radius: 20px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background-color: #cbd5e1;
            }
          `}} />
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;