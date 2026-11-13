import React from 'react';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { PLATFORM_KEYS, PLATFORM_META } from '../../utils/osDetection';

const PLATFORM_ICONS = {
  android: FaAndroid,
  ios: FaApple,
  windows: FaWindows,
  macos: FaApple,
};

/**
 * Interactive 4-platform selector (Android, iPhone (iOS), Windows PC, macOS)
 * with auto-detected OS highlighting and responsive 2-col (mobile) / 4-col (tablet+) grid.
 */
const PlatformSelector = ({
  selectedPlatform,
  detectedPlatform,
  osDetected,
  platformsConfig = {},
  isInstalled = false,
  hasNativePrompt = false,
  onSelectPlatform,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Select Your Platform
        </span>
        {osDetected && detectedPlatform && PLATFORM_META[detectedPlatform] && (
          <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-[#087443] bg-[#F0FAF4] border border-[#C9F5D9] px-2.5 py-1 rounded-full">
            <Sparkles size={12} className="shrink-0" />
            <span>Detected: {PLATFORM_META[detectedPlatform].label}</span>
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Target operating system"
        className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3"
      >
        {PLATFORM_KEYS.map((key) => {
          const meta = PLATFORM_META[key];
          const IconComponent = PLATFORM_ICONS[key];
          const isSelected = selectedPlatform === key;
          const isAutoDetected = osDetected && detectedPlatform === key;
          const platformInfo = platformsConfig[key] || {};
          const isCurrentDeviceInstalled = isInstalled && detectedPlatform === key;
          const isNativeReady = hasNativePrompt && detectedPlatform === key && key !== 'ios';
          const statusPill = isCurrentDeviceInstalled
            ? 'Installed'
            : isNativeReady
            ? 'Ready'
            : key === 'ios'
            ? 'Safari'
            : 'PWA';

          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelectPlatform(key)}
              className={`group relative min-w-0 w-full min-h-[88px] flex flex-col items-start justify-between text-left p-3 sm:p-4 rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#087443]/30 ${
                isSelected
                  ? 'bg-[#F0FAF4] border-[#087443] shadow-sm ring-1 ring-[#087443]/20'
                  : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/70'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2 gap-1">
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[#087443] text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100/70 group-hover:text-[#087443]'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                </div>

                {isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-[#087443] shrink-0" />
                ) : isAutoDetected ? (
                  <span className="text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-[#087443] border border-emerald-200 whitespace-nowrap">
                    Your OS
                  </span>
                ) : null}
              </div>

              <div className="w-full min-w-0">
                <p
                  className={`text-xs sm:text-sm font-semibold leading-tight break-words ${
                    isSelected ? 'text-[#0F241D]' : 'text-slate-800'
                  }`}
                >
                  {meta.label}
                </p>
                <div className="flex items-center justify-between gap-1.5 mt-1 min-w-0">
                  <span className="text-[11px] text-slate-500 truncate min-w-0">
                    {platformInfo.version || meta.subtitle}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      isCurrentDeviceInstalled || isNativeReady
                        ? 'bg-emerald-50 text-[#087443] border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {statusPill}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PlatformSelector;
