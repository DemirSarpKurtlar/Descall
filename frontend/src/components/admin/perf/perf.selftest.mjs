// node src/components/admin/perf/perf.selftest.mjs
// Performans console: ratings + formatting, query tokens <-> server query, toggles,
// suggestions, shareable links, chart domain; wiring (menu, section, BanDialog-free,
// opaque dialogs from the İşlem kaydı kit), locale key parity, no emoji / Valorant.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  BUILTIN_VIEWS,
  addToken,
  chartDomain,
  deltaChip,
  fmtValue,
  niceTicks,
  parseViewLink,
  queryToTokens,
  rating,
  sameQuery,
  shortUser,
  suggestionsFor,
  toggleToken,
  tokensToQuery,
  viewLink,
} from "./perfAdminModel.js";

// ratings (web.dev thresholds, same as the backend)
assert.equal(rating("lcp", 2140), "g");
assert.equal(rating("inp", 236), "n");
assert.equal(rating("inp", 600), "p");
assert.equal(rating("cls", 0.05), "g");
assert.equal(rating("cls", 0.14), "n");
assert.equal(rating("appstart", 2310), "n");
assert.equal(rating("inp", null), "x");

// formatting in the UI language
assert.equal(fmtValue("lcp", 2140, "tr"), "2,14 s");
assert.equal(fmtValue("inp", 196, "en"), "196 ms");
assert.equal(fmtValue("cls", 0.05, "tr"), "0,05");
assert.equal(fmtValue("inp", null), "—");
const tt = (k, v) => (k === "perfAdmin.unit.s" ? `${v.n} sn` : `${v.n} ms`);
assert.equal(fmtValue("lcp", 2140, "tr", tt), "2,14 sn");
assert.deepEqual(deltaChip("inp", 9, "en"), { text: "+9%", tone: "up" });
assert.deepEqual(deltaChip("lcp", -4, "en"), { text: "-4%", tone: "dn" });
assert.equal(deltaChip("cls", -0.01, "en").text, "-0.01");
assert.equal(deltaChip("ttfb", 0).tone, "flat");
assert.equal(deltaChip("ttfb", null), null);
assert.equal(shortUser("3f2a9c1e-1111-4222-8333-444455556666"), "#3f2a9c1e");

// tokens
const q = tokensToQuery([{ kind: "range", value: "7d" }, { kind: "platform", value: ["android"] }, { kind: "version", value: ["4.1.3", "4.1.4"] }, { kind: "user", value: "#3F2A9C1E" }]);
assert.deepEqual(q, { range: "7d", platform: ["android"], version: ["4.1.3", "4.1.4"], route: [], device: [], connection: [], country: [], user: "3f2a9c1e" });
assert.deepEqual(queryToTokens(q), [{ kind: "range", value: "7d" }, { kind: "platform", value: ["android"] }, { kind: "version", value: ["4.1.3", "4.1.4"] }, { kind: "user", value: "3f2a9c1e" }]);
let toks = addToken([{ kind: "range", value: "28d" }], "platform", "ios");
toks = addToken(toks, "platform", "android");
toks = addToken(toks, "platform", "android");
assert.deepEqual(toks[1].value, ["ios", "android"]);
toks = addToken(toks, "range", "24h");
assert.equal(toks.filter((x) => x.kind === "range").length, 1);
toks = toggleToken(toks, "platform", "ios");
assert.deepEqual(tokensToQuery(toks).platform, ["android"]);
toks = toggleToken(toks, "platform", "android");
assert.equal(toks.some((x) => x.kind === "platform"), false, "the last value removes the token");
assert.equal(addToken(toks, "bogus", "x"), toks);
assert.equal(sameQuery({ range: "28d", platform: ["ios", "web"] }, { range: "28d", platform: ["web", "ios"] }), true);
assert.equal(sameQuery({ range: "28d" }, { range: "7d" }), false);
assert.equal(BUILTIN_VIEWS[0].id, "all");

// suggestions
const facets = { version: ["4.1.4", "4.1.3"], route: ["app/kanal", "app/dm", "/download"], country: ["TR", "DE"] };
const labels = { platform: (p) => ({ android: "Android", ios: "iOS" })[p] || p, device: (d) => ({ low: "Düşük" })[d] || d };
assert.equal(suggestionsFor("and", facets, labels)[0].kind, "platform");
assert.deepEqual(suggestionsFor("4.1", facets, labels).map((s) => s.value), ["4.1.4", "4.1.3"]);
assert.ok(suggestionsFor("app/", facets, labels).every((s) => s.kind === "route"));
assert.equal(suggestionsFor("düş", facets, labels)[0].value, "low");
assert.equal(suggestionsFor("tr", facets, labels).find((s) => s.kind === "country").value, "TR");
assert.equal(suggestionsFor("#3f2a9c1e", facets, labels)[0].kind, "user");
assert.ok(suggestionsFor("", facets, labels).every((s) => s.kind === "range"));

// shareable links round-trip (non-ASCII safe)
const link = viewLink("https://descall.com/", { range: "7d", platform: ["android"], country: ["TR"], route: ["app/kanal"] }, "rum");
assert.match(link, /^https:\/\/descall\.com\/admin\/panel\?tab=perf#perf=[A-Za-z0-9_-]+$/);
const back = parseViewLink(link.slice(link.indexOf("#")));
assert.equal(back.tab, "rum");
assert.deepEqual(back.query.platform, ["android"]);
assert.deepEqual(back.query.route, ["app/kanal"]);
assert.equal(parseViewLink("#perf=!!!"), null);
assert.equal(parseViewLink(""), null);
assert.equal(parseViewLink(viewLink("x", { range: "24h" }, "lh").replace(/^[^#]*/, "")).tab, "lh");

// chart geometry
const dom = chartDomain({ android: [180, 268], ios: [140, null] }, "inp");
assert.ok(dom.min < 140 && dom.max > 268);
assert.deepEqual(chartDomain({}, "inp"), { min: 0, max: 320 });
assert.deepEqual(niceTicks(60, 320, 3), [100, 200, 300]);

// wiring
const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const panel = rd("../AdminPanel.jsx");
assert.match(panel, /\{ id: "perf", label: "perfAdmin\.title", icon: Gauge, badgeTone: "red", newLabel: "perfAdmin\.new" \}/);
assert.match(panel, /tab === "perf" && <AdminPerf /);
assert.match(rd("../adminNav.js"), /"errors", "perf", "audit"/, "menu: Hata Kayıtları, Performans, İşlem kaydı (draft order)");
assert.match(rd("../../../../backend/lib/adminPermissions.js"), /\[\/\^\\\/perf\(\\\/\|\$\)\/, "perf"\]/);
const main = rd("./AdminPerf.jsx");
assert.match(main, /from "\.\.\/audit\/AuditUi\.jsx"/, "İşlem kaydı Konsol kit");
assert.match(main, /"\.\.\/\.\.\/\.\.\/styles\/admin-audit\.css"/);
assert.match(rd("./PerfDialogs.jsx"), /AuditDialog/, "opaque dialogs");
assert.match(rd("./PerfDrawer.jsx"), /useFocusTrap/, "drawer traps focus");
for (const f of readdirSync(new URL(".", import.meta.url)).filter((x) => /\.(jsx|js)$/.test(x))) {
  const src = rd(`./${f}`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), `no emoji in ${f}`);
  assert.ok(!/valorant|takım bul|takim bul/i.test(src), `no retired feature in ${f}`);
}

// locale parity: every perfAdmin.<locale>.js has the same keys and placeholders
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const loc = async (l) => {
  const m = await import(`../../../i18n/locales/perfAdmin.${l}.js`);
  return Object.fromEntries(flat(Object.values(m)[0]));
};
const tr = await loc("tr");
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
for (const l of ["en", "de", "es", "fr", "pt-BR", "ru"]) {
  const other = await loc(l);
  assert.deepEqual(Object.keys(other).sort(), Object.keys(tr).sort(), `keys ${l}`);
  for (const k of Object.keys(tr)) assert.equal(vars(other[k]), vars(tr[k]), `placeholders ${l} ${k}`);
}
// every key the screens use exists
const used = new Set();
for (const f of ["AdminPerf.jsx", "PerfChart.jsx", "PerfDialogs.jsx", "PerfDrawer.jsx", "PerfLighthouse.jsx", "PerfQueryBar.jsx", "perfAdminModel.js"]) {
  for (const m of rd(`./${f}`).matchAll(/t\("perfAdmin\.([A-Za-z0-9_.]+)"/g)) used.add(m[1]);
}
for (const k of used) assert.ok(k in tr, `missing perfAdmin.${k}`);
for (const k of ["platform.android", "device.low", "conn.3g", "range.28d", "metric.appstart", "metricSub.inp", "tok.user", "group.country", "table.title.route", "views.mobileSlow", "drawer.tab.users", "drawer.itype.keyboard", "lh.view.over", "lh.tok.compare", "lh.cat.best_practices", "lh.st.over", "rules.ch.errorLog", "rules.muteOpt.7d", "route.app_kanal"]) assert.ok(k in tr, `dynamic key ${k}`);

console.log("perf.selftest: ok");
