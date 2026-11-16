"use strict";
// End-of-call DesCoin summary, pure rules: session aggregation, receipt, near-cap warning,
// featured item pick, payload (no leaks). Run from frontend/: node backend/lib/callCoinSummary.selftest.cjs
const assert = require("node:assert/strict");
const s = require("./callCoinSummary");

// Context keys: one per user and call; invalid input gives null.
assert.equal(s.contextKey({ context: "dm", peerId: "u-b" }), "dm:u-b");
assert.equal(s.contextKey({ context: "group", groupId: "g1" }), "group:g1");
assert.equal(s.contextKey({ context: "server", channelId: "AB-CD" }), "server:ab-cd");
assert.equal(s.contextKey({ context: "server" }), null);
assert.equal(s.contextKey({ context: "world", channelId: "x" }), null);
assert.equal(s.contextKey({ context: "dm", peerId: "x".repeat(200) }), null);
assert.deepEqual(s.parseContextKey("group:g1"), { context: "group", targetId: "g1" });

// Receipt: "DC-" + 4 hex, stable per session, different across sessions.
assert.match(s.receiptFor("abc"), /^DC-[0-9A-F]{4}$/);
assert.equal(s.receiptFor("abc"), s.receiptFor("abc"));
assert.notEqual(s.receiptFor("abc"), s.receiptFor("abd"));

// Aggregation: voice and screen share earnings and time, cap hits, people.
const t0 = Date.parse("2026-11-15T21:04:00Z");
const sess = s.createSession({ userId: "u-a", key: "dm:u-b", startedAt: t0, id: "sess-1" });
assert.equal(sess.context, "dm");
assert.equal(sess.targetId, "u-b");
assert.equal(sess.receipt, s.receiptFor("sess-1"));
assert.equal(s.shouldEmit(sess), false, "nothing earned, no summary");
for (let i = 0; i < 26; i += 1) s.addBeat(sess, { type: "voice", credited: 1, people: 2, at: t0 + i * 16_000 });
for (let i = 0; i < 8; i += 1) s.addBeat(sess, { type: "screenshare", credited: 2, people: 2 });
s.addBeat(sess, { type: "voice", credited: 0, capped: "hour", people: 3 });
s.addBeat(sess, { type: "bogus", credited: 99 });
assert.equal(sess.earnedVoice, 26);
assert.equal(sess.earnedScreenshare, 16);
assert.equal(s.earnedTotal(sess), 42);
assert.equal(sess.voiceBeats, 27, "a capped beat still counts as talk time");
assert.equal(sess.screenShared, true);
assert.equal(sess.hourCapReached, true);
assert.equal(sess.maxPeople, 3);
assert.equal(s.shouldEmit(sess), true);
const times = s.sessionTimes(sess, t0 + (38 * 60 + 12) * 1000);
assert.deepEqual(times, { durationSec: 2292, talkSec: 27 * 16, screenSec: 8 * 16 });
// Talk time never exceeds the call.
const short = s.createSession({ userId: "u-a", key: "group:g", startedAt: t0 });
for (let i = 0; i < 10; i += 1) s.addBeat(short, { type: "voice", credited: 1 });
assert.equal(s.sessionTimes(short, t0 + 30_000).talkSec, 30);
// Negative / junk credits never subtract.
s.addBeat(short, { type: "voice", credited: -5 });
assert.equal(short.earnedVoice, 10);

// Near-cap: only at >= 90%, the fullest cap wins, left never negative.
assert.equal(s.nearCapWarning({ voice: 100, screenshare: 10, global: 200 }), null);
assert.deepEqual(s.nearCapWarning({ voice: 172, screenshare: 0, global: 254 }), { kind: "voice", earned: 172, cap: 180, left: 8 });
assert.deepEqual(s.nearCapWarning({ voice: 172, screenshare: 0, global: 395 }), { kind: "global", earned: 395, cap: 400, left: 5 });
assert.deepEqual(s.nearCapWarning({ voice: 180, screenshare: 0, global: 260 }), { kind: "voice", earned: 180, cap: 180, left: 0 });
assert.deepEqual(s.nearCapWarning({ voice: 0, screenshare: 0, global: 420 }), { kind: "global", earned: 400, cap: 400, left: 0 });

// Featured item: sale > limited > timed; never owned, sold out, free or without a hook.
const now = Date.parse("2026-11-15T21:42:00Z");
const H = 3_600_000;
const items = [
  { id: "plain", name: "Plain", price_descoin: 100, list_price_descoin: 100, discount_pct: 0, stock_left: null },
  { id: "free", name: "Free", price_descoin: 0, discount_pct: 50 },
  { id: "owned-sale", name: "Owned", price_descoin: 300, list_price_descoin: 600, discount_pct: 50 },
  { id: "soldout", name: "Gone", price_descoin: 200, list_price_descoin: 400, discount_pct: 50, stock_left: 0, sold_out: true },
  { id: "timed", name: "Timed", price_descoin: 500, available_until: new Date(now + 5 * H).toISOString() },
  { id: "far", name: "Far", price_descoin: 500, available_until: new Date(now + 30 * 24 * H).toISOString() },
  { id: "limited", name: "Limited", price_descoin: 700, stock_left: 14, stock_limit: 50 },
  { id: "aurora", name: "Aurora", category: "avatar_effect", preview_url: "/api/shop/asset/aurora", price_descoin: 600, list_price_descoin: 800, discount_pct: 25, sale_ends_at: new Date(now + 5 * H + 12 * 60_000).toISOString(), stock_left: 14 },
];
const pick = s.pickFeaturedItem(items, { ownedIds: ["owned-sale"], balance: 1284, now });
assert.equal(pick.id, "aurora");
assert.equal(pick.kind, "sale");
assert.equal(pick.price, 600);
assert.equal(pick.listPrice, 800);
assert.equal(pick.discountPct, 25);
assert.equal(pick.stockLeft, 14);
assert.equal(pick.affordable, true);
assert.equal(pick.endsAt, new Date(now + 5 * H + 12 * 60_000).toISOString());
assert.equal(pick.imageUrl, "/api/shop/asset/aurora");
assert.equal(s.pickFeaturedItem(items, { ownedIds: ["owned-sale", "aurora"], balance: 0, now }).id, "limited");
assert.equal(s.pickFeaturedItem(items, { ownedIds: ["owned-sale", "aurora", "limited"], now }).id, "timed");
assert.equal(s.pickFeaturedItem(items, { ownedIds: ["owned-sale", "aurora", "limited", "timed"], now }), null, "no hook, no item");
assert.equal(s.pickFeaturedItem([], {}), null);
assert.equal(s.pickFeaturedItem(items, { ownedIds: ["owned-sale"], balance: 10, now }).affordable, false);
// Deterministic on ties.
const tie = [{ id: "b", price_descoin: 10, discount_pct: 10 }, { id: "a", price_descoin: 10, discount_pct: 10 }];
assert.equal(s.pickFeaturedItem(tie, { now }).id, "a");

// Payload: display info only, balance before/after, today before/after, warning.
const payload = s.buildSummaryPayload(sess, {
  endedAt: t0 + 2292_000,
  origin: "self",
  display: { id: "u-b", name: "Elif Yildiz", avatarUrl: "https://cdn/x.png", email: "secret@x", balance: 999 },
  balance: 1284,
  today: { voice: 172, screenshare: 82, global: 254 },
  streakDays: 4,
  featuredItem: pick,
});
assert.equal(payload.sessionId, "sess-1");
assert.equal(payload.receipt, sess.receipt);
assert.equal(payload.origin, "self");
assert.equal(payload.context, "dm");
assert.equal(payload.earnedTotal, 42);
assert.equal(payload.earnedVoice, 26);
assert.equal(payload.earnedScreenshare, 16);
assert.equal(payload.balance, 1284);
assert.equal(payload.balanceBefore, 1242);
assert.equal(payload.todayEarned, 254);
assert.equal(payload.todayBefore, 212);
assert.equal(payload.todayCap, 400);
assert.equal(payload.durationSec, 2292);
assert.equal(payload.streakDays, 4);
assert.equal(payload.people, 3);
assert.equal(payload.hourCapReached, true);
assert.deepEqual(payload.nearCap, { kind: "voice", earned: 172, cap: 180, left: 8 });
assert.deepEqual(Object.keys(payload.display).sort(), ["avatarUrl", "channelName", "id", "name", "serverId", "serverName"]);
assert.equal(JSON.stringify(payload).includes("secret@x"), false, "nothing beyond name / avatar leaks");
assert.equal(s.buildSummaryPayload(sess, { origin: "weird" }).origin, "server");

console.log("callCoinSummary.selftest ok");
