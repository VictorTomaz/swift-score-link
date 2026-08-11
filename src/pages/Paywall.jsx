import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Star, Trophy, Shield, Mail, TrendingUp, Zap, DollarSign, Target, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Paywall() {
  const navigate = useNavigate();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const iosProductIdRef = useRef(null);

  // --- iOS app detection ---
  // The Base44-managed iOS wrapper is a WKWebView that does NOT support StoreKit
  // and does NOT inject window.webkit.messageHandlers.purchaseSubscription.
  // We detect it via user agent: Safari/Chrome/Firefox on iOS include identifiable
  // tokens ("Safari/", "CriOS/", "FxiOS/"); a bare WKWebView has none of these.
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isIOSBrowser = isIOSDevice && /Safari|CriOS|FxiOS/.test(navigator.userAgent);
  const isInsideIOSApp = isIOSDevice && !isIOSBrowser;

  // StoreKit bridge — will be true only if/when Base44 adds native StoreKit support.
  // Currently always false; kept for forward compatibility.
  const isIOSNative = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.purchaseSubscription);

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
  }, []);

  // Auto-redirect to Dashboard after successful checkout
  useEffect(() => {
    if (hasActiveSubscription && statusMessage) {
      const timer = setTimeout(() => navigate("/Dashboard"), 2500);
      return () => clearTimeout(timer);
    }
  }, [hasActiveSubscription, statusMessage, navigate]);

  const checkExistingSubscription = async () => {
    try {
      const response = await base44.functions.invoke('checkSubscriptionStatus', {});
      if (response.data.hasActiveSubscription) {
        setHasActiveSubscription(true);
        setIsTrial(response.data.isTrial || false);
      }
    } catch (error) {
      console.error("Failed to check subscription:", error);
    }
  };

  // StoreKit callback handlers (called from native iOS after purchase/restore)
  useEffect(() => {
    window.handleStoreKitPurchaseSuccess = async (receiptData) => {
      try {
        const response = await base44.functions.invoke('validateAppleReceipt', {
          receiptData,
          productId: iosProductIdRef.current,
        });
        if (response.data.valid && response.data.isActive) {
          setHasActiveSubscription(true);
          setIsTrial(response.data.isTrial || false);
          setStatusMessage("Subscription activated! Redirecting...");
          setTimeout(() => navigate("/Dashboard"), 1500);
        } else {
          setError("Receipt validation failed. Please try restoring purchases.");
        }
      } catch (err) {
        console.error("Receipt validation error:", err);
        setError("Failed to validate purchase. Please try restoring purchases.");
      }
      setLoading(null);
    };

    window.handleStoreKitRestoreSuccess = async (receiptData) => {
      try {
        for (const pid of ['com.swiftscore.yearly', 'com.swiftscore.monthly']) {
          const response = await base44.functions.invoke('validateAppleReceipt', {
            receiptData,
            productId: pid,
          });
          if (response.data.valid && response.data.isActive) {
            setHasActiveSubscription(true);
            setIsTrial(response.data.isTrial || false);
            setStatusMessage("Purchases restored! Redirecting...");
            setTimeout(() => navigate("/Dashboard"), 1500);
            return;
          }
        }
        setError("No active subscription found to restore.");
      } catch (err) {
        console.error("Restore validation error:", err);
        setError("Failed to restore purchases. Please try again.");
      }
      setLoading(null);
    };

    window.handleStoreKitError = ({ message }) => {
      setError(message || "Purchase failed. Please try again.");
      setLoading(null);
    };

    return () => {
      delete window.handleStoreKitPurchaseSuccess;
      delete window.handleStoreKitRestoreSuccess;
      delete window.handleStoreKitError;
    };
  }, [navigate]);

  const handleSubscribe = async (planType) => {
    setError(null);
    setLoading(planType);

    // Subscriptions are temporarily disabled across all platforms.
    setError("We're putting the finishing touches on subscriptions. They are temporarily unavailable while we complete our billing integration. Thank you for your patience—we look forward to offering subscriptions very soon. Existing subscribers can continue using the app as normal.");
    setLoading(null);
    return;

    // iOS native app with StoreKit bridge — use In-App Purchase
    if (isIOSNative) {
      const productId = planType === 'yearly' ? 'com.swiftscore.yearly' : 'com.swiftscore.monthly';
      iosProductIdRef.current = productId;
      try {
        window.webkit.messageHandlers.purchaseSubscription.postMessage({ productId });
      } catch (err) {
        setError("Unable to start purchase. Please try again.");
        setLoading(null);
      }
      return;
    }

    // Inside iOS app wrapper without StoreKit — block Stripe for Apple compliance
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

    try {
      let userEmail = null;
      try {
        const user = await base44.auth.me();
        if (user) userEmail = user.email;
      } catch (_e) { /* not logged in — Stripe collects email */ }

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
              Redirecting to Dashboard...
            </p>
          )}
          <Button onClick={() => navigate("/Dashboard")}>
            Continue to Dashboard
          </Button>
          <a
            href="https://apps.apple.com/account/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground underline"
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

        {/* Subscriptions temporarily unavailable notice */}
        <div className="text-center p-5 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-sm font-medium text-accent">
            We're putting the finishing touches on subscriptions. They are temporarily unavailable while we complete our billing integration. Thank you for your patience—we look forward to offering subscriptions very soon. Existing subscribers can continue using the app as normal.
          </p>
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

        {isIOSNative && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setError(null);
              setLoading('restore');
              window.webkit.messageHandlers.restorePurchases.postMessage({});
            }}
            disabled={loading !== null}
          >
            {loading === 'restore' ? "Restoring..." : "Restore Purchases"}
          </Button>
        )}

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