// Selftests for the premium gaming / productivity pure logic: rule engine, clip ring buffer
// math, timeline builder. Run: node src/premium/gaming/premiumGaming.selftest.mjs
import assert from "node:assert/strict";
import { evaluate, normalizeRules, inTimeWindow, idleThresholdSec, emptyState, COOLDOWN_MS } from "./ruleEngine.js";
import { pruneCount, selectRange, timelineLength, defaultTrim, clampTrim, memoryCapBytes, bitrateFor, keyframeEvery, totalBytes, MAX_BYTES_CAP } from "./clipRing.js";
import { buildTimeline, mergeGameSessions, dayBounds, dayKey } from "./timeline.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; };

// ---------------- rule engine ----------------
t("normalize drops invalid rules and actions", () => {
  const rules = normalizeRules([
    { id: "a", trigger: { type: "game_started", game: "Valorant" }, actions: [{ type: "set_status", status: "dnd" }, { type: "rm -rf" }] },
    { id: "b", trigger: { type: "exec" }, actions: [{ type: "focus" }] },
    { id: "c", trigger: { type: "time_window", from: "25:00", to: "10:00" }, actions: [{ type: "focus" }] },
    { id: "d", trigger: { type: "call_joined" }, actions: [{ type: "open_hud", hud: "nope" }] },
    { id: "e", trigger: { type: "idle", minutes: 0 }, actions: [{ type: "set_status", status: "idle" }] },
  ]);
  assert.deepEqual(rules.map((r) => r.id), ["a", "e"]);
  assert.equal(rules[0].actions.length, 1);
  assert.equal(rules[1].trigger.minutes, 1);
});

t("game trigger matches name filter, case-insensitive", () => {
  const rules = [{ id: "g", trigger: { type: "game_started", game: "valorant" }, actions: [{ type: "switch_profile", profileId: "game" }, { type: "focus", on: true }] }];
  const r1 = evaluate(rules, { type: "game_started", game: "VALORANT" }, emptyState(), 1_000_000);
  assert.equal(r1.fired.length, 2);
  assert.deepEqual(r1.fired[0].action, { type: "switch_profile", profileId: "game" });
  const r2 = evaluate(rules, { type: "game_started", game: "Minecraft" }, emptyState(), 1_000_000);
  assert.equal(r2.fired.length, 0);
});

t("cooldown blocks a rule firing twice within 30 s", () => {
  const rules = [{ id: "c", trigger: { type: "call_joined" }, actions: [{ type: "open_hud", hud: "voice_hud" }] }];
  const a = evaluate(rules, { type: "call_joined" }, emptyState(), 10_000);
  assert.equal(a.fired.length, 1);
  const b = evaluate(rules, { type: "call_joined" }, a.state, 10_000 + COOLDOWN_MS - 1);
  assert.equal(b.fired.length, 0);
  const c = evaluate(rules, { type: "call_joined" }, a.state, 10_000 + COOLDOWN_MS + 1);
  assert.equal(c.fired.length, 1);
});

t("disabled rules never fire", () => {
  const rules = [{ id: "x", enabled: false, trigger: { type: "call_left" }, actions: [{ type: "focus", on: false }] }];
  assert.equal(evaluate(rules, { type: "call_left" }).fired.length, 0);
});

t("time window: fires once on entering, overnight and weekdays", () => {
  const d = (h, m, day = 1) => { const x = new Date(2026, 10, 1 + day, h, m); return x; }; // Nov 2 2026 is a Monday (1)
  assert.equal(inTimeWindow(d(9, 30), "09:00", "17:00"), true);
  assert.equal(inTimeWindow(d(17, 0), "09:00", "17:00"), false);
  assert.equal(inTimeWindow(d(23, 0), "22:00", "02:00"), true);
  assert.equal(inTimeWindow(d(1, 0), "22:00", "02:00"), true);
  assert.equal(inTimeWindow(d(3, 0), "22:00", "02:00"), false);
  // Weekday filter: Monday only; Monday 01:00 belongs to Sunday's overnight window.
  assert.equal(inTimeWindow(d(10, 0), "09:00", "17:00", [1]), d(10, 0).getDay() === 1);
  const rules = [{ id: "w", trigger: { type: "time_window", from: "09:00", to: "17:00" }, actions: [{ type: "switch_profile", profileId: "work" }] }];
  let s = emptyState();
  let r = evaluate(rules, { type: "tick", now: d(8, 59) }, s, 1); s = r.state;
  assert.equal(r.fired.length, 0);
  r = evaluate(rules, { type: "tick", now: d(9, 0) }, s, 2); s = r.state;
  assert.equal(r.fired.length, 1);
  r = evaluate(rules, { type: "tick", now: d(9, 1) }, s, 100_000); s = r.state;
  assert.equal(r.fired.length, 0, "still inside: no repeat");
  r = evaluate(rules, { type: "tick", now: d(18, 0) }, s, 200_000); s = r.state;
  r = evaluate(rules, { type: "tick", now: d(9, 0, 2) }, s, 300_000);
  assert.equal(r.fired.length, 1, "next day fires again");
});

t("idle trigger and threshold", () => {
  const rules = [
    { id: "i1", trigger: { type: "idle", minutes: 10 }, actions: [{ type: "set_status", status: "idle" }] },
    { id: "i2", trigger: { type: "idle", minutes: 3 }, actions: [{ type: "focus", on: false }] },
  ];
  assert.equal(idleThresholdSec(rules), 180);
  const r = evaluate(rules, { type: "idle", idle: true, seconds: 200 }, emptyState(), 5);
  assert.deepEqual(r.fired.map((f) => f.ruleId), ["i2"]);
  assert.equal(evaluate(rules, { type: "idle", idle: false, seconds: 0 }).fired.length, 0);
});

// ---------------- clip ring ----------------
const mkChunks = (seconds, fps = 30, keySec = 1, bytes = 1000) => {
  const out = [];
  const every = keyframeEvery(fps, keySec);
  for (let i = 0; i < seconds * fps; i += 1) out.push({ key: i % every === 0, ts: Math.round((i * 1e6) / fps), dur: Math.round(1e6 / fps), bytes: i % every === 0 ? bytes * 5 : bytes });
  return out;
};

t("bitrate, memory cap and keyframe interval", () => {
  assert.equal(bitrateFor(720, 30), 4_000_000);
  assert.equal(keyframeEvery(30, 1), 30);
  assert.equal(keyframeEvery(60, 2), 120);
  const cap30 = memoryCapBytes({ windowSec: 30, height: 720, fps: 30 });
  const cap60 = memoryCapBytes({ windowSec: 60, height: 720, fps: 30 });
  assert.ok(cap30 < cap60 && cap60 <= MAX_BYTES_CAP);
  // 720p30 for 60 s stays well under 1080p's 75-90 MB.
  assert.ok(cap60 < 50 * 1024 * 1024, `cap60 ${cap60}`);
  assert.equal(memoryCapBytes({ windowSec: 600, height: 1080, fps: 60 }), MAX_BYTES_CAP);
});

t("prune keeps the window, starting on a keyframe", () => {
  const chunks = mkChunks(50); // 50 s
  const drop = pruneCount(chunks, { windowSec: 30, maxBytes: Infinity });
  const kept = chunks.slice(drop);
  assert.equal(kept[0].key, true);
  const span = timelineLength(kept);
  assert.ok(span >= 30_000 && span <= 31_100, `span ${span}`);
});

t("prune with no keyframe drops everything; leading deltas are dropped", () => {
  assert.equal(pruneCount([{ key: false, ts: 0, dur: 1, bytes: 1 }]), 1);
  const c = [{ key: false, ts: 0, dur: 10, bytes: 1 }, { key: true, ts: 10, dur: 10, bytes: 1 }, { key: false, ts: 20, dur: 10, bytes: 1 }];
  assert.equal(pruneCount(c, { windowSec: 60 }), 1);
});

t("prune honours the byte cap by whole GOPs, newest GOP stays", () => {
  const chunks = mkChunks(20);
  const gop = totalBytes(chunks.slice(0, 30));
  const drop = pruneCount(chunks, { windowSec: 60, maxBytes: gop * 5 + 10 });
  const kept = chunks.slice(drop);
  assert.equal(kept[0].key, true);
  assert.ok(totalBytes(kept) <= gop * 5 + 10);
  assert.equal(timelineLength(kept), 5000);
  const tiny = chunks.slice(pruneCount(chunks, { windowSec: 60, maxBytes: 1 }));
  assert.equal(tiny.length, 30, "one GOP always survives");
});

t("trim selection snaps back to a keyframe", () => {
  const chunks = mkChunks(30);
  const len = timelineLength(chunks);
  assert.equal(len, 30_000);
  assert.deepEqual(defaultTrim(chunks, 20), { from: 10_000, to: 30_000 });
  const sel = selectRange(chunks, 12_500, 20_000);
  assert.equal(chunks[sel.start].key, true);
  assert.equal(sel.fromMs, 12_000);
  assert.ok(chunks[sel.end - 1].ts < 20_000_000 && (sel.end === chunks.length || chunks[sel.end].ts >= 20_000_000));
  assert.deepEqual(clampTrim({ from: 29_900, to: 40_000 }, len), { from: 29_000, to: 30_000 });
  assert.deepEqual(clampTrim({ from: 5000, to: 2000 }, len), { from: 2000, to: 5000 });
});

// ---------------- timeline ----------------
t("timeline merges calls, games and events within the day", () => {
  const day = "2026-11-02";
  const { start } = dayBounds(day);
  const at = (h, m = 0) => new Date(start + (h * 60 + m) * 60_000).toISOString();
  const tl = buildTimeline({
    day,
    calls: [
      { kind: "dm", startedAt: at(20), endedAt: at(20, 30), peer: { username: "ayse" } },
      { kind: "dm", startedAt: at(21), endedAt: null, durationSeconds: 0, peer: { username: "missed" } },
      { kind: "group", startedAt: at(23, 50), endedAt: new Date(start + 86_400_000 + 20 * 60_000).toISOString(), group: { name: "Ekip" } },
    ],
    games: [
      { app_name: "Valorant", started_at: at(18), ended_at: at(19) },
      { game: "valorant", startedAt: at(19, 3), endedAt: at(19, 40) },
      { app_name: "Valorant", started_at: at(18, 10), ended_at: at(18, 50) },
      { app_name: "Minecraft", started_at: new Date(start - 3_600_000).toISOString(), ended_at: at(1) },
    ],
    events: [{ at: at(18, 1), kind: "profile", label: "Oyun" }, { at: new Date(start - 1).toISOString(), kind: "x", label: "old" }],
    labels: { dmCall: (n) => `call ${n}`, groupCall: (n) => `group ${n}` },
  });
  assert.equal(tl.day, day);
  const kinds = tl.items.map((i) => `${i.kind}:${i.label}`);
  assert.deepEqual(kinds, ["game:Minecraft", "game:Valorant", "event:Oyun", "call:call ayse", "call:group Ekip"]);
  const val = tl.items.find((i) => i.label === "Valorant");
  assert.equal(val.durationSec, 100 * 60, "18:00-19:40 joined across a 3 min gap");
  assert.equal(tl.items[0].durationSec, 3600, "Minecraft clipped to midnight");
  assert.equal(tl.items.at(-1).durationSec, 10 * 60, "group call clipped at the end of the day");
  assert.equal(tl.summary.calls, 2);
  assert.equal(tl.summary.gameSec, 100 * 60 + 3600);
});

t("mergeGameSessions keeps separate games apart and dayKey round-trips", () => {
  const m = mergeGameSessions([
    { app_name: "A", started_at: "2026-11-02T10:00:00Z", ended_at: "2026-11-02T10:30:00Z" },
    { app_name: "B", started_at: "2026-11-02T10:10:00Z", ended_at: "2026-11-02T10:20:00Z" },
    { app_name: "A", started_at: "2026-11-02T11:00:00Z", ended_at: "2026-11-02T11:30:00Z" },
  ]);
  assert.equal(m.length, 3);
  assert.equal(dayKey(new Date(dayBounds("2026-03-29").start)), "2026-03-29");
});

console.log(`premiumGaming selftest: ${n} checks passed`);
