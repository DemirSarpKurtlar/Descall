import Foundation

/// Watch copy, Turkish first (the app's main language), English otherwise. No emoji (owner rule).
enum L {
    static let isTurkish: Bool = {
        let code = Locale.preferredLanguages.first?.lowercased() ?? "tr"
        return code.hasPrefix("tr")
    }()

    private static func t(_ tr: String, _ en: String) -> String { isTurkish ? tr : en }

    static var chats: String { t("Sohbetler", "Chats") }
    static var friends: String { t("Arkadaşlar", "Friends") }
    static var reply: String { t("Yanıtla", "Reply") }
    static var writeOrSpeak: String { t("Yaz ya da söyle", "Type or dictate") }
    static var quickReplies: String { t("Hazır cevaplar", "Quick replies") }
    static var quick: [String] {
        isTurkish
            ? ["Geliyorum", "Biraz sonra", "Şimdi müsait değilim", "Tamam", "Teşekkürler"]
            : ["On my way", "In a bit", "Can't talk now", "OK", "Thanks"]
    }
    static var noChats: String { t("Henüz sohbet yok.", "No chats yet.") }
    static var noMessages: String { t("Henüz mesaj yok.", "No messages yet.") }
    static var noOneOnline: String { t("Şu an çevrimiçi arkadaşın yok.", "No friends online right now.") }
    static var yourStatus: String { t("Durumun", "Your status") }
    static var change: String { t("değiştir", "change") }
    static func onlineHeader(_ n: Int) -> String { t("Çevrimiçi · \(n)", "Online · \(n)") }
    static func offlineFooter(_ n: Int) -> String { t("\(n) kişi çevrimdışı", "\(n) offline") }
    static var you: String { t("Sen", "You") }
    static var retry: String { t("Tekrar dene", "Try again") }
    static var sending: String { t("Gönderiliyor", "Sending") }

    static func status(_ s: String) -> String {
        switch s {
        case "idle": return t("Boşta", "Idle")
        case "dnd": return t("Rahatsız etme", "Do not disturb")
        case "invisible": return t("Görünmez", "Invisible")
        case "offline": return t("Çevrimdışı", "Offline")
        default: return t("Çevrimiçi", "Online")
        }
    }

    static func error(_ e: WatchError) -> String {
        switch e {
        case .unreachable: return t("iPhone'una ulaşılamıyor. iPhone yakında ve açık olmalı.", "Can't reach your iPhone. Keep it nearby and on.")
        case .noSession: return t("iPhone'daki Descall'a giriş yap.", "Sign in to Descall on your iPhone.")
        case .notAllowed: return t("Bu işlem saatten yapılamıyor.", "This can't be done from the watch.")
        case .network: return t("Bağlantı yok. Biraz sonra tekrar dene.", "No connection. Try again soon.")
        case .decode: return t("Bir şey ters gitti.", "Something went wrong.")
        case .http(let code, let reason):
            switch reason {
            case "not_friends": return t("Mesaj atmak için önce arkadaş olmalısınız.", "You need to be friends to message.")
            case "rate_limited", "RATE_LIMITED": return t("Çok hızlı. Biraz bekle.", "Too fast. Wait a moment.")
            case "blocked": return t("Bu kişiye mesaj gönderilemiyor.", "You can't message this person.")
            case "STEP_UP_REQUIRED": return t("Önce doğrulama kodunu gir.", "Enter your verification code first.")
            case "ADMIN_2FA_REQUIRED": return t("Yönetici işlemleri için iPhone'da iki adımlı doğrulamayı aç.", "Turn on two-step verification on your iPhone for admin actions.")
            case "ADMIN_PERMISSION_DENIED": return t("Bu bölüm için yetkin yok.", "You don't have access to this section.")
            default: return code == 429 ? t("Çok hızlı. Biraz bekle.", "Too fast. Wait a moment.") : t("Bir şey ters gitti.", "Something went wrong.")
            }
        }
    }
}
