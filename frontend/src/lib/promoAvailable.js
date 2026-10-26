// Settings → Promosyon Kodu → "Kodlarım": small pure helpers (no React), selftested.
// The server decides which codes are listed (GET /api/promo/available); nothing here filters.

export const PROMO_AVAILABLE_EVENT = "descall:promo-available";
export const PROMO_REDEEMED_EVENT = "descall:promo-redeemed";
/** PromoHost re-broadcasts the server's "promo:popup" socket nudge (never carries a code) as this. */
export const PROMO_NUDGE_EVENT = "descall:promo-nudge";
/** Errors after which the card can't be used any more, so it leaves the list. */
export const GONE_AFTER = new Set(["used", "limit", "expired", "invalid", "age", "unavailable", "badge_owned", "wallet_frozen"]);

const pad = (n) => String(n).padStart(2, "0");

/** Server clock minus device clock (ms). Countdowns use server time so a wrong device clock can't lie. */
export function clockSkew(serverNow, clientNow = Date.now()) {
  const s = Date.parse(serverNow || "");
  if (!Number.isFinite(s)) return 0;
  const d = s - clientNow;
  return Math.abs(d) > 7 * 86400000 ? 0 : d; // nonsense → ignore
}

/**
 * Expiry for a card: none | days (≥ 24h: "2 gün 4 sa") | live (< 24h: ticking HH:MM:SS) | over.
 */
export function expiryInfo(expiresAt, now) {
  if (!expiresAt) return { kind: "none" };
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return { kind: "none" };
  const s = Math.floor((end - now) / 1000);
  if (s <= 0) return { kind: "over", clock: "00:00:00" };
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return { kind: "days", d, h };
  return { kind: "live", clock: `${pad(h)}:${pad(m)}:${pad(s % 60)}` };
}

/** True when any card needs a 1-second tick (something ends within a day). */
export function needsFastTick(items, now) {
  return (items || []).some((i) => {
    const e = expiryInfo(i?.expiresAt, now);
    return e.kind === "live";
  });
}

/** Normalise GET /api/promo/available?summary=1 (or the full list) into the settings badge numbers. */
export function summaryOf(d) {
  const items = Array.isArray(d?.items) ? d.items : null;
  const count = items ? items.length : Math.max(0, Number(d?.count) || 0);
  const unseen = items ? items.filter((i) => !i?.seen).length : Math.max(0, Math.min(count, Number(d?.unseen) || 0));
  return { count, unseen };
}

/** Ids to mark as seen after the list was shown (only the unseen ones, at most 50). */
export function unseenIds(items) {
  return (items || []).filter((i) => i && !i.seen && i.id).map((i) => i.id).slice(0, 50);
}

export function announceAvailable(summary) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROMO_AVAILABLE_EVENT, { detail: summaryOf(summary) }));
}
