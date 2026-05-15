import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

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
                maximumFileSizeToCacheInBytes: 5000000 // 5MB limit
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
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        // Split heavy libraries into their own chunks
                        if (id.includes('face-api.js')) return 'face-api';
                        if (id.includes('jspdf')) return 'pdf-lib';
                        if (id.includes('xlsx')) return 'excel-lib';
                        if (id.includes('recharts')) return 'charts';
                        if (id.includes('framer-motion') || id.includes('motion')) return 'framer-motion';
                        if (id.includes('react-icons') || id.includes('lucide-react')) return 'icons';
                        if (id.includes('tsparticles')) return 'particles';
                        if (id.includes('telegram') || id.includes('@mtproto')) return 'telegram';
                        if (id.includes('react-router-dom') || id.includes('react-toastify') || id.includes('axios')) return 'framework-utils';
                        
                        // Default vendor chunk for smaller libraries
                        return 'vendor';
                    }
                }
            }
        },
        chunkSizeWarningLimit: 1000,
    },
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                ws: true,
            },
            // Proxy Socket.IO in dev so the same domain-only URL works locally
            '/socket.io': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                ws: true,   // <-- enables WebSocket proxying in Vite
            },
            '/uploads': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
            },
        },
    },
})
