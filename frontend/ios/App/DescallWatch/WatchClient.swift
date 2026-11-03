import Foundation
import WatchConnectivity

enum WatchError: Error, Equatable {
    case unreachable
    case timeout
    case noSession
    case notAllowed
    case network
    case decode
    case http(Int, String?)

    var retryKind: WatchRetry.Kind {
        switch self {
        case .unreachable: return .unreachable
        case .timeout: return .timeout
        case .noSession: return .noSession
        case .notAllowed: return .notAllowed
        case .network: return .network
        case .decode: return .decode
        case .http(let code, _): return .http(code)
        }
    }

    /// Transport trouble (iPhone away, no internet): the screen keeps cached data and shows the offline banner.
    var isOffline: Bool { self == .unreachable || self == .timeout || self == .network }
}

/// How the watch reaches the API: the paired iPhone (real) or fixtures (CI screenshots).
protocol WatchTransport: AnyObject {
    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data
}

enum WatchTransports {
    static func make() -> WatchTransport {
        if ProcessInfo.processInfo.arguments.contains("-DescallWatchDemo") { return WatchDemoTransport() }
        let client = WatchPhoneClient()
        client.activate()
        return WatchRetryingTransport(client)
    }
}

/// 3.7.33: reads are retried twice with a short backoff when the iPhone or the network
/// hiccups (WatchRetry); writes are sent once.
final class WatchRetryingTransport: WatchTransport {
    let inner: WatchTransport
    init(_ inner: WatchTransport) { self.inner = inner }

    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data {
        var attempt = 0
        while true {
            do {
                return try await inner.send(method: method, path: path, body: body, stepUp: stepUp)
            } catch let e as WatchError {
                attempt += 1
                guard WatchRetry.isRetryable(e.retryKind, method: method),
                      let pause = WatchRetry.delay(beforeAttempt: attempt), !Task.isCancelled else { throw e }
                try? await Task.sleep(nanoseconds: UInt64(pause * 1_000_000_000))
                if Task.isCancelled { throw e }
            }
        }
    }
}

/// Requests go to the iPhone app (DescallWatchBridge.swift), which adds the session.
final class WatchPhoneClient: NSObject, WCSessionDelegate, WatchTransport {
    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        if s.activationState != .activated { s.activate() }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in NotificationCenter.default.post(name: .descallWatchReachability, object: nil) }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in NotificationCenter.default.post(name: .descallWatchReachability, object: nil) }
    }

    /// Waits (off the main thread) until WCSession is active, at most WatchRetry.activationTimeout.
    private func waitForActivation() async -> Bool {
        let s = WCSession.default
        if s.activationState == .activated { return true }
        if s.activationState == .notActivated { s.activate() }
        let deadline = Date().addingTimeInterval(WatchRetry.activationTimeout)
        while Date() < deadline {
            if s.activationState == .activated { return true }
            try? await Task.sleep(nanoseconds: 100_000_000)
            if Task.isCancelled { return false }
        }
        return s.activationState == .activated
    }

    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data {
        typealias P = DescallWatchProtocol
        guard WCSession.isSupported() else { throw WatchError.unreachable }
        guard await waitForActivation() else { throw WatchError.unreachable }
        let s = WCSession.default
        guard s.isReachable else { throw WatchError.unreachable }
        let message = P.request(
            id: UUID().uuidString,
            method: method,
            path: path,
            body: body.flatMap { String(data: $0, encoding: .utf8) },
            stepUp: stepUp
        )
        // Reply, error and our own timeout race; WatchOnce lets exactly one resume the
        // continuation (a second resume used to be possible and crashes the app).
        let reply: [String: Any] = try await withCheckedThrowingContinuation { cont in
            let once = WatchOnce<Result<[String: Any], WatchError>> { cont.resume(with: $0) }
            s.sendMessage(message, replyHandler: { once.fire(.success($0)) }, errorHandler: { err in
                let code = (err as NSError).code
                // WCErrorCodeNotReachable 7007, DeliveryFailed 7014, MessageReplyTimedOut 7012.
                once.fire(.failure(code == 7012 ? .timeout : .unreachable))
            })
            DispatchQueue.global().asyncAfter(deadline: .now() + WatchRetry.requestTimeout) {
                once.fire(.failure(.timeout))
            }
        }
        let status = reply[P.Key.status] as? Int ?? 0
        if let locale = reply[P.Key.locale] as? String {
            await MainActor.run { L.adopt(phoneLocale: locale) }
        }
        let data = P.decodeReply(reply)
        let text = data.flatMap { String(data: $0, encoding: .utf8) }
        switch status {
        case 0:
            let failure = reply[P.Key.error] as? String
            if failure == P.Failure.notAllowed { throw WatchError.notAllowed }
            if failure == P.Failure.tooLarge { throw WatchError.decode }
            if failure == P.Failure.noSession { throw WatchError.noSession }
            throw WatchError.network
        case 401:
            throw WatchError.noSession
        case 200..<300:
            return data ?? Data("{}".utf8)
        default:
            throw WatchError.http(status, Self.reason(text))
        }
    }

    /// `{"error": "..."}` or `{"code": "..."}` from the API, for the user-facing message.
    static func reason(_ text: String?) -> String? {
        guard let data = text?.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (obj["code"] as? String) ?? (obj["error"] as? String)
    }
}

extension Notification.Name {
    /// The iPhone came into or went out of reach (WCSession reachability).
    static let descallWatchReachability = Notification.Name("descall.watch.reachability")
}
