import React, { createContext, useState, useContext, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
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
      .catch((error) => {
        // No session — that's fine, app works without one. But if there WAS a
        // token and the server rejected it (expired/invalid/fake), discard it —
        // otherwise it lingers in localStorage and every future launch retries
        // the same doomed token. See skill base44-capacitor-social-auth-ios §3.7.
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          try {
            localStorage.removeItem('base44_access_token');
            localStorage.removeItem('token');
          } catch (e) { console.warn('Failed to clear rejected token:', e); }
        }
      })
      .finally(() => {
        setIsLoadingAuth(false);
      });
  }, []);

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    if (Capacitor.isNativePlatform()) {
      // base44.auth.logout() also does `window.location.href = appBaseUrl + '/api/.../logout'`,
      // which on native would navigate the WebView to an external domain — ejecting the
      // user from the app. Clear the session ourselves and route internally instead.
      try {
        localStorage.removeItem('base44_access_token');
        localStorage.removeItem('token');
      } catch (e) { console.warn('Failed to clear token on logout:', e); }
      // setToken(null) is a no-op in the SDK (it early-returns on a falsy token,
      // so it never clears axios's Authorization header) — but window.location.href
      // below is a full reload, which throws away the in-memory axios client
      // entirely, so the stale header doesn't survive either way.
      // This app uses HashRouter — routes live in the URL fragment (#/login),
      // not the path. A plain '/login' path 404s against Capacitor's local
      // static server (blank screen, no route match).
      window.location.href = '/#/login';
      return;
    }
    await base44.auth.logout();
    base44.auth.redirectToLogin();
  };

  const navigateToLogin = () => {
    if (Capacitor.isNativePlatform()) {
      // redirectToLogin() builds an absolute URL to appBaseUrl — on native that
      // would navigate the WebView away to the published site instead of our
      // own native login screen. Route internally.
      // This app uses HashRouter — routes live in the URL fragment (#/login),
      // not the path. A plain '/login' path 404s against Capacitor's local
      // static server (blank screen, no route match).
      window.location.href = '/#/login';
      return;
    }
    base44.auth.redirectToLogin(window.location.href);
  };
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