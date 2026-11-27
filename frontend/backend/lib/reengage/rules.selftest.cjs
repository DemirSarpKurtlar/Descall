"use strict";

// Growth 3B rules (lib/reengage/rules.js) and copy (lib/reengage/copy.js): pure checks.
const assert = require("node:assert/strict");
const R = require("./rules");
const copy = require("./copy");

const H = 3600 * 1000;
const D = 24 * H;
// 2026-11-27 12:00 Istanbul = 09:00Z
const NOON = Date.parse("2026-11-27T09:00:00Z");
const NIGHT = Date.parse("2026-11-27T21:30:00Z"); // 00:30 Istanbul

// ---- settings ----------------------------------------------------------------
const s0 = R.normalizeSettings(null);
assert.deepEqual(s0.types, { friendVoice: true, mentions: true, unread: true, streak: true, digest: true });
assert.equal(s0.quietStart, 23);
assert.equal(s0.voiceDailyMax, 3);
assert.equal(R.normalizeSettings({ quiet_start: 3, voice_daily_max: 9 }).quietStart, 18, "clamped");
assert.equal(R.normalizeSettings({ voice_daily_max: 9 }).voiceDailyMax, 3);
let v = R.validateSettingsPatch({ types: { digest: false }, quietStart: 22, voiceDailyMax: 1 }, s0);
assert.ok(v.ok);
assert.equal(v.row.quiet_start, 22);
assert.equal(v.row.types.digest, false);
assert.equal(v.row.types.friendVoice, true);
assert.equal(R.validateSettingsPatch({ quietStart: 2 }, s0).ok, false, "quiet hours can only widen");
assert.equal(R.validateSettingsPatch({ quietEnd: 8 }, s0).ok, false);
assert.equal(R.validateSettingsPatch({ types: { nope: true } }, s0).ok, false);
assert.equal(R.validateSettingsPatch({ voiceDailyMax: 4 }, s0).ok, false);

// quiet hours: system 23-09 always; widening honoured
assert.equal(R.isQuietFor(s0, "Europe/Istanbul", NOON), false);
assert.equal(R.isQuietFor(s0, "Europe/Istanbul", NIGHT), true);
assert.equal(R.isQuietFor({ ...s0, quietStart: 18 }, "Europe/Istanbul", Date.parse("2026-11-27T16:00:00Z")), true, "19:00 local is quiet when widened to 18");
assert.equal(R.isQuietFor({ ...s0, quietStart: 23, quietEnd: 9 }, "UTC", NIGHT), true, "UTC column default means Istanbul");
assert.ok(R.msUntilQuietEnds(s0, null, NIGHT) > 8 * H && R.msUntilQuietEnds(s0, null, NIGHT) <= 9 * H);

// ---- person prefs ------------------------------------------------------------
const p0 = R.normalizePerson(null);
assert.equal(p0.voice, "default");
assert.equal(p0.messages, "always");
assert.equal(p0.nudges, true);
let pv = R.validatePersonPatch({ important: true }, p0, { importantCount: 8, now: NOON });
assert.equal(pv.ok, false);
assert.equal(pv.error, "important_full", "at most 8 important people");
pv = R.validatePersonPatch({ important: true, primaryAction: "quiet_join", mute: "8h" }, p0, { importantCount: 7, now: NOON });
assert.ok(pv.ok);
assert.equal(pv.row.important, true);
assert.equal(pv.row.primary_action, "quiet_join");
assert.equal(Date.parse(pv.row.muted_until), NOON + 8 * H);
assert.equal(R.validatePersonPatch({ voice: "loud" }, p0).ok, false);
assert.equal(R.validatePersonPatch({ mute: "2d" }, p0).ok, false);
assert.equal(R.personBadge({ ...p0, important: true }, NOON), "always");
assert.equal(R.personBadge({ ...p0, voice: "off" }, NOON), "muted");
assert.equal(R.personBadge({ ...p0, mutedUntil: new Date(NOON + H).toISOString() }, NOON), "muted");
assert.equal(R.personBadge(p0, NOON), "default");

// ---- voice verdict -------------------------------------------------------------
const vipPerson = { ...p0, important: true };
// Daily budget: normal people stop at the account's max; important people do not count.
let vv = R.voiceVerdict({ person: p0, settings: s0, history: { normal: [NOON - 7 * H, NOON - 14 * H, NOON - 21 * H] } }, NOON);
assert.equal(vv.reason, "max_per_day");
vv = R.voiceVerdict({ person: vipPerson, settings: s0, history: { normal: [NOON - 7 * H, NOON - 14 * H, NOON - 21 * H], vip: [] } }, NOON);
assert.equal(vv.ok, true, "important: never counted in the daily budget");
assert.equal(vv.vip, true);
vv = R.voiceVerdict({ person: vipPerson, settings: s0, history: { vip: [NOON - 2 * H] } }, NOON);
assert.equal(vv.reason, "gap_6h", "important: still one per 6 h about that person");
vv = R.voiceVerdict({ person: p0, settings: { ...s0, voiceDailyMax: 1 }, history: { normal: [NOON - 7 * H] } }, NOON);
assert.equal(vv.reason, "max_per_day", "the account's own budget (1 a day)");
vv = R.voiceVerdict({ person: p0, settings: s0, history: { normal: [NOON - 2 * H] } }, NOON);
assert.equal(vv.reason, "gap_6h");
assert.equal(R.voiceVerdict({ person: { ...p0, voice: "off" }, settings: s0 }, NOON).reason, "person_off");
assert.equal(R.voiceVerdict({ person: p0, settings: { ...s0, types: { ...s0.types, friendVoice: false } } }, NOON).reason, "type_off");
assert.equal(R.voiceVerdict({ person: vipPerson, settings: { ...s0, types: { ...s0.types, friendVoice: false } } }, NOON).ok, true, "important beats the type switch");
assert.equal(R.voiceVerdict({ person: vipPerson, settings: s0 }, NIGHT).reason, "quiet_hours", "never in quiet hours, not even important");
assert.ok(R.voiceKind(NOON).startsWith("friend_voice:"));
assert.ok(R.voiceKind(NOON, { vipPeer: "x" }).startsWith("friend_voice_vip:x:"));
const win = R.nextVoiceWindow({ person: p0, settings: s0, history: { normal: [NOON - H] } }, NOON);
assert.equal(win.todayCount, 1);
assert.equal(win.earliestAt, NOON + 5 * H);
assert.equal(win.nextQuiet, false);
const winLate = R.nextVoiceWindow({ person: p0, settings: s0, history: { normal: [NOON + 7 * H] } }, NOON + 7.5 * H);
assert.equal(winLate.nextQuiet, true, "17:30 + 6 h lands in quiet hours");

// ---- best hour -----------------------------------------------------------------
const hist = R.hourHistogram([{ hour: 21 }, { hour: 21 }, { hour: 2 }, { hour: 2 }, { hour: 2 }, { hour: 13 }]);
assert.equal(R.bestHour(hist, s0), 21, "the quiet hour 02:00 never wins");
assert.equal(R.bestHour(R.hourHistogram([]), s0), 20, "default 20:00");
assert.equal(R.bestHour(R.hourHistogram([{ hour: 20 }, { hour: 21 }]), s0), 21, "ties go to the later evening hour");

// ---- win-back ------------------------------------------------------------------
const today = "2026-11-27";
let abs = R.absence(["2026-11-10", "2026-11-12", "2026-11-14", "2026-11-20"], today);
assert.equal(abs.absentDays, 7);
assert.equal(abs.firstAbsentDay, "2026-11-21");
assert.equal(abs.priorActive, 4);
assert.equal(R.winbackTarget(abs).ok, true);
assert.equal(R.winbackTarget(R.absence(["2026-11-20"], today)).reason, "not_enough_history");
assert.equal(R.winbackTarget(R.absence(["2026-11-24", "2026-11-23", "2026-11-22"], today)).reason, "too_soon");
assert.equal(R.winbackTarget(R.absence(["2026-11-01", "2026-11-02", "2026-11-03"], today)).reason, "too_late");
assert.equal(R.episodeKey("u", abs), "u:2026-11-21");
const best = R.closestFriend([
  { id: "a", voiceMinutes: 10, dmMessages: 1 },
  { id: "b", voiceMinutes: 2, dmMessages: 30 },
  { id: "c", voiceMinutes: 100, dmMessages: 0, eligible: false },
]);
assert.equal(best.id, "b", "34 > 21; an ineligible caller is skipped");
assert.equal(R.closestFriend([{ id: "z", voiceMinutes: 0, dmMessages: 0 }]), null, "no contact = no suggestion");
const old = { created_at: new Date(NOON - 40 * D).toISOString() };
assert.equal(R.callerAllowed(old, { callsThisWeek: 0 }, NOON).ok, true);
assert.equal(R.callerAllowed(old, { callsThisWeek: 1 }, NOON).reason, "caller_week");
assert.equal(R.callerAllowed({ created_at: new Date(NOON - 10 * D).toISOString() }, {}, NOON).reason, "new_account", "30 days before calling");
assert.equal(R.callerAllowed({ ...old, suspicious_signup: true }, {}, NOON).reason, "suspicious");
assert.equal(R.targetAllowed({}, { callsThisMonth: 2 }).reason, "target_month");
assert.equal(R.sameDeviceOrIp({ active_sessions: [{ ip: "1.2.3.4" }] }, { active_sessions: [{ ip: "1.2.3.4" }] }), "ip");
assert.equal(R.sameDeviceOrIp({ active_sessions: [{ deviceHash: "d" }] }, { active_sessions: [{ deviceHash: "d" }] }), "device");
assert.equal(R.sameDeviceOrIp({ active_sessions: [{ ip: "unknown" }] }, { active_sessions: [{ ip: "unknown" }] }), null);
const call = { called_at: new Date(NOON).toISOString(), returned_at: new Date(NOON + 5 * H).toISOString(), active_seconds: 700 };
assert.deepEqual(R.rewardDecision(call, { caller: {}, target: {} }, NOON), { pay: true, reason: null });
assert.equal(R.rewardDecision({ ...call, active_seconds: 100 }, {}, NOON).reason, "not_active_enough");
assert.equal(R.rewardDecision({ ...call, returned_at: new Date(NOON + 80 * H).toISOString() }, {}, NOON).reason, "late");
assert.equal(R.rewardDecision({ ...call, rewarded_at: "x" }, {}, NOON).reason, "already", "paid once");
assert.equal(R.rewardDecision(call, { caller: { active_sessions: [{ ip: "9.9.9.9" }] }, target: { active_sessions: [{ ip: "9.9.9.9" }] } }, NOON).reason, "same_ip");

// ---- shared streaks and tasks ----------------------------------------------
let row = { count: 0, best: 0 };
let st = R.streakAdvance(row, "a", "2026-11-27");
assert.equal(st.completedToday, false);
row = { ...row, ...st };
st = R.streakAdvance(row, "b", "2026-11-27");
assert.equal(st.completedToday, true, "both wrote: the day counts");
assert.equal(st.count, 1);
row = { ...row, ...st };
st = R.streakAdvance(row, "b", "2026-11-27");
assert.equal(st.completedToday, false, "a second message the same day does not count twice");
assert.equal(st.count, 1);
row = { ...row, ...st };
st = R.streakAdvance(row, "a", "2026-11-28");
row = { ...row, ...st };
st = R.streakAdvance(row, "b", "2026-11-28");
assert.equal(st.count, 2);
row = { ...row, ...st };
st = R.streakAdvance(row, "a", "2026-12-01");
assert.equal(st.count, 0, "a missed day starts again");
assert.equal(R.streakView({ count: 5, last_day: "2026-11-25" }, "2026-11-27").count, 0);
assert.equal(R.streakView({ count: 5, last_day: "2026-11-26" }, "2026-11-27").atRisk, true);
assert.equal(R.nudgeAllowed({ a_nudged_day: "2026-11-27" }, "a", "2026-11-27").reason, "already_today", "one nudge a day");
assert.equal(R.nudgeAllowed({ b_day: "2026-11-27" }, "a", "2026-11-27").reason, "already_wrote");
assert.equal(R.nudgeAllowed({}, "a", "2026-11-27", { otherAllowsNudges: false }).reason, "nudges_off");
const plan = R.planTasks({ people: [{ id: "ece" }, { id: "kaan" }], atRisk: ["kaan"], inVoice: ["ece"] });
assert.deepEqual(plan.map((t) => [t.kind, t.target_id, t.reward]), [["message", "ece", 15], ["save_streak", "kaan", 25], ["voice", "ece", 25]]);
assert.equal(R.taskProgress(plan[0], { type: "dm", to: "kaan" }), null, "only the named person");
assert.deepEqual(R.taskProgress(plan[0], { type: "dm", to: "ece" }), { progress: 1, done: true });
assert.equal(R.taskProgress(plan[2], { type: "voice", minutes: 4, with: [] }), null, "voice alone does not count");
assert.deepEqual(R.taskProgress({ ...plan[2], progress: 8 }, { type: "voice", minutes: 4, with: ["kaan"] }), { progress: 10, done: true });

// ---- console ------------------------------------------------------------------
let inC = 0;
for (let i = 0; i < 2000; i += 1) if (R.inHoldout(`user-${i}`, "inactive7", 10)) inC += 1;
assert.ok(inC > 140 && inC < 260, `about 10 % hold-out (${inC})`);
assert.equal(R.inHoldout("u", "inactive7", 10), R.inHoldout("u", "inactive7", 10), "deterministic");
assert.equal(R.inHoldout("u", "inactive7", 0), false);
assert.deepEqual(R.unknownPlaceholders("{arkadas_1} {nope} {sayi}"), ["nope"]);
assert.equal(R.renderTemplate("{arkadas_1} ve {arkadas_2} bu hafta {sayi} kez buluştu", { arkadas_1: "Ece", arkadas_2: "Kaan", sayi: 9 }), "Ece ve Kaan bu hafta 9 kez buluştu");
assert.equal(R.validateTemplate({ pushTitle: "{x}" }).error, "unknown_placeholder");
assert.equal(R.validateTemplate({ pushTitle: "x".repeat(81) }).error, "too_long_pushTitle");
const rows = [
  { status: "sent", delivered_at: 1, opened_at: 1, returned_at: 1, return_kind: "voice" },
  { status: "sent", delivered_at: 1 },
  { status: "failed" },
  { status: "sent", holdout: true, returned_at: 1 },
  { status: "sent", holdout: true },
];
const f = R.funnel(rows);
assert.deepEqual([f.sent, f.failed, f.delivered, f.opened, f.openedApp, f.acted], [2, 1, 2, 1, 1, 1]);
const lift = R.liftVsHoldout(rows);
assert.equal(lift.rate, 33.3);
assert.equal(lift.control, 50);
const env = { JWT_SECRET: "s" };
const tok = R.signTrack("00000000-0000-4000-8000-000000000001", "inactive7:2026-11-21", env);
assert.deepEqual(R.verifyTrack(tok, env), { userId: "00000000-0000-4000-8000-000000000001", kind: "inactive7:2026-11-21" });
assert.equal(R.verifyTrack(tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A"), env), null, "tampered token");
assert.equal(R.verifyTrack(tok, { JWT_SECRET: "other" }), null);

// ---- copy: every key in all 7 languages, same placeholders -----------------
const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
function walk(node, path, out) {
  if (node && typeof node === "object" && LANGS.every((l) => l in node)) out.push([path, node]);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
  return out;
}
const vars = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)[,}]/g)].map((m) => m[1].replace(/Dat$/, "")).sort().join(",");
for (const [path, entry] of [...walk(copy.COPY, "", []), ...walk(copy.TEMPLATES, "t", [])]) {
  for (const l of LANGS) assert.equal(typeof entry[l], "string", `${path} ${l}`);
  const base = vars(entry.tr);
  for (const l of LANGS) assert.equal(vars(entry[l]), base, `${path}: placeholders of ${l}`);
  for (const l of LANGS) assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(entry[l]), `${path}: no emoji (${l})`);
}
assert.equal(copy.voiceTitle("tr", ["Ece", "Kaan", "Zeynep"]), "Ece, Kaan ve Zeynep seste");
assert.equal(copy.voiceTitle("tr", ["Ece", "Kaan"], 5), "Ece, Kaan ve 3 kişi daha seste");
assert.equal(copy.voiceTitle("en", ["Ece"]), "Ece is in voice");
assert.equal(copy.rt("tr", "mail.sayHi", { peer: "Ece" }), "Ece'ye selam ver", "Turkish dative");
assert.equal(copy.rt("de", "mail.sayHi", { peer: "Ece" }), "Sag Ece Hallo");
assert.match(copy.rt("ru", "mail.digestIntro", { people: 3, mentions: 2, waiting: 1 }), /3/);
assert.equal(copy.rt("xx", "push.join"), "Katıl", "unknown language -> Turkish");

console.log("reengage rules.selftest: ok");
