/**
 * Growth 3B notification center: pure helpers shared by the settings page (desktop list +
 * drawer, phone grouped lists) and tested by notifyCenterModel.selftest.mjs.
 */

export const TYPE_KEYS = Object.freeze(["friendVoice", "mentions", "unread", "streak", "digest"]);
export const IMPORTANT_MAX = 8;

/** "always" | "default" | "muted" for the list badge (same rule as the server). */
export function badgeOf(person, now = Date.now()) {
  const p = person?.prefs || {};
  const until = p.mutedUntil ? Date.parse(p.mutedUntil) : NaN;
  if ((Number.isFinite(until) && until > now) || p.voice === "off" || p.messages === "never") return "muted";
  if (p.important || p.voice === "always") return "always";
  return "default";
}

/** Important first (in the order they were added), then by name. */
export function sortPeople(list = []) {
  return [...list].sort((a, b) => {
    const ai = a?.prefs?.important ? 1 : 0;
    const bi = b?.prefs?.important ? 1 : 0;
    if (ai !== bi) return bi - ai;
    if (ai && bi) return (Date.parse(a.prefs.importantAt || 0) || 0) - (Date.parse(b.prefs.importantAt || 0) || 0);
    return String(a?.name || "").localeCompare(String(b?.name || ""), "tr");
  });
}

function fold(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/** Filter people or servers by name / username. */
export function filterBySearch(list = [], q = "") {
  const needle = fold(q).trim();
  if (!needle) return list;
  return list.filter((x) => fold(x?.name).includes(needle) || fold(x?.username).includes(needle));
}

/** Relative "last seen" in hours / days. */
export function lastSeenText(lastSeen, t, now = Date.now()) {
  const ms = Date.parse(lastSeen || "");
  if (!Number.isFinite(ms)) return t("rg3.line.lastSeenUnknown");
  const mins = Math.max(0, Math.round((now - ms) / 60000));
  if (mins < 60) return t("rg3.line.lastSeenMin", { count: Math.max(1, mins) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("rg3.line.lastSeenHours", { count: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return t("rg3.line.lastSeenYesterday");
  return t("rg3.line.lastSeenDays", { count: days });
}

/** The list's second line for a person: in voice, shared streak, last seen. */
export function personLine(p, t, _locale, now = Date.now()) {
  if (p?.voice) return t("rg3.line.inVoice", { where: `${p.voice.serverName || "Descall"} › ${p.voice.channelName || t("rg3.preview.voiceChannel")}` });
  if (p?.sharedStreak > 0) return t("rg3.line.sharedStreak", { count: p.sharedStreak });
  if (p?.presence === "online") return t("rg3.line.online");
  if ((p?.thisMonth?.called || 0) >= 5) return t("rg3.line.oftenInVoice");
  return lastSeenText(p?.lastSeen, t, now);
}

/** The list's second line for a server. */
export function serverLine(s, t) {
  if (s?.level === "muted") return t("rg3.line.serverMuted");
  if (s?.importantHere > 0) return t("rg3.line.importantHere", { count: s.importantHere });
  if (s?.messagesThisWeek != null) return t("rg3.line.messagesWeek", { count: s.messagesThisWeek });
  return t("rg3.line.serverQuiet");
}

const pad = (n) => String(n).padStart(2, "0");

/** "Sessiz 23:00-09:00" (or the bare range for the phone row). */
export function quietLabel(settings, t, bare = false) {
  const range = `${pad(Math.min(23, settings?.quietStart ?? 23))}:00-${pad(Math.max(9, settings?.quietEnd ?? 9))}:00`;
  return bare ? range : t("rg3.center.quietPill", { range });
}

/** "E-posta · Pazar 11:00". */
export function digestLabel(settings, t) {
  return t("rg3.types.digestSub", { day: t(`rg3.days.d${settings?.digestDay ?? 0}`), time: `${pad(settings?.digestHour ?? 11)}:00` });
}

/** The person after a patch, before the server answers (optimistic). */
export function applyPersonPatch(person, patch = {}, now = Date.now()) {
  const prefs = { ...(person?.prefs || {}) };
  for (const k of ["important", "voice", "messages", "breakQuiet", "nudges", "primaryAction"]) if (patch[k] !== undefined) prefs[k] = patch[k];
  if (patch.important === true && !person?.prefs?.important) prefs.importantAt = new Date(now).toISOString();
  if (patch.mute !== undefined) {
    const ms = { "1h": 3600e3, "8h": 8 * 3600e3, "1w": 7 * 86400e3 }[patch.mute];
    prefs.mutedUntil = ms ? new Date(now + ms).toISOString() : null;
  }
  const next = { ...person, prefs };
  return { ...next, badge: badgeOf(next, now) };
}

/**
 * The drawer footnote: "Bugün Ece'den 1 bildirim aldın. Bir sonraki en erken 03:14'ten
 * sonra, o da sessiz saatte olduğu için yarın 09:00'dan sonra."
 */
export function nextWindowText(next, person, t, locale, now = Date.now(), timeZone = undefined) {
  const fmt = (iso) => new Intl.DateTimeFormat(locale || "tr", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  const name = person?.name || "";
  const count = Number(next?.fromPeerToday) || 0;
  const first = count ? t("rg3.next.today", { name, count }) : t("rg3.next.none", { name });
  const earliest = Date.parse(next?.earliestAt || "");
  const at = Date.parse(next?.nextAt || "");
  if (!Number.isFinite(at)) return first;
  if (at <= now + 60_000) return `${first} ${t("rg3.next.now")}`;
  const dayOf = (ms) => new Intl.DateTimeFormat("en-CA", { ...(timeZone ? { timeZone } : {}) }).format(new Date(ms));
  const sameDay = dayOf(at) === dayOf(now);
  if (next?.nextQuiet && Number.isFinite(earliest)) {
    return `${first} ${t(sameDay ? "rg3.next.quietToday" : "rg3.next.quietTomorrow", { earliest: fmt(earliest), at: fmt(at) })}`;
  }
  return `${first} ${t("rg3.next.at", { at: fmt(at) })}`;
}
