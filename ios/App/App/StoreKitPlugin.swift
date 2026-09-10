import Foundation
import Capacitor
import StoreKit
import os.log

@available(iOS 15.0, *)
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin {
    private let manager = StoreKitManager.shared
    // Distinct subsystem so this shows up clearly in a device syslog export
    // (plain print() doesn't reliably appear there — confirmed missing entirely
    // from a real Sauce Labs device log while debugging a stuck-purchase-UI bug).
    // Filter a pulled log with: grep '"SwiftScoreGolf.StoreKit"' or grep 'App(StoreKit-App)'.
    private let log = Logger(subsystem: "com.base69bb019558d96a11fbfbddce.app", category: "StoreKit-App")
    
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
    
    // Bridge for the web layer to write into the device's unified log (os.log).
    // Plain console.log / print() from the WKWebView do NOT appear in a device
    // syslog export — confirmed repeatedly while debugging the purchase flow.
    // JS calls StoreKitPlugin.nativeLog({ message, level }) and it shows up as
    //   App[<pid>] <Notice>: JS: <message>
    // in a sysdiagnose / Console export, greppable by "JS: ".
    @objc func nativeLog(_ call: CAPPluginCall) {
        let msg = call.getString("message") ?? "(empty)"
        let level = call.getString("level") ?? "notice"
        if level == "error" {
            log.error("JS: \(msg, privacy: .public)")
        } else {
            log.notice("JS: \(msg, privacy: .public)")
        }
        call.resolve()
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
            log.error("purchaseSubscription: rejected — productId missing from call")
            call.reject("productId is required")
            return
        }

        log.notice("purchaseSubscription: START productId=\(productId, privacy: .public)")

        Task {
            do {
                let purchaseResult = try await manager.purchase(productId: productId)
                log.notice("purchaseSubscription: manager.purchase() returned, case=\(String(describing: purchaseResult), privacy: .public)")
                switch purchaseResult {
                case .success(let verificationResult):
                    let receiptData = manager.getReceiptData() ?? ""
                    var jwsRepresentation = ""
                    var transactionId = ""

                    switch verificationResult {
                    case .verified(let transaction):
                        jwsRepresentation = verificationResult.jwsRepresentation
                        transactionId = String(transaction.id)
                        log.notice("purchaseSubscription: VERIFIED transactionId=\(transactionId, privacy: .public) originalId=\(String(transaction.originalID), privacy: .public) jwsLength=\(jwsRepresentation.count) receiptDataLength=\(receiptData.count)")
                        await transaction.finish()
                        log.notice("purchaseSubscription: transaction.finish() completed for transactionId=\(transactionId, privacy: .public)")
                    case .unverified(let transaction, let error):
                        jwsRepresentation = verificationResult.jwsRepresentation
                        transactionId = String(transaction.id)
                        log.error("purchaseSubscription: UNVERIFIED transactionId=\(transactionId, privacy: .public) error=\(error.localizedDescription, privacy: .public) jwsLength=\(jwsRepresentation.count)")
                    }

                    if jwsRepresentation.isEmpty {
                        log.error("purchaseSubscription: WARNING — resolving success with EMPTY jwsRepresentation. Backend validation will fail (no jwsTransaction, no receiptData path). productId=\(productId, privacy: .public)")
                    }

                    // Trigger compatibility callbacks
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitPurchaseSuccess?.('\(receiptData)')"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }

                    log.notice("purchaseSubscription: RESOLVING to JS — status=success transactionId=\(transactionId, privacy: .public) jwsLength=\(jwsRepresentation.count)")
                    call.resolve([
                        "status": "success",
                        "receiptData": receiptData,
                        "jwsTransaction": jwsRepresentation,
                        "transactionId": transactionId
                    ])

                case .userCancelled:
                    log.notice("purchaseSubscription: userCancelled productId=\(productId, privacy: .public)")
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitError?.({message: 'Purchase cancelled by user'})"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }
                    call.resolve([
                        "status": "cancelled",
                        "message": "Purchase cancelled by user"
                    ])

                case .pending:
                    log.notice("purchaseSubscription: pending (parental/institutional approval) productId=\(productId, privacy: .public)")
                    DispatchQueue.main.async {
                        let js = "window.handleStoreKitError?.({message: 'Purchase is pending approval'})"
                        self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                    }
                    call.resolve([
                        "status": "pending",
                        "message": "Purchase is pending approval"
                    ])

                @unknown default:
                    log.error("purchaseSubscription: @unknown default purchase result case, productId=\(productId, privacy: .public)")
                    call.reject("Unknown purchase result")
                }
            } catch {
                let ns = error as NSError
                log.error("purchaseSubscription: THREW productId=\(productId, privacy: .public) domain=\(ns.domain, privacy: .public) code=\(ns.code) description=\(error.localizedDescription, privacy: .public)")
                DispatchQueue.main.async {
                    let js = "window.handleStoreKitError?.({message: '\(error.localizedDescription)'})"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        log.notice("restorePurchases: START")
        Task {
            do {
                try await manager.restorePurchases()
                log.notice("restorePurchases: manager.restorePurchases() (AppStore.sync()) completed")
                let receiptData = manager.getReceiptData() ?? ""

                let activeEntitlements = await manager.getActiveEntitlementsWithJWS()
                log.notice("restorePurchases: found \(activeEntitlements.count) active entitlement(s)")
                let entitlementsList = activeEntitlements.map { entry -> [String: Any] in
                    let (transaction, jws) = entry
                    log.notice("restorePurchases: entitlement productId=\(transaction.productID, privacy: .public) transactionId=\(String(transaction.id), privacy: .public) jwsLength=\(jws.count)")
                    return [
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "expiresDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                        "jwsTransaction": jws
                    ]
                }

                DispatchQueue.main.async {
                    let js = "window.handleStoreKitRestoreSuccess?.('\(receiptData)')"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }

                log.notice("restorePurchases: RESOLVING to JS — status=success entitlementCount=\(entitlementsList.count)")
                call.resolve([
                    "status": "success",
                    "receiptData": receiptData,
                    "entitlements": entitlementsList
                ])
            } catch {
                // "The operation couldn't be completed" (error.localizedDescription) is
                // Cocoa's generic placeholder and hides the real cause — pull the
                // StoreKitError case and/or the underlying NSError domain/code so the
                // next report actually tells us what failed.
                var detail = error.localizedDescription
                if let skError = error as? StoreKitError {
                    switch skError {
                    case .unknown: detail = "StoreKitError.unknown"
                    case .userCancelled: detail = "StoreKitError.userCancelled"
                    case .networkError(let urlError):
                        detail = "StoreKitError.networkError (URLError code \(urlError.code.rawValue): \(urlError.localizedDescription))"
                    case .systemError(let underlying):
                        let ns = underlying as NSError
                        detail = "StoreKitError.systemError (\(ns.domain) code \(ns.code): \(ns.localizedDescription))"
                    case .notAvailableInStorefront: detail = "StoreKitError.notAvailableInStorefront"
                    case .notEntitled: detail = "StoreKitError.notEntitled"
                    @unknown default:
                        let ns = error as NSError
                        detail = "StoreKitError.unknown-case (\(ns.domain) code \(ns.code))"
                    }
                } else {
                    let ns = error as NSError
                    detail = "\(ns.domain) code \(ns.code): \(ns.localizedDescription)"
                }
                log.error("restorePurchases: FAILED \(detail, privacy: .public)")
                DispatchQueue.main.async {
                    let js = "window.handleStoreKitError?.({message: '\(detail)'})"
                    self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
                }
                call.reject("Restore failed: \(detail)")
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
