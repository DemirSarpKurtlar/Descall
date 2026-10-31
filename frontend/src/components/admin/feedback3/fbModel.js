/* Pure helpers for Admin Panel > Feedback 3.0 (no React, selftested). Text comes from the adminx.fb catalog keys. */
import { formatDate, formatList, formatNumber, lower, upper } from "../../../i18n/format.js";
import { intlTag } from "../../../i18n/registry.js";
import { APP_TIMEZONE } from "../../../lib/datetime.js";
import { trGenitive } from "../../../lib/trSuffix.js";

/** [catalog key, colour]; render the label with t(map[k][0]). */
export const TYPES = {
  bug: ["adminx.fb.type.bug", "#FF6B6B"],
  feature: ["adminx.fb.type.feature", "#F5B942"],
  improvement: ["adminx.fb.type.improvement", "#5AD19A"],
  security: ["adminx.fb.type.security", "#FF9F43"],
  general: ["adminx.fb.type.general", "#9AA3B8"],
  other: ["adminx.fb.type.other", "#9AA3B8"],
};
export const PRIORITIES = {
  low: ["adminx.fb.priority.low", "#5AD19A"],
  medium: ["adminx.fb.priority.medium", "#7C9BFF"],
  high: ["adminx.fb.priority.high", "#FF9F43"],
  critical: ["adminx.fb.priority.critical", "#FF5C5C"],
};
export const STATUSES = {
  new: ["adminx.fb.status.new", "#587AF6"],
  in_progress: ["adminx.fb.status.in_progress", "#F5B942"],
  resolved: ["adminx.fb.status.resolved", "#30D158"],
  closed: ["adminx.fb.status.closed", "#8E93A6"],
};
/** Quick type chips beside the type / priority menus (the ones that need action). */
export const QUICK_TYPES = ["bug", "security", "feature"];
export const SORTS = { newest: "adminx.fb.sort.newest", oldest: "adminx.fb.sort.oldest", priority: "adminx.fb.sort.priority" };
const STATUS_RANK = { new: 0, in_progress: 1, resolved: 2, closed: 3 };
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const AV_COLORS = { D: "#2E9E5B", A: "#C2556F", M: "#1F8A9E", Z: "#B08A1E", C: "#3B6CF6", E: "#D2691E", B: "#8B5CF6", K: "#5A8A6A", S: "#9E3B3B" };
export function avatarColor(name, locale) {
  const L = upper(String(name || "?").trim().charAt(0), locale);
  return AV_COLORS[L] || "#555";
}

const DAY_MONTH = { day: "numeric", month: "short", timeZone: APP_TIMEZONE };

const rtf = new Map();
function relUnit(value, unit, locale) {
  // "now" and "yesterday" as words; numbers everywhere else ("2 days ago", not "the day before yesterday").
  const numeric = value === 0 || (unit === "day" && value === -1) ? "auto" : "always";
  const key = `${locale}|${numeric}`;
  let f = rtf.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(intlTag(locale), { numeric, style: "short" });
    rtf.set(key, f);
  }
  return f.format(value, unit);
}

/** "14 min ago", "4 hr ago", "yesterday", "2 days ago", then "3 Oct" (UI locale, Istanbul days). */
export function relTime(iso, locale, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 1) return relUnit(0, "second", locale);
  if (min < 60) return relUnit(-min, "minute", locale);
  const h = Math.floor(min / 60);
  if (h < 24) return relUnit(-h, "hour", locale);
  const days = Math.floor(h / 24);
  if (days < 7) return relUnit(-days, "day", locale);
  return formatDate(iso, locale, DAY_MONTH);
}

/** Sent column: "26 Oct · 21:35" (Istanbul time, UI locale). */
export function sentAt(iso, locale) {
  const d = formatDate(iso, locale, DAY_MONTH);
  if (!d) return "—";
  return `${d} · ${formatDate(iso, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: APP_TIMEZONE })}`;
}

/** Turkish ablative suffix for a year as it is read aloud: 2025'ten, 2026'dan, 2020'den. */
const ONES = { 1: "den", 2: "den", 3: "ten", 4: "ten", 5: "ten", 6: "dan", 7: "den", 8: "den", 9: "dan" };
const TENS = { 1: "dan", 2: "den", 3: "dan", 4: "tan", 5: "den", 6: "tan", 7: "ten", 8: "den", 9: "dan" };
export function yearAblative(y) {
  const n = Math.abs(Math.trunc(y));
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[(n % 100) / 10];
  return "den"; // yüz and bin both take 'den
}

/** { date, dateAbl } for "since {date}" / "{dateAbl} beri"; dateAbl is the Turkish ablative ("3 Mar 2026'dan"). */
export function sinceVars(date, year, locale) {
  return { date, dateAbl: locale === "tr" ? `${date}'${yearAblative(year)}` : date };
}

/** "since 3 Mar 2026" / "3 Mar 2026'dan beri". */
export function memberSince(iso, t, locale) {
  const date = formatDate(iso, locale, { ...DAY_MONTH, year: "numeric" });
  if (!date) return null;
  const year = Number(formatDate(iso, "en", { year: "numeric", timeZone: APP_TIMEZONE }));
  return t("adminx.fb.memberSince", sinceVars(date, year, locale));
}

export function deleteMessage(f, t, locale) {
  const atts = f?.attachments?.length || 0;
  const reps = (f?.replies || []).filter((r) => r.type !== "system").length;
  const parts = [t("adminx.fb.delReport")];
  if (atts) parts.push(t("adminx.fb.delAttachments", { count: atts }));
  if (reps) parts.push(t("adminx.fb.delReplies", { count: reps }));
  const name = f?.user?.username || t("adminx.fb.unknownUser");
  return t("adminx.fb.delBody", { name, nameGen: locale === "tr" ? trGenitive(name) : name, list: formatList(parts, locale) });
}

export function titleOf(f, t) {
  const s = String(f?.subject || "").trim();
  if (s) return s;
  const first = String(f?.message || "").trim().split(/\r?\n/, 1)[0];
  return first.length > 60 ? `${first.slice(0, 57)}…` : first || t("adminx.fb.untitled");
}

export function isUnread(f) {
  return f?.status === "new" && !f?.viewed;
}

export function replyCount(f) {
  return (f?.replies || []).filter((r) => r.type !== "system").length;
}

export function counts(list) {
  const byStatus = { all: list.length, new: 0, in_progress: 0, resolved: 0, closed: 0 };
  const byType = {};
  let unread = 0;
  for (const f of list) {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    byType[f.category] = (byType[f.category] || 0) + 1;
    if (isUnread(f)) unread += 1;
  }
  return { byStatus, byType, unread };
}

export function applyFilters(list, { q = "", status = "all", type = "all", priority = "all", sort = "newest", locale } = {}) {
  const needle = lower(String(q).trim(), locale);
  const out = list.filter((f) => {
    if (status !== "all" && f.status !== status) return false;
    if (type !== "all" && f.category !== type) return false;
    if (priority !== "all" && f.priority !== priority) return false;
    if (!needle) return true;
    return [f.user?.username, f.user?.displayName, f.message, f.subject, f.id, f.user?.id]
      .some((v) => lower(String(v || ""), locale).includes(needle));
  });
  const ts = (f) => new Date(f.created_at).getTime() || 0;
  if (sort === "oldest") out.sort((a, b) => ts(a) - ts(b));
  else if (sort === "priority") out.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || ts(b) - ts(a));
  // "Newest" is the triage inbox: open work first (new, in progress, resolved, closed), newest first inside each.
  else out.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || ts(b) - ts(a));
  return out;
}

export function fileName(url, t) {
  const fallback = t("adminx.fb.attachmentFile");
  try {
    const u = new URL(url, "https://x.invalid");
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    return last || fallback;
  } catch {
    return fallback;
  }
}

export function formatBytes(n, locale) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${formatNumber(n, locale)} B`;
  if (n < 1024 * 1024) return `${formatNumber(Math.round(n / 1024), locale)} KB`;
  return `${formatNumber(n / 1024 / 1024, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
