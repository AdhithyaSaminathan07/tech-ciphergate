import React, { useRef, useState, useEffect, useContext } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import api from '../../services/api';
import { Camera, RefreshCw, Smile, ArrowLeft, ArrowRight, RotateCcw, AlertTriangle } from 'lucide-react';

const FaceCapture = ({ onFacesCaptured }) => {
  const { subdomain } = useContext(appContext);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const isMounted = useRef(true);
  
  const [capturedFaces, setCapturedFaces] = useState([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceConfig, setFaceConfig] = useState({
    detectorType: 'ssdMobilenetv1', // Fallback to SsdMobilenetv1 for capture precision
    matchingThreshold: 0.50
  });

  // Automatic capture states
  const [currentStep, setCurrentStep] = useState(1); // 1 to 5
  const [stepStability, setStepStability] = useState(0); // 0 to 100
  const [isPoseMatched, setIsPoseMatched] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Initializing camera...');
  const [showFlash, setShowFlash] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [timeoutTriggered, setTimeoutTriggered] = useState(false);

  const stableStart = useRef(null);
  const stepStartTime = useRef(Date.now());
  const activeCaptureLoop = useRef(null);

  const stepsConfig = {
    1: { name: 'Look Straight', pose: 'front', instruction: 'Look directly at the camera' },
    2: { name: 'Turn Left', pose: 'left', instruction: 'Turn your head slightly to the left' },
    3: { name: 'Turn Right', pose: 'right', instruction: 'Turn your head slightly to the right' },
    4: { name: 'Tilt Up', pose: 'up', instruction: 'Tilt your head slightly upwards' },
    5: { name: 'Tilt Down', pose: 'down', instruction: 'Tilt your head slightly downwards / Smile' }
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (activeCaptureLoop.current) {
        clearTimeout(activeCaptureLoop.current);
      }
    };
  }, []);

  // Fetch settings to align detector model
  useEffect(() => {
    const fetchFaceConfig = async () => {
      if (!subdomain) return;
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
  }, [subdomain]);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        setScannerStatus('Loading biometric models...');
        const detector = faceConfig.detectorType || 'ssdMobilenetv1'; // Capture prefers precision
        
        if (detector === 'tinyFaceDetector') {
          await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        } else {
          await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        }
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        
        if (isMounted.current) {
          setIsModelLoaded(true);
          setScannerStatus('Align your face inside the overlay');
          setError('');
        }
      } catch (err) {
        console.error('Error loading models:', err);
        if (isMounted.current) {
          setError(`Failed to load face detection models: ${err.message}`);
        }
      }
    };

    loadModels();
  }, [faceConfig.detectorType]);

  // Reset steps when cleared
  const clearCapturedFaces = () => {
    setCapturedFaces([]);
    setCurrentStep(1);
    setStepStability(0);
    setIsPoseMatched(false);
    setTimeoutTriggered(false);
    stepStartTime.current = Date.now();
    setError('');
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Helper to estimate pose direction based on relative landmark ratios
  const estimatePose = (landmarks) => {
    if (!landmarks || !landmarks.positions) return 'unknown';
    const pts = landmarks.positions;
    
    // Get average centers
    const getCenter = (start, end) => {
      let x = 0, y = 0;
      for (let i = start; i < end; i++) {
        x += pts[i].x;
        y += pts[i].y;
      }
      const count = end - start;
      return { x: x / count, y: y / count };
    };

    const leftEye = getCenter(36, 42);
    const rightEye = getCenter(42, 48);
    const noseTip = pts[30];
    const noseBridge = pts[27];
    const chin = pts[8];

    // Horizontal head rotation ratio
    const distToLeft = noseTip.x - leftEye.x;
    const distToRight = rightEye.x - noseTip.x;
    const hRatio = distToRight > 0 ? (distToLeft / distToRight) : 1.0;

    // Vertical head tilt ratio
    const noseHeight = noseTip.y - noseBridge.y;
    const bridgeToChin = chin.y - noseTip.y;
    const vRatio = bridgeToChin > 0 ? (noseHeight / bridgeToChin) : 1.0;

    // Output classification
    if (hRatio < 0.65) return 'left';
    if (hRatio > 1.55) return 'right';
    if (vRatio < 0.30) return 'up';
    if (vRatio > 0.85) return 'down';
    
    // Front face coordinates bounds
    if (hRatio >= 0.7 && hRatio <= 1.4 && vRatio >= 0.35 && vRatio <= 0.75) {
      return 'front';
    }

    return 'unknown';
  };

  // Low light enhancement canvas preprocessor
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

  // Automated/Manual face capturing logic
  const runCaptureLogic = async () => {
    if (!isMounted.current || !isModelLoaded || capturedFaces.length >= 5 || isCapturing) {
      return;
    }

    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return;

    const videoWidth = video.videoWidth || video.width;
    const videoHeight = video.videoHeight || video.height;
    if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) return;

    try {
      const processedVideo = preprocessLowLight(video);
      const detector = faceConfig.detectorType || 'ssdMobilenetv1';
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
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw frame guides
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = isPoseMatched ? 'rgba(16, 185, 129, 0.8)' : 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 4;
        ctx.stroke();

        if (isPoseMatched && stepStability > 0) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * (stepStability / 100)));
          ctx.strokeStyle = 'rgba(16, 185, 129, 1)';
          ctx.lineWidth = 6;
          ctx.stroke();
        }
      }

      if (detections && isMounted.current) {
        const pose = estimatePose(detections.landmarks);
        const targetStepConfig = stepsConfig[currentStep];
        const poseMatch = pose === targetStepConfig.pose;

        setIsPoseMatched(poseMatch);

        // Check if step duration has exceeded 4 seconds to enable manual bypass
        const stepElapsed = Date.now() - stepStartTime.current;
        if (stepElapsed > 4000) {
          setTimeoutTriggered(true);
        }

        // Automatic 6-second timeout bypass
        if (autoMode && stepElapsed > 6000) {
          console.log(`[AutoCapture] Timeout triggered for step ${currentStep}. Bypassing.`);
          await executeCapture(detections.descriptor, video);
          return;
        }

        if (autoMode) {
          if (poseMatch) {
            if (stableStart.current === null) {
              stableStart.current = Date.now();
            }
            const elapsed = Date.now() - stableStart.current;
            const progress = Math.min(100, Math.round((elapsed / 800) * 100));
            setStepStability(progress);

            if (elapsed >= 800) {
              await executeCapture(detections.descriptor, video);
            }
          } else {
            stableStart.current = null;
            setStepStability(0);
            setScannerStatus(targetStepConfig.instruction);
          }
        }
      } else {
        setIsPoseMatched(false);
        stableStart.current = null;
        setStepStability(0);
        setScannerStatus('Position your face in the center frame');
      }
    } catch (err) {
      console.error('Error in capture logic loop:', err);
    }
  };

  // Perform the physical capture of a face template
  const executeCapture = async (descriptor, video) => {
    setIsCapturing(true);
    
    // Play visual flash cue
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);

    try {
      const faceEmbedding = Array.from(descriptor);
      
      // Draw frame to data URL for visual preview
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = video.videoWidth || 640;
      previewCanvas.height = video.videoHeight || 480;
      const previewCtx = previewCanvas.getContext('2d');
      previewCtx.drawImage(video, 0, 0);
      const imageDataUrl = previewCanvas.toDataURL('image/jpeg');

      const newFace = {
        id: Date.now(),
        embedding: faceEmbedding,
        image: imageDataUrl
      };

      const updatedFaces = [...capturedFaces, newFace];
      setCapturedFaces(updatedFaces);

      stableStart.current = null;
      setStepStability(0);
      setIsPoseMatched(false);
      setTimeoutTriggered(false);

      if (currentStep < 5) {
        const next = currentStep + 1;
        setCurrentStep(next);
        stepStartTime.current = Date.now();
        setScannerStatus(stepsConfig[next].instruction);
      } else {
        // Complete enrollment sequence
        onFacesCaptured(updatedFaces);
      }
    } catch (e) {
      console.error('Capture embedding failed:', e);
      setError(`Capture failed: ${e.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  // Manual override trigger
  const triggerManualCapture = async () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return;
    
    setIsCapturing(true);
    setScannerStatus('Capturing template manually...');
    try {
      const processedVideo = preprocessLowLight(video);
      const detector = faceConfig.detectorType || 'ssdMobilenetv1';
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

      if (detections) {
        await executeCapture(detections.descriptor, video);
      } else {
        setError('No face detected in frame. Make sure your face is visible before clicking.');
      }
    } catch (err) {
      console.error('Manual capture error:', err);
      setError(`Manual capture failed: ${err.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  // Recursive loop scheduling
  useEffect(() => {
    let isLoopActive = true;
    
    const captureLoop = async () => {
      if (!isLoopActive || !isModelLoaded || capturedFaces.length >= 5 || showFlash) {
        return;
      }
      
      await runCaptureLogic();
      
      if (isLoopActive && capturedFaces.length < 5) {
        activeCaptureLoop.current = setTimeout(captureLoop, 150); // fast loop
      }
    };

    if (isModelLoaded && capturedFaces.length < 5) {
      captureLoop();
    }

    return () => {
      isLoopActive = false;
      if (activeCaptureLoop.current) {
        clearTimeout(activeCaptureLoop.current);
      }
    };
  }, [isModelLoaded, currentStep, capturedFaces.length, autoMode, showFlash]);

  return (
    <div className="face-capture-container max-w-lg mx-auto py-2">
      {/* Visual camera window */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-slate-100 shadow-lg bg-slate-950 aspect-video mb-5">
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
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        
        {/* Flash visual overlay */}
        {showFlash && (
          <div className="absolute inset-0 bg-white opacity-95 transition-opacity duration-200 pointer-events-none z-20" />
        )}

        {/* Step Guide Overlay */}
        {isModelLoaded && capturedFaces.length < 5 && (
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/50 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Angle {currentStep} of 5: {stepsConfig[currentStep].name}
            </span>
          </div>
        )}
      </div>

      {!isModelLoaded && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Spinner size="md" className="text-teal-600" />
          <p className="mt-3 text-sm text-slate-500">{scannerStatus}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />
          <span className="font-semibold text-left">{error}</span>
        </div>
      )}

      {/* Enrollment guidance instructions */}
      {isModelLoaded && capturedFaces.length < 5 && (
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 border border-blue-100/50 rounded-full shadow-sm mb-3">
            <span className="text-xs font-black text-blue-700 uppercase">
              {autoMode ? 'Auto-Scanner Active' : 'Manual Mode'}
            </span>
          </div>
          <h4 className="text-lg font-bold text-slate-800 tracking-wide transition-all">
            {autoMode ? scannerStatus : 'Position face and click capture below'}
          </h4>
          {autoMode && isPoseMatched && (
            <p className="text-xs font-bold text-emerald-600 uppercase mt-1 tracking-wider animate-pulse">
              Hold steady... {stepStability}%
            </p>
          )}
        </div>
      )}

      {/* Progress Dots */}
      <div className="flex justify-center items-center space-x-3 mb-6">
        {[1, 2, 3, 4, 5].map((step) => (
          <div 
            key={step} 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all border shadow-sm ${
              capturedFaces.length >= step 
                ? 'bg-emerald-500 text-white border-emerald-500' 
                : currentStep === step && capturedFaces.length < 5
                  ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-400/20 font-black' 
                  : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            {capturedFaces.length >= step ? '✓' : step}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 items-center">
        <div className="flex gap-3 justify-center w-full">
          {timeoutTriggered && capturedFaces.length < 5 && (
            <Button
              onClick={triggerManualCapture}
              variant="warning"
              disabled={isCapturing}
              className="flex items-center shadow-md animate-bounce"
            >
              <Camera className="mr-2 h-4 w-4" />
              Capture Manually
            </Button>
          )}

          <Button onClick={clearCapturedFaces} variant="outline" className="flex items-center">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Capture
          </Button>

          <Button
            onClick={() => setAutoMode(!autoMode)}
            variant="outline"
            className="flex items-center text-slate-600"
          >
            {autoMode ? 'Switch to Manual' : 'Switch to Auto'}
          </Button>
        </div>

        {capturedFaces.length > 0 && (
          <div className="mt-4 w-full">
            <h5 className="text-sm font-bold text-slate-700 mb-3 text-center uppercase tracking-wider">
              Enrolled Templates ({capturedFaces.length}/5)
            </h5>
            <div className="grid grid-cols-5 gap-2.5">
              {capturedFaces.map((face, index) => (
                <div key={face.id} className="relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm aspect-square">
                  <img
                    src={face.image}
                    alt={`Face angle ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/70 text-white text-[10px] py-0.5 text-center font-bold">
                    Angle {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceCapture;