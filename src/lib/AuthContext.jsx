import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const isLoadingPublicSettings = false;
  const authError = null;
  const appPublicSettings = null;

  useEffect(() => {
    base44.auth.me()
      .then(currentUser => {
        setUser(currentUser);
        setIsAuthenticated(true);
      })
      .catch(() => {
        // No session — that's fine, app works without one
      })
      .finally(() => {
        setIsLoadingAuth(false);
      });
  }, []);

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    await base44.auth.logout();
    base44.auth.redirectToLogin();
  };

  const navigateToLogin = () => base44.auth.redirectToLogin(window.location.href);
  const checkAppState = () => {};

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};