/**
 * Ölçüm of the sign-up card (growth 1B), shown in Yönetici Paneli > Kayıt İstatistikleri:
 *   identifier_routed     recorded by the server (POST /auth/identify) when a registered email
 *                         is sent to sign-in
 *   breach_warned_inline  here, once per card: the typed password is in the breach list
 *   breach_fixed          recorded by the server with the new account (register body `card`)
 * Never carries the password, the email or the hash. Analytics must never break the card.
 */
const sent = new Set();

export async function trackCardEvent(event, props = {}, { once = null } = {}) {
  if (once) {
    if (sent.has(once)) return;
    sent.add(once);
  }
  try {
    const mod = await import("../firstPartyAnalytics.js");
    mod.trackProductEvent(event, props);
  } catch {
    /* analytics optional */
  }
}

/** Where the card runs (analytics props.source and the register body card.surface). */
export function cardSurface({ desktop = false, native = null, modal = false } = {}) {
  if (desktop) return "desktop";
  if (native === "ios") return "ios";
  if (native === "android") return "android";
  return modal ? "modal" : "site";
}

/** Tests only. */
export function __resetCardEvents() {
  sent.clear();
}
