// node src/components/admin/security/security.selftest.mjs
// Güvenlik Merkezi remake (Draft A "Komuta merkezi", Nov 2026): pure model helpers
// (times, KPI deltas, chart paths and axis, score labels, feed merge / filters /
// actions / CSV, lock dialog model, history diff lines and titles, Turkish suffixes),
// the info band store, client and server constants agree, and the copy has the same
// keys and placeholders in all seven languages.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as M from "./securityModel.js";
import * as N from "../../../lib/platformNotice.js";
import { SEC_CENTER_TR } from "../../../i18n/locales/secCenter.tr.js";
import { SEC_CENTER_EN } from "../../../i18n/locales/secCenter.en.js";
import { SEC_CENTER_DE } from "../../../i18n/locales/secCenter.de.js";
import { SEC_CENTER_ES } from "../../../i18n/locales/secCenter.es.js";
import { SEC_CENTER_FR } from "../../../i18n/locales/secCenter.fr.js";
import { SEC_CENTER_PT_BR } from "../../../i18n/locales/secCenter.pt-BR.js";
import { SEC_CENTER_RU } from "../../../i18n/locales/secCenter.ru.js";

const require = createRequire(import.meta.url);
const sec = require("../../../../backend/lib/securitySettings.js");
const events = require("../../../../backend/lib/securityEvents.js");
const score = require("../../../../backend/lib/securityScore.js");

/* tiny translator over the Turkish catalog (plural: "other" branch) */
function lookup(cat, key) {
  return key.split(".").slice(1).reduce((o, k) => (o == null ? undefined : o[k]), cat);
}
function makeT(cat) {
  return (key, vars = {}) => {
    let s = lookup(cat, key);
    assert.equal(typeof s, "string", `missing key ${key}`);
    s = s.replace(/\{(\w+), plural, [^{]*\{[^}]*\}(?: \w+ \{[^}]*\})* other \{([^}]*)\}\}/g, (_, v, other) => other.replace(/#/g, String(vars[v])));
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  };
}
const t = makeT(SEC_CENTER_TR);
const tEn = makeT(SEC_CENTER_EN);

/* ---- client and server agree ---- */
assert.deepEqual([...M.LOCK_MODES], [...sec.LOCK_MODES]);
assert.deepEqual([...M.LOCK_DURATIONS].sort(), Object.keys(sec.LOCK_DURATIONS).sort());
for (const d of M.LOCK_DURATIONS) assert.equal(M.LOCK_MINUTES[d], sec.LOCK_DURATIONS[d], `minutes of ${d}`);
assert.deepEqual(M.FILTER_TYPES, JSON.parse(JSON.stringify(events.FILTERS)));
assert.deepEqual([...M.EVENT_TYPES], [...events.TYPES]);
assert.deepEqual([...M.HISTORY_CATEGORIES].slice(1), [...sec.HISTORY_CATEGORIES]);
assert.equal(score.TOTAL, 100, "weights add up to 100, so +N puan is the weight");
for (const c of score.CHECKS) assert.ok(SEC_CENTER_TR.check[c.id]?.name && SEC_CENTER_TR.check[c.id].why, `check copy ${c.id}`);

/* ---- times ---- */
const now = Date.parse("2026-11-15T21:40:00");
assert.equal(M.relTime(new Date(now - 20000).toISOString(), t, now), "şimdi");
assert.equal(M.relTime(new Date(now - 2 * 60000).toISOString(), t, now), "2 dk");
assert.equal(M.relTime(new Date(now - 3 * 3600000).toISOString(), t, now), "3 sa");
assert.deepEqual(M.remaining(new Date(now + 72 * 60000).toISOString(), now).h, 1);
assert.equal(M.remainingText(new Date(now + 72 * 60000).toISOString(), t, now), "1 sa 12 dk");
assert.equal(M.remainingText(null, t, now), "Elle kaldırılana kadar");
assert.equal(M.lockSubtitle({ until: new Date(now + 72 * 60000).toISOString(), by: "demir" }, t, now), "1 sa 12 dk sonra kalkar · @demir", "A1 lock subtitle");
assert.ok(M.fmtStamp(new Date(now - 60000).toISOString(), t, "tr", now).startsWith("Bugün "));
assert.ok(M.fmtStamp(new Date(now - 26 * 3600000).toISOString(), t, "tr", now).startsWith("Dün "));

/* ---- Turkish suffixes ---- */
assert.equal(M.trLocative("22:40"), "ta");
assert.equal(M.trLocative("21:00"), "de");
assert.equal(M.trLocative("09:03"), "te");
assert.equal(M.trLocative("10:00"), "da");
assert.equal(M.trLocative("20:09"), "da");
assert.equal(M.trPossessive(9), "u");
assert.equal(M.trPossessive(12), "si");
assert.equal(M.trPossessive(1), "i");
assert.equal(M.trPossessive(40), "ı");
assert.equal(M.trPossessive(6), "sı");
assert.equal(M.numWithSuffix(9, "en"), 9, "other languages get the bare number");
assert.equal(M.timeWithSuffix("22:40", "de"), "22:40");
assert.equal(t("secCenter.score.passed", { passed: M.numWithSuffix(9, "tr"), total: 12 }), "12 kontrolden 9'u tamam", "A1 wording");
assert.equal(M.checkLabel({ id: "admin2fa", ok: false, vars: { total: 7, missing: 1 } }, t), "7 yöneticiden 1'inde 2FA yok", "A1 wording");
assert.equal(M.checkLabel({ id: "messageRate", ok: true, vars: { n: 60 } }, t), "Mesaj hız limiti 60 / dk");

/* ---- KPIs ---- */
assert.deepEqual(M.pctDelta(212, t), { text: "+212% dünden", tone: "up" });
assert.deepEqual(M.pctDelta(-8, t), { text: "-8% dünden", tone: "dn" });
assert.equal(M.pctDelta(null, t).tone, "up");
assert.deepEqual(M.absDelta(29), { text: "+29", tone: "up" });

/* ---- chart ---- */
const cp = M.chartPaths({ failed: [0, 10, 5], rate: [1, 1, 1], blocked: [] }, 100, 50, ["rate", "failed", "blocked"]);
assert.equal(cp.max, 11.5);
assert.ok(cp.series[1].line.startsWith("M0.0 50.0 L50.0 6.5"), cp.series[1].line);
assert.ok(cp.series[1].area.endsWith("L100 50 L0 50Z"));
assert.equal(cp.series[2].line, "", "empty series draws nothing");
const start = new Date(now - 24 * 3600000).toISOString();
const ax = M.axisLabels(start, t, "tr", now);
assert.equal(ax.length, 5);
assert.ok(ax[0].startsWith("Dün "), ax[0]);
assert.equal(ax[4], "Şimdi");
assert.equal(M.chartX(start, new Date(now - 12 * 3600000).toISOString(), now), 0.5);
assert.equal(M.chartX(start, new Date(now - 30 * 3600000).toISOString(), now), null);

/* ---- score ---- */
assert.deepEqual(M.checkCta({ ok: false, action: "apply", points: 4 }, t), { kind: "apply", text: "+4 puan", link: false });
assert.deepEqual(M.checkCta({ ok: false, action: "remind", points: 14 }, t), { kind: "remind", text: "Hatırlat", link: true });
assert.equal(M.checkCta({ ok: true }, t), null);
assert.equal(M.scoreAfter(74, { ok: false, points: 4 }), 78);
assert.ok(M.ringStyle(82, "good").background.includes("#34c77b 0 82%"));
const sc = score.computeScore({
  config: { maxLoginAttempts: 5, maxMessagesPerMinute: 60, dmRateLimitMs: 200, dmMinAccountAgeHours: 0, disposableEmailBlock: true, locks: {} },
  admins: [{ username: "admin", twoFactor: true }, { username: "selin", twoFactor: false }],
  env: { humanCheck: false, totpEnforced: true, accessBans: true, eventLog: true, auditLog: true },
});
assert.deepEqual(sc.checks.slice(0, 3).map((c) => c.id), ["humanCheck", "admin2fa", "dmMinAge"], "A1 order: failed first in the fixed order");
assert.equal(sc.score, 100 - 8 - 14 - 4);
assert.equal(sc.recommendations, 1);
assert.equal(sc.potential, sc.score + 4);
assert.deepEqual(score.allFixes(sc), { dmMinAccountAgeHours: 24 });

/* ---- feed ---- */
const ev = (id, type, at, extra = {}) => ({ id, type, at: new Date(now - at * 60000).toISOString(), count: 1, detail: {}, ...extra });
const merged = M.mergeEvents([ev("a", "failed_login", 5), ev("b", "rate_limit", 3)], [ev("c", "brute_force", 0), ev("a", "failed_login", 5)], "all");
assert.deepEqual(merged.map((e) => e.id), ["c", "b", "a"], "newest first, no duplicates");
assert.deepEqual(M.mergeEvents(merged, [], "rateLimit").map((e) => e.id), ["b"]);
assert.equal(M.matchesFilter({ type: "account_locked" }, "failedLogin"), true);
assert.equal(M.matchesFilter({ type: "posture" }, "all"), false);
assert.equal(M.sourceText({ ipMasked: "88.230.x.x", city: "İstanbul" }), "88.230.x.x · İstanbul");
const bf = ev("x", "brute_force", 0, { sourceRef: "f".repeat(48), detail: { attempts: 214, accounts: 37, minutes: 9, sample: "elifkaya" } });
assert.equal(M.eventLine(bf, t, "tr"), "@elifkaya dahil 37 hesaba 9 dakikada 214 deneme", "A1 line");
assert.equal(M.eventLine(ev("y", "rate_limit", 4, { username: "hizli_kral41", count: 184, detail: { limit: 60 } }), t, "tr"), "@hizli_kral41 · mesaj sınırı 60 / dk, 184 deneme reddedildi");
assert.equal(M.eventLine(ev("z", "signup_denied", 9, { detail: { reason: "disposable", email: "t***@tempmail.io" } }), t, "tr"), "t***@tempmail.io · tek kullanımlık e-posta");
assert.equal(M.eventLine(ev("w", "access_ban", 6, { detail: { kind: "network", label: "78.180.x.0/24", action: "login" } }), t, "tr"), "Ağ yasağı 78.180.x.0/24 · giriş denemesi");
assert.equal(M.eventLine(ev("v", "admin_step_up", 11, { username: "demir", detail: { ok: true } }), t, "tr"), "@demir · kod doğru");
assert.deepEqual(M.eventActions(bf), ["banIp", "inspect"], "A1: IP engelle + İncele");
assert.deepEqual(M.eventActions(bf, { bannedRefs: new Set(["f".repeat(48)]) }), ["inspect"], "a banned source has no ban button");
assert.deepEqual(M.eventActions(bf, { canAccessBans: false }), ["inspect"], "no ban button without the section");
assert.deepEqual(M.eventActions({ type: "rate_limit", userId: "u" }), ["banUser", "inspect"], "A1: Yasakla + İncele");
assert.deepEqual(M.eventActions({ type: "access_ban" }), ["viewBan"], "A1: Yasak");
assert.deepEqual(M.eventActions({ type: "admin_step_up" }), ["session"], "A1: Oturum");
const csv = M.feedCsv([bf], t, "tr");
assert.ok(csv.split("\n")[0].startsWith("Zaman,Tür"));
assert.ok(csv.includes("Kaba kuvvet saldırısı") && !/\d+\.\d+\.\d+\.\d+/.test(csv), "CSV has masked addresses only");

/* ---- lock dialog ---- */
const active = { registration: { until: new Date(now + 3600000).toISOString() } };
assert.deepEqual(M.initialModes("registration", active), [], "an active lock is never picked as new");
assert.deepEqual(M.initialModes("dm", active), ["dm"]);
assert.deepEqual(M.toggleMode(["dm"], "readOnly", active), ["dm", "readOnly"]);
assert.deepEqual(M.toggleMode(["dm"], "registration", active), ["dm"]);
assert.equal(M.lockConfirmLabel(t, 2, "1h"), "2 kilidi 1 saatliğine başlat", "A2 button");
assert.equal(M.lockConfirmLabel(tEn, 2, "1h"), "Start 2 locks for 1 hour");
assert.equal(M.autoEndAt("manual", now), null);
assert.equal(Date.parse(M.autoEndAt("1h", now)) - now, 3600000);
assert.equal(M.bandModeFor(["registration", "dm"]), "dm");
assert.equal(M.bandModeFor(["dm", "readOnly"]), "readOnly");
assert.equal(M.bandText("dm", "1h", t), "DM gönderimi geçici olarak kapalı. Yaklaşık 1 saat içinde açılacak.", "A2 band");
assert.deepEqual(M.lockFormErrors({ modes: [], reason: "x", code: "12" }), ["modes", "reason", "code"]);
assert.deepEqual(M.lockFormErrors({ modes: ["dm"], reason: "Bot dalgası", code: "481205" }), []);
assert.deepEqual(M.lockFormErrors({ modes: ["dm"], reason: "Bot dalgası", code: "", needCode: false }), []);
assert.equal(M.cleanOtp("481 205x9"), "481205");

/* ---- history ---- */
const until = new Date(now + 60 * 60000).toISOString();
const lockEntry = { title: "lock.registration", meta: { modes: ["registration"] }, changes: [{ key: "lock.registration", from: null, to: { until, minutes: 60 } }] };
assert.equal(M.entryTitle(lockEntry, t), "Acil kilit: kayıt dondurma", "A3 title");
const lines = M.diffLines(lockEntry, t, "tr", { now, liveModes: ["registration"] });
assert.equal(lines[0].text, "registrationEnabled: açık");
assert.equal(lines[1].text, "registrationEnabled: kapalı · 22:40'ta otomatik açılır", "A3 lock diff");
const dmEntry = { title: "lock.dm", meta: { modes: ["dm"] }, changes: [{ key: "lock.dm", from: null, to: { until: new Date(now - 86400000).toISOString(), minutes: 360 } }] };
assert.equal(M.diffLines(dmEntry, t, "tr", { now, liveModes: [] })[1].text, "dmEnabled: kapalı · 6 saat", "A3 ended lock");
const rate = { title: "maxMessagesPerMinute", changes: [{ key: "maxMessagesPerMinute", from: 60, to: 40 }] };
assert.equal(M.entryTitle(rate, t), "Mesaj hız limiti");
assert.deepEqual(M.diffLines(rate, t, "tr").map((l) => l.text), ["maxMessagesPerMinute: 60", "maxMessagesPerMinute: 40"]);
assert.equal(M.revertSentence(rate, t, "tr"), "Mesaj hız limiti 40 / dk değerinden 60 / dk değerine döner.", "A3 popover");
assert.equal(M.entryTitle({ ...rate, revertOf: "x" }, t), "Geri alındı: Mesaj hız limiti");
assert.equal(M.valueText("featureFlags.iosGlass", { platforms: ["ios"] }, t), "kademeli kural");
assert.equal(M.avatarOf("demir").letter, "D");

/* ---- server-side pure pieces the page relies on ---- */
assert.deepEqual(sec.revertPatch([{ key: "maxMessagesPerMinute", from: 60, to: 40 }, { key: "lock.dm", from: null, to: {} }, { key: "featureFlags.iosGlass", from: true, to: false }]), { maxMessagesPerMinute: 60, featureFlags: { iosGlass: true } });
assert.equal(sec.categoryOf([{ key: "disposableEmailBlock" }]), "signup");
assert.equal(sec.lockActive({ securityLocks: { dm: { startedAt: "2026-01-01T00:00:00Z", until: "2026-01-01T01:00:00Z" } } }, "dm", Date.parse("2026-01-01T02:00:00Z")), false, "expired lock reads as off");
assert.deepEqual(sec.validateSettingsPatch({ patch: { dmEnabled: "no" } }), { error: "bad_value", key: "dmEnabled" });
assert.equal(sec.patchNeedsReason({ dmEnabled: false }), M.patchNeedsReason({ dmEnabled: false }));

/* ---- info band ---- */
assert.equal(N.normalizeNotice({ modes: ["bogus"] }), null);
const notice = N.normalizeNotice({ modes: ["registration", "dm"], until });
assert.deepEqual(notice.modes, ["dm", "registration"]);
assert.equal(N.noticeModeFor(notice), "dm");
assert.equal(N.noticeModeFor(N.normalizeNotice({ modes: ["registration"] })), null, "signed-in users are not told about a sign-up freeze");
assert.equal(N.noticeModeFor(N.normalizeNotice({ modes: ["registration"] }), { signedIn: false }), "registration");
assert.equal(N.activeNotice(notice, Date.parse(until) + 1), null);
let calls = 0;
const off = N.subscribePlatformNotice(() => (calls += 1));
N.applyPlatformNotice({ modes: ["dm"], until });
N.applyPlatformNotice({ modes: ["dm"], until });
assert.equal(calls, 1, "same notice twice notifies once");
N.applyPlatformNotice(null);
assert.equal(N.getPlatformNotice(), null);
off();

/* ---- copy: same keys and placeholders in every language, no emoji ---- */
function flat(o, p = "", out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
const vars = (s) => [...new Set([...String(s).matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort().join(",");
const base = flat(SEC_CENTER_TR);
const all = { en: SEC_CENTER_EN, de: SEC_CENTER_DE, es: SEC_CENTER_ES, fr: SEC_CENTER_FR, "pt-BR": SEC_CENTER_PT_BR, ru: SEC_CENTER_RU };
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
for (const [k, v] of Object.entries(base)) assert.ok(!emoji.test(v), `no emoji tr ${k}`);
for (const [lang, cat] of Object.entries(all)) {
  const f = flat(cat);
  assert.deepEqual(Object.keys(f).sort(), Object.keys(base).sort(), `${lang} has the same keys`);
  for (const [k, v] of Object.entries(f)) {
    assert.ok(typeof v === "string" && v.trim(), `${lang} ${k} is filled`);
    assert.ok(!emoji.test(v), `no emoji ${lang} ${k}`);
    assert.equal(vars(v), vars(base[k]), `${lang} ${k} placeholders`);
  }
}
assert.ok(!/valorant|takım bul|\blfg\b/i.test(JSON.stringify([SEC_CENTER_TR, all])), "retired feature never mentioned");

console.log("security.selftest ok");
