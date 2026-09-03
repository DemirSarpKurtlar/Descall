/**
 * Run: node frontend/src/lib/referral.selftest.mjs
 */
import { buildFriendInviteUrl, publicAppOrigin, toPublicShareUrl, PUBLIC_SITE_ORIGIN } from "./referral.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(PUBLIC_SITE_ORIGIN === "https://descall.com", "canonical public origin");
assert(publicAppOrigin("file://") === PUBLIC_SITE_ORIGIN, "file:// origin");
assert(publicAppOrigin("file://") + "/register?ref=admin" !== "file://register?ref=admin", "no file invite");
assert(publicAppOrigin("electron://.") === PUBLIC_SITE_ORIGIN, "electron origin");
assert(publicAppOrigin("https://descall.com") === "https://descall.com", "web origin unchanged");
assert(publicAppOrigin("https://www.descall.com") === "https://www.descall.com", "www origin unchanged");
assert(publicAppOrigin("http://localhost:5173") === "http://localhost:5173", "local web origin unchanged");
assert(buildFriendInviteUrl("admin", "file://") === "https://descall.com/register?ref=admin", "file origin invite");
assert(buildFriendInviteUrl("admin", "electron://") === "https://descall.com/register?ref=admin", "electron origin invite");
assert(buildFriendInviteUrl("admin", "https://descall.com") === "https://descall.com/register?ref=admin", "https invite");
assert(
  toPublicShareUrl("file://register?ref=admin") === "https://descall.com/register?ref=admin",
  "rewrite file://register",
);

console.log("referral.selftest.mjs: ok");
