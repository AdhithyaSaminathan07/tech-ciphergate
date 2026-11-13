import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectOperatingSystem,
  PLATFORM_KEYS,
  PLATFORM_META,
} from '../osDetection.js';
import { TECH_CIPHERGATE_APP } from '../../data/installedAppsConfig.js';
import {
  isPublicAuthExemptPath,
  getAuthFailureRedirectPath,
} from '../authUtils.js';
import {
  detectBrowserFamily,
  isStandaloneDisplayMode,
  getPlatformInstallPlan,
  triggerNativeInstallPrompt,
  detectInstalledApp,
  subscribePwaInstall,
  __testResetPwaState,
  __testSimulateAppInstalled,
} from '../pwaInstall.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('detectOperatingSystem detects Android, iOS, iPadOS, Windows, and macOS', () => {
  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    }),
    { platform: 'android', detected: true }
  );

  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
    }),
    { platform: 'ios', detected: true }
  );

  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    { platform: 'ios', detected: true }
  );

  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
    }),
    { platform: 'windows', detected: true }
  );

  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    { platform: 'macos', detected: true }
  );

  assert.deepEqual(
    detectOperatingSystem({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    }),
    { platform: 'windows', detected: false }
  );
});

test('TECH_CIPHERGATE_APP config provides Tech Ciphergate metadata, video asset, and all 4 platforms', () => {
  assert.equal(TECH_CIPHERGATE_APP.id, 'ciphergate');
  assert.equal(TECH_CIPHERGATE_APP.name, 'Tech Ciphergate');
  assert.equal(TECH_CIPHERGATE_APP.logoUrl, '/appicon.png');
  assert.equal(TECH_CIPHERGATE_APP.videoDemo.url, '/videos/ciphergate-demo.mp4');
  assert.equal(TECH_CIPHERGATE_APP.videoDemo.posterUrl, '/welcome_illustration.png');
  assert.ok(TECH_CIPHERGATE_APP.developer);
  assert.ok(TECH_CIPHERGATE_APP.category);

  const videoFilePath = path.resolve(
    __dirname,
    '../../../public/videos/ciphergate-demo.mp4'
  );
  assert.ok(fs.existsSync(videoFilePath), 'ciphergate-demo.mp4 must exist in frontend/public/videos');
  const buf = fs.readFileSync(videoFilePath);
  const idx = buf.indexOf('mvhd');
  assert.ok(idx !== -1, 'MP4 mvhd atom must be present');
  const ver = buf[idx + 4];
  const timescale = ver === 0 ? buf.readUInt32BE(idx + 16) : buf.readUInt32BE(idx + 24);
  const duration = ver === 0 ? buf.readUInt32BE(idx + 20) : Number(buf.readBigUInt64BE(idx + 28));
  const seconds = duration / timescale;
  assert.ok(seconds > 9.5 && seconds < 11, `Expected ~10s video duration, got ${seconds}s`);

  for (const key of PLATFORM_KEYS) {
    assert.ok(PLATFORM_META[key]);
    assert.ok(
      key in TECH_CIPHERGATE_APP.platforms,
      `Missing platform ${key} on TECH_CIPHERGATE_APP`
    );
  }
});

test('auth redirect logic keeps /installed-apps and public routes unredirected while protecting admin/worker routes', () => {
  // Public routes must never redirect to login when /auth/me or /auth/refresh fails
  assert.equal(isPublicAuthExemptPath('/installed-apps'), true);
  assert.equal(isPublicAuthExemptPath('/installed-apps/'), true);
  assert.equal(getAuthFailureRedirectPath('/installed-apps'), null);
  assert.equal(getAuthFailureRedirectPath('/'), null);
  assert.equal(getAuthFailureRedirectPath('/admin/login'), null);
  assert.equal(getAuthFailureRedirectPath('/admin/register'), null);
  assert.equal(getAuthFailureRedirectPath('/worker/login'), null);
  assert.equal(getAuthFailureRedirectPath('/quick-test'), null);
  assert.equal(getAuthFailureRedirectPath('/forgot-password'), null);
  assert.equal(getAuthFailureRedirectPath('/reset-password/abc123'), null);

  // Protected routes still redirect to their respective login pages
  assert.equal(getAuthFailureRedirectPath('/admin/dashboard'), '/admin/login');
  assert.equal(getAuthFailureRedirectPath('/admin/workers'), '/admin/login');
  assert.equal(getAuthFailureRedirectPath('/worker/dashboard'), '/worker/login');
  assert.equal(getAuthFailureRedirectPath('/worker/attendance'), '/worker/login');
});

test('App.jsx defines /installed-apps as a public route outside PrivateRoute', () => {
  const appJsxPath = path.resolve(__dirname, '../../App.jsx');
  const appSource = fs.readFileSync(appJsxPath, 'utf8');

  const installedAppsRouteIdx = appSource.indexOf(
    '<Route path="/installed-apps" element={<InstalledApps />} />'
  );
  const firstPrivateRouteIdx = appSource.indexOf('<Route element={<PrivateRoute');

  assert.ok(installedAppsRouteIdx !== -1, '/installed-apps route must exist in App.jsx');
  assert.ok(firstPrivateRouteIdx !== -1, 'PrivateRoute must exist in App.jsx');
  assert.ok(
    installedAppsRouteIdx < firstPrivateRouteIdx,
    '/installed-apps must be declared in public routes before PrivateRoute blocks'
  );
});

test('detectBrowserFamily and isStandaloneDisplayMode detect browser engines and installed mode', () => {
  assert.equal(
    detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
    ),
    'chromium'
  );
  assert.equal(
    detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
    ),
    'chromium'
  );
  assert.equal(
    detectBrowserFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    ),
    'safari'
  );
  assert.equal(
    detectBrowserFamily(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    ),
    'safari'
  );
  assert.equal(
    detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
    ),
    'firefox'
  );

  assert.equal(isStandaloneDisplayMode({ navigator: { standalone: true } }), true);
  assert.equal(
    isStandaloneDisplayMode({
      document: { referrer: 'android-app://com.google.android.gm' },
    }),
    true
  );
  assert.equal(
    isStandaloneDisplayMode({
      window: {
        matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }),
      },
    }),
    true
  );
  assert.equal(
    isStandaloneDisplayMode({
      navigator: { standalone: false },
      document: { referrer: 'https://ciphergate.techvaseegrah.com/' },
      window: { matchMedia: () => ({ matches: false }) },
    }),
    false
  );
});

test('getPlatformInstallPlan supports Android, iOS, Windows, and macOS without Coming Soon states', () => {
  assert.equal(TECH_CIPHERGATE_APP.webAccessUrl, 'https://ciphergate.techvaseegrah.com');
  for (const key of PLATFORM_KEYS) {
    assert.equal(
      /coming soon/i.test(TECH_CIPHERGATE_APP.platforms[key].notes || ''),
      false,
      `${key} notes must not say coming soon`
    );
  }

  // Android: native prompt, manual fallback, and installed Open App
  const androidNative = getPlatformInstallPlan({
    selectedPlatform: 'android',
    detectedOs: 'android',
    browserFamily: 'chromium',
    isInstalled: false,
    hasNativePrompt: true,
  });
  assert.equal(androidNative.actionType, 'native-prompt');
  assert.equal(androidNative.buttonLabel, 'Install');

  const androidManual = getPlatformInstallPlan({
    selectedPlatform: 'android',
    detectedOs: 'android',
    browserFamily: 'firefox',
    isInstalled: false,
    hasNativePrompt: false,
  });
  assert.equal(androidManual.actionType, 'manual-instructions');
  assert.ok(androidManual.steps.length >= 3);

  const androidInstalled = getPlatformInstallPlan({
    selectedPlatform: 'android',
    detectedOs: 'android',
    browserFamily: 'chromium',
    isInstalled: true,
    hasNativePrompt: false,
  });
  assert.equal(androidInstalled.actionType, 'open-app');
  assert.equal(androidInstalled.buttonLabel, 'Open App');

  // iOS: never pretends to support beforeinstallprompt; uses Add to Home Screen & Open App
  const iosSafari = getPlatformInstallPlan({
    selectedPlatform: 'ios',
    detectedOs: 'ios',
    browserFamily: 'safari',
    isInstalled: false,
    hasNativePrompt: true, // even if true, iOS must never take native-prompt path
  });
  assert.equal(iosSafari.actionType, 'ios-instructions');
  assert.equal(iosSafari.buttonLabel, 'Add to Home Screen');
  assert.ok(iosSafari.steps.some((s) => /Add to Home Screen/i.test(s)));

  const iosChrome = getPlatformInstallPlan({
    selectedPlatform: 'ios',
    detectedOs: 'ios',
    browserFamily: 'other',
    isInstalled: false,
    hasNativePrompt: false,
  });
  assert.match(iosChrome.browserNote, /Safari/i);

  const iosInstalled = getPlatformInstallPlan({
    selectedPlatform: 'ios',
    detectedOs: 'ios',
    browserFamily: 'safari',
    isInstalled: true,
    hasNativePrompt: false,
  });
  assert.equal(iosInstalled.actionType, 'open-app');
  assert.equal(iosInstalled.buttonLabel, 'Open App');

  // Windows: Chromium prompt, Firefox manual guidance, installed Open App
  const winNative = getPlatformInstallPlan({
    selectedPlatform: 'windows',
    detectedOs: 'windows',
    browserFamily: 'chromium',
    isInstalled: false,
    hasNativePrompt: true,
  });
  assert.equal(winNative.actionType, 'native-prompt');

  const winFirefox = getPlatformInstallPlan({
    selectedPlatform: 'windows',
    detectedOs: 'windows',
    browserFamily: 'firefox',
    isInstalled: false,
    hasNativePrompt: false,
  });
  assert.equal(winFirefox.actionType, 'manual-instructions');
  assert.match(winFirefox.browserNote, /Edge|Chrome/i);

  const winInstalled = getPlatformInstallPlan({
    selectedPlatform: 'windows',
    detectedOs: 'windows',
    browserFamily: 'chromium',
    isInstalled: true,
    hasNativePrompt: false,
  });
  assert.equal(winInstalled.actionType, 'open-app');

  // macOS: Chromium prompt, Safari Add to Dock, Firefox manual guidance, installed Open App
  const macNative = getPlatformInstallPlan({
    selectedPlatform: 'macos',
    detectedOs: 'macos',
    browserFamily: 'chromium',
    isInstalled: false,
    hasNativePrompt: true,
  });
  assert.equal(macNative.actionType, 'native-prompt');

  const macSafari = getPlatformInstallPlan({
    selectedPlatform: 'macos',
    detectedOs: 'macos',
    browserFamily: 'safari',
    isInstalled: false,
    hasNativePrompt: false,
  });
  assert.equal(macSafari.actionType, 'manual-instructions');
  assert.match(macSafari.instructionsTitle, /Add to Dock/i);
  assert.ok(macSafari.steps.some((s) => /Add to Dock/i.test(s)));

  const macFirefox = getPlatformInstallPlan({
    selectedPlatform: 'macos',
    detectedOs: 'macos',
    browserFamily: 'firefox',
    isInstalled: false,
    hasNativePrompt: false,
  });
  assert.match(macFirefox.browserNote, /Safari|Chrome/i);

  const macInstalled = getPlatformInstallPlan({
    selectedPlatform: 'macos',
    detectedOs: 'macos',
    browserFamily: 'safari',
    isInstalled: true,
    hasNativePrompt: false,
  });
  assert.equal(macInstalled.actionType, 'open-app');
});

test('square 192x192 and 512x512 PWA icons exist and VideoDemoSection configures muted autoplay', () => {
  const readPngDimensions = (filePath) => {
    const buf = fs.readFileSync(filePath);
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  };

  assert.deepEqual(
    readPngDimensions(path.resolve(__dirname, '../../../public/pwa-192x192.png')),
    { width: 192, height: 192 }
  );
  assert.deepEqual(
    readPngDimensions(path.resolve(__dirname, '../../../public/pwa-512x512.png')),
    { width: 512, height: 512 }
  );

  const videoComponentPath = path.resolve(
    __dirname,
    '../../components/installed-apps/VideoDemoSection.jsx'
  );
  const videoSrc = fs.readFileSync(videoComponentPath, 'utf8');
  assert.match(videoSrc, /\bautoPlay\b/);
  assert.match(videoSrc, /\bmuted\b/);
  assert.match(videoSrc, /\bplaysInline\b/);
  assert.match(videoSrc, /\bloop=\{false\}/);
  assert.match(videoSrc, /IntersectionObserver/, 'Video must use IntersectionObserver for viewport entry');
  assert.match(videoSrc, /prefers-reduced-motion/, 'Video must respect prefers-reduced-motion');
  assert.match(videoSrc, /Tap to unmute/, 'Video must offer visible mute/unmute control');
  assert.match(videoSrc, /onEnded=\{handleEnded\}/, 'Video must handle onEnded for managed restart');
  assert.match(videoSrc, /2000/, 'Video must wait exactly 2 seconds before restarting');
  assert.match(videoSrc, /clearReplayTimer/, 'Video must manage and clean up replay timers');

  // Favicon asset and index.html audit
  const faviconIco = path.resolve(__dirname, '../../../public/favicon.ico');
  assert.ok(fs.existsSync(faviconIco), 'favicon.ico must exist');
  assert.ok(fs.statSync(faviconIco).size > 1000, 'favicon.ico must be non-empty multi-resolution ico');

  assert.deepEqual(
    readPngDimensions(path.resolve(__dirname, '../../../public/favicon-32x32.png')),
    { width: 32, height: 32 }
  );
  assert.deepEqual(
    readPngDimensions(path.resolve(__dirname, '../../../public/favicon-16x16.png')),
    { width: 16, height: 16 }
  );

  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');
  assert.match(indexHtml, /href="\/favicon-32x32\.png"/);
  assert.match(indexHtml, /href="\/favicon\.ico"/);
  assert.match(indexHtml, /href="\/pwa-192x192\.png"/);
});

test('already-installed detection does not claim installation succeeded merely because user accepted a prompt', async () => {
  let promptShown = false;
  const mockPromptEvent = {
    prompt: async () => {
      promptShown = true;
    },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };

  __testResetPwaState(mockPromptEvent);

  let snapshot = null;
  const unsubscribe = subscribePwaInstall((s) => {
    snapshot = s;
  });

  assert.equal(snapshot.hasNativePrompt, true);
  assert.equal(snapshot.sessionInstalled, false);

  const result = await triggerNativeInstallPrompt();
  assert.equal(promptShown, true);
  assert.equal(result.supported, true);
  assert.equal(result.outcome, 'accepted');

  // CRITICAL AUDIT CHECK: Accepting prompt must NOT prematurely mark sessionInstalled = true
  assert.equal(
    snapshot.sessionInstalled,
    false,
    'sessionInstalled must remain false immediately after userChoice accepted'
  );
  const installedStatusBeforeEvent = await detectInstalledApp();
  assert.equal(
    installedStatusBeforeEvent,
    false,
    'detectInstalledApp must be false until appinstalled event or standalone display mode'
  );

  // Now simulate the browser actually completing installation and firing appinstalled
  __testSimulateAppInstalled();
  assert.equal(snapshot.sessionInstalled, true);
  const installedStatusAfterEvent = await detectInstalledApp();
  assert.equal(installedStatusAfterEvent, true);

  unsubscribe();
  __testResetPwaState(null);
});

test('desktop and mobile screenshot assets exist on disk and are configured in TECH_CIPHERGATE_APP', () => {
  assert.ok(Array.isArray(TECH_CIPHERGATE_APP.desktopScreenshots));
  assert.equal(TECH_CIPHERGATE_APP.desktopScreenshots.length, 5);

  assert.ok(Array.isArray(TECH_CIPHERGATE_APP.mobileScreenshots));
  assert.equal(TECH_CIPHERGATE_APP.mobileScreenshots.length, 2);

  const expectedDesktopIds = [
    'admin-dashboard',
    'salary-management',
    'work-allocation',
    'kpi-management',
    'app-settings',
  ];
  const expectedMobileIds = ['attendance-mobile', 'invoice-history-mobile'];

  assert.deepEqual(
    TECH_CIPHERGATE_APP.desktopScreenshots.map((s) => s.id),
    expectedDesktopIds
  );
  assert.deepEqual(
    TECH_CIPHERGATE_APP.mobileScreenshots.map((s) => s.id),
    expectedMobileIds
  );

  const allScreenshots = [
    ...TECH_CIPHERGATE_APP.desktopScreenshots,
    ...TECH_CIPHERGATE_APP.mobileScreenshots,
  ];

  for (const shot of allScreenshots) {
    assert.ok(shot.title, `Screenshot ${shot.id} missing title`);
    assert.ok(shot.description, `Screenshot ${shot.id} missing description`);
    assert.ok(shot.imageUrl, `Screenshot ${shot.id} missing imageUrl`);
    assert.ok(
      shot.imageUrl.startsWith('/images/installed-apps/'),
      `Expected /images/installed-apps/ prefix, got ${shot.imageUrl}`
    );

    const filename = shot.imageUrl.replace(/^\/images\/installed-apps\//, '');
    const diskPath = path.resolve(
      __dirname,
      '../../../public/images/installed-apps',
      filename
    );
    assert.ok(
      fs.existsSync(diskPath),
      `Screenshot file ${filename} must exist at ${diskPath}`
    );
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 10000, `Screenshot file ${filename} must not be empty or truncated`);
  }

  // Verify section order in InstalledApps.jsx: Hero -> Platforms -> VideoDemo -> FeatureScreenshotsSection (Unified Grid) -> About -> AppInfoTable
  const installedAppsJsx = fs.readFileSync(
    path.resolve(__dirname, '../../pages/InstalledApps.jsx'),
    'utf8'
  );

  const videoIdx = installedAppsJsx.indexOf('<VideoDemoSection');
  const galleryIdx = installedAppsJsx.indexOf('<FeatureScreenshotsSection');
  const aboutIdx = installedAppsJsx.indexOf('id="about-app-heading"');
  const appInfoIdx = installedAppsJsx.indexOf('<AppInfoTable');

  assert.ok(videoIdx !== -1, 'VideoDemoSection must exist in InstalledApps.jsx');
  assert.ok(galleryIdx !== -1, 'FeatureScreenshotsSection must exist in InstalledApps.jsx');
  assert.ok(aboutIdx !== -1, 'About section must exist in InstalledApps.jsx');
  assert.ok(appInfoIdx !== -1, 'AppInfoTable must exist in InstalledApps.jsx');

  assert.ok(videoIdx < galleryIdx, 'VideoDemoSection must precede FeatureScreenshotsSection');
  assert.ok(galleryIdx < aboutIdx, 'FeatureScreenshotsSection must precede About section');
  assert.ok(aboutIdx < appInfoIdx, 'About section must precede AppInfoTable');

  // Verify unified responsive grid requirements in FeatureScreenshotsSection.jsx:
  // 3 cols on desktop (lg:grid-cols-3), 2 cols on tablet (sm:grid-cols-2), 1 col on mobile (grid-cols-1)
  const gallerySource = fs.readFileSync(
    path.resolve(__dirname, '../../components/installed-apps/FeatureScreenshotsSection.jsx'),
    'utf8'
  );
  assert.match(gallerySource, /lg:grid-cols-3/, 'Gallery must support 3 columns on desktop');
  assert.match(gallerySource, /sm:grid-cols-2/, 'Gallery must support 2 columns on tablet');
  assert.match(gallerySource, /grid-cols-1/, 'Gallery must support 1 column on mobile');
  assert.match(gallerySource, /object-contain/, 'Gallery must use object-contain for all screenshots');
  assert.doesNotMatch(gallerySource, /col-span-2/, 'No single card should span multiple columns');
});

