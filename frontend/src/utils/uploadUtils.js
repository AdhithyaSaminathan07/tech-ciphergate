/**
 * uploadUtils.js
 *
 * MIGRATED: No longer uses Supabase Storage (which was paused/deleted).
 * Now uploads directly to our own backend → saved in /uploads/workers/.
 * The file is served via Express static + Nginx on the production domain.
 *
 * Returns the public URL string (e.g. "/uploads/workers/1234_abc.jpg")
 * which can be rendered as <img src={url}> in any component.
 */

import api from '../services/api';

/**
 * @param {File} file - The image File object from an <input type="file">
 * @returns {Promise<string|null>} - The public URL path, or null on failure
 */
const uploadUtils = async (file) => {
  if (!file) {
    alert('Please select a file');
    return null;
  }

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const response = await api.post('/workers/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const url = response.data?.url;
    if (!url) throw new Error('No URL returned from server');

    return url; // e.g. "/uploads/workers/1714000000000_123456.jpg"
  } catch (error) {
    console.error('Photo upload failed:', error.response?.data || error.message);
    return null;
  }
};

export default uploadUtils;