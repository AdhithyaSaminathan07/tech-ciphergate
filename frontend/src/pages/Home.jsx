import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ShatteredLogo from '../components/common/ShatteredLogo';

const Home = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, isWorker, loading: authLoading } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [cipherGateText, setCipherGateText] = useState('');
  const [showColorAnimation, setShowColorAnimation] = useState(false);
  const cipherGateFullText = "CipherGate";

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isAdmin) navigate('/admin');
      else if (isWorker) navigate('/worker');
    }
  }, [isAuthenticated, isAdmin, isWorker, authLoading, navigate]);

  const features = [
    {
      title: 'Performance Tracking',
      description: 'Real-time monitoring of employee productivity and task completion rates.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      title: 'Workflow Optimization',
      description: 'Intelligent task allocation and process streamlining for enhanced productivity.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      title: 'Advanced Analytics',
      description: 'Deep insights into team performance and productivity trends for strategic decision-making.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    }
  ];

  // Typing animation for CipherGate text
  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index <= cipherGateFullText.length) {
        setCipherGateText(cipherGateFullText.slice(0, index));
        index++;
      } else {
        clearInterval(timer);
        // After text is fully typed, start the color animation after a delay
        setTimeout(() => {
          setShowColorAnimation(true);
        }, 500);
      }
    }, 100); // 0.1s delay between letters

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const featureRotation = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 5000);

    return () => clearInterval(featureRotation);
  }, []);

  useEffect(() => {
    const currentFeature = features[activeFeature];
    let currentIndex = 0;

    const typingInterval = setInterval(() => {
      if (currentIndex <= currentFeature.description.length) {
        setTypingText(currentFeature.description.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [activeFeature]);

  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center p-6 overflow-hidden relative">
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative z-10 max-w-5xl w-full grid md:grid-cols-2 gap-12 bg-white rounded-2xl p-8 md:p-12 shadow-2xl border border-gray-200"
      >
        {/* Left Section */}
        <div className="flex flex-col justify-center space-y-8">
          <div className="flex items-center">
            {/* Static Logo */}
            <div className="h-16 w-16 mr-4">
              <ShatteredLogo
                src="/logo.png"
                alt="CipherGate Logo"
                className="h-16 w-16"
              />
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold ${showColorAnimation ? 'ciphergate-animated' : ''}`}
              style={{ fontFamily: 'Times New Roman, serif' }}
            >
              {cipherGateText}
            </h1>
          </div>

          <p className="text-lg md:text-xl text-black">
            Presence is not Performance.We track Both.
            Boost Productivity Through Intelligent Workforce Management
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/admin/login')}
              className="px-6 py-3 bg-[#0d9488] text-white rounded-full hover:bg-[#0f766e] border-2 border-[#0d9488] transition-colors"
            >
              Admin Portal
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/worker/login')}
              className="px-6 py-3 border-2 border-[#0d9488] text-[#0d9488] rounded-full hover:bg-[#0d9488] hover:text-white transition-colors"
            >
              Employee Login
            </motion.button>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex flex-col space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                onClick={() => setActiveFeature(index)}
                className={`flex flex-col items-center p-4 rounded-xl cursor-pointer transition-all ${activeFeature === index
                  ? 'bg-[#0d9488]/20 border border-[#0d9488]'
                  : 'bg-gray-100 hover:bg-gray-200'
                  }`}
              >
                <div className={`mb-2 ${activeFeature === index ? 'text-[#0d9488]' : 'text-black'}`}>
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold text-center text-black">{feature.title}</h3>
              </motion.div>
            ))}
          </div>

          <motion.div
            key={activeFeature}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-100 p-6 rounded-xl"
          >
            <h2 className="text-xl md:text-2xl font-bold mb-4 text-[#0d9488]">
              {features[activeFeature].title}
            </h2>
            <p className="text-black">{typingText}</p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Home;