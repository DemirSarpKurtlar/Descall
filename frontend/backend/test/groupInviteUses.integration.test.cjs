"use strict";

/**
 * Regression (security audit 28 Nov 2026): POST /api/groups/invite-links/:code/join read
 * `uses`, inserted the member and only then wrote uses + 1, so parallel joins on a
 * one-time link (max_uses 1) all got in. A use is now claimed with a compare-and-swap
 * before the member is added (as server invites do, routes/servers.js claimInviteUse).
 * Run: node test/groupInviteUses.integration.test.cjs
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const joiners = ["j1", "j2", "j3", "j4", "j5"];
const users = ["owner", ...joiners].map((n) => ({ id: `u-${n}`, username: n, active_sessions: [{ id: `s-${n}` }], blocked_users: [] }));
const fake = createFakeSupabase(
  {
    users,
    groups: [{ id: "g1", name: "Ekip", avatar_url: null, created_by: "u-owner", created_at: "2026-11-01T00:00:00Z" }],
    group_members: [{ group_id: "g1", user_id: "u-owner", joined_at: "2026-11-01T00:00:00Z" }],
    group_messages: [],
    group_invite_links: [
      { code: "Once2345Ab", group_id: "g1", creator_id: "u-owner", max_uses: 1, uses: 0, expires_at: null, created_at: "2026-11-28T00:00:00Z" },
      { code: "Open2345Ab", group_id: "g1", creator_id: "u-owner", max_uses: null, uses: 0, expires_at: null, created_at: "2026-11-28T00:00:00Z" },
    ],
  },
  { uniqueKeys: { group_members: ["group_id", "user_id"] } },
);
{
  // Real PostgREST answers asynchronously; let concurrent requests interleave like in production.
  const proto = Object.getPrototypeOf(fake.from("__probe__"));
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "like"]) {
    if (!proto[m]) proto[m] = function () { return this; };
  }
  const syncThen = proto.then;
  proto.then = function (resolve, reject) {
    return new Promise((r) => setImmediate(r)).then(() => new Promise((res, rej) => syncThen.call(this, res, rej))).then(resolve, reject);
  };
}
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };

const { signToken } = require("../config/jwt");
const app = express();
app.use(express.json());
app.set("io", null);
app.use("/api/groups", require("../routes/groups"));

(async () => {
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const join = (code, n) =>
    fetch(`http://127.0.0.1:${srv.address().port}/api/groups/invite-links/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: `u-${n}`, username: n, sid: `s-${n}` })}` },
      body: "{}",
    }).then((r) => r.status);
  try {
    const statuses = await Promise.all(joiners.map((n) => join("Once2345Ab", n)));
    const joined = fake._tables.group_members.rows.filter((r) => r.group_id === "g1" && r.user_id !== "u-owner");
    assert.strictEqual(joined.length, 1, `a one-time link lets exactly one person in (got ${joined.length}, statuses ${statuses.join(",")})`);
    assert.strictEqual(statuses.filter((s) => s === 200).length, 1, "one join succeeds, the others are refused");

    // An unlimited link still works and counts every use.
    const before = fake._tables.group_members.rows.length;
    const open = await Promise.all(joiners.filter((n) => !joined.some((r) => r.user_id === `u-${n}`)).slice(0, 2).map((n) => join("Open2345Ab", n)));
    assert.deepStrictEqual(open, [200, 200], "unlimited link: both joins succeed");
    assert.strictEqual(fake._tables.group_members.rows.length, before + 2, "both members added");
    const openRow = fake._tables.group_invite_links.rows.find((r) => r.code === "Open2345Ab");
    assert.strictEqual(openRow.uses, 2, "every use is counted");
    console.log("groupInviteUses integration: ok");
  } finally {
    srv.close();
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
