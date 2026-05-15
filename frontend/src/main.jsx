import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import { registerSW } from 'virtual:pwa-register'

// Explicitly register the service worker for better reliability on various mobile devices
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('N剥 DEBUG: SW - New content available, will update automatically.');
  },
  onOfflineReady() {
    console.log('N剥 DEBUG: SW - Content cached for offline use.');
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
        <ToastContainer position="top-right" autoClose={3000} />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)