import Foundation
import StoreKit
import os.log

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
    
    // Permanently listen for transaction updates from App Store.
    func startTransactionListener() {
        updateListenerTask?.cancel()
        log.notice("StoreKitManager: startTransactionListener installed")
        updateListenerTask = Task.detached { [log] in
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    log.notice("StoreKitManager: Transaction.updates fired — productID=\(transaction.productID, privacy: .public) transactionId=\(String(transaction.id), privacy: .public) revocationDate=\(String(describing: transaction.revocationDate), privacy: .public)")

                    // Sincronizar o estado local e postar notificação para o frontend
                    NotificationCenter.default.post(name: NSNotification.Name("StoreKitTransactionUpdated"), object: nil)

                    // Finaliza a transação
                    await transaction.finish()
                    log.notice("StoreKitManager: Transaction.updates — finish() completed for transactionId=\(String(transaction.id), privacy: .public)")
                } catch {
                    let ns = error as NSError
                    log.error("StoreKitManager: Transaction.updates verification failed — domain=\(ns.domain, privacy: .public) code=\(ns.code) desc=\(error.localizedDescription, privacy: .public)")
                }
            }
        }
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
    
    func purchase(productId: String) async throws -> Product.PurchaseResult {
        if products.isEmpty {
            _ = try await fetchProducts()
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
            return try await prod.purchase()
        }

        log.notice("StoreKitManager: calling product.purchase() for \(productId, privacy: .public)")
        return try await product.purchase()
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
