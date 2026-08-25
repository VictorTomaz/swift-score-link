import Foundation
import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin {
    private let manager = StoreKitManager.shared
    
    override public func load() {
        super.load()
        NotificationCenter.default.addObserver(self, selector: #selector(handleTransactionNotification), name: NSNotification.Name("StoreKitTransactionUpdated"), object: nil)
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc func handleTransactionNotification() {
        // Emit an event to the web app listeners
        self.notifyListeners("subscriptionUpdate", data: [:])
        
        // Also call the legacy global callbacks if available, to ensure compatibility
        if let receiptData = manager.getReceiptData() {
            DispatchQueue.main.async {
                let js = "window.handleStoreKitRestoreSuccess?.('\(receiptData)')"
                self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }
    
    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await manager.fetchProducts()
                let productList = products.map { product -> [String: Any] in
                    var periodUnit = ""
                    var periodValue = 0
                    if let subscription = product.subscription {
                        periodValue = subscription.subscriptionPeriod.value
                        switch subscription.subscriptionPeriod.unit {
                        case .day: periodUnit = "day"
                        case .week: periodUnit = "week"
                        case .month: periodUnit = "month"
                        case .year: periodUnit = "year"
                        @unknown default: periodUnit = "unknown"
                        }
                    }
                    
                    return [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "price": product.displayPrice,
                        "priceValue": product.price,
                        "periodUnit": periodUnit,
                        "periodValue": periodValue
                    ]
                }
                call.resolve(["products": productList])
            } catch {
                call.reject("Failed to fetch products: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func purchaseSubscription(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        
        Task {
            do {
                let purchaseResult = try await manager.purchase(productId: productId)
                switch purchaseResult {
                case .success(let verificationResult):
                    let receiptData = manager.getReceiptData() ?? ""
                    var jwsRepresentation = ""
                    var transactionId = ""
                    
                    switch verificationResult {
                    case .verified(let transaction):
                        jwsRepresentation = verificationResult.jwsRepresentation
                        transactionId = String(transaction.id)
                        await transaction.finish()
                    case .unverified(let transaction, let error):
                        jwsRepresentation = verificationResult.jwsRepresentation
                        transactionId = String(transaction.id)
                        print("Unverified transaction: \(error.localizedDescription)")
                    }
                    
                    // Trigger compatibility callbacks
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitPurchaseSuccess?.('\(receiptData)')"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }
                    
                    call.resolve([
                        "status": "success",
                        "receiptData": receiptData,
                        "jwsTransaction": jwsRepresentation,
                        "transactionId": transactionId
                    ])
                    
                case .userCancelled:
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitError?.({message: 'Purchase cancelled by user'})"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }
                    call.resolve([
                        "status": "cancelled",
                        "message": "Purchase cancelled by user"
                    ])
                    
                case .pending:
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitError?.({message: 'Purchase is pending approval'})"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }
                    call.resolve([
                        "status": "pending",
                        "message": "Purchase is pending approval"
                    ])
                    
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                DispatchQueue.main.async {
                    let js = "window.handleStoreKitError?.({message: '\(error.localizedDescription)'})"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await manager.restorePurchases()
                let receiptData = manager.getReceiptData() ?? ""
                
                let activeEntitlements = await manager.getActiveEntitlements()
                let entitlementsList = activeEntitlements.map { transaction -> [String: Any] in
                    return [
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "expiresDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0
                    ]
                }
                
                DispatchQueue.main.async {
                    let js = "window.handleStoreKitRestoreSuccess?.('\(receiptData)')"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
                
                call.resolve([
                    "status": "success",
                    "receiptData": receiptData,
                    "entitlements": entitlementsList
                ])
            } catch {
                DispatchQueue.main.async {
                    let js = "window.handleStoreKitError?.({message: '\(error.localizedDescription)'})"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func redeemOfferCode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
                call.reject("Failed to find window scene")
                return
            }
            
            if #available(iOS 16.0, *) {
                Task {
                    do {
                        try await AppStore.presentOfferCodeRedeemSheet(in: windowScene)
                        call.resolve(["status": "success"])
                    } catch {
                        call.reject("Failed to present offer code sheet: \(error.localizedDescription)")
                    }
                }
            } else {
                call.reject("Offer codes are only supported on iOS 16.0 or higher.")
            }
        }
    }
    
    @objc func getSubscriptionStatus(_ call: CAPPluginCall) {
        Task {
            let activeEntitlements = await manager.getActiveEntitlements()
            let entitlementsList = activeEntitlements.map { transaction -> [String: Any] in
                return [
                    "productId": transaction.productID,
                    "transactionId": String(transaction.id),
                    "originalTransactionId": String(transaction.originalID),
                    "expiresDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                    "isTrial": transaction.offerType == .introductory || transaction.offerType == .promotional
                ]
            }
            call.resolve(["entitlements": entitlementsList])
        }
    }
}
