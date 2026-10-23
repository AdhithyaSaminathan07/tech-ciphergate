import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateInvoicePdfBlobUrl } from '../../utils/invoicePdfGenerator';

/**
 * Invoice PDF Preview Modal
 * Provides interactive zoom, scroll, and viewing for the actual generated invoice PDF.
 */
const InvoicePdfPreviewModal = ({
  isOpen,
  onClose,
  invoiceData,
  sealUrl,
  upiQrCodeUrl,
  title
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState('page'); // 'page' | 'width'
  const iframeRef = useRef(null);
  const cleanupRef = useRef(null);

  // Generate the actual PDF blob when modal opens or invoiceData changes
  const loadPdf = useCallback(async () => {
    if (!invoiceData) return;

    setLoading(true);
    setError(null);

    // Clean up previous blob if any
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        // ignore
      }
      setBlobUrl(null);
    }

    try {
      const result = await generateInvoicePdfBlobUrl(invoiceData, {
        sealUrl,
        upiQrCodeUrl
      });

      if (!result || !result.blobUrl) {
        throw new Error('Unable to render PDF document.');
      }

      setBlobUrl(result.blobUrl);
      cleanupRef.current = result.cleanup;
    } catch (err) {
      console.error('Error generating PDF preview:', err);
      setError(err?.message || 'Failed to generate PDF preview.');
    } finally {
      setLoading(false);
    }
  }, [invoiceData, sealUrl, upiQrCodeUrl]);

  useEffect(() => {
    if (isOpen) {
      loadPdf();
      setZoom(100);
    } else {
      // Clean up when modal closes
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (e) {
          // ignore
        }
        setBlobUrl(null);
      }
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [isOpen, loadPdf]);

  // Handle keyboard shortcuts (Esc to close, Ctrl+P to print)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '0')) {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 15, 200));
    setFitMode('custom');
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 15, 50));
    setFitMode('custom');
  };

  const handleResetZoom = () => {
    setZoom(100);
    setFitMode('page');
  };

  const handleToggleFit = () => {
    if (fitMode === 'width') {
      setFitMode('page');
      setZoom(100);
    } else {
      setFitMode('width');
      setZoom(130);
    }
  };

  if (!isOpen) return null;

  const invoiceNo = invoiceData?.invoiceNo || 'Draft';
  const customerName = invoiceData?.customerName || 'Customer';
  const invoiceType = invoiceData?.invoiceType || 'PROFORMA INVOICE';
  const isPaid = Boolean(invoiceData?.isPaid);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[150] p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-6xl h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Toolbar */}
        <div className="bg-neutral-900/95 border-b border-neutral-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-white select-none">
          {/* Left: Invoice Identity & Badges */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-gray-100 truncate">
                  {title || `Preview Invoice: ${invoiceNo}`}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md hidden sm:inline-block">
                  {invoiceType}
                </span>
                {isPaid && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-300 border border-green-500/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Paid
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 truncate max-w-xs sm:max-w-md">
                Billed to <span className="text-neutral-200 font-medium">{customerName}</span> • PDF Document Preview
              </p>
            </div>
          </div>

          {/* Center / Right: Interactive Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center bg-neutral-800/90 border border-neutral-700 rounded-lg p-0.5 text-xs text-neutral-300 shadow-inner">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 50 || loading}
                title="Zoom Out (Ctrl -)"
                className="p-1.5 rounded hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom to 100% (Ctrl 0)"
                className="px-2 py-1 font-semibold text-[11px] hover:text-white transition-colors min-w-[50px] text-center"
              >
                {zoom}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 200 || loading}
                title="Zoom In (Ctrl +)"
                className="p-1.5 rounded hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <div className="h-4 w-px bg-neutral-700 mx-1"></div>

              <button
                type="button"
                onClick={handleToggleFit}
                title={fitMode === 'width' ? 'Fit Page' : 'Fit Width'}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  fitMode === 'width'
                    ? 'bg-emerald-600/30 text-emerald-300 font-bold'
                    : 'hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {fitMode === 'width' ? 'Fit Page' : 'Fit Width'}
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close Preview (Esc)"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors ml-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body / PDF Canvas Area */}
        <div className="flex-1 bg-neutral-950/80 overflow-auto p-4 flex flex-col items-center justify-start relative">
          {/* Loading State */}
          {loading && (
            <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-xs flex flex-col items-center justify-center z-20 text-center p-6">
              <div className="relative w-14 h-14">
                <div className="w-14 h-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-emerald-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="mt-4 text-sm font-bold text-gray-200">Rendering invoice PDF preview...</p>
              <p className="mt-1 text-xs text-neutral-400">Preparing high-resolution document layout</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="my-auto max-w-md bg-neutral-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-xl">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white mb-1">PDF Preview Unavailable</h3>
              <p className="text-xs text-neutral-400 mb-5">{error}</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={loadPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Successful Render: PDF Display Frame */}
          {blobUrl && !error && (
            <div
              className="transition-all duration-200 ease-out origin-top flex flex-col items-center justify-start pb-10"
              style={{
                width: fitMode === 'width' ? '100%' : `${Math.max(zoom, 60)}%`,
                maxWidth: fitMode === 'width' ? '100%' : '1000px',
                minHeight: '100%'
              }}
            >
              <div
                className="w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-700"
                style={{ height: 'calc(94vh - 110px)' }}
              >
                <iframe
                  ref={iframeRef}
                  src={`${blobUrl}#view=FitH&toolbar=0`}
                  title={`Invoice PDF Preview ${invoiceNo}`}
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Status / Helpful Shortcut Bar */}
        <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-2 flex items-center justify-between text-[11px] text-neutral-400 select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 font-mono">Esc</kbd> Close
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 font-mono">+/-</kbd> Zoom
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium text-neutral-300">A4 Printable Layout</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePdfPreviewModal;
