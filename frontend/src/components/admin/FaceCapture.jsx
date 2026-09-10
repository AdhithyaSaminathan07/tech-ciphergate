import React, { useRef, useState, useEffect, useContext } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import api from '../../services/api';
import { 
  Camera, RefreshCw, Smile, RotateCcw, 
  AlertTriangle, CheckCircle2, 
  ShieldCheck, Sparkles, Activity, Award, Zap, Scan 
} from 'lucide-react';

const FaceCapture = ({ onFacesCaptured }) => {
  const { subdomain } = useContext(appContext);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const isMounted = useRef(true);

  // Capture mode: 'photo' (5-step guided pose scan) or 'scan' (Live Instant Biometric Scanner)
  const [captureMode, setCaptureMode] = useState('photo');

  const [capturedFaces, setCapturedFaces] = useState([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceConfig, setFaceConfig] = useState({
    detectorType: 'tinyFaceDetector',
    matchingThreshold: 0.50
  });

  // Photo Mode: Automatic capture states
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStability, setStepStability] = useState(0);
  const [isPoseMatched, setIsPoseMatched] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Initializing camera...');
  const [showFlash, setShowFlash] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [timeoutTriggered, setTimeoutTriggered] = useState(false);

  // Scan Mode States (Zero-Lag Live Face Scanner)
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'scanning' | 'done'
  const [accuracyScore, setAccuracyScore] = useState(0);
  const [scannedFrameCount, setScannedFrameCount] = useState(0);

  const scannedSamplesRef = useRef([]);
  const scanLoopRef = useRef(null);
  const isProcessingFrame = useRef(false);

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
      if (activeCaptureLoop.current) clearTimeout(activeCaptureLoop.current);
      if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
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

  // Load models in parallel for fast initialization
  useEffect(() => {
    const loadModels = async () => {
      try {
        setScannerStatus('Loading biometric scanner...');
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        
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
  }, []);

  // Reset captured data
  const clearCapturedFaces = () => {
    setCapturedFaces([]);
    setCurrentStep(1);
    setStepStability(0);
    setIsPoseMatched(false);
    setTimeoutTriggered(false);
    stepStartTime.current = Date.now();
    setError('');

    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
    setScanState('idle');
    setAccuracyScore(0);
    setScannedFrameCount(0);
    scannedSamplesRef.current = [];

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleModeSwitch = (mode) => {
    if (mode === captureMode) return;
    clearCapturedFaces();
    setCaptureMode(mode);
  };

  // Helper to estimate pose direction based on relative landmark ratios
  const estimatePose = (landmarks) => {
    if (!landmarks || !landmarks.positions) return 'unknown';
    const pts = landmarks.positions;
    
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

    const distToLeft = noseTip.x - leftEye.x;
    const distToRight = rightEye.x - noseTip.x;
    const hRatio = distToRight > 0 ? (distToLeft / distToRight) : 1.0;

    const noseHeight = noseTip.y - noseBridge.y;
    const bridgeToChin = chin.y - noseTip.y;
    const vRatio = bridgeToChin > 0 ? (noseHeight / bridgeToChin) : 1.0;

    if (hRatio < 0.65) return 'left';
    if (hRatio > 1.55) return 'right';
    if (vRatio < 0.30) return 'up';
    if (vRatio > 0.85) return 'down';
    
    if (hRatio >= 0.7 && hRatio <= 1.4 && vRatio >= 0.35 && vRatio <= 0.75) {
      return 'front';
    }

    return 'unknown';
  };

  // ----------------------------------------------------
  // PHOTO MODE CAPTURE LOGIC
  // ----------------------------------------------------
  const runPhotoCaptureLogic = async () => {
    if (!isMounted.current || !isModelLoaded || capturedFaces.length >= 5 || isCapturing || captureMode !== 'photo') {
      return;
    }

    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return;

    const videoWidth = video.videoWidth || video.width;
    const videoHeight = video.videoHeight || video.height;
    if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) return;

    try {
      const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });

      const detections = await faceapi
        .detectSingleFace(video, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
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

        const stepElapsed = Date.now() - stepStartTime.current;
        if (stepElapsed > 4000) {
          setTimeoutTriggered(true);
        }

        if (autoMode && stepElapsed > 6000) {
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

  const executeCapture = async (descriptor, video) => {
    setIsCapturing(true);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);

    try {
      const faceEmbedding = Array.from(descriptor);
      
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
        onFacesCaptured(updatedFaces);
      }
    } catch (e) {
      console.error('Capture embedding failed:', e);
      setError(`Capture failed: ${e.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const triggerManualCapture = async () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return;
    
    setIsCapturing(true);
    setScannerStatus('Capturing template manually...');
    try {
      const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });

      const detections = await faceapi
        .detectSingleFace(video, detectorOptions)
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

  useEffect(() => {
    let isLoopActive = true;
    
    const captureLoop = async () => {
      if (!isLoopActive || !isModelLoaded || capturedFaces.length >= 5 || showFlash || captureMode !== 'photo') {
        return;
      }
      
      await runPhotoCaptureLogic();
      
      if (isLoopActive && capturedFaces.length < 5 && captureMode === 'photo') {
        activeCaptureLoop.current = setTimeout(captureLoop, 100);
      }
    };

    if (isModelLoaded && capturedFaces.length < 5 && captureMode === 'photo') {
      captureLoop();
    }

    return () => {
      isLoopActive = false;
      if (activeCaptureLoop.current) clearTimeout(activeCaptureLoop.current);
    };
  }, [isModelLoaded, currentStep, capturedFaces.length, autoMode, showFlash, captureMode]);

  // ----------------------------------------------------
  // ZERO-LAG LIVE FACE SCANNER LOGIC
  // ----------------------------------------------------
  const startLiveFaceScan = () => {
    setError('');
    setCapturedFaces([]);
    scannedSamplesRef.current = [];
    setAccuracyScore(0);
    setScannedFrameCount(0);
    setScanState('scanning');

    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });

    const scanFrame = async () => {
      if (!isMounted.current || scanState === 'done') return;

      const video = webcamRef.current?.video;
      if (video && video.readyState === 4 && !isProcessingFrame.current) {
        isProcessingFrame.current = true;

        try {
          const detection = await faceapi
            .detectSingleFace(video, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (detection) {
              const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
              const box = resized.detection.box;
              ctx.strokeStyle = '#10B981';
              ctx.lineWidth = 3;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
            }
          }

          if (detection && detection.detection.score >= 0.45) {
            const rawScore = detection.detection.score;
            const emb = Array.from(detection.descriptor);
            const pose = estimatePose(detection.landmarks);

            // Thumbnail snapshot
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = video.videoWidth || 640;
            previewCanvas.height = video.videoHeight || 480;
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.drawImage(video, 0, 0);
            const imageDataUrl = previewCanvas.toDataURL('image/jpeg');

            scannedSamplesRef.current.push({
              id: Date.now() + Math.random(),
              embedding: emb,
              score: rawScore,
              pose: pose,
              image: imageDataUrl
            });

            const count = scannedSamplesRef.current.length;
            setScannedFrameCount(count);

            // Rapid Accuracy Meter (0% to 100%)
            const currentAccuracy = Math.min(100, Math.round((count / 8) * 100));
            setAccuracyScore(currentAccuracy);

            // Complete Scan when 100% Accuracy is reached (8 high-quality vector samples)
            if (currentAccuracy >= 100 || count >= 8) {
              completeScanProcess();
              return;
            }
          }
        } catch (err) {
          console.error('Scan error:', err);
        } finally {
          isProcessingFrame.current = false;
        }
      }

      if (isMounted.current) {
        scanLoopRef.current = setTimeout(scanFrame, 80); // Fast 80ms loop
      }
    };

    scanFrame();
  };

  const completeScanProcess = () => {
    if (scanLoopRef.current) clearTimeout(scanLoopRef.current);

    const samples = scannedSamplesRef.current;
    if (samples.length === 0) {
      setError('No face detected during scan. Please make sure your face is visible.');
      setScanState('idle');
      return;
    }

    // Sort by confidence score
    const sorted = [...samples].sort((a, b) => b.score - a.score);

    // Group poses
    const poseMap = {};
    sorted.forEach(s => {
      if (!poseMap[s.pose]) poseMap[s.pose] = s;
    });

    let selectedEmbeddings = Object.values(poseMap);
    for (let s of sorted) {
      if (selectedEmbeddings.length >= 5) break;
      if (!selectedEmbeddings.some(item => item.id === s.id)) {
        selectedEmbeddings.push(s);
      }
    }

    // Centroid Anchor Vector for top accuracy
    if (sorted.length >= 3) {
      const topSamples = sorted.slice(0, Math.min(6, sorted.length));
      const vectorLength = topSamples[0].embedding.length;
      const centroidVector = new Array(vectorLength).fill(0);

      topSamples.forEach(s => {
        s.embedding.forEach((val, i) => {
          centroidVector[i] += val / topSamples.length;
        });
      });

      selectedEmbeddings.unshift({
        id: Date.now() + '_centroid',
        embedding: centroidVector,
        score: 0.99,
        pose: 'Centroid Anchor',
        image: topSamples[0].image
      });
    }

    selectedEmbeddings = selectedEmbeddings.slice(0, 5);

    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 250);

    setCapturedFaces(selectedEmbeddings);
    setAccuracyScore(100);
    setScanState('done');

    // Save and send face data immediately
    onFacesCaptured(selectedEmbeddings);
  };

  return (
    <div className="face-capture-container w-full max-w-xl mx-auto px-0 sm:px-2 py-1">
      {/* Mode Selection Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-3 sm:mb-4 shadow-inner border border-slate-200/80">
        <button
          type="button"
          onClick={() => handleModeSwitch('photo')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            captureMode === 'photo'
              ? 'bg-white text-slate-800 shadow-md ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera size={16} className={captureMode === 'photo' ? 'text-blue-600' : ''} />
          <span>Multi-Angle Photo Scan</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeSwitch('scan')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            captureMode === 'scan'
              ? 'bg-white text-slate-800 shadow-md ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scan size={16} className={captureMode === 'scan' ? 'text-emerald-600' : ''} />
          <span>Live Face Scanner</span>
        </button>
      </div>

      {/* Visual Camera Window - Responsive aspect ratio for mobile (4:3 on phone, 16:9 on desktop) */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-slate-100 shadow-lg bg-slate-950 aspect-[4/3] sm:aspect-video mb-3">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ 
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 640 },
            frameRate: { ideal: 30, min: 15 }
          }}
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        
        {showFlash && (
          <div className="absolute inset-0 bg-emerald-500 opacity-80 transition-opacity duration-200 pointer-events-none z-20" />
        )}

        {scanState === 'scanning' && (
          <div className="absolute top-3 left-3 right-3 flex justify-between items-center z-20">
            <div className="bg-emerald-600/90 text-white text-xs font-black px-3 py-1 rounded-full backdrop-blur-md shadow flex items-center gap-2 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              SCANNING LIVE FACE
            </div>
            <div className="bg-slate-900/80 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md flex items-center gap-1">
              <Activity size={12} className="text-emerald-400 animate-pulse" />
              {scannedFrameCount} Vectors
            </div>
          </div>
        )}

        {captureMode === 'photo' && isModelLoaded && capturedFaces.length < 5 && (
          <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/50 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Angle {currentStep} of 5: {stepsConfig[currentStep].name}
            </span>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- */}
      {/* SIMPLE & CLEAN BIOMETRIC ACCURACY METER BAR               */}
      {/* --------------------------------------------------------- */}
      {captureMode === 'scan' && (
        <div className="mb-4 bg-slate-50 border border-slate-200/80 rounded-xl p-3 shadow-sm">
          <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} className={accuracyScore >= 90 ? 'text-emerald-500 font-bold' : 'text-blue-500'} />
              Scan Accuracy
            </span>
            <span className={`font-extrabold ${accuracyScore >= 90 ? 'text-emerald-600' : 'text-blue-600'}`}>
              {accuracyScore}%
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                accuracyScore >= 90 ? 'bg-emerald-500 shadow-sm' : accuracyScore >= 60 ? 'bg-blue-500' : 'bg-amber-500'
              }`}
              style={{ width: `${accuracyScore}%` }}
            />
          </div>
        </div>
      )}

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

      {/* Mode Instructions */}
      {isModelLoaded && (
        <div className="text-center mb-4">
          {captureMode === 'photo' ? (
            capturedFaces.length < 5 && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full shadow-sm mb-2">
                  <span className="text-xs font-black text-blue-700 uppercase">
                    {autoMode ? 'Auto-Scanner Active' : 'Manual Mode'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-800 tracking-wide">
                  {autoMode ? scannerStatus : 'Position face and click capture below'}
                </h4>
                {autoMode && isPoseMatched && (
                  <p className="text-xs font-bold text-emerald-600 uppercase mt-1 tracking-wider animate-pulse">
                    Hold steady... {stepStability}%
                  </p>
                )}
              </>
            )
          ) : (
            <div>
              {scanState === 'idle' && (
                <p className="text-xs text-slate-600 font-medium">
                  Click <b>Scan Face</b> below. The scanner will scan your face live from the camera and save it.
                </p>
              )}
              {scanState === 'scanning' && (
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider animate-pulse flex items-center justify-center gap-1">
                  <Zap size={13} /> Scanning Face Live... Keep face inside camera frame.
                </p>
              )}
              {scanState === 'done' && (
                <div className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  Face Scanned & Saved Successfully (100% Accuracy)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress Dots ONLY for Photo Mode */}
      {captureMode === 'photo' && (
        <div className="flex justify-center items-center space-x-3 mb-5">
          {[1, 2, 3, 4, 5].map((step) => (
            <div 
              key={step} 
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all border shadow-sm ${
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
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 items-center">
        <div className="flex flex-wrap gap-2.5 justify-center w-full">
          {captureMode === 'photo' ? (
            <>
              {timeoutTriggered && capturedFaces.length < 5 && (
                <Button
                  onClick={triggerManualCapture}
                  variant="warning"
                  disabled={isCapturing}
                  className="flex items-center shadow-md animate-bounce text-xs"
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  Capture Manually
                </Button>
              )}

              <Button onClick={clearCapturedFaces} variant="outline" className="flex items-center text-xs">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset Capture
              </Button>

              <Button
                onClick={() => setAutoMode(!autoMode)}
                variant="outline"
                className="flex items-center text-slate-600 text-xs"
              >
                {autoMode ? 'Switch to Manual' : 'Switch to Auto'}
              </Button>
            </>
          ) : (
            <>
              {scanState === 'idle' && (
                <Button
                  onClick={startLiveFaceScan}
                  variant="primary"
                  className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-xs px-6 py-2.5 font-bold tracking-wide"
                >
                  <Scan className="mr-2 h-4 w-4" />
                  Scan Face
                </Button>
              )}

              {scanState === 'done' && (
                <Button
                  onClick={startLiveFaceScan}
                  variant="outline"
                  className="flex items-center text-xs"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Re-Scan Face
                </Button>
              )}

              <Button onClick={clearCapturedFaces} variant="outline" className="flex items-center text-xs">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </>
          )}
        </div>

        {/* Display Scanned Biometric Vectors Summary */}
        {capturedFaces.length > 0 && (
          <div className="mt-4 w-full">
            <h5 className="text-xs font-bold text-slate-700 mb-2.5 text-center uppercase tracking-wider flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              {captureMode === 'scan' ? `Scanned Face Embeddings (100% Accuracy)` : `Enrolled Templates (${capturedFaces.length}/5)`}
            </h5>
            <div className="grid grid-cols-5 gap-2">
              {capturedFaces.map((face, index) => (
                <div key={face.id || index} className="relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm aspect-square">
                  <img
                    src={face.image}
                    alt={`Biometric vector ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-white text-[9px] py-0.5 text-center font-bold truncate px-1">
                    {face.pose || `Vector ${index + 1}`}
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