import Foundation

// Widgets draft B ("Yuzler"): pure rules shared by the app (DescallWidgetsPlugin, the Live
// Activity manager) and the widget extension (DescallWidgets). Foundation only, so the CI
// runner tests it with swiftc (frontend/ios/selftest/widgets/main.swift).

/// The four widget families the web layer reloads (src/lib/nativeWidgets.js WIDGET_KINDS)
/// and the WidgetKit kinds behind each.
public enum DescallWidgetKind: String, CaseIterable, Sendable {
    case friends, unread, voice, call

    public static let friendsKind = "DescallFriendsWidget"
    public static let personKind = "DescallPersonWidget"
    public static let unreadKind = "DescallUnreadWidget"
    public static let voiceKind = "DescallVoiceWidget"
    public static let callKind = "DescallCallWidget"

    public var widgetKinds: [String] {
        switch self {
        case .friends: return [Self.friendsKind, Self.personKind]
        case .unread: return [Self.unreadKind]
        case .voice: return [Self.voiceKind]
        case .call: return [Self.callKind]
        }
    }

    /// WidgetKit kind -> family name for getState ("installed").
    public static func family(ofKind kind: String) -> DescallWidgetKind? {
        allCases.first { $0.widgetKinds.contains(kind) }
    }
}

/// A favourite face as the shell keeps it (names and avatars without a request).
public struct DescallFavoritePerson: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let username: String?
    public let avatarUrl: String?
    public let initials: String

    public init(id: String, name: String, username: String? = nil, avatarUrl: String? = nil, initials: String? = nil) {
        self.id = id
        self.name = name
        self.username = username
        self.avatarUrl = avatarUrl.flatMap { $0.hasPrefix("https://") ? $0 : nil }
        self.initials = initials ?? DescallText.initials(of: name)
    }
}

public struct DescallWidgetPrefs: Codable, Hashable, Sendable {
    /// The activity line under each face.
    public var showActivity: Bool
    /// The hand button on the large friends widget.
    public var waveButton: Bool
    /// Message text in the unread bubbles (off: sender and count only).
    public var showPreview: Bool

    public static let standard = DescallWidgetPrefs(showActivity: true, waveButton: true, showPreview: true)

    public init(showActivity: Bool, waveButton: Bool, showPreview: Bool) {
        self.showActivity = showActivity
        self.waveButton = waveButton
        self.showPreview = showPreview
    }
}

/// What DescallWidgets.setFavorites stores in the App Group.
public struct DescallFavoritesRecord: Codable, Hashable, Sendable {
    public var ids: [String]
    public var people: [DescallFavoritePerson]
    public var prefs: DescallWidgetPrefs
    public var updatedAt: Date

    public static let empty = DescallFavoritesRecord(ids: [], people: [], prefs: .standard, updatedAt: .distantPast)

    public init(ids: [String], people: [DescallFavoritePerson], prefs: DescallWidgetPrefs, updatedAt: Date = Date()) {
        self.ids = DescallFavorites.normalize(ids)
        let allowed = Set(self.ids)
        var seen = Set<String>()
        self.people = people.filter { allowed.contains($0.id) && seen.insert($0.id).inserted }
        self.prefs = prefs
        self.updatedAt = updatedAt
    }

    public func person(_ id: String) -> DescallFavoritePerson? { people.first { $0.id == id } }
}

public enum DescallFavorites {
    public static let max = 8

    static func validId(_ id: String) -> Bool {
        (1...64).contains(id.count) && id.unicodeScalars.allSatisfy { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" }
    }

    /// Valid, unique, in order, at most `max`.
    public static func normalize(_ ids: [String]) -> [String] {
        var out: [String] = []
        for id in ids where validId(id) && !out.contains(id) {
            out.append(id)
            if out.count == max { break }
        }
        return out
    }

    /// The faces a friends widget shows: the widget's own choice, else the app's favourites,
    /// else the friends online (summary order). Friends no longer in `friends` drop out.
    public static func faces(configured: [String], favorites: [String], friends: [DescallFriend], limit: Int) -> [DescallFriend] {
        let byId = Dictionary(friends.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let order = !configured.isEmpty ? normalize(configured) : normalize(favorites)
        var out = order.compactMap { byId[$0] }
        if out.isEmpty {
            out = friends.filter { $0.presence != .offline }
        }
        return Array(out.prefix(Swift.max(0, limit)))
    }
}

/// How a widget words a face's activity line: a Localizable.strings key and its argument.
public struct DescallActivityLine: Equatable, Sendable {
    public let key: String
    public let argument: String?
    /// Minutes since, for "Boşta · 12 dk" (nil when unknown).
    public let minutes: Int?

    public static func make(_ activity: DescallActivity?, presence: DescallPresence, now: Date = Date()) -> DescallActivityLine? {
        let mins: (Date?) -> Int? = { d in d.map { Swift.max(0, Int(now.timeIntervalSince($0) / 60)) } }
        guard let a = activity, !a.kind.isEmpty else {
            switch presence {
            case .idle: return DescallActivityLine(key: "activity.idle", argument: nil, minutes: nil)
            case .dnd: return DescallActivityLine(key: "activity.dnd", argument: nil, minutes: nil)
            default: return nil
            }
        }
        let label = a.label.flatMap { $0.isEmpty ? nil : $0 }
        switch a.kind {
        case "screen": return DescallActivityLine(key: "activity.screen", argument: nil, minutes: nil)
        case "voice": return DescallActivityLine(key: label == nil ? "activity.voice" : "activity.voiceIn", argument: label, minutes: nil)
        case "game": return label.map { DescallActivityLine(key: "activity.game", argument: $0, minutes: nil) }
        case "music": return label.map { DescallActivityLine(key: "activity.music", argument: $0, minutes: nil) }
        case "app": return label.map { DescallActivityLine(key: "activity.app", argument: $0, minutes: nil) }
        case "idle": return DescallActivityLine(key: "activity.idle", argument: nil, minutes: mins(a.sinceDate))
        case "dnd": return DescallActivityLine(key: "activity.dnd", argument: nil, minutes: nil)
        case "custom": return label.map { DescallActivityLine(key: "activity.custom", argument: $0, minutes: nil) }
        case "offline": return DescallActivityLine(key: "activity.offline", argument: nil, minutes: mins(a.sinceDate))
        default: return nil
        }
    }
}

/// Short elapsed time: "2 dk", "1 sa", "3 g" (keys time.min / time.hour / time.day).
public enum DescallElapsed {
    public static func parts(from date: Date?, now: Date = Date()) -> (key: String, value: Int)? {
        guard let date else { return nil }
        let s = Swift.max(0, now.timeIntervalSince(date))
        if s < 60 { return ("time.now", 0) }
        if s < 3600 { return ("time.min", Int(s / 60)) }
        if s < 86400 { return ("time.hour", Int(s / 3600)) }
        return ("time.day", Int(s / 86400))
    }
}

/// When the widget asks for its next timeline. WidgetKit grants a widget roughly 40 to 70
/// reloads a day; the app also reloads on socket events while it runs (those do not count
/// while it is in the foreground), so the timelines only need to catch what happens while
/// the app is closed.
public enum DescallWidgetRefresh {
    public static func next(kind: DescallWidgetKind, now: Date = Date(), failures: Int = 0, signedOut: Bool = false,
                            callActive: Bool = false) -> Date {
        if signedOut { return now.addingTimeInterval(6 * 3600) }
        if failures > 0 {
            // 5, 10, 20, 40 min, then hourly: a dead network must not burn the budget.
            let backoff = Swift.min(3600.0, 300.0 * pow(2.0, Double(Swift.min(failures, 6) - 1)))
            return now.addingTimeInterval(backoff)
        }
        switch kind {
        case .call: return now.addingTimeInterval(callActive ? 15 * 60 : 60 * 60)
        case .voice: return now.addingTimeInterval(15 * 60)
        case .unread: return now.addingTimeInterval(20 * 60)
        case .friends: return now.addingTimeInterval(30 * 60)
        }
    }
}

/// A face in the call (Live Activity content, call widget). Avatars are files the app cached.
public struct DescallCallPerson: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let initials: String
    public let me: Bool
    public let screen: Bool
    public let speaking: Bool

    public init(id: String, name: String, initials: String? = nil, me: Bool = false, screen: Bool = false, speaking: Bool = false) {
        self.id = id
        self.name = name
        self.initials = initials ?? DescallText.initials(of: name)
        self.me = me
        self.screen = screen
        self.speaking = speaking
    }
}

/// The running call: ActivityKit content state and the call widget's App Group snapshot.
/// Small on purpose (ActivityKit caps a content state at 4 KB).
public struct DescallCallState: Codable, Hashable, Sendable {
    /// "dm", "group" or "server".
    public var kind: String
    public var title: String
    public var subtitle: String
    public var startedAt: Date
    public var muted: Bool
    public var deafened: Bool
    public var speaker: DescallCallPerson?
    public var participants: [DescallCallPerson]
    public var participantCount: Int
    /// descall:// link that opens the call (voice channel, group, DM).
    public var link: String?
    /// Voice channel id (server calls): the voice widget marks "Buradasın".
    public var channelId: String?

    public static let maxFaces = 6

    public init(kind: String, title: String, subtitle: String = "", startedAt: Date, muted: Bool = false, deafened: Bool = false,
                speaker: DescallCallPerson? = nil, participants: [DescallCallPerson] = [], participantCount: Int = 0,
                link: String? = nil, channelId: String? = nil) {
        self.kind = ["dm", "group", "server"].contains(kind) ? kind : "server"
        self.title = String(title.prefix(80))
        self.subtitle = String(subtitle.prefix(60))
        self.startedAt = startedAt
        self.muted = muted
        self.deafened = deafened
        self.speaker = speaker
        self.participants = Array(participants.prefix(Self.maxFaces))
        self.participantCount = Swift.max(participantCount, self.participants.count)
        self.link = link
        self.channelId = channelId
    }

    /// From the JS payload (src/lib/nativeWidgets.js callActivityPayload); nil = no call.
    public static func from(payload: [String: Any]) -> DescallCallState? {
        guard (payload["active"] as? Bool) == true else { return nil }
        func s(_ v: Any?, _ max: Int = 80) -> String { (v as? String).map { String($0.prefix(max)) } ?? "" }
        func person(_ raw: Any?) -> DescallCallPerson? {
            guard let d = raw as? [String: Any], let id = d["id"] as? String, DescallFavorites.validId(id) else { return nil }
            let name = s(d["name"], 60)
            return DescallCallPerson(id: id, name: name.isEmpty ? "?" : name, initials: (d["initials"] as? String).map { String($0.prefix(3)) },
                                     me: (d["me"] as? Bool) ?? false, screen: (d["screen"] as? Bool) ?? false,
                                     speaking: (d["speaking"] as? Bool) ?? false)
        }
        let started: Date = {
            if let ms = payload["startedAt"] as? Double, ms > 0 { return Date(timeIntervalSince1970: ms / 1000) }
            if let ms = payload["startedAt"] as? Int, ms > 0 { return Date(timeIntervalSince1970: Double(ms) / 1000) }
            return Date()
        }()
        let link = payload["link"] as? [String: Any] ?? [:]
        let serverId = s(link["serverId"], 64)
        let channelId = s(link["channelId"], 64)
        let groupId = s(link["groupId"], 64)
        let username = s(link["username"], 64)
        var url: URL?
        if !serverId.isEmpty && !channelId.isEmpty {
            url = DescallDeepLink.server(serverId, channel: channelId)
        } else if !groupId.isEmpty {
            url = DescallDeepLink.group(groupId)
        } else if !username.isEmpty {
            url = DescallDeepLink.dm(username: username)
        }
        let people = (payload["participants"] as? [Any] ?? []).compactMap(person)
        return DescallCallState(kind: s(payload["kind"], 8), title: s(payload["title"]), subtitle: s(payload["subtitle"], 60),
                                startedAt: started, muted: (payload["muted"] as? Bool) ?? false,
                                deafened: (payload["deafened"] as? Bool) ?? false, speaker: person(payload["speaker"]),
                                participants: people, participantCount: (payload["participantCount"] as? Int) ?? people.count,
                                link: url?.absoluteString, channelId: channelId.isEmpty ? nil : channelId)
    }

    /// Only the speaker (and with it the strip of faces) changed: the manager spaces those out.
    public func differsOnlyBySpeaker(from other: DescallCallState) -> Bool {
        var a = self
        var b = other
        a.speaker = nil
        b.speaker = nil
        // The strip of faces follows the speaker (speaker first, at most six).
        a.participants = []
        b.participants = []
        return a == b && self != other
    }
}

/// Stable colours for a face without a photo (same id, same gradient on every surface).
public enum DescallAvatarPalette {
    /// Gradient pairs (top-left, bottom-right) as 0xRRGGBB, from the draft's people.
    public static let pairs: [(UInt32, UInt32)] = [
        (0xFF8FB1, 0xB05CFF), (0x5AC8FA, 0x3B5BFF), (0xC6A7FF, 0x6A4CFF), (0xFFA27A, 0xE0435F),
        (0x7EE3D2, 0x1F8F86), (0xFFD36E, 0xF2803A), (0xFFB7D5, 0xD9468B), (0x9BE77C, 0x2E9B52),
        (0xB8C4FF, 0x5D6BD6), (0x7C93FF, 0x4A68E0),
    ]

    /// FNV-1a over the id's UTF-8 bytes.
    public static func index(for id: String) -> Int {
        var hash: UInt32 = 2_166_136_261
        for byte in id.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* 16_777_619
        }
        return Int(hash % UInt32(pairs.count))
    }
}

/// File name for a cached avatar: the user id, "_" (never in an id) and a hash of the URL
/// (a new photo is a new file).
public enum DescallAvatarKey {
    public static func fileName(id: String, url: String) -> String? {
        guard DescallFavorites.validId(id), url.hasPrefix("https://") else { return nil }
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in url.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return "\(id)_\(String(hash, radix: 16)).png"
    }
}

/// The result of a wave from the widget, shown on the face for a short while.
public enum DescallWaveMark: String, Codable, Sendable {
    case sent, limit, failed

    public static let visibleFor: TimeInterval = 90

    public static func from(error: DescallAPIError) -> DescallWaveMark {
        error == .rateLimited ? .limit : .failed
    }
}
