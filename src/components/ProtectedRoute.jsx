import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute() {
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // Auth check — redirect to login if not authenticated
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      base44.auth.redirectToLogin(window.location.href);
    }
  }, [isLoadingAuth, isAuthenticated]);

  // Subscription check — redirect to Paywall if no active subscription/trial
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !user) return;

    const checkAccess = async () => {
      // Admins always have access
      if (user.role === 'admin') {
        setHasAccess(true);
        setSubscriptionChecked(true);
        return;
      }

      try {
        const response = await base44.functions.invoke('checkSubscriptionStatus', {});
        setHasAccess(response.data.hasActiveSubscription || false);
      } catch (error) {
        console.error('Failed to check subscription:', error);
        setHasAccess(true); // Fail open — don't lock out users on transient errors
      }
      setSubscriptionChecked(true);
    };

    checkAccess();
  }, [isAuthenticated, isLoadingAuth, user]);

  if (isLoadingAuth || !isAuthenticated) return <Spinner />;
  if (!subscriptionChecked) return <Spinner />;
  if (!hasAccess) return <Navigate to="/Paywall" replace />;

  return <Outlet />;
}