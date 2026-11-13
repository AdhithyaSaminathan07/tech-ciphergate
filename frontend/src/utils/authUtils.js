export const getAuthToken = () => {
  return localStorage.getItem('token');
};

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
};

const PUBLIC_ROUTE_PREFIXES = [
  '/installed-apps',
  '/admin/login',
  '/admin/register',
  '/worker/login',
  '/quick-test',
  '/forgot-password',
  '/reset-password',
];

/**
 * Checks whether a pathname belongs to a public route that must never be
 * redirected to a login page on unauthenticated API responses.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export const isPublicAuthExemptPath = (pathname = '/') => {
  const normalized = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (normalized === '/') {
    return true;
  }
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
};

/**
 * Returns the login redirect target when a refresh-token attempt fails,
 * or `null` when the visitor is on a public route (such as /installed-apps).
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export const getAuthFailureRedirectPath = (pathname = '/') => {
  if (isPublicAuthExemptPath(pathname)) {
    return null;
  }
  if (pathname.startsWith('/worker')) {
    return '/worker/login';
  }
  if (pathname.startsWith('/admin')) {
    return '/admin/login';
  }
  return null;
};