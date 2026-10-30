import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tone, multiplierFor, statusFor, signalTone, sortReasons, rawScore, fmtNumber, maskHash,
  phasesFrom, shortDate, shortDateTime, accountAge, dayOfMonth, chartMax, layoutGraph, canWrite, DEFAULT_WEIGHTS,
  nodeBadge, nodeLabels,
} from "./antibotTab.js";
import { ANTIBOT_TR } from "../i18n/locales/antibot.tr.js";
import { ANTIBOT_EN } from "../i18n/locales/antibot.en.js";

// Colour bands and earning multipliers (40 / 70 thresholds, trusted ×1).
assert.equal(tone(100), "hi");
assert.equal(tone(70), "hi");
assert.equal(tone(69), "mid");
assert.equal(tone(40), "mid");
assert.equal(tone(39), "lo");
assert.equal(multiplierFor(70, false), 0);
assert.equal(multiplierFor(45, false), 0.5);
assert.equal(multiplierFor(10, false), 1);
assert.equal(multiplierFor(100, true), 1);
assert.equal(statusFor(100, false), "stopped");
assert.equal(statusFor(55, false), "half");
assert.equal(statusFor(30, false), "normal");
assert.equal(statusFor(90, true), "trusted");
assert.equal(signalTone(35), "hi");
assert.equal(signalTone(15), "mid");
assert.equal(signalTone(5), "lo");

// Score = sum of weights; the mockup account adds up to 105, capped to 100 elsewhere.
const farm = ["timing_regular", "headless", "linked_account", "automation_client"];
assert.deepEqual(sortReasons(farm), ["linked_account", "automation_client", "timing_regular", "headless"]);
assert.equal(rawScore(farm), 105);
assert.equal(rawScore(["linked_account", "linked_account"]), 35, "duplicates count once");
assert.equal(Object.values(DEFAULT_WEIGHTS).length, 8);

assert.equal(fmtNumber(15370), "15.370");
assert.equal(fmtNumber(0), "0");

// Hash mask: never more than 4 + 4 characters.
assert.equal(maskHash("9f2c0000000000000000e41a"), "9f2c·····e41a");
assert.equal(maskHash("abcd"), "····");
assert.equal(maskHash("9f2c·····e41a"), "9f2c·····e41a");
assert.equal(maskHash(null), "");

const ph = phasesFrom({ monitor: true, rates: false, messageRules: true, mediaRules: false, withhold: false });
assert.deepEqual(ph.map((p) => p.on), [true, true, false, false]);

// Dates are Istanbul time.
assert.equal(shortDate("2026-10-19T00:12:00Z"), "19 Eki");
assert.equal(shortDateTime("2026-10-19T00:12:00Z"), "19 Eki 03:12");
assert.equal(shortDateTime("2026-10-19T00:12:00Z", "en"), "Oct 19 03:12");
assert.equal(shortDate("nope"), "");
const now = Date.parse("2026-10-25T12:00:00Z");
assert.deepEqual(accountAge("2026-10-19T00:12:00Z", now), { n: 6, unit: "day" });
assert.deepEqual(accountAge("2025-10-01T00:00:00Z", now), { n: 1, unit: "year" });
assert.deepEqual(accountAge("2026-10-25T10:00:00Z", now), { n: 0, unit: "today" });
assert.equal(dayOfMonth("2026-10-09"), "9");
assert.ok(chartMax([{ amount: 860 }], 64) >= 860 * 1.1 - 1);
assert.equal(chartMax([], 0), 10);

// Graph: centre in the middle, every edge drawn once, unknown nodes dropped.
const g = layoutGraph({
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: [{ a: "a", b: "b", kinds: ["same_device"] }, { a: "b", b: "a", kinds: [] }, { a: "a", b: "zz", kinds: [] }, { a: "b", b: "c", kinds: ["signup_close"] }],
}, "a");
assert.equal(g.nodes.length, 3);
assert.equal(g.nodes.find((n) => n.id === "a").x, 156);
assert.equal(g.lines.length, 2);
assert.equal(g.lines[0].kind, "same_device");

// Trust / release / watch writes are admin only (server answers 403 too).
assert.equal(canWrite("admin"), true);
assert.equal(canWrite("moderator"), false);

// Copy: same keys in both languages, placeholders match, Turkish says "sen".
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const tr = Object.fromEntries(flat(ANTIBOT_TR));
const en = Object.fromEntries(flat(ANTIBOT_EN));
assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort(), "tr/en keys match");
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of Object.keys(tr)) {
  assert(typeof tr[k] === "string" && tr[k], `tr ${k}`);
  assert.equal(vars(tr[k]), vars(en[k]), `placeholders ${k}`);
}
assert(!/\b(siz|sizin|sizi|lütfen|ediniz|yapınız|edin)\b/i.test(JSON.stringify(ANTIBOT_TR)), "sen dili");
for (const k of Object.keys(DEFAULT_WEIGHTS)) assert(tr[`sig.${k}`] && en[`sig.${k}`], `signal label ${k}`);

// The tab is wired: admin panel lists it, no emoji in pills.
const panel = readFileSync(new URL("../components/admin/AdminPanel.jsx", import.meta.url), "utf8");
assert(panel.includes('id: "suspicious"'), "tab registered");
const tab = readFileSync(new URL("../components/admin/SuspiciousTab.jsx", import.meta.url), "utf8");
assert(!/[\u{1F300}-\u{1FAFF}]/u.test(tab), "no emoji");
assert(!/\/admin\/(ban|timeout)|wallet-freeze/.test(tab), "shortcuts route to the existing tools, no new calls");
const css = readFileSync(new URL("../styles/suspicious.css", import.meta.url), "utf8");
assert(/\.sx-drawer\{[^}]*backdrop-filter:blur\((2[4-9]|[3-9]\d)px\)/.test(css), "heavy frosted glass drawer");
assert(/@media \(max-width:\s*760px\)/.test(css), "mobile layout");
// graph labels
assert.equal(nodeBadge("kral_farm34"), "34");
assert.equal(nodeBadge("deniz.k"), "DE");
assert.equal(nodeBadge(""), "?");
assert.deepEqual(nodeLabels(["kral_farm34", "kral_farm35", "kral_farm37"]), ["farm34", "farm35", "farm37"]);
assert.deepEqual(nodeLabels(["efe.ref", "nazli_ref"]), ["efe.ref", "nazli_ref"]);
assert.equal(nodeLabels(["averyveryverylongname", "x"])[0], "averyveryv…");
// 3.3.0: no moderator role; shortcuts route to the existing dossier tools when the admin may open Kişiler
{
  const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const panel = rd("../components/admin/AdminPanel.jsx");
  assert.doesNotMatch(panel, /MODERATOR_TABS|moderatorOnly/);
  assert.match(panel, /!can\("people"\)/);
  assert.match(panel, /setDossierIntent\(\{ intent, at: Date\.now\(\) \}\)/);
  const app = rd("../App.jsx");
  assert.doesNotMatch(app, /staff:role|isModerator|moderatorOnly/);
  const dossier = rd("../components/admin/AdminUserDossier.jsx");
  assert.match(dossier, /intent\.intent === "timeout" \|\| intent\.intent === "ban"\) setAction\(intent\.intent\)/);
  assert.equal(/intent[^\n]*toggleWalletFreeze|freeze[^\n]*adminFetch/.test(dossier.split("Shortcut from")[1]?.split("useEffect(() => {\n    load()")[0] || ""), false, "freeze shortcut must not run by itself");
  assert.doesNotMatch(rd("../../backend/routes/auth.js"), /staffRole/);
}
console.log("antibot tab selftest: ok");
