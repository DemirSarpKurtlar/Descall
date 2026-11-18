"use strict";
// Regression (polish scan 17 Nov 2026, world-social-19 / -13): adding someone who already
// sent you a request said "already pending" instead of accepting it, and the username
// lookup treated _ and % as wildcards ("ay_e" reached "ayse").
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const http = require("http");
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const ME = "11111111-1111-4111-8111-111111111111";
const AY = "22222222-2222-4222-8222-222222222222";
const fake = createFakeSupabase({
  users: [{ id: ME, username: "me", blocked_users: [] }, { id: AY, username: "ayse", blocked_users: [] }],
  friendships: [{ id: "f1", user_id: AY, friend_id: ME, status: "pending" }],
});
const stub = (rel, exports) => {
  const p = require.resolve(path.join(B, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub("db/supabase", fake);
stub("middleware/auth", { requireAuth: (req, _res, next) => { req.user = { id: ME, username: "me" }; next(); } });
stub("lib/webPush", { sendFriendRequestPush: async () => {} });
stub("lib/reengage", { fire: () => {} });

(async () => {
  const express = require(require.resolve("express", { paths: [B] }));
  const app = express();
  app.use(express.json());
  app.use("/api/friends", require(path.join(B, "routes/friends")));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}/api/friends`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const wild = await post("/request", { username: "ay_e" });
  assert.strictEqual(wild.status, 404, "_ is not a wildcard");
  const pct = await post("/request", { username: "a%" });
  assert.strictEqual(pct.status, 404, "% is not a wildcard");

  const r = await post("/request", { username: "AYSE" });
  const body = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(body));
  assert.strictEqual(body.accepted, true, "accepted instead of already pending");
  const rows = fake._tables.friendships.rows;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, "accepted");
  console.log("friendRequestReverse test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
