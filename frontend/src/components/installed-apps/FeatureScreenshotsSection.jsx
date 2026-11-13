import React, { useState } from 'react';
import { Monitor, Smartphone, Maximize2, Layers } from 'lucide-react';
import ScreenshotLightboxModal from './ScreenshotLightboxModal';

/**
 * Unified, compact screenshot gallery for Tech Ciphergate (/installed-apps).
 * Displays all 7 desktop and mobile screenshots in a single responsive CSS grid:
 * - 3 columns on desktop (lg:grid-cols-3)
 * - 2 columns on tablet (sm:grid-cols-2)
 * - 1 column on mobile (grid-cols-1)
 *
 * Sizing:
 * - Desktop screenshot preview height: ~240–270px (h-[245px] sm:h-[255px] lg:h-[265px])
 * - Mobile screenshot preview height: ~260–300px (h-[270px] sm:h-[280px] lg:h-[290px])
 * - All cards equal size and importance, with object-contain and click-to-expand lightbox.
 */
const FeatureScreenshotsSection = ({
  appName = 'Tech Ciphergate',
  screenshots = [],
  onPreview: externalOnPreview,
}) => {
  const [internalPreview, setInternalPreview] = useState(null);

  const handlePreview = (shot) => {
    if (externalOnPreview) {
      externalOnPreview(shot);
    } else {
      setInternalPreview(shot);
    }
  };

  if (!screenshots || screenshots.length === 0) return null;

  return (
    <section aria-labelledby="app-screenshots-heading" className="space-y-4 sm:space-y-5">
      {/* Gallery Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-[#087443] border border-emerald-200/70 mb-1.5">
            <Layers size={12} />
            Visual Showcase
          </span>
          <h2
            id="app-screenshots-heading"
            className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 tracking-tight mb-0.5"
          >
            Application Screenshots
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl mb-0">
            Preview core operational dashboards and mobile workflows. Click any screen to expand high-resolution preview.
          </p>
        </div>

        <span className="text-xs font-medium text-slate-500 shrink-0 hidden sm:inline-block">
          {screenshots.length} Screens
        </span>
      </div>

      {/* Unified 3-Column Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {screenshots.map((shot, index) => {
          const isMobile =
            shot.type === 'mobile' ||
            shot.id?.includes('mobile') ||
            shot.imageUrl?.includes('mobile');

          return (
            <div
              key={shot.id || index}
              role="button"
              tabIndex={0}
              onClick={() => handlePreview(shot)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePreview(shot);
                }
              }}
              aria-label={`Open full size preview of ${shot.title}`}
              className="group rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all duration-200 flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 h-full"
            >
              {/* Image Preview Area */}
              <div
                className={`relative w-full bg-slate-900/[0.03] border-b border-slate-100 overflow-hidden flex items-center justify-center p-2.5 sm:p-3 group-hover:bg-slate-900/[0.05] transition-colors select-none ${
                  isMobile
                    ? 'h-[270px] sm:h-[280px] lg:h-[290px]'
                    : 'h-[245px] sm:h-[255px] lg:h-[265px]'
                }`}
              >
                {/* Platform Badge */}
                <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/95 text-slate-700 border border-slate-200/80 shadow-2xs backdrop-blur-xs">
                  {isMobile ? (
                    <>
                      <Smartphone size={11} className="text-[#087443]" />
                      <span>Mobile</span>
                    </>
                  ) : (
                    <>
                      <Monitor size={11} className="text-[#087443]" />
                      <span>Desktop</span>
                    </>
                  )}
                </span>

                {/* Hover Expand Icon */}
                <span className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-lg bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs pointer-events-none">
                  <Maximize2 size={13} />
                </span>

                {/* Screenshot Image with object-contain */}
                <img
                  src={shot.imageUrl}
                  alt={`${shot.title} — ${appName}`}
                  loading="lazy"
                  className={`w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.015] ${
                    isMobile
                      ? 'rounded-lg shadow-xs border border-slate-200/80 max-h-[96%]'
                      : 'rounded-sm shadow-2xs'
                  }`}
                />
              </div>

              {/* Card Footer: Title & Short Description */}
              <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between bg-white">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#087443] transition-colors line-clamp-1 mb-1">
                    {shot.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-0">
                    {shot.description || shot.caption}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Internal Lightbox Modal (if not controlled externally) */}
      {!externalOnPreview && internalPreview && (
        <ScreenshotLightboxModal
          screenshot={internalPreview}
          appName={appName}
          onClose={() => setInternalPreview(null)}
        />
      )}
    </section>
  );
};

export default FeatureScreenshotsSection;
