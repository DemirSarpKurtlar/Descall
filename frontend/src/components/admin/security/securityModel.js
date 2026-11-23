/**
 * Güvenlik Merkezi (admin remake, owner-approved Draft A "Komuta merkezi", Nov 2026):
 * pure helpers shared by the page, the lock dialog and the settings history drawer.
 * Tested in security.selftest.mjs.
 */
import { STATUS } from "../adminPalette.js";

export const FEED_FILTERS = Object.freeze(["all", "bruteForce", "failedLogin", "blockedIp", "rateLimit", "signupDenied"]);
export const FILTER_TYPES = Object.freeze({
  bruteForce: ["brute_force"],
  failedLogin: ["failed_login", "account_locked"],
  blockedIp: ["ip_blocked", "access_ban"],
  rateLimit: ["rate_limit"],
  signupDenied: ["signup_denied"],
});
export const EVENT_TYPES = Object.freeze(["brute_force", "failed_login", "account_locked", "ip_blocked", "access_ban", "rate_limit", "signup_denied", "admin_step_up"]);
export const LOCK_MODES = Object.freeze(["registration", "dm", "readOnly"]);
export const LOCK_DURATIONS = Object.freeze(["15m", "1h", "6h", "24h", "manual"]);
export const LOCK_MINUTES = Object.freeze({ "15m": 15, "1h": 60, "6h": 360, "24h": 1440, manual: null });
export const HISTORY_CATEGORIES = Object.freeze(["all", "locks", "rateLimits", "signup", "access"]);
export const BAN_DURATIONS = Object.freeze(["1d", "7d", "30d", "90d", "permanent"]);
export const FEED_PREVIEW_ROWS = 6;
export const OTP_LENGTH = 6;

/** Colour + icon name of each event type (icon names map to ../../ui/Icon.jsx in the page). */
export const EVENT_META = Object.freeze({
  brute_force: { tone: "red", icon: "alert" },
  failed_login: { tone: "red", icon: "login" },
  account_locked: { tone: "amber", icon: "lock" },
  ip_blocked: { tone: "blue", icon: "shieldWarn" },
  access_ban: { tone: "blue", icon: "ban" },
  rate_limit: { tone: "violet", icon: "zap" },
  signup_denied: { tone: "amber", icon: "mail" },
  admin_step_up: { tone: "gray", icon: "key" },
});

export const LOCK_META = Object.freeze({
  registration: { tone: "amber", icon: "userPlus", key: "registrationEnabled" },
  dm: { tone: "blue", icon: "message", key: "dmEnabled" },
  readOnly: { tone: "red", icon: "eyeOff", key: "readOnlyMode" },
});

/* ---------------- numbers and time ---------------- */

export function fmtNum(n, locale = "tr-TR") {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  try {
    return new Intl.NumberFormat(locale).format(v);
  } catch {
    return String(v);
  }
}

export function fmtTime(iso, locale = "tr-TR") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Bugün 21:40", "Dün 09:12", "8 Kas 18:05" (keys secCenter.time.today / yesterday). */
export function fmtStamp(iso, t, locale = "tr-TR", now = Date.now()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const n = new Date(now);
  const time = fmtTime(iso, locale);
  if (sameDay(d, n)) return t("secCenter.time.today", { time });
  const y = new Date(now - 86400000);
  if (sameDay(d, y)) return t("secCenter.time.yesterday", { time });
  let day = "";
  try {
    day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d).replace(/\.$/, "");
  } catch {
    day = d.toISOString().slice(0, 10);
  }
  return `${day} ${time}`;
}

/** Feed column: "şimdi", "2 dk", "3 sa", "2 g". */
export function relTime(iso, t, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60000) return t("secCenter.time.now");
  const min = Math.floor(ms / 60000);
  if (min < 60) return t("secCenter.time.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("secCenter.time.hour", { n: h });
  return t("secCenter.time.day", { n: Math.floor(h / 24) });
}

/** { h, m } left until `until` (never negative), or null for "until lifted". */
export function remaining(until, now = Date.now()) {
  if (!until) return null;
  const ms = Math.max(0, Date.parse(until) - now);
  const totalMin = Math.ceil(ms / 60000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60, ms };
}

export function remainingText(until, t, now = Date.now()) {
  const r = remaining(until, now);
  if (!r) return t("secCenter.locks.untilLifted");
  if (r.h > 0 && r.m > 0) return t("secCenter.time.hm", { h: r.h, m: r.m });
  if (r.h > 0) return t("secCenter.time.hour", { n: r.h });
  return t("secCenter.time.min", { n: Math.max(1, r.m) });
}

/** "1 sa 12 dk sonra kalkar · @demir" (or "Elle kaldırılana kadar · @demir"). */
export function lockSubtitle(lock, t, now = Date.now()) {
  if (!lock) return "";
  const who = lock.by ? ` · @${lock.by}` : "";
  if (!lock.until) return `${t("secCenter.locks.untilLifted")}${who}`;
  return `${t("secCenter.locks.liftsIn", { time: remainingText(lock.until, t, now) })}${who}`;
}

/* ---------------- KPIs ---------------- */

/** { text, tone } for a percent change ("+212% dünden"); up = worse (red) for threats. */
export function pctDelta(pct, t) {
  if (pct == null) return { text: t("secCenter.kpi.new"), tone: "up" };
  if (pct === 0) return { text: t("secCenter.kpi.flat"), tone: "muted" };
  const sign = pct > 0 ? "+" : "";
  return { text: t("secCenter.kpi.vsYesterday", { pct: `${sign}${pct}%` }), tone: pct > 0 ? "up" : "dn" };
}

export function absDelta(delta) {
  const n = Number(delta) || 0;
  if (n === 0) return { text: "0", tone: "muted" };
  return { text: `${n > 0 ? "+" : ""}${n}`, tone: n > 0 ? "up" : "dn" };
}

/* ---------------- chart ---------------- */

/**
 * SVG paths for the threat chart (same look as the draft: filled area + 1.8 px line).
 * @returns {{ max: number, series: { key, area, line }[] }}
 */
export function chartPaths(series, w, h, keys = ["rate", "failed", "blocked"]) {
  const all = keys.flatMap((k) => series?.[k] || []);
  const peak = Math.max(1, ...all);
  const max = peak * 1.15;
  const out = [];
  for (const key of keys) {
    const vals = series?.[key] || [];
    if (vals.length < 2) {
      out.push({ key, area: "", line: "" });
      continue;
    }
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => [i * step, h - (Math.max(0, v) / max) * h]);
    const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
    out.push({ key, line: d, area: `${d} L${w} ${h} L0 ${h}Z` });
  }
  return { max, series: out };
}

/** Five axis labels: start ("Dün 21:00"), three 6-hour marks, "Şimdi". */
export function axisLabels(startIso, t, locale = "tr-TR", now = Date.now()) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return [];
  const span = now - start;
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    const at = new Date(start + (span * i) / 4);
    const time = fmtTime(at.toISOString(), locale);
    out.push(i === 0 && !sameDay(at, new Date(now)) ? t("secCenter.time.yesterdayShort", { time }) : time);
  }
  out.push(t("secCenter.time.nowCap"));
  return out;
}

/** 0..1 position of a time on the chart, or null outside it. */
export function chartX(startIso, iso, now = Date.now()) {
  const s = Date.parse(startIso);
  const x = Date.parse(iso);
  if (!Number.isFinite(s) || !Number.isFinite(x) || x < s || x > now) return null;
  return (x - s) / Math.max(1, now - s);
}

/* ---------------- score ---------------- */

export const GRADE_TONE = Object.freeze({ excellent: "green", good: "green", fair: "amber", poor: "red" });

export function ringStyle(score, grade) {
  const color = { green: STATUS.ok, amber: STATUS.warn, red: STATUS.bad }[GRADE_TONE[grade] || "green"];
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  return { background: `conic-gradient(${color} 0 ${pct}%, rgba(255,255,255,.08) ${pct}% 100%)` };
}

/** Label of a check row ("Mesaj hız limiti 60 / dk", "7 yöneticiden 1'inde 2FA yok"). */
export function checkLabel(check, t, locale = "tr-TR") {
  const v = { ...(check.vars || {}) };
  if (Array.isArray(v.modes)) v.modes = v.modes.map((m) => t(`secCenter.lockMode.${m}.name`)).join(", ");
  if (v.missing != null) v.missing = numWithSuffix(v.missing, locale);
  return t(`secCenter.check.${check.id}.${check.ok ? "ok" : "fail"}`, v);
}

/** Right side of a failed check: "+8 puan" / "Hatırlat" / "Kilitler". */
export function checkCta(check, t) {
  if (check.ok) return null;
  if (check.action === "remind") return { kind: "remind", text: t("secCenter.score.remind"), link: true };
  if (check.action === "locks") return { kind: "locks", text: t("secCenter.score.viewLocks"), link: true };
  return { kind: check.action === "apply" ? "apply" : "explain", text: t("secCenter.score.points", { n: check.points }), link: false };
}

/** Score after applying `fix` of one check (preview in the apply popover). */
export function scoreAfter(score, check) {
  if (!check || check.ok) return score;
  return Math.min(100, (Number(score) || 0) + (Number(check.points) || 0));
}

/* ---------------- feed ---------------- */

export function matchesFilter(event, filter) {
  if (!filter || filter === "all") return EVENT_TYPES.includes(event?.type);
  return (FILTER_TYPES[filter] || []).includes(event?.type);
}

/** New live events first, no duplicates, newest first, capped. */
export function mergeEvents(current, incoming, filter = "all", cap = 200) {
  const map = new Map();
  for (const e of [...(incoming || []), ...(current || [])]) {
    if (!e?.id || !matchesFilter(e, filter)) continue;
    if (!map.has(e.id)) map.set(e.id, e);
  }
  return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, cap);
}

/** "88.230.x.x · İstanbul" (country code when there is no city). */
export function sourceText(e) {
  if (!e?.ipMasked) return "";
  const place = e.city || e.country || "";
  return place ? `${e.ipMasked} · ${place}` : e.ipMasked;
}

const at = (u) => (u ? `@${u}` : "");

/** Second line of a feed row. */
export function eventLine(e, t, locale = "tr-TR") {
  const d = e?.detail || {};
  const n = fmtNum(e?.count || 1, locale);
  const user = at(e?.username);
  switch (e?.type) {
    case "brute_force":
      return d.sample
        ? t("secCenter.ev.brute_force.lineUser", { user: at(d.sample), accounts: fmtNum(d.accounts || 0, locale), minutes: d.minutes || 1, attempts: fmtNum(d.attempts || 0, locale) })
        : t("secCenter.ev.brute_force.line", { accounts: fmtNum(d.accounts || 0, locale), minutes: d.minutes || 1, attempts: fmtNum(d.attempts || 0, locale) });
    case "failed_login":
      return user ? t("secCenter.ev.failed_login.lineUser", { user, n }) : t("secCenter.ev.failed_login.lineUnknown", { n });
    case "account_locked":
      if (d.perMinute) return t("secCenter.ev.account_locked.lineMinute", { user: user || t("secCenter.ev.unknownAccount"), n: d.perMinute });
      return t("secCenter.ev.account_locked.lineWindow", { user: user || t("secCenter.ev.unknownAccount"), n });
    case "ip_blocked":
      return t(`secCenter.ev.ip_blocked.${d.scope === "register" ? "lineRegister" : "lineLogin"}`, { n });
    case "access_ban":
      return t("secCenter.ev.access_ban.line", { kind: t(`secCenter.banKind.${d.kind || "ip"}`), label: d.label || e.ipMasked || "", action: t(`secCenter.banAction.${["login", "register", "socket", "oauth", "api"].includes(d.action) ? d.action : "api"}`) });
    case "rate_limit":
      return t("secCenter.ev.rate_limit.line", { user: user || t("secCenter.ev.unknownAccount"), limit: d.limit || "?", n });
    case "signup_denied":
      if (d.reason === "disposable") return t("secCenter.ev.signup_denied.lineDisposable", { email: d.email || "" });
      if (d.reason === "human_check") return t("secCenter.ev.signup_denied.lineHumanCheck", { method: t(`secCenter.method.${["email", "google", "apple"].includes(d.method) ? d.method : "email"}`), n });
      return t("secCenter.ev.signup_denied.lineClosed", { method: t(`secCenter.method.${["email", "google", "apple"].includes(d.method) ? d.method : "email"}`), n });
    case "admin_step_up":
      return t(d.ok === false ? "secCenter.ev.admin_step_up.lineFail" : "secCenter.ev.admin_step_up.lineOk", { user: user || "", n });
    default:
      return "";
  }
}

/** Row buttons, in draft order (ban-like action first). */
export function eventActions(e, { bannedRefs = new Set(), canAccessBans = true, canModerate = true } = {}) {
  const out = [];
  const banned = e?.sourceRef && bannedRefs.has(e.sourceRef);
  switch (e?.type) {
    case "brute_force":
    case "ip_blocked":
      if (canAccessBans && e.sourceRef && !banned) out.push("banIp");
      out.push("inspect");
      break;
    case "rate_limit":
      if (canModerate && e.userId) out.push("banUser");
      out.push("inspect");
      break;
    case "access_ban":
      out.push(canAccessBans ? "viewBan" : "inspect");
      break;
    case "admin_step_up":
      out.push("session");
      break;
    default:
      if (canAccessBans && e?.type === "failed_login" && e.sourceRef && !banned && (e.count || 0) >= 10) out.push("banIp");
      out.push("inspect");
  }
  return out;
}

/** CSV of the loaded feed (masked addresses only). */
export function feedCsv(events, t, locale = "tr-TR") {
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["time", "type", "count", "source", "network", "account", "detail"].map((k) => t(`secCenter.csv.${k}`));
  const lines = [head.map(esc).join(",")];
  for (const e of events || []) {
    lines.push([e.at, t(`secCenter.ev.${e.type}.title`), e.count || 1, sourceText(e), e.netLabel || "", e.username ? `@${e.username}` : "", eventLine(e, t, locale)].map(esc).join(","));
  }
  return lines.join("\n");
}

/* ---------------- lock dialog ---------------- */

/** Modes the dialog starts with: the clicked one, else none; active locks are never "new". */
export function initialModes(preselect, activeLocks = {}) {
  const want = Array.isArray(preselect) ? preselect : preselect ? [preselect] : [];
  return LOCK_MODES.filter((m) => want.includes(m) && !activeLocks[m]);
}

export function toggleMode(modes, mode, activeLocks = {}) {
  if (activeLocks[mode]) return modes;
  return modes.includes(mode) ? modes.filter((m) => m !== mode) : LOCK_MODES.filter((m) => m === mode || modes.includes(m));
}

/** "2 kilidi 1 saatliğine başlat" / "Kilidi elle kaldırılana kadar başlat". */
export function lockConfirmLabel(t, count, duration) {
  if (!count) return t("secCenter.lockDlg.pickOne");
  return t(`secCenter.lockDlg.confirm.${duration}`, { n: count });
}

export function autoEndAt(duration, now = Date.now()) {
  const min = LOCK_MINUTES[duration];
  return min == null ? null : new Date(now + min * 60000).toISOString();
}

/** What a user would see: the strongest selected mode decides the band text. */
export function bandModeFor(modes) {
  if (modes.includes("readOnly")) return "readOnly";
  if (modes.includes("dm")) return "dm";
  if (modes.includes("registration")) return "registration";
  return null;
}

export function bandText(mode, duration, t) {
  if (!mode) return "";
  const when = duration === "manual" ? t("secCenter.band.whenManual") : t(`secCenter.band.when.${duration}`);
  return t(`secCenter.band.${mode}`, { when });
}

export function lockFormErrors({ modes, reason, code, needCode = true }) {
  const out = [];
  if (!modes?.length) out.push("modes");
  if (String(reason || "").trim().length < 3) out.push("reason");
  if (needCode && !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(String(code || ""))) out.push("code");
  return out;
}

/** Keep digits only, at most 6 (paste of "481 205" works). */
export function cleanOtp(value) {
  return String(value || "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/* ---------------- settings history ---------------- */

/** The setting a change is shown as (locks read as the switch they hold off). */
export function displayKey(key) {
  const k = String(key || "");
  if (k.startsWith("lock.")) return LOCK_META[k.slice(5)]?.key || k;
  return k;
}

function onOff(v, t) {
  return v ? t("secCenter.val.on") : t("secCenter.val.off");
}

/**
 * Human value of one side of a change. Locks: registration / dm locks read as their
 * switch turning off ("kapalı · 22:40'ta otomatik açılır"); readOnly as the mode on.
 */
export function valueText(key, value, t, locale = "tr-TR", { live = false, now = Date.now() } = {}) {
  const k = String(key || "");
  if (k.startsWith("lock.")) {
    const mode = k.slice(5);
    const lockOn = value != null;
    const shown = mode === "readOnly" ? lockOn : !lockOn;
    if (!lockOn) return onOff(shown, t);
    let tail = "";
    if (!value.until) tail = t("secCenter.val.untilLifted");
    else if (live && Date.parse(value.until) > now) {
      const time = fmtTime(value.until, locale);
      tail = t(mode === "readOnly" ? "secCenter.val.autoOffAt" : "secCenter.val.autoOnAt", { time: timeWithSuffix(time, locale) });
    }
    else if (value.minutes) tail = durationText(value.minutes, t);
    return tail ? `${onOff(shown, t)} · ${tail}` : onOff(shown, t);
  }
  if (typeof value === "boolean") return onOff(value, t);
  if (k === "turnstileMode" && ["enforce", "monitor", "off"].includes(value)) return t(`secCenter.human.mode.${value}`);
  if (value == null) return t("secCenter.val.none");
  if (typeof value === "number") return fmtNum(value, locale);
  if (Array.isArray(value)) return value.join(", ") || t("secCenter.val.none");
  if (typeof value === "object") return t("secCenter.val.rule");
  return String(value);
}

/**
 * Turkish locative suffix after a clock time as it is read aloud ("22:40'ta",
 * "21:00'de", "09:15'te").
 */
const TR_UNIT_LOC = ["da", "de", "de", "te", "te", "te", "da", "de", "de", "da"];
const TR_TENS_LOC = { 1: "da", 2: "de", 3: "da", 4: "ta", 5: "de" };
function trNumberLoc(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  if (v === 0) return "da";
  if (v % 10 !== 0) return TR_UNIT_LOC[v % 10];
  return TR_TENS_LOC[Math.floor(v / 10) % 10] || "de";
}
/** Turkish possessive suffix after a number ("9'u", "12'si", "1'i"). */
// Escaped letters: \u0131 = dotless i, \u00fc = u with diaeresis.
const TR_UNIT_POSS = ["\u0131", "i", "si", "\u00fc", "\u00fc", "i", "s\u0131", "si", "i", "u"];
const TR_TENS_POSS = { 1: "u", 2: "si", 3: "u", 4: "\u0131", 5: "si", 6: "\u0131", 7: "i", 8: "i", 9: "\u0131" };
export function trPossessive(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  if (v === 0) return "\u0131";
  if (v % 10 !== 0) return TR_UNIT_POSS[v % 10];
  if (v % 100 !== 0) return TR_TENS_POSS[Math.floor(v / 10) % 10];
  return v % 1000 === 0 ? "i" : "\u00fc";
}

function isTr(locale) {
  return /^tr(-|$)/i.test(String(locale || ""));
}
/** "9'u" in Turkish (the catalog then reads "12 kontrolden 9'u tamam"), the bare number elsewhere. */
export function numWithSuffix(n, locale = "tr-TR") {
  return isTr(locale) ? `${n}'${trPossessive(n)}` : n;
}
/** "22:40'ta" in Turkish, the bare time elsewhere. */
export function timeWithSuffix(time, locale = "tr-TR") {
  return isTr(locale) ? `${time}'${trLocative(time)}` : time;
}

export function trLocative(time) {
  const m = String(time || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return "da";
  const min = Number(m[2]);
  return trNumberLoc(min === 0 ? Number(m[1]) : min);
}

export function durationText(minutes, t) {
  const m = Number(minutes) || 0;
  if (m >= 60 && m % 60 === 0) return t("secCenter.time.hours", { n: m / 60 });
  if (m > 60) return t("secCenter.time.hm", { h: Math.floor(m / 60), m: m % 60 });
  return t("secCenter.time.minutes", { n: m });
}

/** Unit-aware value for the revert sentence ("40 / dk"). */
export function unitValue(key, value, t, locale = "tr-TR") {
  if (typeof value !== "number") return valueText(key, value, t, locale);
  const unit = { maxMessagesPerMinute: "perMin", maxLoginAttempts: "perMin", dmRateLimitMs: "ms", dmMinAccountAgeHours: "hours" }[key];
  return unit ? t(`secCenter.unit.${unit}`, { n: fmtNum(value, locale) }) : fmtNum(value, locale);
}

export function settingName(key, t) {
  const k = displayKey(key);
  const known = ["registrationEnabled", "dmEnabled", "readOnlyMode", "groupCreationEnabled", "maxLoginAttempts", "maxMessagesPerMinute", "dmRateLimitMs", "dmMinAccountAgeHours", "disposableEmailBlock", "chatFrozen", "maintenanceMode", "slowModeSeconds", "rateLimitGlobalMs", "maxMessageLength", "turnstileMode"];
  return known.includes(k) ? t(`secCenter.setting.${k}`) : k;
}

/** Title of a history entry ("Acil kilit: kayıt dondurma", "Mesaj hız limiti", ...). */
export function entryTitle(entry, t) {
  const title = String(entry?.title || "");
  const lockModes = (entry?.meta?.modes || []).filter((m) => LOCK_MODES.includes(m));
  const names = lockModes.map((m) => t(`secCenter.lockMode.${m}.short`)).join(" + ");
  let base;
  if (title === "lock.expired") base = t("secCenter.hist.title.lockExpired", { modes: names });
  else if (title === "lock.lift") base = t("secCenter.hist.title.lockLift", { modes: names });
  else if (title.startsWith("lock.") && entry?.meta?.extended) base = t("secCenter.hist.title.lockExtend", { modes: names });
  else if (title.startsWith("lock.")) base = t("secCenter.hist.title.lock", { modes: names || t(`secCenter.lockMode.${title.slice(5)}.short`) });
  else if (title === "settings") base = entry?.meta?.recommended ? t("secCenter.hist.title.recommended") : t("secCenter.hist.title.settings", { n: (entry?.changes || []).length });
  else base = settingName(title, t);
  return entry?.revertOf ? t("secCenter.hist.title.revert", { title: base }) : base;
}

/** Diff lines of an entry: [{ sign: "m"|"p", text }]. */
export function diffLines(entry, t, locale = "tr-TR", { now = Date.now(), liveModes = [] } = {}) {
  const lines = [];
  for (const c of entry?.changes || []) {
    const key = displayKey(c.key);
    const live = String(c.key).startsWith("lock.") && liveModes.includes(String(c.key).slice(5));
    lines.push({ sign: "m", text: `${key}: ${valueText(c.key, c.from, t, locale, { now })}` });
    lines.push({ sign: "p", text: `${key}: ${valueText(c.key, c.to, t, locale, { live, now })}` });
  }
  return lines;
}

/** Sentence of the revert popover. */
export function revertSentence(entry, t, locale = "tr-TR") {
  const changes = (entry?.changes || []).filter((c) => !String(c.key).startsWith("lock."));
  if (entry?.isLock) return t("secCenter.hist.revertLock", { modes: (entry.meta?.modes || []).map((m) => t(`secCenter.lockMode.${m}.short`)).join(" + ") });
  if (changes.length === 1) {
    const c = changes[0];
    return t("secCenter.hist.revertOne", { name: settingName(c.key, t), to: unitValue(c.key, c.to, t, locale), from: unitValue(c.key, c.from, t, locale) });
  }
  return t("secCenter.hist.revertMany", { n: changes.length });
}

const AVATAR_TONES = ["amber", "violet", "blue", "green", "red"];
export function avatarOf(username) {
  const name = String(username || "?");
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { letter: name.slice(0, 1).toUpperCase(), tone: AVATAR_TONES[h % AVATAR_TONES.length] };
}

/* ---------------- settings ---------------- */

/** Patch for one recommendation, the label of what it sets, and the score after. */
export function fixSummary(check, t, locale = "tr-TR") {
  const entries = Object.entries(check?.fix || {});
  return entries.map(([k, v]) => `${settingName(k, t)}: ${unitValue(k, v, t, locale)}`).join(", ");
}

/** A switch going off (or a limit) needs a reason, like the server rule. */
export function patchNeedsReason(patch) {
  if (patch?.turnstileMode === "off" || patch?.turnstileMode === "monitor") return true;
  return ["registrationEnabled", "dmEnabled", "groupCreationEnabled"].some((k) => patch?.[k] === false);
}

export const THREAT_TONE = Object.freeze({ normal: "green", elevated: "amber", high: "red" });

export function errorKey(err) {
  const code = err?.code;
  const known = ["REASON_REQUIRED", "ALREADY_ON", "BAD_DURATION", "NO_MODES", "NOT_ON", "LOCK_ENDED", "ALREADY_REVERTED", "NOT_REVERTIBLE", "ALREADY_BANNED", "SOURCE_NOT_FOUND", "BANS_UNAVAILABLE", "ADMIN_PERMISSION_DENIED", "STEP_UP_REQUIRED", "replay", "invalid"];
  return known.includes(code) ? `secCenter.err.${code}` : null;
}
