import api from './api';

// Function to calculate distance between two coordinates using Haversine formula
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// Function to check if worker is within allowed location
export const isWorkerInAllowedLocation = async (subdomain, workerLat, workerLon) => {
  try {
    // Validate input parameters
    if (!subdomain || !workerLat || !workerLon) {
      return { 
        allowed: false, 
        message: 'Invalid parameters for location check' 
      };
    }
    
    // Fetch location settings using public endpoint
    const response = await api.get(`/settings/public/${subdomain}`);
    const settings = response.data;
    
    // If location restriction is not enabled, allow attendance from anywhere
    if (!settings.attendanceLocation || !settings.attendanceLocation.enabled) {
      return { allowed: true, message: 'Location restriction not enabled' };
    }
    
    // Get the allowed location coordinates and radius
    const { latitude, longitude, radius } = settings.attendanceLocation;
    
    // Validate that we have valid location data
    if (latitude === undefined || longitude === undefined || radius === undefined) {
      return { 
        allowed: false, 
        message: 'Invalid location settings configuration' 
      };
    }
    
    // Calculate distance between worker's location and allowed location
    const distance = calculateDistance(latitude, longitude, workerLat, workerLon);
    
    // Check if worker is within the allowed radius
    if (distance <= radius) {
      return { allowed: true, message: 'Worker is within allowed location', distance };
    } else {
      return { 
        allowed: false, 
        message: `Worker is ${Math.round(distance)} meters away from allowed location (max: ${radius} meters)`,
        distance 
      };
    }
  } catch (error) {
    console.error('Error checking location:', error);
    // If there's an error fetching settings, we might want to allow attendance
    // depending on the security requirements. For now, we'll deny to be safe.
    return { 
      allowed: false, 
      message: 'Error checking location settings: ' + (error.message || 'Unknown error'),
      error: error.message 
    };
  }
};

// Function to get current position using browser geolocation
export const getCurrentPosition = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let errorMessage = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions for this site.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'The request to get your location timed out.';
            break;
          default:
            errorMessage = 'An unknown error occurred while getting your location.';
            break;
        }
        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });
};