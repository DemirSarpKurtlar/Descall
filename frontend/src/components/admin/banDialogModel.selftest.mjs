// Run: node src/components/admin/banDialogModel.selftest.mjs
// Admin ban dialog (draft 5-admin): pills -> presetId / durationSeconds, checkboxes ->
// revokeSessions / notifyEmail / alsoAccessBan, protected targets keep the button disabled,
// appeals helpers, and the three ban entry points all open the same dialog.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FLAGS,
  DURATION_PILLS,
  FEATURED_CATEGORIES,
  appealsFromResponse,
  appealsQuery,
  banButtonDisabled,
  banButtonLabel,
  banFormError,
  buildBanPayload,
  canSubmitBan,
  countdownParts,
  decidePayload,
  durationPills,
  durationSeconds,
  headerFacts,
  isProtectedError,
  isProtectedTarget,
  maskEmail,
  normalizeAppeal,
  previewBanState,
} from "./banDialogModel.js";

const form = (patch = {}) => ({
  category: "harassment",
  otherText: "",
  message: "",
  durationId: "7d",
  customMinutes: "",
  flags: { ...DEFAULT_FLAGS },
  ...patch,
});
const user = { id: "u1", username: "kaanyilmaz", displayName: "Kaan Yılmaz" };

// Draft pills and defaults.
assert.deepEqual(DURATION_PILLS, ["24h", "3d", "7d", "30d", "90d", "permanent"]);
assert.deepEqual(FEATURED_CATEGORIES, ["harassment", "spam", "hate_speech", "scam"]);
assert.deepEqual(DEFAULT_FLAGS, { revokeSessions: true, notifyEmail: true, alsoAccessBan: false }, "contract defaults");

// Duration pills follow the server presets (1 year is not a draft pill; a missing preset hides its pill).
const serverPresets = [
  { id: "permanent", seconds: null },
  { id: "24h", seconds: 86400 },
  { id: "3d", seconds: 259200 },
  { id: "7d", seconds: 604800 },
  { id: "30d", seconds: 2592000 },
  { id: "90d", seconds: 7776000 },
  { id: "365d", seconds: 31536000 },
];
assert.deepEqual(durationPills(serverPresets), DURATION_PILLS);
assert.deepEqual(durationPills([]), DURATION_PILLS, "no meta yet: every pill");
assert.deepEqual(durationPills(serverPresets.filter((p) => p.id !== "90d")), ["24h", "3d", "7d", "30d", "permanent"]);

// Pills -> presetId; every preset pill sends presetId and no durationSeconds.
for (const id of DURATION_PILLS) {
  const body = buildBanPayload(form({ durationId: id }));
  assert.equal(body.presetId, id, `${id} -> presetId`);
  assert.equal("durationSeconds" in body, false, `${id} sends no durationSeconds`);
}
// "Özel" -> durationSeconds (minutes * 60), no presetId.
const custom = buildBanPayload(form({ durationId: "custom", customMinutes: "90" }));
assert.equal(custom.durationSeconds, 5400);
assert.equal("presetId" in custom, false);
assert.equal(buildBanPayload(form({ durationId: "custom", customMinutes: "2,5" })).durationSeconds, 120, "decimal comma floors");

// Seconds for the preview: meta first, defaults second, permanent = null.
assert.equal(durationSeconds("7d", { banPresets: serverPresets }), 604800);
assert.equal(durationSeconds("24h"), 86400);
assert.equal(durationSeconds("permanent"), null);
assert.equal(durationSeconds("custom", { customMinutes: "15" }), 900);
assert.equal(durationSeconds("custom", { customMinutes: "" }), 0);

// Checkboxes -> flags (defaults, then each one flipped).
let body = buildBanPayload(form());
assert.equal(body.revokeSessions, true);
assert.equal(body.notifyEmail, true);
assert.equal(body.alsoAccessBan, false);
body = buildBanPayload(form({ flags: { revokeSessions: false, notifyEmail: false, alsoAccessBan: true } }));
assert.deepEqual([body.revokeSessions, body.notifyEmail, body.alsoAccessBan], [false, false, true]);
assert.equal(buildBanPayload({ category: "spam", durationId: "3d" }).revokeSessions, true, "missing flags use the defaults");

// Category, "Diğer…" free text, note to the user.
body = buildBanPayload(form({ category: "spam", otherText: "ignored", message: "  Aynı reklamı 40 sunucuya attın.  " }));
assert.equal(body.category, "spam");
assert.equal(body.otherText, undefined, "free text only for Other");
assert.equal(body.message, "Aynı reklamı 40 sunucuya attın.");
body = buildBanPayload(form({ category: "other", otherText: " Sahte çekiliş " }));
assert.equal(body.otherText, "Sahte çekiliş");
assert.equal(buildBanPayload(form({ message: "   " })).message, undefined);
assert.equal(buildBanPayload(form({ message: "x".repeat(900) })).message.length, 500);

// Validation.
assert.equal(banFormError(form()), null);
assert.equal(banFormError(form({ category: "other" })), "banAdmin.errOtherText");
assert.equal(banFormError(form({ durationId: "custom", customMinutes: "0" })), "banAdmin.errCustomMinutes");
assert.equal(banFormError(form({ category: "" })), "banAdmin.errCategory");

// Protected targets (admins, the owner) and 403 ADMIN_PROTECTED disable the button.
assert.equal(isProtectedTarget(user), false);
for (const t of [{ isAdmin: true }, { is_admin: true }, { isOwner: true }, { role: "admin" }, { role: "OWNER" }]) {
  assert.equal(isProtectedTarget({ ...user, ...t }), true, JSON.stringify(t));
}
assert.equal(canSubmitBan({ form: form(), target: user }), true);
assert.equal(canSubmitBan({ form: form(), target: { ...user, is_admin: true } }), false);
assert.equal(canSubmitBan({ form: form(), target: user, protectedHit: true }), false);
assert.equal(canSubmitBan({ form: form(), target: user, busy: true }), false);
assert.equal(canSubmitBan({ form: form({ category: "other" }), target: user }), false);
assert.equal(banButtonDisabled({ target: user }), false);
assert.equal(banButtonDisabled({ target: { ...user, isAdmin: true } }), true, "admin target: button disabled");
assert.equal(banButtonDisabled({ target: { ...user, isOwner: true } }), true, "owner target: button disabled");
assert.equal(banButtonDisabled({ target: user, protectedHit: true }), true, "403 ADMIN_PROTECTED: button disabled");
assert.equal(banButtonDisabled({ target: null }), true);
assert.equal(isProtectedError(Object.assign(new Error("x"), { status: 403, code: "ADMIN_PROTECTED" })), true);
assert.equal(isProtectedError(Object.assign(new Error("x"), { status: 403, code: "STEP_UP_REQUIRED" })), false);

// Button label: "7 gün yasakla", "Kalıcı yasakla", "90 dakika yasakla".
assert.deepEqual(banButtonLabel("7d"), { key: "banAdmin.banFor", params: { duration: "banAdmin.dur.7d" } });
assert.deepEqual(banButtonLabel("permanent"), { key: "banAdmin.banPermanent", params: {} });
assert.deepEqual(banButtonLabel("custom", "90"), { key: "banAdmin.banCustom", params: { n: 90 } });

// Preview state for BanScreen: { kind: "account", ban: {...}, live: false }.
const now = Date.parse("2026-11-14T13:20:00Z");
const cats = [{ id: "harassment", label: "Harassment / Bullying" }, { id: "other", label: "Other" }];
let st = previewBanState({ target: user, form: form({ message: "Not" }), categories: cats, banPresets: serverPresets, now });
assert.equal(st.kind, "account");
assert.equal(st.live, false);
assert.equal(st.ban.categoryId, "harassment");
assert.equal(st.ban.reason, "Harassment / Bullying");
assert.equal(st.ban.message, "Not");
assert.equal(st.ban.username, "kaanyilmaz");
assert.equal(st.ban.byAdmin, true);
assert.equal(st.ban.bannedAt, "2026-11-14T13:20:00.000Z");
assert.equal(st.ban.expiresAt, "2026-11-21T13:20:00.000Z");
st = previewBanState({ target: user, form: form({ durationId: "permanent", category: "other", otherText: "Sahte çekiliş" }), categories: cats, now });
assert.equal(st.ban.expiresAt, null, "permanent preview");
assert.equal(st.ban.reason, "Sahte çekiliş");
assert.equal(st.ban.message, null);
assert.deepEqual(countdownParts(7 * 86400), { days: 7, hours: 0, minutes: 0 });
assert.deepEqual(countdownParts(6 * 86400 + 14 * 3600 + 22 * 60 + 5), { days: 6, hours: 14, minutes: 22 });

// Header: "@kaanyilmaz · 3 şikayet · 2 cihaz", counts only when known.
assert.deepEqual(headerFacts({ username: "kaanyilmaz", reportCount: 3, deviceCount: 2 }).map((f) => f.kind), ["username", "reports", "devices"]);
assert.deepEqual(headerFacts({ username: "kaanyilmaz" }).map((f) => f.kind), ["username"]);

// Appeals: query, decide body, row normalisation (camelCase or snake_case), email masking.
assert.equal(appealsQuery(), "/appeals?status=pending");
assert.equal(appealsQuery({ status: "accepted", type: "access" }), "/appeals?status=accepted&type=access");
assert.equal(appealsQuery({ status: "bogus", type: "bogus" }), "/appeals?status=pending");
assert.deepEqual(decidePayload("accept", "  ok "), { decision: "accept", note: "ok" });
assert.deepEqual(decidePayload("reject", ""), { decision: "reject", note: undefined });
assert.throws(() => decidePayload("maybe"));
assert.equal(maskEmail("kaan@example.com"), "ka***@example.com");
assert.equal(maskEmail("k***@example.com"), "k***@example.com");
assert.equal(maskEmail(""), "");
const acc = normalizeAppeal({
  id: "a1", type: "account", status: "pending", text: "Yanlış anlaşıldı.", createdAt: "2026-11-14T10:00:00Z",
  user: { id: "u1", username: "kaanyilmaz", displayName: "Kaan" }, ban: { categoryId: "spam", expiresAt: null },
});
assert.equal(acc.type, "account");
assert.equal(acc.user.username, "kaanyilmaz");
assert.equal(acc.ban.categoryId, "spam");
const snake = normalizeAppeal({ id: 7, access_code: "ACC-7F2K", contact_email: "x@y.z", body: "Okul ağı", created_at: "2026-11-14T10:00:00Z" });
assert.equal(snake.id, "7");
assert.equal(snake.type, "access", "an access code means an access appeal");
assert.equal(snake.access.code, "ACC-7F2K");
assert.equal(snake.email, "x@y.z");
assert.equal(snake.text, "Okul ağı");
assert.equal(appealsFromResponse({ appeals: [{ id: "a" }, { nope: 1 }] }).length, 1, "rows without id dropped");
assert.equal(appealsFromResponse([{ id: "a" }]).length, 1, "bare array accepted");
assert.equal(appealsFromResponse(null).length, 0);

// Every ban entry point opens the dialog; none bans permanently in one click any more.
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
// Kullanıcı dosyası (Nov 2026 remake): the user file and the Kullanıcılar row menu ban through
// the shared action host (dossier/UserActionDialogs.jsx), which renders BanDialog.
assert.match(rd("./AdminUserDossier.jsx"), /<UserActionHost\b/, "the user file opens its dialogs through UserActionHost");
assert.match(rd("./AdminUserDirectory.jsx"), /<UserActionHost\b/, "the users list row menu uses the same dialogs");
for (const file of ["./AdminModeration.jsx", "./dossier/UserActionDialogs.jsx", "./AdminReports.jsx"]) {
  const src = rd(file);
  assert.match(src, /import BanDialog from "\.\.?\/BanDialog\.jsx";/, `${file} uses BanDialog`);
  assert.match(src, /<BanDialog\b/, `${file} renders BanDialog`);
  assert.ok(!/presetId:\s*"permanent"/.test(src), `${file}: no one-click permanent ban`);
  assert.ok(!/\/ban`,\s*\{\s*method/.test(src), `${file}: no direct ban POST`);
}
assert.match(rd("./AdminReports.jsx"), /endpoint=\{banFor \? `\/reports\/\$\{encodeURIComponent\(banFor\.report\.id\)\}\/ban`/, "report ban keeps its report route");

// The dialog: preview through the adapter, never the ban screen file directly; no emoji; GlassCheckbox only.
const dialog = rd("./BanDialog.jsx");
const preview = rd("./BanPreview.jsx");
assert.match(dialog, /import BanPreview from "\.\/BanPreview\.jsx";/);
assert.match(dialog, /isProtectedError\(e\)/, "403 ADMIN_PROTECTED handled");
assert.match(dialog, /disabled=\{buttonDisabled\}/);
assert.ok(!/type="checkbox"/.test(dialog), "GlassCheckbox only");
assert.match(preview, /lazy\(\(\) =>\s*import\("\.\.\/ban\/BanScreen\.jsx"\)/, "real screen loaded lazily when present");
assert.match(preview, /<RealBanScreen state=\{state\} preview \/>/);
assert.match(preview, /export function FallbackBanCard/);
for (const [name, src] of [["BanDialog", dialog], ["BanPreview", preview], ["AdminAppeals", rd("./AdminAppeals.jsx")]]) {
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), `${name}: no emoji`);
}

// Narrow widths stack the preview under the form.
const css = readFileSync(new URL("../../styles/admin-ban.css", import.meta.url), "utf8");
assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.bad \{ grid-template-columns: minmax\(0, 1fr\);/);
assert.match(css, /html\[data-theme="light"\] \.bad \{/, "light theme");

console.log("banDialogModel.selftest ok");
