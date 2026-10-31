import Foundation

/// 3.7.17 Apple Watch <-> iPhone message contract (WatchConnectivity).
///
/// The watch never holds a session token. It sends a request dictionary to the
/// paired iPhone; `DescallWatchBridge` (iPhone) checks it with `isAllowed`, calls
/// the API with the signed-in session from the Keychain and replies with the
/// HTTP status and body. Only /api/watch/* (chats, friends, status) and
/// /api/admin/* (same permission, 2FA and step-up checks as the app) can pass.
/// Compiled into both targets; pure, tested by ios/selftest/watch/main.swift.
enum DescallWatchProtocol {
    static let version = 1
    static let maxBodyBytes = 8 * 1024
    static let maxReplyBytes = 256 * 1024
    static let maxPathLength = 300

    enum Key {
        static let version = "v"
        static let id = "id"
        static let method = "method"
        static let path = "path"
        static let body = "body"
        static let stepUp = "stepUp"
        static let status = "status"
        static let error = "error"
    }

    /// Bridge-level failures (status 0 in the reply).
    enum Failure {
        static let notAllowed = "not_allowed"
        static let noSession = "no_session"
        static let network = "network"
        static let badRequest = "bad_request"
    }

    static let methods: Set<String> = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    static let prefixes = ["/api/watch/", "/api/admin/"]

    private static let pathCharacters = CharacterSet(charactersIn:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-_.?=&:%,")

    static func isAllowed(method: String, path: String) -> Bool {
        guard methods.contains(method) else { return false }
        guard !path.isEmpty, path.count <= maxPathLength else { return false }
        guard prefixes.contains(where: { path.hasPrefix($0) }) else { return false }
        guard path.unicodeScalars.allSatisfy({ pathCharacters.contains($0) }) else { return false }
        if path.contains("..") || path.contains("//") { return false }
        return true
    }

    /// Step-up tokens are opaque, short and header-safe.
    static func isStepUpToken(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 2048 else { return false }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
        return value.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    static func request(id: String, method: String, path: String, body: String? = nil, stepUp: String? = nil) -> [String: Any] {
        var out: [String: Any] = [Key.version: version, Key.id: id, Key.method: method, Key.path: path]
        if let body { out[Key.body] = body }
        if let stepUp { out[Key.stepUp] = stepUp }
        return out
    }

    /// The iPhone's verdict on an incoming dictionary: nil = forward it, else the failure code.
    static func validate(_ message: [String: Any]) -> String? {
        guard (message[Key.version] as? Int) == version,
              let method = message[Key.method] as? String,
              let path = message[Key.path] as? String else { return Failure.badRequest }
        guard isAllowed(method: method, path: path) else { return Failure.notAllowed }
        if let body = message[Key.body] {
            guard let text = body as? String, text.utf8.count <= maxBodyBytes else { return Failure.badRequest }
        }
        if let stepUp = message[Key.stepUp] {
            guard let text = stepUp as? String, isStepUpToken(text) else { return Failure.badRequest }
        }
        return nil
    }
}
