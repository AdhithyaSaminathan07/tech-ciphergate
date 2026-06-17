import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCommentDots } from 'react-icons/fa';

const FloatingChatButton = ({ isAdmin }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(isAdmin ? '/admin/communication' : '/worker/communication');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-[999] w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full shadow-[0_8px_16px_rgba(13,148,136,0.3)] hover:shadow-[0_12px_24px_rgba(13,148,136,0.4)] transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 group"
      aria-label="Open Communication"
    >
      <FaCommentDots size={24} className="group-hover:animate-pulse" />
      <span className="absolute -top-1 -right-1 flex h-4 w-4">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
      </span>
    </button>
  );
};

export default FloatingChatButton;
