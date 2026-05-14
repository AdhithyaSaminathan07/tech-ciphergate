// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token  = localStorage.getItem('token');
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch (_) {}
    }
    setLoading(false);
  }, []);

  const login = async (credentials, isAdmin = false) => {
    const endpoint = isAdmin ? '/api/auth/admin' : '/api/auth/worker';
    const API = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
    
    const { data } = await axios.post(`${API}${endpoint}`, credentials);
    
    // ── Store token ───────────────────────────────────────────────
    localStorage.setItem('token', data.token);
    
    // ── Store user object ─────────────────────────────────────────
    localStorage.setItem('user', JSON.stringify(data));
    
    // ── Store tenentId in ALL variants ────────────────────────────
    const tid = data.tenentId || data.tenentid || data._id;
    if (tid) {
      localStorage.setItem('tenentId', tid);
      localStorage.setItem('tenentid', tid);  // Instaxbot uses lowercase
      localStorage.setItem('tenantId', tid);
      localStorage.setItem('tenantid', tid);
    }
    
    setUser(data);
    return data;
  };

  const logout = () => {
    // Clear all auth-related storage
    ['token', 'user', 'tenentId', 'tenentid', 'tenantId', 'tenantid'].forEach(k => 
      localStorage.removeItem(k)
    );
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
