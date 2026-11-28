"use strict";

/**
 * Regression (security audit 28 Nov 2026): POST /api/groups/invites/:id/respond (accept)
 * inserted the member without the checks POST /:groupId/invite made when the invite was
 * written. Pending invites therefore let a group grow past MAX_GROUP_SIZE (15), and an
 * invite from a member who had been removed in the meantime still let its target in.
 * Run: node test/groupInviteAccept.integration.test.cjs
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const names = ["owner", "inviter", "kicked", "late", "solo", ...Array.from({ length: 13 }, (_, i) => `m${i}`)];
const users = names.map((n) => ({ id: `u-${n}`, username: n, active_sessions: [{ id: `s-${n}` }], blocked_users: [] }));
// g-full has 15 members already; g-two has owner + inviter.
const fullMembers = ["owner", "inviter", ...Array.from({ length: 13 }, (_, i) => `m${i}`)];
const fake = createFakeSupabase(
  {
    users,
    groups: [
      { id: "g-full", name: "Full", avatar_url: null, created_by: "u-owner" },
      { id: "g-two", name: "Two", avatar_url: null, created_by: "u-owner" },
    ],
    group_members: [
      ...fullMembers.map((n) => ({ group_id: "g-full", user_id: `u-${n}` })),
      { group_id: "g-two", user_id: "u-owner" },
    ],
    group_invites: [
      // Written while g-full still had room.
      { id: "inv-full", group_id: "g-full", invited_by: "u-inviter", invited_user_id: "u-late", status: "pending" },
      // u-kicked invited u-solo, then u-kicked was removed from g-two.
      { id: "inv-kicked", group_id: "g-two", invited_by: "u-kicked", invited_user_id: "u-solo", status: "pending" },
    ],
  },
  { uniqueKeys: { group_members: ["group_id", "user_id"] } },
);
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };

const { signToken } = require("../config/jwt");
const app = express();
app.use(express.json());
app.set("io", null);
app.use("/api/groups", require("../routes/groups"));

(async () => {
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const accept = (inviteId, n) =>
    fetch(`http://127.0.0.1:${srv.address().port}/api/groups/invites/${inviteId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: `u-${n}`, username: n, sid: `s-${n}` })}` },
      body: JSON.stringify({ accept: true }),
    }).then((r) => r.status);
  const inGroup = (g, n) => fake._tables.group_members.rows.some((r) => r.group_id === g && r.user_id === `u-${n}`);
  try {
    const s1 = await accept("inv-full", "late");
    assert.ok(!inGroup("g-full", "late"), `a full group (15) takes no 16th member through an old invite (status ${s1})`);
    const s2 = await accept("inv-kicked", "solo");
    assert.ok(!inGroup("g-two", "solo"), `an invite from someone no longer in the group does not let its target in (status ${s2})`);

    // A normal invite from a current member still works.
    fake._tables.group_invites.rows.push({ id: "inv-ok", group_id: "g-two", invited_by: "u-owner", invited_user_id: "u-solo", status: "pending" });
    assert.strictEqual(await accept("inv-ok", "solo"), 200, "valid invite accepted");
    assert.ok(inGroup("g-two", "solo"), "member added");
    console.log("groupInviteAccept integration: ok");
  } finally {
    srv.close();
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
