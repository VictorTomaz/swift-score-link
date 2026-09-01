import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Absolute, hardcoded — NEVER derive from window.location.origin on native
// (that resolves to capacitor://localhost, which Base44 rejects as an invalid
// redirect domain). See skill base44-capacitor-social-auth-ios.
const APP_ID = '69bb019558d96a11fbfbddce';
const BASE_URL = 'https://swift-score-link.base44.app';

/**
 * Native-only login screen. On iOS/Android, Google/Apple sign-in must happen
 * in the system browser (SFSafariViewController), never inside the Capacitor
 * WebView — Google blocks embedded webviews with 403 disallowed_useragent.
 * The bridge page (/auth-callback) is what brings the token back into the app
 * via deep link. See AuthCallback.jsx and the appUrlOpen listener in App.jsx.
 */
export default function NativeLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(null); // 'google' | 'apple' | 'email' | null
  const [error, setError] = useState(null);

  const openBridge = async (path) => {
    // '/#/auth-callback', not '/auth-callback' — this app uses HashRouter, so
    // routes live in the URL fragment. Without the '#' the SPA never matches
    // the route: it loads the published site's root instead (still capturing
    // the token, since app-params.js reads the query string regardless of
    // hash — which is why this silently lands on the WEB Paywall instead of
    // firing the deep link back into the native app).
    const callbackUrl = encodeURIComponent(`${BASE_URL}/#/auth-callback`);
    const loginUrl = `${BASE_URL}${path}?app_id=${APP_ID}&from_url=${callbackUrl}`;
    await Browser.open({ url: loginUrl });
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading('google');
    try {
      // No "provider=google" — the bare /auth/login path IS the Google endpoint
      // (confirmed against the installed @base44/sdk and by tracing the redirect
      // chain to accounts.google.com by hand).
      await openBridge('/api/apps/auth/login');
    } catch (err) {
      console.error('Google login error:', err);
      setError('Unable to open Google sign-in. Please try again.');
    } finally {
      // The button only needs to be disabled while the system browser is opening,
      // not for the whole time the user spends there.
      setLoading(null);
    }
  };

  const handleApple = async () => {
    setError(null);
    setLoading('apple');
    try {
      await openBridge('/api/apps/auth/apple/login');
    } catch (err) {
      console.error('Apple login error:', err);
      setError('Unable to open Apple sign-in. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading('email');
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      // Full reload so AuthProvider re-runs its auth check against the fresh token.
      window.location.href = '/';
    } catch (err) {
      console.error('Email login error:', err);
      setError(
        err?.response?.data?.message ||
        'Invalid email or password.'
      );
      setLoading(null);
    }
  };

  const openHostedLogin = async () => {
    // Sign up / forgot password: not blocked by Google's webview policy (they're
    // Base44's own forms), so routing them through the system browser to the
    // hosted login page is simplest — the user completes it there, then returns
    // to sign in with email/password or Google/Apple in this screen.
    await Browser.open({ url: `${BASE_URL}/login` });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4">
          <img
            src="https://media.base44.com/images/public/69bb019558d96a11fbfbddce/feae21962_B3883F9A-91A9-45CA-AFE4-AD5934ACC009.png"
            alt="Swift Score Golf"
            className="w-24 h-24 rounded-2xl shadow-md"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to Swift Score Golf</h1>
            <p className="text-muted-foreground mt-1">Sign in to continue</p>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive text-center bg-destructive/10 rounded-md py-2 px-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={handleGoogle}
            disabled={loading !== null}
          >
            {loading === 'google' ? 'Opening Google...' : 'Continue with Google'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={handleApple}
            disabled={loading !== null}
          >
            {loading === 'apple' ? 'Opening Apple...' : 'Continue with Apple'}
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading !== null}>
            {loading === 'email' ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground space-x-1">
          <button type="button" onClick={openHostedLogin} className="underline underline-offset-2">
            Forgot password?
          </button>
          <span>·</span>
          <button type="button" onClick={openHostedLogin} className="underline underline-offset-2">
            Need an account? Sign up
          </button>
        </div>
      </div>
    </div>
  );
}

export const isNativeLoginPlatform = () => Capacitor.isNativePlatform();
