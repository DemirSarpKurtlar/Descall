// node src/components/admin/serverReview.selftest.mjs
// Sunucu inceleme: the same guarantees as DM inceleme (dmReview.selftest.mjs),
// pinned for servers. Metadata-only list / detail / members, channel text only
// through a POST view with purpose + reason >= 10 + step-up + audit (purpose,
// reason, server, channel, range), no GET thread, no export, delete scoped to
// the channel, sensitive section the owner grants, tab + menu wired, copy in
// every language, DM-style edit retention migration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ADMIN_NAV_GROUPS, menuSections } from "./adminNav.js";
import {
  SERVER_VIEW_PURPOSES,
  SERVER_REASON_MIN,
  canSubmitView,
  canConfirmDelete,
  mergePage,
  listQuery,
  errorKey,
  roleColor,
  RISK_FACTORS,
} from "./serverReviewModel.js";

const require = createRequire(import.meta.url);
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ui = rd("./AdminServerReview.jsx");
const model = rd("./serverReviewModel.js");
const panel = rd("./AdminPanel.jsx");
const routes = rd("../../../backend/routes/adminServerReview.js");
const adminRoutes = rd("../../../backend/routes/admin.js");
const store = rd("../../../backend/lib/serverReviewStore.js");
const edit = rd("../../../backend/socket/serverChannelHandlers.js");
const perms = require("../../../backend/lib/adminPermissions.js");
const review = require("../../../backend/lib/serverReview.js");

// Gate: same purposes and minimum as DMs, on both sides.
assert.deepEqual(SERVER_VIEW_PURPOSES, ["report", "security", "legal"]);
assert.deepEqual([...review.SERVER_VIEW_PURPOSES], SERVER_VIEW_PURPOSES, "client and server agree on purposes");
assert.equal(SERVER_REASON_MIN, 10);
assert.equal(review.REASON_MIN, 10);
assert.equal(canSubmitView("report", "short"), false);
assert.equal(canSubmitView("report", "   0123456789   "), true);
assert.equal(canSubmitView("curious", "0123456789 long enough"), false);
assert.equal(canConfirmDelete("Gece Pazari", "Gece Pazari", "Illegal market confirmed"), true);
assert.equal(canConfirmDelete("Gece Pazari", "gece pazari", "Illegal market confirmed"), false);
assert.equal(canConfirmDelete("Gece Pazari", "Gece Pazari", "short"), false);
assert.equal(errorKey({ code: "SERVER_VIEW_REASON" }), "serverReview.err_SERVER_VIEW_REASON");
assert.equal(errorKey({ code: "WHATEVER" }), null);
assert.equal(roleColor(16711680), "#ff0000");
assert.equal(roleColor(0), null);
assert.equal(listQuery({}), "");
assert.equal(listQuery({ q: " kaan ", filter: "reported", sort: "members", page: 2, refresh: true }), "?q=kaan&filter=reported&sort=members&page=2&refresh=1");

// Paging stays inside what the view returned (no duplicates, older prepended, newer appended).
const first = mergePage(null, { direction: "latest", hasMore: true, messages: [{ id: "c" }, { id: "d" }] });
assert.deepEqual(first, { messages: [{ id: "c" }, { id: "d" }], hasOlder: true, hasNewer: false });
const older = mergePage(first, { direction: "older", hasMore: false, messages: [{ id: "a" }, { id: "b" }, { id: "c" }] });
assert.deepEqual(older.messages.map((m) => m.id), ["a", "b", "c", "d"]);
assert.equal(older.hasOlder, false);
const newer = mergePage(older, { direction: "newer", hasMore: true, messages: [{ id: "d" }, { id: "e" }] });
assert.deepEqual(newer.messages.map((m) => m.id), ["a", "b", "c", "d", "e"]);
assert.equal(newer.hasNewer, true);

// Server: content only via POST .../channels/:channelId/view (gate + audit), no GET thread, no export.
assert.match(adminRoutes, /router\.use\(require\("\.\/adminServerReview"\)\);/);
assert.ok(adminRoutes.indexOf('router.use(requireStepUp);') < adminRoutes.indexOf('require("./adminServerReview")'), "mounted after step-up");
assert.ok(adminRoutes.indexOf("router.use(adminPermissions.requireAdminSection);") < adminRoutes.indexOf('require("./adminServerReview")'), "mounted after the section check");
assert.match(routes, /router\.post\("\/server-review\/servers\/:serverId\/channels\/:channelId\/view"/);
assert.match(
  routes,
  /const gate = review\.checkViewRequest\(req\.body\);\s*if \(!gate\.ok\) return res\.status\(400\)[\s\S]*?audit\(req\.user, "server_channel_view", [^,]+, \{\s*purpose,\s*reason,\s*server: payload\.server\.id,[\s\S]*?channel: payload\.channel\.id,[\s\S]*?range: review\.rangeOf\(cursor, payload\.messages\),/,
  "gate first, then an audit row with purpose, reason, server, channel and range"
);
assert.ok(!/router\.get\([^)]*\/channels\//.test(routes), "no GET route under channels (no GET thread)");
assert.ok(!/router\.get\([^)]*\/(view|messages|export)/.test(routes), "no GET view / messages / export");
assert.ok(!/router\.\w+\("[^"]*export/i.test(routes), "no export route");
assert.ok(!/router\.(get|post)\([^)]*\/messages"/.test(routes), "messages are never listed in bulk");
const getRoutes = [...routes.matchAll(/router\.get\("([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(getRoutes, ["/server-review/servers", "/server-review/servers/:serverId", "/server-review/servers/:serverId/members"]);
for (const action of ["server_msg_delete", "server_directory_hide", "server_directory_show", "server_invite_delete", "server_invites_revoke", "server_delete"]) {
  assert.ok(routes.includes(`"${action}"`), `${action} is audited`);
}
assert.match(routes, /deleteConfirmed\(server\.name, req\.body\?\.confirmName\)/, "server delete needs the typed name");
assert.match(routes, /require\("\.\.\/lib\/serverDeletion"\)\.deleteServerFully\(/, "server delete uses the owner path");

// Store: content columns are read only in readChannel; lists read metadata columns.
const readChannel = store.slice(store.indexOf("async function readChannel"), store.indexOf("/* ---------- Actions"));
const outside = store.replace(readChannel, "");
assert.match(readChannel, /selectWithFallback\(\[MSG_COLS_WITH_HISTORY, MSG_COLS\], run\)/, "readChannel reads the content columns");
assert.ok(!/\[MSG_COLS_WITH_HISTORY, MSG_COLS\]|select\(MSG_COLS/.test(outside), "no other read of the content columns");
for (const [table, cols] of [...outside.matchAll(/from\("server_messages"\)\.select\("([^"]+)"/g), ...outside.matchAll(/scan\(\s*"server_messages",\s*"([^"]+)"/g)].map((m) => ["server_messages", m[1]])) {
  assert.ok(!/content|media_url|edit_history|reply_to/.test(cols), `${table} metadata read without text: ${cols}`);
}
assert.match(readChannel, /\.eq\("channel_id", channelId\)\.eq\("server_id", serverId\)/, "a view never leaves the opened channel");
assert.match(store, /\.delete\(\)\s*\.eq\("id", msgId\)\s*\.eq\("channel_id", channelId\)\s*\.eq\("server_id", serverId\)/, "message delete is scoped to its channel and server");
assert.match(store, /\/\/ Report rows without the message snippet/, "reports in the detail drop the snippet");
assert.ok(!/select\("[^"]*snippet/.test(store), "the report snippet (message text) is never read");

// Section: sensitive, never in the legacy default, owner grants it; menu + tab wired.
assert.equal(perms.sectionForPath("/server-review/servers"), "serverReview");
assert.equal(perms.sectionForPath("/server-review/servers/s1/channels/c1/view"), "serverReview");
assert.ok(perms.GRANTABLE_SECTIONS.includes("serverReview"));
assert.ok(perms.SENSITIVE_SECTIONS.includes("serverReview"));
assert.ok(!perms.LEGACY_SECTIONS.includes("serverReview"));
assert.ok(menuSections().includes("serverReview"));
const people = ADMIN_NAV_GROUPS.find(([k]) => k === "people")[1];
assert.equal(people.indexOf("serverReview"), people.indexOf("dmReview") + 1, "right after DM inceleme");
assert.match(panel, /\{ id: "serverReview", label: "serverReview\.nav", icon: Server \}/);
assert.match(panel, /tab === "serverReview" && \(\s*<AdminServerReview\b[\s\S]{0,400}?canBan=\{can\("moderation"\)\}/);

// Client: POST view with purpose + reason, portal dialog, no preview / export, BanDialog, no emoji.
assert.match(ui, /`\$\{pathOf\(target\.serverId\)\}\/channels\/\$\{encodeURIComponent\(target\.channel\.id\)\}\/view`, \{\s*method: "POST",\s*body: JSON\.stringify\(\{ purpose: gate\.purpose, reason: gate\.reason, \.\.\.cursor \}\)/);
assert.ok(!/adminFetch\([^)]*\/view`\)/.test(ui), "the view is never a GET");
assert.match(ui, /<OverlayPortal>/);
assert.match(ui, /import BanDialog from "\.\/BanDialog\.jsx";/);
assert.match(ui, /<BanDialog\b/);
assert.ok(!/\/ban`,\s*\{\s*method/.test(ui), "no direct ban POST, the dialog does it");
assert.match(ui, /usePrivateMediaUrl\(m\.mediaUrl\)/, "attachments through the media URL helper");
assert.ok(!/exportJson|\/export|download=/i.test(ui), "no export");
assert.ok(!/preview/i.test(ui.replace(/usePrivateMediaUrl/g, "")), "no message preview in lists");
const noEmoji = (src) => ![...src].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf));
for (const [name, src] of [["AdminServerReview", ui], ["serverReviewModel", model], ["routes", routes], ["store", store]]) assert.ok(noEmoji(src), `${name}: no emoji`);

// Copy: every key the UI uses exists in all seven languages, same keys everywhere.
const LOCALES = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
const used = new Set([...ui.matchAll(/t\("serverReview\.(\w+)"/g)].map((m) => m[1]));
let keys = null;
for (const [loc, suf] of Object.entries(LOCALES)) {
  const mod = await import(new URL(`../../i18n/locales/serverReview.${loc}.js`, import.meta.url).href);
  const cat = mod[`SERVER_REVIEW_${suf}`];
  const k = Object.keys(cat).sort();
  if (!keys) keys = k;
  assert.deepEqual(k, keys, `serverReview.${loc}.js has the same keys as serverReview.tr.js`);
  for (const key of used) assert.ok(key in cat, `${loc}: serverReview.${key}`);
  for (const p of SERVER_VIEW_PURPOSES) assert.ok(`purpose_${p}` in cat, `${loc}: purpose_${p}`);
  for (const f of RISK_FACTORS) assert.ok(`risk_${f}` in cat, `${loc}: risk_${f}`);
  for (const v of Object.values(cat)) assert.ok(noEmoji(v), `${loc}: no emoji in copy`);
  const main = readFileSync(new URL(`../../i18n/locales/${loc}.js`, import.meta.url), "utf8");
  assert.match(main, new RegExp(`import \\{ SERVER_REVIEW_${suf} \\} from "\\./serverReview\\.${loc.replace("-", "\\-")}\\.js";`), `${loc}.js imports serverReview`);
  assert.match(main, new RegExp(`"?serverReview"?: SERVER_REVIEW_${suf},`), `${loc}.js registers serverReview`);
}

// Retention: server edits keep the previous text like DMs; deletes are not kept (same as DMs).
const migration = readFileSync(new URL("../../../../supabase/migrations/20261114_server_review.sql", import.meta.url), "utf8");
assert.match(migration, /alter table public\.server_messages\s+add column if not exists edit_history jsonb not null default '\[\]'::jsonb;/);
assert.ok(!/\bdrop\b(?!.*if exists)/i.test(migration.replace(/^--.*$/gm, "")), "additive only");
assert.match(edit, /updateServerMessageWithHistory\(supabase, \{/, "the edit handler keeps history");
assert.ok(!/server_messages[^;]*deleted_at/.test(store), "no soft-delete copy (DMs keep none either)");

// Type scale + phone targets + above the 99998 admin shell.
const css = rd("../../styles/admin-server-review.css");
assert.ok(!/font-size\s*:\s*\d+(\.\d+)?px/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "only --fs-* tokens");
assert.match(css, /z-index: 100040/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*min-height: 44px/);
assert.match(css, /html\[data-theme="light"\] \.asr-scrim/);
console.log("serverReview.selftest: ok");
