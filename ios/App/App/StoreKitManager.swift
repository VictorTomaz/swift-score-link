import Foundation
import StoreKit

@available(iOS 15.0, *)
public class StoreKitManager {
    public static let shared = StoreKitManager()
    
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
        updateListenerTask = Task.detached {
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    print("Received transaction update for product: \(transaction.productID)")
                    
                    // Sincronizar o estado local e postar notificação para o frontend
                    NotificationCenter.default.post(name: NSNotification.Name("StoreKitTransactionUpdated"), object: nil)
                    
                    // Finaliza a transação
                    await transaction.finish()
                } catch {
                    print("Transaction verification failed: \(error.localizedDescription)")
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
            let fetched = try await Product.products(for: [productId])
            guard let prod = fetched.first else {
                throw NSError(domain: "StoreKitManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Product \(productId) not found"])
            }
            return try await prod.purchase()
        }
        
        return try await product.purchase()
    }
    
    func restorePurchases() async throws {
        try await AppStore.sync()
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
                print("Entitlement verification failed: \(error.localizedDescription)")
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
                print("Entitlement verification failed: \(error.localizedDescription)")
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
            print("Failed to read receipt: \(error)")
            return nil
        }
    }
}
