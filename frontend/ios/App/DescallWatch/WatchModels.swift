import Foundation

/// Payloads of /api/watch/* (backend lib/watchApi.js). Flat and small on purpose.

struct WatchHome: Decodable {
    var me: WatchMe
    var conversations: [WatchConversation]
    var adminSections: [String]?

    enum CodingKeys: String, CodingKey { case me, conversations, adminSections }
    init(me: WatchMe, conversations: [WatchConversation], adminSections: [String]?) {
        self.me = me; self.conversations = conversations; self.adminSections = adminSections
    }
    // 3.7.33: one odd conversation row no longer fails the whole home screen.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        me = try c.decode(WatchMe.self, forKey: .me)
        conversations = c.lossy(.conversations)
        adminSections = (try? c.decodeIfPresent([String].self, forKey: .adminSections)) ?? nil
    }
}

struct WatchMe: Decodable {
    var id: String?
    var name: String
    var username: String?
    var initials: String
    var avatarUrl: String?
    var status: String

    enum CodingKeys: String, CodingKey { case id, name, username, initials, avatarUrl, status }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? "?"
        username = try? c.decodeIfPresent(String.self, forKey: .username)
        initials = (try? c.decodeIfPresent(String.self, forKey: .initials)) ?? "?"
        avatarUrl = try? c.decodeIfPresent(String.self, forKey: .avatarUrl)
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "online"
    }
}

struct WatchConversation: Decodable, Identifiable, Hashable {
    var conv: String
    var kind: String
    var title: String
    var initials: String
    var avatarUrl: String?
    var presence: String?
    var preview: String
    var at: String?
    var id: String { conv }
}

struct WatchThread: Decodable {
    var conv: String?
    var title: String
    var subtitle: String
    var messages: [WatchMessage]

    enum CodingKeys: String, CodingKey { case conv, title, subtitle, messages }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conv = try? c.decodeIfPresent(String.self, forKey: .conv)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        subtitle = (try? c.decodeIfPresent(String.self, forKey: .subtitle)) ?? ""
        messages = c.lossy(.messages)
    }
}

struct WatchMessage: Decodable, Identifiable, Hashable {
    var id: String
    var mine: Bool
    var author: String
    var text: String
    var kind: String
    var at: String?
}

struct WatchFriends: Decodable {
    var online: [WatchFriend]
    var onlineCount: Int
    var offlineCount: Int

    enum CodingKeys: String, CodingKey { case online, onlineCount, offlineCount }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        online = c.lossy(.online)
        onlineCount = (try? c.decodeIfPresent(Int.self, forKey: .onlineCount)) ?? online.count
        offlineCount = (try? c.decodeIfPresent(Int.self, forKey: .offlineCount)) ?? 0
    }
}

struct WatchFriend: Decodable, Identifiable, Hashable {
    var id: String
    var conv: String
    var name: String
    var initials: String
    var avatarUrl: String?
    var presence: String
    var customStatus: String?
}

// 3.7.33: the rest of the iOS tab bar (backend routes/watch.js /servers, /calls, /activity).

struct WatchServers: Decodable {
    var servers: [WatchServer]
    enum CodingKeys: String, CodingKey { case servers }
    init(from decoder: Decoder) throws {
        servers = try decoder.container(keyedBy: CodingKeys.self).lossy(.servers)
    }
}

struct WatchServer: Decodable, Identifiable, Hashable {
    var id: String
    var name: String
    var initials: String
    var iconUrl: String?
    var memberCount: Int?
    var muted: Bool?
    var timedOut: Bool?
    var channels: [WatchChannel]

    enum CodingKeys: String, CodingKey { case id, name, initials, iconUrl, memberCount, muted, timedOut, channels }
    init(id: String, name: String, initials: String, iconUrl: String?, memberCount: Int?, muted: Bool?, timedOut: Bool?, channels: [WatchChannel]) {
        self.id = id; self.name = name; self.initials = initials; self.iconUrl = iconUrl
        self.memberCount = memberCount; self.muted = muted; self.timedOut = timedOut; self.channels = channels
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? "?"
        initials = (try? c.decodeIfPresent(String.self, forKey: .initials)) ?? "?"
        iconUrl = try? c.decodeIfPresent(String.self, forKey: .iconUrl)
        memberCount = try? c.decodeIfPresent(Int.self, forKey: .memberCount)
        muted = try? c.decodeIfPresent(Bool.self, forKey: .muted)
        timedOut = try? c.decodeIfPresent(Bool.self, forKey: .timedOut)
        channels = c.lossy(.channels)
    }
}

struct WatchChannel: Decodable, Identifiable, Hashable {
    var conv: String
    var name: String
    var category: String?
    var id: String { conv }
}

struct WatchCalls: Decodable {
    var calls: [WatchCall]
    enum CodingKeys: String, CodingKey { case calls }
    init(from decoder: Decoder) throws {
        calls = try decoder.container(keyedBy: CodingKeys.self).lossy(.calls)
    }
}

struct WatchCall: Decodable, Identifiable, Hashable {
    var id: String
    var kind: String
    var title: String
    var initials: String
    var avatarUrl: String?
    var conv: String?
    var direction: String
    var video: Bool
    var missed: Bool
    var active: Bool?
    var durationSec: Int?
    var at: String?
}

struct WatchActivity: Decodable {
    var items: [WatchActivityItem]
    var requestCount: Int
    var missedCount: Int
    enum CodingKeys: String, CodingKey { case items, requestCount, missedCount }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = c.lossy(.items)
        requestCount = (try? c.decodeIfPresent(Int.self, forKey: .requestCount)) ?? 0
        missedCount = (try? c.decodeIfPresent(Int.self, forKey: .missedCount)) ?? 0
    }
}

struct WatchActivityItem: Decodable, Identifiable, Hashable {
    var id: String
    var type: String
    var title: String
    var initials: String
    var avatarUrl: String?
    var conv: String?
    var at: String?
}

/// Where a tap on a chat or a friend leads.
struct ChatRoute: Hashable {
    var conv: String
    var title: String
}

enum WatchTime {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()
    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = L.locale
        f.setLocalizedDateFormatFromTemplate("d MMM")
        return f
    }()

    static func date(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        return iso.date(from: value) ?? isoPlain.date(from: value)
    }

    /// "10:07" today, otherwise "31 Eki".
    static func short(_ value: String?) -> String {
        guard let d = date(value) else { return "" }
        return Calendar.current.isDateInToday(d) ? clock.string(from: d) : day.string(from: d)
    }
}
