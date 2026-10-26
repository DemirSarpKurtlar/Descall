/** Opens the redeem sheet from anywhere (shop button, gift popup, deep links). PromoHost listens. */
export const PROMO_REDEEM_EVENT = "descall:promo-redeem";

export function openPromoRedeem(code = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROMO_REDEEM_EVENT, { detail: { code: String(code || "") } }));
}

/**
 * Opens the redeem sheet straight on its success view for a code that was already redeemed
 * elsewhere (Ayarlar → Kodlarım → Kullan on a badge code shows the badge celebration with "Hemen tak").
 */
export const PROMO_CELEBRATE_EVENT = "descall:promo-celebrate";

export function openPromoCelebration(result) {
  if (typeof window === "undefined" || !result?.reward) return;
  window.dispatchEvent(new CustomEvent(PROMO_CELEBRATE_EVENT, { detail: { result } }));
}
