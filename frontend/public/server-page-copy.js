/**
 * Text of the public server page (descall.com/s/<slug>) and of the generated invite
 * preview images, in the 7 site languages. Plain data, no imports, no top-level await:
 * the Pages worker bundles it (server-page.js), the backend requires it for the
 * 1200x630 images (lib/publicPageOg.js, Node 24 require(esm)), and the owner desk
 * imports it for its live preview.
 *
 * Category and language names must equal src/i18n/locales/dir.<lang>.js (cat / lang);
 * src/site/serverPage.selftest.mjs compares them.
 */

export const PAGE_LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

const CAT = {
  tr: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS ve nişancı oyunları", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Diğer oyunlar", study: "Ders çalışma", music: "Müzik", art: "Sanat", tech: "Teknoloji", anime: "Anime", sports: "Spor", "chat-friends": "Sohbet ve arkadaşlık", other: "Diğer" },
  en: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS and shooters", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Other games", study: "Study", music: "Music", art: "Art", tech: "Tech", anime: "Anime", sports: "Sports", "chat-friends": "Chat and friends", other: "Other" },
  de: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS und Shooter", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Andere Spiele", study: "Lernen", music: "Musik", art: "Kunst", tech: "Technik", anime: "Anime", sports: "Sport", "chat-friends": "Chat und Freunde", other: "Sonstiges" },
  es: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS y shooters", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Otros juegos", study: "Estudio", music: "Música", art: "Arte", tech: "Tecnología", anime: "Anime", sports: "Deportes", "chat-friends": "Charla y amigos", other: "Otros" },
  fr: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS et jeux de tir", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Autres jeux", study: "Études", music: "Musique", art: "Art", tech: "Tech", anime: "Anime", sports: "Sport", "chat-friends": "Discussion et amis", other: "Autre" },
  "pt-BR": { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS e jogos de tiro", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Outros jogos", study: "Estudos", music: "Música", art: "Arte", tech: "Tecnologia", anime: "Anime", sports: "Esportes", "chat-friends": "Conversa e amizades", other: "Outros" },
  ru: { "gaming-minecraft": "Minecraft", "gaming-fps": "FPS и шутеры", "gaming-cs2": "Counter-Strike 2", "gaming-lol": "League of Legends", "gaming-other": "Другие игры", study: "Учёба", music: "Музыка", art: "Искусство", tech: "Технологии", anime: "Аниме", sports: "Спорт", "chat-friends": "Общение и друзья", other: "Другое" },
};

const LANG = {
  tr: { tr: "Türkçe", en: "İngilizce", de: "Almanca", es: "İspanyolca", fr: "Fransızca", "pt-BR": "Portekizce", ru: "Rusça", other: "Diğer dil" },
  en: { tr: "Turkish", en: "English", de: "German", es: "Spanish", fr: "French", "pt-BR": "Portuguese", ru: "Russian", other: "Other language" },
  de: { tr: "Türkisch", en: "Englisch", de: "Deutsch", es: "Spanisch", fr: "Französisch", "pt-BR": "Portugiesisch", ru: "Russisch", other: "Andere Sprache" },
  es: { tr: "Turco", en: "Inglés", de: "Alemán", es: "Español", fr: "Francés", "pt-BR": "Portugués", ru: "Ruso", other: "Otro idioma" },
  fr: { tr: "Turc", en: "Anglais", de: "Allemand", es: "Espagnol", fr: "Français", "pt-BR": "Portugais", ru: "Russe", other: "Autre langue" },
  "pt-BR": { tr: "Turco", en: "Inglês", de: "Alemão", es: "Espanhol", fr: "Francês", "pt-BR": "Português", ru: "Russo", other: "Outro idioma" },
  ru: { tr: "Турецкий", en: "Английский", de: "Немецкий", es: "Испанский", fr: "Французский", "pt-BR": "Португальский", ru: "Русский", other: "Другой язык" },
};

/**
 * {n}, {name}, {cat} are replaced by fill(). Every language has every key
 * (serverPage.selftest.mjs checks it).
 */
export const PAGE_COPY = {
  tr: {
    intl: "tr-TR", ogLocale: "tr_TR",
    navCommunities: "Topluluklar", navFeatures: "Özellikler", navDownload: "İndir",
    login: "Giriş yap", signup: "Ücretsiz kaydol", openInApp: "Uygulamada aç",
    online: "çevrimiçi", members: "üye", inVoice: "kişi seste",
    join: "Sunucuya katıl", joinSub: "Ücretsiz · Uygulama varsa doğrudan açılır", share: "Paylaş", copied: "Bağlantı kopyalandı",
    opening: "Descall açılıyor…", continueWeb: "Uygulama açılmadı mı? Web'de devam et",
    thankWall: "Teşekkür duvarı", wallMeta: "Seviye {level} · {n} takviye", wallSince: "{date} tarihinden beri",
    about: "Hakkında", upcoming: "Yaklaşan etkinlik", rules: "Kurallar özeti", pinned: "Sabit duyuru",
    channels: "Kanallar", publicCount: "{n} herkese açık", textChannels: "Yazı kanalları", voiceChannels: "Ses kanalları",
    people: "{n} kişi", channelsNote: "Yalnızca kanal adları gösterilir. Mesajlar herkese açık değildir.",
    qrTitle: "Telefonda aç", qrBody: "Kamerayla okut, Descall uygulamasında doğrudan bu sunucuya git.",
    footer: "Bu sayfayı sunucunun sahibi herkese açtı. Mesajlar herkese açık değildir.", footerShort: "Sahibi bu sayfayı herkese açtı.",
    report: "Bu sayfayı bildir", privacy: "Gizlilik", online_place: "Çevrimiçi",
    defaultTitle: "{name} · Descall'da katıl", defaultDescription: "{name} Descall'da: sesli sohbet, kanallar ve etkinlikler. Katılmak ücretsiz.",
    catTitle: "{name} · {cat} sunucusu", breadcrumbHome: "Descall",
    ogServer: "SUNUCU DAVETİ", ogGroup: "GRUP DAVETİ", ogInvalidEyebrow: "DAVET",
    ogInvited: "{name} seni bu gruba davet etti.", ogGroupNoInviter: "Bu gruba davet edildin.",
    ogInvalidTitle: "Bu davet artık geçerli değil", ogInvalidBody: "Süresi dolmuş ya da kaldırılmış olabilir. Gönderen kişiden yeni bir bağlantı iste.",
    invalidMetaTitle: "Davet geçersiz · Descall", invalidMetaDesc: "Bu davet bağlantısının süresi dolmuş ya da kaldırılmış. Gönderen kişiden yeni bir bağlantı iste.",
    reportSubject: "Herkese açık sunucu sayfası bildirimi",
  },
  en: {
    intl: "en-US", ogLocale: "en_US",
    navCommunities: "Communities", navFeatures: "Features", navDownload: "Download",
    login: "Log in", signup: "Sign up free", openInApp: "Open in app",
    online: "online", members: "members", inVoice: "in voice",
    join: "Join server", joinSub: "Free · Opens the app if you have it", share: "Share", copied: "Link copied",
    opening: "Opening Descall…", continueWeb: "App did not open? Continue on the web",
    thankWall: "Thank-you wall", wallMeta: "Level {level} · {n} boosts", wallSince: "since {date}",
    about: "About", upcoming: "Upcoming events", rules: "Rules at a glance", pinned: "Pinned note",
    channels: "Channels", publicCount: "{n} public", textChannels: "Text channels", voiceChannels: "Voice channels",
    people: "{n} people", channelsNote: "Only channel names are shown. Messages are never public.",
    qrTitle: "Open on your phone", qrBody: "Scan with your camera to open this server in the Descall app.",
    footer: "The owner of this server made this page public. Messages are never public.", footerShort: "The owner made this page public.",
    report: "Report this page", privacy: "Privacy", online_place: "Online",
    defaultTitle: "{name} · Join on Descall", defaultDescription: "{name} on Descall: voice chat, channels and events. Free to join.",
    catTitle: "{name} · {cat} server", breadcrumbHome: "Descall",
    ogServer: "SERVER INVITE", ogGroup: "GROUP INVITE", ogInvalidEyebrow: "INVITE",
    ogInvited: "{name} invited you to this group.", ogGroupNoInviter: "You are invited to this group.",
    ogInvalidTitle: "This invite is no longer valid", ogInvalidBody: "It may have expired or been removed. Ask the sender for a new link.",
    invalidMetaTitle: "Invite not valid · Descall", invalidMetaDesc: "This invite link has expired or was removed. Ask the sender for a new link.",
    reportSubject: "Public server page report",
  },
  de: {
    intl: "de-DE", ogLocale: "de_DE",
    navCommunities: "Communitys", navFeatures: "Funktionen", navDownload: "Download",
    login: "Anmelden", signup: "Kostenlos registrieren", openInApp: "In der App öffnen",
    online: "online", members: "Mitglieder", inVoice: "im Sprachkanal",
    join: "Server beitreten", joinSub: "Kostenlos · Öffnet die App, wenn sie installiert ist", share: "Teilen", copied: "Link kopiert",
    opening: "Descall wird geöffnet…", continueWeb: "App nicht geöffnet? Im Web weiter",
    thankWall: "Dankeswand", wallMeta: "Stufe {level} · {n} Boosts", wallSince: "seit {date}",
    about: "Über den Server", upcoming: "Anstehende Events", rules: "Regeln im Überblick", pinned: "Angeheftete Notiz",
    channels: "Kanäle", publicCount: "{n} öffentlich", textChannels: "Textkanäle", voiceChannels: "Sprachkanäle",
    people: "{n} Personen", channelsNote: "Nur Kanalnamen werden angezeigt. Nachrichten sind nie öffentlich.",
    qrTitle: "Auf dem Handy öffnen", qrBody: "Mit der Kamera scannen und den Server direkt in der Descall-App öffnen.",
    footer: "Der Besitzer dieses Servers hat diese Seite öffentlich gemacht. Nachrichten sind nie öffentlich.", footerShort: "Der Besitzer hat diese Seite öffentlich gemacht.",
    report: "Seite melden", privacy: "Datenschutz", online_place: "Online",
    defaultTitle: "{name} · Auf Descall beitreten", defaultDescription: "{name} auf Descall: Sprachchat, Kanäle und Events. Kostenlos beitreten.",
    catTitle: "{name} · {cat}-Server", breadcrumbHome: "Descall",
    ogServer: "SERVER-EINLADUNG", ogGroup: "GRUPPEN-EINLADUNG", ogInvalidEyebrow: "EINLADUNG",
    ogInvited: "{name} hat dich in diese Gruppe eingeladen.", ogGroupNoInviter: "Du bist in diese Gruppe eingeladen.",
    ogInvalidTitle: "Diese Einladung gilt nicht mehr", ogInvalidBody: "Sie ist abgelaufen oder wurde entfernt. Bitte die Person um einen neuen Link.",
    invalidMetaTitle: "Einladung ungültig · Descall", invalidMetaDesc: "Dieser Einladungslink ist abgelaufen oder wurde entfernt. Bitte die Person um einen neuen Link.",
    reportSubject: "Meldung einer öffentlichen Serverseite",
  },
  es: {
    intl: "es-ES", ogLocale: "es_ES",
    navCommunities: "Comunidades", navFeatures: "Funciones", navDownload: "Descargar",
    login: "Iniciar sesión", signup: "Regístrate gratis", openInApp: "Abrir en la app",
    online: "en línea", members: "miembros", inVoice: "en voz",
    join: "Unirse al servidor", joinSub: "Gratis · Abre la app si la tienes", share: "Compartir", copied: "Enlace copiado",
    opening: "Abriendo Descall…", continueWeb: "¿No se abrió la app? Continúa en la web",
    thankWall: "Muro de agradecimientos", wallMeta: "Nivel {level} · {n} impulsos", wallSince: "desde {date}",
    about: "Acerca de", upcoming: "Próximos eventos", rules: "Resumen de reglas", pinned: "Nota fijada",
    channels: "Canales", publicCount: "{n} públicos", textChannels: "Canales de texto", voiceChannels: "Canales de voz",
    people: "{n} personas", channelsNote: "Solo se muestran los nombres de los canales. Los mensajes nunca son públicos.",
    qrTitle: "Abrir en el móvil", qrBody: "Escanea con la cámara para abrir este servidor en la app de Descall.",
    footer: "El propietario de este servidor hizo pública esta página. Los mensajes nunca son públicos.", footerShort: "El propietario hizo pública esta página.",
    report: "Denunciar esta página", privacy: "Privacidad", online_place: "En línea",
    defaultTitle: "{name} · Únete en Descall", defaultDescription: "{name} en Descall: chat de voz, canales y eventos. Unirse es gratis.",
    catTitle: "{name} · servidor de {cat}", breadcrumbHome: "Descall",
    ogServer: "INVITACIÓN A SERVIDOR", ogGroup: "INVITACIÓN A GRUPO", ogInvalidEyebrow: "INVITACIÓN",
    ogInvited: "{name} te invitó a este grupo.", ogGroupNoInviter: "Te invitaron a este grupo.",
    ogInvalidTitle: "Esta invitación ya no es válida", ogInvalidBody: "Puede que haya caducado o se haya eliminado. Pide un enlace nuevo a quien te la envió.",
    invalidMetaTitle: "Invitación no válida · Descall", invalidMetaDesc: "Este enlace de invitación caducó o se eliminó. Pide un enlace nuevo a quien te lo envió.",
    reportSubject: "Denuncia de página pública de servidor",
  },
  fr: {
    intl: "fr-FR", ogLocale: "fr_FR",
    navCommunities: "Communautés", navFeatures: "Fonctionnalités", navDownload: "Télécharger",
    login: "Se connecter", signup: "S'inscrire gratuitement", openInApp: "Ouvrir dans l'app",
    online: "en ligne", members: "membres", inVoice: "en vocal",
    join: "Rejoindre le serveur", joinSub: "Gratuit · Ouvre l'app si elle est installée", share: "Partager", copied: "Lien copié",
    opening: "Ouverture de Descall…", continueWeb: "L'app ne s'est pas ouverte ? Continuer sur le web",
    thankWall: "Mur des remerciements", wallMeta: "Niveau {level} · {n} boosts", wallSince: "depuis {date}",
    about: "À propos", upcoming: "Événements à venir", rules: "Règles en bref", pinned: "Note épinglée",
    channels: "Salons", publicCount: "{n} publics", textChannels: "Salons textuels", voiceChannels: "Salons vocaux",
    people: "{n} personnes", channelsNote: "Seuls les noms des salons sont affichés. Les messages ne sont jamais publics.",
    qrTitle: "Ouvrir sur le téléphone", qrBody: "Scannez avec l'appareil photo pour ouvrir ce serveur dans l'app Descall.",
    footer: "Le propriétaire de ce serveur a rendu cette page publique. Les messages ne sont jamais publics.", footerShort: "Le propriétaire a rendu cette page publique.",
    report: "Signaler cette page", privacy: "Confidentialité", online_place: "En ligne",
    defaultTitle: "{name} · Rejoindre sur Descall", defaultDescription: "{name} sur Descall : chat vocal, salons et événements. Gratuit.",
    catTitle: "{name} · serveur {cat}", breadcrumbHome: "Descall",
    ogServer: "INVITATION SERVEUR", ogGroup: "INVITATION DE GROUPE", ogInvalidEyebrow: "INVITATION",
    ogInvited: "{name} t'a invité dans ce groupe.", ogGroupNoInviter: "Tu es invité dans ce groupe.",
    ogInvalidTitle: "Cette invitation n'est plus valide", ogInvalidBody: "Elle a peut-être expiré ou été supprimée. Demande un nouveau lien à la personne qui l'a envoyée.",
    invalidMetaTitle: "Invitation non valide · Descall", invalidMetaDesc: "Ce lien d'invitation a expiré ou a été supprimé. Demande un nouveau lien à la personne qui l'a envoyé.",
    reportSubject: "Signalement d'une page publique de serveur",
  },
  "pt-BR": {
    intl: "pt-BR", ogLocale: "pt_BR",
    navCommunities: "Comunidades", navFeatures: "Recursos", navDownload: "Baixar",
    login: "Entrar", signup: "Cadastre-se grátis", openInApp: "Abrir no app",
    online: "online", members: "membros", inVoice: "na voz",
    join: "Entrar no servidor", joinSub: "Grátis · Abre o app se você tiver", share: "Compartilhar", copied: "Link copiado",
    opening: "Abrindo o Descall…", continueWeb: "O app não abriu? Continue na web",
    thankWall: "Mural de agradecimentos", wallMeta: "Nível {level} · {n} impulsos", wallSince: "desde {date}",
    about: "Sobre", upcoming: "Próximos eventos", rules: "Regras em resumo", pinned: "Aviso fixado",
    channels: "Canais", publicCount: "{n} públicos", textChannels: "Canais de texto", voiceChannels: "Canais de voz",
    people: "{n} pessoas", channelsNote: "Só os nomes dos canais aparecem. As mensagens nunca são públicas.",
    qrTitle: "Abrir no celular", qrBody: "Escaneie com a câmera para abrir este servidor no app do Descall.",
    footer: "O dono deste servidor tornou esta página pública. As mensagens nunca são públicas.", footerShort: "O dono tornou esta página pública.",
    report: "Denunciar esta página", privacy: "Privacidade", online_place: "Online",
    defaultTitle: "{name} · Entre no Descall", defaultDescription: "{name} no Descall: chat de voz, canais e eventos. Entrar é grátis.",
    catTitle: "{name} · servidor de {cat}", breadcrumbHome: "Descall",
    ogServer: "CONVITE DE SERVIDOR", ogGroup: "CONVITE DE GRUPO", ogInvalidEyebrow: "CONVITE",
    ogInvited: "{name} convidou você para este grupo.", ogGroupNoInviter: "Você foi convidado para este grupo.",
    ogInvalidTitle: "Este convite não é mais válido", ogInvalidBody: "Ele pode ter expirado ou sido removido. Peça um link novo a quem enviou.",
    invalidMetaTitle: "Convite inválido · Descall", invalidMetaDesc: "Este link de convite expirou ou foi removido. Peça um link novo a quem enviou.",
    reportSubject: "Denúncia de página pública de servidor",
  },
  ru: {
    intl: "ru-RU", ogLocale: "ru_RU",
    navCommunities: "Сообщества", navFeatures: "Возможности", navDownload: "Скачать",
    login: "Войти", signup: "Регистрация бесплатно", openInApp: "Открыть в приложении",
    online: "в сети", members: "участников", inVoice: "в голосовых",
    join: "Присоединиться", joinSub: "Бесплатно · Откроет приложение, если оно установлено", share: "Поделиться", copied: "Ссылка скопирована",
    opening: "Открываем Descall…", continueWeb: "Приложение не открылось? Продолжить в браузере",
    thankWall: "Стена благодарностей", wallMeta: "Уровень {level} · {n} бустов", wallSince: "с {date}",
    about: "О сервере", upcoming: "Ближайшие события", rules: "Кратко о правилах", pinned: "Закреплённая заметка",
    channels: "Каналы", publicCount: "открытых: {n}", textChannels: "Текстовые каналы", voiceChannels: "Голосовые каналы",
    people: "{n} чел.", channelsNote: "Показаны только названия каналов. Сообщения никогда не публикуются.",
    qrTitle: "Открыть на телефоне", qrBody: "Отсканируйте камерой, чтобы открыть сервер в приложении Descall.",
    footer: "Владелец сервера сделал эту страницу открытой. Сообщения никогда не публикуются.", footerShort: "Владелец сделал эту страницу открытой.",
    report: "Пожаловаться", privacy: "Конфиденциальность", online_place: "Онлайн",
    defaultTitle: "{name} · Присоединяйтесь в Descall", defaultDescription: "{name} в Descall: голосовой чат, каналы и события. Вход бесплатный.",
    catTitle: "{name} · сервер: {cat}", breadcrumbHome: "Descall",
    ogServer: "ПРИГЛАШЕНИЕ НА СЕРВЕР", ogGroup: "ПРИГЛАШЕНИЕ В ГРУППУ", ogInvalidEyebrow: "ПРИГЛАШЕНИЕ",
    ogInvited: "{name} приглашает вас в эту группу.", ogGroupNoInviter: "Вас пригласили в эту группу.",
    ogInvalidTitle: "Это приглашение больше не действует", ogInvalidBody: "Возможно, оно истекло или было удалено. Попросите отправителя прислать новую ссылку.",
    invalidMetaTitle: "Приглашение недействительно · Descall", invalidMetaDesc: "Срок действия ссылки истёк или она удалена. Попросите отправителя прислать новую.",
    reportSubject: "Жалоба на открытую страницу сервера",
  },
};

/** Site language for a page: the server's own language when it is one of ours, else en. */
export function pageLang(value) {
  const v = String(value || "");
  if (PAGE_LANGS.includes(v)) return v;
  const base = v.toLowerCase().split("-")[0];
  if (base === "pt") return "pt-BR";
  return PAGE_LANGS.includes(base) ? base : "en";
}

/** Best of our 7 languages from an Accept-Language header (fallback en). */
export function acceptLang(header) {
  let best = { lang: "en", q: -1 };
  for (const part of String(header || "").split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const t = tag.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    const base = lower.split("-")[0];
    const lang = base === "pt" ? "pt-BR" : PAGE_LANGS.includes(base) ? base : null;
    if (!lang) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isFinite(q) && q > best.q) best = { lang, q };
  }
  return best.lang;
}

export function copyFor(lang) {
  return PAGE_COPY[pageLang(lang)] || PAGE_COPY.en;
}

export function categoryLabel(lang, category) {
  const l = pageLang(lang);
  return (CAT[l] || CAT.en)[category] || null;
}

export function languageLabel(lang, code) {
  const l = pageLang(lang);
  return (LANG[l] || LANG.en)[code] || null;
}

/** "{name} joined" -> "Ece joined". Unknown keys stay as they are. */
export function fill(template, vars = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

export const CATEGORY_LABELS = CAT;
export const LANGUAGE_LABELS = LANG;
