import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const handleProxyError = (proxy) => {
    proxy.on('error', (err, req, res) => {
        // Suppress ECONNREFUSED logs on startup/reconnect to prevent console spam
        if (err.code === 'ECONNREFUSED') {
            if (res && typeof res.writeHead === 'function') {
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway: Backend server is starting up or unreachable.');
                }
            } else if (res && typeof res.destroy === 'function') {
                res.destroy();
            }
            return;
        }
        console.error('[Vite Proxy Error]:', err.message);
    });
};

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            includeAssets: ['favicon.ico', 'appicon.png', 'logo.png'],
            manifestFilename: 'manifest.json',
            manifest: {
                name: 'CipherGate',
                short_name: 'CipherGate',
                id: '/',
                start_url: '/',
                display: 'standalone',
                background_color: '#ffffff',
                theme_color: '#0d9488',
                description: 'Professional Workforce Management and Performance Tracking System',
                orientation: 'any',
                scope: '/',
                categories: ['productivity', 'business'],
                icons: [
                    {
                        src: 'appicon.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'appicon.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: 'appicon.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'appicon.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: 'appicon.png',
                        sizes: '144x144',
                        type: 'image/png',
                        purpose: 'any'
                    }
                ],
                shortcuts: [
                    {
                        name: 'Admin Portal',
                        url: '/admin/login',
                        description: 'Access administrative dashboard'
                    },
                    {
                        name: 'Employee Dashboard',
                        url: '/worker/login',
                        description: 'Access your work dashboard'
                    }
                ]
            },
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            injectManifest: {
                maximumFileSizeToCacheInBytes: 5000000, // 5MB limit
                globIgnores: [
                    '**/models/**/*',          // Exclude ML models from precaching (load on-demand)
                    '**/Invoicelogo.pngg',      // Exclude unused duplicate image
                    '**/*.mp4',                // Exclude video files
                    '**/*.bak',                // Exclude backup files
                    '**/*.backup.jsx',         // Exclude backup files
                    '**/*.fixed.jsx',          // Exclude backup files
                    '**/node_modules/**/*'
                ]
            },
            devOptions: {
                enabled: true
            }
        })
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
build: {
    chunkSizeWarningLimit: 1000,
},
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                ws: true,
                configure: handleProxyError,
            },
            // Proxy Socket.IO in dev so the same domain-only URL works locally
            '/socket.io': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                ws: true,   // <-- enables WebSocket proxying in Vite
                configure: handleProxyError,
            },
            '/uploads': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                configure: handleProxyError,
            },
        },
    },
})
