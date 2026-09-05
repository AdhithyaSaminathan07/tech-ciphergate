// vite.config.js
import path from "path";
import react from "file:///D:/tech-cipher/tech-ciphergate/frontend/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { defineConfig } from "file:///D:/tech-cipher/tech-ciphergate/frontend/node_modules/vite/dist/node/index.js";
import { VitePWA } from "file:///D:/tech-cipher/tech-ciphergate/frontend/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "D:\\tech-cipher\\tech-ciphergate\\frontend";
var handleProxyError = (proxy) => {
  proxy.on("error", (err, req, res) => {
    if (err.code === "ECONNREFUSED") {
      if (res && typeof res.writeHead === "function") {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Bad Gateway: Backend server is starting up or unreachable.");
        }
      } else if (res && typeof res.destroy === "function") {
        res.destroy();
      }
      return;
    }
    console.error("[Vite Proxy Error]:", err.message);
  });
};
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
        maximumFileSizeToCacheInBytes: 5e6,
        // 5MB limit
        globIgnores: [
          "**/models/**/*",
          // Exclude ML models from precaching (load on-demand)
          "**/Invoicelogo.pngg",
          // Exclude unused duplicate image
          "**/*.mp4",
          // Exclude video files
          "**/*.bak",
          // Exclude backup files
          "**/*.backup.jsx",
          // Exclude backup files
          "**/*.fixed.jsx",
          // Exclude backup files
          "**/node_modules/**/*"
        ]
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
    chunkSizeWarningLimit: 1e3,
    sourcemap: false
    // Disable sourcemaps in production
  },
  esbuild: {
    drop: ["console", "debugger"]
    // Strip console logs and debuggers in production
  },
  server: {
    port: 3e3,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5002",
        changeOrigin: true,
        ws: true,
        configure: handleProxyError
      },
      // Proxy Socket.IO in dev so the same domain-only URL works locally
      "/socket.io": {
        target: "http://127.0.0.1:5002",
        changeOrigin: true,
        ws: true,
        // <-- enables WebSocket proxying in Vite
        configure: handleProxyError
      },
      "/uploads": {
        target: "http://127.0.0.1:5002",
        changeOrigin: true,
        configure: handleProxyError
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFx0ZWNoLWNpcGhlclxcXFx0ZWNoLWNpcGhlcmdhdGVcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXHRlY2gtY2lwaGVyXFxcXHRlY2gtY2lwaGVyZ2F0ZVxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovdGVjaC1jaXBoZXIvdGVjaC1jaXBoZXJnYXRlL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIlxyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCJcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIlxyXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiXHJcblxyXG5jb25zdCBoYW5kbGVQcm94eUVycm9yID0gKHByb3h5KSA9PiB7XHJcbiAgICBwcm94eS5vbignZXJyb3InLCAoZXJyLCByZXEsIHJlcykgPT4ge1xyXG4gICAgICAgIC8vIFN1cHByZXNzIEVDT05OUkVGVVNFRCBsb2dzIG9uIHN0YXJ0dXAvcmVjb25uZWN0IHRvIHByZXZlbnQgY29uc29sZSBzcGFtXHJcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUNPTk5SRUZVU0VEJykge1xyXG4gICAgICAgICAgICBpZiAocmVzICYmIHR5cGVvZiByZXMud3JpdGVIZWFkID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAyLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzLmVuZCgnQmFkIEdhdGV3YXk6IEJhY2tlbmQgc2VydmVyIGlzIHN0YXJ0aW5nIHVwIG9yIHVucmVhY2hhYmxlLicpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlcyAmJiB0eXBlb2YgcmVzLmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgIHJlcy5kZXN0cm95KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zb2xlLmVycm9yKCdbVml0ZSBQcm94eSBFcnJvcl06JywgZXJyLm1lc3NhZ2UpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICAgIHJlYWN0KCksXHJcbiAgICAgICAgVml0ZVBXQSh7XHJcbiAgICAgICAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxyXG4gICAgICAgICAgICBpbmplY3RSZWdpc3RlcjogbnVsbCxcclxuICAgICAgICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLmljbycsICdhcHBpY29uLnBuZycsICdsb2dvLnBuZyddLFxyXG4gICAgICAgICAgICBtYW5pZmVzdEZpbGVuYW1lOiAnbWFuaWZlc3QuanNvbicsXHJcbiAgICAgICAgICAgIG1hbmlmZXN0OiB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnQ2lwaGVyR2F0ZScsXHJcbiAgICAgICAgICAgICAgICBzaG9ydF9uYW1lOiAnQ2lwaGVyR2F0ZScsXHJcbiAgICAgICAgICAgICAgICBpZDogJy8nLFxyXG4gICAgICAgICAgICAgICAgc3RhcnRfdXJsOiAnLycsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXHJcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI2ZmZmZmZicsXHJcbiAgICAgICAgICAgICAgICB0aGVtZV9jb2xvcjogJyMwZDk0ODgnLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9mZXNzaW9uYWwgV29ya2ZvcmNlIE1hbmFnZW1lbnQgYW5kIFBlcmZvcm1hbmNlIFRyYWNraW5nIFN5c3RlbScsXHJcbiAgICAgICAgICAgICAgICBvcmllbnRhdGlvbjogJ2FueScsXHJcbiAgICAgICAgICAgICAgICBzY29wZTogJy8nLFxyXG4gICAgICAgICAgICAgICAgY2F0ZWdvcmllczogWydwcm9kdWN0aXZpdHknLCAnYnVzaW5lc3MnXSxcclxuICAgICAgICAgICAgICAgIGljb25zOiBbXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzcmM6ICdhcHBpY29uLnBuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemVzOiAnMTkyeDE5MicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwdXJwb3NlOiAnYW55J1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzcmM6ICdhcHBpY29uLnBuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemVzOiAnMTkyeDE5MicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwdXJwb3NlOiAnbWFza2FibGUnXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNyYzogJ2FwcGljb24ucG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNyYzogJ2FwcGljb24ucG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHB1cnBvc2U6ICdtYXNrYWJsZSdcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3JjOiAnYXBwaWNvbi5wbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplczogJzE0NHgxNDQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHVycG9zZTogJ2FueSdcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgICAgc2hvcnRjdXRzOiBbXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAnQWRtaW4gUG9ydGFsJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiAnL2FkbWluL2xvZ2luJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgYWRtaW5pc3RyYXRpdmUgZGFzaGJvYXJkJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAnRW1wbG95ZWUgRGFzaGJvYXJkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiAnL3dvcmtlci9sb2dpbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIHlvdXIgd29yayBkYXNoYm9hcmQnXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxyXG4gICAgICAgICAgICBzcmNEaXI6ICdzcmMnLFxyXG4gICAgICAgICAgICBmaWxlbmFtZTogJ3N3LmpzJyxcclxuICAgICAgICAgICAgaW5qZWN0TWFuaWZlc3Q6IHtcclxuICAgICAgICAgICAgICAgIG1heGltdW1GaWxlU2l6ZVRvQ2FjaGVJbkJ5dGVzOiA1MDAwMDAwLCAvLyA1TUIgbGltaXRcclxuICAgICAgICAgICAgICAgIGdsb2JJZ25vcmVzOiBbXHJcbiAgICAgICAgICAgICAgICAgICAgJyoqL21vZGVscy8qKi8qJywgICAgICAgICAgLy8gRXhjbHVkZSBNTCBtb2RlbHMgZnJvbSBwcmVjYWNoaW5nIChsb2FkIG9uLWRlbWFuZClcclxuICAgICAgICAgICAgICAgICAgICAnKiovSW52b2ljZWxvZ28ucG5nZycsICAgICAgLy8gRXhjbHVkZSB1bnVzZWQgZHVwbGljYXRlIGltYWdlXHJcbiAgICAgICAgICAgICAgICAgICAgJyoqLyoubXA0JywgICAgICAgICAgICAgICAgLy8gRXhjbHVkZSB2aWRlbyBmaWxlc1xyXG4gICAgICAgICAgICAgICAgICAgICcqKi8qLmJhaycsICAgICAgICAgICAgICAgIC8vIEV4Y2x1ZGUgYmFja3VwIGZpbGVzXHJcbiAgICAgICAgICAgICAgICAgICAgJyoqLyouYmFja3VwLmpzeCcsICAgICAgICAgLy8gRXhjbHVkZSBiYWNrdXAgZmlsZXNcclxuICAgICAgICAgICAgICAgICAgICAnKiovKi5maXhlZC5qc3gnLCAgICAgICAgICAvLyBFeGNsdWRlIGJhY2t1cCBmaWxlc1xyXG4gICAgICAgICAgICAgICAgICAgICcqKi9ub2RlX21vZHVsZXMvKiovKidcclxuICAgICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZGV2T3B0aW9uczoge1xyXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgIF0sXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgICAgYWxpYXM6IHtcclxuICAgICAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbmJ1aWxkOiB7XHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDEwMDAsXHJcbiAgICBzb3VyY2VtYXA6IGZhbHNlLCAvLyBEaXNhYmxlIHNvdXJjZW1hcHMgaW4gcHJvZHVjdGlvblxyXG59LFxyXG5lc2J1aWxkOiB7XHJcbiAgICBkcm9wOiBbJ2NvbnNvbGUnLCAnZGVidWdnZXInXSwgLy8gU3RyaXAgY29uc29sZSBsb2dzIGFuZCBkZWJ1Z2dlcnMgaW4gcHJvZHVjdGlvblxyXG59LFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgICAgcG9ydDogMzAwMCxcclxuICAgICAgICBob3N0OiB0cnVlLFxyXG4gICAgICAgIHByb3h5OiB7XHJcbiAgICAgICAgICAgICcvYXBpJzoge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo1MDAyJyxcclxuICAgICAgICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIHdzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgY29uZmlndXJlOiBoYW5kbGVQcm94eUVycm9yLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAvLyBQcm94eSBTb2NrZXQuSU8gaW4gZGV2IHNvIHRoZSBzYW1lIGRvbWFpbi1vbmx5IFVSTCB3b3JrcyBsb2NhbGx5XHJcbiAgICAgICAgICAgICcvc29ja2V0LmlvJzoge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo1MDAyJyxcclxuICAgICAgICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIHdzOiB0cnVlLCAgIC8vIDwtLSBlbmFibGVzIFdlYlNvY2tldCBwcm94eWluZyBpbiBWaXRlXHJcbiAgICAgICAgICAgICAgICBjb25maWd1cmU6IGhhbmRsZVByb3h5RXJyb3IsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICcvdXBsb2Fkcyc6IHtcclxuICAgICAgICAgICAgICAgIHRhcmdldDogJ2h0dHA6Ly8xMjcuMC4wLjE6NTAwMicsXHJcbiAgICAgICAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgICAgICAgICBjb25maWd1cmU6IGhhbmRsZVByb3h5RXJyb3IsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbn0pXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1MsT0FBTyxVQUFVO0FBQ2hVLE9BQU8sV0FBVztBQUNsQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFIeEIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTSxtQkFBbUIsQ0FBQyxVQUFVO0FBQ2hDLFFBQU0sR0FBRyxTQUFTLENBQUMsS0FBSyxLQUFLLFFBQVE7QUFFakMsUUFBSSxJQUFJLFNBQVMsZ0JBQWdCO0FBQzdCLFVBQUksT0FBTyxPQUFPLElBQUksY0FBYyxZQUFZO0FBQzVDLFlBQUksQ0FBQyxJQUFJLGFBQWE7QUFDbEIsY0FBSSxVQUFVLEtBQUssRUFBRSxnQkFBZ0IsYUFBYSxDQUFDO0FBQ25ELGNBQUksSUFBSSw0REFBNEQ7QUFBQSxRQUN4RTtBQUFBLE1BQ0osV0FBVyxPQUFPLE9BQU8sSUFBSSxZQUFZLFlBQVk7QUFDakQsWUFBSSxRQUFRO0FBQUEsTUFDaEI7QUFDQTtBQUFBLElBQ0o7QUFDQSxZQUFRLE1BQU0sdUJBQXVCLElBQUksT0FBTztBQUFBLEVBQ3BELENBQUM7QUFDTDtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQ3hCLFNBQVM7QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLGdCQUFnQjtBQUFBLE1BQ2hCLGVBQWUsQ0FBQyxlQUFlLGVBQWUsVUFBVTtBQUFBLE1BQ3hELGtCQUFrQjtBQUFBLE1BQ2xCLFVBQVU7QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLElBQUk7QUFBQSxRQUNKLFdBQVc7QUFBQSxRQUNYLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLFFBQ2xCLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLE9BQU87QUFBQSxRQUNQLFlBQVksQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLFFBQ3ZDLE9BQU87QUFBQSxVQUNIO0FBQUEsWUFDSSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDYjtBQUFBLFVBQ0E7QUFBQSxZQUNJLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNiO0FBQUEsVUFDQTtBQUFBLFlBQ0ksS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLFVBQ2I7QUFBQSxVQUNBO0FBQUEsWUFDSSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDYjtBQUFBLFVBQ0E7QUFBQSxZQUNJLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNiO0FBQUEsUUFDSjtBQUFBLFFBQ0EsV0FBVztBQUFBLFVBQ1A7QUFBQSxZQUNJLE1BQU07QUFBQSxZQUNOLEtBQUs7QUFBQSxZQUNMLGFBQWE7QUFBQSxVQUNqQjtBQUFBLFVBQ0E7QUFBQSxZQUNJLE1BQU07QUFBQSxZQUNOLEtBQUs7QUFBQSxZQUNMLGFBQWE7QUFBQSxVQUNqQjtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQUEsTUFDQSxZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixnQkFBZ0I7QUFBQSxRQUNaLCtCQUErQjtBQUFBO0FBQUEsUUFDL0IsYUFBYTtBQUFBLFVBQ1Q7QUFBQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBQ0E7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1IsU0FBUztBQUFBLE1BQ2I7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDTCxPQUFPO0FBQUEsTUFDSCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDeEM7QUFBQSxFQUNKO0FBQUEsRUFDSixPQUFPO0FBQUEsSUFDSCx1QkFBdUI7QUFBQSxJQUN2QixXQUFXO0FBQUE7QUFBQSxFQUNmO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDTCxNQUFNLENBQUMsV0FBVyxVQUFVO0FBQUE7QUFBQSxFQUNoQztBQUFBLEVBQ0ksUUFBUTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0gsUUFBUTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsSUFBSTtBQUFBLFFBQ0osV0FBVztBQUFBLE1BQ2Y7QUFBQTtBQUFBLE1BRUEsY0FBYztBQUFBLFFBQ1YsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsSUFBSTtBQUFBO0FBQUEsUUFDSixXQUFXO0FBQUEsTUFDZjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsV0FBVztBQUFBLE1BQ2Y7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUNKLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
