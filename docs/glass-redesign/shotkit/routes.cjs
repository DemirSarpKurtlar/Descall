module.exports = function routes(app, D, log) {
  const { ME, AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK, FRIENDS, iso } = D;
  const sender = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null, avatar_url: null });
  const ok = (path, fn) => app.all(path, (req, res) => { log(`HIT ${req.method} ${req.originalUrl}`); res.json(fn(req)); });

  const ALL_FLAGS = {};
  ["CREATE_INSTANT_INVITE","KICK_MEMBERS","BAN_MEMBERS","ADMINISTRATOR","MANAGE_CHANNELS","MANAGE_GUILD","ADD_REACTIONS","VIEW_AUDIT_LOG","PRIORITY_SPEAKER","STREAM","VIEW_CHANNEL","SEND_MESSAGES","MANAGE_MESSAGES","EMBED_LINKS","ATTACH_FILES","READ_MESSAGE_HISTORY","MENTION_EVERYONE","CONNECT","SPEAK","MUTE_MEMBERS","DEAFEN_MEMBERS","MOVE_MEMBERS","USE_VAD","CHANGE_NICKNAME","MANAGE_NICKNAMES","MANAGE_ROLES","USE_APPLICATION_COMMANDS","MODERATE_MEMBERS","SEND_VOICE_MESSAGES"].forEach((k) => (ALL_FLAGS[k] = true));
  const myPermissions = { bits: "8", flags: ALL_FLAGS, isOwner: true, highestPosition: 10 };

  const SID = "10000000-0000-4000-8000-000000000001";
  const SID2 = "10000000-0000-4000-8000-000000000002";
  const SID3 = "10000000-0000-4000-8000-000000000003";
  const ch = (id, serverId, name, type, position, parentId = null, topic = null) => ({ id, serverId, server_id: serverId, name, type, topic, position, parentId, parent_id: parentId, slowmodeSeconds: 0, nsfw: false, createdAt: iso(90000) });
  const CAT_TEXT = "20000000-0000-4000-8000-0000000000c1";
  const CAT_VOICE = "20000000-0000-4000-8000-0000000000c2";
  const CH_GENEL = "20000000-0000-4000-8000-000000000001";
  const CH_DUYURU = "20000000-0000-4000-8000-000000000002";
  const CH_KLIP = "20000000-0000-4000-8000-000000000003";
  const CH_VOICE1 = "20000000-0000-4000-8000-000000000004";
  const CH_VOICE2 = "20000000-0000-4000-8000-000000000005";
  const channels = [
    ch(CAT_TEXT, SID, "Metin Kanalları", "category", 0),
    ch(CH_DUYURU, SID, "duyurular", "text", 1, CAT_TEXT, "Etkinlik duyuruları"),
    ch(CH_GENEL, SID, "genel", "text", 2, CAT_TEXT, "Oyun Gecesi'ne hoş geldin!"),
    ch(CH_KLIP, SID, "klipler", "text", 3, CAT_TEXT),
    ch(CAT_VOICE, SID, "Ses Kanalları", "category", 4),
    ch(CH_VOICE1, SID, "Lobi", "voice", 5, CAT_VOICE),
    ch(CH_VOICE2, SID, "Rekabetçi", "voice", 6, CAT_VOICE),
  ];
  const server = (id, name, desc, memberCount, chans) => ({
    id, name, iconUrl: null, bannerUrl: null, splashUrl: null, description: desc, ownerId: ME.id, vanitySlug: null,
    isPublic: false, communityEnabled: false, rulesChannelId: null, rulesText: null, verificationLevel: "none",
    afkChannelId: null, afkTimeoutSeconds: 300, systemChannelId: null, welcomeChannelId: null, createdAt: iso(90000), updatedAt: iso(90000),
    nickname: null, listPosition: 0, joinedAt: iso(90000), notificationLevel: "all", rulesAcceptedAt: iso(90000),
    timeoutUntil: null, timeoutReason: null, folderId: null, isOwner: true, memberCount, channels: chans, myPermissions, roles: [
      { id: "30000000-0000-4000-8000-000000000001", serverId: id, name: "@everyone", color: 0, position: 0, permissions: "0", hoist: false, mentionable: false, isEveryone: true, iconUrl: null, createdAt: iso(90000) },
    ],
  });
  const SERVERS = [
    server(SID, "Oyun Gecesi", "Cuma akşamları birlikte oynuyoruz.", 128, channels),
    server(SID2, "Kampüs Sohbet", "Ders notları ve sohbet", 54, [ch("20000000-0000-4000-8000-0000000000a1", SID2, "genel", "text", 0), ch("20000000-0000-4000-8000-0000000000a2", SID2, "Ses", "voice", 1)]),
    server(SID3, "Müzik Kulübü", "Playlist paylaşımı", 31, [ch("20000000-0000-4000-8000-0000000000b1", SID3, "genel", "text", 0)]),
  ];
  const chanMsg = (id, u, text, minAgo) => ({ id, channel_id: CH_GENEL, channelId: CH_GENEL, server_id: SID, sender_id: u.id, content: text, text, created_at: iso(minAgo), timestamp: iso(minAgo), sender: sender(u), from: sender(u), reactions: [] });
  const GENEL = [
    chanMsg("40000000-0000-4000-8000-000000000001", AYSE, "Bu akşam turnuva saat 21:00'de başlıyor, herkes hazır mı? 🎮", 52),
    chanMsg("40000000-0000-4000-8000-000000000002", MERT, "Ben varım! Takım listesini #duyurular kanalına attım.", 49),
    chanMsg("40000000-0000-4000-8000-000000000003", ZEYNEP, "Ses kanalında buluşalım, Lobi'de bekliyorum.", 40),
    chanMsg("40000000-0000-4000-8000-000000000004", CAN, "Geçen haftaki maç efsaneydi 😄", 31),
    chanMsg("40000000-0000-4000-8000-000000000005", ELIF, "Yeni gelenler için kurallar sabitlenmiş mesajda, göz atın lütfen.", 22),
    chanMsg("40000000-0000-4000-8000-000000000006", ME, "Harika, 10 dakika içinde Lobi'ye geçiyorum 👋", 12),
    chanMsg("40000000-0000-4000-8000-000000000007", AYSE, "Süper! Taktikleri sesli kanalda konuşuruz 🎧", 8),
  ];

  // Auth
  ok(["/auth/me", "/api/auth/me"], () => ({ user: ME }));
  ok(["/auth/google/config", "/api/auth/google/config"], () => ({ enabled: false, clientId: null }));
  ok("/api/features", () => ({ features: { valorantLfg: true, valorantCompanion: true, dimaai: true }, valorantLfg: true, valorantCompanion: true, dimaai: true }));
  ok(["/health", "/api/health", "/api/status"], () => ({ ok: true }));
  ok(["/api/friends/list", "/friends/list"], () => ({ friends: FRIENDS }));
  ok(["/api/friends/requests", "/friends/requests"], () => ({ requests: [], incoming: [], outgoing: [] }));
  ok(["/api/friends/blocked"], () => ({ blocked: [] }));
  ok(["/api/friends/suggestions*"], () => ({ suggestions: [] }));

  // DMs
  const dm = (id, from, to, text, minAgo, extra = {}) => ({ id, from: sender(from), to: { id: to.id }, text, mediaUrl: null, mediaType: null, timestamp: iso(minAgo), deliveredAt: iso(minAgo), readAt: iso(minAgo - 1), editHistory: [], reactions: [], ...extra });
  const DMS = {
    [AYSE.id]: [
      dm("50000000-0000-4000-8000-000000000001", AYSE, ME, "Selam! Bu akşam Oyun Gecesi'ne geliyor musun?", 35),
      dm("50000000-0000-4000-8000-000000000002", ME, AYSE, "Selam Ayşe! Tabii ki, saat kaçta başlıyoruz?", 33),
      dm("50000000-0000-4000-8000-000000000003", AYSE, ME, "21:00'de. Önce sesli kanalda toplanıp takımları ayarlayacağız.", 31),
      dm("50000000-0000-4000-8000-000000000004", ME, AYSE, "Tamamdır 👍 Mert ve Zeynep'e de haber verdim.", 28),
      dm("50000000-0000-4000-8000-000000000005", AYSE, ME, "Süper! Bu arada geçen haftaki klibi gördün mü? 😂", 20),
      dm("50000000-0000-4000-8000-000000000006", ME, AYSE, "Gördüm, efsaneydi! Akşam görüntülü konuşalım mı?", 15),
      dm("50000000-0000-4000-8000-000000000007", AYSE, ME, "Olur, müsait olunca ara 📞", 12),
    ],
  };
  const lastPreview = { [AYSE.id]: "Olur, müsait olunca ara 📞", [MERT.id]: "Takım listesini attım 👍", [ZEYNEP.id]: "Yarın kütüphanede misin?", [CAN.id]: "📷 Fotoğraf", [ELIF.id]: "Teşekkürler!" };
  const lastAct = { [AYSE.id]: iso(12), [MERT.id]: iso(44), [ZEYNEP.id]: iso(120), [CAN.id]: iso(300), [ELIF.id]: iso(1440) };
  ok(["/api/dm/previews", "/dm/previews"], () => ({ dmPreviewsByPeer: lastPreview, dmLastActivityByPeer: lastAct, previews: {} }));
  app.all(["/api/dm/:peer/messages", "/dm/:peer/messages"], (req, res) => { log(`HIT dm messages ${req.params.peer}`); res.json({ withUserId: req.params.peer, messages: DMS[req.params.peer] || [], hasMore: false }); });
  ok(["/api/dm/prefs", "/dm/prefs"], () => ({ prefs: {} }));

  // Servers
  ok(["/api/servers/my"], () => ({ servers: SERVERS, ownedCount: 3, maxOwned: 10 }));
  ok(["/api/servers/me/unread"], () => ({ unread: {} }));
  ok(["/api/servers/me/folders"], () => ({ folders: [] }));
  ok(["/api/servers/me/channel-mutes"], () => ({ mutes: [], channelIds: [] }));
  ok(["/api/activity/*"], () => ({ activity: null, history: [], settings: {} }));
  ok(["/api/analytics/collect"], () => ({ ok: true }));
  ok(["/api/servers/folders", "/api/servers/my/folders"], () => ({ folders: [] }));
  ok(["/api/servers/mutes", "/api/servers/my/mutes", "/api/servers/channel-mutes"], () => ({ mutes: [] }));
  ok(["/api/servers/templates"], () => ({ templates: [] }));
  app.all("/api/servers/:id/channels/:cid/messages", (req, res) => { log(`HIT chan messages ${req.params.cid}`); res.json({ messages: req.params.cid === CH_GENEL ? GENEL : [] }); });
  app.all("/api/servers/:id/members", (req, res) => { log("HIT members"); const all = [ME, ...FRIENDS]; res.json({ members: all.map((u, i) => ({ userId: u.id, id: u.id, user: sender(u), username: u.username, displayName: u.displayName, nickname: null, roles: [], roleIds: [], joinedAt: iso(9000), status: u.status, isOwner: i === 0 })) }); });
  app.all("/api/servers/:id/roles", (req, res) => res.json({ roles: [] }));
  app.get("/api/servers/:id", (req, res) => { log(`HIT server ${req.params.id}`); const s = SERVERS.find((x) => x.id === req.params.id); if (!s) return res.status(404).json({ error: "nf" }); res.json({ server: s }); });

  // Groups
  ok(["/groups/my", "/api/groups/my"], () => ({ groups: [
    { id: "60000000-0000-4000-8000-000000000001", name: "Hafta Sonu Ekibi", avatar_url: null, created_by: ME.id, created_at: iso(20000), memberCount: 4, memberIds: [ME.id, AYSE.id, MERT.id, ZEYNEP.id], members: [ME, AYSE, MERT, ZEYNEP].map((u) => ({ id: u.id, username: u.username, avatar_url: null, status: u.status })), joinedAt: iso(20000), lastMessage: "Mert: Cumartesi halı saha?", lastActivity: iso(60) },
  ] }));
  app.all(["/groups/:id/messages", "/api/groups/:id/messages"], (req, res) => res.json({ messages: [] }));

  // LFG
  ok(["/lfg/meta", "/api/lfg/meta"], () => ({
    ranks: ["Iron 1","Iron 2","Iron 3","Bronze 1","Bronze 2","Bronze 3","Silver 1","Silver 2","Silver 3","Gold 1","Gold 2","Gold 3","Platinum 1","Platinum 2","Platinum 3","Diamond 1","Diamond 2","Diamond 3","Ascendant 1","Ascendant 2","Ascendant 3","Immortal 1","Immortal 2","Immortal 3","Radiant"],
    modes: [{ id: "competitive", label: "Competitive" },{ id: "unrated", label: "Unrated" },{ id: "swiftplay", label: "Swiftplay" },{ id: "spikerush", label: "Spike Rush" },{ id: "premier", label: "Premier" }],
    regions: [{ id: "eu", label: "Europe" },{ id: "tr", label: "Turkey" },{ id: "na", label: "North America" },{ id: "ap", label: "Asia Pacific" }],
    roles: ["Duelist","Initiator","Controller","Sentinel","Flex"], maxParty: 5,
  }));
  const lobby = (n, host, mode, rank, rmin, rmax, cur, roles, mic, note, minAgo) => ({ id: `70000000-0000-4000-8000-00000000000${n}`, hostId: host.id, groupId: null, game: "valorant", mode, region: "eu", partySizeCurrent: cur, partySizeMax: 5, hostRank: rank, rankMin: rmin, rankMax: rmax, needRoles: roles, micRequired: mic, note, status: "open", createdAt: iso(minAgo), expiresAt: iso(-60), updatedAt: iso(minAgo), hasPartyCode: true, hostUsername: host.username, hostAvatarUrl: null });
  ok(["/lfg/lobbies", "/api/lfg/lobbies"], () => ({ lobbies: [
    lobby(1, AYSE, "competitive", "Gold 2", "Silver 3", "Platinum 1", 3, ["Controller", "Sentinel"], true, "Akşam rank kasıyoruz, iletişim önemli 🎧", 4),
    lobby(2, MERT, "unrated", "Platinum 1", "Gold 1", "Diamond 1", 2, ["Duelist"], true, "Rahat takılmalık, herkes gelebilir", 9),
    lobby(3, ZEYNEP, "swiftplay", "Silver 2", "Iron 1", "Gold 3", 4, ["Flex"], false, "Hızlı bir maç atalım", 15),
    lobby(4, CAN, "premier", "Diamond 2", "Platinum 3", "Ascendant 2", 3, ["Initiator", "Controller"], true, "Premier takımına oyuncu arıyoruz", 26),
  ] }));

  // DimaAI
  const CONV = "80000000-0000-4000-8000-000000000001";
  ok("/api/dimaai/meta", () => ({ product: "Descall", assistant: "DimaAI", tagline: "Your personal Descall agent.", version: "1.1", tools: [], modelTiers: [], uploads: { maxBytes: 10485760, types: ["pdf","txt","docx","csv","images"] } }));
  ok("/api/dimaai/models", () => ({ tiers: [] }));
  ok("/api/dimaai/settings", () => ({ settings: { memoryEnabled: true, ttsEnabled: false, customInstructions: "", modelTier: "fast", agentEnabled: false } }));
  ok("/api/dimaai/memories", () => ({ memories: [] }));
  ok("/api/dimaai/conversations", () => ({ conversations: [
    { id: CONV, title: "Oyun gecesi planı", created_at: iso(30), updated_at: iso(25), is_favorite: false, is_pinned: false, model_tier: "fast" },
    { id: "80000000-0000-4000-8000-000000000002", title: "Sınav çalışma programı", created_at: iso(2000), updated_at: iso(1900), is_favorite: false, is_pinned: false, model_tier: "fast" },
    { id: "80000000-0000-4000-8000-000000000003", title: "Sunucu kuralları taslağı", created_at: iso(5000), updated_at: iso(4900), is_favorite: false, is_pinned: false, model_tier: "fast" },
  ] }));
  app.get("/api/dimaai/conversations/:id", (req, res) => { log("HIT dima conv"); res.json({ conversation: { id: req.params.id, title: "Oyun gecesi planı", created_at: iso(30), updated_at: iso(25), model_tier: "fast" }, messages: [
    { id: "81000000-0000-4000-8000-000000000001", role: "user", content: "Cuma akşamı 6 kişilik oyun gecesi için kısa bir plan hazırlar mısın?", created_at: iso(30), meta: {} },
    { id: "81000000-0000-4000-8000-000000000002", role: "assistant", content: "Tabii! İşte 6 kişilik bir oyun gecesi için kısa bir plan:\n\n🕣 **20:30 – Toplanma:** Herkes *Lobi* ses kanalında buluşsun, mikrofon ve kulaklık kontrolü yapılsın.\n\n👥 **21:00 – Takımlar:** 3'er kişilik iki takım kurun, rolleri önceden paylaştırın.\n\n🏆 **21:15 – Turnuva:** En iyi 3 maç üzerinden oynayın; aralarda 5 dakika mola verin.\n\n🎬 **23:00 – Kapanış:** Klipleri #klipler kanalında paylaşın ve haftanın oyuncusunu seçin.\n\nİstersen sunucuya bir duyuru metni de yazabilirim. 🎮", created_at: iso(29), meta: {} },
  ], pendingActions: [] }); });

  // Misc
  ok(["/api/calls*", "/calls*"], () => ({ calls: [], history: [] }));
  ok("/api/webrtc/ice-config", () => ({ iceServers: [] }));
  ok("/api/announcements", () => ({ announcements: [
    { id: "a1", title: "2.9.147 yayında", content: "Kaydırarak geri gitme ve glass mobil cilası.", createdAt: iso(120), author: null },
    { id: "a2", title: "Mağaza güncellemesi", content: "Yeni aura ve çerçeveler DesCoin ile.", createdAt: iso(1440), author: null },
    { id: "a3", title: "Topluluk kuralları", content: "Lütfen arkadaşlık isteklerinde kibar olun.", createdAt: iso(4320), author: null },
  ] }));
  ok(["/api/shop*"], () => ({ items: [], inventory: [], balance: 1250 }));
};
