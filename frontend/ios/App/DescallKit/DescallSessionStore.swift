import Foundation
import Security

/// The signed-in session as the app's extensions see it. Written by the main app only
/// (DescallKeychainPlugin mirrors every token write / removal, DescallIntentsPlugin adds
/// the profile and the API origin); widgets, the Live Activity, the share extension and
/// App Intents read it.
public struct DescallSession: Codable, Equatable, Sendable {
    public var token: String
    public var userId: String?
    public var username: String?
    public var displayName: String?
    public var avatarUrl: String?
    /// Validated with DescallAPIBase on every read and write.
    public var apiBase: String
    /// UI language the web app uses ("tr", "en", "pt-BR"...), sent as Accept-Language.
    public var locale: String?
    public var updatedAt: Date

    public init(token: String, userId: String? = nil, username: String? = nil, displayName: String? = nil,
                avatarUrl: String? = nil, apiBase: String? = nil, locale: String? = nil, updatedAt: Date = Date()) {
        self.token = token
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.apiBase = DescallAPIBase.validated(apiBase)
        self.locale = locale
        self.updatedAt = updatedAt
    }

    public var isUsable: Bool { !token.isEmpty }
    public var visibleName: String { displayName ?? username ?? "" }
}

/// Keychain item in the shared access group `<TeamID>.com.descall.shared`
/// (keychain-access-groups in App.debug / App.release entitlements; an extension adds
/// the same entry to its own entitlements to read it). ThisDeviceOnly, after first
/// unlock: never in a backup, readable by a widget while the phone is locked.
/// Nothing here logs the token.
public enum DescallSessionStore {
    public static let sharedGroupSuffix = "com.descall.shared"
    /// Darwin notification posted after every change (extensions can observe it).
    public static let changedNotification = "com.descall.shared.session.changed"
    static let service = "com.descall.shared.session"
    static let account = "session.v1"
    static let probeService = "com.descall.shared.team-probe"
    /// Team Q9R78TPNXS: used only if the probe below cannot read the prefix.
    static let fallbackTeamPrefix = "Q9R78TPNXS."

    private static let lock = NSLock()
    private static var cachedPrefix: String?

    /// "<TeamID>.com.descall.shared".
    public static var accessGroup: String { teamPrefix() + sharedGroupSuffix }

    public static func load() -> DescallSession? {
        var query = baseQuery(group: nil)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data,
              var session = try? DescallJSON.decoder.decode(DescallSession.self, from: data), session.isUsable else { return nil }
        session.apiBase = DescallAPIBase.validated(session.apiBase)
        return session
    }

    /// Shared group first; an unsigned / simulator build without the entitlement keeps an
    /// app-only copy so the app's own intents still work.
    @discardableResult
    public static func save(_ session: DescallSession) -> Bool {
        guard session.isUsable else { return clear() }
        var copy = session
        copy.apiBase = DescallAPIBase.validated(session.apiBase)
        guard let data = try? DescallJSON.encoder.encode(copy) else { return false }
        if load() == copy { return true }
        let ok = write(data, group: accessGroup) || write(data, group: nil)
        if ok { postChanged() }
        return ok
    }

    /// Read-modify-write; nil when there is no session to change.
    @discardableResult
    public static func update(_ change: (inout DescallSession) -> Void) -> DescallSession? {
        guard var session = load() else { return nil }
        change(&session)
        session.updatedAt = Date()
        return save(session) ? session : nil
    }

    @discardableResult
    public static func clear() -> Bool {
        let status = SecItemDelete(baseQuery(group: nil) as CFDictionary)
        let ok = status == errSecSuccess || status == errSecItemNotFound
        if status == errSecSuccess { postChanged() }
        return ok
    }

    // MARK: Keychain

    static func baseQuery(group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    private static func write(_ data: Data, group: String?) -> Bool {
        var query = baseQuery(group: group)
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updated = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if updated == errSecSuccess { return true }
        if updated != errSecItemNotFound { return false }
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    /// "<TeamID>." read from a probe item's access group (every group of an app starts
    /// with its team id), so the same file works in every target without build settings.
    static func teamPrefix() -> String {
        lock.lock()
        defer { lock.unlock() }
        if let cached = cachedPrefix { return cached }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: probeService,
            kSecAttrAccount as String: "probe",
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        var status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            query.removeValue(forKey: kSecMatchLimit as String)
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            query[kSecValueData as String] = Data("probe".utf8)
            status = SecItemAdd(query as CFDictionary, &result)
        }
        var prefix = fallbackTeamPrefix
        if status == errSecSuccess, let attrs = result as? [String: Any],
           let group = attrs[kSecAttrAccessGroup as String] as? String,
           let dot = group.firstIndex(of: "."), dot != group.startIndex {
            prefix = String(group[...dot])
        }
        cachedPrefix = prefix
        return prefix
    }

    private static func postChanged() {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                                             CFNotificationName(changedNotification as CFString), nil, nil, true)
    }
}
