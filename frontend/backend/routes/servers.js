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
  sameId,
  isTimeoutRestricted,
  timeoutRestrictedError,
  selectAllIn,
  ALL_PERMISSIONS,
} = require("../lib/serverPermissions");
const memberState = require("../lib/serverMemberState");
const { canonId } = memberState;
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
const { invitePreviewExtras } = require("../lib/invitePreviewExtras");
const { presence: livePresence } = require("../runtime/sharedState");
const { planDetachFromCategory, applyDetachPlan, materializeIfSynced } = require("../lib/categoryDetach");
const {
  BLANK_ID,
  listTemplateSummaries,
  getTemplate,
  localizeTemplate,
  seedServerFromTemplate,
  templateTopicKey,
} = require("../lib/serverTemplates");

const { starterChannelNames } = require("../lib/starterChannelNames");
const { requestLang } = require("../lib/i18n");
const router = express.Router();

// Ids from the URL are compared in JS (owner, self, hierarchy) and in Postgres (uuid,
// case-insensitive). An UPPERCASE owner id passed every JS check and still hit the
// owner's row in the DB (audit M1). Every id param is canonical from here on.
for (const name of ["id", "userId", "roleId", "channelId", "targetId"]) {
  router.param(name, (req, _res, next, value) => {
    req.params[name] = canonId(value);
    next();
  });
}

const MAX_OWNED_SERVERS = 10;
const { acquireCapLock } = require("../lib/capLock");
const { apiError, apiText, templatedError, errorFields } = require("../lib/apiError");
const { recordJoinedViaInvite } = require("../lib/inviteAttribution");
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
  // Preloaded rows without this server's @everyone role are incomplete (a batch read cut
  // by the row cap): never skip the @everyone overwrite, read this server directly (P1).
  const preloadedOk =
    preloaded?.overrides && preloaded?.roles && preloaded?.assigned && preloaded.roles.some((r) => r.is_everyone);
  if (preloadedOk) {
    const allowed = new Set(overrideIds.map(String));
    overrides = (preloaded.overrides || []).filter((row) => allowed.has(String(row.channel_id)));
    roles = preloaded.roles;
    assigned = preloaded.assigned;
  } else {
    // Paged reads: PostgREST stops at max_rows (1000) without an error, and a dropped
    // deny row made a private channel visible (P1 / CA-4).
    const [overrideRows, rolesRes, assignedRes] = await Promise.all([
      overrideIds.length
        ? selectAllIn(
            supabase,
            "server_channel_overrides",
            "id, channel_id, target_type, target_id, allow_permissions, deny_permissions",
            (q) => q.order("id", { ascending: true }),
            "channel_id",
            overrideIds
          )
        : Promise.resolve([]),
      supabase.from("server_roles").select("id, position, is_everyone").eq("server_id", serverId),
      supabase
        .from("server_member_roles")
        .select("role_id")
        .eq("server_id", serverId)
        .eq("user_id", userId),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (assignedRes.error) throw assignedRes.error;
    overrides = overrideRows;
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

const SERVER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const SERVER_IMAGE_PATH = "/storage/v1/object/public/media/images/";

function cleanServerImageUrl(raw, field) {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();
  if (!value) return null;
  // Quotes, brackets, backslashes, whitespace and control characters are never part of
  // our upload URLs; they let a value break out of CSS url() and load a second image
  // from another host (DF-3).
  if (/["'()\\\s<>`]|[\u0000-\u001f\u007f]/.test(value)) {
    throw templatedError("{field} must be an image uploaded to Descall.", { field }, { status: 400, code: "INVALID_IMAGE_URL" });
  }
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
    !url.search &&
    !url.hash &&
    // Supabase storage: only the public images/ folder (images only; videos, PDFs and
    // archives live under files/, SC-9).
    (!supabaseHost || url.pathname.startsWith(SERVER_IMAGE_PATH));
  if (!ok) {
    throw templatedError("{field} must be an image uploaded to Descall.", { field }, { status: 400, code: "INVALID_IMAGE_URL" });
  }
  return url.href;
}

/** An uploaded server image must be a real image row of a sane size (SC-9). */
async function assertServerImageUpload(href, field) {
  if (!href) return;
  try {
    const { data } = await supabase
      .from("media_uploads")
      .select("media_type, file_size")
      .eq("public_url", href)
      .limit(1);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return; // legacy upload without a row: the images/ folder already means "image"
    if ((row.media_type && row.media_type !== "image") || Number(row.file_size) > SERVER_IMAGE_MAX_BYTES) {
      throw templatedError("{field} must be an image uploaded to Descall.", { field }, { status: 400, code: "INVALID_IMAGE_URL" });
    }
  } catch (err) {
    if (err?.code === "INVALID_IMAGE_URL") throw err;
  }
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

/**
 * Voice / stage seat limit (0 = unlimited, 1-99). undefined = not given, null = invalid.
 * Stored in server_channels.user_limit (migration 20261115_server_audit_voice.sql).
 */
function parseUserLimit(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 99) return null;
  return n;
}

/** PostgREST answer for a column that is not there yet (migration not applied). */
function isMissingColumn(error, column) {
  const msg = String(error?.message || "");
  return (String(error?.code) === "PGRST204" || String(error?.code) === "42703") && (!column || msg.includes(column));
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
  if (!sameId(server.owner_id, userId)) {
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
  if (!resolved.isMember) return false;
  if (!timeoutAllows(flag) && isTimeoutRestricted(resolved)) return false;
  return hasPermission(resolved.bits, flag);
}

/** A timed-out member keeps only read access (Discord parity; audit R4/M4/IM-2/SC-4). */
function timeoutAllows(flag) {
  const bit = typeof flag === "bigint" ? flag : Permissions[flag];
  return bit === Permissions.VIEW_CHANNEL || bit === Permissions.READ_MESSAGE_HISTORY;
}

async function requireServerPermission(serverId, userId, flag) {
  const resolved = await resolveMemberPermissions(supabase, serverId, userId);
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.status = 403;
    throw err;
  }
  if (!timeoutAllows(flag) && isTimeoutRestricted(resolved)) throw timeoutRestrictedError(resolved);
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
    resolved,
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
    defaultNotificationLevel: row.default_notification_level === "mentions" ? "mentions" : "all",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

function publicChannel(row) {
  if (!row) return null;
  // A topic written by a server template is shown in each viewer's language
  // (i18n.topic.key = the English sentence, .source = the stored text it was read
  // from, so a client that merges in an edited topic drops the stale key). A
  // member's own topic has no key.
  const topicKey = templateTopicKey(row.topic);
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
    ...(row.type === "voice" || row.type === "stage" ? { userLimit: Number(row.user_limit) || 0 } : {}),
    createdAt: row.created_at,
    ...(topicKey ? { i18n: { topic: { key: topicKey, source: row.topic } } } : {}),
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
 * PostgREST): true means the cap is exceeded after our insert and ours must be undone.
 */
async function insertedOverCap(table, column, value, _id, cap) {
  // Re-count after our insert. Over the cap means a parallel create on another
  // instance slipped past the pre-count: undo ours. (Ranking rows by created_at used
  // to pick a "winner", but a request that had already kept its row never saw a later
  // commit with an earlier timestamp, so the total could end at cap + 1. Undoing
  // whenever we see too many can only under-fill, never overfill.) Same-instance
  // creates are serialized by acquireCapLock, so this is the cross-instance backstop
  // (audit round 5 #9).
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return (count || 0) > cap;
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
    .select("server_id, user_id, nickname, list_position, joined_at, timeout_until, timeout_reason, timed_out_by, notification_level, rules_accepted_at, temporary")
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

/**
 * Members (and the owner) of serverId who can VIEW_CHANNEL `channel`.
 * Every member is read (paged past the 1000-row cap) and the rows are loaded once for
 * all of them. A category counts as visible when one of its channels is (it was
 * checked alone, so category events only ever reached owner and admins, P6).
 */
async function channelViewerIds(serverId, channel) {
  const memberIds = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .order("user_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    memberIds.push(...(page || []).map((m) => m.user_id));
    if (!page || page.length < 1000) break;
  }

  const { data: serverRow } = await supabase
    .from("servers")
    .select("id, owner_id")
    .eq("id", serverId)
    .maybeSingle();
  const userIds = new Set(memberIds);
  if (serverRow?.owner_id) userIds.add(serverRow.owner_id);

  let list = [channel];
  if (String(channel?.type || "").toLowerCase() === "category") {
    const { data: kids } = await supabase
      .from("server_channels")
      .select("*")
      .eq("server_id", serverId)
      .eq("parent_id", channel.id);
    // An empty category is shown to whoever could see a channel in it: everyone who
    // can view the category itself.
    list = (kids || []).length ? [channel, ...kids] : [channel, { ...channel, id: `${channel.id}:probe`, type: "text", parent_id: channel.id }];
  }
  const ids = [...new Set(list.flatMap((c) => [c.id, c.parent_id || c.parentId].filter(Boolean)))];

  const [{ data: roles }, overrides, assignedRows] = await Promise.all([
    supabase.from("server_roles").select("id, permissions, position, is_everyone").eq("server_id", serverId),
    selectAllIn(
      supabase,
      "server_channel_overrides",
      "id, channel_id, target_type, target_id, allow_permissions, deny_permissions",
      (q) => q.order("id", { ascending: true }),
      "channel_id",
      ids.filter((id) => !String(id).endsWith(":probe"))
    ),
    memberIds.length
      ? selectAllIn(supabase, "server_member_roles", "user_id, role_id", (q) => q.eq("server_id", serverId), "user_id", memberIds)
      : Promise.resolve([]),
  ]);
  const assignedBy = new Map();
  for (const r of assignedRows || []) {
    if (!assignedBy.has(String(r.user_id))) assignedBy.set(String(r.user_id), []);
    assignedBy.get(String(r.user_id)).push({ role_id: r.role_id });
  }

  const viewers = [];
  for (const uid of userIds) {
    try {
      const visible = await filterChannelsForMember(serverId, uid, list, {
        server: serverRow ? { id: serverRow.id, owner_id: serverRow.owner_id } : null,
        isMember: true,
        roles: roles || [],
        assigned: assignedBy.get(String(uid)) || [],
        overrides: overrides || [],
      });
      if (visible.some((c) => String(c.id) === String(channel.id))) viewers.push(uid);
    } catch (err) {
      console.warn("[SERVERS] channelViewerIds member skip:", uid, err?.message || err);
    }
  }
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
    const viewers = await channelViewerIds(serverId, channel);
    // Whoever sees the channel sees its category too: members who could not see the
    // (empty or hidden-children) category before get it now, so the channel never
    // arrives with an unknown parentId (P6).
    if (channel.parent_id && event === "server:channel:created") {
      const { data: parent } = await supabase
        .from("server_channels")
        .select("*")
        .eq("id", channel.parent_id)
        .eq("server_id", serverId)
        .maybeSingle();
      if (parent) emitToUsers(req, viewers, "server:channel:updated", { serverId, channel: publicChannel(parent) });
    }
    emitToUsers(req, viewers, event, payload);
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

/**
 * Channel bits of a member that has only @everyone (no roles, no member override): what
 * "every member" can do in a channel.
 */
async function everyoneChannelBits(serverId, channelId) {
  const { data: channel } = await supabase
    .from("server_channels")
    .select("id, parent_id")
    .eq("id", channelId)
    .eq("server_id", serverId)
    .maybeSingle();
  if (!channel) return 0n;
  const ids = channel.parent_id ? [channel.parent_id, channel.id] : [channel.id];
  const [{ data: roles }, { data: overrides }] = await Promise.all([
    supabase.from("server_roles").select("id, permissions, position, is_everyone").eq("server_id", serverId),
    supabase
      .from("server_channel_overrides")
      .select("id, channel_id, target_type, target_id, allow_permissions, deny_permissions")
      .in("channel_id", ids),
  ]);
  const everyone = (roles || []).find((r) => r.is_everyone);
  if (!everyone) return 0n;
  const { computeChannelOverwriteBits, stripEveryonePrivilegeBits } = require("../lib/serverPermissions");
  return computeChannelOverwriteBits({
    baseBits: stripEveryonePrivilegeBits(fromPgBigint(everyone.permissions)),
    roles,
    assigned: [],
    overrides: (overrides || []).filter((o) => o.target_type === "role"),
    channelId: channel.id,
    parentId: channel.parent_id || null,
    userId: "\u0000everyone",
  });
}

/**
 * Server setting channels (AFK, rules, welcome, system) must be visible to the actor,
 * and for the public ones to every member (SC-1 / SC-11).
 */
async function assertSettingChannelVisible(serverId, actorId, channelId, { everyone = false, connect = false } = {}) {
  const need = (bits) =>
    hasPermission(bits, Permissions.VIEW_CHANNEL) && (!connect || hasPermission(bits, Permissions.CONNECT));
  const mine = await resolveChannelPermissions(supabase, serverId, actorId, channelId);
  if (!mine.isMember || mine.channelMissing || !need(mine.bits)) {
    const err = new Error("Channel not found on this server.");
    err.status = 400;
    throw err;
  }
  if (everyone && !need(await everyoneChannelBits(serverId, channelId))) {
    const err = new Error("Pick a channel every member can see.");
    err.status = 400;
    err.code = connect ? "AFK_CHANNEL_NOT_PUBLIC" : "SETTING_CHANNEL_NOT_PUBLIC";
    throw err;
  }
}

const SETTING_REF_FIELDS = ["afkChannelId", "systemChannelId", "welcomeChannelId", "rulesChannelId"];

/** Drop setting channel ids that @everyone cannot view from a broadcast payload (SC-8). */
async function redactHiddenSettingRefs(serverId, pub) {
  for (const field of SETTING_REF_FIELDS) {
    const id = pub?.[field];
    if (!id) continue;
    let ok = false;
    try {
      ok = hasPermission(await everyoneChannelBits(serverId, id), Permissions.VIEW_CHANNEL);
    } catch {
      ok = false;
    }
    if (!ok) delete pub[field];
  }
  return pub;
}

/** Null the setting channel ids a member cannot see in their own copy (SC-8). */
function redactRefsForViewer(pub, visibleChannels) {
  if (!pub) return pub;
  const visible = new Set((visibleChannels || []).map((c) => String(c.id)));
  for (const field of SETTING_REF_FIELDS) {
    if (pub[field] && !visible.has(String(pub[field]))) pub[field] = null;
  }
  return pub;
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
  wasMember = true,
}) {
  const io = req.app?.get?.("io");
  if (!io || !serverId || !targetUserId) return;
  const kind = action === "ban" ? "ban" : "kick";

  // The removed user hears the reason (never who did it). The other members only learn
  // who left: the moderator id and the private note used to go to everyone (audit M5).
  io.to(`user:${targetUserId}`).emit("server:member:removed", {
    serverId,
    serverName: serverName || null,
    userId: targetUserId,
    action: kind,
    reason: reason || null,
  });
  // Banning someone who was not a member changes nobody's member count.
  if (wasMember) {
    const room = io.to(`server:${serverId}`);
    const target = typeof room.except === "function" ? room.except(`user:${targetUserId}`) : room;
    target.emit("server:member:removed", { serverId, userId: targetUserId, action: kind });
  }

  // Only this server's rooms and voice calls (other servers' were dropped too before).
  void require("../lib/serverRooms").dropUserFromServer(io, serverId, targetUserId, kind);
  // LiveKit seats and tokens (voice contract): a removed user must not reconnect (M2).
  void memberState.callVoice("evictFromServerVoice", io, { serverId, userId: targetUserId, reason: kind });
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

    // Batch reads are paged (selectAllIn): PostgREST cuts every select at 1000 rows
    // without an error, which dropped channels, roles and override rows (P1 / CA-4).
    const pagedOrNull = async (label, fn) => {
      try {
        return await fn();
      } catch (e) {
        console.warn(`[SERVERS] ${label} batch failed:`, e?.message || e);
        return null;
      }
    };
    const [serversRes, memberCounts, channelRows] = await Promise.all([
      supabase.from("servers").select("*").in("id", ids),
      // Exact head counts, 8 at a time (one row per member was cut at 1000 rows).
      (async () => {
        const out = [];
        let next = 0;
        const worker = async () => {
          while (next < ids.length) {
            const id = ids[next++];
            const { count } = await supabase
              .from("server_members")
              .select("user_id", { count: "exact", head: true })
              .eq("server_id", id);
            out.push([id, count || 0]);
          }
        };
        await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker));
        return out;
      })(),
      pagedOrNull("channel", () =>
        selectAllIn(supabase, "server_channels", "*", (q) => q.order("id", { ascending: true }), "server_id", ids)
      ),
    ]);
    if (serversRes.error) throw serversRes.error;
    const servers = serversRes.data || [];
    const channels = [...(channelRows || [])].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));

    const byId = new Map(servers.map((s) => [s.id, s]));
    const ownedCount = servers.filter((s) => sameId(s.owner_id, userId)).length;

    const counts = new Map(memberCounts);

    const rawChannelsByServer = new Map();
    for (const ch of channels) {
      if (!rawChannelsByServer.has(ch.server_id)) rawChannelsByServer.set(ch.server_id, []);
      rawChannelsByServer.get(ch.server_id).push(ch);
    }

    const channelIds = channels.map((ch) => ch.id).filter(Boolean);
    const [roleRows, assignedRows, overrideRows] = await Promise.all([
      selectAllIn(
        supabase,
        "server_roles",
        "id, server_id, permissions, is_everyone, position",
        (q) => q.order("id", { ascending: true }),
        "server_id",
        ids
      ),
      selectAllIn(
        supabase,
        "server_member_roles",
        "server_id, role_id, user_id",
        (q) => q.eq("user_id", userId).order("role_id", { ascending: true }),
        "server_id",
        ids
      ),
      channelIds.length
        ? pagedOrNull("override", () =>
            selectAllIn(
              supabase,
              "server_channel_overrides",
              "id, channel_id, target_type, target_id, allow_permissions, deny_permissions",
              (q) => q.order("id", { ascending: true }),
              "channel_id",
              channelIds
            )
          )
        : Promise.resolve([]),
    ]);
    const rolesRes = { data: roleRows };
    const assignedRes = { data: assignedRows };
    const overridesRes = overrideRows ? { data: overrideRows, error: null } : { data: [], error: new Error("override batch failed") };

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
        const pub = publicServer(row, {
          nickname: m.nickname || null,
          listPosition: m.list_position ?? 0,
          joinedAt: m.joined_at,
          notificationLevel: ["all", "mentions", "muted"].includes(level) ? level : "all",
          rulesAcceptedAt: m.rules_accepted_at || null,
          timeoutUntil: m.timeout_until || null,
          timeoutReason: m.timeout_reason || null,
          folderId: m.folder_id || null,
          isOwner: sameId(row.owner_id, userId),
          memberCount: counts.get(row.id) || 0,
          channels: metaByServer.get(row.id)?.channels || [],
          myPermissions: metaByServer.get(row.id)?.myPermissions || null,
        });
        return redactRefsForViewer(pub, pub.channels);
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update channel mute." });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to mark channel read." });
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
  let releaseCap = null;
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
      releaseCap = await acquireCapLock(`folders:${userId}`);
      const { count, error: cntErr } = await supabase
        .from("server_folders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (cntErr) throw cntErr;
      if ((count || 0) >= MAX_SERVER_FOLDERS) {
        return res.status(400).json({
          ...apiError("You can have at most {max} folders.", { max: MAX_SERVER_FOLDERS }),
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
        ...apiError("You can have at most {max} folders.", { max: MAX_SERVER_FOLDERS }),
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
  } finally {
    releaseCap?.();
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
  let releaseCap = null;
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
      return res.status(400).json(apiError("Server name must be {min}–{max} characters.", { min: NAME_MIN, max: NAME_MAX }));
    }
    {
      // Güvenlik Merkezi read-only lock: no new servers (admins exempt).
      const { checkServerCreate } = require("../lib/platformPolicy");
      const verdict = checkServerCreate({ config: require("../runtime/sharedState").systemConfig, isAdmin: req.user.username === "admin" });
      if (!verdict.ok) {
        const { data: row } = await supabase.from("users").select("is_admin").eq("id", userId).maybeSingle();
        if (!row?.is_admin) return res.status(403).json({ error: verdict.message, code: verdict.code });
      }
    }

    let templateMode = "default";
    let template = null;
    if (templateKey === BLANK_ID || templateKey === "scratch" || templateKey === "from_scratch") {
      templateMode = "blank";
    } else if (templateKey === "default" || templateKey === "") {
      templateMode = "default";
    } else {
      // Names, topics and rules go into the database in the creator's language.
      template = localizeTemplate(getTemplate(templateKey), req.body?.starterLocale || requestLang(req, "en"));
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

    releaseCap = await acquireCapLock(`owned:${userId}`);
    const owned = await countOwnedServers(userId);
    if (owned >= MAX_OWNED_SERVERS) {
      return res.status(400).json({
        ...apiError("You can own at most {max} servers.", { max: MAX_OWNED_SERVERS }),
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
        ...apiError("You can own at most {max} servers.", { max: MAX_OWNED_SERVERS }),
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
      const starterNames = starterChannelNames(req.body?.starterLocale);
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
          name: starterNames.textCategory,
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
          name: starterNames.text,
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
          name: starterNames.voiceCategory,
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
          name: starterNames.voice,
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
      return res.status(err.status).json({ ...errorFields(err), error: err.message, code: err.code });
    }
    console.error("[SERVERS] POST / error:", err);
    return res.status(500).json({ error: "Failed to create server." });
  } finally {
    releaseCap?.();
  }
});

// ---- join hardening (audit 2026-10-19: D1, #9, #17) ----
const MAX_JOINED_SERVERS = 200;
const MAX_INVITES_PER_SERVER = 1000;
const MAX_INVITES_PER_MEMBER = 50;
const INVITE_CREATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };
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
      ? [recordFailure(uid ? `server-invite-lookup:user:${uid}` : `server-invite-lookup:ip:${ip}`, INVITE_LOOKUP_LIMIT)]
      : kind === "discover"
        ? [recordFailure(`server-discover:user:${uid}`, DISCOVER_LIMIT)]
        : [
            recordFailure(`server-join:user:${uid}`, JOIN_LIMIT),
            ip ? recordFailure(`server-join:ip:${ip}`, JOIN_IP_LIMIT) : { ok: true },
          ];
  return rejectIfLimited(res, results);
}

function withInviteChannel(payload, invite) {
  return { ...payload, channelId: inviteLandingChannelId(invite, payload?.server?.channels) };
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
  // A timeout that was running when the member left comes back with them (M3 / IM-1).
  const timeoutFields = await memberState.timeoutFieldsForJoin(serverId, userId);
  // The server's default notification level ("*": the column may not exist yet, SC-10).
  const { data: srvDefaults } = await supabase.from("servers").select("*").eq("id", serverId).maybeSingle();
  const { error } = await supabase.from("server_members").insert({
    server_id: serverId,
    user_id: userId,
    list_position: listPosition,
    temporary: Boolean(temporary),
    ...(srvDefaults?.default_notification_level === "mentions" ? { notification_level: "mentions" } : {}),
    ...timeoutFields,
  });
  if (error) {
    if (String(error.code) === "23505") return { alreadyMember: true };
    throw error;
  }
  const undo = async () => {
    await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", userId);
  };
  const { data: ban } = await supabase
    .from("server_bans")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ban) {
    await undo();
    await memberState.purgeMemberState(serverId, userId);
    return { banned: true };
  }
  // Count-then-insert caps get a post-insert recount (parallel joins, IM-15 / IM-9).
  try {
    const [{ count: joinedCount }, { count: memberCount }] = await Promise.all([
      supabase.from("server_members").select("server_id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId),
    ]);
    if ((joinedCount || 0) > MAX_JOINED_SERVERS) {
      await undo();
      return { capped: true };
    }
    if ((memberCount || 0) > maxServerMembers()) {
      await undo();
      return { full: true };
    }
  } catch (err) {
    console.warn("[SERVERS] join recount failed:", err?.message || err);
  }
  return { ok: true };
}

/** Members per server (IM-9). SERVER_MAX_MEMBERS overrides the default. */
function maxServerMembers() {
  const n = Math.floor(Number(process.env.SERVER_MAX_MEMBERS));
  return Number.isFinite(n) && n > 0 ? n : 25000;
}

/** Platform staff paused joins ("close invites"): every join path stops (IM-4). */
function joinsPaused(server) {
  return Boolean(server?.invites_paused_at);
}

function joinsPausedRefusal(res) {
  return res.status(403).json(apiError("Joining this server is paused right now.", null, { code: "JOINS_PAUSED" }));
}

function joinRefusal(res, result) {
  if (result.full) {
    return res.status(403).json({
      ...apiError("This server is full ({max} members).", { max: maxServerMembers() }),
      code: "SERVER_FULL",
    });
  }
  if (result.banned) return res.status(403).json({ error: "You are banned from this server.", code: "BANNED" });
  if (result.capped) {
    return res.status(400).json({
      ...apiError("You can be in at most {max} servers.", { max: MAX_JOINED_SERVERS }),
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
    // Servers hidden by Descall moderation stay out of the in-app list too (IM-10).
    let query = supabase
      .from("servers")
      .select(cols)
      .eq("is_public", true)
      .is("directory_hidden_at", null)
      .order(sort === "active" ? "updated_at" : "created_at", { ascending: false });
    if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);
    query = windowed ? query.limit(200) : query.range(offset, offset + limit);

    const { data: fetchedRaw, error } = await query;
    if (error) throw error;
    // ...and so do servers whose owner account is banned or deleted (like the web directory).
    const owners = await loadOwnerStates((fetchedRaw || []).map((r) => r.owner_id));
    const fetched = (fetchedRaw || []).filter((r) => ownerStateOk(owners.get(String(r.owner_id))));

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


/** users rows { id, is_banned, deleted_at } by id (columns degrade when a migration is missing). */
async function loadOwnerStates(ownerIds) {
  const ids = [...new Set((ownerIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  for (const cols of ["id, is_banned, deleted_at, deletion_requested_at", "id, is_banned, deleted_at", "id, is_banned", "id"]) {
    const { data, error } = await supabase.from("users").select(cols).in("id", ids);
    if (!error) return new Map((data || []).map((u) => [String(u.id), u]));
  }
  return new Map();
}

function ownerStateOk(owner) {
  return Boolean(owner) && !owner.is_banned && !owner.deleted_at;
}

async function ownerAvailable(ownerId) {
  return ownerStateOk((await loadOwnerStates([ownerId])).get(String(ownerId)));
}

/** 3.7.32: previews tell a banned viewer up front (used to show only after pressing Join). */
async function isViewerBanned(serverId, userId) {
  const { data } = await supabase
    .from("server_bans")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** 3.7.32: a channel-bound invite opens that channel after joining, if the joiner can see it. */
function inviteLandingChannelId(invite, channels) {
  const id = invite?.channel_id ? String(invite.channel_id) : null;
  if (!id) return null;
  return (channels || []).some((c) => String(c?.id) === id) ? id : null;
}

/**
 * Invite / vanity previews are public: a logged-out visitor opening a
 * descall.com/servers/join/:code link must see the server before signing in
 * (3.7.31: they were bounced to the home page). A Bearer token, when sent, is
 * still fully verified (invalid → 401) so members get isMember.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return requireAuth(req, res, next);
  req.user = null;
  return next();
}

/** Logged-out preview: only what the invite card shows. */
function anonymousServerPreview(server, extra) {
  return {
    id: server.id,
    name: server.name,
    iconUrl: server.icon_url || null,
    bannerUrl: server.banner_url || null,
    splashUrl: server.splash_url || null,
    description: server.description || null,
    vanitySlug: server.vanity_slug || null,
    verificationLevel: server.verification_level || "none",
    isMember: false,
    isOwner: false,
    ...extra,
  };
}

/**
 * GET /servers/invites/:code — public invite preview (auth optional)
 */
router.get("/invites/:code", optionalAuth, async (req, res) => {
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
      // Soft expire (3.7.32): the row stays; lib/serverInviteCleanup prunes it later.
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

    const viewerId = req.user?.id || null;
    const membership = viewerId ? await getMembership(server.id, viewerId) : null;
    const banned = viewerId && !membership ? await isViewerBanned(server.id, viewerId) : false;
    const extras = await invitePreviewExtras(supabase, {
      serverId: server.id,
      creatorId: invite.creator_id || null,
      presence: livePresence,
      io: req.app.get("io"),
    });

    if (!viewerId) {
      const inv = publicInvite(invite, req);
      return res.json({
        invite: { code: inv.code, url: inv.url, expiresAt: inv.expiresAt, inviter: extras.inviter },
        server: anonymousServerPreview(server, { onlineCount: extras.onlineCount, memberCount: count || 1 }),
      });
    }

    return res.json({
      invite: { ...publicInvite(invite, req), inviter: extras.inviter },
      server: publicServer(server, {
        onlineCount: extras.onlineCount,
        memberCount: count || 1,
        isMember: Boolean(membership),
        isOwner: server.owner_id === viewerId,
        banned,
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
      // Soft expire (3.7.32): the row stays; lib/serverInviteCleanup prunes it later.
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
    if (existing) return res.json(withInviteChannel(await alreadyMemberPayload(invite.server_id, userId, existing), invite));

    // "*": invites_paused_at only exists once its migration ran.
    const { data: inviteServer, error: inviteServerErr } = await supabase
      .from("servers")
      .select("*")
      .eq("id", invite.server_id)
      .maybeSingle();
    if (inviteServerErr) throw inviteServerErr;
    if (joinsPaused(inviteServer)) return joinsPausedRefusal(res);
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
      if (joined.alreadyMember) return res.json(withInviteChannel(await alreadyMemberPayload(invite.server_id, userId), invite));
      return joinRefusal(res, joined);
    }

    await writeAudit({
      serverId: invite.server_id,
      actorId: userId,
      action: "MEMBER_JOIN",
      targetType: "member",
      targetId: userId,
      changes: { via: "invite", code },
    });
    // A fresh account that came in through this invite (Kayıt İstatistikleri).
    void recordJoinedViaInvite(userId, `server:${code}`);

    const { bundle, myPermissions } = await afterMemberJoined(
      req,
      null,
      userId,
      invite.server_id
    );
    const channels = await publicVisibleChannels(invite.server_id, userId, bundle.channels);

    return res.status(201).json({
      alreadyMember: false,
      channelId: inviteLandingChannelId(invite, channels),
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to join server.", code: err.code });
  }
});

/**
 * GET /servers/vanity/:slug — vanity URL preview (must be registered before /:id)
 */
router.get("/vanity/:slug", optionalAuth, async (req, res) => {
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

    const viewerId = req.user?.id || null;
    const membership = viewerId ? await getMembership(server.id, viewerId) : null;
    const banned = viewerId && !membership ? await isViewerBanned(server.id, viewerId) : false;
    const extras = await invitePreviewExtras(supabase, { serverId: server.id, presence: livePresence, io: req.app.get("io") });

    if (!viewerId) {
      return res.json({
        vanity: { slug, url: publicVanityUrl(req, slug) },
        server: anonymousServerPreview(server, { onlineCount: extras.onlineCount, memberCount: count || 1 }),
      });
    }

    return res.json({
      vanity: { slug, url: publicVanityUrl(req, slug) },
      server: publicServer(server, {
        onlineCount: extras.onlineCount,
        memberCount: count || 1,
        isMember: Boolean(membership),
        isOwner: server.owner_id === viewerId,
        banned,
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
    if (joinsPaused(server)) return joinsPausedRefusal(res);

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
    void recordJoinedViaInvite(userId, `vanity:${slug}`);
    // Public server page (descall.com/s/<slug>, migration 20261124u): a join that started
    // on the page counts for the owner's results, per traffic source.
    if (req.body?.via === "page") {
      try {
        const pp = require("../lib/serverPublicPage");
        require("../lib/publicPageStatsInstance").getPublicPageStats().add(server.id, pp.classifySource("", req.body?.src), "joins", 1);
      } catch (statErr) {
        console.warn("[SERVERS] public page join not counted:", statErr?.message || statErr);
      }
    }

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to join server.", code: err.code });
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
    // Hidden by Descall moderation (or its owner is banned / deleted): not joinable from
    // the in-app list either (IM-10).
    if (!server || !server.is_public || server.directory_hidden_at || !(await ownerAvailable(server.owner_id))) {
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
    if (joinsPaused(server)) return joinsPausedRefusal(res);

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
      server: redactRefsForViewer(publicServer(bundle.server, {
        isOwner: sameId(bundle.server.owner_id, req.user.id),
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
      }), visibleChannels),
    });
  } catch (err) {
    console.error("[SERVERS] GET /:id error:", err);
    return res.status(500).json({ error: "Failed to load server." });
  }
});

/**
 * Irreversible owner actions need the account password, like ownership transfer (M8 /
 * IM-14: deleting a server only needed its public name). Accounts without a password
 * (Google / Apple sign-in) pass. Same rate limit as transfer. Returns true when a
 * response was already sent.
 */
const OWNER_CONFIRM_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
async function rejectOwnerPassword(req, res, actorId) {
  const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
  const limitKey = `server-transfer:user:${actorId}`;
  if (rejectIfLimited(res, [peek(limitKey, OWNER_CONFIRM_LIMIT)])) return true;
  const { data: me, error } = await supabase.from("users").select("id, password_hash").eq("id", actorId).maybeSingle();
  if (error) throw error;
  if (!me?.password_hash) return false;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const ok = password ? await require("bcryptjs").compare(password, me.password_hash) : false;
  if (ok) return false;
  if (rejectIfLimited(res, [recordFailure(limitKey, OWNER_CONFIRM_LIMIT)])) return true;
  res.status(403).json(apiError("Password is incorrect.", null, { code: "PASSWORD_REQUIRED" }));
  return true;
}

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
    if (!sameId(server.owner_id, req.user.id)) {
      return res.status(403).json({ error: "Only the owner can delete this server." });
    }
    if (!confirmName || confirmName.toLowerCase() !== String(server.name).toLowerCase()) {
      return res.status(400).json({
        error: "Type the server name to confirm deletion.",
        code: "CONFIRM_NAME_REQUIRED",
      });
    }
    if (await rejectOwnerPassword(req, res, req.user.id)) return;

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
        titleKey: "bot.notify.serverOwnerTitle",
        bodyKey: "bot.notify.serverOwnerBody",
        // {serverNameGen}: Turkish genitive ("Tango'nun"), used by the Turkish text only.
        vars: { serverName: serverName || { key: "bot.notify.serverFallback" }, serverNameGen: trGenitive(serverName || "Sunucu") },
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to load.", code: err.code });
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
    const targetId = canonId(String(req.body?.userId || "").trim());
    const confirmName = cleanName(req.body?.confirmName);
    const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
    const limitKey = `server-transfer:user:${actorId}`;
    const LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
    if (rejectIfLimited(res, [peek(limitKey, LIMIT)])) return;

    const { server } = await requireServerOwner(serverId, actorId);
    if (!targetId) return res.status(400).json({ error: "Choose the new owner.", code: "TARGET_REQUIRED" });
    if (sameId(targetId, actorId)) {
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
    // getMembership now reads `temporary` (it was never selected, so a guest could be
    // made owner and then dropped by the temporary-member cleanup, IM-3).
    if (!target || target.temporary) {
      return res.status(400).json({ error: "The new owner must be a member of this server.", code: "TARGET_NOT_MEMBER" });
    }
    // No ownership for an account that is banned from Descall or being deleted (M11).
    {
      const owners = await loadOwnerStates([targetId]);
      const t = owners.get(String(targetId));
      if (!ownerStateOk(t) || t?.deletion_requested_at) {
        return res.status(400).json(apiError("This account cannot own a server right now.", null, { code: "TARGET_UNAVAILABLE" }));
      }
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
        ...apiError("That member already owns {max} servers.", { max: MAX_OWNED_SERVERS }),
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

    // The new owner starts unrestricted: a running timeout would lock them out of their
    // own server's chat for up to 28 days (M6).
    if (target.timeout_until) {
      await supabase
        .from("server_members")
        .update({ timeout_until: null, timeout_reason: null, timed_out_by: null })
        .eq("server_id", serverId)
        .eq("user_id", targetId);
    }
    await memberState.clearTimeoutRecord(serverId, targetId);

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to transfer ownership.", code: err.code });
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

    if (sameId(server.owner_id, userId)) {
      if (!confirmName || confirmName.toLowerCase() !== String(server.name).toLowerCase()) {
        return res.status(400).json({
          error: "Owner leave deletes the server. Type the server name to confirm.",
          code: "CONFIRM_NAME_REQUIRED",
          deletesServer: true,
        });
      }
      if (await rejectOwnerPassword(req, res, userId)) return;
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

    // Clean member role assignments and member channel overrides (DF-1/DF-2). A running
    // timeout stays in server_member_timeouts and comes back on rejoin (M3).
    await memberState.purgeMemberState(serverId, userId);

    await writeAudit({
      serverId,
      actorId: userId,
      action: "MEMBER_LEAVE",
      targetType: "member",
      targetId: userId,
    });
    await evictLeavingMember(req, serverId, userId);
    void memberState.callVoice("evictFromServerVoice", getIo(req), { serverId, userId, reason: "left" });
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

    // Every member, paged past PostgREST's 1000-row cap (the list was silently cut, IM-9).
    const members = [];
    for (let from = 0; from < maxServerMembers() + 1000; from += 1000) {
      const { data: page, error } = await supabase
        .from("server_members")
        .select("user_id, nickname, joined_at, list_position, timeout_until, timeout_reason, timed_out_by")
        .eq("server_id", serverId)
        .order("joined_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      members.push(...(page || []));
      if (!page || page.length < 1000) break;
    }

    // Timeout notes and the moderator who wrote them are for moderators only (IM-5).
    const viewer = await resolveMemberPermissions(supabase, serverId, req.user.id);
    const seesModNotes =
      viewer.isOwner ||
      hasPermission(viewer.bits, Permissions.MODERATE_MEMBERS) ||
      hasPermission(viewer.bits, Permissions.VIEW_AUDIT_LOG);

    const userIds = members.map((m) => m.user_id);
    const users = userIds.length
      ? await selectAllIn(supabase, "users", "id, username, display_name, avatar_url, equipped_country_id, equipped_avatar_frame_id, equipped_badge_id", (q) => q, "id", userIds)
      : [];

    // One flag per member (2.13.0): a single lookup for every equipped country.
    const countryIds = [...new Set((users || []).map((u) => u.equipped_country_id).filter(Boolean))];
    const countryById = new Map();
    if (countryIds.length) {
      const { data: flags } = await supabase
        .from("shop_items")
        .select("id, name, category, badge_icon, country_code")
        .in("id", countryIds);
      for (const flag of flags || []) {
        if (flag.category === "countries") countryById.set(flag.id, flag);
      }
    }

    // Market 2.0 avatar frame + profile badge every member wears (s2- rows only, lean records
    // with a cacheable image path): one lookup over the distinct items.
    const shop2Ids = [...new Set((users || []).flatMap((u) => [u.equipped_avatar_frame_id, u.equipped_badge_id]).filter(Boolean))];
    const shop2ById = new Map();
    if (shop2Ids.length) {
      const shopLib = require("../lib/shop");
      const { data: rows } = await supabase.from("shop_items").select("id, sku, category, rarity, name, asset_url").in("id", shop2Ids);
      for (const row of rows || []) {
        const lean = shopLib.leanShop2Cosmetic(row);
        if (lean) shop2ById.set(row.id, lean);
      }
    }
    const shop2Of = (id, category) => {
      const it = id ? shop2ById.get(id) : null;
      return it && it.category === category ? it : null;
    };

    // Special badge worn next to the flag (one lookup; empty before its migration).
    const [specialByUser, premiumByUser] = await Promise.all([
      require("../lib/specialBadges").equippedForUsers(userIds).catch(() => new Map()),
      // Descall+ / Ultra badges: one batched premium_active_for lookup, cached for a minute.
      require("../lib/premium/badges").plansFor(userIds).catch(() => new Map()),
    ]);

    const { data: server } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", serverId)
      .maybeSingle();

    const memberRoles = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: mrErr } = await supabase
        .from("server_member_roles")
        .select("user_id, role_id")
        .eq("server_id", serverId)
        .order("user_id", { ascending: true })
        .range(from, from + 999);
      if (mrErr) throw mrErr;
      memberRoles.push(...(page || []));
      if (!page || page.length < 1000) break;
    }

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
    const list = members.map((m) => {
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
        equippedCountry: countryById.get(u.equipped_country_id) || null,
        equippedSpecialBadge: specialByUser.get(m.user_id) || null,
        equippedAvatarFrame: shop2Of(u.equipped_avatar_frame_id, "avatar_frame"),
        equippedBadge: shop2Of(u.equipped_badge_id, "profile_badge"),
        premium_plan: premiumByUser.get(String(m.user_id)) ?? null,
        nickname: m.nickname || null,
        joinedAt: m.joined_at,
        timeoutUntil: m.timeout_until || null,
        timeoutReason: seesModNotes || sameId(m.user_id, req.user.id) ? m.timeout_reason || null : null,
        timedOutBy: seesModNotes ? m.timed_out_by || null : null,
        isOwner: sameId(server?.owner_id, m.user_id),
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

// ---------------------------------------------------------------- role helpers

const ROLE_POSITION_MAX = 10000;
const ROLE_ROUTE_LIMIT = { windowMs: 60 * 1000, max: 60 };
const PG_BIGINT_LIMIT = 1n << 63n;

/** Role edits are cheap to send and expensive to apply (access re-check per channel, R5). */
function rejectRoleRate(req, res) {
  const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
  return rejectIfLimited(res, [recordFailure(`server-roles:user:${req.user.id}`, ROLE_ROUTE_LIMIT)]);
}

/**
 * Role names: zero-width / control characters stripped, and nothing that reads as a
 * mass mention (@everyone / @here, R6). Returns { name } or { error }.
 */
function validateRoleName(raw) {
  const name = cleanName(
    String(raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
  );
  if (name.length < ROLE_NAME_MIN || name.length > ROLE_NAME_MAX) {
    return { error: apiError("Role name must be {min}–{max} characters.", { min: ROLE_NAME_MIN, max: ROLE_NAME_MAX }) };
  }
  if (/^@?(everyone|here)$/i.test(name)) {
    return { error: apiError("This role name is reserved.", null, { code: "ROLE_NAME_RESERVED" }) };
  }
  return { name };
}

function clampRolePosition(value) {
  return Math.max(0, Math.min(ROLE_POSITION_MAX, Math.floor(Number(value) || 0)));
}

/** Raw bitfields must fit Postgres bigint and name known bits only (R9). null = invalid. */
function sanitizeRoleBits(bits) {
  if (bits == null) return null;
  if (bits < 0n || bits >= PG_BIGINT_LIMIT) return null;
  return bits & ALL_PERMISSIONS;
}

/**
 * R2: a non-owner, non-ADMINISTRATOR member cannot hand out (or take away) a role that
 * carries a permission they do not have themselves; ADMINISTRATOR through an alt
 * account was the worst case.
 */
function roleExceedsActor(role, actorPerms) {
  if (actorPerms.isOwner || hasPermission(actorPerms.permissions, Permissions.ADMINISTRATOR)) return false;
  const roleBits = fromPgBigint(role.permissions) & EDITABLE_PERMISSION_MASK;
  return (roleBits & ~fromPgBigint(actorPerms.permissions)) !== 0n;
}

function roleExceedsError(res) {
  return res.status(403).json(apiError("This role has permissions you do not have.", null, { code: "ROLE_EXCEEDS_YOUR_PERMISSIONS" }));
}

/**
 * Make room at `position`: every non-@everyone role of the server at or above it moves
 * up one, so the new role never ties with (or jumps over) an existing one. Returns the
 * roles that moved (for live events).
 */
async function shiftRolesUp(serverId, position) {
  const { data: above, error } = await supabase
    .from("server_roles")
    .select("*")
    .eq("server_id", serverId)
    .eq("is_everyone", false)
    .gte("position", position);
  if (error) throw error;
  const moved = [];
  const list = [...(above || [])].sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0));
  for (const r of list) {
    const next = Math.min(ROLE_POSITION_MAX, (Number(r.position) || 0) + 1);
    const { data: upd, error: uErr } = await supabase
      .from("server_roles")
      .update({ position: next })
      .eq("id", r.id)
      .eq("server_id", serverId)
      .select("*")
      .maybeSingle();
    if (uErr) throw uErr;
    moved.push(upd || { ...r, position: next });
  }
  return moved;
}

/** IM-8 / Discord parity: getting a role makes a temporary member permanent. */
async function makeMembershipPermanent(serverId, userId) {
  const { error } = await supabase
    .from("server_members")
    .update({ temporary: false })
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .eq("temporary", true);
  if (error) console.warn("[SERVERS] clear temporary failed:", error.message);
}

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
  let releaseCap = null;
  try {
    const serverId = req.params.id;
    if (rejectRoleRate(req, res)) return;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);

    const checked = validateRoleName(req.body?.name);
    if (checked.error) return res.status(400).json(checked.error);
    const { name } = checked;

    releaseCap = await acquireCapLock(`roles:${serverId}`);
    const { count, error: countErr } = await supabase
      .from("server_roles")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId);
    if (countErr) throw countErr;
    if ((count || 0) >= MAX_ROLES_PER_SERVER) {
      return res.status(400).json({
        ...apiError("Servers can have at most {max} roles.", { max: MAX_ROLES_PER_SERVER }),
        code: "MAX_ROLES",
      });
    }

    // Discord: a new role starts at the bottom, just above @everyone (R1). It used to go
    // above every role, so a "Mod" created after "Admin" outranked it. An explicit
    // position inserts there; the roles at or above it move up one (no ties).
    let position =
      typeof req.body?.position === "number" && Number.isFinite(req.body.position)
        ? Math.max(1, clampRolePosition(req.body.position))
        : 1;
    if (!actorPerms.isOwner) {
      const actorPos = await getMemberHighestPosition(supabase, serverId, req.user.id);
      if (actorPos <= 0) {
        return res.status(403).json({ error: "You need a higher role to create roles.", code: "HIERARCHY" });
      }
      position = Math.max(1, Math.min(position, actorPos));
    }

    const color = clampColor(req.body?.color ?? 0x5865f2);
    const perms = sanitizeRoleBits(parsePermissionsInput(req.body?.permissions));
    if (req.body?.permissions != null && perms == null) {
      return res.status(400).json(apiError("Invalid permissions."));
    }
    const clipped = clipRolePermissions({
      desiredBits: perms != null ? perms : EVERYONE_DEFAULT,
      existingBits: 0n,
      actorBits: actorPerms.permissions,
      isOwner: actorPerms.isOwner,
      isEveryone: false,
    });
    const permissions = toPgBigint(clipped);

    const shifted = await shiftRolesUp(serverId, position);

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
        ...apiError("Servers can have at most {max} roles.", { max: MAX_ROLES_PER_SERVER }),
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
    for (const moved of shifted) emitToServer(req, serverId, "server:role:updated", { role: publicRole(moved) });
    // A new role is assigned to nobody: no access re-check needed (R5).
    const { data: allRoles } = await supabase
      .from("server_roles")
      .select("*")
      .eq("server_id", serverId)
      .order("position", { ascending: false });
    return res.status(201).json({ role: pub, roles: (allRoles || []).map(publicRole) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/roles error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to create role.", code: err.code });
  } finally {
    releaseCap?.();
  }
});

/**
 * PATCH /servers/:id/roles/:roleId
 */
router.patch("/:id/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const roleId = req.params.roleId;
    if (rejectRoleRate(req, res)) return;
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
      const checked = validateRoleName(req.body.name);
      if (checked.error) return res.status(400).json(checked.error);
      patch.name = checked.name;
    }
    if (req.body?.color !== undefined) patch.color = clampColor(req.body.color);
    if (typeof req.body?.position === "number" && Number.isFinite(req.body.position)) {
      if (existing.is_everyone) {
        return res.status(400).json({ error: "@everyone cannot be reordered.", code: "EVERYONE_LOCKED" });
      }
      patch.position = clampRolePosition(req.body.position);
    }
    if (req.body?.hoist !== undefined) patch.hoist = Boolean(req.body.hoist);
    if (req.body?.mentionable !== undefined) patch.mentionable = Boolean(req.body.mentionable);
    if (req.body?.permissions !== undefined) {
      const perms = sanitizeRoleBits(parsePermissionsInput(req.body.permissions, existing.permissions));
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
    // Name / colour / hoist / mentionable change nobody's access: skip the re-check (R5).
    if (patch.permissions !== undefined || patch.position !== undefined) notifyAccess(req, serverId);
    return res.json({ role: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH /:id/roles/:roleId error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update role.", code: err.code });
  }
});

/**
 * PUT /servers/:id/roles/positions  { roleIds: [top … bottom] }
 * One atomic-as-possible reorder instead of N PATCHes (R10): one validation, one audit
 * row, one access re-check. The owner renumbers freely. Anyone else only permutes the
 * roles below their own highest role among the slots those roles already hold; roles at
 * or above them stay exactly where they are.
 */
router.put("/:id/roles/positions", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    if (rejectRoleRate(req, res)) return;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);
    const raw = Array.isArray(req.body?.roleIds) ? req.body.roleIds.map((x) => canonId(String(x || ""))) : null;
    if (!raw || !raw.length || new Set(raw).size !== raw.length) {
      return res.status(400).json(apiError("Send the full role order.", null, { code: "INVALID_ROLE_ORDER" }));
    }
    const { data: roles, error } = await supabase.from("server_roles").select("*").eq("server_id", serverId);
    if (error) throw error;
    const custom = (roles || []).filter((r) => !r.is_everyone);
    const byId = new Map(custom.map((r) => [String(r.id), r]));
    if (raw.length !== custom.length || raw.some((id) => !byId.has(String(id)))) {
      return res.status(400).json(apiError("Send the full role order.", null, { code: "INVALID_ROLE_ORDER" }));
    }

    const next = new Map();
    if (actorPerms.isOwner) {
      raw.forEach((id, index) => next.set(String(id), raw.length - index));
    } else {
      const actorPos = await getMemberHighestPosition(supabase, serverId, req.user.id);
      const movable = raw.filter((id) => (Number(byId.get(String(id)).position) || 0) < actorPos);
      const slots = movable
        .map((id) => Number(byId.get(String(id)).position) || 0)
        .sort((a, b) => b - a);
      movable.forEach((id, i) => next.set(String(id), slots[i]));
    }

    const changed = [];
    for (const [id, position] of next) {
      const role = byId.get(id);
      if ((Number(role.position) || 0) === position) continue;
      const { data: upd, error: uErr } = await supabase
        .from("server_roles")
        .update({ position })
        .eq("id", id)
        .eq("server_id", serverId)
        .select("*")
        .maybeSingle();
      if (uErr) throw uErr;
      changed.push(upd || { ...role, position });
    }

    if (changed.length) {
      await writeAudit({
        serverId,
        actorId: req.user.id,
        action: "ROLE_REORDER",
        targetType: "server",
        targetId: serverId,
        changes: { positions: Object.fromEntries(changed.map((r) => [r.id, r.position])) },
      });
      for (const r of changed) emitToServer(req, serverId, "server:role:updated", { role: publicRole(r) });
      notifyAccess(req, serverId);
    }
    const { data: after } = await supabase
      .from("server_roles")
      .select("*")
      .eq("server_id", serverId)
      .order("position", { ascending: false });
    return res.json({ roles: (after || []).map(publicRole), changed: changed.length });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT role positions error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to reorder roles.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/roles/:roleId — @everyone protected
 */
router.delete("/:id/roles/:roleId", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const roleId = req.params.roleId;
    if (rejectRoleRate(req, res)) return;
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
    // Its channel overrides go too (no FK on target_id): they were left as orphans that
    // kept a channel "unsynced" from its category (R7).
    try {
      const { data: chans } = await supabase.from("server_channels").select("id").eq("server_id", serverId);
      const chanIds = (chans || []).map((c) => c.id);
      for (let i = 0; i < chanIds.length; i += 100) {
        await supabase
          .from("server_channel_overrides")
          .delete()
          .eq("target_type", "role")
          .eq("target_id", roleId)
          .in("channel_id", chanIds.slice(i, i + 100));
      }
    } catch (err) {
      console.warn("[SERVERS] role override cleanup failed:", err?.message || err);
    }

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to delete role.", code: err.code });
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
    if (rejectRoleRate(req, res)) return;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);
    const isSelf = sameId(userId, req.user.id);

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
    // Role below the actor's highest, and no permission the actor lacks (R2).
    await assertCanManageRole(supabase, serverId, req.user.id, role);
    if (roleExceedsActor(role, actorPerms)) return roleExceedsError(res);
    // Self: allowed under the two rules above (owner wears a colour role, R8); others
    // must be below the actor.
    if (!isSelf) await assertHierarchy(supabase, serverId, req.user.id, userId);

    const { error } = await supabase.from("server_member_roles").upsert(
      { server_id: serverId, user_id: userId, role_id: roleId },
      { onConflict: "server_id,user_id,role_id" }
    );
    if (error) throw error;
    if (targetMembership.temporary) await makeMembershipPermanent(serverId, userId);

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to assign role.", code: err.code });
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
    if (rejectRoleRate(req, res)) return;
    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_ROLES);
    const isSelf = sameId(userId, req.user.id);

    const { data: role } = await supabase
      .from("server_roles")
      .select("id, name, is_everyone, position, permissions")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (!role) return res.status(404).json({ error: "Role not found." });
    if (role.is_everyone) {
      return res.status(400).json({ error: "@everyone cannot be removed." });
    }
    await assertCanManageRole(supabase, serverId, req.user.id, role);
    // Symmetric with assign (R2): a role holding bits the actor lacks is not theirs to take.
    if (roleExceedsActor(role, actorPerms)) return roleExceedsError(res);
    if (isSelf) {
      const own = await getMembership(serverId, userId);
      if (!own) return res.status(404).json(apiError("Member not found in this server."));
    } else {
      await assertHierarchy(supabase, serverId, req.user.id, userId);
    }

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to remove role.", code: err.code });
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

    if (sameId(targetUserId, req.user.id)) {
      return res.status(400).json({ error: "Use leave to remove yourself.", code: "USE_LEAVE" });
    }
    if (sameId(server.owner_id, targetUserId)) {
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

    // Role rows and member channel overrides go too (they came back on rejoin, DF-1/DF-2).
    await memberState.purgeMemberState(serverId, targetUserId);

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
    });

    return res.json({ message: "Member kicked.", userId: targetUserId, serverId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE member kick error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to kick member.", code: err.code });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update nickname.", code: err.code });
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

    if (sameId(targetUserId, req.user.id)) {
      return res.status(400).json({ error: "You cannot timeout yourself.", code: "CANNOT_TIMEOUT_SELF" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }

    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 512) : null;
    // Audit row, live update, voice eviction and the persisted copy (survives leave +
    // rejoin) are all done by applyServerTimeout.
    const timeout = await applyServerTimeout({
      serverId,
      actorId: req.user.id,
      targetUserId,
      until: req.body?.until,
      durationSeconds: req.body?.durationSeconds,
      reason,
      io: getIo(req),
    });

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to timeout member.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/members/:userId/timeout — clear active timeout.
 */
router.delete("/:id/members/:userId/timeout", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const targetUserId = req.params.userId;
    const { isOwner } = await requireServerPermission(serverId, req.user.id, Permissions.MODERATE_MEMBERS);

    const isSelf = sameId(targetUserId, req.user.id);
    // Only the owner may lift their own timeout (one put on them before the server was
    // theirs, M6); everyone else needs another moderator.
    if (isSelf && !isOwner) {
      return res.status(400).json({ error: "You cannot remove your own timeout.", code: "CANNOT_TIMEOUT_SELF" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in this server." });
    }

    await clearServerTimeout({ serverId, actorId: req.user.id, targetUserId, io: getIo(req), allowSelfOwner: isSelf && isOwner });

    return res.json({ message: "Timeout removed.", userId: targetUserId, serverId });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] DELETE timeout error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to remove timeout.", code: err.code });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update settings." });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to accept rules." });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to list bans.", code: err.code });
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

    if (sameId(targetUserId, req.user.id)) {
      return res.status(400).json({ error: "You cannot ban yourself.", code: "CANNOT_BAN_SELF" });
    }
    if (sameId(server.owner_id, targetUserId)) {
      return res.status(403).json({ error: "Cannot ban the server owner.", code: "CANNOT_BAN_OWNER" });
    }
    const targetMembership = await getMembership(serverId, targetUserId);
    if (targetMembership) {
      await assertHierarchy(supabase, serverId, req.user.id, targetUserId);
    } else {
      // A non-member ban needs a real account: an unknown or malformed id was a 500 (M9).
      const { data: targetUser, error: tuErr } = await supabase
        .from("users")
        .select("id")
        .eq("id", targetUserId)
        .maybeSingle();
      if (tuErr && String(tuErr.code) !== "22P02") throw tuErr;
      if (!targetUser) return res.status(404).json(apiError("User not found.", null, { code: "USER_NOT_FOUND" }));
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
    await memberState.purgeMemberState(serverId, targetUserId);

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
      wasMember: Boolean(targetMembership),
    });

    return res.json({ message: "Member banned.", userId: targetUserId, serverId, reason });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PUT ban error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to ban member.", code: err.code });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to unban member.", code: err.code });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to load audit log.", code: err.code });
  }
});

/**
 * POST /servers/:id/channels
 * Create text | voice | category. Owner or MANAGE_CHANNELS.
 */
router.post("/:id/channels", requireAuth, async (req, res) => {
  let releaseCap = null;
  try {
    const serverId = req.params.id;
    const type = String(req.body?.type || "text").toLowerCase();
    if (!CHANNEL_TYPES.has(type)) {
      return res.status(400).json({
        error: "Channel type must be text, voice, stage, category, or announcement.",
      });
    }

    const actorPerms = await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_CHANNELS);
    // "Private" is part of the create (P3 / CA-3): the channel used to be created public,
    // announced to every member, and locked by two later calls, the second of which a
    // non-admin creator was never allowed to make (they locked themselves out).
    const makePrivate = req.body?.private === true || req.body?.private === "true";
    const actorUnrestricted = actorPerms.isOwner || hasPermission(actorPerms.permissions, Permissions.ADMINISTRATOR);
    if (makePrivate && !actorUnrestricted && !hasPermission(actorPerms.permissions, Permissions.MANAGE_ROLES)) {
      return res.status(403).json(
        apiError("A private channel needs the Manage Roles permission.", null, { code: "MISSING_PERMISSION", permission: "MANAGE_ROLES" })
      );
    }

    const name = cleanChannelName(req.body?.name, type);
    if (name.length < CHANNEL_NAME_MIN) {
      return res.status(400).json({
        ...apiError("Channel name must be {min}–{max} characters.", { min: CHANNEL_NAME_MIN, max: CHANNEL_NAME_MAX }),
      });
    }

    releaseCap = await acquireCapLock(`channels:${serverId}`);
    const { count, error: countErr } = await supabase
      .from("server_channels")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId);
    if (countErr) throw countErr;
    if ((count || 0) >= MAX_CHANNELS_PER_SERVER) {
      return res.status(400).json({
        ...apiError("Servers can have at most {max} channels.", { max: MAX_CHANNELS_PER_SERVER }),
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
    const isVoiceLike = type === "voice" || type === "stage";
    const userLimit = isVoiceLike ? parseUserLimit(req.body?.userLimit) : undefined;
    if (userLimit === null) {
      return res.status(400).json({ ...apiError("User limit must be between {min} and {max}.", { min: 0, max: 99 }), code: "INVALID_USER_LIMIT" });
    }

    const row = {
      server_id: serverId,
      name,
      type,
      topic,
      position,
      parent_id: type === "category" ? null : parentId,
      slowmode_seconds: slowmodeSeconds,
      nsfw,
      ...(userLimit ? { user_limit: userLimit } : {}),
    };
    let { data: channel, error } = await supabase.from("server_channels").insert(row).select("*").single();
    if (error && row.user_limit !== undefined && isMissingColumn(error, "user_limit")) {
      // Before the voice migration: create the channel without a limit.
      delete row.user_limit;
      ({ data: channel, error } = await supabase.from("server_channels").insert(row).select("*").single());
    }
    if (error) throw error;
    if (await insertedOverCap("server_channels", "server_id", serverId, channel.id, MAX_CHANNELS_PER_SERVER)) {
      await supabase.from("server_channels").delete().eq("id", channel.id);
      return res.status(400).json({
        ...apiError("Servers can have at most {max} channels.", { max: MAX_CHANNELS_PER_SERVER }),
        code: "MAX_CHANNELS",
      });
    }

    if (makePrivate) {
      // Written before anyone hears about the channel. If it fails the channel goes too,
      // so a "private" channel can never end up public.
      try {
        await writePrivateChannelRules(serverId, channel, req.user.id, actorUnrestricted);
      } catch (privErr) {
        await supabase.from("server_channel_overrides").delete().eq("channel_id", channel.id);
        await supabase.from("server_channels").delete().eq("id", channel.id).eq("server_id", serverId);
        throw privErr;
      }
    }

    await writeAudit({
      serverId,
      actorId: req.user.id,
      action: "CHANNEL_CREATE",
      targetType: "channel",
      targetId: channel.id,
      changes: { name, type, parentId: channel.parent_id, private: makePrivate || undefined },
    });

    const pub = publicChannel(channel);
    await emitChannelToViewers(req, serverId, "server:channel:created", channel);
    return res.status(201).json({ channel: pub });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] POST /:id/channels error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to create channel.", code: err.code });
  } finally {
    releaseCap?.();
  }
});

/**
 * Private channel rules for a brand-new channel: @everyone may not view (nor connect to
 * a voice / stage channel), and a creator who is not owner / administrator keeps access
 * through their own member rule. A new channel inside a category starts from the
 * category's rules, so it never loses what the category already allowed.
 */
async function writePrivateChannelRules(serverId, channel, actorId, actorUnrestricted) {
  const { data: everyone, error: eErr } = await supabase
    .from("server_roles")
    .select("id")
    .eq("server_id", serverId)
    .eq("is_everyone", true)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!everyone) throw new Error("Failed to create channel.");
  const isVoice = channel.type === "voice" || channel.type === "stage";
  const hide = Permissions.VIEW_CHANNEL | (isVoice ? Permissions.CONNECT : 0n);

  // Start from the category's rules (the synced view the channel would have had).
  const rows = new Map();
  if (channel.parent_id) {
    const { data: parentRows } = await supabase
      .from("server_channel_overrides")
      .select("target_type, target_id, allow_permissions, deny_permissions")
      .eq("channel_id", channel.parent_id);
    for (const r of parentRows || []) {
      rows.set(`${r.target_type}:${r.target_id}`, {
        target_type: r.target_type,
        target_id: r.target_id,
        allow: fromPgBigint(r.allow_permissions),
        deny: fromPgBigint(r.deny_permissions),
      });
    }
  }
  const put = (type, id, allow, deny) => {
    const key = `${type}:${id}`;
    const cur = rows.get(key) || { target_type: type, target_id: id, allow: 0n, deny: 0n };
    cur.allow = (cur.allow | allow) & ~deny;
    cur.deny = (cur.deny | deny) & ~allow;
    rows.set(key, cur);
  };
  put("role", everyone.id, 0n, hide);
  if (!actorUnrestricted) put("member", actorId, hide, 0n);

  const payload = [...rows.values()].map((r) => ({
    channel_id: channel.id,
    target_type: r.target_type,
    target_id: r.target_id,
    allow_permissions: toPgBigint(r.allow),
    deny_permissions: toPgBigint(r.deny),
  }));
  const { error } = await supabase.from("server_channel_overrides").insert(payload);
  if (error) throw error;
}

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
    let syncInfo = null;
    if (req.body?.parentId !== undefined) {
      const parentId = req.body.parentId ? canonId(String(req.body.parentId)) : null;
      await assertValidParent(serverId, parentId, existing.type);
      patch.parent_id = existing.type === "category" ? null : parentId;
      if (patch.parent_id && String(patch.parent_id) !== String(existing.parent_id || "")) {
        await assertParentVisible(serverId, req.user.id, patch.parent_id);
        await assertInheritChangeAllowed(serverId, req.user.id, existing, patch.parent_id);
        // A channel with rules of its own keeps them inside the new category. Say so, and
        // sync on request (lockPermissions), like Discord (P8): it used to stay public
        // inside a private category without a word.
        syncInfo = await planCategorySync(serverId, req.user.id, existing, patch.parent_id, req.body?.lockPermissions === true);
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

    if (req.body?.userLimit !== undefined && (existing.type === "voice" || existing.type === "stage")) {
      const limit = parseUserLimit(req.body.userLimit);
      if (limit === null) {
        return res.status(400).json({ ...apiError("User limit must be between {min} and {max}.", { min: 0, max: 99 }), code: "INVALID_USER_LIMIT" });
      }
      patch.user_limit = limit;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    if (detachPlan) await applyDetachPlan(detachPlan);
    const prevParentId = existing.parent_id || null;
    if (syncInfo?.sync) {
      // Follow the new category: drop the channel's own rules.
      const { error: syncErr } = await supabase.from("server_channel_overrides").delete().eq("channel_id", existing.id);
      if (syncErr) throw syncErr;
    }

    let { data: channel, error } = await supabase
      .from("server_channels")
      .update(patch)
      .eq("id", channelId)
      .eq("server_id", serverId)
      .select("*")
      .single();
    if (error && patch.user_limit !== undefined && isMissingColumn(error, "user_limit")) {
      if (Object.keys(patch).length === 1) {
        return res.status(503).json(apiError("User limits are not available yet.", null, { code: "USER_LIMIT_UNAVAILABLE" }));
      }
      delete patch.user_limit;
      ({ data: channel, error } = await supabase
        .from("server_channels")
        .update(patch)
        .eq("id", channelId)
        .eq("server_id", serverId)
        .select("*")
        .single());
    }
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
    if (syncInfo?.sync) notifyAccess(req, serverId, { channelId });
    return res.json({
      channel: pub,
      ...(syncInfo ? { permissionsSynced: Boolean(syncInfo.sync), needsSyncChoice: Boolean(syncInfo.needsChoice) } : {}),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] PATCH /:id/channels/:channelId error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update channel.", code: err.code });
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
 * Moving a channel that has its own rules into a category whose rules differ: either
 * sync now (lockPermissions, same check as inheriting) or tell the client a choice is
 * open. Returns { sync, needsChoice } or null when nothing applies.
 */
async function planCategorySync(serverId, actorId, channel, newParentId, lockPermissions) {
  const { data: rows, error } = await supabase
    .from("server_channel_overrides")
    .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
    .in("channel_id", [channel.id, newParentId]);
  if (error) throw error;
  const own = (rows || []).filter((r) => String(r.channel_id) === String(channel.id));
  const parentRows = (rows || []).filter((r) => String(r.channel_id) === String(newParentId));
  if (!own.length) return null;
  if (!lockPermissions) return { sync: false, needsChoice: parentRows.length > 0 };
  // Dropping the channel's own rules is an override delete: same rules as DELETE.
  const { actorBits, unrestricted } = await assertOverrideEditor(serverId, actorId, channel);
  if (!unrestricted) {
    for (const r of own) {
      await assertOverrideEditor(serverId, actorId, channel, { type: r.target_type, id: r.target_id }, { allowGoneMember: true });
      const bits = fromPgBigint(r.allow_permissions) | fromPgBigint(r.deny_permissions);
      if (bits & ~fromPgBigint(actorBits)) {
        const err = new Error("This override contains permissions you do not have.");
        err.status = 403;
        err.code = "OVERRIDE_PERMISSION";
        throw err;
      }
    }
  }
  await assertCanAdoptCategoryRules(serverId, actorId, newParentId, parentRows);
  return { sync: true, needsChoice: false };
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
  await assertCanAdoptCategoryRules(serverId, actorId, newParentId, newRows);
}

/**
 * The actor may make a channel follow these category rules: MANAGE_ROLES, and for a
 * non-owner / non-admin every rule must be one they could have written themselves.
 */
async function assertCanAdoptCategoryRules(serverId, actorId, categoryId, newRows) {
  if (!newRows.length) return;
  const { data: category } = await supabase
    .from("server_channels")
    .select("id, server_id, type")
    .eq("id", categoryId)
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
/**
 * GET /servers/:id/channels/:channelId/message-count
 * Message count for the delete-channel confirmation ("Kanaldaki 214 mesaj…").
 * Same gate as deleting the channel.
 */
router.get("/:id/channels/:channelId/message-count", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const channelId = req.params.channelId;
    await requireServerPermission(serverId, req.user.id, Permissions.MANAGE_CHANNELS);
    const { data: existing, error: findErr } = await supabase
      .from("server_channels")
      .select("id, type")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: "Channel not found." });
    await assertChannelManageable(serverId, req.user.id, existing.id);
    if (existing.type === "category" || existing.type === "voice" || existing.type === "stage") {
      return res.json({ channelId, messageCount: 0 });
    }
    const { count, error } = await supabase
      .from("server_messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .eq("server_id", serverId);
    if (error) throw error;
    return res.json({ channelId, messageCount: Number(count) || 0 });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] message-count error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to count messages.", code: err.code });
  }
});

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

    // Setting columns that pointed here are cleared (no FK on three of them): a dangling
    // AFK id stopped the AFK scanner and welcome posts went to a dead channel (SC-5).
    for (const column of ["afk_channel_id", "system_channel_id", "welcome_channel_id", "rules_channel_id"]) {
      const { error: refErr } = await supabase
        .from("servers")
        .update({ [column]: null })
        .eq("id", serverId)
        .eq(column, channelId);
      if (refErr) console.warn(`[SERVERS] ${column} cleanup failed:`, refErr.message);
    }

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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to delete channel.", code: err.code });
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
async function assertOverrideEditor(serverId, actorId, channel, target = null, { allowGoneMember = false } = {}) {
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
        // The owner / an administrator can always clear a rule left behind by someone
        // who is gone (rows from before 2026-11-15 survived kicks and leaves, DF-1).
        if (allowGoneMember && unrestricted) return { actorBits: chPerms.bits, unrestricted };
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
 * Removing a channel's last own rule makes it follow its category again (Discord
 * "synced"). That changes who can do what, like moving it into the category, so the
 * same check applies, and the answer says so (SC-7 / P8). Returns true when the
 * channel re-syncs.
 */
async function checkResyncOnLastRule(serverId, actorId, channel, targetType, targetId) {
  if (!channel?.parent_id) return false;
  const { data: rows, error } = await supabase
    .from("server_channel_overrides")
    .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
    .in("channel_id", [channel.id, channel.parent_id]);
  if (error) throw error;
  const own = (rows || []).filter((r) => String(r.channel_id) === String(channel.id));
  const othersLeft = own.some((r) => !(r.target_type === targetType && sameId(r.target_id, targetId)));
  if (othersLeft || !own.length) return false;
  const parentRows = (rows || []).filter((r) => String(r.channel_id) === String(channel.parent_id));
  if (!parentRows.length) return false;
  await assertCanAdoptCategoryRules(serverId, actorId, channel.parent_id, parentRows);
  return true;
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
      .select("id, server_id, type, name, parent_id")
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

    // A channel with no rules of its own follows its category: say so, and send the
    // category's rules read-only so the editor does not show "everything inherits" for
    // a channel that is in fact private (P5).
    let inherited = [];
    const parentId = channel.parent_id || null;
    if (!overrides.length && parentId) {
      const { data: parentRows } = await supabase
        .from("server_channel_overrides")
        .select("*")
        .eq("channel_id", parentId);
      inherited = (parentRows || []).map((row) => ({
        id: row.id,
        channelId: row.channel_id,
        targetType: row.target_type,
        targetId: row.target_id,
        allow: permissionsToFlags(fromPgBigint(row.allow_permissions)),
        deny: permissionsToFlags(fromPgBigint(row.deny_permissions)),
        allowBits: String(fromPgBigint(row.allow_permissions)),
        denyBits: String(fromPgBigint(row.deny_permissions)),
      }));
    }

    return res.json({
      channelId,
      channelType: channel.type,
      editableKeys: CHANNEL_OVERRIDE_KEYS[channel.type] || CHANNEL_OVERRIDE_KEYS.text,
      overrides,
      synced: Boolean(parentId) && !overrides.length,
      parentId,
      inherited,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET overrides error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to load overrides.", code: err.code });
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
    const targetId = canonId(String(req.body?.targetId || "").trim());
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
      const resynced = await checkResyncOnLastRule(serverId, req.user.id, channel, targetType, targetId);
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
      return res.json({ cleared: true, channelId, targetType, targetId, resyncedWithCategory: resynced });
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to save override.", code: err.code });
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
        .select("id, server_id, type, parent_id")
        .eq("id", channelId)
        .eq("server_id", serverId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!channel) return res.status(404).json({ error: "Channel not found." });

      const { actorBits, unrestricted } = await assertOverrideEditor(
        serverId,
        req.user.id,
        channel,
        { type: targetType, id: targetId },
        { allowGoneMember: true }
      );
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

      const resynced = await checkResyncOnLastRule(serverId, req.user.id, channel, targetType, targetId);
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
      return res.json({ deleted: true, resyncedWithCategory: resynced });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[SERVERS] DELETE overrides error:", err);
      return res
        .status(status)
        .json({ ...errorFields(err), error: err.message || "Failed to delete override.", code: err.code });
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
          ...apiError("Server name must be {min}–{max} characters.", { min: NAME_MIN, max: NAME_MAX }),
        });
      }
      patch.name = name;
    }
    const imageChecks = [];
    const imageField = (bodyKey, column) => {
      if (req.body?.[bodyKey] === undefined) return;
      const raw = req.body[bodyKey] ? String(req.body[bodyKey]).trim() : null;
      // An unchanged stored value is kept as is (forms resend it).
      if ((raw || null) === (server[column] || null)) return;
      patch[column] = cleanServerImageUrl(raw, bodyKey);
      if (patch[column]) imageChecks.push(assertServerImageUpload(patch[column], bodyKey));
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
      if (channelId && channelId !== server.rules_channel_id) {
        // Must be a text channel of this server (was stored unchecked before 2026-10-18)
        // that the actor and every member can read: new members read the rules there (SC-11).
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
        await assertSettingChannelVisible(serverId, req.user.id, channelId, { everyone: true });
      }
      patch.rules_channel_id = channelId;
    }
    if (req.body?.rulesText !== undefined) {
      patch.rules_text = req.body.rulesText
        ? String(req.body.rulesText).trim().slice(0, 4000)
        : null;
    }
    imageField("splashUrl", "splash_url");
    await Promise.all(imageChecks);
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
      if (channelId && channelId !== server.afk_channel_id) {
        await assertServerChannelRef(serverId, channelId, ["voice"]);
        // AFK moves people into this channel: it must be one the actor and @everyone can
        // see and join, never a private call (SC-1: a MANAGE_GUILD member pointed AFK at
        // a staff channel and had themselves moved in to listen).
        await assertSettingChannelVisible(serverId, req.user.id, channelId, { everyone: true, connect: true });
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
      if (channelId && channelId !== server.system_channel_id) {
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
        await assertSettingChannelVisible(serverId, req.user.id, channelId, { everyone: false });
      }
      patch.system_channel_id = channelId;
    }
    if (req.body?.welcomeChannelId !== undefined) {
      const channelId = req.body.welcomeChannelId || null;
      if (channelId && channelId !== server.welcome_channel_id) {
        await assertServerChannelRef(serverId, channelId, ["text", "announcement"]);
        // Welcome posts are for new members: they must be able to read it (SC-11).
        await assertSettingChannelVisible(serverId, req.user.id, channelId, { everyone: true });
      }
      patch.welcome_channel_id = channelId;
    }

    // Notification level new members start with (SC-10; there was none).
    if (req.body?.defaultNotificationLevel !== undefined) {
      const level = String(req.body.defaultNotificationLevel || "all").toLowerCase();
      if (!["all", "mentions"].includes(level)) {
        return res.status(400).json(apiError("Invalid notification level.", null, { code: "INVALID_NOTIFICATION_LEVEL" }));
      }
      if (level !== (server.default_notification_level || "all")) patch.default_notification_level = level;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "No changes provided." });
    }

    patch.updated_at = new Date().toISOString();
    let { data: updated, error } = await supabase
      .from("servers")
      .update(patch)
      .eq("id", serverId)
      .select("*")
      .single();
    if (error && patch.default_notification_level !== undefined && isMissingColumn(error, "default_notification_level")) {
      // Before its migration the setting is simply not stored.
      delete patch.default_notification_level;
      ({ data: updated, error } = await supabase.from("servers").update(patch).eq("id", serverId).select("*").single());
    }
    if (error) {
      // Unique index on vanity_slug: two servers claiming the same slug at once.
      if (String(error.code) === "23505") {
        return res.status(409).json({ error: "That vanity URL is already taken.", code: "VANITY_TAKEN" });
      }
      throw error;
    }

    // A new AFK channel changes where idle people get moved: let voice re-check seats.
    if (patch.afk_channel_id !== undefined && patch.afk_channel_id !== server.afk_channel_id) {
      void memberState.callVoice("recheckVoiceAccess", getIo(req), { serverId });
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
        // Setting channels @everyone cannot see are left out of the broadcast (their ids
        // leaked to every member, SC-8); members who can see them refetch.
        await redactHiddenSettingRefs(serverId, pub);
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to update server.", code: err.code });
  }
});

/**
 * POST /servers/:id/invites — create invite (CREATE_INSTANT_INVITE)
 */
router.post("/:id/invites", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const { server: inviteServer } = await requireServerPermission(serverId, req.user.id, Permissions.CREATE_INSTANT_INVITE);
    if (joinsPaused(inviteServer)) return joinsPausedRefusal(res);

    // Rate limit and caps: invites were unlimited for every member (IM-12).
    {
      const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
      if (rejectIfLimited(res, [recordFailure(`server-invite-create:user:${req.user.id}`, INVITE_CREATE_LIMIT)])) return;
      const [{ count: serverLive }, { count: mine }] = await Promise.all([
        supabase.from("server_invites").select("code", { count: "exact", head: true }).eq("server_id", serverId),
        supabase
          .from("server_invites")
          .select("code", { count: "exact", head: true })
          .eq("server_id", serverId)
          .eq("creator_id", req.user.id),
      ]);
      if ((serverLive || 0) >= MAX_INVITES_PER_SERVER || (mine || 0) >= MAX_INVITES_PER_MEMBER) {
        return res.status(400).json({
          ...apiError("Too many invites. Revoke some first (at most {max} per member).", { max: MAX_INVITES_PER_MEMBER }),
          code: "MAX_INVITES",
        });
      }
    }

    // Invalid numbers are a 400, not a silently permanent unlimited invite (IM-11).
    const numOrNull = (v) => (v == null || v === "" ? null : Number(v));
    const usesIn = numOrNull(req.body?.maxUses);
    const ageIn = req.body?.maxAgeSeconds === null ? 0 : numOrNull(req.body?.maxAgeSeconds);
    if ((usesIn != null && (!Number.isFinite(usesIn) || usesIn < 0)) || (ageIn != null && (!Number.isFinite(ageIn) || ageIn < 0))) {
      return res.status(400).json(apiError("Invalid invite settings.", null, { code: "INVALID_INVITE_SETTINGS" }));
    }
    const maxUses = usesIn == null || usesIn === 0 ? null : Math.max(1, Math.min(100000, Math.floor(usesIn)));
    // Default 7 days when no value is given; an explicit 0 / null means "never expires".
    const age =
      ageIn === 0 ? null : ageIn != null ? Math.max(60, Math.min(60 * 60 * 24 * 30, Math.floor(ageIn))) : 60 * 60 * 24 * 7;

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

    // An invite may only point at a channel of this server (was unchecked before 2026-10-18)
    // that the creator can see, and the channel's own CREATE_INSTANT_INVITE rule counts
    // (a channel deny was ignored, IM-7 / P4).
    const inviteChannelId = req.body?.channelId ? canonId(String(req.body.channelId)) : null;
    if (inviteChannelId) {
      await assertServerChannelRef(serverId, inviteChannelId);
      const ch = await resolveChannelPermissions(supabase, serverId, req.user.id, inviteChannelId);
      if (!ch.isMember || ch.channelMissing || !hasPermission(ch.bits, Permissions.VIEW_CHANNEL)) {
        return res.status(400).json(apiError("Channel not found on this server."));
      }
      if (!hasPermission(ch.bits, Permissions.CREATE_INSTANT_INVITE)) {
        return res.status(403).json(apiError("Missing permission.", null, { code: "MISSING_PERMISSION", permission: "CREATE_INSTANT_INVITE" }));
      }
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to create invite.", code: err.code });
  }
});

/**
 * GET /servers/:id/invites — list invites
 */
router.get("/:id/invites", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    // MANAGE_GUILD sees every invite, anyone else their own: a lockdown that takes invite
    // creation away from @everyone used to hide the list from managers too (IM-6).
    await requireServerPermission(serverId, req.user.id, Permissions.VIEW_CHANNEL);
    const canManage = await hasServerPermission(serverId, req.user.id, Permissions.MANAGE_GUILD);

    let query = supabase.from("server_invites").select("*").eq("server_id", serverId);
    if (!canManage) query = query.eq("creator_id", req.user.id);
    const { data: invites, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    // Expired rows are left to lib/serverInviteCleanup (deleting them one by one here
    // made the list request slow on servers with many invites).
    const live = (invites || []).filter((invite) => !isInviteExpired(invite)).map((invite) => publicInvite(invite, req));

    return res.json({ invites: live });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[SERVERS] GET /:id/invites error:", err);
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to list invites.", code: err.code });
  }
});

/**
 * DELETE /servers/:id/invites/:code — revoke invite
 */
router.delete("/:id/invites/:code", requireAuth, async (req, res) => {
  try {
    const serverId = req.params.id;
    const code = String(req.params.code || "").trim();
    // The creator may always revoke their own invite (even after losing the invite
    // permission), MANAGE_GUILD any invite (IM-6). Membership is checked here.
    await requireServerPermission(serverId, req.user.id, Permissions.VIEW_CHANNEL);

    const { data: invite } = await supabase
      .from("server_invites")
      .select("code, server_id, creator_id")
      .eq("code", code)
      .eq("server_id", serverId)
      .maybeSingle();
    if (!invite) return res.status(404).json({ error: "Invite not found." });
    if (
      !sameId(invite.creator_id, req.user.id) &&
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
    return res.status(status).json({ ...errorFields(err), error: err.message || "Failed to revoke invite.", code: err.code });
  }
});

module.exports = router;
// 3.7.33: the Apple Watch servers page (routes/watch.js) reuses the member-filtered list.
module.exports.buildMyServerList = buildMyServerList;
