// Growth 3B UI helpers: notification center, streaks, win-back card, console.
import assert from "node:assert/strict";
import { RG3 } from "../../i18n/locales/rg3.i18n.js";
import { badgeOf, sortPeople, filterBySearch, personLine, serverLine, quietLabel, digestLabel, applyPersonPatch, nextWindowText, lastSeenText } from "./notifyCenterModel.js";
import { taskTitle, taskSub, sharedSub, doneCount, ringPct, dat } from "./streaksModel.js";
import { defaultCallMessage, parseSuggestion } from "./winbackModel.js";
import { parseCenterState } from "./notifyCenterModel.js";
import { splitTokens, rateLabel, openRateTone, excludedRows, hourBars, todayLine, liveBars } from "../admin/reengage/reengageModel.js";

const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const mk = (lang) => (key, vars = {}) => {
  const s = get(RG3[lang], key.replace(/^rg3\./, ""));
  assert.equal(typeof s, "string", `${lang}: ${key}`);
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
};
const t = mk("tr");
const en = mk("en");
const NOW = Date.parse("2026-11-27T15:00:00Z");

// badges and order
assert.equal(badgeOf({ prefs: { important: true } }, NOW), "always");
assert.equal(badgeOf({ prefs: { voice: "off" } }, NOW), "muted");
assert.equal(badgeOf({ prefs: { mutedUntil: new Date(NOW + 1000).toISOString() } }, NOW), "muted");
assert.equal(badgeOf({ prefs: { mutedUntil: new Date(NOW - 1000).toISOString() } }, NOW), "default", "an old mute is over");
const people = sortPeople([
  { name: "Zeynep", prefs: { important: true, importantAt: "2026-11-02" } },
  { name: "Can", prefs: {} },
  { name: "Ece", prefs: { important: true, importantAt: "2026-11-01" } },
  { name: "Ali", prefs: {} },
]);
assert.deepEqual(people.map((p) => p.name), ["Ece", "Zeynep", "Ali", "Can"], "important first in the order added");
assert.deepEqual(filterBySearch([{ name: "Işıl" }, { name: "Mert", username: "isil_fan" }], "isil").length, 2, "Turkish folding");
// lines
assert.equal(personLine({ voice: { serverName: "Gece Kuşları", channelName: "Sohbet" } }, t), "Seste · Gece Kuşları › Sohbet");
assert.equal(personLine({ sharedStreak: 4 }, t), "Ortak seri 4 gün");
assert.equal(lastSeenText(new Date(NOW - 2 * 3600e3).toISOString(), t, NOW), "Son görülme 2 sa önce");
assert.equal(lastSeenText(new Date(NOW - 30 * 3600e3).toISOString(), t, NOW), "Son görülme dün");
assert.equal(serverLine({ level: "muted" }, t), "Sessizde");
assert.equal(serverLine({ level: "all", importantHere: 3 }, t), "3 önemli kişin burada");
assert.equal(serverLine({ level: "all", importantHere: 0, messagesThisWeek: 212 }, t), "212 mesaj bu hafta");
assert.equal(quietLabel({ quietStart: 23, quietEnd: 9 }, t), "Sessiz 23:00-09:00");
assert.equal(quietLabel({ quietStart: 22, quietEnd: 10 }, t, true), "22:00-10:00");
assert.equal(digestLabel({ digestDay: 0, digestHour: 11 }, t), "E-posta · Pazar 11:00");
// optimistic patch
const p0 = { id: "e", prefs: { important: false, voice: "default", messages: "always" } };
const p1 = applyPersonPatch(p0, { important: true, mute: "8h" }, NOW);
assert.equal(p1.prefs.important, true);
assert.equal(Date.parse(p1.prefs.mutedUntil), NOW + 8 * 3600e3);
assert.equal(p1.badge, "muted");
assert.equal(applyPersonPatch(p1, { mute: "off" }, NOW).badge, "always");
// drawer footnote
const quietNext = { fromPeerToday: 1, earliestAt: "2026-11-28T00:14:00Z", nextAt: "2026-11-28T06:00:00Z", nextQuiet: true };
const foot = nextWindowText(quietNext, { name: "Ece" }, t, "tr", NOW, "Europe/Istanbul");
assert.equal(foot, "Bugün Ece hakkında 1 bildirim aldın. Bir sonraki en erken saat 03:14; o da sessiz saatte olduğu için yarın 09:00 sonrası.");
assert.match(nextWindowText({ fromPeerToday: 0, nextAt: new Date(NOW).toISOString() }, { name: "Ece" }, en, "en", NOW), /can come now/);

// streaks
assert.equal(dat("Kaan", "tr"), "Kaan'a");
assert.equal(dat("Kaan", "en"), "Kaan");
assert.equal(taskTitle({ kind: "message", target: { name: "Ece" } }, t, "tr"), "Ece'ye mesaj at");
assert.equal(taskTitle({ kind: "save_streak", target: { name: "Kaan" } }, t, "tr"), "Kaan'a yaz, seriyi kurtar");
assert.equal(taskTitle({ kind: "message", target: { name: "Ece" } }, en, "en"), "Message Ece");
assert.equal(taskTitle({ kind: "voice", goal: 10 }, t, "tr"), "Bir arkadaşınla 10 dk seste");
assert.equal(taskSub({ kind: "save_streak", bonus: 10 }, t, "tr"), "Ortak seri +10 bonus");
assert.equal(taskSub({ kind: "voice", target: { name: "Ece" } }, t, "tr"), "Ece şu an seste");
assert.equal(sharedSub({ doneToday: true, count: 12 }, t), "İkiniz de bugün yazdınız");
assert.equal(sharedSub({ peerToday: true, meToday: false, count: 4, peer: { name: "Kaan" } }, t), "Kaan yazdı, seni bekliyor");
assert.equal(doneCount([{ done: true }, { done: false }, { done: true }]), 2);
assert.ok(ringPct(0) > 0 && ringPct(7) === 1 && ringPct(8) < 0.2);

// win-back default message in the caller's words
assert.equal(
  defaultCallMessage({ target: { name: "Demir" }, serverName: "Gece Kuşları", reward: 50 }, t),
  "Demir, Gece Kuşları sunucusunda seni bekliyoruz. Gelirsen ikimize de 50 DesCoin."
);

// the home card only shows a real suggestion; anything else hides it instead of crashing
for (const bad of [null, undefined, [], {}, { id: "w1" }, { target: { name: "x" } }, { id: "w1", target: [] }, "x", 3]) {
  assert.equal(parseSuggestion(bad), null, `hidden for ${JSON.stringify(bad)}`);
}
const okSug = { id: "w1", target: { id: "u2", name: "Demir" } };
assert.equal(parseSuggestion(okSug), okSug);

// console helpers
assert.deepEqual(
  splitTokens("{arkadas_1} ve {kim} bu hafta").map((p) => [p.text, Boolean(p.token), p.known ?? null]),
  [["arkadas_1", true, true], [" ve ", false, null], ["kim", true, false], [" bu hafta", false, null]]
);
assert.equal(rateLabel({ id: "inactive7", status: "live", returnRate: 17 }, t), "%17 döndü");
assert.equal(rateLabel({ id: "weekly_digest", openRate: 44 }, t), "%44 açtı");
assert.equal(rateLabel({ id: "inactive14", status: "draft" }, t), "—");
assert.equal(openRateTone(4), "rg-tone-bad", "RU %4 stands out");
assert.equal(openRateTone(41), "rg-tone-good");
assert.deepEqual(excludedRows({ noDevice: 26, weekly: 10, unsubscribed: 9, quiet: 22 }).map((r) => r.pct), [100, 38, 35, 85]);
const bars = hourBars([0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 7, 6, 0]);
assert.equal(bars[2].quiet, true);
assert.equal(bars[2].top, false, "a quiet hour is never a best hour");
assert.deepEqual(bars.filter((b) => b.top).map((b) => b.hour), [20, 21, 22]);
assert.equal(todayLine({ campaigns: new Array(6), today: { sent: 412, returned: 61, net: 9 } }, t), "6 kampanya · bugün 412 gönderim, 61 dönüş (kontrol grubuna göre net +9 puan)");
assert.deepEqual(liveBars({ sent: 64, delivered: 61, opened: 19, openedApp: 11, acted: 6 }).map((b) => b.value), [61, 19, 11, 6]);

// Notify center: only a real state reaches the panel; anything else shows the retry card.
for (const bad of [null, [], "x", 3, {}, { "notify-center": [], items: [] }, { settings: [] }, { settings: "x" }]) {
  assert.equal(parseCenterState(bad), null, `center refused for ${JSON.stringify(bad)}`);
}
{
  const nr = parseCenterState({ ready: false });
  assert.equal(nr.ready, false);
  assert.deepEqual(nr.people, []);
  assert.deepEqual(nr.settings.types, {});
  const st = parseCenterState({ settings: { voiceDailyMax: 2 }, people: [null, { id: "a" }, { id: "b", prefs: { important: true } }, "x"], servers: [{ id: "s" }, 4] });
  assert.deepEqual(st.settings.types, {});
  assert.equal(st.people.length, 2);
  assert.deepEqual(st.people[0].prefs, {});
  assert.equal(st.servers.length, 1);
  assert.equal(st.importantCount, 1);
}

// every language has the same keys
const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : keys(v, `${p}${k}.`)));
const base = keys(RG3.tr).sort();
for (const lang of ["en", "de", "es", "fr", "pt-BR", "ru"]) assert.deepEqual(keys(RG3[lang]).sort(), base, `rg3 ${lang}`);
console.log(`reengageUi.selftest: ok (${base.length} keys x 7)`);
