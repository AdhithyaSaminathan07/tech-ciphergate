// src/context/AuthContext.jsx
import { createContext, useState, useEffect } from 'react';
import { login as loginService, logout as logoutService, getCurrentUser } from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if user exists in localStorage
  useEffect(() => {
    const loadUser = () => {
      try {
        const userData = getCurrentUser();
        if (userData) {
          setUser(userData);
        }
      } catch (error) {
        console.error('Failed to load user', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (credentials, userType) => {
    setLoading(true);
    try {
      const userData = await loginService(credentials, userType);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    logoutService();
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(prev => {
      const current = prev || JSON.parse(localStorage.getItem('user')) || {};
      const updated = { ...current, ...userData };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const value = {
    user,
    loading,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isWorker: user?.role === 'worker',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
