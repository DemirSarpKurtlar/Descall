// node src/components/admin/dossier/dossier.selftest.mjs
// Kullanıcı dosyası remake (Draft A, Nov 2026): pure model helpers (timeline
// merge / sort / filter, risk rows, stat formatting, dialog payloads, which
// actions an admin sees), copy in all seven languages with the same keys,
// wiring (BanDialog, lens, export, lazy sections, row menu), the server routes
// (section people, step-up, audit, masked data) and the notes migration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ACTION_SECTIONS,
  DOSSIER_TABS,
  TIMELINE_FILTERS,
  TIMELINE_GROUPS,
  TIMEOUT_PILLS,
  TIMEOUT_REASONS,
  actionAllowed,
  barHeights,
  buildTimeoutPayload,
  buildWalletGrant,
  canSubmitTimeout,
  canSubmitWallet,
  compactNumber,
  countdownParts,
  creditsPreview,
  daysBetween,
  errorKey,
  filterTimeline,
  groupOf,
  isStrongLink,
  mergeTimeline,
  moreMenuItems,
  noteValid,
  parseAmount,
  pointsLabel,
  riskRows,
  riskTone,
  rowMenuItems,
  sessionKind,
  timelineCounts,
  timeoutSeconds,
  voiceAmount,
  walletPreview,
} from "./dossierModel.js";

const require = createRequire(import.meta.url);
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const backendModel = require("../../../../backend/lib/userDossierModel.js");

/* ---- timeline ---- */
assert.deepEqual({ ...TIMELINE_GROUPS }, { ...backendModel.TIMELINE_GROUPS }, "client and server group the timeline the same way");
const groupsUsed = new Set(Object.values(TIMELINE_GROUPS));
for (const g of groupsUsed) assert.ok(TIMELINE_FILTERS.includes(g), `filter pill for ${g}`);
const a = [
  { type: "report", id: "r1", at: "2026-11-14T19:42:00Z" },
  { type: "login", id: "s1", at: "2026-11-14T17:55:00Z" },
];
const b = [
  { type: "ledger", id: "l1", at: "2026-11-10T23:24:00Z" },
  { type: "report", id: "r1", at: "2026-11-14T19:42:00Z" },
  { type: "note", id: "n1", at: "2026-11-15T08:00:00Z", group: "admin" },
  { type: "signup", id: "u", at: "bad date" },
];
const merged = mergeTimeline(a, b, null);
assert.deepEqual(merged.map((x) => x.id), ["n1", "r1", "s1", "l1"], "newest first, deduped, invalid dropped");
assert.deepEqual(filterTimeline(merged, "report").map((x) => x.id), ["r1"]);
assert.deepEqual(filterTimeline(merged, "all").length, 4);
assert.deepEqual(filterTimeline(merged, "security").map((x) => x.id), ["s1"]);
assert.deepEqual(filterTimeline(null, "wallet"), []);
assert.deepEqual(timelineCounts(merged), { all: 4, admin: 1, report: 1, security: 1, wallet: 1 });
assert.equal(groupOf({ type: "server_join" }), "community");
assert.equal(groupOf({ type: "mystery" }), "admin");
assert.equal(groupOf({ type: "ledger", group: "wallet" }), "wallet");

/* ---- risk + stats ---- */
assert.equal(riskTone("watch"), "gold");
assert.equal(riskTone("critical"), "red");
assert.equal(riskTone("nope"), "green");
assert.deepEqual(
  riskRows({ reasons: [{ id: "account_age", points: 0 }, { id: "linked_banned", points: 15 }, { id: "open_reports", points: 30 }] }).map((r) => r.id),
  ["open_reports", "linked_banned", "account_age"]
);
assert.equal(pointsLabel(18), "+18");
assert.equal(pointsLabel(0), "-0");
assert.equal(compactNumber(115000, "en"), "115K");
assert.equal(compactNumber(4200, "en"), "4,200");
assert.equal(compactNumber(4200, "tr-TR"), "4.200");
assert.deepEqual(voiceAmount(50400), { n: 14, unit: "h" });
assert.deepEqual(voiceAmount(1500), { n: 25, unit: "m" });
assert.equal(voiceAmount(null), null);
assert.deepEqual(barHeights([0, 5, 10]), [0, 50, 100]);
assert.deepEqual(barHeights([1, 100]), [6, 100], "quiet days keep a visible bar");
assert.deepEqual(barHeights([0, 0]), [0, 0]);
assert.equal(daysBetween("2026-04-18T00:00:00Z", Date.parse("2026-11-14T00:00:00Z")), 210);
assert.equal(daysBetween("nope"), null);
assert.equal(sessionKind("Descall Desktop"), "desktop");
assert.equal(sessionKind("Safari on iOS"), "phone");
assert.equal(sessionKind("Chrome on Linux"), "desktop");
assert.equal(sessionKind("Browser on Unknown OS"), "web");
assert.equal(isStrongLink(["network", "session_device"]), true);
assert.equal(isStrongLink(["network", "same_ip"]), false);

/* ---- timeout dialog ---- */
assert.deepEqual(TIMEOUT_PILLS.map((p) => p.id), ["10m", "1h", "6h", "1d", "3d", "7d"]);
assert.deepEqual([...TIMEOUT_REASONS], ["spam", "harassment", "language", "voice_abuse"]);
assert.equal(timeoutSeconds("1h"), 3600);
assert.equal(timeoutSeconds("custom", "90"), 5400);
assert.equal(timeoutSeconds("custom", "0"), 0);
assert.equal(timeoutSeconds("custom", "999999"), 30 * 86400, "custom is capped at 30 days");
assert.equal(canSubmitTimeout({ durationId: "1h", category: "spam" }), true);
assert.equal(canSubmitTimeout({ durationId: "custom", customMinutes: "", category: "spam" }), false);
assert.equal(canSubmitTimeout({ durationId: "1h", category: "other", otherText: "  " }), false);
assert.equal(canSubmitTimeout({ durationId: "1h", category: "other", otherText: "Reklam" }), true);
assert.deepEqual(buildTimeoutPayload({ durationId: "6h", category: "spam", message: "  Tekrar yazabilirsin  ", notify: true }), {
  category: "spam",
  message: "Tekrar yazabilirsin",
  durationSeconds: 21600,
  notify: true,
});
assert.deepEqual(buildTimeoutPayload({ durationId: "10m", category: "other", otherText: " Flood ", notify: false }), {
  category: "other",
  otherText: "Flood",
  durationSeconds: 600,
  notify: false,
});
assert.deepEqual(countdownParts(3598), { days: 0, clock: "59:58" });
assert.deepEqual(countdownParts(6 * 3600 - 2), { days: 0, clock: "5:59:58" });
assert.deepEqual(countdownParts(3 * 86400), { days: 3, clock: null });

/* ---- wallet + credits ---- */
assert.equal(parseAmount("5.000"), 5000);
assert.equal(parseAmount("1 250 DesCoin"), 1250);
assert.equal(parseAmount(""), 0);
assert.equal(walletPreview(115000, "give", 5000), 120000);
assert.equal(walletPreview(115000, "take", 5000), 110000);
assert.equal(walletPreview(100, "take", 500), null, "cannot take more than the balance");
assert.equal(canSubmitWallet({ mode: "give", amount: "5000", reason: "Etkinlik", balance: 0 }), true);
assert.equal(canSubmitWallet({ mode: "give", amount: "5000", reason: " ", balance: 0 }), false, "reason is required (audited)");
assert.equal(canSubmitWallet({ mode: "take", amount: "500", reason: "Hata", balance: 100 }), false);
assert.equal(canSubmitWallet({ mode: "freeze" }), true);
assert.deepEqual(buildWalletGrant({ mode: "give", amount: "5.000", reason: " Kasım turnuvası ", message: "Tebrikler" }), { amount: 5000, reason: "Kasım turnuvası", message: "Tebrikler" });
assert.deepEqual(buildWalletGrant({ mode: "take", amount: "250", reason: "Hata", message: "ignored" }), { amount: -250, reason: "Hata" });
assert.equal(creditsPreview(420, "add", "80"), 500);
assert.equal(creditsPreview(420, "remove", "999"), 0);
assert.equal(noteValid("  x "), true);
assert.equal(noteValid("   "), false);
assert.equal(noteValid("x".repeat(2001)), false);

/* ---- who sees which action ---- */
const only = (...sections) => ({ can: (s) => sections.includes(s), owner: false });
assert.equal(actionAllowed("ban", only("moderation")), true);
assert.equal(actionAllowed("ban", only("people")), false);
assert.equal(actionAllowed("makeAdmin", { can: () => true, owner: false }), false, "owner only");
assert.equal(actionAllowed("makeAdmin", { can: () => false, owner: true }), true);
assert.equal(actionAllowed("nope", { can: () => true }), false);
assert.deepEqual(moreMenuItems({ can: () => true, owner: false }), ["gift", "premium", "credits", "popup", "sep", "dmReview", "serverReview", "accessBan", "audit"]);
assert.deepEqual(
  moreMenuItems({ can: () => true, owner: true, identity: { isOwner: false }, moderation: { banned: true, timeout: { until: "x" } } }).slice(-4),
  ["sep", "untimeout", "unban", "makeAdmin"]
);
assert.deepEqual(moreMenuItems({ can: () => true, owner: true, identity: { isOwner: true } }).includes("makeAdmin"), false, "never on the owner account");
assert.deepEqual(moreMenuItems(only("people")), [], "no section, no item");
assert.deepEqual(moreMenuItems(only("dmReview", "audit")), ["dmReview", "audit"], "no dangling separators");
assert.deepEqual(rowMenuItems({ can: () => true }), ["open", "wallet", "timeout", "ban", "kick", "gift"]);
assert.deepEqual(rowMenuItems(only("people", "moderation")), ["open", "timeout", "ban", "kick"]);
for (const id of Object.keys(ACTION_SECTIONS)) assert.ok(typeof ACTION_SECTIONS[id] === "string");
// Every section the client checks exists on the server.
const perms = require("../../../../backend/lib/adminPermissions.js");
for (const s of new Set(Object.values(ACTION_SECTIONS))) {
  assert.ok([...perms.GRANTABLE_SECTIONS, ...perms.ALWAYS, ...perms.OWNER_ONLY].includes(s), `section ${s} exists`);
}
// ...and the routes the dialogs call map to those sections.
assert.equal(perms.sectionForPath("/people/x/dossier/timeline"), "people");
assert.equal(perms.sectionForPath("/people/x/notes"), "people");
assert.equal(perms.sectionForPath("/people/x/sessions/s/revoke"), "people");
assert.equal(perms.sectionForPath("/descoin/grant"), ACTION_SECTIONS.wallet);
assert.equal(perms.sectionForPath("/shop/gift"), ACTION_SECTIONS.gift);
assert.equal(perms.sectionForPath("/credits/update"), ACTION_SECTIONS.credits);
assert.equal(perms.sectionForPath("/users/x/timeout"), ACTION_SECTIONS.timeout);
assert.equal(perms.sectionForPath("/users/x/kick"), ACTION_SECTIONS.kick);
assert.equal(perms.sectionForPath("/special-badges/b/grant"), ACTION_SECTIONS.badges);
assert.equal(perms.sectionForPath("/premium/users/x/apply"), ACTION_SECTIONS.premium);
assert.equal(perms.sectionForPath("/popup"), ACTION_SECTIONS.popup);
assert.equal(perms.sectionForPath("/access-bans"), ACTION_SECTIONS.accessBan);
assert.equal(perms.sectionForPath("/audit"), ACTION_SECTIONS.audit);
assert.equal(errorKey({ code: "NOTES_UNAVAILABLE" }), "dossier.err_notesUnavailable");
assert.equal(errorKey({ code: "WHATEVER" }), null);

/* ---- wiring ---- */
const page = rd("../AdminUserDossier.jsx");
const dialogs = rd("./UserActionDialogs.jsx");
const panels = rd("./DossierPanels.jsx");
const menu = rd("./DossierMenu.jsx");
const shell = rd("./DossierDialog.jsx");
const people = rd("../AdminPeople.jsx");
const directory = rd("../AdminUserDirectory.jsx");
const adminPanel = rd("../AdminPanel.jsx");
assert.match(dialogs, /import BanDialog from "\.\.\/BanDialog\.jsx";/, "Yasakla opens the existing BanDialog");
assert.match(dialogs, /<BanDialog\s+open=\{action === "ban"\}/);
assert.match(page, /<UserLens userId=\{userId\} onClose=/, "Gözünden opens UserLens");
assert.match(page, /adminFetch\(`\/people\/\$\{userId\}\/export`\)/, "KVKK export unchanged");
assert.match(page, /\/people\/\$\{enc\(uid\)\}\/dossier\/\$\{section\}/, "heavy tabs load lazily");
for (const s of ["timeline", "linked", "communities", "activity", "wallet"]) assert.match(page, new RegExp(`useLazySection\\(userId, "${s}"`), `lazy ${s}`);
assert.deepEqual(DOSSIER_TABS, ["overview", "timeline", "linked", "communities", "activity", "wallet", "moderation", "notes"]);
assert.match(dialogs, /\/users\/\$\{enc\(user\.id\)\}\/timeout/);
assert.match(dialogs, /\/users\/\$\{enc\(user\.id\)\}\/kick/);
assert.match(dialogs, /\/people\/\$\{enc\(user\.id\)\}\/sessions\/\$\{enc\(s\.id\)\}\/revoke/, "one session at a time");
assert.match(dialogs, /"\/descoin\/grant"/);
assert.match(dialogs, /"\/shop\/gift"/);
assert.match(dialogs, /"\/credits\/update"/);
assert.match(dialogs, /\/special-badges\/\$\{enc\(b\.id\)\}\/\$\{b\.held \? "revoke" : "grant"\}/);
assert.match(dialogs, /targetUserId: user\.id/, "popup to one person");
assert.match(dialogs, /mode: "account", userId: user\.id/, "access ban for this account");
assert.match(dialogs, /\/audit\?target=\$\{enc\(user\.id\)\}/, "audit filtered by account");
assert.match(shell, /e\.key === "Escape"/);
assert.match(shell, /e\.key !== "Tab"/, "focus stays inside the dialog");
assert.match(shell, /e\.target === e\.currentTarget && !busy/, "outside click closes");
assert.match(menu, /document\.addEventListener\("pointerdown", outside, true\)/, "menu closes on outside click");
assert.match(people, /<AdminUserDossier [^>]*onOpenPerson=\{onSelectUser\}/);
assert.match(directory, /<RowMenu\b/, "row quick menu");
assert.match(directory, /MoreHorizontal/, "an icon, not a glyph");
assert.match(adminPanel, /<AdminPermsContext\.Provider value=\{permsValue\}>/, "admin sections reach the user file");
assert.match(adminPanel, /initialQuery=\{reviewNav\?\.tab === "dmReview"/, "DM inceleme opens pre-filtered");
assert.ok(!/\bcontent\b|\bsnippet\b.*dm_messages/.test(rd("../../../../backend/lib/userDossierSections.js").match(/async function loadActivity[\s\S]*?\n}\n/)[0]), "activity reads no message text");
const noEmoji = (src) => ![...src].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf));
for (const [name, src] of [["page", page], ["dialogs", dialogs], ["panels", panels], ["menu", menu], ["shell", shell], ["model", rd("./dossierModel.js")]]) {
  assert.ok(noEmoji(src), `${name}: no emoji`);
  assert.ok(!/valorant|takım bul|\blfg\b/i.test(src), `${name}: retired game features stay gone`);
}

/* ---- server ---- */
const routes = rd("../../../../backend/routes/adminPeople.js");
const admin = rd("../../../../backend/routes/admin.js");
assert.match(routes, /router\.get\("\/people\/:id\/dossier\/:section"/);
assert.match(routes, /router\.post\("\/people\/:id\/notes"[\s\S]*?audit\(req\.user, "user_note_add"/);
assert.match(routes, /router\.delete\("\/people\/:id\/notes\/:noteId"[\s\S]*?audit\(req\.user, "user_note_delete"/);
assert.match(routes, /router\.post\("\/people\/:id\/sessions\/:sessionId\/revoke"[\s\S]*?state\.revokedSessionIds\.add\(sessionId\)[\s\S]*?audit\(req\.user, "revoke_session"/);
assert.match(admin, /const notify = body\.notify === true;/, "timeout notification is opt-in");
assert.match(admin, /const targetUserId = req\.body\?\.targetUserId/, "popup can target one person");
// GET /audit?target= moved to routes/adminAuditConsole.js (İşlem kaydı console); the store filters by target.
assert.match(readFileSync(new URL("../../../../backend/lib/auditConsoleStore.js", import.meta.url), "utf8"), /q = q\.in\("target_user_id", ids\)/, "audit by account");
assert.ok(admin.indexOf("router.use(requireStepUp);") < admin.indexOf('router.use(require("./adminPeople"))'), "people routes behind step-up");
const migration = readFileSync(new URL("../../../../../supabase/migrations/20261115_admin_user_notes.sql", import.meta.url), "utf8");
assert.match(migration, /create table if not exists public\.admin_user_notes/i);
assert.match(migration, /check \(char_length\(body\) between 1 and 2000\)/i);
assert.match(migration, /enable row level security/i);
assert.ok(!/create policy/i.test(migration), "no policies: service role only");
assert.match(migration, /grant all on table public\.admin_user_notes to service_role/i);
assert.ok(!/\bdrop\b/i.test(migration.replace(/^--.*$/gm, "")), "additive only");

/* ---- copy: same keys in all seven languages, every key the UI uses ---- */
const LOCALES = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
const ui = [page, dialogs, panels, people, directory].join("\n");
const used = new Set([...ui.matchAll(/["`]dossier\.([A-Za-z0-9_]+)["`]/g)].map((m) => m[1]));
const families = {
  tab_: DOSSIER_TABS,
  f_: TIMELINE_FILTERS,
  dur_: TIMEOUT_PILLS.map((p) => p.id),
  cat_: [...TIMEOUT_REASONS, "other"],
  risk_: ["low", "watch", "high", "critical"],
  rr_: ["repeat_reports", "open_reports", "report_history", "banned", "timeout", "suspicious_signup", "prior_sanctions", "linked_banned", "new_account", "account_age"],
  row_: rowMenuItems({ can: () => true }),
  m_: moreMenuItems({ can: () => true, owner: true, identity: {}, moderation: { banned: true, timeout: {} } }).filter((x) => x !== "sep" && x !== "makeAdmin"),
  lk_: ["device", "session_device", "same_ip", "network", "referral_pair", "signup_close", "insular_pair"],
  presence_: ["online", "idle", "dnd", "invisible", "offline"],
  plan_: ["plus", "ultra"],
  sev_: ["info", "success", "warning", "urgent"],
  acc_: ["1d", "7d", "30d", "90d", "permanent"],
  st_: ["open", "actioned", "dismissed"],
  tl_: ["signup", "first_message", "login", "report", "mod", "ledger_in", "ledger_out", "purchase", "subscription", "server_join", "server_own", "group_join", "note", "admin"],
};
// The risk reasons the server can return all have copy.
const serverReasons = new Set(backendModel.scoreDossierRisk({ openReports: 5, totalReports: 9, banned: true, suspiciousSignup: true, historyCount: 4, linkedBanned: 1, accountAgeDays: 2 }).reasons.map((r) => r.id));
for (const r of ["open_reports", "timeout", "account_age"]) serverReasons.add(r);
for (const r of serverReasons) assert.ok(families.rr_.includes(r), `copy family covers ${r}`);
const EN = (await import(new URL("../../../i18n/locales/dossier.en.js", import.meta.url).href)).DOSSIER_EN;
let keys = null;
for (const [loc, suf] of Object.entries(LOCALES)) {
  const mod = await import(new URL(`../../../i18n/locales/dossier.${loc}.js`, import.meta.url).href);
  const cat = mod[`DOSSIER_${suf}`];
  const k = Object.keys(cat).sort();
  if (!keys) keys = k;
  assert.deepEqual(k, keys, `dossier.${loc}.js has the same keys as dossier.tr.js`);
  for (const key of used) assert.ok(key in cat, `${loc}: dossier.${key}`);
  for (const [prefix, ids] of Object.entries(families)) for (const id of ids) assert.ok(`${prefix}${id}` in cat, `${loc}: dossier.${prefix}${id}`);
  for (const kk of ["unban", "untimeout", "makeAdmin", "removeAdmin"]) {
    for (const suffix of ["", "Title", "Sub"]) assert.ok(`${kk}${suffix}` in cat, `${loc}: dossier.${kk}${suffix}`);
    assert.ok(`done_${kk}` in cat, `${loc}: dossier.done_${kk}`);
  }
  for (const [kk, v] of Object.entries(cat)) {
    assert.equal(typeof v, "string", `${loc}.${kk}`);
    assert.ok(v.trim(), `${loc}.${kk} empty`);
    assert.ok(noEmoji(v), `${loc}.${kk}: no emoji`);
    if (loc === "tr") assert.ok(!v.includes("..."), `tr.${kk}: use the ellipsis character`);
    if (loc !== "en") {
      const en = EN[kk];
      const need = new Set([...en.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]));
      const have = new Set([...v.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]));
      assert.deepEqual([...have].sort(), [...need].sort(), `${loc}.${kk}: same placeholders as English`);
    }
  }
  const main = readFileSync(new URL(`../../../i18n/locales/${loc}.js`, import.meta.url), "utf8");
  assert.match(main, new RegExp(`import \\{ DOSSIER_${suf} \\} from "\\./dossier\\.${loc.replace("-", "\\-")}\\.js";`), `${loc}.js imports dossier`);
  assert.match(main, new RegExp(`"?dossier"?: DOSSIER_${suf},`), `${loc}.js registers dossier`);
}

/* ---- styles ---- */
const css = rd("../../../styles/admin-dossier.css").replace(/\/\*[\s\S]*?\*\//g, "");
assert.ok(!/font-size\s*:\s*\d+(\.\d+)?px/.test(css), "only --fs-* tokens");
for (const m of css.matchAll(/var\(--fs-(\d+)\)/g)) assert.ok(["11", "12", "13", "15", "17", "20", "28"].includes(m[1]), `--fs-${m[1]} is on the scale`);
assert.match(css, /\.dsr-scrim \{[\s\S]*?z-index: 100010;/, "dialogs above the 99998 admin shell");
assert.match(css, /html\.glass-desktop \.dsr-dlg:focus-visible \{ outline: none; \}/, "no ring around the whole dialog on glass desktop");
assert.match(css, /html\.glass-desktop :is\(\.dsr, \.dsr-page, \.dsr-scrim, \.dsr-menu\) :is\(button, input, textarea, select, a\):focus-visible/, "brand focus ring wins over the glass-desktop default");
assert.match(css, /@media \(max-width: 560px\)[\s\S]*min-height: 44px/, "phone touch targets");
assert.ok(!/\.dossier-/.test(rd("../../../styles/admin-glass.css")), "old dossier rules removed");

console.log("dossier.selftest: ok");
