import assert from "node:assert/strict";
import { REDEEM_ERROR_CODES, redeemErrorKey } from "./redeemError.js";
import { PREMIUM_EN as en } from "../i18n/locales/premium.en.js";
import { PREMIUM_TR as tr } from "../i18n/locales/premium.tr.js";

// A wrong code (404 + code "invalid") is a wrong code, not "coupons are not available yet".
assert.equal(redeemErrorKey({ status: 404, code: "invalid" }), "premium.redeem.errors.invalid");
assert.equal(redeemErrorKey({ status: 410, code: "expired" }), "premium.redeem.errors.expired");
assert.equal(redeemErrorKey({ status: 409, code: "already_active" }), "premium.redeem.errors.already_active");
// Rate limit: the server sends an English sentence without a code.
assert.equal(redeemErrorKey({ status: 429, message: "Too many attempts. Please try again in a bit." }), "premium.redeem.errors.rate_limited");
// Old server without the route.
assert.equal(redeemErrorKey({ status: 404 }), "premium.redeem.unavailable");
assert.equal(redeemErrorKey({ status: 405 }), "premium.redeem.unavailable");
// Unknown / server errors never show the raw code.
assert.equal(redeemErrorKey({ status: 500, code: "server_error", message: "server_error" }), "premium.redeem.fail");
assert.equal(redeemErrorKey(null), "premium.redeem.fail");

// Every key exists in the two premium catalogs (i18n-check covers the other five).
for (const cat of [en, tr]) {
  const root = cat;
  for (const code of REDEEM_ERROR_CODES) assert.ok(root.redeem.errors[code], `missing premium.redeem.errors.${code}`);
}
console.log("redeemError selftest ok");
