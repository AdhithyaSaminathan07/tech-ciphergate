// vite.config.js
import path from "path";
import react from "file:///D:/JAN%202026%20projects/ciphergate_april_06/ciphergate/frontend/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { defineConfig } from "file:///D:/JAN%202026%20projects/ciphergate_april_06/ciphergate/frontend/node_modules/vite/dist/node/index.js";
import { VitePWA } from "file:///D:/JAN%202026%20projects/ciphergate_april_06/ciphergate/frontend/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "D:\\JAN 2026 projects\\ciphergate_april_06\\ciphergate\\frontend";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["favicon.ico", "appicon.png", "logo.png"],
      manifestFilename: "manifest.json",
      manifest: {
        name: "CipherGate",
        short_name: "CipherGate",
        id: "/",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0d9488",
        description: "Professional Workforce Management and Performance Tracking System",
        orientation: "any",
        scope: "/",
        categories: ["productivity", "business"],
        icons: [
          {
            src: "appicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "appicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "appicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "appicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "appicon.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any"
          }
        ],
        shortcuts: [
          {
            name: "Admin Portal",
            url: "/admin/login",
            description: "Access administrative dashboard"
          },
          {
            name: "Employee Dashboard",
            url: "/worker/login",
            description: "Access your work dashboard"
          }
        ]
      },
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5e6
        // 5MB limit
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("face-api.js"))
              return "face-api";
            if (id.includes("jspdf"))
              return "pdf-lib";
            if (id.includes("xlsx"))
              return "excel-lib";
            if (id.includes("recharts"))
              return "charts";
            if (id.includes("framer-motion") || id.includes("motion"))
              return "framer-motion";
            if (id.includes("react-icons") || id.includes("lucide-react"))
              return "icons";
            if (id.includes("tsparticles"))
              return "particles";
            if (id.includes("telegram") || id.includes("@mtproto"))
              return "telegram";
            if (id.includes("react-router-dom") || id.includes("react-toastify") || id.includes("axios"))
              return "framework-utils";
            return "vendor";
          }
        }
      }
    },
    chunkSizeWarningLimit: 1e3
  },
  server: {
    port: 3e3,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      },
      // Proxy Socket.IO in dev so the same domain-only URL works locally
      "/socket.io": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        ws: true
        // <-- enables WebSocket proxying in Vite
      },
      "/uploads": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxKQU4gMjAyNiBwcm9qZWN0c1xcXFxjaXBoZXJnYXRlX2FwcmlsXzA2XFxcXGNpcGhlcmdhdGVcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXEpBTiAyMDI2IHByb2plY3RzXFxcXGNpcGhlcmdhdGVfYXByaWxfMDZcXFxcY2lwaGVyZ2F0ZVxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovSkFOJTIwMjAyNiUyMHByb2plY3RzL2NpcGhlcmdhdGVfYXByaWxfMDYvY2lwaGVyZ2F0ZS9mcm9udGVuZC92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCJcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiXHJcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCJcclxuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1wd2FcIlxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICAgIHBsdWdpbnM6IFtcclxuICAgICAgICByZWFjdCgpLFxyXG4gICAgICAgIFZpdGVQV0Eoe1xyXG4gICAgICAgICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcclxuICAgICAgICAgICAgaW5qZWN0UmVnaXN0ZXI6IG51bGwsXHJcbiAgICAgICAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5pY28nLCAnYXBwaWNvbi5wbmcnLCAnbG9nby5wbmcnXSxcclxuICAgICAgICAgICAgbWFuaWZlc3RGaWxlbmFtZTogJ21hbmlmZXN0Lmpzb24nLFxyXG4gICAgICAgICAgICBtYW5pZmVzdDoge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ0NpcGhlckdhdGUnLFxyXG4gICAgICAgICAgICAgICAgc2hvcnRfbmFtZTogJ0NpcGhlckdhdGUnLFxyXG4gICAgICAgICAgICAgICAgaWQ6ICcvJyxcclxuICAgICAgICAgICAgICAgIHN0YXJ0X3VybDogJy8nLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxyXG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNmZmZmZmYnLFxyXG4gICAgICAgICAgICAgICAgdGhlbWVfY29sb3I6ICcjMGQ5NDg4JyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZmVzc2lvbmFsIFdvcmtmb3JjZSBNYW5hZ2VtZW50IGFuZCBQZXJmb3JtYW5jZSBUcmFja2luZyBTeXN0ZW0nLFxyXG4gICAgICAgICAgICAgICAgb3JpZW50YXRpb246ICdhbnknLFxyXG4gICAgICAgICAgICAgICAgc2NvcGU6ICcvJyxcclxuICAgICAgICAgICAgICAgIGNhdGVnb3JpZXM6IFsncHJvZHVjdGl2aXR5JywgJ2J1c2luZXNzJ10sXHJcbiAgICAgICAgICAgICAgICBpY29uczogW1xyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3JjOiAnYXBwaWNvbi5wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHVycG9zZTogJ2FueSdcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3JjOiAnYXBwaWNvbi5wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHVycG9zZTogJ21hc2thYmxlJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzcmM6ICdhcHBpY29uLnBuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwdXJwb3NlOiAnYW55J1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzcmM6ICdhcHBpY29uLnBuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwdXJwb3NlOiAnbWFza2FibGUnXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNyYzogJ2FwcGljb24ucG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZXM6ICcxNDR4MTQ0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgICAgIHNob3J0Y3V0czogW1xyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ0FkbWluIFBvcnRhbCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogJy9hZG1pbi9sb2dpbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGFkbWluaXN0cmF0aXZlIGRhc2hib2FyZCdcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ0VtcGxveWVlIERhc2hib2FyZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogJy93b3JrZXIvbG9naW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyB5b3VyIHdvcmsgZGFzaGJvYXJkJ1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcclxuICAgICAgICAgICAgc3JjRGlyOiAnc3JjJyxcclxuICAgICAgICAgICAgZmlsZW5hbWU6ICdzdy5qcycsXHJcbiAgICAgICAgICAgIGluamVjdE1hbmlmZXN0OiB7XHJcbiAgICAgICAgICAgICAgICBtYXhpbXVtRmlsZVNpemVUb0NhY2hlSW5CeXRlczogNTAwMDAwMCAvLyA1TUIgbGltaXRcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZGV2T3B0aW9uczoge1xyXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgIF0sXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgICAgYWxpYXM6IHtcclxuICAgICAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBidWlsZDoge1xyXG4gICAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNwbGl0IGhlYXZ5IGxpYnJhcmllcyBpbnRvIHRoZWlyIG93biBjaHVua3NcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmYWNlLWFwaS5qcycpKSByZXR1cm4gJ2ZhY2UtYXBpJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdqc3BkZicpKSByZXR1cm4gJ3BkZi1saWInO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3hsc3gnKSkgcmV0dXJuICdleGNlbC1saWInO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlY2hhcnRzJykpIHJldHVybiAnY2hhcnRzJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmcmFtZXItbW90aW9uJykgfHwgaWQuaW5jbHVkZXMoJ21vdGlvbicpKSByZXR1cm4gJ2ZyYW1lci1tb3Rpb24nO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlYWN0LWljb25zJykgfHwgaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSByZXR1cm4gJ2ljb25zJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCd0c3BhcnRpY2xlcycpKSByZXR1cm4gJ3BhcnRpY2xlcyc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygndGVsZWdyYW0nKSB8fCBpZC5pbmNsdWRlcygnQG10cHJvdG8nKSkgcmV0dXJuICd0ZWxlZ3JhbSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVhY3Qtcm91dGVyLWRvbScpIHx8IGlkLmluY2x1ZGVzKCdyZWFjdC10b2FzdGlmeScpIHx8IGlkLmluY2x1ZGVzKCdheGlvcycpKSByZXR1cm4gJ2ZyYW1ld29yay11dGlscyc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBEZWZhdWx0IHZlbmRvciBjaHVuayBmb3Igc21hbGxlciBsaWJyYXJpZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3InO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAxMDAwLFxyXG4gICAgfSxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICAgIHBvcnQ6IDMwMDAsXHJcbiAgICAgICAgaG9zdDogdHJ1ZSxcclxuICAgICAgICBwcm94eToge1xyXG4gICAgICAgICAgICAnL2FwaSc6IHtcclxuICAgICAgICAgICAgICAgIHRhcmdldDogJ2h0dHA6Ly8xMjcuMC4wLjE6NTAwMScsXHJcbiAgICAgICAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIC8vIFByb3h5IFNvY2tldC5JTyBpbiBkZXYgc28gdGhlIHNhbWUgZG9tYWluLW9ubHkgVVJMIHdvcmtzIGxvY2FsbHlcclxuICAgICAgICAgICAgJy9zb2NrZXQuaW8nOiB7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjUwMDEnLFxyXG4gICAgICAgICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgd3M6IHRydWUsICAgLy8gPC0tIGVuYWJsZXMgV2ViU29ja2V0IHByb3h5aW5nIGluIFZpdGVcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgJy91cGxvYWRzJzoge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo1MDAxJyxcclxuICAgICAgICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgfSxcclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFvWCxPQUFPLFVBQVU7QUFDclksT0FBTyxXQUFXO0FBQ2xCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUh4QixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUN4QixTQUFTO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxnQkFBZ0I7QUFBQSxNQUNoQixlQUFlLENBQUMsZUFBZSxlQUFlLFVBQVU7QUFBQSxNQUN4RCxrQkFBa0I7QUFBQSxNQUNsQixVQUFVO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixJQUFJO0FBQUEsUUFDSixXQUFXO0FBQUEsUUFDWCxTQUFTO0FBQUEsUUFDVCxrQkFBa0I7QUFBQSxRQUNsQixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixPQUFPO0FBQUEsUUFDUCxZQUFZLENBQUMsZ0JBQWdCLFVBQVU7QUFBQSxRQUN2QyxPQUFPO0FBQUEsVUFDSDtBQUFBLFlBQ0ksS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLFVBQ2I7QUFBQSxVQUNBO0FBQUEsWUFDSSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEs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
