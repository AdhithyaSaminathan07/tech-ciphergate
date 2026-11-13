/**
 * Operating System detection and platform metadata helpers
 * for the public /installed-apps installer page.
 */

export const PLATFORM_KEYS = ['android', 'ios', 'windows', 'macos'];

export const PLATFORM_META = {
  android: {
    key: 'android',
    label: 'Android',
    shortLabel: 'Android',
    subtitle: 'Android Smartphone & Tablet',
    installVerb: 'Download for Android',
  },
  ios: {
    key: 'ios',
    label: 'iPhone (iOS)',
    shortLabel: 'iOS',
    subtitle: 'iPhone & iPad',
    installVerb: 'Get for iPhone (iOS)',
  },
  windows: {
    key: 'windows',
    label: 'Windows PC',
    shortLabel: 'Windows',
    subtitle: 'Windows 10 / 11 Desktop',
    installVerb: 'Download for Windows',
  },
  macos: {
    key: 'macos',
    label: 'macOS',
    shortLabel: 'macOS',
    subtitle: 'Apple Silicon & Intel Mac',
    installVerb: 'Download for macOS',
  },
};

/**
 * Detects the visitor's operating system from browser navigator signals.
 * Accepts optional overrides for deterministic unit testing.
 *
 * @param {object} [env]
 * @param {string} [env.userAgent]
 * @param {string} [env.platform]
 * @param {number} [env.maxTouchPoints]
 * @param {string} [env.userAgentDataPlatform]
 * @returns {{ platform: 'android'|'ios'|'windows'|'macos', detected: boolean }}
 */
export function detectOperatingSystem(env) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const userAgent = (env?.userAgent ?? nav.userAgent ?? '').toLowerCase();
  const platform = (env?.platform ?? nav.platform ?? '').toLowerCase();
  const maxTouchPoints = env?.maxTouchPoints ?? nav.maxTouchPoints ?? 0;
  const uaDataPlatform = (
    env?.userAgentDataPlatform ??
    nav.userAgentData?.platform ??
    ''
  ).toLowerCase();

  // Prefer User-Agent Client Hints when available
  if (uaDataPlatform) {
    if (uaDataPlatform.includes('android')) {
      return { platform: 'android', detected: true };
    }
    if (uaDataPlatform.includes('ios') || uaDataPlatform.includes('iphone') || uaDataPlatform.includes('ipad')) {
      return { platform: 'ios', detected: true };
    }
    if (uaDataPlatform.includes('win')) {
      return { platform: 'windows', detected: true };
    }
    if (uaDataPlatform.includes('mac')) {
      if (maxTouchPoints > 1) {
        return { platform: 'ios', detected: true };
      }
      return { platform: 'macos', detected: true };
    }
  }

  // Standard User-Agent / navigator.platform checks
  if (/android/.test(userAgent)) {
    return { platform: 'android', detected: true };
  }

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return { platform: 'ios', detected: true };
  }

  // iPadOS 13+ often reports Macintosh in UA with touch support
  if ((/macintosh|mac os x/.test(userAgent) || platform.includes('mac')) && maxTouchPoints > 1) {
    return { platform: 'ios', detected: true };
  }

  if (/win32|win64|windows|wow64/.test(userAgent) || platform.includes('win')) {
    return { platform: 'windows', detected: true };
  }

  if (/macintosh|mac os x|macintel|macppc|mac68k/.test(userAgent) || platform.includes('mac')) {
    return { platform: 'macos', detected: true };
  }

  // Default fallback when OS is Linux/unknown
  return { platform: 'windows', detected: false };
}

