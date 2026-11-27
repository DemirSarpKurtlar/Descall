/**
 * Descall+ 2.0 pure helpers (no React, no network): prices, level bars, gift tracking steps, the
 * screen share ceiling, checkout sums. plus2.selftest.mjs covers them.
 */

export const LEVELS_FALLBACK = Object.freeze([
  { boosts: 2, screenHeight: 1080, screenFps: 60, uploadMb: 100, emojiSlots: 100, animatedIcon: true },
  { boosts: 5, screenHeight: 1080, screenFps: 60, uploadMb: 250, emojiSlots: 150, banner: true, hdAudio: true },
  { boosts: 10, screenHeight: 1440, screenFps: 60, uploadMb: 500, emojiSlots: 250, vanity: true, stickers: true, hdAudio: true, banner: true },
]);

/** "69,99 ₺" (tr), "TRY 69.99" style elsewhere via Intl. Minor units in, string out. */
export function formatPrice(minor, currency = "TRY", locale = "tr") {
  const n = (Number(minor) || 0) / 100;
  const lang = String(locale || "tr");
  // Whole amounts without decimals ("0 ₺", "2.384 ₺"), prices with them ("69,99 ₺").
  const digits = Math.round(Number(minor) || 0) % 100 === 0 ? 0 : 2;
  if (currency === "TRY" && lang.startsWith("tr")) {
    const s = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
    return `${s} ₺`;
  }
  try {
    return new Intl.NumberFormat(lang === "pt-BR" ? "pt-BR" : lang, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** VAT share of a VAT-included amount (minor units). Same rounding as the server. */
export function vatOf(minor, percent) {
  const a = Number(minor) || 0;
  const p = Number(percent) || 0;
  return Math.round(a - a / (1 + p / 100));
}

export function levelFor(count, levels = LEVELS_FALLBACK) {
  let lv = 0;
  levels.forEach((l, i) => {
    if ((Number(count) || 0) >= Number(l.boosts)) lv = i + 1;
  });
  return lv;
}

/** Bar model: fill 0..1 up to the top level, tick marks per level, the next goal. */
export function levelBar(count, levels = LEVELS_FALLBACK) {
  const n = Math.max(0, Number(count) || 0);
  const max = Number(levels[levels.length - 1]?.boosts) || 10;
  const level = levelFor(n, levels);
  const next = levels[level] ? { level: level + 1, boosts: Number(levels[level].boosts), missing: Math.max(0, Number(levels[level].boosts) - n) } : null;
  return {
    count: n,
    max,
    level,
    fill: Math.min(1, n / max),
    ticks: levels.map((l, i) => ({ level: i + 1, boosts: Number(l.boosts), at: Math.min(1, Number(l.boosts) / max), reached: n >= Number(l.boosts) })),
    next,
  };
}

/** Perk keys of one level (only what that level adds), for the level cards. */
export function levelAdds(index, levels = LEVELS_FALLBACK) {
  const cur = levels[index] || {};
  const prev = index > 0 ? levels[index - 1] : {};
  const out = [];
  if (cur.animatedIcon && !prev.animatedIcon) out.push({ key: "animatedIcon" });
  if (cur.banner && !prev.banner) out.push({ key: "banner" });
  if (cur.vanity && !prev.vanity) out.push({ key: "vanity" });
  if (Number(cur.emojiSlots) > Number(prev.emojiSlots || 0)) out.push({ key: cur.stickers && !prev.stickers ? "emojiStickers" : "emoji", n: cur.emojiSlots });
  if (Number(cur.uploadMb) > Number(prev.uploadMb || 100)) out.push({ key: "upload", n: cur.uploadMb });
  if (Number(cur.screenHeight) > Number(prev.screenHeight || 0) || Number(cur.screenFps) > Number(prev.screenFps || 0)) out.push({ key: "screen", h: cur.screenHeight, fps: cur.screenFps });
  if (cur.hdAudio && !prev.hdAudio) out.push({ key: "hdAudio" });
  return out;
}

/** Live gift tracker steps (draft "Hediye takibi"). */
export function giftSteps(gift) {
  const g = gift || {};
  const opened = Boolean(g.openedAt);
  return [
    { key: "paid", done: Boolean(g.paidAt), at: g.paidAt || null },
    { key: "delivered", done: Boolean(g.deliveredAt) || opened, at: g.deliveredAt || g.deliverAt || null },
    { key: "opened", done: opened, at: g.openedAt || null },
    { key: "boosted", done: Boolean(g.boostsGivenAt), at: g.boostsGivenAt || null },
  ];
}

/** Status chip key for a gift (admin + manage table). */
export function giftChip(gift) {
  const s = gift?.status;
  if (s === "scheduled") return { key: "scheduled", tone: "warn" };
  if (s === "delivered") return { key: "delivered", tone: "info" };
  if (s === "opened") return { key: "opened", tone: "ok" };
  if (s === "recalled" || s === "refunded" || s === "cancelled") return { key: s, tone: "muted" };
  if (s === "returned") return { key: "returned", tone: "warn" };
  return { key: "pending", tone: "muted" };
}

export function daysLeft(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 86400000));
}

/* ---------------- screen share ceiling ---------------- */

const RES_H = { "480p": 480, "720p": 720, "1080p": 1080, "1440p": 1440 };
export function resHeight(value) {
  return RES_H[value] || Number(String(value).replace(/p$/, "")) || 1080;
}

/**
 * Lock state of one option in the quality picker. ceiling null = nothing is locked.
 * Returns { locked, reason } where reason is "height" or "fps".
 */
export function optionLock({ resolution = null, fps = null }, ceiling) {
  if (!ceiling || !ceiling.locked) return { locked: false, reason: null };
  if (resolution && resHeight(resolution) > Number(ceiling.height)) return { locked: true, reason: "height" };
  if (fps != null && Number(fps) > Number(ceiling.fps)) return { locked: true, reason: "fps" };
  return { locked: false, reason: null };
}

/** The quality a NEW share starts with under a ceiling (never applied to a running share). */
export function clampToCeiling(quality, ceiling) {
  const q = quality || {};
  if (!ceiling || !ceiling.locked) return q;
  const order = ["480p", "720p", "1080p", "1440p"];
  let res = q.resolution || "1080p";
  while (resHeight(res) > Number(ceiling.height) && order.indexOf(res) > 0) res = order[order.indexOf(res) - 1];
  const fpsSteps = [15, 20, 24, 30, 60];
  let fps = Number(q.fps) || 30;
  while (fps > Number(ceiling.fps) && fpsSteps.indexOf(fps) > 0) fps = fpsSteps[fpsSteps.indexOf(fps) - 1];
  return { ...q, resolution: res, fps };
}

/* ---------------- plans comparison ---------------- */

/** Rows of the Free / Descall+ / Ultra comparison from the offer (admin-configurable values). */
export function comparison(offer) {
  const t = offer?.tiers || {};
  const row = (tier) => ({
    screen: `${t[tier]?.screenHeight || 1080}p ${t[tier]?.screenFps || 30}`,
    uploadMb: t[tier]?.uploadMb || 100,
    audio: t[tier]?.audioKbps || 64,
    boosts: t[tier]?.boosts || 0,
    tickets: t[tier]?.tickets || 0,
    source: Boolean(t[tier]?.sourceQuality),
  });
  return { free: row("free"), plus: row("plus"), ultra: row("ultra") };
}

/** Group gift share (rounded up so the shares always cover the price). */
export function shareOf(full, shares) {
  const n = Math.min(4, Math.max(2, Number(shares) || 2));
  return Math.ceil((Number(full) || 0) / n);
}

/** Local date+time input value for "2 Ara 09:00" pickers; null when invalid or past. */
export function scheduleIso(dateStr, timeStr, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "")) || !/^\d{2}:\d{2}$/.test(String(timeStr || ""))) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(d.getTime()) || d.getTime() < now - 60000) return null;
  return d.toISOString();
}

/** Server error code -> i18n key (unknown codes get the generic one). */
const KNOWN_ERRORS = new Set([
  "sales_off", "provider_not_configured", "product_missing", "price_missing", "already_active", "recipient_not_friend",
  "recipient_not_found", "gift_bad_time", "gift_too_far", "no_slots", "not_in_server", "cooldown", "already_moving",
  "not_member", "gift_not_recallable", "gift_opened", "trial_used", "ticket_unavailable", "recipient_member",
  "recipient_trial_used", "ask_weekly_limit", "recipient_asks_off", "reason_required", "not_cancellable",
  "group_closed", "share_paid", "owner_only", "rate_limited", "ANIMATED_PROFILE_PLUS", "boosts_off", "gifts_off",
]);
export function errorKey(code) {
  const c = String(code || "");
  return KNOWN_ERRORS.has(c) ? `plus2.err.${c}` : "plus2.err.generic";
}
