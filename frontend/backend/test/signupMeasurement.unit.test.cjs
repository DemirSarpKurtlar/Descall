"use strict";
/**
 * Sign-up form + measurement (20261111_signup_measurement.sql): rule codes for
 * signup_attempts.reason_detail, invite attribution values, the new admin
 * breakdowns (failing field, heard_about, invites) and the reason_detail write
 * that falls back when the column is not migrated yet.
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
const assert = require("assert/strict");
const { EventEmitter } = require("events");

const inserts = [];
let rejectDetail = false;
const fakeDb = {
  from(table) {
    return {
      insert(row) {
        if (rejectDetail && "reason_detail" in row) {
          return Promise.resolve({ error: { code: "PGRST204", message: "Could not find the 'reason_detail' column of 'signup_attempts' in the schema cache" } });
        }
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    };
  },
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeDb };

const rules = require("../lib/signupRules");
const invites = require("../lib/inviteAttribution");
const ss = require("../lib/signupStats");
const { buildSignupSourceColumns } = require("../lib/signupSourceTaxonomy");

// --- rule codes ---------------------------------------------------------------
assert.equal(rules.usernameIssue("a").code, "username_short");
assert.equal(rules.usernameIssue("  a  ").code, "username_short", "trimmed before counting");
assert.equal(rules.usernameIssue("x".repeat(25)).code, "username_long");
assert.equal(rules.usernameIssue("ali veli").code, "username_chars");
assert.equal(rules.usernameIssue("şükrü").code, "username_chars");
assert.equal(rules.usernameIssue("Admin").code, "username_reserved");
assert.equal(rules.usernameIssue(42).code, "username_type");
assert.equal(rules.usernameIssue("Ali.Veli_-9"), null);
assert.equal(rules.usernameIssue("ab"), null);
assert.equal(rules.passwordLengthCode("1234567"), "password_short");
assert.equal(rules.passwordLengthCode("x".repeat(73)), "password_long");
assert.equal(rules.passwordLengthCode("12345678"), null);
assert.equal(rules.passwordLengthCode(null), "password_type");
assert.equal(rules.emailIssueCode(""), "email_missing");
assert.equal(rules.emailIssueCode("a@b"), "email_invalid");
assert.equal(rules.emailIssueCode("a@b.co"), null);
assert.equal(rules.fieldOf("password_breached"), "password");
assert.equal(rules.fieldOf("email_taken"), "email");
assert.equal(rules.fieldOf("under_age"), "birthDate");
assert.equal(rules.fieldOf("registration_closed"), null);
for (const d of rules.SIGNUP_FAIL_DETAILS) assert.match(d, /^[a-z0-9_]{1,40}$/, `${d} fits the reason_detail CHECK`);

// --- invite attribution values --------------------------------------------------
assert.equal(invites.normalizeInviteAttribution("server:AbC123"), "server:AbC123");
assert.equal(invites.normalizeInviteAttribution("vanity:My-Server"), "vanity:my-server");
assert.equal(invites.normalizeInviteAttribution("group:xy"), "group:xy");
assert.equal(invites.normalizeInviteAttribution("friend:ali.veli"), "friend:ali.veli");
assert.equal(invites.normalizeInviteAttribution("friend:ali veli"), null);
assert.equal(invites.normalizeInviteAttribution("other:abc"), null);
assert.equal(invites.normalizeInviteAttribution("server:a b"), null);
assert.equal(invites.normalizeInviteAttribution(""), null);
assert.equal(invites.inviteKindForTaxonomy("vanity:abc"), "server_invite");
assert.equal(invites.inviteKindForTaxonomy("group:abc"), "group_invite");
assert.equal(invites.inviteKindForTaxonomy("friend:abc"), "friend_invite");
assert.equal(invites.inviteKindForTaxonomy("junk"), "");

// --- client platform hint wins over the WebView user agent ----------------------
const iosUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
assert.equal(buildSignupSourceColumns({ snapshot: {}, userAgent: iosUa }).signup_platform, "web_mobile", "no hint: looks like Safari");
assert.equal(buildSignupSourceColumns({ snapshot: {}, userAgent: iosUa, clientPlatform: "ios" }).signup_platform, "ios_app");
assert.equal(buildSignupSourceColumns({ snapshot: {}, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", clientPlatform: "ipad" }).signup_platform, "ipad_app");
assert.equal(buildSignupSourceColumns({ snapshot: { client_platform: "web" }, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile", clientPlatform: "android" }).signup_platform, "android_app");
assert.equal(buildSignupSourceColumns({ snapshot: {}, userAgent: "" }).signup_platform, "unknown", "still one of the platform values");
assert.equal(buildSignupSourceColumns({ snapshot: {}, userAgent: iosUa, clientPlatform: "ios" }).signup_source_group, "app_direct");

// --- admin breakdowns -----------------------------------------------------------
const at = (day) => `${day}T12:00:00.000Z`;
const inRange = (d) => d >= "2026-11-01" && d <= "2026-11-10";
const fails = ss.failureBreakdown(
  [
    { created_at: at("2026-11-02"), status: "failed", reason: "validation", reason_detail: "password_short" },
    { created_at: at("2026-11-02"), status: "failed", reason: "validation", reason_detail: "password_short" },
    { created_at: at("2026-11-03"), status: "failed", reason: "conflict", reason_detail: "username_taken" },
    { created_at: at("2026-11-03"), status: "failed", reason: "validation" },
    { created_at: at("2026-11-03"), status: "completed", reason: null },
    { created_at: at("2026-10-01"), status: "failed", reason: "validation", reason_detail: "email_invalid" },
  ],
  inRange,
);
assert.equal(fails.total, 4);
assert.equal(fails.detailed, 3);
assert.deepEqual(fails.rows, [
  { key: "password_short", count: 2 },
  { key: "username_taken", count: 1 },
  { key: "validation", count: 1 },
]);

const heard = ss.heardAboutBreakdown([
  { heard_about: "google" },
  { heard_about: "google" },
  { heard_about: "friend" },
  { heard_about: "skipped" },
  { heard_about: "nonsense" },
  { heard_about: null },
]);
assert.equal(heard.tracked, true);
assert.equal(heard.answered, 4);
assert.equal(heard.skipped, 1);
assert.equal(heard.noAnswer, 1);
assert.deepEqual(heard.rows.map((r) => [r.key, r.count]), [["google", 2], ["friend", 1], ["other", 1]]);
assert.equal(ss.heardAboutBreakdown([{ id: 1 }]).tracked, false, "column not selected yet");

const inv = ss.inviteBreakdown([
  { joined_via_invite_code: "server:abcd" },
  { joined_via_invite_code: "vanity:my" },
  { joined_via_invite_code: "group:xy" },
  { joined_via_invite_code: "friend:ali", referred_by: "u1" },
  { joined_via_invite_code: null, referred_by: "u2" },
  { joined_via_invite_code: null, referred_by: null },
]);
assert.deepEqual(inv.byKind, { server: 1, vanity: 1, group: 1, friend: 2 });
assert.equal(inv.total, 5);
assert.equal(inv.signups, 6);

const stats = ss.computeSignupStats({
  users: [{ id: "a", created_at: at("2026-11-05"), heard_about: "tiktok", joined_via_invite_code: "server:abcd" }],
  attempts: [{ created_at: at("2026-11-05"), status: "failed", attempt_key: "k", reason: "validation", reason_detail: "username_chars" }],
  range: ss.resolveRange({ from: "2026-11-01", to: "2026-11-08" }, new Date("2026-11-08T12:00:00Z")),
  now: new Date("2026-11-08T12:00:00Z"),
});
assert.deepEqual(stats.failures.rows, [{ key: "username_chars", count: 1 }]);
assert.deepEqual(stats.heardAbout.rows, [{ key: "tiktok", count: 1 }]);
assert.equal(stats.invites.byKind.server, 1);

// --- reason_detail write + fallback -----------------------------------------------
function fakeRes(status) {
  const res = new EventEmitter();
  res.locals = {};
  res.statusCode = status;
  return res;
}
const req = { ip: "1.2.3.4", headers: { "user-agent": "UA" } };
const tick = () => new Promise((r) => setTimeout(r, 10));

(async () => {
  let res = fakeRes(400);
  ss.trackSignupAttempt(req, res, {});
  ss.noteSignupFailure(res, "password_short");
  res.emit("finish");
  await tick();
  assert.equal(inserts.at(-1).row.reason, "validation");
  assert.equal(inserts.at(-1).row.reason_detail, "password_short");

  res = fakeRes(201);
  ss.trackSignupAttempt(req, res, {});
  ss.noteSignupFailure(res, "password_short");
  res.emit("finish");
  await tick();
  assert.equal(inserts.at(-1).row.status, "completed");
  assert.ok(!("reason_detail" in inserts.at(-1).row), "no detail on a completed sign-up");

  res = fakeRes(400);
  ss.trackSignupAttempt(req, res, {});
  ss.noteSignupFailure(res, "Not A Code!");
  res.emit("finish");
  await tick();
  assert.ok(!("reason_detail" in inserts.at(-1).row), "malformed detail is dropped");

  rejectDetail = true;
  const before = inserts.length;
  res = fakeRes(409);
  ss.trackSignupAttempt(req, res, {});
  ss.noteSignupFailure(res, "email_taken");
  res.emit("finish");
  await tick();
  assert.equal(inserts.length, before + 1, "retried without the column");
  assert.equal(inserts.at(-1).row.reason, "conflict");
  assert.ok(!("reason_detail" in inserts.at(-1).row));

  console.log("signupMeasurement.unit.test ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
