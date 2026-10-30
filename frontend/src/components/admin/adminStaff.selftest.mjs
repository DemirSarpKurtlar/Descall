// node src/components/admin/adminStaff.selftest.mjs
// Yöneticiler (3.3.0): section groups follow the menu, legacy null = all, owner-only wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_NAV_GROUPS } from "./adminNav.js";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const src = rd("./AdminStaff.jsx");
const panel = rd("./AdminPanel.jsx");
const backend = rd("../../../backend/lib/adminPermissions.js");

// The client and server agree on the grantable sections.
const grantable = [...backend.match(/GRANTABLE_SECTIONS = Object\.freeze\(\[([\s\S]*?)\]\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const menu = ADMIN_NAV_GROUPS.flatMap(([, ids]) => ids);
for (const id of grantable) assert.ok(menu.includes(id), `section ${id} is in the menu`);
for (const id of menu) {
  if (id === "overview" || id === "staff") continue;
  assert.ok(grantable.includes(id), `menu entry ${id} is grantable on the server`);
}
assert.ok(menu.includes("staff"), "Yöneticiler is listed in the menu");
assert.ok(!grantable.includes("staff") && !grantable.includes("overview"), "staff is owner-only, overview always on");

// Pure helpers (copied shape check: they are exported).
assert.match(src, /export function staffGroups\(grantable\)/);
assert.match(src, /export function effectiveSections\(sections, grantable\)/);
assert.match(src, /sections == null \? \[\.\.\.\(grantable \|\| \[\]\)\]/, "legacy null shows every section");

// Owner only, server routes, native checkbox through GlassCheckbox, no emoji.
assert.match(panel, /tab === "staff" && perm\.owner && <AdminStaff tabs=\{TABS\} \/>/);
assert.match(src, /adminFetch\(`\/staff\/\$\{encodeURIComponent\(admin\.id\)\}\/sections`, \{ method: "PUT"/);
assert.match(src, /adminFetch\(`\/remove-admin\//);
assert.match(src, /adminFetch\(`\/make-admin\//);
assert.ok(!/type="checkbox"/.test(src), "GlassCheckbox only");
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), "no emoji");

// Copy exists in both languages.
const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
for (const key of [...src.matchAll(/t\("admin\.(\w+)"/g)].map((m) => m[1])) {
  assert.ok(new RegExp(`"${key}":`).test(tr), `tr admin.${key}`);
  assert.ok(new RegExp(`"${key}":`).test(en), `en admin.${key}`);
}
assert.ok(!/roleModerator/.test(tr + en), "moderator label removed");

// Phone: 44pt targets.
const css = rd("../../styles/admin-staff.css");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*height: 44px/);
console.log("adminStaff.selftest: ok");
