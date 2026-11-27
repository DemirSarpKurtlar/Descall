"use strict";
// Run: node lib/perfModel.selftest.cjs
// Performans model: ratings, histograms + p75, beacon validation (whitelists, clamps,
// selectors, no user id from the payload), query parsing, release regressions and the
// "last 90 days" rule preview (mute rules), rule cleaning.
const assert = require("node:assert/strict");
const m = require("./perfModel");

// ratings (web.dev thresholds; CLS stored x1000)
assert.equal(m.rate("lcp", 2500), 0);
assert.equal(m.rate("lcp", 2501), 1);
assert.equal(m.rate("lcp", 4001), 2);
assert.equal(m.rate("inp", 199), 0);
assert.equal(m.rate("inp", 268), 1);
assert.equal(m.rate("cls", 100), 0);
assert.equal(m.rate("cls", 260), 2);
assert.equal(m.rate("appstart", 2310), 1);
assert.equal(m.rate("nope", 10), 0);

// buckets: monotonic, about 10 % wide, the middle within 5 % of the value
let prev = -1;
for (const v of [0, 1, 2, 10, 99, 100, 101, 200, 1000, 4000, 60000, 600000]) {
  const b = m.bucketOf(v);
  assert.ok(b >= prev, `bucket order at ${v}`);
  prev = b;
  if (v > 10) assert.ok(Math.abs(m.bucketValue(b) - v) / v < 0.06, `bucket middle near ${v}`);
}
assert.equal(m.bucketOf(-5), 0);
assert.equal(m.bucketOf(NaN), 0);

// p75 from a merged histogram is within 6 % of the exact p75
const values = Array.from({ length: 1000 }, (_, i) => 100 + ((i * 7919) % 400));
const ev = values.map((v) => ({ metric: "inp", value: v, route: "app/kanal", platform: "android" }));
const rows = m.rollupFromEvents(ev, { day: "2026-11-20" });
assert.equal(rows.length, 1);
assert.equal(rows[0].n, 1000);
assert.equal(rows[0].good + rows[0].ni + rows[0].poor, 1000);
const exact = [...values].sort((a, b) => a - b)[749];
const s = m.summarize(rows[0], "inp");
assert.ok(Math.abs(s.p75 - exact) / exact < 0.06, `p75 ${s.p75} vs ${exact}`);
assert.equal(s.dist[0] + s.dist[1] + s.dist[2], 100);
// splitting and merging gives the same answer
const a = m.rollupFromEvents(ev.slice(0, 400), { day: "x" })[0];
const b = m.rollupFromEvents(ev.slice(400), { day: "x" })[0];
const merged = m.addInto(m.addInto(m.emptyAgg(), a), b);
assert.equal(m.summarize(merged, "inp").p75, s.p75);
assert.equal(m.summarize(m.emptyAgg(), "inp").p75, null);
// grouped SQL rows (bucket + cnt) roll up like raw rows
const grouped = m.rollupFromEvents([{ metric: "lcp", route: "/", platform: "web", bucket: 80, cnt: 5, good: 5, ni: 0, poor: 0, total: 9000 }], { bucket: "2026-11-20T10:00:00.000Z" });
assert.equal(grouped[0].n, 5);
assert.equal(grouped[0].hist["80"], 5);
assert.equal(grouped[0].bucket, "2026-11-20T10:00:00.000Z");
// CLS p75 comes back unitless
const cls = m.rollupFromEvents([{ metric: "cls", value: 50, platform: "web" }], { day: "d" })[0];
assert.ok(Math.abs(m.summarize(cls, "cls").p75 - 0.05) < 0.004);

// routes
assert.equal(m.normalizeRoute("App/Kanal/"), "app/kanal");
assert.equal(m.normalizeRoute("/blog/x?utm=1#top"), "/blog/x");
assert.equal(m.normalizeRoute("app/dm/3f2a9c1e-1111-4222-8333-444455556666"), "app/dm/:id");
assert.equal(m.normalizeRoute("/invite/123456"), "/invite/:id");
assert.equal(m.normalizeRoute("<script>"), "");
assert.equal(m.cleanSelector("html > body > div#root > main > button.send"), "main > button.send");
assert.equal(m.cleanSelector("div<img src=x onerror=alert(1)>"), "divimg src=x onerror=alert(1)".slice(0, 80));

// beacon validation
const good = {
  v: 1,
  sid: "Ab3dEf6hIj",
  p: "android",
  ver: "4.1.4",
  dc: "low",
  cn: "3g",
  br: "Chrome",
  nt: "navigate",
  sr: 0.25,
  uid: "00000000-0000-4000-8000-000000000001",
  e: [
    { m: "sess", v: 1, r: "app" },
    { m: "inp", v: 268.4, r: "app/kanal", a: { target: "form > button.send", type: "keyboard", load: "complete", delay: 12, proc: 200, pres: 56, at: 5200, evil: "x" } },
    { m: "inp", v: 999, r: "app/kanal" },
    { m: "cls", v: 0.061, r: "app/kanal" },
    { m: "lcp", v: 2380, r: "app/kanal", a: { element: "img.server-banner", loadTime: 400 } },
    { m: "msglist", v: 860, r: "app/kanal", a: { kind: "server", at: 3000 } },
    { m: "msglist", v: 700, r: "app/kanal", a: { kind: "server" } },
    { m: "bogus", v: 1 },
    { m: "lcp", v: -1, r: "/" },
    { m: "lcp", v: 9e9, r: "/" },
    { m: "fcp", v: "1320", r: "/x" },
  ],
};
const out = m.validateBatch(good, { country: "TR", now: Date.parse("2026-11-22T12:00:00Z") });
assert.equal(out.ok, true);
const byM = (k) => out.events.filter((e) => e.metric === k);
assert.equal(byM("inp").length, 1, "one INP per route per page load");
assert.equal(byM("inp")[0].rating, 1);
assert.deepEqual(byM("inp")[0].attribution, { target: "form > button.send", type: "keyboard", load: "complete", delay: 12, proc: 200, pres: 56, at: 5200 });
assert.equal(byM("cls")[0].value, 61);
assert.equal(byM("msglist").length, 2, "every message list open counts");
assert.equal(byM("lcp").length, 1);
assert.equal(byM("fcp")[0].value, 1320);
assert.equal(byM("sess")[0].value, 1);
for (const e of out.events) {
  assert.equal(e.country, "TR");
  assert.equal(e.platform, "android");
  assert.equal(e.sample_rate, 0.25);
  assert.equal(e.user_id, undefined, "the payload never sets the user id");
}
assert.equal(m.validateBatch({ ...good, v: 2 }).error, "BAD_VERSION");
assert.equal(m.validateBatch({ ...good, sid: "short" }).error, "BAD_SESSION");
assert.equal(m.validateBatch({ ...good, p: "playstation" }).error, "BAD_PLATFORM");
assert.equal(m.validateBatch({ ...good, e: [] }).error, "EMPTY");
assert.equal(m.validateBatch({ ...good, e: Array.from({ length: 41 }, () => ({ m: "lcp", v: 1 })) }).error, "TOO_MANY");
assert.equal(m.validateBatch({ ...good, e: [{ m: "bogus", v: 1 }] }).error, "NO_VALID_EVENTS");
assert.equal(m.validateBatch(null).error, "BAD_BODY");
assert.equal(m.validateBatch([]).error, "BAD_BODY");
const odd = m.validateBatch({ ...good, ver: "'; drop", dc: "huge", cn: "5g", br: "<b>", e: [{ m: "lcp", v: 10 }] }, { country: "tr1" });
assert.equal(odd.events[0].app_version, "");
assert.equal(odd.events[0].device_class, "");
assert.equal(odd.events[0].connection, "");
assert.equal(odd.events[0].browser, "");
assert.equal(odd.events[0].country, "");

// query parsing
const q = m.parseQuery({ range: "7d", platform: "android,ps5", version: ["4.1.4", "x;y"], route: ["App/Kanal"], device: "low", connection: ["3g"], country: "tr,xxx", user: "3F2A9C1E" });
assert.deepEqual(q, { range: "7d", platform: ["android"], version: ["4.1.4"], route: ["app/kanal"], device: ["low"], connection: ["3g"], country: ["TR"], user: "3f2a9c1e" });
assert.equal(m.parseQuery({ range: "1y" }).range, "28d");
assert.equal(m.rowMatches({ platform: "android", route: "app/kanal" }, q), false, "device filter not met");
assert.equal(m.rowMatches({ platform: "android", route: "app/kanal", app_version: "4.1.4", device_class: "low", connection: "3g", country: "TR" }, q), true);
assert.equal(m.rowMatches({ platform: "ios" }, { platform: ["android"] }, "platform"), true, "skip a dimension");

// versions
assert.ok(m.compareVersions("4.1.10", "4.1.9") > 0);
assert.ok(m.compareVersions("4.1.4", "4.1.4-beta.1") === 0);
assert.ok(m.compareVersions("3.9", "4.0.0") < 0);

// regressions: Android 4.1.4 INP 182 -> 268 (+47 %), iOS flat
const day = (d) => `2026-11-${String(d).padStart(2, "0")}`;
const mk = (d, platform, version, value, n, metric = "inp") => m.rollupFromEvents(Array.from({ length: n }, () => ({ metric, value, platform, app_version: version })), { day: day(d) })[0];
const daily = [
  mk(10, "android", "4.1.3", 182, 3000),
  mk(15, "android", "4.1.3", 182, 3000),
  mk(21, "android", "4.1.4", 268, 2500),
  mk(22, "android", "4.1.4", 268, 1500),
  mk(10, "ios", "4.1.3", 140, 3000),
  mk(21, "ios", "4.1.4", 142, 3000),
  mk(21, "android", "4.1.4", 2310, 2500, "appstart"),
  mk(10, "android", "4.1.3", 1680, 2500, "appstart"),
];
const rule = { metrics: ["inp", "appstart"], platforms: ["android", "ios"], threshold_pct: 15, min_sessions: 2000 };
const found = m.findRegressions(daily, rule);
assert.equal(found.length, 2);
const inp = found.find((f) => f.metric === "inp");
assert.equal(inp.platform, "android");
assert.equal(inp.version, "4.1.4");
assert.equal(inp.prevVersion, "4.1.3");
assert.equal(inp.sessions, 4000);
assert.equal(inp.firstDay, day(21));
assert.ok(inp.deltaPct > 40 && inp.deltaPct < 55, `delta ${inp.deltaPct}`);
assert.equal(m.findRegressions(daily, { ...rule, min_sessions: 5000 }).length, 0, "minimum sessions");
assert.equal(m.findRegressions(daily, { ...rule, threshold_pct: 60 }).length, 0, "threshold");
assert.equal(m.findRegressions(daily, { ...rule, platforms: ["ios"] }).length, 0);
assert.equal(m.findRegressions(daily, rule, { onlyLatest: true }).length, 2);

// preview: older releases count too; "7 gün" keeps one per week
const older = [mk(1, "electron", "4.1.0", 1200, 3000, "appstart"), mk(3, "electron", "4.1.1", 1500, 3000, "appstart")];
const p1 = m.previewRule([...daily, ...older], { ...rule, platforms: ["android", "ios", "electron"], mute: "release24h" });
assert.equal(p1.count, 3);
const p2 = m.previewRule([...daily, ...older], { ...rule, platforms: ["android", "ios", "electron"], mute: "7d" });
assert.equal(p2.count, 2, "the two 21 Nov alerts are one week");

// rule cleaning
assert.equal(m.cleanRule({ metrics: [], platforms: ["web"], thresholdPct: 15, minSessions: 100 }).error, "NO_METRIC");
assert.equal(m.cleanRule({ metrics: ["inp"], platforms: [], thresholdPct: 15, minSessions: 100 }).error, "NO_PLATFORM");
assert.equal(m.cleanRule({ metrics: ["inp"], platforms: ["web"], thresholdPct: 0, minSessions: 100 }).error, "BAD_THRESHOLD");
assert.equal(m.cleanRule({ metrics: ["inp"], platforms: ["web"], thresholdPct: 15, minSessions: 5 }).error, "BAD_MIN_SESSIONS");
const r = m.cleanRule({ metrics: ["inp", "inp", "zzz"], platforms: ["web", "ios"], thresholdPct: "15", minSessions: "2000", channels: ["adminRoom", "sms"], mute: "forever", name: "  a   b " });
assert.deepEqual(r.rule, { name: "a b", enabled: true, metrics: ["inp"], platforms: ["web", "ios"], threshold_pct: 15, min_sessions: 2000, channels: ["adminRoom"], mute: "release24h" });
assert.equal(m.muteMs("7d"), 7 * 86400e3);
assert.equal(m.muteMs("none"), 0);

// notification text
assert.equal(m.fmtValue("inp", 268), "268 ms");
assert.equal(m.fmtValue("appstart", 2310), "2.31 s");
assert.equal(m.fmtValue("cls", 0.061), "0.06");
assert.match(m.alertText({ ...inp, prevP75: 182, curP75: 268 }), /^4\.1\.4 Android INP p75 182 ms -> 268 ms \(\+\d+%\), 4000 samples$/);

console.log("perfModel.selftest: ok");
