import Foundation

/// Watch copy in the UI language: the iPhone app's language when a bridge reply carried it
/// (DescallWatchProtocol.Key.locale), else the watch's languages (DescallWatchLocale.resolve).
/// One table for all locales of src/i18n/locales.json, English fallback. No emoji (owner rule).
enum L {
    static private(set) var lang: String = DescallWatchLocale.resolve(
        phone: UserDefaults.standard.string(forKey: DescallWatchLocale.storeKey),
        preferred: Locale.preferredLanguages
    )
    static var isTurkish: Bool { lang == "tr" }
    static var locale: Locale { Locale(identifier: DescallWatchLocale.localeIdentifier(lang)) }

    /// A reply from the iPhone carried the app's UI language: remember it for this and the next launch.
    static func adopt(phoneLocale: String?) {
        guard let id = DescallWatchLocale.match(phoneLocale) else { return }
        UserDefaults.standard.set(id, forKey: DescallWatchLocale.storeKey)
        lang = id
    }

    static func t(_ key: String, _ vars: [String: String] = [:]) -> String {
        let entry = table[key]
        var out = entry?[lang] ?? entry?["en"] ?? key
        for (name, value) in vars { out = out.replacingOccurrences(of: "{\(name)}", with: value) }
        return out
    }

    /// Count-dependent text: "<key>.one" / ".few" / ".many" / ".other" (CLDR category of the language).
    static func plural(_ key: String, _ n: Int, _ vars: [String: String] = [:]) -> String {
        let exact = "\(key).\(DescallWatchLocale.pluralCategory(n, lang))"
        let use = table[exact]?[lang] != nil ? exact : "\(key).other"
        return t(use, vars.merging(["n": "\(n)"]) { a, _ in a })
    }

    static var chats: String { t("chats") }
    static var friends: String { t("friends") }
    static var reply: String { t("reply") }
    static var writeOrSpeak: String { t("writeOrSpeak") }
    static var quickReplies: String { t("quickReplies") }
    static var quick: [String] { (0..<5).map { t("quick.\($0)") } }
    static var noChats: String { t("noChats") }
    static var noMessages: String { t("noMessages") }
    static var noOneOnline: String { t("noOneOnline") }
    static var yourStatus: String { t("yourStatus") }
    static var change: String { t("change") }
    static func onlineHeader(_ n: Int) -> String { t("onlineHeader", ["n": "\(n)"]) }
    static func offlineFooter(_ n: Int) -> String { t("offlineFooter", ["n": "\(n)"]) }
    static var you: String { t("you") }
    static var retry: String { t("retry") }
    static var sending: String { t("sending") }

    // 3.7.33: tabs, freshness, offline, advanced admin.
    static var servers: String { t("servers") }
    static var activity: String { t("activity") }
    static var calls: String { t("calls") }
    static var refresh: String { t("refresh") }
    static var refreshing: String { t("refreshing") }
    static var loading: String { t("loading") }
    static var offlineTitle: String { t("offlineTitle") }
    static var refreshFailed: String { t("refreshFailed") }
    static var noServers: String { t("noServers") }
    static var noChannels: String { t("noChannels") }
    static var muted: String { t("muted") }
    static var timedOutHere: String { t("timedOutHere") }
    static var noCalls: String { t("noCalls") }
    static var callsOnPhone: String { t("callsOnPhone") }
    static var noActivity: String { t("noActivity") }
    static var acceptOnPhone: String { t("acceptOnPhone") }
    static var friendRequest: String { t("friendRequest") }
    static var iphoneConnected: String { t("iphoneConnected") }
    static var iphoneAway: String { t("iphoneAway") }
    static var refreshAll: String { t("refreshAll") }
    static var version: String { t("version") }
    static var language: String { t("language") }
    static var live: String { t("live") }
    static var growth: String { t("growth") }
    static var safety: String { t("safety") }
    static var system: String { t("system") }
    static var visible: String { t("visible") }
    static var invisibleCount: String { t("invisibleCount") }
    static var signups7d: String { t("signups7d") }
    static var feedbackActive: String { t("feedbackActive") }
    static var reportedPeople: String { t("reportedPeople") }
    static var bans: String { t("bans") }
    static var timeouts: String { t("timeouts") }
    static var uptime: String { t("uptime") }
    static var memory: String { t("memory") }
    static var errorsHour: String { t("errorsHour") }
    static var flagged: String { t("flagged") }
    static var chatFrozen: String { t("chatFrozen") }
    static var recentAudit: String { t("recentAudit") }
    static var newlyJoined: String { t("newlyJoined") }
    static var autoRefresh: String { t("autoRefresh") }
    static var sections: String { t("sections") }

    static func health(_ level: String?) -> String {
        switch level {
        case "watch": return t("health.watch")
        case "high": return t("health.high")
        case "critical": return t("health.critical")
        default: return t("health.ok")
        }
    }

    static func call(_ c: (missed: Bool, direction: String, video: Bool)) -> String {
        if c.missed { return t(c.video ? "missedVideo" : "missedCall") }
        switch c.direction {
        case "outgoing": return t(c.video ? "outVideo" : "outCall")
        case "group": return t("groupCall")
        default: return t(c.video ? "inVideo" : "inCall")
        }
    }

    static func activityLine(_ type: String) -> String {
        switch type {
        case "friendRequest": return t("friendRequest")
        case "missedVideo": return t("missedVideo")
        default: return t("missedCall")
        }
    }

    /// "az önce" / "3 dk önce" / "2 sa önce" / "4 gün önce".
    static func ago(_ date: Date, now: Date = Date()) -> String {
        switch WatchFreshness.of(date, now: now) {
        case .live: return t("ago.now")
        case .minutes(let n): return t("ago.min", ["n": "\(n)"])
        case .hours(let n): return t("ago.hour", ["n": "\(n)"])
        case .days(let n): return plural("ago.day", n)
        }
    }
    static func updated(_ date: Date, now: Date = Date()) -> String { t("updated", ["ago": ago(date, now: now)]) }
    static func showingFrom(_ date: Date, now: Date = Date()) -> String { t("showingFrom", ["ago": ago(date, now: now)]) }
    static func members(_ n: Int) -> String { plural("members", n) }
    static func requestsHeader(_ n: Int) -> String { t("requestsHeader", ["n": "\(n)"]) }
    static func missedHeader(_ n: Int) -> String { t("missedHeader", ["n": "\(n)"]) }

    static func status(_ s: String) -> String {
        switch s {
        case "idle", "dnd", "invisible", "offline": return t("status.\(s)")
        default: return t("status.online")
        }
    }

    static func error(_ e: WatchError) -> String {
        switch e {
        case .unreachable: return t("err.unreachable")
        case .timeout: return t("err.timeout")
        case .noSession: return t("err.noSession")
        case .notAllowed: return t("err.notAllowed")
        case .network: return t("err.network")
        case .decode: return t("err.generic")
        case .http(let code, let reason):
            switch reason {
            case "not_friends": return t("err.notFriends")
            case "rate_limited", "RATE_LIMITED": return t("err.rateLimited")
            case "blocked": return t("err.blocked")
            case "STEP_UP_REQUIRED": return t("err.stepUp")
            case "ADMIN_2FA_REQUIRED": return t("err.admin2fa")
            case "ADMIN_PERMISSION_DENIED": return t("err.adminDenied")
            default: return code == 429 ? t("err.rateLimited") : t("err.generic")
            }
        }
    }

    // key -> locale id -> text. Keep every key in all 7 locales (en, tr, de, es, fr, pt-BR, ru);
    // ".few" / ".many" plural forms only where the language has them.
    static let table: [String: [String: String]] = [
        "chats": ["en": "Chats", "tr": "Sohbetler", "de": "Chats", "es": "Chats", "fr": "Discussions", "pt-BR": "Conversas", "ru": "Чаты"],
        "friends": ["en": "Friends", "tr": "Arkadaşlar", "de": "Freunde", "es": "Amigos", "fr": "Amis", "pt-BR": "Amigos", "ru": "Друзья"],
        "reply": ["en": "Reply", "tr": "Yanıtla", "de": "Antworten", "es": "Responder", "fr": "Répondre", "pt-BR": "Responder", "ru": "Ответить"],
        "writeOrSpeak": ["en": "Type or dictate", "tr": "Yaz ya da söyle", "de": "Tippen oder diktieren", "es": "Escribe o dicta", "fr": "Écris ou dicte", "pt-BR": "Digite ou dite", "ru": "Напишите или продиктуйте"],
        "quickReplies": ["en": "Quick replies", "tr": "Hazır cevaplar", "de": "Schnellantworten", "es": "Respuestas rápidas", "fr": "Réponses rapides", "pt-BR": "Respostas rápidas", "ru": "Быстрые ответы"],
        "quick.0": ["en": "On my way", "tr": "Geliyorum", "de": "Bin unterwegs", "es": "Voy para allá", "fr": "J'arrive", "pt-BR": "Estou indo", "ru": "Уже иду"],
        "quick.1": ["en": "In a bit", "tr": "Biraz sonra", "de": "Gleich", "es": "En un rato", "fr": "Dans un instant", "pt-BR": "Daqui a pouco", "ru": "Чуть позже"],
        "quick.2": ["en": "Can't talk now", "tr": "Şimdi müsait değilim", "de": "Kann gerade nicht", "es": "Ahora no puedo", "fr": "Je ne peux pas parler", "pt-BR": "Não posso falar agora", "ru": "Сейчас не могу"],
        "quick.3": ["en": "OK", "tr": "Tamam", "de": "Okay", "es": "Vale", "fr": "D'accord", "pt-BR": "Beleza", "ru": "Хорошо"],
        "quick.4": ["en": "Thanks", "tr": "Teşekkürler", "de": "Danke", "es": "Gracias", "fr": "Merci", "pt-BR": "Valeu", "ru": "Спасибо"],
        "noChats": ["en": "No chats yet.", "tr": "Henüz sohbet yok.", "de": "Noch keine Chats.", "es": "Aún no hay chats.", "fr": "Pas encore de discussions.", "pt-BR": "Nenhuma conversa ainda.", "ru": "Чатов пока нет."],
        "noMessages": ["en": "No messages yet.", "tr": "Henüz mesaj yok.", "de": "Noch keine Nachrichten.", "es": "Aún no hay mensajes.", "fr": "Pas encore de messages.", "pt-BR": "Nenhuma mensagem ainda.", "ru": "Сообщений пока нет."],
        "noOneOnline": ["en": "No friends online right now.", "tr": "Şu an çevrimiçi arkadaşın yok.", "de": "Gerade sind keine Freunde online.", "es": "Ahora no hay amigos en línea.", "fr": "Aucun ami en ligne pour le moment.", "pt-BR": "Nenhum amigo online agora.", "ru": "Сейчас нет друзей в сети."],
        "yourStatus": ["en": "Your status", "tr": "Durumun", "de": "Dein Status", "es": "Tu estado", "fr": "Ton statut", "pt-BR": "Seu status", "ru": "Ваш статус"],
        "change": ["en": "change", "tr": "değiştir", "de": "ändern", "es": "cambiar", "fr": "modifier", "pt-BR": "alterar", "ru": "изменить"],
        "onlineHeader": ["en": "Online · {n}", "tr": "Çevrimiçi · {n}", "de": "Online · {n}", "es": "En línea · {n}", "fr": "En ligne · {n}", "pt-BR": "Online · {n}", "ru": "В сети · {n}"],
        "offlineFooter": ["en": "{n} offline", "tr": "{n} kişi çevrimdışı", "de": "{n} offline", "es": "{n} desconectados", "fr": "{n} hors ligne", "pt-BR": "{n} offline", "ru": "Не в сети: {n}"],
        "you": ["en": "You", "tr": "Sen", "de": "Du", "es": "Tú", "fr": "Toi", "pt-BR": "Você", "ru": "Вы"],
        "retry": ["en": "Try again", "tr": "Tekrar dene", "de": "Erneut versuchen", "es": "Reintentar", "fr": "Réessayer", "pt-BR": "Tentar de novo", "ru": "Повторить"],
        "sending": ["en": "Sending", "tr": "Gönderiliyor", "de": "Wird gesendet", "es": "Enviando", "fr": "Envoi en cours", "pt-BR": "Enviando", "ru": "Отправка"],
        "status.online": ["en": "Online", "tr": "Çevrimiçi", "de": "Online", "es": "En línea", "fr": "En ligne", "pt-BR": "Online", "ru": "В сети"],
        "status.idle": ["en": "Idle", "tr": "Boşta", "de": "Abwesend", "es": "Ausente", "fr": "Absent", "pt-BR": "Ausente", "ru": "Неактивен"],
        "status.dnd": ["en": "Do not disturb", "tr": "Rahatsız etme", "de": "Nicht stören", "es": "No molestar", "fr": "Ne pas déranger", "pt-BR": "Não perturbe", "ru": "Не беспокоить"],
        "status.invisible": ["en": "Invisible", "tr": "Görünmez", "de": "Unsichtbar", "es": "Invisible", "fr": "Invisible", "pt-BR": "Invisível", "ru": "Невидимка"],
        "status.offline": ["en": "Offline", "tr": "Çevrimdışı", "de": "Offline", "es": "Desconectado", "fr": "Hors ligne", "pt-BR": "Offline", "ru": "Не в сети"],
        "err.unreachable": ["en": "Can't reach your iPhone. Keep it nearby and on.", "tr": "iPhone'una ulaşılamıyor. iPhone yakında ve açık olmalı.", "de": "Dein iPhone ist nicht erreichbar. Halte es in der Nähe und eingeschaltet.", "es": "No se puede conectar con tu iPhone. Mantenlo cerca y encendido.", "fr": "Impossible de joindre ton iPhone. Garde-le à proximité et allumé.", "pt-BR": "Não foi possível acessar seu iPhone. Mantenha-o por perto e ligado.", "ru": "Не удаётся связаться с iPhone. Держите его рядом и включённым."],
        "err.noSession": ["en": "Sign in to Descall on your iPhone.", "tr": "iPhone'daki Descall'a giriş yap.", "de": "Melde dich auf deinem iPhone bei Descall an.", "es": "Inicia sesión en Descall en tu iPhone.", "fr": "Connecte-toi à Descall sur ton iPhone.", "pt-BR": "Entre no Descall no seu iPhone.", "ru": "Войдите в Descall на iPhone."],
        "err.notAllowed": ["en": "This can't be done from the watch.", "tr": "Bu işlem saatten yapılamıyor.", "de": "Das geht nicht über die Watch.", "es": "Esto no se puede hacer desde el reloj.", "fr": "Impossible depuis la montre.", "pt-BR": "Isso não pode ser feito pelo relógio.", "ru": "Это нельзя сделать с часов."],
        "err.network": ["en": "No connection. Try again soon.", "tr": "Bağlantı yok. Biraz sonra tekrar dene.", "de": "Keine Verbindung. Versuche es gleich noch einmal.", "es": "Sin conexión. Vuelve a intentarlo en un rato.", "fr": "Pas de connexion. Réessaie dans un instant.", "pt-BR": "Sem conexão. Tente de novo daqui a pouco.", "ru": "Нет подключения. Попробуйте чуть позже."],
        "err.generic": ["en": "Something went wrong.", "tr": "Bir şey ters gitti.", "de": "Etwas ist schiefgelaufen.", "es": "Algo salió mal.", "fr": "Un problème est survenu.", "pt-BR": "Algo deu errado.", "ru": "Что-то пошло не так."],
        "err.notFriends": ["en": "You need to be friends to message.", "tr": "Mesaj atmak için önce arkadaş olmalısınız.", "de": "Du kannst nur Freunden schreiben.", "es": "Solo puedes enviar mensajes a tus amigos.", "fr": "Tu ne peux écrire qu'à tes amis.", "pt-BR": "Vocês precisam ser amigos para trocar mensagens.", "ru": "Писать можно только друзьям."],
        "err.rateLimited": ["en": "Too fast. Wait a moment.", "tr": "Çok hızlı. Biraz bekle.", "de": "Zu schnell. Warte kurz.", "es": "Demasiado rápido. Espera un momento.", "fr": "Trop rapide. Patiente un instant.", "pt-BR": "Rápido demais. Aguarde um momento.", "ru": "Слишком быстро. Подождите немного."],
        "err.blocked": ["en": "You can't message this person.", "tr": "Bu kişiye mesaj gönderilemiyor.", "de": "Du kannst dieser Person nicht schreiben.", "es": "No puedes enviar mensajes a esta persona.", "fr": "Tu ne peux pas écrire à cette personne.", "pt-BR": "Você não pode enviar mensagens para essa pessoa.", "ru": "Этому человеку нельзя написать."],
        "err.stepUp": ["en": "Enter your verification code first.", "tr": "Önce doğrulama kodunu gir.", "de": "Gib zuerst deinen Bestätigungscode ein.", "es": "Primero introduce tu código de verificación.", "fr": "Saisis d'abord ton code de vérification.", "pt-BR": "Primeiro digite seu código de verificação.", "ru": "Сначала введите код подтверждения."],
        "err.admin2fa": ["en": "Turn on two-step verification on your iPhone for admin actions.", "tr": "Yönetici işlemleri için iPhone'da iki adımlı doğrulamayı aç.", "de": "Aktiviere auf deinem iPhone die Bestätigung in zwei Schritten, um Admin-Aktionen auszuführen.", "es": "Activa la verificación en dos pasos en tu iPhone para las acciones de administración.", "fr": "Active la validation en deux étapes sur ton iPhone pour les actions d'administration.", "pt-BR": "Ative a verificação em duas etapas no iPhone para ações de administrador.", "ru": "Включите двухэтапную проверку на iPhone для действий администратора."],
        "err.adminDenied": ["en": "You don't have access to this section.", "tr": "Bu bölüm için yetkin yok.", "de": "Du hast keinen Zugriff auf diesen Bereich.", "es": "No tienes acceso a esta sección.", "fr": "Tu n'as pas accès à cette section.", "pt-BR": "Você não tem acesso a esta seção.", "ru": "У вас нет доступа к этому разделу."],

        // Admin menu (WatchAdminViews.swift).
        "admin": ["en": "Admin", "tr": "Yönetici", "de": "Admin", "es": "Admin", "fr": "Admin", "pt-BR": "Admin", "ru": "Админ"],
        "signupsToday": ["en": "Sign-ups today", "tr": "Bugün kayıt", "de": "Registrierungen heute", "es": "Registros hoy", "fr": "Inscriptions du jour", "pt-BR": "Cadastros hoje", "ru": "Регистрации сегодня"],
        "openReports": ["en": "Open reports", "tr": "Açık rapor", "de": "Offene Meldungen", "es": "Reportes abiertos", "fr": "Signalements ouverts", "pt-BR": "Denúncias abertas", "ru": "Открытые жалобы"],
        "newFeedback": ["en": "New feedback", "tr": "Yeni geri bildirim", "de": "Neues Feedback", "es": "Comentarios nuevos", "fr": "Nouveaux avis", "pt-BR": "Novos feedbacks", "ru": "Новые отзывы"],
        "section.reports": ["en": "Reports", "tr": "Raporlar", "de": "Meldungen", "es": "Reportes", "fr": "Signalements", "pt-BR": "Denúncias", "ru": "Жалобы"],
        "section.feedback": ["en": "Feedback", "tr": "Geri bildirim", "de": "Feedback", "es": "Comentarios", "fr": "Avis", "pt-BR": "Feedback", "ru": "Отзывы"],
        "section.errors": ["en": "Error log", "tr": "Hata kayıtları", "de": "Fehlerprotokoll", "es": "Registro de errores", "fr": "Journal des erreurs", "pt-BR": "Registro de erros", "ru": "Журнал ошибок"],
        "section.maintenance": ["en": "Maintenance", "tr": "Bakım", "de": "Wartung", "es": "Mantenimiento", "fr": "Maintenance", "pt-BR": "Manutenção", "ru": "Техработы"],
        "section.accessBans": ["en": "Access bans", "tr": "Erişim yasakları", "de": "Zugangssperren", "es": "Bloqueos de acceso", "fr": "Interdictions d'accès", "pt-BR": "Bloqueios de acesso", "ru": "Блокировки доступа"],
        "section.people": ["en": "People", "tr": "Kişiler", "de": "Personen", "es": "Personas", "fr": "Personnes", "pt-BR": "Pessoas", "ru": "Люди"],
        "stepUpTitle": ["en": "Verification code", "tr": "Doğrulama kodu", "de": "Bestätigungscode", "es": "Código de verificación", "fr": "Code de vérification", "pt-BR": "Código de verificação", "ru": "Код подтверждения"],
        "stepUpBody": ["en": "Enter the 6-digit code from your authenticator app.", "tr": "Doğrulama uygulamandaki 6 haneli kodu gir.", "de": "Gib den 6-stelligen Code aus deiner Authenticator-App ein.", "es": "Introduce el código de 6 dígitos de tu app de autenticación.", "fr": "Saisis le code à 6 chiffres de ton app d'authentification.", "pt-BR": "Digite o código de 6 dígitos do seu app autenticador.", "ru": "Введите 6-значный код из приложения-аутентификатора."],
        "enterCode": ["en": "Enter code", "tr": "Kodu gir", "de": "Code eingeben", "es": "Introducir código", "fr": "Saisir le code", "pt-BR": "Digitar código", "ru": "Ввести код"],
        "codeWrong": ["en": "Wrong or expired code.", "tr": "Kod yanlış ya da süresi geçti.", "de": "Falscher oder abgelaufener Code.", "es": "Código incorrecto o caducado.", "fr": "Code incorrect ou expiré.", "pt-BR": "Código errado ou expirado.", "ru": "Неверный или просроченный код."],
        "cancel": ["en": "Cancel", "tr": "Vazgeç", "de": "Abbrechen", "es": "Cancelar", "fr": "Annuler", "pt-BR": "Cancelar", "ru": "Отмена"],
        "done": ["en": "Done", "tr": "Tamam", "de": "Fertig", "es": "Listo", "fr": "OK", "pt-BR": "Concluído", "ru": "Готово"],
        "nothingHere": ["en": "Nothing here right now.", "tr": "Şu an bir şey yok.", "de": "Gerade gibt es hier nichts.", "es": "Por ahora no hay nada aquí.", "fr": "Rien pour le moment.", "pt-BR": "Nada por aqui agora.", "ru": "Пока здесь ничего нет."],
        "openCount.one": ["en": "{n} open report", "tr": "{n} açık rapor", "de": "{n} offene Meldung", "es": "{n} reporte abierto", "fr": "{n} signalement ouvert", "pt-BR": "{n} denúncia aberta", "ru": "{n} открытая жалоба"],
        "openCount.few": ["ru": "{n} открытые жалобы"],
        "openCount.many": ["ru": "{n} открытых жалоб"],
        "openCount.other": ["en": "{n} open reports", "tr": "{n} açık rapor", "de": "{n} offene Meldungen", "es": "{n} reportes abiertos", "fr": "{n} signalements ouverts", "pt-BR": "{n} denúncias abertas", "ru": "{n} открытой жалобы"],
        "assignMe": ["en": "Assign to me", "tr": "Bana ata", "de": "Mir zuweisen", "es": "Asignármelo", "fr": "Me l'attribuer", "pt-BR": "Atribuir a mim", "ru": "Назначить мне"],
        "timeout1h": ["en": "Timeout · 1 hour", "tr": "Zaman aşımı · 1 saat", "de": "Timeout · 1 Stunde", "es": "Aislamiento · 1 hora", "fr": "Exclusion · 1 heure", "pt-BR": "Castigo · 1 hora", "ru": "Тайм-аут · 1 час"],
        "timeout24h": ["en": "Timeout · 24 hours", "tr": "Zaman aşımı · 24 saat", "de": "Timeout · 24 Stunden", "es": "Aislamiento · 24 horas", "fr": "Exclusion · 24 heures", "pt-BR": "Castigo · 24 horas", "ru": "Тайм-аут · 24 часа"],
        "ban": ["en": "Ban", "tr": "Ban", "de": "Sperren", "es": "Banear", "fr": "Bannir", "pt-BR": "Banir", "ru": "Забанить"],
        "banConfirm": ["en": "Ban permanently?", "tr": "Kalıcı ban verilsin mi?", "de": "Dauerhaft sperren?", "es": "¿Banear de forma permanente?", "fr": "Bannir définitivement ?", "pt-BR": "Banir permanentemente?", "ru": "Забанить навсегда?"],
        "dismiss": ["en": "Dismiss", "tr": "Reddet", "de": "Verwerfen", "es": "Descartar", "fr": "Rejeter", "pt-BR": "Descartar", "ru": "Отклонить"],
        "assignedTo": ["en": "Assigned", "tr": "Atanan", "de": "Zugewiesen", "es": "Asignado a", "fr": "Attribué à", "pt-BR": "Atribuído a", "ru": "Назначено"],
        "actionDone": ["en": "Done.", "tr": "Yapıldı.", "de": "Erledigt.", "es": "Hecho.", "fr": "C'est fait.", "pt-BR": "Feito.", "ru": "Готово."],
        "startProgress": ["en": "Start", "tr": "İşleme al", "de": "Bearbeiten", "es": "Empezar", "fr": "Prendre en charge", "pt-BR": "Iniciar", "ru": "Взять в работу"],
        "markResolved": ["en": "Resolved", "tr": "Çözüldü", "de": "Gelöst", "es": "Resuelto", "fr": "Résolu", "pt-BR": "Resolvido", "ru": "Решено"],
        "ignore": ["en": "Ignore", "tr": "Yoksay", "de": "Ignorieren", "es": "Ignorar", "fr": "Ignorer", "pt-BR": "Ignorar", "ru": "Игнорировать"],
        "note": ["en": "Note", "tr": "Not", "de": "Notiz", "es": "Nota", "fr": "Remarque", "pt-BR": "Nota", "ru": "Заметка"],
        "team": ["en": "Team", "tr": "Ekip", "de": "Team", "es": "Equipo", "fr": "Équipe", "pt-BR": "Equipe", "ru": "Команда"],
        "operational": ["en": "No maintenance, all systems open.", "tr": "Bakım yok, her şey açık.", "de": "Keine Wartung, alles läuft.", "es": "Sin mantenimiento, todo funciona.", "fr": "Pas de maintenance, tout fonctionne.", "pt-BR": "Sem manutenção, tudo funcionando.", "ru": "Техработ нет, всё работает."],
        "maintActive": ["en": "Maintenance active", "tr": "Bakım sürüyor", "de": "Wartung läuft", "es": "Mantenimiento en curso", "fr": "Maintenance en cours", "pt-BR": "Manutenção em andamento", "ru": "Идут техработы"],
        "maintScheduled": ["en": "Scheduled maintenance", "tr": "Planlı bakım", "de": "Geplante Wartung", "es": "Mantenimiento programado", "fr": "Maintenance planifiée", "pt-BR": "Manutenção agendada", "ru": "Плановые техработы"],
        "extend30": ["en": "+30 minutes", "tr": "+30 dakika", "de": "+30 Minuten", "es": "+30 minutos", "fr": "+30 min", "pt-BR": "+30 minutos", "ru": "+30 минут"],
        "endNow": ["en": "End now", "tr": "Şimdi bitir", "de": "Jetzt beenden", "es": "Terminar ahora", "fr": "Terminer maintenant", "pt-BR": "Encerrar agora", "ru": "Завершить сейчас"],
        "endConfirm": ["en": "End maintenance?", "tr": "Bakım bitirilsin mi?", "de": "Wartung beenden?", "es": "¿Terminar el mantenimiento?", "fr": "Terminer la maintenance ?", "pt-BR": "Encerrar a manutenção?", "ru": "Завершить техработы?"],
        "start30": ["en": "Start 30 min maintenance", "tr": "30 dk bakım başlat", "de": "30 Min. Wartung starten", "es": "Iniciar 30 min de mantenimiento", "fr": "Lancer 30 min de maintenance", "pt-BR": "Iniciar 30 min de manutenção", "ru": "Начать техработы на 30 мин"],
        "startConfirm": ["en": "Show the maintenance screen to everyone?", "tr": "Herkes için bakım ekranı açılsın mı?", "de": "Wartungsbildschirm für alle anzeigen?", "es": "¿Mostrar la pantalla de mantenimiento a todos?", "fr": "Afficher l'écran de maintenance pour tout le monde ?", "pt-BR": "Mostrar a tela de manutenção para todos?", "ru": "Показать всем экран техработ?"],
        "maintMessage": ["en": "We're doing a short maintenance. Back soon.", "tr": "Kısa bir bakım yapıyoruz. Birazdan geri döneceğiz.", "de": "Wir führen eine kurze Wartung durch. Gleich sind wir zurück.", "es": "Estamos haciendo un breve mantenimiento. Volvemos enseguida.", "fr": "Petite maintenance en cours. On revient très vite.", "pt-BR": "Estamos fazendo uma manutenção rápida. Voltamos já.", "ru": "Идут короткие техработы. Скоро вернёмся."],
        "revoke": ["en": "Revoke", "tr": "Yasağı kaldır", "de": "Aufheben", "es": "Revocar", "fr": "Révoquer", "pt-BR": "Revogar", "ru": "Снять"],
        "revokeConfirm": ["en": "Revoke this ban?", "tr": "Yasak kaldırılsın mı?", "de": "Diese Sperre aufheben?", "es": "¿Revocar este bloqueo?", "fr": "Révoquer cette interdiction ?", "pt-BR": "Revogar este bloqueio?", "ru": "Снять эту блокировку?"],
        "hits.one": ["en": "{n} block", "tr": "{n} engelleme", "de": "{n} Blockierung", "es": "{n} bloqueo", "fr": "{n} blocage", "pt-BR": "{n} bloqueio", "ru": "{n} блокировка"],
        "hits.few": ["ru": "{n} блокировки"],
        "hits.many": ["ru": "{n} блокировок"],
        "hits.other": ["en": "{n} blocks", "tr": "{n} engelleme", "de": "{n} Blockierungen", "es": "{n} bloqueos", "fr": "{n} blocages", "pt-BR": "{n} bloqueios", "ru": "{n} блокировки"],
        "search": ["en": "Search users", "tr": "Kullanıcı ara", "de": "Nutzer suchen", "es": "Buscar usuarios", "fr": "Rechercher des utilisateurs", "pt-BR": "Buscar usuários", "ru": "Поиск пользователей"],
        "removeTimeout": ["en": "Remove timeout", "tr": "Zaman aşımını kaldır", "de": "Timeout aufheben", "es": "Quitar aislamiento", "fr": "Lever l'exclusion", "pt-BR": "Remover castigo", "ru": "Снять тайм-аут"],
        "unban": ["en": "Unban", "tr": "Banı kaldır", "de": "Entsperren", "es": "Desbanear", "fr": "Débannir", "pt-BR": "Desbanir", "ru": "Разбанить"],
        // {count} times, {n} = people (the plural follows the number of people).
        "errorStats.one": ["en": "{count}× · {n} person", "tr": "{count} kez · {n} kişi", "de": "{count}× · {n} Person", "es": "{count}× · {n} persona", "fr": "{count}× · {n} personne", "pt-BR": "{count}× · {n} pessoa", "ru": "{count}× · {n} человек"],
        "errorStats.few": ["ru": "{count}× · {n} человека"],
        "errorStats.many": ["ru": "{count}× · {n} человек"],
        "errorStats.other": ["en": "{count}× · {n} people", "tr": "{count} kez · {n} kişi", "de": "{count}× · {n} Personen", "es": "{count}× · {n} personas", "fr": "{count}× · {n} personnes", "pt-BR": "{count}× · {n} pessoas", "ru": "{count}× · {n} человека"],
        "err.timeout": ["en": "Your iPhone is taking too long. Try again.", "tr": "iPhone'un çok geç yanıt verdi. Tekrar dene.", "de": "Dein iPhone antwortet zu langsam. Versuch es noch mal.", "es": "Tu iPhone tarda demasiado. Inténtalo de nuevo.", "fr": "Ton iPhone met trop de temps. Réessaie.", "pt-BR": "Seu iPhone está demorando. Tente de novo.", "ru": "iPhone долго не отвечает. Попробуйте ещё раз."],
        "servers": ["en": "Servers", "tr": "Sunucular", "de": "Server", "es": "Servidores", "fr": "Serveurs", "pt-BR": "Servidores", "ru": "Серверы"],
        "activity": ["en": "Activity", "tr": "Etkinlik", "de": "Aktivität", "es": "Actividad", "fr": "Activité", "pt-BR": "Atividade", "ru": "Активность"],
        "calls": ["en": "Calls", "tr": "Aramalar", "de": "Anrufe", "es": "Llamadas", "fr": "Appels", "pt-BR": "Chamadas", "ru": "Звонки"],
        "refresh": ["en": "Refresh", "tr": "Yenile", "de": "Aktualisieren", "es": "Actualizar", "fr": "Actualiser", "pt-BR": "Atualizar", "ru": "Обновить"],
        "refreshing": ["en": "Refreshing…", "tr": "Yenileniyor…", "de": "Wird aktualisiert…", "es": "Actualizando…", "fr": "Actualisation…", "pt-BR": "Atualizando…", "ru": "Обновление…"],
        "loading": ["en": "Loading", "tr": "Yükleniyor", "de": "Wird geladen", "es": "Cargando", "fr": "Chargement", "pt-BR": "Carregando", "ru": "Загрузка"],
        "offlineTitle": ["en": "Can't reach your iPhone", "tr": "iPhone'una ulaşılamıyor", "de": "iPhone nicht erreichbar", "es": "No se puede conectar con tu iPhone", "fr": "iPhone injoignable", "pt-BR": "iPhone fora de alcance", "ru": "iPhone недоступен"],
        "refreshFailed": ["en": "Couldn't refresh", "tr": "Yenilenemedi", "de": "Aktualisierung fehlgeschlagen", "es": "No se pudo actualizar", "fr": "Actualisation impossible", "pt-BR": "Não foi possível atualizar", "ru": "Не удалось обновить"],
        "updated": ["en": "Updated · {ago}", "tr": "Güncellendi · {ago}", "de": "Aktualisiert · {ago}", "es": "Actualizado · {ago}", "fr": "Mis à jour · {ago}", "pt-BR": "Atualizado · {ago}", "ru": "Обновлено · {ago}"],
        "showingFrom": ["en": "Showing data from {ago}", "tr": "{ago} verisi gösteriliyor", "de": "Daten von {ago}", "es": "Datos de {ago}", "fr": "Données d'il y a {ago}", "pt-BR": "Dados de {ago}", "ru": "Данные: {ago}"],
        "ago.now": ["en": "just now", "tr": "az önce", "de": "gerade eben", "es": "ahora mismo", "fr": "à l'instant", "pt-BR": "agora", "ru": "только что"],
        "ago.min": ["en": "{n} min ago", "tr": "{n} dk önce", "de": "vor {n} Min.", "es": "hace {n} min", "fr": "il y a {n} min", "pt-BR": "há {n} min", "ru": "{n} мин назад"],
        "ago.hour": ["en": "{n} h ago", "tr": "{n} sa önce", "de": "vor {n} Std.", "es": "hace {n} h", "fr": "il y a {n} h", "pt-BR": "há {n} h", "ru": "{n} ч назад"],
        "ago.day.one": ["en": "{n} day ago", "tr": "{n} gün önce", "de": "vor {n} Tag", "es": "hace {n} día", "fr": "il y a {n} jour", "pt-BR": "há {n} dia", "ru": "{n} день назад"],
        "ago.day.other": ["en": "{n} days ago", "tr": "{n} gün önce", "de": "vor {n} Tagen", "es": "hace {n} días", "fr": "il y a {n} jours", "pt-BR": "há {n} dias", "ru": "{n} дня назад"],
        "members.one": ["en": "{n} member", "tr": "{n} üye", "de": "{n} Mitglied", "es": "{n} miembro", "fr": "{n} membre", "pt-BR": "{n} membro", "ru": "{n} участник"],
        "members.other": ["en": "{n} members", "tr": "{n} üye", "de": "{n} Mitglieder", "es": "{n} miembros", "fr": "{n} membres", "pt-BR": "{n} membros", "ru": "{n} участника"],
        "noServers": ["en": "You haven't joined a server yet.", "tr": "Henüz bir sunucuya katılmadın.", "de": "Du bist noch keinem Server beigetreten.", "es": "Aún no te has unido a ningún servidor.", "fr": "Tu n'as encore rejoint aucun serveur.", "pt-BR": "Você ainda não entrou em nenhum servidor.", "ru": "Вы ещё не вступили ни в один сервер."],
        "noChannels": ["en": "No text channels you can open here.", "tr": "Burada açabileceğin metin kanalı yok.", "de": "Hier gibt es keine Textkanäle für dich.", "es": "Aquí no hay canales de texto que puedas abrir.", "fr": "Aucun salon textuel à ouvrir ici.", "pt-BR": "Nenhum canal de texto para abrir aqui.", "ru": "Здесь нет доступных текстовых каналов."],
        "muted": ["en": "Muted", "tr": "Sessizde", "de": "Stumm", "es": "Silenciado", "fr": "En sourdine", "pt-BR": "Silenciado", "ru": "Без звука"],
        "timedOutHere": ["en": "You're timed out here", "tr": "Burada zaman aşımındasın", "de": "Du bist hier im Timeout", "es": "Estás aislado aquí", "fr": "Tu es exclu temporairement ici", "pt-BR": "Você está de castigo aqui", "ru": "У вас тут тайм-аут"],
        "noCalls": ["en": "No calls yet.", "tr": "Henüz arama yok.", "de": "Noch keine Anrufe.", "es": "Aún no hay llamadas.", "fr": "Pas encore d'appels.", "pt-BR": "Nenhuma chamada ainda.", "ru": "Звонков пока нет."],
        "callsOnPhone": ["en": "Start calls from your iPhone.", "tr": "Aramaları iPhone'undan başlatabilirsin.", "de": "Starte Anrufe auf deinem iPhone.", "es": "Inicia las llamadas desde tu iPhone.", "fr": "Lance les appels depuis ton iPhone.", "pt-BR": "Inicie chamadas pelo iPhone.", "ru": "Звонки начинайте с iPhone."],
        "missedCall": ["en": "Missed voice call", "tr": "Cevapsız sesli arama", "de": "Verpasster Sprachanruf", "es": "Llamada de voz perdida", "fr": "Appel vocal manqué", "pt-BR": "Chamada de voz perdida", "ru": "Пропущенный аудиозвонок"],
        "missedVideo": ["en": "Missed video call", "tr": "Cevapsız görüntülü arama", "de": "Verpasster Videoanruf", "es": "Videollamada perdida", "fr": "Appel vidéo manqué", "pt-BR": "Chamada de vídeo perdida", "ru": "Пропущенный видеозвонок"],
        "inCall": ["en": "Incoming voice call", "tr": "Gelen sesli arama", "de": "Eingehender Sprachanruf", "es": "Llamada de voz entrante", "fr": "Appel vocal reçu", "pt-BR": "Chamada de voz recebida", "ru": "Входящий аудиозвонок"],
        "inVideo": ["en": "Incoming video call", "tr": "Gelen görüntülü arama", "de": "Eingehender Videoanruf", "es": "Videollamada entrante", "fr": "Appel vidéo reçu", "pt-BR": "Chamada de vídeo recebida", "ru": "Входящий видеозвонок"],
        "outCall": ["en": "Outgoing voice call", "tr": "Giden sesli arama", "de": "Ausgehender Sprachanruf", "es": "Llamada de voz saliente", "fr": "Appel vocal émis", "pt-BR": "Chamada de voz feita", "ru": "Исходящий аудиозвонок"],
        "outVideo": ["en": "Outgoing video call", "tr": "Giden görüntülü arama", "de": "Ausgehender Videoanruf", "es": "Videollamada saliente", "fr": "Appel vidéo émis", "pt-BR": "Chamada de vídeo feita", "ru": "Исходящий видеозвонок"],
        "groupCall": ["en": "Group call", "tr": "Grup araması", "de": "Gruppenanruf", "es": "Llamada grupal", "fr": "Appel de groupe", "pt-BR": "Chamada em grupo", "ru": "Групповой звонок"],
        "noActivity": ["en": "Nothing new. You're all caught up.", "tr": "Yeni bir şey yok, her şeye yetiştin.", "de": "Nichts Neues. Du bist auf dem neuesten Stand.", "es": "Nada nuevo. Estás al día.", "fr": "Rien de neuf. Tu es à jour.", "pt-BR": "Nada de novo. Você está em dia.", "ru": "Ничего нового."],
        "acceptOnPhone": ["en": "Accept requests on your iPhone.", "tr": "İstekleri iPhone'undan kabul edebilirsin.", "de": "Anfragen nimmst du auf dem iPhone an.", "es": "Acepta las solicitudes desde tu iPhone.", "fr": "Accepte les demandes sur ton iPhone.", "pt-BR": "Aceite pedidos pelo iPhone.", "ru": "Принимайте заявки на iPhone."],
        "friendRequest": ["en": "Sent you a friend request", "tr": "Sana arkadaşlık isteği gönderdi", "de": "Hat dir eine Freundschaftsanfrage geschickt", "es": "Te envió una solicitud de amistad", "fr": "T'a envoyé une demande d'ami", "pt-BR": "Te enviou um pedido de amizade", "ru": "Отправил(а) вам заявку в друзья"],
        "requestsHeader": ["en": "Requests · {n}", "tr": "İstekler · {n}", "de": "Anfragen · {n}", "es": "Solicitudes · {n}", "fr": "Demandes · {n}", "pt-BR": "Pedidos · {n}", "ru": "Заявки · {n}"],
        "missedHeader": ["en": "Missed calls · {n}", "tr": "Cevapsız aramalar · {n}", "de": "Verpasste Anrufe · {n}", "es": "Llamadas perdidas · {n}", "fr": "Appels manqués · {n}", "pt-BR": "Chamadas perdidas · {n}", "ru": "Пропущенные · {n}"],
        "iphoneConnected": ["en": "iPhone connected", "tr": "iPhone bağlı", "de": "iPhone verbunden", "es": "iPhone conectado", "fr": "iPhone connecté", "pt-BR": "iPhone conectado", "ru": "iPhone подключён"],
        "iphoneAway": ["en": "iPhone out of reach", "tr": "iPhone'una ulaşılamıyor", "de": "iPhone nicht erreichbar", "es": "iPhone fuera de alcance", "fr": "iPhone hors de portée", "pt-BR": "iPhone fora de alcance", "ru": "iPhone вне зоны"],
        "refreshAll": ["en": "Refresh everything", "tr": "Hepsini yenile", "de": "Alles aktualisieren", "es": "Actualizar todo", "fr": "Tout actualiser", "pt-BR": "Atualizar tudo", "ru": "Обновить всё"],
        "version": ["en": "Version", "tr": "Sürüm", "de": "Version", "es": "Versión", "fr": "Version", "pt-BR": "Versão", "ru": "Версия"],
        "language": ["en": "Language", "tr": "Dil", "de": "Sprache", "es": "Idioma", "fr": "Langue", "pt-BR": "Idioma", "ru": "Язык"],
        "live": ["en": "Live", "tr": "Canlı", "de": "Live", "es": "En vivo", "fr": "En direct", "pt-BR": "Ao vivo", "ru": "Сейчас"],
        "growth": ["en": "Growth", "tr": "Büyüme", "de": "Wachstum", "es": "Crecimiento", "fr": "Croissance", "pt-BR": "Crescimento", "ru": "Рост"],
        "safety": ["en": "Safety", "tr": "Güvenlik", "de": "Sicherheit", "es": "Seguridad", "fr": "Sécurité", "pt-BR": "Segurança", "ru": "Безопасность"],
        "system": ["en": "System", "tr": "Sistem", "de": "System", "es": "Sistema", "fr": "Système", "pt-BR": "Sistema", "ru": "Система"],
        "visible": ["en": "Visible", "tr": "Görünür", "de": "Sichtbar", "es": "Visibles", "fr": "Visibles", "pt-BR": "Visíveis", "ru": "Видимые"],
        "invisibleCount": ["en": "Invisible", "tr": "Görünmez", "de": "Unsichtbar", "es": "Invisibles", "fr": "Invisibles", "pt-BR": "Invisíveis", "ru": "Невидимые"],
        "signups7d": ["en": "Sign-ups, last 7 days", "tr": "Son 7 gün kayıt", "de": "Registrierungen, 7 Tage", "es": "Registros, últimos 7 días", "fr": "Inscriptions, 7 derniers jours", "pt-BR": "Cadastros, últimos 7 dias", "ru": "Регистрации за 7 дней"],
        "feedbackActive": ["en": "Feedback in progress", "tr": "İşlemdeki geri bildirim", "de": "Feedback in Bearbeitung", "es": "Comentarios en curso", "fr": "Retours en cours", "pt-BR": "Feedback em andamento", "ru": "Отзывы в работе"],
        "reportedPeople": ["en": "Reported people", "tr": "Raporlanan kişi", "de": "Gemeldete Personen", "es": "Personas reportadas", "fr": "Personnes signalées", "pt-BR": "Pessoas denunciadas", "ru": "Пользователи с жалобами"],
        "bans": ["en": "Active bans", "tr": "Aktif ban", "de": "Aktive Sperren", "es": "Baneos activos", "fr": "Bannissements actifs", "pt-BR": "Banimentos ativos", "ru": "Активные баны"],
        "timeouts": ["en": "Timeouts", "tr": "Zaman aşımı", "de": "Timeouts", "es": "Aislamientos", "fr": "Exclusions", "pt-BR": "Castigos", "ru": "Тайм-ауты"],
        "uptime": ["en": "Uptime", "tr": "Çalışma süresi", "de": "Laufzeit", "es": "Tiempo activo", "fr": "Disponibilité", "pt-BR": "Tempo ativo", "ru": "Аптайм"],
        "memory": ["en": "Memory", "tr": "Bellek", "de": "Speicher", "es": "Memoria", "fr": "Mémoire", "pt-BR": "Memória", "ru": "Память"],
        "errorsHour": ["en": "Errors, last hour", "tr": "Son 1 saatte hata", "de": "Fehler, letzte Stunde", "es": "Errores, última hora", "fr": "Erreurs, dernière heure", "pt-BR": "Erros, última hora", "ru": "Ошибки за час"],
        "flagged": ["en": "Flagged messages", "tr": "İşaretli mesaj", "de": "Markierte Nachrichten", "es": "Mensajes marcados", "fr": "Messages signalés", "pt-BR": "Mensagens sinalizadas", "ru": "Отмеченные сообщения"],
        "chatFrozen": ["en": "Chat frozen", "tr": "Sohbet donduruldu", "de": "Chat eingefroren", "es": "Chat congelado", "fr": "Chat gelé", "pt-BR": "Chat congelado", "ru": "Чат заморожен"],
        "recentAudit": ["en": "Recent actions", "tr": "Son işlemler", "de": "Letzte Aktionen", "es": "Acciones recientes", "fr": "Actions récentes", "pt-BR": "Ações recentes", "ru": "Последние действия"],
        "newlyJoined": ["en": "Newly joined", "tr": "Yeni katılanlar", "de": "Neu dabei", "es": "Recién llegados", "fr": "Nouveaux membres", "pt-BR": "Novos membros", "ru": "Новые участники"],
        "autoRefresh": ["en": "Refreshes by itself every minute", "tr": "Her dakika kendiliğinden yenilenir", "de": "Aktualisiert sich jede Minute", "es": "Se actualiza solo cada minuto", "fr": "Se met à jour chaque minute", "pt-BR": "Atualiza sozinho a cada minuto", "ru": "Обновляется каждую минуту"],
        "sections": ["en": "Sections", "tr": "Bölümler", "de": "Bereiche", "es": "Secciones", "fr": "Sections", "pt-BR": "Seções", "ru": "Разделы"],
        "health.ok": ["en": "All good", "tr": "Her şey yolunda", "de": "Alles in Ordnung", "es": "Todo bien", "fr": "Tout va bien", "pt-BR": "Tudo certo", "ru": "Всё в порядке"],
        "health.watch": ["en": "Keep an eye on it", "tr": "Göz kulak ol", "de": "Im Auge behalten", "es": "Vigílalo", "fr": "À surveiller", "pt-BR": "Fique de olho", "ru": "Под наблюдением"],
        "health.high": ["en": "Needs attention", "tr": "İlgilenmen gerek", "de": "Braucht Aufmerksamkeit", "es": "Requiere atención", "fr": "Demande ton attention", "pt-BR": "Precisa de atenção", "ru": "Нужно внимание"],
        "health.critical": ["en": "Critical", "tr": "Kritik", "de": "Kritisch", "es": "Crítico", "fr": "Critique", "pt-BR": "Crítico", "ru": "Критично"],
        "ago.day.few": ["ru": "{n} дня назад"],
        "ago.day.many": ["ru": "{n} дней назад"],
        "members.few": ["ru": "{n} участника"],
        "members.many": ["ru": "{n} участников"],
    ]
}
