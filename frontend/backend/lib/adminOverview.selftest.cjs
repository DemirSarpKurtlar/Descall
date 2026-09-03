"use strict";

const {
  istanbulDayKey,
  lastIstanbulDays,
  bucketSignupsByIstanbulDay,
  formatUptime,
  rssMb,
  countSince,
  queryRows,
  withTimeout,
  lastSeenMs,
  mergeRecentlyActive,
  deriveHealth,
  isRecentlySeen,
  rowIsOnline,
} = require("./adminOverview");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(istanbulDayKey(new Date("2026-08-25T22:30:00Z")) === "2026-08-26", "Istanbul day rolls after 21:00 UTC");
assert(formatUptime(90).label === "1m", "sub-hour uptime");
assert(formatUptime(3700).label === "1h 1m", "hour uptime");
assert(formatUptime(90000).label === "1d 1h", "day uptime");
assert(rssMb({ rss: 100 * 1024 * 1024 }) === 100, "rss mb");

const days = lastIstanbulDays(7, new Date("2026-08-26T10:00:00+03:00"));
assert(days.length === 7 && days[days.length - 1] === "2026-08-26", "last day is today Istanbul");
assert(days[0] === "2026-08-20", "seven-day window");

const spark = bucketSignupsByIstanbulDay(
  [
    { created_at: "2026-08-26T08:00:00+03:00" },
    { signup_at: "2026-08-26T09:00:00+03:00" },
    { created_at: "2026-08-20T12:00:00+03:00" },
    { created_at: "2026-08-19T12:00:00+03:00" },
  ],
  days
);
assert(spark[spark.length - 1].signups === 2, "today buckets");
assert(spark[0].signups === 1, "oldest day buckets");
assert(spark.every((row) => row.date && Number.isFinite(row.signups)), "spark rows");

const quiet = deriveHealth({});
assert(quiet.level === "ok" && quiet.alerts.length === 0, "healthy product");

const reports = deriveHealth({ openReports: 2 });
assert(reports.level === "watch" && reports.alerts[0].tab === "reports", "open reports are watch");

const hot = deriveHealth({ openReports: 4, hotTargets: 1 });
assert(hot.level === "high" && hot.alerts.some((a) => a.id === "hot_reports"), "hot targets escalate");

const maint = deriveHealth({ maintenance: true, openReports: 1 });
assert(maint.level === "critical", "maintenance is critical");

assert(countSince([{ at: new Date().toISOString() }, { at: "2020-01-01T00:00:00Z" }], Date.now() - 3600_000) === 1, "hour window");
assert(queryRows({ data: [{ id: 1 }] }).length === 1, "query rows pass through");
assert(queryRows({ error: { message: "Not found" } }).length === 0, "query error becomes empty, not throw");
assert(queryRows(null).length === 0, "missing result is empty");

assert(lastSeenMs({ last_seen: "2026-08-26T10:00:00Z" }) > lastSeenMs({ lastSeen: "2026-08-26T09:00:00Z" }), "last seen prefers newer");
assert(lastSeenMs({}) === 0, "missing last seen is zero");

const merged = mergeRecentlyActive({
  liveRows: [
    { id: "live-old", username: "liveold", last_seen: "2026-08-26T08:00:00Z", status: "idle" },
    { id: "both", username: "socketname", last_seen: "2026-08-26T12:00:00Z", status: "dnd", avatar_url: "live.png" },
  ],
  dbRows: [
    { id: "both", username: "dbuser", display_name: "Ada", displayName: "Ada", last_seen: "2026-08-26T09:00:00Z", created_at: "2026-01-01T00:00:00Z", avatar_url: "db.png", isOnline: false, status: "offline" },
    { id: "offline-new", username: "fresh", last_seen: "2026-08-26T11:00:00Z", isOnline: false },
    { id: "offline-old", username: "stale", last_seen: "2026-08-20T00:00:00Z", isOnline: false },
    { id: null, username: "skip" },
  ],
  limit: 10,
});
assert(merged.length === 4, "merged unique people");
assert(merged[0].id === "both" && merged[0].isOnline === true, "online first");
assert(merged[0].displayName === "Ada", "db display name fills live gap");
assert(merged[0].last_seen === "2026-08-26T12:00:00Z", "live last_seen wins");
assert(merged[0].status === "dnd", "live status wins");
assert(merged[0].created_at === "2026-01-01T00:00:00Z", "db created_at fills live gap");
assert(merged[1].id === "live-old" && merged[1].isOnline === true, "other live stays online");
assert(merged[2].id === "offline-new" && merged[2].isOnline === false, "recent offline after live");
assert(merged[3].id === "offline-old", "oldest last");

const capped = mergeRecentlyActive({
  liveRows: [{ id: 1, last_seen: "2026-08-26T10:00:00Z" }],
  dbRows: [
    { id: 2, last_seen: "2026-08-26T09:00:00Z", isOnline: false },
    { id: 3, last_seen: "2026-08-26T08:00:00Z", isOnline: false },
  ],
  limit: 2,
});
assert(capped.length === 2 && capped[0].id === "1", "limit keeps online then newest");

const nowIso = "2026-08-30T00:10:00Z";
const nowMs = Date.parse(nowIso);
assert(isRecentlySeen("2026-08-30T00:08:00Z", nowMs) === true, "2 min ago is online");
assert(isRecentlySeen("2026-08-30T00:00:00Z", nowMs) === false, "10 min ago is offline");
assert(rowIsOnline({ id: "u1", last_seen: "2026-08-30T00:08:00Z" }, { now: nowMs }) === true, "row last_seen window");
assert(rowIsOnline({ id: "u1", last_seen: "2026-08-30T00:00:00Z" }, { now: nowMs, liveIds: new Set(["u1"]) }) === true, "live id wins");
const hotSeen = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const oldSeen = new Date(Date.now() - 20 * 60 * 1000).toISOString();
const list = mergeRecentlyActive({
  liveRows: [],
  dbRows: [
    { id: "hot", last_seen: hotSeen, isOnline: false, status: "offline" },
    { id: "old", last_seen: oldSeen, isOnline: false },
  ],
  limit: 10,
});
assert(list[0].id === "hot" && list[0].isOnline === true && list[0].status === "online", "list marks last_seen window online without presence");
assert(list[1].id === "old" && list[1].isOnline === false, "older last_seen stays offline");
assert(list.filter((r) => r.isOnline).length === 1, "online list count matches window");


const {
  isMissingRelationError,
  isMissingColumnError,
  countFromResult,
  composeAdminStatsPayload,
  fetchDurableAdminCounts,
  mapModerationActionToAudit,
  mergeAuditEntries,
  mergeOnlineSignal,
  siteUptimeFromStartedAt,
  fetchRecentOnlineRows,
} = require("./adminOverview");

assert(isMissingRelationError({ code: "42P01" }) === true, "missing table code");
assert(isMissingColumnError({ code: "42703" }) === true, "missing column code");
assert(countFromResult({ count: 12 }) === 12, "count pass through");
assert(countFromResult({ error: { code: "42P01", message: "relation x does not exist" } }) === 0, "missing table is 0");
assert(countFromResult({ count: "nope" }) === 0, "non-numeric count is 0");
assert(countFromResult(null) === 0, "null result is 0");

const mergedOnline = mergeOnlineSignal({
  liveRows: [{ id: "live1", status: "idle" }, { id: "both", status: "dnd" }],
  dbRows: [
    { id: "both", presence_status: "online" },
    { id: "db1", presence_status: "online" },
    { id: "ghost", presence_status: "invisible" },
  ],
});
assert(mergedOnline.connectedCount === 4, "union live + last_seen");
assert(mergedOnline.visibleCount === 3, "invisible excluded from visible");
assert(mergedOnline.invisibleCount === 1, "invisible counted");
assert(mergedOnline.statusCounts.dnd === 1 && mergedOnline.statusCounts.idle === 1, "live status wins overlap");
assert(mergedOnline.source === "presence+last_seen", "mixed source");

const emptyOnline = mergeOnlineSignal({ liveRows: [], dbRows: [] });
assert(emptyOnline.connectedCount === 0 && emptyOnline.source === "last_seen", "empty still last_seen source");

const up = siteUptimeFromStartedAt("2026-08-01T00:00:00.000Z", new Date("2026-08-03T03:00:00.000Z"));
assert(up.durable === true && up.seconds === 2 * 86400 + 3 * 3600, "started_at seconds");
assert(up.label === "2d 3h", "started_at label");
const missingUp = siteUptimeFromStartedAt(null);
assert(missingUp.seconds === 0 && missingUp.durable === false && missingUp.label === "\u2014", "no started_at is em-dash not isolate seconds");

const stats = composeAdminStatsPayload({
  uptime: up.seconds,
  uptimeSource: "started_at",
  uptimeDurable: true,
  roster: { connectedCount: 0, visibleCount: 0, invisibleCount: 0, statusCounts: { online: 0 } },
  online: mergedOnline,
  memory: { rss: 10 },
  counts: {
    users: 80,
    groups: 6,
    dmMessages: 100,
    groupMessages: 20,
    serverMessages: 5,
    messages: 125,
    bans: 3,
    timeouts: 2,
    audit: 9,
    dmConversationKeys: 0,
  },
});
assert(stats.onlineUsers === 4, "onlineUsers from last_seen union");
assert(stats.connectedCount === 4, "connectedCount same key");
assert(stats.visibleCount === 3, "visibleCount same key");
assert(stats.totalUsers === 80, "users from db");
assert(stats.groups === 6, "groups from db");
assert(stats.generalMessageCount === 125, "message total from db");
assert(stats.bannedUsers === 3, "bans from db");
assert(stats.auditEntries === 9, "audit from db");
assert(stats.timeoutUsers === 2, "timeouts from db");
assert(stats.uptime === up.seconds, "uptime from started_at");
assert(stats.sources.online === "presence+last_seen" && stats.sources.uptime === "started_at", "sources labeled");
assert(stats.sources.uptime !== "process", "never label isolate process uptime");

const ramZero = composeAdminStatsPayload({
  uptime: 0,
  uptimeSource: "unknown",
  roster: { connectedCount: 0, visibleCount: 0, invisibleCount: 0 },
  counts: { users: 10, messages: 0 },
});
assert(ramZero.onlineUsers === 0 && ramZero.uptime === 0, "honest zero when no last_seen and no started_at");
assert(ramZero.sources.uptime === "unknown", "missing started_at is unknown not process");

const mapped = mapModerationActionToAudit(
  { id: "a1", action_type: "ban", actor_user_id: "u1", target_user_id: "u2", created_at: "2026-08-30T00:00:00Z" },
  { u1: { username: "admin" } }
);
assert(mapped.action === "ban" && mapped.actor === "admin" && mapped.target === "u2", "moderation row maps");

const auditMerged = mergeAuditEntries(
  [{ id: "mem1", at: "2026-08-30T01:00:00Z", actorUsername: "dimaru", action: "kick", target: "x" }],
  [{ id: "a1", action_type: "ban", actor_user_id: "u1", target_user_id: "u2", created_at: "2026-08-29T00:00:00Z" }],
  8
);
assert(auditMerged.length === 2 && auditMerged[0].id === "mem1" && auditMerged[1].action === "ban", "memory first then db");
assert(mergeAuditEntries([{ id: "x" }, { id: "x" }], [], 8).length === 1, "dedupe");

function mockCountClient(resolver) {
  return {
    from(table) {
      const ctx = { table, eq: null, or: null, not: null, gt: null };
      const chain = {
        select() { return chain; },
        eq(col, val) { ctx.eq = { col, val }; return chain; },
        or(expr) { ctx.or = expr; return chain; },
        not(col, op, val) { ctx.not = { col, op, val }; return chain; },
        gt(col, val) { ctx.gt = { col, val }; return chain; },
        then(onFulfilled, onRejected) {
          return Promise.resolve(resolver(ctx)).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}


(async () => {
  assert(await withTimeout(Promise.resolve(7), 80, 0) === 7, "fast promise keeps value");
  assert(await withTimeout(new Promise(() => {}), 25, "timeout") === "timeout", "slow promise times out");
  const delayedReject = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("nope")), 5);
  });
  assert((await withTimeout(delayedReject, 80, { error: true })).error === true, "reject uses fallback");
  const client = mockCountClient((ctx) => {
    if (ctx.table === "users" && ctx.eq && ctx.eq.col === "is_banned") return { count: 3, error: null };
    if (ctx.table === "users" && ctx.gt && ctx.gt.col === "timeout_until") return { count: 2, error: null };
    if (ctx.table === "users") return { count: 80, error: null };
    if (ctx.table === "groups") return { count: 6, error: null };
    if (ctx.table === "dm_messages") return { count: 100, error: null };
    if (ctx.table === "group_messages") return { count: 20, error: null };
    if (ctx.table === "server_messages") return { count: 5, error: null };
    if (ctx.table === "moderation_actions") return { count: 9, error: null };
    return { count: 0, error: null };
  });
  const durable = await fetchDurableAdminCounts(client, { now: new Date("2026-08-30T00:00:00Z"), timeoutMs: 200 });
  assert(durable.users === 80, "mocked users count");
  assert(durable.groups === 6, "mocked groups count");
  assert(durable.dmMessages === 100 && durable.groupMessages === 20 && durable.serverMessages === 5, "mocked message parts");
  assert(durable.messages === 125, "message sum");
  assert(durable.bans === 3 && durable.timeouts === 2, "mocked sanctions");
  assert(durable.audit === 9, "mocked audit");
  assert(durable.dmConversationKeys === 0, "unknown conv keys stay 0");

  const missingGroups = mockCountClient((ctx) => {
    if (ctx.table === "group_messages") return { count: 0, error: { code: "42P01", message: "relation group_messages does not exist" } };
    if (ctx.table === "users" && ctx.eq && ctx.eq.col === "is_banned") return { count: 1, error: null };
    if (ctx.table === "users" && ctx.gt) return { count: 0, error: null };
    if (ctx.table === "users") return { count: 10, error: null };
    if (ctx.table === "dm_messages") return { count: 7, error: null };
    return { count: 0, error: null };
  });
  const partial = await fetchDurableAdminCounts(missingGroups, { timeoutMs: 200 });
  assert(partial.groupMessages === 0 && partial.dmMessages === 7 && partial.messages === 7, "missing table does not wipe other counts");
  assert(partial.users === 10 && partial.bans === 1, "presence-empty isolate still has db totals");

  const onlineClient = {
    from(table) {
      const chain = {
        select() { return chain; },
        gte(col, val) { chain._gte = { col, val }; return chain; },
        limit() { return chain; },
        then(onFulfilled, onRejected) {
          if (chain._gte && chain._gte.col === "last_seen") {
            return Promise.resolve({
              data: [{ id: "u1", last_seen: chain._gte.val, presence_status: "online" }],
              error: null,
            }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
  const recent = await fetchRecentOnlineRows(onlineClient, {
    now: new Date("2026-08-30T00:10:00Z"),
    windowMs: 5 * 60 * 1000,
    timeoutMs: 200,
  });
  assert(recent.length === 1 && recent[0].id === "u1", "last_seen window returns rows");

  console.log("adminOverview.selftest.cjs ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
