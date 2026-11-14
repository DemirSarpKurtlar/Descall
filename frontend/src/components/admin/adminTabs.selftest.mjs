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
// İtirazlar (ban experience): registered, labelled from the banAdmin namespace, rendered.
assert.ok(tabs.some((x) => x.id === "appeals" && x.label === "banAdmin.navAppeals"), "İtirazlar tab registered");
assert.match(src, /import AdminAppeals from "\.\/AdminAppeals\.jsx";/);
assert.match(src, /\{tab === "appeals" && <AdminAppeals \/>\}/, "İtirazlar tab rendered");
// banAdmin.<locale>.js: same keys in every language, registered as "banAdmin" in each catalog.
const leafKeys = (obj, p = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? leafKeys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
const BAN_LOCALES = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
let banKeys = null;
for (const [loc, suf] of Object.entries(BAN_LOCALES)) {
  const mod = await import(new URL(`../../i18n/locales/banAdmin.${loc}.js`, import.meta.url).href);
  const keys = leafKeys(mod[`BAN_ADMIN_${suf}`]);
  if (!banKeys) banKeys = keys;
  assert.deepEqual(keys, banKeys, `banAdmin.${loc}.js has the same keys as banAdmin.tr.js`);
  const cat = readFileSync(join(here, `../../i18n/locales/${loc}.js`), "utf8");
  assert.match(cat, new RegExp(`import \\{ BAN_ADMIN_${suf} \\} from "\\./banAdmin\\.${loc.replace("-", "\\-")}\\.js";`), `${loc}.js imports banAdmin`);
  assert.match(cat, new RegExp(`"?banAdmin"?: BAN_ADMIN_${suf},`), `${loc}.js registers banAdmin`);
}
assert.ok(banKeys.includes("navAppeals"));
// 3.3.0: no moderator mode. Each admin sees the sections the owner granted
// (GET /admin/me/permissions); the server checks the same list on every request.
assert.ok(!/moderatorOnly|MODERATOR_TABS/.test(src), "moderator mode is gone");
assert.ok(/const tabs = useMemo\(\(\) => visibleTabs\(perm\.sections\), \[perm\.sections\]\);/.test(src), "tabs follow the granted sections");
assert.ok(tabs.some((x) => x.id === "staff"), "Yöneticiler section registered");
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
