import React, { useEffect } from 'react';
import { X, Monitor, Smartphone } from 'lucide-react';

/**
 * High-resolution lightbox modal for expanding desktop and mobile screenshots.
 * Supports ESC key dismissal, backdrop click dismissal, touch dismiss,
 * and maintains proper aspect ratios for both portrait and landscape screenshots.
 */
const ScreenshotLightboxModal = ({ screenshot, appName, onClose }) => {
  useEffect(() => {
    if (!screenshot) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [screenshot, onClose]);

  if (!screenshot) return null;

  const isMobile =
    screenshot.id?.includes('mobile') || screenshot.imageUrl?.includes('mobile');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={screenshot.title || 'Screenshot Preview'}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 md:p-6"
      onClick={onClose}
    >
      <div
        className={`relative w-full bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 flex flex-col max-h-[92vh] ${
          isMobile ? 'max-w-md sm:max-w-lg' : 'max-w-5xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 gap-3 bg-white shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-[#087443] border border-emerald-200/60">
                {isMobile ? (
                  <>
                    <Smartphone size={11} />
                    Mobile Screen
                  </>
                ) : (
                  <>
                    <Monitor size={11} />
                    Desktop Screen
                  </>
                )}
              </span>
              {screenshot.badge && (
                <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
                  • {screenshot.badge}
                </span>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate mb-0">
              {screenshot.title}
            </h3>
            {screenshot.description && (
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 sm:line-clamp-none break-words">
                {screenshot.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview modal"
            className="min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Viewport */}
        <div className="bg-slate-950 p-2 sm:p-4 flex items-center justify-center overflow-auto flex-1 select-none">
          <img
            src={screenshot.imageUrl}
            alt={screenshot.title || `${appName} screenshot`}
            className={`w-auto object-contain rounded-lg shadow-lg ${
              isMobile ? 'max-h-[75vh]' : 'max-h-[72vh] sm:max-h-[76vh]'
            }`}
          />
        </div>

        {/* Modal Footer (Hint) */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500 shrink-0">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">Esc</kbd> or click outside to dismiss
        </div>
      </div>
    </div>
  );
};

export default ScreenshotLightboxModal;

