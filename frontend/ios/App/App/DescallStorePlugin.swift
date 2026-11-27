import Foundation
import StoreKit
import Capacitor

/// Descall+ in-app purchases with StoreKit 2 (iOS 15+), exposed to JS as `DescallStore`
/// (src/plus2/storeKit.js).
///
///   products({ ids })                      -> { products: [{ id, displayName, displayPrice, price, currency }] }
///   purchase({ productId, appAccountToken }) -> { status: purchased | pending | cancelled, jws?, transactionId? }
///   finish({ transactionId })              finishes a delivered transaction
///   currentEntitlements()                  -> { transactions: [{ jws, transactionId }] } (restore)
///   start()                                begins listening; unfinished / background transactions
///                                          arrive as the "transaction" event { jws, transactionId }
///
/// Only verified transactions are passed on (StoreKit's on-device JWS check); the server checks the
/// Apple certificate chain again before it grants anything. appAccountToken is the Descall checkout
/// id, so the server knows who bought what. Nothing is finished until the server has accepted it.
@objc(DescallStorePlugin)
public class DescallStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallStorePlugin"
    public let jsName = "DescallStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private var updatesTask: Task<Void, Never>?
    private var pending: [String: Transaction] = [:]
    private let lock = NSLock()

    deinit {
        updatesTask?.cancel()
    }

    private func remember(_ transaction: Transaction) {
        lock.lock()
        pending[String(transaction.id)] = transaction
        lock.unlock()
    }

    private func take(_ id: String) -> Transaction? {
        lock.lock()
        defer { lock.unlock() }
        return pending.removeValue(forKey: id)
    }

    @objc func start(_ call: CAPPluginCall) {
        if updatesTask == nil {
            updatesTask = Task.detached { [weak self] in
                for await result in Transaction.updates {
                    guard let self = self else { return }
                    if case .verified(let transaction) = result {
                        self.remember(transaction)
                        self.notifyListeners("transaction", data: [
                            "jws": result.jwsRepresentation,
                            "transactionId": String(transaction.id),
                        ])
                    }
                }
            }
            // Transactions that were never finished (the app closed mid-purchase).
            Task { [weak self] in
                for await result in Transaction.unfinished {
                    guard let self = self else { return }
                    if case .verified(let transaction) = result {
                        self.remember(transaction)
                        self.notifyListeners("transaction", data: [
                            "jws": result.jwsRepresentation,
                            "transactionId": String(transaction.id),
                        ])
                    }
                }
            }
        }
        call.resolve()
    }

    @objc func products(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self) ?? []).filter { !$0.isEmpty }
        if ids.isEmpty {
            call.resolve(["products": []])
            return
        }
        Task {
            do {
                let list = try await Product.products(for: ids)
                let out: [[String: Any]] = list.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue,
                        "currency": product.priceFormatStyle.currencyCode,
                    ]
                }
                call.resolve(["products": out])
            } catch {
                call.reject("products_failed", "products_failed", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("invalid_product")
            return
        }
        let tokenString = call.getString("appAccountToken") ?? ""
        Task {
            do {
                let list = try await Product.products(for: [productId])
                guard let product = list.first else {
                    call.reject("product_not_found")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let token = UUID(uuidString: tokenString) {
                    options.insert(.appAccountToken(token))
                }
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        self.remember(transaction)
                        call.resolve([
                            "status": "purchased",
                            "jws": verification.jwsRepresentation,
                            "transactionId": String(transaction.id),
                        ])
                    case .unverified(_, _):
                        call.reject("unverified")
                    }
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject("purchase_failed", "purchase_failed", error)
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId"), !id.isEmpty else {
            call.reject("invalid_transaction")
            return
        }
        Task {
            if let transaction = self.take(id) {
                await transaction.finish()
                call.resolve(["finished": true])
                return
            }
            // Not in memory (app restarted): look it up among unfinished transactions.
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, String(transaction.id) == id {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            call.resolve(["finished": false])
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var out: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    self.remember(transaction)
                    out.append(["jws": result.jwsRepresentation, "transactionId": String(transaction.id)])
                }
            }
            call.resolve(["transactions": out])
        }
    }
}
