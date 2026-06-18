import React from 'react';
import { X } from 'lucide-react';

const splitMessage = (content, type) => {
  if (React.isValidElement(content)) {
    return { isElement: true, element: content };
  }
  if (typeof content !== 'string') {
    return { title: String(content), description: null };
  }

  // Common delimiters to split title and description
  const delimiters = ['\n', '! ', ': ', '. '];
  for (const delim of delimiters) {
    const index = content.indexOf(delim);
    if (index !== -1) {
      // Split and include the punctuation mark (if it is !, : or .) in the title
      const punctuationMatch = delim.trim();
      const includePunctuation = punctuationMatch === '!' || punctuationMatch === '.' || punctuationMatch === ':';
      const titleEndIndex = index + (includePunctuation ? 1 : 0);
      const title = content.substring(0, titleEndIndex).trim();
      const description = content.substring(index + delim.length).trim();
      if (title && description) {
        return { title, description };
      }
    }
  }

  // Fallback default titles if no split delimiter is found
  const defaultTitles = {
    success: 'Success!',
    error: 'Error!',
    warning: 'Warning!',
    info: 'Info'
  };
  return { title: defaultTitles[type] || 'Notification', description: content };
};

const CustomToast = ({ type = 'info', content, closeToast }) => {
  const { isElement, element, title, description } = splitMessage(content, type);

  // Render SVG icons with custom animations
  const renderIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="custom-toast-icon-wrapper success">
            <svg
              className="custom-toast-svg success-checkmark"
              viewBox="0 0 52 52"
              fill="none"
              stroke="#16A34A"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle
                className="success-checkmark-circle"
                cx="26"
                cy="26"
                r="23"
                stroke="#BBF7D0"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="success-checkmark-check"
                d="M16 26l7 7 14-14"
              />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="custom-toast-icon-wrapper error error-icon-animated">
            <svg
              className="custom-toast-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#DC2626"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
        );
      case 'warning':
        return (
          <div className="custom-toast-icon-wrapper warning warning-icon-animated">
            <svg
              className="custom-toast-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D97706"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        );
      case 'info':
      default:
        return (
          <div className="custom-toast-icon-wrapper info info-icon-animated">
            <svg
              className="custom-toast-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className={`custom-toast-card-inner type-${type}`}>
      {/* Animated Status Icon */}
      {renderIcon()}

      {/* Main Text Content */}
      <div className="custom-toast-text-content">
        {isElement ? (
          element
        ) : (
          <>
            <h4 className="custom-toast-title">{title}</h4>
            {description && <p className="custom-toast-description">{description}</p>}
          </>
        )}
      </div>

      {/* Close Button */}
      {closeToast && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeToast();
          }}
          className="custom-toast-close-btn"
          aria-label="Close notification"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
};

export default CustomToast;
