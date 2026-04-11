import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import Button from '../common/Button';
import Spinner from '../common/Spinner';

const FaceCapture = ({ onFacesCaptured }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [capturedFaces, setCapturedFaces] = useState([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        // Show loading message
        setError('Loading face detection models...');
        
        // Load models individually to better identify which one is causing issues
        // Using more accurate models for face capture
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        setError('Loading face landmark models...');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        setError('Loading face recognition models...');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        
        setIsModelLoaded(true);
        setError(''); // Clear error message on success
      } catch (err) {
        console.error('Error loading models:', err);
        if (err.message.includes('tensor should have')) {
          setError(`Model files appear to be corrupted. Please follow these steps:
1. Close this application
2. Run 'npm run reset-models' in your terminal/command prompt
3. Completely clear your browser cache:
   - Chrome: Settings → Privacy and security → Clear browsing data → Select "Cached images and files" → Clear data
   - Firefox: Settings → Privacy & Security → Cookies and Site Data → Clear Data → Check "Cached Web Content" → Clear
   - Edge: Settings → Privacy, search, and services → Clear browsing data → Select "Cached data and files" → Clear now
4. Refresh the page
5. If the issue persists, restart your browser and try again.`);
        } else if (err.message.includes('Unexpected end of JSON input')) {
          setError(`Model manifest files are incomplete. Please run 'npm run reset-models' to re-download the models and refresh the page.`);
        } else {
          setError(`Failed to load face detection models: ${err.message}. Please check that all model files are present in the public/models folder and try refreshing the page.`);
        }
      }
    };

    loadModels();
  }, []);

  const captureFace = async () => {
    if (!webcamRef.current || !isModelLoaded || capturedFaces.length >= 5 || isCapturing) return;

    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;

    setIsCapturing(true);
    setError('');

    try {
      // Detect face and get descriptor (embedding) with improved options
      // Using higher minConfidence for better accuracy during registration
      const detections = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.7 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detections) {
        // Draw detection on canvas for visual feedback
        const canvas = canvasRef.current;
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);
        
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections); // Added face landmarks for better visualization
        
        // Extract face embedding (descriptor)
        const faceEmbedding = Array.from(detections.descriptor);
        
        // Create a snapshot image for visual confirmation (not stored)
        const canvasFrame = document.createElement('canvas');
        canvasFrame.width = video.videoWidth;
        canvasFrame.height = video.videoHeight;
        canvasFrame.getContext('2d').drawImage(video, 0, 0);
        const imageDataUrl = canvasFrame.toDataURL('image/jpeg');

        const newFace = {
          id: Date.now(),
          embedding: faceEmbedding,
          image: imageDataUrl
        };

        const updatedFaces = [...capturedFaces, newFace];
        setCapturedFaces(updatedFaces);

        // When we have all 5 faces, pass them to the parent component
        if (updatedFaces.length === 5) {
          onFacesCaptured(updatedFaces);
        }
      } else {
        setError('No face detected. Please position your face clearly in the center and ensure good lighting.');
      }
    } catch (err) {
      console.error('Error capturing face:', err);
      setError(`An error occurred while capturing the face: ${err.message}. Please try again.`);
    } finally {
      setIsCapturing(false);
    }
  };

  const clearCapturedFaces = () => {
    setCapturedFaces([]);
    setError('');
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className="face-capture-container">
      <div className="relative mb-4">
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
          className="w-full rounded-lg"
        />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
      </div>

      {!isModelLoaded && (
        <div className="flex items-center justify-center mt-4">
          <Spinner size="sm" />
          <p className="ml-2 text-blue-600">Loading models...</p>
        </div>
      )}

      {error && (
        <div className="mt-2 text-center text-red-600 p-2 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      <div className="flex justify-center mt-4 space-x-4">
        <Button
          onClick={captureFace}
          disabled={!isModelLoaded || capturedFaces.length >= 5 || isCapturing}
          variant="primary"
          className="flex items-center"
        >
          {isCapturing ? <Spinner size="sm" className="mr-2" /> : null}
          Capture Face ({capturedFaces.length}/5)
        </Button>
        
        <Button onClick={clearCapturedFaces} variant="outline">
          Clear All
        </Button>
      </div>

      {capturedFaces.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2 text-center">
            Captured Faces ({capturedFaces.length}/5)
          </h3>
          <p className="text-sm text-gray-600 text-center mb-4">
            {capturedFaces.length < 5 
              ? "Capture faces from different angles for better recognition accuracy" 
              : "All faces captured successfully! These will be used for attendance recognition."}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {capturedFaces.map((face, index) => (
              <div key={face.id} className="relative">
                <img
                  src={face.image}
                  alt={`Captured face ${index + 1}`}
                  className="w-full h-24 object-cover rounded-md border-2 border-gray-300"
                />
                <div className="absolute top-0 left-0 bg-black bg-opacity-50 text-white text-xs px-1">
                  #{index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {capturedFaces.length === 5 && (
        <div className="mt-4 text-center text-green-600 font-semibold">
          All 5 faces have been captured successfully!
        </div>
      )}
      
      {isModelLoaded && capturedFaces.length < 5 && (
        <div className="mt-4 text-center text-sm text-gray-600">
          <p className="font-medium">Tips for better face capture:</p>
          <ul className="list-disc list-inside text-left mt-1">
            <li>Ensure good lighting on your face</li>
            <li>Capture from different angles (front, side, etc.)</li>
            <li>Maintain a neutral expression</li>
            <li>Remove sunglasses or face coverings</li>
            <li>Position face clearly within frame</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default FaceCapture;