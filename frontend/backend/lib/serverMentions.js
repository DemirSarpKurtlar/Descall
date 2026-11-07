"use strict";

/**
 * Role, @everyone and @here mentions in server text channels (messaging phase 5).
 *
 * Wire format: a role mention is the token `<@&roleId>` inside the plain
 * message text (the composer shows "@Rol adı" and converts on send).
 * @everyone / @here stay plain words.
 *
 * Who may ping (the server decides; a client never fans out by itself):
 *   - a role: when the role is marked mentionable ("Bahsedilebilir"), or the
 *     sender may manage mentions (server owner, ADMINISTRATOR or MANAGE_ROLES,
 *     the same permission that edits roles). @everyone itself is never a role ping.
 *   - @everyone / @here: senders who may manage mentions, plus roles that the
 *     server gave the MENTION_EVERYONE permission (Discord style, the default
 *     "permission" policy, so templates such as VIP keep working).
 *     SERVER_EVERYONE_PING_POLICY=admins restricts it to owner / admins only.
 *   - @here reaches members who are online right now (not invisible).
 * A role the sender may not ping stays in the text but notifies nobody.
 *
 * Who is notified: members who can see the channel, minus the sender, minus
 * members whose server notification level is "muted" and members who muted
 * the channel. Level "mentions" counts role / @everyone / @here pings.
 *
 * Rate limit: one @everyone / @here message per sender per channel per
 * SERVER_EVERYONE_COOLDOWN_SEC (default 60) on this instance.
 */

const UUID_SRC = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROLE_TOKEN_RE = new RegExp(`<@&(${UUID_SRC})>`, "gi");
// "@everyone" / "@here" as words (not inside an e-mail address or "@@here").
const MASS_RE = /(^|[^\w@])@(everyone|here)(?![\p{L}\p{N}_])/giu;
const MAX_ROLE_PINGS = Math.max(1, Number(process.env.SERVER_MAX_ROLE_PINGS) || 10);

function envPolicy() {
  return String(process.env.SERVER_EVERYONE_PING_POLICY || "permission").trim().toLowerCase() === "admins" ? "admins" : "permission";
}

function cooldownMs() {
  const sec = Number(process.env.SERVER_EVERYONE_COOLDOWN_SEC);
  return (Number.isFinite(sec) && sec >= 0 ? sec : 60) * 1000;
}

/** { roleIds, everyone, here } named in `text` (role ids lower-case, unique, capped). */
function parseServerMentions(text) {
  const raw = String(text || "");
  const roleIds = [];
  for (const m of raw.matchAll(ROLE_TOKEN_RE)) {
    const id = m[1].toLowerCase();
    if (!roleIds.includes(id)) roleIds.push(id);
    if (roleIds.length >= MAX_ROLE_PINGS) break;
  }
  let everyone = false;
  let here = false;
  for (const m of raw.matchAll(MASS_RE)) {
    if (m[2].toLowerCase() === "everyone") everyone = true;
    else here = true;
  }
  return { roleIds, everyone, here };
}

function perms() {
  return require("./serverPermissions");
}

/** Owner, ADMINISTRATOR or MANAGE_ROLES (`resolved` = { bits, isOwner }). */
function canManageMentions(resolved) {
  if (!resolved) return false;
  if (resolved.isOwner) return true;
  const { Permissions, hasPermission } = perms();
  return hasPermission(resolved.bits, Permissions.ADMINISTRATOR) || hasPermission(resolved.bits, Permissions.MANAGE_ROLES);
}

/** May this sender ping @everyone / @here? */
function canPingEveryone(resolved, { policy = envPolicy() } = {}) {
  if (canManageMentions(resolved)) return true;
  if (policy !== "permission" || !resolved) return false;
  const { Permissions, hasPermission } = perms();
  return hasPermission(resolved.bits, Permissions.MENTION_EVERYONE);
}

/** May this sender ping `role` (a server_roles row)? */
function canPingRole(resolved, role) {
  if (!role || role.is_everyone || role.isEveryone) return false;
  return Boolean(role.mentionable) || canManageMentions(resolved);
}

/** The ids of `roleIds` that exist in `roles` (this server's rows) and the sender may ping. */
function pingableRoleIds(roleIds, roles, resolved) {
  const byId = new Map((roles || []).map((r) => [String(r.id).toLowerCase(), r]));
  return (roleIds || []).filter((id) => canPingRole(resolved, byId.get(String(id).toLowerCase())));
}

/** `<@&id>` → "@Rol adı" for pushes and notification cards (unknown roles become "@rol"). */
function roleTokensToText(text, roles, fallback = "@rol") {
  const byId = new Map((roles || []).map((r) => [String(r.id).toLowerCase(), r]));
  return String(text || "").replace(ROLE_TOKEN_RE, (_, id) => {
    const r = byId.get(id.toLowerCase());
    return r?.name ? `@${r.name}` : fallback;
  });
}

/**
 * One @everyone / @here per sender per channel per window. `check` does not
 * count; `mark` after the message was stored.
 */
function createMassPingLimiter({ windowMs = cooldownMs(), now = () => Date.now(), maxKeys = 20000 } = {}) {
  const last = new Map();
  const key = (channelId, userId) => `${channelId}|${userId}`;
  function check(channelId, userId) {
    const at = last.get(key(channelId, userId));
    if (at == null || windowMs <= 0) return { ok: true, retryAfterMs: 0 };
    const left = at + windowMs - now();
    return left > 0 ? { ok: false, retryAfterMs: left } : { ok: true, retryAfterMs: 0 };
  }
  function mark(channelId, userId) {
    if (windowMs <= 0) return;
    if (last.size >= maxKeys) {
      const cutoff = now() - windowMs;
      for (const [k, at] of last) if (at <= cutoff) last.delete(k);
      if (last.size >= maxKeys) last.clear();
    }
    last.set(key(channelId, userId), now());
  }
  return { check, mark, windowMs };
}

/** Online for @here: a live presence entry that is not invisible. */
function isOnlineFor(presence, userId) {
  const p = presence?.get?.(userId);
  if (!p) return false;
  return String(p.status || "online").toLowerCase() !== "invisible";
}

/**
 * Members to notify for the role / @everyone / @here part of a message.
 * `canView(uid)` (async) says whether a member can see the channel.
 * Returns { userIds, roles, roleIds } (roles = the server's role rows, for text).
 */
async function resolveMassPingTargets(db, {
  serverId,
  channelId,
  senderId,
  resolved,
  text,
  canView,
  presence = null,
  policy = envPolicy(),
} = {}) {
  const parsed = parseServerMentions(text);
  const empty = { userIds: [], roles: [], roleIds: [], everyone: false, here: false };
  if (!parsed.roleIds.length && !parsed.everyone && !parsed.here) return empty;

  const { data: roles, error: rErr } = await db
    .from("server_roles")
    .select("id, name, color, mentionable, is_everyone")
    .eq("server_id", serverId);
  if (rErr) throw rErr;
  const roleIds = pingableRoleIds(parsed.roleIds, roles, resolved);
  const mass = canPingEveryone(resolved, { policy });
  const everyone = mass && parsed.everyone;
  const here = mass && parsed.here && !everyone;
  if (!roleIds.length && !everyone && !here) return { ...empty, roles: roles || [] };

  const candidates = new Set();
  if (everyone || here) {
    const { data: members, error } = await db.from("server_members").select("user_id").eq("server_id", serverId);
    if (error) throw error;
    for (const m of members || []) {
      if (!m?.user_id) continue;
      if (here && !isOnlineFor(presence, m.user_id)) continue;
      candidates.add(m.user_id);
    }
  }
  if (roleIds.length) {
    const { data: holders, error } = await db
      .from("server_member_roles")
      .select("user_id, role_id")
      .eq("server_id", serverId)
      .in("role_id", roleIds);
    if (error) throw error;
    for (const h of holders || []) if (h?.user_id) candidates.add(h.user_id);
  }
  candidates.delete(senderId);
  if (!candidates.size) return { userIds: [], roles: roles || [], roleIds, everyone, here };

  const visible = [];
  for (const uid of candidates) {
    try {
      if (await canView(uid)) visible.push(uid);
    } catch {
      /* cannot resolve: no ping */
    }
  }
  const userIds = await filterNotifiable(db, { serverId, channelId, userIds: visible });
  return { userIds, roles: roles || [], roleIds, everyone, here };
}

/** Keep members only; drop level "muted" and members who muted the channel. */
async function filterNotifiable(db, { serverId, channelId, userIds }) {
  if (!userIds?.length) return [];
  const [{ data: memberships, error: lErr }, { data: mutes, error: mErr }] = await Promise.all([
    db.from("server_members").select("user_id, notification_level").eq("server_id", serverId).in("user_id", userIds),
    db.from("server_channel_mutes").select("user_id").eq("channel_id", channelId).in("user_id", userIds),
  ]);
  if (lErr || mErr) throw lErr || mErr;
  const muted = new Set((mutes || []).map((r) => r.user_id));
  const level = new Map((memberships || []).map((r) => [r.user_id, String(r.notification_level || "all").toLowerCase()]));
  // No membership row (a role holder who left): not notified.
  return userIds.filter((uid) => level.has(uid) && !muted.has(uid) && level.get(uid) !== "muted" && level.get(uid) !== "none");
}

module.exports = {
  ROLE_TOKEN_RE,
  MAX_ROLE_PINGS,
  parseServerMentions,
  canManageMentions,
  canPingEveryone,
  canPingRole,
  pingableRoleIds,
  roleTokensToText,
  createMassPingLimiter,
  isOnlineFor,
  resolveMassPingTargets,
  filterNotifiable,
};
