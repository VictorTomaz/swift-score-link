# Swift Score Golf - StoreKit Integration Checklist

## ✅ Web App (Base44) - COMPLETE

### Files Created/Updated:
- ✅ `pages/Paywall.jsx` - Subscription UI with StoreKit message handlers
- ✅ `entities/Subscription.json` - Subscription data model
- ✅ `functions/validateAppleReceipt.js` - Apple receipt validation
- ✅ `functions/checkSubscriptionStatus.js` - Check active subscription
- ✅ `hooks/useSubscription.js` - React hook for subscription status
- ✅ `docs/IOS_STOREKIT_INTEGRATION.md` - iOS implementation guide

### Features Implemented:
- ✅ Display Apple's native purchase sheet (via webkit message handlers)
- ✅ Purchase Monthly ($2.99) and Yearly ($29.99) subscriptions
- ✅ Support 30-day free trial
- ✅ Restore Purchases functionality
- ✅ Validate Apple receipt with backend
- ✅ Automatically unlock Premium after successful purchase
- ✅ Detect existing subscriptions on app launch
- ✅ Redirect subscribed users to Dashboard after validation

---

## 📱 iOS Native Wrapper - TO IMPLEMENT

Follow `docs/IOS_STOREKIT_INTEGRATION.md` for complete Swift implementation.

### Required Steps:

1. **App Store Connect Setup**
   - [ ] Create Subscription Group: "Swift Score Premium"
   - [ ] Create Product: `com.swiftscoregolf.monthly` ($2.99/month, 30-day trial)
   - [ ] Create Product: `com.swiftscoregolf.yearly` ($29.99/year, 30-day trial)
   - [ ] Submit for review

2. **Xcode Project Setup**
   - [ ] Add StoreKit.framework to target
   - [ ] Create `StoreKitManager.swift` (see docs)
   - [ ] Configure WKWebView message handlers
   - [ ] Add transaction observer to payment queue

3. **Message Handlers**
   - [ ] `purchaseSubscription` - receives productId from web
   - [ ] `restorePurchases` - triggers restore flow
   - [ ] Call web callbacks after purchase:
     - `window.handleStoreKitPurchaseSuccess(receiptData)`
     - `window.handleStoreKitRestoreSuccess(receiptData)`
     - `window.handleStoreKitError({message})`

4. **Testing**
   - [ ] Create Sandbox test user in App Store Connect
   - [ ] Test monthly subscription purchase
   - [ ] Test yearly subscription purchase
   - [ ] Test free trial activation
   - [ ] Test restore purchases
   - [ ] Test subscription detection on app launch
   - [ ] Test redirect to Dashboard after purchase

5. **App Store Submission**
   - [ ] Add privacy descriptions to Info.plist
   - [ ] Ensure In-App Purchase capability is enabled
   - [ ] Submit for App Store review

---

## 🔧 Product IDs (Must Match Exactly)

| Plan | Product ID | Price | Trial |
|------|------------|-------|-------|
| Monthly | `com.swiftscoregolf.monthly` | $2.99/month | 30 days |
| Yearly | `com.swiftscoregolf.yearly` | $29.99/year | 30 days |

⚠️ **IMPORTANT**: Product IDs in App Store Connect MUST exactly match these strings.

---

## 🔄 Purchase Flow

```
User clicks "Start Free Trial" (Paywall)
         ↓
Web app sends message to iOS: purchaseSubscription.postMessage({productId})
         ↓
iOS StoreKitManager shows native purchase sheet
         ↓
User authenticates with Face ID/Touch ID/Password
         ↓
Apple processes subscription (trial starts)
         ↓
iOS gets receipt data from Bundle.main.appStoreReceiptURL
         ↓
iOS calls web callback: window.handleStoreKitPurchaseSuccess(receiptData)
         ↓
Web app calls validateAppleReceipt backend function
         ↓
Backend validates with Apple servers + creates Subscription entity
         ↓
Web app redirects to Dashboard (premium unlocked)
```

---

## 🧪 Testing URLs

- **Production**: `https://buy.itunes.apple.com/verifyReceipt`
- **Sandbox**: `https://sandbox.itunes.apple.com/verifyReceipt`

The backend automatically tries production first, then sandbox.

---

## 📝 Notes

- Receipt validation happens server-side (backend function)
- Subscription entity tracks user_id, product_id, status, trial dates
- Paywall checks subscription on mount and redirects if active
- iOS wrapper only handles StoreKit - validation is done by web app backend
- Free trial is configured in App Store Connect, not in code

---

## 🚀 Next Steps

1. Implement iOS StoreKitManager (see `docs/IOS_STOREKIT_INTEGRATION.md`)
2. Configure products in App Store Connect
3. Test with Sandbox user on real device
4. Submit to App Store for review

For questions about the iOS implementation, refer to the complete guide in `docs/IOS_STOREKIT_INTEGRATION.md`.