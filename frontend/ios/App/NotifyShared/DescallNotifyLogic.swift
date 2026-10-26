import Foundation

/// 3.0.0 (A4): pure rules shared by the app, the Notification Service
/// Extension and the Notification Content Extension. Foundation only, so the
/// selftest (selftest/notify_main.swift) runs with plain `swiftc`.
enum DescallNotify {
    static let appGroup = "group.com.descall.app"
    static let messageCategory = "MESSAGE"
    static let callCategory = "INCOMING_CALL"
    /// Same order as the chat's quick reactions (heart, laugh, like, wow, sad).
    static let quickReactions = ["❤️", "😂", "👍", "😮", "😢"]
    static let maxAttachmentBytes = 10 * 1024 * 1024
    static let downloadTimeout: TimeInterval = 8
    static let muteDuration: TimeInterval = 60 * 60
    static let keychainService = "com.descall.notify-actions"
    static let maxReplyLength = 2000

    enum Action {
        static let read = "read"
        static let mute = "mute_1h"
        static let open = "open"
    }

    /// Hosts the scoped token may be sent to. Anything else is refused.
    static func isAllowedApiBase(_ raw: String) -> Bool {
        guard let url = URL(string: raw), url.scheme == "https", let host = url.host?.lowercased(),
              url.user == nil, url.password == nil, url.query == nil else { return false }
        let path = url.path
        guard path.isEmpty || path == "/" else { return false }
        if host == "des-call.onrender.com" { return true }
        return host == "descall.com" || host.hasSuffix(".descall.com")
    }
}

// MARK: - Language

enum DescallNotifyLang: String {
    case tr, en

    static func current(_ preferred: [String] = Locale.preferredLanguages) -> DescallNotifyLang {
        guard let first = preferred.first?.lowercased() else { return .tr }
        return first.hasPrefix("tr") ? .tr : .en
    }
}

struct DescallNotifyStrings {
    let lang: DescallNotifyLang

    var markRead: String { lang == .tr ? "Okundu olarak işaretle" : "Mark as read" }
    var mute: String { lang == .tr ? "1 saat sessize al" : "Mute for 1 hour" }
    var openChat: String { lang == .tr ? "Sohbeti aç" : "Open chat" }
    var hiddenPreview: String { lang == .tr ? "Yeni mesaj" : "New message" }
    /// UNNotificationCategory.categorySummaryFormat ("+2 mesaj daha").
    var summaryFormat: String { lang == .tr ? "+%u mesaj daha" : "+%u more messages" }
    var now: String { lang == .tr ? "şimdi" : "now" }
    var sendFailed: String { lang == .tr ? "Gönderilemedi. Uygulamayı açıp tekrar dene." : "Couldn't send. Open the app and try again." }
    var signedOut: String { lang == .tr ? "Yanıtlamak için uygulamayı aç." : "Open the app to reply." }
    var group: String { lang == .tr ? "Grup" : "Group" }

    func kindLabel(_ kind: String) -> String? {
        switch kind {
        case "image": return lang == .tr ? "📷 Fotoğraf" : "📷 Photo"
        case "video": return "🎬 Video"
        case "voice": return lang == .tr ? "🎤 Sesli mesaj" : "🎤 Voice message"
        case "file": return lang == .tr ? "📎 Dosya" : "📎 File"
        case "poll": return lang == .tr ? "📊 Anket" : "📊 Poll"
        default: return nil
        }
    }

    func members(_ count: Int) -> String {
        lang == .tr ? "\(count) üye" : (count == 1 ? "1 member" : "\(count) members")
    }

    /// "şimdi", "2 dk", "3 sa", then "dün"/a date-less fallback.
    func relative(seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        if s < 60 { return now }
        if s < 3600 { return lang == .tr ? "\(s / 60) dk" : "\(s / 60)m" }
        if s < 86_400 { return lang == .tr ? "\(s / 3600) sa" : "\(s / 3600)h" }
        return lang == .tr ? "\(s / 86_400) g" : "\(s / 86_400)d"
    }

    /// Reply field placeholder: "Hafta Sonu Ekibi'ne yanıt yaz...", "Mert'e yanıt yaz...".
    func replyPlaceholder(to name: String) -> String {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return lang == .tr ? "Yanıt yaz..." : "Write a reply..." }
        if lang == .en { return "Reply to \(clean)..." }
        guard let suffix = TurkishSuffix.dative(clean) else { return "\(clean) · yanıt yaz..." }
        return "\(clean)'\(suffix) yanıt yaz..."
    }
}

/// Dative case suffix for a proper name ("Mert'e", "Ayşe'ye", "Oyun Gecesi'ne").
enum TurkishSuffix {
    private static let frontVowels: Set<Character> = ["e", "i", "ö", "ü"]
    private static let backVowels: Set<Character> = ["a", "ı", "o", "u"]
    private static let closeVowels: Set<Character> = ["i", "ı", "u", "ü"]

    static func dative(_ name: String) -> String? {
        let lower = name.lowercased(with: Locale(identifier: "tr_TR"))
        guard let last = lower.last, last.isLetter else { return nil }
        guard let vowel = lower.last(where: { frontVowels.contains($0) || backVowels.contains($0) }) else { return nil }
        let front = frontVowels.contains(vowel)
        let endsWithVowel = frontVowels.contains(last) || backVowels.contains(last)
        if !endsWithVowel { return front ? "e" : "a" }
        // Multi-word names ending in a close vowel are compounds with the
        // possessive suffix ("Hafta Sonu Ekibi", "Oyun Gecesi"): buffer n.
        let words = lower.split(whereSeparator: { $0 == " " })
        if words.count > 1 && closeVowels.contains(last) { return front ? "ne" : "na" }
        return front ? "ye" : "ya"
    }
}

// MARK: - Payload

/// The data an alert push carries (backend lib/iosAlertPush.js, `rich`).
struct DescallNotifyPayload: Equatable {
    enum Kind: String { case dm, group, channel }

    let type: String
    let conversation: String
    let kind: Kind
    let conversationId: String
    let senderId: String
    let senderName: String
    let senderAvatar: URL?
    let mediaThumb: URL?
    let mediaKind: String?
    let messageId: String?
    let communication: Bool
    let groupName: String?
    let serverName: String?
    let channelName: String?

    init?(userInfo: [AnyHashable: Any]) {
        func string(_ key: String) -> String? {
            guard let value = userInfo[key] else { return nil }
            let text: String
            if let s = value as? String { text = s } else if let n = value as? NSNumber { text = n.stringValue } else { return nil }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty || trimmed == "null" ? nil : trimmed
        }
        let type = string("type") ?? ""
        guard !type.contains("call"), let rich = string("rich"), rich == "1" || rich == "true" else { return nil }
        guard let conv = string("conv"), let parsed = DescallNotifyPayload.parseConversation(conv) else { return nil }
        self.type = type
        conversation = conv
        kind = parsed.kind
        conversationId = parsed.id
        senderId = string("senderId") ?? ""
        senderName = string("senderName") ?? string("from") ?? ""
        senderAvatar = DescallNotifyPayload.httpsURL(string("senderAvatar"))
        let thumb = DescallNotifyPayload.httpsURL(string("mediaThumb"))
        let mk = string("mediaKind")
        if let thumb, mk == "image" || mk == "video" {
            mediaThumb = thumb
            mediaKind = mk
        } else {
            mediaThumb = nil
            mediaKind = nil
        }
        messageId = string("messageId")
        communication = string("comm") == "1"
        groupName = string("groupName")
        serverName = string("serverName")
        channelName = string("channelName")
    }

    static func parseConversation(_ raw: String) -> (kind: Kind, id: String)? {
        guard let colon = raw.firstIndex(of: ":") else { return nil }
        guard let kind = Kind(rawValue: String(raw[..<colon])) else { return nil }
        let id = String(raw[raw.index(after: colon)...])
        guard !id.isEmpty, id.count <= 80,
              id.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }) else { return nil }
        return (kind, id)
    }

    static func httpsURL(_ raw: String?) -> URL? {
        guard let raw, raw.count <= 1024, let url = URL(string: raw), url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    /// Name the reply field and the header talk to ("Hafta Sonu Ekibi", "# genel", "Mert").
    var conversationTitle: String {
        switch kind {
        case .dm: return senderName
        case .group: return groupName ?? senderName
        case .channel: return channelName.map { "#\($0)" } ?? senderName
        }
    }
}

// MARK: - Mute ("1 saat sessize al", this device)

enum DescallNotifyMute {
    static func key(_ conversation: String) -> String { "notify.mute.\(conversation)" }

    static func isMuted(_ conversation: String, until: Double?, now: Date = Date()) -> Bool {
        guard let until else { return false }
        return until > now.timeIntervalSince1970
    }

    static func expiry(now: Date = Date()) -> Double {
        now.timeIntervalSince1970 + DescallNotify.muteDuration
    }

    /// Expired entries to drop from the shared defaults.
    static func expiredKeys(_ entries: [String: Double], now: Date = Date()) -> [String] {
        entries.filter { $0.key.hasPrefix("notify.mute.") && $0.value <= now.timeIntervalSince1970 }.map(\.key).sorted()
    }
}

// MARK: - Avatars

enum DescallNotifyAvatar {
    /// Letter avatar colours (teal, orange, gold, violet, blue, pink, green).
    static let palette: [(r: Double, g: Double, b: Double)] = [
        (0.12, 0.55, 0.58), (0.86, 0.45, 0.16), (0.78, 0.60, 0.16),
        (0.48, 0.36, 0.86), (0.23, 0.48, 0.90), (0.84, 0.30, 0.55), (0.20, 0.62, 0.38),
    ]

    static func initial(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first(where: { $0.isLetter || $0.isNumber }) else { return "?" }
        return String(first).uppercased(with: Locale(identifier: "tr_TR"))
    }

    static func colorIndex(_ seed: String) -> Int {
        Int(fnv1a(seed.isEmpty ? "?" : seed) % UInt64(palette.count))
    }

    /// Stable file name for a cached avatar.
    static func cacheName(for url: URL) -> String {
        String(format: "%016llx", fnv1a(url.absoluteString)) + ".img"
    }

    static func fnv1a(_ text: String) -> UInt64 {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in text.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01b3
        }
        return hash
    }

    static let cacheMaxAge: TimeInterval = 7 * 24 * 60 * 60
    static let cacheMaxFiles = 200
}

// MARK: - Attachments

enum DescallNotifyMedia {
    /// File extension UNNotificationAttachment needs to recognise the type.
    static func fileExtension(mime: String?, url: URL, kind: String?) -> String? {
        let m = (mime ?? "").lowercased()
        if m.contains("jpeg") || m.contains("jpg") { return "jpg" }
        if m.contains("png") { return "png" }
        if m.contains("gif") { return "gif" }
        if m.contains("heic") { return "heic" }
        if m.contains("webp") { return nil }
        if m.contains("mp4") { return "mp4" }
        if m.contains("quicktime") { return "mov" }
        let ext = url.pathExtension.lowercased()
        if ["jpg", "jpeg", "png", "gif", "heic"].contains(ext) { return ext == "jpeg" ? "jpg" : ext }
        if ["mp4", "mov", "m4v"].contains(ext) { return ext }
        return kind == "image" ? "jpg" : nil
    }

    static func acceptable(byteCount: Int64) -> Bool {
        byteCount > 0 && byteCount <= Int64(DescallNotify.maxAttachmentBytes)
    }
}

// MARK: - Thread preview (GET /api/messages/notify-thread)

struct DescallNotifyThread: Equatable {
    struct Message: Equatable {
        let id: String
        let fromName: String
        let text: String
        let mine: Bool
        var kind: String = "text"

        /// Bubble text; media without a caption gets a label ("📷 Fotoğraf").
        func display(_ strings: DescallNotifyStrings) -> String {
            let label = strings.kindLabel(kind)
            guard let label else { return text }
            return text.isEmpty ? label : "\(label) · \(text)"
        }
    }

    var title: String
    var subtitle: String?
    var memberCount: Int?
    var messages: [Message]

    init(title: String, subtitle: String? = nil, memberCount: Int? = nil, messages: [Message]) {
        self.title = title
        self.subtitle = subtitle
        self.memberCount = memberCount
        self.messages = messages
    }

    init?(json: [String: Any]) {
        guard json["ok"] as? Bool != false, let raw = json["messages"] as? [[String: Any]] else { return nil }
        title = json["title"] as? String ?? ""
        subtitle = json["subtitle"] as? String
        memberCount = (json["memberCount"] as? NSNumber)?.intValue
        messages = raw.suffix(3).compactMap { m in
            guard let id = m["id"] as? String else { return nil }
            return Message(
                id: id,
                fromName: m["fromName"] as? String ?? "",
                text: m["text"] as? String ?? "",
                mine: m["mine"] as? Bool ?? false,
                kind: m["kind"] as? String ?? "text"
            )
        }
    }

    /// Header second line: "👥 Hafta Sonu Ekibi · 4 üye", "# genel · Oyun Gecesi".
    static func headerLine(payload: DescallNotifyPayload, memberCount: Int?, strings: DescallNotifyStrings) -> String? {
        switch payload.kind {
        case .dm: return nil
        case .group:
            let name = payload.groupName ?? strings.group
            if let memberCount, memberCount > 0 { return "👥 \(name) · \(strings.members(memberCount))" }
            return "👥 \(name)"
        case .channel:
            guard let channel = payload.channelName else { return payload.serverName }
            if let server = payload.serverName { return "# \(channel) · \(server)" }
            return "# \(channel)"
        }
    }
}
