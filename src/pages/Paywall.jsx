import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Star, Trophy, Shield, Mail, TrendingUp, Zap, DollarSign, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useAuth } from "@/lib/AuthContext";

const StoreKitPlugin = registerPlugin("StoreKitPlugin");

// On-screen debug trail, so a tester can copy/paste the full trace without
// needing a USB connection + Console.app / sysdiagnose. TEMPORARY diagnostic
// aid while chasing the validateAppleReceipt 400 — remove (or gate behind a
// dev flag) before a real public release; regular users shouldn't see this.
// Module-level so deviceLog() (called from a plain async function, not a React
// hook) can append to it; the component copies it into state after each
// purchase/restore attempt settles.
const debugBuffer = [];

// Bridges a diagnostic line into the device's unified log (os.log) via the
// native StoreKit plugin, AND into the on-screen debug buffer above. Plain
// console.log from the WKWebView does NOT appear in a device syslog /
// sysdiagnose export — this does, as:
//   App[<pid>] <Notice>: JS: <message>
// Greppable by "JS: ". Fire-and-forget; never throws.
async function deviceLog(message, level = "notice") {
  const line = `[${new Date().toISOString()}] ${level === "error" ? "ERROR " : ""}${message}`;
  debugBuffer.push(line);
  if (debugBuffer.length > 200) debugBuffer.shift();
  try {
    (level === "error" ? console.error : console.log)("[SSG]", line);
  } catch (_e) { /* noop */ }
  try {
    if (Capacitor.isNativePlatform()) {
      await StoreKitPlugin.nativeLog({ message: String(line).slice(0, 1200), level });
    }
  } catch (_e) { /* noop */ }
}

// Primary purchase-validation path on native iOS. Uses base44.functions.fetch()
// — the SDK's own raw-fetch helper — instead of a hand-rolled fetch(). Why this
// matters: our earlier hand-rolled version read the auth token from
// `appParams.token`, a ONE-TIME snapshot taken when the page/module first
// loaded. The SDK itself never does that — base44.functions.invoke() resolves
// the Authorization header fresh on every call via getAccessToken(), which
// re-reads localStorage live. If the stored token is refreshed/rotated any
// time after that initial snapshot (very plausible across the 30-90s a real
// purchase spends in Apple's native sign-in UI), our own fetch would keep
// sending the stale one while the SDK sends the current one — and a real
// device test (2026-09-11) showed exactly a bare "Request failed with status
// code 400" with NO matching IapErrorLog row, meaning the request never even
// reached our function code: consistent with rejection at Base44's auth layer
// before our handler runs. base44.functions.fetch() gives us the SDK's
// always-current auth headers while still being real fetch (so cache:'no-store'
// + a unique query keep working as a cache-buster).
// Returns { data } like the SDK; throws an axios-shaped error (err.response =
// { status, data }) on an HTTP error so existing handling still works.
async function validateReceiptViaFetch({ jwsTransaction, receiptData, productId }) {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const res = await base44.functions.fetch(`/validateAppleReceipt?_cb=${nonce}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
    body: JSON.stringify({
      receiptData: receiptData || "",
      jwsTransaction: jwsTransaction || "",
      productId,
    }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_e) { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.response = { status: res.status, data };
    err.viaFetch = true;
    throw err;
  }
  return { data, _status: res.status, _type: res.type, _url: res.url };
}

export default function Paywall() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [storeKitProducts, setStoreKitProducts] = useState([]);
  // On-screen copy of debugBuffer (see comment above deviceLog) — TEMPORARY,
  // remove before public release.
  const [debugLog, setDebugLog] = useState([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const syncDebugLog = () => {
    setDebugLog(debugBuffer.slice(-80));
    setShowDebugLog(true); // auto-expand once there's something to see
  };
  const copyDebugLog = async () => {
    const text = debugLog.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Log copiado!');
    } catch (_e) {
      setCopyFeedback('Não foi possível copiar automaticamente — selecione o texto manualmente.');
    }
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const iosProductIdRef = useRef(null);

  // --- iOS app detection ---
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isIOSBrowser = isIOSDevice && /Safari|CriOS|FxiOS/.test(navigator.userAgent);
  const isInsideIOSApp = isIOSDevice && !isIOSBrowser;

  // Modern Capacitor StoreKit 2 bridge
  const isIOSNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get("status");
    if (status === "success") {
      setStatusMessage("Subscription started! Checking your account...");
      urlParams.delete("status");
      window.history.replaceState({}, "", "/Paywall");
    } else if (status === "cancelled") {
      setError("Checkout was cancelled. You can try again anytime.");
      urlParams.delete("status");
      window.history.replaceState({}, "", "/Paywall");
    }
    checkExistingSubscription();
    
    if (isIOSNative) {
      loadStoreKitProducts();
    }
  }, [isIOSNative]);

  // Auto-redirect to Dashboard after successful checkout
  useEffect(() => {
    if (hasActiveSubscription && statusMessage) {
      const timer = setTimeout(() => navigate("/Dashboard"), 2500);
      return () => clearTimeout(timer);
    }
  }, [hasActiveSubscription, statusMessage, navigate]);

  // Sincronização automática quando o nativo atualiza transações em background (como resgate de Offer Code)
  useEffect(() => {
    let listener = null;
    if (isIOSNative) {
      listener = StoreKitPlugin.addListener("subscriptionUpdate", () => {
        console.log("Subscription updated event received from iOS StoreKit 2");
        checkExistingSubscription();
      });
    }
    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, [isIOSNative]);

  const loadStoreKitProducts = async () => {
    try {
      const result = await StoreKitPlugin.getProducts();
      if (result && result.products) {
        setStoreKitProducts(result.products);
      }
    } catch (err) {
      console.error("Failed to load StoreKit products:", err);
    }
  };

  // Returns whether an active subscription was found, so callers doing a
  // post-purchase reconciliation check (see handleSubscribe/handleRestore)
  // know whether to update their own status message / redirect.
  const checkExistingSubscription = async () => {
    try {
      const response = await base44.functions.invoke('checkSubscriptionStatus', {});
      if (response.data.hasActiveSubscription) {
        setHasActiveSubscription(true);
        setIsTrial(response.data.isTrial || false);
        return true;
      }
    } catch (error) {
      console.error("Failed to check subscription:", error);
    }
    return false;
  };

  // Called after a purchase/restore attempt errored out or came back inactive
  // — Apple already confirmed the purchase natively at that point, so if the
  // DB (checked here) now shows it active, that's the real outcome (written by
  // a retry, or by the apple-webhook server-to-server notification) and the
  // screen shouldn't keep showing a stale error for a subscription that
  // actually went through.
  //
  // This POLLS instead of checking once: a real device test (2026-09-11) got
  // stuck showing the error because the webhook took longer than the old
  // single 4s check to land — the DB was correct by the time the user looked,
  // but nothing ever re-checked. Poll every `intervalMs` for up to `maxWaitMs`
  // after `initialDelayMs`, so a slow webhook still gets picked up.
  const reconcileAfterPurchaseAttempt = async ({ initialDelayMs = 4000, intervalMs = 5000, maxWaitMs = 60000 } = {}) => {
    await deviceLog(`reconcileAfterPurchaseAttempt: starting (initialDelay=${initialDelayMs} interval=${intervalMs} maxWait=${maxWaitMs})`);
    await new Promise((resolve) => setTimeout(resolve, initialDelayMs));
    const deadline = Date.now() + maxWaitMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      const isActive = await checkExistingSubscription();
      if (isActive) {
        await deviceLog(`reconcileAfterPurchaseAttempt: found active on attempt ${attempt}`);
        setError(null);
        setStatusMessage("Subscription activated! Redirecting...");
        setTimeout(() => navigate("/Dashboard"), 1500);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    await deviceLog(`reconcileAfterPurchaseAttempt: gave up after ${attempt} attempt(s), still not active`, 'error');
    return false;
  };

  const handleSubscribe = async (planType) => {
    setError(null);
    setLoading(planType);

    // iOS native app with StoreKit 2 bridge
    if (isIOSNative) {
      const productId = planType === 'yearly' ? 'com.swiftscoregolf.yearly' : 'com.swiftscoregolf.monthly';
      iosProductIdRef.current = productId;
      await deviceLog(`handleSubscribe: START native flow planType=${planType} productId=${productId}`);
      try {
        const result = await StoreKitPlugin.purchaseSubscription({ productId });
        await deviceLog(
          `handleSubscribe: purchaseSubscription resolved. status=${result?.status} ` +
          `hasJws=${!!result?.jwsTransaction} jwsLen=${(result?.jwsTransaction || '').length} ` +
          `hasReceipt=${!!result?.receiptData} receiptLen=${(result?.receiptData || '').length} ` +
          `txId=${result?.transactionId || 'n/a'}`
        );
        if (result.status === 'success') {
          setStatusMessage("Validating purchase with App Store...");

          const jws = result.jwsTransaction || '';
          const rcpt = result.receiptData || '';

          // Control call: a DIFFERENT backend function, same SDK/origin/auth.
          // If this returns fresh data but validateAppleReceipt below returns a
          // stale body, the problem is per-endpoint HTTP response caching.
          try {
            const ctl = await base44.functions.invoke('checkSubscriptionStatus', {});
            await deviceLog(`control checkSubscriptionStatus OK: data=${JSON.stringify(ctl?.data)?.slice(0, 200)}`);
          } catch (ctlErr) {
            await deviceLog(
              `control checkSubscriptionStatus ERROR: status=${ctlErr?.response?.status} ` +
              `body=${JSON.stringify(ctlErr?.response?.data)?.slice(0, 160)}`,
              'error'
            );
          }

          await deviceLog(
            `validateAppleReceipt: START. productId=${productId} hasJws=${!!jws} jwsLen=${jws.length} ` +
            `hasReceipt=${!!rcpt} receiptLen=${rcpt.length} online=${typeof navigator !== 'undefined' ? navigator.onLine : 'n/a'}`
          );

          let response;
          try {
            // PRIMARY: cache-proof raw fetch (see validateReceiptViaFetch comment).
            response = await validateReceiptViaFetch({ jwsTransaction: jws, receiptData: rcpt, productId });
            await deviceLog(
              `validateAppleReceipt via fetch OK: type=${response._type} url=${response._url} ` +
              `data=${JSON.stringify(response?.data)?.slice(0, 450)}`
            );
          } catch (fetchErr) {
            if (fetchErr?.response) {
              // Real HTTP error response from the fetch path. The SDK hits the
              // exact same endpoint, so don't retry it — log and rethrow.
              await deviceLog(
                `validateAppleReceipt via fetch HTTP ERROR: status=${fetchErr.response.status} ` +
                `body=${JSON.stringify(fetchErr.response.data)?.slice(0, 300)}`,
                'error'
              );
              throw fetchErr;
            }
            // Network-level failure (no response at all) — fall back to the SDK once.
            await deviceLog(`validateAppleReceipt via fetch NETWORK FAIL: ${fetchErr?.message}. Falling back to SDK.`, 'error');
            try {
              response = await base44.functions.invoke('validateAppleReceipt', {
                receiptData: result.receiptData,
                jwsTransaction: result.jwsTransaction,
                productId: productId,
              });
              await deviceLog(`validateAppleReceipt SDK fallback OK: data=${JSON.stringify(response?.data)?.slice(0, 450)}`);
            } catch (invokeErr) {
              const r = invokeErr?.response;
              await deviceLog(
                `validateAppleReceipt SDK fallback ERROR: msg=${invokeErr?.message} respStatus=${r?.status} ` +
                `body=${JSON.stringify(r?.data)?.slice(0, 300)}`,
                'error'
              );
              throw invokeErr;
            }
          }

          if (response.data.valid && response.data.isActive) {
            setHasActiveSubscription(true);
            setIsTrial(response.data.isTrial || false);
            setStatusMessage("Subscription activated! Redirecting...");
            setTimeout(() => navigate("/Dashboard"), 1500);
          } else {
            setStatusMessage(null);
            setError("Purchase validation failed. Please try restoring purchases.");
            // Apple already confirmed the purchase natively at this point — if our
            // own validation response says otherwise, the DB record (written by
            // this call, a retry, or the apple-webhook) is the actual source of
            // truth. Poll for it instead of a single check (see comment above).
            reconcileAfterPurchaseAttempt();
          }
        } else if (result.status === 'cancelled') {
          console.log("User cancelled purchase flow.");
        } else if (result.status === 'pending') {
          setError("Purchase is pending parental or institutional approval.");
        }
      } catch (err) {
        // err.message alone is axios's generic "Request failed with status
        // code 400" — the actual cause is in the response body our backend
        // functions send back (validateAppleReceipt's console.error'd errors).
        const backendMessage = err?.response?.data?.error;
        await deviceLog(
          `handleSubscribe: CATCH — backendMessage=${JSON.stringify(backendMessage)} ` +
          `errMsg=${err?.message} respStatus=${err?.response?.status}`,
          'error'
        );
        console.error("StoreKit purchase error:", backendMessage || err.message, err);
        setStatusMessage(null);
        setError(backendMessage || err.message || "Unable to start purchase. Please try again.");
        // Same reconciliation as above: the native purchase may well have
        // succeeded even though this specific validation call errored out —
        // don't leave the screen stuck on a stale error if the DB disagrees.
        reconcileAfterPurchaseAttempt();
      } finally {
        setLoading(null);
        syncDebugLog();
      }
      return;
    }

    // Inside iOS app wrapper without StoreKit bridge (fallback)
    if (isInsideIOSApp && !isIOSNative) {
      setError("iOS subscriptions are temporarily unavailable. We're working to enable subscriptions and appreciate your patience.");
      setLoading(null);
      return;
    }

    // Block checkout inside iframe (published app only)
    if (window.self !== window.top) {
      setError("Checkout must be done from the published app, not the editor preview.");
      setLoading(null);
      return;
    }

    // Stripe Flow (Web/Desktop)
    try {
      let userEmail = null;
      try {
        const user = await base44.auth.me();
        if (user) userEmail = user.email;
      } catch (_e) { /* ignore */ }

      const origin = window.location.origin;
      const response = await base44.functions.invoke('createStripeCheckout', {
        plan_type: planType,
        user_email: userEmail,
        origin,
      });
      const checkoutUrl = response.data.checkout_url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setError("Unable to start checkout. Please try again.");
        setLoading(null);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Something went wrong starting checkout. Please try again.");
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setLoading('restore');
    try {
      const result = await StoreKitPlugin.restorePurchases();
      if (result.status === 'success') {
        setStatusMessage("Restoring purchases...");
        let restored = false;

        // Verifica cada entitlement ativo via JWS (StoreKit 2), mesmo caminho
        // usado na compra — evita depender da API legada verifyReceipt.
        const entitlements = (result.entitlements || []).filter(ent => ent.jwsTransaction);
        await deviceLog(`handleRestore: ${entitlements.length} entitlement(s) with JWS to validate`);
        for (const ent of entitlements) {
          // Same cache-proof path as the purchase flow.
          const response = await validateReceiptViaFetch({
            jwsTransaction: ent.jwsTransaction,
            productId: ent.productId,
          });
          await deviceLog(`handleRestore: validate ${ent.productId} -> ${JSON.stringify(response?.data)?.slice(0, 250)}`);
          if (response.data.valid && response.data.isActive) {
            setHasActiveSubscription(true);
            setIsTrial(response.data.isTrial || false);
            setStatusMessage("Purchases restored successfully! Redirecting...");
            setTimeout(() => navigate("/Dashboard"), 1500);
            restored = true;
            break;
          }
        }
        if (!restored) {
          setStatusMessage(null);
          setError("No active subscription found to restore.");
          reconcileAfterPurchaseAttempt();
        }
      }
    } catch (err) {
      // Same as purchase: err.message alone is axios's generic "Request
      // failed with status code 400" when it came from validateAppleReceipt —
      // the real cause is in the response body (or, if the native
      // restorePurchases() call itself threw, err.message already has the
      // StoreKitError/NSError detail from StoreKitPlugin.swift).
      const backendMessage = err?.response?.data?.error;
      const detail = backendMessage || err.message;
      console.error("Restore validation error:", detail, err);
      setStatusMessage(null);
      setError(detail ? `Failed to restore purchases: ${detail}` : "Failed to restore purchases. Please try again.");
      reconcileAfterPurchaseAttempt();
    } finally {
      setLoading(null);
      syncDebugLog();
    }
  };

  const handleRedeemOfferCode = async () => {
    setError(null);
    setLoading('redeem');
    try {
      const result = await StoreKitPlugin.redeemOfferCode();
      if (result.status === 'success') {
        setStatusMessage("Redeem sheet opened. Checking subscription...");
        reconcileAfterPurchaseAttempt({ initialDelayMs: 5000 });
      }
    } catch (err) {
      console.error("Offer Code redemption error:", err);
      setStatusMessage(null);
      setError(err.message || "Failed to launch Offer Code redemption.");
    } finally {
      setLoading(null);
    }
  };

  const features = [
    { icon: Trophy, label: "Unlimited tournaments" },
    { icon: TrendingUp, label: "Automatic Gross & Net scoring" },
    { icon: DollarSign, label: "Automatic payouts" },
    { icon: Target, label: "Gross & Net Skins" },
    { icon: Star, label: "KP, Pay Balls & Deuce Pot" },
    { icon: Mail, label: "Email & Text results" },
    { icon: Shield, label: "Handicap management" },
    { icon: Zap, label: "Future premium feature updates" },
  ];

  if (hasActiveSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Star className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {isTrial ? "Trial Active" : "Premium Active"}
          </h2>
          <p className="text-muted-foreground">
            {isTrial ? "Enjoy your 30-day free trial!" : "Thank you for subscribing!"}
          </p>
          {statusMessage && (
            <p className="text-sm text-muted-foreground animate-pulse">
              {statusMessage}
            </p>
          )}
          <Button onClick={() => navigate("/Dashboard")}>
            Continue to Dashboard
          </Button>
          <a
            href="https://apps.apple.com/account/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground underline block pt-2"
          >
            Manage Subscription
          </a>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen px-4 py-8 pb-12"
    >
      <div className="max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 mb-2 shadow-lg"
          >
            <Star className="w-10 h-10 text-primary-foreground" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">Swift Score Golf Premium</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Unlock unlimited tournaments, automatic scoring, payouts, skins, KPs, and more.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground text-center">What's Included</h3>
          <div className="grid grid-cols-1 gap-2">
            {features.map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
              >
                <Card className="border-0 shadow-sm bg-card">
                  <CardContent className="p-3 flex items-center gap-3">
                    <feature.icon className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{feature.label}</span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Status / Error Messages */}
        {statusMessage && (
          <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-sm font-medium text-accent">{statusMessage}</p>
          </div>
        )}
        {error && (
          <div className="text-center p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* TEMPORARY on-screen debug trail — lets a tester copy/paste the full
            trace without a USB connection. Remove before public release. */}
        {debugLog.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDebugLog((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
            >
              <span>Log técnico ({debugLog.length} linhas)</span>
              <span>{showDebugLog ? "Ocultar ▲" : "Mostrar ▼"}</span>
            </button>
            {showDebugLog && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={copyDebugLog}>
                    Copiar log
                  </Button>
                  {copyFeedback && (
                    <span className="text-xs text-muted-foreground">{copyFeedback}</span>
                  )}
                </div>
                <pre
                  className="text-[10px] leading-snug font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto select-text bg-background/60 rounded p-2 border border-border"
                >
                  {debugLog.join("\n")}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 gap-4">
          {/* Monthly Plan */}
          <Card className="border border-primary/20 relative overflow-hidden bg-card shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-foreground">Monthly Plan</h3>
                <p className="text-xs text-muted-foreground">Flexible monthly billing. Cancel anytime.</p>
                <div className="flex items-baseline gap-1 pt-2">
                  <span className="text-3xl font-extrabold text-foreground">
                    {storeKitProducts.find(p => p.id === 'com.swiftscoregolf.monthly')?.price || "$4.99"}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  30-day free trial
                </div>
              </div>
              <div className="mt-4 pt-2">
                <Button
                  className="w-full font-semibold"
                  onClick={() => handleSubscribe('monthly')}
                  disabled={loading !== null}
                >
                  {loading === 'monthly' ? "Processing..." : "Start 30-Day Free Trial"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Yearly Plan */}
          <Card className="border-2 border-primary relative overflow-hidden bg-card shadow-md">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-bl">
              Best Value
            </div>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-foreground">Yearly Plan</h3>
                <p className="text-xs text-muted-foreground">Save over 50% compared to the monthly plan!</p>
                <div className="flex items-baseline gap-1 pt-2">
                  <span className="text-3xl font-extrabold text-foreground">
                    {storeKitProducts.find(p => p.id === 'com.swiftscoregolf.yearly')?.price || "$29.95"}
                  </span>
                  <span className="text-sm text-muted-foreground">/year</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  30-day free trial
                </div>
              </div>
              <div className="mt-4 pt-2">
                <Button
                  className="w-full font-semibold"
                  onClick={() => handleSubscribe('yearly')}
                  disabled={loading !== null}
                >
                  {loading === 'yearly' ? "Processing..." : "Start 30-Day Free Trial"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* iOS StoreKit Actions */}
        <div className="flex flex-col gap-2 pt-2">
          {isIOSNative && (
            <Button
              variant="outline"
              className="w-full font-medium"
              onClick={handleRedeemOfferCode}
              disabled={loading !== null}
            >
              {loading === 'redeem' ? "Opening..." : "Redeem Offer Code"}
            </Button>
          )}

          {isIOSNative && (
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={handleRestore}
              disabled={loading !== null}
            >
              {loading === 'restore' ? "Restoring..." : "Restore Purchases"}
            </Button>
          )}
        </div>

        {/* Links */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a href="/TermsAndPrivacy" className="hover:text-foreground underline">
            Terms of Service
          </a>
          <span>·</span>
          <a href="/TermsAndPrivacy" className="hover:text-foreground underline">
            Privacy Policy
          </a>
        </div>

        {/* Sign Out — the only entry point a free/non-subscribed user has to
            reach this action. /Settings' own "Sign Out" button was already
            correct, but that page requires an active subscription to open at
            all, so a free user had no path to it (the bottom nav bar that
            links to Settings only renders on subscription-gated pages).
            Reuses AuthContext's existing logout() unchanged — on native it
            clears the local token and navigates internally to /#/login
            (never leaves the app / no external redirect needed). */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Sign Out
          </button>
        </div>

        {/* Back Button */}
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => navigate("/Dashboard")}
        >
          Back to Dashboard
        </Button>
      </div>
    </motion.div>
  );
}