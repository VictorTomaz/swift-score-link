import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Star, Trophy, Shield, Mail, TrendingUp, Zap, DollarSign, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Capacitor, registerPlugin } from "@capacitor/core";

const StoreKitPlugin = registerPlugin("StoreKitPlugin");

export default function Paywall() {
  const navigate = useNavigate();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [storeKitProducts, setStoreKitProducts] = useState([]);

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

  const handleSubscribe = async (planType) => {
    setError(null);
    setLoading(planType);

    // iOS native app with StoreKit 2 bridge
    if (isIOSNative) {
      const productId = planType === 'yearly' ? 'com.swiftscoregolf.yearly' : 'com.swiftscoregolf.monthly';
      iosProductIdRef.current = productId;
      try {
        const result = await StoreKitPlugin.purchaseSubscription({ productId });
        if (result.status === 'success') {
          setStatusMessage("Validating purchase with App Store...");
          const response = await base44.functions.invoke('validateAppleReceipt', {
            receiptData: result.receiptData,
            jwsTransaction: result.jwsTransaction,
            productId: productId,
          });
          if (response.data.valid && response.data.isActive) {
            setHasActiveSubscription(true);
            setIsTrial(response.data.isTrial || false);
            setStatusMessage("Subscription activated! Redirecting...");
            setTimeout(() => navigate("/Dashboard"), 1500);
          } else {
            setError("Purchase validation failed. Please try restoring purchases.");
          }
        } else if (result.status === 'cancelled') {
          console.log("User cancelled purchase flow.");
        } else if (result.status === 'pending') {
          setError("Purchase is pending parental or institutional approval.");
        }
      } catch (err) {
        console.error("StoreKit purchase error:", err);
        setError(err.message || "Unable to start purchase. Please try again.");
      } finally {
        setLoading(null);
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
        
        // Loop a verificação para os dois produtos
        for (const pid of ['com.swiftscoregolf.yearly', 'com.swiftscoregolf.monthly']) {
          const response = await base44.functions.invoke('validateAppleReceipt', {
            receiptData: result.receiptData,
            productId: pid,
          });
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
          setError("No active subscription found to restore.");
        }
      }
    } catch (err) {
      console.error("Restore validation error:", err);
      setError("Failed to restore purchases. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleRedeemOfferCode = async () => {
    setError(null);
    setLoading('redeem');
    try {
      const result = await StoreKitPlugin.redeemOfferCode();
      if (result.status === 'success') {
        setStatusMessage("Redeem sheet opened. Checking subscription...");
        setTimeout(() => checkExistingSubscription(), 5000);
      }
    } catch (err) {
      console.error("Offer Code redemption error:", err);
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