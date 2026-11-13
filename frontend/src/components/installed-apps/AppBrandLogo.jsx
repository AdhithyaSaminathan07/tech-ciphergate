import React, { useState } from 'react';
import { Layers } from 'lucide-react';

/**
 * Displays the application's logo or a clean branded fallback tile when
 * no logo asset is configured or loading fails.
 */
const AppBrandLogo = ({ logoUrl, name, size = 'lg' }) => {
  const [hasError, setHasError] = useState(false);

  const sizeClasses =
    size === 'sm'
      ? 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-base'
      : 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl text-2xl';

  const iconSize = size === 'sm' ? 18 : 30;
  const showImage = Boolean(logoUrl) && !hasError;

  return (
    <div
      className={`${sizeClasses} shrink-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#F0FAF4] to-white border border-[#E2ECE5] shadow-sm`}
    >
      {showImage ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="w-full h-full object-contain p-1.5 sm:p-2"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-[#087443]">
          <Layers size={iconSize} strokeWidth={1.8} />
        </div>
      )}
    </div>
  );
};

export default AppBrandLogo;
