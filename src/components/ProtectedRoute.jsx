import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
  </div>
);

// `requireSubscription` gates pages that need an active subscription/trial
// (or admin) behind the Paywall. Pass `false` for pages that any logged-in
// user must be able to reach regardless of billing status — e.g. /Settings,
// whose "Sign Out" button is otherwise unreachable for a free/non-subscribed
// user (there was no other way out of the app once inside). Auth is still
// required either way; only the subscription check is skipped.
export default function ProtectedRoute({ requireSubscription = true }) {
  const { isAuthenticated, isLoadingAuth, user, navigateToLogin } = useAuth();
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // Auth check — redirect to login if not authenticated. Routed through
  // AuthContext.navigateToLogin so native platforms go to our own /login
  // screen instead of being redirected out to the published site.
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      navigateToLogin();
    }
  }, [isLoadingAuth, isAuthenticated, navigateToLogin]);

  // Subscription check — redirect to Paywall if no active subscription/trial
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !user) return;

    if (!requireSubscription) {
      setHasAccess(true);
      setSubscriptionChecked(true);
      return;
    }

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
  }, [isAuthenticated, isLoadingAuth, user, requireSubscription]);

  if (isLoadingAuth || !isAuthenticated) return <Spinner />;
  if (!subscriptionChecked) return <Spinner />;
  if (!hasAccess) return <Navigate to="/Paywall" replace />;

  return <Outlet />;
}