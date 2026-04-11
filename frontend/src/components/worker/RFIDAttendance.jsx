import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import appContext from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import { getCurrentPosition, isWorkerInAllowedLocation } from '../../services/geolocationService';
import api from '../../services/api';
import RFIDAttendancePopup from './RFIDAttendancePopup';

const RFIDAttendance = () => {
  const { subdomain } = useContext(appContext);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showRFIDAttendance, setShowRFIDAttendance] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [attendanceLocation, setAttendanceLocation] = useState(null);

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
      } catch (err) {
        console.error('Error checking location:', err);
        setLocationChecked(true);
        toast.error(`Location check failed: ${err.message || 'Unable to verify your location'}`);
      }
    };

    checkLocation();
  }, [subdomain, user]);

  const handleModalClose = () => {
    setShowRFIDAttendance(false);
    // Navigate back to dashboard after a short delay
    setTimeout(() => {
      navigate('/worker');
    }, 500);
  };

  if (!locationChecked) {
    return (
      <div className="p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">RFID Attendance</h1>
          <Button variant="outline" onClick={() => navigate('/worker')}>
            Back to Dashboard
          </Button>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center py-8">
            <p className="text-gray-600 font-medium">
              Checking your location...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">RFID Attendance</h1>
        <Button variant="outline" onClick={() => navigate('/worker')}>
          Back to Dashboard
        </Button>
      </div>
      
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
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
            <p className="text-gray-600 mt-2">
              You will be redirected to the dashboard shortly.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Welcome, {user?.name}! Click the button below to enter your RFID for attendance.
            </p>
            <Button 
              variant="primary" 
              onClick={() => setShowRFIDAttendance(true)}
              className="px-6 py-3"
            >
              Enter RFID
            </Button>
            
            {/* RFID Attendance Modal */}
            <RFIDAttendancePopup
              isOpen={showRFIDAttendance}
              onClose={handleModalClose}
              subdomain={subdomain}
              user={user}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RFIDAttendance;