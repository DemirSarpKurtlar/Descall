/** Kayıt İstatistikleri: pure formatting helpers (statsModel.selftest.mjs). */
import { yearAblative } from "../feedback3/fbModel.js";

export const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const GRANULARITIES = [
  ["day", "Günlük"],
  ["week", "Haftalık"],
  ["month", "Aylık"],
];
export const PRESETS = [
  ["7", "Son 7 gün", 7],
  ["30", "Son 30 gün", 30],
  ["90", "Son 90 gün", 90],
  ["365", "Son 12 ay", 365],
  ["all", "Tüm zamanlar", null],
];

const nf = new Intl.NumberFormat("tr-TR");
export const num = (n) => nf.format(Number(n) || 0);
export const dec1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1).replace(".", ",");

/** "2026-10-26" for today in Istanbul. */
export function istToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
export function shortDay(day, withYear = false) {
  const [y, m, d] = String(day).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}
/** "27 Eyl – 26 Eki 2026" (year on both ends only when they differ). */
export function rangeLabel(from, to) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${shortDay(from, !sameYear)} – ${shortDay(to, true)}`;
}
/** "son 30 gün" for a preset that ends today, otherwise the dates. */
export function rangeCaption(from, to, today) {
  if (to === today) {
    const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    if ([7, 30, 90].includes(n)) return `son ${n} gün`;
    if (n === 365) return "son 12 ay";
  }
  return rangeLabel(from, to);
}
/** "18 Nis 2026'dan beri" */
export function sinceText(day) {
  if (!day) return "";
  return `${shortDay(day, true)}'${yearAblative(Number(day.slice(0, 4)))} beri`;
}

export function kpiDelta(kind, delta) {
  const d = delta || { dir: "flat", value: 0 };
  if (kind === "today") {
    if (d.dir === "up") return { mark: `▲ ${num(d.value)}`, cls: "", rest: " dünden fazla" };
    if (d.dir === "down") return { mark: `▼ ${num(d.value)}`, cls: "down", rest: " dünden az" };
    return { mark: null, rest: "dünle aynı" };
  }
  const prev = kind === "week" ? ["geçen haftaya göre", "geçen haftayla aynı", "geçen hafta kayıt yoktu"] : ["önceki 30 güne göre", "önceki 30 günle aynı", "önceki 30 günde kayıt yoktu"];
  if (d.value == null) return { mark: null, rest: prev[2] };
  if (d.dir === "up") return { mark: `▲ %${d.value}`, cls: "", rest: ` ${prev[0]}` };
  if (d.dir === "down") return { mark: `▼ %${d.value}`, cls: "down", rest: ` ${prev[0]}` };
  return { mark: null, rest: prev[1] };
}

/** Y axis top: 10, 20, 30, 50, 100, 200, 300, 500, … */
export function niceMax(v) {
  if (v <= 10) return 10;
  let base = 10;
  for (;;) {
    for (const m of [1, 2, 3, 5]) if (v <= base * m) return base * m;
    base *= 10;
  }
}

/** x-axis tick indexes: five evenly spaced (0, 7, 14, 21, 29 for 30 days). */
export function tickIndexes(n) {
  if (n <= 5) return [...Array(n).keys()];
  return [0, 1, 2, 3, 4].map((k) => Math.floor((k * (n - 1)) / 4));
}

export function axisLabel(point, granularity) {
  if (granularity === "month") {
    const [y, m] = point.key.split("-").map(Number);
    return `${MONTHS[m - 1]}${m === 1 ? ` ${y}` : ""}`;
  }
  return shortDay(point.key);
}

/** Index of the busiest bucket (first one on ties); the tooltip starts there. */
export function peakIndex(series) {
  let best = -1;
  let idx = Math.max(0, series.length - 1);
  series.forEach((s, i) => {
    if (s.count > best) {
      best = s.count;
      idx = i;
    }
  });
  return idx;
}

const DN = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["tr"], { type: "region" }) : null;
export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export function countryRow(c, i) {
  if (c.code === "other") return { label: "Diğer", color: "#9AA3B8", count: c.count };
  if (c.code === "unknown") return { label: "Bilinmiyor", muted: true, count: c.count };
  let name = c.code;
  try {
    name = DN?.of(c.code) || c.code;
  } catch {
    /* keep code */
  }
  return { label: `${flag(c.code)} ${name}`, color: i === 0 ? null : "#8E8CF8", count: c.count };
}

export const AUTH_SEGMENTS = [
  ["email", "E-posta", "#587AF6"],
  ["google", "Google", "#30D158"],
  ["other", "Diğer", "#9AA3B8"],
  ["unknown", "Bilinmiyor", "rgba(255,255,255,.25)"],
];

export function pctOf(v, tot) {
  return tot > 0 ? Math.round((v / tot) * 100) : 0;
}
