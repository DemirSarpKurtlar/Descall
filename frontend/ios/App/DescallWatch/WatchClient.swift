import Foundation
import WatchConnectivity

enum WatchError: Error, Equatable {
    case unreachable
    case noSession
    case notAllowed
    case network
    case decode
    case http(Int, String?)
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
        return client
    }
}

/// Requests go to the iPhone app (DescallWatchBridge.swift), which adds the session.
final class WatchPhoneClient: NSObject, WCSessionDelegate, WatchTransport {
    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data {
        typealias P = DescallWatchProtocol
        let s = WCSession.default
        var waited = 0
        while s.activationState != .activated && waited < 30 {
            try await Task.sleep(nanoseconds: 100_000_000)
            waited += 1
        }
        guard s.activationState == .activated, s.isReachable else { throw WatchError.unreachable }
        let message = P.request(
            id: UUID().uuidString,
            method: method,
            path: path,
            body: body.flatMap { String(data: $0, encoding: .utf8) },
            stepUp: stepUp
        )
        let reply: [String: Any] = try await withCheckedThrowingContinuation { cont in
            s.sendMessage(message, replyHandler: { cont.resume(returning: $0) }, errorHandler: { _ in
                cont.resume(throwing: WatchError.unreachable)
            })
        }
        let status = reply[P.Key.status] as? Int ?? 0
        let text = reply[P.Key.body] as? String
        switch status {
        case 0:
            let failure = reply[P.Key.error] as? String
            throw failure == P.Failure.notAllowed ? WatchError.notAllowed : WatchError.network
        case 401:
            throw WatchError.noSession
        case 200..<300:
            return Data((text ?? "{}").utf8)
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
