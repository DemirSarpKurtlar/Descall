// Guards: every merged admin section is registered, ungated, labelled in both
// locales, and reachable on phones (native picker) and desktop (wrapping bar).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "AdminPanel.jsx"), "utf8");
const css = readFileSync(join(here, "../../styles/admin-liquid.css"), "utf8");
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
assert.ok(/const tabs = TABS;/.test(src), "tabs are not filtered/gated client-side");
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
// Phone picker lists every tab.
assert.ok(/className="admin-tab-picker"/.test(src), "phone section picker rendered");
assert.ok(/<select[^>]*value=\{tab\}[\s\S]*?tabs\.map/.test(src), "picker options come from the same tabs list");
// Layout: desktop wraps, phone swaps the strip for the picker.
assert.ok(/@media \(min-width: 901px\)[\s\S]*?\.admin-tabs\s*\{[^}]*flex-wrap:\s*wrap/.test(css), "desktop tab bar wraps");
assert.ok(/@media \(max-width: 900px\)[\s\S]*?\.admin-tabs\s*\{\s*display:\s*none/.test(css), "phone hides the clipped strip");
assert.ok(/\.admin-tab-picker\s*\{[\s\S]*?display:\s*block/.test(css), "phone shows the picker");
console.log(`adminTabs.selftest: ok (${tabs.length} tabs)`);
