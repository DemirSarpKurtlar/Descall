// Run: node src/components/admin/adminNav.selftest.mjs
// The admin side menu lists every section the viewer may open, grouped, and the
// search folds Turkish letters (ş, ı, ğ...) so "sup" finds "Şüpheli".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_NAV_GROUPS, groupAdminTabs, openAdminPanelWindow, ADMIN_PANEL_PATH } from "./adminNav.js";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, "AdminPanel.jsx"), "utf8");
const block = panel.match(/const TABS = \[([\s\S]*?)\n\];/);
const tabs = [...block[1].matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], label: m[2] }));
const tr = { "admin.navGroupGeneral": "Genel", "admin.navGroupPeople": "Kullanıcılar", "admin.navGroupContent": "İçerik", "admin.navGroupSystem": "Sistem", "sx.tab": "Şüpheli Davranışlar", "admin.maintenance": "Bakım" };
const t = (k) => tr[k] || k;

// Every real tab has a home in a named group (no silent fallthrough).
const known = new Set(ADMIN_NAV_GROUPS.flatMap(([, ids]) => ids));
for (const tab of tabs) assert.ok(known.has(tab.id), `tab ${tab.id} placed in ADMIN_NAV_GROUPS`);

const all = groupAdminTabs(tabs, t);
assert.equal(all.reduce((n, g) => n + g.items.length, 0), tabs.length, "every tab listed, none hidden");
assert.deepEqual(all.map((g) => g.key), ["general", "people", "content", "system"]);
assert.equal(all[0].items[0].id, "overview", "Genel Bakış first");

// Unknown ids still show (last group), never vanish.
const extra = groupAdminTabs([...tabs, { id: "future", label: "admin.future" }], t);
assert.equal(extra.at(-1).items.at(-1).id, "future");

// Moderators: only their section, empty groups dropped.
const mod = groupAdminTabs(tabs.filter((x) => x.id === "suspicious"), t);
assert.equal(mod.length, 1);
assert.equal(mod[0].items.length, 1);

// Search: Turkish folding, id match, no match = empty.
assert.deepEqual(groupAdminTabs(tabs, t, "sup").flatMap((g) => g.items.map((x) => x.id)), ["suspicious"]);
assert.deepEqual(groupAdminTabs(tabs, t, "BAKIM").flatMap((g) => g.items.map((x) => x.id)), ["maintenance"]);
assert.equal(groupAdminTabs(tabs, t, "zzzz").length, 0);

// Window opener: only Electron, never on the web.
globalThis.window = { electronAPI: null, open: () => ({}) };
assert.equal(openAdminPanelWindow(), false, "web keeps the in-app panel");
let opened = null;
globalThis.window = { electronAPI: { isElectron: true }, open: (u, n) => ((opened = [u, n]), {}) };
assert.equal(openAdminPanelWindow(), true);
assert.deepEqual(opened, [ADMIN_PANEL_PATH, "descall-admin"]);
globalThis.window = { electronAPI: { isElectron: true }, open: () => null };
assert.equal(openAdminPanelWindow(), false, "blocked popup falls back to the in-app panel");
delete globalThis.window;

console.log(`adminNav.selftest ok (${tabs.length} tabs, ${all.length} groups)`);
