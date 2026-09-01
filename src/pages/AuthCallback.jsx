import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { appParams } from '@/lib/app-params';

// The web bridge in the native OAuth flow. Base44 redirects here (a normal
// HTTPS page, which it accepts without complaint) after Google/Apple auth
// completes; this page immediately hands the token off to the app via the
// swiftscoregolf:// custom scheme deep link.
//
// This page is reachable from a normal browser (it's part of the published
// site), so it also has to behave reasonably there — but its only real job
// is firing the deep link for the native app.
export default function AuthCallback() {
  const [needsManualTap, setNeedsManualTap] = useState(false);
  const [token, setToken] = useState(null);
  // This app uses HashRouter — Base44 redirects here as
  // ".../#/auth-callback?access_token=...". Everything after "#" is the URL
  // fragment, so window.location.search is empty (there's no top-level "?")
  // and appParams.token / raw URLSearchParams(window.location.hash) both
  // mis-parse it (the leading "/auth-callback?" ends up folded into the key).
  // useSearchParams() is React Router's own parser for the query portion
  // *within* the hash — it's the only one of these that actually works here.
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Order matters: app-params.js runs at import time and may already have
    // stripped access_token out of the URL (removeFromUrl: true), saving it
    // to localStorage first. Check that before assuming it's missing.
    const accessToken =
      appParams.token ||
      searchParams.get('access_token') ||
      searchParams.get('token') ||
      params.get('access_token') ||
      params.get('token') ||
      localStorage.getItem('base44_access_token');

    if (accessToken) {
      setToken(accessToken);
      window.location.href = `swiftscoregolf://auth-callback?access_token=${accessToken}`;
      // If the browser blocks the automatic scheme navigation, offer a manual link.
      const t = setTimeout(() => setNeedsManualTap(true), 1000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      {needsManualTap && token ? (
        <a
          href={`swiftscoregolf://auth-callback?access_token=${token}`}
          className="text-primary underline underline-offset-2"
        >
          Return to Swift Score Golf
        </a>
      ) : (
        <p className="text-muted-foreground">Finishing sign-in...</p>
      )}
    </div>
  );
}
