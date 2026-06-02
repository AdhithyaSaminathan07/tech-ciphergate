import React, { useState, useEffect, useRef } from 'react';
import uploadUtils from '../../utils/uploadUtils';

const StageProofModal = ({ isOpen, onClose, onConfirm, invoiceNo, stage }) => {
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef(null);
  const pasteAreaRef = useRef(null);
  const hiddenInputRef = useRef(null);
  const [isPasteFocused, setIsPasteFocused] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Auto-focus the hidden input when opened to capture paste events immediately
  useEffect(() => {
    if (isOpen && hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  }, [isOpen]);

  const handlePaste = (e) => {
    if (loading) return;
    
    // Stop propagation to prevent event bubbling from triggering this handler twice
    e.stopPropagation();

    try {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const pastedFiles = [];

      // 1. Check items first (standard for raw images/screenshots)
      const items = clipboardData.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const pasted = item.getAsFile();
            if (pasted && pasted.type.startsWith('image/')) {
              let name = pasted.name || 'pasted_image.png';
              if (name === 'image.png' || name === 'blob') {
                const extension = pasted.type.split('/')[1] || 'png';
                name = `pasted_image_${Date.now()}.${extension}`;
              }
              pastedFiles.push(new File([pasted], name, { type: pasted.type }));
            }
          }
        }
      }

      // 2. Fallback to files if items were empty
      if (pastedFiles.length === 0) {
        const filesList = clipboardData.files;
        if (filesList && filesList.length > 0) {
          for (let i = 0; i < filesList.length; i++) {
            const pasted = filesList[i];
            if (pasted.type.startsWith('image/')) {
              let name = pasted.name || 'pasted_image.png';
              if (name === 'image.png' || name === 'blob') {
                const extension = pasted.type.split('/')[1] || 'png';
                name = `pasted_image_${Date.now()}.${extension}`;
              }
              pastedFiles.push(new File([pasted], name, { type: pasted.type }));
            }
          }
        }
      }

      if (pastedFiles.length > 0) {
        setFile(pastedFiles[0]);
        e.preventDefault();
      }
    } catch (err) {
      console.error("Paste handling error:", err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !date) {
      alert('Please select a file and date');
      return;
    }

    try {
      setLoading(true);
      const proofUrl = await uploadUtils(file);
      if (proofUrl) {
        onConfirm({ date, proof: proofUrl });
      } else {
        alert('Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload proof');
    } finally {
      setLoading(false);
    }
  };

  const getStageConfig = () => {
    switch (stage) {
      case 'Payment Received':
        return { title: 'Payment Details', label: 'Received Date', color: 'blue' };
      case 'Work completion':
        return { title: 'Work Completion', label: 'Completion Date', color: 'green' };
      case 'Closure agreement':
        return { title: 'Closure Agreement', label: 'Agreement Date', color: 'purple' };
      default:
        return { title: 'Stage Details', label: 'Date', color: 'gray' };
    }
  };

  const config = getStageConfig();
  const colorClass = config.color === 'blue' ? 'blue' : config.color === 'green' ? 'green' : 'purple';

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        tabIndex={-1}
        className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 outline-none"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className={`bg-${colorClass}-100 p-2 rounded-lg`}>
            <svg className={`w-6 h-6 text-${colorClass}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900">{config.title} - {invoiceNo}</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">{config.label}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">Upload Proof</label>
            {file ? (
              <div className="flex flex-col items-center justify-center p-4 border border-gray-200 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-white rounded-lg border border-gray-150 text-gray-400 w-12 h-12 flex items-center justify-center overflow-hidden shrink-0">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={file.name} 
                      className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform" 
                      onClick={() => setPreviewImage({ url: URL.createObjectURL(file), name: file.name })}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFile(null)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left: Click/Drag-drop Upload */}
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-blue-500 transition-all group text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-white">
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files[0])}
                    accept="image/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required
                  />
                  <svg className="h-8 w-8 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold text-gray-700">Upload Image</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Click or drag & drop</p>
                  </div>
                </div>

                {/* Right: Paste Clipboard */}
                <div 
                  className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-all select-none group
                    ${isPasteFocused ? 'border-blue-500 bg-blue-50/40 shadow-inner' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50/10'}`}
                >
                  <textarea
                    ref={hiddenInputRef}
                    onFocus={() => setIsPasteFocused(true)}
                    onBlur={() => setIsPasteFocused(false)}
                    onPaste={handlePaste}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer resize-none z-10"
                    disabled={loading}
                  />
                  <svg className={`h-8 w-8 transition-transform z-0 ${isPasteFocused ? 'text-blue-600 animate-bounce' : 'text-gray-400 group-hover:scale-110'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="z-0">
                    <p className="text-xs font-bold text-gray-700">Paste Screenshot</p>
                    <p className={`text-[10px] mt-0.5 transition-colors ${isPasteFocused ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                      {isPasteFocused ? "Press Ctrl+V to paste!" : "Click & press Ctrl+V"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-3 bg-${colorClass}-600 text-white rounded-xl font-bold hover:bg-${colorClass}-700 transition-colors shadow-lg shadow-${colorClass}-100 disabled:bg-gray-400 disabled:shadow-none`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </span>
              ) : 'Confirm Stage'}
            </button>
          </div>
        </form>
      {/* Image Preview Overlay Modal (Lightbox) */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/85 z-[800] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[85vh] flex flex-col bg-transparent animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="absolute top-4 right-4 flex gap-2 z-[810]">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors shadow-lg"
                title="Close Preview"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Image Container */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-gray-950/40 p-2 shadow-2xl">
              <img 
                src={previewImage.url} 
                alt={previewImage.name} 
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-xl"
              />
            </div>

            {/* Image Title */}
            <div className="mt-3 text-center text-white/90 font-medium text-sm drop-shadow-md truncate px-6">
              {previewImage.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StageProofModal;
