"use strict";
// node backend/lib/onboarding/model.selftest.cjs
// "Başla panosu" pure rules: window, checklist, ranking, intro channel, reply time, crowd hours.
const assert = require("node:assert/strict");
const m = require("./model");

const H = 3600000;
const D = 86400000;
// 27 Nov 2026 14:00 Istanbul = 11:00Z
const NOW = Date.parse("2026-11-27T11:00:00Z");

// Window: day 1 is the sign-up day (Istanbul calendar), day 5 is the last one.
assert.equal(m.dayOfAccount("2026-11-27T05:00:00Z", NOW), 1);
assert.equal(m.dayOfAccount("2026-11-26T22:30:00Z", NOW), 1, "01:30 Istanbul on the 27th is still day 1");
assert.equal(m.dayOfAccount("2026-11-26T20:00:00Z", NOW), 2, "23:00 Istanbul the day before is day 2");
assert.equal(m.dayOfAccount("2026-11-23T10:00:00Z", NOW), 5);
assert.equal(m.inWindow("2026-11-23T10:00:00Z", NOW), true);
assert.equal(m.inWindow("2026-11-22T10:00:00Z", NOW), false, "day 6 is past the window");
assert.equal(m.inWindow(null, NOW), false);
assert.equal(m.dayOfAccount("garbage", NOW), null);

// Quiet hours 00:00-08:00 Istanbul.
assert.equal(m.isQuietHour(Date.parse("2026-11-27T21:30:00Z")), true, "00:30 Istanbul");
assert.equal(m.isQuietHour(Date.parse("2026-11-27T04:59:00Z")), true, "07:59 Istanbul");
assert.equal(m.isQuietHour(Date.parse("2026-11-27T05:00:00Z")), false, "08:00 Istanbul");
assert.equal(m.isQuietHour(NOW), false);

// Steps and rewards: 10 + 20 + 50 + 30 + 50 = 160, exactly as drawn.
assert.deepEqual(m.STEP_IDS, ["interests", "join", "first_message", "voice", "friend"]);
assert.equal(m.REWARD_TOTAL, 160);
assert.equal(m.STEPS.find((s) => s.id === "first_message").reward, 50);
assert.equal(m.BADGE_ID, "ilkselam");

// Interests: catalog order, known only, deduped, capped.
assert.deepEqual(m.sanitizeInterests(["music", "study", "music", "nope", null]), ["study", "music"]);
assert.deepEqual(m.sanitizeInterests("study"), []);
assert.equal(m.sanitizeInterests(m.INTERESTS).length, m.MAX_INTERESTS);
for (const id of m.INTERESTS) assert.ok(!/valorant/i.test(id));

// Category: directory category wins, else keywords, else null.
assert.equal(m.inferCategory({ category: "music", name: "Minecraft" }), "music");
assert.equal(m.inferCategory({ category: "other", name: "Minecraft Türkiye SMP" }), "gaming-minecraft");
assert.equal(m.inferCategory({ name: "Ders Kampı YKS 2027" }), "study");
assert.equal(m.inferCategory({ name: "Lofi ve Sohbet" }), "music");
assert.equal(m.inferCategory({ name: "CS2 Faceit TR" }), "gaming-cs2");
assert.equal(m.inferCategory({ name: "Kod Kahvesi", description: "yazılım" }), "tech");
assert.equal(m.inferCategory({ name: "Çizim Atölyesi" }), "art");
assert.equal(m.inferCategory({ name: "Efootball" }), "sports");
assert.equal(m.inferCategory({ name: "31" }), null);
assert.equal(m.inferCategory({}), null);

// Liveness: last hour and reply time beat member count (members are not an input).
const small = { id: "a", lastHour: 46, last24h: 200, online: 7, inVoice: 2, replyMinutes: 2 };
const big = { id: "b", lastHour: 4, last24h: 30, online: 9, inVoice: 0, replyMinutes: 30 };
assert.ok(m.livenessScore(small) > m.livenessScore(big));
assert.ok(m.livenessScore({ lastHour: 5, replyMinutes: 2 }) > m.livenessScore({ lastHour: 5, replyMinutes: null }), "missing reply time counts as slow");
assert.equal(m.livenessScore({ replyMinutes: 999 }), -30, "reply time is capped at 60 minutes");

// Ranking: interests first, then the rest by score; joined and dead servers left out.
const servers = [
  { id: "dk", category: "study", lastHour: 46, online: 7, score: 50 },
  { id: "mc", category: "gaming-minecraft", lastHour: 38, online: 9, score: 40 },
  { id: "ls", category: "music", lastHour: 21, online: 5, score: 20 },
  { id: "cs", category: "gaming-cs2", lastHour: 90, online: 11, score: 99 },
  { id: "dead", category: "study", lastHour: 0, online: 0, last24h: 0, inVoice: 0, score: -10 },
  { id: "mine", category: "study", lastHour: 80, online: 3, score: 90 },
];
let r = m.rankSuggestions(servers, { interests: ["study", "gaming-minecraft", "music"], exclude: ["mine"] });
assert.deepEqual(r.map((s) => s.id), ["dk", "mc", "ls"]);
assert.deepEqual(r.map((s) => s.rank), [1, 2, 3]);
assert.ok(r.every((s) => s.matched));
r = m.rankSuggestions(servers, { interests: ["music"], exclude: ["mine"] });
assert.deepEqual(r.map((s) => s.id), ["ls", "cs", "dk"], "fill with the liveliest others");
assert.deepEqual(r.map((s) => s.matched), [true, false, false]);
r = m.rankSuggestions(servers, { interests: [] });
assert.equal(r[0].id, "cs");
assert.ok(!r.some((s) => s.id === "dead"), "a server without any sign of life is never suggested");
assert.deepEqual(m.rankSuggestions([], { interests: ["study"] }), []);

const counts = m.interestCounts(servers);
assert.deepEqual(counts.study, { servers: 2, online: 10 });
assert.deepEqual(counts.art, { servers: 0, online: 0 });

// Intro channel: introductions > welcome > general > first; only where @everyone can write.
const chans = [
  { id: "1", name: "kurallar", canSend: false },
  { id: "2", name: "genel", canSend: true },
  { id: "3", name: "soru-cevap", canSend: true },
  { id: "4", name: "tanışma", canSend: true },
];
assert.equal(m.pickIntroChannel(chans).id, "4");
assert.equal(m.pickIntroChannel(chans.filter((c) => c.id !== "4"), { welcomeChannelId: "3" }).id, "3");
assert.equal(m.pickIntroChannel(chans.filter((c) => c.id !== "4")).id, "2");
assert.equal(m.pickIntroChannel([{ id: "9", name: "tanisma", canSend: false }, { id: "8", name: "x", canSend: true }]).id, "8", "a read-only intro channel is skipped");
assert.equal(m.pickIntroChannel([]), null);
assert.equal(m.pickIntroChannel([{ id: "5", name: "introductions", canSend: true }, { id: "6", name: "general" }]).id, "5");

// Reply time for newcomers: median minutes, only recent joiners, only someone else's answer.
const t0 = NOW - 3 * H;
const msgs = [
  { channel_id: "c", sender_id: "old", created_at: new Date(t0 - H).toISOString() },
  { channel_id: "c", sender_id: "new1", created_at: new Date(t0).toISOString() },
  { channel_id: "c", sender_id: "new1", created_at: new Date(t0 + 60000).toISOString() },
  { channel_id: "c", sender_id: "old", created_at: new Date(t0 + 2 * 60000).toISOString() },
  { channel_id: "c", sender_id: "new2", created_at: new Date(t0 + 10 * 60000).toISOString() },
  { channel_id: "d", sender_id: "old", created_at: new Date(t0 + 11 * 60000).toISOString() },
  { channel_id: "c", sender_id: "old", created_at: new Date(t0 + 16 * 60000).toISOString() },
];
const joined = new Map([["new1", NOW - D], ["new2", NOW - 2 * D], ["old", NOW - 90 * D]]);
assert.equal(m.medianReplyMinutes(msgs, joined, { now: NOW }), 4, "median of 2 and 6 minutes");
assert.equal(m.medianReplyMinutes(msgs, new Map([["old", NOW - 90 * D]]), { now: NOW }), null);
assert.equal(m.medianReplyMinutes([], joined, { now: NOW }), null);

// Crowd hours: 12 two-hour buckets, scaled to 100, three peaks.
const stamps = [];
for (let i = 0; i < 10; i += 1) stamps.push("2026-11-26T17:10:00Z"); // 20:10 Istanbul -> bucket 10
for (let i = 0; i < 5; i += 1) stamps.push("2026-11-26T15:10:00Z"); // 18:10 -> bucket 9
stamps.push("2026-11-26T07:10:00Z"); // 10:10 -> bucket 5
const ch = m.crowdHours(stamps);
assert.equal(ch.length, 12);
assert.equal(ch[10].v, 100);
assert.equal(ch[9].v, 50);
assert.equal(ch[10].peak, true);
assert.equal(ch[0].peak, false);
assert.ok(m.crowdHours([]).every((b) => b.v === 0 && !b.peak));

// Hourly sparkline: oldest first, current hour last.
const hs = m.hourlySeries([NOW - 10 * 60000, NOW - 70 * 60000, NOW - 30 * H], { hours: 18, now: NOW });
assert.equal(hs.length, 18);
assert.equal(hs[17], 1);
assert.equal(hs[16], 1);
assert.equal(hs.reduce((a, b) => a + b, 0), 2, "older than 18 hours is left out");

// Checklist.
let cl = m.buildChecklist({ facts: { interests: true }, claimed: { interests: 10 } });
assert.equal(cl.doneCount, 1);
assert.equal(cl.next, "join");
assert.equal(cl.earned, 10);
assert.equal(cl.rewardTotal, 160);
assert.equal(cl.complete, false);
cl = m.buildChecklist({ facts: { interests: true, join: true, first_message: true, voice: true, friend: true }, claimed: { interests: 10, join: 20, first_message: 0 } });
assert.equal(cl.complete, true);
assert.equal(cl.next, null);
assert.equal(cl.earned, 30, "a capped claim (0) earns nothing");

assert.equal(m.dashboardVisible({ inWindow: true, complete: false, hidden: false }), true);
assert.equal(m.dashboardVisible({ inWindow: true, complete: true, hidden: false }), false);
assert.equal(m.dashboardVisible({ inWindow: true, complete: false, hidden: true }), false);
assert.equal(m.dashboardVisible({ inWindow: false, complete: false, hidden: false }), false);
assert.equal(m.dashboardVisible({ inWindow: true, complete: false, hidden: false, enabled: false }), false);

// What counts as a real first message.
assert.equal(m.isRealHelloText("Selam, ben Ece."), true);
assert.equal(m.isRealHelloText("hi"), true);
assert.equal(m.isRealHelloText("a"), false);
assert.equal(m.isRealHelloText("   "), false);
assert.equal(m.isRealHelloText("/daily"), false);
assert.equal(m.isRealHelloText("123 456"), false);
assert.equal(m.isRealHelloText("Привет"), true);

assert.equal(m.cleanIntroText("  a\u0000b  "), "ab");
assert.equal(m.cleanIntroText("x".repeat(400)).length, 300);
assert.equal(m.cleanSlot("card"), "card");
assert.equal(m.cleanSlot("<script>"), "other");

console.log("onboarding model.selftest: ok");
