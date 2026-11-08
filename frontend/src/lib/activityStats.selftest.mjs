import assert from "node:assert/strict";
import {
  parseActivityLabel, activityName, gameMonogram, gameColor, cleanHistory, groupByDay, topGames,
  lastSevenDays, streakDays, buildGameColors, GAME_PALETTE, weekSummary, dayPosition, splitDuration, liveRow, startOfDay,
} from "./activityStats.js";

const at = (d, hm) => {
  const [h, m] = hm.split(":").map(Number);
  const x = new Date(2026, 10, d, h, m, 0, 0);
  return x.toISOString();
};
const row = (id, name, d, a, b, type = "game") => {
  const sa = at(d, a);
  const sb = at(d, b);
  return { id, app_type: type, display_name: `Playing ${name}`, started_at: sa, ended_at: sb, duration_sec: (new Date(sb) - new Date(sa)) / 1000 };
};
const NOW = new Date(2026, 10, 8, 15, 34).getTime();

// Labels
assert.deepEqual(parseActivityLabel("Using Discord"), { verb: "using", name: "Discord" });
assert.deepEqual(parseActivityLabel("Listening to Spotify"), { verb: "listening", name: "Spotify" });
assert.deepEqual(parseActivityLabel("Studying"), { verb: null, name: "Studying" });
assert.equal(activityName({ displayName: "Playing BeamNG.drive" }), "BeamNG.drive");
assert.equal(activityName({ display_name: "Studying", app_name: "manual" }), "Studying");
assert.equal(gameMonogram("Rocket League"), "RL");
assert.equal(gameMonogram("BeamNG.drive"), "BD");
assert.equal(gameMonogram("Minecraft"), "MI");
assert.equal(gameColor("Fortnite"), gameColor(" fortnite "), "colour ignores case and spaces");

const hist = [
  row(1, "Fortnite", 8, "00:37", "00:50"),
  row(2, "BeamNG.drive", 8, "12:13", "12:55"),
  row(3, "Rocket League", 7, "22:56", "23:07"),
  row(4, "Minecraft", 7, "20:46", "20:46"),          // 0 s: hidden
  row(5, "BeamNG.drive", 8, "13:57", "14:16"),
  row(6, "Minecraft", 6, "21:25", "22:04"),
  row(7, "Minecraft", 1, "21:00", "22:00"),          // outside 7 days, inside the week before
];

// Clean: no zero rows, newest first
const clean = cleanHistory(hist);
assert.deepEqual(clean.map((r) => r.id), [5, 2, 1, 3, 6, 7]);

// Days: today first, totals in seconds
const days = groupByDay(clean, NOW);
assert.equal(days[0].offset, 0);
assert.deepEqual(days[0].items.map((r) => r.id), [5, 2, 1]);
assert.equal(days[0].totalSec, (19 + 42 + 13) * 60);
assert.equal(days[1].offset, 1);
assert.equal(days[2].offset, 2);

// Top games over 7 days
const top = topGames(clean, 7, NOW);
assert.equal(top[0].name, "BeamNG.drive");
assert.equal(top[0].seconds, (42 + 19) * 60);
assert.equal(top[0].sessions, 2);
assert.ok(!top.some((g) => g.seconds === 0));

// Chart: 7 slots, oldest first, today last
const seven = lastSevenDays(clean, NOW);
assert.equal(seven.length, 7);
assert.equal(seven[6].offset, 0);
assert.equal(seven[6].totalSec, (19 + 42 + 13) * 60);
assert.equal(seven[6].parts[0].name, "BeamNG.drive");
assert.equal(seven[0].totalSec, 0);

// Streak: 6, 7, 8 November
assert.equal(streakDays(clean, NOW), 3);
assert.equal(streakDays(clean, new Date(2026, 10, 9, 10).getTime()), 3, "today empty still counts until yesterday");
assert.equal(streakDays(clean, new Date(2026, 10, 10, 10).getTime()), 0);

// Week summary and change against the 7 days before
const ws = weekSummary(clean, NOW);
assert.equal(ws.sessions, 5);
assert.equal(ws.prevSec, 60 * 60);
assert.equal(ws.change, Math.round(((ws.weekSec - 3600) / 3600) * 100));
assert.equal(weekSummary([], NOW).change, null);

// Day line position
const pos = dayPosition(row(9, "X", 8, "12:00", "18:00"));
assert.ok(Math.abs(pos.left - 50) < 0.01 && Math.abs(pos.width - 25) < 0.01);

// Live row
const live = liveRow({ appType: "game", displayName: "Playing Rocket League", startedAt: new Date(NOW - 23 * 60000).toISOString() }, NOW);
assert.equal(live.duration_sec, 23 * 60);
assert.equal(liveRow({ displayName: "x" }, NOW), null);

assert.deepEqual(splitDuration(3900), { h: 1, m: 5 });
assert.deepEqual(splitDuration(59), { h: 0, m: 0 });
assert.equal(startOfDay(NOW), new Date(2026, 10, 8).getTime());

// Colours: palette by play time, all different, stable for the same name
const colorOf = buildGameColors(clean);
assert.equal(colorOf("Minecraft"), GAME_PALETTE[0], "most played overall gets the first colour");
assert.equal(colorOf("BeamNG.drive"), GAME_PALETTE[1]);
const used = ["BeamNG.drive", "Minecraft", "Fortnite", "Rocket League"].map(colorOf);
assert.equal(new Set(used).size, used.length);
assert.equal(colorOf(" beamng.drive "), GAME_PALETTE[1]);
assert.match(colorOf("Never Played"), /^hsl\(/);

console.log("activityStats.selftest: ok");
