// node src/components/admin/growth/growth.selftest.mjs
// Faz 3 (3.7.5): Elde tutma + DesCoin ekonomisi wiring, copy, chart rules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ADMIN_NAV_GROUPS } from "../adminNav.js";

const require = createRequire(import.meta.url);
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const charts = rd("./GrowthCharts.jsx");
const ret = rd("./RetentionTab.jsx");
const eco = rd("./EconomyTab.jsx");
const panel = rd("../AdminPanel.jsx");
const route = rd("../../../../backend/routes/adminGrowth.js");
const perms = require("../../../../backend/lib/adminPermissions.js");
const tr = rd("../../../i18n/locales/tr.js");
const en = rd("../../../i18n/locales/en.js");

// Pure helpers.
const pure = charts.slice(charts.indexOf("export const SERIES_A"), charts.indexOf("/**\n * @param"));
const heat = charts.slice(charts.indexOf("export function heatColor"));
const mod = await import(`data:text/javascript,${encodeURIComponent(pure + "\n" + heat)}`);
assert.equal(mod.niceMax(0), 1);
assert.equal(mod.niceMax(73), 100);
assert.equal(mod.niceMax(1400), 2000);
assert.equal(mod.niceMax(12000), 20000);
assert.equal(mod.heatColor(null), "transparent");
assert.equal(mod.heatColor(0), "rgba(255, 255, 255, 0.04)", "0% reads as empty, not as a colour");
assert.notEqual(mod.heatColor(10), mod.heatColor(90), "sequential steps grow with the share");
assert.equal(mod.SERIES_A, "#3987e5");
assert.equal(mod.SERIES_B, "#d95926");

// One y-axis, legend for 2+ series, tooltip on hover.
assert.ok(!/yRight|secondAxis/.test(charts), "never a second axis");
assert.match(charts, /series\.length > 1 \? \(\s*<div className="agr-legend">/);
assert.match(charts, /className="agr-tip"/);

// Server + sections.
assert.equal(perms.sectionForPath("/growth/retention"), "retention");
assert.equal(perms.sectionForPath("/growth/economy"), "economy");
assert.ok(perms.LEGACY_SECTIONS.includes("retention") && perms.LEGACY_SECTIONS.includes("economy"));
assert.match(route, /rpcAll\("admin_activity_days"/);
assert.match(route, /rpcAll\("admin_descoin_flow"/);
assert.match(route, /\.in\("reason", \["admin_grant", "admin_revoke"\]\)/, "admin-granted coins are separated");
const menu = ADMIN_NAV_GROUPS.flatMap(([, ids]) => ids);
assert.ok(menu.includes("retention") && menu.includes("economy"));
assert.match(panel, /tab === "retention" && <RetentionTab \/>/);
assert.match(panel, /tab === "economy" && <EconomyTab \/>/);

// Copy in both languages; flags never as emoji text.
for (const src of [ret, eco]) {
  for (const key of new Set([...src.matchAll(/t\(["`]admin\.(\w+)/g)].map((m) => m[1]))) {
    if (key.endsWith("_")) continue;
    assert.ok(tr.includes(`"${key}":`), `tr admin.${key}`);
    assert.ok(en.includes(`"${key}":`), `en admin.${key}`);
  }
}
for (const k of ["activity", "daily", "promo", "referral", "refund", "shop", "other"]) {
  assert.ok(tr.includes(`"ecoSrc_${k}":`) && en.includes(`"ecoSrc_${k}":`), `ecoSrc_${k}`);
}
assert.match(eco, /replace\(\/\[\\u\{1F1E6\}-\\u\{1F1FF\}\]\/gu, ""\)/, "shop item names lose flag emoji");
assert.ok(![...ret + eco + charts].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf)), "no emoji");
const css = rd("../../../styles/admin-growth.css");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*height: 44px/);
console.log("growth.selftest: ok");
