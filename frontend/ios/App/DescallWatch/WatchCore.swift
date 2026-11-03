import Foundation

// 3.7.33 watch stability core. Foundation only, no UI and no WatchConnectivity, so
// selftest/watchcore compiles it on any machine (`swiftc WatchCore.swift selftest/watchcore/main.swift`).

/// Retries for bridge requests. Only reads are retried automatically: a send that timed
/// out may already have reached the server, so writes are never repeated behind the
/// person's back (they see the error and tap again).
enum WatchRetry {
    /// Pause before attempt 2 and 3 (seconds). Short: the person is looking at the watch.
    static let delays: [Double] = [0.6, 1.8]
    /// One request (watch -> iPhone -> API -> iPhone -> watch). The bridge's own HTTP
    /// timeout is 15 s, so 22 s means the iPhone side is gone, not just slow.
    static let requestTimeout: Double = 22
    /// How long the watch waits for WCSession to finish activating.
    static let activationTimeout: Double = 4

    enum Kind: Equatable { case unreachable, timeout, network, noSession, notAllowed, decode, http(Int) }

    static func isRetryable(_ kind: Kind, method: String) -> Bool {
        guard method.uppercased() == "GET" else { return false }
        switch kind {
        case .unreachable, .timeout, .network: return true
        case .http(let code): return code == 502 || code == 503 || code == 504
        default: return false
        }
    }

    /// Delay before the given attempt (0-based; attempt 0 has none), nil = give up.
    static func delay(beforeAttempt attempt: Int) -> Double? {
        guard attempt > 0 else { return 0 }
        return attempt - 1 < delays.count ? delays[attempt - 1] : nil
    }
}

/// Resumes a continuation exactly once, whichever of reply / error / timeout comes first.
/// WatchConnectivity can call the error handler after a reply that arrived late, and a
/// double resume of a CheckedContinuation crashes the app.
final class WatchOnce<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    private let body: (T) -> Void

    init(_ body: @escaping (T) -> Void) { self.body = body }

    /// true when this call won.
    @discardableResult
    func fire(_ value: T) -> Bool {
        lock.lock()
        if done { lock.unlock(); return false }
        done = true
        lock.unlock()
        body(value)
        return true
    }
}

/// How fresh a screen's data is, for the "updated 2 min ago" line and the offline banner.
enum WatchFreshness: Equatable {
    case live          // < 1 minute
    case minutes(Int)  // 1 ... 59
    case hours(Int)    // 1 ... 23
    case days(Int)

    static func of(_ updated: Date, now: Date = Date()) -> WatchFreshness {
        let s = max(0, now.timeIntervalSince(updated))
        if s < 60 { return .live }
        if s < 3600 { return .minutes(Int(s / 60)) }
        if s < 86400 { return .hours(Int(s / 3600)) }
        return .days(Int(s / 86400))
    }

    /// Cached data older than this is shown greyed with a "may be out of date" note.
    static let staleAfter: TimeInterval = 5 * 60
}

/// Decodes an array and skips elements that do not decode, so one odd row (a new
/// server field, a null where a string was expected) never blanks the whole screen.
struct LossyList<Element: Decodable>: Decodable {
    var items: [Element]

    init(_ items: [Element]) { self.items = items }

    private struct Skip: Decodable {}

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [Element] = []
        while !c.isAtEnd {
            if let e = try? c.decode(Element.self) { out.append(e) } else { _ = try? c.decode(Skip.self) }
        }
        items = out
    }
}

extension KeyedDecodingContainer {
    /// A list field that may be missing, null or hold odd rows.
    func lossy<E: Decodable>(_ key: Key) -> [E] {
        ((try? decodeIfPresent(LossyList<E>.self, forKey: key)) ?? nil)?.items ?? []
    }
}

/// Last good payload of a screen, kept on the watch so it opens with data when the
/// iPhone is away (offline state). Raw JSON + the time it arrived; never a token.
struct WatchCacheEntry: Codable, Equatable {
    var data: Data
    var savedAt: Date
}

enum WatchCache {
    static let prefix = "descall.cache."
    /// Paths whose replies may be cached (no admin data, nothing behind step-up).
    static func isCacheable(_ path: String) -> Bool {
        ["/api/watch/home", "/api/watch/friends", "/api/watch/servers", "/api/watch/calls", "/api/watch/activity"].contains(path)
    }
    static func key(_ path: String) -> String { prefix + path }

    static func save(_ data: Data, path: String, to defaults: UserDefaults = .standard, now: Date = Date()) {
        guard isCacheable(path), data.count <= 64 * 1024,
              let blob = try? JSONEncoder().encode(WatchCacheEntry(data: data, savedAt: now)) else { return }
        defaults.set(blob, forKey: key(path))
    }

    static func load(_ path: String, from defaults: UserDefaults = .standard) -> WatchCacheEntry? {
        guard let blob = defaults.data(forKey: key(path)) else { return nil }
        return try? JSONDecoder().decode(WatchCacheEntry.self, from: blob)
    }

    /// Signed out on the iPhone: forget everything (another person may sign in next).
    static func clear(_ defaults: UserDefaults = .standard) {
        for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(prefix) { defaults.removeObject(forKey: k) }
    }
}

/// "2:05" for a call length, "45 sn" style is in WatchStrings (language dependent).
enum WatchDuration {
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
    }
}
