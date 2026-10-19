"use strict";

/**
 * Descall Servers API — Steps 1–9
 * Create / list / get / delete / leave + channel CRUD + text chat + roles +
 * permission gates + member kick + invites / public discovery + bans / audit log.
 * Ownership limit: max 10 servers owned per user (membership unlimited).
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const {
  EVERYONE_DEFAULT,
  toPgBigint,
  fromPgBigint,
  Permissions,
  hasPermission,
  resolveMemberPermissions,
  resolveChannelPermissions,
  permissionsToFlags,
  applyOverwrites,
  effectiveOverwrites,
  assertHierarchy,
  assertCanManageRole,
  getMemberHighestPosition,
  canBrowsePrivateChannels,
  clipRolePermissions,
} = require("../lib/serverPermissions");
const { notifyServerAccessChanged } = require("../lib/serverAccessRealtime");
const { createSingleflight } = require("../lib/singleflight");
const { parseSince } = require("../lib/messagePage");
const myServersFlight = createSingleflight();
const {
  applyServerTimeout,
  clearServerTimeout,
  updateMemberNickname,
} = require("../lib/slashCommands");
const { postWelcomeMessage } = require("../lib/serverMemberJoin");
const { planDetachFromCategory, applyDetachPlan, materializeIfSynced } = require("../lib/categoryDetach");
const {
  BLANK_ID,
  listTemplateSummaries,
  getTemplate,
  seedServerFromTemplate,
} = require("../lib/serverTemplates");

const router = express.Router();

const MAX_OWNED_SERVERS = 10;
const MAX_CHANNELS_PER_SERVER = 500;
const MAX_ROLES_PER_SERVER = 50;
const MAX_SERVER_FOLDERS = 50;
const NAME_MIN = 2;
const NAME_MAX = 100;
const CHANNEL_NAME_MIN = 1;
const CHANNEL_NAME_MAX = 100;
const CHANNEL_TYPES = new Set(["text", "voice", "stage", "category", "announcement"]);
const ROLE_NAME_MIN = 1;
const ROLE_NAME_MAX = 100;
const INVITE_CODE_LENGTH = 8;
const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Permission keys editable in the role UI. */
const EDITABLE_PERMISSION_KEYS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_MESSAGES",
  "MANAGE_CHANNELS",
  "MANAGE_GUILD",
  "MANAGE_ROLES",
  "USE_APPLICATION_COMMANDS",
  "CREATE_INSTANT_INVITE",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "MODERATE_MEMBERS",
  "CHANGE_NICKNAME",
  "MANAGE_NICKNAMES",
  "VIEW_AUDIT_LOG",
  "MENTION_EVERYONE",
  "ATTACH_FILES",
  "EMBED_LINKS",
  "ADD_REACTIONS",
  "READ_MESSAGE_HISTORY",
  "CONNECT",
  "SPEAK",
  "REQUEST_TO_SPEAK",
  "PRIORITY_SPEAKER",
  "STREAM",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "ADMINISTRATOR",
];

/** Channel overwrite keys by channel type (Discord-like subset). */
const CHANNEL_OVERRIDE_KEYS = {
  text: [
    "VIEW_CHANNEL",
    "SEND_MESSAGES",
    "MANAGE_MESSAGES",
    "CREATE_INSTANT_INVITE",
    "MENTION_EVERYONE",
    "ATTACH_FILES",
    "EMBED_LINKS",
    "ADD_REACTIONS",
    "READ_MESSAGE_HISTORY",
  ],
  voice: [
    "VIEW_CHANNEL",
    "CONNECT",
    "SPEAK",
    "PRIORITY_SPEAKER",
    "STREAM",
    "MUTE_MEMBERS",
    "DEAFEN_MEMBERS",
    "MOVE_MEMBERS",
    "CREATE_INSTANT_INVITE",
  ],
  stage: [
    "VIEW_CHANNEL",
    "CONNECT",
    "REQUEST_TO_SPEAK",
    "PRIORITY_SPEAKER",
    "SPEAK",
    "STREAM",
    "MUTE_MEMBERS",
    "DEAFEN_MEMBERS",
    "MOVE_MEMBERS",
    "CREATE_INSTANT_INVITE",
  ],
  category: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "SEND_MESSAGES", "CREATE_INSTANT_INVITE"],
  announcement: [
    "VIEW_CHANNEL",
    "SEND_MESSAGES",
    "MANAGE_MESSAGES",
    "CREATE_INSTANT_INVITE",
    "MENTION_EVERYONE",
    "ATTACH_FILES",
    "EMBED_LINKS",
    "ADD_REACTIONS",
    "READ_MESSAGE_HISTORY",
  ],
};

/**
 * Return only channels the member can VIEW_CHANNEL.
 * Owner / ADMINISTRATOR see all (overwrite bypass). Everyone else is filtered,
 * including members with MANAGE_ROLES / MANAGE_CHANNELS.
 * Supports raw DB rows (parent_id) and publicChannel objects (parentId).
 * A channel uses its own overwrites, or its category's when it has none (Discord
 * "synced"). Empty categories are hidden.
 */
async function filterChannelsForMember(serverId, userId, channels, preloaded = null) {
  const list = Array.isArray(channels) ? channels : [];
  const base = await resolveMemberPermissions(supabase, serverId, userId, preloaded);
  if (!base.isMember) return [];
  if (canBrowsePrivateChannels(base)) {
    return list;
  }

  const parentIds = [
    ...new Set(list.map((c) => c.parent_id || c.parentId || null).filter(Boolean)),
  ];
  const overrideIds = [...new Set([...list.map((c) => c.id).filter(Boolean), ...parentIds])];

  let overrides;
  let roles;
  let assigned;
  if (preloaded?.overrides && preloaded?.roles && preloaded?.assigned) {
    const allowed = new Set(overrideIds.map(String));
    overrides = (preloaded.overrides || []).filter((row) => allowed.has(String(row.channel_id)));
    roles = preloaded.roles;
    assigned = preloaded.assigned;
  } else {
    const [overridesRes, rolesRes, assignedRes] = await Promise.all([
      overrideIds.length
        ? supabase
            .from("server_channel_overrides")
            .select("id, channel_id, target_type, target_id, allow_permissions, deny_permissions")
            .in("channel_id", overrideIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("server_roles").select("id, position, is_everyone").eq("server_id", serverId),
      supabase
        .from("server_member_roles")
        .select("role_id")
        .eq("server_id", serverId)
        .eq("user_id", userId),
    ]);
    if (overridesRes.error) throw overridesRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (assignedRes.error) throw assignedRes.error;
    overrides = overridesRes.data;
    roles = rolesRes.data;
    assigned = assignedRes.data;
  }

  const everyoneRoleId = (roles || []).find((r) => r.is_everyone)?.id || null;
  const rolePos = new Map((roles || []).map((r) => [String(r.id), Number(r.position) || 0]));
  const memberRoleIds = new Set((assigned || []).map((r) => String(r.role_id)));
  if (everyoneRoleId) memberRoleIds.add(String(everyoneRoleId));

  const byChannel = new Map();
  for (const o of overrides || []) {
    const key = String(o.channel_id);
    if (!byChannel.has(key)) byChannel.set(key, []);
    byChannel.get(key).push({
      ...o,
      _position: o.target_type === "role" ? rolePos.get(String(o.target_id)) || 0 : 0,
    });
  }

  const ctx = { everyoneRoleId, memberRoleIds, userId };
  const canView = new Map();
  for (const ch of list) {
    const parentId = ch.parent_id || ch.parentId || null;
    const bits = applyOverwrites(
      base.bits,
      effectiveOverwrites(byChannel.get(String(ch.id)), parentId ? byChannel.get(String(parentId)) : []),
      ctx
    );
    canView.set(ch.id, hasPermission(bits, Permissions.VIEW_CHANNEL));
  }

  const visibleChildParents = new Set();
  for (const ch of list) {
    const type = String(ch.type || "").toLowerCase();
    if (type === "category") continue;
    if (!canView.get(ch.id)) continue;
    const pid = ch.parent_id || ch.parentId || null;
    if (pid) visibleChildParents.add(pid);
  }

  return list.filter((ch) => {
    const type = String(ch.type || "").toLowerCase();
    if (type === "category") return visibleChildParents.has(ch.id);
    return Boolean(canView.get(ch.id));
  });
}

async function publicVisibleChannels(serverId, userId, channels, preloaded = null) {
  const visible = await filterChannelsForMember(serverId, userId, channels || [], preloaded);
  return visible.map(publicChannel);
}

/**
 * Parse an allow/deny map. `specified` marks the bits the caller actually named:
 * "allow"/true, "deny"/false, or an explicit "inherit"/null (= clear). A key that is
 * absent is "not specified" (the client omits inherit), so callers that must keep
 * stored bits (first edit on a synced channel) can tell the two apart.
 */
function parseAllowDenyFlags(raw, allowedKeys) {
  const keys = allowedKeys || EDITABLE_PERMISSION_KEYS;
  let allow = 0n;
  let deny = 0n;
  let specified = 0n;
  if (!raw || typeof raw !== "object") return { allow, deny, specified };
  for (const key of keys) {
    if (!Permissions[key]) continue;
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const v = raw[key];
    if (v === true || v === "allow") allow |= Permissions[key];
    else if (v === false || v === "deny") deny |= Permissions[key];
    else if (v === null || v === "inherit" || v === "clear") {
      /* explicit clear */
    } else continue;
    specified |= Permissions[key];
  }
  // Discord: a bit cannot be both allow and deny
  const both = allow & deny;
  allow &= ~both;
  deny &= ~both;
  return { allow, deny, specified };
}

function generateInviteCode() {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CHARS.charAt(require("crypto").randomInt(INVITE_CHARS.length));
  }
  return code;
}

function publicVanityUrl(req, slug) {
  const origin =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_ORIGIN ||
    `${req.protocol}://${req.get("host")}`;
  return `${String(origin).replace(/\/$/, "")}/s/${slug}`;
}

// Slugs that would impersonate the product or collide with app routes (audit 2026-10-19 #15).
const RESERVED_VANITY_SLUGS = new Set([
  "descall", "des-call", "admin", "administrator", "api", "app", "apps", "auth", "billing",
  "discover", "download", "downloads", "help", "invite", "invites", "login", "logout", "mod",
  "moderator", "official", "register", "security", "servers", "settings", "shop", "signup",
  "staff", "support", "system", "team", "www", "mail", "status", "store", "terms", "privacy",
  "legal", "kvkk", "destek", "yonetici", "resmi", "ekip", "descoin",
]);

/**
 * Server images must be our own uploads (https, Supabase storage of this project or a host
 * in SERVER_IMAGE_HOSTS). Arbitrary URLs leaked members' IPs to third-party hosts and
 * allowed http/data/javascript URLs (audit 2026-10-19 #5).
 */
function allowedServerImageHosts() {
  const hosts = new Set();
  for (const raw of [process.env.SUPABASE_URL, process.env.PUBLIC_API_URL]) {
    try {
      if (raw) hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  for (const h of String(process.env.SERVER_IMAGE_HOSTS || "").split(",")) {
    if (h.trim()) hosts.add(h.trim().toLowerCase());
  }
  return hosts;
}

function cleanServerImageUrl(raw, field) {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  const hosts = allowedServerImageHosts();
  const supabaseHost = url ? /\.supabase\.(co|in)$/i.test(url.hostname) : false;
  const hostOk = url ? (hosts.size ? hosts.has(url.host.toLowerCase()) : supabaseHost) : false;
  const ok =
    Boolean(url) &&
    url.protocol === "https:" &&
    value.length <= 500 &&
    !url.username &&
    !url.password &&
    hostOk &&
    (!supabaseHost || url.pathname.startsWith("/storage/v1/object/public/"));
  if (!ok) {
    const err = new Error(`${field} must be an image uploaded to Descall.`);
    err.status = 400;
    err.code = "INVALID_IMAGE_URL";
    throw err;
  }
  return value;
}

function normalizeVanitySlug(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  if (RESERVED_VANITY_SLUGS.has(slug)) {
    const err = new Error("That vanity URL is reserved.");
    err.status = 400;
    err.code = "VANITY_RESERVED";
    throw err;
  }
  if (slug.length < 3 || slug.length > 32) {
    const err = new Error("Vanity URL must be 3–32 characters (letters, numbers, hyphens).");
    err.status = 400;
    err.code = "INVALID_VANITY_SLUG";
    throw err;
  }
  return slug;
}

function publicInviteUrl(req, code) {
  const origin =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_ORIGIN ||
    `${req.protocol}://${req.get("host")}`;
  return `${String(origin).replace(/\/$/, "")}/servers/join/${code}`;
}

function publicInvite(row, req) {
  if (!row) return null;
  return {
    code: row.code,
    serverId: row.server_id,
    creatorId: row.creator_id,
    channelId: row.channel_id || null,
    maxUses: row.max_uses,
    uses: row.uses || 0,
    maxAgeSeconds: row.max_age_seconds,
    temporary: Boolean(row.temporary),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: publicInviteUrl(req, row.code),
  };
}

function isInviteExpired(invite) {
  if (!invite) return true;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return true;
  if (invite.max_uses != null && (invite.uses || 0) >= invite.max_uses) return true;
  return false;
}

/** Bitmask of every permission the role editor can toggle. */
const EDITABLE_PERMISSION_MASK = EDITABLE_PERMISSION_KEYS.reduce(
  (acc, key) => (Permissions[key] != null ? acc | Permissions[key] : acc),
  0n
);

/**
 * Parse role permission input.
 * - object flags → OR of true EDITABLE keys (ADMINISTRATOR expands to all editable)
 * - number/string → bigint bitfield
 * When `existingBits` is provided, non-editable bits (USE_VAD, etc.) are preserved
 * so saving the role editor cannot silently strip baseline @everyone grants.
 */
function parsePermissionsInput(raw, existingBits = null) {
  if (raw == null) return null;
  let parsed = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    // { VIEW_CHANNEL: true, ... }
    let bits = 0n;
    if (raw.ADMINISTRATOR) {
      bits = EDITABLE_PERMISSION_MASK;
    } else {
      for (const key of EDITABLE_PERMISSION_KEYS) {
        if (raw[key] && Permissions[key] != null) bits |= Permissions[key];
      }
    }
    parsed = bits;
  } else {
    try {
      parsed = fromPgBigint(raw);
    } catch {
      return null;
    }
  }
  if (existingBits == null) return parsed;
  const keep = fromPgBigint(existingBits) & ~EDITABLE_PERMISSION_MASK;
  return keep | (parsed & EDITABLE_PERMISSION_MASK);
}

function clampColor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0xffffff, Math.floor(n)));
}

function cleanName(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

/** Discord-like channel names: text is slug-ish; voice/category keep spaces. */
function cleanChannelName(raw, type) {
  let name = String(raw || "").trim();
  if (type === "text" || type === "announcement") {
    name = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  } else {
    name = name.replace(/\s+/g, " ");
  }
  return name.slice(0, CHANNEL_NAME_MAX);
}

async function requireServerOwner(serverId, userId) {
  const membership = await getMembership(serverId, userId);
  if (!membership) {
    const err = new Error("You are not a member of this server.");
    err.status = 403;
    throw err;
  }
  const { data: server, error } = await supabase
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle();
  if (error) throw error;
  if (!server) {
    const err = new Error("Server not found.");
    err.status = 404;
    throw err;
  }
  if (server.owner_id !== userId) {
    const err = new Error("Only the server owner can do this.");
    err.status = 403;
    err.code = "OWNER_REQUIRED";
    throw err;
  }
  return { server, membership, permissions: null, isOwner: true };
}

/**
 * Require membership + a permission bit (owner always passes).
 * @param {bigint|string} flag — Permissions.* bit or key name
 */
async function hasServerPermission(serverId, userId, flag) {
  const resolved = await resolveMemberPermissions(supabase, serverId, userId);
  return Boolean(resolved.isMember && hasPermission(resolved.bits, flag));
}

async function requireServerPermission(serverId, userId, flag) {
  const resolved = await resolveMemberPermissions(supabase, serverId, userId);
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.status = 403;
    throw err;
  }
  if (!hasPermission(resolved.bits, flag)) {
    const err = new Error("Missing permission.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    err.permission = typeof flag === "string" ? flag : null;
    throw err;
  }
  const { data: server, error } = await supabase
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle();
  if (error) throw error;
  if (!server) {
    const err = new Error("Server not found.");
    err.status = 404;
    throw err;
  }
  return {
    server,
    permissions: resolved.bits,
    isOwner: resolved.isOwner,
  };
}

async function buildMyPermissionsPayload(serverId, userId, preloaded = null) {
  const [resolved, highestPosition] = await Promise.all([
    resolveMemberPermissions(supabase, serverId, userId, preloaded),
    getMemberHighestPosition(supabase, serverId, userId, preloaded),
  ]);
  return {
    bits: toPgBigint(resolved.bits),
    flags: permissionsToFlags(resolved.bits),
    isOwner: resolved.isOwner,
    highestPosition,
  };
}

async function nextChannelPosition(serverId) {
  const { data, error } = await supabase
    .from("server_channels")
    .select("position")
    .eq("server_id", serverId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  const top = data?.[0]?.position;
  return typeof top === "number" ? top + 1 : 0;
}

/** You cannot put channels into a category you cannot see (same 400 as a missing one). */
async function assertParentVisible(serverId, actorId, parentId) {
  const r = await resolveChannelPermissions(supabase, serverId, actorId, parentId);
  if (!r.isMember || r.channelMissing || !hasPermission(r.bits, Permissions.VIEW_CHANNEL)) {
    const err = new Error("Parent category not found.");
    err.status = 400;
    throw err;
  }
}

async function assertValidParent(serverId, parentId, channelType) {
  if (!parentId) return null;
  if (channelType === "category") {
    const err = new Error("Categories cannot be nested.");
    err.status = 400;
    throw err;
  }
  const { data: parent, error } = await supabase
    .from("server_channels")
    .select("*")
    .eq("id", parentId)
    .eq("server_id", serverId)
    .maybeSingle();
  if (error) throw error;
  if (!parent) {
    const err = new Error("Parent category not found.");
    err.status = 400;
    throw err;
  }
  if (parent.type !== "category") {
    const err = new Error("Parent must be a category.");
    err.status = 400;
    throw err;
  }
  return parent;
}

function publicServer(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.icon_url || null,
    bannerUrl: row.banner_url || null,
    splashUrl: row.splash_url || null,
    description: row.description || null,
    ownerId: row.owner_id,
    vanitySlug: row.vanity_slug || null,
    isPublic: Boolean(row.is_public),
    communityEnabled: Boolean(row.community_enabled),
    rulesChannelId: row.rules_channel_id || null,
    rulesText: row.rules_text || null,
    verificationLevel: row.verification_level || "none",
    afkChannelId: row.afk_channel_id || null,
    afkTimeoutSeconds: row.afk_timeout_seconds ?? 300,
    systemChannelId: row.system_channel_id || null,
    welcomeChannelId: row.welcome_channel_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

function publicChannel(row) {
  if (!row) return null;
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    type: row.type,
    topic: row.topic || null,
    position: row.position ?? 0,
    parentId: row.parent_id || null,
    slowmodeSeconds: row.slowmode_seconds ?? 0,
    nsfw: Boolean(row.nsfw),
    createdAt: row.created_at,
  };
}

/**
 * Enforce server verification_level before allowing a new join.
 * none → allow
 * low → verified email
 * medium → verified email + account age ≥ 5m
 * high → verified email + account age ≥ 10m
 * highest → verified email + account age ≥ 10m + 2FA enabled
 */
async function assertJoinVerification(serverOrLevel, userId) {
  const level = String(
    typeof serverOrLevel === "string"
      ? serverOrLevel
      : serverOrLevel?.verification_level || serverOrLevel?.verificationLevel || "none"
  ).toLowerCase();
  if (!level || level === "none") return;

  const { data: user, error } = await supabase
    .from("users")
    .select("email_confirmed_at, created_at, two_factor_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const emailOk = Boolean(user?.email_confirmed_at);
  const ageMs = user?.created_at ? Date.now() - new Date(user.created_at).getTime() : 0;
  const requirements = [];

  if (!emailOk) requirements.push("verified_email");
  if (level === "medium" && ageMs < 5 * 60 * 1000) requirements.push("account_age_5m");
  if ((level === "high" || level === "highest") && ageMs < 10 * 60 * 1000) {
    requirements.push("account_age_10m");
  }
  if (level === "highest" && !user?.two_factor_enabled) requirements.push("two_factor");

  if (requirements.length) {
    const err = new Error("Your account does not meet this server's verification requirements.");
    err.status = 403;
    err.code = "VERIFICATION_REQUIRED";
    err.requirements = requirements;
    err.verificationLevel = level;
    throw err;
  }
}

async function attachServerReactions(messages, channelId) {
  if (!Array.isArray(messages) || !messages.length || !channelId) return messages;
  try {
    const ids = messages.map((m) => m.id).filter(Boolean);
    if (!ids.length) return messages;
    const { data, error } = await supabase
      .from("reactions")
      .select("message_id, emoji, user_id")
      .eq("conversation_type", "server")
      .eq("conversation_id", String(channelId))
      .in("message_id", ids.map(String));
    if (error) {
      console.warn("[SERVERS] attach reactions failed:", error.message);
      return messages;
    }
    const byMsg = new Map();
    for (const r of data || []) {
      const mid = String(r.message_id);
      if (!byMsg.has(mid)) byMsg.set(mid, []);
      byMsg.get(mid).push({
        emoji: r.emoji,
        userId: r.user_id,
        username: null,
        messageId: mid,
      });
    }
    return messages.map((m) => ({
      ...m,
      reactions: byMsg.get(String(m.id)) || byMsg.get(m.id) || m.reactions || [],
    }));
  } catch (err) {
    console.warn("[SERVERS] attach reactions error:", err?.message || err);
    return messages;
  }
}

function publicRole(row) {
  if (!row) return null;
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    color: row.color ?? 0,
    position: row.position ?? 0,
    permissions: String(row.permissions ?? "0"),
    hoist: Boolean(row.hoist),
    mentionable: Boolean(row.mentionable),
    isEveryone: Boolean(row.is_everyone),
    iconUrl: row.icon_url || null,
    createdAt: row.created_at,
  };
}

/**
 * Compensating check for count-then-insert limits (no row lock available through
 * PostgREST): after inserting row `id`, the oldest `cap` rows win; true means ours is
 * past the cap and must be undone. Parallel inserts can no longer both slip through,
 * and at most the late ones are rejected.
 */
async function insertedOverCap(table, column, value, id, cap) {
  const { data, error } = await supabase
    .from(table)
    .select("id, created_at")
    .eq(column, value)
    .order("created_at", { ascending: true })
    .limit(cap + 50);
  if (error) throw error;
  const rows = [...(data || [])].sort((a, b) => {
    const t = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    return t || String(a.id).localeCompare(String(b.id));
  });
  if (rows.length <= cap) return false;
  const idx = rows.findIndex((r) => String(r.id) === String(id));
  return idx === -1 || idx >= cap;
}

async function countOwnedServers(userId) {
  const { count, error } = await supabase
    .from("servers")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (error) throw error;
  return count || 0;
}

async function getMembership(serverId, userId) {
  const { data, error } = await supabase
    .from("server_members")
    .select("server_id, user_id, nickname, list_position, joined_at, timeout_until, timeout_reason, timed_out_by, notification_level, rules_accepted_at")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadServerBundle(serverId) {
  const [{ data: server, error: sErr }, { data: channels, error: cErr }, { data: roles, error: rErr }] =
    await Promise.all([
      supabase.from("servers").select("*").eq("id", serverId).maybeSingle(),
      supabase
        .from("server_channels")
        .select("*")
        .eq("server_id", serverId)
        .order("position", { ascending: true }),
      supabase
        .from("server_roles")
        .select("*")
        .eq("server_id", serverId)
        .order("position", { ascending: false }),
    ]);
  if (sErr) throw sErr;
  if (cErr) throw cErr;
  if (rErr) throw rErr;
  if (!server) return null;

  const { count: memberCount, error: mErr } = await supabase
    .from("server_members")
    .select("user_id", { count: "exact", head: true })
    .eq("server_id", serverId);
  if (mErr) throw mErr;

  return {
    server,
    channels: channels || [],
    roles: roles || [],
    memberCount: memberCount || 0,
  };
}

async function writeAudit({ serverId, actorId, action, targetType, targetId, changes, reason }) {
  const { error } = await supabase.from("server_audit_logs").insert({
    server_id: serverId,
    actor_id: actorId || null,
    action,
    target_type: targetType || null,
    target_id: targetId ? String(targetId) : null,
    changes: changes || null,
    reason: reason || null,
  });
  if (error) {
    console.warn("[SERVERS] audit log insert failed:", error.message);
  }
}

async function deleteServerCascade(serverId) {
  // FK cascades handle children; delete server row.
  const { error } = await supabase.from("servers").delete().eq("id", serverId);
  if (error) throw error;
}

/** Broadcast a live server event to everyone currently in `server:${id}`. */
function emitToServer(req, serverId, event, payload) {
  const io = req.app?.get?.("io");
  if (!io || !serverId || !event) return;
  try {
    io.to(`server:${serverId}`).emit(event, { serverId, ...payload });
  } catch (err) {
    console.warn("[SERVERS] emitToServer failed:", event, err?.message || err);
  }
}

/** Members (and the owner) of serverId who can VIEW_CHANNEL `channel`. */
async function channelViewerIds(serverId, channel) {
  const { data: members, error } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId);
  if (error) throw error;

  const { data: serverRow } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .maybeSingle();

  const userIds = new Set((members || []).map((m) => m.user_id));
  if (serverRow?.owner_id) userIds.add(serverRow.owner_id);

  const viewers = [];
  await Promise.all(
    [...userIds].map(async (uid) => {
      try {
        const visible = await filterChannelsForMember(serverId, uid, [channel]);
        if (visible.length) viewers.push(uid);
      } catch (err) {
        console.warn("[SERVERS] channelViewerIds member skip:", uid, err?.message || err);
      }
    })
  );
  return viewers;
}

function emitToUsers(req, userIds, event, payload) {
  const io = getIo(req);
  if (!io || !event) return;
  for (const uid of userIds || []) {
    try {
      io.to(`user:${uid}`).emit(event, payload);
    } catch (err) {
      console.warn("[SERVERS] emitToUsers failed:", event, err?.message || err);
    }
  }
}

/** Emit channel create/update only to members who can VIEW_CHANNEL (no private channel leaks). */
async function emitChannelToViewers(req, serverId, event, channel, extra = {}) {
  const io = getIo(req);
  if (!io || !serverId || !event || !channel?.id) return;
  const pub = publicChannel(channel);
  const payload = { serverId, channel: pub, ...extra };

  try {
    emitToUsers(req, await channelViewerIds(serverId, channel), event, payload);
  } catch (err) {
    console.warn("[SERVERS] emitChannelToViewers failed:", event, err?.message || err);
  }
}

function getIo(req) {
  return req.app?.get?.("io") || null;
}

function notifyAccess(req, serverId, extra = {}) {
  void notifyServerAccessChanged(getIo(req), serverId, extra);
}

async function assertServerChannelRef(serverId, channelId, allowedTypes) {
  if (!channelId) return null;
  const { data: channel, error } = await supabase
    .from("server_channels")
    .select("id, type, server_id")
    .eq("id", channelId)
    .eq("server_id", serverId)
    .maybeSingle();
  if (error) throw error;
  if (!channel) {
    const err = new Error("Channel not found on this server.");
    err.status = 400;
    throw err;
  }
  if (allowedTypes && !allowedTypes.includes(channel.type)) {
    const err = new Error("Invalid channel type for this setting.");
    err.status = 400;
    throw err;
  }
  return channel;
}

async function afterMemberJoined(req, serverRow, userId, serverId) {
  const bundle = await loadServerBundle(serverId);
  await postWelcomeMessage(getIo(req), bundle?.server || serverRow, userId);
  const myPermissions = await buildMyPermissionsPayload(serverId, userId);
  const member = await publicMemberBrief(serverId, userId);
  emitToServer(req, serverId, "server:member:joined", {
    member,
    memberCount: bundle.memberCount,
  });
  return { bundle, myPermissions, member };
}

async function publicMemberBrief(serverId, userId, extras = {}) {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const membership = await getMembership(serverId, userId);
    return {
      userId,
      username: user?.username || null,
      displayName: user?.display_name || null,
      avatarUrl: user?.avatar_url || null,
      nickname: membership?.nickname || extras.nickname || null,
      joinedAt: membership?.joined_at || extras.joinedAt || null,
      roleIds: extras.roleIds || [],
      isOwner: Boolean(extras.isOwner),
    };
  } catch {
    return { userId, ...extras };
  }
}

/**
 * A member left on their own: drop their sockets from this server's rooms (server,
 * its text channels, its voice channels) and its voice calls. They kept receiving
 * live messages until reconnect before (audit 2026-10-18).
 */
async function evictLeavingMember(req, serverId, userId) {
  const io = req.app?.get?.("io");
  if (!io) return;
  await require("../lib/serverRooms").dropUserFromServer(io, serverId, userId, "left");
}

/**
 * Live-notify a kicked/banned user + other server members.
 * Also drops them from server voice rooms.
 */
function notifyServerMemberRemoved(req, {
  serverId,
  serverName,
  targetUserId,
  action,
  reason,
  actorId,
}) {
  const io = req.app?.get?.("io");
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
  void require("../lib/serverRooms").dropUserFromServer(io, serverId, targetUserId, action === "ban" ? "ban" : "kick");

}

/**
 * GET /servers/my
 * Servers the user is a member of (owned + joined), ordered by list_position.
 */
router.get("/my", requireAuth, async (req, res) => {
  const started = Date.now();
  try {
    const payload = await myServersFlight.run(req.user.id, () => buildMyServerList(req.user.id));
    console.log(`[SERVERS] GET /my ${payload.servers?.length || 0} servers in ${Date.now() - started}ms`);
    return res.json(payload);
  } catch (err) {
    console.error("[SERVERS] GET /my error:", err);
    return res.status(500).json({ error: "Failed to load servers." });
  }
});

async function buildMyServerList(userId) {
  try {
    const { data: memberships, error } = await supabase
      .from("server_members")
      .select(
        "server_id, nickname, list_position, joined_at, notification_level, rules_accepted_at, timeout_until, timeout_reason, folder_id"
      )
      .eq("user_id", userId)
      .order("list_position", { ascending: true });
    if (error) throw error;

    const ids = (memberships || []).map((m) => m.server_id);
    if (ids.length === 0) {
      return { servers: [], ownedCount: 0, maxOwned: MAX_OWNED_SERVERS };
    }

    const [serversRes, memberRowsRes, channelsRes] = await Promise.all([
      supabase.from("servers").select("*").in("id", ids),
      supabase.from("server_members").select("server_id").in("server_id", ids),
      supabase
        .from("server_channels")
        .select("*")
        .in("server_id", ids)
        .order("position", { ascending: true }),
    ]);
    if (serversRes.error) throw serversRes.error;
    const servers = serversRes.data || [];
    if (memberRowsRes.error) {
      console.warn("[SERVERS] member count batch failed:", memberRowsRes.error.message);
    }
    const channels = channelsRes.error ? [] : (channelsRes.data || []);
    if (channelsRes.error) console.warn("[SERVERS] channel batch failed:", channelsRes.error.message);

    const byId = new Map(servers.map((s) => [s.id, s]));
    const ownedCount = servers.filter((s) => s.owner_id === userId).length;

    const counts = new Map();
    for (const row of memberRowsRes.data || []) {
      counts.set(row.server_id, (counts.get(row.server_id) || 0) + 1);
    }

    const rawChannelsByServer = new Map();
    for (const ch of channels) {
      if (!rawChannelsByServer.has(ch.server_id)) rawChannelsByServer.set(ch.server_id, []);
      rawChannelsByServer.get(ch.server_id).push(ch);
    }

    const channelIds = channels.map((ch) => ch.id).filter(Boolean);
    const [rolesRes, assignedRes, overridesRes] = await Promise.all([
      supabase
        .from("server_roles")
        .select("id, server_id, permissions, is_everyone, position")
        .in("server_id", ids),
      supabase
        .from("server_member_roles")
        .select("server_id, role_id, user_id")
        .eq("user_id", userId)
        .in("server_id", ids),
      channelIds.length
        ? supabase
            .from("server_channel_overrides")
            .select("id, channel_id, target_type, target_id, allow_permissions, deny_permissions")
            .in("channel_id", channelIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (assignedRes.error) throw assignedRes.error;
    if (overridesRes.error) console.warn("[SERVERS] override batch failed:", overridesRes.error.message);

    const rolesByServer = new Map();
    for (const role of rolesRes.data || []) {
      if (!rolesByServer.has(role.server_id)) rolesByServer.set(role.server_id, []);
      rolesByServer.get(role.server_id).push(role);
    }
    const assignedByServer = new Map();
    for (const row of assignedRes.data || []) {
      if (!assignedByServer.has(row.server_id)) assignedByServer.set(row.server_id, []);
      assignedByServer.get(row.server_id).push(row);
    }
    const channelServer = new Map(channels.map((ch) => [String(ch.id), ch.server_id]));
    const overridesByServer = new Map();
    for (const row of overridesRes.data || []) {
      const serverId = channelServer.get(String(row.channel_id));
      if (!serverId) continue;
      if (!overridesByServer.has(serverId)) overridesByServer.set(serverId, []);
      overridesByServer.get(serverId).push(row);
    }

    // Permissions and VIEW_CHANNEL filtering run in memory from the three
    // batched reads above. Previously each server repeated those queries.
    const metaEntries = await Promise.all(
      ids.map(async (id) => {
        const row = byId.get(id);
        const preloaded = {
          server: row ? { id: row.id, owner_id: row.owner_id } : null,
          isMember: true,
          roles: rolesByServer.get(id) || [],
          assigned: assignedByServer.get(id) || [],
          overrides: overridesRes.error ? null : (overridesByServer.get(id) || []),
        };
        const [myPermissions, visibleChannels] = await Promise.all([
          buildMyPermissionsPayload(id, userId, preloaded),
          publicVisibleChannels(id, userId, rawChannelsByServer.get(id) || [], preloaded),
        ]);
        return [id, { myPermissions, channels: visibleChannels }];
      })
    );
    const metaByServer = new Map(metaEntries);

    const list = (memberships || [])
      .map((m) => {
        const row = byId.get(m.server_id);
        if (!row) return null;
        const level = String(m.notification_level || "all").toLowerCase();
        return publicServer(row, {
          nickname: m.nickname || null,
          listPosition: m.list_position ?? 0,
          joinedAt: m.joined_at,
          notificationLevel: ["all", "mentions", "muted"].includes(level) ? level : "all",
          rulesAcceptedAt: m.rules_accepted_at || null,
          timeoutUntil: m.timeout_until || null,
          timeoutReason: m.timeout_reason || null,
          folderId: m.folder_id || null,
          isOwner: row.owner_id === userId,
          memberCount: counts.get(row.id) || 0,
          channels: metaByServer.get(row.id)?.channels || [],
          myPermissions: metaByServer.get(row.id)?.myPermissions || null,
        });
      })
      .filter(Boolean);

    return {
      servers: list,
      ownedCount,
      maxOwned: MAX_OWNED_SERVERS,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * PUT /servers/my/order — reorder the current user's server list (list_position).
 * Body: { serverIds: string[] } — full ordered list of server ids the user belongs to.
 */
router.put("/my/order", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const rawIds = Array.isArray(req.body?.serverIds) ? req.body.serverIds : null;
    if (!rawIds || rawIds.length === 0) {
      return res.status(400).json({ error: "serverIds is required.", code: "INVALID_ORDER" });
    }

    const serverIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];
    if (serverIds.length === 0) {
      return res.status(400).json({ error: "serverIds is required.", code: "INVALID_ORDER" });
    }

    const { data: memberships, error } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", userId);
    if (error) throw error;

    const memberSet = new Set((memberships || []).map((m) => m.server_id));
    if (serverIds.length !== memberSet.size || serverIds.some((id) => !memberSet.has(id))) {
      return res.status(400).json({
        error: "serverIds must include every server you belong to, exactly once.",
        code: "INVALID_ORDER",
      });
    }

    // Rewrite positions sequentially so GET /my stays stable.
    for (let index = 0; index < serverIds.length; index += 1) {
      const { error: upErr } = await supabase
        .from("server_members")
        .update({ list_position: index })
        .eq("user_id", userId)
        .eq("server_id", serverIds[index]);
      if (upErr) throw upErr;
    }

    return res.json({
      ok: true,
      serverIds,
      listPositions: serverIds.map((_, index) => index),
    });
  } catch (err) {
    console.error("[SERVERS] PUT /my/order error:", err);
    return res.status(500).json({ error: "Failed to reorder servers." });
  }
});

async function assertMemberChannel(serverId, channelId, userId) {
  const { data: channel, error: chErr } = await supabase
    .from("server_channels")
    .select("id, server_id, type")
    .eq("id", channelId)
    .eq("server_id", serverId)
    .maybeSingle();
  if (chErr) throw chErr;
  if (!channel) {
    const err = new Error("Channel not found.");
    err.status = 404;
    throw err;
  }
  const { data: member, error: mErr } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!member) {
    const err = new Error("You are not a member of this server.");
    err.status = 403;
    throw err;
  }
  // Mute / read receipts only for channels you can see (hidden ones answered 200).
  const resolved = await resolveChannelPermissions(supabase, serverId, userId, channel.id);
  if (!hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
    const err = new Error("Channel not found.");
    err.status = 404;
    throw err;
  }
  return channel;
}

/**
 * GET /servers/me/channel-mutes — muted text channel ids for current user.
 */
router.get("/me/channel-mutes", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from("server_channel_mutes")
      .select("channel_id")
      .eq("user_id", userId);
    if (error) throw error;
    return res.json({
      channelIds: (data || []).map((r) => r.channel_id).filter(Boolean),
    });
  } catch (err) {
    console.error("[SERVERS] GET /me/channel-mutes error:", err);
    return res.status(500).json({ error: "Failed to load channel mutes." });
  }
});

/**
 * PUT /servers/:id/channels/:channelId/mute — toggle per-channel mute (synced).
 */
router.put("/:id/channels/:channelId/mute", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    const userId = req.user.id;
    const muted = Boolean(req.body?.muted);

    const channel = await assertMemberChannel(serverId, channelId, userId);
    if (channel.type !== "text") {
      return res.status(400).json({ error: "Only text channels can be muted." });
    }

    if (muted) {
      const { error } = await supabase.from("server_channel_mutes").upsert(
        {
          user_id: userId,
          channel_id: channelId,
          muted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,channel_id" }
      );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("server_channel_mutes")
        .delete()
        .eq("user_id", userId)
        .eq("channel_id", channelId);
      if (error) throw error;
    }

    return res.json({ channelId, serverId, muted });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT channel mute error:", err);
    return res.status(status).json({ error: err.message || "Failed to update channel mute." });
  }
});

/**
 * GET /servers/me/unread — unread counts per text channel for current user.
 */
router.get("/me/unread", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: memberships, error: mErr } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", userId);
    if (mErr) throw mErr;
    const serverIds = (memberships || []).map((m) => m.server_id).filter(Boolean);
    if (!serverIds.length) {
      return res.json({ unread: {} });
    }

    const { data: channels, error: cErr } = await supabase
      .from("server_channels")
      .select("id")
      .in("server_id", serverIds)
      .eq("type", "text");
    if (cErr) throw cErr;
    const channelIds = (channels || []).map((c) => c.id).filter(Boolean);
    if (!channelIds.length) {
      return res.json({ unread: {} });
    }

    const { data: reads, error: rErr } = await supabase
      .from("server_channel_reads")
      .select("channel_id, unread_count")
      .eq("user_id", userId)
      .in("channel_id", channelIds);
    if (rErr) throw rErr;

    const unread = {};
    for (const row of reads || []) {
      const count = Math.max(0, Number(row.unread_count) || 0);
      if (count > 0 && row.channel_id) unread[row.channel_id] = count;
    }
    return res.json({ unread });
  } catch (err) {
    console.error("[SERVERS] GET /me/unread error:", err);
    return res.status(500).json({ error: "Failed to load unread counts." });
  }
});

/**
 * POST /servers/:id/channels/:channelId/read — mark channel read for current user.
 */
router.post("/:id/channels/:channelId/read", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    const userId = req.user.id;
    // Optimistic rows use ids like "temp-…". The column is uuid; a non-uuid
    // used to 500 the read receipt. Keep the timestamp update and drop the id.
    const rawLastId = req.body?.lastReadMessageId ? String(req.body.lastReadMessageId) : "";
    const lastMessageId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawLastId)
      ? rawLastId
      : null;

    await assertMemberChannel(serverId, channelId, userId);
    const now = new Date().toISOString();
    const { error } = await supabase.from("server_channel_reads").upsert(
      {
        user_id: userId,
        channel_id: channelId,
        last_read_at: now,
        last_read_message_id: lastMessageId,
        unread_count: 0,
      },
      { onConflict: "user_id,channel_id" }
    );
    if (error) throw error;
    return res.json({ channelId, serverId, lastReadAt: now, unreadCount: 0 });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST channel read error:", err?.message || err);
    return res.status(status).json({ error: err.message || "Failed to mark channel read." });
  }
});

/**
 * GET /servers/me/folders — personal server folders.
 */
router.get("/me/folders", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from("server_folders")
      .select("id, name, position, created_at")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    if (error) throw error;
    return res.json({
      folders: (data || []).map((f) => ({
        id: f.id,
        name: f.name,
        position: f.position ?? 0,
        createdAt: f.created_at,
      })),
    });
  } catch (err) {
    console.error("[SERVERS] GET /me/folders error:", err);
    return res.status(500).json({ error: "Failed to load folders." });
  }
});

/**
 * POST /servers/me/folders — create folder.
 */
router.post("/me/folders", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const name = String(req.body?.name || "").trim().slice(0, 100);
    if (name.length < 1) {
      return res.status(400).json({ error: "Folder name is required." });
    }
    // Folders were unlimited and unthrottled (audit 2026-10-19 #17).
    {
      const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
      if (rejectIfLimited(res, [recordFailure(`server-folder-create:user:${userId}`, { windowMs: 10 * 60 * 1000, max: 30 })])) return;
      const { count, error: cntErr } = await supabase
        .from("server_folders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (cntErr) throw cntErr;
      if ((count || 0) >= MAX_SERVER_FOLDERS) {
        return res.status(400).json({
          error: `You can have at most ${MAX_SERVER_FOLDERS} folders.`,
          code: "MAX_FOLDERS",
          maxFolders: MAX_SERVER_FOLDERS,
        });
      }
    }
    const { data: existing, error: listErr } = await supabase
      .from("server_folders")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1);
    if (listErr) throw listErr;
    const position =
      existing?.length && Number.isFinite(existing[0].position)
        ? existing[0].position + 1
        : 0;
    const { data, error } = await supabase
      .from("server_folders")
      .insert({ user_id: userId, name, position })
      .select("id, name, position, created_at")
      .single();
    if (error) throw error;
    if (await insertedOverCap("server_folders", "user_id", userId, data.id, MAX_SERVER_FOLDERS)) {
      await supabase.from("server_folders").delete().eq("id", data.id);
      return res.status(400).json({
        error: `You can have at most ${MAX_SERVER_FOLDERS} folders.`,
        code: "MAX_FOLDERS",
        maxFolders: MAX_SERVER_FOLDERS,
      });
    }
    return res.status(201).json({
      folder: {
        id: data.id,
        name: data.name,
        position: data.position ?? 0,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    console.error("[SERVERS] POST /me/folders error:", err);
    return res.status(500).json({ error: "Failed to create folder." });
  }
});

/**
 * PATCH /servers/me/folders/:folderId — rename or reorder folder.
 */
router.patch("/me/folders/:folderId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const folderId = req.params.folderId;
    const { data: row, error: findErr } = await supabase
      .from("server_folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!row) return res.status(404).json({ error: "Folder not found." });

    const patch = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim().slice(0, 100);
      if (name.length < 1) {
        return res.status(400).json({ error: "Folder name is required." });
      }
      patch.name = name;
    }
    if (req.body?.position !== undefined) {
      const pos = Math.floor(Number(req.body.position));
      if (!Number.isFinite(pos) || pos < 0) {
        return res.status(400).json({ error: "Invalid folder position." });
      }
      patch.position = pos;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    const { data, error } = await supabase
      .from("server_folders")
      .update(patch)
      .eq("id", folderId)
      .eq("user_id", userId)
      .select("id, name, position, created_at")
      .single();
    if (error) throw error;
    return res.json({
      folder: {
        id: data.id,
        name: data.name,
        position: data.position ?? 0,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    console.error("[SERVERS] PATCH /me/folders error:", err);
    return res.status(500).json({ error: "Failed to update folder." });
  }
});

/**
 * DELETE /servers/me/folders/:folderId — delete folder (servers become unfiled).
 */
router.delete("/me/folders/:folderId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const folderId = req.params.folderId;
    const { data: row, error: findErr } = await supabase
      .from("server_folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!row) return res.status(404).json({ error: "Folder not found." });

    await supabase
      .from("server_members")
      .update({ folder_id: null })
      .eq("user_id", userId)
      .eq("folder_id", folderId);
    const { error } = await supabase
      .from("server_folders")
      .delete()
      .eq("id", folderId)
      .eq("user_id", userId);
    if (error) throw error;
    return res.json({ message: "Folder deleted.", folderId });
  } catch (err) {
    console.error("[SERVERS] DELETE /me/folders error:", err);
    return res.status(500).json({ error: "Failed to delete folder." });
  }
});

/**
 * PATCH /servers/:id/me/folder — assign this server to a folder (or unfiled).
 */
router.patch("/:id/me/folder", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const folderId =
      req.body?.folderId === null || req.body?.folderId === ""
        ? null
        : req.body?.folderId
          ? String(req.body.folderId)
          : undefined;
    if (folderId === undefined) {
      return res.status(400).json({ error: "folderId is required (uuid or null)." });
    }

    const { data: member, error: mErr } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!member) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }

    if (folderId) {
      const { data: folder, error: fErr } = await supabase
        .from("server_folders")
        .select("id")
        .eq("id", folderId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fErr) throw fErr;
      if (!folder) return res.status(404).json({ error: "Folder not found." });
    }

    const { error } = await supabase
      .from("server_members")
      .update({ folder_id: folderId })
      .eq("server_id", serverId)
      .eq("user_id", userId);
    if (error) throw error;
    return res.json({ serverId, folderId });
  } catch (err) {
    console.error("[SERVERS] PATCH /:id/me/folder error:", err);
    return res.status(500).json({ error: "Failed to update server folder." });
  }
});

/**
 * GET /servers/templates — advanced create-server templates (public metadata).
 */
router.get("/templates", requireAuth, (_req, res) => {
  return res.json({
    blank: {
      id: BLANK_ID,
      name: "Start from scratch",
      description: "Empty server with only @everyone — build channels and roles yourself.",
      accent: "#94a3b8",
      icon: "Sparkles",
      highlights: ["No channels", "@everyone only", "Full control"],
      roleCount: 1,
      channelCount: 0,
      categoryCount: 0,
    },
    templates: listTemplateSummaries(),
  });
});

/**
 * POST /servers
 * Create a server. Enforces max 10 owned servers.
 * Optional templateId seeds advanced roles/channels/overrides (or blank = from scratch).
 * Legacy: omitted / "default" keeps a simple Discord-like starter layout.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const name = cleanName(req.body?.name);
    const iconUrl = cleanServerImageUrl(req.body?.iconUrl, "iconUrl");
    let description = req.body?.description
      ? String(req.body.description).trim().slice(0, 500)
      : null;
    const rawTemplate = req.body?.templateId ?? req.body?.template ?? "default";
    const templateKey = String(rawTemplate || "default").trim().toLowerCase();

    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return res.status(400).json({ error: `Server name must be ${NAME_MIN}–${NAME_MAX} characters.` });
    }

    let templateMode = "default";
    let template = null;
    if (templateKey === BLANK_ID || templateKey === "scratch" || templateKey === "from_scratch") {
      templateMode = "blank";
    } else if (templateKey === "default" || templateKey === "") {
      templateMode = "default";
    } else {
      template = getTemplate(templateKey);
      if (template === undefined) {
        return res.status(400).json({
          error: "Unknown server template.",
          code: "UNKNOWN_TEMPLATE",
          templates: listTemplateSummaries().map((t) => t.id),
        });
      }
      templateMode = "template";
      if (!description && template.descriptionSeed) {
        description = template.descriptionSeed.slice(0, 500);
      }
    }

    const owned = await countOwnedServers(userId);
    if (owned >= MAX_OWNED_SERVERS) {
      return res.status(400).json({
        error: `You can own at most ${MAX_OWNED_SERVERS} servers.`,
        code: "MAX_OWNED_SERVERS",
        ownedCount: owned,
        maxOwned: MAX_OWNED_SERVERS,
      });
    }

    const { data: server, error: sErr } = await supabase
      .from("servers")
      .insert({
        name,
        icon_url: iconUrl,
        description,
        owner_id: userId,
        is_public: false,
      })
      .select("*")
      .single();
    if (sErr) throw sErr;

    // Two parallel creates both passed the count above: re-count after the insert and
    // undo ours if it went over the cap (audit 2026-10-19 #9).
    if (await insertedOverCap("servers", "owner_id", userId, server.id, MAX_OWNED_SERVERS)) {
      await deleteServerCascade(server.id);
      return res.status(400).json({
        error: `You can own at most ${MAX_OWNED_SERVERS} servers.`,
        code: "MAX_OWNED_SERVERS",
        ownedCount: MAX_OWNED_SERVERS,
        maxOwned: MAX_OWNED_SERVERS,
      });
    }

    // Member row
    const { count: existingPos } = await supabase
      .from("server_members")
      .select("server_id", { count: "exact", head: true })
      .eq("user_id", userId);
    const listPosition = existingPos || 0;

    const { error: mErr } = await supabase.from("server_members").insert({
      server_id: server.id,
      user_id: userId,
      list_position: listPosition,
    });
    if (mErr) {
      await deleteServerCascade(server.id);
      throw mErr;
    }

    let seededRoles = [];
    let seededChannels = [];

    if (templateMode === "blank" || templateMode === "template") {
      const seeded = await seedServerFromTemplate(supabase, {
        serverId: server.id,
        template: templateMode === "blank" ? null : template,
        deleteServerCascade,
      });
      seededRoles = seeded.roles || [];
      seededChannels = seeded.channels || [];
    } else {
      // Legacy simple starter (compat)
      const { data: everyoneRole, error: rErr } = await supabase
        .from("server_roles")
        .insert({
          server_id: server.id,
          name: "@everyone",
          color: 0,
          position: 0,
          permissions: toPgBigint(EVERYONE_DEFAULT),
          hoist: false,
          mentionable: false,
          is_everyone: true,
        })
        .select("*")
        .single();
      if (rErr) {
        await deleteServerCascade(server.id);
        throw rErr;
      }

      const { data: category, error: catErr } = await supabase
        .from("server_channels")
        .insert({
          server_id: server.id,
          name: "Text Channels",
          type: "category",
          position: 0,
        })
        .select("*")
        .single();
      if (catErr) {
        await deleteServerCascade(server.id);
        throw catErr;
      }

      const { data: general, error: gErr } = await supabase
        .from("server_channels")
        .insert({
          server_id: server.id,
          name: "general",
          type: "text",
          position: 1,
          parent_id: category.id,
        })
        .select("*")
        .single();
      if (gErr) {
        await deleteServerCascade(server.id);
        throw gErr;
      }

      const { data: voiceCat, error: vCatErr } = await supabase
        .from("server_channels")
        .insert({
          server_id: server.id,
          name: "Voice Channels",
          type: "category",
          position: 2,
        })
        .select("*")
        .single();
      if (vCatErr) {
        await deleteServerCascade(server.id);
        throw vCatErr;
      }

      const { data: generalVoice, error: vErr } = await supabase
        .from("server_channels")
        .insert({
          server_id: server.id,
          name: "General",
          type: "voice",
          position: 3,
          parent_id: voiceCat.id,
        })
        .select("*")
        .single();
      if (vErr) {
        await deleteServerCascade(server.id);
        throw vErr;
      }

      seededRoles = [everyoneRole];
      seededChannels = [category, general, voiceCat, generalVoice];
    }

    // Refresh server row (template may have patched description/rules)
    const { data: freshServer } = await supabase
      .from("servers")
      .select("*")
      .eq("id", server.id)
      .maybeSingle();

    await writeAudit({
      serverId: server.id,
      actorId: userId,
      action: "SERVER_CREATE",
      targetType: "server",
      targetId: server.id,
      changes: { name, templateId: templateMode === "template" ? template.id : templateMode },
    });

    return res.status(201).json({
      server: publicServer(freshServer || server, {
        isOwner: true,
        memberCount: 1,
        nickname: null,
        listPosition,
        channels: seededChannels.map(publicChannel),
        roles: seededRoles.map(publicRole),
        myPermissions: await buildMyPermissionsPayload(server.id, userId),
        templateId: templateMode === "template" ? template.id : templateMode,
      }),
      ownedCount: owned + 1,
      maxOwned: MAX_OWNED_SERVERS,
    });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error("[SERVERS] POST / error:", err);
    return res.status(500).json({ error: "Failed to create server." });
  }
});

// ---- join hardening (audit 2026-10-19: D1, #9, #17) ----
const MAX_JOINED_SERVERS = 200;
const JOIN_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };
const JOIN_IP_LIMIT = { windowMs: 10 * 60 * 1000, max: 60 };
const INVITE_LOOKUP_LIMIT = { windowMs: 10 * 60 * 1000, max: 120 };
const DISCOVER_LIMIT = { windowMs: 60 * 1000, max: 30 };

/** Counted on every attempt: joins and invite lookups had no limit (code guessing, join spam). */
function rejectJoinRate(req, res, kind = "join") {
  const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
  const uid = req.user?.id;
  const ip = req.ip || "";
  const results =
    kind === "lookup"
      ? [recordFailure(`server-invite-lookup:user:${uid}`, INVITE_LOOKUP_LIMIT)]
      : kind === "discover"
        ? [recordFailure(`server-discover:user:${uid}`, DISCOVER_LIMIT)]
        : [
            recordFailure(`server-join:user:${uid}`, JOIN_LIMIT),
            ip ? recordFailure(`server-join:ip:${ip}`, JOIN_IP_LIMIT) : { ok: true },
          ];
  return rejectIfLimited(res, results);
}

async function alreadyMemberPayload(serverId, userId, existing) {
  const membership = existing || (await getMembership(serverId, userId));
  const bundle = await loadServerBundle(serverId);
  const myPermissions = await buildMyPermissionsPayload(serverId, userId);
  const channels = await publicVisibleChannels(serverId, userId, bundle.channels);
  return {
    alreadyMember: true,
    server: publicServer(bundle.server, {
      isOwner: bundle.server.owner_id === userId,
      memberCount: bundle.memberCount,
      nickname: membership?.nickname || null,
      listPosition: membership?.list_position ?? 0,
      joinedAt: membership?.joined_at,
      channels,
      roles: bundle.roles.map(publicRole),
      myPermissions,
    }),
  };
}

/**
 * Insert the membership for a join. Returns { ok } or { alreadyMember } (a parallel join
 * won: unique violation 23505 used to surface as a 500) or { banned } (a ban landed between
 * the ban check and the insert: the fresh membership is removed again) or { capped }.
 */
async function insertJoinMembership(serverId, userId, { listPosition, temporary = false } = {}) {
  if (listPosition >= MAX_JOINED_SERVERS) return { capped: true };
  const { error } = await supabase.from("server_members").insert({
    server_id: serverId,
    user_id: userId,
    list_position: listPosition,
    temporary: Boolean(temporary),
  });
  if (error) {
    if (String(error.code) === "23505") return { alreadyMember: true };
    throw error;
  }
  const { data: ban } = await supabase
    .from("server_bans")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ban) {
    await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", userId);
    return { banned: true };
  }
  return { ok: true };
}

function joinRefusal(res, result) {
  if (result.banned) return res.status(403).json({ error: "You are banned from this server.", code: "BANNED" });
  if (result.capped) {
    return res.status(400).json({
      error: `You can be in at most ${MAX_JOINED_SERVERS} servers.`,
      code: "MAX_JOINED_SERVERS",
      maxJoined: MAX_JOINED_SERVERS,
    });
  }
  return null;
}

/**
 * GET /servers/discover — public servers directory (is_public = true)
 */
router.get("/discover", requireAuth, async (req, res) => {
  try {
    if (rejectJoinRate(req, res, "discover")) return;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.min(5000, Math.max(0, Math.floor(Number(req.query.offset) || 0)));
    const sort = ["members", "new", "active"].includes(String(req.query.sort)) ? String(req.query.sort) : "new";
    const q = String(req.query.q || "").trim().slice(0, 80);
    const cols =
      "id, name, icon_url, banner_url, splash_url, description, owner_id, vanity_slug, is_public, community_enabled, rules_text, verification_level, created_at, updated_at";

    // members/active are ranked over a bounded candidate window (newest 200 public servers
    // matching q), then paged; "new" pages straight in the database.
    const windowed = sort !== "new";
    let query = supabase
      .from("servers")
      .select(cols)
      .eq("is_public", true)
      .order(sort === "active" ? "updated_at" : "created_at", { ascending: false });
    if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);
    query = windowed ? query.limit(200) : query.range(offset, offset + limit);

    const { data: fetched, error } = await query;
    if (error) throw error;

    // Exact member counts with head-only count queries (the old single select silently
    // stopped at PostgREST's 1000-row cap, so busy servers showed wrong counts).
    const countFor = async (id) => {
      const { count } = await supabase
        .from("server_members")
        .select("user_id", { count: "exact", head: true })
        .eq("server_id", id);
      return count || 0;
    };
    let rows = fetched || [];
    let hasMore;
    let counts = new Map();
    if (windowed) {
      const all = await Promise.all(rows.map(async (r) => [r.id, await countFor(r.id)]));
      counts = new Map(all);
      if (sort === "members") rows = [...rows].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
      hasMore = rows.length > offset + limit;
      rows = rows.slice(offset, offset + limit);
    } else {
      hasMore = rows.length > limit;
      rows = rows.slice(0, limit);
      counts = new Map(await Promise.all(rows.map(async (r) => [r.id, await countFor(r.id)])));
    }

    const ids = rows.map((r) => r.id);
    const { data: myMemberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", req.user.id)
      .in("server_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const joined = new Set((myMemberships || []).map((m) => m.server_id));
    const { maskProfanity } = require("../lib/profanity");

    return res.json({
      servers: rows.map((row) =>
        publicServer(
          // Public listing: bad words in name / description are masked (stored text unchanged).
          { ...row, name: maskProfanity(row.name), description: row.description ? maskProfanity(row.description) : row.description },
          {
            memberCount: counts.get(row.id) || 1,
            isMember: joined.has(row.id),
            isOwner: row.owner_id === req.user.id,
          }
        )
      ),
      sort,
      offset,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (err) {
    console.error("[SERVERS] GET /discover error:", err);
    return res.status(500).json({ error: "Failed to load public servers." });
  }
});


/**
 * GET /servers/invites/:code — public invite preview (auth optional but requireAuth for consistency)
 */
router.get("/invites/:code", requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Invite code is required." });
    if (rejectJoinRate(req, res, "lookup")) return;

    const { data: invite, error } = await supabase
      .from("server_invites")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!invite) return res.status(404).json({ error: "Invite invalid or expired.", code: "INVITE_INVALID" });

    if (isInviteExpired(invite)) {
      await supabase.from("server_invites").delete().eq("code", code);
      return res.status(410).json({ error: "Invite invalid or expired.", code: "INVITE_EXPIRED" });
    }

    const { data: server } = await supabase
      .from("servers")
      .select(
        "id, name, icon_url, banner_url, splash_url, description, owner_id, is_public, community_enabled, rules_text, verification_level"
      )
      .eq("id", invite.server_id)
      .maybeSingle();
    if (!server) {
      return res.status(404).json({ error: "Invite invalid or expired.", code: "INVITE_INVALID" });
    }

    const { count } = await supabase
      .from("server_members")
      .select("user_id", { count: "exact", head: true })
      .eq("server_id", server.id);

    const membership = await getMembership(server.id, req.user.id);

    return res.json({
      invite: publicInvite(invite, req),
      server: publicServer(server, {
        memberCount: count || 1,
        isMember: Boolean(membership),
        isOwner: server.owner_id === req.user.id,
        rulesAcceptedAt: membership?.rules_accepted_at || null,
        needsRulesAccept:
          Boolean(server.community_enabled) &&
          Boolean(server.rules_text) &&
          !membership?.rules_accepted_at,
      }),
    });
  } catch (err) {
    console.error("[SERVERS] GET /invites/:code error:", err);
    return res.status(500).json({ error: "Failed to load invite." });
  }
});

/**
 * Take one use of an invite: UPDATE server_invites SET uses = n + 1 WHERE code = ? AND uses = n
 * (only when n < max_uses), retried on contention. Row-level atomic in Postgres, so at most
 * max_uses joins succeed. Returns the updated row, or null if the invite is used up / gone.
 */
async function claimInviteUse(code) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: row, error } = await supabase
      .from("server_invites")
      .select("code, uses, max_uses, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!row || isInviteExpired(row)) return null;
    const cur = Number(row.uses) || 0;
    if (row.max_uses != null && cur >= row.max_uses) return null;
    let q = supabase.from("server_invites").update({ uses: cur + 1 }).eq("code", code);
    q = row.uses == null ? q.is("uses", null) : q.eq("uses", cur);
    const { data: updated, error: upErr } = await q.select("code, uses, max_uses");
    if (upErr) throw upErr;
    if (Array.isArray(updated) ? updated.length : updated) {
      return Array.isArray(updated) ? updated[0] : updated;
    }
  }
  const err = new Error("Invite is busy, try again.");
  err.status = 409;
  err.code = "INVITE_BUSY";
  throw err;
}

/** Give a claimed use back (member insert failed). Best effort, same compare-and-swap. */
async function releaseInviteUse(code) {
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data: row } = await supabase.from("server_invites").select("uses").eq("code", code).maybeSingle();
      if (!row) return;
      const cur = Number(row.uses) || 0;
      if (cur <= 0) return;
      const { data: updated } = await supabase
        .from("server_invites")
        .update({ uses: cur - 1 })
        .eq("code", code)
        .eq("uses", cur)
        .select("code");
      if (Array.isArray(updated) ? updated.length : updated) return;
    }
  } catch (err) {
    console.warn("[SERVERS] invite use release failed:", err?.message || err);
  }
}

/**
 * POST /servers/invites/:code/join — redeem invite
 */
router.post("/invites/:code/join", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Invite code is required." });
    if (rejectJoinRate(req, res, "join")) return;

    const { data: invite, error } = await supabase
      .from("server_invites")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!invite) return res.status(404).json({ error: "Invite invalid or expired.", code: "INVITE_INVALID" });
    if (isInviteExpired(invite)) {
      await supabase.from("server_invites").delete().eq("code", code);
      return res.status(410).json({ error: "Invite invalid or expired.", code: "INVITE_EXPIRED" });
    }

    const { data: ban } = await supabase
      .from("server_bans")
      .select("user_id")
      .eq("server_id", invite.server_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ban) {
      return res.status(403).json({ error: "You are banned from this server.", code: "BANNED" });
    }

    const existing = await getMembership(invite.server_id, userId);
    if (existing) return res.json(await alreadyMemberPayload(invite.server_id, userId, existing));

    const { data: inviteServer, error: inviteServerErr } = await supabase
      .from("servers")
      .select("id, verification_level")
      .eq("id", invite.server_id)
      .maybeSingle();
    if (inviteServerErr) throw inviteServerErr;
    try {
      await assertJoinVerification(inviteServer, userId);
    } catch (vErr) {
      return res.status(vErr.status || 403).json({
        error: vErr.message,
        code: vErr.code || "VERIFICATION_REQUIRED",
        requirements: vErr.requirements || [],
        verificationLevel: vErr.verificationLevel || inviteServer?.verification_level || "none",
      });
    }

    const { count: existingPos } = await supabase
      .from("server_members")
      .select("server_id", { count: "exact", head: true })
      .eq("user_id", userId);
    const listPosition = existingPos || 0;

    // Claim a use atomically before adding the member (compare-and-swap on `uses`):
    // parallel joins used to all pass the max_uses check and all get in.
    const claimed = await claimInviteUse(code);
    if (!claimed) {
      return res.status(410).json({ error: "Invite invalid or expired.", code: "INVITE_EXPIRED" });
    }

    if (listPosition >= MAX_JOINED_SERVERS) {
      await releaseInviteUse(code);
      return joinRefusal(res, { capped: true });
    }
    let joined;
    try {
      joined = await insertJoinMembership(invite.server_id, userId, {
        listPosition,
        temporary: invite.temporary,
      });
    } catch (joinErr) {
      await releaseInviteUse(code);
      throw joinErr;
    }
    if (!joined.ok) {
      await releaseInviteUse(code);
      if (joined.alreadyMember) return res.json(await alreadyMemberPayload(invite.server_id, userId));
      return joinRefusal(res, joined);
    }

    if (claimed.max_uses != null && claimed.uses >= claimed.max_uses) {
      await supabase.from("server_invites").delete().eq("code", code);
    }

    await writeAudit({
      serverId: invite.server_id,
      actorId: userId,
      action: "MEMBER_JOIN",
      targetType: "member",
      targetId: userId,
      changes: { via: "invite", code },
    });

    const { bundle, myPermissions } = await afterMemberJoined(
      req,
      null,
      userId,
      invite.server_id
    );
    const channels = await publicVisibleChannels(invite.server_id, userId, bundle.channels);

    return res.status(201).json({
      alreadyMember: false,
      server: publicServer(bundle.server, {
        isOwner: false,
        memberCount: bundle.memberCount,
        nickname: null,
        listPosition,
        channels,
        roles: bundle.roles.map(publicRole),
        myPermissions,
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /invites/:code/join error:", err);
    return res.status(status).json({ error: err.message || "Failed to join server.", code: err.code });
  }
});

/**
 * GET /servers/vanity/:slug — vanity URL preview (must be registered before /:id)
 */
router.get("/vanity/:slug", requireAuth, async (req, res) => {
  try {
    if (rejectJoinRate(req, res, "lookup")) return;
    let slug;
    try {
      slug = normalizeVanitySlug(req.params.slug);
    } catch (slugErr) {
      return res.status(slugErr.status || 400).json({ error: slugErr.message, code: slugErr.code });
    }

    const { data: server, error } = await supabase
      .from("servers")
      .select(
        "id, name, icon_url, banner_url, splash_url, description, owner_id, vanity_slug, is_public, community_enabled, rules_text, verification_level, welcome_channel_id"
      )
      .eq("vanity_slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!server) {
      return res.status(404).json({ error: "Server not found.", code: "VANITY_NOT_FOUND" });
    }

    const { count } = await supabase
      .from("server_members")
      .select("user_id", { count: "exact", head: true })
      .eq("server_id", server.id);

    const membership = await getMembership(server.id, req.user.id);

    return res.json({
      vanity: { slug, url: publicVanityUrl(req, slug) },
      server: publicServer(server, {
        memberCount: count || 1,
        isMember: Boolean(membership),
        isOwner: server.owner_id === req.user.id,
        rulesAcceptedAt: membership?.rules_accepted_at || null,
        needsRulesAccept:
          Boolean(server.community_enabled) &&
          Boolean(server.rules_text) &&
          !membership?.rules_accepted_at,
      }),
    });
  } catch (err) {
    console.error("[SERVERS] GET /vanity/:slug error:", err);
    return res.status(500).json({ error: "Failed to load server." });
  }
});

/**
 * POST /servers/vanity/:slug/join — join via vanity URL
 */
router.post("/vanity/:slug/join", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    if (rejectJoinRate(req, res, "join")) return;
    let slug;
    try {
      slug = normalizeVanitySlug(req.params.slug);
    } catch (slugErr) {
      return res.status(slugErr.status || 400).json({ error: slugErr.message, code: slugErr.code });
    }

    const { data: server, error } = await supabase
      .from("servers")
      .select("*")
      .eq("vanity_slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!server) {
      return res.status(404).json({ error: "Server not found.", code: "VANITY_NOT_FOUND" });
    }

    const { data: ban } = await supabase
      .from("server_bans")
      .select("user_id")
      .eq("server_id", server.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ban) {
      return res.status(403).json({ error: "You are banned from this server.", code: "BANNED" });
    }

    const existing = await getMembership(server.id, userId);
    if (existing) return res.json(await alreadyMemberPayload(server.id, userId, existing));

    try {
      await assertJoinVerification(server, userId);
    } catch (vErr) {
      return res.status(vErr.status || 403).json({
        error: vErr.message,
        code: vErr.code || "VERIFICATION_REQUIRED",
        requirements: vErr.requirements || [],
        verificationLevel: vErr.verificationLevel || server.verification_level || "none",
      });
    }

    const { count: existingPos } = await supabase
      .from("server_members")
      .select("server_id", { count: "exact", head: true })
      .eq("user_id", userId);
    const listPosition = existingPos || 0;

    const joined = await insertJoinMembership(server.id, userId, { listPosition, temporary: false });
    if (joined.alreadyMember) return res.json(await alreadyMemberPayload(server.id, userId));
    if (!joined.ok) return joinRefusal(res, joined);

    await writeAudit({
      serverId: server.id,
      actorId: userId,
      action: "MEMBER_JOIN",
      targetType: "member",
      targetId: userId,
      changes: { via: "vanity", slug },
    });

    const { bundle, myPermissions } = await afterMemberJoined(req, server, userId, server.id);
    const channels = await publicVisibleChannels(server.id, userId, bundle.channels);

    return res.status(201).json({
      alreadyMember: false,
      server: publicServer(bundle.server, {
        isOwner: false,
        memberCount: bundle.memberCount,
        nickname: null,
        listPosition,
        channels,
        roles: bundle.roles.map(publicRole),
        myPermissions,
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /vanity/:slug/join error:", err);
    return res.status(status).json({ error: err.message || "Failed to join server.", code: err.code });
  }
});

/**
 * POST /servers/discover/:id/join — join a public server without invite
 */
router.post("/discover/:id/join", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.id;
    if (rejectJoinRate(req, res, "join")) return;

    const { data: server, error } = await supabase
      .from("servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();
    if (error) throw error;
    if (!server || !server.is_public) {
      return res.status(404).json({ error: "Public server not found." });
    }

    const { data: ban } = await supabase
      .from("server_bans")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ban) {
      return res.status(403).json({ error: "You are banned from this server.", code: "BANNED" });
    }

    const existing = await getMembership(serverId, userId);
    if (existing) return res.json(await alreadyMemberPayload(serverId, userId, existing));

    try {
      await assertJoinVerification(server, userId);
    } catch (vErr) {
      return res.status(vErr.status || 403).json({
        error: vErr.message,
        code: vErr.code || "VERIFICATION_REQUIRED",
        requirements: vErr.requirements || [],
        verificationLevel: vErr.verificationLevel || server.verification_level || "none",
      });
    }

    const { count: existingPos } = await supabase
      .from("server_members")
      .select("server_id", { count: "exact", head: true })
      .eq("user_id", userId);

    const joined = await insertJoinMembership(serverId, userId, { listPosition: existingPos || 0 });
    if (joined.alreadyMember) return res.json(await alreadyMemberPayload(serverId, userId));
    if (!joined.ok) return joinRefusal(res, joined);

    await writeAudit({
      serverId,
      actorId: userId,
      action: "MEMBER_JOIN",
      targetType: "member",
      targetId: userId,
      changes: { via: "discover" },
    });

    const { bundle, myPermissions } = await afterMemberJoined(req, server, userId, serverId);
    const channels = await publicVisibleChannels(serverId, userId, bundle.channels);

    return res.status(201).json({
      alreadyMember: false,
      server: publicServer(bundle.server, {
        isOwner: false,
        memberCount: bundle.memberCount,
        channels,
        roles: bundle.roles.map(publicRole),
        myPermissions,
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /discover/:id/join error:", err);
    return res.status(status).json({ error: status >= 500 ? "Failed to join public server." : err.message, code: err.code });
  }
});

/**
 * GET /servers/:id
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const membership = await getMembership(serverId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }

    const bundle = await loadServerBundle(serverId);
    if (!bundle) return res.status(404).json({ error: "Server not found." });

    const myPermissions = await buildMyPermissionsPayload(serverId, req.user.id);
    const visibleChannels = await filterChannelsForMember(
      serverId,
      req.user.id,
      bundle.channels
    );

    const level = String(membership.notification_level || "all").toLowerCase();
    return res.json({
      server: publicServer(bundle.server, {
        isOwner: bundle.server.owner_id === req.user.id,
        memberCount: bundle.memberCount,
        nickname: membership.nickname || null,
        listPosition: membership.list_position ?? 0,
        joinedAt: membership.joined_at,
        notificationLevel: ["all", "mentions", "muted"].includes(level) ? level : "all",
        rulesAcceptedAt: membership.rules_accepted_at || null,
        timeoutUntil: membership.timeout_until || null,
        timeoutReason: membership.timeout_reason || null,
        channels: visibleChannels.map(publicChannel),
        roles: bundle.roles.map(publicRole),
        myPermissions,
      }),
    });
  } catch (err) {
    console.error("[SERVERS] GET /:id error:", err);
    return res.status(500).json({ error: "Failed to load server." });
  }
});

/**
 * DELETE /servers/:id
 * Owner only. Requires confirmName matching the server name.
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const confirmName = cleanName(req.body?.confirmName || req.query?.confirmName);

    const { data: server, error } = await supabase
      .from("servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();
    if (error) throw error;
    if (!server) return res.status(404).json({ error: "Server not found." });
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Only the owner can delete this server." });
    }
    if (!confirmName || confirmName.toLowerCase() !== String(server.name).toLowerCase()) {
      return res.status(400).json({
        error: "Type the server name to confirm deletion.",
        code: "CONFIRM_NAME_REQUIRED",
      });
    }

    // The SERVER_DELETE row now lives in server_deletion_log (server_audit_logs rows
    // cascade with the server, so the old audit write vanished with it).
    await require("../lib/serverDeletion").deleteServerFully(req.app?.get?.("io"), server, {
      actorId: req.user.id,
      via: "delete",
    });
    return res.json({ message: "Server deleted.", serverId });
  } catch (err) {
    console.error("[SERVERS] DELETE /:id error:", err);
    return res.status(500).json({ error: "Failed to delete server." });
  }
});

/**
 * The new owner hears about it on every device: a live toast (`server:ownership:received`
 * to user:<id>), the in-memory notification list, and an iOS alert push for a phone that is
 * closed. Best effort: a failed push never undoes the transfer.
 */
function notifyNewOwner(req, { serverId, serverName, targetId, actorId, actorName }) {
  const io = req.app?.get?.("io");
  const payload = { serverId, serverName: serverName || null, fromUserId: actorId, fromName: actorName || null };
  try {
    io?.to?.(`user:${targetId}`).emit("server:ownership:received", payload);
  } catch (err) {
    console.warn("[SERVERS] ownership toast emit failed:", err?.message || err);
  }
  try {
    const { pushNotification } = require("../socket/handlers");
    if (io && typeof pushNotification === "function") {
      const { trGenitive } = require("../lib/trSuffix");
      pushNotification(io, targetId, {
        type: "server_owner",
        title: "Sunucu sahipliği",
        body: `${trGenitive(serverName || "Sunucu")} sahibi artık sensin`,
        meta: { serverId, serverName: serverName || null, fromUserId: actorId },
      });
    }
  } catch (err) {
    console.warn("[SERVERS] ownership notification failed:", err?.message || err);
  }
  try {
    const { sendIosAlertToUsers } = require("../lib/iosAlertPush");
    void Promise.resolve(
      sendIosAlertToUsers([targetId], {
        type: "server-owner",
        serverId,
        serverName: serverName || null,
        fromId: actorId,
        fromName: actorName || null,
      })
    ).catch((err) => console.warn("[SERVERS] ownership push failed:", err?.message || err));
  } catch (err) {
    console.warn("[SERVERS] ownership push failed:", err?.message || err);
  }
}

/**
 * GET /servers/:id/ownership/transfer → { passwordRequired }
 * Owner only, read-only: tells the transfer dialog whether to ask for a password
 * (accounts created with Google / Apple have none).
 */
router.get("/:id/ownership/transfer", requireAuth, async (req, res) => {
  try {
    await requireServerOwner(req.params.id, req.user.id);
    const { data: me, error } = await supabase
      .from("users")
      .select("id, password_hash")
      .eq("id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    return res.json({ passwordRequired: Boolean(me?.password_hash) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET /:id/ownership/transfer error:", err);
    return res.status(status).json({ error: err.message || "Failed to load.", code: err.code });
  }
});

/**
 * POST /servers/:id/ownership/transfer  { userId, confirmName, password }
 * Owner hands the server to another member (O3: before 2026-10-19 there was no transfer,
 * and an owner who wanted out could only delete the server). Owner only; the target must be
 * a full (non-temporary, not banned) member; the server name must be typed; accounts with a
 * password must give it. Compare-and-swap on owner_id, audited, and pushed live.
 */
router.post("/:id/ownership/transfer", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const actorId = req.user.id;
    const targetId = String(req.body?.userId || "").trim();
    const confirmName = cleanName(req.body?.confirmName);
    const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
    const limitKey = `server-transfer:user:${actorId}`;
    const LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
    if (rejectIfLimited(res, [peek(limitKey, LIMIT)])) return;

    const { server } = await requireServerOwner(serverId, actorId);
    if (!targetId) return res.status(400).json({ error: "Choose the new owner.", code: "TARGET_REQUIRED" });
    if (String(targetId) === String(actorId)) {
      return res.status(400).json({ error: "You already own this server.", code: "TARGET_IS_OWNER" });
    }
    if (!confirmName || confirmName.toLowerCase() !== String(server.name).toLowerCase()) {
      return res.status(400).json({ error: "Type the server name to confirm.", code: "CONFIRM_NAME_REQUIRED" });
    }

    const { data: me, error: meErr } = await supabase
      .from("users")
      .select("id, password_hash")
      .eq("id", actorId)
      .maybeSingle();
    if (meErr) throw meErr;
    if (me?.password_hash) {
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const bcrypt = require("bcryptjs");
      const ok = password ? await bcrypt.compare(password, me.password_hash) : false;
      if (!ok) {
        if (rejectIfLimited(res, [recordFailure(limitKey, LIMIT)])) return;
        return res.status(403).json({ error: "Password is incorrect.", code: "PASSWORD_REQUIRED" });
      }
    }

    const target = await getMembership(serverId, targetId);
    if (!target || target.temporary) {
      return res.status(400).json({ error: "The new owner must be a member of this server.", code: "TARGET_NOT_MEMBER" });
    }
    const { data: targetBan } = await supabase
      .from("server_bans")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", targetId)
      .maybeSingle();
    if (targetBan) {
      return res.status(400).json({ error: "The new owner must be a member of this server.", code: "TARGET_NOT_MEMBER" });
    }
    if ((await countOwnedServers(targetId)) >= MAX_OWNED_SERVERS) {
      return res.status(400).json({
        error: `That member already owns ${MAX_OWNED_SERVERS} servers.`,
        code: "TARGET_MAX_OWNED_SERVERS",
      });
    }

    const { data: moved, error: upErr } = await supabase
      .from("servers")
      .update({ owner_id: targetId, updated_at: new Date().toISOString() })
      .eq("id", serverId)
      .eq("owner_id", actorId)
      .select("*");
    if (upErr) throw upErr;
    const updated = Array.isArray(moved) ? moved[0] : moved;
    if (!updated) {
      return res.status(409).json({ error: "Ownership changed meanwhile. Reload and try again.", code: "OWNER_CHANGED" });
    }

    await writeAudit({
      serverId,
      actorId,
      action: "OWNERSHIP_TRANSFER",
      targetType: "member",
      targetId,
      changes: { from: actorId, to: targetId, name: server.name },
    });

    const pub = publicServer(updated, {});
    const { data: people } = await supabase
      .from("users")
      .select("id, username, display_name")
      .in("id", [actorId, targetId]);
    const nameOf = (id) => {
      const u = (people || []).find((row) => String(row.id) === String(id));
      return (u && (u.display_name || u.username)) || null;
    };
    // Everyone in the server sees the new owner live (server list crown, settings, menus).
    emitToServer(req, serverId, "server:updated", {
      server: pub,
      ownerChanged: { fromUserId: actorId, toUserId: targetId, toName: nameOf(targetId) },
    });
    for (const uid of [actorId, targetId]) {
      emitToServer(req, serverId, "server:member:roles-changed", { userId: uid, action: "owner" });
    }
    notifyAccess(req, serverId);
    notifyNewOwner(req, { serverId, serverName: updated.name || server.name, targetId, actorId, actorName: nameOf(actorId) });

    return res.json({ message: "Ownership transferred.", serverId, ownerId: targetId, server: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/ownership/transfer error:", err);
    return res.status(status).json({ error: err.message || "Failed to transfer ownership.", code: err.code });
  }
});

/**
 * POST /servers/:id/leave
 * Non-owner leaves. Owner leave deletes the server; to keep it, transfer ownership first
 * (POST /:id/ownership/transfer).
 * Owner must pass confirmName when leaving (= delete).
 */
router.post("/:id/leave", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;
    const confirmName = cleanName(req.body?.confirmName);

    const membership = await getMembership(serverId, userId);
    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }

    const { data: server, error } = await supabase
      .from("servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();
    if (error) throw error;
    if (!server) return res.status(404).json({ error: "Server not found." });

    if (server.owner_id === userId) {
      if (!confirmName || confirmName.toLowerCase() !== String(server.name).toLowerCase()) {
        return res.status(400).json({
          error: "Owner leave deletes the server. Type the server name to confirm.",
          code: "CONFIRM_NAME_REQUIRED",
          deletesServer: true,
        });
      }
      await require("../lib/serverDeletion").deleteServerFully(req.app?.get?.("io"), server, {
        actorId: userId,
        via: "owner_leave",
      });
      return res.json({ message: "Server deleted.", deleted: true, serverId });
    }

    const { error: delErr } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId);
    if (delErr) throw delErr;

    // Clean member role assignments
    await supabase
      .from("server_member_roles")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId);

    await writeAudit({
      serverId,
      actorId: userId,
      action: "MEMBER_LEAVE",
      targetType: "member",
      targetId: userId,
    });
    await evictLeavingMember(req, serverId, userId);
    // D2: the user's other tabs / devices drop the server too, and members see the count change.
    {
      const io = req.app?.get?.("io");
      const payload = { serverId, serverName: server.name || null, userId, action: "leave" };
      io?.to?.(`user:${userId}`).emit("server:member:removed", payload);
      io?.to?.(`server:${serverId}`).emit("server:member:removed", payload);
    }

    return res.json({ message: "Left server.", deleted: false, serverId });
  } catch (err) {
    console.error("[SERVERS] POST /:id/leave error:", err);
    return res.status(500).json({ error: "Failed to leave server." });
  }
});

/**
 * GET /servers/:id/channels/:channelId/messages
 * VIEW_CHANNEL-gated history for text channels.
 */
router.get("/:id/channels/:channelId/messages", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    const started = Date.now();
    const { before, since, limit = 50 } = req.query;
    const sinceIso = parseSince(since);

    const { data: channel, error: cErr } = await supabase
      .from("server_channels")
      .select("id, server_id, type")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!channel) return res.status(404).json({ error: "Channel not found." });
    if (channel.type !== "text" && channel.type !== "announcement") {
      return res.status(400).json({ error: "Only text channels have message history.", code: "NOT_TEXT_CHANNEL" });
    }

    const channelPerms = await resolveChannelPermissions(
      supabase,
      serverId,
      req.user.id,
      channelId
    );
    if (!channelPerms.isMember) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }
    if (!hasPermission(channelPerms.bits, Permissions.VIEW_CHANNEL)) {
      return res.status(403).json({ error: "Missing permission.", code: "MISSING_PERMISSION" });
    }
    if (!hasPermission(channelPerms.bits, Permissions.READ_MESSAGE_HISTORY)) {
      return res.json({ messages: [] });
    }

    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const messageSelect = `
        id, server_id, channel_id, sender_id, content, media_url, media_type,
        reply_to, created_at, updated_at, edited_at, pinned_at, pinned_by,
        message_type, system_kind, system_meta,
        sender:sender_id (id, username, display_name, avatar_url)
      `;
    let messages;
    let incremental = false;
    if (sinceIso && !before) {
      incremental = true;
      const [createdRes, editedRes] = await Promise.all([
        supabase
          .from("server_messages")
          .select(messageSelect)
          .eq("channel_id", channelId)
          .eq("server_id", serverId)
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: true })
          .limit(pageSize),
        supabase
          .from("server_messages")
          .select(messageSelect)
          .eq("channel_id", channelId)
          .eq("server_id", serverId)
          .gt("edited_at", sinceIso)
          .order("edited_at", { ascending: false })
          .limit(pageSize),
      ]);
      if (createdRes.error) throw createdRes.error;
      const byId = new Map();
      for (const row of [...(editedRes.data || []), ...(createdRes.data || [])]) byId.set(row.id, row);
      messages = [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      let query = supabase
        .from("server_messages")
        .select(messageSelect)
        .eq("channel_id", channelId)
        .eq("server_id", serverId)
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (before) query = query.lt("created_at", before);
      const { data, error } = await query;
      if (error) throw error;
      messages = data;
    }

    const senderIds = [...new Set((messages || []).map((m) => m.sender_id || m.sender?.id).filter(Boolean))];
    try {
      const { ensureCosmeticsCached, getCachedPublicUser, cacheUserProfile } = require("../lib/userProfile");
      for (const m of messages || []) {
        if (m.sender) cacheUserProfile({ ...m.sender, avatar_url: m.sender.avatar_url || m.sender.avatarUrl });
      }
      await ensureCosmeticsCached(senderIds);
      for (const m of messages || []) {
        const pub = getCachedPublicUser(m.sender_id || m.sender?.id);
        if (pub && m.sender) {
          m.sender = {
            ...m.sender,
            ...pub,
            id: m.sender.id || pub.id,
            username: m.sender.username || pub.username,
          };
          m.from = m.sender;
        }
      }
    } catch (err) {
      console.warn("[SERVERS] cosmetics enrich failed:", err?.message || err);
    }

    const ordered = incremental ? (messages || []) : (messages || []).slice().reverse();
    const withReactions = await attachServerReactions(ordered, channelId);
    console.log(`[SERVERS] channel messages ${withReactions.length} in ${Date.now() - started}ms`);
    return res.json({ messages: withReactions, incremental, reactionsIncluded: true });
  } catch (err) {
    console.error("[SERVERS] GET channel messages error:", err);
    return res.status(500).json({ error: "Failed to load messages." });
  }
});

/**
 * GET /servers/:id/members — basic member list (skeleton for later UI)
 */
router.get("/:id/members", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const membership = await getMembership(serverId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }

    const { data: members, error } = await supabase
      .from("server_members")
      .select("user_id, nickname, joined_at, list_position, timeout_until, timeout_reason, timed_out_by")
      .eq("server_id", serverId)
      .order("joined_at", { ascending: true });
    if (error) throw error;

    const userIds = (members || []).map((m) => m.user_id);
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    if (uErr) throw uErr;

    const { data: server } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", serverId)
      .maybeSingle();

    const { data: memberRoles } = await supabase
      .from("server_member_roles")
      .select("user_id, role_id")
      .eq("server_id", serverId);

    const { data: roles } = await supabase
      .from("server_roles")
      .select("id, position")
      .eq("server_id", serverId);
    const rolePos = new Map((roles || []).map((r) => [String(r.id), Number(r.position) || 0]));

    const rolesByUser = new Map();
    for (const row of memberRoles || []) {
      if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, []);
      rolesByUser.get(row.user_id).push(row.role_id);
    }

    const byId = new Map((users || []).map((u) => [u.id, u]));
    const list = (members || []).map((m) => {
      const u = byId.get(m.user_id) || {};
      const roleIds = rolesByUser.get(m.user_id) || [];
      const highestPosition = roleIds.reduce(
        (top, roleId) => Math.max(top, rolePos.get(String(roleId)) || 0),
        0
      );
      return {
        userId: m.user_id,
        username: u.username || null,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
        nickname: m.nickname || null,
        joinedAt: m.joined_at,
        timeoutUntil: m.timeout_until || null,
        timeoutReason: m.timeout_reason || null,
        timedOutBy: m.timed_out_by || null,
        isOwner: server?.owner_id === m.user_id,
        highestPosition,
        roleIds,
      };
    });

    return res.json({ members: list });
  } catch (err) {
    console.error("[SERVERS] GET /:id/members error:", err);
    return res.status(500).json({ error: "Failed to load members." });
  }
});

/**
 * GET /servers/:id/roles
 */
router.get("/:id/roles", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const membership = await getMembership(serverId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this server." });
    }
    const { data: roles, error } = await supabase
      .from("server_roles")
      .select("*")
      .eq("server_id", serverId)
      .order("position", { ascending: false });
    if (error) throw error;
    return res.json({
      roles: (roles || []).map(publicRole),
      editablePermissions: EDITABLE_PERMISSION_KEYS,
    });
  } catch (err) {
    console.error("[SERVERS] GET /:id/roles error:", err);
    return res.status(500).json({ error: "Failed to load roles." });
  }
});

/**
 * POST /servers/:id/roles — create role (owner only)
 */
router.post("/:id/roles", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const name = cleanName(req.body?.name);
    if (name.length < ROLE_NAME_MIN || name.length > ROLE_NAME_MAX) {
      return res.status(400).json({ error: `Role name must be ${ROLE_NAME_MIN}–${ROLE_NAME_MAX} characters.` });
    }
    if (name.toLowerCase() === "@everyone") {
      return res.status(400).json({ error: "Cannot create another @everyone role." });
    }

    const { count, error: countErr } = await supabase
      .from("server_roles")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId);
    if (countErr) throw countErr;
    if ((count || 0) >= MAX_ROLES_PER_SERVER) {
      return res.status(400).json({
        error: `Servers can have at most ${MAX_ROLES_PER_SERVER} roles.`,
        code: "MAX_ROLES",
      });
    }

    const { data: top } = await supabase
      .from("server_roles")
      .select("position")
      .eq("server_id", serverId)
      .order("position", { ascending: false })
      .limit(1);
    let position =
      typeof req.body?.position === "number" && Number.isFinite(req.body.position)
        ? Math.max(0, Math.floor(req.body.position))
        : (top?.[0]?.position ?? 0) + 1;
    if (!actorPerms.isOwner) {
      const actorPos = await getMemberHighestPosition(supabase, serverId, req.user.id);
      if (actorPos <= 0) {
        return res.status(403).json({ error: "You need a higher role to create roles.", code: "HIERARCHY" });
      }
      position = Math.min(position, actorPos - 1);
    }

    const color = clampColor(req.body?.color ?? 0x5865f2);
    const perms = parsePermissionsInput(req.body?.permissions);
    const clipped = clipRolePermissions({
      desiredBits: perms != null ? perms : EVERYONE_DEFAULT,
      existingBits: 0n,
      actorBits: actorPerms.permissions,
      isOwner: actorPerms.isOwner,
      isEveryone: false,
    });
    const permissions = toPgBigint(clipped);

    const { data: role, error } = await supabase
      .from("server_roles")
      .insert({
        server_id: serverId,
        name,
        color,
        position,
        permissions,
        hoist: Boolean(req.body?.hoist),
        mentionable: Boolean(req.body?.mentionable),
        is_everyone: false,
      })
      .select("*")
      .single();
    if (error) throw error;
    if (await insertedOverCap("server_roles", "server_id", serverId, role.id, MAX_ROLES_PER_SERVER)) {
      await supabase.from("server_roles").delete().eq("id", role.id);
      return res.status(400).json({
        error: `Servers can have at most ${MAX_ROLES_PER_SERVER} roles.`,
        code: "MAX_ROLES",
      });
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "ROLE_CREATE",
      targetType: "role",
      targetId: role.id,
      changes: { name, color, position },
    });

    const pub = publicRole(role);
    emitToServer(req, serverId, "server:role:created", { role: pub });
    notifyAccess(req, serverId);
    return res.status(201).json({ role: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/roles error:", err);
    return res.status(status).json({ error: err.message || "Failed to create role.", code: err.code });
  }
});

/**
 * PATCH /servers/:id/roles/:roleId
 */
router.patch("/:id/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const roleId = req.params.roleId;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const { data: existing, error: findErr } = await supabase
      .from("server_roles")
      .select("*")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: "Role not found." });
    await assertCanManageRole(supabase, serverId, req.user.id, existing);

    const patch = {};
    if (req.body?.name != null) {
      if (existing.is_everyone) {
        return res.status(400).json({ error: "@everyone cannot be renamed.", code: "EVERYONE_LOCKED" });
      }
      const name = cleanName(req.body.name);
      if (name.length < ROLE_NAME_MIN || name.length > ROLE_NAME_MAX) {
        return res.status(400).json({ error: "Invalid role name." });
      }
      patch.name = name;
    }
    if (req.body?.color !== undefined) patch.color = clampColor(req.body.color);
    if (typeof req.body?.position === "number" && Number.isFinite(req.body.position)) {
      if (existing.is_everyone) {
        return res.status(400).json({ error: "@everyone cannot be reordered.", code: "EVERYONE_LOCKED" });
      }
      patch.position = Math.max(0, Math.floor(req.body.position));
    }
    if (req.body?.hoist !== undefined) patch.hoist = Boolean(req.body.hoist);
    if (req.body?.mentionable !== undefined) patch.mentionable = Boolean(req.body.mentionable);
    if (req.body?.permissions !== undefined) {
      const perms = parsePermissionsInput(req.body.permissions, existing.permissions);
      if (perms == null) return res.status(400).json({ error: "Invalid permissions." });
      patch.permissions = toPgBigint(
        clipRolePermissions({
          desiredBits: perms,
          existingBits: existing.permissions,
          actorBits: actorPerms.permissions,
          isOwner: actorPerms.isOwner,
          isEveryone: Boolean(existing.is_everyone),
        })
      );
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }
    if (patch.position != null) {
      await assertCanManageRole(supabase, serverId, req.user.id, {
        ...existing,
        position: patch.position,
      });
    }

    const { data: role, error } = await supabase
      .from("server_roles")
      .update(patch)
      .eq("id", roleId)
      .eq("server_id", serverId)
      .select("*")
      .single();
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "ROLE_UPDATE",
      targetType: "role",
      targetId: roleId,
      changes: patch,
    });

    const pub = publicRole(role);
    emitToServer(req, serverId, "server:role:updated", { role: pub });
    notifyAccess(req, serverId);
    return res.json({ role: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH /:id/roles/:roleId error:", err);
    return res.status(status).json({ error: err.message || "Failed to update role.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/roles/:roleId — @everyone protected
 */
router.delete("/:id/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const roleId = req.params.roleId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const { data: existing, error: findErr } = await supabase
      .from("server_roles")
      .select("*")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: "Role not found." });
    if (existing.is_everyone) {
      return res.status(400).json({ error: "@everyone cannot be deleted.", code: "EVERYONE_LOCKED" });
    }
    await assertCanManageRole(supabase, serverId, req.user.id, existing);

    const { error } = await supabase
      .from("server_roles")
      .delete()
      .eq("id", roleId)
      .eq("server_id", serverId);
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "ROLE_DELETE",
      targetType: "role",
      targetId: roleId,
      changes: { name: existing.name },
    });

    emitToServer(req, serverId, "server:role:deleted", { roleId });
    notifyAccess(req, serverId);
    return res.json({ message: "Role deleted.", roleId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE /:id/roles/:roleId error:", err);
    return res.status(status).json({ error: err.message || "Failed to delete role.", code: err.code });
  }
});

/**
 * PUT /servers/:id/members/:userId/roles/:roleId — assign role
 */
router.put("/:id/members/:userId/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.params.userId;
    const roleId = req.params.roleId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);
    if (String(userId) === String(req.user.id)) {
      return res.status(403).json({ error: "You cannot change your own roles.", code: "CANNOT_EDIT_SELF" });
    }

    const targetMembership = await getMembership(serverId, userId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }

    const { data: role, error: rErr } = await supabase
      .from("server_roles")
      .select("*")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!role) return res.status(404).json({ error: "Role not found." });
    if (role.is_everyone) {
      return res.status(400).json({ error: "@everyone is automatic and cannot be assigned." });
    }
    await assertCanManageRole(supabase, serverId, req.user.id, role);
    await assertHierarchy(supabase, serverId, req.user.id, userId);

    const { error } = await supabase.from("server_member_roles").upsert(
      { server_id: serverId, user_id: userId, role_id: roleId },
      { onConflict: "server_id,user_id,role_id" }
    );
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_ROLE_ADD",
      targetType: "member",
      targetId: userId,
      changes: { roleId, roleName: role.name },
    });

    emitToServer(req, serverId, "server:member:roles-changed", {
      userId,
      roleId,
      action: "add",
    });
    notifyAccess(req, serverId);
    return res.json({ message: "Role assigned.", userId, roleId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT member role error:", err);
    return res.status(status).json({ error: err.message || "Failed to assign role.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/members/:userId/roles/:roleId — remove role
 */
router.delete("/:id/members/:userId/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.params.userId;
    const roleId = req.params.roleId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);
    if (String(userId) === String(req.user.id)) {
      return res.status(403).json({ error: "You cannot change your own roles.", code: "CANNOT_EDIT_SELF" });
    }

    const { data: role } = await supabase
      .from("server_roles")
      .select("id, name, is_everyone, position")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (!role) return res.status(404).json({ error: "Role not found." });
    if (role.is_everyone) {
      return res.status(400).json({ error: "@everyone cannot be removed." });
    }
    await assertCanManageRole(supabase, serverId, req.user.id, role);
    await assertHierarchy(supabase, serverId, req.user.id, userId);

    const { error } = await supabase
      .from("server_member_roles")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .eq("role_id", roleId);
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_ROLE_REMOVE",
      targetType: "member",
      targetId: userId,
      changes: { roleId, roleName: role.name },
    });

    emitToServer(req, serverId, "server:member:roles-changed", {
      userId,
      roleId,
      action: "remove",
    });
    notifyAccess(req, serverId);
    return res.json({ message: "Role removed.", userId, roleId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE member role error:", err);
    return res.status(status).json({ error: err.message || "Failed to remove role.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/members/:userId — kick member (KICK_MEMBERS)
 * Cannot kick the owner or yourself (use leave).
 */
router.delete("/:id/members/:userId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    const { server } = await requireServerPermission(serverId, req.user.id, Permissions.KICK_MEMBERS);

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "Use leave to remove yourself.", code: "USE_LEAVE" });
    }
    if (server.owner_id === targetUserId) {
      return res.status(403).json({ error: "Cannot kick the server owner.", code: "CANNOT_KICK_OWNER" });
    }

    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }
    await assertHierarchy(supabase, serverId, req.user.id, targetUserId);

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

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_KICK",
      targetType: "member",
      targetId: targetUserId,
      reason: req.body?.reason ? String(req.body.reason).slice(0, 200) : null,
    });

    notifyServerMemberRemoved(req, {
      serverId,
      serverName: server.name,
      targetUserId,
      action: "kick",
      reason: req.body?.reason ? String(req.body.reason).slice(0, 200) : null,
      actorId: req.user.id,
    });

    return res.json({ message: "Member kicked.", userId: targetUserId, serverId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE member kick error:", err);
    return res.status(status).json({ error: err.message || "Failed to kick member.", code: err.code });
  }
});

/**
 * PATCH /servers/:id/members/:userId/nickname
 * Self requires CHANGE_NICKNAME. Managing others requires MANAGE_NICKNAMES + hierarchy.
 */
router.patch("/:id/members/:userId/nickname", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    const isSelf = String(targetUserId) === String(req.user.id);
    const nicknameRaw = req.body?.nickname;
    const nickname =
      nicknameRaw == null || String(nicknameRaw).trim() === ""
        ? null
        : String(nicknameRaw).trim().replace(/\s+/g, " ").slice(0, 32);

    // Authorize on :id first so a non-member cannot probe who is in the server.
    if (isSelf) {
      await requireServerPermission(serverId, req.user.id, Permissions.CHANGE_NICKNAME);
    } else {
      await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_NICKNAMES);
    }

    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }
    if (!isSelf) {
      await assertHierarchy(supabase, serverId, req.user.id, targetUserId);
    }

    const member = await updateMemberNickname({
      serverId,
      actorId: req.user.id,
      targetUserId,
      nickname,
    });

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: isSelf ? "MEMBER_NICKNAME_SELF" : "MEMBER_NICKNAME_UPDATE",
      targetType: "member",
      targetId: targetUserId,
      changes: { nickname },
    });

    const payload = {
      serverId: member.server_id,
      userId: member.user_id,
      nickname: member.nickname || null,
    };
    emitToServer(req, serverId, "server:member:updated", { member: payload });
    return res.json({ member: payload });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH nickname error:", err);
    return res.status(status).json({ error: err.message || "Failed to update nickname.", code: err.code });
  }
});

/**
 * POST /servers/:id/members/:userId/timeout
 * Body: { until?: ISO timestamp, durationSeconds?: number, reason?: string }
 */
router.post("/:id/members/:userId/timeout", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    await requireServerPermission(serverId, req.user.id, Permissions.MODERATE_MEMBERS);

    if (String(targetUserId) === String(req.user.id)) {
      return res.status(400).json({ error: "You cannot timeout yourself.", code: "CANNOT_TIMEOUT_SELF" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }

    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 512) : null;
    const timeout = await applyServerTimeout({
      serverId,
      actorId: req.user.id,
      targetUserId,
      until: req.body?.until,
      durationSeconds: req.body?.durationSeconds,
      reason,
    });

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_TIMEOUT",
      targetType: "member",
      targetId: targetUserId,
      reason,
      changes: { until: timeout.until },
    });
    try {
      const { removeUserFromServerVoice } = require("../socket/serverVoiceHandlers");
      removeUserFromServerVoice(req.app.get("io"), serverId, targetUserId, "timeout");
    } catch (err) {
      console.warn("[SERVERS] voice cleanup after timeout failed:", err?.message || err);
    }

    return res.json({
      timeout: {
        userId: targetUserId,
        until: timeout.until,
        reason: timeout.reason,
        timedOutBy: timeout.timedOutBy,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST timeout error:", err);
    return res.status(status).json({ error: err.message || "Failed to timeout member.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/members/:userId/timeout — clear active timeout.
 */
router.delete("/:id/members/:userId/timeout", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    await requireServerPermission(serverId, req.user.id, Permissions.MODERATE_MEMBERS);

    if (String(targetUserId) === String(req.user.id)) {
      return res.status(400).json({ error: "You cannot remove your own timeout.", code: "CANNOT_TIMEOUT_SELF" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }

    await clearServerTimeout({ serverId, actorId: req.user.id, targetUserId });
    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_TIMEOUT_CLEAR",
      targetType: "member",
      targetId: targetUserId,
    });

    return res.json({ message: "Timeout removed.", userId: targetUserId, serverId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE timeout error:", err);
    return res.status(status).json({ error: err.message || "Failed to remove timeout.", code: err.code });
  }
});

/**
 * PATCH /servers/:id/me/settings — per-server notification level (All / Mentions / Nothing).
 */
router.patch("/:id/me/settings", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const membership = await getMembership(serverId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this server.", code: "NOT_MEMBER" });
    }
    const level = String(req.body?.notificationLevel || "").toLowerCase();
    if (!["all", "mentions", "muted"].includes(level)) {
      return res.status(400).json({
        error: "notificationLevel must be all, mentions, or muted.",
        code: "INVALID_NOTIFICATION_LEVEL",
      });
    }
    const { data: updated, error } = await supabase
      .from("server_members")
      .update({ notification_level: level })
      .eq("server_id", serverId)
      .eq("user_id", req.user.id)
      .select("notification_level, rules_accepted_at")
      .single();
    if (error) throw error;
    return res.json({
      serverId,
      notificationLevel: updated?.notification_level || level,
      rulesAcceptedAt: updated?.rules_accepted_at || null,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH me/settings error:", err);
    return res.status(status).json({ error: err.message || "Failed to update settings." });
  }
});

/**
 * POST /servers/:id/accept-rules — community onboarding / rules screen accept.
 */
router.post("/:id/accept-rules", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const membership = await getMembership(serverId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this server.", code: "NOT_MEMBER" });
    }
    const { data: server, error: sErr } = await supabase
      .from("servers")
      .select("id, community_enabled, rules_text")
      .eq("id", serverId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!server) return res.status(404).json({ error: "Server not found." });

    const acceptedAt = membership.rules_accepted_at || new Date().toISOString();
    if (!membership.rules_accepted_at) {
      const { error } = await supabase
        .from("server_members")
        .update({ rules_accepted_at: acceptedAt })
        .eq("server_id", serverId)
        .eq("user_id", req.user.id);
      if (error) throw error;
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "RULES_ACCEPT",
      targetType: "member",
      targetId: req.user.id,
    });

    return res.json({
      serverId,
      rulesAcceptedAt: acceptedAt,
      communityEnabled: Boolean(server.community_enabled),
      hasRules: Boolean(server.rules_text),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST accept-rules error:", err);
    return res.status(status).json({ error: err.message || "Failed to accept rules." });
  }
});

/**
 * GET /servers/:id/bans — list bans (BAN_MEMBERS)
 */
router.get("/:id/bans", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    await requireServerPermission(serverId, req.user.id, Permissions.BAN_MEMBERS);

    const { data: bans, error } = await supabase
      .from("server_bans")
      .select("server_id, user_id, moderator_id, reason, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const userIds = [
      ...new Set(
        (bans || []).flatMap((b) => [b.user_id, b.moderator_id].filter(Boolean))
      ),
    ];
    const { data: users } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((users || []).map((u) => [u.id, u]));

    return res.json({
      bans: (bans || []).map((b) => {
        const user = byId.get(b.user_id) || {};
        const mod = byId.get(b.moderator_id) || {};
        return {
          userId: b.user_id,
          username: user.username || null,
          displayName: user.display_name || null,
          avatarUrl: user.avatar_url || null,
          reason: b.reason || null,
          createdAt: b.created_at,
          moderatorId: b.moderator_id || null,
          moderatorUsername: mod.username || null,
          moderatorDisplayName: mod.display_name || null,
        };
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET /:id/bans error:", err);
    return res.status(status).json({ error: err.message || "Failed to list bans.", code: err.code });
  }
});

/**
 * PUT /servers/:id/bans/:userId — ban member (BAN_MEMBERS)
 * Removes membership + roles and blocks rejoin.
 */
router.put("/:id/bans/:userId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    const { server } = await requireServerPermission(serverId, req.user.id, Permissions.BAN_MEMBERS);
    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 200) : null;

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "You cannot ban yourself.", code: "CANNOT_BAN_SELF" });
    }
    if (server.owner_id === targetUserId) {
      return res.status(403).json({ error: "Cannot ban the server owner.", code: "CANNOT_BAN_OWNER" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (targetMembership) {
      await assertHierarchy(supabase, serverId, req.user.id, targetUserId);
    }

    const { error: banErr } = await supabase.from("server_bans").upsert(
      {
        server_id: serverId,
        user_id: targetUserId,
        moderator_id: req.user.id,
        reason,
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

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_BAN",
      targetType: "member",
      targetId: targetUserId,
      reason,
    });

    notifyServerMemberRemoved(req, {
      serverId,
      serverName: server.name,
      targetUserId,
      action: "ban",
      reason,
      actorId: req.user.id,
    });

    return res.json({ message: "Member banned.", userId: targetUserId, serverId, reason });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT ban error:", err);
    return res.status(status).json({ error: err.message || "Failed to ban member.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/bans/:userId — unban (BAN_MEMBERS)
 */
router.delete("/:id/bans/:userId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    await requireServerPermission(serverId, req.user.id, Permissions.BAN_MEMBERS);

    const { data: existing } = await supabase
      .from("server_bans")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!existing) {
      return res.status(404).json({ error: "Ban not found." });
    }

    const { error } = await supabase
      .from("server_bans")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", targetUserId);
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "MEMBER_UNBAN",
      targetType: "member",
      targetId: targetUserId,
    });

    return res.json({ message: "Member unbanned.", userId: targetUserId, serverId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE ban error:", err);
    return res.status(status).json({ error: err.message || "Failed to unban member.", code: err.code });
  }
});

/**
 * GET /servers/:id/audit-logs — recent audit entries (VIEW_AUDIT_LOG)
 */
router.get("/:id/audit-logs", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    await requireServerPermission(serverId, req.user.id, Permissions.VIEW_AUDIT_LOG);

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const { data: rows, error } = await supabase
      .from("server_audit_logs")
      .select("id, server_id, actor_id, action, target_type, target_id, changes, reason, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const actorIds = [...new Set((rows || []).map((r) => r.actor_id).filter(Boolean))];
    const { data: users } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", actorIds.length ? actorIds : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((users || []).map((u) => [u.id, u]));

    return res.json({
      logs: (rows || []).map((r) => {
        const actor = byId.get(r.actor_id) || {};
        return {
          id: r.id,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          changes: r.changes,
          reason: r.reason,
          createdAt: r.created_at,
          actorId: r.actor_id,
          actorUsername: actor.username || null,
          actorDisplayName: actor.display_name || null,
          actorAvatarUrl: actor.avatar_url || null,
        };
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET audit-logs error:", err);
    return res.status(status).json({ error: err.message || "Failed to load audit log.", code: err.code });
  }
});

/**
 * POST /servers/:id/channels
 * Create text | voice | category. Owner or MANAGE_CHANNELS.
 */
router.post("/:id/channels", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const type = String(req.body?.type || "text").toLowerCase();
    if (!CHANNEL_TYPES.has(type)) {
      return res.status(400).json({
        error: "Channel type must be text, voice, stage, category, or announcement.",
      });
    }

    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_CHANNELS);

    const name = cleanChannelName(req.body?.name, type);
    if (name.length < CHANNEL_NAME_MIN) {
      return res.status(400).json({
        error: `Channel name must be ${CHANNEL_NAME_MIN}–${CHANNEL_NAME_MAX} characters.`,
      });
    }

    const { count, error: countErr } = await supabase
      .from("server_channels")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId);
    if (countErr) throw countErr;
    if ((count || 0) >= MAX_CHANNELS_PER_SERVER) {
      return res.status(400).json({
        error: `Servers can have at most ${MAX_CHANNELS_PER_SERVER} channels.`,
        code: "MAX_CHANNELS",
      });
    }

    const parentId = req.body?.parentId || null;
    await assertValidParent(serverId, parentId, type);
    if (parentId && type !== "category") await assertParentVisible(serverId, req.user.id, parentId);

    const isTextLike = type === "text" || type === "announcement";
    const topic =
      isTextLike && req.body?.topic != null
        ? String(req.body.topic).trim().slice(0, 1024) || null
        : null;
    const slowmodeParsed =
      isTextLike && req.body?.slowmodeSeconds != null && req.body?.slowmodeSeconds !== ""
        ? Math.floor(Number(req.body.slowmodeSeconds))
        : 0;
    const slowmodeSeconds = Number.isFinite(slowmodeParsed)
      ? Math.max(0, Math.min(21600, slowmodeParsed))
      : 0;

    const position =
      typeof req.body?.position === "number" && Number.isFinite(req.body.position)
        ? Math.max(0, Math.floor(req.body.position))
        : await nextChannelPosition(serverId);
    const nsfw = isTextLike ? Boolean(req.body?.nsfw) : false;

    const { data: channel, error } = await supabase
      .from("server_channels")
      .insert({
        server_id: serverId,
        name,
        type,
        topic,
        position,
        parent_id: type === "category" ? null : parentId,
        slowmode_seconds: slowmodeSeconds,
        nsfw,
      })
      .select("*")
      .single();
    if (error) throw error;
    if (await insertedOverCap("server_channels", "server_id", serverId, channel.id, MAX_CHANNELS_PER_SERVER)) {
      await supabase.from("server_channels").delete().eq("id", channel.id);
      return res.status(400).json({
        error: `Servers can have at most ${MAX_CHANNELS_PER_SERVER} channels.`,
        code: "MAX_CHANNELS",
      });
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "CHANNEL_CREATE",
      targetType: "channel",
      targetId: channel.id,
      changes: { name, type, parentId: channel.parent_id },
    });

    const pub = publicChannel(channel);
    await emitChannelToViewers(req, serverId, "server:channel:created", channel);
    return res.status(201).json({ channel: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/channels error:", err);
    return res.status(status).json({ error: err.message || "Failed to create channel.", code: err.code });
  }
});

/**
 * PATCH /servers/:id/channels/:channelId
 * Rename / topic / parent / position. Owner only.
 */
router.patch("/:id/channels/:channelId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_CHANNELS);

    const { data: existing, error: findErr } = await supabase
      .from("server_channels")
      .select("*")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: "Channel not found." });
    await assertChannelManageable(serverId, req.user.id, existing.id);

    const patch = {};
    if (req.body?.name != null) {
      const name = cleanChannelName(req.body.name, existing.type);
      if (name.length < CHANNEL_NAME_MIN) {
        return res.status(400).json({ error: "Channel name is required." });
      }
      patch.name = name;
    }
    if (req.body?.topic !== undefined && (existing.type === "text" || existing.type === "announcement")) {
      patch.topic = req.body.topic == null ? null : String(req.body.topic).trim().slice(0, 1024) || null;
    }
    let detachPlan = null;
    if (req.body?.parentId !== undefined) {
      const parentId = req.body.parentId || null;
      await assertValidParent(serverId, parentId, existing.type);
      patch.parent_id = existing.type === "category" ? null : parentId;
      if (patch.parent_id && String(patch.parent_id) !== String(existing.parent_id || "")) {
        await assertParentVisible(serverId, req.user.id, patch.parent_id);
        await assertInheritChangeAllowed(serverId, req.user.id, existing, patch.parent_id);
      }
      // Moving out of (or to another) category keeps the old category's rules on the
      // channel as its own; moving into a category is the intended "inherit" step.
      if (existing.parent_id && String(existing.parent_id) !== String(patch.parent_id || "")) {
        detachPlan = await planDetachFromCategory(serverId, existing.parent_id, [existing.id]);
      }
    }
    if (typeof req.body?.position === "number" && Number.isFinite(req.body.position)) {
      patch.position = Math.max(0, Math.floor(req.body.position));
    }
    if (req.body?.nsfw !== undefined && (existing.type === "text" || existing.type === "announcement")) {
      patch.nsfw = Boolean(req.body.nsfw);
    }
    if (
      req.body?.slowmodeSeconds !== undefined &&
      (existing.type === "text" || existing.type === "announcement")
    ) {
      const parsed = Math.floor(Number(req.body.slowmodeSeconds));
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ error: "Invalid slowmode value." });
      }
      patch.slowmode_seconds = Math.max(0, Math.min(21600, parsed));
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    if (detachPlan) await applyDetachPlan(detachPlan);
    const prevParentId = existing.parent_id || null;

    const { data: channel, error } = await supabase
      .from("server_channels")
      .update(patch)
      .eq("id", channelId)
      .eq("server_id", serverId)
      .select("*")
      .single();
    if (error) throw error;
    // Moving in/out of a category changes who can see the channel: resync clients and
    // evict live sockets that lost VIEW (they kept receiving messages before).
    if (patch.parent_id !== undefined && String(patch.parent_id || "") !== String(prevParentId || "")) {
      notifyAccess(req, serverId, { channelId });
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "CHANNEL_UPDATE",
      targetType: "channel",
      targetId: channelId,
      changes: patch,
    });

    const pub = publicChannel(channel);
    await emitChannelToViewers(req, serverId, "server:channel:updated", channel);
    return res.json({ channel: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH /:id/channels/:channelId error:", err);
    return res.status(status).json({ error: err.message || "Failed to update channel.", code: err.code });
  }
});

/**
 * MANAGE_CHANNELS must hold on the channel itself (after its overrides) and the actor
 * must be able to see it: a hidden channel answers 404 like a missing one (audit
 * 2026-10-19 #1: a MANAGE_CHANNELS member could rename / move / delete channels they
 * could not see).
 */
async function assertChannelManageable(serverId, actorId, channelId) {
  const r = await resolveChannelPermissions(supabase, serverId, actorId, channelId);
  if (!r.isMember || r.channelMissing || !hasPermission(r.bits, Permissions.VIEW_CHANNEL)) {
    const err = new Error("Channel not found.");
    err.status = 404;
    throw err;
  }
  if (!hasPermission(r.bits, Permissions.MANAGE_CHANNELS)) {
    const err = new Error("Missing permission.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    throw err;
  }
  return r;
}

/**
 * A synced channel that starts inheriting a category's rules (moved under it with no
 * own overrides, from no rules) changes who can do what in it. That is a permission
 * edit: it needs MANAGE_ROLES, and for non-owner/admin every inherited rule must be one
 * the actor could have written by hand (target below them, bits they hold), like
 * assertOverrideEditor (audit 2026-10-19 #2).
 */
async function assertInheritChangeAllowed(serverId, actorId, channel, newParentId) {
  if (!newParentId) return;
  const ids = [String(channel.id), String(newParentId)];
  if (channel.parent_id) ids.push(String(channel.parent_id));
  const { data: rows, error } = await supabase
    .from("server_channel_overrides")
    .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
    .in("channel_id", ids);
  if (error) throw error;
  const own = (rows || []).filter((r) => String(r.channel_id) === String(channel.id));
  if (own.length) return; // channel keeps using its own rules
  const oldParentRows = channel.parent_id
    ? (rows || []).filter((r) => String(r.channel_id) === String(channel.parent_id))
    : [];
  if (oldParentRows.length) return; // detach copies them first; the new parent will not apply
  const newRows = (rows || []).filter((r) => String(r.channel_id) === String(newParentId));
  if (!newRows.length) return;
  const { data: category } = await supabase
    .from("server_channels")
    .select("id, server_id, type")
    .eq("id", newParentId)
    .eq("server_id", serverId)
    .maybeSingle();
  if (!category) return;
  const { actorBits, unrestricted } = await assertOverrideEditor(serverId, actorId, category);
  if (unrestricted) return;
  if (!hasPermission(actorBits, Permissions.MANAGE_ROLES)) {
    const err = new Error("Moving this channel into the category changes its permissions; that needs Manage Roles.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    err.permission = "MANAGE_ROLES";
    throw err;
  }
  const mask = fromPgBigint(actorBits);
  for (const r of newRows) {
    await assertOverrideEditor(serverId, actorId, category, { type: r.target_type, id: r.target_id });
    const bits = fromPgBigint(r.allow_permissions) | fromPgBigint(r.deny_permissions);
    if (bits & ~mask) {
      const err = new Error("The category grants or denies permissions you do not have.");
      err.status = 403;
      err.code = "OVERRIDE_PERMISSION";
      throw err;
    }
  }
}

/**
 * DELETE /servers/:id/channels/:channelId
 * Categories: children first take the category's overrides as their own (effective
 * permissions unchanged, 409 if that is impossible), are unparented, then the category is removed.
 */
router.delete("/:id/channels/:channelId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_CHANNELS);

    const { data: existing, error: findErr } = await supabase
      .from("server_channels")
      .select("*")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: "Channel not found." });
    await assertChannelManageable(serverId, req.user.id, existing.id);

    // Who could see it, computed before the row (and its overrides) are gone. The
    // delete event used to go to the whole server room, leaking hidden channel ids.
    let viewerIds = [];
    try {
      viewerIds = await channelViewerIds(serverId, existing);
    } catch (err) {
      console.warn("[SERVERS] channel delete viewers failed:", err?.message || err);
    }

    let detached = [];
    if (existing.type === "category") {
      // Safe order: children get the category's rules as their own first (a no-op for
      // their effective permissions while still parented), then unparent, then delete.
      // A failure at any step leaves every child exactly as private as before.
      const { data: children, error: chErr } = await supabase
        .from("server_channels")
        .select("id")
        .eq("server_id", serverId)
        .eq("parent_id", channelId);
      if (chErr) throw chErr;
      detached = (children || []).map((c) => c.id);
      await applyDetachPlan(await planDetachFromCategory(serverId, channelId, detached));
      const { error: unErr } = await supabase
        .from("server_channels")
        .update({ parent_id: null })
        .eq("server_id", serverId)
        .eq("parent_id", channelId);
      if (unErr) throw unErr;
    }

    const { error } = await supabase
      .from("server_channels")
      .delete()
      .eq("id", channelId)
      .eq("server_id", serverId);
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "CHANNEL_DELETE",
      targetType: "channel",
      targetId: channelId,
      changes: { name: existing.name, type: existing.type },
    });

    emitToUsers(req, viewerIds, "server:channel:deleted", {
      serverId,
      channelId,
      type: existing.type,
    });
    if (detached.length) notifyAccess(req, serverId, { channelIds: detached });
    // Reactions are keyed by channel id without a FK: drop them with the channel.
    if (existing.type !== "category") {
      const { error: reactErr } = await supabase
        .from("reactions")
        .delete()
        .eq("conversation_type", "server")
        .eq("conversation_id", String(channelId));
      if (reactErr) console.warn("[SERVERS] reaction cleanup after channel delete failed:", reactErr.message);
    }
    // A deleted voice channel used to keep its call (and LiveKit room) running.
    try {
      const io = req.app?.get?.("io");
      if (io) {
        require("../socket/serverVoiceHandlers").endServerVoiceChannel(io, channelId, "channel_deleted");
        io.in(`server-channel:${channelId}`).socketsLeave(`server-channel:${channelId}`);
      }
    } catch (err) {
      console.warn("[SERVERS] voice end after channel delete failed:", err?.message || err);
    }
    return res.json({ message: "Channel deleted.", channelId, type: existing.type });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE /:id/channels/:channelId error:", err);
    return res.status(status).json({ error: err.message || "Failed to delete channel.", code: err.code });
  }
});

/**
 * Who may edit a channel override (K2, 2026-10-18). Before this, MANAGE_ROLES on the
 * server was enough: a member who could not see a channel could give themselves
 * VIEW / READ / MANAGE_MESSAGES / MENTION_EVERYONE there, or lock a higher role out.
 * Now:
 *  - the actor must be able to VIEW the channel;
 *  - a non-owner, non-ADMINISTRATOR actor may only touch bits they hold in that
 *    channel (`actorBits`); other bits of an existing override are preserved;
 *  - role target: below the actor's highest role (owner exempt);
 *  - member target: not yourself (owner exempt) and below you in the hierarchy.
 * Returns { actorBits, unrestricted }.
 */
async function assertOverrideEditor(serverId, actorId, channel, target = null) {
  const chPerms = await resolveChannelPermissions(supabase, serverId, actorId, channel.id);
  if (!chPerms.isMember || !hasPermission(chPerms.bits, Permissions.VIEW_CHANNEL)) {
    const err = new Error("Missing permission.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    err.permission = "VIEW_CHANNEL";
    throw err;
  }
  const unrestricted = Boolean(chPerms.isOwner) || hasPermission(chPerms.bits, Permissions.ADMINISTRATOR);
  if (target) {
    if (target.type === "role") {
      const { data: role, error } = await supabase
        .from("server_roles")
        .select("id, position, is_everyone")
        .eq("id", target.id)
        .eq("server_id", serverId)
        .maybeSingle();
      if (error) throw error;
      if (!role) {
        const err = new Error("Role not found.");
        err.status = 404;
        throw err;
      }
      // @everyone (position 0) is below every assigned role.
      await assertCanManageRole(supabase, serverId, actorId, role);
    } else {
      const mem = await getMembership(serverId, target.id);
      if (!mem) {
        const err = new Error("Member not found.");
        err.status = 404;
        throw err;
      }
      if (!chPerms.isOwner) {
        if (String(target.id) === String(actorId)) {
          const err = new Error("You cannot change your own channel permissions.");
          err.status = 403;
          err.code = "CANNOT_EDIT_SELF";
          throw err;
        }
        await assertHierarchy(supabase, serverId, actorId, target.id);
      }
    }
  }
  return { actorBits: chPerms.bits, unrestricted };
}

/**
 * GET /servers/:id/channels/:channelId/overrides
 */
router.get("/:id/channels/:channelId/overrides", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const { data: channel, error: cErr } = await supabase
      .from("server_channels")
      .select("id, server_id, type, name")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!channel) return res.status(404).json({ error: "Channel not found." });
    await assertOverrideEditor(serverId, req.user.id, channel);

    const { data: rows, error } = await supabase
      .from("server_channel_overrides")
      .select("*")
      .eq("channel_id", channel.id);
    if (error) throw error;

    const overrides = (rows || []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      targetType: row.target_type,
      targetId: row.target_id,
      allow: permissionsToFlags(fromPgBigint(row.allow_permissions)),
      deny: permissionsToFlags(fromPgBigint(row.deny_permissions)),
      allowBits: String(fromPgBigint(row.allow_permissions)),
      denyBits: String(fromPgBigint(row.deny_permissions)),
    }));

    return res.json({
      channelId,
      channelType: channel.type,
      editableKeys: CHANNEL_OVERRIDE_KEYS[channel.type] || CHANNEL_OVERRIDE_KEYS.text,
      overrides,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET overrides error:", err);
    return res.status(status).json({ error: err.message || "Failed to load overrides.", code: err.code });
  }
});

/**
 * PUT /servers/:id/channels/:channelId/overrides
 * Body: { targetType: 'role'|'member', targetId, permissions: { VIEW_CHANNEL: 'allow'|'deny'|'inherit'|true|false|null } }
 */
router.put("/:id/channels/:channelId/overrides", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const targetType = req.body?.targetType === "member" ? "member" : "role";
    const targetId = String(req.body?.targetId || "").trim();
    if (!targetId) return res.status(400).json({ error: "targetId is required." });

    const { data: channel, error: cErr } = await supabase
      .from("server_channels")
      .select("id, server_id, type, name, parent_id")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!channel) return res.status(404).json({ error: "Channel not found." });

    const { actorBits, unrestricted } = await assertOverrideEditor(serverId, req.user.id, channel, {
      type: targetType,
      id: targetId,
    });

    // First edit on a synced channel: take the category's rules as its own first.
    const materialized = await materializeIfSynced(channel);

    const keys = CHANNEL_OVERRIDE_KEYS[channel.type] || CHANNEL_OVERRIDE_KEYS.text;
    const parsed = parseAllowDenyFlags(req.body?.permissions || req.body?.flags, keys);
    let { allow, deny } = parsed;
    if (materialized) {
      // First edit on a synced channel: the editor showed no own rules (the channel
      // inherited its category's), so bits it did not name keep the category value
      // that was just copied. Full replacement here wiped e.g. the category's
      // @everyone VIEW deny and made the channel public (T3-4, 2.11.15 regression).
      // Applies to owner/admin and to restricted editors alike.
      const copied = materialized.find(
        (r) => r.target_type === targetType && String(r.target_id) === String(targetId)
      );
      if (copied) {
        const keep = ~parsed.specified;
        allow |= fromPgBigint(copied.allow_permissions) & keep;
        deny |= fromPgBigint(copied.deny_permissions) & keep & ~allow;
      }
    }
    if (!unrestricted) {
      // Only bits the actor holds in this channel can change; everything else on
      // an existing override stays as it was (so a mod can still edit an override
      // the owner set, without granting or stripping bits they do not have).
      const { data: existingRow, error: exErr } = await supabase
        .from("server_channel_overrides")
        .select("allow_permissions, deny_permissions")
        .eq("channel_id", channel.id)
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .maybeSingle();
      if (exErr) throw exErr;
      const mask = fromPgBigint(actorBits);
      const oldAllow = fromPgBigint(existingRow?.allow_permissions ?? 0);
      const oldDeny = fromPgBigint(existingRow?.deny_permissions ?? 0);
      allow = (allow & mask) | (oldAllow & ~mask);
      deny = (deny & mask) | (oldDeny & ~mask);
    }

    if (allow === 0n && deny === 0n) {
      await supabase
        .from("server_channel_overrides")
        .delete()
        .eq("channel_id", channel.id)
        .eq("target_type", targetType)
        .eq("target_id", targetId);
      await writeAudit({
        serverId,
        actorId: req.user.id,
        action: "CHANNEL_OVERRIDE_CLEAR",
        targetType: "channel",
        targetId: channelId,
        changes: { targetType, targetId },
      });
      notifyAccess(req, serverId, { channelId });
      return res.json({ cleared: true, channelId, targetType, targetId });
    }

    const { data: row, error } = await supabase
      .from("server_channel_overrides")
      .upsert(
        {
          channel_id: channel.id,
          target_type: targetType,
          target_id: targetId,
          allow_permissions: toPgBigint(allow),
          deny_permissions: toPgBigint(deny),
        },
        { onConflict: "channel_id,target_type,target_id" }
      )
      .select("*")
      .single();
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "CHANNEL_OVERRIDE_SET",
      targetType: "channel",
      targetId: channelId,
      changes: {
        targetType,
        targetId,
        allow: String(allow),
        deny: String(deny),
      },
    });

    notifyAccess(req, serverId, { channelId });
    return res.json({
      override: {
        id: row.id,
        channelId: row.channel_id,
        targetType: row.target_type,
        targetId: row.target_id,
        allow: permissionsToFlags(fromPgBigint(row.allow_permissions)),
        deny: permissionsToFlags(fromPgBigint(row.deny_permissions)),
      },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT overrides error:", err);
    return res.status(status).json({ error: err.message || "Failed to save override.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/channels/:channelId/overrides/:targetType/:targetId
 */
router.delete(
  "/:id/channels/:channelId/overrides/:targetType/:targetId",
  requireAuth,
  async (req, res) => {
    try {
      const serverId = req.params.id;
      const channelId = req.params.channelId;
      const targetType = req.params.targetType === "member" ? "member" : "role";
      const targetId = req.params.targetId;
      await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

      // MANAGE_ROLES above is for :id only. The channel must belong to that
      // server, otherwise an owner of server A could delete overrides on a
      // hidden channel of server B (the 2026-10-18 cross-server fix).
      const { data: channel, error: cErr } = await supabase
        .from("server_channels")
        .select("id, server_id, type")
        .eq("id", channelId)
        .eq("server_id", serverId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!channel) return res.status(404).json({ error: "Channel not found." });

      const { actorBits, unrestricted } = await assertOverrideEditor(serverId, req.user.id, channel, {
        type: targetType,
        id: targetId,
      });
      if (!unrestricted) {
        const { data: existingRow, error: exErr } = await supabase
          .from("server_channel_overrides")
          .select("allow_permissions, deny_permissions")
          .eq("channel_id", channel.id)
          .eq("target_type", targetType)
          .eq("target_id", targetId)
          .maybeSingle();
        if (exErr) throw exErr;
        const touched = fromPgBigint(existingRow?.allow_permissions ?? 0) | fromPgBigint(existingRow?.deny_permissions ?? 0);
        if (touched & ~fromPgBigint(actorBits)) {
          return res.status(403).json({
            error: "This override contains permissions you do not have.",
            code: "OVERRIDE_PERMISSION",
          });
        }
      }

      // server_channel_overrides has no server_id column: scope by the verified channel.
      const { error } = await supabase
        .from("server_channel_overrides")
        .delete()
        .eq("channel_id", channel.id)
        .eq("target_type", targetType)
        .eq("target_id", targetId);
      if (error) throw error;

      await writeAudit({
        serverId,
        actorId: req.user.id,
        action: "CHANNEL_OVERRIDE_DELETE",
        targetType: "channel",
        targetId: channelId,
        changes: { targetType, targetId },
      });

      notifyAccess(req, serverId, { channelId });
      return res.json({ deleted: true });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[SERVERS] DELETE overrides error:", err);
      return res
        .status(status)
        .json({ error: err.message || "Failed to delete override.", code: err.code });
    }
  }
);

/**
 * PATCH /servers/:id — owner or MANAGE_GUILD settings (name / icon / description / is_public)
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    let server;
    let isOwner = false;
    try {
      ({ server } = await requireServerOwner(serverId, req.user.id));
      isOwner = true;
    } catch (ownerErr) {
      if (ownerErr.status !== 403) throw ownerErr;
      ({ server } = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_GUILD));
    }
    const patch = {};
    let actorIsAdmin = isOwner;
    if (!isOwner) {
      const resolved = await resolveMemberPermissions(supabase, serverId, req.user.id);
      actorIsAdmin = hasPermission(resolved.bits, Permissions.ADMINISTRATOR);
    }
    // Visibility / vanity / verification change who can find and join the server:
    // owner or ADMINISTRATOR only (MANAGE_GUILD could open a private server, 2026-10-19 #8).
    // Unchanged values are accepted so settings forms that resend every field still save.
    const sensitiveChanges = [];
    const requireAdminFor = (field, changed) => {
      if (!changed) return;
      if (!actorIsAdmin) {
        const err = new Error("Only the owner or an administrator can change this setting.");
        err.status = 403;
        err.code = "ADMIN_REQUIRED";
        err.field = field;
        throw err;
      }
      sensitiveChanges.push(field);
    };

    if (req.body?.name != null) {
      const name = cleanName(req.body.name);
      if (name.length < NAME_MIN || name.length > NAME_MAX) {
        return res.status(400).json({
          error: `Server name must be ${NAME_MIN}–${NAME_MAX} characters.`,
        });
      }
      patch.name = name;
    }
    const imageField = (bodyKey, column) => {
      if (req.body?.[bodyKey] === undefined) return;
      const raw = req.body[bodyKey] ? String(req.body[bodyKey]).trim() : null;
      // An unchanged stored value is kept as is (forms resend it).
      if ((raw || null) === (server[column] || null)) return;
      patch[column] = cleanServerImageUrl(raw, bodyKey);
    };
    imageField("iconUrl", "icon_url");
    imageField("bannerUrl", "banner_url");
    if (req.body?.description !== undefined) {
      patch.description = req.body.description
        ? String(req.body.description).trim().slice(0, 500)
        : null;
    }
    if (req.body?.isPublic !== undefined) {
      const next = Boolean(req.body.isPublic);
      requireAdminFor("isPublic", next !== Boolean(server.is_public));
      patch.is_public = next;
    }
    if (req.body?.communityEnabled !== undefined) {
      patch.community_enabled = Boolean(req.body.communityEnabled);
    }
    if (req.body?.rulesChannelId !== undefined) {
      const channelId = req.body.rulesChannelId || null;
      if (channelId) {
        // Must be a text channel of this server (was stored unchecked before 2026-10-18).
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
      }
      patch.rules_channel_id = channelId;
    }
    if (req.body?.rulesText !== undefined) {
      patch.rules_text = req.body.rulesText
        ? String(req.body.rulesText).trim().slice(0, 4000)
        : null;
    }
    imageField("splashUrl", "splash_url");
    if (req.body?.verificationLevel !== undefined) {
      const level = String(req.body.verificationLevel || "none").toLowerCase();
      if (!["none", "low", "medium", "high", "highest"].includes(level)) {
        return res.status(400).json({ error: "Invalid verification level." });
      }
      requireAdminFor("verificationLevel", level !== String(server.verification_level || "none").toLowerCase());
      patch.verification_level = level;
    }
    if (req.body?.vanitySlug !== undefined) {
      const raw = req.body.vanitySlug;
      if (raw == null || raw === "") {
        requireAdminFor("vanitySlug", server.vanity_slug != null);
        patch.vanity_slug = null;
      } else {
        const slug = normalizeVanitySlug(raw);
        requireAdminFor("vanitySlug", slug !== (server.vanity_slug || null));
        const { data: taken } = await supabase
          .from("servers")
          .select("id")
          .eq("vanity_slug", slug)
          .neq("id", serverId)
          .maybeSingle();
        if (taken) {
          return res.status(409).json({
            error: "That vanity URL is already taken.",
            code: "VANITY_TAKEN",
          });
        }
        patch.vanity_slug = slug;
      }
    }
    if (req.body?.afkChannelId !== undefined) {
      const channelId = req.body.afkChannelId || null;
      if (channelId) {
        await assertServerChannelRef(serverId, channelId, ["voice"]);
      }
      patch.afk_channel_id = channelId;
    }
    if (req.body?.afkTimeoutSeconds !== undefined) {
      const parsed = Math.floor(Number(req.body.afkTimeoutSeconds));
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ error: "Invalid AFK timeout." });
      }
      patch.afk_timeout_seconds = Math.max(60, Math.min(3600, parsed));
    }
    if (req.body?.systemChannelId !== undefined) {
      const channelId = req.body.systemChannelId || null;
      if (channelId) {
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
      }
      patch.system_channel_id = channelId;
    }
    if (req.body?.welcomeChannelId !== undefined) {
      const channelId = req.body.welcomeChannelId || null;
      if (channelId) {
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
      }
      patch.welcome_channel_id = channelId;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "No changes provided." });
    }

    patch.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("servers")
      .update(patch)
      .eq("id", serverId)
      .select("*")
      .single();
    if (error) {
      // Unique index on vanity_slug: two servers claiming the same slug at once.
      if (String(error.code) === "23505") {
        return res.status(409).json({ error: "That vanity URL is already taken.", code: "VANITY_TAKEN" });
      }
      throw error;
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "SERVER_UPDATE",
      targetType: "server",
      targetId: serverId,
      changes: patch,
    });

    // Live update for every member (the sidebar kept the old name/icon until a reload).
    {
      const io = req.app?.get?.("io");
      const pub = publicServer(updated || server, {});
      if (pub) {
        delete pub.isOwner;
        delete pub.myPermissions;
      }
      emitToServer(req, serverId, "server:updated", { server: pub });
      // Owner hears about visibility / vanity / verification changes made by an admin.
      if (io && sensitiveChanges.length && String(server.owner_id) !== String(req.user.id)) {
        io.to(`user:${server.owner_id}`).emit("server:updated", {
          serverId,
          server: pub,
          sensitiveChange: { actorId: req.user.id, fields: sensitiveChanges },
        });
      }
    }

    const membership = await getMembership(serverId, req.user.id);
    const bundle = await loadServerBundle(serverId);
    const myPermissions = await buildMyPermissionsPayload(serverId, req.user.id);
    const channels = await publicVisibleChannels(serverId, req.user.id, bundle.channels);

    return res.json({
      server: publicServer(updated || server, {
        isOwner: String((updated || server).owner_id) === String(req.user.id),
        memberCount: bundle.memberCount,
        nickname: membership?.nickname || null,
        listPosition: membership?.list_position ?? 0,
        channels,
        roles: bundle.roles.map(publicRole),
        myPermissions,
      }),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH /:id error:", err);
    return res.status(status).json({ error: err.message || "Failed to update server.", code: err.code });
  }
});

/**
 * POST /servers/:id/invites — create invite (CREATE_INSTANT_INVITE)
 */
router.post("/:id/invites", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    await requireServerPermission(serverId, req.user.id, Permissions.CREATE_INSTANT_INVITE);

    const maxUses =
      req.body?.maxUses == null || req.body.maxUses === "" || Number(req.body.maxUses) === 0
        ? null
        : Math.max(1, Math.min(100000, Math.floor(Number(req.body.maxUses))));
    const maxAgeSeconds =
      req.body?.maxAgeSeconds == null || Number(req.body.maxAgeSeconds) === 0
        ? null
        : Math.max(60, Math.min(60 * 60 * 24 * 30, Math.floor(Number(req.body.maxAgeSeconds))));
    // Default 7 days when neither explicit 0 (forever) nor a value is given
    const age =
      req.body?.maxAgeSeconds === 0 || req.body?.maxAgeSeconds === null
        ? null
        : maxAgeSeconds != null
          ? maxAgeSeconds
          : 60 * 60 * 24 * 7;

    let code = generateInviteCode();
    for (let i = 0; i < 6; i++) {
      const { data: existing } = await supabase
        .from("server_invites")
        .select("code")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateInviteCode();
    }

    const expiresAt = age ? new Date(Date.now() + age * 1000).toISOString() : null;

    // An invite may only point at a channel of this server (was unchecked before 2026-10-18).
    const inviteChannelId = req.body?.channelId ? String(req.body.channelId) : null;
    if (inviteChannelId) {
      await assertServerChannelRef(serverId, inviteChannelId);
    }

    const { data: invite, error } = await supabase
      .from("server_invites")
      .insert({
        code,
        server_id: serverId,
        creator_id: req.user.id,
        channel_id: inviteChannelId,
        max_uses: maxUses,
        uses: 0,
        max_age_seconds: age,
        temporary: Boolean(req.body?.temporary),
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw error;

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "INVITE_CREATE",
      targetType: "invite",
      targetId: code,
      changes: { maxUses, maxAgeSeconds: age },
    });

    return res.status(201).json({ invite: publicInvite(invite, req) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/invites error:", err);
    return res.status(status).json({ error: err.message || "Failed to create invite.", code: err.code });
  }
});

/**
 * GET /servers/:id/invites — list invites
 */
router.get("/:id/invites", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    await requireServerPermission(serverId, req.user.id, Permissions.CREATE_INSTANT_INVITE);
    // Everyone's invites need MANAGE_GUILD; with only CREATE_INSTANT_INVITE you see your own.
    const canManage = await hasServerPermission(serverId, req.user.id, Permissions.MANAGE_GUILD);

    let query = supabase.from("server_invites").select("*").eq("server_id", serverId);
    if (!canManage) query = query.eq("creator_id", req.user.id);
    const { data: invites, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    const live = [];
    for (const invite of invites || []) {
      if (isInviteExpired(invite)) {
        await supabase.from("server_invites").delete().eq("code", invite.code);
        continue;
      }
      live.push(publicInvite(invite, req));
    }

    return res.json({ invites: live });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET /:id/invites error:", err);
    return res.status(status).json({ error: err.message || "Failed to list invites.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/invites/:code — revoke invite
 */
router.delete("/:id/invites/:code", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const code = String(req.params.code || "").trim();
    await requireServerPermission(serverId, req.user.id, Permissions.CREATE_INSTANT_INVITE);

    const { data: invite } = await supabase
      .from("server_invites")
      .select("code, server_id, creator_id")
      .eq("code", code)
      .eq("server_id", serverId)
      .maybeSingle();
    if (!invite) return res.status(404).json({ error: "Invite not found." });
    if (
      String(invite.creator_id) !== String(req.user.id) &&
      !(await hasServerPermission(serverId, req.user.id, Permissions.MANAGE_GUILD))
    ) {
      // Same answer as a missing invite: no oracle for other members' codes.
      return res.status(404).json({ error: "Invite not found." });
    }

    await supabase.from("server_invites").delete().eq("code", code).eq("server_id", serverId);

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "INVITE_DELETE",
      targetType: "invite",
      targetId: code,
    });

    return res.json({ message: "Invite revoked.", code });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE /:id/invites/:code error:", err);
    return res.status(status).json({ error: err.message || "Failed to revoke invite.", code: err.code });
  }
});

module.exports = router;
