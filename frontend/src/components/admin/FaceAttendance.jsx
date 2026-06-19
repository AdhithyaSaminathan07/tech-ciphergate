import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { toast } from 'react-toastify';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import { getWorkers, getWorkerById } from '../../services/workerService';
import { putAttendance, getWorkerLastAttendance } from '../../services/attendanceService';
import { getCurrentPosition, isWorkerInAllowedLocation } from '../../services/geolocationService';
import { AlertCircle, MapPin, Smile, UserCheck, CheckCircle2, ShieldAlert } from 'lucide-react';

const FaceAttendance = ({ subdomain, isOpen, onClose, workerMode = false, currentWorker = null, onAttendanceMarked }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [matchedWorker, setMatchedWorker] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [attendanceType, setAttendanceType] = useState(''); // 'Punch In' or 'Punch Out'
  const [locationChecked, setLocationChecked] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null); // State for current location

  // Load face detection models
  useEffect(() => {
    const loadModels = async () => {
      if (!isOpen || isModelLoaded) return;
      
      try {
        // Load models with better error handling and optimization
        // Using SsdMobilenetv1 for better accuracy and MtcnnOptions for face detection
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setIsModelLoaded(true);
        setError('');
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Failed to load face detection models. Please ensure model files are correctly downloaded and browser cache is cleared.');
      }
    };

    loadModels();
  }, [isOpen, isModelLoaded]);

  // Check location when modal opens
  useEffect(() => {
    const checkLocation = async () => {
      if (!isOpen || !subdomain || locationChecked) return;
      
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
          setError(locationResult.message);
          // In worker mode, close the modal immediately if location is not allowed
          if (workerMode) {
            setTimeout(() => {
              onClose();
            }, 3000); // Close after 3 seconds to allow user to read the error message
          }
        }
      } catch (err) {
        console.error('Error checking location:', err);
        setError(`Location check failed: ${err.message}. Attendance may be restricted based on location settings.`);
        // In worker mode, close the modal after error
        if (workerMode) {
          setTimeout(() => {
            onClose();
          }, 3000); // Close after 3 seconds to allow user to read the error message
        }
      }
    };

    checkLocation();
  }, [isOpen, subdomain, locationChecked, workerMode, onClose]);

  // Load workers with face embeddings
  useEffect(() => {
    const loadWorkers = async () => {
      if (!isOpen || !subdomain) return;
      
      // In worker mode, ensure currentWorker is provided
      if (workerMode && !currentWorker) {
        setError('Worker data not available. Please try again.');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError('');
      
      try {
        let workersData;
        if (workerMode && currentWorker) {
          // In worker mode, fetch the current worker's data with face embeddings
          const workerData = await getWorkerById(currentWorker._id);
          workersData = [workerData];
        } else {
          // In admin mode, load all workers
          workersData = await getWorkers({ subdomain });
        }
        
        // Filter workers who have face embeddings (at least one)
        const workersWithFaces = workersData.filter(worker => 
          worker.faceEmbeddings && worker.faceEmbeddings.length > 0
        );
        setWorkers(workersWithFaces);
      } catch (err) {
        console.error('Error loading workers:', err);
        setError('Failed to load employee data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkers();
  }, [isOpen, subdomain, workerMode, currentWorker]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setMatchedWorker(null);
      setShowConfirmation(false);
      setError('');
      setIsProcessing(false);
      setAttendanceType('');
      setLocationChecked(false);
      setLocationAllowed(true);
      setCurrentLocation(null); // Reset current location
    }
  }, [isOpen]);

  // Check if face is within the circular frame
  const isFaceInFrame = (detection, canvas) => {
    if (!detection || !canvas) return false;
    
    const box = detection.box;
    const canvasCenterX = canvas.width / 2;
    const canvasCenterY = canvas.height / 2;
    const frameRadius = Math.min(canvas.width, canvas.height) * 0.3; // 30% of smaller dimension
    
    // Calculate face center
    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;
    
    // Calculate distance from face center to canvas center
    const distance = Math.sqrt(
      Math.pow(faceCenterX - canvasCenterX, 2) + 
      Math.pow(faceCenterY - canvasCenterY, 2)
    );
    
    // Check if face is within the circular frame with improved accuracy
    // Added stricter size requirements for better face positioning
    return distance <= frameRadius && 
           box.width >= canvas.width * 0.25 && // Increased from 20% to 25% for better face size
           box.height >= canvas.height * 0.25 && // Increased from 20% to 25% for better face size
           box.width <= canvas.width * 0.7 && // Added max size constraint to prevent too close faces
           box.height <= canvas.height * 0.7; // Added max size constraint to prevent too close faces
  };

  // Draw circular frame on canvas
  const drawFrame = (canvas) => {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    // Ensure canvas has valid dimensions
    if (canvas.width <= 0 || canvas.height <= 0) {
      console.warn('Canvas has invalid dimensions:', canvas.width, canvas.height);
      return;
    }
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.3;
    
    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw circular frame
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw center marker
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.fill();
  };

  // Recognize face from webcam and mark attendance
  const recognizeFaceAndMark = async () => {
    // Check if location is allowed before proceeding
    if (!locationAllowed) {
      setError('Attendance not allowed from your current location. Please move to the designated attendance area.');
      // In worker mode, close the modal after showing the error
      if (workerMode) {
        setTimeout(() => {
          onClose();
        }, 3000); // Close after 3 seconds to allow user to read the error message
      }
      return;
    }
    
    // In worker mode, ensure we have the current worker data
    if (workerMode && !currentWorker) {
      setError('Worker data not available. Please try again.');
      return;
    }
    
    // In worker mode, ensure we only have the current worker's data
    if (workerMode && workers.length !== 1) {
      setError('Invalid worker data. Please try again.');
      return;
    }
    
    // In worker mode, ensure the worker in the array matches the currentWorker
    if (workerMode && workers[0].rfid !== currentWorker.rfid) {
      setError('Worker data mismatch. Please try again.');
      return;
    }
    
    if (!webcamRef.current || !isModelLoaded || !workers.length) {
      setError('Models not loaded or no registered employees with face data.');
      return;
    }

    const video = webcamRef.current.video;
    // Validate video element
    if (!video) {
      setError('Camera not accessible. Please ensure you have granted camera permissions.');
      return;
    }
    
    // Wait for video to be ready
    if (video.readyState !== 4) {
      // Video not ready, wait a bit and try again
      if (video.networkState === video.NETWORK_LOADING || video.networkState === video.NETWORK_IDLE) {
        // Video is still loading, wait a moment
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced wait time
        if (video.readyState !== 4) {
          setError('Camera not ready. Please wait a moment and try again.');
          return;
        }
      } else {
        setError('Camera not ready. Please wait a moment and try again.');
        return;
      }
    }

    // Validate video dimensions
    const videoWidth = video.videoWidth || video.width;
    const videoHeight = video.videoHeight || video.height;
    
    if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
      setError('Camera not providing valid video feed. Please check your camera connection.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setMatchedWorker(null);

    try {
      // Detect face and get descriptor (embedding) with optimized options for speed and accuracy
      // Using SsdMobilenetv1 with optimized parameters for faster detection
      const detections = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ 
          minConfidence: 0.7,
          maxResults: 1 // Only return the best result
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      // Draw circular frame even when no face is detected
      const canvas = canvasRef.current;
      if (canvas) {
        // Ensure canvas dimensions match video
        const displaySize = { 
          width: video.videoWidth || video.width || 640, 
          height: video.videoHeight || video.height || 480 
        };
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        drawFrame(canvas);
      }

      if (detections) {
        // Comprehensive validation of detection results
        if (!detections.detection || !detections.detection.box) {
          setError('Face detection failed. Please ensure your face is clearly visible.');
          setIsProcessing(false);
          return;
        }
        
        const box = detections.detection.box;
        if (box.width <= 0 || box.height <= 0 || 
            !isFinite(box.width) || !isFinite(box.height)) {
          setError('Invalid face detection dimensions. Please ensure your face is clearly visible.');
          setIsProcessing(false);
          return;
        }

        // Draw detection on canvas for visual feedback
        const displaySize = { 
          width: video.videoWidth || video.width || 640, 
          height: video.videoHeight || video.height || 480 
        };
        
        // Validate display size
        if (displaySize.width <= 0 || displaySize.height <= 0) {
          setError('Invalid display dimensions. Please refresh the page.');
          setIsProcessing(false);
          return;
        }
        
        // Ensure canvas is properly initialized
        const canvas = canvasRef.current;
        if (!canvas) {
          setError('Canvas not available. Please refresh the page.');
          setIsProcessing(false);
          return;
        }
        
        // Set canvas dimensions explicitly
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        
        faceapi.matchDimensions(canvas, displaySize);
        
        // Draw circular frame
        drawFrame(canvas);
        
        // Validate that resize operation will work
        try {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          
          // Additional validation after resizing
          if (!resizedDetections.detection || !resizedDetections.detection.box ||
              resizedDetections.detection.box.width <= 0 || resizedDetections.detection.box.height <= 0 ||
              !isFinite(resizedDetections.detection.box.width) || !isFinite(resizedDetections.detection.box.height)) {
            setError('Face detection processing failed. Please try again.');
            setIsProcessing(false);
            return;
          }
          
          // Check if face is within the circular frame
          if (!isFaceInFrame(resizedDetections.detection, canvas)) {
            setError('Please position your face within the circular frame.');
            setIsProcessing(false);
            return;
          }
          
          // Safely draw face detection
          try {
            faceapi.draw.drawDetections(canvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
          } catch (drawError) {
            console.warn('Error drawing face detection:', drawError);
            // Continue with recognition even if drawing fails
          }

          // Create labeled face descriptors from stored embeddings
          const labeledFaceDescriptors = workers.map(worker => {
            // Convert stored embeddings to Float32Array as required by face-api.js
            // Each worker has multiple embeddings (5), so we create multiple descriptors per worker
            const descriptors = worker.faceEmbeddings.map(embedding => new Float32Array(embedding));
            return new faceapi.LabeledFaceDescriptors(worker.rfid, descriptors);
          });

          // Create face matcher with optimized threshold for better accuracy and speed
          // Lower threshold means higher accuracy but might miss some matches
          const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.35); // Slightly higher threshold for faster matching
          
          // Find best match for the detected face
          const bestMatch = faceMatcher.findBestMatch(detections.descriptor);

          console.log('Best match result:', bestMatch);

          // Improved matching criteria for better accuracy
          if (bestMatch && bestMatch.label !== 'unknown' && bestMatch.distance < 0.4) { // Slightly higher threshold for faster matching
            // Find the matching worker
            const worker = workers.find(w => w.rfid === bestMatch.label);
            if (worker) {
              // Worker-specific validation: In worker mode, ensure the detected face belongs to the current worker
              if (workerMode) {
                if (worker.rfid !== currentWorker.rfid) {
                  setError('Face recognition failed. You can only mark attendance with your own face.');
                  setIsProcessing(false);
                  return;
                }
              }
              
              // Set the matched worker
              setMatchedWorker(worker);
              
              // Determine if it's Punch In or Punch Out based on last attendance
              try {
                const lastAttendanceResponse = await getWorkerLastAttendance(worker.rfid, subdomain);
                console.log('Last attendance data:', lastAttendanceResponse);
                // The backend returns the next action in presence field
                // If presence = true, next action is Punch In
                // If presence = false, next action is Punch Out
                // Ensuring consistency with RFID attendance logic:
                const nextAction = lastAttendanceResponse.presence ? 'Punch In' : 'Punch Out';
                console.log('Setting attendance type to:', nextAction);
                setAttendanceType(nextAction);
                
                // Directly mark attendance without confirmation popup
                await handleDirectAttendance(worker, nextAction, subdomain);
              } catch (attendanceError) {
                console.error('Error getting last attendance:', attendanceError);
                // Provide more specific error messages for different error types
                if (attendanceError.message && attendanceError.message.includes('403')) {
                  setError('Access denied. You can only mark attendance with your own face.');
                } else {
                  setError('Unable to determine attendance action. Please try again.');
                }
                setIsProcessing(false);
                // Don't show confirmation popup when we can't determine the correct action
                return;
              }

            }
          } else {
            setError('No matching employee found. Please try again or ensure your face is properly registered.');
          }
        } catch (resizeError) {
          console.error('Error resizing detection:', resizeError);
          setError('Failed to resize face detection. Please try again.');
        }
      } else {
        setError('No face detected. Please make sure your face is clearly visible and positioned within the circular frame.');
      }
    } catch (err) {
      console.error('Error recognizing face:', err);
      // Provide more specific error messages based on the error type
      if (err.message && err.message.includes('resizeResults')) {
        setError('Face detection processing failed. Please ensure your camera is working and refresh the page.');
      } else if (err.message && err.message.includes('tensor')) {
        setError('Model loading error. Please clear browser cache and refresh the page.');
      } else {
        setError('Failed to recognize face. Please try again. (' + (err.message || 'Unknown error') + ')');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle direct attendance without confirmation
  const handleDirectAttendance = async (worker, nextAction, subdomain) => {
    if (!worker || !subdomain) return;

    try {
      // Pass the attendanceType (Punch In/Punch Out) to determine the presence state
      // Ensuring consistency with RFID attendance logic:
      // When attendanceType is 'Punch In', presence should be true
      // When attendanceType is 'Punch Out', presence should be false
      const presence = nextAction === 'Punch In';
      console.log('Direct attendance - attendanceType:', nextAction, 'presence:', presence);
      
      // Send the presence value to backend, which will use it directly
      const result = await putAttendance({ rfid: worker.rfid, subdomain, presence });
      
      // Check if the request was successful
      if (result.success === false) {
        // Show the custom message as an info toast
        toast.info(result.message || 'Try punch in or punch out after 1 minute.');
        return;
      }
      
      // Show success message with current punch status
      toast.success(`Attendance marked: ${nextAction}`);
      
      // Call the callback to notify the parent component
      if (onAttendanceMarked) {
        onAttendanceMarked();
      }
      
      // Close the modal after successful attendance
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (attendanceError) {
      console.error('Attendance marking error:', attendanceError);
      // Check if it's an authorization error
      if (attendanceError.response && attendanceError.response.status === 403) {
        setError('You can only mark attendance with your own face.');
      } else {
        setError('Failed to mark attendance. Please try again.');
      }
    }
  };

  // Auto-detection loop - Increased frequency for faster scanning
  useEffect(() => {
    let interval;
    if (isOpen && isModelLoaded && !showConfirmation && !isProcessing) {
      interval = setInterval(() => {
        if (!isProcessing) {
          recognizeFaceAndMark();
        }
      }, 500); // Check every 0.5 seconds for much faster scanning (reduced from 1.5 seconds)
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, isModelLoaded, showConfirmation, isProcessing]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Face Attendance"
        size="md"
      >
        <div className="py-2">
          {!isModelLoaded ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Spinner size="lg" className="text-teal-600" />
              <p className="mt-4 text-base font-semibold text-slate-800">Initializing Biometric Models</p>
              <p className="mt-1 text-sm text-slate-400 max-w-[280px]">Setting up face detection and landmarks recognition. Please wait...</p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Spinner size="lg" className="text-teal-600" />
              <p className="mt-4 text-base font-semibold text-slate-800">Loading Database</p>
              <p className="mt-1 text-sm text-slate-400">Syncing registered employee face descriptors...</p>
            </div>
          ) : showConfirmation && matchedWorker ? (
            <div className="text-center py-6 px-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <img
                    src={matchedWorker.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(matchedWorker.name)}&background=10B981&color=fff`}
                    alt={matchedWorker.name}
                    className="w-24 h-24 rounded-full object-cover border-4 border-emerald-500 shadow-md"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(matchedWorker.name)}&background=10B981&color=fff`;
                    }}
                  />
                  <div className="absolute -bottom-1.5 -right-1.5 bg-emerald-500 text-white p-1 rounded-full border-2 border-white shadow-sm">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Attendance Recorded!</h3>
              <p className="text-sm font-semibold text-slate-700">{matchedWorker.name}</p>
              <p className="font-mono text-xs text-slate-400 mb-4">ID: {matchedWorker.rfid}</p>
              <div className="inline-block mb-5">
                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold shadow-sm ${
                  attendanceType === 'Punch In' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}>
                  {attendanceType}
                </span>
              </div>
              <div className="pt-4 border-t border-slate-200/60">
                <p className="text-xs text-slate-400">Please wait 2 minutes before your next punch.</p>
              </div>
            </div>
          ) : (
            <div className="face-attendance-container">
              {/* Location Information */}
              {locationChecked && (
                <div className={`mb-5 p-4 rounded-2xl border text-center shadow-sm flex flex-col items-center gap-1.5 ${ 
                  locationAllowed 
                    ? 'bg-emerald-50/70 text-emerald-800 border-emerald-100' 
                    : 'bg-rose-50/70 text-rose-800 border-rose-100' 
                }`}>
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {locationAllowed ? (
                      <>
                        <MapPin size={16} className="text-emerald-600" />
                        <span>Inside Authorized Location Boundary</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={16} className="text-rose-600" />
                        <span>Outside Allowed Location Boundary</span>
                      </>
                    )}
                  </div>
                  {currentLocation && (
                    <p className="text-xs font-mono text-slate-500">
                      GPS: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)} 
                      (±{Math.round(currentLocation.accuracy)}m)
                    </p>
                  )}
                </div>
              )}

              <div className="webcam-container relative mb-5 overflow-hidden rounded-2xl border-2 border-slate-100 shadow-lg bg-slate-950">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ 
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30, min: 15 }
                  }}
                  className="w-full h-auto object-cover aspect-video"
                />
                <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
              </div>

              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessing ? 'bg-indigo-400' : 'bg-emerald-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isProcessing ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
                  </span>
                  <span className="text-xs font-bold text-slate-600 tracking-wide uppercase">
                    {isProcessing ? 'Recognizing...' : 'Live Camera Scanner'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700 mt-2">
                  {isProcessing ? 'Analyzing biometric landmarks...' : 'Align face within the visual overlay'}
                </p>
              </div>

              {error && (
                <div className="mb-5 p-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
                  <span className="font-semibold text-left">{error}</span>
                </div>
              )}

              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold">Security Status</span>
                <span className="font-mono bg-slate-200/80 px-2 py-0.5 rounded text-slate-650 font-medium">
                  {isProcessing ? 'Verifying descriptor...' : 'Waiting...'}
                </span>
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs font-semibold text-slate-400 flex items-center justify-center gap-1">
                  <Smile size={13} className="text-slate-400" />
                  <span>Enrolled employees face models: {workers.length}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default FaceAttendance;