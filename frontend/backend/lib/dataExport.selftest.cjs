"use strict";

// node backend/lib/dataExport.selftest.cjs
// KVKK veri dışa aktarma (3.6.0): sections present, only messages the person
// sent, usernames resolved, no secrets, reporters hidden, missing tables noted.
const assert = require("assert");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const ex = require("./dataExport");

const ME = "11111111-1111-4111-8111-111111111111";
const AYSE = "22222222-2222-4222-8222-222222222222";

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);

async function main() {
  const db = createFakeSupabase(
    {
      users: [
        {
          id: ME, username: "demir", display_name: "Demir", email: "d@example.com", created_at: "2026-01-01T00:00:00Z",
          password_hash: "$2b$12$secret", totp_secret_enc: "v1:x:y:z", totp_enabled_at: "2026-10-01T00:00:00Z",
          totp_recovery_hashes: ["abc"], password_reset_token: "tok", blocked_users: [AYSE],
          active_sessions: [{ id: "s1", device: "Chrome on Windows", ip: "88.230.1.2", createdAt: "2026-10-30T00:00:00Z", deviceHash: "f".repeat(48) }],
        },
        { id: AYSE, username: "ayse", password_hash: "$2b$other" },
      ],
      friendships: [{ user_id: ME, friend_id: AYSE, status: "accepted", created_at: "2026-02-01T00:00:00Z" }],
      dm_messages: [
        { id: "m1", from_user_id: ME, to_user_id: AYSE, content: "selam", created_at: "2026-03-01T00:00:00Z" },
        { id: "m2", from_user_id: AYSE, to_user_id: ME, content: "ayşenin mesajı", created_at: "2026-03-01T00:01:00Z" },
      ],
      user_reports: [
        { id: "r1", reporter_id: AYSE, target_id: ME, reason: "spam", context_type: "dm", status: "dismissed", created_at: "2026-04-01T00:00:00Z" },
        { id: "r2", reporter_id: ME, target_id: AYSE, reason: "harassment", context_type: "profile", status: "open", created_at: "2026-04-02T00:00:00Z" },
      ],
      descoin_ledger: [{ user_id: ME, amount: 50, reason: "daily", balance_after: 50, created_at: "2026-05-01T00:00:00Z", meta: { token: "x" } }],
      moderation_actions: [{ target_user_id: ME, action_type: "timeout", reason: "spam", created_at: "2026-06-01T00:00:00Z", actor_user_id: AYSE }],
    },
    { missingTables: ["game_history"] },
  );
  ex.__setDbForTests(db);
  const { filename, data } = await ex.buildExport(ME, { now: new Date("2026-10-31T09:00:00Z") });

  assert.strictEqual(filename, "descall-verilerim-demir-2026-10-31.json");
  assert.strictEqual(data.format, "descall-data-export");
  assert.strictEqual(data.account.username, "demir");
  for (const k of ["profile", "sessions", "friends", "directMessagesSent", "groupMessagesSent", "serverMessagesSent", "descoinLedger", "reportsFiled", "reportsAboutYou", "moderationActions"]) {
    assert.ok(k in data.sections, `section ${k}`);
  }
  ok("file name, header and sections");

  const blob = JSON.stringify(data);
  for (const secret of ["$2b$12$secret", "v1:x:y:z", "password_hash", "totp_secret", "recovery", "password_reset_token", "f".repeat(48), "deviceHash", '"token"']) {
    assert.ok(!blob.includes(secret), `no ${secret}`);
  }
  assert.strictEqual(data.sections.profile.two_factor_app, true);
  ok("no password hash, two-factor secrets, tokens or device hashes");

  assert.deepStrictEqual(data.sections.directMessagesSent.map((m) => m.content), ["selam"], "only messages the person sent");
  assert.strictEqual(data.sections.directMessagesSent[0].to, "ayse");
  assert.ok(!blob.includes("ayşenin mesajı"));
  assert.deepStrictEqual(data.sections.friends, [{ username: "ayse", status: "accepted", since: "2026-02-01T00:00:00Z" }]);
  assert.deepStrictEqual(data.sections.blockedUsers, [{ userId: AYSE, username: "ayse" }]);
  assert.deepStrictEqual(data.sections.sessions, [{ device: "Chrome on Windows", ip: "88.230.1.2", createdAt: "2026-10-30T00:00:00Z", lastActiveAt: null }]);
  ok("sent messages only, usernames resolved, sessions without hashes");

  assert.strictEqual(data.sections.reportsFiled[0].about, "ayse");
  assert.strictEqual(data.sections.reportsAboutYou.length, 1);
  assert.ok(!("reporter_id" in data.sections.reportsAboutYou[0]), "who reported is not shown");
  assert.ok(!("actor_user_id" in data.sections.moderationActions[0]), "which admin acted is not shown");
  ok("reports about the person hide the reporter, moderation hides the admin");

  assert.strictEqual(data.sectionInfo.games.available, false);
  assert.strictEqual(data.sectionInfo.directMessagesSent.count, 1);
  assert.ok(data.notes.tr.includes("KVKK"));
  ok("missing tables are marked, counts and notes present");

  await assert.rejects(ex.buildExport("99999999-9999-4999-8999-999999999999"), (e) => e.status === 404);
  ok("unknown account → 404");
  console.log(`\n${n} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
