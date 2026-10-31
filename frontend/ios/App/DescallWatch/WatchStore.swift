import Foundation
import SwiftUI

@MainActor
final class WatchStore: ObservableObject {
    @Published var home: WatchHome?
    @Published var homeError: WatchError?
    @Published var friends: WatchFriends?
    @Published var friendsError: WatchError?

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
    }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, as type: T.Type, stepUp: String? = nil) async throws -> T {
        let data = try await transport.send(method: "GET", path: path, body: nil, stepUp: stepUp)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw WatchError.decode
        }
    }

    @discardableResult
    func send(_ method: String, _ path: String, _ body: [String: Any] = [:], stepUp: String? = nil) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await transport.send(method: method, path: path, body: data, stepUp: stepUp)
    }

    static func query(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: ":-_."))) ?? value
    }

    // MARK: Screens

    func loadHome() async {
        do {
            home = try await get("/api/watch/home", as: WatchHome.self)
            homeError = nil
        } catch let e as WatchError {
            homeError = e
        } catch {
            homeError = .network
        }
    }

    func loadFriends() async {
        do {
            friends = try await get("/api/watch/friends", as: WatchFriends.self)
            friendsError = nil
        } catch let e as WatchError {
            friendsError = e
        } catch {
            friendsError = .network
        }
    }

    func thread(_ conv: String) async throws -> WatchThread {
        try await get("/api/watch/thread?conv=\(Self.query(conv))", as: WatchThread.self)
    }

    func sendMessage(conv: String, text: String) async throws {
        try await send("POST", "/api/watch/send", ["conv": conv, "text": text])
        Task { await loadHome() }
    }

    func markRead(_ conv: String) async {
        _ = try? await send("POST", "/api/watch/read", ["conv": conv])
    }

    func setStatus(_ status: String) async throws {
        try await send("POST", "/api/watch/status", ["status": status])
        home?.me.status = status
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
