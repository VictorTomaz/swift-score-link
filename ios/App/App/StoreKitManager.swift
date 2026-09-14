import Foundation
import StoreKit
import CryptoKit
import os.log

// Derives a stable UUID from a Base44 user id (a 24-hex-char ObjectId, not
// itself a valid UUID) via SHA-256, so it can be passed to StoreKit as the
// purchase's appAccountToken. Same algorithm on the backend (entry.ts) —
// SHA-256 of the UTF-8 id, first 16 bytes, RFC 4122 version/variant bits set.
//
// Why this exists: apple-webhook has no session/user context (it's a
// server-to-server callback from Apple), so it can only key Subscription
// updates by Apple-side identifiers like original_transaction_id. That's
// normally fine (same user's own renewal), but when the SAME Apple ID is
// reused across several different Base44 test accounts (only possible with
// a shared sandbox tester — never happens with a real user's own unique
// Apple ID), Apple reports the same original_transaction_id for all of
// them, and the webhook silently overwrote the WRONG user's Subscription
// row instead of the purchaser's own (confirmed 2026-09-13, victortomaz26's
// purchase landed on a different test account's record). appAccountToken is
// Apple's own supported mechanism for exactly this: a UUID we attach to the
// purchase that comes back in every transaction/notification for it,
// letting us match precisely instead of guessing from original_transaction_id.
func uuidFromUserId(_ userId: String) -> UUID {
    let digest = SHA256.hash(data: Data(userId.utf8))
    var bytes = Array(digest.prefix(16))
    bytes[6] = (bytes[6] & 0x0F) | 0x50 // version 5 (name-based)
    bytes[8] = (bytes[8] & 0x3F) | 0x80 // RFC 4122 variant
    return NSUUID(uuidBytes: bytes) as UUID
}

@available(iOS 15.0, *)
public class StoreKitManager {
    public static let shared = StoreKitManager()
    // Same subsystem/category style as StoreKitPlugin — plain print() does NOT
    // survive to a device syslog export, so the background transaction listener
    // and entitlement checks below have to go through os.log to be auditable
    // after a real-device test.
    private let log = Logger(subsystem: "com.base69bb019558d96a11fbfbddce.app", category: "StoreKit-App")

    private var products: [Product] = []
    private var updateListenerTask: Task<Void, Never>? = nil
    
    // Product IDs must match App Store Connect
    private let productIdentifiers = Set(["com.swiftscoregolf.monthly", "com.swiftscoregolf.yearly"])
    
    private init() {
        startTransactionListener()
    }
    
    deinit {
        updateListenerTask?.cancel()
    }
    
    // Permanently listen for transaction updates from App Store. Also how a
    // purchase's own transaction gets redelivered on a later launch if it was
    // never finished (see purchase()/finishTransaction() below) — StoreKit
    // keeps replaying an unfinished transaction here until something finishes
    // it, which is exactly the retry mechanism we want when our backend
    // validation failed the first time.
    func startTransactionListener() {
        updateListenerTask?.cancel()
        log.notice("StoreKitManager: startTransactionListener installed")
        updateListenerTask = Task.detached { [log] in
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    log.notice("StoreKitManager: Transaction.updates fired — productID=\(transaction.productID, privacy: .public) transactionId=\(String(transaction.id), privacy: .public) revocationDate=\(String(describing: transaction.revocationDate), privacy: .public)")

                    if transaction.revocationDate != nil {
                        // Refund/revocation — nothing for our backend to validate,
                        // just acknowledge it.
                        await transaction.finish()
                        log.notice("StoreKitManager: Transaction.updates — revoked transaction finished, id=\(String(transaction.id), privacy: .public)")
                        NotificationCenter.default.post(name: NSNotification.Name("StoreKitTransactionUpdated"), object: nil)
                        continue
                    }

                    // Do NOT finish here. Finishing before our backend confirms the
                    // purchase is exactly the bug that made a failed validateAppleReceipt
                    // call unrecoverable (StoreKit never re-delivers a finished
                    // transaction). Instead, hand the JWS to JS so it can retry
                    // validation and only then call finishTransaction(). If JS never
                    // gets a chance to (app killed, etc.), this same transaction comes
                    // back through this exact loop on the next launch.
                    NotificationCenter.default.post(
                        name: NSNotification.Name("StoreKitTransactionUpdated"),
                        object: nil,
                        userInfo: [
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                            "jwsTransaction": result.jwsRepresentation,
                        ]
                    )
                } catch {
                    let ns = error as NSError
                    log.error("StoreKitManager: Transaction.updates verification failed — domain=\(ns.domain, privacy: .public) code=\(ns.code) desc=\(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    // Finds an unfinished transaction by id and finishes it. Called from JS
    // only after validateAppleReceipt has durably recorded the purchase —
    // see the comment in startTransactionListener() for why finishing is
    // deferred this far.
    func finishTransaction(id: UInt64) async -> Bool {
        for await result in Transaction.unfinished {
            guard let transaction = try? checkVerified(result) else { continue }
            if transaction.id == id {
                await transaction.finish()
                log.notice("StoreKitManager: finishTransaction — finished id=\(String(id), privacy: .public)")
                return true
            }
        }
        log.error("StoreKitManager: finishTransaction — id=\(String(id), privacy: .public) not found among unfinished transactions")
        return false
    }
    
    func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
    
    func fetchProducts() async throws -> [Product] {
        let fetchedProducts = try await Product.products(for: productIdentifiers)
        self.products = fetchedProducts
        return fetchedProducts
    }
    
    func purchase(productId: String, appUserId: String? = nil) async throws -> Product.PurchaseResult {
        if products.isEmpty {
            _ = try await fetchProducts()
        }

        var options: Set<Product.PurchaseOption> = []
        if let appUserId = appUserId, !appUserId.isEmpty {
            let token = uuidFromUserId(appUserId)
            options.insert(.appAccountToken(token))
            log.notice("StoreKitManager: appAccountToken=\(token.uuidString, privacy: .public) derived for app user")
        } else {
            log.notice("StoreKitManager: no app userId provided — purchasing without appAccountToken")
        }

        guard let product = products.first(where: { $0.id == productId }) else {
            // Se não estiver em cache, tenta buscar diretamente
            log.notice("StoreKitManager: product \(productId, privacy: .public) not in cache, fetching directly")
            let fetched = try await Product.products(for: [productId])
            guard let prod = fetched.first else {
                log.error("StoreKitManager: product \(productId, privacy: .public) NOT FOUND on App Store")
                throw NSError(domain: "StoreKitManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Product \(productId) not found"])
            }
            log.notice("StoreKitManager: calling prod.purchase() for \(productId, privacy: .public)")
            return try await prod.purchase(options: options)
        }

        log.notice("StoreKitManager: calling product.purchase() for \(productId, privacy: .public)")
        return try await product.purchase(options: options)
    }

    func restorePurchases() async throws {
        log.notice("StoreKitManager: AppStore.sync() starting")
        try await AppStore.sync()
        log.notice("StoreKitManager: AppStore.sync() completed")
        // Após o sync, posta notificação de atualização
        NotificationCenter.default.post(name: NSNotification.Name("StoreKitTransactionUpdated"), object: nil)
    }
    
    func getActiveEntitlements() async -> [Transaction] {
        var activeTransactions: [Transaction] = []
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                activeTransactions.append(transaction)
            } catch {
                log.error("StoreKitManager: entitlement verification failed — \(error.localizedDescription, privacy: .public)")
            }
        }
        return activeTransactions
    }

    // Like getActiveEntitlements(), but also keeps the signed JWS representation
    // of each transaction — needed so restore can be verified server-side via
    // StoreKit 2 JWS (same path as a fresh purchase), instead of falling back to
    // the deprecated legacy verifyReceipt API.
    func getActiveEntitlementsWithJWS() async -> [(transaction: Transaction, jws: String)] {
        var activeTransactions: [(Transaction, String)] = []
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                activeTransactions.append((transaction, result.jwsRepresentation))
            } catch {
                log.error("StoreKitManager: entitlement verification failed — \(error.localizedDescription, privacy: .public)")
            }
        }
        return activeTransactions
    }
    
    func getReceiptData() -> String? {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              FileManager.default.fileExists(atPath: receiptURL.path) else {
            return nil
        }
        do {
            let receiptData = try Data(contentsOf: receiptURL)
            return receiptData.base64EncodedString()
        } catch {
            log.error("StoreKitManager: failed to read receipt — \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
