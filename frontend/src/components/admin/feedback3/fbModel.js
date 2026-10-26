/* Pure helpers for Yönetici Paneli › Geri Bildirim 3.0 (no React, selftested). */

export const TYPES = {
  bug: ["Hata", "#FF6B6B"],
  feature: ["Öneri", "#F5B942"],
  improvement: ["İyileştirme", "#5AD19A"],
  security: ["Güvenlik", "#FF9F43"],
  general: ["Genel", "#9AA3B8"],
  other: ["Diğer", "#9AA3B8"],
};
export const PRIORITIES = { low: ["Düşük", "#5AD19A"], medium: ["Orta", "#7C9BFF"], high: ["Yüksek", "#FF9F43"], critical: ["Kritik", "#FF5C5C"] };
export const STATUSES = { new: ["Yeni", "#587AF6"], in_progress: ["İşlemde", "#F5B942"], resolved: ["Çözüldü", "#30D158"], closed: ["Kapalı", "#8E93A6"] };
/** Quick type chips beside the Tür / Öncelik menus (the ones that need action). */
export const QUICK_TYPES = ["bug", "security", "feature"];
export const SORTS = { newest: "En yeni", oldest: "En eski", priority: "Öncelik" };
const STATUS_RANK = { new: 0, in_progress: 1, resolved: 2, closed: 3 };
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const AV_COLORS = { D: "#2E9E5B", A: "#C2556F", M: "#1F8A9E", Z: "#B08A1E", C: "#3B6CF6", E: "#D2691E", B: "#8B5CF6", K: "#5A8A6A", S: "#9E3B3B" };
export function avatarColor(name) {
  const L = String(name || "?").trim().charAt(0).toLocaleUpperCase("tr-TR");
  return AV_COLORS[L] || "#555";
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function istanbulParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour, mm: p.minute };
}

/** "14 dk önce", "4 sa önce", "Dün", "2 gün önce", then "3 Eki". */
export function relTime(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 1) return "şimdi";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  if (h < 48) return "Dün";
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} gün önce`;
  const p = istanbulParts(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1]}` : "";
}

/** GÖNDERİM: "26 Eki · 21:35" (Istanbul). */
export function sentAt(iso) {
  const p = istanbulParts(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1]} · ${p.hh}:${p.mm}` : "—";
}

/** "3 Mar 2026'dan beri" with the right Turkish suffix for the year as it is read aloud. */
const ONES = { 1: "den", 2: "den", 3: "ten", 4: "ten", 5: "ten", 6: "dan", 7: "den", 8: "den", 9: "dan" };
const TENS = { 1: "dan", 2: "den", 3: "dan", 4: "tan", 5: "den", 6: "tan", 7: "ten", 8: "den", 9: "dan" };
export function yearAblative(y) {
  const n = Math.abs(Math.trunc(y));
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[(n % 100) / 10];
  return n % 1000 ? "den" : "den"; // yüz → 'den, bin → 'den
}
export function memberSince(iso) {
  const p = istanbulParts(iso);
  if (!p) return null;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}'${yearAblative(p.y)} beri`;
}

/** Turkish genitive for a username: "ayşe'nin", "ornek_kullanici'nin", "mert'in". */
export function genitive(name) {
  const s = String(name || "");
  const vowels = s.toLocaleLowerCase("tr-TR").match(/[aeıioöuü]/g);
  const last = vowels ? vowels[vowels.length - 1] : "e";
  const h = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[last];
  const endsVowel = /[aeıioöuü]$/i.test(s.toLocaleLowerCase("tr-TR"));
  return `${s}'${endsVowel ? "n" : ""}${h}n`;
}

export function deleteMessage(f) {
  const atts = f?.attachments?.length || 0;
  const reps = (f?.replies || []).filter((r) => r.type !== "system").length;
  const parts = ["bildirimi"];
  if (atts) parts.push(atts > 1 ? "ekleri" : "eki");
  if (reps) parts.push(`${reps} yanıt`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ve ${parts[parts.length - 1]}`;
  return `${genitive(f?.user?.username || "Kullanıcı")} ${list} kalıcı olarak silinir. Bu işlem geri alınamaz.`;
}

export function titleOf(f) {
  const s = String(f?.subject || "").trim();
  if (s) return s;
  const first = String(f?.message || "").trim().split(/\r?\n/, 1)[0];
  return first.length > 60 ? `${first.slice(0, 57)}…` : first || "Geri bildirim";
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

export function applyFilters(list, { q = "", status = "all", type = "all", priority = "all", sort = "newest" } = {}) {
  const needle = String(q).trim().toLocaleLowerCase("tr-TR");
  const out = list.filter((f) => {
    if (status !== "all" && f.status !== status) return false;
    if (type !== "all" && f.category !== type) return false;
    if (priority !== "all" && f.priority !== priority) return false;
    if (!needle) return true;
    return [f.user?.username, f.user?.displayName, f.message, f.subject, f.id, f.user?.id]
      .some((v) => String(v || "").toLocaleLowerCase("tr-TR").includes(needle));
  });
  const ts = (f) => new Date(f.created_at).getTime() || 0;
  if (sort === "oldest") out.sort((a, b) => ts(a) - ts(b));
  else if (sort === "priority") out.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || ts(b) - ts(a));
  // "En yeni" is the triage inbox: open work first (Yeni → İşlemde → Çözüldü → Kapalı), newest first inside each.
  else out.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || ts(b) - ts(a));
  return out;
}

export function fileName(url) {
  try {
    const u = new URL(url, "https://x.invalid");
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    return last || "ek";
  } catch {
    return "ek";
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
