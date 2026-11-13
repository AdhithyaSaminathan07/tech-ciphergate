import React from 'react';
import { Monitor, Maximize2, Lock } from 'lucide-react';

/**
 * Section A: Desktop Experience Showcase
 * Displays real desktop screenshots in SaaS-grade browser mockups
 * with titles, descriptions, and click-to-expand previews.
 */
const DesktopScreenshotsSection = ({ appName, screenshots = [], onPreview }) => {
  if (!screenshots || screenshots.length === 0) return null;

  return (
    <section aria-labelledby="desktop-experience-heading" className="space-y-4 sm:space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-[#087443] border border-emerald-200/70 mb-2">
            <Monitor size={13} />
            Desktop Workspace
          </span>
          <h2
            id="desktop-experience-heading"
            className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 tracking-tight mb-1"
          >
            Desktop Application Experience
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
            A comprehensive, high-resolution operational dashboard engineered for operations managers, administrators, and team leads on larger screens.
          </p>
        </div>

        <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
          {screenshots.length} Desktop Screens
        </span>
      </div>

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {screenshots.map((shot, index) => {
          // Feature the executive Admin Dashboard across both columns on desktop
          const isFeatured = index === 0;

          return (
            <div
              key={shot.id || index}
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
              className={`rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all duration-300 flex flex-col group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                isFeatured ? 'md:col-span-2' : 'md:col-span-1'
              }`}
            >
              {/* Browser Window Header Mockup */}
              <div className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-100/90 border-b border-slate-200/80 flex items-center justify-between select-none">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" />
                </div>

                <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-md bg-white border border-slate-200/70 text-[11px] font-mono text-slate-500 max-w-[200px] sm:max-w-xs truncate shadow-2xs">
                  <Lock size={10} className="text-emerald-600 shrink-0" />
                  <span className="truncate">ciphergate.techvaseegrah.com</span>
                </div>

                <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Maximize2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600" />
                  <span className="hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity text-slate-600">Expand</span>
                </div>
              </div>

              {/* Screenshot Preview */}
              <div className="relative bg-slate-950/5 overflow-hidden flex items-center justify-center">
                <img
                  src={shot.imageUrl}
                  alt={`${shot.title} — ${appName} Desktop Preview`}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  className="w-full h-auto object-cover group-hover:scale-[1.012] transition-transform duration-300"
                />

                {/* Hover Click-to-Expand Indicator */}
                <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 px-3.5 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-sm text-white text-xs font-medium shadow-md flex items-center gap-1.5">
                    <Maximize2 size={13} />
                    <span>Click to view full preview</span>
                  </div>
                </div>
              </div>

              {/* Card Footer (Title & Description) */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between bg-white border-t border-slate-100">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#087443] transition-colors mb-0">
                      {shot.title}
                    </h3>
                    {shot.badge && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                        {shot.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-0">
                    {shot.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default DesktopScreenshotsSection;

