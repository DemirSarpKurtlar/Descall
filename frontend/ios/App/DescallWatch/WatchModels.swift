import Foundation

/// Payloads of /api/watch/* (backend lib/watchApi.js). Flat and small on purpose.

struct WatchHome: Decodable {
    var me: WatchMe
    var conversations: [WatchConversation]
    var adminSections: [String]?
}

struct WatchMe: Decodable {
    var id: String?
    var name: String
    var initials: String
    var avatarUrl: String?
    var status: String
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
