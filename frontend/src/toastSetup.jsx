import React from 'react';
import { toast } from 'react-toastify';
import CustomToast from './components/common/CustomToast';

const patchToastMethod = (methodName) => {
  const originalMethod = toast[methodName];
  if (!originalMethod) return;

  toast[methodName] = (content, options = {}) => {
    let type = methodName;
    if (type === 'warn') type = 'warning';

    // Avoid double wrapping if already a CustomToast or if we want to bypass it
    if (React.isValidElement(content) && (content.type === CustomToast || options.bypassCustomToast)) {
      return originalMethod(content, options);
    }

    return originalMethod(
      <CustomToast type={type} content={content} />,
      {
        icon: false,
        closeButton: false,
        autoClose: 3000,
        ...options,
      }
    );
  };
};

['success', 'error', 'info', 'warn', 'warning'].forEach(patchToastMethod);
