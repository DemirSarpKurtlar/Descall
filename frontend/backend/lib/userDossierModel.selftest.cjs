"use strict";
// node backend/lib/userDossierModel.selftest.cjs
// Kullanıcı dosyası: masking, explainable risk, timeline merge, activity buckets, linked accounts, notes.
const assert = require("node:assert/strict");
const m = require("./userDossierModel");

// Masking: raw IPs and full e-mails never reach the dossier.
assert.equal(m.maskIp("88.230.12.4"), "88.230.x.x");
assert.equal(m.maskIp("::ffff:10.1.2.3"), "10.1.x.x");
assert.equal(m.maskIp("2a02:4780:12:34::1"), "2a02:4780:x:x");
assert.equal(m.maskIp("unknown"), null);
assert.equal(m.maskIp(""), null);
assert.equal(m.maskEmail("kaan@gmail.com"), "k***@gmail.com");
assert.equal(m.maskEmail("nope"), null);

// Risk: the score is the sum of the reasons, clamped, with the same weights as userReports.scoreRisk.
let r = m.scoreDossierRisk({ openReports: 1, historyCount: 1, linkedBanned: 1, accountAgeDays: 210 });
assert.deepEqual(r.reasons.map((x) => [x.id, x.points]), [["open_reports", 15], ["prior_sanctions", 4], ["linked_banned", 15], ["account_age", 0]]);
assert.equal(r.score, 34);
assert.equal(r.level, "watch");
assert.deepEqual(r.flags, ["open_reports", "prior_sanctions", "linked_banned"]);
r = m.scoreDossierRisk({ openReports: 5, totalReports: 9, banned: true, suspiciousSignup: true, historyCount: 4, linkedBanned: 2, accountAgeDays: 2 });
assert.equal(r.score, 100, "clamped");
assert.equal(r.level, "critical");
assert.ok(r.reasons.some((x) => x.id === "new_account" && x.points === 5));
assert.equal(m.scoreDossierRisk({}).score, 0);
assert.equal(m.scoreDossierRisk({ timedOut: true }).reasons[0].id, "timeout");
assert.equal(m.scoreDossierRisk({ banned: true, timedOut: true }).reasons.filter((x) => x.id === "timeout").length, 0, "ban wins over timeout");

// Timeline: one list, newest first, deduped by type + id, invalid times dropped.
const tl = m.mergeTimeline([
  [{ type: "report", id: "1", at: "2026-11-14T10:00:00Z" }, { type: "report", id: "1", at: "2026-11-14T10:00:00Z" }],
  [{ type: "login", id: "1", at: "2026-11-14T12:00:00Z" }, { type: "login", id: "2", at: "nope" }],
  [{ type: "signup", id: "u", at: "2026-04-18T23:15:00Z" }, null, { id: "x" }],
]);
assert.deepEqual(tl.map((x) => `${x.type}:${x.id}`), ["login:1", "report:1", "signup:u"]);
assert.equal(m.mergeTimeline([[{ type: "a", id: "1", at: "2026-01-01" }, { type: "a", id: "2", at: "2026-01-02" }]], { limit: 1 })[0].id, "2");
assert.equal(m.groupOf("ledger"), "wallet");
assert.equal(m.groupOf("login"), "security");
assert.equal(m.groupOf("whatever"), "admin");

// Activity: Istanbul days, counts only.
const now = Date.parse("2026-11-14T12:00:00Z");
const a = m.activitySeries(
  {
    messages: ["2026-11-14T08:00:00Z", "2026-11-14T09:00:00Z", "2026-11-13T22:30:00Z", "2026-09-01T00:00:00Z"],
    voice: [{ at: "2026-11-13T10:00:00Z", seconds: 5400 }, { at: "2025-01-01T00:00:00Z", seconds: 99999 }],
    screens: ["2026-11-12T10:00:00Z"],
  },
  { days: 30, now }
);
assert.equal(a.days.length, 30);
assert.equal(a.days[29].day, "2026-11-14");
assert.equal(a.days[29].messages, 3, "22:30Z on the 13th is the 14th in Istanbul");
assert.equal(a.totals.messages, 3, "older than 30 days not counted");
assert.equal(a.totals.voiceSeconds, 5400);
assert.equal(a.days[28].voiceMinutes, 90);
assert.equal(a.totals.screenShares, 1);
assert.equal(a.totals.activeDays, 3);
assert.equal(m.voiceSeconds({ duration_seconds: 120 }), 120);
assert.equal(m.voiceSeconds({ joined_at: "2026-11-14T10:00:00Z", left_at: "2026-11-14T10:30:00Z" }), 1800);
assert.equal(m.voiceSeconds({ joined_at: "2026-11-14T10:00:00Z" }, Date.parse("2026-11-14T10:10:00Z")), 600, "open row counts to now");
assert.equal(m.voiceSeconds({}), 0);

// Linked accounts: device before network, crowded hashes ignored, links + sessions merged.
const crowd = Array.from({ length: 30 }, (_, i) => ({ user_id: `c${i}`, kind: "subnet", hash: "campus" }));
const linked = m.linkedAccounts("me", {
  mine: [{ kind: "fp", hash: "f1", last_seen: "2026-11-10T00:00:00Z" }, { kind: "subnet", hash: "n1" }, { kind: "subnet", hash: "campus" }],
  seen: [
    { user_id: "me", kind: "fp", hash: "f1" },
    { user_id: "emre", kind: "fp", hash: "f1", last_seen: "2026-11-12T00:00:00Z" },
    { user_id: "mert", kind: "subnet", hash: "n1", last_seen: "2026-10-01T00:00:00Z" },
    ...crowd,
  ],
  links: [{ user_a: "zed", user_b: "me", kinds: ["same_subnet", "signup_close"], last_seen: "2026-11-01T00:00:00Z" }],
  sessionDevice: [{ userId: "ali", at: "2026-11-13T00:00:00Z" }],
  sessionIp: [{ userId: "mert", at: "2026-11-11T00:00:00Z" }, { userId: "me" }],
});
assert.deepEqual(linked.map((l) => l.userId), ["ali", "emre", "mert", "zed"], "same device first, then more kinds, then the most recent");
assert.deepEqual(linked[1].kinds, ["device"]);
assert.equal(linked[1].lastSharedAt, "2026-11-10T00:00:00Z", "the earlier of the two last-seen times");
assert.deepEqual(linked.find((l) => l.userId === "mert").kinds, ["same_ip", "network"]);
assert.deepEqual(linked.find((l) => l.userId === "zed").kinds, ["network", "signup_close"]);
assert.ok(!linked.some((l) => l.userId.startsWith("c")), "campus-size hash is not evidence");

// Notes.
assert.equal(m.cleanNote("  hi \r\n there "), "hi \n there");
assert.equal(m.cleanNote("   "), null);
assert.equal(m.cleanNote("x".repeat(2001)), null);
assert.equal(m.cleanNote("x".repeat(2000)).length, 2000);

console.log("userDossierModel.selftest: ok");
