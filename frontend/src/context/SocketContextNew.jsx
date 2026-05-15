import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import appContext from './AppContext';
import { toast } from 'react-toastify';

const SocketContext = createContext();

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const { subdomain } = useContext(appContext);
    const socketRef = useRef(null);
    const toastShownRef = useRef(false);

    useEffect(() => {
        if (!subdomain || subdomain === 'main') {
            return;
        }

        // ─── PRODUCTION SOCKET CONFIG ─────────────────────────────────────────
        // We use VITE_SOCKET_URL for production (e.g., https://api.ciphergate.in)
        // If not set, it defaults to window.location.origin for same-domain proxying.
        // ─────────────────────────────────────────────────────────────────────
        const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

        // Retrieve token for auth
        const token = localStorage.getItem('token');

        if (!token) {
            console.warn('[Socket] No token found, skipping connection');
            return;
        }

        const newSocket = io(socketUrl, {
            // Allow fallback to polling if websocket fails initially
            transports: ['websocket', 'polling'],

            // Pass JWT in handshake auth - checked by backend middleware
            auth: { token },

            reconnection: true,
            reconnectionAttempts: Infinity, // Keep trying in production
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,

            // 20s timeout handles slow handshakes
            timeout: 20000,

            // Required for cross-origin credentials
            withCredentials: true,

            // Path must match backend/nginx configuration
            path: '/socket.io/',
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        newSocket.on('connect', () => {
            // Log transport used to confirm WebSocket upgrade succeeded
            const transport = newSocket.io.engine.transport.name;
            console.log(`[Socket] Connected: ${newSocket.id} (transport: ${transport})`);
            setIsConnected(true);
            toastShownRef.current = false;
            // Removed intrusive success toast for better UX
            newSocket.emit('join-subdomain', subdomain);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            setIsConnected(false);
        });

        newSocket.on('connect_error', (error) => {
            if (!toastShownRef.current) {
                console.error('[Socket] Connection error:', error.message);
                // Instead of a blocking error toast, we log it and update state
                // This prevents the "Real-time updates unavailable" spam
                toastShownRef.current = true;
            }
            setIsConnected(false);
        });

        // Forward real-time attendance updates to any listener in the app
        newSocket.on('attendance-update', (data) => {
            window.dispatchEvent(new CustomEvent('attendance-update', { detail: data }));
        });

        return () => {
            newSocket.disconnect();
        };
    }, [subdomain]);

    const value = {
        socket,
        isConnected,
        socketRef
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export { SocketContext };
export default SocketContext; // Keep for backward compatibility if needed, but named is better