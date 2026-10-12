/**
 * Dev-only desktop glass visual harness.
 * Not imported by the app. Production bundles never see this file.
 *
 *   node docs/glass-redesign/desktop/qa/shoot.mjs
 *
 * Serves nothing itself: point GLASS_QA_ORIGIN at a Vite SPA proxy
 * (extensionless routes must return index.html).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../shotkit/package.json")));
const puppeteer = require("puppeteer-core");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const MOCKUPS = join(ROOT, "docs/glass-redesign/desktop/mockups");
const OUT = HERE;
const RAW = "/tmp/glass-qa-raw";
const ORIGIN = process.env.GLASS_QA_ORIGIN || "http://127.0.0.1:5201";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";

mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();

function user(id, username, displayName, extra = {}) {
  return {
    id,
    username,
    displayName,
    display_name: displayName,
    avatarUrl: null,
    avatar_url: null,
    bio: extra.bio || null,
    customStatus: extra.customStatus || null,
    custom_status: extra.customStatus || null,
    bannerUrl: null,
    status: extra.status || "offline",
    is_admin: false,
    isAdmin: false,
    valorant: extra.valorant || null,
    updated_at: iso(10),
    ...extra,
    id,
    username,
    displayName,
    display_name: displayName,
  };
}

const ME = user("u-demir", "demir", "Demir Sarp", {
  status: "online",
  bio: "Gece kuşuyum.",
  customStatus: "🎧 Lobide",
  descoinBalance: 1280,
  email: "demir@descall.com",
  valorant: { riotId: "demir#TR1", rank: "Ascendant 2", rankTier: "Ascendant 2", region: "eu" },
});
const AYSE = user("u-ayse", "ayse", "Ayşe Yılmaz", {
  status: "online",
  bio: "Rank atarım, sonra çay.",
  customStatus: "🎮 Rekabetçi",
  created_at: "2025-03-14T12:00:00.000Z",
  createdAt: "2025-03-14T12:00:00.000Z",
  valorant: { riotId: "ayse#TR1", rank: "Diamond 2", rankTier: "Diamond 2", rankRr: 42, region: "eu" },
});
const MERT = user("u-mert", "mertk", "Mert K.", { status: "idle", customStatus: "☕ Molada" });
const ZEYNEP = user("u-zeynep", "zeynep", "Zeynep", { status: "dnd", customStatus: "🌙 Odak" });
const CAN = user("u-can", "candemir", "Can Demir", { status: "online" });
const ELIF = user("u-elif", "elif", "Elif", { status: "offline" });
const BURAK = user("u-burak", "burako", "Burak Ö.", { status: "online" });
const SELIN = user("u-selin", "selin", "Selin A.", { status: "offline" });
const KAAN = user("u-kaan", "kaan", "Kaan", { status: "offline" });
const DENIZ = user("u-deniz", "denizt", "Deniz T.", { status: "online" });
const ECE = user("u-ece", "ece", "Ece", { status: "online" });

const FRIENDS = [AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK, SELIN, KAAN];
const ONLINE = [ME, AYSE, MERT, ZEYNEP, CAN, BURAK, DENIZ, ECE].map((u) => ({
  ...u,
  status: u.status,
}));

function msg(id, from, text, minAgo, extra = {}) {
  return {
    id,
    from,
    text,
    timestamp: iso(minAgo),
    reactions: extra.reactions || [],
    ...extra,
  };
}

const DM_AYSE = [
  msg("dm1", AYSE, "Selam, bu akşam Gece'de misin?", 80),
  msg("dm2", ME, "Geliyorum, 10 dakikaya oradayım.", 70, {
    reactions: [{ emoji: "❤️", userId: AYSE.id }],
    deliveredAt: iso(69),
  }),
  msg("dm3", AYSE, "Kapıdayım.", 12),
  msg("dm4", ME, "", 8, { mediaType: "voice", duration: 14, text: "" }),
  {
    id: "dm5",
    from: AYSE,
    type: "call_summary",
    text: JSON.stringify({ type: "call_summary", callType: "voice", status: "ended", durationSeconds: 754, participantCount: 2 }),
    timestamp: iso(40),
    durationSeconds: 754,
    status: "ended",
    participantCount: 2,
    callType: "voice",
  },
  msg("dm6", AYSE, "Parti kodunu attım.", 3, { pinnedAt: iso(2), pinnedBy: AYSE.id }),
];

function rawGroupMsg(id, sender, content, minAgo) {
  return {
    id,
    content,
    created_at: iso(minAgo),
    sender: {
      id: sender.id,
      username: sender.username,
      display_name: sender.displayName,
      avatar_url: null,
    },
  };
}

const GROUP = {
  id: "grp-aksam",
  name: "Akşam Ekibi",
  memberCount: 5,
  created_by: ME.id,
  lastMessage: "Ayşe: Parti kodunu attım.",
  lastActivity: iso(3),
  members: [ME, AYSE, MERT, ZEYNEP, CAN],
};
const GROUP_MSGS = [
  rawGroupMsg("g1", AYSE, "Bu akşam rekabetçi?", 50),
  rawGroupMsg("g2", MERT, "Ben varım, mikrofon açık.", 40),
  rawGroupMsg("g3", ME, "/help", 20),
  rawGroupMsg("g4", ZEYNEP, "5 dakika sonra gelirim.", 6),
];

const CHANNELS = [
  { id: "cat-sohbet", serverId: "srv-gece", name: "Sohbet", type: "category", position: 0, parentId: null },
  { id: "ch-genel", serverId: "srv-gece", name: "genel", type: "text", topic: "Genel sohbet", position: 1, parentId: "cat-sohbet" },
  { id: "ch-duyuru", serverId: "srv-gece", name: "duyurular", type: "text", topic: "Duyurular", position: 2, parentId: "cat-sohbet" },
  { id: "cat-ses", serverId: "srv-gece", name: "Ses", type: "category", position: 3, parentId: null },
  { id: "ch-ses", serverId: "srv-gece", name: "Ses", type: "voice", position: 4, parentId: "cat-ses" },
  { id: "ch-sahne", serverId: "srv-gece", name: "Sahne", type: "stage", position: 5, parentId: "cat-ses" },
];

const SERVER = {
  id: "srv-gece",
  name: "Gece",
  description: "Akşam ekibinin sunucusu",
  ownerId: ME.id,
  isOwner: true,
  memberCount: 6,
  notificationLevel: "all",
  channels: CHANNELS,
  myPermissions: { isOwner: true, flags: { ADMINISTRATOR: true } },
  roles: [{ id: "role-uye", name: "Üye", color: "#8ea2ff", position: 1, hoist: true }],
};

const SERVER_MEMBERS = [ME, AYSE, MERT, ZEYNEP, CAN, BURAK].map((u, i) => ({
  userId: u.id,
  username: u.username,
  displayName: u.displayName,
  isOwner: u.id === ME.id,
  user: u,
  roles: i === 0 ? [] : ["role-uye"],
}));

const CHANNEL_MSGS = [
  rawGroupMsg("c1", AYSE, "Sunucu açık, genelden yazın.", 30),
  rawGroupMsg("c2", CAN, "Ses kanalına geçiyorum.", 15),
  rawGroupMsg("c3", ME, "Geliyorum.", 4),
];

function svg(label, fill) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="16" fill="${fill}"/><text x="24" y="100" fill="white" font-size="28" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

const SHOP_ITEMS = [
  { id: "item-banner-1", name: "Gece Şeridi", description: "Koyu mavi profil şeridi", category: "banner", price_descoin: 400, rarity: "rare", asset_url: svg("Banner", "#2a3f88"), preview_url: svg("Banner", "#2a3f88") },
  { id: "item-banner-2", name: "Mor Pus", description: "Mor geçişli banner", category: "banner", price_descoin: 250, rarity: "common", asset_url: svg("Mor", "#5a3d88"), preview_url: svg("Mor", "#5a3d88") },
  { id: "item-frame-1", name: "Cam Çerçeve", description: "İnce aydınlık çerçeve", category: "avatar_frame", price_descoin: 600, rarity: "epic", asset_url: svg("Çerçeve", "#3d6b8a"), preview_url: svg("Çerçeve", "#3d6b8a") },
  { id: "item-bg-1", name: "Gece Perdesi", description: "Koyu arka plan", category: "profile_background", price_descoin: 500, rarity: "rare", asset_url: svg("Arka plan", "#243056"), preview_url: svg("Arka plan", "#243056") },
  { id: "item-theme-1", name: "Gece Camı", description: "Koyu cam tema", category: "theme", price_descoin: 900, rarity: "legendary", theme_key: "night-glass" },
  { id: "item-theme-lagoon", name: "Lagoon", description: "Serin cam", category: "theme", price_descoin: 900, rarity: "rare", theme_key: "lagoon" },
  { id: "item-theme-ember", name: "Emberfall", description: "Sıcak cam", category: "theme", price_descoin: 2400, rarity: "epic", theme_key: "emberfall" },
  { id: "item-theme-borealis", name: "Borealis", description: "Kutup ışığı", category: "theme", price_descoin: 1800, rarity: "epic", theme_key: "borealis" },
  { id: "item-theme-iris", name: "Iriscape", description: "İris cam", category: "theme", price_descoin: 2400, rarity: "legendary", theme_key: "iriscape" },
  { id: "item-badge-1", name: "Gece Kuşu", description: "Profil rozeti", category: "profile_badge", price_descoin: 200, rarity: "common" },
  { id: "item-title-1", name: "Lobici", description: "İsim altı unvan", category: "profile_title", price_descoin: 150, rarity: "common" },
];

const FIXTURE = {
  me: ME,
  friends: FRIENDS.map((f) => ({
    ...f,
    lastMessage: f.id === AYSE.id ? "Parti kodunu attım." : f.id === MERT.id ? "Yarın kütüphanede." : "Selam",
    lastActivity: iso(f.id === AYSE.id ? 3 : 40),
  })),
  requests: [DENIZ],
  suggestions: [
    { ...ECE, reason: "mutual", mutualFriends: 3 },
    { ...KAAN, reason: "group", sharedGroups: 1 },
  ],
  online: ONLINE,
  sync: {
    dmPreviewsByPeer: {
      [AYSE.id]: "Parti kodunu attım.",
      [MERT.id]: "Yarın kütüphanede.",
      [ZEYNEP.id]: "Odak modundayım.",
      [CAN.id]: "Ses kanalına geçiyorum.",
    },
    dmLastActivityByPeer: {
      [AYSE.id]: iso(3),
      [MERT.id]: iso(40),
      [ZEYNEP.id]: iso(90),
      [CAN.id]: iso(15),
    },
    notifications: [],
    dmUnreadByPeer: {
      [CAN.id]: 3,
      [BURAK.id]: 1,
    },
  },
  dm: { [AYSE.id]: DM_AYSE },
  group: GROUP,
  groupMessages: GROUP_MSGS,
  server: SERVER,
  serverMembers: SERVER_MEMBERS,
  channelMessages: CHANNEL_MSGS,
  voiceChannelState: {
    serverId: SERVER.id,
    channelId: "ch-ses",
    members: [AYSE, MERT].map((u) => ({ id: u.id, username: u.username, displayName: u.displayName })),
    memberCount: 2,
  },
  voiceStates: {
    serverId: SERVER.id,
    states: [{ channelId: "ch-ses", members: [AYSE, MERT], memberCount: 2 }],
  },
  announcements: [
    { id: "ann1", title: "Gece bakımı", body: "Bu gece 02:00'de kısa bir bakım var.", emoji: "📢", author: "Descall", createdAt: iso(180) },
    { id: "ann2", title: "Yeni çerçeveler", body: "Mağazaya cam çerçeveler eklendi.", emoji: "🛍️", author: "Descall", createdAt: iso(1400) },
  ],
  calls: [
    { id: "call-1", kind: "dm", direction: "incoming", callType: "video", status: "missed", startedAt: iso(120), endedAt: iso(120), durationSeconds: 0, createdAt: iso(120), peer: AYSE },
    { id: "call-2", kind: "dm", direction: "outgoing", callType: "voice", status: "ended", startedAt: iso(80), endedAt: iso(68), durationSeconds: 754, createdAt: iso(68), peer: MERT },
    { id: "call-3", kind: "group", direction: "outgoing", callType: "voice", status: "ended", startedAt: iso(30), endedAt: iso(20), durationSeconds: 600, createdAt: iso(20), group: { id: GROUP.id, name: GROUP.name } },
  ],
  shopItems: SHOP_ITEMS,
  daily: {
    streak: 4,
    claimedToday: false,
    claimAmount: 40,
    goals: {
      voice: { earned: 12, cap: 30 },
      message: { earned: 8, cap: 20 },
      screenshare: { earned: 0, cap: 40 },
    },
  },
  lobbies: [
    { id: "lfg-1", mode: "competitive", region: "eu", rankMin: "Gold 2", rankMax: "Diamond 1", partySizeCurrent: 3, partySizeMax: 5, micRequired: true, hasPartyCode: true, note: "Sakin kompozisyon, mikrofon şart.", hostUsername: "ayse", status: "open" },
    { id: "lfg-2", mode: "unrated", region: "tr", rankMin: "Silver 1", rankMax: "Platinum 3", partySizeCurrent: 2, partySizeMax: 5, micRequired: false, hasPartyCode: false, note: "Isınma maçı.", hostUsername: "mertk", status: "open" },
  ],
  lfgMeta: {
    ranks: ["Iron 1", "Silver 1", "Gold 2", "Platinum 1", "Diamond 1", "Ascendant 2", "Immortal 1", "Radiant"],
    modes: [
      { id: "competitive", label: "Competitive" },
      { id: "unrated", label: "Unrated" },
      { id: "swiftplay", label: "Swiftplay" },
    ],
    regions: [
      { id: "eu", label: "Europe" },
      { id: "tr", label: "Turkey" },
    ],
    roles: ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"],
    maxParty: 5,
  },
  giphy: {
    data: [1, 2, 3, 4, 5, 6].map((n) => {
      const url = svg(`GIF ${n}`, n % 2 ? "#6c86ff" : "#c45b8a");
      return {
        id: `gif-${n}`,
        images: {
          fixed_height: { url, width: "200", height: "120" },
          fixed_height_small: { url },
          fixed_width_small: { url },
          preview_gif: { url },
          original: { url },
        },
      };
    }),
  },
  users: Object.fromEntries([ME, ...FRIENDS, DENIZ, ECE].map((u) => [u.id, u])),
};

function install(fixture) {
  const params = new URLSearchParams(location.search);
  const loggedOut = params.get("glass-qa-auth") === "0";
  try {
    localStorage.setItem("descall_language", "tr");
    localStorage.setItem("descall:glass-desktop", "1");
    localStorage.setItem("descall:glass-desktop-lite", "0");
    localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "accepted", at: Date.now() }));
    localStorage.setItem("descall_user_settings", JSON.stringify({ darkMode: true }));
    if (loggedOut) {
      localStorage.removeItem("descall_token");
      localStorage.removeItem("descall_user");
    } else {
      localStorage.setItem("descall_token", "glass-qa-token");
      localStorage.setItem("descall_user", JSON.stringify(fixture.me));
    }
  } catch { /* ignore */ }

  if (params.get("glass-qa-notif") !== "default" && typeof Notification !== "undefined") {
    try {
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
    } catch { /* ignore */ }
  }

  const media = navigator.mediaDevices || {};
  const fakeDevices = [
    { deviceId: "mic-1", kind: "audioinput", label: "Mikrofon" },
    { deviceId: "spk-1", kind: "audiooutput", label: "Hoparlör" },
    { deviceId: "cam-1", kind: "videoinput", label: "Kamera" },
  ];
  media.enumerateDevices = async () => fakeDevices;
  media.getUserMedia = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    return canvas.captureStream(8);
  };
  media.getDisplayMedia = media.getUserMedia;
  navigator.mediaDevices = media;

  window.__glassQaScenes = [];
  window.__DESCALL_GLASS_QA_SOCKET__ = () => {
    const listeners = new Map();
    let alive = true;
    function emitLocal(event, payload) {
      if (!alive && event !== "disconnect") return;
      const list = listeners.get(event);
      if (!list) return;
      for (const fn of [...list]) {
        try { fn(payload); } catch (err) { console.warn("[glass-qa socket]", event, err); }
      }
    }
    const socket = {
      connected: false,
      active: true,
      id: "glass-qa",
      on(event, fn) {
        if (typeof fn !== "function") return socket;
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return socket;
      },
      once(event, fn) {
        const wrap = (payload) => {
          listeners.get(event)?.delete(wrap);
          try { fn(payload); } catch (err) { console.warn("[glass-qa socket]", event, err); }
        };
        return socket.on(event, wrap);
      },
      off(event, fn) {
        if (fn) listeners.get(event)?.delete(fn);
        else listeners.delete(event);
        return socket;
      },
      removeListener(event, fn) { return socket.off(event, fn); },
      removeAllListeners(event) {
        if (event) listeners.delete(event);
        else listeners.clear();
        return socket;
      },
      emit(_event, ...rest) {
        const cb = rest.find((item) => typeof item === "function");
        if (cb) queueMicrotask(() => { try { cb(null); } catch { /* ignore */ } });
        return socket;
      },
      timeout() { return socket; },
      disconnect() {
        const was = alive;
        alive = false;
        socket.connected = false;
        socket.active = false;
        if (was) emitLocal("disconnect", "io client disconnect");
        return socket;
      },
      connect() {
        alive = true;
        socket.connected = true;
        socket.active = true;
        queueMicrotask(() => emitLocal("connect"));
        return socket;
      },
      io: {
        on() { return this; },
        off() { return this; },
        engine: { on() {}, readyState: "open" },
      },
      emitEvent(args) {
        if (Array.isArray(args)) emitLocal(args[0], args[1]);
      },
      resumeWatchdog: { dispose() {}, ensureFresh() { return false; } },
    };
    window.__glassQaEmit = emitLocal;
    setTimeout(() => {
      if (!alive) return;
      socket.connected = true;
      emitLocal("connect");
      emitLocal("connected", { user: fixture.me });
      emitLocal("friend:list", fixture.friends);
      emitLocal("friend:requests", fixture.requests);
      emitLocal("users:update", fixture.online);
      emitLocal("sync:state", fixture.sync);
      emitLocal("descoin:balance", { balance: fixture.me.descoinBalance });
      emitLocal("status:current", { status: "online" });
      emitLocal("server:voice:channel-state", fixture.voiceChannelState);
      emitLocal("server:voice:states", fixture.voiceStates);
    }, 80);
    return socket;
  };

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input?.url || "";
    let path = raw;
    try {
      const u = new URL(raw, location.origin);
      path = u.pathname + u.search;
    } catch { /* keep raw */ }
    const pathname = path.split("?")[0];

    if (/api\.giphy\.com/.test(raw)) return json(fixture.giphy);
    if (pathname === "/auth/me" || pathname === "/api/auth/me") return json({ user: fixture.me });
    if (pathname.startsWith("/auth/users/")) {
      const id = decodeURIComponent(pathname.split("/").pop());
      const user = fixture.users[id] || fixture.me;
      return json({ user });
    }
    if (pathname === "/auth/google/config") return json({ clientId: "" });
    if (pathname === "/api/features" || pathname === "/api/features/profanity") {
      return json({ valorantLfg: true, valorantCompanion: true, iosGlass: true, desktopGlass: false });
    }
    if (pathname === "/health" || pathname === "/api/health") return json({ ok: true });
    if (pathname === "/api/friends/list" || pathname === "/friends/list") return json({ friends: fixture.friends });
    if (pathname === "/api/friends/requests" || pathname === "/friends/requests") return json({ requests: fixture.requests });
    if (pathname.startsWith("/api/friends/suggestions")) return json({ suggestions: fixture.suggestions });
    if (pathname === "/api/friends/blocked") return json({ blocked: [] });
    if (pathname.startsWith("/friends/mutual/")) return json({ mutualFriends: [fixture.users["u-mert"], fixture.users["u-elif"], fixture.users["u-can"]] });
    const lfgOne = pathname.match(/^\/(?:api\/)?lfg\/lobbies\/([^/]+)$/);
    if (lfgOne) {
      const lobby = fixture.lobbies.find((row) => row.id === decodeURIComponent(lfgOne[1])) || fixture.lobbies[0];
      return json({
        lobby: {
          ...lobby,
          members: [
            { userId: "u-ayse", username: "Ayşe Yılmaz", rank: "Diamond 1", role: "Controller" },
            { userId: "u-demir", username: "Demir Sarp", rank: "Platinum 3", role: "Duelist" },
            { userId: "u-mert", username: "Mert K.", rank: "Platinum 2", role: "Initiator" },
          ],
        },
        isMember: false,
        isHost: false,
      });
    }
    if (pathname === "/api/dm/previews") return json({ dmPreviewsByPeer: fixture.sync.dmPreviewsByPeer, dmLastActivityByPeer: fixture.sync.dmLastActivityByPeer });
    if (pathname === "/api/dm/prefs") return json({ prefs: [] });
    const dm = pathname.match(/^\/api\/dm\/([^/]+)\/messages/);
    if (dm) {
      const id = decodeURIComponent(dm[1]);
      return json({ withUserId: id, messages: fixture.dm[id] || [], hasMore: false });
    }
    if (pathname === "/groups/my" || pathname === "/api/groups/my") return json({ groups: [fixture.group] });
    const gm = pathname.match(/^\/groups\/([^/]+)\/messages/);
    if (gm) return json({ messages: fixture.groupMessages, reactionsIncluded: true });
    const gmem = pathname.match(/^\/groups\/([^/]+)\/members/);
    if (gmem) return json({ members: fixture.group.members });
    if (pathname === "/api/servers/my") return json({ servers: [fixture.server], ownedCount: 1, maxOwned: 10 });
    if (pathname === "/api/servers/me/unread") return json({ unread: {} });
    if (pathname === "/api/servers/me/folders") return json({ folders: [] });
    if (pathname === "/api/servers/me/channel-mutes") return json({ mutes: [] });
    if (pathname === `/api/servers/${fixture.server.id}`) return json({ server: fixture.server });
    if (pathname === `/api/servers/${fixture.server.id}/members`) return json({ members: fixture.serverMembers });
    if (/\/api\/servers\/[^/]+\/channels\/[^/]+\/messages/.test(pathname)) {
      return json({ messages: fixture.channelMessages, reactionsIncluded: true });
    }
    if (pathname === "/api/shop/catalog") return json({ items: fixture.shopItems });
    if (pathname === "/api/shop/inventory") return json({ inventory: [{ itemId: "item-banner-2" }] });
    if (pathname === "/api/shop/daily") return json(fixture.daily);
    if (pathname === "/api/shop/wallet") return json({ balance: fixture.me.descoinBalance });
    if (pathname.startsWith("/api/calls")) return json({ calls: fixture.calls });
    if (pathname === "/api/announcements") return json({ announcements: fixture.announcements });
    if (pathname === "/api/announcements/unread/count") return json({ count: 2 });
    if (pathname.startsWith("/api/announcements/") && pathname.endsWith("/read")) return json({ ok: true });
    if (pathname === "/lfg/meta" || pathname === "/api/lfg/meta") return json(fixture.lfgMeta);
    if (pathname === "/lfg/lobbies" || pathname.startsWith("/lfg/lobbies") || pathname.startsWith("/api/lfg/lobbies")) {
      return json({ lobbies: fixture.lobbies });
    }
    if (pathname.startsWith("/api/reactions/")) return json({ reactions: {} });
    if (pathname.startsWith("/api/riot") || pathname.startsWith("/riot")) return json({ linked: true, valorant: fixture.me.valorant });
    if (/localhost:3000|127\.0\.0\.1:3000|onrender\.com/.test(raw)) return json({});
    return orig(input, init);
  };
}

async function clickLabel(page, label) {
  const ok = await page.evaluate((text) => {
    const nodes = [...document.querySelectorAll("button, [role='button'], a, [role='tab']")];
    const el = nodes.find((node) => {
      const value = `${node.getAttribute("aria-label") || ""} ${node.innerText || ""}`.replace(/\s+/g, " ").trim();
      return value.toLowerCase().includes(String(text).toLowerCase());
    });
    if (!el) return false;
    el.click();
    return true;
  }, label);
  if (!ok) throw new Error(`missing control: ${label}`);
}

async function waitFor(page, selector, ms = 8000) {
  await page.waitForSelector(selector, { timeout: ms });
}

const FRAMES = [
  { id: "01-login", path: "/login?glass-desktop=1&glass-qa-auth=0", auth: false, ready: ".gd-auth, .auth-card, form" },
  { id: "01b-register", path: "/register?glass-desktop=1&glass-qa-auth=0", auth: false, ready: ".gd-auth, .auth-card, form" },
  { id: "02-dm", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble" },
  { id: "03a-hover-reply", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble", drive: async (page) => {
    const bubble = await page.$(".message-group:not(.own) .message-bubble");
    if (bubble) await bubble.hover();
    await page.waitForSelector(".message-hover-bar", { timeout: 4000 });
    await clickLabel(page, "Yanıtla");
    await page.waitForSelector(".composer-reply-bar, .reply-bar, .composer-reply", { timeout: 4000 }).catch(() => {});
  } },
  { id: "03b-context-edit", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble", drive: async (page) => {
    const own = await page.$(".message-group.own .message-bubble");
    if (own) await own.hover();
    await page.waitForSelector(".message-hover-bar", { timeout: 4000 });
    await clickLabel(page, "Düzenle");
    await page.waitForSelector(".conv-more-btn", { timeout: 4000 });
    await page.click(".conv-row.active .conv-more-btn, .conv-more-btn");
  } },
  { id: "04a-attach", path: "/direct/ayse?glass-desktop=1", ready: ".composer-action-btn", drive: async (page) => {
    await clickLabel(page, "Ek Ekle");
    await waitFor(page, ".attachment-menu");
  } },
  { id: "04b-emoji", path: "/direct/ayse?glass-desktop=1", ready: ".composer-action-btn", drive: async (page) => {
    await clickLabel(page, "Emoji");
    await waitFor(page, ".emoji-picker");
  } },
  { id: "04c-gif", path: "/direct/ayse?glass-desktop=1", ready: ".composer-action-btn", drive: async (page) => {
    await clickLabel(page, "Ek Ekle");
    await waitFor(page, ".attachment-menu");
    await clickLabel(page, "GIF");
    await waitFor(page, ".giphy-panel, .giphy-overlay");
  } },
  { id: "05-group", path: "/groups/grp-aksam?glass-desktop=1", ready: ".message-bubble, .chat-panel", drive: async (page) => {
    await clickLabel(page, "Üyeler");
    await waitFor(page, ".members-panel");
  } },
  { id: "06-server", path: "/servers/srv-gece/ch-genel?glass-desktop=1", ready: ".message-bubble, .server-channel", drive: async (page) => {
    await clickLabel(page, "Üyeler").catch(() => {});
  } },
  { id: "07a-server-menu", path: "/servers/srv-gece/ch-genel?glass-desktop=1", ready: ".server-shell-header, .servers-sidebar, .sidebar", drive: async (page) => {
    await clickLabel(page, "Sunucu menüsü");
    await waitFor(page, ".server-dropdown-item");
  } },
  { id: "07b-server-settings", path: "/servers/srv-gece/ch-genel?glass-desktop=1", ready: ".server-shell-header, .sidebar", drive: async (page) => {
    await clickLabel(page, "Sunucu menüsü");
    await waitFor(page, ".server-dropdown-item");
    await clickLabel(page, "Sunucu Ayarları");
    await waitFor(page, ".server-modal");
  } },
  { id: "08-call-1on1", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble", drive: async (page) => {
    await page.evaluate((peer) => {
      const detail = {
        scene: "dm-call",
        mode: "active",
        callType: "video",
        peer,
        durationSeconds: 252,
        quality: "excellent",
        localLabel: "Sen",
        remoteLabel: peer.displayName,
        remoteColor: "#6a3d55",
      };
      window.__glassQaScenes = window.__glassQaScenes || [];
      window.__glassQaScenes.push(detail);
      window.dispatchEvent(new CustomEvent("descall:glass-qa", { detail }));
    }, AYSE);
    await waitFor(page, ".call-overlay-root");
    await page.waitForFunction(() => /Gecikme|18 ms/.test(document.body.innerText), { timeout: 4000 }).catch(() => {});
  } },
  { id: "09-server-voice", path: "/servers/srv-gece/ch-ses?glass-desktop=1", ready: ".server-voice-panel, .server-voice-room", drive: async (page) => {
    await page.evaluate((detail) => {
      window.__glassQaScenes = window.__glassQaScenes || [];
      window.__glassQaScenes.push(detail);
      window.dispatchEvent(new CustomEvent("descall:glass-qa", { detail }));
    }, {
      scene: "server-voice",
      serverId: SERVER.id,
      channelId: "ch-ses",
      channelName: "Ses",
      participants: [
        { ...AYSE, screen: true, screenLabel: "Ayşe ekranı", screenColor: "#243056" },
        MERT,
      ],
    });
    await page.waitForFunction(() => document.body.innerText.includes("Bağlandı") || document.querySelector(".server-voice-panel"), { timeout: 8000 }).catch(() => {});
  } },
  { id: "09b-group-call", path: "/groups/grp-aksam?glass-desktop=1", ready: ".message-bubble, .chat-panel", drive: async (page) => {
    const tileCount = Math.max(2, Number(process.env.GLASS_QA_CALL_N || 6));
    const roster = [
      { ...AYSE, screen: true, screenLabel: "Ayşe ekranı", screenColor: "#4a3566", isCameraOn: false },
      { ...MERT, isMuted: true, isCameraOn: false },
      { ...ELIF, isCameraOn: false },
      { ...BURAK, isMuted: true, isDeafened: true, isCameraOn: false },
      { ...SELIN, isCameraOn: false },
      { ...ZEYNEP, isCameraOn: false },
      { ...CAN, isMuted: true, isCameraOn: false },
      { ...KAAN, isCameraOn: false },
      { ...DENIZ, isCameraOn: false },
      { ...ECE, isCameraOn: false },
    ];
    await page.evaluate((detail) => {
      window.__glassQaScenes = window.__glassQaScenes || [];
      window.__glassQaScenes.push(detail);
      window.dispatchEvent(new CustomEvent("descall:glass-qa", { detail }));
    }, {
      scene: "group-call",
      groupId: GROUP.id,
      callType: "video",
      durationSeconds: 1116,
      participants: roster.slice(0, Math.max(1, tileCount - 1)),
    });
    await waitFor(page, ".gd-mosaic-cell");
  } },
  { id: "10-incoming-call", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble", drive: async (page) => {
    await page.evaluate((fromUser) => {
      window.__glassQaEmit?.("call:offer", {
        fromUser,
        offer: { type: "offer", sdp: "v=0" },
        callType: "video",
      });
    }, AYSE);
    await page.waitForFunction(() => {
      const text = document.body.innerText || "";
      return text.includes("Ayşe Yılmaz arıyor") && text.includes("Selam, bu akşam");
    }, { timeout: 8000 });
  } },
  { id: "10b-incoming-group", path: "/groups/grp-aksam?glass-desktop=1", ready: ".message-bubble", drive: async (page) => {
    await page.evaluate((fromUser, group) => {
      window.__glassQaEmit?.("group:call:incoming", {
        groupId: group.id,
        groupName: group.name,
        fromUser,
        callType: "voice",
      });
    }, MERT, GROUP);
    await waitFor(page, ".incoming-call-card");
  } },
  { id: "11-friends", path: "/friends?glass-desktop=1", ready: ".sidebar, .nav-rail" },
  { id: "11b-add-friend", path: "/friends?glass-desktop=1", ready: ".nav-rail", drive: async (page) => {
    await clickLabel(page, "Arkadaş ekle");
    await waitFor(page, ".add-modal, .add-modal-backdrop");
  } },
  { id: "11c-quick-add", path: "/friends?glass-desktop=1", ready: ".nav-rail", drive: async (page) => {
    await clickLabel(page, "Arkadaş ekle");
    await waitFor(page, ".add-modal, .add-modal-backdrop");
    await clickLabel(page, "Hızlı Ekle");
    await waitFor(page, ".quick-add-card, .quick-add-list");
  } },
  { id: "12a-hover-card", path: "/direct/ayse?glass-desktop=1", ready: ".message-avatar", drive: async (page) => {
    const avatar = await page.$(".message-group:not(.own) .message-avatar");
    if (avatar) await avatar.hover();
    await waitFor(page, ".user-hover-card");
  } },
  { id: "12b-profile", path: "/direct/ayse?glass-desktop=1", ready: ".message-avatar", drive: async (page) => {
    await page.click(".message-group:not(.own) .message-avatar");
    await waitFor(page, ".user-profile-card");
  } },
  { id: "12c-edit-profile", path: "/settings/profile?glass-desktop=1", ready: ".user-settings, textarea", drive: async (page) => {
    const area = await page.$("textarea");
    if (area) {
      await area.click();
      await area.type(" Gece turu.", { delay: 10 });
    }
    await page.waitForFunction(() => /Kaydedilmemiş|Unsaved/.test(document.body.innerText), { timeout: 4000 }).catch(() => {});
  } },
  { id: "13a-settings-account", path: "/settings/overview?glass-desktop=1", ready: ".user-settings" },
  { id: "13b-settings-appearance", path: "/settings/appearance?glass-desktop=1", ready: ".user-settings" },
  { id: "13c-settings-notifications", path: "/settings/notifications?glass-desktop=1", ready: ".user-settings" },
  { id: "13d-settings-voice", path: "/settings/voice?glass-desktop=1", ready: ".user-settings" },
  { id: "14-announcements", path: "/direct/ayse?glass-desktop=1", ready: ".nav-rail", drive: async (page) => {
    await clickLabel(page, "Duyurular");
    await page.waitForFunction(() => document.body.innerText.includes("Gece bakımı"), { timeout: 6000 });
  } },
  { id: "14b-toasts", path: "/direct/ayse?glass-desktop=1", ready: ".nav-rail", drive: async (page) => {
    await fireToasts(page);
    await waitFor(page, ".toast-item");
  } },
  { id: "15-play-lfg", path: "/play?glass-desktop=1", ready: ".nav-rail", drive: async (page) => {
    await clickLabel(page, "LFG");
    await waitFor(page, ".lfg-lobby-card");
    await page.click(".lfg-lobby-card");
    await page.waitForFunction(() => document.body.innerText.includes("Oyuncular") || document.body.innerText.includes("Players") || document.querySelector(".lfg-detail"), { timeout: 8000 }).catch(() => {});
  } },
  { id: "16-activity", path: "/activity?glass-desktop=1", ready: ".activity-view, .activity-view-title" },
  { id: "17-calls", path: "/calls?glass-desktop=1", ready: ".calls-row, .calls-list, .calls-section" },
  { id: "18-shop", path: "/settings/shop?glass-desktop=1", ready: ".shop-item-card, .shop-grid", drive: async (page) => {
    await clickLabel(page, "Temalar");
    await page.waitForFunction(() => /Lagoon|Emberfall|Borealis|Iriscape/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  } },
  { id: "19-status-picker", path: "/direct/ayse?glass-desktop=1", ready: ".rail-user-panel", drive: async (page) => {
    await page.click(".rail-user-panel");
    await waitFor(page, ".status-picker");
  } },
  { id: "20-confirm-toasts", path: "/direct/ayse?glass-desktop=1", ready: ".conv-more-btn", drive: async (page) => {
    await page.click(".conv-row.active .conv-more-btn, .conv-more-btn");
    await clickLabel(page, "Sohbeti kapat");
    await fireToasts(page);
    await page.waitForFunction(() => /kapatmak|İptal/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  } },
  { id: "21a-web-browser", path: "/direct/ayse?glass-desktop=1&glass-qa-notif=default", ready: ".app-notif-banner, .nav-rail" },
  { id: "21b-narrow-1024", path: "/direct/ayse?glass-desktop=1", ready: ".message-bubble" },
];

async function fireToasts(page) {
  await page.evaluate((user) => {
    const stay = { duration: 0 };
    window.dispatchEvent(new CustomEvent("descall:glass-qa-toast", { detail: { message: "Davet kopyalandı", type: "success", meta: stay } }));
    window.dispatchEvent(new CustomEvent("descall:glass-qa-toast", { detail: { message: "Bağlantı koptu, yeniden deneniyor", type: "error", meta: stay } }));
    window.dispatchEvent(new CustomEvent("descall:glass-qa-toast", { detail: { message: "Yeni duyuru var", type: "info", meta: stay } }));
    window.dispatchEvent(new CustomEvent("descall:glass-qa-toast", {
      detail: { message: user.displayName, type: "presence", meta: { ...stay, user, name: user.displayName, subtitle: "şimdi çevrimiçi" } },
    }));
  }, AYSE);
}

async function probe(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const rail = document.querySelector(".nav-rail");
    const side = document.querySelector(".sidebar, .sidebar-secondary, .app-sidebar");
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      let node = el;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if (s.display === "none" || s.visibility === "hidden") return false;
        node = node.parentElement;
      }
      return true;
    };
    const h1s = [...document.querySelectorAll("h1")].map((el) => ({
      text: (el.innerText || "").trim().slice(0, 80),
      visible: visible(el),
    }));
    return {
      glass: html.classList.contains("glass-desktop"),
      lite: html.classList.contains("gd-lite"),
      glassUi: html.classList.contains("glass-ui"),
      rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
      side: side ? Math.round(side.getBoundingClientRect().width) : 0,
      h1s: h1s.filter((h) => h.visible),
      h1dom: h1s.length,
      text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 500),
      states: {
        hover: !!document.querySelector(".message-hover-bar"),
        reply: !!document.querySelector(".composer-reply-bar, .reply-preview, .composer-reply"),
        edit: !!document.querySelector(".composer-edit-bar, .msg-edit-box, .composer-editing"),
        menu: !!document.querySelector(".gd-row-menu, .conv-context-menu, .context-menu, .dm-context-menu"),
        attach: !!document.querySelector(".attachment-menu"),
        emoji: !!document.querySelector(".emoji-picker"),
        gif: !!document.querySelector(".giphy-panel, .giphy-overlay"),
        members: visible(document.querySelector(".members-panel")),
        serverMenu: !!document.querySelector(".server-dropdown-item"),
        serverSettings: !!document.querySelector(".server-modal"),
        call: !!document.querySelector(".call-overlay-root"),
        incoming: !!document.querySelector(".incoming-call-card"),
        add: !!document.querySelector(".add-modal-tabs"),
        announce: /Gece bakımı/.test(document.body.innerText || ""),
        videos: [...document.querySelectorAll("video")].slice(0, 6).map((video) => {
          let pixel = null;
          try {
            const sample = document.createElement("canvas");
            sample.width = 4;
            sample.height = 4;
            const ctx = sample.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, 4, 4);
            pixel = [...ctx.getImageData(1, 1, 1, 1).data];
          } catch (err) {
            pixel = String(err && err.message ? err.message : err).slice(0, 80);
          }
          return { w: video.videoWidth, h: video.videoHeight, ready: video.readyState, pixel };
        }),
        quick: !!document.querySelector(".quick-add-card"),
        hoverCard: !!document.querySelector(".user-hover-card"),
        profile: !!document.querySelector(".user-profile-card"),
        mosaic: (() => {
          const stage = document.querySelector(".call-screen-share-layout.gd-group-mosaic");
          const cells = [...document.querySelectorAll(".gd-mosaic-cell")].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
              name: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
            };
          });
          const box = stage ? stage.getBoundingClientRect() : null;
          return {
            count: cells.length,
            cols: stage ? getComputedStyle(stage).gridTemplateColumns : "",
            stage: box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null,
            cells,
          };
        })(),
        settings: !!document.querySelector(".user-settings"),
        toast: document.querySelectorAll(".toast-item").length,
        shop: document.querySelectorAll(".shop-item-card").length,
        status: !!document.querySelector(".status-picker"),
        confirm: !!document.querySelector(".conv-confirm-card, .confirm-dialog, .g-alert, [role='alertdialog']"),
        notif: !!document.querySelector(".app-notif-banner"),
        lfg: !!document.querySelector(".lfg-lobby-card"),
        companion: /Companion/.test(document.body.innerText || ""),
        activityTitle: (document.querySelector(".activity-view-title")?.innerText || "").trim(),
        settingsPane: (document.querySelector(".us-main")?.innerText || "").replace(/\s+/g, " ").slice(0, 180),
      },
    };
  });
}

function composite(id, shotWide, shotNarrow) {
  const mockPath = join(MOCKUPS, `${id}.webp`);
  const file = join(OUT, `${id}.png`);
  const run = spawnSync("python3", ["-"], {
    input: `
from PIL import Image, ImageDraw
mock = Image.open(${JSON.stringify(mockPath)}).convert("RGB")
wide = Image.open(${JSON.stringify(shotWide)}).convert("RGB")
narrow = Image.open(${JSON.stringify(shotNarrow)}).convert("RGB")
def fit(im, w):
    h = round(im.height * (w / im.width))
    return im.resize((w, h), Image.Resampling.LANCZOS)
mock, wide, narrow = fit(mock, 720), fit(wide, 720), fit(narrow, 512)
gap, head = 16, 36
width = mock.width + wide.width + narrow.width + gap * 4
height = head + max(mock.height, wide.height, narrow.height) + gap
canvas = Image.new("RGB", (width, height), (18, 20, 28))
draw = ImageDraw.Draw(canvas)
x = gap
draw.text((x, 10), ${JSON.stringify(id + "  mockup")}, fill=(232, 234, 242))
canvas.paste(mock, (x, head))
x += mock.width + gap
draw.text((x, 10), "1440x900", fill=(232, 234, 242))
canvas.paste(wide, (x, head))
x += wide.width + gap
draw.text((x, 10), "1024x768", fill=(232, 234, 242))
canvas.paste(narrow, (x, head))
canvas.save(${JSON.stringify(file)}, "PNG")
`,
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || "composite failed");
  return file;
}

async function shootOne(browser, frame, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateTimezone("Europe/Istanbul");
  page.on("pageerror", (err) => {
    frame.errors = frame.errors || [];
    if (frame.errors.length < 8) frame.errors.push(String(err).slice(0, 240));
  });
  await page.evaluateOnNewDocument(install, FIXTURE);
  const url = ORIGIN + frame.path;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".nav-rail, .gd-auth, .auth-shell, .auth-card, form"), { timeout: 20000 });
  if (frame.ready) {
    await page.waitForSelector(frame.ready, { timeout: 12000 }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 600));
  if (frame.drive && viewport.width === 1440) {
    try {
      await frame.drive(page);
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      frame.driveError = String(err && err.message ? err.message : err);
    }
  } else if (frame.drive && viewport.width !== 1440 && frame.id !== "21b-narrow-1024") {
    try {
      await frame.drive(page);
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      frame.driveErrorNarrow = String(err && err.message ? err.message : err);
    }
  }
  const info = await probe(page);
  const file = join(RAW, `${frame.id}-${viewport.width}.png`);
  await page.screenshot({ path: file });
  await page.close();
  return { file, info };
}

const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

const only = new Set(
  String(process.env.GLASS_QA_ONLY || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
const frames = only.size ? FRAMES.filter((frame) => only.has(frame.id)) : FRAMES;

function writeReport(rows) {
  let prior = [];
  const path = join(OUT, "report.json");
  if (only.size && existsSync(path)) {
    try {
      prior = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      prior = [];
    }
  }
  const next = new Map((Array.isArray(prior) ? prior : []).filter((row) => row && row.id).map((row) => [row.id, row]));
  for (const row of rows) next.set(row.id, row);
  const merged = FRAMES.map((frame) => next.get(frame.id)).filter(Boolean);
  writeFileSync(path, JSON.stringify(merged, null, 2));
}

const report = [];
try {
  for (const frame of frames) {
    const row = { id: frame.id, compare: `docs/glass-redesign/desktop/qa/${frame.id}.png` };
    try {
      const wide = await shootOne(browser, frame, viewports[0]);
      const narrow = await shootOne(browser, frame, viewports[1]);
      row.wide = wide.info;
      row.narrow = narrow.info;
      row.driveError = frame.driveError || null;
      row.driveErrorNarrow = frame.driveErrorNarrow || null;
      row.errors = frame.errors || [];
      try {
        await composite(frame.id, wide.file, narrow.file);
        row.compareOk = true;
      } catch (err) {
        row.compareOk = false;
        row.compareError = String(err && err.message ? err.message : err);
      }
      console.log("shot", frame.id, "glass", wide.info.glass, "drive", row.driveError || "ok");
    } catch (err) {
      row.fatal = String(err && err.stack ? err.stack : err).slice(0, 800);
      console.error("FAIL", frame.id, row.fatal.split("\n")[0]);
    }
    report.push(row);
    writeReport(report);
  }
} finally {
  await browser.close();
}

console.log("wrote", report.length, "frames");
