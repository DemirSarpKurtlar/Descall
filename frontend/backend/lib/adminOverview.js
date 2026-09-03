"use strict";

const TZ = "Europe/Istanbul";
const MEMORY_WATCH_MB = 1500;
const ERRORS_WATCH = 10;

function istanbulDayKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function lastIstanbulDays(n, now = new Date()) {
  const count = Math.max(1, Math.min(30, Number(n) || 7));
  const today = istanbulDayKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const noon = new Date(Date.UTC(y, m - 1, d - i, 9, 0, 0));
    keys.push(istanbulDayKey(noon));
  }
  return keys;
}

function bucketSignupsByIstanbulDay(rows, dayKeys) {
  const map = Object.fromEntries((dayKeys || []).map((k) => [k, 0]));
  for (const row of rows || []) {
    const key = istanbulDayKey(row.signup_at || row.created_at);
    if (key && key in map) map[key] += 1;
  }
  return (dayKeys || []).map((date) => ({ date, signups: map[date] || 0 }));
}

function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  let label = `${minutes}m`;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${minutes}m`;
  return { seconds: s, days, hours, minutes, label };
}

function rssMb(memory) {
  const rss = Number(memory?.rss) || 0;
  return Math.round(rss / (1024 * 1024));
}

function countSince(entries, sinceMs, timeKey = "at") {
  const cutoff = Number(sinceMs) || 0;
  return (entries || []).filter((row) => {
    const t = Date.parse(row?.[timeKey] || row?.timestamp || row?.created_at || 0);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function queryRows(res, label = "query") {
  if (res?.error) {
    console.warn(`[overview] ${label}:`, res.error.message || res.error);
    return [];
  }
  return Array.isArray(res?.data) ? res.data : [];
}

function withTimeout(promise, ms, fallback) {
  const msec = Math.max(1, Number(ms) || 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, msec);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (fallback !== undefined) resolve(fallback);
        else reject(err);
      }
    );
  });
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function lastSeenMs(row) {
  const raw = row?.last_seen || row?.lastSeen;
  if (raw == null || raw === "") return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function isRecentlySeen(value, now = Date.now(), windowMs = ONLINE_WINDOW_MS) {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const win = Math.max(1000, Number(windowMs) || ONLINE_WINDOW_MS);
  const delta = nowMs - ts;
  return delta <= win && delta >= -60_000;
}

function lastSeenValue(row) {
  if (!row) return null;
  return row.last_seen || row.lastSeen || row.last_login_at || row.last_login || null;
}

function rowIsOnline(row, { liveIds, now, windowMs } = {}) {
  if (!row) return false;
  if (row.id != null && liveIds) {
    const id = String(row.id);
    if (liveIds.has(id) || liveIds.has(row.id)) return true;
  }
  return isRecentlySeen(lastSeenValue(row), now, windowMs);
}

function sortRecentlyActive(a, b) {
  const aOn = Boolean(a?.isOnline);
  const bOn = Boolean(b?.isOnline);
  if (aOn !== bOn) return aOn ? -1 : 1;
  return lastSeenMs(b) - lastSeenMs(a);
}

/**
 * Merge live sockets with durable last_seen rows.
 * Online first, then most recently seen. Live timestamps win when both exist.
 */
function mergeRecentlyActive({ liveRows = [], dbRows = [], limit = 20 } = {}) {
  const cap = Math.max(1, Math.min(100, Number(limit) || 20));
  const byId = new Map();

  for (const row of liveRows) {
    if (row?.id == null) continue;
    byId.set(String(row.id), { ...row, id: String(row.id), isOnline: true });
  }

  for (const row of dbRows) {
    if (row?.id == null) continue;
    const id = String(row.id);
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        ...row,
        ...existing,
        id,
        display_name: row.display_name || existing.display_name || null,
        displayName: row.displayName || existing.displayName || row.username || existing.username,
        avatar_url: row.avatar_url || existing.avatar_url || null,
        avatarUrl: row.avatarUrl || row.avatar_url || existing.avatarUrl || existing.avatar_url || null,
        created_at: row.created_at || existing.created_at || null,
        last_seen: existing.last_seen || row.last_seen || null,
        lastSeen: existing.lastSeen || existing.last_seen || row.lastSeen || row.last_seen || null,
        isOnline: true,
        status: existing.status || row.status || "online",
      });
    } else {
      const online = Boolean(row.isOnline) || isRecentlySeen(lastSeenValue(row));
      byId.set(id, {
        ...row,
        id,
        isOnline: online,
        status: online ? (row.status && row.status !== "offline" ? row.status : "online") : (row.status || "offline"),
      });
    }
  }

  return [...byId.values()].sort(sortRecentlyActive).slice(0, cap);
}

/**
 * Single health level for the command-center banner.
 * critical > high > watch > ok
 */
function deriveHealth({
  maintenance = false,
  chatFrozen = false,
  openReports = 0,
  hotTargets = 0,
  errorsLastHour = 0,
  rssMb: mem = 0,
} = {}) {
  const alerts = [];
  if (maintenance) alerts.push({ id: "maintenance", level: "critical", tab: "maintenance" });
  if (chatFrozen) alerts.push({ id: "chat_frozen", level: "high", tab: "maintenance" });
  if (Number(hotTargets) > 0) alerts.push({ id: "hot_reports", level: "high", tab: "reports" });
  else if (Number(openReports) > 0) alerts.push({ id: "open_reports", level: "watch", tab: "reports" });
  if (Number(errorsLastHour) >= ERRORS_WATCH) alerts.push({ id: "errors", level: "watch", tab: "system" });
  if (Number(mem) >= MEMORY_WATCH_MB) alerts.push({ id: "memory", level: "watch", tab: "system" });

  const rank = { ok: 0, watch: 1, high: 2, critical: 3 };
  let level = "ok";
  for (const alert of alerts) {
    if (rank[alert.level] > rank[level]) level = alert.level;
  }
  return { level, alerts };
}

function isMissingRelationError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return (
    code === "42P01" ||
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg)
  );
}

function isMissingColumnError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "42703" || /column .* does not exist/i.test(msg) || /schema cache/i.test(msg);
}

function countFromResult(res, label = "count") {
  if (res?.error) {
    if (!isMissingRelationError(res.error) && !isMissingColumnError(res.error)) {
      console.warn("[overview] " + label + ":", res.error.message || res.error);
    }
    return 0;
  }
  const n = Number(res?.count);
  return Number.isFinite(n) ? n : 0;
}

function emptyDurableCounts() {
  return {
    users: 0,
    groups: 0,
    dmMessages: 0,
    groupMessages: 0,
    serverMessages: 0,
    messages: 0,
    bans: 0,
    timeouts: 0,
    audit: 0,
    dmConversationKeys: 0,
  };
}

function headCountQuery(client, table) {
  return client.from(table).select("id", { count: "exact", head: true });
}

async function timedCount(promise, timeoutMs, label) {
  const res = await withTimeout(promise, timeoutMs, { count: 0, error: { message: "timeout" } });
  return countFromResult(res, label);
}

/**
 * Parallel HEAD counts from Supabase. Missing tables/columns become 0, not throws.
 * Does not N+1 — one count query per metric.
 */
async function fetchDurableAdminCounts(client, opts) {
  const options = opts || {};
  const now = options.now || new Date();
  const timeoutMs = options.timeoutMs || 5000;
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const ms = Math.max(1, Number(timeoutMs) || 5000);

  const banActive = function () {
    return client
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("is_banned", true)
      .or("ban_expires_at.is.null,ban_expires_at.gt.\"" + nowIso + "\"");
  };
  const timeoutActive = function () {
    return client
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("timeout_until", "is", null)
      .gt("timeout_until", nowIso);
  };

  const [
    users,
    groups,
    dmMessages,
    groupMessages,
    serverMessages,
    bansRes,
    timeoutsRes,
    audit,
  ] = await Promise.all([
    timedCount(headCountQuery(client, "users"), ms, "users"),
    timedCount(headCountQuery(client, "groups"), ms, "groups"),
    timedCount(headCountQuery(client, "dm_messages"), ms, "dm_messages"),
    timedCount(headCountQuery(client, "group_messages"), ms, "group_messages"),
    timedCount(headCountQuery(client, "server_messages"), ms, "server_messages"),
    withTimeout(banActive(), ms, { count: 0, error: { message: "timeout" } }),
    withTimeout(timeoutActive(), ms, { count: 0, error: { message: "timeout" } }),
    timedCount(headCountQuery(client, "moderation_actions"), ms, "moderation_actions"),
  ]);

  let bans = countFromResult(bansRes, "bans");
  if (bansRes && bansRes.error && isMissingColumnError(bansRes.error)) {
    bans = await timedCount(
      client.from("users").select("id", { count: "exact", head: true }).eq("is_banned", true),
      ms,
      "bans-fallback"
    );
  }

  let timeouts = countFromResult(timeoutsRes, "timeouts");
  if (
    timeoutsRes &&
    timeoutsRes.error &&
    (isMissingColumnError(timeoutsRes.error) || isMissingRelationError(timeoutsRes.error))
  ) {
    timeouts = 0;
  }

  return {
    users,
    groups,
    dmMessages,
    groupMessages,
    serverMessages,
    messages: dmMessages + groupMessages + serverMessages,
    bans,
    timeouts,
    audit,
    dmConversationKeys: 0,
  };
}

const ONLINE_SELECT = "id, username, display_name, avatar_url, last_seen, presence_status";
const ONLINE_SELECT_FALLBACK = "id, username, display_name, avatar_url, last_seen";

function normalizePresenceStatus(status) {
  const s = String(status || "online").toLowerCase();
  if (s === "idle" || s === "dnd" || s === "invisible" || s === "online") return s;
  return "online";
}

/**
 * Union this-isolate sockets with users last_seen (or last_login*) in the window.
 * Presence Map is empty on a Vercel isolate; last_seen is the durable signal.
 */
function mergeOnlineSignal({ liveRows = [], dbRows = [] } = {}) {
  const byId = new Map();
  for (const row of liveRows || []) {
    if (row == null || row.id == null) continue;
    const id = String(row.id);
    byId.set(id, { id, status: normalizePresenceStatus(row.status || row.presence_status), source: "presence" });
  }
  for (const row of dbRows || []) {
    if (row == null || row.id == null) continue;
    const id = String(row.id);
    if (byId.has(id)) continue;
    byId.set(id, { id, status: normalizePresenceStatus(row.presence_status || row.status), source: "last_seen" });
  }
  const statusCounts = { online: 0, idle: 0, dnd: 0, invisible: 0 };
  for (const row of byId.values()) statusCounts[row.status] += 1;
  const connectedCount = byId.size;
  const invisibleCount = statusCounts.invisible;
  return {
    connectedCount,
    visibleCount: connectedCount - invisibleCount,
    invisibleCount,
    statusCounts,
    ids: [...byId.keys()],
    source: (liveRows || []).length && (dbRows || []).length
      ? "presence+last_seen"
      : (dbRows || []).length
        ? "last_seen"
        : (liveRows || []).length
          ? "presence"
          : "last_seen",
  };
}

async function fetchRecentOnlineRows(client, opts) {
  const options = opts || {};
  const now = options.now || new Date();
  const windowMs = Math.max(1000, Number(options.windowMs) || ONLINE_WINDOW_MS);
  const timeoutMs = options.timeoutMs || 5000;
  const since = new Date((now instanceof Date ? now : new Date(now)).getTime() - windowMs).toISOString();
  if (!client) return [];

  async function query(select, column) {
    return withTimeout(
      client.from("users").select(select).gte(column, since).limit(1000),
      timeoutMs,
      { data: [], error: { message: "timeout" } }
    );
  }

  let res = await query(ONLINE_SELECT, "last_seen");
  if (res?.error && isMissingColumnError(res.error)) {
    const msg = String(res.error.message || "");
    if (/presence_status/i.test(msg)) res = await query(ONLINE_SELECT_FALLBACK, "last_seen");
    else if (/last_seen/i.test(msg)) {
      res = await query("id, last_login_at", "last_login_at");
      if (res?.error && isMissingColumnError(res.error)) {
        res = await query("id, last_login", "last_login");
      }
    }
  }
  return queryRows(res, "online-window");
}

/**
 * Site uptime from durable started_at. Never use isolate process.uptime().
 */
function siteUptimeFromStartedAt(startedAt, now = new Date()) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) {
    return { seconds: 0, days: 0, hours: 0, minutes: 0, label: "\u2014", durable: false, startedAt: null };
  }
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const seconds = Math.max(0, Math.floor((nowMs - start) / 1000));
  return { ...formatUptime(seconds), durable: true, startedAt: new Date(start).toISOString() };
}

/**
 * Payload keys Admin UI already reads (onlineUsers, uptime, totalUsers, groups, …).
 * Online prefers last_seen window + this-isolate presence. Uptime is site started_at, not process.
 */
function composeAdminStatsPayload(input) {
  const args = input || {};
  const uptime = args.uptime || 0;
  const roster = args.roster || {};
  const online = args.online || {};
  const memory = args.memory;
  const counts = args.counts || {};
  const connected = Number(online.connectedCount != null ? online.connectedCount : roster.connectedCount) || 0;
  const visible = Number(online.visibleCount != null ? online.visibleCount : roster.visibleCount) || 0;
  const invisible = Number(online.invisibleCount != null ? online.invisibleCount : roster.invisibleCount) || 0;
  const statusCounts = (online.statusCounts && typeof online.statusCounts === "object")
    ? online.statusCounts
    : (roster.statusCounts && typeof roster.statusCounts === "object" ? roster.statusCounts : {});
  const messages = Number(counts.messages) || 0;
  const uptimeSource = args.uptimeSource || (args.uptimeDurable ? "started_at" : "unknown");
  return {
    uptime: Number(uptime) || 0,
    onlineUsers: connected,
    connectedCount: connected,
    visibleCount: visible,
    invisibleCount: invisible,
    statusCounts,
    generalMessageCount: messages,
    dmConversationKeys: Number(counts.dmConversationKeys) || 0,
    bannedUsers: Number(counts.bans) || 0,
    auditEntries: Number(counts.audit) || 0,
    memory: memory && typeof memory === "object" ? memory : {},
    totalUsers: Number(counts.users) || 0,
    groups: Number(counts.groups) || 0,
    timeoutUsers: Number(counts.timeouts) || 0,
    dmMessageCount: Number(counts.dmMessages) || 0,
    groupMessageCount: Number(counts.groupMessages) || 0,
    serverMessageCount: Number(counts.serverMessages) || 0,
    sources: {
      online: online.source || "last_seen",
      uptime: uptimeSource,
      users: "db",
      messages: "db",
      bans: "db",
      audit: "db",
    },
  };
}

function mapModerationActionToAudit(row, usersById) {
  if (!row) return null;
  const byId = usersById || {};
  const actorId = row.actor_user_id || row.actorId || null;
  const target = row.target_user_id || row.target || null;
  const actorName =
    row.actorUsername ||
    row.actor_username ||
    row.actor ||
    (byId[actorId] && byId[actorId].username) ||
    null;
  return {
    id: row.id,
    at: row.created_at || row.at || null,
    actorId,
    actorUsername: actorName,
    actor: actorName,
    action: row.action_type || row.action || null,
    target,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
  };
}

function mergeAuditEntries(memoryEntries, dbEntries, limit) {
  const cap = Math.max(1, Math.min(500, Number(limit) || 8));
  const seen = new Set();
  const out = [];
  const mem = memoryEntries || [];
  const db = dbEntries || [];
  for (const raw of mem.concat(db)) {
    const row = raw && raw.action_type && !raw.action ? mapModerationActionToAudit(raw) : raw;
    if (!row || !row.id || seen.has(String(row.id))) continue;
    seen.add(String(row.id));
    out.push({
      id: row.id,
      at: row.at || row.created_at || null,
      actor: row.actorUsername || row.actor || null,
      actorUsername: row.actorUsername || row.actor || null,
      actorId: row.actorId || row.actor_user_id || null,
      action: row.action || row.action_type || null,
      target: row.target || row.target_user_id || null,
      meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    });
    if (out.length >= cap) break;
  }
  return out;
}

module.exports = {
  TZ,
  MEMORY_WATCH_MB,
  ERRORS_WATCH,
  istanbulDayKey,
  lastIstanbulDays,
  bucketSignupsByIstanbulDay,
  formatUptime,
  rssMb,
  countSince,
  queryRows,
  withTimeout,
  lastSeenMs,
  sortRecentlyActive,
  mergeRecentlyActive,
  deriveHealth,
  isMissingRelationError,
  isMissingColumnError,
  countFromResult,
  emptyDurableCounts,
  headCountQuery,
  fetchDurableAdminCounts,
  ONLINE_WINDOW_MS,
  isRecentlySeen,
  lastSeenValue,
  rowIsOnline,
  normalizePresenceStatus,
  mergeOnlineSignal,
  fetchRecentOnlineRows,
  siteUptimeFromStartedAt,
  composeAdminStatsPayload,
  mapModerationActionToAudit,
  mergeAuditEntries,
};
