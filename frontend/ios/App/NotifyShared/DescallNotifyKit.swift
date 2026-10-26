import Foundation
import Security
import UIKit

/// 3.0.0 (A4): storage and network helpers shared by the app and both
/// notification extensions (App Group `group.com.descall.app`).

// MARK: - Scoped action token (Keychain, shared access group)

struct DescallNotifyCredentials: Codable, Equatable {
    let token: String
    let userId: String
    let apiBase: String
    let expiresAt: Double
}

enum DescallNotifyTokenStore {
    private static let account = "notify-actions"

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: DescallNotify.keychainService,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: DescallNotify.appGroup,
        ]
    }

    /// Never logs the token. Returns false when the Keychain refused it.
    @discardableResult
    static func save(_ credentials: DescallNotifyCredentials) -> Bool {
        guard DescallNotify.isAllowedApiBase(credentials.apiBase),
              let data = try? JSONEncoder().encode(credentials) else { return false }
        SecItemDelete(baseQuery() as CFDictionary)
        var add = baseQuery()
        add[kSecValueData as String] = data
        // The service extension runs while the phone is locked.
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func load(now: Date = Date()) -> DescallNotifyCredentials? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let credentials = try? JSONDecoder().decode(DescallNotifyCredentials.self, from: data),
              credentials.expiresAt > now.timeIntervalSince1970,
              DescallNotify.isAllowedApiBase(credentials.apiBase) else { return nil }
        return credentials
    }

    static func clear() {
        SecItemDelete(baseQuery() as CFDictionary)
    }
}

// MARK: - Shared defaults (mute, this device)

enum DescallNotifyDefaults {
    static var shared: UserDefaults? { UserDefaults(suiteName: DescallNotify.appGroup) }

    static func muteUntil(_ conversation: String) -> Double? {
        shared?.object(forKey: DescallNotifyMute.key(conversation)) as? Double
    }

    static func isMuted(_ conversation: String) -> Bool {
        DescallNotifyMute.isMuted(conversation, until: muteUntil(conversation))
    }

    static func muteForAnHour(_ conversation: String) {
        guard let defaults = shared else { return }
        var entries: [String: Double] = [:]
        for (key, value) in defaults.dictionaryRepresentation() {
            if let until = value as? Double { entries[key] = until }
        }
        for key in DescallNotifyMute.expiredKeys(entries) { defaults.removeObject(forKey: key) }
        defaults.set(DescallNotifyMute.expiry(), forKey: DescallNotifyMute.key(conversation))
    }
}

// MARK: - API (POST /api/messages/quick-*)

enum DescallNotifyAPIError: Error {
    case signedOut
    case server(Int, String)
    case network
}

final class DescallNotifyAPI {
    private let credentials: DescallNotifyCredentials
    private let session: URLSession

    init?(credentials: DescallNotifyCredentials? = DescallNotifyTokenStore.load()) {
        guard let credentials else { return nil }
        self.credentials = credentials
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 20
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    private func url(_ path: String, query: [URLQueryItem] = []) -> URL? {
        var base = credentials.apiBase
        while base.hasSuffix("/") { base.removeLast() }
        guard var parts = URLComponents(string: base + path) else { return nil }
        if !query.isEmpty { parts.queryItems = query }
        return parts.url
    }

    private func send(_ request: URLRequest, completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        var request = request
        request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        session.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            let result: Result<[String: Any], DescallNotifyAPIError>
            if error != nil || status == 0 {
                result = .failure(.network)
            } else if status == 401 {
                result = .failure(.signedOut)
            } else if (200..<300).contains(status), json["ok"] as? Bool != false {
                result = .success(json)
            } else {
                result = .failure(.server(status, json["error"] as? String ?? ""))
            }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    private func post(_ path: String, _ body: [String: Any], completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        guard let url = url(path), let data = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(.network))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        send(request, completion: completion)
    }

    func reply(conversation: String, text: String, completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        post("/api/messages/quick-reply", ["conv": conversation, "text": text], completion: completion)
    }

    func react(conversation: String, messageId: String, emoji: String, completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        post("/api/messages/quick-react", ["conv": conversation, "messageId": messageId, "emoji": emoji], completion: completion)
    }

    func markRead(conversation: String, completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        post("/api/messages/quick-read", ["conv": conversation], completion: completion)
    }

    func thread(conversation: String, messageId: String?, completion: @escaping (Result<[String: Any], DescallNotifyAPIError>) -> Void) {
        var query = [URLQueryItem(name: "conv", value: conversation)]
        if let messageId { query.append(URLQueryItem(name: "messageId", value: messageId)) }
        guard let url = url("/api/messages/notify-thread", query: query) else {
            completion(.failure(.network))
            return
        }
        send(URLRequest(url: url), completion: completion)
    }
}

// MARK: - Avatars (cached in the App Group)

enum DescallNotifyImages {
    static let maxAvatarBytes = 2 * 1024 * 1024

    static var cacheDirectory: URL? {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: DescallNotify.appGroup) else { return nil }
        let dir = root.appendingPathComponent("Library/Caches/NotifyAvatars", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func cachedAvatar(_ url: URL) -> Data? {
        guard let file = cacheDirectory?.appendingPathComponent(DescallNotifyAvatar.cacheName(for: url)),
              let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
              let modified = attrs[.modificationDate] as? Date,
              Date().timeIntervalSince(modified) < DescallNotifyAvatar.cacheMaxAge else { return nil }
        return try? Data(contentsOf: file)
    }

    static func storeAvatar(_ data: Data, for url: URL) {
        guard let dir = cacheDirectory else { return }
        try? data.write(to: dir.appendingPathComponent(DescallNotifyAvatar.cacheName(for: url)), options: .atomic)
        prune(dir)
    }

    /// Cached copy, or download (≤ 2 MB, must decode as an image).
    static func avatar(_ url: URL?, completion: @escaping (Data?) -> Void) {
        guard let url else { completion(nil); return }
        if let cached = cachedAvatar(url) { completion(cached); return }
        var request = URLRequest(url: url)
        request.timeoutInterval = DescallNotify.downloadTimeout
        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let data, (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false,
                  data.count <= DescallNotifyImages.maxAvatarBytes, UIImage(data: data) != nil else {
                completion(nil)
                return
            }
            DescallNotifyImages.storeAvatar(data, for: url)
            completion(data)
        }.resume()
    }

    private static func prune(_ dir: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]),
              files.count > DescallNotifyAvatar.cacheMaxFiles else { return }
        let dated = files.map { url -> (URL, Date) in
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return (url, date)
        }.sorted { $0.1 < $1.1 }
        for (url, _) in dated.prefix(files.count - DescallNotifyAvatar.cacheMaxFiles) { try? fm.removeItem(at: url) }
    }

    static func color(_ seed: String) -> UIColor {
        let c = DescallNotifyAvatar.palette[DescallNotifyAvatar.colorIndex(seed)]
        return UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1)
    }

    /// Round letter avatar (app fallback colours, e.g. "M" on teal) when the sender has no photo.
    static func letterAvatar(name: String, seed: String, side: CGFloat = 120) -> UIImage {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            color(seed.isEmpty ? name : seed).setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
            let text = DescallNotifyAvatar.initial(name) as NSString
            let font = UIFont.systemFont(ofSize: side * (text.length > 1 ? 0.38 : 0.44), weight: .semibold)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            let box = text.size(withAttributes: attrs)
            text.draw(at: CGPoint(x: (side - box.width) / 2, y: (side - box.height) / 2), withAttributes: attrs)
        }
    }
}
