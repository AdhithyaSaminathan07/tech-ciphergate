import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import appContext from '../../context/AppContext';
import FaceAttendance from '../admin/FaceAttendance';
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import { getCurrentPosition, isWorkerInAllowedLocation } from '../../services/geolocationService';
import { toast } from 'react-toastify';
import api from '../../services/api';

const FaceAttendancePage = () => {
  const { subdomain } = useContext(appContext);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showFaceAttendance, setShowFaceAttendance] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
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
        
        // Check if worker is in allowed location
        const locationResult = await isWorkerInAllowedLocation(subdomain, latitude, longitude);
        
        setLocationChecked(true);
        setLocationAllowed(locationResult.allowed);
        
        // Note: We don't automatically show the face attendance modal anymore
        // It will be shown when the user clicks the button in the popup
      } catch (err) {
        console.error('Error checking location:', err);
        setLocationChecked(true);
        toast.error(`Location check failed: ${err.message || 'Unable to verify your location'}`);
      }
    };

    checkLocation();
  }, [subdomain, user]);

  const handleModalClose = () => {
    setShowFaceAttendance(false);
    // Navigate back to the worker dashboard
    navigate('/worker');
  };

  if (!locationChecked) {
    return (
      <div className="p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Face Attendance</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">Face Attendance</h1>
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
        <p className="text-gray-600 mb-4">
          Welcome, {user?.name}! Please position your face within the circular frame for attendance recognition.
        </p>
        
        {subdomain && subdomain !== 'main' && user && locationAllowed ? (
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Click the button below to start face recognition for attendance.
            </p>
            <Button 
              variant="primary" 
              onClick={() => setShowFaceAttendance(true)}
              className="px-6 py-3"
            >
              Start Face Recognition
            </Button>
            
            {/* Face Attendance Modal */}
            <FaceAttendance 
              subdomain={subdomain} 
              isOpen={showFaceAttendance} 
              onClose={handleModalClose} 
              workerMode={true}
              currentWorker={user}
            />
          </div>
        ) : !locationAllowed ? (
          <div className="text-center py-8">
            <p className="text-red-600 font-medium">
              Attendance not allowed from your current location. Please move to the designated attendance area.
            </p>
            <p className="text-gray-600 mt-2">
              You will be redirected to the dashboard shortly.
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-red-600 font-medium">
              Unable to load face attendance system. Please check your subdomain settings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceAttendancePage;