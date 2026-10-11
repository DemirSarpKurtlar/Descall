"use strict";

const {
  sanitizeSearch,
  searchOr,
  parseDirectoryQuery,
  mapDirectoryUser,
} = require("./adminDirectory");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(sanitizeSearch('  a"b,c(d)  ') === "abcd", "search strips filter syntax");
assert(sanitizeSearch("x".repeat(90)).length === 80, "search is capped");
assert(searchOr("ada@x.com", true) === 'username.ilike."%ada@x.com%",display_name.ilike."%ada@x.com%",email.ilike."%ada@x.com%"', "email dots stay quoted");
assert(!searchOr("", true), "empty search adds no filter");

const plan = parseDirectoryQuery({ page: "-3", limit: "999", filter: "nope", sort: "seen", q: "Demirr" }, new Date("2026-10-11T00:00:00Z"));
assert(plan.page === 0 && plan.limit === 60 && plan.filter === "all" && plan.sort === "seen", "query is clamped");
assert(plan.search === "Demirr", "search kept");
assert(plan.since === "2026-10-04T00:00:00.000Z", "new window is seven days");

const admin = mapDirectoryUser(
  { id: "1", username: "admin", display_name: "Demirr", is_admin: false, is_banned: false, timeout_until: "2026-10-12T00:00:00Z", deletion_requested_at: "2026-10-01T00:00:00Z", two_factor_enabled: true, auth_provider: "google", email: "a@b.c" },
  { live: true, presence: { status: "dnd" }, now: new Date("2026-10-11T00:00:00Z") }
);
assert(admin.isAdmin && admin.isOnline && admin.status === "dnd" && admin.timedOut && admin.pendingDeletion && admin.twoFactor, "admin row flags");

const banned = mapDirectoryUser(
  { id: "2", username: "ada", is_banned: false, timeout_until: "2026-10-01T00:00:00Z" },
  { bannedMemory: true, now: new Date("2026-10-11T00:00:00Z") }
);
assert(banned.banned && !banned.timedOut && !banned.isOnline, "memory ban and expired timeout");

console.log("adminDirectory.selftest ok");
