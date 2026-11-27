import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as pp from "./publicPage.js";

const require = createRequire(import.meta.url);
const be = require("../../backend/lib/serverPublicPage.js");
assert.deepEqual(pp.SECTION_KEYS, be.SECTION_KEYS, "section keys = backend");
assert.deepEqual(pp.DISABLE_REASONS, be.DISABLE_REASONS);
for (const k of Object.keys(pp.LIMITS)) assert.equal(pp.LIMITS[k], be.LIMITS[k], `limit ${k} = backend`);

const desk = {
  settings: { title: "T", description: "", hidden: ["pin", "bogus"], hiddenChannels: ["C-2"], pin: "note", events: [{ id: "e1", title: "Ev", startsAt: "2099-01-01T18:00:00.000Z", endsAt: null, place: "Lobi" }] },
};
const saved = pp.draftFromDesk(desk);
assert.deepEqual(saved.hidden, ["pin"]);
assert.deepEqual(saved.hiddenChannels, ["c-2"]);
assert.equal(pp.diffDraft(saved, saved), null, "no change: no body");
let d = { ...saved, title: "T2", hidden: pp.toggleIn(saved.hidden, "count") };
assert.deepEqual(pp.diffDraft(d, saved), { title: "T2", hidden: ["count", "pin"] });
d = { ...saved, events: [...saved.events, { key: "n", title: " Yeni ", startsAt: "2099-02-01T10:00:00.000Z", endsAt: "", place: "" }] };
const body = pp.diffDraft(d, saved);
assert.equal(body.events.length, 2);
assert.deepEqual(body.events[1], { title: "Yeni", startsAt: "2099-02-01T10:00:00.000Z", endsAt: null, place: null });

const preview = {
  name: "S", bannerUrl: "https://x/b.png", description: "D", tags: ["a"], category: "music", language: "tr",
  counts: { members: 5, online: 1, voice: 0 }, channels: { text: [{ id: "c-1", name: "a" }, { id: "c-2", name: "b" }], voice: [], total: 2 },
  events: [], rules: ["r"], pin: "", seo: {},
};
let pg = pp.previewPage(preview, saved);
assert.deepEqual(pg.channels.text.map((c) => c.name), ["a"], "owner-hidden channel left out");
assert.equal(pg.pin, "", "hidden pin");
assert.equal(pg.events.length, 1);
assert.equal(pg.seo.title, "T");
pg = pp.previewPage(preview, { ...saved, hidden: ["banner", "desc", "tags", "count", "chan", "ev", "rules"] });
assert.equal(pg.bannerUrl, null);
assert.equal(pg.description, "");
assert.equal(pg.category, null);
assert.equal(pg.counts, null);
assert.equal(pg.channels, null);
assert.deepEqual(pg.events, []);
assert.deepEqual(pg.rules, []);
assert.equal(pg.pin, "note");

assert.deepEqual(pp.serpText("abc", 5), { text: "abc", cut: false });
assert.deepEqual(pp.serpText("abcdefgh", 5), { text: "abcd…", cut: true });
assert.equal(pp.meterState(0, 60), "empty");
assert.equal(pp.meterState(60, 60), "ok");
assert.equal(pp.meterState(61, 60), "warn");
const now = Date.parse("2026-11-24T12:00:00Z");
assert.deepEqual(pp.agoParts("2026-11-22T11:00:00Z", now), { key: "day", n: 2 });
assert.deepEqual(pp.agoParts("2026-11-24T11:30:00Z", now), { key: "min", n: 30 });
assert.equal(pp.agoParts("bad", now), null);
assert.equal(pp.clockLeft("2026-11-24T12:09:41Z", now), "9:41");
assert.equal(pp.clockLeft("2026-11-24T11:00:00Z", now), null);
assert.deepEqual(pp.axis(250), { top: 300, ticks: [0, 100, 200, 300] });
assert.equal(pp.linePoints([0, 10], { w: 100, h: 50, top: 10 }).length, 2);
const sh = pp.sourceShares([{ source: "google", joins: 46 }, { source: "whatsapp", joins: 22 }, { source: "x", joins: 12 }, { source: "direct", joins: 15 }, { source: "reddit", joins: 5 }]);
assert.equal(sh.total, 100);
assert.equal(sh.parts.reduce((a, p) => a + p.pct, 0), 100);
assert.deepEqual(sh.parts.map((p) => p.source), ["google", "whatsapp", "direct", "other"]);
const odd = pp.sourceShares([{ source: "a", joins: 1 }, { source: "b", joins: 1 }, { source: "c", joins: 1 }]);
assert.equal(odd.parts.reduce((a, p) => a + p.pct, 0), 100, "rounded to 100");
assert.deepEqual(pp.sourceShares([]), { total: 0, parts: [] });
const local = pp.toLocalInput("2026-11-29T18:00:00.000Z");
assert.match(local, /^2026-11-29T\d\d:00$/);
assert.equal(pp.fromLocalInput(local), "2026-11-29T18:00:00.000Z");
assert.equal(pp.fromLocalInput(""), "");
assert.deepEqual(pp.auditFields({ title: {}, weird: {}, events: {} }), ["title", "events"]);
console.log("publicPage selftest ok");
