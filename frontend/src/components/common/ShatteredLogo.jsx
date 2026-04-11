import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const ShatteredLogo = ({
  src = '/logo.png',
  alt = 'Logo',
  className = '',
  onComplete,
  triggerAnimation = false
}) => {
  const [isAnimating, setIsAnimating] = useState(true);
  const [animationKey, setAnimationKey] = useState(0);

  // Create pieces with random positions for shattering effect
  const createPieces = () => {
    const pieces = [];
    const pieceCount = 12;

    for (let i = 0; i < pieceCount; i++) {
      pieces.push({
        id: i,
        // Create a more varied shattering pattern
        x: (Math.random() - 0.5) * 150,
        y: (Math.random() - 0.5) * 150,
        rotate: (Math.random() - 0.5) * 360,
        scale: 0.4 + Math.random() * 0.6,
        // Random delay for each piece to create a more natural effect
        delay: Math.random() * 0.3
      });
    }

    return pieces;
  };

  const [pieces] = useState(createPieces());

  useEffect(() => {
    if (triggerAnimation) {
      // Reset animation state to trigger re-render
      setIsAnimating(true);
      setAnimationKey(prev => prev + 1);
    }
  }, [triggerAnimation]);

  useEffect(() => {
    if (isAnimating) {
      // Notify when animation completes
      const timer = setTimeout(() => {
        setIsAnimating(false);
        if (onComplete) onComplete();
      }, 1500); // Reduced duration for better flow

      return () => clearTimeout(timer);
    }
  }, [isAnimating, onComplete]);

  return (
    <div className={`relative overflow-visible ${className}`}>
      {isAnimating ? (
        <>
          {/* Shattered pieces */}
          {pieces.map((piece) => (
            <motion.div
              key={`${piece.id}-${animationKey}`}
              className="absolute inset-0 origin-center"
              initial={{
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: piece.x,
                y: piece.y,
                rotate: piece.rotate,
                scale: piece.scale,
                opacity: 0,
              }}
              transition={{
                duration: 1,
                delay: piece.delay,
                ease: "easeOut",
              }}
            >
              <img
                src={src}
                alt={`${alt} piece ${piece.id}`}
                className="w-full h-full object-contain"
              />
            </motion.div>
          ))}

          {/* Reassembling logo */}
          <motion.div
            key={`reassemble-${animationKey}`}
            className="absolute inset-0 origin-center"
            initial={{
              x: 0,
              y: 0,
              rotate: 0,
              scale: 0.1,
              opacity: 0,
            }}
            animate={{
              x: 0,
              y: 0,
              rotate: 0,
              scale: 1,
              opacity: 1,
            }}
            transition={{
              duration: 0.6,
              delay: 0.9,
              ease: "easeOut",
            }}
          >
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-contain"
            />
          </motion.div>
        </>
      ) : (
        // Static logo after animation completes
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
};

export default ShatteredLogo;