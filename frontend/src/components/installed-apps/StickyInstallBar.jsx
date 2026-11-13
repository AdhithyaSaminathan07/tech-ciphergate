import React from 'react';
import { Download, ExternalLink, Play, PlusSquare } from 'lucide-react';
import AppBrandLogo from './AppBrandLogo';
import { PLATFORM_META } from '../../utils/osDetection';

/**
 * Section 10: Sticky bottom installation bar with mobile safe-area inset support,
 * compact application branding, View Demo action, and platform-specific Install button.
 */
const StickyInstallBar = ({
  app,
  selectedPlatform,
  installPlan,
  hasDemoUrl,
  onInstall,
  onViewDemo,
}) => {
  const platformLabel = PLATFORM_META[selectedPlatform]?.label || 'Selected Platform';
  const platformShort = PLATFORM_META[selectedPlatform]?.shortLabel || 'App';
  const actionType = installPlan?.actionType || 'manual-instructions';
  const fullLabel = installPlan?.buttonLabel || 'Install';
  const shortLabel = installPlan?.stickyButtonLabel || fullLabel;

  const ActionIcon =
    actionType === 'open-app'
      ? ExternalLink
      : actionType === 'ios-instructions'
      ? PlusSquare
      : Download;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      role="region"
      aria-label="Quick installation bar"
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Application Branding */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <AppBrandLogo logoUrl={app.logoUrl} name={app.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate leading-tight">
              {app.name}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
              <span className="sm:hidden">{platformShort}</span>
              <span className="hidden sm:inline">
                {app.developer} · {platformLabel}
              </span>
            </p>
          </div>
        </div>

        {/* Right: View Demo & Install Buttons (always visible & >=44px touch height) */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onViewDemo}
            disabled={!hasDemoUrl}
            title={hasDemoUrl ? `View ${app.name} Demo` : 'Demo coming soon'}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border whitespace-nowrap transition-all duration-200 ${
              hasDemoUrl
                ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-[#F0FAF4] hover:text-[#087443] cursor-pointer active:scale-[0.98]'
                : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Play size={14} className="shrink-0" />
            <span className="sm:hidden">{hasDemoUrl ? 'Demo' : 'Soon'}</span>
            <span className="hidden sm:inline">
              {hasDemoUrl ? 'View Demo' : 'Demo Soon'}
            </span>
          </button>

          <button
            type="button"
            onClick={onInstall}
            title={`${fullLabel} — ${app.name} (${platformLabel})`}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 bg-[#087443] hover:bg-[#065F37] text-white shadow-sm hover:shadow cursor-pointer active:scale-[0.98]"
          >
            <ActionIcon size={15} className="shrink-0" />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{fullLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StickyInstallBar;
