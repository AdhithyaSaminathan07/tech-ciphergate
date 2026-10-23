/**
 * Tenant and Subdomain Resolution Utilities
 * 
 * Provides consistent tenant resolution across the frontend application.
 * Handles production hostnames, custom domains, localhost, ports,
 * authenticated user state, and localStorage persistence.
 */

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'main',
  'dev',
  'stage',
  'staging',
  'test',
  'ciphergate',
  'mail',
  'smtp',
  'ftp',
  'status',
  'localhost'
]);

/**
 * Extracts tenant subdomain from a hostname string.
 * Correctly handles localhost, IP addresses, custom domains, and ports.
 * 
 * @param {string} [hostname] - Defaults to window.location.hostname
 * @returns {string|null} - The tenant subdomain or null if none
 */
export const extractSubdomainFromHostname = (hostname) => {
  try {
    const rawHost = hostname || (typeof window !== 'undefined' ? window.location?.hostname : null);
    if (!rawHost || typeof rawHost !== 'string') return null;

    // Strip port if present (e.g., localhost:5173 or tenant.localhost:5173)
    const hostWithoutPort = rawHost.split(':')[0].trim().toLowerCase();

    // Check for IP addresses (IPv4 or IPv6)
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort);
    if (isIPv4 || hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1') {
      return null;
    }

    // Handle *.localhost (e.g. tenant.localhost)
    if (hostWithoutPort.endsWith('.localhost')) {
      const parts = hostWithoutPort.split('.');
      if (parts.length >= 2 && parts[0] && !RESERVED_SUBDOMAINS.has(parts[0])) {
        return parts[0];
      }
      return null;
    }

    const parts = hostWithoutPort.split('.');
    
    // Minimum 3 parts required for a subdomain on a standard domain (e.g., tenant.domain.com)
    // For 4 parts: tenant.ciphergate.techvaseegrah.com -> tenant
    // For 3 parts: ciphergate.techvaseegrah.com -> ciphergate (reserved, so returns null)
    if (parts.length >= 3) {
      const candidate = parts[0];
      if (candidate && !RESERVED_SUBDOMAINS.has(candidate)) {
        return candidate;
      }
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Retrieves the stored subdomain from browser storage.
 * Checks both 'tasktracker-subdomain' and 'subdomain' keys.
 * 
 * @returns {string|null}
 */
export const getStoredSubdomain = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const tasktrackerSubdomain = window.localStorage.getItem('tasktracker-subdomain');
    if (tasktrackerSubdomain && tasktrackerSubdomain !== 'main' && tasktrackerSubdomain !== 'undefined' && tasktrackerSubdomain !== 'null') {
      return tasktrackerSubdomain.trim();
    }
    const legacySubdomain = window.localStorage.getItem('subdomain');
    if (legacySubdomain && legacySubdomain !== 'main' && legacySubdomain !== 'undefined' && legacySubdomain !== 'null') {
      return legacySubdomain.trim();
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Persists the tenant subdomain across all expected localStorage keys.
 * 
 * @param {string} subdomain
 */
export const persistTenantSubdomain = (subdomain) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (subdomain && subdomain !== 'main' && subdomain !== 'undefined' && subdomain !== 'null') {
      const trimmed = subdomain.trim();
      window.localStorage.setItem('tasktracker-subdomain', trimmed);
      window.localStorage.setItem('subdomain', trimmed);
    }
  } catch (err) {
    console.warn('Failed to persist tenant subdomain:', err);
  }
};

/**
 * Clears stored tenant subdomains.
 */
export const clearStoredSubdomain = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem('tasktracker-subdomain');
    window.localStorage.removeItem('subdomain');
  } catch (err) {
    console.warn('Failed to clear stored subdomain:', err);
  }
};

/**
 * Resolves the effective tenant subdomain from multiple sources in priority order:
 * 1. Authenticated user object (user.subdomain) - most authoritative
 * 2. Active React context subdomain (if not 'main')
 * 3. LocalStorage ('tasktracker-subdomain' / 'subdomain')
 * 4. Hostname extraction (URL subdomain)
 * 
 * @param {Object|null} [user] - Authenticated user object from AuthContext
 * @param {string|null} [contextSubdomain] - Subdomain from AppContext
 * @returns {string|null}
 */
export const resolveTenantSubdomain = (user = null, contextSubdomain = null) => {
  // 1. Authenticated user's subdomain
  if (user?.subdomain && user.subdomain !== 'main' && user.subdomain !== 'undefined' && user.subdomain !== 'null') {
    return user.subdomain.trim();
  }

  // 2. Explicit context subdomain
  if (contextSubdomain && contextSubdomain !== 'main' && contextSubdomain !== 'undefined' && contextSubdomain !== 'null') {
    return contextSubdomain.trim();
  }

  // 3. Stored in localStorage
  const stored = getStoredSubdomain();
  if (stored) {
    return stored;
  }

  // 4. Hostname subdomain extraction
  const fromHost = extractSubdomainFromHostname();
  if (fromHost) {
    return fromHost;
  }

  return null;
};
