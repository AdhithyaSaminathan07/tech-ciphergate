import { precacheAndRoute } from 'workbox-precaching';

// Precache assets
precacheAndRoute(self.__WB_MANIFEST);

// Listen for push events
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/appicon.png',
            badge: '/appicon.png',
            image: data.image,
            silent: data.playSound === false,
            vibrate: data.playSound === false ? undefined : [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.url,
            },
            actions: [
                {
                    action: 'explore',
                    title: 'View Task',
                },
                {
                    action: 'close',
                    title: 'Dismiss',
                },
            ],
        };

        // Don't show push notification if tab is focused.
        // We will handle it via socket.io toast.
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                let isFocused = false;
                for (let i = 0; i < windowClients.length; i++) {
                    const windowClient = windowClients[i];
                    if (windowClient.focused) {
                        isFocused = true;
                        break;
                    }
                }

                // If app is not focused or not open, show notification
                if (!isFocused) {
                    return self.registration.showNotification(data.title, options);
                }
            })
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window/tab
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
