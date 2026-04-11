import React, { useRef, useState, useEffect } from 'react';
import * as faceapi from 'face-api.js';

const FaceTest = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadModels = async () => {
      try {
        setError('Loading face detection models...');
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setIsModelLoaded(true);
        setError('');
      } catch (err) {
        console.error('Error loading models:', err);
        setError(`Failed to load face detection models: ${err.message}`);
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    if (isModelLoaded && videoRef.current) {
      startVideo();
    }

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [isModelLoaded]);

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: {} })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Error accessing webcam:', err);
        setError('Error accessing webcam: ' + err.message);
      });
  };

  const handleVideoPlay = () => {
    if (!canvasRef.current || !videoRef.current) return;

    const displaySize = {
      width: videoRef.current.width,
      height: videoRef.current.height
    };

    faceapi.matchDimensions(canvasRef.current, displaySize);

    const detectFaces = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        return setTimeout(detectFaces, 100);
      }

      try {
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options())
          .withFaceLandmarks()
          .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        const canvas = canvasRef.current.getContext('2d');
        canvas.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
      } catch (err) {
        console.error('Error detecting faces:', err);
      }

      setTimeout(detectFaces, 100);
    };

    detectFaces();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Face Recognition Test</h1>
      
      {!isModelLoaded && (
        <div className="mb-4 p-4 bg-yellow-100 rounded">
          <p className="text-yellow-800">{error || 'Loading models...'}</p>
        </div>
      )}

      {error && isModelLoaded && (
        <div className="mb-4 p-4 bg-red-100 rounded">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="relative">
        <video
          ref={videoRef}
          width="720"
          height="560"
          onPlay={handleVideoPlay}
          autoPlay
          muted
          className="rounded-lg border-2 border-gray-300"
        />
        <canvas
          ref={canvasRef}
          width="720"
          height="560"
          className="absolute top-0 left-0 rounded-lg"
        />
      </div>

      {isModelLoaded && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <p className="text-green-800">Models loaded successfully! Face detection should be working.</p>
        </div>
      )}
    </div>
  );
};

export default FaceTest;