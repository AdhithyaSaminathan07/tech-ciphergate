// src/context/AuthContext.jsx
import { createContext, useState, useEffect } from 'react';
import { login as loginService, logout as logoutService, getCurrentUser } from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if user is authenticated via backend
  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await getCurrentUser();
        if (userData) {
          setUser(userData);
          localStorage.setItem('ciphergate_user_sso', JSON.stringify({
            username: userData.username || userData.email || userData.name,
            email: userData.email,
            role: userData.role
          }));
        }
      } catch (error) {
        console.error('Failed to load user', error);
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
      if (userData) {
        localStorage.setItem('ciphergate_user_sso', JSON.stringify({
          username: userData.username || userData.email || userData.name,
          email: userData.email,
          role: userData.role || userType
        }));
      }
      return userData;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logoutService();
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(prev => {
      const updated = { ...prev, ...userData };
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
