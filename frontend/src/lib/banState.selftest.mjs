// Ban screen state (docs/design/ban-experience): server bodies -> screen state, and the wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appealTextError,
  banLengthDays,
  banLengthHours,
  banStateFromError,
  banStateFromKick,
  isBanSocketMessage,
  isEmail,
  remainingParts,
} from "./banState.js";

// Contract body (CONTRACT.md section 1).
{
  const err = {
    status: 403,
    code: "ACCOUNT_BANNED",
    body: {
      code: "ACCOUNT_BANNED",
      ban: { categoryId: "harassment", reason: "Harassment / Bullying", message: "note", bannedAt: "2026-11-14T13:20:00Z", expiresAt: "2026-11-21T13:20:00Z", username: "kaan", byAdmin: true },
      banTicket: "tkt",
      appeal: { status: "pending", submittedAt: "2026-11-14T14:00:00Z", canAppeal: false },
    },
  };
  const s = banStateFromError(err);
  assert.equal(s.kind, "account");
  assert.equal(s.ticket, "tkt");
  assert.equal(s.ban.categoryId, "harassment");
  assert.equal(s.ban.username, "kaan");
  assert.equal(s.appeal.status, "pending");
  assert.equal(s.live, false);
}
// Old server: only { code, ban } on the error (http.js sets err.ban), no ticket.
{
  const s = banStateFromError({ code: "ACCOUNT_BANNED", ban: { category: "spam", reason: "Spam", expiresAt: null } });
  assert.equal(s.kind, "account");
  assert.equal(s.ticket, null);
  assert.equal(s.ban.categoryId, "spam");
  assert.equal(s.ban.expiresAt, null);
  assert.equal(s.appeal.status, "none");
}
// Access ban (section 2).
{
  const s = banStateFromError({ code: "ACCESS_BANNED", body: { code: "ACCESS_BANNED", expiresAt: "2026-12-14T00:00:00Z", access: { code: "ACC-7F2K", kind: "device", createdAt: "2026-11-14T00:00:00Z" } } });
  assert.equal(s.kind, "access");
  assert.equal(s.access.code, "ACC-7F2K");
  assert.equal(s.access.kind, "device");
  assert.equal(s.access.expiresAt, "2026-12-14T00:00:00Z", "top-level expiresAt fills access.expiresAt");
}
// Not a ban.
assert.equal(banStateFromError({ status: 401, code: "INVALID" }), null);
assert.equal(banStateFromError(null), null);

// Live kick (section 5): ban, access ban, plain kick; no duplicated reason.
{
  const s = banStateFromKick({ action: "ban", categoryId: "spam", reason: "same", message: "same", expiresAt: null, banTicket: "t2" });
  assert.equal(s.kind, "account");
  assert.equal(s.live, true);
  assert.equal(s.ticket, "t2");
  assert.equal(s.ban.reason, null, "reason equal to the message is dropped (old servers duplicated it)");
  assert.equal(banStateFromKick({ action: "access_ban", access: { code: "ACC-1", kind: "ip" } }).kind, "access");
  assert.equal(banStateFromKick({ action: "kick", reason: "x" }), null);
}

assert.ok(isBanSocketMessage("Authentication failed: banned — note"));
assert.ok(isBanSocketMessage("Authentication failed: Access to Descall from this device or network is blocked."));
assert.ok(!isBanSocketMessage("Authentication failed: invalid token"));
assert.ok(!isBanSocketMessage("xhr poll error"));

// Countdown and title lengths.
const now = Date.parse("2026-11-14T13:20:00Z");
assert.deepEqual(remainingParts("2026-11-21T03:42:00Z", now), { days: 6, hours: 14, minutes: 22 });
assert.equal(remainingParts(null, now), null);
assert.equal(remainingParts("2026-11-14T13:19:00Z", now), null);
assert.equal(banLengthDays("2026-11-14T13:20:00Z", "2026-11-21T13:20:00Z"), 7);
assert.equal(banLengthDays("2026-11-14T13:20:00Z", "2026-11-15T01:20:00Z"), null);
assert.equal(banLengthHours("2026-11-14T13:20:00Z", "2026-11-15T01:20:00Z"), 12);
assert.equal(banLengthHours("2026-11-14T13:20:00Z", "2026-11-21T13:20:00Z"), null);

assert.equal(appealTextError("too short"), "short");
assert.equal(appealTextError("x".repeat(25)), null);
assert.equal(appealTextError("x".repeat(2001)), "long");
assert.ok(isEmail("a@b.co"));
assert.ok(!isEmail("a@b"));

// Wiring: every refusal path opens the ban screen instead of a one-line error.
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.equal((app.match(/showAuthFailure\(error\);/g) || []).length, 3, "password, 2FA and social login");
assert.match(app, /const ban = banStateFromKick\(payload\);/, "live ban over the socket");
assert.match(app, /result\.status === "auth"\) \{\s*const ban = banStateFromError\(result\.error\);/, "ban found on session restore");
assert.match(app, /if \(isBanSocketMessage\(msg\)\) \{/, "socket refused for a ban");
assert.ok((app.match(/\{banLayer\}/g) || []).length >= 3, "rendered on every signed-out screen");
const boot = readFileSync(new URL("../site/MarketingBoot.jsx", import.meta.url), "utf8");
assert.match(boot, /banStateFromError\(err\)/);
assert.match(boot, /BanScreenStandalone\.jsx/);

// Strings: the same ban.* keys in every locale, and the placeholders survive translation.
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
let ref = null;
for (const loc of LOCALES) {
  const mod = await import(`../i18n/locales/ban.${loc}.js`);
  const dict = Object.values(mod)[0];
  const keys = Object.keys(dict).sort();
  if (!ref) ref = keys;
  assert.deepEqual(keys, ref, `${loc}: same keys as tr`);
  for (const [k, ph] of [["timedTitle", "{duration}"], ["timedLeadUser", "{username}"], ["liveLeadTimed", "{duration}"], ["accessCode", "{code}"]]) {
    assert.ok(dict[k].includes(ph), `${loc}: ban.${k} keeps ${ph}`);
  }
  const main = readFileSync(new URL(`../i18n/locales/${loc}.js`, import.meta.url), "utf8");
  assert.match(main, new RegExp(`from "\\./ban\\.${loc.replace("-", "\\-")}\\.js"`), `${loc}.js registers the ban namespace`);
}

console.log("banState.selftest.mjs: ok");
