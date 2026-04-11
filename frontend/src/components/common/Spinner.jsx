import React, { useEffect, useRef } from 'react';

const TaskSpinner = ({ size = "md", color = "#3b82f6" }) => {
  const svgRef = useRef(null);
  
  // Size variants
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-48 h-48"
  };

  // Generate secondary and tertiary colors based on primary color
  const secondaryColor = color + "80"; // 50% opacity
  const tertiaryColor = color + "40";  // 25% opacity
  
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    
    // Reset animations on mount
    const elements = svg.querySelectorAll('.animated');
    elements.forEach(el => {
      el.style.animation = 'none';
      void el.offsetWidth; // Trigger reflow
      el.style.animation = null;
    });
    
    // Add random delays to some elements for more organic movement
    const randomElements = svg.querySelectorAll('.random-delay');
    randomElements.forEach(el => {
      const delay = Math.random() * 0.5;
      el.style.animationDelay = `${delay}s`;
    });
  }, []);

  return (
    <div className="flex justify-center items-center">
      <div className={`relative flex items-center justify-center ${sizeClasses[size]}`}>
        {/* Fixed logo in the center */}
        <img 
          src="/logo.png" 
          alt="Loading..."
          className="w-3/4 h-3/4 object-contain z-10"
        />
        
        {/* Subtle fire-like animated effect around the logo */}
        <div className="absolute inset-0 rounded-full border-2 border-orange-400 animate-ping opacity-60"></div>
        <div className="absolute inset-0 rounded-full border border-yellow-300 animate-pulse opacity-40"></div>
      </div>
    </div>
  );
};

export default TaskSpinner;