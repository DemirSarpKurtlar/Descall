import { composeOverviewFromLegacy, rosterPerson, formatUptimeLabel, mergeOverviewWithDb, isOnlineNow } from "./adminOverviewFallback.js";

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(rosterPerson(null) === null, "skip empty");
assert(rosterPerson({ id: "u1", username: "ada", display_name: "Ada", last_seen: "2026-08-26T01:00:00Z", isOnline: true }).displayName === "Ada", "display name");
assert(rosterPerson({ id: "u1", username: "ada", last_seen: "x" }).isOnline === false, "offline default");
assert(formatUptimeLabel(3700) === "1h 1m", "uptime");

const payload = composeOverviewFromLegacy({
  pulse: {
    newlyJoined: [
      { id: "n1", username: "new", created_at: "2026-08-26T08:00:00+03:00", first_touch_source: "discord" },
    ],
    recentlyActive: [
      { id: "a1", username: "old", display_name: "Old", last_seen: "2026-08-26T01:00:00Z", isOnline: true, status: "idle" },
      { id: "a2", username: "gone", last_seen: "2026-08-25T01:00:00Z", isOnline: false },
    ],
    connectedCount: 3,
    visibleCount: 2,
    invisibleCount: 1,
  },
  stats: { uptime: 90, connectedCount: 3, memory: { rss: 50 * 1024 * 1024 }, bannedUsers: 4 },
  inbox: { openCount: 2, uniqueTargets: 1, hotTargets: [], autoOpenUserId: null },
  system: { config: { maintenanceMode: false, chatFrozen: false }, flaggedCount: 1 },
  audit: { entries: [{ id: "e1", at: "2026-08-26T01:00:00Z", actorUsername: "admin", action: "ban", target: "x" }] },
  feedback: { new: 5 },
  sanctions: { bans: [{ id: 1 }], timeouts: [] },
});

assert(payload.newlyJoined.length === 1 && payload.newlyJoined[0].source === "discord", "joined mapped");
assert(payload.recentlyActive[0].status === "idle", "active status");
assert(payload.live.connected === 3, "live count from stats");
assert(payload.product.newFeedback === 5, "feedback");
assert(payload.safety.openReports === 2 && payload.safety.bans === 1, "safety");
assert(payload.system.uptime.label === "1m" && payload.system.rssMb === 50, "system");
assert(payload.recentAudit[0].actor === "admin", "audit actor");
assert(payload.health.level === "watch", "open reports are watch");

const empty = composeOverviewFromLegacy({});
assert(empty.live.connected === 0 && empty.newlyJoined.length === 0, "empty parts stay empty");
assert(empty.health.level === "ok", "no false critical");

const now = Date.now();
const hot = new Date(now - 2 * 60 * 1000).toISOString();
const old = new Date(now - 20 * 60 * 1000).toISOString();
assert(isOnlineNow({ lastSeen: hot, isOnline: false }) === true, "recent lastSeen is online");
assert(isOnlineNow({ lastSeen: old, isOnline: false }) === false, "stale lastSeen stays offline");
assert(rosterPerson({ id: "d", username: "Demirr", last_seen: hot, isOnline: false }).isOnline === true, "roster last_seen window");

const mismatched = mergeOverviewWithDb(
  {
    live: { connected: 0, visible: 0, people: [] },
    product: {},
    recentlyActive: [{ id: "d", username: "Demirr", lastSeen: old, isOnline: false, status: "offline" }],
    newlyJoined: [],
  },
  { activeToday: 1, signupsToday: 0 },
  null
);
assert(mismatched.live.connected === 0, "activeToday must not become online count");
assert(mismatched.recentlyActive[0].isOnline === false, "stale Demirr stays offline");

const aligned = mergeOverviewWithDb(
  {
    live: { connected: 0, visible: 0, people: [] },
    product: {},
    recentlyActive: [{ id: "d", username: "Demirr", lastSeen: hot, isOnline: false, status: "offline" }],
    newlyJoined: [],
  },
  { activeToday: 1 },
  null
);
assert(aligned.live.connected === 1 && aligned.recentlyActive[0].isOnline === true, "count and list both follow last_seen window");
assert(aligned.recentlyActive[0].status === "online", "status flips to online with last_seen");

console.log("adminOverviewFallback.selftest.mjs ok");
