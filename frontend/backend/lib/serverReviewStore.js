"use strict";

/**
 * Sunucu inceleme (admin, section serverReview): database reads and the few
 * writes behind routes/adminServerReview.js. Pure shaping lives in
 * lib/serverReview.js.
 *
 * Every list here is metadata only. Message text is read in exactly one place,
 * readChannel(), which the route calls only after the purpose + reason gate and
 * which is always followed by an audit row.
 *
 * Tolerates missing migrations: without supabase/migrations/20261114_server_review.sql
 * the aggregates come from capped scans instead of the admin_server_* functions and
 * edit history is simply empty; without the directory columns the directory flags
 * read as off and hiding answers 503.
 */

const supabase = require("../db/supabase");
const { isMissingSchemaError } = require("./serverDirectory");
const review = require("./serverReview");

const PAGE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_CACHE_MS = 60 * 1000;
const MOD_ACTIONS = Object.freeze(["MEMBER_BAN", "MEMBER_KICK", "MEMBER_TIMEOUT"]);

// Content columns: read only by readChannel (the gated view).
const MSG_COLS =
  "id, server_id, channel_id, sender_id, content, media_url, media_type, reply_to, created_at, edited_at, pinned_at, pinned_by, message_type, system_kind";
const MSG_COLS_WITH_HISTORY = `${MSG_COLS}, edit_history`;

const SERVER_COLS_FULL =
  "id, name, icon_url, owner_id, is_public, community_enabled, created_at, listed_in_directory, directory_hidden_at";
const SERVER_COLS_BASE = "id, name, icon_url, owner_id, is_public, created_at";
const DETAIL_COLS_FULL =
  "id, name, icon_url, banner_url, description, owner_id, vanity_slug, is_public, community_enabled, created_at, updated_at, listed_in_directory, directory_category, directory_language, directory_description, directory_tags, directory_listed_at, directory_invite_code, directory_hidden_at, directory_hidden_reason";
const DETAIL_COLS_BASE = "id, name, icon_url, banner_url, description, owner_id, vanity_slug, is_public, created_at, updated_at";

let warnedRpc = false;
let listCache = null;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function isoAgo(nowMs, days) {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

function isMissingTable(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205" || /could not find the table|does not exist/i.test(String(error?.message || ""));
}

/** Paged read with a row cap; `build` adds filters and an order for stable paging. */
async function scan(table, cols, build, cap = 20000) {
  const rows = [];
  let capped = false;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(cols);
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    if (rows.length >= cap) {
      capped = true;
      break;
    }
  }
  return { rows, capped };
}

/** First select that works: newer columns first, older shapes after a missing-column error. */
async function selectWithFallback(colsList, run) {
  let lastErr = null;
  for (const cols of colsList) {
    const res = await run(cols);
    if (!res.error) return res;
    lastErr = res.error;
    if (!isMissingSchemaError(res.error)) break;
  }
  throw lastErr;
}

/** Every page of an admin_server_* function, or null when it is not installed. */
async function rpcAll(fn, args) {
  if (typeof supabase.rpc !== "function") return null;
  const out = [];
  for (let from = 0; from < 50000; from += PAGE) {
    let res;
    try {
      res = await supabase.rpc(fn, args).range(from, from + PAGE - 1);
    } catch (err) {
      res = { error: err };
    }
    if (res.error) {
      if (!warnedRpc) {
        warnedRpc = true;
        console.warn(`[serverReview] ${fn} unavailable (${res.error.message || res.error}); apply supabase/migrations/20261114_server_review.sql. Using capped scans.`);
      }
      return null;
    }
    out.push(...(res.data || []));
    if (!res.data || res.data.length < PAGE) break;
  }
  return out;
}

async function usersByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = new Map();
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, is_admin")
      .in("id", unique.slice(i, i + 100));
    if (error) throw error;
    for (const u of data || []) out.set(String(u.id), u);
  }
  return out;
}

function userCard(u, id) {
  return {
    id: String(u?.id || id || ""),
    username: u?.username || (id ? String(id).slice(0, 8) : null),
    displayName: u?.display_name || u?.username || (id ? String(id).slice(0, 8) : null),
    avatarUrl: u?.avatar_url || null,
    isAdmin: Boolean(u?.is_admin),
  };
}

/* ---------- Server list aggregate ---------- */

async function loadServers() {
  const res = await selectWithFallback([SERVER_COLS_FULL, SERVER_COLS_BASE], async (cols) => {
    try {
      const { rows } = await scan("servers", cols, (q) => q.order("created_at", { ascending: false }), 20000);
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  });
  return res.data || [];
}

function bump(map, key, field, by = 1) {
  const k = String(key);
  const row = map.get(k) || {};
  row[field] = (row[field] || 0) + by;
  map.set(k, row);
}

async function loadStats(nowMs) {
  const since7 = isoAgo(nowMs, 7);
  const since30 = isoAgo(nowMs, 30);
  const stats = new Map();
  const viaRpc = await rpcAll("admin_server_overview", { p_since7: since7, p_since30: since30 });
  if (viaRpc) {
    for (const r of viaRpc) {
      stats.set(String(r.server_id), {
        members: Number(r.members || 0),
        joins7d: Number(r.joins_7d || 0),
        channels: Number(r.channels || 0),
        msgs7d: Number(r.msgs_7d || 0),
        msgs30d: Number(r.msgs_30d || 0),
        lastMessageAt: r.last_message_at || null,
        invitesActive: Number(r.invites_active || 0),
        inviteUses: Number(r.invite_uses || 0),
      });
    }
    return { stats, capped: false };
  }
  // Fallback: capped scans of the metadata columns only (never content).
  const [members, channels, msgs, invites] = await Promise.all([
    scan("server_members", "server_id, joined_at", (q) => q.order("joined_at", { ascending: false }), 100000),
    scan("server_channels", "server_id, type", (q) => q.order("created_at", { ascending: true }), 50000),
    scan("server_messages", "server_id, created_at", (q) => q.gte("created_at", since30).order("created_at", { ascending: false }), 50000),
    scan("server_invites", "server_id, uses, max_uses, expires_at", (q) => q.order("created_at", { ascending: false }), 20000),
  ]);
  for (const m of members.rows) {
    bump(stats, m.server_id, "members");
    if (m.joined_at && m.joined_at >= since7) bump(stats, m.server_id, "joins7d");
  }
  for (const c of channels.rows) if (c.type !== "category") bump(stats, c.server_id, "channels");
  for (const m of msgs.rows) {
    bump(stats, m.server_id, "msgs30d");
    if (m.created_at >= since7) bump(stats, m.server_id, "msgs7d");
    const row = stats.get(String(m.server_id));
    if (!row.lastMessageAt || m.created_at > row.lastMessageAt) row.lastMessageAt = m.created_at;
  }
  for (const inv of invites.rows) {
    bump(stats, inv.server_id, "inviteUses", Number(inv.uses || 0));
    if (review.inviteState(inv, nowMs) === "active") bump(stats, inv.server_id, "invitesActive");
  }
  return { stats, capped: members.capped || msgs.capped };
}

async function loadOpenReports(limit = 2000) {
  const { data, error } = await supabase
    .from("user_reports")
    .select("id, reporter_id, target_id, reason, note, context_type, context_id, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data || [];
}

/**
 * Which servers each report is about: context "server" with the server id (or a
 * message id of that server), plus every server the reported account is a member of.
 * @returns {Map<string, {serverIds: Set<string>, memberOf: Set<string>}>}
 */
async function attributeReports(reports, onlyServerId = null) {
  const out = new Map();
  const messageIds = [];
  for (const r of reports) {
    out.set(String(r.id), { serverIds: new Set(), memberOf: new Set() });
    if (r.context_type === "server" && r.context_id && review.isUuid(r.context_id)) messageIds.push(String(r.context_id));
  }
  // context_id is a server id or a message id; resolve message ids to their server.
  const msgServer = new Map();
  const ids = [...new Set(messageIds)];
  for (let i = 0; i < ids.length; i += 100) {
    let q = supabase.from("server_messages").select("id, server_id").in("id", ids.slice(i, i + 100));
    if (onlyServerId) q = q.eq("server_id", onlyServerId);
    const { data, error } = await q;
    if (error) throw error;
    for (const m of data || []) msgServer.set(String(m.id), String(m.server_id));
  }
  const targets = [...new Set(reports.map((r) => String(r.target_id || "")).filter(Boolean))];
  const memberships = new Map();
  for (let i = 0; i < targets.length; i += 100) {
    let q = supabase.from("server_members").select("server_id, user_id").in("user_id", targets.slice(i, i + 100));
    if (onlyServerId) q = q.eq("server_id", onlyServerId);
    const { data, error } = await q;
    if (error) throw error;
    for (const m of data || []) {
      const k = String(m.user_id);
      if (!memberships.has(k)) memberships.set(k, new Set());
      memberships.get(k).add(String(m.server_id));
    }
  }
  for (const r of reports) {
    const slot = out.get(String(r.id));
    if (r.context_type === "server" && r.context_id) {
      const cid = String(r.context_id);
      slot.serverIds.add(msgServer.get(cid) || cid);
    }
    for (const sid of memberships.get(String(r.target_id)) || []) if (!slot.serverIds.has(sid)) slot.memberOf.add(sid);
  }
  return out;
}

async function loadModEvents(nowMs) {
  try {
    const { rows } = await scan(
      "server_audit_logs",
      "server_id, action, created_at",
      (q) => q.in("action", MOD_ACTIONS).gte("created_at", isoAgo(nowMs, 7)).order("created_at", { ascending: false }),
      5000
    );
    const out = new Map();
    for (const r of rows) out.set(String(r.server_id), (out.get(String(r.server_id)) || 0) + 1);
    return out;
  } catch (err) {
    if (isMissingTable(err)) return new Map();
    throw err;
  }
}

async function buildAggregate(nowMs = Date.now()) {
  const servers = await loadServers();
  const [{ stats, capped }, reports, modEvents, owners] = await Promise.all([
    loadStats(nowMs),
    loadOpenReports(),
    loadModEvents(nowMs),
    usersByIds(servers.map((s) => s.owner_id)),
  ]);
  const attributed = await attributeReports(reports);
  const counts = new Map();
  for (const slot of attributed.values()) {
    for (const sid of slot.serverIds) {
      const c = counts.get(sid) || { server: 0, members: 0 };
      c.server += 1;
      counts.set(sid, c);
    }
    for (const sid of slot.memberOf) {
      const c = counts.get(sid) || { server: 0, members: 0 };
      c.members += 1;
      counts.set(sid, c);
    }
  }
  const rows = review.buildServerRows({ servers, stats, owners, reports: counts, modEvents, nowMs });
  const summary = {
    total: rows.length,
    listed: rows.filter((r) => r.directory.listed && !r.directory.hidden).length,
    hidden: rows.filter((r) => r.directory.hidden).length,
    reported: rows.filter((r) => r.reports.server + r.reports.members > 0).length,
    new7d: rows.filter((r) => r.createdAt && nowMs - Date.parse(r.createdAt) < 7 * DAY_MS).length,
    highRisk: rows.filter((r) => r.risk.level === "high").length,
  };
  return { at: nowMs, rows, summary, capped };
}

/** GET /server-review/servers: metadata rows, filtered, sorted and paged. */
async function listServers(query = {}) {
  const plan = review.parseListQuery(query);
  const nowMs = Date.now();
  if (plan.refresh || !listCache || nowMs - listCache.at > LIST_CACHE_MS) listCache = await buildAggregate(nowMs);
  const page = review.queryServers(listCache.rows, plan, nowMs);
  return {
    generatedAt: new Date(listCache.at).toISOString(),
    summary: listCache.summary,
    approximate: Boolean(listCache.capped),
    filter: plan.filter,
    sort: plan.sort,
    q: plan.q,
    ...page,
  };
}

function invalidateList() {
  listCache = null;
}

/* ---------- Server detail (metadata) ---------- */

async function loadServerRow(serverId, colsList = [DETAIL_COLS_FULL, DETAIL_COLS_BASE]) {
  if (!review.isUuid(serverId)) throw httpError(400, "Invalid server.", "SERVER_INVALID");
  const res = await selectWithFallback(colsList, (cols) => supabase.from("servers").select(cols).eq("id", serverId).maybeSingle());
  if (!res.data) throw httpError(404, "Server not found.", "SERVER_NOT_FOUND");
  return res.data;
}

async function headCount(build) {
  const { count, error } = await build();
  if (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
  return Number(count || 0);
}

async function channelCounts(serverId) {
  const viaRpc = await rpcAll("admin_server_channel_stats", { p_server_id: serverId });
  const out = new Map();
  if (viaRpc) {
    for (const r of viaRpc) out.set(String(r.channel_id), { messages: Number(r.messages || 0), lastAt: r.last_message_at || null });
    return { counts: out, capped: false };
  }
  const { rows, capped } = await scan(
    "server_messages",
    "channel_id, created_at",
    (q) => q.eq("server_id", serverId).order("created_at", { ascending: false }),
    20000
  );
  for (const r of rows) {
    const k = String(r.channel_id);
    const st = out.get(k) || { messages: 0, lastAt: null };
    st.messages += 1;
    if (!st.lastAt || r.created_at > st.lastAt) st.lastAt = r.created_at;
    out.set(k, st);
  }
  return { counts: out, capped };
}

async function serverReports(serverId) {
  const { data, error } = await supabase
    .from("user_reports")
    .select("id, reporter_id, target_id, reason, note, context_type, context_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  const rows = data || [];
  const attributed = await attributeReports(rows, serverId);
  const sid = String(serverId);
  return rows
    .map((r) => {
      const slot = attributed.get(String(r.id));
      const about = slot?.serverIds.has(sid) ? "server" : slot?.memberOf.has(sid) ? "member" : null;
      return about ? { r, about } : null;
    })
    .filter(Boolean)
    .slice(0, 100);
}

/** GET /server-review/servers/:id: owner, staff, channels, invites, audit, directory, reports. */
async function getServerDetail(serverId, nowMs = Date.now()) {
  const s = await loadServerRow(serverId);
  const since7 = isoAgo(nowMs, 7);
  const since30 = isoAgo(nowMs, 30);
  const [roles, memberRoles, channels, chan, invites, audit, bans, reports, members, joins7d, msgs7d, msgs30d] = await Promise.all([
    supabase.from("server_roles").select("id, name, color, position, permissions, is_everyone").eq("server_id", serverId),
    supabase.from("server_member_roles").select("user_id, role_id").eq("server_id", serverId).limit(5000),
    supabase.from("server_channels").select("id, name, type, position, parent_id, nsfw").eq("server_id", serverId),
    channelCounts(serverId),
    supabase
      .from("server_invites")
      .select("code, creator_id, channel_id, uses, max_uses, max_age_seconds, temporary, created_at, expires_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("server_audit_logs")
      .select("id, actor_id, action, target_type, target_id, changes, reason, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("server_bans").select("user_id, moderator_id, reason, created_at").eq("server_id", serverId).order("created_at", { ascending: false }).limit(100),
    serverReports(serverId),
    headCount(() => supabase.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId)),
    headCount(() => supabase.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId).gte("joined_at", since7)),
    headCount(() => supabase.from("server_messages").select("id", { count: "exact", head: true }).eq("server_id", serverId).gte("created_at", since7)),
    headCount(() => supabase.from("server_messages").select("id", { count: "exact", head: true }).eq("server_id", serverId).gte("created_at", since30)),
  ]);
  for (const r of [roles, memberRoles, channels, invites, audit]) if (r.error && !isMissingTable(r.error)) throw r.error;
  const roleRows = roles.data || [];
  const roleById = new Map(roleRows.map((r) => [String(r.id), r]));
  const dangerByRole = new Map(roleRows.map((r) => [String(r.id), review.dangerousPermissions(r.permissions)]));
  const everyone = roleRows.find((r) => r.is_everyone);

  // Staff = owner + every member holding a role with a dangerous permission.
  const staffRoles = new Map();
  for (const mr of memberRoles.data || []) {
    const danger = dangerByRole.get(String(mr.role_id)) || [];
    if (!danger.length) continue;
    const k = String(mr.user_id);
    if (!staffRoles.has(k)) staffRoles.set(k, []);
    staffRoles.get(k).push(String(mr.role_id));
  }
  const staffIds = [...staffRoles.keys()].filter((id) => id !== String(s.owner_id));
  const roleMemberCount = new Map();
  for (const mr of memberRoles.data || []) roleMemberCount.set(String(mr.role_id), (roleMemberCount.get(String(mr.role_id)) || 0) + 1);

  const inviteRows = invites.data || [];
  const auditRows = audit.data || [];
  const banRows = bans.error ? [] : bans.data || [];
  const people = await usersByIds([
    s.owner_id,
    ...staffIds,
    ...inviteRows.map((i) => i.creator_id),
    ...auditRows.map((a) => a.actor_id),
    ...banRows.flatMap((b) => [b.user_id, b.moderator_id]),
    ...reports.flatMap(({ r }) => [r.reporter_id, r.target_id]),
  ]);
  const staffJoined = new Map();
  if (staffIds.length) {
    const { data } = await supabase.from("server_members").select("user_id, joined_at").eq("server_id", serverId).in("user_id", staffIds.slice(0, 500));
    for (const m of data || []) staffJoined.set(String(m.user_id), m.joined_at || null);
  }
  const channelRows = channels.data || [];
  const textChannels = channelRows.filter((c) => c.type !== "category");

  return {
    generatedAt: new Date(nowMs).toISOString(),
    server: {
      id: String(s.id),
      name: s.name || "",
      iconUrl: s.icon_url || null,
      bannerUrl: s.banner_url || null,
      description: s.description || null,
      vanitySlug: s.vanity_slug || null,
      isPublic: Boolean(s.is_public),
      communityEnabled: Boolean(s.community_enabled),
      createdAt: s.created_at || null,
      updatedAt: s.updated_at || null,
    },
    owner: { ...userCard(people.get(String(s.owner_id)), s.owner_id), joinedAt: null },
    stats: {
      members,
      joins7d,
      channels: textChannels.length,
      messages7d: msgs7d,
      messages30d: msgs30d,
      invitesActive: inviteRows.filter((i) => review.inviteState(i, nowMs) === "active").length,
      bans: banRows.length,
      openReports: reports.filter(({ r }) => r.status === "open").length,
      countsApproximate: Boolean(chan.capped),
    },
    directory: {
      listed: Boolean(s.listed_in_directory),
      hidden: Boolean(s.directory_hidden_at),
      hiddenAt: s.directory_hidden_at || null,
      hiddenReason: s.directory_hidden_reason || null,
      category: s.directory_category || null,
      language: s.directory_language || null,
      description: s.directory_description || null,
      tags: Array.isArray(s.directory_tags) ? s.directory_tags : [],
      listedAt: s.directory_listed_at || null,
      inviteCode: s.directory_invite_code || null,
      available: Object.prototype.hasOwnProperty.call(s, "listed_in_directory"),
    },
    staff: staffIds
      .map((id) => ({
        ...userCard(people.get(id), id),
        joinedAt: staffJoined.get(id) || null,
        roles: (staffRoles.get(id) || []).map((rid) => ({ id: rid, name: roleById.get(rid)?.name || "", color: Number(roleById.get(rid)?.color || 0) })),
        permissions: [...new Set((staffRoles.get(id) || []).flatMap((rid) => dangerByRole.get(rid) || []))],
      }))
      .sort((a, b) => (b.permissions.includes("ADMINISTRATOR") ? 1 : 0) - (a.permissions.includes("ADMINISTRATOR") ? 1 : 0)),
    roles: roleRows
      .map((r) => ({
        id: String(r.id),
        name: r.name || "",
        color: Number(r.color || 0),
        position: Number(r.position || 0),
        isEveryone: Boolean(r.is_everyone),
        members: r.is_everyone ? members : roleMemberCount.get(String(r.id)) || 0,
        dangerous: dangerByRole.get(String(r.id)) || [],
      }))
      .sort((a, b) => b.position - a.position),
    everyoneDangerous: everyone ? review.dangerousPermissions(everyone.permissions) : [],
    channels: review.channelTree(channelRows, chan.counts),
    invites: inviteRows.map((i) => ({
      code: i.code,
      creator: userCard(people.get(String(i.creator_id)), i.creator_id),
      channelId: i.channel_id ? String(i.channel_id) : null,
      uses: Number(i.uses || 0),
      maxUses: i.max_uses == null ? null : Number(i.max_uses),
      temporary: Boolean(i.temporary),
      createdAt: i.created_at || null,
      expiresAt: i.expires_at || null,
      state: review.inviteState(i, nowMs),
      isDirectoryInvite: Boolean(s.directory_invite_code) && s.directory_invite_code === i.code,
    })),
    audit: auditRows.map((a) => review.mapServerAudit(a, people)),
    bans: banRows.map((b) => ({
      user: userCard(people.get(String(b.user_id)), b.user_id),
      moderator: b.moderator_id ? userCard(people.get(String(b.moderator_id)), b.moderator_id) : null,
      reason: b.reason ? String(b.reason).slice(0, 300) : null,
      createdAt: b.created_at || null,
    })),
    // Report rows without the message snippet: the snippet is content and stays behind the gate.
    reports: reports.map(({ r, about }) => ({
      id: String(r.id),
      about,
      reason: r.reason || "other",
      note: r.note ? String(r.note).slice(0, 300) : null,
      status: r.status || "open",
      contextType: r.context_type || null,
      createdAt: r.created_at || null,
      reporter: userCard(people.get(String(r.reporter_id)), r.reporter_id),
      target: userCard(people.get(String(r.target_id)), r.target_id),
    })),
  };
}

/** GET /server-review/servers/:id/members: join dates, roles, staff flag. Paged. */
async function listMembers(serverId, { q = "", offset = 0, limit = 50 } = {}) {
  const s = await loadServerRow(serverId, ["id, owner_id"]);
  const lim = Math.max(1, Math.min(100, Number(limit) || 50));
  const off = Math.max(0, Math.min(100000, Number(offset) || 0));
  const query = String(q || "").trim().replace(/^@/, "").slice(0, 32);
  let ids = null;
  if (query) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .ilike("username", `%${query.replace(/[%_\\]/g, "\\$&")}%`)
      .limit(200);
    if (error) throw error;
    ids = (data || []).map((u) => String(u.id));
    if (review.isUuid(query)) ids.push(query);
    if (!ids.length) return { members: [], total: 0, offset: off, limit: lim };
  }
  let mq = supabase.from("server_members").select("user_id, nickname, joined_at", { count: "exact" }).eq("server_id", serverId);
  if (ids) mq = mq.in("user_id", ids);
  const { data, count, error } = await mq.order("joined_at", { ascending: false }).range(off, off + lim - 1);
  if (error) throw error;
  const rows = data || [];
  const userIds = rows.map((m) => String(m.user_id));
  const [people, mr, roles] = await Promise.all([
    usersByIds(userIds),
    userIds.length
      ? supabase.from("server_member_roles").select("user_id, role_id").eq("server_id", serverId).in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    supabase.from("server_roles").select("id, name, color, position, permissions").eq("server_id", serverId),
  ]);
  const roleById = new Map((roles.data || []).map((r) => [String(r.id), r]));
  const rolesOf = new Map();
  for (const x of mr.data || []) {
    const k = String(x.user_id);
    if (!rolesOf.has(k)) rolesOf.set(k, []);
    const r = roleById.get(String(x.role_id));
    if (r) rolesOf.get(k).push(r);
  }
  return {
    members: rows.map((m) => {
      const id = String(m.user_id);
      const own = (rolesOf.get(id) || []).sort((a, b) => Number(b.position || 0) - Number(a.position || 0));
      const perms = [...new Set(own.flatMap((r) => review.dangerousPermissions(r.permissions)))];
      return {
        ...userCard(people.get(id), id),
        nickname: m.nickname || null,
        joinedAt: m.joined_at || null,
        isOwner: id === String(s.owner_id),
        roles: own.map((r) => ({ id: String(r.id), name: r.name || "", color: Number(r.color || 0) })),
        staff: perms,
      };
    }),
    total: Number(count ?? rows.length),
    offset: off,
    limit: lim,
  };
}

/* ---------- Content: the gated view (route audits every call) ---------- */

async function readChannel(serverId, channelId, cursor) {
  if (!review.isUuid(serverId) || !review.isUuid(channelId)) throw httpError(400, "Invalid channel.", "CHANNEL_INVALID");
  const [{ data: channel, error: cErr }, { data: server, error: sErr }] = await Promise.all([
    supabase.from("server_channels").select("id, server_id, name, type").eq("id", channelId).eq("server_id", serverId).maybeSingle(),
    supabase.from("servers").select("id, name").eq("id", serverId).maybeSingle(),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if (!server) throw httpError(404, "Server not found.", "SERVER_NOT_FOUND");
  if (!channel) throw httpError(404, "Channel not found in this server.", "CHANNEL_NOT_FOUND");
  if (channel.type === "category") throw httpError(400, "A category has no messages.", "CHANNEL_INVALID");

  const run = (cols) => {
    // Always both filters: a view never leaves the opened channel of this server.
    let q = supabase.from("server_messages").select(cols).eq("channel_id", channelId).eq("server_id", serverId);
    if (cursor.before) q = q.lt("created_at", cursor.before).order("created_at", { ascending: false });
    else if (cursor.after) q = q.gt("created_at", cursor.after).order("created_at", { ascending: true });
    else q = q.order("created_at", { ascending: false });
    return q.limit(cursor.limit + 1);
  };
  const res = await selectWithFallback([MSG_COLS_WITH_HISTORY, MSG_COLS], run);
  let rows = res.data || [];
  const hasMore = rows.length > cursor.limit;
  rows = rows.slice(0, cursor.limit);
  if (!cursor.after) rows = rows.reverse();
  const people = await usersByIds([...rows.map((r) => r.sender_id), ...rows.map((r) => r.pinned_by)]);
  const messages = rows.map((r) => review.mapReviewMessage(r, people));
  return {
    server: { id: String(server.id), name: server.name || "" },
    channel: { id: String(channel.id), name: channel.name || "", type: channel.type || "text" },
    messages,
    hasMore,
    editHistoryAvailable: res.data != null && rows.every((r) => Object.prototype.hasOwnProperty.call(r, "edit_history")),
  };
}

/* ---------- Actions ---------- */

/** One message, scoped to its channel and server (the id alone could name any message). */
async function deleteChannelMessage(serverId, channelId, msgId) {
  if (!review.isUuid(serverId) || !review.isUuid(channelId) || !review.isUuid(msgId)) throw httpError(400, "Invalid message.", "MESSAGE_INVALID");
  const { data, error } = await supabase
    .from("server_messages")
    .delete()
    .eq("id", msgId)
    .eq("channel_id", channelId)
    .eq("server_id", serverId)
    .select("id");
  if (error) throw error;
  if (!data || !data.length) throw httpError(404, "The message is not in this channel.", "MESSAGE_NOT_FOUND");
  return { ok: true };
}

async function setDirectoryHidden(serverId, hidden, note) {
  if (!review.isUuid(serverId)) throw httpError(400, "Invalid server.", "SERVER_INVALID");
  const patch = hidden
    ? { directory_hidden_at: new Date().toISOString(), directory_hidden_reason: note || null }
    : { directory_hidden_at: null, directory_hidden_reason: null };
  const { data, error } = await supabase.from("servers").update(patch).eq("id", serverId).select("id").maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) throw httpError(503, "The directory is not available yet.", "DIRECTORY_UNAVAILABLE");
    throw error;
  }
  if (!data) throw httpError(404, "Server not found.", "SERVER_NOT_FOUND");
  invalidateList();
  return { ok: true, hidden };
}

async function deleteInvite(serverId, code) {
  if (!review.isUuid(serverId) || !review.isInviteCode(code)) throw httpError(400, "Invalid invite.", "INVITE_INVALID");
  const { data, error } = await supabase.from("server_invites").delete().eq("code", code).eq("server_id", serverId).select("code");
  if (error) throw error;
  if (!data || !data.length) throw httpError(404, "Invite not found.", "INVITE_NOT_FOUND");
  invalidateList();
  return { ok: true, code };
}

/** "Davetleri kapat": every invite of the server is removed (there is no pause flag). */
async function revokeAllInvites(serverId) {
  if (!review.isUuid(serverId)) throw httpError(400, "Invalid server.", "SERVER_INVALID");
  await loadServerRow(serverId, ["id"]);
  const { data, error } = await supabase.from("server_invites").delete().eq("server_id", serverId).select("code");
  if (error) throw error;
  invalidateList();
  return { ok: true, removed: (data || []).length };
}

async function loadServerForDelete(serverId) {
  return loadServerRow(serverId, ["id, name, owner_id"]);
}

module.exports = {
  listServers,
  invalidateList,
  getServerDetail,
  listMembers,
  readChannel,
  deleteChannelMessage,
  setDirectoryHidden,
  deleteInvite,
  revokeAllInvites,
  loadServerForDelete,
  MSG_COLS,
};
