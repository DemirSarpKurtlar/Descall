/** Opens the redeem sheet from anywhere (shop button, gift popup, deep links). PromoHost listens. */
export const PROMO_REDEEM_EVENT = "descall:promo-redeem";

export function openPromoRedeem(code = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROMO_REDEEM_EVENT, { detail: { code: String(code || "") } }));
}
