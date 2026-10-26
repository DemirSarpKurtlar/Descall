"use strict";

/**
 * Slash command registry and app replies (Descall Apps).
 *
 * 2.12.0: every reply carries `embed.card` (structured, rendered as a glass card
 * by the client, Turkish labels) next to the legacy Discord-style `embed`
 * (now Turkish too) that older clients still draw. In server channels a reply
 * is visible only to the invoker; "Kanala paylaş" (server:app:share) posts it
 * to the channel. /help is answered by the app registry (it used to fall into
 * the casino help because the casino list also contains "help").
 */

const supabase = require("../db/supabase");
const {
  Permissions,
  hasPermission,
  assertHierarchy,
} = require("./serverPermissions");
const { handleGameCommand, VALID_COMMANDS } = require("../socket/gameHandlers");
const pollCore = require("./pollCore");

const APP_BOT = {
  id: "descall-apps",
  username: "Descall Apps",
  displayName: "Descall Apps",
  display_name: "Descall Apps",
  avatar_url: "/brand/descall-logo.png",
  avatarUrl: "/brand/descall-logo.png",
  isBot: true,
};

const EMBED_COLORS = {
  default: 0x587af6,
  success: 0x34c778,
  danger: 0xf05252,
  warn: 0xf5aa3c,
  pink: 0xeb459e,
  blurple: 0x587af6,
};

const MAX_NICKNAME_LENGTH = 32;
const MAX_TIMEOUT_SECONDS = 60 * 60 * 24 * 28;
// Turkish letters are part of command names (/yardım).
const COMMAND_REGEX = /^\/([a-z0-9_çğıöşü-]+)(?:\s+([\s\S]*))?$/i;
const USER_MENTION_REGEX = /^<@!?([0-9a-f-]{20,})>$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function option(name, description, { required = false } = {}) {
  return { name, description, required };
}

function defineCommand(def) {
  return Object.freeze({
    permission: null,
    chatOnly: true,
    voiceOnly: false,
    contexts: ["server", "group"],
    casino: false,
    options: [],
    aliases: [],
    // App commands need USE_APPLICATION_COMMANDS in servers unless they say otherwise.
    needsAppCommands: true,
    ...def,
  });
}

const slashCommands = [
  defineCommand({
    name: "bj",
    description: "Kasaya karşı blackjack eli başlat.",
    options: [option("bahis", "Yatırılacak DesCoin.", { required: true })],
    casino: true,
  }),
  defineCommand({ name: "blackjack", description: "Kasaya karşı blackjack eli başlat.", casino: true }),
  defineCommand({ name: "hit", description: "Blackjack'te kart çek.", casino: true }),
  defineCommand({ name: "stand", description: "Blackjack'te dur.", casino: true }),
  defineCommand({ name: "stay", description: "Blackjack'te dur.", casino: true }),
  defineCommand({ name: "double", description: "Blackjack'te bahsi ikiye katla.", casino: true }),
  defineCommand({
    name: "slot",
    description: "Beş makaralı slotu çevir.",
    options: [option("bahis", "Yatırılacak DesCoin.", { required: true })],
    casino: true,
  }),
  defineCommand({
    name: "coinflip",
    description: "Yazı tura at, kazanırsan bahsin 2× döner.",
    options: [option("bahis", "Yatırılacak DesCoin.", { required: true })],
    casino: true,
  }),
  defineCommand({ name: "cf", description: "Yazı tura at. /coinflip ile aynı.", casino: true }),
  defineCommand({
    name: "pay",
    description: "Birine DesCoin gönder.",
    options: [
      option("kullanıcı", "@kullanıcı, kullanıcı adı veya kimlik.", { required: true }),
      option("miktar", "Gönderilecek DesCoin.", { required: true }),
    ],
    casino: true,
  }),
  defineCommand({ name: "send", description: "DesCoin gönder. /pay ile aynı.", casino: true }),
  defineCommand({ name: "gonder", description: "DesCoin gönder. /pay ile aynı.", casino: true }),
  defineCommand({ name: "tip", description: "DesCoin gönder. /pay ile aynı.", casino: true }),
  defineCommand({ name: "credits", description: "DesCoin bakiyeni gör.", casino: true }),
  defineCommand({ name: "balance", description: "DesCoin bakiyeni gör.", casino: true }),
  defineCommand({ name: "daily", description: "Günlük bonusunu al.", casino: true }),
  defineCommand({ name: "top", description: "Liderlik tablosu.", casino: true }),
  defineCommand({
    name: "help",
    aliases: ["yardım", "yardim", "commands", "komutlar"],
    description: "Burada kullanabileceğin komutları listele.",
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleHelpCommand,
  }),
  defineCommand({
    name: "server",
    description: "Üye, kanal, rol sayısı ve sunucu sahibi.",
    contexts: ["server"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleServerCommand,
  }),
  defineCommand({
    name: "user",
    description: "Profil kartını göster: roller, rozetler, tarihler.",
    options: [option("kullanıcı", "@kullanıcı, kullanıcı adı veya kimlik.")],
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleUserCommand,
  }),
  defineCommand({
    name: "avatar",
    description: "Avatarı büyük göster, indir veya tam ekran aç.",
    options: [option("kullanıcı", "@kullanıcı, kullanıcı adı veya kimlik.")],
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleAvatarCommand,
  }),
  defineCommand({
    name: "nick",
    description: "Bu sunucudaki takma adını değiştir.",
    contexts: ["server"],
    options: [option("ad", "Yeni takma ad; boş bırakırsan temizlenir.")],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleNickCommand,
  }),
  defineCommand({
    name: "poll",
    aliases: ["anket"],
    description: "Oylanabilir anket başlat. Hızlı yol: /poll Soru | Seçenek 1 | Seçenek 2",
    options: [option("soru | seçenekler", "Soru ve | ile ayrılmış seçenekler.", { required: true })],
    contexts: ["server", "group", "dm"],
    // Creating a poll needs only Send Messages (checked by the send path).
    permission: null,
    needsAppCommands: false,
    handler: handlePollCommand,
  }),
  defineCommand({
    name: "timeout",
    description: "Üyeyi belirli bir süre sustur. Örnek: /timeout @kullanıcı 5m sebep",
    contexts: ["server"],
    options: [
      option("kullanıcı", "Üye etiketi, kullanıcı adı veya kimlik.", { required: true }),
      option("süre", "60s, 5m, 1h, 1d, 1w veya saniye.", { required: true }),
      option("sebep", "Denetim kaydına yazılır."),
    ],
    permission: "MODERATE_MEMBERS",
    handler: handleTimeoutCommand,
  }),
  defineCommand({
    name: "kick",
    description: "Üyeyi sunucudan at.",
    contexts: ["server"],
    options: [
      option("kullanıcı", "Üye etiketi, kullanıcı adı veya kimlik.", { required: true }),
      option("sebep", "Denetim kaydına yazılır."),
    ],
    permission: "KICK_MEMBERS",
    handler: handleKickCommand,
  }),
  defineCommand({
    name: "ban",
    description: "Üyeyi sunucudan yasakla.",
    contexts: ["server"],
    options: [
      option("kullanıcı", "Üye etiketi, kullanıcı adı veya kimlik.", { required: true }),
      option("sebep", "Denetim kaydına yazılır."),
    ],
    permission: "BAN_MEMBERS",
    handler: handleBanCommand,
  }),
  defineCommand({
    name: "purge",
    description: "Kanaldaki son N mesajı sil (1–100).",
    contexts: ["server"],
    options: [option("sayı", "Silinecek mesaj sayısı (1–100).", { required: true })],
    permission: "MANAGE_MESSAGES",
    handler: handlePurgeCommand,
  }),
];

const registry = new Map();
for (const cmd of slashCommands) {
  registry.set(cmd.name, cmd);
}
for (const cmd of slashCommands) {
  for (const alias of cmd.aliases || []) if (!registry.has(alias)) registry.set(alias, cmd);
}

function parseSlashCommand(content) {
  const match = String(content || "").trim().match(COMMAND_REGEX);
  if (!match) return null;
  return {
    name: match[1].toLocaleLowerCase("tr"),
    args: (match[2] || "").trim(),
    raw: String(content || "").trim(),
  };
}

function isCasinoCommand(name) {
  const key = String(name || "").toLocaleLowerCase("tr");
  const app = registry.get(key);
  if (app && !app.casino) return false;
  return VALID_COMMANDS.has(key);
}

/** Registry entry for a typed name or alias (null for unknown). */
function findCommand(name) {
  return registry.get(String(name || "").toLocaleLowerCase("tr")) || null;
}

function commandCatalog({ context = "server" } = {}) {
  return slashCommands
    .filter((cmd) => cmd.contexts.includes(context))
    .map(({ name, description, options, permission, chatOnly, voiceOnly, casino, aliases }) => ({
      name,
      description,
      options,
      permission,
      chatOnly,
      voiceOnly,
      casino,
      aliases,
    }));
}

function makeEmbed({
  title = null,
  description = null,
  color = EMBED_COLORS.default,
  fields = [],
  thumbnail = null,
  image = null,
  footer = null,
  author = null,
  card = null,
} = {}) {
  return {
    type: "rich",
    title,
    description,
    color: Number(color) || EMBED_COLORS.default,
    fields: Array.isArray(fields) ? fields.filter(Boolean) : [],
    thumbnail: thumbnail ? { url: String(thumbnail.url || thumbnail) } : null,
    image: image ? { url: String(image.url || image) } : null,
    footer: footer
      ? { text: String(footer.text || footer), iconUrl: footer.iconUrl || footer.icon_url || null }
      : null,
    author: author
      ? {
          name: String(author.name || ""),
          iconUrl: author.iconUrl || author.icon_url || null,
          url: author.url || null,
        }
      : null,
    card: card || null,
  };
}

function field(name, value, inline = true) {
  return { name: String(name || ""), value, inline: Boolean(inline) };
}

function userFieldValue(user) {
  if (!user?.id) return "Bilinmiyor";
  return {
    kind: "user",
    id: user.id,
    username: user.username || null,
    displayName: user.display_name || user.displayName || user.username || null,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
  };
}

function trDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

function trDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

function cardUser(user) {
  if (!user?.id) return null;
  return {
    id: user.id,
    username: user.username || null,
    displayName: user.display_name || user.displayName || null,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
  };
}

function createSlashBotMessage(content, type = "app_command", embed = null) {
  const now = new Date().toISOString();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender: { ...APP_BOT },
    sender_id: APP_BOT.id,
    content: content || "",
    type,
    embed: embed || null,
    isBot: true,
    isAppMessage: true,
    created_at: now,
    timestamp: now,
  };
}

/** DM payload shape (same as dm:message rows) for an app reply. */
function dmAppPayload(message, convWith) {
  return {
    id: message.id,
    from: { ...APP_BOT },
    text: message.content || "",
    type: message.type,
    appType: message.type,
    embed: message.embed || null,
    isAppMessage: true,
    isBot: true,
    timestamp: message.timestamp || message.created_at,
    convWith,
  };
}

// ---- "Kanala paylaş": invoker-only server replies kept for 30 min so they can be posted once.
const SHARE_TTL_MS = 30 * 60 * 1000;
const SHAREABLE_TYPES = new Set(["app_user", "app_avatar", "app_server", "app_help", "app_nick", "app_timeout", "app_kick", "app_ban", "app_purge"]);
const shareable = new Map(); // message id -> { message, userId, serverId, channelId, at }

function rememberShareable(message, userId) {
  if (!message?.id || !SHAREABLE_TYPES.has(message.type)) return false;
  const now = Date.now();
  for (const [id, entry] of shareable) if (now - entry.at > SHARE_TTL_MS) shareable.delete(id);
  if (shareable.size > 5000) shareable.delete(shareable.keys().next().value);
  shareable.set(message.id, { message, userId: String(userId), serverId: message.server_id, channelId: message.channel_id, at: now });
  return true;
}

/** Takes (and forgets) a remembered reply if this user may share it into this channel. */
function takeShareable({ messageId, userId, serverId, channelId }) {
  const entry = shareable.get(messageId);
  if (!entry) return { ok: false, code: "EXPIRED", message: "Bu sonuç artık paylaşılamaz. Komutu tekrar çalıştır." };
  if (Date.now() - entry.at > SHARE_TTL_MS) {
    shareable.delete(messageId);
    return { ok: false, code: "EXPIRED", message: "Bu sonuç artık paylaşılamaz. Komutu tekrar çalıştır." };
  }
  if (entry.userId !== String(userId) || String(entry.channelId) !== String(channelId) || (serverId && String(entry.serverId) !== String(serverId))) {
    return { ok: false, code: "NOT_ALLOWED", message: "Bu sonucu paylaşamazsın." };
  }
  shareable.delete(messageId);
  return { ok: true, entry };
}

function emitAppMessage({ io, socket, context, roomId, message }) {
  if (!message) return;
  if (context === "dm") {
    const [a, b] = Array.isArray(message.dm_user_ids) ? message.dm_user_ids : [];
    if (!a || !b) return;
    io.to(`user:${a}`).emit("dm:message", dmAppPayload(message, b));
    io.to(`user:${b}`).emit("dm:message", dmAppPayload(message, a));
    return;
  }
  if (context === "server") {
    const canShare = rememberShareable(message, socket.user?.id);
    socket.emit("server:channel:message", {
      serverId: message.server_id,
      channelId: roomId,
      message: { ...message, ephemeral: true, shareable: canShare },
    });
    return;
  }
  io.to(`group:${roomId}`).emit("group:message", {
    groupId: roomId,
    message,
  });
}

async function executeSlashCommand(ctx) {
  const parsed = parseSlashCommand(ctx.content);
  if (!parsed) return { handled: false };
  const command = findCommand(parsed.name);
  // App registry first: /help, /yardım and /commands are app commands even though the
  // casino list also knows them (that sent /help to the casino help before 2.12.0).
  if (command && !command.casino) {
    if (!command.contexts.includes(ctx.context)) return { handled: false };
    await assertCommandPermission(ctx, command);
    const result = await command.handler({ ...ctx, parsed, command });
    return {
      handled: true,
      suppress: Boolean(result?.suppress),
      message: result?.message || null,
      dmText: result?.dmText || null,
      dmPoll: result?.dmPoll || null,
    };
  }
  if (command?.casino || VALID_COMMANDS.has(parsed.name)) {
    const username = ctx.socket.user?.username || "Player";
    await handleGameCommand(ctx.io, ctx.socket, ctx.userId, username, ctx.roomId, parsed.raw, ctx.gameOptions || {});
    return { handled: true, suppress: true, isGameCommand: true };
  }
  return { handled: false };
}

function missingPermission(permission) {
  const err = new Error(`Bu komut için yetkin yok: ${PERMISSION_LABELS[permission] || permission}.`);
  err.status = 403;
  err.code = "MISSING_PERMISSION";
  err.permission = permission;
  return err;
}

const PERMISSION_LABELS = {
  USE_APPLICATION_COMMANDS: "Uygulama komutlarını kullan",
  MODERATE_MEMBERS: "Üyeleri sustur",
  KICK_MEMBERS: "Üyeleri at",
  BAN_MEMBERS: "Üyeleri yasakla",
  MANAGE_MESSAGES: "Mesajları yönet",
  CHANGE_NICKNAME: "Takma ad değiştir",
};

async function assertCommandPermission(ctx, command) {
  if (ctx.context !== "server") return;
  if (command.needsAppCommands && !hasPermission(ctx.permissions, Permissions.USE_APPLICATION_COMMANDS)) {
    throw missingPermission("USE_APPLICATION_COMMANDS");
  }
  if (command.permission && command.permission !== "USE_APPLICATION_COMMANDS" && !hasPermission(ctx.permissions, Permissions[command.permission] || command.permission)) {
    throw missingPermission(command.permission);
  }
}

function errorReply(ctx, { title, description, kind = "error", suggestions = null, usage = null }) {
  return {
    message: createContextMessage(ctx, {
      content: title,
      type: "app_error",
      embed: makeEmbed({
        title,
        description,
        color: kind === "warn" ? EMBED_COLORS.warn : EMBED_COLORS.danger,
        card: { kind: "error", tone: kind, title, description, suggestions, usage },
      }),
    }),
  };
}

function userNotFound(ctx, query, suggestions) {
  const shown = String(query || "").trim().split(/\s+/)[0] || "";
  return errorReply(ctx, {
    title: "Kullanıcı bulunamadı",
    description: shown ? `“${shown.slice(0, 40)}” ile eşleşen üye yok` : "Eşleşen üye yok",
    kind: "warn",
    suggestions: suggestions?.length ? suggestions : null,
    usage: `/${ctx.parsed?.name || "user"} [@kullanıcı]`,
  });
}

/** Up to 3 users whose name starts like the failed lookup (members only in a server). */
async function suggestUsers(ctx, rawArg) {
  const q = String(rawArg || "").trim().split(/\s+/)[0].replace(/^@/, "").replace(/[%_,()]/g, "").slice(0, 32);
  if (q.length < 2) return [];
  const { data } = await supabase.from("users").select("id, username, display_name, avatar_url").ilike("username", `${q.slice(0, Math.max(2, q.length - 1))}%`).limit(8);
  let rows = data || [];
  if (ctx.context === "server" && rows.length) {
    const { data: members } = await supabase.from("server_members").select("user_id").eq("server_id", ctx.serverId).in("user_id", rows.map((r) => r.id));
    const set = new Set((members || []).map((m) => m.user_id));
    rows = rows.filter((r) => set.has(r.id));
  }
  return rows.slice(0, 3).map(cardUser);
}

const HELP_GROUPS = [
  { id: "general", label: "Genel", names: ["poll", "user", "avatar", "server", "nick", "help"] },
  { id: "moderation", label: "Moderasyon", names: ["timeout", "kick", "ban", "purge"] },
  { id: "games", label: "Oyunlar", names: ["bj", "slot", "coinflip"], casino: true },
  { id: "credits", label: "Kredi", names: ["pay", "daily", "credits", "top"], casino: true },
];

function canUseInServer(ctx, cmd) {
  if (ctx.context !== "server" || cmd.casino) return true;
  if (cmd.needsAppCommands && !hasPermission(ctx.permissions, Permissions.USE_APPLICATION_COMMANDS)) return false;
  if (cmd.permission && cmd.permission !== "USE_APPLICATION_COMMANDS" && !hasPermission(ctx.permissions, Permissions[cmd.permission])) return false;
  return true;
}

async function handleHelpCommand(ctx) {
  const groups = HELP_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    casino: Boolean(g.casino),
    commands: g.names
      .map((n) => registry.get(n))
      .filter((cmd) => cmd && cmd.contexts.includes(ctx.context) && canUseInServer(ctx, cmd))
      .map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        args: (cmd.options || []).map((o) => ({ name: o.name, required: o.required })),
        casino: Boolean(cmd.casino),
      })),
  })).filter((g) => g.commands.length);
  const fields = groups
    .flatMap((g) => g.commands.map((c) => field(`/${c.name}${c.args.map((a) => (a.required ? ` ‹${a.name}›` : ` [${a.name}]`)).join("")}`, c.description, false)))
    .slice(0, 20);
  const subtitle = ctx.context === "server" ? "Bu kanalda kullanabileceğin komutlar" : "Bu sohbette kullanabileceğin komutlar";
  return {
    message: createContextMessage(ctx, {
      content: "Komutlar",
      type: "app_help",
      embed: makeEmbed({
        title: "Komutlar",
        description: subtitle,
        color: EMBED_COLORS.blurple,
        fields,
        footer: { text: "İpucu: / yazınca komut menüsü açılır" },
        card: { kind: "help", title: "Komutlar", subtitle, groups },
      }),
    }),
  };
}

async function handleServerCommand(ctx) {
  const [{ data: server }, { count: channelCount }, { data: members }, { count: roleCount }] = await Promise.all([
    supabase
      .from("servers")
      .select("id, name, owner_id, created_at, icon_url, description, banner_url")
      .eq("id", ctx.serverId)
      .maybeSingle(),
    supabase.from("server_channels").select("id", { count: "exact", head: true }).eq("server_id", ctx.serverId),
    supabase.from("server_members").select("user_id").eq("server_id", ctx.serverId).limit(10000),
    supabase.from("server_roles").select("id", { count: "exact", head: true }).eq("server_id", ctx.serverId),
  ]);
  if (!server) {
    return errorReply(ctx, { title: "Sunucu bulunamadı", description: "Bu sunucu yüklenemedi." });
  }
  const { presence } = require("../runtime/sharedState");
  const memberIds = (members || []).map((m) => m.user_id);
  const online = memberIds.filter((id) => {
    const p = presence.get(id);
    return p && p.status !== "invisible" && p.status !== "offline";
  }).length;
  const owner = server.owner_id ? await loadUserWithMembership(ctx.serverId, server.owner_id) : null;
  const created = trDate(server.created_at) || "Bilinmiyor";
  const name = server.name || "Sunucu";
  const memberCount = memberIds.length;
  return {
    message: createContextMessage(ctx, {
      content: name,
      type: "app_server",
      embed: makeEmbed({
        title: name,
        description: server.description || null,
        color: EMBED_COLORS.blurple,
        thumbnail: server.icon_url ? { url: server.icon_url } : null,
        fields: [
          field("Sahibi", userFieldValue(owner), true),
          field("Üye", String(memberCount), true),
          field("Kanal", String(channelCount ?? "?"), true),
          field("Oluşturuldu", created, true),
        ],
        footer: { text: "Sunucu bilgisi" },
        card: {
          kind: "server",
          server: {
            id: server.id,
            name,
            description: server.description || null,
            iconUrl: server.icon_url || null,
            bannerUrl: server.banner_url || null,
            createdAt: server.created_at || null,
          },
          owner: cardUser(owner),
          counts: { members: memberCount, online, channels: channelCount ?? null, roles: Math.max(0, (roleCount ?? 1) - 1) },
        },
      }),
    }),
  };
}

function intToHex(color) {
  const n = Number(color);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `#${Math.min(0xffffff, n).toString(16).padStart(6, "0")}`;
}

async function loadMemberRoles(serverId, userId) {
  if (!serverId) return [];
  const { data: links } = await supabase.from("server_member_roles").select("role_id").eq("server_id", serverId).eq("user_id", userId);
  const ids = (links || []).map((l) => l.role_id);
  if (!ids.length) return [];
  const { data: roles } = await supabase.from("server_roles").select("id, name, color, position, is_everyone, permissions").eq("server_id", serverId).in("id", ids);
  return (roles || [])
    .filter((r) => !r.is_everyone)
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((r) => ({ id: r.id, name: r.name, color: intToHex(r.color), permissions: r.permissions }));
}

function presenceOf(userId) {
  const { presence } = require("../runtime/sharedState");
  const p = presence.get(userId);
  if (!p) return "offline";
  if (p.status === "invisible") return "offline";
  return ["online", "idle", "dnd"].includes(p.status) ? p.status : "online";
}

async function loadProfileCard(ctx, base) {
  const { ensureCosmeticsCached, getCachedPublicUser } = require("./userProfile");
  const [{ data: row }] = await Promise.all([
    supabase.from("users").select("id, username, display_name, avatar_url, banner_url, bio, custom_status, created_at, is_admin").eq("id", base.id).maybeSingle(),
    ensureCosmeticsCached([base.id]).catch(() => {}),
  ]);
  const pub = getCachedPublicUser(base.id) || {};
  const u = { ...base, ...(row || {}) };
  let roles = [];
  let isOwner = false;
  let isServerAdmin = false;
  if (ctx.context === "server" && u.member) {
    roles = await loadMemberRoles(ctx.serverId, u.id);
    const { data: server } = await supabase.from("servers").select("owner_id").eq("id", ctx.serverId).maybeSingle();
    isOwner = server?.owner_id === u.id;
    isServerAdmin = isOwner || roles.some((r) => {
      try {
        return hasPermission(r.permissions || "0", Permissions.ADMINISTRATOR);
      } catch {
        return false;
      }
    });
  }
  const badges = [];
  if (isOwner) badges.push({ id: "owner", label: "SUNUCU SAHİBİ" });
  else if (isServerAdmin) badges.push({ id: "admin", label: "YÖNETİCİ" });
  if (u.is_admin || u.username === "admin") badges.push({ id: "staff", label: "DESCALL EKİBİ" });
  if (u.created_at && new Date(u.created_at) < new Date("2026-01-01T00:00:00Z")) badges.push({ id: "early", label: "ERKEN ÜYE" });
  const { friends } = require("../runtime/sharedState");
  const isSelf = String(u.id) === String(ctx.userId);
  const isFriend = Boolean(friends.get(ctx.userId)?.has?.(u.id));
  return {
    kind: "user",
    user: {
      id: u.id,
      username: u.username || null,
      displayName: u.display_name || null,
      avatarUrl: u.avatar_url || null,
      bannerUrl: u.banner_url || null,
      bio: u.bio || null,
      customStatus: u.custom_status || null,
      presence: presenceOf(u.id),
      equippedAvatarFrame: pub.equippedAvatarFrame || null,
      equippedBadge: pub.equippedBadge || null,
      equippedNameEffect: pub.equippedNameEffect || null,
      equippedBanner: pub.equippedBanner || null,
      equippedTitle: pub.equippedTitle || null,
      equippedCountry: pub.equippedCountry || null,
      equippedSpecialBadge: pub.equippedSpecialBadge || null,
      isAdmin: Boolean(u.is_admin),
    },
    nickname: u.member?.nickname || null,
    roles: roles.map(({ id, name, color }) => ({ id, name, color })),
    badges,
    serverJoinedAt: u.member?.joined_at || null,
    accountCreatedAt: u.created_at || null,
    timeoutUntil: u.member?.timeout_until && new Date(u.member.timeout_until) > new Date() ? u.member.timeout_until : null,
    isSelf,
    isFriend,
    context: ctx.context,
  };
}

async function handleUserCommand(ctx) {
  const user = await resolveUserArg(ctx, ctx.parsed.args);
  if (!user) return userNotFound(ctx, ctx.parsed.args, await suggestUsers(ctx, ctx.parsed.args));
  const card = await loadProfileCard(ctx, user);
  const display = user.member?.nickname || user.display_name || user.username || "Kullanıcı";
  const fields = [field("Kullanıcı adı", `@${user.username || "bilinmiyor"}`, true)];
  if (user.member?.nickname) fields.push(field("Takma ad", user.member.nickname, true));
  if (user.member?.joined_at) fields.push(field("Sunucuya katıldı", trDate(user.member.joined_at), true));
  const country = card.user?.equippedCountry;
  if (country?.name) fields.push(field("Ülke", String(country.name), true));
  if (card.timeoutUntil) fields.push(field("Susturma bitişi", trDateTime(card.timeoutUntil), false));
  return {
    message: createContextMessage(ctx, {
      content: display,
      type: "app_user",
      embed: makeEmbed({
        author: { name: display, iconUrl: user.avatar_url || null },
        color: EMBED_COLORS.success,
        thumbnail: user.avatar_url ? { url: user.avatar_url } : null,
        fields,
        footer: { text: "Üye kartı" },
        card,
      }),
    }),
  };
}

async function handleAvatarCommand(ctx) {
  const user = await resolveUserArg(ctx, ctx.parsed.args);
  if (!user) return userNotFound(ctx, ctx.parsed.args, await suggestUsers(ctx, ctx.parsed.args));
  const display = user.member?.nickname || user.display_name || user.username || "Kullanıcı";
  const title = `${display} avatarı`;
  const card = {
    kind: "avatar",
    user: { ...cardUser(user), presence: presenceOf(user.id) },
    displayName: display,
    avatarUrl: user.avatar_url || null,
  };
  return {
    message: createContextMessage(ctx, {
      content: title,
      type: "app_avatar",
      embed: makeEmbed({
        title,
        description: user.avatar_url ? null : "Avatar ayarlanmamış.",
        color: EMBED_COLORS.pink,
        image: user.avatar_url ? { url: user.avatar_url } : null,
        footer: { text: `@${user.username || "bilinmiyor"}` },
        card,
      }),
    }),
  };
}

async function handleNickCommand(ctx) {
  const nickname = String(ctx.parsed.args || "").trim().slice(0, MAX_NICKNAME_LENGTH) || null;
  if (!hasPermission(ctx.permissions, Permissions.CHANGE_NICKNAME)) throw missingPermission("CHANGE_NICKNAME");
  const before = await loadUserWithMembership(ctx.serverId, ctx.userId);
  await updateMemberNickname({
    serverId: ctx.serverId,
    actorId: ctx.userId,
    targetUserId: ctx.userId,
    nickname,
  });
  const { data: server } = await supabase.from("servers").select("name").eq("id", ctx.serverId).maybeSingle();
  const previous = before?.member?.nickname || null;
  const baseName = before?.display_name || before?.username || "";
  return {
    message: createContextMessage(ctx, {
      content: nickname ? `Takma adın ${nickname} oldu.` : "Takma adın temizlendi.",
      type: "app_nick",
      embed: makeEmbed({
        title: nickname ? "Takma adın güncellendi" : "Takma adın temizlendi",
        description: nickname ? `Takma adın artık **${nickname}**.` : "Bu sunucudaki takma adın kaldırıldı.",
        color: EMBED_COLORS.blurple,
        card: {
          kind: "nick",
          serverName: server?.name || null,
          before: previous,
          after: nickname,
          baseName,
          user: cardUser(before),
        },
      }),
    }),
  };
}

async function handlePollCommand(ctx) {
  const raw = pollCore.parsePollArgs(ctx.parsed.args);
  if (!raw) {
    return errorReply(ctx, {
      title: "Anket nasıl açılır?",
      description: "Komut menüsünden /poll seçince anket oluşturucu açılır. Hızlı yol: /poll Soru | Seçenek 1 | Seçenek 2",
      kind: "warn",
      usage: "/poll Soru | Evet | Hayır",
    });
  }
  const normalized = pollCore.normalizePollInput(raw);
  if (!normalized.ok) return errorReply(ctx, { title: "Anket oluşturulamadı", description: normalized.message, kind: "warn" });
  if (ctx.context === "dm") {
    // DMs store the poll as the caller's own dm_messages row (see dm:send).
    return { dmPoll: normalized.poll };
  }
  const message = await persistPollMessage(ctx, normalized.poll);
  return { message };
}

function durationLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s >= 604800 && s % 604800 === 0) return `${s / 604800} hafta`;
  if (s >= 86400 && s % 86400 === 0) return `${s / 86400} gün`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600} sa`;
  if (s >= 60 && s % 60 === 0) return `${s / 60} dk`;
  return `${s} sn`;
}

const TR_ERRORS = [
  [/cannot kick yourself/i, "Kendini atamazsın."],
  [/cannot ban yourself/i, "Kendini yasaklayamazsın."],
  [/cannot (kick|ban) the server owner/i, "Sunucu sahibine bu işlem yapılamaz."],
  [/member not found/i, "Üye bu sunucuda değil."],
  [/hierarchy|higher role|role position|cannot moderate/i, "Bu üyenin rolü seninkinden yüksek ya da eşit."],
  [/timeout expiry/i, "Susturma süresi gelecekte olmalı."],
];

function trError(err, fallback) {
  const msg = String(err?.message || "");
  for (const [re, tr] of TR_ERRORS) if (re.test(msg)) return tr;
  return fallback;
}

async function actorCard(ctx) {
  const actor = await loadUserWithMembership(ctx.serverId, ctx.userId).catch(() => null);
  return cardUser(actor);
}

async function targetCard(ctx, target) {
  const roles = ctx.context === "server" ? await loadMemberRoles(ctx.serverId, target.id).catch(() => []) : [];
  return {
    ...cardUser(target),
    nickname: target.member?.nickname || null,
    topRole: roles[0] ? { name: roles[0].name, color: roles[0].color } : null,
    presence: presenceOf(target.id),
  };
}

async function handleTimeoutCommand(ctx) {
  const [targetRaw, durationRaw, ...reasonParts] = ctx.parsed.args.split(/\s+/).filter(Boolean);
  if (!targetRaw || !durationRaw) {
    return errorReply(ctx, { title: "Susturma nasıl kullanılır?", description: "Örnek: /timeout @kullanıcı 5m sebep", kind: "warn", usage: "/timeout ‹@kullanıcı› ‹süre› [sebep]" });
  }
  const target = await resolveUserArg(ctx, targetRaw);
  if (!target?.id || !target.member) return userNotFound(ctx, targetRaw, await suggestUsers(ctx, targetRaw));
  const durationSeconds = parseDurationSeconds(durationRaw);
  if (!durationSeconds) {
    return errorReply(ctx, { title: "Geçersiz süre", description: "Süre 60s, 5m, 1h, 1d veya 1w gibi olmalı.", kind: "warn", usage: "/timeout ‹@kullanıcı› ‹süre› [sebep]" });
  }
  const reason = reasonParts.join(" ").trim().slice(0, 512) || null;
  let timeout;
  try {
    timeout = await applyServerTimeout({
      serverId: ctx.serverId,
      actorId: ctx.userId,
      targetUserId: target.id,
      durationSeconds,
      reason,
    });
  } catch (err) {
    return errorReply(ctx, { title: "Susturulamadı", description: trError(err, "Susturma uygulanamadı.") });
  }
  try {
    const { removeUserFromServerVoice } = require("../socket/serverVoiceHandlers");
    removeUserFromServerVoice(ctx.io, ctx.serverId, target.id, "timeout");
  } catch (err) {
    console.warn("[slashCommands] voice cleanup after timeout failed:", err?.message || err);
  }
  const display = target.member?.nickname || target.display_name || target.username || "Üye";
  return {
    message: createContextMessage(ctx, {
      content: `${display} susturuldu`,
      type: "app_timeout",
      embed: makeEmbed({
        title: `${display} susturuldu`,
        color: EMBED_COLORS.warn,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [
          field("Üye", userFieldValue(target), true),
          field("Bitiş", trDateTime(timeout.until), true),
          reason ? field("Sebep", reason, false) : null,
        ],
        card: {
          kind: "moderation",
          action: "timeout",
          serverId: ctx.serverId,
          target: await targetCard(ctx, target),
          actor: await actorCard(ctx),
          reason,
          until: timeout.until,
          durationSeconds,
          durationLabel: durationLabel(durationSeconds),
          at: new Date().toISOString(),
        },
      }),
    }),
  };
}
async function writeServerAudit({ serverId, actorId, action, targetType, targetId, reason }) {
  const { error } = await supabase.from("server_audit_logs").insert({
    server_id: serverId,
    actor_id: actorId || null,
    action,
    target_type: targetType || null,
    target_id: targetId ? String(targetId) : null,
    reason: reason || null,
  });
  if (error) console.warn("[slashCommands] audit log insert failed:", error.message);
}

function notifyServerMemberRemoved(io, {
  serverId,
  serverName,
  targetUserId,
  action,
  reason,
  actorId,
}) {
  if (!io || !serverId || !targetUserId) return;
  const payload = {
    serverId,
    serverName: serverName || null,
    userId: targetUserId,
    action: action === "ban" ? "ban" : "kick",
    reason: reason || null,
    actorId: actorId || null,
  };
  io.to(`user:${targetUserId}`).emit("server:member:removed", payload);
  io.to(`server:${serverId}`).emit("server:member:removed", payload);
  // Only this server's rooms and voice calls (other servers' were dropped too before).
  void require("./serverRooms").dropUserFromServer(io, serverId, targetUserId, action === "ban" ? "ban" : "kick");

}

async function kickServerMember({ io, serverId, actorId, targetUserId, reason }) {
  if (String(actorId) === String(targetUserId)) {
    const err = new Error("Kendini atamazsın.");
    err.status = 400;
    throw err;
  }
  const { data: server, error: sErr } = await supabase
    .from("servers")
    .select("id, name, owner_id")
    .eq("id", serverId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!server) {
    const err = new Error("Sunucu bulunamadı.");
    err.status = 404;
    throw err;
  }
  if (server.owner_id === targetUserId) {
    const err = new Error("Sunucu sahibine bu işlem yapılamaz.");
    err.status = 403;
    throw err;
  }
  const { data: membership, error: mErr } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!membership) {
    const err = new Error("Üye bu sunucuda değil.");
    err.status = 404;
    throw err;
  }
  await assertHierarchy(supabase, serverId, actorId, targetUserId);

  const { error: delErr } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", targetUserId);
  if (delErr) throw delErr;
  await supabase
    .from("server_member_roles")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", targetUserId);

  const trimmedReason = reason ? String(reason).slice(0, 200) : null;
  await writeServerAudit({
    serverId,
    actorId,
    action: "MEMBER_KICK",
    targetType: "member",
    targetId: targetUserId,
    reason: trimmedReason,
  });
  notifyServerMemberRemoved(io, {
    serverId,
    serverName: server.name,
    targetUserId,
    action: "kick",
    reason: trimmedReason,
    actorId,
  });
  return { server, reason: trimmedReason };
}

async function banServerMember({ io, serverId, actorId, targetUserId, reason }) {
  if (String(actorId) === String(targetUserId)) {
    const err = new Error("Kendini yasaklayamazsın.");
    err.status = 400;
    throw err;
  }
  const { data: server, error: sErr } = await supabase
    .from("servers")
    .select("id, name, owner_id")
    .eq("id", serverId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!server) {
    const err = new Error("Sunucu bulunamadı.");
    err.status = 404;
    throw err;
  }
  if (server.owner_id === targetUserId) {
    const err = new Error("Sunucu sahibine bu işlem yapılamaz.");
    err.status = 403;
    throw err;
  }
  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (membership) {
    await assertHierarchy(supabase, serverId, actorId, targetUserId);
  }

  const trimmedReason = reason ? String(reason).trim().slice(0, 200) : null;
  const { error: banErr } = await supabase.from("server_bans").upsert(
    {
      server_id: serverId,
      user_id: targetUserId,
      moderator_id: actorId,
      reason: trimmedReason,
      created_at: new Date().toISOString(),
    },
    { onConflict: "server_id,user_id" }
  );
  if (banErr) throw banErr;

  await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", targetUserId);
  await supabase
    .from("server_member_roles")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", targetUserId);

  await writeServerAudit({
    serverId,
    actorId,
    action: "MEMBER_BAN",
    targetType: "member",
    targetId: targetUserId,
    reason: trimmedReason,
  });
  notifyServerMemberRemoved(io, {
    serverId,
    serverName: server.name,
    targetUserId,
    action: "ban",
    reason: trimmedReason,
    actorId,
  });
  return { server, reason: trimmedReason };
}


async function handleKickCommand(ctx) {
  const [targetRaw, ...reasonParts] = ctx.parsed.args.split(/\s+/).filter(Boolean);
  if (!targetRaw) {
    return errorReply(ctx, { title: "Atma nasıl kullanılır?", description: "Örnek: /kick @kullanıcı sebep", kind: "warn", usage: "/kick ‹@kullanıcı› [sebep]" });
  }
  const target = await resolveUserArg(ctx, targetRaw);
  if (!target?.id || !target.member) return userNotFound(ctx, targetRaw, await suggestUsers(ctx, targetRaw));
  const reason = reasonParts.join(" ").trim().slice(0, 200) || null;
  const tCard = await targetCard(ctx, target);
  try {
    await kickServerMember({
      io: ctx.io,
      serverId: ctx.serverId,
      actorId: ctx.userId,
      targetUserId: target.id,
      reason,
    });
  } catch (err) {
    return errorReply(ctx, { title: "Atılamadı", description: trError(err, "Üye sunucudan atılamadı.") });
  }
  const display = target.member?.nickname || target.display_name || target.username || "Üye";
  return {
    message: createContextMessage(ctx, {
      content: `${display} sunucudan atıldı`,
      type: "app_kick",
      embed: makeEmbed({
        title: `${display} sunucudan atıldı`,
        color: EMBED_COLORS.danger,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [field("Üye", userFieldValue(target), true), reason ? field("Sebep", reason, false) : null],
        card: { kind: "moderation", action: "kick", serverId: ctx.serverId, target: { ...tCard, presence: "offline" }, actor: await actorCard(ctx), reason, at: new Date().toISOString() },
      }),
    }),
  };
}

async function handleBanCommand(ctx) {
  const [targetRaw, ...reasonParts] = ctx.parsed.args.split(/\s+/).filter(Boolean);
  if (!targetRaw) {
    return errorReply(ctx, { title: "Yasaklama nasıl kullanılır?", description: "Örnek: /ban @kullanıcı sebep", kind: "warn", usage: "/ban ‹@kullanıcı› [sebep]" });
  }
  const target = await resolveUserArg(ctx, targetRaw);
  if (!target?.id) return userNotFound(ctx, targetRaw, await suggestUsers(ctx, targetRaw));
  const reason = reasonParts.join(" ").trim().slice(0, 200) || null;
  const tCard = await targetCard(ctx, target);
  try {
    await banServerMember({
      io: ctx.io,
      serverId: ctx.serverId,
      actorId: ctx.userId,
      targetUserId: target.id,
      reason,
    });
  } catch (err) {
    return errorReply(ctx, { title: "Yasaklanamadı", description: trError(err, "Üye yasaklanamadı.") });
  }
  const display = target.member?.nickname || target.display_name || target.username || "Üye";
  return {
    message: createContextMessage(ctx, {
      content: `${display} yasaklandı`,
      type: "app_ban",
      embed: makeEmbed({
        title: `${display} yasaklandı`,
        color: EMBED_COLORS.danger,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [field("Üye", userFieldValue(target), true), reason ? field("Sebep", reason, false) : null],
        card: { kind: "moderation", action: "ban", serverId: ctx.serverId, target: { ...tCard, presence: "offline" }, actor: await actorCard(ctx), reason, at: new Date().toISOString() },
      }),
    }),
  };
}

async function handlePurgeCommand(ctx) {
  const count = Math.max(0, Math.floor(Number(ctx.parsed.args) || 0));
  if (!count || count > 100) {
    return errorReply(ctx, { title: "Toplu silme nasıl kullanılır?", description: "1 ile 100 arasında bir sayı yaz. Örnek: /purge 10", kind: "warn", usage: "/purge ‹1–100›" });
  }

  const { data: rows, error } = await supabase
    .from("server_messages")
    .select("id, sender_id, created_at")
    .eq("channel_id", ctx.channelId)
    .eq("server_id", ctx.serverId)
    .order("created_at", { ascending: false })
    .limit(count);
  if (error) throw error;

  const ids = (rows || []).map((r) => r.id);
  if (!ids.length) {
    return errorReply(ctx, { title: "Silinecek mesaj yok", description: "Bu kanalda silinecek mesaj bulunmuyor.", kind: "warn" });
  }

  const { error: delErr } = await supabase.from("server_messages").delete().in("id", ids).eq("channel_id", ctx.channelId);
  if (delErr) throw delErr;

  for (const messageId of ids) {
    ctx.io.to(`server-channel:${ctx.channelId}`).emit("server:channel:message:deleted", {
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      messageId,
    });
  }

  const bySender = new Map();
  for (const r of rows) bySender.set(r.sender_id, (bySender.get(r.sender_id) || 0) + 1);
  const top = [...bySender.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const { data: users } = top.length
    ? await supabase.from("users").select("id, username, display_name, avatar_url").in("id", top.map(([id]) => id))
    : { data: [] };
  const byId = new Map((users || []).map((u) => [u.id, u]));
  const oldest = rows[rows.length - 1]?.created_at || null;
  return {
    message: createContextMessage(ctx, {
      content: `${ids.length} mesaj silindi`,
      type: "app_purge",
      embed: makeEmbed({
        title: `${ids.length} mesaj silindi`,
        description: `Bu kanaldan **${ids.length}** mesaj silindi.`,
        color: EMBED_COLORS.success,
        footer: { text: "Toplu silme" },
        card: {
          kind: "purge",
          count: ids.length,
          channelName: ctx.channel?.name || null,
          oldestAt: oldest,
          bySender: top.map(([id, n]) => ({ user: cardUser(byId.get(id) || { id }), count: n })),
        },
      }),
    }),
  };
}

async function persistPollMessage(ctx, poll) {
  const { createPollForMessage } = require("./polls");
  const content = pollCore.pollFallbackText(poll);
  const table = ctx.context === "server" ? "server_messages" : "group_messages";
  const insert =
    ctx.context === "server"
      ? { server_id: ctx.serverId, channel_id: ctx.roomId, sender_id: ctx.userId, content, media_type: "poll_v2" }
      : { group_id: ctx.roomId, sender_id: ctx.userId, content, media_type: "poll_v2", message_type: "text" };
  const { data: row, error } = await supabase.from(table).insert(insert).select("id, created_at").single();
  if (error) throw error;
  let made;
  try {
    made = await createPollForMessage({
      scope: ctx.context === "server" ? "server" : "group",
      messageId: row.id,
      serverId: ctx.serverId,
      channelId: ctx.roomId,
      groupId: ctx.roomId,
      creatorId: ctx.userId,
      poll,
    });
  } catch (err) {
    await supabase.from(table).delete().eq("id", row.id);
    throw err;
  }
  const base = {
    id: row.id,
    sender_id: ctx.userId,
    content,
    media_type: "poll_v2",
    created_at: row.created_at,
    sender: ctx.sender,
    poll: pollCore.buildPollSnapshot(made.poll, made.options, null, {}),
  };
  return ctx.context === "server"
    ? { ...base, server_id: ctx.serverId, channel_id: ctx.roomId }
    : { ...base, group_id: ctx.roomId };
}

/**
 * "Kanala paylaş": posts a remembered invoker-only reply into the channel as the
 * invoker's message (message_type app_card, card JSON in system_meta). Needs
 * VIEW + SEND in that channel and no active timeout.
 */
async function shareAppMessage({ io, socket, userId, serverId, channelId, messageId, sender }) {
  const { assertTextChannelAccess } = require("../socket/serverChannelHandlers");
  const { channel, resolved } = await assertTextChannelAccess(userId, channelId, Permissions.SEND_MESSAGES);
  if (serverId && String(channel.server_id) !== String(serverId)) {
    return { ok: false, code: "NOT_ALLOWED", message: "Bu sonucu paylaşamazsın." };
  }
  if (!resolved?.isOwner) {
    const { getActiveServerTimeout } = require("./serverTimeoutState");
    if (await getActiveServerTimeout(channel.server_id, userId)) {
      return { ok: false, code: "TIMED_OUT", message: "Susturulmuşken paylaşamazsın." };
    }
  }
  const taken = takeShareable({ messageId, userId, serverId: channel.server_id, channelId });
  if (!taken.ok) return taken;
  const original = taken.entry.message;
  const content = String(original.content || "Descall Apps").slice(0, 300);
  const meta = { embed: original.embed, appType: original.type, sharedFrom: "slash" };
  const { data: row, error } = await supabase
    .from("server_messages")
    .insert({
      server_id: channel.server_id,
      channel_id: channelId,
      sender_id: userId,
      content,
      media_type: "app_card",
      message_type: "app_card",
      system_kind: original.type,
      system_meta: meta,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  const message = {
    id: row.id,
    server_id: channel.server_id,
    channel_id: channelId,
    sender_id: userId,
    content,
    media_type: "app_card",
    message_type: "app_card",
    system_kind: original.type,
    system_meta: meta,
    type: original.type,
    embed: original.embed,
    created_at: row.created_at,
    sender,
  };
  io.to(`server-channel:${channelId}`).emit("server:channel:message", { serverId: channel.server_id, channelId, message });
  socket.emit("server:channel:message", { serverId: channel.server_id, channelId, message });
  return { ok: true, messageId: row.id, replacedId: messageId };
}

function createContextMessage(ctx, contentOrOpts, maybeType) {
  const opts =
    contentOrOpts && typeof contentOrOpts === "object"
      ? contentOrOpts
      : { content: contentOrOpts, type: maybeType || "app_command", embed: null };
  const type = opts.type || "app_command";
  const message = createSlashBotMessage(opts.content || "", type, opts.embed || null);
  if (ctx.context === "server") {
    return {
      ...message,
      server_id: ctx.serverId,
      channel_id: ctx.roomId,
      sender_id: APP_BOT.id,
      sender: { ...APP_BOT },
    };
  }
  if (ctx.context === "dm") {
    return {
      ...message,
      dm_user_ids: [ctx.userId, ctx.dmUserId],
      sender_id: APP_BOT.id,
      sender: { ...APP_BOT },
    };
  }
  return {
    ...message,
    group_id: ctx.roomId,
    sender_id: APP_BOT.id,
    sender: { ...APP_BOT },
  };
}

async function resolveUserArg(ctx, rawArg) {
  const raw = String(rawArg || "").trim();
  const token = raw.split(/\s+/)[0] || "";
  const id = token.match(USER_MENTION_REGEX)?.[1] || (UUID_REGEX.test(token) ? token : null);

  if (id) {
    return loadUserWithMembership(ctx.serverId, id);
  }

  const username = token.replace(/^@/, "").trim();
  if (!username) return loadUserWithMembership(ctx.serverId, ctx.userId);

  const { data: users, error } = await supabase
    .from("users")
    .select("id")
    .ilike("username", username)
    .limit(1);
  if (error) throw error;
  if (!users?.[0]?.id) return null;
  return loadUserWithMembership(ctx.serverId, users[0].id);
}

async function loadUserWithMembership(serverId, userId) {
  const [{ data: user, error: uErr }, { data: member, error: mErr }] = await Promise.all([
    supabase
      .from("users")
      .select("id, username, display_name, avatar_url, created_at")
      .eq("id", userId)
      .maybeSingle(),
    serverId
      ? supabase
          .from("server_members")
          .select("user_id, nickname, joined_at, timeout_until")
          .eq("server_id", serverId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (uErr) throw uErr;
  if (mErr) throw mErr;
  if (!user) return null;
  return { ...user, member: member || null };
}

async function updateMemberNickname({ serverId, actorId, targetUserId, nickname }) {
  const targetIsActor = String(actorId) === String(targetUserId);
  if (!targetIsActor) {
    await assertHierarchy(supabase, serverId, actorId, targetUserId);
  }

  const { data: member, error } = await supabase
    .from("server_members")
    .update({ nickname })
    .eq("server_id", serverId)
    .eq("user_id", targetUserId)
    .select("server_id, user_id, nickname")
    .single();
  if (error) throw error;
  return member;
}

async function applyServerTimeout({ serverId, actorId, targetUserId, until, durationSeconds, reason }) {
  await assertHierarchy(supabase, serverId, actorId, targetUserId);
  const untilDate = until ? new Date(until) : new Date(Date.now() + clampTimeoutSeconds(durationSeconds) * 1000);
  if (!Number.isFinite(untilDate.getTime()) || untilDate <= new Date()) {
    const err = new Error("Susturma süresi gelecekte olmalı.");
    err.status = 400;
    err.code = "INVALID_TIMEOUT";
    throw err;
  }

  const cappedUntil = new Date(Math.min(untilDate.getTime(), Date.now() + MAX_TIMEOUT_SECONDS * 1000));
  const { data, error } = await supabase
    .from("server_members")
    .update({
      timeout_until: cappedUntil.toISOString(),
      timeout_reason: reason || null,
      timed_out_by: actorId,
    })
    .eq("server_id", serverId)
    .eq("user_id", targetUserId)
    .select("server_id, user_id, timeout_until, timeout_reason, timed_out_by")
    .single();
  if (error) throw error;
  return {
    member: data,
    until: data.timeout_until,
    reason: data.timeout_reason,
    timedOutBy: data.timed_out_by,
  };
}

async function clearServerTimeout({ serverId, actorId, targetUserId }) {
  await assertHierarchy(supabase, serverId, actorId, targetUserId);
  const { data, error } = await supabase
    .from("server_members")
    .update({ timeout_until: null, timeout_reason: null, timed_out_by: null })
    .eq("server_id", serverId)
    .eq("user_id", targetUserId)
    .select("server_id, user_id, timeout_until")
    .single();
  if (error) throw error;
  return data;
}

function parseDurationSeconds(raw) {
  const text = String(raw || "").trim().toLowerCase();
  const match = text.match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2] || "s";
  const mult =
    unit.startsWith("w") ? 604800 :
    unit.startsWith("d") ? 86400 :
    unit.startsWith("h") ? 3600 :
    unit.startsWith("m") ? 60 :
    1;
  return clampTimeoutSeconds(n * mult);
}

function clampTimeoutSeconds(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(1, Math.min(MAX_TIMEOUT_SECONDS, n));
}


function formatPollContent(args) {
  const raw = pollCore.parsePollArgs(args);
  const normalized = raw ? pollCore.normalizePollInput(raw) : null;
  return normalized?.ok ? pollCore.pollFallbackText(normalized.poll) : null;
}

module.exports = {
  slashCommands,
  commandCatalog,
  parseSlashCommand,
  executeSlashCommand,
  emitAppMessage,
  isCasinoCommand,
  findCommand,
  formatPollContent,
  applyServerTimeout,
  clearServerTimeout,
  updateMemberNickname,
  parseDurationSeconds,
  shareAppMessage,
  rememberShareable,
  takeShareable,
  APP_BOT,
};
