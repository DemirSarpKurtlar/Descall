// Run: node src/components/admin/premium/premiumNav.selftest.mjs
// Premium Yönetimi is registered in the admin menu: a "premium" group between
// Kullanıcılar and İçerik with nine pages, one permission section ("premium")
// that the server grants and maps /admin/premium/* to, labels in every locale,
// and a lazily loaded page component for each id.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ADMIN_NAV_GROUPS, TAB_SECTION, sectionOfTab, menuSections, groupAdminTabs, SECTION_LABEL } from "../adminNav.js";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const perms = require("../../../../backend/lib/adminPermissions.js");

const PAGES = [
  "premiumDashboard", "premiumUsers", "premiumBulk", "premiumHistory", "premiumAnalytics",
  "premiumFinance", "premiumCampaigns", "premiumAudit", "premiumPlans",
];

// Menu group, in place.
const keys = ADMIN_NAV_GROUPS.map(([k]) => k);
assert.deepEqual(keys, ["general", "people", "premium", "content", "system"], "premium sits between people and content");
assert.deepEqual(ADMIN_NAV_GROUPS.find(([k]) => k === "premium")[1], PAGES, "nine pages in menu order");
for (const id of PAGES) assert.equal(sectionOfTab(id), "premium");
assert.equal(sectionOfTab("promo"), "promo", "other pages are their own section");
assert.deepEqual(Object.keys(TAB_SECTION), PAGES);
assert.equal(menuSections().filter((s) => s === "premium").length, 1, "one section for the nine pages");
assert.equal(SECTION_LABEL.premium, "premiumAdmin.navGroup");

// Server: grantable, path rule, granted admins only.
assert.ok(perms.GRANTABLE_SECTIONS.includes("premium"));
for (const p of ["/premium/dashboard", "/premium/users/search", "/premium/users/u/apply", "/premium/bulk", "/premium/events", "/premium/analytics", "/premium/finance", "/premium/audit", "/premium/campaigns/c/stats", "/premium/plans/plus"]) {
  assert.equal(perms.sectionForPath(p), "premium", p);
}
assert.ok(perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: ["premium"] }).includes("premium"));
assert.ok(!perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: ["promo"] }).includes("premium"));

// AdminPanel: TABS entries with namespaced labels, visibleTabs follows the section, lazy chunk.
const panel = rd("../AdminPanel.jsx");
const block = panel.match(/const TABS = \[([\s\S]*?)\n\];/)[1];
for (const id of PAGES) {
  assert.ok(new RegExp(`\\{ id: "${id}", label: "premiumAdmin\\.nav\\w+"`).test(block), `TABS has ${id}`);
}
assert.match(panel, /allow\.has\(sectionOfTab\(x\.id\)\)/, "visibleTabs maps pages to their section");
assert.match(panel, /lazy\(\(\) => import\("\.\/premium\/PremiumAdmin\.jsx"\)\)/, "premium pages load lazily");
assert.match(panel, /sectionOfTab\(tab\) === "premium"/);

// Each page id has a component in the router.
const router = rd("./PremiumAdmin.jsx");
for (const id of PAGES) assert.match(router, new RegExp(`\\b${id}:`), `PremiumAdmin routes ${id}`);

// The menu shows the group and finds pages by name.
const tabs = PAGES.map((id) => ({ id, label: `premiumAdmin.nav${id.slice(7)}` }));
const t = (k) => ({ "premiumAdmin.navGroup": "Premium Yönetimi", "premiumAdmin.navFinance": "Finansal Raporlar" }[k] || k);
const grouped = groupAdminTabs(tabs, t);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].label, "Premium Yönetimi");
assert.deepEqual(groupAdminTabs(tabs, t, "finansal").flatMap((g) => g.items.map((x) => x.id)), ["premiumFinance"]);

// Labels exist in all seven locales (fragment pair + inline blocks).
const en = rd("../../../i18n/locales/premiumAdmin.en.js");
const tr = rd("../../../i18n/locales/premiumAdmin.tr.js");
for (const src of [en, tr]) for (const k of ["navGroup", ...PAGES.map((id) => `nav${id.slice(7)}`)]) assert.match(src, new RegExp(`\\b${k}:`), k);
for (const loc of ["de", "es", "fr", "pt-BR", "ru"]) {
  assert.match(rd(`../../../i18n/locales/${loc}.js`), /"premiumAdmin": \{/, `${loc} has the premiumAdmin block`);
}
assert.match(rd("../../../i18n/locales/en.js"), /premiumAdmin: PREMIUM_ADMIN_EN/);
assert.match(rd("../../../i18n/locales/tr.js"), /premiumAdmin: PREMIUM_ADMIN_TR/);

// Production code never imports the e2e mock.
for (const f of ["./PremiumAdmin.jsx", "./premiumApi.js"]) assert.ok(!/e2e|mock/i.test(rd(f).replace(/\/\*[\s\S]*?\*\//g, "")), `${f} has no mock`);
console.log("premiumNav.selftest ok");
