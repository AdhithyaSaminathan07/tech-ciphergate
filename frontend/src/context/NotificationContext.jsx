import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useSocket } from './SocketContextNew';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

// Audio for notification sound
const notificationSound = new Audio('/notification.mp3');

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [settings, setSettings] = useState({ pushEnabled: true, soundEnabled: true });
    const { socket, isConnected } = useSocket();
    const { user } = useAuth();
    const lastSoundPlayRef = useRef(0);

    const token = localStorage.getItem('token');
    const apiBase = '/user-notifications';

    useEffect(() => {
        if (!token || !user) return;

        const fetchNotifications = async () => {
            try {
                console.log('[Notification Debug] Fetching notifications from api base:', apiBase);
                const res = await api.get(apiBase);
                setNotifications(res.data.notifications);
                setUnreadCount(res.data.unreadCount);

                // Auto-subscribe if push is enabled (default to true if user.notificationSettings doesn't exist yet)
                const pushEnabled = user.notificationSettings?.pushEnabled !== false;
                setSettings({
                    pushEnabled,
                    soundEnabled: user.notificationSettings?.soundEnabled !== false
                });

                if (pushEnabled) {
                    console.log('[Notification Debug] Automatic push subscription triggered on login.');
                    subscribeToPush();
                }
            } catch (err) {
                console.error('Error fetching notifications:', err);
            }
        };

        fetchNotifications();
    }, [token, user]);

    useEffect(() => {
        if (!socket || !isConnected || !user?._id) return;

        // Join user-specific room for private notifications
        socket.emit('join-user', user._id);
        console.log(`[Notification] Joined user room: ${user._id}`);

        const handleNewNotification = (notification) => {
            setNotifications((prev) => [notification, ...prev]);
            setUnreadCount((prev) => prev + 1);

            // Play sound with debounce (3 seconds)
            if (notification.playSound) {
                const now = Date.now();
                if (now - lastSoundPlayRef.current > 3000) {
                    lastSoundPlayRef.current = now;
                    notificationSound.play().catch(e => console.warn('Sound play prevented', e));
                }
            }

            // Show Toast if tab is focused
            if (document.hasFocus()) {
                toast.info(`🔔 ${notification.title}: ${notification.message}`, {
                    autoClose: 3500,
                    position: 'top-right',
                    theme: 'dark',
                    onClick: () => {
                        if (notification.link) window.location.href = notification.link;
                    }
                });
            }
        };

        socket.on('notification', handleNewNotification);

        return () => {
            socket.off('notification', handleNewNotification);
        };
    }, [socket, isConnected, user?._id]);

    const markAsRead = async (id) => {
        try {
            await api.put(`${apiBase}/${id}/read`);
            
            if (id === 'all') {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                setUnreadCount(0);
            } else {
                setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.error('Error marking as read', err);
        }
    };

    const subscribeToPush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Notification Debug] Service workers or Push Messaging is not supported by this browser.');
            return;
        }

        try {
            console.log('[Notification Debug] Checking permissions...');
            // Request permission explicitly
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            console.log('[Notification Debug] Permission status:', permission);

            if (permission !== 'granted') {
                console.warn('[Notification Debug] Push notification permission not granted.');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            console.log('[Notification Debug] Service Worker active registration verified:', !!registration);

            const publicVapidKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;
            console.log('[Notification Debug] Public VAPID Key loaded:', publicVapidKey ? 'YES' : 'NO');
            
            if (!publicVapidKey) {
                console.warn('[Notification Debug] VAPID key not configured in frontend environment.');
                return;
            }

            // Base64 to Uint8Array converter
            const padding = '='.repeat((4 - publicVapidKey.length % 4) % 4);
            const base64 = (publicVapidKey + padding)
                .replace(/\-/g, '+')
                .replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }

            console.log('[Notification Debug] Subscribing to PushManager...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: outputArray
            });
            console.log('[Notification Debug] Generated subscription object successfully.');

            console.log('[Notification Debug] Sending subscription payload to backend...');
            const res = await api.post(`${apiBase}/subscribe`, { subscription });
            console.log('[Notification Debug] Push Subscription saved on server. Status:', res.status);
            
            toast.success('Push notifications enabled');
        } catch (error) {
            console.error('[Notification Debug] Error subscribing to push notifications:', error);
        }
    };

    const updateSettings = async (newSettings) => {
        try {
            const res = await api.put(`${apiBase}/settings`, newSettings);
            setSettings(res.data);
            if (res.data.pushEnabled) {
                subscribeToPush();
            }
        } catch (error) {
            console.error('Error updating settings', error);
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            settings,
            markAsRead,
            subscribeToPush,
            updateSettings
        }}>
            {children}
        </NotificationContext.Provider>
    );
};
