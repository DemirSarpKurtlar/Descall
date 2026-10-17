/**
 * Extra long-form copy for pages that were thin (home, /tr, gamers, download).
 * Rendered both in the React page (SeoExtraContent) and in the prerendered
 * #seo-static shell, so crawlers and users see the same text.
 * Only describe features Descall ships today.
 */

const TR_HUBS = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri karşılaştırması" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı? Güncel durum" },
  { to: "/tr/turk-discord", label: "Türk Discord’u" },
  { to: "/tr/discord-yerine-ne-kullanilir", label: "Discord yerine ne kullanılır?" },
  { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
  { to: "/tr/oyuncu-sohbet-uygulamasi", label: "Oyuncu sohbet uygulaması" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog", label: "Türkçe blog ve rehberler" },
];

export const PAGE_EXTRAS = {
  "/": {
    sections: [
      {
        h: "What Descall is",
        p: [
          "Descall is a free chat and calling app for friend groups, gaming squads, study groups, and small communities. It combines direct messages, group chats, and Discord-style servers with voice channels, video calls, and screen sharing, in one account that works on Windows, Android, and in the browser.",
          "It is built and owned by Demir Sarp Kurtlar, an independent developer in Turkey, and it is currently in beta. Core communication is free: there is no subscription for voice quality, screen share, or servers. The only thing for sale is optional cosmetics bought with DesCoin.",
        ],
      },
      {
        h: "Voice that stays open",
        p: [
          "Calls on Descall are not one-off rings. A server can have as many voice channels as you want, and they stay there: friends drop in when they are free and leave when they are done. You can also start a one-to-one or group call straight from a DM. Voice and video run on WebRTC, encrypted in transit with DTLS/SRTP, with TURN relays so calls connect on difficult networks. Optional noise suppression cuts keyboard and fan noise.",
        ],
      },
      {
        h: "Screen share with quality presets",
        p: [
          "Share your screen in a DM call, a group call, or a server voice channel. Presets let you favour smooth motion for games or sharp text for code, slides, and homework. It is the same free feature for everyone.",
        ],
      },
      {
        h: "Servers, roles, and templates",
        p: [
          "Servers have categories, text channels, voice channels, and stage channels. Roles control who sees and writes where, with per-channel overrides for staff rooms and announcement channels. Templates for Gaming, Community, Study, Friends, and Streaming set all of this up in one click. Moderators get kick, ban, timeout, an audit log, community rules, and invite links.",
        ],
      },
      {
        h: "Find a team without bots",
        p: [
          "The Play tab is a built-in LFG space: open a lobby or join one, then move into voice with the same account. No separate LFG server and no bot commands to learn.",
        ],
      },
      {
        h: "Where Descall fits, honestly",
        p: [
          "Descall is a strong fit for groups of people who already know each other and want reliable voice, tidy servers, and screen share for free. It does not have Discord’s bot marketplace or tools for huge public servers. If your community depends on those, Discord is still the bigger ecosystem; if you mainly talk, play, and study together, Descall covers it.",
        ],
      },
    ],
    links: [
      { to: "/discord-alternative", label: "Discord alternative" },
      { to: "/compare/discord", label: "Descall vs Discord" },
      { to: "/best-discord-alternative-for-gamers", label: "For gamers" },
      { to: "/download", label: "Download" },
      { to: "/tr", label: "Türkçe" },
    ],
  },

  "/tr": {
    sections: [
      {
        h: "Descall nedir?",
        p: [
          "Descall; arkadaş grupları, oyun ekipleri, ders grupları ve küçük topluluklar için ücretsiz bir sohbet ve arama uygulamasıdır. Özel mesajları, grup sohbetlerini ve Discord tarzı sunucuları; ses kanalları, görüntülü arama ve ekran paylaşımıyla tek bir hesapta birleştirir. Windows, Android ve tarayıcıda çalışır.",
          "Descall’ı Türkiye’de bağımsız bir geliştirici olan Demir Sarp Kurtlar geliştiriyor ve uygulama şu an beta aşamasında. Temel iletişim ücretsiz: ses kalitesi, ekran paylaşımı veya sunucular için abonelik yok. Satılan tek şey DesCoin ile alınan isteğe bağlı kozmetikler.",
        ],
      },
      {
        h: "Discord’a erişemeyenler için",
        p: [
          "Discord, 9 Ekim 2024’ten bu yana Türkiye’de mahkeme kararıyla erişime kapalı. Her akşam aynı ses kanalında buluşan gruplar için Descall, Türkiye’den doğrudan erişilebilen ve Türkçe kullanılabilen bir seçenek. Sunucu, kanal, rol ve ses odası gibi kavramlar Discord kullanıcılarına tanıdık gelir; şablonlarla sunucunu dakikalar içinde yeniden kurabilirsin.",
        ],
      },
      {
        h: "Kalıcı ses kanalları ve ekran paylaşımı",
        p: [
          "Sunucundaki ses kanalları her zaman açıktır; arkadaşların müsait olduğunda girer, işi bitince çıkar. DM’den birebir veya grup araması da başlatabilirsin. Ses ve görüntü WebRTC ile taşınır ve aktarım sırasında DTLS/SRTP ile şifrelenir. İsteğe bağlı gürültü azaltma klavye ve fan sesini bastırır. Ekran paylaşımında oyun için akıcılığı, ders veya sunum için netliği öncelikleyen ön ayarlar var.",
        ],
      },
      {
        h: "Sunucular, roller ve LFG",
        p: [
          "Sunucularda kategoriler, yazı, ses ve sahne kanalları bulunur. Roller ve kanal izinleriyle yetkili odalarını ve duyuru kanallarını düzenlersin. Oyun, Topluluk, Ders, Arkadaşlar ve Yayın şablonları bunları tek tıkla kurar. Play sekmesindeki LFG lobileriyle bot kurmadan takım arkadaşı bulursun.",
        ],
      },
      {
        h: "Türkçe rehberler",
        p: [
          "Discord’un Türkiye’deki durumu, alternatiflerin dürüst karşılaştırması ve geçiş adımları için hazırladığımız Türkçe sayfalar:",
        ],
      },
    ],
    links: TR_HUBS,
  },

  "/best-discord-alternative-for-gamers": {
    sections: [
      {
        h: "What gamers actually need from a chat app",
        p: [
          "Clear, low-latency voice. Channels you can drop into without ringing anyone. Screen share that does not turn a replay into a slideshow. A way to find a fifth player without joining yet another LFG server. And for clans, some structure: roles, a staff room, and an announcements channel only leaders can post in.",
          "Descall puts those pieces in one free app. You do not need a subscription for better voice or screen share, and you do not need bots for LFG or basic moderation.",
        ],
      },
      {
        h: "Set up a clan server in minutes",
        p: [
          "Start from the Gaming template and you get announcements, general chat, clips, voice rooms, a staff room, and Admin / Moderator / Member roles already wired up. Rename channels to match your old server so members find their way. Invite links let new players preview the server and join after signing in.",
        ],
        list: [
          "Info: announcements (leaders only), rules, new members",
          "Chat: general, clips and screenshots, off-topic",
          "Voice: ranked squad 1, ranked squad 2, casual, AFK",
          "Staff: staff chat and staff voice (moderators only)",
          "Events: a stage channel for tournament nights",
        ],
      },
      {
        h: "Voice and screen share while you play",
        p: [
          "Voice channels are persistent, with a speaking indicator, mute, and deafen one click away. Optional noise suppression keeps mechanical keyboards and fans out of your squad’s ears. Screen share has quality presets, so you can favour smooth motion when showing gameplay or sharp detail when going over a strategy. On Windows, the desktop app avoids browser tab throttling and runs quietly in the background.",
        ],
      },
      {
        h: "LFG built in",
        p: [
          "The Play tab lets you open a lobby or join an open one for whatever game you are playing. When you find someone, you move into voice in the same app with the same account, no swapping usernames across three platforms. Many clans also use LFG to meet new regulars and invite them to the clan server.",
        ],
      },
      {
        h: "Honest limits",
        p: [
          "Descall does not have Discord’s bot marketplace (music bots, levelling systems, complex automations), and it is not built for public servers with tens of thousands of members. It is not an in-game overlay either. It is a chat app for squads, clans, and small-to-mid communities that want good voice, tidy servers, and LFG for free.",
        ],
      },
    ],
    links: [
      { to: "/discord-alternative-for-lfg", label: "Discord alternative for LFG" },
      { to: "/blog/best-discord-alternative-for-lfg", label: "Blog: LFG without bots" },
      { to: "/discord-alternative-for-voice-chat", label: "Voice chat alternative" },
      { to: "/download", label: "Download for Windows" },
    ],
  },

  "/download": {
    sections: [
      {
        h: "Which version should I use?",
        p: [
          "Windows desktop app: the best choice if you play or study on a Windows PC. It runs in the background without browser tab throttling, keeps voice steady while you game, and starts with your account already signed in.",
          "Android app: join voice channels, DMs, and servers from your phone. The APK is published with each release on the Descall GitHub releases page.",
          "Browser: nothing to install. Open descall.com, sign in, and you have the full app, handy on a school or work computer or for friends trying Descall for the first time.",
          "All three use the same free account, so your servers, friends, and messages follow you.",
        ],
      },
      {
        h: "Install on Windows",
        p: [
          "1. Download the installer from this page. 2. Run it; Windows SmartScreen may ask for confirmation the first time because Descall is an independent app. 3. Sign in with email or Google. 4. Allow microphone access when you join your first voice channel. The app updates itself when a new version is released.",
        ],
      },
      {
        h: "Before your first call",
        p: [
          "Pick your microphone and output device in voice settings, and turn on noise suppression if you use a mechanical keyboard or have a loud fan. Headphones prevent echo. If your connection is weak, a wired connection or lower screen-share preset helps.",
        ],
      },
      {
        h: "Is it free?",
        p: [
          "Yes. Chat, servers, voice, video, and screen share are free on every platform. Optional cosmetics can be bought with DesCoin; they never gate communication.",
        ],
      },
    ],
    links: [
      { to: "/features", label: "All features" },
      { to: "/faq", label: "FAQ" },
      { to: "/security", label: "Security" },
      { to: "/tr/download", label: "Türkçe: İndir" },
    ],
  },

  "/tr/download": {
    sections: [
      {
        h: "Hangi sürümü kullanmalıyım?",
        p: [
          "Windows masaüstü uygulaması: Windows bilgisayarda oyun oynuyor veya ders çalışıyorsan en iyi seçenek. Tarayıcı sekmelerinin arka planda yavaşlatılması gibi sorunlar yaşamadan arka planda çalışır, oyun sırasında sesi kararlı tutar.",
          "Android uygulaması: ses kanallarına, DM’lere ve sunuculara telefondan katıl. APK her sürümle birlikte Descall’ın GitHub sürümler sayfasında yayımlanır.",
          "Tarayıcı: kurulum yok. descall.com’u aç, giriş yap ve uygulamanın tamamını kullan. Okul veya iş bilgisayarında ya da Descall’ı ilk kez deneyen arkadaşların için pratik.",
          "Üçü de aynı ücretsiz hesabı kullanır; sunucuların, arkadaşların ve mesajların her yerde seninle.",
        ],
      },
      {
        h: "Windows’a kurulum",
        p: [
          "1. Kurulum dosyasını bu sayfadan indir. 2. Çalıştır; Descall bağımsız bir uygulama olduğu için Windows SmartScreen ilk seferde onay isteyebilir. 3. E‑posta veya Google hesabınla giriş yap. 4. İlk ses kanalına girdiğinde mikrofon iznini ver. Yeni sürüm çıktığında uygulama kendini günceller.",
        ],
      },
      {
        h: "İlk aramadan önce",
        p: [
          "Ses ayarlarından mikrofonunu ve çıkış cihazını seç; mekanik klavye veya gürültülü bir fan varsa gürültü azaltmayı aç. Kulaklık yankıyı önler. Bağlantın zayıfsa kablolu bağlantı veya daha düşük bir ekran paylaşımı ön ayarı işe yarar.",
        ],
      },
      {
        h: "Ücretsiz mi?",
        p: [
          "Evet. Sohbet, sunucular, ses, görüntü ve ekran paylaşımı tüm platformlarda ücretsiz. İsteğe bağlı kozmetikler DesCoin ile alınabilir; iletişimi hiçbir zaman kısıtlamaz.",
        ],
      },
    ],
    links: [
      { to: "/tr/features", label: "Tüm özellikler" },
      { to: "/tr/faq", label: "SSS" },
      { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
      { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
    ],
  },
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Static HTML for the prerendered shell. */
export function pageExtrasHtml(routePath) {
  const extra = PAGE_EXTRAS[routePath];
  if (!extra) return "";
  const sections = extra.sections
    .map(
      (s) =>
        `<h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("")}${
          s.list?.length ? `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""
        }`
    )
    .join("\n");
  const links = extra.links?.length
    ? `<ul>${extra.links.map((l) => `<li><a href="${esc(l.to)}">${esc(l.label)}</a></li>`).join("")}</ul>`
    : "";
  return `<section class="seo-extra">${sections}${links}</section>`;
}
