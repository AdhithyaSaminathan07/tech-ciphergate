import React, { useState, useEffect } from 'react';
import { X, Share, Download } from 'lucide-react';

const InstallPrompt = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    useEffect(() => {
        // NOTE: We do NOT check localStorage so this appears every session until installed.

        // Check if already in standalone mode (installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;

        if (isStandalone) {
            return;
        }

        // Handle Android/Desktop beforeinstallprompt
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault(); // Prevent automatic mini-infobar
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Handle iOS Detection
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);

        if (isIOSDevice) {
            setIsIOS(true);
            setIsVisible(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsVisible(false);
                setDeferredPrompt(null);
            }
        } else if (isIOS) {
            setShowIOSInstructions(!showIOSInstructions);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
        // We do NOT save to localStorage, so it will show again on refresh
    };

    if (!isVisible) return null;

    return (
        <div className="fixed z-[9999] bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-[320px] md:bottom-6 animate-in slide-in-from-bottom fade-in duration-500">
            {showIOSInstructions && (
                <div className="bg-blue-50/90 backdrop-blur-sm p-3 rounded-t-xl text-xs text-blue-800 text-center border-x border-t border-blue-100 shadow-lg">
                    <p className="flex items-center justify-center gap-2">
                        Tap <Share size={14} /> then select <strong>Add to Home Screen</strong> <span className="text-lg leading-none">+</span>
                    </p>
                </div>
            )}

            <div className="animated-border-box shadow-2xl">
                <div className="animated-border-inner bg-white">
                    <div className="p-3 flex items-center gap-3">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center overflow-hidden bg-gray-50 rounded-lg p-1 border border-gray-100">
                            <img
                                src="/logo.png"
                                alt="CipherGate"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    const parent = e.target.parentElement;
                                    parent.classList.add('bg-[#0d9488]/10');
                                    parent.innerHTML = '<span class="text-[#0d9488] font-bold text-sm">C</span>';
                                }}
                            />
                        </div>

                        <div className="flex flex-col flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm truncate leading-tight">
                                Install CipherGate
                            </h3>
                            <p className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
                                Don’t miss important updates.
                            </p>
                        </div>

                        <button
                            onClick={handleDismiss}
                            className="p-1 -mr-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors"
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="px-3 pb-3 pt-0">
                        <button
                            onClick={handleInstallClick}
                            className="w-full bg-[#0d9488] hover:bg-[#0f766e] active:scale-[0.98] text-white py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            <Download size={14} className="animate-bounce" />
                            Install Application
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes border-rotate {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .animated-border-box {
                    position: relative;
                    overflow: hidden;
                    border-radius: 14px;
                    padding: 2px;
                    background: #f3f4f6;
                    display: flex;
                    align-items: stretch;
                }

                .animated-border-box::before {
                    content: '';
                    position: absolute;
                    top: -100%;
                    left: -100%;
                    width: 300%;
                    height: 300%;
                    background: conic-gradient(
                        from 0deg,
                        #047857,
                        #10b981,
                        #6ee7b7,
                        #10b981,
                        #047857
                    );
                    animation: border-rotate 4s linear infinite;
                    z-index: 0;
                }

                .animated-border-inner {
                    position: relative;
                    width: 100%;
                    border-radius: 12px;
                    z-index: 1;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.02);
                }
            `}</style>
        </div>
    );
};

export default InstallPrompt;
