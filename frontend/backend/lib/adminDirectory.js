"use strict";

const FILTERS = new Set(["all", "online", "admin", "banned", "timeout", "new", "deleting"]);
const SORTS = new Set(["name", "newest", "seen"]);
const RICH_COLUMNS =
  "id, username, display_name, avatar_url, email, created_at, last_seen, is_admin, is_banned, auth_provider, two_factor_enabled, deletion_requested_at, timeout_until";
const CORE_COLUMNS = "id, username, display_name, avatar_url, created_at, last_seen, is_admin";

function isMissingColumnError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "42703" || /column .* does not exist/i.test(msg) || /schema cache/i.test(msg);
}

/** Strip characters that break a PostgREST `or` filter. */
function sanitizeSearch(raw) {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .replace(/["\\(),]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function searchOr(search, includeEmail) {
  if (!search) return "";
  const quoted = `"%${search}%"`;
  const cols = includeEmail ? ["username", "display_name", "email"] : ["username", "display_name"];
  return cols.map((col) => `${col}.ilike.${quoted}`).join(",");
}

function parseDirectoryQuery(query, now = new Date()) {
  const src = query || {};
  const filter = FILTERS.has(src.filter) ? src.filter : "all";
  const sort = SORTS.has(src.sort) ? src.sort : "name";
  const page = Math.max(0, parseInt(src.page || "0", 10) || 0);
  const limit = Math.min(60, Math.max(1, parseInt(src.limit || "40", 10) || 40));
  const clock = now instanceof Date ? now : new Date(now);
  const since = new Date(clock.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    filter,
    sort,
    page,
    limit,
    search: sanitizeSearch(src.q),
    since,
    nowIso: clock.toISOString(),
  };
}

function mapDirectoryUser(row, ctx = {}) {
  if (!row) return null;
  const presence = ctx.presence || null;
  const timeoutUntil = row.timeout_until || null;
  const timeoutMs = timeoutUntil ? new Date(timeoutUntil).getTime() : 0;
  const nowMs = ctx.now instanceof Date ? ctx.now.getTime() : Date.now();
  const live = Boolean(ctx.live);
  const status = live ? presence?.status || "online" : "offline";
  return {
    id: row.id,
    username: row.username || "",
    displayName: row.display_name || row.username || "",
    avatarUrl: row.avatar_url || presence?.avatar_url || null,
    email: row.email || null,
    createdAt: row.created_at || null,
    lastSeen: row.last_seen || null,
    isAdmin: Boolean(row.is_admin) || row.username === "admin",
    banned: Boolean(row.is_banned) || Boolean(ctx.bannedMemory),
    timedOut: Number.isFinite(timeoutMs) && timeoutMs > nowMs,
    twoFactor: Boolean(row.two_factor_enabled),
    pendingDeletion: Boolean(row.deletion_requested_at),
    provider: row.auth_provider || null,
    isOnline: live,
    status,
  };
}

async function countOf(run) {
  const { count, error } = await run();
  if (error) {
    if (isMissingColumnError(error)) return 0;
    throw error;
  }
  return count || 0;
}

async function loadDirectorySummary(client, nowIso) {
  const head = (build) => countOf(() => build(client.from("users").select("id", { count: "exact", head: true })));
  const [total, admins, banned, timeouts, fresh, deleting] = await Promise.all([
    head((q) => q),
    head((q) => q.or("is_admin.eq.true,username.eq.admin")),
    head((q) => q.eq("is_banned", true)),
    head((q) => q.gt("timeout_until", nowIso)),
    head((q) => q.gte("created_at", new Date(new Date(nowIso).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())),
    head((q) => q.not("deletion_requested_at", "is", null)),
  ]);
  return { total, admins, banned, timeouts, fresh, deleting };
}

function applyDirectoryFilters(query, plan, onlineIds, includeEmail) {
  let next = query;
  const or = searchOr(plan.search, includeEmail);
  if (or) next = next.or(or);
  if (plan.filter === "admin") next = next.or("is_admin.eq.true,username.eq.admin");
  if (plan.filter === "banned") next = next.eq("is_banned", true);
  if (plan.filter === "timeout") next = next.gt("timeout_until", plan.nowIso);
  if (plan.filter === "new") next = next.gte("created_at", plan.since);
  if (plan.filter === "deleting") next = next.not("deletion_requested_at", "is", null);
  if (plan.filter === "online") next = next.in("id", onlineIds);
  if (plan.sort === "newest") next = next.order("created_at", { ascending: false });
  else if (plan.sort === "seen") next = next.order("last_seen", { ascending: false, nullsFirst: false });
  else next = next.order("username", { ascending: true });
  const from = plan.page * plan.limit;
  return next.range(from, from + plan.limit - 1);
}

async function loadDirectoryPage(client, plan, onlineIds) {
  const ids = Array.isArray(onlineIds) ? onlineIds.map(String).filter(Boolean).slice(0, 200) : [];
  if (plan.filter === "online" && ids.length === 0) return { rows: [], filtered: 0 };
  const run = (columns, includeEmail) =>
    applyDirectoryFilters(
      client.from("users").select(columns, { count: "exact" }),
      plan,
      ids,
      includeEmail
    );
  let result = await run(RICH_COLUMNS, true);
  if (result.error && isMissingColumnError(result.error)) {
    result = await run(CORE_COLUMNS, false);
  }
  if (result.error) throw result.error;
  return { rows: result.data || [], filtered: result.count ?? (result.data || []).length };
}

module.exports = {
  FILTERS,
  SORTS,
  sanitizeSearch,
  searchOr,
  parseDirectoryQuery,
  mapDirectoryUser,
  loadDirectorySummary,
  loadDirectoryPage,
  isMissingColumnError,
};
