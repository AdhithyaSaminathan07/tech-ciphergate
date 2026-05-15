import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const BottomSheet = ({ isOpen, onClose, title, children }) => {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] md:hidden"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-[32px] z-[201] shadow-[0_-8px_30px_rgba(0,0,0,0.1)] md:hidden flex flex-col max-h-[90vh]"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
              <h3 className="text-lg font-black text-slate-800">{title}</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-50 text-slate-500 active:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-6 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet;
