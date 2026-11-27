import Foundation

// DescallKit (4.2): pure rules shared by the app and its extensions. No Keychain, no
// network: tested on the CI runner with swiftc (frontend/ios/selftest/kit/main.swift).

/// API origin. The web layer reports the one it uses (src/config/api.js API_BASE_URL);
/// only https Descall hosts are accepted, anything else falls back to production so a
/// session token can never be sent to a foreign host.
public enum DescallAPIBase {
    public static let production = "https://des-call.onrender.com"
    static let exactHosts: Set<String> = ["des-call.onrender.com", "descall.com", "www.descall.com"]

    public static func isAllowed(host: String) -> Bool {
        let h = host.lowercased()
        return exactHosts.contains(h) || (h.hasSuffix(".descall.com") && h.count <= 64)
    }

    /// "https://host[:port]" without a trailing slash or path, or production.
    public static func validated(_ raw: String?) -> String {
        guard let raw, let comps = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              comps.scheme?.lowercased() == "https", let host = comps.host, isAllowed(host: host),
              comps.user == nil, comps.password == nil else { return production }
        var out = "https://\(host.lowercased())"
        if let port = comps.port, port != 443 { out += ":\(port)" }
        return out
    }
}

/// Every failure a native surface (Siri, a widget, a share sheet) has to explain.
public enum DescallAPIError: Error, Equatable, Sendable {
    case signedOut          // no session on this device
    case unauthorized       // 401: the session ended (signed out elsewhere, revoked)
    case banned             // 403 { error: "banned" }
    case forbidden          // 403 other (not a friend, no permission)
    case notFound
    case rateLimited        // 429
    case badRequest(String?)
    case server(Int)
    case offline
    case timeout
    case network
    case decoding
    case cancelled

    /// nil for 2xx.
    public static func from(status: Int, body: Data?) -> DescallAPIError? {
        if (200..<300).contains(status) { return nil }
        let code = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["error"] as? String
        switch status {
        case 401: return .unauthorized
        case 403: return code == "banned" ? .banned : .forbidden
        case 404: return .notFound
        case 429: return .rateLimited
        case 400, 409, 422: return .badRequest(code)
        default: return .server(status)
        }
    }

    public static func from(transport error: Error) -> DescallAPIError {
        if let e = error as? DescallAPIError { return e }
        if error is CancellationError { return .cancelled }
        guard let url = error as? URLError else { return .network }
        switch url.code {
        case .cancelled: return .cancelled
        case .timedOut: return .timeout
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
            return .offline
        default: return .network
        }
    }

    /// Worth one more try (a cold Render instance, a flaky cell link).
    public var isRetryable: Bool {
        switch self {
        case .timeout, .network: return true
        case .server(let code): return code >= 500
        default: return false
        }
    }

    /// The account is not usable here until the user signs in again in the app.
    public var needsSignIn: Bool { self == .signedOut || self == .unauthorized }
}

public enum DescallJSON {
    public static var decoder: JSONDecoder { JSONDecoder() }
    public static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }
}

/// Message rules shared with POST /api/watch/send (1..1000 chars after trimming).
public enum DescallMessageRules {
    public static let maxLength = 1000

    public static func cleaned(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, t.count <= maxLength else { return nil }
        return t
    }

    /// dm:<id>, group:<id> or channel:<id> (backend watchApi.validConv).
    public static func isValidConv(_ conv: String) -> Bool {
        let parts = conv.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, ["dm", "group", "channel"].contains(parts[0]) else { return false }
        let id = parts[1]
        guard (1...64).contains(id.count) else { return false }
        return id.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "-" }
    }
}
