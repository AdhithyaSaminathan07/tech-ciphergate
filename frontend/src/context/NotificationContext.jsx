import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import axios from 'axios';
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
    const apiBase = '/api/user-notifications';

    useEffect(() => {
        if (!token || !user) return;

        const fetchNotifications = async () => {
            try {
                const res = await axios.get(apiBase, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setNotifications(res.data.notifications);
                setUnreadCount(res.data.unreadCount);
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
                    autoClose: 5000,
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
            await axios.put(`${apiBase}/${id}/read`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
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
            console.log('Push messaging is not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const publicVapidKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;
            
            if (!publicVapidKey) {
                console.warn('VAPID key not configured');
                return;
            }

            // Base64 to Uint8Array
            const padding = '='.repeat((4 - publicVapidKey.length % 4) % 4);
            const base64 = (publicVapidKey + padding)
                .replace(/\-/g, '+')
                .replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: outputArray
            });

            await axios.post(`${apiBase}/subscribe`, { subscription }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            toast.success('Push notifications enabled');
        } catch (error) {
            console.error('Error subscribing to push', error);
        }
    };

    const updateSettings = async (newSettings) => {
        try {
            const res = await axios.put(`${apiBase}/settings`, newSettings, {
                headers: { Authorization: `Bearer ${token}` }
            });
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
