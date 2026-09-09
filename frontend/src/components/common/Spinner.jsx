import React from 'react';

const TaskSpinner = ({ size = "md", className = "" }) => {
  // Size variants
  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-10 h-10",
    md: "w-20 h-20",
    lg: "w-32 h-32",
    xl: "w-44 h-44"
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className={`relative flex items-center justify-center ${currentSizeClass}`}>
        {/* Outer soft pulsing ring */}
        <div className="absolute inset-0 rounded-full border-2 border-amber-500/30 animate-ping opacity-50"></div>
        <div className="absolute -inset-2 rounded-full border border-teal-500/20 animate-pulse opacity-40"></div>
        {/* Inner spinning ring */}
        <div className="absolute inset-1 rounded-full border-2 border-amber-400/60 animate-spin" style={{ animationDuration: '3s' }}></div>
        
        {/* Logo in the center */}
        <img 
          src="/logo.png" 
          alt="Loading..."
          className="w-3/5 h-3/5 object-contain z-10 drop-shadow-xs"
        />
      </div>
    </div>
  );
};

export default TaskSpinner;