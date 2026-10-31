// node src/components/admin/dmReview.selftest.mjs
// DM inceleme + En aktifler (3.7.1): metadata-only list, reason-gated view,
// no bulk export, sensitive section, both tabs wired.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ADMIN_NAV_GROUPS } from "./adminNav.js";

const require = createRequire(import.meta.url);
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ui = rd("./AdminDmInbox.jsx");
const panel = rd("./AdminPanel.jsx");
const routes = rd("../../../backend/routes/admin.js");
const store = rd("../../../backend/lib/adminInsightsStore.js");
const perms = require("../../../backend/lib/adminPermissions.js");

// Pure gate, same rule as the server (purpose + at least 10 characters).
const src = ui.slice(ui.indexOf("export const DM_VIEW_PURPOSES"), ui.indexOf("function ViewReasonDialog"));
const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
assert.deepEqual(mod.DM_VIEW_PURPOSES, ["report", "security", "legal"]);
assert.equal(mod.canSubmitView("report", "short"), false);
assert.equal(mod.canSubmitView("report", "   0123456789   "), true);
assert.equal(mod.canSubmitView("curious", "0123456789 long enough"), false);
assert.match(routes, /const DM_VIEW_PURPOSES = Object\.freeze\(\["report", "security", "legal"\]\)/);
assert.match(routes, /reason\.length < 10/);

// Server: text only via POST /dm/:key/view (step-up + audit), no GET thread, no bulk export.
assert.match(routes, /router\.post\("\/dm\/:key\/view"/);
assert.match(routes, /audit\(req\.user, "dm_view", payload\.key, \{\s*purpose,\s*reason,/);
assert.ok(!/router\.get\("\/dm\/:key"/.test(routes), "no GET thread");
assert.ok(!/\/dm\/export/.test(routes) && !/exportDmJson/.test(store), "no bulk export");
assert.match(store, /const DM_META_COLS = "id, from_user_id, to_user_id, created_at"/);
assert.match(store, /\.map\(\(\{ last, \.\.\.c \}\) =>/, "list drops the last-message preview");
assert.match(store, /\.eq\("id", msgId\)\s*\.or\(/, "message delete is scoped to its conversation");
assert.ok(!/fetchAll\("dm_messages", DM_COLS/.test(store), "list and leaderboard never fetch DM text");

// Section: sensitive, never in the legacy default, owner can grant it.
assert.equal(perms.sectionForPath("/dm/conversations"), "dmReview");
assert.equal(perms.sectionForPath("/dm/a::b/view"), "dmReview");
assert.equal(perms.sectionForPath("/activity/leaderboard"), "topUsers");
assert.ok(perms.SENSITIVE_SECTIONS.includes("dmReview"));
assert.ok(!perms.LEGACY_SECTIONS.includes("dmReview"));
assert.ok(perms.LEGACY_SECTIONS.includes("topUsers"));

// Client: dialog in a portal, no preview / export, kinds without emoji, tabs + menu.
assert.match(ui, /<OverlayPortal>/);
assert.match(ui, /adminFetch\(`\/dm\/\$\{encodeURIComponent\(conversation\.key\)\}\/view`, \{\s*method: "POST"/);
assert.ok(!/preview/.test(ui) && !/exportJson|dm\/export/.test(ui));
assert.ok(![...ui].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf)), "no emoji");
assert.match(panel, /\{ id: "dmReview", label: "admin\.dmReview"/);
assert.match(panel, /\{ id: "topUsers", label: "admin\.topUsers"/);
assert.match(panel, /tab === "dmReview" && <AdminDmInbox \/>/);
assert.match(panel, /tab === "topUsers" && <AdminTopUsers \/>/);
const menu = ADMIN_NAV_GROUPS.flatMap(([, ids]) => ids);
assert.ok(menu.includes("dmReview") && menu.includes("topUsers"));

// Copy in both languages.
const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
for (const key of new Set([...ui.matchAll(/t\(["`]admin\.(\w+)/g)].map((m) => m[1]))) {
  if (key === "dmPurpose_") continue;
  assert.ok(new RegExp(`"${key}":`).test(tr), `tr admin.${key}`);
  assert.ok(new RegExp(`"${key}":`).test(en), `en admin.${key}`);
}
for (const p of mod.DM_VIEW_PURPOSES) assert.ok(tr.includes(`"dmPurpose_${p}"`) && en.includes(`"dmPurpose_${p}"`));

// Phone: bottom sheet, 44pt targets; above the 99998 admin shell.
const css = rd("../../styles/admin-dm.css");
assert.match(css, /z-index: 100040/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*height: 44px/);
console.log("dmReview.selftest: ok");
