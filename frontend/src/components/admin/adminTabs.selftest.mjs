// Guards: every merged admin section is registered, ungated, labelled in both
// locales, and reachable from the AdminShell menu (desktop side bar, phone drawer).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "AdminPanel.jsx"), "utf8");
const tr = readFileSync(join(here, "../../i18n/locales/tr.js"), "utf8");
const en = readFileSync(join(here, "../../i18n/locales/en.js"), "utf8");

const block = src.match(/const TABS = \[([\s\S]*?)\n\];/);
assert.ok(block, "TABS array present");
const tabs = [...block[1].matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], label: m[2] }));
const entries = (block[1].match(/\{\s*id:/g) || []).length;
assert.equal(tabs.length, entries, "every TABS entry parsed");
for (const must of ["overview", "maintenance", "directory", "promo", "shop", "security", "audit"]) {
  assert.ok(tabs.some((x) => x.id === must), `tab ${must} registered`);
}
// Admins get every tab, ungated. The only filter is the moderator mode (decisions 25 Oct 2026):
// moderators open the panel with "Şüpheli Davranışlar" alone, and the server enforces it too.
assert.ok(/const tabs = moderatorOnly \? TABS\.filter\(\(x\) => MODERATOR_TABS\.includes\(x\.id\)\) : TABS;/.test(src), "tabs are not filtered/gated client-side for admins");
assert.ok(/MODERATOR_TABS = \["suspicious"\]/.test(src), "moderator mode shows only the suspicious tab");
for (const { label } of tabs) {
  const key = label.split(".").pop();
  if (label.startsWith("admin.")) {
    assert.ok(new RegExp(`"${key}":`).test(tr), `tr label ${label}`);
    assert.ok(new RegExp(`"${key}":`).test(en), `en label ${label}`);
  } else {
    assert.ok(/^[a-zA-Z]+\.[a-zA-Z]+$/.test(label), `namespaced label ${label}`);
  }
}
for (const k of ["sections", "sectionsCount"]) {
  assert.ok(tr.includes(`"${k}":`) && en.includes(`"${k}":`), `locale key admin.${k}`);
}
// Every tab is reachable from the AdminShell side menu (desktop, iPad, phone drawer).
assert.ok(/<AdminShell[\s\S]*?tabs=\{tabs\}/.test(src), "AdminShell gets the same tabs list");
const shell = readFileSync(join(here, "AdminShell.jsx"), "utf8");
assert.ok(/groupAdminTabs\(tabs, t, query\)/.test(shell), "menu lists every tab through groupAdminTabs");
assert.ok(!/sectionsMore|\+\{?\s*n\s*\}? ?bölüm daha/.test(shell), "menu never collapses to +N more");
assert.ok(/className="adm-drawer"/.test(shell), "phone menu drawer rendered");
console.log(`adminTabs.selftest: ok (${tabs.length} tabs)`);
