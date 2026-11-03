import Foundation
import SwiftUI

/// 3.7.33: one screen's data with its loading / error / freshness state. A failed refresh
/// keeps the last good value (from this run or the on-watch cache) and records the error,
/// so the screen shows data + an offline banner instead of going blank.
struct Loadable<T> {
    var value: T?
    var error: WatchError?
    var updatedAt: Date?
    var loading = false
    /// The value came from the on-watch cache (not this run's reply).
    var fromCache = false

    var isStale: Bool {
        guard let updatedAt else { return true }
        return Date().timeIntervalSince(updatedAt) > WatchFreshness.staleAfter
    }
}

@MainActor
final class WatchStore: ObservableObject {
    @Published var homeState = Loadable<WatchHome>()
    @Published var friendsState = Loadable<WatchFriends>()
    @Published var serversState = Loadable<WatchServers>()
    @Published var callsState = Loadable<WatchCalls>()
    @Published var activityState = Loadable<WatchActivity>()
    /// The last request failed for a transport reason (iPhone away / no internet).
    @Published var offline = false

    var home: WatchHome? {
        get { homeState.value }
        set { homeState.value = newValue }
    }
    var homeError: WatchError? { homeState.value == nil ? homeState.error : nil }
    var friends: WatchFriends? { friendsState.value }
    var friendsError: WatchError? { friendsState.value == nil ? friendsState.error : nil }

    // Admin step-up (3.7.20): every admin change needs a fresh authenticator code
    // (backend requireStepUp, 15 min token bound to the iPhone's session).
    @Published var stepUpPrompt = false
    @Published var stepUpError: String?
    @Published var stepUpBusy = false
    private var stepUpToken: String?
    private var stepUpExpires = Date.distantPast
    private var stepUpWaiter: CheckedContinuation<Bool, Never>?

    let transport: WatchTransport

    init(transport: WatchTransport) {
        self.transport = transport
        // Open with the last good data while the first request is on its way.
        if !ProcessInfo.processInfo.arguments.contains("-DescallWatchDemo") {
            homeState = Self.cached("/api/watch/home")
            friendsState = Self.cached("/api/watch/friends")
            serversState = Self.cached("/api/watch/servers")
            callsState = Self.cached("/api/watch/calls")
            activityState = Self.cached("/api/watch/activity")
        } else if WatchDemo.isOffline {
            homeState = WatchDemo.offlineHome
            offline = true
        }
    }

    private static func cached<T: Decodable>(_ path: String) -> Loadable<T> {
        guard let entry = WatchCache.load(path), let value = try? JSONDecoder().decode(T.self, from: entry.data) else { return Loadable<T>() }
        return Loadable(value: value, error: nil, updatedAt: entry.savedAt, loading: false, fromCache: true)
    }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, as type: T.Type, stepUp: String? = nil) async throws -> T {
        let data: Data
        do {
            data = try await transport.send(method: "GET", path: path, body: nil, stepUp: stepUp)
            offline = false
        } catch let e as WatchError {
            note(e)
            throw e
        }
        let value: T
        do {
            value = try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw WatchError.decode
        }
        WatchCache.save(data, path: path)
        return value
    }

    /// Transport errors flip the offline banner; a signed-out iPhone wipes the cache.
    private func note(_ e: WatchError) {
        if e.isOffline { offline = true }
        if e == .noSession {
            offline = false
            WatchCache.clear()
        }
    }

    /// Loads one screen into its Loadable. Keeps the old value on failure; ignores a
    /// second call while one is running (pull + timer + appear at the same time).
    func refresh<T: Decodable>(_ key: ReferenceWritableKeyPath<WatchStore, Loadable<T>>, _ path: String) async {
        if self[keyPath: key].loading { return }
        self[keyPath: key].loading = true
        // 3.7.34: shared store loads run in their own task. A screen that leaves (page swipe,
        // NavigationStack push) cancels its .task; that used to cancel the shared request
        // (CancellationError -> "No connection") on the next screen reading the same state.
        let work = Task { await self.load(key, path) }
        await work.value
    }

    private func load<T: Decodable>(_ key: ReferenceWritableKeyPath<WatchStore, Loadable<T>>, _ path: String) async {
        defer { self[keyPath: key].loading = false }
        do {
            let value = try await get(path, as: T.self)
            self[keyPath: key].value = value
            self[keyPath: key].error = nil
            self[keyPath: key].updatedAt = Date()
            self[keyPath: key].fromCache = false
        } catch let e as WatchError {
            self[keyPath: key].error = e
            if e == .noSession { self[keyPath: key].value = nil }
        } catch is CancellationError {
            // Not a connection problem; keep the last value and error as they were.
        } catch {
            self[keyPath: key].error = .network
        }
    }

    @discardableResult
    func send(_ method: String, _ path: String, _ body: [String: Any] = [:], stepUp: String? = nil) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body)
        do {
            let out = try await transport.send(method: method, path: path, body: data, stepUp: stepUp)
            offline = false
            return out
        } catch let e as WatchError {
            note(e)
            throw e
        }
    }

    static func query(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: ":-_."))) ?? value
    }

    // MARK: Screens

    func loadHome() async { await refresh(\.homeState, "/api/watch/home") }
    func loadFriends() async { await refresh(\.friendsState, "/api/watch/friends") }
    func loadServers() async { await refresh(\.serversState, "/api/watch/servers") }
    func loadCalls() async { await refresh(\.callsState, "/api/watch/calls") }
    func loadActivity() async { await refresh(\.activityState, "/api/watch/activity") }

    /// Back on the wrist / iPhone back in reach: refresh what is cheap and visible everywhere.
    func refreshAll() async {
        async let h: Void = loadHome()
        async let f: Void = loadFriends()
        async let a: Void = loadActivity()
        _ = await (h, f, a)
    }

    func thread(_ conv: String) async throws -> WatchThread {
        try await get("/api/watch/thread?conv=\(Self.query(conv))", as: WatchThread.self)
    }

    func sendMessage(conv: String, text: String) async throws {
        try await send("POST", "/api/watch/send", ["conv": conv, "text": text])
        Task { await self.loadHome() }
    }

    func markRead(_ conv: String) async {
        _ = try? await send("POST", "/api/watch/read", ["conv": conv])
    }

    func setStatus(_ status: String) async throws {
        try await send("POST", "/api/watch/status", ["status": status])
        homeState.value?.me.status = status
    }

    // MARK: Admin

    func adminGet<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await get("/api/admin" + path, as: T.self)
    }

    private func validStepUp() -> String? {
        Date() < stepUpExpires ? stepUpToken : nil
    }

    private func isStepUpRequired(_ error: WatchError) -> Bool {
        if case .http(403, let reason) = error, reason == "STEP_UP_REQUIRED" { return true }
        return false
    }

    /// An admin change (POST / PATCH / DELETE). Asks for the code first when there is no
    /// valid step-up token, then retries once. `.failure(.http(0, "cancelled"))` when the
    /// person closes the code sheet.
    func adminChange(_ method: String, _ path: String, _ body: [String: Any] = [:]) async -> Result<Data, WatchError> {
        if let token = validStepUp() {
            let first = await attemptAdmin(method, path, body, token)
            switch first {
            case .failure(let e) where isStepUpRequired(e):
                stepUpToken = nil
            default:
                return first
            }
        }
        guard await requestStepUp(), let token = validStepUp() else { return .failure(.http(0, "cancelled")) }
        return await attemptAdmin(method, path, body, token)
    }

    private func attemptAdmin(_ method: String, _ path: String, _ body: [String: Any], _ token: String) async -> Result<Data, WatchError> {
        do {
            return .success(try await send(method, "/api/admin" + path, body, stepUp: token))
        } catch let e as WatchError {
            return .failure(e)
        } catch {
            return .failure(.network)
        }
    }

    private func requestStepUp() async -> Bool {
        stepUpWaiter?.resume(returning: false)
        return await withCheckedContinuation { cont in
            stepUpWaiter = cont
            stepUpError = nil
            stepUpPrompt = true
        }
    }

    func submitStepUp(code raw: String) async {
        let code = raw.filter { $0.isNumber || $0.isLetter || $0 == "-" }
        guard !code.isEmpty, !stepUpBusy else { return }
        stepUpBusy = true
        defer { stepUpBusy = false }
        do {
            let data = try await send("POST", "/api/admin/step-up", ["code": code])
            let reply = try JSONDecoder().decode(AdminStepUpResponse.self, from: data)
            guard let token = reply.token else {
                stepUpError = L.codeWrong
                return
            }
            stepUpToken = token
            stepUpExpires = Date().addingTimeInterval(TimeInterval(max(60, (reply.expiresInSec ?? 900) - 60)))
            stepUpPrompt = false
            stepUpWaiter?.resume(returning: true)
            stepUpWaiter = nil
        } catch let e as WatchError {
            if case .http(let status, _) = e, status == 400 || status == 429 {
                stepUpError = status == 429 ? L.error(e) : L.codeWrong
            } else {
                stepUpError = L.error(e)
            }
        } catch {
            stepUpError = L.codeWrong
        }
    }

    func cancelStepUp() {
        stepUpPrompt = false
        stepUpWaiter?.resume(returning: false)
        stepUpWaiter = nil
    }
}
