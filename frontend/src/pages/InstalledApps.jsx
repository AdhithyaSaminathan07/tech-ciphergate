import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Play,
  PlusSquare,
  CheckCircle2,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { TECH_CIPHERGATE_APP } from '../data/installedAppsConfig';
import { detectOperatingSystem, PLATFORM_META } from '../utils/osDetection';
import {
  detectBrowserFamily,
  detectInstalledApp,
  getPlatformInstallPlan,
  isStandaloneDisplayMode,
  subscribePwaInstall,
  triggerNativeInstallPrompt,
} from '../utils/pwaInstall';
import AppBrandLogo from '../components/installed-apps/AppBrandLogo';
import PlatformSelector from '../components/installed-apps/PlatformSelector';
import PlatformInstallGuide from '../components/installed-apps/PlatformInstallGuide';
import VideoDemoSection from '../components/installed-apps/VideoDemoSection';
import FeatureScreenshotsSection from '../components/installed-apps/FeatureScreenshotsSection';
import ScreenshotLightboxModal from '../components/installed-apps/ScreenshotLightboxModal';
import AppInfoTable from '../components/installed-apps/AppInfoTable';

const MotionDiv = motion.div;

/**
 * Public App Installer Page (/installed-apps) for Tech Ciphergate.
 * Standalone responsive SaaS app-store presentation across mobile, tablet, and desktop
 * with automatic OS detection, platform switching, demo video player, feature screenshots,
 * and application information.
 */
const InstalledApps = () => {
  const navigate = useNavigate();
  const activeApp = TECH_CIPHERGATE_APP;

  const osInfo = useMemo(() => detectOperatingSystem(), []);
  const browserFamily = useMemo(() => detectBrowserFamily(), []);
  const [selectedPlatform, setSelectedPlatform] = useState(osInfo.platform);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installFeedback, setInstallFeedback] = useState(null);
  const [highlightGuide, setHighlightGuide] = useState(false);
  const [activeScreenshot, setActiveScreenshot] = useState(null);
  const videoSectionRef = useRef(null);
  const guideSectionRef = useRef(null);
  const highlightTimeoutRef = useRef(null);

  // Sync page title cleanly while mounted
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${activeApp.name} — App Installer`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeApp.name]);

  // Subscribe to global PWA install prompt & installed state detection
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribePwaInstall(({ hasNativePrompt: promptReady, sessionInstalled }) => {
      if (!active) return;
      setHasNativePrompt(promptReady);
      if (sessionInstalled) {
        setIsInstalled(true);
        setInstallFeedback({
          type: 'success',
          message:
            'Tech Ciphergate has finished installing! You can launch it from your device or click Open App.',
        });
      }
    });

    detectInstalledApp().then((installed) => {
      if (active && installed) {
        setIsInstalled(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const currentPlatformConfig = activeApp.platforms?.[selectedPlatform] || {};
  const platformMeta = PLATFORM_META[selectedPlatform] || PLATFORM_META.windows;
  const hasDemoVideo = Boolean(activeApp.videoDemo?.url);
  const hasDemoUrl = hasDemoVideo || Boolean(activeApp.demoUrl);

  const installPlan = useMemo(
    () =>
      getPlatformInstallPlan({
        selectedPlatform,
        detectedOs: osInfo.platform,
        browserFamily,
        isInstalled,
        hasNativePrompt,
        appUrl: activeApp.webAccessUrl || 'https://ciphergate.techvaseegrah.com',
      }),
    [
      selectedPlatform,
      osInfo.platform,
      browserFamily,
      isInstalled,
      hasNativePrompt,
      activeApp.webAccessUrl,
    ]
  );

  const HeroActionIcon =
    installPlan.actionType === 'open-app'
      ? ExternalLink
      : installPlan.actionType === 'ios-instructions'
      ? PlusSquare
      : Download;

  const handleSelectPlatform = (platformKey) => {
    setSelectedPlatform(platformKey);
    setInstallFeedback(null);
  };

  const scrollToInstallGuide = () => {
    if (guideSectionRef.current) {
      guideSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setHighlightGuide(true);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightGuide(false);
    }, 1800);
  };

  const handleBackToCatalogue = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const handleOpenApp = () => {
    if (isStandaloneDisplayMode()) {
      navigate('/');
      return;
    }
    const targetUrl = activeApp.webAccessUrl || '/';
    const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      navigate('/');
    }
  };

  const handleInstall = async () => {
    if (installPlan.actionType === 'open-app') {
      handleOpenApp();
      return;
    }

    if (installPlan.actionType === 'native-prompt') {
      const result = await triggerNativeInstallPrompt();
      if (result.outcome === 'accepted') {
        // Do not immediately claim already-installed here; the browser fires 'appinstalled'
        // when the installation officially completes, which updates isInstalled via subscriber.
        setInstallFeedback({
          type: 'success',
          message:
            'Installation prompt accepted. The app is being installed by your browser.',
        });
        return;
      }

      if (result.outcome === 'dismissed') {
        setInstallFeedback({
          type: 'info',
          message:
            'Browser install prompt was dismissed. Click Install anytime or follow the manual browser steps below.',
        });
        scrollToInstallGuide();
        return;
      }
    }

    scrollToInstallGuide();
  };

  const handleViewDemo = () => {
    if (hasDemoVideo && videoSectionRef.current) {
      videoSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (activeApp.demoUrl) {
      window.open(activeApp.demoUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F3F5F7] text-slate-900 font-sans pb-10 sm:pb-16">
      {/* Top Navigation Strip */}
      <header className="sticky top-0 z-30 bg-[#F3F5F7]/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBackToCatalogue}
            className="min-h-[44px] inline-flex items-center gap-2 py-1.5 pr-2 text-sm font-semibold text-slate-700 hover:text-[#087443] transition-colors cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-xs group-hover:border-emerald-300 group-hover:bg-[#F0FAF4] transition-colors shrink-0">
              <ArrowLeft size={16} />
            </span>
            <span>Back to Catalogue</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-8 space-y-6">
        {/* Primary White Content Card */}
        <MotionDiv
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden"
        >
          {/* Top Hero & Platform Selection Section */}
          <div className="p-4 sm:p-7 lg:p-10 space-y-6 sm:space-y-8">
            {/* Application Logo, Name & Developer Info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
              <div className="flex items-start sm:items-center gap-3.5 sm:gap-5 min-w-0">
                <AppBrandLogo logoUrl={activeApp.logoUrl} name={activeApp.name} size="lg" />

                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-0 break-words">
                      {activeApp.name}
                    </h1>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-[#F0FAF4] text-[#087443] border border-[#C9F5D9] shrink-0">
                      <ShieldCheck size={13} />
                      {activeApp.category}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5 flex-wrap">
                    <Building2 size={14} className="text-slate-400 shrink-0" />
                    <span>
                      Developed by{' '}
                      <strong className="font-semibold text-slate-800">
                        {activeApp.developer}
                      </strong>
                    </span>
                  </p>

                  {activeApp.tagline && (
                    <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed break-words">
                      {activeApp.tagline}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Platform Selection + Auto OS Highlight */}
            <PlatformSelector
              selectedPlatform={selectedPlatform}
              detectedPlatform={osInfo.platform}
              osDetected={osInfo.detected}
              platformsConfig={activeApp.platforms}
              isInstalled={isInstalled}
              hasNativePrompt={hasNativePrompt}
              onSelectPlatform={handleSelectPlatform}
            />

            {/* Platform-specific Install / Open App CTA */}
            <div className="rounded-xl bg-slate-50/90 border border-slate-200/80 p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {platformMeta.label} Installation
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#087443] bg-[#F0FAF4] border border-[#C9F5D9] px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={11} />
                    {installPlan.statusBadge}
                  </span>
                </div>
                <p className="text-xs text-slate-500 break-words">
                  {installPlan.summary || currentPlatformConfig.notes}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleViewDemo}
                  disabled={!hasDemoUrl}
                  className={`min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                    hasDemoUrl
                      ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-[#F0FAF4] hover:text-[#087443] shadow-xs cursor-pointer active:scale-[0.98]'
                      : 'border-slate-200 bg-white/70 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Play size={15} />
                  <span>{hasDemoUrl ? 'View Demo' : 'Demo Coming Soon'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleInstall}
                  className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 bg-[#087443] hover:bg-[#065F37] text-white shadow-sm hover:shadow cursor-pointer active:scale-[0.98]"
                >
                  <HeroActionIcon size={16} />
                  <span>{installPlan.heroButtonLabel}</span>
                </button>
              </div>
            </div>

            {/* Browser & OS-specific Step-by-Step Installation Guide */}
            <div ref={guideSectionRef} className="scroll-mt-16 sm:scroll-mt-20">
              <PlatformInstallGuide
                platformLabel={platformMeta.label}
                installPlan={installPlan}
                installFeedback={installFeedback}
                isHighlighted={highlightGuide}
                onOpenApp={handleOpenApp}
              />
            </div>
          </div>

          <hr className="border-slate-200/80" />

          {/* Video Demonstration */}
          <div
            ref={videoSectionRef}
            id="video-demonstration"
            className="p-4 sm:p-7 lg:p-10 scroll-mt-16 sm:scroll-mt-20"
          >
            <VideoDemoSection
              appName={activeApp.name}
              videoDemo={activeApp.videoDemo}
            />
          </div>

          <hr className="border-slate-200/80" />

          {/* Section 4: Application Screenshot Gallery (Unified Compact Grid) */}
          <div className="p-4 sm:p-7 lg:p-10">
            <FeatureScreenshotsSection
              appName={activeApp.name}
              screenshots={activeApp.screenshots}
              onPreview={setActiveScreenshot}
            />
          </div>

          <hr className="border-slate-200/80" />

          {/* Section 6: About This App */}
          <section
            aria-labelledby="about-app-heading"
            className="p-4 sm:p-7 lg:p-10 space-y-3 sm:space-y-4"
          >
            <h2 id="about-app-heading" className="text-base sm:text-xl font-bold text-slate-900 mb-0">
              About This App
            </h2>
            <p className="text-xs sm:text-[15px] text-slate-600 leading-relaxed break-words">
              {activeApp.about}
            </p>

            {Array.isArray(activeApp.highlights) && activeApp.highlights.length > 0 && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                {activeApp.highlights.map((point, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-700"
                  >
                    <CheckCircle2
                      size={16}
                      className="text-[#087443] shrink-0 mt-0.5"
                    />
                    <span className="leading-snug">{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <hr className="border-slate-200/80" />

          {/* Section 7: Application Information Table */}
          <div className="p-4 sm:p-7 lg:p-10">
            <AppInfoTable app={activeApp} />
          </div>

          {/* Section C: Screenshot Preview Lightbox */}
          {activeScreenshot && (
            <ScreenshotLightboxModal
              screenshot={activeScreenshot}
              appName={activeApp.name}
              onClose={() => setActiveScreenshot(null)}
            />
          )}
        </MotionDiv>
      </main>
    </div>
  );
};

export default InstalledApps;
