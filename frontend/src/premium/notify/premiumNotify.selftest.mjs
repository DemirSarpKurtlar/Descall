// Descall+ notification engines: rule engine (focus, profiles, smart game),
// history store and launcher search. Run from frontend/:
// node src/premium/notify/premiumNotify.selftest.mjs
import assert from "node:assert/strict";
import * as R from "./notifyRules.js";
import { createHistoryStore } from "./notificationHistory.js";
import { fuzzyScore, buildIndex, search, fold } from "../launcher/launcherSearch.js";

// ── categories ──
assert.equal(R.categoryOf({ type: "call" }), "call");
assert.equal(R.categoryOf({ type: "group-call" }), "call");
assert.equal(R.categoryOf({ type: "missed-call" }), "dm");
assert.equal(R.categoryOf({ type: "server-message" }), "server");
assert.equal(R.categoryOf({ type: "friend-online" }), "social");
assert.equal(R.categoryOf({}), "system");

// ── no premium features: everything as today ──
const plain = R.decide({ data: { type: "server-message" } });
assert.deepEqual([plain.show, plain.sound, plain.defer], [true, true, false]);

const NOW = new Date(2026, 10, 2, 14, 30).getTime(); // Monday 14:30 local
const feats = { focus_mode: true, notification_profiles: true, smart_game_notifications: true };

// ── focus mode ──
const focus = { until: NOW + 30 * 60000 };
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: feats, focus }).show, false);
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: feats, focus: { ...focus, allowDms: true } }).show, true);
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: feats, focus: { ...focus, allowDms: true } }).sound, false, "allowed through focus but silent");
assert.equal(R.decide({ data: { type: "call" }, nowMs: NOW, features: feats, focus }).show, true, "calls pass by default");
assert.equal(R.decide({ data: { type: "call" }, nowMs: NOW, features: feats, focus: { ...focus, allowCalls: false } }).show, false);
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW + 31 * 60000, features: feats, focus }).show, true, "focus expired");
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: { focus_mode: false }, focus }).show, true, "not entitled: no effect");

// ── profiles ──
const gaming = R.resolveProfile("gaming", {});
assert.equal(gaming.rules.server.show, false);
assert.equal(gaming.rules.dm.sound, false);
const custom = R.resolveProfile("gaming", { gaming: { style: "toast", rules: { server: { show: true }, call: { show: false } } } });
assert.equal(custom.rules.server.show, true);
assert.equal(custom.rules.server.sound, false, "unset field keeps the default");
assert.equal(custom.rules.call.show, true, "calls can never be hidden");
assert.equal(custom.style, "toast");
assert.equal(R.resolveProfile("nonsense").id, "default");
assert.equal(R.currentActivity({ mode: "auto", gameActive: true }), "gaming");
assert.equal(R.currentActivity({ mode: "working", gameActive: true }), "working");
const sched = { workingDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
assert.equal(R.currentActivity({ schedule: sched, now: new Date(NOW) }), "working");
assert.equal(R.currentActivity({ schedule: sched, now: new Date(2026, 10, 1, 14, 30) }), "default", "Sunday");
assert.equal(R.inSchedule({ workingDays: [1], start: "22:00", end: "06:00" }, new Date(2026, 10, 3, 2, 0)), true, "overnight belongs to the start day");
assert.equal(R.inSchedule({ workingDays: [1], start: "22:00", end: "06:00" }, new Date(2026, 10, 4, 2, 0)), false);
assert.equal(R.inSchedule({ start: "9:00", end: "bad" }), false);
const work = R.decide({ data: { type: "server-message" }, nowMs: NOW, features: { notification_profiles: true }, schedule: sched });
assert.equal(work.show, false);
assert.equal(work.reason, "profile:working");
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: { notification_profiles: true }, schedule: sched }).style, "toast");

// ── smart game notifications ──
const g = R.decide({ data: { type: "dm" }, nowMs: NOW, features: { smart_game_notifications: true }, gameActive: true });
assert.deepEqual([g.show, g.defer, g.reason], [false, true, "game-deferred"]);
assert.equal(R.decide({ data: { type: "call" }, nowMs: NOW, features: { smart_game_notifications: true }, gameActive: true }).show, true, "calls stay visible");
assert.equal(R.decide({ data: { type: "dm" }, requireInteraction: true, nowMs: NOW, features: { smart_game_notifications: true }, gameActive: true }).show, true, "urgent stays visible");
assert.equal(R.decide({ data: { type: "dm" }, nowMs: NOW, features: { smart_game_notifications: true }, gameActive: true, appFocused: true }).defer, false, "Descall in front: no deferral");
// Profile hides it already: not deferred (nothing to summarise).
assert.equal(R.decide({ data: { type: "server-message" }, nowMs: NOW, features: { smart_game_notifications: true, notification_profiles: true }, gameActive: true }).defer, false);
assert.deepEqual(R.summarizeDeferred([{ from: "Ayşe" }, { from: "Mert" }, { from: "Ayşe" }, { from: "Can" }, { from: "Ece" }]), { count: 5, people: ["Ayşe", "Mert", "Can"], more: 1 });

// ── history store ──
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let clock = 1000;
const h = createHistoryStore({ storage, cap: 3, now: () => clock });
let seen = 0;
const off = h.subscribe(() => { seen += 1; });
h.add({ title: "A", body: "x".repeat(500), data: { type: "dm", fromId: "u1", token: "secret", avatarUrl: "https://x" }, category: "dm" });
const first = h.list()[0];
assert.equal(first.body.length, 200, "body capped");
assert.equal(first.data.token, undefined, "only routing fields kept");
assert.equal(first.data.avatarUrl, undefined);
assert.equal(first.data.fromId, "u1");
clock += 1; h.add({ title: "B", tag: "dm:u2" });
clock += 1; h.add({ title: "B2", tag: "dm:u2" });
assert.equal(h.list().length, 2, "same chat burst collapses");
assert.equal(h.list()[0].count, 2);
clock += 1; h.add({ title: "C" });
clock += 1; h.add({ title: "D" });
assert.equal(h.list().length, 3, "capped");
assert.deepEqual(h.list().map((x) => x.title), ["D", "C", "B2"], "newest first");
assert.equal(h.unreadCount(), 3);
h.markRead(h.list()[0].id);
assert.equal(h.unreadCount(), 2);
// Persisted: a new store over the same storage sees the same list.
const h2 = createHistoryStore({ storage, cap: 3 });
assert.deepEqual(h2.list().map((x) => x.title), ["D", "C", "B2"]);
h.markAllRead();
assert.equal(h.unreadCount(), 0);
h.remove(h.list()[1].id);
assert.equal(h.list().length, 2);
h.clear();
assert.equal(h.list().length, 0);
assert.equal(mem.has("descall:premium:notificationHistory"), true, "clear writes the empty list");
assert.ok(seen >= 6);
off();
// Corrupt storage starts empty.
mem.set("descall:premium:notificationHistory", "{nope");
assert.deepEqual(createHistoryStore({ storage }).list(), []);

// ── launcher search ──
assert.equal(fold("AYŞE Işık"), "ayse isik");
assert.ok(fuzzyScore("ays", "Ayşe") > fuzzyScore("ays", "Kayseri"), "prefix beats substring");
assert.ok(fuzzyScore("gnrl", "general") > 0, "subsequence");
assert.equal(fuzzyScore("xyz", "general"), 0);
const index = buildIndex({
  friends: [{ id: "1", username: "ayse", display_name: "Ayşe Yılmaz", avatar_url: "https://cdn/x.png" }, { id: "2", username: "mert" }],
  dms: [{ user: { id: "1", username: "ayse" } }, { user: { id: "3", username: "zeynep" } }],
  groups: [{ id: "g1", name: "Football" }],
  servers: [{ id: "s1", name: "Descall Fans", channels: [{ id: "c1", name: "general", type: "text" }, { id: "c2", name: "Lounge", type: "voice" }, { id: "cat", name: "Info", type: "category" }] }],
  actions: [{ id: "action:mute", title: "Mute", subtitle: "Voice", run: { type: "action", action: "toggle_mute" } }],
  t: (k) => k,
});
assert.equal(index.filter((i) => i.id === "dm:1").length, 0, "a friend is not listed twice as a DM");
assert.ok(index.some((i) => i.id === "dm:3"));
assert.ok(!index.some((i) => i.id.endsWith(":cat")), "categories are not channels");
const r1 = search(index, "ays");
assert.equal(r1[0].id, "friend:1");
assert.equal(r1[0].avatar, "https://cdn/x.png");
assert.equal(r1[0].run, undefined, "routing payload stays in the renderer");
assert.equal(search(index, "gen")[0].id, "channel:s1:c1");
assert.equal(search(index, "mute")[0].id, "action:mute");
assert.equal(search(index, "")[0].kind, "action", "empty query: actions first");
assert.equal(search(index, "", { limit: 2 }).length, 2);
assert.equal(search(index, "qqqq").length, 0);

console.log("premiumNotify.selftest ok");
