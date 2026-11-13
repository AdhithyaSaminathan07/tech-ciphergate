/**
 * Cross-platform PWA installation utilities for Tech Ciphergate (/installed-apps).
 *
 * Captures Chromium's `beforeinstallprompt` early, tracks `appinstalled` and
 * standalone display-mode, detects browser families (Chromium, Safari, Firefox),
 * and produces accurate installation plans for Android, iOS, Windows, and macOS.
 */

let deferredInstallPrompt = null;
let initialized = false;
let sessionInstalled = false;
const listeners = new Set();

function notifyListeners() {
  const snapshot = {
    deferredPrompt: deferredInstallPrompt,
    hasNativePrompt: Boolean(deferredInstallPrompt),
    sessionInstalled,
  };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // Ignore subscriber errors
    }
  });
}

/**
 * Registers global `beforeinstallprompt` and `appinstalled` listeners once
 * so lazy-loaded routes such as /installed-apps never miss the browser event.
 */
export function initPwaInstallListener() {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    sessionInstalled = true;
    notifyListeners();
  });
}

export function subscribePwaInstall(callback) {
  listeners.add(callback);
  callback({
    deferredPrompt: deferredInstallPrompt,
    hasNativePrompt: Boolean(deferredInstallPrompt),
    sessionInstalled,
  });
  return () => {
    listeners.delete(callback);
  };
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function __testResetPwaState(mockPrompt = null) {
  deferredInstallPrompt = mockPrompt;
  sessionInstalled = false;
  notifyListeners();
}

export function __testSimulateAppInstalled() {
  deferredInstallPrompt = null;
  sessionInstalled = true;
  notifyListeners();
}

/**
 * Triggers the native Chromium `beforeinstallprompt` dialog when available.
 *
 * @returns {Promise<{ supported: boolean, outcome: 'accepted'|'dismissed'|'unavailable' }>}
 */
export async function triggerNativeInstallPrompt() {
  if (!deferredInstallPrompt) {
    return { supported: false, outcome: 'unavailable' };
  }

  const promptEvent = deferredInstallPrompt;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';

  if (outcome === 'accepted') {
    deferredInstallPrompt = null;
    notifyListeners();
  }

  return { supported: true, outcome };
}

/**
 * Detects the visitor's browser family from User-Agent.
 *
 * @param {string} [userAgentOverride]
 * @returns {'safari'|'chromium'|'firefox'|'other'}
 */
export function detectBrowserFamily(userAgentOverride) {
  const raw =
    userAgentOverride ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const ua = String(raw || '').toLowerCase();

  if (!ua) {
    return 'other';
  }

  // Firefox on desktop, Android, or iOS
  if (/firefox|fxios/.test(ua)) {
    return 'firefox';
  }

  // Chromium browsers on Android / desktop (exclude iOS WebKit wrappers)
  const isIosWrapper = /crios|edgios|opios/.test(ua);
  if (
    !isIosWrapper &&
    /edg\/|edga\/|chrome\/|chromium\/|opr\/|samsungbrowser|brave|vivaldi/.test(ua)
  ) {
    return 'chromium';
  }

  // Safari on iOS, iPadOS, or macOS (not Chrome/Edge/Firefox/Opera)
  if (/safari/.test(ua) && !/chrome|crios|chromium|edg|opr|fxios|firefox|samsungbrowser/.test(ua)) {
    return 'safari';
  }

  return 'other';
}

/**
 * Checks whether the application is currently running in installed standalone mode.
 *
 * @param {object} [env]
 * @returns {boolean}
 */
export function isStandaloneDisplayMode(env) {
  const win = env?.window ?? (typeof window !== 'undefined' ? window : null);
  const nav = env?.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const doc = env?.document ?? (typeof document !== 'undefined' ? document : null);

  if (nav?.standalone === true) {
    return true;
  }

  if (doc?.referrer && String(doc.referrer).startsWith('android-app://')) {
    return true;
  }

  if (win && typeof win.matchMedia === 'function') {
    if (
      win.matchMedia('(display-mode: standalone)').matches ||
      win.matchMedia('(display-mode: window-controls-overlay)').matches
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks async installed state via `navigator.getInstalledRelatedApps` when supported,
 * combined with synchronous standalone display-mode and session install tracking.
 *
 * @returns {Promise<boolean>}
 */
export async function detectInstalledApp() {
  if (sessionInstalled || isStandaloneDisplayMode()) {
    return true;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.getInstalledRelatedApps === 'function'
  ) {
    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(relatedApps) && relatedApps.length > 0) {
        return true;
      }
    } catch {
      // Ignore browser restrictions on getInstalledRelatedApps
    }
  }

  return false;
}

/**
 * Produces the installation action plan and step-by-step instructions
 * for the selected platform without inventing binary URLs or showing Coming Soon.
 *
 * @param {object} params
 * @param {'android'|'ios'|'windows'|'macos'} params.selectedPlatform
 * @param {'android'|'ios'|'windows'|'macos'} params.detectedOs
 * @param {'safari'|'chromium'|'firefox'|'other'} params.browserFamily
 * @param {boolean} params.isInstalled
 * @param {boolean} params.hasNativePrompt
 * @param {string} [params.appUrl]
 */
export function getPlatformInstallPlan({
  selectedPlatform,
  detectedOs,
  browserFamily,
  isInstalled,
  hasNativePrompt,
  appUrl = 'https://ciphergate.techvaseegrah.com',
}) {
  const isSameDeviceOs = selectedPlatform === detectedOs;
  const nativePromptReady =
    Boolean(hasNativePrompt) &&
    isSameDeviceOs &&
    selectedPlatform !== 'ios';

  // Already installed detection (applicable when viewing on the current OS)
  if (isInstalled && isSameDeviceOs) {
    return {
      actionType: 'open-app',
      buttonLabel: 'Open App',
      stickyButtonLabel: 'Open App',
      heroButtonLabel: 'Open App',
      statusBadge: 'Installed',
      statusTone: 'emerald',
      summary: 'Tech Ciphergate is already installed on this device.',
      instructionsTitle: 'Launch Tech Ciphergate',
      browserNote: 'You can launch the application directly from here or from your home screen / app launcher.',
      steps: [],
    };
  }

  // 1. Android
  if (selectedPlatform === 'android') {
    if (nativePromptReady) {
      return {
        actionType: 'native-prompt',
        buttonLabel: 'Install',
        stickyButtonLabel: 'Install',
        heroButtonLabel: 'Install for Android',
        statusBadge: 'One-Click Install',
        statusTone: 'emerald',
        summary: 'Ready for instant browser installation on Android.',
        instructionsTitle: 'Install Tech Ciphergate on Android',
        browserNote: 'Tap Install below to open your browser’s native installation prompt.',
        steps: [
          'Tap the green Install button.',
          'Confirm Install in the Android browser dialog.',
          'Launch CipherGate anytime from your Android Home Screen or App Drawer.',
        ],
      };
    }

    return {
      actionType: 'manual-instructions',
      buttonLabel: 'Install',
      stickyButtonLabel: 'Install',
      heroButtonLabel: 'Install for Android',
      statusBadge: 'Android PWA',
      statusTone: 'emerald',
      summary:
        browserFamily === 'firefox'
          ? 'Install via Firefox for Android menu or open in Google Chrome.'
          : 'Install directly from Chrome, Edge, or Samsung Internet on Android.',
      instructionsTitle: 'How to Install on Android',
      browserNote: isSameDeviceOs
        ? 'If no automatic prompt appeared, follow these quick steps in your Android browser:'
        : `Open ${appUrl}/installed-apps on your Android device in Chrome or Edge:`,
      steps:
        browserFamily === 'firefox' && isSameDeviceOs
          ? [
              'Tap the three-dot menu (⋮) in Firefox for Android.',
              'Tap Install (or Add to Home screen).',
              'Confirm to add CipherGate to your Home Screen.',
            ]
          : [
              `Open ${appUrl}/installed-apps in Google Chrome or Microsoft Edge on Android.`,
              'Tap the browser menu (⋮) in the top-right corner.',
              'Select "Install app" or "Add to Home screen" and tap Install.',
            ],
    };
  }

  // 2. iOS (iPhone & iPad) — never uses beforeinstallprompt
  if (selectedPlatform === 'ios') {
    const onNonSafariIos = isSameDeviceOs && browserFamily !== 'safari';
    return {
      actionType: 'ios-instructions',
      buttonLabel: 'Add to Home Screen',
      stickyButtonLabel: 'Add to Home',
      heroButtonLabel: 'Add to Home Screen',
      statusBadge: 'iOS Web App',
      statusTone: 'emerald',
      summary: 'Install on iPhone or iPad using Safari’s Add to Home Screen.',
      instructionsTitle: 'Install on iPhone & iPad (Safari)',
      browserNote: onNonSafariIos
        ? `Safari is required for the smoothest iOS installation. Open ${appUrl}/installed-apps in Safari, then follow the steps below.`
        : 'Apple iOS installs web apps through Safari’s Share menu:',
      steps: [
        'Tap the Share button (square with an upward arrow) in Safari’s toolbar.',
        'Scroll down the Share sheet and tap "Add to Home Screen".',
        'Verify the name "CipherGate" and tap "Add" in the top-right corner.',
      ],
    };
  }

  // 3. Windows PC
  if (selectedPlatform === 'windows') {
    if (nativePromptReady) {
      return {
        actionType: 'native-prompt',
        buttonLabel: 'Install',
        stickyButtonLabel: 'Install',
        heroButtonLabel: 'Install for Windows',
        statusBadge: 'One-Click Install',
        statusTone: 'emerald',
        summary: 'Ready for instant desktop app installation on Windows.',
        instructionsTitle: 'Install Tech Ciphergate on Windows PC',
        browserNote: 'Click Install below to add CipherGate to your Windows Start Menu and Desktop.',
        steps: [
          'Click the green Install button.',
          'Click Install in the Chrome/Edge confirmation dialog.',
          'Launch CipherGate directly as a standalone Windows app.',
        ],
      };
    }

    return {
      actionType: 'manual-instructions',
      buttonLabel: 'Install',
      stickyButtonLabel: 'Install',
      heroButtonLabel: 'Install for Windows',
      statusBadge: 'Windows Desktop',
      statusTone: 'emerald',
      summary:
        browserFamily === 'firefox' && isSameDeviceOs
          ? 'Firefox desktop does not support PWA install; use Chrome or Edge on Windows.'
          : 'Install as a standalone Windows desktop app via Chrome or Microsoft Edge.',
      instructionsTitle: 'How to Install on Windows PC',
      browserNote:
        browserFamily === 'firefox' && isSameDeviceOs
          ? `Firefox on Windows does not support native PWA installation. Open ${appUrl}/installed-apps in Microsoft Edge or Google Chrome:`
          : 'Use Chrome or Microsoft Edge address-bar / menu installation:',
      steps: [
        `Open ${appUrl}/installed-apps in Microsoft Edge or Google Chrome.`,
        'Click the Install app icon in the right side of the address bar (or open Menu ⋮ / ⋯ → Apps / Cast, save, and share → Install Tech Ciphergate).',
        'Click Install to pin CipherGate to your Start Menu and Taskbar.',
      ],
    };
  }

  // 4. macOS
  if (nativePromptReady) {
    return {
      actionType: 'native-prompt',
      buttonLabel: 'Install',
      stickyButtonLabel: 'Install',
      heroButtonLabel: 'Install for macOS',
      statusBadge: 'One-Click Install',
      statusTone: 'emerald',
      summary: 'Ready for instant desktop installation on macOS.',
      instructionsTitle: 'Install Tech Ciphergate on macOS',
      browserNote: 'Click Install below to install CipherGate via your browser.',
      steps: [
        'Click the green Install button.',
        'Confirm Install in the browser dialog.',
        'Launch CipherGate from Applications or Spotlight.',
      ],
    };
  }

  const isMacSafari = isSameDeviceOs && browserFamily === 'safari';
  return {
    actionType: 'manual-instructions',
    buttonLabel: 'Install',
    stickyButtonLabel: 'Install',
    heroButtonLabel: 'Install for macOS',
    statusBadge: isMacSafari ? 'Safari Add to Dock' : 'macOS Desktop',
    statusTone: 'emerald',
    summary: isMacSafari
      ? 'Add Tech Ciphergate directly to your macOS Dock using Safari.'
      : 'Install on macOS via Safari (Add to Dock) or Chrome / Edge.',
    instructionsTitle: isMacSafari
      ? 'Add to Dock in Safari (macOS)'
      : 'How to Install on macOS',
    browserNote: isMacSafari
      ? 'Safari on macOS Sonoma (14+) supports adding web apps straight to your Dock:'
      : browserFamily === 'firefox' && isSameDeviceOs
      ? `Firefox on macOS does not support PWA installation. Open ${appUrl}/installed-apps in Safari or Chrome:`
      : 'Install via Safari Add to Dock or Chromium browser install:',
    steps: isMacSafari
      ? [
          'In Safari, click "File" in the macOS top menu bar (or click the Share button in the toolbar).',
          'Select "Add to Dock…".',
          'Confirm the name "CipherGate" and click "Add" to launch it from your Dock.',
        ]
      : [
          `Open ${appUrl}/installed-apps in Safari (File → Add to Dock…) or Google Chrome / Microsoft Edge.`,
          'In Chrome/Edge, click the Install icon in the address bar (or Menu ⋮ → Save and Share → Install Tech Ciphergate).',
          'Confirm to add CipherGate to your macOS Dock and Applications.',
        ],
  };
}

