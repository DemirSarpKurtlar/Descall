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
    /// Largest API reply the iPhone accepts at all.
    static let maxReplyBytes = 4 * 1024 * 1024
    /// WatchConnectivity messages top out around 64 KB: replies up to `plainReplyBytes`
    /// travel as text, bigger ones zlib-compressed as `bodyZ`, and only if they then
    /// fit in `maxWireBytes` (else `too_large`).
    static let plainReplyBytes = 48 * 1024
    static let maxWireBytes = 60 * 1024
    static let maxPathLength = 300

    enum Key {
        static let version = "v"
        static let id = "id"
        static let method = "method"
        static let path = "path"
        static let body = "body"
        static let bodyZ = "bodyZ"
        static let stepUp = "stepUp"
        static let status = "status"
        static let error = "error"
        /// Reply only: the iPhone app's UI language (src/i18n/locales.json id) for the watch copy.
        static let locale = "loc"
    }

    /// Bridge-level failures (status 0 in the reply).
    enum Failure {
        static let notAllowed = "not_allowed"
        static let noSession = "no_session"
        static let network = "network"
        static let badRequest = "bad_request"
        static let tooLarge = "too_large"
    }

    /// Reply body for the watch: text when small, zlib data when big, nil when too big.
    static func encodeReply(_ data: Data) -> (key: String, value: Any)? {
        if data.count <= plainReplyBytes, let text = String(data: data, encoding: .utf8) {
            return (Key.body, text)
        }
        guard data.count <= maxReplyBytes,
              let packed = try? (data as NSData).compressed(using: .zlib) as Data,
              packed.count <= maxWireBytes else { return nil }
        return (Key.bodyZ, packed)
    }

    static func decodeReply(_ reply: [String: Any]) -> Data? {
        if let text = reply[Key.body] as? String { return Data(text.utf8) }
        if let packed = reply[Key.bodyZ] as? Data {
            return try? (packed as NSData).decompressed(using: .zlib) as Data
        }
        return nil
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

/// UI language of the watch copy (WatchStrings.swift). Same ids as src/i18n/locales.json.
/// The iPhone app's UI language wins (it rides along on bridge replies, `Key.locale`);
/// otherwise the watch's languages are matched like src/i18n/detect.js: a Turkish device
/// keeps Turkish, then the first live locale, else English. Pure, tested by selftest/watch.
enum DescallWatchLocale {
    static let ids = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]
    /// status "live" in src/i18n/locales.json (drafts only by the app's UI choice).
    static let live: Set<String> = ["en", "tr"]
    static let storeKey = "descall.uiLocale"

    /// Registered id for "tr-TR", "pt", "pt_BR", "de-AT"; nil when unknown.
    static func match(_ raw: String?) -> String? {
        let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-").lowercased()
        guard !value.isEmpty else { return nil }
        if let exact = ids.first(where: { $0.lowercased() == value }) { return exact }
        let base = value.split(separator: "-").first.map(String.init) ?? value
        return ids.first { ($0.lowercased().split(separator: "-").first.map(String.init) ?? "") == base }
    }

    static func resolve(phone: String?, preferred: [String]) -> String {
        if let chosen = match(phone) { return chosen }
        guard !preferred.isEmpty else { return "tr" }
        let langs = preferred.map { $0.replacingOccurrences(of: "_", with: "-").lowercased() }
        if langs.contains(where: { $0 == "tr" || $0.hasPrefix("tr-") || $0.hasSuffix("-tr") }) { return "tr" }
        for lang in langs {
            if let hit = match(lang), live.contains(hit) { return hit }
        }
        return "en"
    }

    /// Foundation locale for formatters and case mapping.
    static func localeIdentifier(_ id: String) -> String {
        switch id {
        case "tr": return "tr_TR"
        case "de": return "de_DE"
        case "es": return "es_ES"
        case "fr": return "fr_FR"
        case "pt-BR": return "pt_BR"
        case "ru": return "ru_RU"
        default: return "en_GB"
        }
    }

    /// CLDR plural category for an integer count.
    static func pluralCategory(_ n: Int, _ id: String) -> String {
        switch id {
        case "fr", "pt-BR": return n == 0 || n == 1 ? "one" : "other"
        case "ru":
            let m10 = n % 10, m100 = n % 100
            if m10 == 1 && m100 != 11 { return "one" }
            if (2...4).contains(m10) && !(12...14).contains(m100) { return "few" }
            return "many"
        default: return n == 1 ? "one" : "other"
        }
    }
}
