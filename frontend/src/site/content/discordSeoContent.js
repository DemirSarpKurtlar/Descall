/** Shared long-form SEO content for Discord-alternative landings (EN source of truth). */

export const COMPARE_ROWS = [
  { feature: "Real-time chat & DMs", descall: "Yes, fast, modern UI", discord: "Yes" },
  { feature: "Servers with channels", descall: "Yes, text, voice, stage + categories", discord: "Yes, mature tree model" },
  { feature: "Roles & permissions", descall: "Yes, role hierarchy + channel overrides", discord: "Yes, deep matrix" },
  { feature: "Server templates", descall: "Yes, gaming, community, study & more", discord: "Limited community templates" },
  { feature: "Group voice & video", descall: "Yes, WebRTC + TURN", discord: "Yes" },
  { feature: "Screen share quality control", descall: "Yes, presets & restart-safe", discord: "Yes" },
  { feature: "Gaming server templates", descall: "Ready-made Gaming template", discord: "Bots / external tools" },
  { feature: "Friends, presence & status", descall: "Yes", discord: "Yes" },
  { feature: "Push notifications", descall: "Web / desktop / mobile FCM", discord: "Yes" },
  { feature: "Desktop app", descall: "Windows installer + web + Android", discord: "All major platforms" },
  { feature: "Mobile", descall: "Android APK + mobile web (+ iOS PWA)", discord: "Native iOS/Android" },
  { feature: "Encryption", descall: "TLS + secure WebRTC in transit", discord: "TLS + secure voice" },
  { feature: "Account security", descall: "Password, Google, optional 2FA", discord: "Password, OAuth, 2FA" },
  { feature: "Moderation", descall: "Kick, ban, timeout, audit log, invites", discord: "Deep tools + bots" },
  { feature: "Cosmetic shop (core free)", descall: "DesCoin cosmetics; core free", discord: "Nitro unlocks extras" },
  { feature: "Bots & integrations", descall: "Not a bot marketplace (yet)", discord: "Huge ecosystem" },
  { feature: "Price for chat + calls", descall: "Free", discord: "Free + Nitro upsell" },
  { feature: "Focus", descall: "Friends, servers, lightweight calls", discord: "Huge communities + ecosystem" },
];

export const COMPARE_FAQ = [
  {
    q: "Is Descall a Discord alternative?",
    a: "Yes. Descall is a free Discord alternative with real-time chat, servers (roles, channels, voice), group video, and screen share, without Nitro paywalls for core features.",
  },
  {
    q: "Does Descall have servers like Discord?",
    a: "Yes. Create a server from scratch or pick an advanced template (gaming, friends, community, study, streaming). You get categories, text/voice/stage channels, roles, permission overrides, invites, and moderation tools.",
  },
  {
    q: "Can Descall replace Discord for friend groups?",
    a: "For friend groups and small-to-mid communities that need DMs, servers, roles, voice, and screen share, Descall is a strong lighter alternative. Very large bot ecosystems still favor Discord today.",
  },
  {
    q: "Does Descall have roles and channel permissions?",
    a: "Yes. Servers support role hierarchy (Admin, Moderator, and custom roles), plus per-channel allow/deny overrides for staff rooms, announcement channels, and VIP lounges.",
  },
  {
    q: "Does Descall have screen sharing?",
    a: "Yes. Descall supports screen share in DM and group/server calls with quality presets designed for smooth sharing.",
  },
  {
    q: "Is there a desktop app?",
    a: "Yes. Download the Windows desktop client from the Download page. You can also use Descall fully in the browser, plus Android APK builds.",
  },
  {
    q: "Is Descall free?",
    a: "Yes. Messaging, servers, voice, video, and screen share are free. Optional cosmetics use DesCoin, they do not gate core communication.",
  },
  {
    q: "Does Descall support end-to-end encrypted messages?",
    a: "Descall encrypts traffic in transit (TLS / secure WebRTC). It does not currently market full E2E message encryption like a sealed messenger, we stay accurate about that.",
  },
];

/** Unique FAQ for /discord-alternative, do not reuse COMPARE_FAQ (duplicate FAQ schema). */
export const ALTERNATIVE_HUB_FAQ = [
  {
    q: "What is a Discord alternative?",
    a: "A Discord alternative is an app that covers the same jobs, chat, servers, voice, video, and screen share, without copying Discord’s UI or Nitro model. Descall is built as a lighter free option for friends, gamers, and small communities.",
  },
  {
    q: "What is the best free Discord alternative in 2026?",
    a: "It depends on the job. If you need mega-servers and a huge bot store, Discord still leads. If you want free HD voice, screen share, and real servers without a Nitro wall, Descall is a strong free Discord alternative.",
  },
  {
    q: "Does a Discord alternative need servers like Discord?",
    a: "Not always, some apps are DM-only. Descall includes Discord-style servers (roles, channels, templates) plus DMs, so friend groups can keep structure without running a second tool.",
  },
  {
    q: "Is there a Discord alternative with free screen share?",
    a: "Yes. Descall includes screen share in DM, group, and server calls, free, so squads can share a game and talk in one app.",
  },
  {
    q: "Can I use this Discord alternative on Windows and Android?",
    a: "Yes. Use the Windows desktop app, Android builds, or the full web app in a browser. Create a free account to chat, call, and open servers.",
  },
];

/** Unique FAQ for /alternatives, comparison intent, not a clone of the vs-Discord page. */
export const ALTERNATIVES_FAQ = [
  {
    q: "What are the best Discord alternatives in 2026?",
    a: "Shortlist by job: Descall for free friend/gamer voice + servers, Discord if you still need bots and huge publics, Guilded for structured gaming calendars, TeamSpeak/Mumble for classic voice rooms, Telegram if you only need messengers.",
  },
  {
    q: "Which Discord alternative is free with voice and screen share?",
    a: "Descall keeps messaging, servers, voice, video, and screen share free. Optional cosmetics never lock talking to friends. Always check whether a listed “free” app paywalls calls.",
  },
  {
    q: "Discord alternative vs Discord clone, what’s the difference?",
    a: "A clone copies Discord’s server UI. An alternative solves the same jobs with a different product. Descall is an alternative: servers and calls exist, but the app stays lighter.",
  },
  {
    q: "Are there Discord alternatives for gamers?",
    a: "Yes. Look for voice lobbies, screen share, and ready-made servers. Descall’s gaming server templates are built for that, see the gamers page.",
  },
  {
    q: "Should I keep Discord and also use an alternative?",
    a: "Many groups do. Keep Discord for bot-heavy public communities; run nightly voice and DMs on a lighter free app like Descall.",
  },
];

export const ALTERNATIVE_PILLARS = [
  {
    title: "Servers ready in minutes",
    body: "Start from scratch or pick a template packed with roles, text & voice channels, topics, slowmode, and staff permission overrides, gaming, community, study, friends, or streaming.",
  },
  {
    title: "Roles, channels & moderation",
    body: "Discord-style roles and channel overrides, plus kick, ban, timeout, audit logs, and invites. Run a private hangout or a public-ready community without bot hell for the basics.",
  },
  {
    title: "Built for friends & squads",
    body: "Descall still prioritizes DMs, presence, and quick server voice, so squads can hop into a call in one app.",
  },
  {
    title: "Calls without the bloat",
    body: "WebRTC voice/video with TURN support, incoming call UX, PiP, and screen-share quality controls. A lighter Discord alternative when you want clean calls inside servers or DMs.",
  },
  {
    title: "Free core, optional cosmetics",
    body: "Chat, servers, and calls are free. The shop is cosmetic (themes, frames, effects) via DesCoin, not a Nitro-style lock on talking to friends.",
  },
  {
    title: "Desktop + web + Android",
    body: "Install on Windows, open the web app anywhere, or use Android. A practical Discord alternative if your group mixes desktop gaming with mobile chat.",
  },
];

export const GAMER_FAQ = [
  {
    q: "What is the best Discord alternative for gamers in 2026?",
    a: "If you want chat, servers with voice lobbies, and screen share without Nitro, Descall is a strong Discord alternative for gaming friend groups.",
  },
  {
    q: "Does Descall have gaming server templates?",
    a: "Yes. Create a Gaming hub server with squad-up channels, clip drops, scrim voice rooms, and staff roles already configured.",
  },
  {
    q: "Can I screen share while gaming?",
    a: "Yes. Use Descall voice/video calls with screen share quality presets, useful for reviewing VODs, showing loadouts, or watching together.",
  },
];

export const TURKEY_FAQ = [
  {
    q: "Discord alternatifi olarak Descall nedir?",
    a: "Descall; sohbet, sunucular (roller, kanallar, ses), ses/görüntülü arama ve ekran paylaşımı sunan ücretsiz bir Discord alternatifidir.",
  },
  {
    q: "Discord muadili ne demek, Descall uygun mu?",
    a: "Discord muadili, aynı işi (sohbet, ses, sunucu) gören başka bir uygulamadır. Descall, Nitro zorunluluğu olmadan ses, ekran paylaşımı ve sunucu seven gruplar için bir Discord muadilidir.",
  },
  {
    q: "Discord benzeri uygulamalar hangileri?",
    a: "İhtiyaca göre değişir: Descall ücretsiz ses + sunucu, Discord büyük bot ekosistemi, Guilded takvimli oyun sunucuları, TeamSpeak klasik ses odaları, Telegram ise mesajlaşma. Ses + ekran paylaşımı + sunucu istiyorsan Descall pratik bir Discord benzeri uygulamadır.",
  },
  {
    q: "Türk Discord alternatifi var mı?",
    a: "Descall Türkiye’de geliştirilen, Türkçe arayüzlü bir Discord alternatifidir. Web, Windows ve Android ile klan, sınıf ve oyuncu grupları için tasarlandı.",
  },
  {
    q: "Descall’da Discord gibi sunucu var mı?",
    a: "Evet. Sıfırdan veya hazır şablonlarla sunucu kurabilirsin: yazı/ses kanalları, roller, izinler, davetler ve moderasyon araçları hazır gelir.",
  },
  {
    q: "Türkiye’den Discord alternatifi arıyorum, Descall uygun mu?",
    a: "Evet. Türkçe arayüz desteği, web + Windows istemcisi, Android ve sunucu sistemiyle Descall, Türkiye’deki oyuncu grupları için pratik bir Discord alternatifidir.",
  },
  {
    q: "Descall ücretli mi?",
    a: "Hayır. Temel sohbet, sunucu ve aramalar ücretsizdir. Kozmetikler DesCoin ile alınabilir; Nitro benzeri zorunlu abonelik yoktur.",
  },
  {
    q: "Arkadaşlarımı nasıl davet ederim?",
    a: "Arkadaşlar sekmesinden davet linkini kopyala veya sunucu daveti oluştur. Linkle gelen kişi ücretsiz kayıt olunca seninle bağlanır.",
  },
];

export const BLOG_POSTS = [
  // How-to guides (Nov 2026 content round); bodies in seo/guideBodies.js.
  {
    slug: "screen-share-with-friends",
    path: "/blog/screen-share-with-friends",
    title: "How to share your screen with friends in a voice call",
    description:
      "Share a game, slides or homework in a DM call, group call or server voice channel: quality settings, sound, privacy tips and fixes for lag.",
    date: "2026-11-07",
    tags: ["Screen share", "How-to"],
  },
  {
    slug: "online-study-group-voice-chat",
    path: "/blog/online-study-group-voice-chat",
    title: "How to run an online study group with voice chat",
    description:
      "Set up a study server with subject channels, focus rooms and a quiet voice room, then run sessions that people actually join. Free on Descall.",
    date: "2026-11-07",
    tags: ["Study groups", "How-to"],
  },
  {
    slug: "better-mic-sound-voice-chat",
    path: "/blog/better-mic-sound-voice-chat",
    title: "How to sound better in voice chat: mic, noise and push-to-talk",
    description:
      "Fix echo, background noise and quiet mics in group voice chat with headphones, a mic test, noise suppression, push-to-talk and per-person volume.",
    date: "2026-11-07",
    tags: ["Voice chat", "Audio"],
  },
  {
    slug: "set-up-a-community-server",
    path: "/blog/set-up-a-community-server",
    title: "How to set up a server for a small community",
    description:
      "Plan channels, roles and permissions for a small community server, then add rules, invites, moderation and your first event, step by step.",
    date: "2026-11-07",
    tags: ["Communities", "Servers"],
  },
  {
    slug: "private-group-chat-guide",
    path: "/blog/private-group-chat-guide",
    title: "How private is your group chat? A plain guide",
    description:
      "What a chat app can see, what encryption in transit means, and the privacy settings worth changing: read receipts, previews, status and 2FA.",
    date: "2026-11-07",
    tags: ["Privacy", "Security"],
  },
  {
    slug: "descall-on-every-device",
    path: "/blog/descall-on-every-device",
    title: "Descall on Windows, iPhone, Android and the web: which to use",
    description:
      "Which Descall app fits you: the Windows desktop app, iPhone and iPad, Android or the browser, what each does best and how one account syncs.",
    date: "2026-11-07",
    tags: ["Apps", "Download"],
  },
  {
    slug: "best-discord-alternatives-2026",
    path: "/blog/best-discord-alternatives-2026",
    title: "Best Discord alternatives in 2026 | honest shortlist",
    description:
      "Best Discord alternatives in 2026 for friends, servers, and voice, how Descall, Discord, Guilded, and others actually compare.",
    date: "2026-08-11",
    updated: "2026-08-14",
    tags: ["Discord alternatives", "Roundup"],
  },
  {
    slug: "discord-competitors",
    path: "/blog/discord-competitors",
    title: "Discord competitors in 2026 | who actually competes",
    description:
      "Map of Discord competitors in 2026: lighter friend apps, gaming suites, and voice classics, plus where Descall competes honestly.",
    date: "2026-08-11",
    updated: "2026-11-07",
    tags: ["Discord competitors", "Market"],
  },
  {
    slug: "leave-nitro-keep-voice-chat",
    path: "/blog/leave-nitro-keep-voice-chat",
    title: "Keep voice chat free without a subscription",
    description:
      "How to move a friend group from Discord Nitro habits to a free Discord alternative with servers, voice, video, and screen share.",
    date: "2026-08-11",
    updated: "2026-11-07",
    tags: ["Pricing", "Migration"],
  },
];

/** Per-post FAQ, unique questions so blog pages do not clone COMPARE_FAQ schema. */
export const BLOG_FAQ_BY_SLUG = {
  "screen-share-with-friends": [
    {
      q: "Is screen sharing free on Descall?",
      a: "Yes. You can share your screen in DM calls, group calls and server voice channels without a membership, and watching a share is free too.",
    },
    {
      q: "Can I share my screen from an iPhone or iPad?",
      a: "Not at the moment. The iPhone and iPad app can watch other people's shares, but it cannot share your own screen. Use the Windows app or a browser on a computer for that.",
    },
    {
      q: "What quality should I use in a group call?",
      a: "Start at 720p and 20 frames per second, which is what Descall recommends for group calls. Lower it if anyone sees stutter, and pick Text, code for slides or documents.",
    },
  ],
  "online-study-group-voice-chat": [
    {
      q: "Is Descall free for study groups?",
      a: "Yes. Servers, the Study & campus template, voice rooms, screen share, polls and scheduled messages are all free.",
    },
    {
      q: "Can we study together on a school computer?",
      a: "Yes. Open descall.com/app in the browser and sign in; nothing needs to be installed. The browser asks for microphone permission when you join a voice room.",
    },
    {
      q: "Do we need a server, or is a group chat enough?",
      a: "A group chat holds up to 15 members and can start a group call, which is enough for a small group. A server adds channels per subject, open voice rooms, roles and a stage channel.",
    },
  ],
  "better-mic-sound-voice-chat": [
    {
      q: "Why do my friends hear an echo of themselves?",
      a: "Someone in the call is using speakers, and their microphone picks the voices up again. Headphones fix it; keep echo cancellation on for anyone who has none.",
    },
    {
      q: "Is AI noise suppression free?",
      a: "Yes. It is in the voice settings for everyone and cuts keyboard, fan and other background noise. It cannot remove another person talking next to you.",
    },
    {
      q: "Does push-to-talk work while I am in another app?",
      a: "In the free Windows app, push-to-talk works while Descall is the active window. Push-to-talk that works in any app is part of the optional Descall+ membership.",
    },
  ],
  "set-up-a-community-server": [
    {
      q: "Does it cost anything to run a community server?",
      a: "No. Servers, templates, roles, channels, voice and stage channels, invites and moderation tools are free on Descall.",
    },
    {
      q: "Can I make a channel that only staff can see?",
      a: "Yes. In the channel permissions, deny View channel for @everyone and allow it for your staff roles. The templates already include a staff room set up this way.",
    },
    {
      q: "How do I stop members from pinging everyone?",
      a: "You do not need to do anything special: @everyone and @here only work for the owner, admins and roles with that permission, and only once a minute per channel.",
    },
  ],
  "private-group-chat-guide": [
    {
      q: "Is Descall end-to-end encrypted?",
      a: "No, not by default for message history. Messages and calls are encrypted in transit (TLS, and DTLS/SRTP for calls), and messages are stored on Descall's servers so your history loads on every device.",
    },
    {
      q: "Can I stop people from seeing that I read their message?",
      a: "Yes. Turn off read receipts in the privacy settings. You will then not see when other people have read your messages either.",
    },
    {
      q: "Can I get a copy of my data?",
      a: "Yes. Use Download my data in the settings. You get one file with your profile, settings, friends, the messages you sent and more, up to three times a day.",
    },
  ],
  "descall-on-every-device": [
    {
      q: "Is there a Descall app for Mac or Linux?",
      a: "There is no desktop app for macOS or Linux. Use the full web app at descall.com/app in your browser; it has messages, servers, calls and screen sharing.",
    },
    {
      q: "Does Descall work on iPad?",
      a: "Yes. The App Store app runs on iPhone and iPad, with messages, calls and servers. It can watch screen shares but not share your own screen.",
    },
    {
      q: "Do my messages sync between devices?",
      a: "Yes. Every device uses the same account, and your chat history is stored on Descall's servers, so it loads wherever you sign in.",
    },
  ],
  "leave-nitro-keep-voice-chat": [
    {
      q: "Can I leave Nitro and still have group voice?",
      a: "Yes. Descall voice, video, and screen share are free. Cosmetics are optional and never lock calls.",
    },
    {
      q: "How long does a friend-group move take?",
      a: "Invite the core squad, recreate a small server from a template, and run voice nights on Descall for two weeks before dropping Discord Nitro habits.",
    },
  ],
  "best-discord-alternatives-2026": [
    {
      q: "How should I shortlist Discord alternatives in 2026?",
      a: "Match the job: friend voice, community servers, or pure voice rooms. Then check whether calls and screen share are free.",
    },
    {
      q: "Is Descall on this 2026 shortlist?",
      a: "Yes, for friend groups and gamers who want free calls plus real servers. Discord remains the pick for bot-heavy mega-communities.",
    },
  ],
  "discord-competitors": [
    {
      q: "Who actually competes with Discord in 2026?",
      a: "Lighter friend apps, gaming suites, and classic voice tools. Descall competes on free calls and servers, not on Discord’s bot catalog.",
    },
    {
      q: "Is every chat app a Discord competitor?",
      a: "No. Slack, Telegram, and TeamSpeak overlap only on some jobs. Compare by voice, servers, and whether core features are free.",
    },
  ],
};
export const BLOG_RELATED = [
  { to: "/discord-alternative", label: "Discord alternative hub" },
  { to: "/compare/discord", label: "Descall vs Discord" },
  { to: "/alternatives", label: "All alternatives" },
  { to: "/apps-like-discord", label: "Apps like Discord" },
  { to: "/features", label: "Features, servers & more" },
  { to: "/security", label: "Security & encryption" },
  { to: "/download", label: "Download Descall" },
  { to: "/faq", label: "FAQ" },
  { to: "/discord-replacement", label: "Discord replacement" },
  { to: "/discord-alternative-for-friends", label: "For friend groups" },
  { to: "/tr/discord-acildi-mi", label: "Discord in Türkiye: dated reports (Turkish)" },
  { to: "/status", label: "Status" },
];
