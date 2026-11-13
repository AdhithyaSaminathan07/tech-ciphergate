import React, { useEffect, useRef, useState } from 'react';
import { Play, Film, Clock, Volume2, VolumeX } from 'lucide-react';

function formatVideoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Section: Video Demonstration with responsive 16:9 HTML5 video player.
 * Features:
 * - Viewport-aware autoplay using IntersectionObserver (starts when section becomes visible)
 * - Starts muted with playsInline to conform to mobile and browser autoplay policies
 * - Visible Mute/Unmute toggle button so visitors can easily enable sound
 * - Respects prefers-reduced-motion accessibility preference
 * - Native controls (play/pause, timeline, fullscreen)
 * - Single-trigger guard to avoid restarting video when scrolling away and returning
 * - Automatic delayed loop: when playback finishes, waits exactly 2 seconds before restarting from the beginning
 * - Preserves visitor's mute/unmute preference on replay
 * - Does not restart if visitor manually pauses
 * - Managed single-timer lifecycle with unmount cleanup
 * - Graceful fallback play button overlay if autoplay is rejected by browser policy
 */
const VideoDemoSection = ({ appName, videoDemo }) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hasAttemptedAutoplayRef = useRef(false);
  const replayTimeoutRef = useRef(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [detectedDuration, setDetectedDuration] = useState(null);
  const [showPendingNotice, setShowPendingNotice] = useState(false);

  const hasVideo = Boolean(videoDemo?.url);
  const displayDuration = detectedDuration || videoDemo?.duration || null;

  const clearReplayTimer = () => {
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  };

  // Clean up any pending replay timeout on unmount
  useEffect(() => {
    return () => {
      clearReplayTimer();
    };
  }, []);

  useEffect(() => {
    if (!hasVideo) return undefined;

    // Check user preference for reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAutoplayBlocked(true);
      return undefined;
    }

    const startPlayback = () => {
      const videoEl = videoRef.current;
      if (!videoEl || hasAttemptedAutoplayRef.current) return;
      hasAttemptedAutoplayRef.current = true;

      videoEl.muted = true;
      setIsMuted(true);

      const playPromise = videoEl.play?.();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setHasStarted(true);
            setAutoplayBlocked(false);
          })
          .catch(() => {
            // Browser autoplay policy blocked unprompted playback
            setAutoplayBlocked(true);
          });
      }
    };

    // If IntersectionObserver is not available, attempt immediate muted autoplay
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      startPlayback();
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting && !hasAttemptedAutoplayRef.current) {
          // Disconnect observer immediately so scrolling away does not trigger repeats
          observer.disconnect();
          startPlayback();
        }
      },
      {
        threshold: 0.25,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const target = containerRef.current || videoRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      observer.disconnect();
      clearReplayTimer();
    };
  }, [hasVideo, videoDemo?.url]);

  const handleLoadedMetadata = (e) => {
    const formatted = formatVideoDuration(e.currentTarget.duration);
    if (formatted) {
      setDetectedDuration(formatted);
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    if (!nextMuted && videoRef.current.volume === 0) {
      videoRef.current.volume = 1;
    }
    setIsMuted(nextMuted);
  };

  const handlePlayClick = () => {
    clearReplayTimer();

    if (!hasVideo) {
      setShowPendingNotice(true);
      return;
    }

    setHasStarted(true);
    setAutoplayBlocked(false);
    hasAttemptedAutoplayRef.current = true;

    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setAutoplayBlocked(false);
          })
          .catch(() => {
            setAutoplayBlocked(true);
          });
      }
    }
  };

  const handlePlay = () => {
    clearReplayTimer();
    setHasStarted(true);
    setAutoplayBlocked(false);
  };

  const handlePause = (e) => {
    // If paused manually while not ended, clear any pending replay timer
    if (!e.currentTarget.ended) {
      clearReplayTimer();
    }
  };

  const handleEnded = () => {
    // Clear any existing timer to prevent duplicates
    clearReplayTimer();

    // Wait exactly 2 seconds before restarting from the beginning
    replayTimeoutRef.current = setTimeout(() => {
      replayTimeoutRef.current = null;
      const videoEl = videoRef.current;
      if (!videoEl) return;

      videoEl.currentTime = 0;
      // Retain current muted status without resetting visitor preference
      const playPromise = videoEl.play?.();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setHasStarted(true);
            setAutoplayBlocked(false);
          })
          .catch(() => {
            setAutoplayBlocked(true);
          });
      }
    }, 2000);
  };

  return (
    <section
      ref={containerRef}
      aria-labelledby="video-demo-heading"
      className="space-y-3 sm:space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="video-demo-heading" className="text-base sm:text-xl font-bold text-slate-900 mb-0">
            Video Demonstration
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 break-words">
            {videoDemo?.title || `See ${appName} in action across supported workflows.`}
          </p>
        </div>

        {displayDuration && (
          <span
            data-testid="video-duration-badge"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0"
          >
            <Clock size={13} />
            {displayDuration}
          </span>
        )}
      </div>

      <div className="relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-sm">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              src={videoDemo.url}
              poster={videoDemo.posterUrl || undefined}
              autoPlay
              muted
              controls
              preload="metadata"
              playsInline
              loop={false}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              onVolumeChange={(e) => {
                setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
              }}
              className="w-full h-full object-contain bg-black"
            />

            {/* Mute / Unmute Overlay Control */}
            {hasStarted && (
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Unmute demonstration video' : 'Mute demonstration video'}
                className="absolute top-3 right-3 z-10 min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900/80 hover:bg-slate-900 text-white border border-white/20 backdrop-blur-sm shadow-md transition-all cursor-pointer"
              >
                {isMuted ? (
                  <>
                    <VolumeX size={15} />
                    <span>Tap to unmute</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={15} />
                    <span>Sound on</span>
                  </>
                )}
              </button>
            )}

            {/* Fallback Play Button Overlay if autoplay is blocked or reduced motion active */}
            {autoplayBlocked && !hasStarted && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 sm:p-6 text-center bg-slate-950/55 backdrop-blur-[1px]">
                <button
                  type="button"
                  onClick={handlePlayClick}
                  aria-label={`Play ${appName} demonstration video`}
                  className="group w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[#087443] hover:bg-[#065F37] text-white flex items-center justify-center shadow-lg shadow-emerald-950/50 ring-4 ring-white/25 hover:ring-white/40 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Play className="w-6 h-6 sm:w-8 sm:h-8 ml-0.5 sm:ml-1 fill-current" />
                </button>

                <p className="mt-2.5 sm:mt-4 text-xs sm:text-base font-semibold text-white drop-shadow-xs">
                  Watch {appName} Walkthrough
                </p>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-200">
                  {displayDuration
                    ? `Click play to watch (${displayDuration})`
                    : 'Click play to watch the product demonstration.'}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-3 sm:p-6 text-center bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/80">
            <div className="relative z-10 flex flex-col items-center max-w-md">
              <button
                type="button"
                onClick={handlePlayClick}
                aria-label="Video demonstration coming soon"
                className="group w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[#087443] hover:bg-[#065F37] text-white flex items-center justify-center shadow-lg shadow-emerald-950/50 ring-4 ring-white/20 hover:ring-white/30 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="w-6 h-6 sm:w-8 sm:h-8 ml-0.5 sm:ml-1 fill-current" />
              </button>

              <p className="mt-2.5 sm:mt-4 text-xs sm:text-base font-semibold text-white">
                {showPendingNotice ? 'Demo Video Coming Soon' : `${appName} Video Walkthrough`}
              </p>

              <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-300 hidden sm:block">
                {showPendingNotice
                  ? 'A verified demonstration video asset has not been attached to this release yet.'
                  : 'Click play to preview availability.'}
              </p>

              <span className="mt-2.5 sm:mt-3 inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium text-emerald-200 bg-white/10 border border-white/15 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full">
                <Film size={12} />
                Coming Soon
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoDemoSection;
