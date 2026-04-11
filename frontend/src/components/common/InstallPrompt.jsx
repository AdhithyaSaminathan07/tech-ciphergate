import React, { useState, useEffect } from 'react';
import { X, Share } from 'lucide-react';

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
        <div className="fixed z-[9999] bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[380px] md:bottom-6 animate-in slide-in-from-bottom fade-in duration-500">
            {showIOSInstructions && (
                <div className="bg-blue-50 p-4 rounded-t-xl md:rounded-xl md:mb-2 text-sm text-blue-800 text-center border border-blue-100 shadow-lg">
                    <p className="flex items-center justify-center gap-2">
                        Tap <Share size={16} /> then select <strong>Add to Home Screen</strong> <span className="text-xl leading-none">+</span>
                    </p>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 shrink-0 flex items-center justify-center overflow-hidden">
                        <img
                            src="/logo.png"
                            alt="CipherGate"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.classList.add('bg-primary/10', 'rounded-xl');
                                e.target.parentElement.innerHTML = '<span class="text-primary font-bold text-lg">C</span>';
                            }}
                        />
                    </div>

                    <div className="flex flex-col flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-base truncate leading-tight">
                            Install CipherGate
                        </h3>
                        <p className="text-sm text-gray-500 truncate leading-tight mt-0.5">
                            Don’t miss important updates.
                        </p>
                    </div>

                    <button
                        onClick={handleDismiss}
                        className="p-1.5 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-4 pb-4 pt-0">
                    <button
                        onClick={handleInstallClick}
                        className="w-full bg-primary hover:bg-primary-hover active:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow flex items-center justify-center gap-2"
                    >
                        Install Application
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
