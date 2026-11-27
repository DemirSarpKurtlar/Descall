/**
 * Davet Merkezi text helpers shared by the dashboard, the landing and the admin board.
 */
import { countdownParts } from "../../lib/inviteShare.js";

export function fmtCountdown(ms, t) {
  const p = countdownParts(ms);
  if (!p) return "";
  return t(`dvt.time.${p.unit}`, { n: p.n });
}

/** "5 sa önce", "dün", "3 gün önce" (Intl relative time in the UI language). */
export function relTime(iso, locale, now = Date.now()) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  let rtf;
  try {
    rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" });
  } catch {
    return "";
  }
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return rtf.format(Math.round(diff / (86400 * 30)), "month");
}

export function clockTime(iso, locale) {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale || undefined, { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

export function fmtNum(n, locale) {
  try {
    return new Intl.NumberFormat(locale || undefined).format(Math.round(Number(n) || 0));
  } catch {
    return String(Math.round(Number(n) || 0));
  }
}

/** Percent number for "%{pct}" / "{pct}%" templates (one decimal only when it matters). */
export function pctText(v) {
  if (v == null || !Number.isFinite(Number(v))) return "–";
  const n = Number(v);
  return n >= 10 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

export function channelLabel(ch, t) {
  return t(`dvt.ch.${ch || "link"}`);
}

/** Turkish locale check for the {nameGen} / {nameDat} forms. */
export function isTr(locale) {
  return String(locale || "").toLowerCase().startsWith("tr");
}
