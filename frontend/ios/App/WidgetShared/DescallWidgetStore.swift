import Foundation
import ImageIO
import CoreGraphics
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

// Widgets draft B: what the app and the widget extension share through the App Group
// (group.com.descall.app): the favourite faces and preferences (DescallWidgets.setFavorites),
// the running call (call widget, Live Activity) and the result of a wave. The session itself
// stays in the shared Keychain (DescallSessionStore); nothing here is a secret.

public enum DescallWidgetStore {
    public static let appGroup = "group.com.descall.app"
    static let favoritesKey = "widgets.favorites.v1"
    static let callKey = "widgets.call.v1"
    static let wavesKey = "widgets.waves.v1"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    // MARK: Favourites

    public static func favorites() -> DescallFavoritesRecord {
        guard let data = defaults?.data(forKey: favoritesKey),
              let record = try? JSONDecoder().decode(DescallFavoritesRecord.self, from: data) else { return .empty }
        return record
    }

    @discardableResult
    public static func saveFavorites(_ record: DescallFavoritesRecord) -> Bool {
        guard let data = try? JSONEncoder().encode(record) else { return false }
        defaults?.set(data, forKey: favoritesKey)
        return true
    }

    // MARK: Running call

    struct CallRecord: Codable {
        var state: DescallCallState
        var updatedAt: Date
    }

    /// The call the app reported last, or nil. A record the app stopped refreshing (it was
    /// killed mid-call) expires after `staleAfter` so the widget never shows a call forever.
    public static func call(now: Date = Date(), staleAfter: TimeInterval = 15 * 60) -> DescallCallState? {
        guard let data = defaults?.data(forKey: callKey),
              let record = try? JSONDecoder().decode(CallRecord.self, from: data),
              now.timeIntervalSince(record.updatedAt) < staleAfter else { return nil }
        return record.state
    }

    public static func saveCall(_ state: DescallCallState?) {
        guard let state else {
            defaults?.removeObject(forKey: callKey)
            return
        }
        if let data = try? JSONEncoder().encode(CallRecord(state: state, updatedAt: Date())) {
            defaults?.set(data, forKey: callKey)
        }
    }

    // MARK: Waves sent from the widget (the face shows a check or "limit" for a while)

    struct WaveRecord: Codable {
        var mark: DescallWaveMark
        var at: Date
    }

    public static func recordWave(_ mark: DescallWaveMark, for friendId: String, now: Date = Date()) {
        var all = waveRecords()
        all = all.filter { now.timeIntervalSince($0.value.at) < DescallWaveMark.visibleFor }
        all[friendId] = WaveRecord(mark: mark, at: now)
        if let data = try? JSONEncoder().encode(all) { defaults?.set(data, forKey: wavesKey) }
    }

    public static func waveMark(for friendId: String, now: Date = Date()) -> DescallWaveMark? {
        guard let r = waveRecords()[friendId], now.timeIntervalSince(r.at) < DescallWaveMark.visibleFor else { return nil }
        return r.mark
    }

    static func waveRecords() -> [String: WaveRecord] {
        guard let data = defaults?.data(forKey: wavesKey),
              let all = try? JSONDecoder().decode([String: WaveRecord].self, from: data) else { return [:] }
        return all
    }

    /// Sign-out: nothing of this account stays on the device.
    public static func clear() {
        for key in [favoritesKey, callKey, wavesKey] { defaults?.removeObject(forKey: key) }
        DescallAvatarCache.shared.clear()
        DescallAvatarCache.appGroupShared.clear()
    }
}

/// Small, downscaled avatars on disk. The widget extension keeps its own copy in its own
/// Caches folder (`shared`); the app writes the faces of the running call into the App Group
/// (`appGroupShared`) because the Live Activity cannot download anything while it renders.
public final class DescallAvatarCache: @unchecked Sendable {
    public static let shared = DescallAvatarCache(directory: DescallAvatarCache.ownDirectory())
    public static let appGroupShared = DescallAvatarCache(directory: DescallAvatarCache.groupDirectory())

    /// Longest side in pixels (a 56 pt face at 3x is 168 px).
    public static let pixelSize = 168
    static let maxBytes = 3 * 1024 * 1024
    static let maxFiles = 240
    static let maxAge: TimeInterval = 14 * 24 * 3600

    let directory: URL?
    private let lock = NSLock()

    init(directory: URL?) {
        self.directory = directory
        if let directory { try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
    }

    static func ownDirectory() -> URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("DescallAvatars", isDirectory: true)
    }

    static func groupDirectory() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: DescallWidgetStore.appGroup)?
            .appendingPathComponent("Library/Caches/DescallAvatars", isDirectory: true)
    }

    func fileURL(id: String, url: String) -> URL? {
        guard let directory, let name = DescallAvatarKey.fileName(id: id, url: url) else { return nil }
        return directory.appendingPathComponent(name)
    }

    /// The newest cached file for this user (any URL), for a face whose URL is not known here
    /// (Live Activity participants carry ids only).
    public func latestFile(forId id: String) -> URL? {
        guard let directory, DescallFavorites.validId(id),
              let names = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return nil }
        let mine = names.filter { $0.lastPathComponent.hasPrefix(id + "_") }
        return mine.max { a, b in
            let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return da < db
        }
    }

    public func cachedImage(id: String, url: String?) -> CGImage? {
        let file = url.flatMap { fileURL(id: id, url: $0) }
        if let file, let img = Self.load(file) { return img }
        return latestFile(forId: id).flatMap(Self.load)
    }

    static func load(_ file: URL) -> CGImage? {
        guard let src = CGImageSourceCreateWithURL(file as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(src, 0, nil)
    }

    /// Cached image, or download, downscale and cache it. nil on any failure (the face then
    /// shows its initials). Never throws, never blocks longer than the session timeouts.
    public func image(id: String, url: String?, session: URLSession = DescallAvatarCache.urlSession) async -> CGImage? {
        guard let url, let remote = URL(string: url), remote.scheme == "https", let file = fileURL(id: id, url: url) else {
            return cachedImage(id: id, url: nil)
        }
        if let img = Self.load(file) { return img }
        do {
            let (data, response) = try await session.data(from: remote)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), data.count <= Self.maxBytes,
                  let thumb = Self.thumbnail(data) else { return cachedImage(id: id, url: nil) }
            write(thumb, to: file, id: id)
            return thumb
        } catch {
            return cachedImage(id: id, url: nil)
        }
    }

    public static let urlSession: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 6
        c.timeoutIntervalForResource = 10
        c.httpCookieStorage = nil
        c.urlCache = nil
        return URLSession(configuration: c)
    }()

    static func thumbnail(_ data: Data) -> CGImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: pixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }

    private func write(_ image: CGImage, to file: URL, id: String) {
        lock.lock()
        defer { lock.unlock() }
        let type: CFString
        #if canImport(UniformTypeIdentifiers)
        type = UTType.png.identifier as CFString
        #else
        type = "public.png" as CFString
        #endif
        guard let dest = CGImageDestinationCreateWithURL(file as CFURL, type, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        _ = CGImageDestinationFinalize(dest)
        // An older photo of the same user is replaced by the new one.
        if let directory, let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) {
            for name in names where name != file.lastPathComponent && name.hasPrefix(id + "_") {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
            }
        }
        prune()
    }

    /// Oldest files beyond maxFiles, and anything older than maxAge.
    func prune(now: Date = Date()) {
        guard let directory,
              let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let dated = files.map { f -> (URL, Date) in
            (f, (try? f.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }.sorted { $0.1 > $1.1 }
        for (i, item) in dated.enumerated() where i >= Self.maxFiles || now.timeIntervalSince(item.1) > Self.maxAge {
            try? FileManager.default.removeItem(at: item.0)
        }
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        guard let directory else { return }
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
