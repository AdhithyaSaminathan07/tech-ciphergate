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
import api from '../../services/api';

const FaceAttendance = ({ subdomain, isOpen, onClose, workerMode = false, currentWorker = null, onAttendanceMarked }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const activeScanner = useRef(null);
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
  const [scannerStatus, setScannerStatus] = useState('Initializing camera...');
  const [faceConfig, setFaceConfig] = useState({
    detectorType: 'tinyFaceDetector',
    matchingThreshold: 0.50
  });
  const [loadedDetector, setLoadedDetector] = useState(null);

  // Fetch face recognition settings
  useEffect(() => {
    const fetchFaceConfig = async () => {
      if (!isOpen || !subdomain) return;
      try {
        const res = await api.get(`/settings/public/${subdomain}`);
        if (res.data?.faceRecognition) {
          setFaceConfig(res.data.faceRecognition);
        }
      } catch (err) {
        console.error('Error fetching face config:', err);
      }
    };
    fetchFaceConfig();
  }, [isOpen, subdomain]);

  // Load face detection models dynamically
  useEffect(() => {
    const loadModels = async () => {
      if (!isOpen) return;
      const targetDetector = faceConfig.detectorType || 'tinyFaceDetector';
      
      // Skip loading if already loaded
      if (isModelLoaded && loadedDetector === targetDetector) return;
      
      setIsModelLoaded(false);
      setScannerStatus('Loading AI models...');
      try {
        if (targetDetector === 'tinyFaceDetector') {
          await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        } else {
          await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        }
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setIsModelLoaded(true);
        setLoadedDetector(targetDetector);
        setScannerStatus('Camera starting up...');
        setError('');
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Failed to load face detection models. Please ensure model files are correctly downloaded and browser cache is cleared.');
      }
    };

    loadModels();
  }, [isOpen, faceConfig.detectorType]);

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
      setScannerStatus('Live Camera Scanner');
      if (activeScanner.current) {
        clearTimeout(activeScanner.current);
        activeScanner.current = null;
      }
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
    // Relaxed size requirements for better distance compatibility (ZKTeco style)
    return distance <= frameRadius && 
           box.width >= canvas.width * 0.15 && // Relaxed to 15% for ZKTeco-style range
           box.height >= canvas.height * 0.15 && // Relaxed to 15% for ZKTeco-style range
           box.width <= canvas.width * 0.8 && // Allowed slightly closer faces (up to 80%)
           box.height <= canvas.height * 0.8;
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

  // Preprocess low light using temporary canvas and brightness threshold
  const preprocessLowLight = (video) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth || video.width || 640;
    tempCanvas.height = video.videoHeight || video.height || 480;
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) return video;
    
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    try {
      const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imgData.data;
      let totalLuminance = 0;
      const step = 8;
      let count = 0;
      for (let i = 0; i < data.length; i += 4 * step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += luminance;
        count++;
      }
      
      const avgBrightness = totalLuminance / count;
      
      if (avgBrightness < 85) {
        ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.filter = 'brightness(1.50) contrast(1.20) saturate(1.10)';
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.filter = 'none';
      }
    } catch (e) {
      console.warn('Low light pre-processing failed, using raw video feed:', e);
    }
    
    return tempCanvas;
  };

  // Recognize face from webcam and mark attendance
  const recognizeFaceAndMark = async () => {
    // Check if location is allowed before proceeding
    if (!locationAllowed) {
      setError('Attendance not allowed from your current location. Please move to the designated attendance area.');
      if (workerMode) {
        setTimeout(() => {
          onClose();
        }, 3000);
      }
      return;
    }
    
    if (workerMode && !currentWorker) {
      setError('Worker data not available. Please try again.');
      return;
    }
    
    if (workerMode && workers.length !== 1) {
      setError('Invalid worker data. Please try again.');
      return;
    }
    
    if (workerMode && workers[0].rfid !== currentWorker.rfid) {
      setError('Worker data mismatch. Please try again.');
      return;
    }
    
    if (!webcamRef.current || !isModelLoaded || !workers.length) {
      return; // Silently wait
    }

    const video = webcamRef.current.video;
    if (!video) {
      return; // Silently wait for camera warmup
    }
    
    if (video.readyState !== 4) {
      setScannerStatus('Camera warming up...');
      return; // Silently wait
    }

    const videoWidth = video.videoWidth || video.width;
    const videoHeight = video.videoHeight || video.height;
    
    if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
      return; // Silently wait for valid dimensions
    }

    setIsProcessing(true);

    try {
      const processedVideo = preprocessLowLight(video);

      const detector = faceConfig.detectorType || 'tinyFaceDetector';
      let detectorOptions;
      if (detector === 'tinyFaceDetector') {
        detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
      } else {
        detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });
      }

      const detections = await faceapi
        .detectSingleFace(processedVideo, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const canvas = canvasRef.current;
      if (canvas) {
        const displaySize = { 
          width: video.videoWidth || video.width || 640, 
          height: video.videoHeight || video.height || 480 
        };
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        drawFrame(canvas);
      }

      if (detections) {
        if (!detections.detection || !detections.detection.box) {
          setScannerStatus('Face scan incomplete. Please hold still.');
          setIsProcessing(false);
          return;
        }
        
        const box = detections.detection.box;
        if (box.width <= 0 || box.height <= 0 || !isFinite(box.width) || !isFinite(box.height)) {
          setScannerStatus('Face scan incomplete. Please hold still.');
          setIsProcessing(false);
          return;
        }

        const displaySize = { 
          width: video.videoWidth || video.width || 640, 
          height: video.videoHeight || video.height || 480 
        };
        
        if (displaySize.width <= 0 || displaySize.height <= 0) {
          setIsProcessing(false);
          return;
        }
        
        if (!canvas) {
          setIsProcessing(false);
          return;
        }
        
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        faceapi.matchDimensions(canvas, displaySize);
        drawFrame(canvas);
        
        try {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          
          if (!resizedDetections.detection || !resizedDetections.detection.box ||
              resizedDetections.detection.box.width <= 0 || resizedDetections.detection.box.height <= 0 ||
              !isFinite(resizedDetections.detection.box.width) || !isFinite(resizedDetections.detection.box.height)) {
            setScannerStatus('Face scan incomplete. Please hold still.');
            setIsProcessing(false);
            return;
          }
          
          if (!isFaceInFrame(resizedDetections.detection, canvas)) {
            setScannerStatus('Align face inside the visual frame.');
            setIsProcessing(false);
            return;
          }
          
          try {
            faceapi.draw.drawDetections(canvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
          } catch (drawError) {
            console.warn('Error drawing face detection:', drawError);
          }

          const labeledFaceDescriptors = workers.map(worker => {
            const descriptors = worker.faceEmbeddings.map(embedding => new Float32Array(embedding));
            return new faceapi.LabeledFaceDescriptors(worker.rfid, descriptors);
          });

          const matchThreshold = faceConfig.matchingThreshold ?? 0.50;
          const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, matchThreshold);
          const bestMatch = faceMatcher.findBestMatch(detections.descriptor);

          console.log('Best match result:', bestMatch);

          if (bestMatch && bestMatch.label !== 'unknown') {
            const worker = workers.find(w => w.rfid === bestMatch.label);
            if (worker) {
              if (workerMode && worker.rfid !== currentWorker.rfid) {
                setScannerStatus('Verification failed: Worker ID mismatch.');
                setIsProcessing(false);
                return;
              }
              
              setMatchedWorker(worker);
              setScannerStatus('Face recognized! Verifying...');
              
              try {
                const lastAttendanceResponse = await getWorkerLastAttendance(worker.rfid, subdomain);
                const nextAction = lastAttendanceResponse.presence ? 'Punch In' : 'Punch Out';
                setAttendanceType(nextAction);
                await handleDirectAttendance(worker, nextAction, subdomain);
              } catch (attendanceError) {
                console.error('Error getting last attendance:', attendanceError);
                if (attendanceError.response && attendanceError.response.status === 403) {
                  setError('You can only mark attendance with your own face.');
                } else {
                  setError('Unable to determine attendance action. Please try again.');
                }
                setIsProcessing(false);
                return;
              }
            }
          } else {
            setScannerStatus('Face not recognized. Keep face steady.');
          }
        } catch (resizeError) {
          console.error('Error resizing detection:', resizeError);
          setScannerStatus('Retrying scanning...');
        }
      } else {
        setScannerStatus('Scan area is empty. Align your face inside the visual frame.');
      }
    } catch (err) {
      console.error('Error recognizing face:', err);
      setScannerStatus('Camera loading or lighting compensation running...');
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

  // Auto-detection recursive loop
  useEffect(() => {
    let isMounted = true;
    
    const runScannerLoop = async () => {
      if (!isMounted || !isOpen || !isModelLoaded || showConfirmation) {
        return;
      }
      
      await recognizeFaceAndMark();
      
      if (isMounted && isOpen && !showConfirmation) {
        activeScanner.current = setTimeout(runScannerLoop, 150);
      }
    };
    
    if (isOpen && isModelLoaded && !showConfirmation) {
      runScannerLoop();
    }
    
    return () => {
      isMounted = false;
      if (activeScanner.current) {
        clearTimeout(activeScanner.current);
        activeScanner.current = null;
      }
    };
  }, [isOpen, isModelLoaded, showConfirmation]);

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
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isProcessing 
                        ? 'bg-indigo-400' 
                        : scannerStatus.includes('recognized') 
                          ? 'bg-emerald-400' 
                          : 'bg-amber-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      isProcessing 
                        ? 'bg-indigo-500' 
                        : scannerStatus.includes('recognized') 
                          ? 'bg-emerald-500' 
                          : 'bg-amber-500'
                    }`}></span>
                  </span>
                  <span className="text-xs font-bold text-slate-600 tracking-wide uppercase">
                    {isProcessing ? 'Processing' : scannerStatus.includes('recognized') ? 'Success' : 'Scanning'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700 mt-2 min-h-[20px]">
                  {scannerStatus}
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