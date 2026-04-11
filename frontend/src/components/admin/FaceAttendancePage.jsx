import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import appContext from '../../context/AppContext';
import FaceAttendance from './FaceAttendance';
import Button from '../common/Button';

const FaceAttendancePage = () => {
  const { subdomain } = useContext(appContext);
  const navigate = useNavigate();
  const [showFaceAttendance, setShowFaceAttendance] = useState(true);

  const handleModalClose = () => {
    setShowFaceAttendance(false);
    // Navigate back to the admin dashboard
    navigate('/admin');
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Face Attendance</h1>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          Back to Dashboard
        </Button>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-gray-600 mb-4">
          Position a worker's face within the circular frame for attendance recognition.
        </p>
        
        {subdomain && subdomain !== 'main' ? (
          <FaceAttendance 
            subdomain={subdomain} 
            isOpen={showFaceAttendance} 
            onClose={handleModalClose} 
            workerMode={false}
          />
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