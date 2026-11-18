/**
 * Descall+ coupon redeem: server error -> i18n key (POST /api/premium/redeem).
 * The route answers { error: code, code } (lib/premium/service.js ERROR_STATUS), and a
 * rate limit is a bare 429. Unknown codes get the generic "fail" text, never the raw code;
 * "unavailable (not yet)" is kept only for an old server without the route (404/405, no code).
 */
export const REDEEM_ERROR_CODES = Object.freeze([
  "invalid",
  "expired",
  "used",
  "limit",
  "already_active",
  "not_redeemable",
  "unavailable",
  "rate_limited",
]);

export function redeemErrorKey(err) {
  const status = Number(err?.status) || 0;
  const code = typeof err?.code === "string" ? err.code : "";
  if (status === 429 || code === "rate_limited") return "premium.redeem.errors.rate_limited";
  if (code && REDEEM_ERROR_CODES.includes(code)) return `premium.redeem.errors.${code}`;
  if (!code && (status === 404 || status === 405)) return "premium.redeem.unavailable";
  return "premium.redeem.fail";
}
