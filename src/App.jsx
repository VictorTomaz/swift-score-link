// Build: 2026-05-15
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { TourProvider } from '@/context/TourContext';
import NativeLogin from '@/pages/NativeLogin';
import AuthCallback from '@/pages/AuthCallback';

import { lazy, Suspense } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';

// Deep link handler for the native Google/Apple login bridge (see
// AuthCallback.jsx / skill base44-capacitor-social-auth-ios). Lives outside
// the Router so it fires regardless of which screen is currently mounted.
const useNativeAuthDeepLink = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async (data) => {
      if (data?.url && data.url.includes('access_token')) {
        const token = new URL(data.url).searchParams.get('access_token');
        if (token) {
          localStorage.setItem('base44_access_token', token);
          localStorage.setItem('token', token);
          base44.auth.setToken(token);
          try { await Browser.close(); } catch { /* already closed */ }
          // '/' — never back to '/auth-callback' or '/login', or the deep link
          // (or the redirect-to-login effect) fires again in a loop.
          window.location.href = '/';
        }
      }
    });
    return () => { listenerPromise.then((l) => l.remove()).catch(() => {}); };
  }, []);
};

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const SetupWizard = lazy(() => import('@/pages/SetupWizard'));
const Scorecard = lazy(() => import('@/pages/Scorecard'));
const Results = lazy(() => import('@/pages/Results'));
const PublicResults = lazy(() => import('@/pages/PublicResults'));
const History = lazy(() => import('@/pages/History'));
const CoursesManagement = lazy(() => import('@/pages/CoursesManagement'));
const PlayersManagement = lazy(() => import('@/pages/PlayersManagement'));
const Help = lazy(() => import('@/pages/Help'));
const Faq = lazy(() => import('@/pages/Faq'));
const TermsAndPrivacy = lazy(() => import('@/pages/TermsAndPrivacy'));
const Settings = lazy(() => import('@/pages/Settings'));
const TournamentLogistics = lazy(() => import('@/pages/TournamentLogistics'));
const Paywall = lazy(() => import('@/pages/Paywall'));
const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
        </div>
      }>
      <Routes>
        {/* Public routes — no auth required */}
        <Route path="/public-results/:roundId" element={<PublicResults />} />
        <Route path="/TermsAndPrivacy" element={<TermsAndPrivacy />} />
        <Route path="/Paywall" element={<Paywall />} />
        <Route path="/login" element={<NativeLogin />} />
        <Route path="/auth-callback" element={<AuthCallback />} />

        {/* Protected routes — must be logged in */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/Dashboard" replace />} />
            <Route path="/Dashboard" element={<Dashboard />} />
            <Route path="/SetupWizard" element={<SetupWizard />} />
            <Route path="/Scorecard" element={<Scorecard />} />
            <Route path="/Results" element={<Results />} />
            <Route path="/History" element={<History />} />
            <Route path="/CoursesManagement" element={<CoursesManagement />} />
            <Route path="/PlayersManagement" element={<PlayersManagement />} />
            <Route path="/Help" element={<Help />} />
            <Route path="/Faq" element={<Faq />} />
            <Route path="/Settings" element={<Settings />} />
            <Route path="/TournamentLogistics" element={<TournamentLogistics />} />
          </Route>
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
    </>
  );
};

function App() {
  useNativeAuthDeepLink();
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <TourProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
        </TourProvider>
        <Toaster />
        <SonnerToaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App