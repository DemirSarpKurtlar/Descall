import Foundation

// DescallKit (4.2): shared by the app, its App Intents and every extension (widgets,
// Live Activity, share extension). Plain Foundation, no UIKit / Capacitor, so a file can
// be added to any target as is. Payloads come from /api/native/* and /api/watch/*
// (frontend/backend/lib/nativeGlance.js, lib/watchApi.js). Decoding is lenient: a
// missing or unknown field falls back instead of failing the whole response.

/// Live presence of a friend (invisible reads as offline, like everywhere else).
public enum DescallPresence: String, Codable, CaseIterable, Sendable {
    case online, idle, dnd, offline

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = DescallPresence(rawValue: raw) ?? .offline
    }

    public var isAvailable: Bool { self != .offline }
}

/// The user's own status choice (POST /api/watch/status).
public enum DescallStatusChoice: String, Codable, CaseIterable, Sendable {
    case online, idle, dnd, invisible

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = DescallStatusChoice(rawValue: raw) ?? .online
    }
}

extension KeyedDecodingContainer {
    func lenient<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(type, forKey: key)) ?? nil
    }
}

/// The line under a face (GET /api/native/*?activity=1, backend nativeGlance.shapeActivity).
/// kind: screen, voice, game, music, app, idle, dnd, custom, offline. Worded natively.
public struct DescallActivity: Codable, Hashable, Sendable {
    public let kind: String
    public let label: String?
    public let since: String?

    public init(kind: String, label: String? = nil, since: String? = nil) {
        self.kind = kind
        self.label = label
        self.since = since
    }

    enum CodingKeys: String, CodingKey { case kind, label, since }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(kind: c.lenient(String.self, .kind) ?? "", label: c.lenient(String.self, .label), since: c.lenient(String.self, .since))
    }

    /// Parsed `since` (ISO 8601, with or without fractional seconds).
    public var sinceDate: Date? { since.flatMap(DescallDates.parse) }
}

public enum DescallDates {
    public static func parse(_ raw: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: raw) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: raw)
    }
}

public struct DescallFriend: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let username: String?
    public let name: String
    public let initials: String
    public let avatarUrl: String?
    public let presence: DescallPresence
    public let customStatus: String?
    /// "dm:<id>", the conversation POST /api/watch/send takes.
    public let conv: String
    /// Only with ?activity=1 (widgets).
    public let activity: DescallActivity?

    public init(id: String, username: String?, name: String, initials: String? = nil, avatarUrl: String? = nil,
                presence: DescallPresence = .offline, customStatus: String? = nil, conv: String? = nil,
                activity: DescallActivity? = nil) {
        self.id = id
        self.username = username
        self.name = name
        self.initials = initials ?? DescallText.initials(of: name)
        self.avatarUrl = avatarUrl
        self.presence = presence
        self.customStatus = customStatus
        self.conv = conv ?? "dm:\(id)"
        self.activity = activity
    }

    enum CodingKeys: String, CodingKey { case id, username, name, initials, avatarUrl, presence, customStatus, conv, activity }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let id = try c.decode(String.self, forKey: .id)
        let username = c.lenient(String.self, .username)
        let name = c.lenient(String.self, .name) ?? username ?? "?"
        self.init(id: id, username: username, name: name, initials: c.lenient(String.self, .initials),
                  avatarUrl: c.lenient(String.self, .avatarUrl), presence: c.lenient(DescallPresence.self, .presence) ?? .offline,
                  customStatus: c.lenient(String.self, .customStatus), conv: c.lenient(String.self, .conv),
                  activity: c.lenient(DescallActivity.self, .activity))
    }
}

public struct DescallUnreadConversation: Codable, Hashable, Sendable {
    public let conv: String
    public let kind: String
    public let title: String
    public let count: Int
    public let serverId: String?
    // Widgets (?previews=1): the speech bubble. All optional, absent for Siri.
    public let preview: String?
    /// Sender name in a group / channel ("Kaan"), nil for a DM.
    public let by: String?
    /// The sender's face (DM friend, group member, channel author).
    public let peerId: String?
    public let username: String?
    public let avatarUrl: String?
    public let initials: String?
    public let at: String?
    /// A channel message that mentions the user (blue bubble edge).
    public let mention: Bool?

    public init(conv: String, kind: String, title: String, count: Int, serverId: String? = nil, preview: String? = nil,
                by: String? = nil, peerId: String? = nil, username: String? = nil, avatarUrl: String? = nil,
                initials: String? = nil, at: String? = nil, mention: Bool? = nil) {
        self.conv = conv
        self.kind = kind
        self.title = title
        self.count = count
        self.serverId = serverId
        self.preview = preview
        self.by = by
        self.peerId = peerId
        self.username = username
        self.avatarUrl = avatarUrl
        self.initials = initials
        self.at = at
        self.mention = mention
    }

    enum CodingKeys: String, CodingKey { case conv, kind, title, count, serverId, preview, by, peerId, username, avatarUrl, initials, at, mention }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(conv: try c.decode(String.self, forKey: .conv), kind: c.lenient(String.self, .kind) ?? "dm",
                  title: c.lenient(String.self, .title) ?? "", count: max(0, c.lenient(Int.self, .count) ?? 0),
                  serverId: c.lenient(String.self, .serverId), preview: c.lenient(String.self, .preview),
                  by: c.lenient(String.self, .by), peerId: c.lenient(String.self, .peerId), username: c.lenient(String.self, .username),
                  avatarUrl: c.lenient(String.self, .avatarUrl), initials: c.lenient(String.self, .initials),
                  at: c.lenient(String.self, .at), mention: c.lenient(Bool.self, .mention))
    }

    /// The id after "dm:" / "group:" / "channel:".
    public var targetId: String { conv.split(separator: ":", maxSplits: 1).last.map(String.init) ?? "" }

    /// descall:// link that opens this conversation.
    public var deepLink: URL? {
        switch kind {
        case "dm": return username.flatMap { DescallDeepLink.dm(username: $0) }
        case "group": return DescallDeepLink.group(targetId)
        case "channel": return serverId.flatMap { DescallDeepLink.server($0, channel: targetId) }
        default: return nil
        }
    }
}

public struct DescallUnread: Codable, Hashable, Sendable {
    public let total: Int
    public let dms: Int
    public let groups: Int
    public let channels: Int
    public let top: [DescallUnreadConversation]

    public static let empty = DescallUnread(total: 0, dms: 0, groups: 0, channels: 0, top: [])

    public init(total: Int, dms: Int, groups: Int, channels: Int, top: [DescallUnreadConversation]) {
        self.total = total
        self.dms = dms
        self.groups = groups
        self.channels = channels
        self.top = top
    }

    enum CodingKeys: String, CodingKey { case total, dms, groups, channels, top }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(total: max(0, c.lenient(Int.self, .total) ?? 0), dms: max(0, c.lenient(Int.self, .dms) ?? 0),
                  groups: max(0, c.lenient(Int.self, .groups) ?? 0), channels: max(0, c.lenient(Int.self, .channels) ?? 0),
                  top: c.lenient([DescallUnreadConversation].self, .top) ?? [])
    }
}

public struct DescallVoiceOccupant: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let initials: String?
    public let avatarUrl: String?
    /// Sharing the screen (widgets: the screen glyph on the face).
    public let screen: Bool?

    public init(id: String, name: String, initials: String? = nil, avatarUrl: String? = nil, screen: Bool? = nil) {
        self.id = id
        self.name = name
        self.initials = initials
        self.avatarUrl = avatarUrl
        self.screen = screen
    }
}

public struct DescallVoiceRoom: Codable, Hashable, Identifiable, Sendable {
    public let serverId: String
    public let serverName: String
    public let channelId: String
    public let channelName: String
    /// "voice" or "stage".
    public let type: String
    public let occupantCount: Int
    public let occupants: [DescallVoiceOccupant]
    /// When the room filled up (ISO 8601), for "Sessiz · 38 dk".
    public let since: String?

    public var id: String { channelId }

    public init(serverId: String, serverName: String, channelId: String, channelName: String, type: String = "voice",
                occupantCount: Int = 0, occupants: [DescallVoiceOccupant] = [], since: String? = nil) {
        self.serverId = serverId
        self.serverName = serverName
        self.channelId = channelId
        self.channelName = channelName
        self.type = type
        self.occupantCount = occupantCount
        self.occupants = occupants
        self.since = since
    }

    enum CodingKeys: String, CodingKey { case serverId, serverName, channelId, channelName, type, occupantCount, occupants, since }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let occupants = c.lenient([DescallVoiceOccupant].self, .occupants) ?? []
        self.init(serverId: try c.decode(String.self, forKey: .serverId), serverName: c.lenient(String.self, .serverName) ?? "",
                  channelId: try c.decode(String.self, forKey: .channelId), channelName: c.lenient(String.self, .channelName) ?? "",
                  type: c.lenient(String.self, .type) ?? "voice",
                  occupantCount: max(occupants.count, c.lenient(Int.self, .occupantCount) ?? 0), occupants: occupants,
                  since: c.lenient(String.self, .since))
    }
}

/// An "open" target: a server, one of its text channels, or a group.
public struct DescallDestination: Codable, Hashable, Identifiable, Sendable {
    /// "server:<id>", "channel:<id>" or "group:<id>".
    public let id: String
    public let kind: String
    public let title: String
    public let subtitle: String?
    public let serverId: String?
    public let channelId: String?
    public let groupId: String?

    /// descall:// link the app's deep link router (src/lib/deepLinks.js) opens.
    public var deepLink: URL? {
        switch kind {
        case "server":
            return serverId.flatMap { DescallDeepLink.server($0) }
        case "channel":
            guard let serverId, let channelId else { return nil }
            return DescallDeepLink.server(serverId, channel: channelId)
        case "group":
            return groupId.flatMap { DescallDeepLink.group($0) }
        default:
            return nil
        }
    }
}

public struct DescallMe: Codable, Hashable, Sendable {
    public let id: String?
    public let username: String?
    public let name: String
    public let initials: String?
    public let avatarUrl: String?
    public let status: DescallStatusChoice
}

public struct DescallFriendsGlance: Codable, Hashable, Sendable {
    public let onlineCount: Int
    public let offlineCount: Int
    public let online: [DescallFriend]
}

/// GET /api/native/summary: one call for a widget, a Siri answer or a Live Activity.
public struct DescallSummary: Codable, Hashable, Sendable {
    public let me: DescallMe
    public let unread: DescallUnread
    public let friends: DescallFriendsGlance
    public let voice: [DescallVoiceRoom]
    public let generatedAt: String?
}

public struct DescallFriendList: Codable, Sendable { public let friends: [DescallFriend] }
public struct DescallVoiceRoomList: Codable, Sendable { public let rooms: [DescallVoiceRoom] }
public struct DescallDestinationList: Codable, Sendable { public let destinations: [DescallDestination] }

public struct DescallSendResult: Codable, Sendable {
    public let ok: Bool
    public let messageId: String?
}

/// POST /api/native/wave ("El salla" from a widget).
public struct DescallWaveResult: Codable, Sendable {
    public let ok: Bool
    public let remainingToday: Int?
    public let remainingForFriend: Int?
}

public struct DescallStatusResult: Codable, Sendable {
    public let ok: Bool
    public let status: DescallStatusChoice?
}

/// descall:// links (same routes as src/lib/deepLinks.js; every id is percent-encoded).
public enum DescallDeepLink {
    static func make(_ segments: [String]) -> URL? {
        // ASCII only: CharacterSet.alphanumerics would keep "ş" and break URL(string:).
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
        let parts = segments.map { $0.addingPercentEncoding(withAllowedCharacters: allowed) ?? "" }
        guard !parts.contains(where: { $0.isEmpty }) else { return nil }
        return URL(string: "descall://" + parts.joined(separator: "/"))
    }

    public static func dm(username: String) -> URL? { make(["dm", username]) }
    public static func server(_ id: String, channel: String? = nil) -> URL? {
        channel.map { make(["server", id, $0]) } ?? make(["server", id])
    }
    public static func group(_ id: String) -> URL? { make(["group", id]) }
    public static let friends = URL(string: "descall://friends")!
    public static let home = URL(string: "descall://open")!
}

public enum DescallText {
    /// Same rule as the web letter avatar (src/lib/avatarFallback.js avatarInitials).
    public static func initials(of name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        let parts = trimmed.split(whereSeparator: { $0 == " " || $0 == "." || $0 == "_" || $0 == "-" })
            .map { String($0).filter { $0.isLetter || $0.isNumber } }
            .filter { !$0.isEmpty }
        guard let first = parts.first?.first else { return "?" }
        var out = String(first)
        if parts.count > 1, let second = parts[1].first { out.append(second) }
        return out.uppercased(with: Locale(identifier: "tr_TR"))
    }
}
