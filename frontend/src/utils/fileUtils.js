


/**
 * Ensures a file URL is absolute.
 * If it starts with http or https, it's returned as is.
 * Otherwise, it's prefixed with the backend base URL (derived from api.defaults.baseURL).
 */
export const getFullFileUrl = (url) => {
    if (!url) return '';
    
    // If it's already a full URL, use it as is (URL constructor handles encoding)
    if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
            const urlObj = new URL(url);
            return urlObj.toString();
        } catch (e) {
            return url;
        }
    }

    // Handle relative paths
    const baseURL = import.meta.env.VITE_API_URL || '';
    const origin = baseURL.startsWith('http') 
        ? new URL(baseURL).origin 
        : window.location.origin;
        
    const pathPart = url.startsWith('/') ? url : `/${url}`;
    
    // For relative paths, use encodeURI to handle spaces but keep slashes and special chars
    // This avoids double encoding if the browser also tries to encode
    return `${origin}${encodeURI(pathPart)}`;
};
