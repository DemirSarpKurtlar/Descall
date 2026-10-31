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

/// UI language of the native text (notification actions and thread, CallKit hints).
/// Same ids as src/i18n/locales.json. The web app shares its UI language through
/// DescallNotify.setUiLocale (App Group defaults, `uiLocaleKey`); until it has, the
/// device languages are matched like src/i18n/detect.js: a Turkish device keeps
/// Turkish, then the first live locale, else English (drafts only by UI choice).
enum DescallNotifyLang: String, CaseIterable {
    case en, tr, de, es, fr, ptBR = "pt-BR", ru

    /// status "live" in src/i18n/locales.json.
    static let live: Set<DescallNotifyLang> = [.en, .tr]
    static let uiLocaleKey = "descall.uiLocale"

    /// Registered locale for "tr-TR", "pt", "pt_BR", "de-AT"; nil when unknown.
    static func match(_ raw: String?) -> DescallNotifyLang? {
        let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-").lowercased()
        guard !value.isEmpty else { return nil }
        if let exact = allCases.first(where: { $0.rawValue.lowercased() == value }) { return exact }
        let base = value.split(separator: "-").first.map(String.init) ?? value
        return allCases.first { ($0.rawValue.lowercased().split(separator: "-").first.map(String.init) ?? "") == base }
    }

    static func current(_ preferred: [String] = Locale.preferredLanguages, app: String? = DescallNotifyLang.storedUiLocale()) -> DescallNotifyLang {
        if let chosen = match(app) { return chosen }
        guard !preferred.isEmpty else { return .tr }
        let langs = preferred.map { $0.replacingOccurrences(of: "_", with: "-").lowercased() }
        if langs.contains(where: { $0 == "tr" || $0.hasPrefix("tr-") || $0.hasSuffix("-tr") }) { return .tr }
        for lang in langs {
            if let hit = match(lang), live.contains(hit) { return hit }
        }
        return .en
    }

    /// The UI language the web app stored (DescallNotifyPlugin.setUiLocale), if any.
    static func storedUiLocale() -> String? {
        UserDefaults(suiteName: DescallNotify.appGroup)?.string(forKey: uiLocaleKey)
    }

    /// Locale for case mapping and formatters.
    var locale: Locale {
        switch self {
        case .en: return Locale(identifier: "en_GB")
        case .tr: return Locale(identifier: "tr_TR")
        case .de: return Locale(identifier: "de_DE")
        case .es: return Locale(identifier: "es_ES")
        case .fr: return Locale(identifier: "fr_FR")
        case .ptBR: return Locale(identifier: "pt_BR")
        case .ru: return Locale(identifier: "ru_RU")
        }
    }

    /// CLDR plural category for an integer count (one / few / many / other).
    func pluralCategory(_ n: Int) -> String {
        switch self {
        case .fr, .ptBR: return n == 0 || n == 1 ? "one" : "other"
        case .ru:
            let m10 = n % 10, m100 = n % 100
            if m10 == 1 && m100 != 11 { return "one" }
            if (2...4).contains(m10) && !(12...14).contains(m100) { return "few" }
            return "many"
        default: return n == 1 ? "one" : "other"
        }
    }
}

struct DescallNotifyStrings {
    let lang: DescallNotifyLang

    /// key -> text per locale; English fills a missing entry. {name} placeholders.
    static let table: [String: [DescallNotifyLang: String]] = [
        "markRead": [.en: "Mark as read", .tr: "Okundu olarak işaretle", .de: "Als gelesen markieren", .es: "Marcar como leído", .fr: "Marquer comme lu", .ptBR: "Marcar como lida", .ru: "Отметить как прочитанное"],
        "mute": [.en: "Mute for 1 hour", .tr: "1 saat sessize al", .de: "1 Stunde stummschalten", .es: "Silenciar 1 hora", .fr: "Mettre en sourdine 1 heure", .ptBR: "Silenciar por 1 hora", .ru: "Без звука на 1 час"],
        "openChat": [.en: "Open chat", .tr: "Sohbeti aç", .de: "Chat öffnen", .es: "Abrir chat", .fr: "Ouvrir la discussion", .ptBR: "Abrir conversa", .ru: "Открыть чат"],
        "hiddenPreview": [.en: "New message", .tr: "Yeni mesaj", .de: "Neue Nachricht", .es: "Nuevo mensaje", .fr: "Nouveau message", .ptBR: "Nova mensagem", .ru: "Новое сообщение"],
        // UNNotificationCategory.categorySummaryFormat: %u is the count.
        "summaryFormat": [.en: "+%u more messages", .tr: "+%u mesaj daha", .de: "+%u weitere Nachrichten", .es: "+%u mensajes más", .fr: "+%u autres messages", .ptBR: "+%u mensagens a mais", .ru: "Ещё сообщений: %u"],
        "now": [.en: "now", .tr: "şimdi", .de: "jetzt", .es: "ahora", .fr: "maintenant", .ptBR: "agora", .ru: "сейчас"],
        "sendFailed": [.en: "Couldn't send. Open the app and try again.", .tr: "Gönderilemedi. Uygulamayı açıp tekrar dene.", .de: "Senden fehlgeschlagen. Öffne die App und versuche es erneut.", .es: "No se pudo enviar. Abre la app y vuelve a intentarlo.", .fr: "Envoi impossible. Ouvre l'app et réessaie.", .ptBR: "Não foi possível enviar. Abra o app e tente de novo.", .ru: "Не удалось отправить. Откройте приложение и попробуйте ещё раз."],
        "signedOut": [.en: "Open the app to reply.", .tr: "Yanıtlamak için uygulamayı aç.", .de: "Öffne die App, um zu antworten.", .es: "Abre la app para responder.", .fr: "Ouvre l'app pour répondre.", .ptBR: "Abra o app para responder.", .ru: "Откройте приложение, чтобы ответить."],
        "group": [.en: "Group", .tr: "Grup", .de: "Gruppe", .es: "Grupo", .fr: "Groupe", .ptBR: "Grupo", .ru: "Группа"],
        "kind.image": [.en: "📷 Photo", .tr: "📷 Fotoğraf", .de: "📷 Foto", .es: "📷 Foto", .fr: "📷 Photo", .ptBR: "📷 Foto", .ru: "📷 Фото"],
        "kind.video": [.en: "🎬 Video", .tr: "🎬 Video", .de: "🎬 Video", .es: "🎬 Vídeo", .fr: "🎬 Vidéo", .ptBR: "🎬 Vídeo", .ru: "🎬 Видео"],
        "kind.voice": [.en: "🎤 Voice message", .tr: "🎤 Sesli mesaj", .de: "🎤 Sprachnachricht", .es: "🎤 Mensaje de voz", .fr: "🎤 Message vocal", .ptBR: "🎤 Mensagem de voz", .ru: "🎤 Голосовое сообщение"],
        "kind.file": [.en: "📎 File", .tr: "📎 Dosya", .de: "📎 Datei", .es: "📎 Archivo", .fr: "📎 Fichier", .ptBR: "📎 Arquivo", .ru: "📎 Файл"],
        "kind.poll": [.en: "📊 Poll", .tr: "📊 Anket", .de: "📊 Umfrage", .es: "📊 Encuesta", .fr: "📊 Sondage", .ptBR: "📊 Enquete", .ru: "📊 Опрос"],
        "members.one": [.en: "{count} member", .tr: "{count} üye", .de: "{count} Mitglied", .es: "{count} miembro", .fr: "{count} membre", .ptBR: "{count} membro", .ru: "{count} участник"],
        "members.few": [.ru: "{count} участника"],
        "members.many": [.ru: "{count} участников"],
        "members.other": [.en: "{count} members", .tr: "{count} üye", .de: "{count} Mitglieder", .es: "{count} miembros", .fr: "{count} membres", .ptBR: "{count} membros", .ru: "{count} участника"],
        "rel.minutes": [.en: "{n}m", .tr: "{n} dk", .de: "{n} Min.", .es: "{n} min", .fr: "{n} min", .ptBR: "{n} min", .ru: "{n} мин"],
        "rel.hours": [.en: "{n}h", .tr: "{n} sa", .de: "{n} Std.", .es: "{n} h", .fr: "{n} h", .ptBR: "{n} h", .ru: "{n} ч"],
        "rel.days": [.en: "{n}d", .tr: "{n} g", .de: "{n} T.", .es: "{n} d", .fr: "{n} j", .ptBR: "{n} d", .ru: "{n} д"],
        "writeReply": [.en: "Write a reply...", .tr: "Yanıt yaz...", .de: "Antwort schreiben...", .es: "Escribe una respuesta...", .fr: "Écris une réponse...", .ptBR: "Escreva uma resposta...", .ru: "Напишите ответ..."],
        // Turkish: {nameDat} = name + dative suffix ("Mert'e").
        "replyTo": [.en: "Reply to {name}...", .tr: "{nameDat} yanıt yaz...", .de: "Antworten an {name}...", .es: "Responder a {name}...", .fr: "Répondre à {name}...", .ptBR: "Responder a {name}...", .ru: "Ответ для {name}..."],
        "tr.replyToNoSuffix": [.tr: "{name} · yanıt yaz..."],
        // CallKit / lock screen (DescallCallManager, AppDelegate INCOMING_CALL actions).
        "call.openToConnect": [.en: "Open Descall to connect", .tr: "Bağlanmak için Descall'u açın", .de: "Öffne Descall, um dich zu verbinden", .es: "Abre Descall para conectarte", .fr: "Ouvre Descall pour te connecter", .ptBR: "Abra o Descall para se conectar", .ru: "Откройте Descall, чтобы подключиться"],
        "call.unlockToJoin": [.en: "Unlock your iPhone and tap Descall to join the call.", .tr: "Aramaya bağlanmak için iPhone'un kilidini açıp Descall'a dokunun.", .de: "Entsperre dein iPhone und tippe auf Descall, um dem Anruf beizutreten.", .es: "Desbloquea tu iPhone y toca Descall para unirte a la llamada.", .fr: "Déverrouille ton iPhone et touche Descall pour rejoindre l'appel.", .ptBR: "Desbloqueie seu iPhone e toque no Descall para entrar na chamada.", .ru: "Разблокируйте iPhone и нажмите Descall, чтобы присоединиться к звонку."],
        "call.joinFailedLocked": [.en: "Couldn't connect the call while your iPhone was locked. Open Descall to call back.", .tr: "Arama bağlanamadı: telefon kilitliyken katılınamadı. Geri aramak için Descall'u açın.", .de: "Der Anruf konnte nicht verbunden werden, solange dein iPhone gesperrt war. Öffne Descall, um zurückzurufen.", .es: "No se pudo conectar la llamada con el iPhone bloqueado. Abre Descall para devolver la llamada.", .fr: "Impossible de connecter l'appel pendant que ton iPhone était verrouillé. Ouvre Descall pour rappeler.", .ptBR: "Não foi possível conectar a chamada com o iPhone bloqueado. Abra o Descall para retornar a ligação.", .ru: "Не удалось подключить звонок, пока iPhone был заблокирован. Откройте Descall, чтобы перезвонить."],
        "call.accept": [.en: "Accept", .tr: "Kabul et", .de: "Annehmen", .es: "Aceptar", .fr: "Accepter", .ptBR: "Aceitar", .ru: "Принять"],
        "call.decline": [.en: "Decline", .tr: "Reddet", .de: "Ablehnen", .es: "Rechazar", .fr: "Refuser", .ptBR: "Recusar", .ru: "Отклонить"],
    ]
    /// Keys only some languages need (Turkish grammar, Russian plural forms).
    static let partialKeys: Set<String> = ["members.few", "members.many", "tr.replyToNoSuffix"]

    func text(_ key: String, _ vars: [String: String] = [:]) -> String {
        let entry = Self.table[key]
        var out = entry?[lang] ?? entry?[.en] ?? key
        for (name, value) in vars { out = out.replacingOccurrences(of: "{\(name)}", with: value) }
        return out
    }

    var markRead: String { text("markRead") }
    var mute: String { text("mute") }
    var openChat: String { text("openChat") }
    var hiddenPreview: String { text("hiddenPreview") }
    /// UNNotificationCategory.categorySummaryFormat ("+2 mesaj daha").
    var summaryFormat: String { text("summaryFormat") }
    var now: String { text("now") }
    var sendFailed: String { text("sendFailed") }
    var signedOut: String { text("signedOut") }
    var group: String { text("group") }

    func kindLabel(_ kind: String) -> String? {
        switch kind {
        case "image", "video", "voice", "file", "poll": return text("kind.\(kind)")
        default: return nil
        }
    }

    func members(_ count: Int) -> String {
        let key = "members.\(lang.pluralCategory(count))"
        return text(Self.table[key]?[lang] != nil ? key : "members.other", ["count": "\(count)"])
    }

    /// "şimdi", "2 dk", "3 sa", then days ("4 g", "4d").
    func relative(seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        if s < 60 { return now }
        if s < 3600 { return text("rel.minutes", ["n": "\(s / 60)"]) }
        if s < 86_400 { return text("rel.hours", ["n": "\(s / 3600)"]) }
        return text("rel.days", ["n": "\(s / 86_400)"])
    }

    /// Reply field placeholder: "Hafta Sonu Ekibi'ne yanıt yaz...", "Mert'e yanıt yaz...", "Reply to Mert...".
    func replyPlaceholder(to name: String) -> String {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return text("writeReply") }
        guard lang == .tr else { return text("replyTo", ["name": clean]) }
        guard let suffix = TurkishSuffix.dative(clean) else { return text("tr.replyToNoSuffix", ["name": clean]) }
        return text("replyTo", ["name": clean, "nameDat": "\(clean)'\(suffix)"])
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
    /// Same fallback as the app (src/lib/avatarFallback.js): AVATAR_PALETTE[crc32(user id) % 8],
    /// up to two initials, Turkish upper case. Order must match the JS palette.
    static let paletteHex: [UInt32] = [0x2868FF, 0x228359, 0xBA590E, 0xDB2C5B, 0x7E59EE, 0x177E96, 0x926F16, 0xDA362C]
    static let palette: [(r: Double, g: Double, b: Double)] = paletteHex.map(rgb)

    static func rgb(_ hex: UInt32) -> (r: Double, g: Double, b: Double) {
        let r: Double = Double((hex >> 16) & 0xFF) / 255
        let g: Double = Double((hex >> 8) & 0xFF) / 255
        let b: Double = Double(hex & 0xFF) / 255
        return (r: r, g: g, b: b)
    }

    /// "Ayşe Yılmaz" → "AY", "cinar.baskin" → "CB", "Zeynep" → "Z", "" → "?" (avatarInitials).
    static func initial(_ name: String) -> String {
        var trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasPrefix("@") { trimmed.removeFirst() }
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "._-"))
        // Leading non letters/digits of each part are dropped; its first letter/digit counts.
        let parts = trimmed.components(separatedBy: separators).compactMap { part in
            part.first(where: { $0.isLetter || $0.isNumber })
        }
        guard !parts.isEmpty else { return "?" }
        let letters = String(parts.prefix(2))
        return letters.uppercased(with: Locale(identifier: "tr_TR"))
    }

    static func colorIndex(_ seed: String) -> Int {
        guard !seed.isEmpty else { return 0 }
        return Int(crc32(seed) % UInt32(palette.count))
    }

    /// CRC-32 (IEEE, same as zlib.crc32) of the UTF-8 bytes.
    static func crc32(_ text: String) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in text.utf8 {
            crc ^= UInt32(byte)
            for _ in 0..<8 { crc = (crc & 1) != 0 ? (0xEDB8_8320 ^ (crc >> 1)) : (crc >> 1) }
        }
        return crc ^ 0xFFFF_FFFF
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
