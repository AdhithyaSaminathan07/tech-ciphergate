


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
        
    let pathPart = url;
    if (!url.includes('/')) {
        // Legacy file names (e.g., 1782191681341_461306.png)
        pathPart = `/uploads/workers/${url}`;
    } else if (!url.startsWith('/')) {
        pathPart = `/${url}`;
    }
    // For relative paths, use encodeURI to handle spaces but keep slashes and special chars
    // This avoids double encoding if the browser also tries to encode
    return `${origin}${encodeURI(pathPart)}`;
};
