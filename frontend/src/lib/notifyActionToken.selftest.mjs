// 3.0.0 (A4): pure helpers of notifyActionToken.js.
import assert from "node:assert/strict";
import { needsRefresh, nativeTokenArgs } from "./notifyActionToken.js";

const H = 60 * 60 * 1000;
assert.equal(needsRefresh({ now: 10 * H, issuedAt: 0, userId: "u", lastUserId: "" }), true, "first time");
assert.equal(needsRefresh({ now: 10 * H, issuedAt: 9 * H, userId: "u", lastUserId: "u" }), false, "fresh");
assert.equal(needsRefresh({ now: 30 * H, issuedAt: 9 * H, userId: "u", lastUserId: "u" }), true, "older than 12 h");
assert.equal(needsRefresh({ now: 10 * H, issuedAt: 9 * H, userId: "v", lastUserId: "u" }), true, "account switch");
assert.equal(needsRefresh({ now: 10 * H, issuedAt: 9 * H, userId: "u", lastUserId: "u", force: true }), true, "forced");
assert.equal(needsRefresh({ now: 10 * H, issuedAt: 0, userId: "", lastUserId: "" }), false, "signed out");

const ok = nativeTokenArgs(
  { token: "t.k.n", userId: 42, expiresAt: "2026-10-29T17:00:00.000Z" },
  "https://des-call.onrender.com/",
);
assert.deepEqual(ok, {
  token: "t.k.n",
  userId: "42",
  apiBase: "https://des-call.onrender.com",
  expiresAt: Math.floor(Date.parse("2026-10-29T17:00:00.000Z") / 1000),
});
assert.equal(nativeTokenArgs({ token: "x", userId: "u", expiresAt: "nope" }, "https://a"), null, "bad expiry");
assert.equal(nativeTokenArgs({ userId: "u", expiresAt: "2026-10-29T17:00:00Z" }, "https://a"), null, "no token");
assert.equal(nativeTokenArgs({ token: "x", userId: "u", expiresAt: "2026-10-29T17:00:00Z" }, "http://localhost:3001"), null, "https only");

console.log("notifyActionToken selftest ok");
