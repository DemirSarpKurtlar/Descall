import assert from "node:assert/strict";
import tr from "../../src/i18n/locales/tr.js";
import en from "../../src/i18n/locales/en.js";
import {
  SESSION_GAP_MS,
  closeActivityScan,
  findExtendTarget,
  formatActivityRange,
  groupActivitySessions,
  mergeSessionFields,
  playingName,
  shouldLogSession,
  stepActivityScan,
} from "./activitySessions.mjs";

const iso = (ms) => new Date(ms).toISOString();

function row(id, name, startMs, durationSec, extra = {}) {
  return {
    id,
    app_name: name,
    app_type: "game",
    display_name: `Playing ${name}`,
    started_at: iso(startMs),
    ended_at: iso(startMs + durationSec * 1000),
    duration_sec: durationSec,
    is_manual: false,
    ...extra,
  };
}

const t0 = Date.parse("2026-10-11T14:00:00.000Z");
const fragments = [
  row("a", "Minecraft", t0, 4 * 60),
  row("b", "Minecraft", t0 + 5 * 60 * 1000, 3 * 60),
  row("c", "Minecraft", t0 + 9 * 60 * 1000, 60),
  row("d", "Minecraft", t0 + 11 * 60 * 1000, 60),
  row("v", "Valorant", t0 + 20 * 60 * 1000, 14 * 60),
  row("m2", "Minecraft", t0 + 3 * 60 * 60 * 1000, 26 * 60),
];

const grouped = groupActivitySessions(fragments);
const minecraft = grouped.filter((r) => r.app_name === "Minecraft");
assert.equal(minecraft.length, 2, "a later Minecraft session stays separate");
const first = minecraft.find((r) => r.id === "a");
assert.ok(first);
assert.equal(first.duration_sec, 4 * 60 + 3 * 60 + 60 + 60);
assert.equal(first.started_at, iso(t0));
assert.equal(first.ended_at, iso(t0 + 12 * 60 * 1000));
assert.equal(first.display_name, "Playing Minecraft");
assert.equal(grouped.find((r) => r.app_name === "Valorant").duration_sec, 14 * 60);

const gap = 5 * 60 * 1000;
const edge = [
  row("a", "Minecraft", t0, 60),
  row("b", "Minecraft", t0 + 60 * 1000 + gap, 60),
];
assert.equal(groupActivitySessions(edge).length, 1, "gap of exactly 5 min merges");
const over = [
  row("a", "Minecraft", t0, 60),
  row("b", "Minecraft", t0 + 60 * 1000 + gap + 1, 60),
];
assert.equal(groupActivitySessions(over).length, 2, "gap past 5 min stays split");

const overlap = [
  row("a", "Rocket League", t0, 10 * 60),
  row("b", "Rocket League", t0 + 4 * 60 * 1000, 8 * 60),
];
const overlapped = groupActivitySessions(overlap);
assert.equal(overlapped.length, 1);
assert.equal(overlapped[0].duration_sec, 18 * 60);
assert.equal(overlapped[0].ended_at, iso(t0 + 12 * 60 * 1000));

const manual = [
  row("g", "Minecraft", t0, 120),
  row("m", "Minecraft", t0 + 60 * 1000, 120, { is_manual: true, app_type: "manual", display_name: "Minecraft" }),
];
assert.equal(groupActivitySessions(manual).length, 2, "manual status does not merge with the game");

const again = groupActivitySessions(grouped);
assert.deepEqual(
  again.map((r) => [r.id, r.duration_sec, r.started_at, r.ended_at]),
  grouped.map((r) => [r.id, r.duration_sec, r.started_at, r.ended_at]),
  "grouping is idempotent",
);

const incoming = row("new", "Minecraft", t0 + 13 * 60 * 1000, 2 * 60);
const target = findExtendTarget(fragments, incoming);
assert.equal(target.id, "d");
const extended = mergeSessionFields(target, incoming);
assert.equal(extended.duration_sec, 60 + 2 * 60);
assert.equal(extended.started_at, target.started_at);
assert.equal(extended.id, "d");
assert.equal(findExtendTarget(fragments, row("late", "Minecraft", t0 + 30 * 60 * 1000, 60)), null);

assert.equal(playingName("Playing Minecraft"), "Minecraft");
assert.equal(playingName("Playing Rocket League"), "Rocket League");
assert.equal(playingName("Using Descall"), null);
assert.equal(en.phrases["Playing {name}"], "Playing {name}");
assert.equal(tr.phrases["Playing {name}"], "{name} oynadı");

const range = formatActivityRange(iso(t0), iso(t0 + 36 * 60 * 1000), "tr", "UTC");
assert.equal(range, "14:00–14:36");
const sameMinute = formatActivityRange(iso(t0), iso(t0 + 20 * 1000), "tr", "UTC");
assert.equal(sameMinute, "14:00");
const overnight = formatActivityRange(
  "2026-10-11T23:50:00.000Z",
  "2026-10-12T00:10:00.000Z",
  "tr",
  "UTC",
);
assert.match(overnight, /23:50/);
assert.match(overnight, /00:10/);
assert.match(overnight, /–/);

let step = stepActivityScan(null, { appName: "Minecraft", nowMs: t0, meta: { appType: "game" } });
assert.equal(step.emit, "update");
assert.equal(step.log, null);
step = stepActivityScan(step.state, { appName: "Minecraft", nowMs: t0 + 4 * 60 * 1000 });
assert.equal(step.emit, null);
step = stepActivityScan(step.state, { appName: null, nowMs: t0 + 4 * 60 * 1000 });
assert.equal(step.emit, "clear");
assert.equal(step.log, null);
step = stepActivityScan(step.state, { appName: "Minecraft", nowMs: t0 + 6 * 60 * 1000 });
assert.equal(step.emit, "update");
assert.equal(step.startedAt, iso(t0));
assert.equal(step.log, null);
step = stepActivityScan(step.state, { appName: null, nowMs: t0 + 9 * 60 * 1000 });
assert.equal(step.emit, "clear");
step = stepActivityScan(step.state, { appName: null, nowMs: t0 + 9 * 60 * 1000 + SESSION_GAP_MS + 1 });
assert.equal(step.log.startedAt, iso(t0));
assert.equal(step.log.endedAt, iso(t0 + 9 * 60 * 1000));
assert.equal(step.log.durationSec, 7 * 60);
assert.equal(shouldLogSession(step.log), true);
assert.equal(step.state.paused, null);

let switched = stepActivityScan(null, { appName: "Minecraft", nowMs: t0 });
switched = stepActivityScan(switched.state, { appName: null, nowMs: t0 + 4 * 60 * 1000 });
switched = stepActivityScan(switched.state, {
  appName: "Valorant",
  nowMs: t0 + 5 * 60 * 1000,
  meta: { appType: "game" },
});
assert.equal(switched.log.appName, "Minecraft");
assert.equal(switched.log.endedAt, iso(t0 + 4 * 60 * 1000));
assert.equal(switched.log.durationSec, 4 * 60);
assert.equal(switched.emit, "update");
assert.equal(switched.state.active.appName, "Valorant");

let resumedLate = stepActivityScan(null, { appName: "Minecraft", nowMs: t0 });
resumedLate = stepActivityScan(resumedLate.state, { appName: null, nowMs: t0 + 60_000 });
resumedLate = stepActivityScan(resumedLate.state, { appName: "Minecraft", nowMs: t0 + 60_000 + SESSION_GAP_MS + 1 });
assert.equal(resumedLate.log.durationSec, 60);
assert.equal(resumedLate.startedAt, iso(t0 + 60_000 + SESSION_GAP_MS + 1));
assert.notEqual(resumedLate.startedAt, iso(t0));

const exact = stepActivityScan(
  { active: null, paused: { appName: "Minecraft", startedAtMs: t0, pausedAtMs: t0, playedMs: 60_000, meta: null } },
  { appName: "Minecraft", nowMs: t0 + SESSION_GAP_MS },
);
assert.equal(exact.emit, "update");
assert.equal(exact.startedAt, iso(t0));

const closed = closeActivityScan(exact.state, t0 + SESSION_GAP_MS + 30_000);
assert.equal(closed.log.durationSec, 90);
assert.equal(shouldLogSession({ durationSec: 29 }), false);

console.log("activitySessions.selftest ok");
