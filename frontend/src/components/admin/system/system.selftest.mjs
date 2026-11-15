// Sistem (admin, Draft A "Kontrol merkezi"): pure model, locale parity in 7 languages,
// every sysx.* key the page uses exists, the typed restart word matches the server,
// type scale tokens only, no emoji.
//   node src/components/admin/system/system.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./systemModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const NOW = Date.parse("2026-11-15T12:00:00.000Z");

/* ---- time and numbers ---- */
assert.deepEqual(M.uptimeParts(6 * 86400 + 14 * 3600 + 5 * 60), { d: 6, h: 14, m: 5 });
assert.deepEqual(M.uptimeLabel(6 * 86400 + 14 * 3600), { key: "sysx.time.dh", vars: { d: 6, h: 14 } }, "6 g 14 sa");
assert.equal(M.uptimeLabel(3 * 3600 + 120).key, "sysx.time.hm");
assert.equal(M.uptimeLabel(59).key, "sysx.time.m");
assert.deepEqual(M.agoLabel(new Date(NOW - 3 * 86400000).toISOString(), NOW), { key: "sysx.ago.d", vars: { n: 3 } });
assert.equal(M.agoLabel(new Date(NOW - 20000).toISOString(), NOW).key, "sysx.ago.now");
assert.deepEqual(M.agoShortLabel(new Date(NOW - 3 * 86400000).toISOString(), NOW), { key: "sysx.ago.dShort", vars: { n: 3 } }, "Kapalı · @demir 3 g");
assert.equal(M.liveForLabel(2 * 3600 + 5).key, "sysx.ago.hShort", "Render · yayında 2 sa");
assert.deepEqual(M.bytesParts(2400000), { value: 2.4, unit: "MB" });
assert.deepEqual(M.bytesParts(5300), { value: 5.3, unit: "KB" });
assert.equal(M.clock(24), "0:24");
assert.equal(M.clock(61.2), "1:02");

/* ---- sparklines and chart ---- */
const sp = M.sparkPaths([18, 22, 19, 25, 31], 160, 30);
assert.match(sp.line, /^M0\.0 /);
assert.ok(sp.area.endsWith("Z") && sp.last === 31);
assert.equal(M.sparkPaths([5]).line, "", "one point draws nothing");
assert.ok(M.sparkPaths([1, 1, 1]).line.includes(" 15.0"), "a flat series sits in the middle");
assert.ok(M.sparkPaths([1, null, 3]).line.split("L").length === 2, "nulls are skipped");
assert.equal(M.niceMax([1020, 1284]), 1400, "chart top like the draft (0..1400)");
assert.equal(M.niceMax([]), 10);
assert.equal(M.linePath([0, 700, 1400], 300, 130, 1400), "M0.0 130.0 L150.0 65.0 L300.0 0.0");
const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(2 + i).padStart(2, "0")}` }));
assert.equal(M.markerX("2026-11-01T10:00:00Z", days), null, "before the window");
assert.ok(Math.abs(M.markerX("2026-11-09T00:00:00+03:00", days) - 7 / 13) < 1e-9);
assert.deepEqual(M.dedupeMarkers([{ stage: "p5", at: "1" }, { stage: "p5", at: "2" }, { stage: "team", at: "0" }]).map((m) => m.at), ["0", "2"]);

/* ---- flags ---- */
assert.deepEqual(M.normalizeRule({ mode: "bad", percent: 300, platforms: ["web", "tv", "ios"], staff: ["A", "a"] }), { mode: "off", percent: 100, platforms: ["web", "ios"], staff: ["a"] });
assert.ok(M.sameRule({ mode: "off", percent: 25 }, { mode: "off", percent: 0 }), "percent only matters while rolling out");
assert.ok(!M.sameRule({ mode: "rollout", percent: 25 }, { mode: "rollout", percent: 26 }));
assert.ok(M.sameRule({ mode: "staff", staff: ["b", "a"] }, { mode: "staff", staff: ["a", "b"] }));
let cell = M.rolloutCell({ mode: "all" });
assert.equal(cell.key, "sysx.reach.all");
assert.deepEqual(cell.value, { key: "sysx.pct", vars: { n: 100 } }, "Herkes %100");
cell = M.rolloutCell({ mode: "staff", staff: ["1", "2", "3", "4"] });
assert.deepEqual([cell.key, cell.value.vars.n], ["sysx.reach.staff", 4], "Ekip 4 kişi");
cell = M.rolloutCell({ mode: "rollout", percent: 25 });
assert.deepEqual([cell.key, cell.bar], ["sysx.reach.partial", 25], "Kısmi %25");
assert.equal(M.rolloutCell({ mode: "off", percent: 25 }).value.key, "sysx.pausedAt");
assert.deepEqual(M.scopeKeys({ kind: "client", allowed: ["ios"], rule: { platforms: [] } }), ["sysx.platform.ios"]);
assert.deepEqual(M.scopeKeys({ kind: "client", allowed: ["web", "electron"], rule: { platforms: ["web", "electron"] } }), ["sysx.platform.electron", "sysx.platform.web"], "Masaüstü, Web");
assert.deepEqual(M.scopeKeys({ kind: "server", rule: {} }), ["sysx.platform.all"], "Tümü");
assert.deepEqual(M.reachEstimate({ mode: "rollout", percent: 25 }, 7760), { n: 1940, total: 7760 }, "Yaklaşık 1.940 / 7.760");
assert.equal(M.reachEstimate({ mode: "staff", staff: ["a", "b"] }, 7760).n, 2);
const title = M.stateTitle({ mode: "rollout", percent: 25, platforms: ["electron", "web"] });
assert.deepEqual(title[0], { key: "sysx.mode.rolloutPct", vars: { n: 25 } });
assert.deepEqual(title[1].list, ["sysx.platform.web", "sysx.platform.electron"], "Kademeli %25 · Web, Masaüstü");
assert.equal(M.stateTitle(null), null);
assert.equal(M.ruleError({ kind: "server" }, { mode: "rollout", percent: 20 }), "sysx.err.serverWide");
assert.equal(M.ruleError({ kind: "client", allowed: ["web", "electron"] }, { mode: "rollout", percent: 0, platforms: ["web"] }), "sysx.err.percent");
assert.equal(M.ruleError({ kind: "client", allowed: ["web", "electron"] }, { mode: "staff", platforms: ["web"] }), "sysx.err.noStaff");
assert.equal(M.ruleError({ kind: "client", allowed: ["web", "electron"] }, { mode: "all", platforms: [] }), "sysx.err.noPlatform");
assert.equal(M.ruleError({ kind: "edge" }, { mode: "staff" }), null, "edge shadow = team with nobody");
assert.deepEqual(M.flagBody({ mode: "rollout", percent: 25.4 }, { reason: "  Ekip   testi ", autoRollback: 1 }), { rule: { mode: "rollout", percent: 25, platforms: [], staff: [] }, reason: "Ekip testi", autoRollback: true });
assert.deepEqual(M.stageStates("p25").map((s) => s.state), ["done", "done", "done", "current", "pending", "pending"], "Gölge Ekip %5 done, %25 current");
assert.ok(M.stageStates(null).every((s) => s.state === "pending"));

/* ---- switches, limits, maintenance ---- */
assert.deepEqual(M.cuttingKeys({ dmEnabled: false, chatFrozen: false, voice: true }), ["dmEnabled"]);
assert.deepEqual(M.cuttingKeys({ chatFrozen: true }), ["chatFrozen"]);
const groups = [{ id: "chat", keys: ["chatFrozen", "slowModeSeconds"] }, { id: "account", keys: ["registrationEnabled", "dmEnabled"] }];
assert.equal(M.switchRows(groups, {}, "area"), groups, "by area = server groups");
const byState = M.switchRows(groups, { chatFrozen: false, slowModeSeconds: 10, registrationEnabled: true, dmEnabled: false }, "state");
assert.deepEqual(byState[0], { id: "cut", keys: ["slowModeSeconds", "dmEnabled"] }, "cut-off first");
assert.equal(M.slowStep(0, 1), 5);
assert.equal(M.slowStep(10, -1), 5);
assert.equal(M.slowStep(7, -1), 5);
assert.equal(M.slowStep(600, 1), 600);
assert.deepEqual(M.limitsPatch({ maxMessageLength: "4.000", rateLimitGlobalMs: "0" }, { maxMessageLength: 2000, rateLimitGlobalMs: 0 }, { maxMessageLength: [1, 20000], rateLimitGlobalMs: [0, 60000] }), { patch: { maxMessageLength: 4000 } });
assert.deepEqual(M.limitsPatch({ maxMessageLength: "0" }, {}, { maxMessageLength: [1, 20000] }), { error: "maxMessageLength" });
assert.deepEqual(M.untilLabel(new Date(NOW + (33 * 3600 + 30) * 1000).toISOString(), NOW), { key: "sysx.time.dh", vars: { d: 1, h: 9 } }, "1 g 9 sa");
assert.equal(M.untilLabel(new Date(NOW - 1000).toISOString(), NOW), null);
assert.ok(M.maintenanceSoon({ status: "scheduled", startsAt: new Date(NOW + 20 * 3600000).toISOString() }, NOW));
assert.ok(!M.maintenanceSoon({ status: "scheduled", startsAt: new Date(NOW + 72 * 3600000).toISOString() }, NOW));

/* ---- safe restart ---- */
assert.ok(M.typedMatches("YENİDEN BAŞLAT", "YENİDEN BAŞLAT"));
assert.ok(M.typedMatches(" yeniden   başlat ", "YENİDEN BAŞLAT"), "Turkish upper-casing of i");
assert.ok(M.typedMatches("restart", "RESTART"));
assert.ok(!M.typedMatches("YENIDEN BASLAT", "YENİDEN BAŞLAT"));
assert.ok(!M.restartReady({ reason: "kısa", typed: "RESTART", word: "RESTART" }), "reason at least 5 characters");
assert.ok(M.restartReady({ reason: "Bellek 900 MB'ı geçti", typed: "RESTART", word: "RESTART" }));
assert.ok(!M.restartReady({ reason: "Bellek 900 MB'ı geçti", typed: "RESTART", word: "RESTART", busy: true }));
assert.deepEqual(M.restartStepRows(null).map((r) => [r.key, r.status]), [["stop", "pending"], ["notify", "pending"], ["drain", "pending"], ["backup", "pending"], ["exit", "pending"]]);
assert.equal(M.restartStepRows({ steps: [{ key: "drain", status: "active" }] })[2].status, "active");
assert.equal(M.downtimeSec("2026-11-12T03:10:00Z", "2026-11-12T03:10:41Z"), 41);
assert.equal(M.avatarColor("demir"), M.avatarColor("demir"));

/* ---- server agrees ---- */
const restart = require("../../../../backend/lib/systemRestart.js");
assert.deepEqual([...M.RESTART_STEPS], [...restart.STEPS], "same steps as the server");
for (const [code, word] of Object.entries(restart.CONFIRM_WORDS)) {
  const mod = await import(pathToFileURL(join(here, `../../../i18n/locales/sysx.${code}.js`)).href);
  const loc = Object.values(mod)[0];
  assert.equal(loc.rs.confirmWord, word, `${code}: typed word matches the server`);
  assert.ok(restart.confirmMatches(loc.rs.confirmWord), `${code}: server accepts it`);
}
const flagsLib = require("../../../../backend/lib/systemFlags.js");
assert.deepEqual([...M.EDGE_STAGES], [...flagsLib.EDGE_STAGES], "same edge stages as the server");

/* ---- locale parity ---- */
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
function flat(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flat(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const packs = {};
for (const code of LOCALES) {
  const mod = await import(pathToFileURL(join(here, `../../../i18n/locales/sysx.${code}.js`)).href);
  packs[code] = flat(Object.values(mod)[0]);
}
const base = packs.tr;
for (const code of LOCALES) {
  assert.deepEqual(Object.keys(packs[code]).sort(), Object.keys(base).sort(), `${code}: same keys as tr`);
  for (const [k, v] of Object.entries(packs[code])) {
    assert.equal(typeof v, "string", `${code}.${k} is text`);
    assert.ok(v.trim().length > 0, `${code}.${k} not empty`);
    assert.equal(vars(v), vars(base[k]), `${code}.${k} placeholders`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(v), `${code}.${k}: no emoji`);
  }
  const main = readFileSync(join(here, `../../../i18n/locales/${code}.js`), "utf8");
  assert.match(main, new RegExp(`from "\\./sysx\\.${code.replace("-", "\\-")}\\.js"`), `${code}.js imports sysx`);
  assert.match(main, /"?sysx"?: SYSX_/, `${code}.js registers sysx`);
}

/* ---- every key the page uses exists ---- */
const files = readdirSync(here).filter((f) => /\.jsx?$/.test(f) && !f.includes("selftest"));
files.push("../../system/ServerRestartStrip.jsx");
const used = new Set();
const dynamic = [];
for (const f of files) {
  const src = readFileSync(join(here, f), "utf8");
  assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${f}: no emoji`);
  assert.ok(!/valorant|takım bul|\blfg\b/i.test(src), `${f}: retired feature`);
  for (const m of src.matchAll(/["'`](sysx\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/`(sysx\.[^`]*\$\{[^`]+)`/g)) dynamic.push(m[1]);
}
for (const k of used) {
  if (k.endsWith(".")) continue;
  assert.ok(k.slice(5) in base || Object.keys(base).some((b) => b.startsWith(`${k.slice(5)}.`)), `missing locale key ${k}`);
}
for (const fk of flagsLib.FLAG_KEYS) for (const p of ["name", "desc", "long"]) assert.ok(`flag.${fk}.${p}` in base, `flag.${fk}.${p}`);
for (const s of M.EDGE_STAGES) assert.ok(`stage.${s}` in base);
for (const k of Object.keys(M.SWITCH_CUTS)) assert.ok(`cut.${k}.title` in base && `cut.${k}.body` in base && `sw.${k}` in base, `switch ${k}`);
for (const k of restart.STEPS) assert.ok(`rs.step.${k}.t` in base && `rs.step.${k}.d` in base, `restart step ${k}`);
assert.ok(dynamic.length > 0, "dynamic keys are listed above");

/* ---- styles ---- */
for (const css of ["../../../styles/admin-system.css", "../../../styles/server-restart-strip.css"]) {
  const s = readFileSync(join(here, css), "utf8");
  for (const m of s.matchAll(/font-size:\s*([^;]+);/g)) {
    assert.match(m[1].trim(), /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `${css} font-size ${m[1]}`);
  }
  assert.ok(!/\p{Extended_Pictographic}/u.test(s));
}
const page = readFileSync(join(here, "../../../styles/admin-system.css"), "utf8");
assert.match(page, /html\.glass-desktop :is\(\.asx, \.asx-scrim\)/, "focus ring wins over the glass-desktop rule");
assert.match(page, /\.asx-pop \{[^}]*background: #1d1e2b/, "menus are opaque");
assert.match(page, /\.asx-dlg \{[^}]*#1b1c28/, "dialogs are opaque");

console.log("system.selftest ok");
