/**
 * Extra long-form copy for pages that were thin (home, /tr, gamers, download).
 * Rendered both in the React page (SeoExtraContent) and in the prerendered
 * #seo-static shell, so crawlers and users see the same text.
 * Only describe features Descall ships today.
 */
import {
  PREFIXABLE_LOCALES,
  isMirrorPath,
  prefixedLocaleFromPath,
  stripPrefixedLocale,
  withLocalePrefix,
} from "../siteLocales.js";
import { siteText } from "../siteText.js";

/** /<prefix> twin of a mirrored English link, other links unchanged. */
function mirrorHref(to, loc) {
  return isMirrorPath(to, loc) ? withLocalePrefix(to, loc) : to;
}

const TR_HUBS = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri karşılaştırması" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı? Son haberler" },
  { to: "/tr/turk-discord", label: "Türkiye’de geliştirilen sohbet uygulaması" },
  { to: "/tr/discord-yerine-ne-kullanilir", label: "Discord yerine ne kullanılır?" },
  { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
  { to: "/tr/oyuncu-sohbet-uygulamasi", label: "Oyuncu sohbet uygulaması" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog/screen-share-with-friends", label: "Ekran paylaşımı rehberi" },
  { to: "/tr/blog/better-mic-sound-voice-chat", label: "Sesli sohbette mikrofon sesini iyileştirmek" },
  { to: "/tr/blog/online-study-group-voice-chat", label: "Online ders çalışma grubu kurmak" },
  { to: "/tr/blog/set-up-a-community-server", label: "Topluluk sunucusu kurmak" },
  { to: "/tr/blog", label: "Türkçe blog ve rehberler" },
];


const EN_HUBS = [
  { to: "/discord-alternative", label: "Free Discord alternative" },
  { to: "/alternatives", label: "Best Discord alternatives compared" },
  { to: "/apps-like-discord", label: "Apps like Discord" },
  { to: "/compare/discord", label: "Discord vs Descall" },
  { to: "/discord-alternative-for-voice-chat", label: "Discord alternative for voice chat" },
  { to: "/discord-alternative-for-communities", label: "Discord alternative for communities" },
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi (Türkçe)" },
  { to: "/download", label: "Download Descall" },
];

/** Comparison pages that mention Discord's status in Türkiye link to the dated sources. */
const EN_HUBS_TR_STATUS = [...EN_HUBS, { to: "/tr/discord-acildi-mi", label: "Discord in Türkiye: dated reports (Turkish)" }];

export const PAGE_EXTRAS = {
  "/": {
    sections: [
      {
        h: "What Descall is",
        p: [
          "Descall is a free chat and calling app for friend groups, gaming squads, study groups, and small communities. It combines direct messages, group chats, and Discord-style servers with voice channels, video calls, and screen sharing, in one account that works on Windows, iPhone and iPad, Android, and in the browser.",
          "It is built and owned by Demir Sarp Kurtlar, an independent developer in Turkey, and it is currently in beta. Core communication is free: calls, screen share and servers do not need a membership. Descall+ and Descall Ultra are optional memberships that add extra tools, most of them in the desktop app, such as mini mode, global shortcuts and audio controls. Cosmetics in the shop are optional and paid with DesCoin you earn in the app.",
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
        h: "Gaming servers without bots",
        p: [
          "The Gaming template sets up squad-up, clip, and scrim channels with staff roles in one click, then everyone moves into voice with the same account. No bot commands to learn.",
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
      { to: "/blog/screen-share-with-friends", label: "Screen sharing with friends: a guide" },
      { to: "/blog/online-study-group-voice-chat", label: "Run an online study group" },
      { to: "/blog/set-up-a-community-server", label: "Set up a community server" },
      { to: "/blog/private-group-chat-guide", label: "How private is your group chat?" },
      { to: "/download", label: "Download" },
      { to: "/tr", label: "Türkçe" },
    ],
  },

  "/tr": {
    sections: [
      {
        h: "Descall nedir?",
        p: [
          "Descall; arkadaş grupları, oyun ekipleri, ders grupları ve küçük topluluklar için ücretsiz bir sohbet ve arama uygulamasıdır. Özel mesajları, grup sohbetlerini ve Discord tarzı sunucuları; ses kanalları, görüntülü arama ve ekran paylaşımıyla tek bir hesapta birleştirir. Windows, iPhone ve iPad, Android ve tarayıcıda çalışır.",
          "Descall’ı Türkiye’de bağımsız bir geliştirici olan Demir Sarp Kurtlar geliştiriyor ve uygulama şu an beta aşamasında. Temel iletişim ücretsiz: aramalar, ekran paylaşımı ve sunucular için üyelik gerekmez. Descall+ ve Descall Ultra, çoğu masaüstü uygulamasında çalışan mini mod, genel kısayollar ve ses araçları gibi ek özellikler sunan isteğe bağlı üyelikler. Mağazadaki kozmetikler de isteğe bağlı ve uygulamada kazandığın DesCoin ile alınıyor.",
        ],
      },
      {
        h: "Discord’a erişemeyenler için",
        p: [
          "Kamuya açık haberlere göre Discord’a Türkiye’den erişim 9 Ekim 2024’te mahkeme kararıyla engellendi. Erişimi kendimiz test etmiyoruz ve durum o tarihten sonra değişmiş olabilir; tarihli kaynaklar ve son haberler “Discord açıldı mı?” sayfasında. Her akşam aynı ses kanalında buluşan gruplar için Descall, Türkiye’den doğrudan erişilebilen ve Türkçe kullanılabilen bir seçenek. Sunucu, kanal, rol ve ses odası gibi kavramlar Discord kullanıcılarına tanıdık gelir; şablonlarla sunucunu dakikalar içinde yeniden kurabilirsin.",
        ],
      },
      {
        h: "Kalıcı ses kanalları ve ekran paylaşımı",
        p: [
          "Sunucundaki ses kanalları her zaman açıktır; arkadaşların müsait olduğunda girer, işi bitince çıkar. DM’den birebir veya grup araması da başlatabilirsin. Ses ve görüntü WebRTC ile taşınır ve aktarım sırasında DTLS/SRTP ile şifrelenir. İsteğe bağlı gürültü azaltma klavye ve fan sesini bastırır. Ekran paylaşımında oyun için akıcılığı, ders veya sunum için netliği öncelikleyen ön ayarlar var.",
        ],
      },
      {
        h: "Sunucular ve roller",
        p: [
          "Sunucularda kategoriler, yazı, ses ve sahne kanalları bulunur. Roller ve kanal izinleriyle yetkili odalarını ve duyuru kanallarını düzenlersin. Oyun, Topluluk, Ders, Arkadaşlar ve Yayın şablonları bunları tek tıkla kurar. Oyun şablonundaki ekip toplama kanalıyla bot kurmadan oyun arkadaşlarını bir araya getirirsin.",
        ],
      },
      {
        h: "Türkçe rehberler",
        p: [
          "Discord’un Türkiye’deki durumu, alternatiflerin dürüst karşılaştırması, geçiş adımları ve ekran paylaşımından ders gruplarına kadar pratik konular için hazırladığımız Türkçe sayfalar:",
        ],
      },
    ],
    links: TR_HUBS,
  },

  // SEO 3.7.14: the English hubs were ~300 words each; Google ranked them on page 5-9.
  "/discord-alternative": {
    sections: [
      {
        h: "Why people look for a Discord alternative",
        p: [
          "Most people who search for a Discord alternative are not unhappy with group chat itself. They want the same habits (a server for the group, voice rooms you can drop into, screen share for games and homework) without the parts that get in the way. For some it is the price of extras like better stream quality. For others it is an app that feels too big for a group of eight friends. In Türkiye there is a third reason: public reports say Discord was blocked there by a court order on 9 October 2024 and could only be reached through a VPN. We do not test access ourselves and it may have changed since; our Turkish page “Discord açıldı mı?” lists the dated sources.",
          "Descall is built for that situation. It keeps the server, channel and voice model people already know, and it keeps the core of it free.",
        ],
      },
      {
        h: "What you get in Descall",
        p: [
          "Servers with roles, permissions, categories, text channels, voice channels and stage channels. Server templates set up a gaming, study or community server in a few seconds, and an owner can hand the server to someone else when they step away.",
          "Direct messages and group chats with replies, reactions, polls, voice notes, pinned messages, slash commands and full-history message search, so the screenshot your friend sent three weeks ago is one search away.",
          "One-on-one and group voice and video calls, server voice channels that stay open, and screen share with quality presets. Calls run on WebRTC with TURN relays for difficult networks and optional noise suppression.",
        ],
      },
      {
        h: "What is free, and what is not",
        p: [
          "Messaging, servers, voice, video and screen share are free for everyone, and none of them needs a membership. Descall+ and Descall Ultra are optional memberships that add extra tools, most of them in the desktop app: mini mode and always-on-top windows, global mute and push to talk, notification history and focus mode, and audio tools such as a noise gate. For now, memberships are given out by the Descall team and through codes, and no prices have been published. The shop sells optional cosmetics, such as banners, card colors, name and avatar effects and country flags, bought with DesCoin you earn in the app. Nothing in the shop changes how well your voice or stream works.",
        ],
      },
      {
        h: "Where Descall is the better fit",
        p: [
          "Friend groups and gaming squads that mostly need voice rooms, screen share and a few channels. Study groups and small clubs that want something simpler than a workspace tool. Communities in Türkiye that want an app with a Turkish interface that works without a VPN.",
        ],
      },
      {
        h: "Where Discord is still the better fit",
        p: [
          "Descall is newer and smaller. It has no bot marketplace and no huge public server directory, and very large public communities with thousands of members and many integrations are still better served by Discord today. If your server depends on a specific bot, keep that in mind before you move.",
        ],
      },
      {
        h: "How to move your group",
        p: [
          "Create an account, make a server from a template, and send your friends one invite link. Recreate the few channels you actually use instead of copying every old one. Most groups are set up in under ten minutes, and you can keep Discord installed while everyone switches.",
        ],
      },
      {
        h: "Platforms",
        p: [
          "Windows desktop app, iPhone and iPad from the App Store, Android, and a full web app at descall.com/app that needs no install. One account works everywhere and your messages sync between devices.",
        ],
      },
    ],
    links: EN_HUBS_TR_STATUS,
  },
  "/alternatives": {
    sections: [
      {
        h: "How to choose a Discord alternative",
        p: [
          "Start from what your group actually does. If you mostly hang out in voice and share screens, you need reliable voice rooms and screen share. If you run a community, you need roles, permissions and moderation. If you only message, almost any chat app works. Price, platforms and whether the app works in your country come next.",
        ],
      },
      {
        h: "Descall",
        p: [
          "A free app with Discord-style servers, roles, voice channels, video calls and screen share on Windows, iPhone, Android and the web. Strong fit for friend groups, gaming squads and small to medium communities, and for groups in Türkiye, where public reports have described Discord as blocked since a court order in October 2024 (the situation may have changed). Weaker fit if you depend on bots.",
        ],
      },
      {
        h: "TeamSpeak and Mumble",
        p: [
          "Classic voice-first tools with low latency and options to run your own server. Good when voice is all you need and someone in the group is happy to manage a server. Text chat, mobile and screen share are limited compared with modern chat apps.",
        ],
      },
      {
        h: "Guilded and Revolt",
        p: [
          "Both follow the server-and-channel model. Revolt is open source and can be self-hosted; Guilded focuses on gaming teams. Check that they are actively maintained and available on the platforms your group uses before you commit.",
        ],
      },
      {
        h: "Element (Matrix)",
        p: [
          "An open, federated network with end-to-end encrypted rooms. A good choice for privacy-minded groups that accept a steeper learning curve; voice rooms and screen share are less smooth than in gaming-focused apps.",
        ],
      },
      {
        h: "Slack, Telegram, WhatsApp and Signal",
        p: [
          "Slack is built for work teams and gets expensive for large free groups. Telegram, WhatsApp and Signal are excellent for messaging and calls, but they do not have servers with persistent voice rooms, roles and channels, which is what most Discord users are looking for.",
        ],
      },
      {
        h: "A quick rule of thumb",
        p: [
          "Need servers plus voice rooms for free: Descall. Need voice only and like hosting: TeamSpeak or Mumble. Need open source and federation: Element or Revolt. Need only messaging: Telegram, WhatsApp or Signal.",
        ],
      },
    ],
    links: EN_HUBS_TR_STATUS,
  },
  "/apps-like-discord": {
    sections: [
      {
        h: "What makes an app like Discord",
        p: [
          "Three things: servers that group people and channels, voice rooms that stay open so friends can drop in, and a chat history that sticks around. Apps that only do calls or only do messages feel different, even if they are good at what they do.",
        ],
      },
      {
        h: "Descall: the closest everyday replacement",
        p: [
          "Descall keeps that model: servers, roles and permissions, text and voice channels, DMs and group chats, video calls and screen share. It is free, it has a full Turkish and English interface, and it runs on Windows, iPhone, iPad, Android and the web.",
        ],
      },
      {
        h: "For voice only",
        p: [
          "TeamSpeak and Mumble are long-standing voice apps with very low latency and self-hosting. They suit groups that only talk and do not need rich chat, mobile apps or screen share.",
        ],
      },
      {
        h: "For open source and self-hosting",
        p: [
          "Revolt and Element (Matrix) appeal to people who want to run their own server or prefer open protocols. Expect more setup and a smaller set of polished voice features.",
        ],
      },
      {
        h: "For messaging-first groups",
        p: [
          "Telegram, WhatsApp and Signal are the easiest way to keep a group chat going and make calls, but they do not offer servers, roles or always-on voice channels.",
        ],
      },
      {
        h: "Trying Descall with your group",
        p: [
          "Pick one evening, create a server from a template, share the invite link in your current chat and run your usual voice session there. If it feels right, move the rest of your channels over the following week.",
        ],
      },
    ],
    links: EN_HUBS,
  },
  "/compare/discord": {
    sections: [
      {
        h: "Same idea, different focus",
        p: [
          "Discord and Descall share the same building blocks: servers, roles, text and voice channels, DMs, video calls and screen share. Discord is a large, mature platform with a huge ecosystem of bots and public communities. Descall is a newer, independent app focused on friend groups, gaming squads and small to medium communities, with the core features free.",
        ],
      },
      {
        h: "Price",
        p: [
          "Discord is free with an optional Nitro subscription for extras. Descall keeps messaging, servers, voice, video and screen share free. Its optional memberships, Descall+ and Descall Ultra, add extra desktop and productivity tools; for now they are given out by the Descall team and through codes, with no published prices. Cosmetics in the shop are paid with DesCoin earned in the app.",
        ],
      },
      {
        h: "Availability in Türkiye",
        p: [
          "Public reports say access to Discord from Türkiye was blocked by a court order on 9 October 2024. We do not test access ourselves and the situation may have changed since; our Turkish page “Discord açıldı mı?” lists the dated sources. Descall is built in Türkiye, has a full Turkish interface and works there without a VPN.",
        ],
      },
      {
        h: "Bots and integrations",
        p: [
          "This is Discord's clear advantage: thousands of bots and integrations. Descall supports slash commands and built-in tools such as polls, but it does not have a bot marketplace. If your community runs on a specific bot, Discord is still the safer choice.",
        ],
      },
      {
        h: "Which one should your group use?",
        p: [
          "Large public servers that rely on bots: Discord. Friend groups, squads and communities that mainly need voice rooms, screen share and a few channels, especially in Türkiye: Descall. Many groups keep both for a while and move once everyone is in.",
        ],
      },
    ],
    links: EN_HUBS_TR_STATUS,
  },
  "/best-discord-alternative-for-gamers": {
    sections: [
      {
        h: "What gamers actually need from a chat app",
        p: [
          "Clear, low-latency voice. Channels you can drop into without ringing anyone. Screen share that does not turn a replay into a slideshow. And for clans, some structure: roles, a staff room, and an announcements channel only leaders can post in.",
          "Descall puts those pieces in one free app. You do not need a subscription for better voice or screen share, and you do not need bots for basic moderation.",
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
        h: "Gaming templates built in",
        p: [
          "The Gaming template gives your clan squad-up, clip, and scrim channels out of the box. Everyone talks in voice in the same app with the same account, no swapping usernames across three platforms.",
        ],
      },
      {
        h: "Push-to-talk and sound checks on Windows",
        p: [
          "In the Windows app you can switch your voice to push-to-talk and pick your own key, so the squad only hears you when you mean it. Before a match, run the mic test in voice settings and turn on “hear yourself” to check your level and noise suppression without bothering anyone.",
        ],
      },
      {
        h: "Run a match night",
        p: [
          "Post the time in the announcements channel, then give each team its own squad voice channel so the general room stays free for everyone else. A stage channel works for tournament nights: a few speakers talk while the rest listen. Moderators can time out or remove a player who ruins the night, and every action is kept in the audit log.",
        ],
      },
      {
        h: "Getting the whole clan to join",
        p: [
          "Share the server invite link where your clan already reads. Whoever opens it sees a preview of the server and joins after signing in, in the browser without installing anything, so nobody waits for a download before the first game. The desktop app is worth installing later for long sessions.",
        ],
      },
      {
        h: "Honest limits",
        p: [
          "Descall does not have Discord’s bot marketplace (music bots, levelling systems, complex automations), and it is not built for public servers with tens of thousands of members. It is not an in-game overlay either. It is a chat app for squads, clans, and small-to-mid communities that want good voice and tidy servers for free.",
        ],
      },
    ],
    links: [
      { to: "/discord-alternative-for-voice-chat", label: "Voice chat alternative" },
      { to: "/blog/better-mic-sound-voice-chat", label: "Sound better in voice chat" },
      { to: "/blog/screen-share-with-friends", label: "Screen sharing with friends: a guide" },
      { to: "/download", label: "Download for Windows" },
    ],
  },

  "/discord-alternative-for-friends": {
    sections: [
      {
        h: "Add your friends in a minute",
        p: [
          "Every account has a username. Type a friend’s username to send a request, or copy your invite link and drop it into the chat you already use: whoever opens it can sign up for free and lands in your friends list. You decide which requests to accept, and blocking someone stops their messages and calls.",
        ],
      },
      {
        h: "Group chats for up to 15 people",
        p: [
          "A group is the quickest way to get everyone in one place. Pick friends from your list, give the group a name and a photo, and you are done. A group holds up to 15 people including you, which is the size most friend groups actually are. Anyone in it can start a voice or video call from the same window, so there is no server to set up first.",
        ],
      },
      {
        h: "What you can send",
        p: [
          "Messages with typing indicators, photos and files, GIFs from the built-in picker, voice messages when typing is awkward, and quick polls when the group cannot decide what to play or watch. @mentions make sure the right person sees a question in a busy chat.",
        ],
      },
      {
        h: "Calls that start from the chat",
        p: [
          "Call one friend or the whole group from the conversation. Turn the camera on when you want to, or share your screen at up to 720p to show a game, a video or homework. Optional noise suppression cuts keyboard and fan noise, and the mic test in the voice settings lets you check your sound before you join.",
        ],
      },
      {
        h: "When a server makes sense",
        p: [
          "If your group turns into a regular game night or a study circle with topics of its own, create a server from the Friends template. You get text channels for different topics and voice channels that stay open, so people can drop in without a call ringing everyone. Small groups can stay in direct messages and group chats for as long as that works.",
        ],
      },
      {
        h: "On every device you use",
        p: [
          "The same account works on iPhone and iPad, Android, the Windows desktop app and any browser at descall.com. Your friends and messages follow you, so you can answer a message on your phone and join the evening call from your PC.",
        ],
      },
    ],
    links: [],
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
      { to: "/blog/descall-on-every-device", label: "Which Descall app to use" },
      { to: "/blog/better-mic-sound-voice-chat", label: "Sound better in voice chat" },
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
      { to: "/tr/blog/descall-on-every-device", label: "Hangi Descall uygulamasını kullanmalı?" },
      { to: "/tr/blog/better-mic-sound-voice-chat", label: "Sesli sohbette mikrofon sesini iyileştirmek" },
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

/**
 * Extras of a route in its language. Prefixed locales (/de/...) reuse the English
 * entry of the mirrored page; `text` translates every string, `href` localizes links.
 * English and Turkish routes come back as written.
 */
export function localizedPageExtras(routePath, { text, href } = {}) {
  const loc = prefixedLocaleFromPath(routePath, PREFIXABLE_LOCALES);
  if (!loc) {
    const extra = PAGE_EXTRAS[routePath];
    return extra ? { extra, loc: null } : null;
  }
  const bare = stripPrefixedLocale(routePath, [loc]);
  const source = isMirrorPath(bare, loc) ? PAGE_EXTRAS[bare] : null;
  if (!source) return null;
  const tx = (s) => (text ? text(s, loc) : s);
  const hx = (to) => (href ? href(to, loc) : to);
  return {
    loc,
    extra: {
      sections: source.sections.map((s) => ({
        ...s,
        h: tx(s.h),
        p: s.p.map(tx),
        ...(s.list ? { list: s.list.map(tx) } : {}),
      })),
      links: (source.links || []).map((l) => ({ to: hx(l.to), label: tx(l.label) })),
    },
  };
}

/**
 * A paragraph written as inline steps ("1. ... 2. ... 3. ...") becomes a real list:
 * { steps: [...], after } where `after` is the closing sentence of the last step
 * ("The app updates itself ..."). Null for any other paragraph. Works on every
 * locale because translations keep the "1. " markers.
 */
export function numberedSteps(p) {
  const text = String(p || "").trim();
  if (!/^1\.\s/.test(text) || !/\s2\.\s/.test(text)) return null;
  const parts = text.split(/\s(?=\d{1,2}\.\s)/).map((x) => x.replace(/^\d{1,2}\.\s+/, "").trim());
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const cut = last.search(/[.!?。](\s|$)/);
  let after = "";
  if (cut > 0 && cut < last.length - 1) {
    after = last.slice(cut + 1).trim();
    parts[parts.length - 1] = last.slice(0, cut + 1);
  }
  return { steps: parts, after };
}

function paragraphHtml(p) {
  const n = numberedSteps(p);
  if (!n) return `<p>${esc(p)}</p>`;
  return `<ol class="seo-numbered">${n.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${n.after ? `<p>${esc(n.after)}</p>` : ""}`;
}

/** Static HTML for the prerendered shell. */
export function pageExtrasHtml(routePath) {
  const found = localizedPageExtras(routePath, { text: siteText, href: mirrorHref });
  if (!found) return "";
  const { extra } = found;
  const sections = extra.sections
    .map(
      (s) =>
        `<h2>${esc(s.h)}</h2>${s.p.map(paragraphHtml).join("")}${
          s.list?.length ? `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""
        }`
    )
    .join("\n");
  const links = extra.links?.length
    ? `<ul>${extra.links.map((l) => `<li><a href="${esc(l.to)}">${esc(l.label)}</a></li>`).join("")}</ul>`
    : "";
  return `<section class="seo-extra">${sections}${links}</section>`;
}
