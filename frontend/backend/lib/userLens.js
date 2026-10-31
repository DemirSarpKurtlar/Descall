"use strict";

/**
 * Kullanıcının gözünden (3.7.2): what one account can and cannot do right now,
 * for support ("why can't I send a message / see this channel?"). Read-only,
 * no message content, nothing recorded on the account. Used by
 * GET /admin/people/:id/lens (routes/adminPeople.js, section "people").
 *
 * Sections:
 *  - checks:  account ban, timeout, access bans on its sessions, wallet freeze,
 *             platform switches (chat frozen, DMs off, slow mode, group create);
 *  - servers: every server it is in with its roles and, per channel, whether it
 *             can see / write / join voice (same rules as serverPermissions);
 *  - social:  friends, pending requests, blocks; notification preferences.
 * Each section degrades to { available: false } on its own.
 */

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const moderation = require("./moderation");
const accessBans = require("./accessBans");
const perms = require("./serverPermissions");

const MAX_SERVERS = 40;
const { Permissions } = perms;

function check(id, status, detail = {}) {
  return { id, status, ...detail };
}

/** Platform switches as this account meets them (pure; admins are exempt). */
function policyChecks(config, { isAdmin = false } = {}) {
  const c = config || {};
  if (isAdmin) return [check("policyAdmin", "info")];
  const out = [];
  out.push(check("sendMessages", c.chatFrozen ? "blocked" : "ok", { code: c.chatFrozen ? "CHAT_FROZEN" : null }));
  out.push(check("sendDms", c.chatFrozen || c.dmEnabled === false ? "blocked" : "ok", { code: c.chatFrozen ? "CHAT_FROZEN" : c.dmEnabled === false ? "DMS_DISABLED" : null }));
  out.push(check("createGroups", c.groupCreationEnabled === false ? "blocked" : "ok"));
  const slow = Math.max(0, Number(c.slowModeSeconds) || 0);
  const perMinute = Math.max(0, Math.floor(Number(c.maxMessagesPerMinute) || 0));
  if (slow > 0 || perMinute > 0) out.push(check("rateLimits", "warn", { slowModeSeconds: slow, perMinute }));
  return out;
}

/**
 * Channel visibility for one member of one server (pure, mirrors
 * resolveChannelPermissions without a query per channel).
 */
function channelAccess({ server, userId, roles, assignedRoleIds, channels, overrides }) {
  const isOwner = String(server.owner_id) === String(userId);
  const assignedIds = new Set((assignedRoleIds || []).map(String));
  let base = 0n;
  for (const role of roles || []) {
    if (role.is_everyone) base |= perms.stripEveryonePrivilegeBits(perms.fromPgBigint(role.permissions));
    else if (assignedIds.has(String(role.id))) base |= perms.fromPgBigint(role.permissions);
  }
  const admin = isOwner || perms.hasPermission(base, Permissions.ADMINISTRATOR);
  const everyoneRoleId = (roles || []).find((r) => r.is_everyone)?.id || null;
  const rolePos = new Map((roles || []).map((r) => [String(r.id), Number(r.position) || 0]));
  const memberRoleIds = new Set([...assignedIds, ...(everyoneRoleId ? [String(everyoneRoleId)] : [])]);
  const byChannel = new Map();
  for (const o of overrides || []) {
    const k = String(o.channel_id);
    if (!byChannel.has(k)) byChannel.set(k, []);
    byChannel.get(k).push({ ...o, _position: o.target_type === "role" ? rolePos.get(String(o.target_id)) || 0 : 0 });
  }
  const ctx = { everyoneRoleId, memberRoleIds, userId };
  return (channels || []).map((ch) => {
    let bits;
    if (admin) bits = perms.ALL_PERMISSIONS;
    else {
      const own = byChannel.get(String(ch.id)) || [];
      const parent = ch.parent_id ? byChannel.get(String(ch.parent_id)) || [] : [];
      bits = perms.applyOverwrites(base, perms.effectiveOverwrites(own, parent), ctx);
    }
    const isVoice = /voice|stage/.test(String(ch.type || ""));
    return {
      id: ch.id,
      name: ch.name,
      type: ch.type || "text",
      parentId: ch.parent_id || null,
      position: Number(ch.position) || 0,
      view: perms.hasPermission(bits, Permissions.VIEW_CHANNEL),
      send: !isVoice && perms.hasPermission(bits, Permissions.VIEW_CHANNEL) && perms.hasPermission(bits, Permissions.SEND_MESSAGES),
      connect: isVoice && perms.hasPermission(bits, Permissions.VIEW_CHANNEL) && perms.hasPermission(bits, Permissions.CONNECT),
    };
  });
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadServers(userId, now) {
  const members = await rows(supabase.from("server_members").select("server_id, nickname, joined_at, timeout_until").eq("user_id", userId).limit(MAX_SERVERS));
  const ids = members.map((m) => m.server_id);
  if (!ids.length) return { list: [], truncated: false };
  const [servers, roles, assigned, channels] = await Promise.all([
    rows(supabase.from("servers").select("id, name, owner_id, icon_url").in("id", ids)),
    rows(supabase.from("server_roles").select("id, server_id, name, color, position, permissions, is_everyone").in("server_id", ids)),
    rows(supabase.from("server_member_roles").select("server_id, role_id").eq("user_id", userId).in("server_id", ids)),
    rows(supabase.from("server_channels").select("id, server_id, name, type, parent_id, position").in("server_id", ids)),
  ]);
  const chIds = channels.map((c) => c.id);
  const overrides = chIds.length
    ? await rows(supabase.from("server_channel_overrides").select("channel_id, target_type, target_id, allow_permissions, deny_permissions").in("channel_id", chIds))
    : [];
  const serverById = new Map(servers.map((s) => [String(s.id), s]));
  const list = members
    .map((m) => {
      const server = serverById.get(String(m.server_id));
      if (!server) return null;
      const sid = String(server.id);
      const sRoles = roles.filter((r) => String(r.server_id) === sid);
      const sAssigned = assigned.filter((a) => String(a.server_id) === sid).map((a) => a.role_id);
      const sChannels = channels.filter((c) => String(c.server_id) === sid);
      const sChannelIds = new Set(sChannels.map((c) => String(c.id)));
      const access = channelAccess({
        server,
        userId,
        roles: sRoles,
        assignedRoleIds: sAssigned,
        channels: sChannels,
        overrides: overrides.filter((o) => sChannelIds.has(String(o.channel_id))),
      }).sort((a, b) => a.position - b.position);
      const timeoutUntil = m.timeout_until && Date.parse(m.timeout_until) > now ? m.timeout_until : null;
      const assignedSet = new Set(sAssigned.map(String));
      const nonCategory = access.filter((c) => c.type !== "category");
      return {
        id: server.id,
        name: server.name,
        iconUrl: server.icon_url || null,
        owner: String(server.owner_id) === String(userId),
        nickname: m.nickname || null,
        joinedAt: m.joined_at || null,
        roles: sRoles
          .filter((r) => assignedSet.has(String(r.id)))
          .sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0))
          .map((r) => ({ id: r.id, name: r.name, color: r.color || null })),
        timeoutUntil,
        counts: { total: nonCategory.length, visible: nonCategory.filter((c) => c.view).length, hidden: nonCategory.filter((c) => !c.view).length },
        channels: access,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  return { list, truncated: members.length >= MAX_SERVERS };
}

async function loadSocial(userId, blocked) {
  const count = async (q) => {
    const { count: n, error } = await q;
    if (error) throw error;
    return n || 0;
  };
  const [friends, incoming, outgoing, blockedBy, notif] = await Promise.all([
    count(supabase.from("friendships").select("friend_id", { count: "exact", head: true }).eq("user_id", userId)),
    count(supabase.from("friend_requests").select("id", { count: "exact", head: true }).eq("to_user_id", userId).eq("status", "pending")),
    count(supabase.from("friend_requests").select("id", { count: "exact", head: true }).eq("from_user_id", userId).eq("status", "pending")),
    count(supabase.from("users").select("id", { count: "exact", head: true }).contains("blocked_users", [userId])).catch(() => null),
    supabase.from("notification_preferences").select("dm, groups, calls, mentions, friend_requests").eq("user_id", userId).maybeSingle().then((r) => r.data || null, () => null),
  ]);
  return {
    friends,
    requestsIn: incoming,
    requestsOut: outgoing,
    blocks: Array.isArray(blocked) ? blocked.length : 0,
    blockedBy,
    notifications: notif,
  };
}

async function safe(fn) {
  try {
    return { available: true, ...(await fn()) };
  } catch (err) {
    return { available: false, error: String(err?.message || err).slice(0, 120) };
  }
}

async function buildLens(userId, { now = Date.now(), config = state.systemConfig } = {}) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, is_admin, is_banned, descoin_frozen, active_sessions, blocked_users, totp_enabled_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!user) {
    const err = new Error("User not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const isAdmin = Boolean(user.is_admin) || user.username === "admin";
  const banned = moderation.isBanned(user.id) || Boolean(user.is_banned);
  const timeout = moderation.getActiveTimeout(user.id);

  const checks = [
    check("account", banned ? "blocked" : "ok"),
    check("timeout", timeout ? "blocked" : "ok", { until: timeout?.until || null }),
  ];
  const sessions = Array.isArray(user.active_sessions) ? user.active_sessions : [];
  let accessHit = null;
  if (!isAdmin) {
    for (const s of sessions) {
      const ban = await accessBans.peek({ ip: s.ip, deviceHash: s.deviceHash }).catch(() => null);
      if (ban) {
        accessHit = { kind: ban.kind, label: ban.label, expiresAt: ban.expires_at || null };
        break;
      }
    }
  }
  checks.push(check("accessBan", accessHit ? "blocked" : "ok", accessHit ? { ban: accessHit } : {}));
  checks.push(check("wallet", user.descoin_frozen ? "blocked" : "ok"));
  checks.push(...policyChecks(config, { isAdmin }));
  checks.push(check("twoFactor", user.totp_enabled_at ? "ok" : "info"));

  const [servers, social] = await Promise.all([safe(() => loadServers(user.id, now)), safe(() => loadSocial(user.id, user.blocked_users))]);
  return {
    user: { id: user.id, username: user.username, displayName: user.display_name || user.username, avatarUrl: user.avatar_url || null, isAdmin },
    generatedAt: new Date(now).toISOString(),
    checks,
    servers,
    social,
    sessions: sessions.length,
  };
}

module.exports = { buildLens, policyChecks, channelAccess };
