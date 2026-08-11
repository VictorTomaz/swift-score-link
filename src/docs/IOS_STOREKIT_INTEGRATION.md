# iOS StoreKit Integration Guide for Swift Score Golf

This guide shows how to implement the native iOS StoreKit bridge for the Swift Score Golf web app.

## Overview

The web app communicates with the native iOS layer via `webkit.messageHandlers`. The flow is:

1. Web app sends purchase/restore request via `webkit.messageHandlers`
2. Native iOS code shows StoreKit purchase sheet
3. After purchase, iOS validates receipt with Apple
4. iOS passes receipt data back to web app via JavaScript callback
5. Web app validates receipt with backend and unlocks premium

## Prerequisites

1. **App Store Connect Setup**:
   - Create two Subscription products in App Store Connect:
     - Product ID: `com.swiftscore.monthly` - $2.99/month
     - Product ID: `com.swiftscore.yearly` - $29.99/year
   - Enable **Free Trial** (30 days) for both subscriptions
   - Create a Subscription Group (e.g., "Swift Score Premium")

2. **Bundle Identifier**:
   - Ensure your app's bundle ID matches the one in App Store Connect (e.g., `com.swiftscore.app`)

## Implementation

### Step 1: Add StoreKit Framework

In your Xcode project, add StoreKit to your target:
- Go to your target → Frameworks, Libraries, and Embedded Content
- Click "+" and add `StoreKit.framework`

### Step 2: Create StoreKit Manager

Create a new Swift file `StoreKitManager.swift`:

```swift
import Foundation
import StoreKit
import WebKit

class StoreKitManager: NSObject, ObservableObject {
    static let shared = StoreKitManager()
    
    @Published var hasActiveSubscription = false
    @Published var isTrialPeriod = false
    private var webView: WKWebView?
    
    // Product IDs must match App Store Connect
    private let productIds: Set<String> = [
        "com.swiftscore.monthly",
        "com.swiftscore.yearly"
    ]
    
    private var products: [String: SKProduct] = [:]
    private var currentProductIdentifier: String?
    
    override init() {
        super.init()
        loadProducts()
    }
    
    func setWebView(_ webView: WKWebView) {
        self.webView = webView
    }
    
    // Load available products from App Store Connect
    func loadProducts() {
        let request = SKProductsRequest(productIdentifiers: productIds)
        request.delegate = self
        request.start()
    }
    
    // Purchase a subscription
    func purchase(productId: String) {
        guard let product = products[productId] else {
            sendErrorToWeb("Product not found: \(productId)")
            return
        }
        
        currentProductIdentifier = productId
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }
    
    // Restore previous purchases
    func restorePurchases() {
        SKPaymentQueue.default().restoreCompletedTransactions()
    }
    
    // Send success callback to web app with receipt data
    private func sendSuccessToWeb(receiptData: String) {
        let js = "window.handleStoreKitPurchaseSuccess?.('\(receiptData)')"
        webView?.evaluateJavaScript(js)
    }
    
    // Send restore success callback to web app
    private func sendRestoreSuccessToWeb(receiptData: String) {
        let js = "window.handleStoreKitRestoreSuccess?.('\(receiptData)')"
        webView?.evaluateJavaScript(js)
    }
    
    // Send error callback to web app
    private func sendErrorToWeb(_ message: String) {
        let escapedMessage = message.replacingOccurrences(of: "'", with: "\\'")
        let js = "window.handleStoreKitError?.({message: '\(escapedMessage)'})"
        webView?.evaluateJavaScript(js)
    }
    
    // Get app receipt data (base64 encoded)
    private func getReceiptData() -> String? {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              FileManager.default.fileExists(atPath: receiptURL.path) else {
            return nil
        }
        
        do {
            let receiptData = try Data(contentsOf: receiptURL)
            return receiptData.base64EncodedString()
        } catch {
            print("Failed to read receipt: \(error)")
            return nil
        }
    }
}

// MARK: - SKProductsRequestDelegate
extension StoreKitManager: SKProductsRequestDelegate {
    func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        for product in response.products {
            products[product.productIdentifier] = product
        }
        print("Loaded products: \(products.keys)")
    }
    
    func request(_ request: SKRequest, didFailWithError error: Error) {
        print("Failed to load products: \(error)")
        sendErrorToWeb("Failed to load products")
    }
}

// MARK: - SKPaymentTransactionObserver
extension StoreKitManager: SKPaymentTransactionObserver {
    func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchasing:
                print("Purchasing...")
                
            case .purchased:
                print("Purchased: \(transaction.payment.productIdentifier)")
                finishTransaction(transaction)
                
            case .restored:
                print("Restored: \(transaction.payment.productIdentifier)")
                finishTransaction(transaction)
                
            case .failed:
                print("Failed: \(transaction.error?.localizedDescription ?? "Unknown error")")
                sendErrorToWeb(transaction.error?.localizedDescription ?? "Purchase failed")
                SKPaymentQueue.default().finishTransaction(transaction)
                
            case .deferred:
                print("Deferred")
                
            @unknown default:
                break
            }
        }
    }
    
    private func finishTransaction(_ transaction: SKPaymentTransaction) {
        // Get receipt data
        guard let receiptData = getReceiptData() else {
            sendErrorToWeb("Failed to get receipt data")
            SKPaymentQueue.default().finishTransaction(transaction)
            return
        }
        
        // Send receipt to web app for validation
        if transaction.transactionState == .restored {
            sendRestoreSuccessToWeb(receiptData: receiptData)
        } else {
            sendSuccessToWeb(receiptData: receiptData)
        }
        
        // Finish the transaction
        SKPaymentQueue.default().finishTransaction(transaction)
    }
    
    func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue) {
        print("Restore completed")
    }
    
    func paymentQueue(_ queue: SKPaymentQueue, restoreCompletedTransactionsFailedWithError error: Error) {
        print("Restore failed: \(error)")
        sendErrorToWeb("Restore failed: \(error.localizedDescription)")
    }
}
```

### Step 3: Configure WKWebView for Message Handlers

In your `ViewController.swift` (or wherever you create the WKWebView):

```swift
import UIKit
import WebKit
import StoreKit

class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Create configuration with content controller
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        
        // Add message handler for purchase requests
        contentController.add(self, name: "purchaseSubscription")
        contentController.add(self, name: "restorePurchases")
        
        config.userContentController = contentController
        
        // Create web view
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        
        // Set web view in StoreKit manager
        StoreKitManager.shared.setWebView(webView)
        
        // Add transaction observer
        SKPaymentQueue.default().add(StoreKitManager.shared)
        
        // Load your web app URL
        if let url = URL(string: "YOUR_WEB_APP_URL") {
            webView.load(URLRequest(url: url))
        }
    }
    
    // Handle messages from web app
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "purchaseSubscription":
            if let body = message.body as? [String: Any],
               let productId = body["productId"] as? String {
                StoreKitManager.shared.purchase(productId: productId)
            }
            
        case "restorePurchases":
            StoreKitManager.shared.restorePurchases()
            
        default:
            break
        }
    }
    
    deinit {
        // Clean up message handlers
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "purchaseSubscription")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "restorePurchases")
        
        // Remove transaction observer
        SKPaymentQueue.default().remove(StoreKitManager.shared)
    }
}
```

### Step 4: Check Subscription on App Launch

Add this to your app's launch sequence (e.g., in `AppDelegate` or initial `ViewController`):

```swift
// Check if user has active subscription by calling the backend
func checkSubscriptionStatus(userId: String, completion: @escaping (Bool) -> Void) {
    // You can call your Base44 backend function here
    // Or rely on the web app to check on load
}
```

## Testing

### Sandbox Testing

1. Create a Sandbox test user in App Store Connect:
   - Go to Users and Access → Sandbox
   - Click "+" to create a test user
   - Use this Apple ID when testing on device

2. Test on a real device (StoreKit doesn't work in simulator):
   - Sign out of your real Apple ID in Settings → [Your Name] → Media & Purchases
   - Sign in with Sandbox test user when prompted during purchase

3. Test scenarios:
   - ✅ New subscription (monthly)
   - ✅ New subscription (yearly)
   - ✅ Free trial activation
   - ✅ Restore purchases
   - ✅ Subscription already active (should redirect to Dashboard)

### Receipt Validation

The web app calls the `validateAppleReceipt` backend function which:
1. Sends receipt to Apple's validation server
2. Verifies subscription status
3. Creates/updates Subscription entity in Base44
4. Returns success/failure to web app

## Important Notes

1. **Product IDs**: Must exactly match what you create in App Store Connect
2. **Bundle ID**: Must match the one associated with your App Store Connect app
3. **Receipt Validation**: The backend function validates with Apple's servers - don't skip this
4. **Free Trial**: Configure in App Store Connect subscription settings
5. **Privacy**: Add appropriate privacy descriptions to Info.plist for purchases

## Troubleshooting

- **"No products available"**: Check bundle ID, product IDs, and that subscriptions are approved/cleared for sale
- **"Cannot connect to App Store"**: Common in sandbox - sign out/in of test account, restart device
- **Receipt validation fails**: Ensure backend function is deployed and Apple receipt is properly base64-encoded
- **Webkit messages not received**: Verify message handler names match exactly ("purchaseSubscription", "restorePurchases")

## Submission Checklist

- [ ] Subscriptions created in App Store Connect
- [ ] Free trial configured (30 days)
- [ ] Product IDs match code (`com.swiftscore.monthly`, `com.swiftscore.yearly`)
- [ ] StoreKit framework added to target
- [ ] Message handlers configured in WKWebView
- [ ] Transaction observer added to payment queue
- [ ] Tested with Sandbox user on real device
- [ ] Privacy descriptions added to Info.plist
- [ ] App reviewed and approved for In-App Purchases