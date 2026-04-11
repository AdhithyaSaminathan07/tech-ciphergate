import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import appContext from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import { putRfidAttendance } from '../../services/attendanceService';
import { getCurrentPosition, isWorkerInAllowedLocation } from '../../services/geolocationService';
import api from '../../services/api';
import Modal from '../common/Modal';

const RFIDAttendancePopup = ({ isOpen, onClose, subdomain, user }) => {
  const [rfid, setRfid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [attendanceLocation, setAttendanceLocation] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // Track cooldown remaining time

  // Update cooldown timer
  useEffect(() => {
    let timer;
    if (cooldownRemaining > 0) {
      timer = setInterval(() => {
        setCooldownRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Fetch attendance location settings
  const fetchAttendanceLocation = async () => {
    try {
      if (subdomain && subdomain !== 'main') {
        const response = await api.get(`/settings/public/${subdomain}`);
        if (response.data?.attendanceLocation?.enabled) {
          setAttendanceLocation(response.data.attendanceLocation);
        }
      }
    } catch (error) {
      console.error('Error fetching attendance location:', error);
    }
  };

  // Check location when component mounts
  useEffect(() => {
    const checkLocation = async () => {
      if (!isOpen) return;
      
      if (!subdomain || subdomain === 'main' || !user) {
        setLocationChecked(true);
        return;
      }
      
      // Fetch attendance location settings
      await fetchAttendanceLocation();
      
      try {
        // Get current position
        const position = await getCurrentPosition();
        const { latitude, longitude } = position;
        
        // Set current location state
        setCurrentLocation({ latitude, longitude, accuracy: position.accuracy });
        
        // Check if worker is in allowed location
        const locationResult = await isWorkerInAllowedLocation(subdomain, latitude, longitude);
        
        setLocationChecked(true);
        setLocationAllowed(locationResult.allowed);
        
        if (!locationResult.allowed) {
          // If location is not allowed, show an error
          toast.error(locationResult.message || 'Attendance not allowed from your current location.');
        }
      } catch (err) {
        console.error('Error checking location:', err);
        setLocationChecked(true);
        toast.error(`Location check failed: ${err.message || 'Unable to verify your location'}`);
      }
    };

    if (isOpen) {
      checkLocation();
    }
  }, [isOpen, subdomain, user]);

  const handleRfidSubmit = async (e) => {
    e.preventDefault();
    
    // Check if in cooldown period
    if (cooldownRemaining > 0) {
      toast.info(`Try punch in or punch out after 1 minute.`);
      return;
    }
    
    // Check if location is allowed before proceeding
    if (!locationAllowed) {
      toast.error('Attendance not allowed from your current location. Please move to the designated attendance area.');
      return;
    }
    
    if (!rfid.trim()) {
      toast.error('Please enter your RFID');
      return;
    }
    
    // Check if the entered RFID matches the logged-in worker's RFID
    if (user && user.rfid && user.rfid !== rfid.trim()) {
      toast.error('You can only mark attendance with your own RFID');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Mark RFID attendance
      const result = await putRfidAttendance({ rfid: rfid.trim() });
      
      // Check if the request was successful
      if (result.success === false) {
        // Show the custom message as an info toast
        toast.info(result.message || 'Try punch in or punch out after 1 minute.');
        
        // Set cooldown timer
        setCooldownRemaining(60); // 1 minute cooldown
        return;
      }
      
      // Show success message
      toast.success(result.message || 'Attendance marked successfully');
      
      // Set cooldown timer
      setCooldownRemaining(60); // 1 minute cooldown
      
      // Reset form
      setRfid('');
      
      // Close the modal after a short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('RFID attendance error:', err);
      toast.error(err.message || 'Failed to mark attendance');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setRfid('');
      setIsSubmitting(false);
      setLocationChecked(false);
      setLocationAllowed(false);
      setCurrentLocation(null);
      setAttendanceLocation(null);
      setCooldownRemaining(0);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="RFID Attendance"
      size="md"
    >
      <div className="p-4 md:p-6">
        {!locationChecked ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center py-8">
              <p className="text-gray-600 font-medium">
                Checking your location...
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {/* Location Information */}
            {attendanceLocation && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Attendance Location Information</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        Attendance is restricted to within {attendanceLocation.radius} meters of coordinates: {attendanceLocation.latitude.toFixed(6)}, {attendanceLocation.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Cooldown Timer */}
            {cooldownRemaining > 0 && (
              <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Attendance Cooldown</h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        You can mark attendance again in <span className="font-medium">{cooldownRemaining}</span> seconds.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="bg-white rounded-xl p-6">
              {/* Location Status */}
              <div className={`mb-6 p-4 rounded-lg text-center ${
                locationAllowed 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <p className="font-medium">
                  {locationAllowed 
                    ? '✓ You are within the allowed attendance area' 
                    : '✗ You are outside the allowed attendance area'}
                </p>
                {currentLocation && (
                  <p className="text-sm mt-1">
                    Current location: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)} 
                    (±{Math.round(currentLocation.accuracy)}m)
                  </p>
                )}
              </div>
              
              {!locationAllowed ? (
                <div className="text-center py-8">
                  <p className="text-red-600 font-medium">
                    Attendance not allowed from your current location. Please move to the designated attendance area.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-6">
                    Welcome, {user?.name}! Please enter your RFID to mark attendance.
                  </p>
                  
                  {user?.rfid && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <span className="font-medium">Your RFID:</span> {user.rfid}
                      </p>
                    </div>
                  )}
                  
                  <form onSubmit={handleRfidSubmit} className="max-w-md mx-auto">
                    <div className="mb-6">
                      <label htmlFor="rfid" className="block text-sm font-medium text-gray-700 mb-2">
                        RFID Number
                      </label>
                      <input
                        type="text"
                        id="rfid"
                        value={rfid}
                        onChange={(e) => setRfid(e.target.value)}
                        placeholder="Enter your RFID"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSubmitting || cooldownRemaining > 0}
                      />
                    </div>
                    
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSubmitting || !rfid.trim() || cooldownRemaining > 0}
                      className="w-full flex items-center justify-center"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Marking Attendance...
                        </>
                      ) : cooldownRemaining > 0 ? (
                        `Wait ${cooldownRemaining}s`
                      ) : (
                        'Mark Attendance'
                      )}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RFIDAttendancePopup;