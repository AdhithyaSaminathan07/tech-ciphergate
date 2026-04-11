import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Spinner from './Spinner';

const PrivateRoute = ({ 
  allowedRoles = [], 
  redirectPath = '/login'
}) => {
  const { user, loading } = useAuth();
  const token = localStorage.getItem('token');

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // More robust authentication check
  const isAuthorized = 
    token && 
    user && 
    (allowedRoles.length === 0 || allowedRoles.includes(user.role));
  
  // Intelligent redirect path
  const getRedirectPath = () => {
    // Check current path to determine appropriate redirect
    const currentPath = window.location.pathname;
    
    if (allowedRoles.includes('admin')) return '/admin/login';
    if (allowedRoles.includes('worker')) {
      // For worker routes, check if we're already on a worker login page
      // to avoid redirect loops
      if (currentPath.startsWith('/worker/login')) {
        return '/worker/login';
      }
      return '/worker/login';
    }
    return redirectPath;
  };

  // Render outlet or redirect
  return isAuthorized 
    ? <Outlet /> 
    : <Navigate to={getRedirectPath()} replace />;
};

export default PrivateRoute;