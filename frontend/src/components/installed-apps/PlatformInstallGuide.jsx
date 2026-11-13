import { CheckCircle2, Download, ExternalLink, Info, PlusSquare, Share } from 'lucide-react';

/**
 * Step-by-step installation guidance card rendered for the selected platform.
 * Displays native browser feedback, iOS Safari Share -> Add to Home Screen steps,
 * macOS Safari Add to Dock steps, Chromium install steps, or an already-installed state.
 */
const PlatformInstallGuide = ({
  platformLabel,
  installPlan,
  installFeedback,
  isHighlighted,
  onOpenApp,
}) => {
  if (!installPlan) return null;

  const isOpenApp = installPlan.actionType === 'open-app';
  const isIos = installPlan.actionType === 'ios-instructions';
  const isNative = installPlan.actionType === 'native-prompt';

  return (
    <div
      id="platform-install-guide"
      className={`mt-4 rounded-xl border p-4 sm:p-5 transition-all duration-300 ${
        isHighlighted
          ? 'bg-emerald-50/70 border-[#087443] ring-2 ring-emerald-500/20'
          : isOpenApp
          ? 'bg-emerald-50/50 border-emerald-200'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {isOpenApp ? (
            <CheckCircle2 size={18} className="text-[#087443] shrink-0" />
          ) : isIos ? (
            <Share size={18} className="text-[#087443] shrink-0" />
          ) : isNative ? (
            <Download size={18} className="text-[#087443] shrink-0" />
          ) : (
            <Info size={18} className="text-[#087443] shrink-0" />
          )}
          <h3 className="text-sm font-semibold text-slate-900">
            {installPlan.instructionsTitle}
          </h3>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-[#087443] border border-emerald-200">
          {platformLabel} · {installPlan.statusBadge}
        </span>
      </div>

      {installFeedback && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-xs sm:text-sm flex items-center gap-2 ${
            installFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{installFeedback.message}</span>
        </div>
      )}

      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
        {installPlan.browserNote}
      </p>

      {installPlan.steps?.length > 0 && (
        <ol className="mt-3 space-y-2.5">
          {installPlan.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-emerald-50 text-[#087443] border border-emerald-200 text-[11px] font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {isIos && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <Share size={14} className="text-[#087443]" />
            1. Share icon
          </span>
          <span aria-hidden="true">→</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <PlusSquare size={14} className="text-[#087443]" />
            2. Add to Home Screen
          </span>
        </div>
      )}

      {isOpenApp && (
        <div className="mt-3 pt-3 border-t border-emerald-200/70 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-emerald-900 font-medium">
            Standalone PWA mode is ready on this device.
          </span>
          <button
            type="button"
            onClick={onOpenApp}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087443] hover:text-[#065F37] cursor-pointer"
          >
            <span>Open Tech Ciphergate</span>
            <ExternalLink size={13} />
          </button>
        </div>
      )}
    </div>
  );
};

export default PlatformInstallGuide;

