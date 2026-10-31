"use strict";

/**
 * Slash command registry and app replies (Descall Apps).
 *
 * 2.12.0: every reply carries `embed.card` (structured, rendered as a glass card
 * by the client) next to the legacy Discord-style `embed` that older clients
 * still draw. Text is English with an `i18n` field next to it (lib/botText.js,
 * keys bot.slash.* / bot.cmd.* in src/i18n/locales/bot.<locale>.js), so every
 * viewer reads it in their own language. In server channels a reply
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
const { ref, en, put } = require("./botText");

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

/** Option with an English name / description and their catalog refs (bot.opt.*). */
function option(nameKey, descKey, { required = false } = {}) {
  const o = { required };
  put(o, "name", `bot.opt.${nameKey}`);
  put(o, "description", `bot.opt.${descKey}`);
  return o;
}

function defineCommand(def) {
  const descKey = `bot.cmd.${def.descKey || def.name}`;
  const { descKey: _k, ...rest } = def;
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
    ...rest,
    description: en(descKey),
    i18n: { description: ref(descKey) },
  });
}

const slashCommands = [
  defineCommand({
    name: "bj",
    descKey: "bj",
    options: [option("bet", "betDesc", { required: true })],
    casino: true,
  }),
  defineCommand({ name: "blackjack", descKey: "bj", casino: true }),
  defineCommand({ name: "hit", casino: true }),
  defineCommand({ name: "stand", descKey: "stand", casino: true }),
  defineCommand({ name: "stay", descKey: "stand", casino: true }),
  defineCommand({ name: "double", casino: true }),
  defineCommand({
    name: "slot",
    options: [option("bet", "betDesc", { required: true })],
    casino: true,
  }),
  defineCommand({
    name: "coinflip",
    options: [option("bet", "betDesc", { required: true })],
    casino: true,
  }),
  defineCommand({ name: "cf", casino: true }),
  defineCommand({
    name: "pay",
    options: [
      option("user", "userDesc", { required: true }),
      option("amount", "amountDesc", { required: true }),
    ],
    casino: true,
  }),
  defineCommand({ name: "send", descKey: "payAlias", casino: true }),
  defineCommand({ name: "gonder", descKey: "payAlias", casino: true }),
  defineCommand({ name: "tip", descKey: "payAlias", casino: true }),
  defineCommand({ name: "credits", descKey: "credits", casino: true }),
  defineCommand({ name: "balance", descKey: "credits", casino: true }),
  defineCommand({ name: "daily", casino: true }),
  defineCommand({ name: "top", casino: true }),
  defineCommand({
    name: "help",
    aliases: ["yardım", "yardim", "commands", "komutlar"],
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleHelpCommand,
  }),
  defineCommand({
    name: "server",
    contexts: ["server"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleServerCommand,
  }),
  defineCommand({
    name: "user",
    options: [option("user", "userDesc")],
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleUserCommand,
  }),
  defineCommand({
    name: "avatar",
    options: [option("user", "userDesc")],
    contexts: ["server", "group", "dm"],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleAvatarCommand,
  }),
  defineCommand({
    name: "nick",
    contexts: ["server"],
    options: [option("name", "nameDesc")],
    permission: "USE_APPLICATION_COMMANDS",
    handler: handleNickCommand,
  }),
  defineCommand({
    name: "poll",
    aliases: ["anket"],
    options: [option("pollArgs", "pollArgsDesc", { required: true })],
    contexts: ["server", "group", "dm"],
    // Creating a poll needs only Send Messages (checked by the send path).
    permission: null,
    needsAppCommands: false,
    handler: handlePollCommand,
  }),
  defineCommand({
    name: "timeout",
    contexts: ["server"],
    options: [
      option("user", "memberDesc", { required: true }),
      option("duration", "durationDesc", { required: true }),
      option("reason", "reasonDesc"),
    ],
    permission: "MODERATE_MEMBERS",
    handler: handleTimeoutCommand,
  }),
  defineCommand({
    name: "kick",
    contexts: ["server"],
    options: [
      option("user", "memberDesc", { required: true }),
      option("reason", "reasonDesc"),
    ],
    permission: "KICK_MEMBERS",
    handler: handleKickCommand,
  }),
  defineCommand({
    name: "ban",
    contexts: ["server"],
    options: [
      option("user", "memberDesc", { required: true }),
      option("reason", "reasonDesc"),
    ],
    permission: "BAN_MEMBERS",
    handler: handleBanCommand,
  }),
  defineCommand({
    name: "purge",
    contexts: ["server"],
    options: [option("count", "countDesc", { required: true })],
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
    .map(({ name, description, i18n, options, permission, chatOnly, voiceOnly, casino, aliases }) => ({
      name,
      description,
      i18n,
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
  i18n = null,
} = {}) {
  return {
    ...(i18n ? { i18n } : {}),
    type: "rich",
    title,
    description,
    color: Number(color) || EMBED_COLORS.default,
    fields: Array.isArray(fields) ? fields.filter(Boolean) : [],
    thumbnail: thumbnail ? { url: String(thumbnail.url || thumbnail) } : null,
    image: image ? { url: String(image.url || image) } : null,
    footer: footer
      ? {
          text: String(footer.text || footer),
          iconUrl: footer.iconUrl || footer.icon_url || null,
          ...(footer.i18n ? { i18n: footer.i18n } : {}),
        }
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

/** Embed field; `name` is a bot.* key (English text + i18n.name), `value` may be a { key, vars } ref. */
function field(nameKey, value, inline = true) {
  const f = { name: en(nameKey), value, inline: Boolean(inline), i18n: { name: ref(nameKey) } };
  if (value && typeof value === "object" && typeof value.key === "string") {
    f.value = en(value.key, value.vars);
    f.i18n.value = ref(value.key, value.vars);
  }
  return f;
}

/** Footer object with an English text and its ref. */
function footerOf(key, vars) {
  return put({}, "text", key, vars);
}

function userFieldValue(user) {
  if (!user?.id) return ref("bot.slash.unknown");
  return {
    kind: "user",
    id: user.id,
    username: user.username || null,
    displayName: user.display_name || user.displayName || user.username || null,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
  };
}

/** { key: "bot.slash.date", vars: { date } } ref for a date value (viewer formats it), or null. */
function dateRef(value, withTime = false) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const iso = d.toISOString();
  return withTime ? ref("bot.slash.dateTime", { at: { dateTime: iso } }) : ref("bot.slash.date", { at: { date: iso } });
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

function createSlashBotMessage(content, type = "app_command", embed = null, i18n = null) {
  const now = new Date().toISOString();
  return {
    ...(i18n ? { i18n } : {}),
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
    ...(message.i18n?.content ? { i18n: { text: message.i18n.content } } : {}),
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
  if (!entry) return { ok: false, code: "EXPIRED", message: "This result can no longer be shared. Run the command again." };
  if (Date.now() - entry.at > SHARE_TTL_MS) {
    shareable.delete(messageId);
    return { ok: false, code: "EXPIRED", message: "This result can no longer be shared. Run the command again." };
  }
  if (entry.userId !== String(userId) || String(entry.channelId) !== String(channelId) || (serverId && String(entry.serverId) !== String(serverId))) {
    return { ok: false, code: "NOT_ALLOWED", message: "You can't share this result." };
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
  const err = new Error(MISSING_PERMISSION_TEXT[permission] || "You don't have permission to use this command.");
  err.status = 403;
  err.code = "MISSING_PERMISSION";
  err.permission = permission;
  return err;
}

// Static English (the client translates them through its API phrase catalog).
const MISSING_PERMISSION_TEXT = {
  USE_APPLICATION_COMMANDS: "You don't have permission for this command: Use application commands.",
  MODERATE_MEMBERS: "You don't have permission for this command: Time out members.",
  KICK_MEMBERS: "You don't have permission for this command: Kick members.",
  BAN_MEMBERS: "You don't have permission for this command: Ban members.",
  MANAGE_MESSAGES: "You don't have permission for this command: Manage messages.",
  CHANGE_NICKNAME: "You don't have permission for this command: Change nickname.",
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

/** App error card. title / description / usage are { key, vars } refs (or null). */
function errorReply(ctx, { title, description = null, kind = "error", suggestions = null, usage = null }) {
  const texts = (obj) => {
    put(obj, "title", title.key, title.vars);
    if (description) put(obj, "description", description.key, description.vars);
    return obj;
  };
  const card = texts({ kind: "error", tone: kind, description: null, suggestions, usage: null });
  if (usage) put(card, "usage", usage.key, usage.vars);
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", title.key, title.vars),
      type: "app_error",
      embed: makeEmbed({
        ...texts({ description: null }),
        color: kind === "warn" ? EMBED_COLORS.warn : EMBED_COLORS.danger,
        card,
      }),
    }),
  };
}

function userNotFound(ctx, query, suggestions) {
  const shown = String(query || "").trim().split(/\s+/)[0] || "";
  return errorReply(ctx, {
    title: ref("bot.slash.userNotFound"),
    description: shown ? ref("bot.slash.noMemberMatches", { query: shown.slice(0, 40) }) : ref("bot.slash.noMatchingMember"),
    kind: "warn",
    suggestions: suggestions?.length ? suggestions : null,
    usage: ref("bot.slash.userUsage", { command: ctx.parsed?.name || "user" }),
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
  { id: "general", labelKey: "bot.slash.groupGeneral", names: ["poll", "user", "avatar", "server", "nick", "help"] },
  { id: "moderation", labelKey: "bot.slash.groupModeration", names: ["timeout", "kick", "ban", "purge"] },
  { id: "games", labelKey: "bot.slash.groupGames", names: ["bj", "slot", "coinflip"], casino: true },
  { id: "credits", labelKey: "bot.slash.groupCredits", names: ["pay", "daily", "credits", "top"], casino: true },
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
    ...put({}, "label", g.labelKey),
    casino: Boolean(g.casino),
    commands: g.names
      .map((n) => registry.get(n))
      .filter((cmd) => cmd && cmd.contexts.includes(ctx.context) && canUseInServer(ctx, cmd))
      .map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        args: (cmd.options || []).map((o) => ({ name: o.name, required: o.required, i18n: { name: o.i18n.name } })),
        casino: Boolean(cmd.casino),
        i18n: cmd.i18n,
      })),
  })).filter((g) => g.commands.length);
  // Legacy embed fields (old clients): "/cmd ‹arg›" stays as typed, the description is translated.
  const fields = groups
    .flatMap((g) =>
      g.commands.map((c) => ({
        name: `/${c.name}${c.args.map((a) => (a.required ? ` ‹${a.name}›` : ` [${a.name}]`)).join("")}`,
        value: c.description,
        inline: false,
        i18n: { value: c.i18n.description },
      }))
    )
    .slice(0, 20);
  const subtitleKey = ctx.context === "server" ? "bot.slash.helpSubtitleServer" : "bot.slash.helpSubtitleChat";
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", "bot.slash.helpTitle"),
      type: "app_help",
      embed: makeEmbed({
        ...put(put({}, "title", "bot.slash.helpTitle"), "description", subtitleKey),
        color: EMBED_COLORS.blurple,
        fields,
        footer: footerOf("bot.slash.helpFooter"),
        card: { kind: "help", ...put(put({}, "title", "bot.slash.helpTitle"), "subtitle", subtitleKey), groups },
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
    return errorReply(ctx, { title: ref("bot.slash.serverNotFound"), description: ref("bot.slash.serverLoadFailed") });
  }
  const { presence } = require("../runtime/sharedState");
  const memberIds = (members || []).map((m) => m.user_id);
  const online = memberIds.filter((id) => {
    const p = presence.get(id);
    return p && p.status !== "invisible" && p.status !== "offline";
  }).length;
  const owner = server.owner_id ? await loadUserWithMembership(ctx.serverId, server.owner_id) : null;
  const created = dateRef(server.created_at) || ref("bot.slash.unknown");
  const name = server.name || en("bot.slash.serverFallback");
  const nameText = server.name ? { content: name } : put({}, "content", "bot.slash.serverFallback");
  const memberCount = memberIds.length;
  return {
    message: createContextMessage(ctx, {
      ...nameText,
      type: "app_server",
      embed: makeEmbed({
        title: name,
        ...(server.name ? {} : { i18n: { title: ref("bot.slash.serverFallback") } }),
        description: server.description || null,
        color: EMBED_COLORS.blurple,
        thumbnail: server.icon_url ? { url: server.icon_url } : null,
        fields: [
          field("bot.slash.fieldOwner", userFieldValue(owner), true),
          field("bot.slash.fieldMembers", String(memberCount), true),
          field("bot.slash.fieldChannels", String(channelCount ?? "?"), true),
          field("bot.slash.fieldCreated", created, true),
        ],
        footer: footerOf("bot.slash.serverFooter"),
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
  if (isOwner) badges.push(put({ id: "owner" }, "label", "bot.slash.badgeOwner"));
  else if (isServerAdmin) badges.push(put({ id: "admin" }, "label", "bot.slash.badgeAdmin"));
  if (u.is_admin || u.username === "admin") badges.push(put({ id: "staff" }, "label", "bot.slash.badgeStaff"));
  if (u.created_at && new Date(u.created_at) < new Date("2026-01-01T00:00:00Z")) badges.push(put({ id: "early" }, "label", "bot.slash.badgeEarly"));
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
  const realName = user.member?.nickname || user.display_name || user.username || "";
  const display = realName || en("bot.slash.userFallback");
  const fields = [
    field("bot.slash.fieldUsername", user.username ? `@${user.username}` : ref("bot.slash.atUnknown"), true),
  ];
  if (user.member?.nickname) fields.push(field("bot.slash.fieldNickname", user.member.nickname, true));
  if (user.member?.joined_at) fields.push(field("bot.slash.fieldJoinedServer", dateRef(user.member.joined_at), true));
  const country = card.user?.equippedCountry;
  if (country?.name) fields.push(field("bot.slash.fieldCountry", String(country.name), true));
  if (card.timeoutUntil) fields.push(field("bot.slash.fieldTimeoutEnds", dateRef(card.timeoutUntil, true), false));
  return {
    message: createContextMessage(ctx, {
      ...(realName ? { content: display } : put({}, "content", "bot.slash.userFallback")),
      type: "app_user",
      embed: makeEmbed({
        author: { name: display, iconUrl: user.avatar_url || null },
        color: EMBED_COLORS.success,
        thumbnail: user.avatar_url ? { url: user.avatar_url } : null,
        fields,
        footer: footerOf("bot.slash.userFooter"),
        card,
      }),
    }),
  };
}

async function handleAvatarCommand(ctx) {
  const user = await resolveUserArg(ctx, ctx.parsed.args);
  if (!user) return userNotFound(ctx, ctx.parsed.args, await suggestUsers(ctx, ctx.parsed.args));
  const display = user.member?.nickname || user.display_name || user.username || en("bot.slash.userFallback");
  const card = {
    kind: "avatar",
    user: { ...cardUser(user), presence: presenceOf(user.id) },
    displayName: display,
    avatarUrl: user.avatar_url || null,
  };
  const embedText = put({}, "title", "bot.slash.avatarTitle", { name: display });
  if (!user.avatar_url) put(embedText, "description", "bot.slash.avatarNotSet");
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", "bot.slash.avatarTitle", { name: display }),
      type: "app_avatar",
      embed: makeEmbed({
        ...embedText,
        color: EMBED_COLORS.pink,
        image: user.avatar_url ? { url: user.avatar_url } : null,
        footer: user.username ? { text: `@${user.username}` } : footerOf("bot.slash.atUnknown"),
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
      ...(nickname ? put({}, "content", "bot.slash.nickSetContent", { nickname }) : put({}, "content", "bot.slash.nickClearedContent")),
      type: "app_nick",
      embed: makeEmbed({
        ...put(
          put({}, "title", nickname ? "bot.slash.nickUpdatedTitle" : "bot.slash.nickClearedTitle"),
          "description",
          nickname ? "bot.slash.nickSetDesc" : "bot.slash.nickClearedDesc",
          nickname ? { nickname } : undefined
        ),
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
      title: ref("bot.slash.pollHowTitle"),
      description: ref("bot.slash.pollHowDesc"),
      kind: "warn",
      usage: ref("bot.slash.pollUsage"),
    });
  }
  const normalized = pollCore.normalizePollInput(raw);
  if (!normalized.ok) return errorReply(ctx, { title: ref("bot.slash.pollFailedTitle"), description: pollCore.inputErrorRef(normalized.code), kind: "warn" });
  if (ctx.context === "dm") {
    // DMs store the poll as the caller's own dm_messages row (see dm:send).
    return { dmPoll: normalized.poll };
  }
  const message = await persistPollMessage(ctx, normalized.poll);
  return { message };
}

/** Ref for a duration ("5 min", "1 week"); the card shows it next to the countdown. */
function durationRef(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s >= 604800 && s % 604800 === 0) return ref("bot.slash.durWeeks", { n: s / 604800 });
  if (s >= 86400 && s % 86400 === 0) return ref("bot.slash.durDays", { n: s / 86400 });
  if (s >= 3600 && s % 3600 === 0) return ref("bot.slash.durHours", { n: s / 3600 });
  if (s >= 60 && s % 60 === 0) return ref("bot.slash.durMinutes", { n: s / 60 });
  return ref("bot.slash.durSeconds", { n: s });
}

// Moderation errors (English server messages) -> the bot card's explanation.
const MODERATION_ERRORS = [
  [/(cannot|can't) kick yourself/i, "bot.slash.errKickSelf"],
  [/(cannot|can't) ban yourself/i, "bot.slash.errBanSelf"],
  [/server owner/i, "bot.slash.errOwner"],
  [/member not found|not in this server/i, "bot.slash.errNotMember"],
  [/hierarchy|higher role|role position|cannot moderate|cannot manage a member/i, "bot.slash.errHierarchy"],
  [/timeout expiry|timeout must end in the future/i, "bot.slash.errTimeoutFuture"],
];

function moderationErrorRef(err, fallbackKey) {
  const msg = String(err?.message || "");
  for (const [re, key] of MODERATION_ERRORS) if (re.test(msg)) return ref(key);
  return ref(fallbackKey);
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
    return errorReply(ctx, { title: ref("bot.slash.timeoutHowTitle"), description: ref("bot.slash.timeoutHowDesc"), kind: "warn", usage: ref("bot.slash.timeoutUsage") });
  }
  const target = await resolveUserArg(ctx, targetRaw);
  if (!target?.id || !target.member) return userNotFound(ctx, targetRaw, await suggestUsers(ctx, targetRaw));
  const durationSeconds = parseDurationSeconds(durationRaw);
  if (!durationSeconds) {
    return errorReply(ctx, { title: ref("bot.slash.invalidDurationTitle"), description: ref("bot.slash.invalidDurationDesc"), kind: "warn", usage: ref("bot.slash.timeoutUsage") });
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
    return errorReply(ctx, { title: ref("bot.slash.timeoutFailedTitle"), description: moderationErrorRef(err, "bot.slash.timeoutFailedDesc") });
  }
  try {
    const { removeUserFromServerVoice } = require("../socket/serverVoiceHandlers");
    removeUserFromServerVoice(ctx.io, ctx.serverId, target.id, "timeout");
  } catch (err) {
    console.warn("[slashCommands] voice cleanup after timeout failed:", err?.message || err);
  }
  const display = target.member?.nickname || target.display_name || target.username || en("bot.slash.memberFallback");
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", "bot.slash.timeoutDone", { name: display }),
      type: "app_timeout",
      embed: makeEmbed({
        ...put({}, "title", "bot.slash.timeoutDone", { name: display }),
        color: EMBED_COLORS.warn,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [
          field("bot.slash.fieldMember", userFieldValue(target), true),
          field("bot.slash.fieldEnds", dateRef(timeout.until, true) || ref("bot.slash.unknown"), true),
          reason ? field("bot.slash.fieldReason", reason, false) : null,
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
          ...(() => {
            const d = durationRef(durationSeconds);
            return put({}, "durationLabel", d.key, d.vars);
          })(),
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
    const err = new Error("You can't kick yourself.");
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
    const err = new Error("Server not found.");
    err.status = 404;
    throw err;
  }
  if (server.owner_id === targetUserId) {
    const err = new Error("You can't do this to the server owner.");
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
    const err = new Error("The member is not in this server.");
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
    const err = new Error("You can't ban yourself.");
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
    const err = new Error("Server not found.");
    err.status = 404;
    throw err;
  }
  if (server.owner_id === targetUserId) {
    const err = new Error("You can't do this to the server owner.");
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
    return errorReply(ctx, { title: ref("bot.slash.kickHowTitle"), description: ref("bot.slash.kickHowDesc"), kind: "warn", usage: ref("bot.slash.kickUsage") });
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
    return errorReply(ctx, { title: ref("bot.slash.kickFailedTitle"), description: moderationErrorRef(err, "bot.slash.kickFailedDesc") });
  }
  const display = target.member?.nickname || target.display_name || target.username || en("bot.slash.memberFallback");
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", "bot.slash.kickDone", { name: display }),
      type: "app_kick",
      embed: makeEmbed({
        ...put({}, "title", "bot.slash.kickDone", { name: display }),
        color: EMBED_COLORS.danger,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [field("bot.slash.fieldMember", userFieldValue(target), true), reason ? field("bot.slash.fieldReason", reason, false) : null],
        card: { kind: "moderation", action: "kick", serverId: ctx.serverId, target: { ...tCard, presence: "offline" }, actor: await actorCard(ctx), reason, at: new Date().toISOString() },
      }),
    }),
  };
}

async function handleBanCommand(ctx) {
  const [targetRaw, ...reasonParts] = ctx.parsed.args.split(/\s+/).filter(Boolean);
  if (!targetRaw) {
    return errorReply(ctx, { title: ref("bot.slash.banHowTitle"), description: ref("bot.slash.banHowDesc"), kind: "warn", usage: ref("bot.slash.banUsage") });
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
    return errorReply(ctx, { title: ref("bot.slash.banFailedTitle"), description: moderationErrorRef(err, "bot.slash.banFailedDesc") });
  }
  const display = target.member?.nickname || target.display_name || target.username || en("bot.slash.memberFallback");
  return {
    message: createContextMessage(ctx, {
      ...put({}, "content", "bot.slash.banDone", { name: display }),
      type: "app_ban",
      embed: makeEmbed({
        ...put({}, "title", "bot.slash.banDone", { name: display }),
        color: EMBED_COLORS.danger,
        thumbnail: target.avatar_url ? { url: target.avatar_url } : null,
        fields: [field("bot.slash.fieldMember", userFieldValue(target), true), reason ? field("bot.slash.fieldReason", reason, false) : null],
        card: { kind: "moderation", action: "ban", serverId: ctx.serverId, target: { ...tCard, presence: "offline" }, actor: await actorCard(ctx), reason, at: new Date().toISOString() },
      }),
    }),
  };
}

async function handlePurgeCommand(ctx) {
  const count = Math.max(0, Math.floor(Number(ctx.parsed.args) || 0));
  if (!count || count > 100) {
    return errorReply(ctx, { title: ref("bot.slash.purgeHowTitle"), description: ref("bot.slash.purgeHowDesc"), kind: "warn", usage: ref("bot.slash.purgeUsage") });
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
    return errorReply(ctx, { title: ref("bot.slash.purgeNothingTitle"), description: ref("bot.slash.purgeNothingDesc"), kind: "warn" });
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
      ...put({}, "content", "bot.slash.purgeDone", { count: ids.length }),
      type: "app_purge",
      embed: makeEmbed({
        ...put(put({}, "title", "bot.slash.purgeDone", { count: ids.length }), "description", "bot.slash.purgeDoneDesc", { count: ids.length }),
        color: EMBED_COLORS.success,
        footer: footerOf("bot.slash.purgeFooter"),
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
    return { ok: false, code: "NOT_ALLOWED", message: "You can't share this result." };
  }
  if (!resolved?.isOwner) {
    const { getActiveServerTimeout } = require("./serverTimeoutState");
    if (await getActiveServerTimeout(channel.server_id, userId)) {
      return { ok: false, code: "TIMED_OUT", message: "You can't share while you're timed out." };
    }
  }
  const taken = takeShareable({ messageId, userId, serverId: channel.server_id, channelId });
  if (!taken.ok) return taken;
  const original = taken.entry.message;
  const content = String(original.content || "Descall Apps").slice(0, 300);
  const meta = { embed: original.embed, appType: original.type, sharedFrom: "slash", ...(original.i18n ? { i18n: original.i18n } : {}) };
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
    ...(original.i18n ? { i18n: original.i18n } : {}),
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
  const message = createSlashBotMessage(opts.content || "", type, opts.embed || null, opts.i18n || null);
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
    const err = new Error("The timeout must end in the future.");
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
