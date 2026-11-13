import React from 'react';
import { Smartphone, Maximize2, CheckCircle2 } from 'lucide-react';

/**
 * Section B: Mobile Experience Showcase
 * Renders portrait mobile screenshots inside realistic smartphone frames
 * paired with feature descriptions, highlights, and touch-friendly actions.
 */
const MobileScreenshotsSection = ({ appName, screenshots = [], onPreview }) => {
  if (!screenshots || screenshots.length === 0) return null;

  return (
    <section aria-labelledby="mobile-experience-heading" className="space-y-4 sm:space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-[#087443] border border-emerald-200/70 mb-2">
            <Smartphone size={13} />
            Mobile Optimized
          </span>
          <h2
            id="mobile-experience-heading"
            className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 tracking-tight mb-1"
          >
            Mobile Application Experience
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Fast, responsive workforce tools optimized for handheld devices. Check in, verify attendance, submit invoices, and track updates on the go.
          </p>
        </div>

        <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
          {screenshots.length} Mobile Screens
        </span>
      </div>

      {/* Grid of Mobile Showcase Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {screenshots.map((shot, index) => {
          return (
            <div
              key={shot.id || index}
              className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50/60 via-white to-emerald-50/20 p-5 sm:p-7 flex flex-col sm:flex-row items-center gap-6 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all duration-300"
            >
              {/* Smartphone Mockup Frame */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onPreview && onPreview(shot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onPreview) onPreview(shot);
                  }
                }}
                aria-label={`Open high-resolution preview of ${shot.title}`}
                className="w-[230px] sm:w-[250px] shrink-0 rounded-[2.75rem] p-2.5 sm:p-3 bg-slate-900 border-[3px] border-slate-800 shadow-2xl relative select-none group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {/* Dynamic Island / Top Notch */}
                <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-950 rounded-full z-10 flex items-center justify-center shadow-inner pointer-events-none">
                  <div className="w-2 h-2 rounded-full bg-slate-800" />
                </div>

                {/* Screen Viewport */}
                <div className="rounded-[2.1rem] overflow-hidden bg-slate-950 border border-slate-800/60 relative aspect-[9/19.5]">
                  <img
                    src={shot.imageUrl}
                    alt={`${shot.title} — ${appName} Mobile Preview`}
                    loading="lazy"
                    className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/25 transition-colors duration-200 flex items-center justify-center pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 px-3 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-sm text-white text-xs font-medium shadow-md flex items-center gap-1.5">
                      <Maximize2 size={12} />
                      <span>Tap to expand</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Home Indicator Bar */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/40 rounded-full z-10 pointer-events-none" />
              </div>

              {/* Accompanying Feature Details */}
              <div className="flex-1 flex flex-col justify-between w-full space-y-4">
                <div>
                  {shot.badge && (
                    <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-[#087443] border border-emerald-200/60 mb-2">
                      {shot.badge}
                    </span>
                  )}
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1.5">
                    {shot.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                    {shot.description}
                  </p>

                  {/* Highlights Bullet Points */}
                  {Array.isArray(shot.highlights) && shot.highlights.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {shot.highlights.map((highlight, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs text-slate-700"
                        >
                          <CheckCircle2
                            size={14}
                            className="text-[#087443] shrink-0 mt-0.5"
                          />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Touch-Friendly Action Button */}
                <button
                  type="button"
                  onClick={() => onPreview && onPreview(shot)}
                  className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/70 text-slate-800 hover:text-[#087443] transition-colors shadow-2xs cursor-pointer"
                >
                  <Maximize2 size={14} />
                  <span>View Full Screen Preview</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default MobileScreenshotsSection;

