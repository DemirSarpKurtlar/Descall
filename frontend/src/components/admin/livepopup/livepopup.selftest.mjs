// node src/components/admin/livepopup/livepopup.selftest.mjs
// Canlı popup remake (Draft B "Kontrol merkezi", Nov 2026): pure model helpers
// (tone switch, templates, drafts, rules, labels, times, funnel, feed, table
// status, recall gate), client receipt helpers, the same constants as the
// server model, copy in all seven languages with the same keys and
// placeholders, and the pieces each draft frame needs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as M from "./livePopupModel.js";
import { applyPopupClose, applyPopupRecall, sendPopupReceipt, __resetPopupReceipts } from "../../../lib/livePopupClient.js";

const require = createRequire(import.meta.url);
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const server = require("../../../../backend/lib/livePopup/model.js");
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);

/* ---- client and server agree ---- */
assert.deepEqual(M.TONES, server.SEVERITIES);
assert.deepEqual(M.DURATIONS, server.DURATIONS);
assert.deepEqual(M.PLATFORMS, server.PLATFORMS);
assert.deepEqual(M.LANGS, server.LANGS);
assert.deepEqual([...M.RULE_TYPES].sort(), [...server.RULE_TYPES].sort());
assert.deepEqual(M.FILTERS, server.FILTERS);
assert.deepEqual(M.RECALL_MODES, server.RECALL_MODES);
assert.equal(M.DAILY_LIMIT, server.DAILY_LIMIT);
assert.equal(M.MAX_TITLE, server.MAX_TITLE);
for (const tpl of M.BUILTIN_TEMPLATES) assert.ok(server.ICONS.includes(tpl.icon), `icon ${tpl.icon} known to the server`);

/* ---- drafts ---- */
let d = M.emptyDraft();
assert.equal(d.includeSelf, false, "Bana da gönder is off by default (draft b2)");
d = M.applyTone(d, "urgent");
assert.equal(d.icon, "siren");
assert.equal(d.requireAck, true, "urgent turns OK required on");
d = M.applyTone(d, "info");
assert.equal(d.requireAck, false, "leaving urgent turns it back off");
const outage = M.draftFromTemplate(M.BUILTIN_TEMPLATES.find((x) => x.key === "outage"), t);
assert.equal(outage.templateName, "livePopup.templates.outage.name");
assert.equal(outage.autoResolve, true);
assert.deepEqual(outage.rules, [{ type: "voice" }]);
assert.equal(outage.ctaUrl, "descall.com/durum");
const saved = M.draftFromTemplate({ id: "t1", name: "Kısa", title: "T", body: "B", severity: "warning", icon: "lock", audience: { rules: [{ type: "premium", value: "non" }] } }, t);
assert.equal(saved.templateId, "t1");
assert.equal(saved.rules[0].value, "non");
assert.deepEqual(M.draftErrors({ ...M.emptyDraft() }), ["title", "body"]);
assert.deepEqual(M.draftErrors({ ...M.emptyDraft(), title: "a", body: "b", ctaLabel: "x" }), ["cta"]);
assert.deepEqual(M.draftErrors({ ...M.emptyDraft(), title: "a", body: "b", when: "schedule", scheduleAt: "2020-01-01T10:00" }), ["schedule"]);
const p = M.draftPayload({ ...M.emptyDraft(), title: " a ", body: " b ", requireAck: true, durationMs: 30000, rules: [{ type: "server", serverId: "" }, { type: "voice" }] });
assert.equal(p.content.title, "a");
assert.equal(p.content.durationMs, 0, "OK required never auto-closes");
assert.deepEqual(p.audience.rules, [{ type: "voice" }], "incomplete rules are left out");
assert.equal(p.scheduleAt, null);
assert.equal(M.draftDirty(M.emptyDraft()), false);
assert.equal(M.draftDirty({ ...M.emptyDraft(), title: "x" }), true);
const back = M.draftFromCampaign({ title: "x", body: "y", severity: "warning", icon: "wrench", scheduledAt: "2026-11-15T17:00:00.000Z", audience: { rules: [] } }, { keepSchedule: true });
assert.equal(back.when, "schedule");
assert.equal(M.fromLocalInput(back.scheduleAt), "2026-11-15T17:00:00.000Z", "local input round-trips");

/* ---- rules ---- */
let rules = M.upsertRule([], M.newRule("platform"));
rules = M.upsertRule(rules, M.newRule("voice"));
assert.deepEqual(rules.map((r) => r.type), ["voice", "platform"], "menu order");
assert.equal(M.ruleLabel(rules[1], t), 'livePopup.aud.platform{"list":"livePopup.platform.desktop, livePopup.platform.web"}');
assert.ok(M.ruleLabel({ type: "users", users: [{ username: "a" }, { username: "b" }, { username: "c" }] }, t).includes("usersMore"));
assert.equal(M.removeRule(rules, "voice").length, 1);
assert.equal(M.audienceLabel({ rules: [] }, t), "livePopup.everyone");
assert.equal(M.audienceLabel({ rules: [], fromCampaign: "x" }, t), "livePopup.aud.previous");
assert.equal(M.ruleComplete({ type: "users", users: [] }), false);
assert.equal(M.ruleComplete({ type: "accountAge", op: "older", days: 7 }), true);

/* ---- numbers / time ---- */
assert.equal(M.fmtNumber(1284, "tr"), "1.284");
assert.equal(M.pct(53, 1284), 4);
const now = Date.parse("2026-11-14T12:00:00Z");
assert.equal(M.shortAgo("2026-11-14T11:59:58Z", t, now), "livePopup.now");
assert.equal(M.shortAgo("2026-11-14T11:59:52Z", t, now), 'livePopup.secShort{"n":8}');
assert.equal(M.shortAgo("2026-11-14T11:56:00Z", t, now), 'livePopup.minShort{"n":4}');
assert.equal(M.countdown("2026-11-15T08:41:00Z", t, now), 'livePopup.hourMin{"h":20,"m":41}');
assert.equal(M.countdown("2026-11-15T13:00:00Z", t, now), 'livePopup.dayShort{"n":1}');
assert.equal(M.clock("2026-11-13T23:38:00Z", "tr"), "02:38", "Istanbul clock");

/* ---- live view ---- */
const rows = M.funnelRows({ targeted: 1284, delivered: 1231, seen: 1104, acked: 718, clicked: 312, missed: 53 });
assert.deepEqual(rows.map((r) => r.id), ["targeted", "delivered", "seen", "acked", "clicked", "missed"]);
assert.deepEqual(rows.map((r) => r.pct), [100, 96, 86, 56, 24, 4], "draft b1 percentages");
assert.deepEqual(M.sparkHeights([95, 0, 5]), [100, 3, 6]);
const missed = M.eventLine({ kind: "missed", reason: "left", pending: true, username: "aysenur", platform: "ios" });
assert.equal(missed.key, "livePopup.event.missedLeft");
assert.equal(missed.extraKey, "livePopup.event.atLogin");
assert.equal(M.eventLine({ kind: "clicked", url: "https://descall.com/durum/", username: "m" }).extra, "descall.com/durum");
assert.equal(M.eventLine({ kind: "seen", open: true, username: "z" }).extraKey, "livePopup.event.openOnScreen");
assert.equal(M.pickLive({ live: [{ id: "a" }] }, null), "a");
assert.equal(M.pickLive({ live: [{ id: "a" }] }, "b"), "b");

/* ---- table ---- */
assert.equal(M.rowStatus({ status: "acked" }).tone, "green");
assert.equal(M.rowStatus({ status: "open" }).key, "livePopup.rowStatus.open");
assert.equal(M.rowStatus({ status: "missed", missedReason: "connection" }).key, "livePopup.rowStatus.missedConnection");
assert.equal(M.rowStatus({ status: "missed" }).key, "livePopup.rowStatus.missedOffline");
const tableRows = [{ userId: "1", status: "unseen" }, { userId: "2", status: "missed" }, { userId: "3", status: "acked" }];
assert.equal(M.selectionKind(tableRows, new Set(["1", "2"])), "unseen-missed");
assert.equal(M.selectionKind(tableRows, new Set(["1", "3"])), "");
assert.deepEqual([...M.toggleSet(new Set(["1"]), "1")], []);

/* ---- recall gate ---- */
const base = { reason: "Yanlış saat duyuruldu", typed: "geri çek", word: "GERİ ÇEK", mode: "silent" };
assert.equal(M.canRecall(base, "tr"), true, "typed confirmation is case-insensitive in Turkish");
assert.equal(M.canRecall({ ...base, typed: "GERI CEK" }, "tr"), false);
assert.equal(M.canRecall({ ...base, reason: "kısa" }, "tr"), false, "reason needs 5 characters");
assert.equal(M.canRecall({ ...base, mode: "note" }, "tr"), false, "note mode needs the note");
assert.equal(M.canRecall({ ...base, mode: "edited", editedTitle: "a", editedBody: "b" }, "tr"), true);
const rp = M.recallPayload({ ...base, mode: "edited", editedTitle: " Yeni ", editedBody: " 04:00 ", campaign: { severity: "warning", icon: "wrench", requireAck: true } });
assert.equal(rp.edited.title, "Yeni");
assert.equal(rp.edited.severity, "warning");
assert.equal(M.errorKey({ code: "DAILY_LIMIT" }), "livePopup.err.DAILY_LIMIT");
assert.equal(M.errorKey({ code: "WHATEVER" }), null);

/* ---- member side ---- */
__resetPopupReceipts();
const sent = [];
const sock = { emit: (e, p2) => sent.push([e, p2]) };
const pop = { id: "c1", track: true };
assert.equal(sendPopupReceipt(sock, pop, "seen"), true);
assert.equal(sendPopupReceipt(sock, pop, "seen"), false, "once per kind per delivery");
assert.equal(sendPopupReceipt(sock, { id: "c1", track: true }, "seen"), true, "a resent popup reports again");
assert.equal(sendPopupReceipt(sock, { id: "t", track: false }, "seen"), false, "tests are never tracked");
assert.equal(sent[0][0], "popup:receipt");
const q = [{ id: "a" }, { id: "b" }];
assert.deepEqual(applyPopupRecall(q, { id: "a", mode: "silent" }).map((x) => x.id), ["b"]);
assert.deepEqual(applyPopupRecall(q, { id: "a", mode: "note", note: "fix" }, (p2) => ({ id: `${p2.id}:note` })).map((x) => x.id), ["a:note", "b"]);
assert.equal(applyPopupRecall(q, { id: "zz", mode: "note", note: "x" }, () => ({ id: "n" })), q, "nothing to recall: same queue");
assert.deepEqual(applyPopupClose(q, { id: "b" }).map((x) => x.id), ["a"]);

/* ---- copy: seven languages, same keys and placeholders ---- */
const flat = (o, pre = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]));
const args = (s) => [...new Set([...String(s).matchAll(/\{(\w+)/g)].map((m) => m[1]))].sort().join(",");
const LOCALES = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
const cat = {};
for (const [loc, suf] of Object.entries(LOCALES)) {
  cat[loc] = Object.fromEntries(flat((await import(`../../../i18n/locales/livePopup.${loc}.js`))[`LIVE_POPUP_${suf}`]));
  const main = rd(`../../../i18n/locales/${loc}.js`);
  assert.ok(main.includes(`LIVE_POPUP_${suf}`), `${loc}.js registers the namespace`);
}
const keys = Object.keys(cat.tr).sort();
for (const [loc, c] of Object.entries(cat)) {
  assert.deepEqual(Object.keys(c).sort(), keys, `${loc}: same keys`);
  for (const k of keys) assert.equal(args(c[k]), args(cat.tr[k]), `${loc}: placeholders of ${k}`);
  for (const k of keys) assert.ok(String(c[k]).trim(), `${loc}: ${k} not empty`);
}
// Every key used by the page exists.
const srcs = ["LivePopupPage.jsx", "LiveView.jsx", "RecipientsView.jsx", "ComposerDrawer.jsx", "LiveDialogs.jsx", "ListViews.jsx", "livePopupModel.js"].map((f) => rd(`./${f}`)).join("\n");
const used = new Set([...srcs.matchAll(/["`]livePopup\.([A-Za-z0-9_.]+)["`]/g)].map((m) => m[1]));
for (const k of used) assert.ok(cat.tr[k] != null || keys.some((x) => x.startsWith(`${k}.`)), `key livePopup.${k} exists`);
assert.ok(cat.tr["recall.confirmWord"] === "GERİ ÇEK", "draft b4 confirmation word");

/* ---- the draft frames ---- */
assert.ok(srcs.includes("lp-recall") && srcs.includes("lp-resend-missed") && srcs.includes("lp-more"), "b1: recall, resend to missed, more");
assert.ok(srcs.includes("byPlatform") && srcs.includes("byLanguage") && srcs.includes("lp-tl") && srcs.includes("lp-spark"), "b1: platform, language, live feed, seen speed");
assert.ok(srcs.includes("lp-add-rule") && srcs.includes("DesktopMock") && srcs.includes("PhoneMock") && srcs.includes("testSend"), "b2: rules, desktop / phone preview, test to my phone");
assert.ok(srcs.includes("BanDialog") && srcs.includes("rowMenu.exempt") && srcs.includes("lp-resend-selected") && srcs.includes("actions.csv"), "b3: ban dialog, exempt, resend selected, CSV");
assert.ok(srcs.includes("confirmWord") && srcs.includes("lp-recall-typed") && srcs.includes("recall.reason"), "b4: reason + typed confirmation");
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(srcs), "no emoji in the page source");
const css = rd("../../../styles/admin-livepopup.css");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) assert.ok(/var\(--fs-(11|12|13|15|17|20|28)\)/.test(m[1]), `type scale only: ${m[1]}`);
assert.ok(css.includes("html.glass-desktop :is(.lp, .lp-scrim, .lp-menu)"), "focus ring beats the glass-desktop rule");

console.log("livepopup.selftest.mjs: ok");
